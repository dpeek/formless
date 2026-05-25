import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  parsePortableArchive,
  type AppArchive,
  type InstanceArchive,
  type PortableArchive,
} from "../shared/archive.ts";
import type { AppInstall } from "../shared/app-installs.ts";
import {
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
  normalizeFormlessInstanceWorkspaceTargetUrl,
  parseFormlessInstanceWorkspaceManifestJson,
  type FormlessInstanceWorkspaceApp,
  type FormlessInstanceWorkspaceManifest,
  type FormlessInstanceWorkspaceTarget,
} from "./instance-workspace-config.ts";
import {
  FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formatFormlessInstanceWorkspaceSecretState,
  formlessInstanceWorkspaceSecretStatePath,
  readFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
  writeFormlessInstanceWorkspaceSecretState,
  type FormlessInstanceWorkspaceSecretState,
} from "./instance-workspace-secrets.ts";
import {
  readFormlessInstanceTargetStatus,
  type FormlessInstanceTargetStatus,
} from "./instance-target-client.ts";
import {
  exportAppArchive,
  exportInstanceArchive,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  restorePortableArchive,
  type ArchiveDiskMediaFile,
  type ArchiveDiskWriteResult,
  type RestorePortableArchiveResult,
} from "./archive-workflows.ts";
import { packageExecCommand } from "./package-commands.ts";

export type InitFormlessInstanceWorkspaceInput = {
  fromArchive?: string | null;
  fromRemote?: boolean;
  name?: string | null;
  targetAlias?: string;
  targetUrl?: string | null;
  workspacePath?: string;
};

export type InitFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
};

export type InitFormlessInstanceWorkspaceResult = {
  archiveSourcePath?: string;
  gitignorePath: string;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  remoteStatus?: FormlessInstanceTargetStatus;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceStatusInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type FormlessInstanceWorkspaceStatusDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
};

export type FormlessInstanceWorkspaceStatusResult = {
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  remoteStatus?: FormlessInstanceTargetStatus;
  secretState: "env" | "missing" | "stored";
  selectedTarget?: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type PullFormlessInstanceWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PullFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
};

export type PullFormlessInstanceWorkspaceAppArchiveResult = ArchiveDiskWriteResult & {
  archiveRoot: string;
  installId: string;
};

export type PullFormlessInstanceWorkspaceResult = {
  appArchives: PullFormlessInstanceWorkspaceAppArchiveResult[];
  instanceArchive: ArchiveDiskWriteResult;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type CheckFormlessInstanceWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type CheckFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
};

export type FormlessInstanceWorkspacePackageMismatch = {
  installId: string;
  localPackageAppKey: string;
  remotePackageAppKey: string;
};

export type FormlessInstanceWorkspaceDriftSummary = {
  changedArchivePaths: string[];
  changedMedia: string[];
  changedRecords: string[];
  extraInstalls: string[];
  localAppCount: number;
  localMediaCount: number;
  localRecordCount: number;
  missingInstalls: string[];
  packageMismatches: FormlessInstanceWorkspacePackageMismatch[];
  remoteAppCount: number;
  remoteMediaCount: number;
  remoteRecordCount: number;
  status: "drift" | "no-drift";
};

