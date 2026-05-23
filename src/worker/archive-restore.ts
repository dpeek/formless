import {
  parsePortableArchive,
  type AppArchive,
  type AppArchiveData,
  type AppArchiveMediaObject,
  type PortableArchive,
  type SourceArchiveRecord,
} from "../shared/archive.ts";
import type { AppInstall, BundledAppPackage } from "../shared/app-installs.ts";
import {
  installedAppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import {
  planPortableArchiveRestore,
  type ArchiveRestoreMediaFile,
  type ArchiveRestorePlan,
  type ArchiveRestorePlanError,
  type ArchiveRestorePlanStep,
} from "../shared/archive-restore-plan.ts";
import {
  restoreImageMedia,
  type MediaObjectStore,
  type MediaWriteResponse,
} from "../media/core.ts";
import type { BootstrapResponse, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import {
  readInstanceAppInstalls,
  restoreInstanceAppInstall,
} from "./instance-app-installs-state.ts";
import { workerSchemaApps } from "./schema-apps.ts";
import {
  ensureStorageTables,
  getBootstrapRecords,
  getCurrentCursor,
  resetStorage,
  restoreStorageSnapshot,
} from "./storage.ts";

export type ArchiveRestoreMediaRead = ArchiveRestoreMediaFile & {
  bytes: Uint8Array;
};

export type ArchiveRestoreMediaAdapter = {
  listFiles: () => Promise<ArchiveRestoreMediaFile[]>;
  readFile: (archivePath: string) => Promise<ArchiveRestoreMediaRead | undefined>;
  restoreObject: (input: {
    bytes: Uint8Array;
    identity: InstalledAppStorageIdentity;
    object: AppArchiveMediaObject;
  }) => Promise<MediaWriteResponse>;
};

export type ArchiveRestoreApplyTarget = {
  listInstalledApps: () => AppInstall[] | Promise<AppInstall[]>;
  packages?: readonly BundledAppPackage[];
  restoreAppData: (input: {
    app: AppInstall;
    data: AppArchiveData;
    identity: InstalledAppStorageIdentity;
  }) => BootstrapResponse | Promise<BootstrapResponse>;
  restoreInstall: (input: {
    action: "create" | "replace";
    install: AppInstall;
  }) => void | Promise<void>;
  media?: ArchiveRestoreMediaAdapter;
  sourceSchemas?: Partial<Record<SchemaKey, AppSchema>>;
};

export type ArchiveRestoreExecutionErrorCode =
  | ArchiveRestorePlanError["code"]
  | "app-data-restore-failed"
  | "dry-run-policy"
  | "install-restore-failed"
  | "invalid-archive"
  | "media-read-failed"
  | "media-restore-failed"
  | "missing-app-storage-identity"
  | "missing-media-adapter";

export type ArchiveRestoreExecutionError = {
  appInstallId?: string;
  archivePath?: string;
  code: ArchiveRestoreExecutionErrorCode;
  message: string;
  storageKey?: string;
};

export type ArchiveRestoreStepReport =
  | {
      action: "create" | "replace";
      appInstallId: string;
      kind: "install";
    }
  | {
      appInstallId: string;
      archivePath: string;
      byteSize: number;
      kind: "media";
      storageKey: string;
    }
  | {
      appInstallId: string;
      dataKind: AppArchiveData["kind"];
      kind: "appData";
      recordCount: number;
      schemaKey: string;
      tombstoneCount: number;
    };

export type ArchiveRestoreExecutionReport = {
  applied: boolean;
  steps: ArchiveRestoreStepReport[];
  summary: ArchiveRestorePlan["summary"];
};

export type ArchiveRestoreExecutionResult =
  | {
      ok: true;
      plan: ArchiveRestorePlan;
      report: ArchiveRestoreExecutionReport;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
      plan?: ArchiveRestorePlan;
    };

export function archiveRestoreInstanceRegistryTarget(
  storage: DurableObjectStorage,
): Pick<ArchiveRestoreApplyTarget, "listInstalledApps" | "restoreInstall"> {
  return {
    listInstalledApps: () => readInstanceAppInstalls(storage),
    restoreInstall: (input) => {
      restoreInstanceAppInstall(storage, input);
    },
  };
}

export async function dryRunPortableArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<ArchiveRestoreExecutionResult> {
  const planned = await parseAndPlanArchiveRestore(value, target);

  if (!planned.ok) {
    return planned;
  }

  return {
    ok: true,
    plan: planned.plan,
    report: {
      applied: false,
      steps: stepReports(planned.plan.steps),
      summary: planned.plan.summary,
    },
  };
}

export async function applyPortableArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<ArchiveRestoreExecutionResult> {
  const planned = await parseAndPlanArchiveRestore(value, target);

  if (!planned.ok) {
    return planned;
  }

  if (planned.plan.dryRun) {
    return {
      errors: [
        {
          code: "dry-run-policy",
          message: "Archive restore policy is dry-run; apply requires dryRun false.",
        },
      ],
      ok: false,
      plan: planned.plan,
    };
  }

  const mediaReads = await prepareMediaReads(planned.plan.steps, target.media);

  if (!mediaReads.ok) {
    return {
      errors: mediaReads.errors,
      ok: false,
      plan: planned.plan,
    };
  }

  const archiveApps = archiveAppsByInstallId(planned.archive);
  const reports: ArchiveRestoreStepReport[] = [];

  for (const step of planned.plan.steps) {
    if (step.kind === "createInstall" || step.kind === "replaceInstall") {
      try {
        await target.restoreInstall({
          action: step.kind === "createInstall" ? "create" : "replace",
          install: step.install,
        });
      } catch (error) {
        return restoreFailure(
          "install-restore-failed",
          step.install.installId,
          error,
          planned.plan,
        );
      }

      reports.push({
        action: step.kind === "createInstall" ? "create" : "replace",
        appInstallId: step.install.installId,
        kind: "install",
      });
      continue;
    }

    const archiveApp = archiveApps.get(step.appInstallId);
    const identity =
      archiveApp &&
      installedAppStorageIdentity({
        installId: archiveApp.app.installId,
        packageAppKey: archiveApp.app.packageAppKey,
      });

    if (!archiveApp || !identity) {
      return {
        errors: [
          {
            appInstallId: step.appInstallId,
            code: "missing-app-storage-identity",
            message: `Archive app "${step.appInstallId}" does not resolve to installed app storage.`,
          },
        ],
        ok: false,
        plan: planned.plan,
      };
    }

    if (step.kind === "restoreMedia") {
      const mediaRead = mediaReads.files.get(step.archivePath);

      if (!mediaRead || !target.media) {
        return {
          errors: [
            {
              appInstallId: step.appInstallId,
              archivePath: step.archivePath,
              code: "media-read-failed",
              message: `Archive media file "${step.archivePath}" was not prepared for restore.`,
              storageKey: step.storageKey,
            },
          ],
          ok: false,
          plan: planned.plan,
        };
      }

      try {
        await target.media.restoreObject({
          bytes: mediaRead.bytes,
          identity,
          object: {
            archivePath: step.archivePath,
            byteSize: step.byteSize,
            contentType: step.contentType,
            deliveryHref: step.deliveryHref,
            storageKey: step.storageKey,
          },
        });
      } catch (error) {
        return restoreFailure("media-restore-failed", step.appInstallId, error, planned.plan, {
          archivePath: step.archivePath,
          storageKey: step.storageKey,
        });
      }

      reports.push({
        appInstallId: step.appInstallId,
        archivePath: step.archivePath,
        byteSize: step.byteSize,
        kind: "media",
        storageKey: step.storageKey,
      });
      continue;
    }

    try {
      await target.restoreAppData({
        app: planned.plan.apps.find((appPlan) => appPlan.app.installId === step.appInstallId)!.app,
        data: archiveApp.data,
        identity,
      });
    } catch (error) {
      return restoreFailure("app-data-restore-failed", step.appInstallId, error, planned.plan);
    }

    reports.push({
      appInstallId: step.appInstallId,
      dataKind: step.dataKind,
      kind: "appData",
      recordCount: step.recordCount,
      schemaKey: step.schemaKey,
      tombstoneCount: step.tombstoneCount,
    });
  }

  return {
    ok: true,
    plan: planned.plan,
    report: {
      applied: true,
      steps: reports,
      summary: planned.plan.summary,
    },
  };
}

export function restoreArchiveAppDataToStorage(
  storage: DurableObjectStorage,
  data: AppArchiveData,
): BootstrapResponse {
  ensureStorageTables(storage);

  if (data.kind === "storeSnapshot") {
    return restoreStorageSnapshot(storage, data.snapshot);
  }

  const schemaKey = data.schemaKey;

  const restored = resetStorage(storage, {
    changeMutationPrefix: `archive-restore:${schemaKey}`,
    records: sourceArchiveRecordsToStoredRecords(data.records),
    schema: data.schema,
  });

  return {
    cursor: getCurrentCursor(storage),
    records: getBootstrapRecords(storage),
    schema: restored.schema,
    schemaUpdatedAt: restored.updatedAt,
  };
}

export async function restoreArchiveMediaObjectToStore(
  store: MediaObjectStore,
  identity: InstalledAppStorageIdentity,
  object: AppArchiveMediaObject,
  bytes: Uint8Array,
): Promise<MediaWriteResponse> {
  const media = identity.siteMedia;

  if (!media) {
    throw new Error(`Installed app "${identity.installId}" does not support app-scoped media.`);
  }

  const keyPrefix = media.imageKeyPrefix.endsWith("/")
    ? media.imageKeyPrefix
    : `${media.imageKeyPrefix}/`;
  const result = await restoreImageMedia({
    bytes,
    contentType: object.contentType,
    hrefForKey: (key) => `${media.routePrefix}/${key}`,
    key: object.storageKey,
    keyPrefix,
    store,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  if (result.upload.href !== object.deliveryHref) {
    throw new Error(`Restored media href for "${object.storageKey}" did not match the archive.`);
  }

  return result.upload;
}

async function parseAndPlanArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<
  | {
      archive: PortableArchive;
      ok: true;
      plan: ArchiveRestorePlan;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
    }
> {
  let archive: PortableArchive;

  try {
    archive = parsePortableArchive(value);
  } catch (error) {
    return {
      errors: [
        {
          code: "invalid-archive",
          message: error instanceof Error ? error.message : "Archive is invalid.",
        },
      ],
      ok: false,
    };
  }

  const planResult = planPortableArchiveRestore(archive, {
    installedApps: await target.listInstalledApps(),
    mediaFiles: target.media ? await target.media.listFiles() : undefined,
    packages: target.packages,
    sourceSchemas: target.sourceSchemas ?? workerSourceSchemas(),
  });

  if (!planResult.ok) {
    return {
      errors: planResult.errors.map((error) => ({ ...error })),
      ok: false,
    };
  }

  return { archive, ok: true, plan: planResult.plan };
}

async function prepareMediaReads(
  steps: readonly ArchiveRestorePlanStep[],
  media: ArchiveRestoreMediaAdapter | undefined,
): Promise<
  | {
      files: Map<string, ArchiveRestoreMediaRead>;
      ok: true;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
    }
> {
  const mediaSteps = steps.filter((step) => step.kind === "restoreMedia");

  if (mediaSteps.length === 0) {
    return { files: new Map(), ok: true };
  }

  if (!media) {
    return {
      errors: [
        {
          code: "missing-media-adapter",
          message: "Archive restore requires a media adapter for archived media objects.",
        },
      ],
      ok: false,
    };
  }

  const files = new Map<string, ArchiveRestoreMediaRead>();
  const errors: ArchiveRestoreExecutionError[] = [];

  for (const step of mediaSteps) {
    try {
      const file = await media.readFile(step.archivePath);

      if (!file) {
        errors.push({
          appInstallId: step.appInstallId,
          archivePath: step.archivePath,
          code: "media-read-failed",
          message: `Archive media file "${step.archivePath}" is missing.`,
          storageKey: step.storageKey,
        });
        continue;
      }

      if (
        file.byteSize !== step.byteSize ||
        normalizeContentType(file.contentType) !== normalizeContentType(step.contentType) ||
        file.bytes.byteLength !== step.byteSize
      ) {
        errors.push({
          appInstallId: step.appInstallId,
          archivePath: step.archivePath,
          code: "media-read-failed",
          message: `Archive media file "${step.archivePath}" does not match the restore plan.`,
          storageKey: step.storageKey,
        });
        continue;
      }

      files.set(step.archivePath, file);
    } catch (error) {
      errors.push({
        appInstallId: step.appInstallId,
        archivePath: step.archivePath,
        code: "media-read-failed",
        message: error instanceof Error ? error.message : "Archive media file could not be read.",
        storageKey: step.storageKey,
      });
    }
  }

  return errors.length > 0 ? { errors, ok: false } : { files, ok: true };
}

function archiveAppsByInstallId(archive: PortableArchive): Map<string, AppArchive> {
  const apps = archive.kind === "formless.instanceArchive" ? archive.apps : [archive];

  return new Map(apps.map((app) => [app.app.installId, app]));
}

function sourceArchiveRecordsToStoredRecords(
  records: readonly SourceArchiveRecord[],
): StoredRecord[] {
  return records.map((record) => ({
    id: record.id,
    entity: record.entity,
    values: record.values,
    createdAt: record.createdAt,
  }));
}

function stepReports(steps: readonly ArchiveRestorePlanStep[]): ArchiveRestoreStepReport[] {
  return steps.map((step) => {
    if (step.kind === "createInstall" || step.kind === "replaceInstall") {
      return {
        action: step.kind === "createInstall" ? "create" : "replace",
        appInstallId: step.install.installId,
        kind: "install",
      };
    }

    if (step.kind === "restoreMedia") {
      return {
        appInstallId: step.appInstallId,
        archivePath: step.archivePath,
        byteSize: step.byteSize,
        kind: "media",
        storageKey: step.storageKey,
      };
    }

    return {
      appInstallId: step.appInstallId,
      dataKind: step.dataKind,
      kind: "appData",
      recordCount: step.recordCount,
      schemaKey: step.schemaKey,
      tombstoneCount: step.tombstoneCount,
    };
  });
}

function workerSourceSchemas(): Partial<Record<SchemaKey, AppSchema>> {
  return Object.fromEntries(workerSchemaApps.map((app) => [app.key, app.sourceSchema])) as Partial<
    Record<SchemaKey, AppSchema>
  >;
}

function restoreFailure(
  code: ArchiveRestoreExecutionErrorCode,
  appInstallId: string,
  error: unknown,
  plan: ArchiveRestorePlan,
  details: { archivePath?: string; storageKey?: string } = {},
): ArchiveRestoreExecutionResult {
  return {
    errors: [
      {
        appInstallId,
        code,
        message: error instanceof Error ? error.message : "Archive restore failed.",
        ...details,
      },
    ],
    ok: false,
    plan,
  };
}

function normalizeContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}
