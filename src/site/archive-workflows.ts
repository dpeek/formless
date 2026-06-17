import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatPortableArchive,
  parseAppArchive,
  parsePortableArchive,
  type AppArchive,
  type AppArchiveMediaObject,
  type ArchiveRestorePolicy,
  type InstanceArchive,
  type InstanceArchiveControlPlane,
  type PortableArchive,
} from "@dpeek/formless-archive";
import {
  readPortableArchiveDirectory,
  writePortableArchiveDirectory,
  type ArchiveDiskMediaFile,
  type ArchiveDiskWriteResult,
} from "@dpeek/formless-archive/node";
import {
  findAppInstall,
  type AppInstall,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import { findResolvedAppPackage, type AppPackageResolver } from "../shared/app-packages.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  parseInstanceControlPlaneStorageSnapshot,
  reviewableInstanceControlPlaneStorageSnapshot,
} from "@dpeek/formless-instance-control-plane";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  coreImageMediaDeliveryFactsForAssetId,
  coreMediaHrefForKey,
  imageMediaContentTypeForKey,
  isRestorableImageMediaKey,
  type MediaAsset,
} from "@dpeek/formless-media";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { AppInstallsResponse } from "../shared/protocol.ts";
import {
  readPortableArchiveInputStatus,
  type PortableArchiveInputStatus,
} from "./archive-input-status.ts";
import {
  isLegacySiteMediaHref,
  unsupportedLegacySiteMediaMessage,
} from "@dpeek/formless-site-app/node";
import { resolveSiteCliAdminToken, siteCliTargetFetchHeaders } from "./instance-target-context.ts";

export {
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  readPortableArchiveInputStatus,
  type PortableArchiveInputStatus,
} from "./archive-input-status.ts";
export type { ArchiveDiskMediaFile, ArchiveDiskWriteResult } from "@dpeek/formless-archive/node";

const INSTANCE_ARCHIVE_RESTORE_API_PATH = "/api/formless/archive/restore";

export type ArchiveWorkflowDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type ArchiveRestoreRemoteResult = {
  ok: boolean;
  plan?: {
    summary: ArchiveRestoreSummary;
  };
  report?: {
    applied: boolean;
    summary: ArchiveRestoreSummary;
  };
  errors?: { message: string }[];
};

export type ArchiveRestoreSummary = {
  appCount: number;
  createdInstalls: string[];
  mediaCountsByApp: Record<string, number>;
  recordCountsByApp: Record<string, { total: number }>;
  replacedInstalls: string[];
};

export type RestorePortableArchiveResult = {
  archiveInput: PortableArchiveInputStatus;
  archivePath: string;
  remote: ArchiveRestoreRemoteResult;
};

export async function exportInstanceArchive(
  input: {
    adminToken?: string | null;
    outDir: string;
    packageResolver?: AppPackageResolver;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveDiskWriteResult> {
  const target = normalizeTargetUrl(input.target);
  const exportedAt = dependencies.now();
  const auth = { adminToken: input.adminToken, env: dependencies.env };
  const registry = await fetchRemoteAppRegistry(target, { ...dependencies, ...auth });
  const [controlPlane, entries] = await Promise.all([
    fetchRemoteControlPlaneArchive({ auth, fetcher: dependencies.fetch, target }),
    Promise.all(
      registry.installs.map((install) =>
        buildRemoteAppArchiveEntry({
          auth,
          exportedAt,
          fetcher: dependencies.fetch,
          install,
          packageResolver: input.packageResolver,
          packages: registry.packages,
          target,
        }),
      ),
    ),
  ]);
  const archive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt,
    capabilities: instanceArchiveCapabilities(controlPlane),
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    ...(controlPlane === undefined ? {} : { controlPlane }),
    apps: entries.map((entry) => entry.archive),
  };

  return writePortableArchiveDirectory(
    { archive, mediaFiles: entries.flatMap((entry) => entry.mediaFiles), outDir: input.outDir },
    dependencies,
  );
}

async function fetchRemoteControlPlaneArchive(input: {
  auth?: ArchiveExportAuth;
  fetcher: typeof fetch;
  target: string;
}): Promise<InstanceArchiveControlPlane | undefined> {
  const snapshot = await fetchJson<StorageSnapshot>(
    input.fetcher,
    apiUrl(
      input.target,
      `${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/snapshot?actorKind=cliDeployer`,
    ),
    { headers: archiveExportRequestHeaders(input.auth, "application/json") },
  );

  return parseInstanceControlPlaneStorageSnapshot(
    "Instance archive controlPlane",
    reviewableInstanceControlPlaneStorageSnapshot(snapshot, {
      context: "Instance archive controlPlane records",
      sourceLabel: "Instance archive controlPlane",
    }),
  );
}

function instanceArchiveCapabilities(
  controlPlane: InstanceArchiveControlPlane | undefined,
): InstanceArchive["capabilities"] {
  return [
    "installed-app-registry",
    ...(controlPlane === undefined ? [] : ["schema-owned-control-plane" as const]),
    "app-store-snapshots",
    "core-media-assets",
  ];
}

export async function exportAppArchive(
  input: {
    adminToken?: string | null;
    installId: string;
    outDir: string;
    packageResolver?: AppPackageResolver;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveDiskWriteResult> {
  const target = normalizeTargetUrl(input.target);
  const auth = { adminToken: input.adminToken, env: dependencies.env };
  const registry = await fetchRemoteAppRegistry(target, { ...dependencies, ...auth });
  const install = findAppInstall(registry.installs, input.installId);

  if (!install) {
    throw new Error(`Installed app "${input.installId}" was not found at ${target}.`);
  }

  const entry = await buildRemoteAppArchiveEntry({
    auth,
    exportedAt: dependencies.now(),
    fetcher: dependencies.fetch,
    install,
    packageResolver: input.packageResolver,
    packages: registry.packages,
    target,
  });

  return writePortableArchiveDirectory(
    { archive: entry.archive, mediaFiles: entry.mediaFiles, outDir: input.outDir },
    dependencies,
  );
}

export async function restorePortableArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    replace: boolean;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const archiveInput = await readPortableArchiveInputStatus({
    archiveDir: input.archiveDir,
    cwd: dependencies.cwd,
  });
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, dependencies);
  const archive = withRestorePolicy(diskArchive.archive, restorePolicy(input));
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      mediaFiles: diskArchive.mediaFiles,
      target: input.target,
    },
    dependencies,
  );

  return {
    archiveInput,
    archivePath: diskArchive.archivePath,
    remote,
  };
}