export type CheckFormlessInstanceWorkspaceResult = {
  drift: FormlessInstanceWorkspaceDriftSummary;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type PushFormlessInstanceWorkspaceInput = {
  allowStale?: boolean;
  apply?: boolean;
  replace?: boolean;
  replaceInstallSet?: boolean;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PushFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type PushFormlessInstanceWorkspaceSource = {
  archivePath: string;
  appCount: number;
  mediaCount: number;
  recordCount: number;
};

export type PushFormlessInstanceWorkspaceResult = {
  applyResult?: RestorePortableArchiveResult;
  backup?: ArchiveDiskWriteResult;
  drift: FormlessInstanceWorkspaceDriftSummary;
  dryRun: RestorePortableArchiveResult;
  mode: "apply" | "dry-run";
  replace: boolean;
  replaceInstallSet: boolean;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  source: PushFormlessInstanceWorkspaceSource;
  workspaceRoot: string;
};

export type AdoptFormlessInstanceWorkspaceAdminTokenInput = {
  adminToken?: string | null;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type AdoptFormlessInstanceWorkspaceAdminTokenDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type AdoptFormlessInstanceWorkspaceAdminTokenResult = {
  secretPath: string;
  selectedTarget?: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type RotateFormlessInstanceWorkspaceAdminTokenInput =
  AdoptFormlessInstanceWorkspaceAdminTokenInput;

export type RotateFormlessInstanceWorkspaceAdminTokenDependencies =
  AdoptFormlessInstanceWorkspaceAdminTokenDependencies & {
    packageRoot: string;
    randomToken: () => string;
    runCommand: (
      command: string,
      args: string[],
      options: { cwd: string; env?: NodeJS.ProcessEnv },
    ) => Promise<void>;
  };

export type RotateFormlessInstanceWorkspaceAdminTokenResult =
  AdoptFormlessInstanceWorkspaceAdminTokenResult & {
    workerName: string;
  };

export async function initFormlessInstanceWorkspace(
  input: InitFormlessInstanceWorkspaceInput,
  dependencies: InitFormlessInstanceWorkspaceDependencies,
): Promise<InitFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const manifestPath = workspaceManifestPath(workspaceRoot);

  await assertNoExistingManifest(manifestPath);
  await mkdir(workspaceRoot, { recursive: true });

  const name = input.name ?? defaultWorkspaceName(workspaceRoot);
  const targetUrl =
    input.targetUrl === undefined || input.targetUrl === null
      ? null
      : normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const targetAlias = input.targetAlias ?? "remote";
  let manifest = defaultFormlessInstanceWorkspaceManifest({ name, targetUrl });
  let remoteStatus: FormlessInstanceTargetStatus | undefined;
  let archiveSourcePath: string | undefined;

  if (targetUrl) {
    manifest = withSingleTarget(manifest, { alias: targetAlias, url: targetUrl });
  }

  if (input.fromRemote) {
    if (!targetUrl) {
      throw new Error("Formless instance workspace remote init requires --target-url.");
    }

    remoteStatus = await readFormlessInstanceTargetStatus({ targetUrl }, dependencies);
    manifest = withRemoteStatus(manifest, remoteStatus);
  }

  if (input.fromArchive) {
    const archiveDir = path.resolve(dependencies.cwd, input.fromArchive);
    const archive = await readWorkspaceArchive(archiveDir);

    archiveSourcePath = relativeWorkspacePath(workspaceRoot, archiveDir);
    manifest = withArchiveSource(manifest, archive, archiveSourcePath);
  }

  await prepareWorkspaceDirectories(workspaceRoot, manifest);
  await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));
  const gitignorePath = await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    ...(archiveSourcePath === undefined ? {} : { archiveSourcePath }),
    gitignorePath,
    manifest,
    manifestPath,
    ...(remoteStatus === undefined ? {} : { remoteStatus }),
    workspaceRoot,
  };
}

export async function getFormlessInstanceWorkspaceStatus(
  input: FormlessInstanceWorkspaceStatusInput,
  dependencies: FormlessInstanceWorkspaceStatusDependencies,
): Promise<FormlessInstanceWorkspaceStatusResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = selectWorkspaceTarget(manifest, input.targetAlias);
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const remoteStatus = selectedTarget
    ? await readFormlessInstanceTargetStatus({ targetUrl: selectedTarget.url }, dependencies)
    : undefined;

  return {
    manifest,
    manifestPath,
    ...(remoteStatus === undefined ? {} : { remoteStatus }),
    secretState: workspaceSecretStateLabel(secretState, dependencies.env),
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workspaceRoot,
  };
}

export async function pullFormlessInstanceWorkspace(
  input: PullFormlessInstanceWorkspaceInput,
  dependencies: PullFormlessInstanceWorkspaceDependencies,
): Promise<PullFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = requireWorkspaceTarget(manifest, input.targetAlias, "pull");
  const instanceArchiveRoot = path.join(workspaceRoot, manifest.archives.instance);

  await prepareWorkspaceDirectories(workspaceRoot, manifest);
  await rm(instanceArchiveRoot, { force: true, recursive: true });

  const instanceArchive = await exportInstanceArchive(
    {
      outDir: instanceArchiveRoot,
      target: selectedTarget.url,
    },
    dependencies,
  );
  const pulledInstanceArchive = await readArchiveDirectoryForCheck(instanceArchiveRoot);

  if (!pulledInstanceArchive || pulledInstanceArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Formless instance pull did not write an instance archive.");
  }

  const appArchives: PullFormlessInstanceWorkspaceAppArchiveResult[] = [];

  for (const app of archiveApps(pulledInstanceArchive.archive)) {
    const archiveRoot = path.join(
      workspaceRoot,
      workspaceAppArchivePath(manifest, app.app.installId),
    );
    const archive = await pullWorkspaceAppArchive(
      {
        archiveRoot,
        installId: app.app.installId,
        targetUrl: selectedTarget.url,
      },
      dependencies,
    );

    appArchives.push(archive);
  }

  return {
    appArchives: appArchives.sort((left, right) => left.installId.localeCompare(right.installId)),
    instanceArchive,
    selectedTarget,
    workspaceRoot,
  };
}