export async function restoreWorkspacePushArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const archiveInput = await readPortableArchiveInputStatus({
    archiveDir: input.archiveDir,
    cwd: dependencies.cwd,
  });
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, dependencies);

  if (diskArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Workspace push restore requires a formless.instanceArchive archive.");
  }

  const archive = withRestorePolicy(diskArchive.archive, {
    dryRun: !input.apply,
    installCollisions: "replace",
  });
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      exactInstanceReplacement: true,
      mediaFiles: diskArchive.mediaFiles,
      target: input.target,
    },
    dependencies,
  );

  return {
    archiveInput,
    archivePath: diskArchive.archivePath,
    remote,
  };
}

export async function restoreAppArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    installId: string;
    replace: boolean;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const archiveInput = await readPortableArchiveInputStatus({
    archiveDir: input.archiveDir,
    cwd: dependencies.cwd,
  });
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, dependencies);

  if (diskArchive.archive.kind !== APP_ARCHIVE_KIND) {
    throw new Error("App archive restore requires a formless.appArchive archive.");
  }

  const archive = withRestorePolicy(
    retargetAppArchive(diskArchive.archive, input.installId),
    restorePolicy(input),
  );
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      mediaFiles: diskArchive.mediaFiles,
      target: input.target,
    },
    dependencies,
  );

  return {
    archiveInput,
    archivePath: diskArchive.archivePath,
    remote,
  };
}

function restorePolicy(input: { apply: boolean; replace: boolean }): ArchiveRestorePolicy {
  return {
    dryRun: !input.apply,
    installCollisions: input.replace ? "replace" : "reject",
  };
}