export async function checkFormlessInstanceWorkspace(
  input: CheckFormlessInstanceWorkspaceInput,
  dependencies: CheckFormlessInstanceWorkspaceDependencies,
): Promise<CheckFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = requireWorkspaceTarget(manifest, input.targetAlias, "check");
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "check");

  try {
    const remoteArchiveRoot = path.join(tempRoot, "instance");

    await exportInstanceArchive(
      {
        outDir: remoteArchiveRoot,
        target: selectedTarget.url,
      },
      dependencies,
    );

    const remoteArchive = await readArchiveDirectoryForCheck(remoteArchiveRoot);

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance check did not write a remote instance archive.");
    }

    const localInstanceArchive = await readArchiveDirectoryForCheck(
      path.join(workspaceRoot, manifest.archives.instance),
    );
    const localAppArchives = new Map<string, WorkspaceArchiveDirectory>();

    for (const app of manifest.apps) {
      const archive = await readArchiveDirectoryForCheck(path.join(workspaceRoot, app.archivePath));

      if (archive) {
        localAppArchives.set(app.installId, archive);
      }
    }

    return {
      drift: compareWorkspaceArchives({
        localAppArchives,
        localInstanceArchive,
        manifest,
        remoteArchive,
      }),
      selectedTarget,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function pushFormlessInstanceWorkspace(
  input: PushFormlessInstanceWorkspaceInput,
  dependencies: PushFormlessInstanceWorkspaceDependencies,
): Promise<PushFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = requireWorkspaceTarget(manifest, input.targetAlias, "push");
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "push");
  const composedArchiveRoot = path.join(tempRoot, "archive");

  try {
    const backup = input.apply
      ? await exportInstanceArchive(
          {
            outDir: workspacePushBackupPath(workspaceRoot, dependencies.now()),
            target: selectedTarget.url,
          },
          dependencies,
        )
      : undefined;
    const remoteArchiveRoot = backup
      ? path.dirname(backup.archivePath)
      : path.join(tempRoot, "remote-check");

    if (!backup) {
      await exportInstanceArchive(
        {
          outDir: remoteArchiveRoot,
          target: selectedTarget.url,
        },
        dependencies,
      );
    }

    const remoteArchive = await readArchiveDirectoryForCheck(remoteArchiveRoot);

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance push could not read remote archive state.");
    }

    const localAppArchives = await readWorkspaceAppArchivesForPush(workspaceRoot, manifest);
    const localInstanceArchive = await readArchiveDirectoryForCheck(
      path.join(workspaceRoot, manifest.archives.instance),
    );
    const source = await writeComposedWorkspacePushArchive({
      archives: localAppArchives,
      archiveRoot: composedArchiveRoot,
      exportedAt: dependencies.now(),
    });
    const drift = compareWorkspaceArchives({
      localAppArchives: new Map(
        localAppArchives.map((archive) => [
          archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive.app.installId : "",
          archive,
        ]),
      ),
      localInstanceArchive,
      manifest,
      remoteArchive,
    });

    if (input.apply && drift.status === "drift" && !input.allowStale) {
      throw new Error(
        "Formless instance push apply refused because remote drift was detected; review `formless instance check` and retry with --allow-stale to acknowledge it.",
      );
    }

    if (input.apply && input.replaceInstallSet && drift.extraInstalls.length > 0) {
      throw new Error(
        `Formless instance push cannot replace the remote install set yet; archive restore cannot prune extra remote installs: ${drift.extraInstalls.join(", ")}.`,
      );
    }

    const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
    const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
      env: dependencies.env,
      secretState,
    });
    const dryRun = await restorePortableArchive(
      {
        adminToken,
        apply: false,
        archiveDir: composedArchiveRoot,
        replace: input.replace ?? false,
        target: selectedTarget.url,
      },
      dependencies,
    );

    if (input.apply && !dryRun.remote.ok) {
      throw new Error("Formless instance push apply stopped because dry-run restore failed.");
    }

    const applyResult = input.apply
      ? await restorePortableArchive(
          {
            adminToken,
            apply: true,
            archiveDir: composedArchiveRoot,
            replace: input.replace ?? false,
            target: selectedTarget.url,
          },
          dependencies,
        )
      : undefined;

    return {
      ...(applyResult === undefined ? {} : { applyResult }),
      ...(backup === undefined ? {} : { backup }),
      drift,
      dryRun,
      mode: input.apply ? "apply" : "dry-run",
      replace: input.replace ?? false,
      replaceInstallSet: input.replaceInstallSet ?? false,
      selectedTarget,
      source,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function adoptFormlessInstanceWorkspaceAdminToken(
  input: AdoptFormlessInstanceWorkspaceAdminTokenInput,
  dependencies: AdoptFormlessInstanceWorkspaceAdminTokenDependencies,
): Promise<AdoptFormlessInstanceWorkspaceAdminTokenResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = selectWorkspaceTarget(manifest, input.targetAlias);
  const existingSecretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.adminToken,
    secretState: existingSecretState,
  });

  if (!adminToken) {
    throw new Error(missingAdminTokenMessage("adopt"));
  }

  const write = await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    secretPath: write.path,
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workspaceRoot,
  };
}