async function buildRemoteAppArchiveEntry(input: {
  auth?: ArchiveExportAuth;
  exportedAt: string;
  fetcher: typeof fetch;
  install: AppInstall;
  packageResolver?: AppPackageResolver;
  packages: readonly InstallableAppPackage[];
  target: string;
}): Promise<{ archive: AppArchive; mediaFiles: ArchiveDiskMediaFile[] }> {
  const registryPackage = input.packages.find(
    (candidate) => candidate.packageAppKey === input.install.packageAppKey,
  );
  const packageApp =
    registryPackage ?? findResolvedAppPackage(input.install.packageAppKey, input.packageResolver);
  const sourceSchemaKey = registryPackage?.sourceSchemaKey ?? packageApp?.sourceSchemaKey;
  const packageRevision =
    input.install.packageRevision ??
    registryPackage?.packageRevision ??
    packageApp?.packageRevision;
  const sourceSchemaHash =
    input.install.sourceSchemaHash ??
    registryPackage?.sourceSchemaHash ??
    packageApp?.sourceSchemaHash;
  const snapshot = await fetchJson<StorageSnapshot>(
    input.fetcher,
    apiUrl(input.target, appApiPath(input.install, "/snapshot")),
    { headers: archiveExportRequestHeaders(input.auth, "application/json") },
  );

  if (!sourceSchemaKey) {
    throw new Error(`Installed app "${input.install.installId}" uses unsupported package.`);
  }

  if (!packageRevision || !sourceSchemaHash) {
    throw new Error(
      `Installed app "${input.install.installId}" is missing package facts for archive export.`,
    );
  }

  const media = await exportRemoteAppMedia({
    auth: input.auth,
    fetcher: input.fetcher,
    install: input.install,
    records: snapshot.records,
    target: input.target,
  });
  const archive: AppArchive = {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: input.install.installId,
      packageAppKey: input.install.packageAppKey,
      packageRevision,
      sourceSchemaKey,
      sourceSchemaHash,
      label: input.install.label,
      status: input.install.status,
      createdAt: input.install.createdAt,
      updatedAt: input.install.updatedAt,
    },
    data: snapshot,
    media: {
      objects: media.objects,
    },
  };

  return {
    archive,
    mediaFiles: media.files,
  };
}

async function exportRemoteAppMedia(input: {
  auth?: ArchiveExportAuth;
  fetcher: typeof fetch;
  install: AppInstall;
  records: readonly StoredRecord[];
  target: string;
}): Promise<{ files: ArchiveDiskMediaFile[]; objects: AppArchiveMediaObject[] }> {
  const references = appMediaReferences(input.records);
  const files: ArchiveDiskMediaFile[] = [];
  const objects: AppArchiveMediaObject[] = [];

  for (const reference of references) {
    const response = await input.fetcher(apiUrl(input.target, reference.deliveryHref), {
      headers: archiveExportRequestHeaders(input.auth, reference.contentType),
    });

    if (!response.ok) {
      throw new Error(
        `Failed GET ${apiUrl(input.target, reference.deliveryHref)}: HTTP ${
          response.status
        } ${await response.text()}`,
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const archivePath = `media/${input.install.installId}/${reference.storageKey}`;

    objects.push({
      archivePath,
      ...(reference.asset
        ? { asset: mediaAssetForArchiveObject(reference.asset, bytes.byteLength) }
        : {}),
      byteSize: bytes.byteLength,
      contentType: reference.contentType,
      deliveryHref: reference.deliveryHref,
      storageKey: reference.storageKey,
    });
    files.push({
      archivePath,
      byteSize: bytes.byteLength,
      bytes,
      contentType: reference.contentType,
    });
  }

  return { files, objects };
}

function appMediaReferences(records: readonly StoredRecord[]): AppArchiveMediaObject[] {
  const referencesByKey = new Map<string, AppArchiveMediaObject>();

  for (const record of records) {
    if (record.deletedAt !== undefined) {
      continue;
    }

    for (const [fieldName, value] of Object.entries(record.values)) {
      if (fieldName === "mediaAssetId" && typeof value === "string") {
        const facts = coreImageMediaDeliveryFactsForAssetId(value);

        if (facts) {
          referencesByKey.set(facts.storageKey, coreMediaReference(facts.storageKey, facts.href));
        }
      }

      if (typeof value === "string") {
        const coreStorageKey = storageKeyFromDeliveryHref(value, CORE_MEDIA_ROUTE_PREFIX);

        if (
          coreStorageKey &&
          isRestorableImageMediaKey(coreStorageKey, {
            keyPrefix: mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX),
          }) &&
          !referencesByKey.has(coreStorageKey)
        ) {
          referencesByKey.set(
            coreStorageKey,
            coreMediaReference(coreStorageKey, coreMediaHrefForKey(coreStorageKey)),
          );
          continue;
        }

        if (isLegacySiteMediaHref(value)) {
          throw new Error(unsupportedLegacySiteMediaMessage(value, "archive export"));
        }
      }
    }
  }

  return [...referencesByKey.values()].sort((left, right) =>
    left.storageKey.localeCompare(right.storageKey),
  );
}

function coreMediaReference(storageKey: string, deliveryHref: string): AppArchiveMediaObject {
  const contentType = imageMediaContentTypeForKey(storageKey);
  const assetId = storageKey.startsWith(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX))
    ? storageKey.slice(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX).length)
    : storageKey;

  if (!contentType) {
    throw new Error(`Media key "${storageKey}" has unsupported content type.`);
  }

  return {
    archivePath: "",
    asset: {
      byteSize: 0,
      contentType,
      deliveryHref,
      id: assetId,
      kind: "image",
      label: assetId,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize: 0,
    contentType,
    deliveryHref,
    storageKey,
  };
}