export async function rotateFormlessInstanceWorkspaceAdminToken(
  input: RotateFormlessInstanceWorkspaceAdminTokenInput,
  dependencies: RotateFormlessInstanceWorkspaceAdminTokenDependencies,
): Promise<RotateFormlessInstanceWorkspaceAdminTokenResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = selectWorkspaceTarget(manifest, input.targetAlias);
  const workerName = selectWorkspaceWorkerName(manifest, selectedTarget);
  const adminToken =
    resolveFormlessInstanceWorkspaceAdminToken({
      env: dependencies.env,
      explicitAdminToken: input.adminToken,
      secretState: {},
    }) ?? requiredGeneratedToken(dependencies.randomToken());
  const secretPath = formlessInstanceWorkspaceSecretStatePath(workspaceRoot);
  const temporarySecretPath = path.join(
    path.dirname(secretPath),
    `${FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE}.next`,
  );
  const secretContents = formatFormlessInstanceWorkspaceSecretState({ adminToken });

  await mkdir(path.dirname(secretPath), { recursive: true });
  await writeFile(temporarySecretPath, secretContents);

  try {
    const command = packageExecCommand(
      "wrangler",
      ["secret", "bulk", temporarySecretPath, "--name", workerName],
      dependencies.env ?? {},
    );

    await dependencies.runCommand(command.command, command.args, {
      cwd: dependencies.packageRoot,
      env: rotateCommandEnv(dependencies.env, manifest),
    });
    await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });
    await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);
  } finally {
    await rm(temporarySecretPath, { force: true });
  }

  return {
    secretPath,
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workerName,
    workspaceRoot,
  };
}

type WorkspaceArchiveDirectory = {
  archive: PortableArchive;
  archivePath: string;
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
};

async function pullWorkspaceAppArchive(
  input: {
    archiveRoot: string;
    installId: string;
    targetUrl: string;
  },
  dependencies: PullFormlessInstanceWorkspaceDependencies,
): Promise<PullFormlessInstanceWorkspaceAppArchiveResult> {
  await rm(input.archiveRoot, { force: true, recursive: true });

  const write = await exportAppArchive(
    {
      installId: input.installId,
      outDir: input.archiveRoot,
      target: input.targetUrl,
    },
    dependencies,
  );

  return {
    ...write,
    archiveRoot: input.archiveRoot,
    installId: input.installId,
  };
}

async function readArchiveDirectoryForCheck(
  archiveRoot: string,
): Promise<WorkspaceArchiveDirectory | undefined> {
  const archivePath = path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE);
  let contents: string;

  try {
    contents = await readFile(archivePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  const archive = parsePortableArchive(JSON.parse(contents) as unknown);
  const mediaFiles: ArchiveDiskMediaFile[] = [];
  const missingMediaFiles: string[] = [];

  for (const app of archiveApps(archive)) {
    for (const object of app.media.objects) {
      try {
        const bytes = new Uint8Array(await readFile(path.join(archiveRoot, object.archivePath)));

        mediaFiles.push({
          archivePath: object.archivePath,
          byteSize: bytes.byteLength,
          bytes,
          contentType: object.contentType,
        });
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          missingMediaFiles.push(object.archivePath);
          continue;
        }

        throw error;
      }
    }
  }

  return {
    archive,
    archivePath,
    mediaFiles,
    missingMediaFiles: missingMediaFiles.sort((left, right) => left.localeCompare(right)),
  };
}

function compareWorkspaceArchives(input: {
  localAppArchives: ReadonlyMap<string, WorkspaceArchiveDirectory>;
  localInstanceArchive: WorkspaceArchiveDirectory | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  remoteArchive: WorkspaceArchiveDirectory;
}): FormlessInstanceWorkspaceDriftSummary {
  const remoteApps = archiveApps(input.remoteArchive.archive);
  const remoteAppsByInstall = new Map(remoteApps.map((app) => [app.app.installId, app]));
  const manifestAppsByInstall = new Map(input.manifest.apps.map((app) => [app.installId, app]));
  const changedArchivePaths = new Set<string>();
  const changedMedia = new Set<string>();
  const changedRecords = new Set<string>();
  const packageMismatches: FormlessInstanceWorkspacePackageMismatch[] = [];
  const missingInstalls = input.manifest.apps
    .filter((app) => !remoteAppsByInstall.has(app.installId))
    .map((app) => app.installId)
    .sort((left, right) => left.localeCompare(right));
  const extraInstalls = remoteApps
    .filter((app) => !manifestAppsByInstall.has(app.app.installId))
    .map((app) => app.app.installId)
    .sort((left, right) => left.localeCompare(right));

  if (
    !input.localInstanceArchive ||
    input.localInstanceArchive.archive.kind !== INSTANCE_ARCHIVE_KIND ||
    comparableArchiveJson(input.localInstanceArchive.archive) !==
      comparableArchiveJson(input.remoteArchive.archive)
  ) {
    changedArchivePaths.add(input.manifest.archives.instance);
  }

  for (const installId of missingInstalls) {
    const app = manifestAppsByInstall.get(installId);

    if (app) {
      changedArchivePaths.add(app.archivePath);
    }
  }

  for (const remoteApp of remoteApps) {
    const manifestApp = manifestAppsByInstall.get(remoteApp.app.installId);

    if (!manifestApp) {
      continue;
    }

    const localArchive = input.localAppArchives.get(remoteApp.app.installId);

    if (!localArchive || localArchive.archive.kind !== APP_ARCHIVE_KIND) {
      changedArchivePaths.add(manifestApp.archivePath);
      continue;
    }

    const localPackageAppKey = localArchive.archive.app.packageAppKey;

    if (localPackageAppKey !== remoteApp.app.packageAppKey) {
      packageMismatches.push({
        installId: remoteApp.app.installId,
        localPackageAppKey,
        remotePackageAppKey: remoteApp.app.packageAppKey,
      });
      changedArchivePaths.add(manifestApp.archivePath);
      continue;
    }

    if (comparableAppRecordsJson(localArchive.archive) !== comparableAppRecordsJson(remoteApp)) {
      changedRecords.add(remoteApp.app.installId);
      changedArchivePaths.add(manifestApp.archivePath);
    }

    if (
      comparableAppMediaJson(localArchive, localArchive.archive) !==
      comparableAppMediaJson(input.remoteArchive, remoteApp)
    ) {
      changedMedia.add(remoteApp.app.installId);
      changedArchivePaths.add(manifestApp.archivePath);
    }
  }

  const localArchives = [...input.localAppArchives.values()]
    .map((archive) => (archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive : undefined))
    .filter((archive): archive is AppArchive => archive !== undefined);
  const hasDrift =
    changedArchivePaths.size > 0 ||
    changedMedia.size > 0 ||
    changedRecords.size > 0 ||
    extraInstalls.length > 0 ||
    missingInstalls.length > 0 ||
    packageMismatches.length > 0;

  return {
    changedArchivePaths: [...changedArchivePaths].sort((left, right) => left.localeCompare(right)),
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    extraInstalls,
    localAppCount: input.manifest.apps.length,
    localMediaCount: localArchives.reduce((count, app) => count + app.media.objects.length, 0),
    localRecordCount: localArchives.reduce((count, app) => count + appRecordCount(app), 0),
    missingInstalls,
    packageMismatches: packageMismatches.sort((left, right) =>
      left.installId.localeCompare(right.installId),
    ),
    remoteAppCount: remoteApps.length,
    remoteMediaCount: remoteApps.reduce((count, app) => count + app.media.objects.length, 0),
    remoteRecordCount: remoteApps.reduce((count, app) => count + appRecordCount(app), 0),
    status: hasDrift ? "drift" : "no-drift",
  };
}