function mediaAssetForArchiveObject(asset: MediaAsset, byteSize: number): MediaAsset {
  return {
    ...asset,
    byteSize,
  };
}

function storageKeyFromDeliveryHref(href: string, routePrefix: string): string | undefined {
  const prefix = routePrefix.endsWith("/") ? routePrefix : `${routePrefix}/`;

  return href.startsWith(prefix) ? href.slice(prefix.length) : undefined;
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

async function fetchRemoteAppRegistry(
  target: string,
  dependencies: ArchiveExportAuth & Pick<ArchiveWorkflowDependencies, "fetch">,
): Promise<AppInstallsResponse> {
  return fetchJson<AppInstallsResponse>(
    dependencies.fetch,
    apiUrl(target, "/api/formless/app-installs"),
    { headers: archiveExportRequestHeaders(dependencies, "application/json") },
  );
}

type ArchiveExportAuth = {
  adminToken?: string | null;
  env?: NodeJS.ProcessEnv;
};

function archiveExportRequestHeaders(auth: ArchiveExportAuth | undefined, accept: string): Headers {
  return siteCliTargetFetchHeaders({
    accept,
    adminToken: archiveExportAdminToken(auth),
  });
}

function archiveExportAdminToken(auth: ArchiveExportAuth | undefined): string | undefined {
  return (
    resolveSiteCliAdminToken({
      env: auth?.env,
      explicitAdminToken: auth?.adminToken,
    }).token ?? undefined
  );
}

async function postRemoteArchiveRestore(
  input: {
    adminToken?: string | null;
    archive: PortableArchive;
    exactInstanceReplacement?: boolean;
    mediaFiles: readonly ArchiveDiskMediaFile[];
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveRestoreRemoteResult> {
  const target = normalizeTargetUrl(input.target);

  return fetchJson<ArchiveRestoreRemoteResult>(
    dependencies.fetch,
    apiUrl(target, INSTANCE_ARCHIVE_RESTORE_API_PATH),
    {
      body: JSON.stringify({
        archive: JSON.parse(formatPortableArchive(input.archive)) as unknown,
        ...(input.exactInstanceReplacement === undefined
          ? {}
          : { exactInstanceReplacement: input.exactInstanceReplacement }),
        mediaFiles: input.mediaFiles.map(archiveRestoreRequestMediaFile),
      }),
      headers: archiveRestoreRequestHeaders(input.adminToken, dependencies.env),
      method: "POST",
    },
  );
}

function archiveRestoreRequestHeaders(
  adminToken: string | null | undefined,
  env: NodeJS.ProcessEnv | undefined,
): Headers {
  return siteCliTargetFetchHeaders({
    accept: "application/json",
    adminToken: resolveSiteCliAdminToken({ env, explicitAdminToken: adminToken }).token,
    contentType: "application/json",
  });
}

function archiveRestoreRequestMediaFile(file: ArchiveDiskMediaFile) {
  return {
    archivePath: file.archivePath,
    byteSize: file.byteSize,
    bytesBase64: Buffer.from(file.bytes).toString("base64"),
    contentType: file.contentType,
  };
}

function retargetAppArchive(archive: AppArchive, installId: string): AppArchive {
  const nextArchive = parseAppArchive(jsonClone(archive));

  if (nextArchive.app.installId === installId) {
    return nextArchive;
  }

  const nextIdentity = installedAppStorageIdentity({
    installId,
    packageAppKey: nextArchive.app.packageAppKey,
  });

  if (!nextIdentity) {
    throw new Error(`App archive cannot restore into install "${installId}".`);
  }

  nextArchive.app.installId = nextIdentity.installId;

  nextArchive.data.storageIdentity = nextIdentity.authorityName;

  return nextArchive;
}

function withRestorePolicy(
  archive: PortableArchive,
  policy: ArchiveRestorePolicy,
): PortableArchive {
  const nextArchive = parsePortableArchive(jsonClone(archive));

  nextArchive.restorePolicy = policy;

  if (nextArchive.kind === INSTANCE_ARCHIVE_KIND) {
    nextArchive.apps = nextArchive.apps.map((app) => ({
      ...app,
      restorePolicy: policy,
    }));
  }

  return nextArchive;
}

function appApiPath(install: AppInstall, suffix: `/${string}`): string {
  return `/api/app-installs/${install.packageAppKey}/${install.installId}${suffix}`;
}

function apiUrl(target: string, pathInput: string): string {
  const pathname = pathInput.startsWith("/") ? pathInput.slice(1) : pathInput;

  return new URL(pathname, `${target}/`).toString();
}

function normalizeTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Target URL is invalid: ${value}`);
  }
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: response was not JSON.`);
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