function comparableArchiveJson(archive: PortableArchive): string {
  const normalized = normalizeGeneratedArchiveTimestamps(archive);

  return normalized.kind === INSTANCE_ARCHIVE_KIND
    ? formatInstanceArchive(normalized)
    : formatAppArchive(normalized);
}

function comparableAppRecordsJson(archive: AppArchive): string {
  return JSON.stringify(stableValue(normalizeGeneratedArchiveTimestamps(archive).data));
}

function comparableAppMediaJson(directory: WorkspaceArchiveDirectory, archive: AppArchive): string {
  const bytesByArchivePath = new Map(
    directory.mediaFiles.map((file) => [
      file.archivePath,
      Buffer.from(file.bytes).toString("base64"),
    ]),
  );
  const missing = new Set(directory.missingMediaFiles);
  const media = archive.media.objects
    .map((object) => ({
      archivePath: object.archivePath,
      byteSize: object.byteSize,
      bytesBase64: bytesByArchivePath.get(object.archivePath) ?? null,
      contentType: object.contentType,
      deliveryHref: object.deliveryHref,
      missing: missing.has(object.archivePath),
      storageKey: object.storageKey,
    }))
    .sort((left, right) => {
      const storageKeyOrder = left.storageKey.localeCompare(right.storageKey);

      return storageKeyOrder === 0
        ? left.archivePath.localeCompare(right.archivePath)
        : storageKeyOrder;
    });

  return JSON.stringify(stableValue(media));
}

function normalizeGeneratedArchiveTimestamps<T extends PortableArchive>(archive: T): T {
  const nextArchive = jsonClone(archive);
  const generatedAt = "1970-01-01T00:00:00.000Z";

  nextArchive.exportedAt = generatedAt;

  if (nextArchive.kind === INSTANCE_ARCHIVE_KIND) {
    nextArchive.apps = nextArchive.apps.map((app) => normalizeGeneratedArchiveTimestamps(app));
    return nextArchive;
  }

  if (nextArchive.data.kind === "storeSnapshot") {
    nextArchive.data.snapshot.exportedAt = generatedAt;
  }

  return nextArchive;
}

function withSingleTarget(
  manifest: FormlessInstanceWorkspaceManifest,
  target: FormlessInstanceWorkspaceTarget,
): FormlessInstanceWorkspaceManifest {
  return {
    ...manifest,
    defaultTarget: target.alias,
    targets: [target],
  };
}

function withRemoteStatus(
  manifest: FormlessInstanceWorkspaceManifest,
  status: FormlessInstanceTargetStatus,
): FormlessInstanceWorkspaceManifest {
  const appDeclarations = status.appRegistry.installs.map(appDeclarationFromInstall);

  return {
    ...manifest,
    apps: appDeclarations,
    defaultAppPolicy: appDeclarations.length === 0 ? "none" : "declared-installs",
    deploy: {
      ...(workerNameFromWorkersDevUrl(status.targetUrl) === undefined
        ? {}
        : { workerName: workerNameFromWorkersDevUrl(status.targetUrl) }),
      migrationPolicy: "existing",
      workersDevUrl: status.targetUrl,
    },
  };
}

function withArchiveSource(
  manifest: FormlessInstanceWorkspaceManifest,
  archive: PortableArchive,
  archiveSourcePath: string,
): FormlessInstanceWorkspaceManifest {
  const apps = archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];

  return {
    ...manifest,
    archives: {
      ...manifest.archives,
      ...(archive.kind === INSTANCE_ARCHIVE_KIND ? { instance: archiveSourcePath } : {}),
    },
    apps: apps.map((app) =>
      appDeclarationFromArchive(
        app,
        archive.kind === APP_ARCHIVE_KIND
          ? archiveSourcePath
          : `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT}/${app.app.installId}`,
      ),
    ),
    defaultAppPolicy: "declared-installs",
  };
}

function appDeclarationFromInstall(install: AppInstall): FormlessInstanceWorkspaceApp {
  return {
    installId: install.installId,
    packageAppKey: install.packageAppKey,
    label: install.label,
    archivePath: `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT}/${install.installId}`,
    routes: {
      admin: install.adminRoute,
      schema: install.schemaRoute,
      ...(install.publicRoute === undefined ? {} : { public: install.publicRoute }),
    },
  };
}

function appDeclarationFromArchive(
  archive: AppArchive,
  archivePath: string,
): FormlessInstanceWorkspaceApp {
  const installId = archive.app.installId;

  return {
    installId,
    packageAppKey: archive.app.packageAppKey,
    label: archive.app.label,
    archivePath,
    routes: {
      admin: `/apps/${installId}`,
      schema: `/apps/${installId}/schema`,
      ...(archive.app.packageAppKey === "site" ? { public: `/sites/${installId}` } : {}),
    },
  };
}

async function readWorkspaceArchive(archiveDir: string): Promise<PortableArchive> {
  return parsePortableArchive(
    JSON.parse(
      await readFile(path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
    ) as unknown,
  );
}

async function readWorkspaceManifest(workspaceRoot: string): Promise<{
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
}> {
  const manifestPath = workspaceManifestPath(workspaceRoot);

  return {
    manifest: parseFormlessInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8")),
    manifestPath,
  };
}

async function assertNoExistingManifest(manifestPath: string) {
  try {
    await readFile(manifestPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  throw new Error(`Formless instance workspace already exists at ${manifestPath}.`);
}

async function prepareWorkspaceDirectories(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
) {
  await Promise.all([
    mkdir(path.join(workspaceRoot, manifest.archives.instance), { recursive: true }),
    mkdir(path.join(workspaceRoot, manifest.archives.apps), { recursive: true }),
    mkdir(path.join(workspaceRoot, manifest.local.stateRoot), { recursive: true }),
  ]);
}

function archiveApps(archive: PortableArchive): AppArchive[] {
  return archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];
}

function appRecordCount(app: AppArchive): number {
  return app.data.kind === "storeSnapshot"
    ? app.data.snapshot.records.length
    : app.data.records.length;
}

function requireWorkspaceTarget(
  manifest: FormlessInstanceWorkspaceManifest,
  targetAlias: string | null | undefined,
  commandName: "check" | "pull" | "push",
): FormlessInstanceWorkspaceTarget {
  const target = selectWorkspaceTarget(manifest, targetAlias);

  if (!target) {
    throw new Error(`Formless instance ${commandName} requires a workspace target.`);
  }

  return target;
}

async function readWorkspaceAppArchivesForPush(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): Promise<WorkspaceArchiveDirectory[]> {
  const archives: WorkspaceArchiveDirectory[] = [];

  for (const app of manifest.apps) {
    const archiveRoot = path.join(workspaceRoot, app.archivePath);
    const archive = await readArchiveDirectoryForCheck(archiveRoot);

    if (!archive) {
      throw new Error(`Formless instance push requires local app archive ${app.archivePath}.`);
    }

    if (archive.archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error(`Formless instance push requires ${app.archivePath} to be an app archive.`);
    }

    if (archive.archive.app.installId !== app.installId) {
      throw new Error(
        `Formless instance push app archive ${app.archivePath} has install id "${archive.archive.app.installId}", expected "${app.installId}".`,
      );
    }

    if (archive.archive.app.packageAppKey !== app.packageAppKey) {
      throw new Error(
        `Formless instance push app archive ${app.archivePath} has package "${archive.archive.app.packageAppKey}", expected "${app.packageAppKey}".`,
      );
    }

    archives.push(archive);
  }

  return archives.sort((left, right) => {
    const leftInstall = left.archive.kind === APP_ARCHIVE_KIND ? left.archive.app.installId : "";
    const rightInstall = right.archive.kind === APP_ARCHIVE_KIND ? right.archive.app.installId : "";

    return leftInstall.localeCompare(rightInstall);
  });
}

async function writeComposedWorkspacePushArchive(input: {
  archives: readonly WorkspaceArchiveDirectory[];
  archiveRoot: string;
  exportedAt: string;
}): Promise<PushFormlessInstanceWorkspaceSource> {
  const appArchives = input.archives.map((archive) => {
    if (archive.archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error("Formless instance push can compose only app archives.");
    }

    return archive.archive;
  });
  const instanceArchive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: ["installed-app-registry", "app-store-snapshots", "app-scoped-media"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    apps: appArchives,
  };
  const archivePath = path.join(input.archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE);

  await mkdir(input.archiveRoot, { recursive: true });
  await writeFile(archivePath, formatInstanceArchive(instanceArchive));

  for (const directory of input.archives) {
    for (const file of directory.mediaFiles) {
      const filePath = path.join(input.archiveRoot, file.archivePath);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.bytes);
    }
  }

  return {
    appCount: appArchives.length,
    archivePath,
    mediaCount: appArchives.reduce((count, app) => count + app.media.objects.length, 0),
    recordCount: appArchives.reduce((count, app) => count + appRecordCount(app), 0),
  };
}

function workspacePushBackupPath(workspaceRoot: string, timestamp: string): string {
  return path.join(workspaceRoot, ".formless/backups", `push-${safeTimestamp(timestamp)}`);
}

function safeTimestamp(timestamp: string): string {
  return timestamp.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
}

async function createWorkspaceTempRoot(workspaceRoot: string, name: string): Promise<string> {
  const tempParent = path.join(workspaceRoot, ".formless");

  await mkdir(tempParent, { recursive: true });

  return mkdtemp(path.join(tempParent, `${name}-`));
}

function workspaceAppArchivePath(
  manifest: FormlessInstanceWorkspaceManifest,
  installId: string,
): string {
  return (
    manifest.apps.find((app) => app.installId === installId)?.archivePath ??
    `${manifest.archives.apps}/${installId}`
  );
}

function selectWorkspaceTarget(
  manifest: FormlessInstanceWorkspaceManifest,
  targetAlias: string | null | undefined,
): FormlessInstanceWorkspaceTarget | undefined {
  const alias = targetAlias ?? manifest.defaultTarget;

  if (!alias) {
    if (manifest.targets.length === 0) {
      return undefined;
    }

    throw new Error("Formless instance workspace target alias is required.");
  }

  const target = manifest.targets.find((candidate) => candidate.alias === alias);

  if (!target) {
    throw new Error(`Formless instance workspace target "${alias}" was not found.`);
  }

  return target;
}

function selectWorkspaceWorkerName(
  manifest: FormlessInstanceWorkspaceManifest,
  target: FormlessInstanceWorkspaceTarget | undefined,
): string {
  const workerName = manifest.deploy?.workerName ?? workerNameFromWorkersDevUrl(target?.url);

  if (!workerName) {
    throw new Error(
      "Formless instance token rotate requires deploy.workerName or a workers.dev target URL.",
    );
  }

  return workerName;
}

function workspaceSecretStateLabel(
  secretState: FormlessInstanceWorkspaceSecretState,
  env: NodeJS.ProcessEnv | undefined,
): FormlessInstanceWorkspaceStatusResult["secretState"] {
  if (resolveFormlessInstanceWorkspaceAdminToken({ env, secretState: {} })) {
    return "env";
  }

  return secretState.adminToken ? "stored" : "missing";
}

function rotateCommandEnv(
  env: NodeJS.ProcessEnv | undefined,
  manifest: FormlessInstanceWorkspaceManifest,
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(manifest.deploy?.accountId === undefined
      ? {}
      : { CLOUDFLARE_ACCOUNT_ID: manifest.deploy.accountId }),
  };
}

function requiredGeneratedToken(value: string): string {
  const token = value.trim();

  if (token === "") {
    throw new Error("Generated Formless admin token must be a non-empty string.");
  }

  return token;
}

function missingAdminTokenMessage(action: "adopt"): string {
  return [
    `Formless instance token ${action} requires an admin token.`,
    `Cloudflare Worker secrets cannot be read back; pass --admin-token or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`,
  ].join(" ");
}

function workspaceRootForInput(cwd: string, workspacePath = "."): string {
  return path.resolve(cwd, workspacePath);
}

function workspaceManifestPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);
}

function defaultWorkspaceName(workspaceRoot: string): string {
  const basename = path.basename(workspaceRoot);
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "formless-instance";
}

function relativeWorkspacePath(workspaceRoot: string, filePath: string): string {
  const relativePath = path.relative(workspaceRoot, filePath).split(path.sep).join("/");

  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Workspace archive path must be inside ${workspaceRoot}.`);
  }

  return relativePath;
}

function workerNameFromWorkersDevUrl(targetUrl: string | undefined): string | undefined {
  if (!targetUrl) {
    return undefined;
  }

  const host = new URL(normalizeFormlessInstanceWorkspaceTargetUrl(targetUrl)).hostname;
  const suffix = ".workers.dev";

  if (!host.endsWith(suffix)) {
    return undefined;
  }

  const withoutSuffix = host.slice(0, -suffix.length);
  const [workerName] = withoutSuffix.split(".");

  return workerName || undefined;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
