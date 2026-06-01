import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  type AppArchive,
  type InstanceArchive,
  type InstanceArchiveControlPlane,
  type PortableArchive,
} from "../shared/archive.ts";
import { normalizePortableArchive } from "../shared/archive-normalizers.ts";
import {
  packageAppFactsForKey,
  type AppInstall,
  type PackageAppKey,
} from "../shared/app-installs.ts";
import {
  normalizeInstanceDomainHost,
  type InstanceDomainMapping,
} from "../shared/instance-domain-mappings.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  instanceControlPlaneAppInstallRecord,
  instanceControlPlaneAppRouteId,
  type InstanceControlPlaneAppRouteCapability,
  type InstanceControlPlaneAppRouteKind,
  type InstanceControlPlaneAppRouteSurface,
} from "../shared/instance-control-plane.ts";
import type { AppInstallsResponse, RecordValues, StoredRecord } from "../shared/protocol.ts";
import {
  CF_API_TOKEN_ENV_NAME,
  CLOUDFLARE_API_TOKEN_ENV_NAME,
  applyCloudflareWorkerDomainPreflightPlan,
  planCloudflareWorkerDomainPreflight,
  type CloudflareDomainApplyResult,
  type CloudflareDomainClient,
  type CloudflareDomainIntent,
  type CloudflareDomainPreflightPlan,
  type CloudflareDomainPreflightPolicy,
} from "./cloudflare-domain-client.ts";
import {
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  LEGACY_FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILES,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
  normalizeFormlessInstanceWorkspaceTargetUrl,
  parseFormlessInstanceWorkspaceManifestJson,
  type FormlessInstanceWorkspaceApp,
  type FormlessInstanceWorkspaceDefaultAppPolicy,
  type FormlessInstanceWorkspaceDomainIntent,
  type FormlessInstanceWorkspaceManifest,
  type FormlessInstanceWorkspaceMigrationPolicy,
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
  recordFormlessInstanceDomainMappingApplyEvidence,
  readFormlessInstanceDomainMappings,
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
import {
  planFormlessInstanceDeployment,
  type CheckFormlessInstanceDeployMetadataResult,
  type DeployFormlessInstanceResult,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceDeploymentPlan,
  type FormlessInstanceLocalSecretEnvStore,
  type EnsureFormlessInstanceLocalSecretEnvResult,
} from "./instance-onboarding.ts";
import { packageExecCommand } from "./package-commands.ts";
import { SITE_PROJECT_CONFIG_FILE, SITE_PROJECT_RECORDS_FILE } from "./project-config.ts";

export type InitFormlessInstanceWorkspaceInput = {
  defaultAppPolicy?: FormlessInstanceWorkspaceDefaultAppPolicy;
  fromArchive?: string | null;
  fromRemote?: boolean;
  name?: string | null;
  targetAlias?: string;
  targetUrl?: string | null;
  workspacePath?: string;
};

export type InitLocalFormlessWorkspaceOnboardingInput = {
  name?: string | null;
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

export type FormlessInstanceWorkspaceDiscoveryResult = {
  manifestPath: string;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceStatusInput = {
  includeDeploymentStatus?: boolean;
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
  domains: FormlessInstanceWorkspaceDomainIntent[];
  instanceArchive: ArchiveDiskWriteResult;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type CheckFormlessInstanceWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type CheckLocalFormlessWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string | null;
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
  changedControlPlaneRecords: string[];
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  changedMedia: string[];
  changedRecords: string[];
  extraInstalls: string[];
  localDomainCount: number;
  localAppCount: number;
  localControlPlaneRecordCount: number;
  localMediaCount: number;
  localProviderDriftReportCount: number;
  localRecordCount: number;
  missingInstalls: string[];
  packageMismatches: FormlessInstanceWorkspacePackageMismatch[];
  remoteDomainCount: number;
  remoteAppCount: number;
  remoteControlPlaneRecordCount: number;
  remoteMediaCount: number;
  remoteProviderDriftReportCount: number;
  remoteRecordCount: number;
  status: "drift" | "no-drift";
};

export type CheckFormlessInstanceWorkspaceResult = {
  drift: FormlessInstanceWorkspaceDriftSummary;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type CheckLocalFormlessWorkspaceResult =
  | {
      manifest: FormlessInstanceWorkspaceManifest;
      manifestPath: string;
      mode: "local";
      workspaceRoot: string;
    }
  | {
      mode: "remote";
      remote: CheckFormlessInstanceWorkspaceResult;
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

export type FormlessInstanceWorkspaceDevCommand = {
  args: string[];
  command: string;
  label: string;
};

export type DevFormlessInstanceWorkspaceInput = {
  workspacePath?: string;
};

export type DevFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  devCommand: FormlessInstanceWorkspaceDevCommand;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  log: (message: string) => void;
  now: () => string;
  packageRoot: string;
  spawn: typeof nodeSpawn;
};

export type ResetFormlessInstanceWorkspaceLocalStateInput = {
  workspacePath?: string;
};

export type ResetFormlessInstanceWorkspaceLocalStateDependencies = {
  cwd: string;
};

export type ResetFormlessInstanceWorkspaceLocalStateResult = {
  localStateRoot: string;
  manifestPath: string;
  workspaceRoot: string;
};

export type DeployFormlessInstanceWorkspaceInput = {
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type DeployFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  env?: NodeJS.ProcessEnv;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  packageRoot: string;
  packageVersion: string;
  randomToken: () => string;
};

export type DeployFormlessInstanceWorkspaceResult = {
  deployment: DeployFormlessInstanceResult;
  deploymentStateRoot: string;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  migrationPolicy: FormlessInstanceWorkspaceMigrationPolicy;
  plan: FormlessInstanceDeploymentPlan;
  secretPath: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type PlanFormlessInstanceWorkspaceDomainsInput = {
  host?: string | null;
  policy?: CloudflareDomainPreflightPolicy;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PlanFormlessInstanceWorkspaceDomainsDependencies = {
  cloudflareDomainClient: CloudflareDomainClient;
  cwd: string;
  fetch: typeof fetch;
};

export type FormlessInstanceWorkspaceDomainDesiredDrift = {
  host: string;
  live?: FormlessInstanceWorkspaceDomainIntent;
  local?: FormlessInstanceWorkspaceDomainIntent;
  status: "local-only" | "live-only" | "mismatch";
};

export type PlanFormlessInstanceWorkspaceDomainsResult = {
  accountId: string;
  desired: {
    drift: FormlessInstanceWorkspaceDomainDesiredDrift[];
    liveEnabledCount: number;
    source: "live" | "workspace";
    workspaceCount: number;
  };
  preflight: CloudflareDomainPreflightPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workerName: string;
  workspaceRoot: string;
};

export type ApplyFormlessInstanceWorkspaceDomainsInput =
  PlanFormlessInstanceWorkspaceDomainsInput & {
    adminToken?: string | null;
  };

export type ApplyFormlessInstanceWorkspaceDomainsDependencies =
  PlanFormlessInstanceWorkspaceDomainsDependencies & {
    env?: NodeJS.ProcessEnv;
    now: () => string;
  };

export type ApplyFormlessInstanceWorkspaceDomainsResult =
  PlanFormlessInstanceWorkspaceDomainsResult & {
    applied: CloudflareDomainApplyResult;
    evidenceCount: number;
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

  await assertNoExistingWorkspaceManifest(workspaceRoot);
  await mkdir(workspaceRoot, { recursive: true });

  const name = input.name ?? defaultWorkspaceName(workspaceRoot);
  const targetUrl =
    input.targetUrl === undefined || input.targetUrl === null
      ? null
      : normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const targetAlias = input.targetAlias ?? "remote";
  let manifest = {
    ...defaultFormlessInstanceWorkspaceManifest({ name, targetUrl }),
    ...(input.defaultAppPolicy === undefined ? {} : { defaultAppPolicy: input.defaultAppPolicy }),
  };
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

export async function initLocalFormlessWorkspaceOnboarding(
  input: InitLocalFormlessWorkspaceOnboardingInput,
  dependencies: InitFormlessInstanceWorkspaceDependencies,
): Promise<InitFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);

  await assertLocalOnboardingWorkspaceReady(workspaceRoot);

  return initFormlessInstanceWorkspace(
    {
      defaultAppPolicy: "none",
      name: input.name,
      targetUrl: null,
      workspacePath: input.workspacePath,
    },
    dependencies,
  );
}

export async function discoverFormlessInstanceWorkspaceRoot(
  cwd: string,
): Promise<FormlessInstanceWorkspaceDiscoveryResult> {
  let directory = path.resolve(cwd);

  while (true) {
    await assertNoLegacyWorkspaceManifest(directory);

    const manifestPath = workspaceManifestPath(directory);

    if (await pathExists(manifestPath)) {
      return {
        manifestPath,
        workspaceRoot: directory,
      };
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(
        `Could not find ${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} from ${path.resolve(cwd)}.`,
      );
    }

    directory = parent;
  }
}

export async function resolveFormlessInstanceWorkspaceRoot(input: {
  cwd: string;
  workspacePath?: string | null;
}): Promise<string> {
  if (input.workspacePath === undefined || input.workspacePath === null) {
    return (await discoverFormlessInstanceWorkspaceRoot(input.cwd)).workspaceRoot;
  }

  const workspaceRoot = workspaceRootForInput(input.cwd, input.workspacePath);

  await assertNoLegacyWorkspaceManifest(workspaceRoot);
  return workspaceRoot;
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
    ? await readFormlessInstanceTargetStatus(
        {
          includeDeploymentStatus: input.includeDeploymentStatus,
          targetUrl: selectedTarget.url,
        },
        dependencies,
      )
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
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
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

  const domains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
  await writeFile(
    manifestPath,
    formatFormlessInstanceWorkspaceManifest(withWorkspaceDomainIntents(manifest, domains)),
  );

  return {
    appArchives: appArchives.sort((left, right) => left.installId.localeCompare(right.installId)),
    domains,
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

    const liveDomains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
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

    const localControlPlane = workspaceControlPlaneArchive({
      exportedAt: dependencies.now(),
      localAppArchives,
      localInstanceArchive,
      manifest,
    });

    return {
      drift: compareWorkspaceArchives({
        domainDesiredDrift: compareWorkspaceDomainIntentToLive(manifest.domains ?? [], liveDomains),
        localControlPlane,
        localDomainCount: manifest.domains?.length ?? 0,
        localAppArchives,
        localInstanceArchive,
        manifest,
        remoteDomainCount: liveDomains.length,
        remoteArchive,
      }),
      selectedTarget,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function checkLocalFormlessWorkspace(
  input: CheckLocalFormlessWorkspaceInput,
  dependencies: CheckFormlessInstanceWorkspaceDependencies,
): Promise<CheckLocalFormlessWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = selectWorkspaceTarget(manifest, input.targetAlias);

  if (!selectedTarget) {
    return {
      manifest,
      manifestPath,
      mode: "local",
      workspaceRoot,
    };
  }

  return {
    mode: "remote",
    remote: await checkFormlessInstanceWorkspace(
      {
        targetAlias: input.targetAlias,
        workspacePath: workspaceRoot,
      },
      dependencies,
    ),
  };
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

    const liveDomains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
    const localAppArchives = await readWorkspaceAppArchivesForPush(workspaceRoot, manifest);
    const localInstanceArchive = await readArchiveDirectoryForCheck(
      path.join(workspaceRoot, manifest.archives.instance),
    );
    const exportedAt = dependencies.now();
    const localControlPlane = workspaceControlPlaneArchive({
      exportedAt,
      localAppArchives: new Map(
        localAppArchives.map((archive) => [
          archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive.app.installId : "",
          archive,
        ]),
      ),
      localInstanceArchive,
      manifest,
    });
    const source = await writeComposedWorkspacePushArchive({
      archives: localAppArchives,
      archiveRoot: composedArchiveRoot,
      controlPlane: localControlPlane,
      exportedAt,
    });
    const drift = compareWorkspaceArchives({
      domainDesiredDrift: compareWorkspaceDomainIntentToLive(manifest.domains ?? [], liveDomains),
      localControlPlane,
      localDomainCount: manifest.domains?.length ?? 0,
      localAppArchives: new Map(
        localAppArchives.map((archive) => [
          archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive.app.installId : "",
          archive,
        ]),
      ),
      localInstanceArchive,
      manifest,
      remoteDomainCount: liveDomains.length,
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
        includeUpgradePlanning: !input.apply,
        replace: input.replace ?? false,
        target: selectedTarget.url,
        upgradeTarget: {
          label: selectedTarget.alias,
          targetUrl: selectedTarget.url,
        },
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

export async function runFormlessInstanceWorkspaceDev(
  input: DevFormlessInstanceWorkspaceInput,
  dependencies: DevFormlessInstanceWorkspaceDependencies,
): Promise<void> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const localStateRoot = formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest);
  const candidateOrigins = new Set(defaultDevSourceCandidates(dependencies.env));

  await prepareWorkspaceDirectories(workspaceRoot, manifest);

  const child = dependencies.spawn(dependencies.devCommand.command, dependencies.devCommand.args, {
    cwd: dependencies.packageRoot,
    env: formlessInstanceWorkspaceDevEnv(dependencies.env ?? {}, workspaceRoot, manifest),
    stdio: "pipe",
  });

  forwardDevOutput(child, dependencies.log, candidateOrigins);

  try {
    const source = await waitForInstanceDevServer(child, dependencies.fetch, candidateOrigins);
    const bootstrap = await bootstrapWorkspaceLocalInstance(
      {
        manifest,
        source,
        workspaceRoot,
      },
      dependencies,
    );

    dependencies.log(`Instance shell: ${source}/`);
    dependencies.log(`Local state: ${relativeDependencyPath(dependencies.cwd, localStateRoot)}.`);

    if (bootstrap.status === "restored") {
      dependencies.log(
        `Workspace archive restored: ${bootstrap.sourceKind} (${bootstrap.appCount} apps, ${bootstrap.recordCount} records, ${bootstrap.mediaCount} media).`,
      );
    } else if (bootstrap.status === "existing") {
      dependencies.log(
        `Workspace archive restore skipped: local installs already exist (${bootstrap.installIds.join(", ") || "none"}).`,
      );
    } else {
      dependencies.log("Workspace archive restore skipped: no workspace archives declared.");
    }

    await waitForChildExit(child);
  } catch (error) {
    child.kill();
    throw error;
  }
}

export async function resetFormlessInstanceWorkspaceLocalState(
  input: ResetFormlessInstanceWorkspaceLocalStateInput,
  dependencies: ResetFormlessInstanceWorkspaceLocalStateDependencies,
): Promise<ResetFormlessInstanceWorkspaceLocalStateResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const localStateRoot = formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest);

  await rm(localStateRoot, { force: true, recursive: true });
  await mkdir(localStateRoot, { recursive: true });

  return {
    localStateRoot,
    manifestPath,
    workspaceRoot,
  };
}

export async function deployFormlessInstanceWorkspace(
  input: DeployFormlessInstanceWorkspaceInput,
  dependencies: DeployFormlessInstanceWorkspaceDependencies,
): Promise<DeployFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = requireWorkspaceTarget(manifest, input.targetAlias, "deploy");
  const plan = formlessInstanceWorkspaceDeploymentPlan({
    manifest,
    migrationPolicy: input.migrationPolicy,
    packageVersion: dependencies.packageVersion,
    selectedTarget,
  });
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });

  if (!adminToken) {
    throw new Error(missingAdminTokenMessage("deploy"));
  }

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, plan);
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: deploymentStateRoot,
  });
  const deployment = await dependencies.deploymentAdapter.deploy({
    credentialProfile: null,
    packageRoot: dependencies.packageRoot,
    plan,
    secrets: {
      ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
      ...optionalCloudflareApiTokenSecret(dependencies.env),
      FORMLESS_ADMIN_TOKEN: adminToken,
    },
    stateRoot: deploymentStateRoot,
  });
  const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deployment.url);

  if (deploymentUrl !== plan.expectedUrl.url) {
    throw new Error(
      `Formless instance deploy returned ${deploymentUrl}, expected claimed target ${plan.expectedUrl.url}.`,
    );
  }

  const healthCheck = await dependencies.healthCheck.check({
    expectedVersion: plan.packageVersion,
    url: deploymentUrl,
  });

  return {
    deployment: {
      url: deploymentUrl,
    },
    deploymentStateRoot,
    healthCheck,
    localSecretEnv,
    migrationPolicy: plan.migrationPolicy,
    plan,
    secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
    selectedTarget,
    workspaceRoot,
  };
}

export async function planFormlessInstanceWorkspaceDomains(
  input: PlanFormlessInstanceWorkspaceDomainsInput,
  dependencies: PlanFormlessInstanceWorkspaceDomainsDependencies,
): Promise<PlanFormlessInstanceWorkspaceDomainsResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = requireWorkspaceTarget(manifest, input.targetAlias, "domains plan");
  const accountId = requireWorkspaceDeployAccountId(manifest);
  const workerName = selectWorkspaceWorkerName(manifest, selectedTarget, "domains plan");
  const workspaceDomains = manifest.domains ?? [];
  const liveDomains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
  const source = workspaceDomains.length > 0 ? "workspace" : "live";
  const enabledSourceDomains = (source === "workspace" ? workspaceDomains : liveDomains).filter(
    (domain) => domain.enabled,
  );
  const intents = selectDomainIntentsForHost({
    host: input.host,
    intents: enabledSourceDomains,
  });
  const preflight = await planCloudflareWorkerDomainPreflight({
    accountId,
    client: dependencies.cloudflareDomainClient,
    intents,
    policy: input.policy ?? "create-only",
    workerName,
  });

  return {
    accountId,
    desired: {
      drift:
        workspaceDomains.length === 0
          ? []
          : compareWorkspaceDomainIntentToLive(workspaceDomains, liveDomains),
      liveEnabledCount: liveDomains.filter((domain) => domain.enabled).length,
      source,
      workspaceCount: workspaceDomains.length,
    },
    preflight,
    selectedTarget,
    workerName,
    workspaceRoot,
  };
}

export async function applyFormlessInstanceWorkspaceDomains(
  input: ApplyFormlessInstanceWorkspaceDomainsInput,
  dependencies: ApplyFormlessInstanceWorkspaceDomainsDependencies,
): Promise<ApplyFormlessInstanceWorkspaceDomainsResult> {
  if ((input.policy ?? "create-only") === "override" && !input.host?.trim()) {
    throw new Error("Formless instance domains apply override requires a single host.");
  }

  const planned = await planFormlessInstanceWorkspaceDomains(input, dependencies);

  if (planned.desired.drift.length > 0) {
    throw new Error(
      "Formless instance domains apply refused because workspace and live desired mappings differ; run `formless instance domains plan` and reconcile desired mappings before applying provider state.",
    );
  }

  const blockedHosts = planned.preflight.hosts.filter((host) => host.blockers.length > 0);

  if (blockedHosts.length > 0) {
    throw new Error(
      `Formless instance domains apply stopped because preflight found blockers: ${blockedHosts
        .map(
          (host) =>
            `${host.host} (${host.blockers.map((issue) => issue.code).join(", ") || "blocked"})`,
        )
        .join("; ")}.`,
    );
  }

  const applied = await applyCloudflareWorkerDomainPreflightPlan({
    client: dependencies.cloudflareDomainClient,
    plan: planned.preflight,
  });
  const secretState = await readFormlessInstanceWorkspaceSecretState(planned.workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.adminToken,
    secretState,
  });

  for (const host of applied.hosts) {
    await recordFormlessInstanceDomainMappingApplyEvidence(
      {
        adminToken,
        evidence: {
          host: host.host,
          profile: host.profile,
          ...(host.targetInstallId === undefined ? {} : { targetInstallId: host.targetInstallId }),
          provider: "cloudflare-worker-custom-domain",
          accountId: planned.accountId,
          zoneId: host.domain.zoneId,
          zoneName: host.domain.zoneName,
          workerName: planned.workerName,
          workerDomainId: host.domain.id,
          action: host.action,
        },
        targetUrl: planned.selectedTarget.url,
      },
      dependencies,
    );
  }

  return {
    ...planned,
    applied,
    evidenceCount: applied.hosts.length,
  };
}

export function formlessInstanceWorkspaceLocalStateRoot(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  return path.resolve(workspaceRoot, manifest.local.stateRoot);
}

export function formlessInstanceWorkspaceWranglerPersistPath(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  return path.join(formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest), "wrangler");
}

export function formlessInstanceWorkspaceDevEnv(
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    FORMLESS_LAUNCH_FIXTURE: "empty",
    FORMLESS_RUNTIME_PROFILE: "instance",
    FORMLESS_WRANGLER_PERSIST: formlessInstanceWorkspaceWranglerPersistPath(
      workspaceRoot,
      manifest,
    ),
    VITE_FORMLESS_RUNTIME_PROFILE: "instance",
  };

  delete nextEnv.FORMLESS_ADMIN_TOKEN;
  delete nextEnv.FORMLESS_SITE_PROJECT_ID;
  delete nextEnv.FORMLESS_SITE_PROJECT_ROOT;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL;
  delete nextEnv.VITE_FORMLESS_SITE_PROJECT_ID;

  return nextEnv;
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

type WorkspaceLocalBootstrapResult =
  | {
      appCount: number;
      mediaCount: number;
      recordCount: number;
      sourceKind: "app archives" | "instance archive";
      status: "restored";
    }
  | {
      status: "empty";
    }
  | {
      installIds: string[];
      status: "existing";
    };

type WorkspaceLocalRestoreArchiveSource = {
  appCount: number;
  archiveRoot: string;
  mediaCount: number;
  recordCount: number;
  sourceKind: "app archives" | "instance archive";
};

async function bootstrapWorkspaceLocalInstance(
  input: {
    manifest: FormlessInstanceWorkspaceManifest;
    source: string;
    workspaceRoot: string;
  },
  dependencies: Pick<DevFormlessInstanceWorkspaceDependencies, "cwd" | "env" | "fetch" | "now">,
): Promise<WorkspaceLocalBootstrapResult> {
  const registry = await fetchWorkspaceJson<AppInstallsResponse>(
    dependencies.fetch,
    instanceAppInstallsUrl(input.source),
  );
  const installIds = registry.installs
    .map((install) => install.installId)
    .sort((left, right) => left.localeCompare(right));

  if (installIds.length > 0) {
    return {
      installIds,
      status: "existing",
    };
  }

  const tempRoot = await createWorkspaceTempRoot(input.workspaceRoot, "local-dev");

  try {
    const sourceArchive = await workspaceLocalRestoreArchiveSource({
      exportedAt: dependencies.now(),
      manifest: input.manifest,
      tempRoot,
      workspaceRoot: input.workspaceRoot,
    });

    if (!sourceArchive) {
      return { status: "empty" };
    }

    const restore = await restorePortableArchive(
      {
        adminToken: null,
        apply: true,
        archiveDir: sourceArchive.archiveRoot,
        replace: false,
        target: input.source,
      },
      {
        cwd: dependencies.cwd,
        env: withoutAdminToken(dependencies.env),
        fetch: dependencies.fetch,
        now: dependencies.now,
      },
    );

    if (!restore.remote.ok) {
      throw new Error(
        `Formless instance local dev archive restore failed: ${restoreErrors(restore)}.`,
      );
    }

    return {
      appCount: sourceArchive.appCount,
      mediaCount: sourceArchive.mediaCount,
      recordCount: sourceArchive.recordCount,
      sourceKind: sourceArchive.sourceKind,
      status: "restored",
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function workspaceLocalRestoreArchiveSource(input: {
  exportedAt: string;
  manifest: FormlessInstanceWorkspaceManifest;
  tempRoot: string;
  workspaceRoot: string;
}): Promise<WorkspaceLocalRestoreArchiveSource | undefined> {
  const appArchives = await readCompleteWorkspaceAppArchives(input.workspaceRoot, input.manifest);

  if (appArchives) {
    const localInstanceArchive = await readArchiveDirectoryForCheck(
      path.join(input.workspaceRoot, input.manifest.archives.instance),
    );
    const write = await writeComposedWorkspacePushArchive({
      archiveRoot: path.join(input.tempRoot, "archive"),
      archives: appArchives,
      controlPlane: workspaceControlPlaneArchive({
        exportedAt: input.exportedAt,
        localAppArchives: new Map(
          appArchives.map((archive) => [
            archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive.app.installId : "",
            archive,
          ]),
        ),
        localInstanceArchive,
        manifest: input.manifest,
      }),
      exportedAt: input.exportedAt,
    });

    return {
      appCount: write.appCount,
      archiveRoot: path.dirname(write.archivePath),
      mediaCount: write.mediaCount,
      recordCount: write.recordCount,
      sourceKind: "app archives",
    };
  }

  const instanceArchiveRoot = path.join(input.workspaceRoot, input.manifest.archives.instance);
  const instanceArchive = await readArchiveDirectoryForCheck(instanceArchiveRoot);

  if (!instanceArchive) {
    if (input.manifest.apps.length === 0) {
      return undefined;
    }

    throw new Error(
      "Formless instance local dev requires workspace archives. Run `formless instance pull` first or add declared app archives.",
    );
  }

  if (instanceArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error(
      `Formless instance local dev requires ${input.manifest.archives.instance} to be an instance archive.`,
    );
  }

  return {
    appCount: instanceArchive.archive.apps.length,
    archiveRoot: instanceArchiveRoot,
    mediaCount: instanceArchive.archive.apps.reduce(
      (count, app) => count + app.media.objects.length,
      0,
    ),
    recordCount: instanceArchive.archive.apps.reduce(
      (count, app) => count + appRecordCount(app),
      0,
    ),
    sourceKind: "instance archive",
  };
}

async function readCompleteWorkspaceAppArchives(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): Promise<WorkspaceArchiveDirectory[] | undefined> {
  if (manifest.apps.length === 0) {
    return undefined;
  }

  const archives: WorkspaceArchiveDirectory[] = [];

  for (const app of manifest.apps) {
    const archive = await readArchiveDirectoryForCheck(path.join(workspaceRoot, app.archivePath));

    if (!archive) {
      return undefined;
    }

    if (archive.archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error(
        `Formless instance local dev requires ${app.archivePath} to be an app archive.`,
      );
    }

    if (archive.archive.app.installId !== app.installId) {
      throw new Error(
        `Formless instance local dev app archive ${app.archivePath} has install id "${archive.archive.app.installId}", expected "${app.installId}".`,
      );
    }

    if (archive.archive.app.packageAppKey !== app.packageAppKey) {
      throw new Error(
        `Formless instance local dev app archive ${app.archivePath} has package "${archive.archive.app.packageAppKey}", expected "${app.packageAppKey}".`,
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

  const archive = normalizePortableArchive(JSON.parse(contents) as unknown).archive;
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
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  localControlPlane: InstanceArchiveControlPlane | undefined;
  localDomainCount: number;
  localAppArchives: ReadonlyMap<string, WorkspaceArchiveDirectory>;
  localInstanceArchive: WorkspaceArchiveDirectory | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  remoteDomainCount: number;
  remoteArchive: WorkspaceArchiveDirectory;
}): FormlessInstanceWorkspaceDriftSummary {
  const remoteApps = archiveApps(input.remoteArchive.archive);
  const remoteAppsByInstall = new Map(remoteApps.map((app) => [app.app.installId, app]));
  const manifestAppsByInstall = new Map(input.manifest.apps.map((app) => [app.installId, app]));
  const changedArchivePaths = new Set<string>();
  const changedControlPlaneRecords = new Set<string>();
  const changedMedia = new Set<string>();
  const changedRecords = new Set<string>();
  const packageMismatches: FormlessInstanceWorkspacePackageMismatch[] = [];
  const remoteControlPlane =
    input.remoteArchive.archive.kind === INSTANCE_ARCHIVE_KIND
      ? input.remoteArchive.archive.controlPlane
      : undefined;
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

  if (remoteControlPlane !== undefined) {
    for (const recordKey of changedControlPlaneIntentRecordKeys(
      input.localControlPlane,
      remoteControlPlane,
    )) {
      changedControlPlaneRecords.add(recordKey);
      changedArchivePaths.add(input.manifest.archives.instance);
    }
  }

  const localArchives = [...input.localAppArchives.values()]
    .map((archive) => (archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive : undefined))
    .filter((archive): archive is AppArchive => archive !== undefined);
  const hasDrift =
    changedArchivePaths.size > 0 ||
    changedControlPlaneRecords.size > 0 ||
    changedMedia.size > 0 ||
    changedRecords.size > 0 ||
    input.domainDesiredDrift.length > 0 ||
    extraInstalls.length > 0 ||
    missingInstalls.length > 0 ||
    packageMismatches.length > 0;

  return {
    changedArchivePaths: [...changedArchivePaths].sort((left, right) => left.localeCompare(right)),
    changedControlPlaneRecords: [...changedControlPlaneRecords].sort((left, right) =>
      left.localeCompare(right),
    ),
    domainDesiredDrift: input.domainDesiredDrift,
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    extraInstalls,
    localDomainCount: input.localDomainCount,
    localAppCount: input.manifest.apps.length,
    localControlPlaneRecordCount: input.localControlPlane?.records.length ?? 0,
    localMediaCount: localArchives.reduce((count, app) => count + app.media.objects.length, 0),
    localProviderDriftReportCount: controlPlaneRecordCount(
      input.localControlPlane,
      "deployDriftReport",
    ),
    localRecordCount: localArchives.reduce((count, app) => count + appRecordCount(app), 0),
    missingInstalls,
    packageMismatches: packageMismatches.sort((left, right) =>
      left.installId.localeCompare(right.installId),
    ),
    remoteDomainCount: input.remoteDomainCount,
    remoteAppCount: remoteApps.length,
    remoteControlPlaneRecordCount: remoteControlPlane?.records.length ?? 0,
    remoteMediaCount: remoteApps.reduce((count, app) => count + app.media.objects.length, 0),
    remoteProviderDriftReportCount: controlPlaneRecordCount(
      remoteControlPlane,
      "deployDriftReport",
    ),
    remoteRecordCount: remoteApps.reduce((count, app) => count + appRecordCount(app), 0),
    status: hasDrift ? "drift" : "no-drift",
  };
}

function changedControlPlaneIntentRecordKeys(
  local: InstanceArchiveControlPlane | undefined,
  remote: InstanceArchiveControlPlane,
): string[] {
  const localRecords = comparableControlPlaneIntentRecords(local);
  const remoteRecords = comparableControlPlaneIntentRecords(remote);
  const keys = new Set([...localRecords.keys(), ...remoteRecords.keys()]);
  const changed: string[] = [];

  for (const key of keys) {
    if (localRecords.get(key) !== remoteRecords.get(key)) {
      changed.push(key);
    }
  }

  return changed.sort((left, right) => left.localeCompare(right));
}

function comparableControlPlaneIntentRecords(
  controlPlane: InstanceArchiveControlPlane | undefined,
): Map<string, string> {
  const records = new Map<string, string>();

  for (const record of controlPlane?.records ?? []) {
    if (record.deletedAt || !controlPlaneIntentEntities.has(record.entity)) {
      continue;
    }

    records.set(
      controlPlaneRecordKey(record),
      JSON.stringify(
        stableValue({
          entity: record.entity,
          id: record.id,
          values: comparableControlPlaneValues(record),
        }),
      ),
    );
  }

  return records;
}

function comparableControlPlaneValues(record: StoredRecord): RecordValues {
  const values = Object.fromEntries(
    Object.entries(record.values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  ) as RecordValues;

  if (record.entity === "appInstall" && typeof values.packageAppKey === "string") {
    const packageFacts = packageAppFactsForKey(values.packageAppKey);

    if (packageFacts) {
      values.packageRevision ??= packageFacts.packageRevision;
      values.sourceSchemaHash ??= packageFacts.sourceSchemaHash;
    }
  }

  return values;
}

function controlPlaneRecordKey(record: Pick<StoredRecord, "entity" | "id">) {
  return `${record.entity}:${record.id}`;
}

function controlPlaneRecordCount(
  controlPlane: InstanceArchiveControlPlane | undefined,
  entity: string,
) {
  return (
    controlPlane?.records.filter((record) => record.entity === entity && !record.deletedAt)
      .length ?? 0
  );
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

    if (nextArchive.controlPlane) {
      nextArchive.controlPlane.schemaUpdatedAt = generatedAt;
      nextArchive.controlPlane.records = nextArchive.controlPlane.records
        .filter((record) => !record.deletedAt && controlPlaneIntentEntities.has(record.entity))
        .map((record) => ({
          ...record,
          values: normalizeControlPlaneGeneratedValues(record.values, generatedAt),
          createdAt: generatedAt,
        }));
    }

    return nextArchive;
  }

  if (nextArchive.data.kind === "storeSnapshot") {
    nextArchive.data.snapshot.exportedAt = generatedAt;
  }

  return nextArchive;
}

function normalizeControlPlaneGeneratedValues(values: RecordValues, generatedAt: string) {
  return {
    ...values,
    ...(values.createdAt === undefined ? {} : { createdAt: generatedAt }),
    ...(values.updatedAt === undefined ? {} : { updatedAt: generatedAt }),
  };
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
      admin: install.adminRoute as `/apps/${string}`,
      schema: install.schemaRoute as `/apps/${string}/schema`,
      ...(install.publicRoute === undefined
        ? {}
        : { public: install.publicRoute as `/sites/${string}` }),
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
  return normalizePortableArchive(
    JSON.parse(
      await readFile(path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
    ) as unknown,
  ).archive;
}

async function readWorkspaceManifest(workspaceRoot: string): Promise<{
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
}> {
  const manifestPath = workspaceManifestPath(workspaceRoot);

  await assertNoLegacyWorkspaceManifest(workspaceRoot);

  return {
    manifest: parseFormlessInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8")),
    manifestPath,
  };
}

async function assertNoExistingWorkspaceManifest(workspaceRoot: string) {
  await assertNoLegacyWorkspaceManifest(workspaceRoot);

  const manifestPath = workspaceManifestPath(workspaceRoot);

  if (await pathExists(manifestPath)) {
    throw new Error(`Formless instance workspace already exists at ${manifestPath}.`);
  }
}

async function assertLocalOnboardingWorkspaceReady(workspaceRoot: string) {
  await assertNoExistingWorkspaceManifest(workspaceRoot);
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    SITE_PROJECT_CONFIG_FILE,
    "standalone Site project file",
    "Import or move the Site project before onboarding.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    SITE_PROJECT_RECORDS_FILE,
    "standalone Site project file",
    "Import or move the Site project before onboarding.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    PORTABLE_ARCHIVE_MANIFEST_FILE,
    "portable archive source",
    "Import or move existing archive source before onboarding.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
    "reviewable archive root",
    "Move existing archive source before onboarding.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    ".formless",
    "ignored .formless state",
    "Remove or move existing local state before onboarding.",
  );
}

async function assertNoLocalOnboardingConflict(
  workspaceRoot: string,
  relativePath: string,
  label: string,
  guidance: string,
) {
  const filePath = path.join(workspaceRoot, relativePath);

  if (await fileSystemPathExists(filePath)) {
    throw new Error(
      `formless onboard cannot initialize because ${label} exists at ${filePath}. ${guidance}`,
    );
  }
}

async function assertNoLegacyWorkspaceManifest(workspaceRoot: string) {
  for (const fileName of LEGACY_FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILES) {
    const manifestPath = path.join(workspaceRoot, fileName);

    if (await pathExists(manifestPath)) {
      throw new Error(
        `Legacy Formless workspace manifest found at ${manifestPath}. Local-first workspaces use ${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE}; create a new workspace with \`formless onboard\`.`,
      );
    }
  }
}

async function fileSystemPathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
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

const workspaceOwnedControlPlaneEntities = new Set([
  "appInstall",
  "appRoute",
  "deployTarget",
  "domainMapping",
  "providerConfigRef",
]);

const controlPlaneIntentEntities = new Set([
  "appInstall",
  "appRoute",
  "deployTarget",
  "providerConfigRef",
  "domainMapping",
  "redirectIntent",
  "deployDesiredResource",
]);

function workspaceControlPlaneArchive(input: {
  exportedAt: string;
  localAppArchives: ReadonlyMap<string, WorkspaceArchiveDirectory>;
  localInstanceArchive: WorkspaceArchiveDirectory | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
}): InstanceArchiveControlPlane | undefined {
  const existing =
    input.localInstanceArchive?.archive.kind === INSTANCE_ARCHIVE_KIND
      ? input.localInstanceArchive.archive.controlPlane
      : undefined;
  const records = new Map<string, StoredRecord>();

  for (const record of existing?.records ?? []) {
    if (!workspaceOwnedControlPlaneEntities.has(record.entity)) {
      records.set(record.id, record);
    }
  }

  for (const record of workspaceOwnedControlPlaneRecords(input)) {
    records.set(record.id, record);
  }

  if (records.size === 0) {
    return undefined;
  }

  return {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: existing?.schemaUpdatedAt ?? input.exportedAt,
    records: [...records.values()],
  };
}

function workspaceOwnedControlPlaneRecords(input: {
  exportedAt: string;
  localAppArchives: ReadonlyMap<string, WorkspaceArchiveDirectory>;
  manifest: FormlessInstanceWorkspaceManifest;
}): StoredRecord[] {
  const records: StoredRecord[] = [];
  const appRouteIds = new Set<string>();

  for (const app of input.manifest.apps) {
    const archive = appArchiveFromWorkspaceDirectory(input.localAppArchives.get(app.installId));
    const install = workspaceAppInstallFromDeclaration(app, archive, input.exportedAt);

    records.push(storedControlPlaneRecord(instanceControlPlaneAppInstallRecord(install)));

    for (const route of workspaceAppRouteRecords(app, install)) {
      records.push(route);
      appRouteIds.add(route.id);
    }
  }

  records.push(
    ...workspaceDomainControlPlaneRecords(input.manifest, {
      appInstallIds: new Set(input.manifest.apps.map((app) => app.installId)),
      appRouteIds,
      exportedAt: input.exportedAt,
    }),
    ...workspaceDeployControlPlaneRecords(input.manifest, input.exportedAt),
  );

  return records;
}

function workspaceAppInstallFromDeclaration(
  app: FormlessInstanceWorkspaceApp,
  archive: AppArchive | undefined,
  exportedAt: string,
): AppInstall {
  const packageAppKey = (archive?.app.packageAppKey ?? app.packageAppKey) as PackageAppKey;
  const packageFacts = archive?.app ?? packageAppFactsForKey(packageAppKey);
  const publicPath = app.routes?.public ?? `/sites/${app.installId}`;

  if (!packageFacts) {
    throw new Error(`Workspace app "${app.installId}" package "${packageAppKey}" is unsupported.`);
  }

  return {
    installId: app.installId,
    packageAppKey,
    packageRevision: packageFacts.packageRevision,
    sourceSchemaHash: packageFacts.sourceSchemaHash,
    label: archive?.app.label ?? app.label,
    status: archive?.app.status ?? "installed",
    createdAt: archive?.app.createdAt ?? exportedAt,
    updatedAt: archive?.app.updatedAt ?? exportedAt,
    adminRoute: app.routes?.admin ?? `/apps/${app.installId}`,
    schemaRoute: app.routes?.schema ?? `/apps/${app.installId}/schema`,
    ...(packageAppKey === "site" || app.routes?.public !== undefined
      ? {
          publicRoute: publicPath as `/${string}`,
          publicRoutePrefix: `${publicPath}/` as `/${string}/`,
        }
      : {}),
  };
}

function workspaceAppRouteRecords(
  app: FormlessInstanceWorkspaceApp,
  install: AppInstall,
): StoredRecord[] {
  const routes: Array<{
    kind: InstanceControlPlaneAppRouteKind;
    packageCapability: InstanceControlPlaneAppRouteCapability;
    path: `/${string}`;
    prefix?: `/${string}/`;
    surface: InstanceControlPlaneAppRouteSurface;
  }> = [
    {
      kind: "admin",
      packageCapability: "generatedApp",
      path: (app.routes?.admin ?? `/apps/${app.installId}`) as `/${string}`,
      surface: "admin",
    },
    {
      kind: "schema",
      packageCapability: "schema",
      path: (app.routes?.schema ?? `/apps/${app.installId}/schema`) as `/${string}`,
      surface: "schema",
    },
  ];

  if (install.packageAppKey === "site" || app.routes?.public !== undefined) {
    const path = app.routes?.public ?? `/sites/${app.installId}`;

    routes.push({
      kind: "publicSite",
      packageCapability: "publicSite",
      path: path as `/${string}`,
      prefix: `${path}/` as `/${string}/`,
      surface: "publicSite",
    });
  }

  return routes.map((route) => ({
    id: instanceControlPlaneAppRouteId(app.installId, route.kind),
    entity: "appRoute",
    values: {
      appInstall: app.installId,
      routeKind: route.kind,
      path: route.path,
      ...(route.prefix === undefined ? {} : { prefix: route.prefix }),
      surface: route.surface,
      packageCapability: route.packageCapability,
      enabled: true,
      createdAt: install.createdAt,
      updatedAt: install.updatedAt,
    },
    createdAt: install.createdAt,
  }));
}

function workspaceDomainControlPlaneRecords(
  manifest: FormlessInstanceWorkspaceManifest,
  input: {
    appInstallIds: ReadonlySet<string>;
    appRouteIds: ReadonlySet<string>;
    exportedAt: string;
  },
): StoredRecord[] {
  return (manifest.domains ?? []).map((domain) => {
    const appRoute = workspaceDomainAppRouteId(domain);
    const values: RecordValues = {
      host: domain.host,
      profile: domain.profile,
      ...(domain.targetInstallId === undefined || !input.appInstallIds.has(domain.targetInstallId)
        ? {}
        : { appInstall: domain.targetInstallId }),
      ...(appRoute === undefined || !input.appRouteIds.has(appRoute) ? {} : { appRoute }),
      enabled: domain.enabled,
      createdAt: input.exportedAt,
      updatedAt: input.exportedAt,
    };

    return {
      id: workspaceDomainMappingRecordId(domain),
      entity: "domainMapping",
      values,
      createdAt: input.exportedAt,
    };
  });
}

function workspaceDeployControlPlaneRecords(
  manifest: FormlessInstanceWorkspaceManifest,
  exportedAt: string,
): StoredRecord[] {
  if (!manifest.deploy) {
    return [];
  }

  const records: StoredRecord[] = [
    {
      id: workspaceDeployTargetId(),
      entity: "deployTarget",
      values: {
        targetId: workspaceDeployTargetId(),
        targetKind: "instance",
        label: workspaceDeployTargetId(),
        enabled: true,
        createdAt: exportedAt,
        updatedAt: exportedAt,
      },
      createdAt: exportedAt,
    },
  ];
  const providerConfigRef = workspaceProviderConfigRefId(manifest);

  if (providerConfigRef) {
    records.push({
      id: providerConfigRef,
      entity: "providerConfigRef",
      values: {
        providerFamily: "cloudflare",
        configRef: providerConfigRef,
        label: "Cloudflare",
        ...(manifest.deploy.accountId === undefined
          ? {}
          : { accountId: manifest.deploy.accountId }),
        ...(manifest.deploy.workerName === undefined
          ? {}
          : { workerName: manifest.deploy.workerName }),
        createdAt: exportedAt,
        updatedAt: exportedAt,
      },
      createdAt: exportedAt,
    });
  }

  return records;
}

function appArchiveFromWorkspaceDirectory(
  directory: WorkspaceArchiveDirectory | undefined,
): AppArchive | undefined {
  return directory?.archive.kind === APP_ARCHIVE_KIND ? directory.archive : undefined;
}

function storedControlPlaneRecord(record: {
  createdAt: string;
  deletedAt?: string;
  entity: string;
  id: string;
  values: RecordValues;
}): StoredRecord {
  return {
    id: record.id,
    entity: record.entity,
    values: record.values,
    createdAt: record.createdAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function workspaceDomainMappingRecordId(
  domain: Pick<FormlessInstanceWorkspaceDomainIntent, "host" | "profile">,
) {
  return `domain-mapping:${domain.profile}:${domain.host}`;
}

function workspaceDomainAppRouteId(
  domain: FormlessInstanceWorkspaceDomainIntent,
): string | undefined {
  if (!domain.targetInstallId) {
    return undefined;
  }

  if (domain.profile === "publicSite") {
    return instanceControlPlaneAppRouteId(domain.targetInstallId, "publicSite");
  }

  if (domain.profile === "app") {
    return instanceControlPlaneAppRouteId(domain.targetInstallId, "admin");
  }

  return undefined;
}

function workspaceDeployTargetId() {
  return "instance.primary";
}

function workspaceProviderConfigRefId(
  manifest: FormlessInstanceWorkspaceManifest,
): string | undefined {
  const deploy = manifest.deploy;

  if (!deploy?.accountId && !deploy?.workerName) {
    return undefined;
  }

  const key = deploy.workerName ?? deploy.accountId;

  return key ? `provider-config:cloudflare:${key}` : undefined;
}

function requireWorkspaceTarget(
  manifest: FormlessInstanceWorkspaceManifest,
  targetAlias: string | null | undefined,
  commandName: "check" | "deploy" | "domains plan" | "pull" | "push",
): FormlessInstanceWorkspaceTarget {
  const target = selectWorkspaceTarget(manifest, targetAlias);

  if (!target) {
    throw new Error(`Formless instance ${commandName} requires a workspace target.`);
  }

  return target;
}

function requireWorkspaceDeployAccountId(manifest: FormlessInstanceWorkspaceManifest): string {
  const accountId = manifest.deploy?.accountId?.trim();

  if (!accountId) {
    throw new Error("Formless instance domains plan requires deploy.accountId.");
  }

  return accountId;
}

function formlessInstanceWorkspaceDeploymentPlan(input: {
  manifest: FormlessInstanceWorkspaceManifest;
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  packageVersion: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
}): FormlessInstanceDeploymentPlan {
  const deploy = input.manifest.deploy;

  if (!deploy) {
    throw new Error("Formless instance deploy requires manifest deploy config.");
  }

  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(
    deploy.workersDevUrl ?? input.selectedTarget.url,
  );

  if (targetUrl !== input.selectedTarget.url) {
    throw new Error(
      `Formless instance deploy target ${input.selectedTarget.url} does not match deploy.workersDevUrl ${targetUrl}.`,
    );
  }

  const facts = workersDevTargetFacts(targetUrl, deploy.workerName);
  const accountId = deploy.accountId?.trim();

  if (!accountId) {
    throw new Error("Formless instance deploy requires deploy.accountId.");
  }

  const migrationPolicy = input.migrationPolicy ?? deploy.migrationPolicy;

  if (migrationPolicy === "existing" && !deploy.mediaBucket) {
    throw new Error(
      "Formless instance deploy requires deploy.mediaBucket when migrationPolicy is existing.",
    );
  }

  return planFormlessInstanceDeployment({
    account: {
      id: accountId,
      workersDevSubdomain: facts.workersDevSubdomain,
    },
    instanceName: facts.workerName,
    mediaBucketName: deploy.mediaBucket,
    migrationPolicy,
    packageVersion: input.packageVersion,
  });
}

function formlessInstanceWorkspaceDeployStateRoot(
  workspaceRoot: string,
  plan: FormlessInstanceDeploymentPlan,
): string {
  return path.join(workspaceRoot, ".formless/deploy", plan.resources.worker.name);
}

function workersDevTargetFacts(
  targetUrl: string,
  expectedWorkerName: string | undefined,
): { workerName: string; workersDevSubdomain: string } {
  const url = new URL(targetUrl);
  const suffix = ".workers.dev";

  if (url.protocol !== "https:" || !url.hostname.endsWith(suffix)) {
    throw new Error("Formless instance deploy supports workers.dev target URLs only.");
  }

  const labels = url.hostname.slice(0, -suffix.length).split(".");

  if (labels.length !== 2) {
    throw new Error("Formless instance deploy requires a workers.dev target host.");
  }

  const [workerName, workersDevSubdomain] = labels;

  if (!workerName || !workersDevSubdomain) {
    throw new Error("Formless instance deploy requires a workers.dev target host.");
  }

  if (expectedWorkerName !== undefined && expectedWorkerName !== workerName) {
    throw new Error(
      `Formless instance deploy target worker "${workerName}" does not match deploy.workerName "${expectedWorkerName}".`,
    );
  }

  return { workerName, workersDevSubdomain };
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
  controlPlane?: InstanceArchiveControlPlane;
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
    capabilities: [
      "installed-app-registry",
      ...(input.controlPlane === undefined ? [] : ["schema-owned-control-plane" as const]),
      "app-store-snapshots",
      "core-media-assets",
    ],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    ...(input.controlPlane === undefined ? {} : { controlPlane: input.controlPlane }),
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
  commandName: "domains plan" | "token rotate" = "token rotate",
): string {
  const workerName = manifest.deploy?.workerName ?? workerNameFromWorkersDevUrl(target?.url);

  if (!workerName) {
    throw new Error(
      `Formless instance ${commandName} requires deploy.workerName or a workers.dev target URL.`,
    );
  }

  return workerName;
}

async function readLiveWorkspaceDomainIntents(
  target: FormlessInstanceWorkspaceTarget,
  dependencies: { fetch: typeof fetch },
): Promise<FormlessInstanceWorkspaceDomainIntent[]> {
  const liveMappings = await readFormlessInstanceDomainMappings(
    { targetUrl: target.url },
    dependencies,
  );

  return liveMappings.mappings.map(workspaceDomainIntentFromLiveMapping);
}

function withWorkspaceDomainIntents(
  manifest: FormlessInstanceWorkspaceManifest,
  domains: readonly FormlessInstanceWorkspaceDomainIntent[],
): FormlessInstanceWorkspaceManifest {
  const next: FormlessInstanceWorkspaceManifest = {
    ...manifest,
  };

  if (domains.length === 0) {
    delete next.domains;
  } else {
    next.domains = [...domains];
  }

  return next;
}

function workspaceDomainIntentFromLiveMapping(
  mapping: InstanceDomainMapping,
): FormlessInstanceWorkspaceDomainIntent {
  const targetInstallId = liveMappingTargetInstallId(mapping);

  if (mapping.profile !== "instance" && targetInstallId === undefined) {
    throw new Error(
      `Live domain mapping for host "${mapping.host}" profile "${mapping.profile}" is missing a target install id.`,
    );
  }

  return {
    enabled: mapping.enabled,
    host: mapping.host,
    profile: mapping.profile,
    ...(targetInstallId === undefined ? {} : { targetInstallId }),
  };
}

function liveMappingTargetInstallId(mapping: InstanceDomainMapping): string | undefined {
  return mapping.targetInstallId ?? mapping.installId;
}

function selectDomainIntentsForHost(input: {
  host?: string | null;
  intents: readonly CloudflareDomainIntent[];
}): CloudflareDomainIntent[] {
  if (input.host === undefined || input.host === null || input.host.trim() === "") {
    return [...input.intents];
  }

  const host = normalizeInstanceDomainHost(input.host);

  if (!host.ok) {
    throw new Error(host.error.message);
  }

  const intents = input.intents.filter((intent) => intent.host === host.host);

  if (intents.length === 0) {
    throw new Error(`No desired domain mapping found for host "${host.host}".`);
  }

  return intents;
}

function compareWorkspaceDomainIntentToLive(
  workspaceDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
  liveDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
): FormlessInstanceWorkspaceDomainDesiredDrift[] {
  const workspaceByHost = new Map(workspaceDomains.map((domain) => [domain.host, domain]));
  const liveByHost = new Map(liveDomains.map((domain) => [domain.host, domain]));
  const hosts = new Set([...workspaceByHost.keys(), ...liveByHost.keys()]);
  const drift: FormlessInstanceWorkspaceDomainDesiredDrift[] = [];

  for (const host of [...hosts].sort((left, right) => left.localeCompare(right))) {
    const local = workspaceByHost.get(host);
    const live = liveByHost.get(host);

    if (local && !live) {
      drift.push({
        host,
        local,
        status: "local-only",
      });
      continue;
    }

    if (!local && live) {
      drift.push({
        host,
        live,
        status: "live-only",
      });
      continue;
    }

    if (local && live && !workspaceDomainIntentsEqual(local, live)) {
      drift.push({
        host,
        live,
        local,
        status: "mismatch",
      });
    }
  }

  return drift;
}

function workspaceDomainIntentsEqual(
  left: FormlessInstanceWorkspaceDomainIntent,
  right: FormlessInstanceWorkspaceDomainIntent,
): boolean {
  return (
    left.enabled === right.enabled &&
    left.host === right.host &&
    left.profile === right.profile &&
    left.targetInstallId === right.targetInstallId
  );
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

function optionalCloudflareApiTokenSecret(
  env: NodeJS.ProcessEnv | undefined,
): { CLOUDFLARE_API_TOKEN: string } | {} {
  const token =
    env?.[CLOUDFLARE_API_TOKEN_ENV_NAME]?.trim() ?? env?.[CF_API_TOKEN_ENV_NAME]?.trim();

  return token ? { CLOUDFLARE_API_TOKEN: token } : {};
}

function requiredGeneratedToken(value: string): string {
  const token = value.trim();

  if (token === "") {
    throw new Error("Generated Formless admin token must be a non-empty string.");
  }

  return token;
}

function missingAdminTokenMessage(action: "adopt" | "deploy"): string {
  return [
    action === "adopt"
      ? "Formless instance token adopt requires an admin token."
      : "Formless instance deploy requires an admin token.",
    action === "adopt"
      ? `Cloudflare Worker secrets cannot be read back; pass --admin-token or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`
      : `Cloudflare Worker secrets cannot be read back; run \`formless instance token adopt\`, run \`formless instance token rotate\`, or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`,
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

function defaultDevSourceCandidates(env: NodeJS.ProcessEnv | undefined): string[] {
  const port = env?.PORT && /^\d+$/.test(env.PORT) ? env.PORT : "5173";

  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

function forwardDevOutput(
  child: ChildProcessWithoutNullStreams,
  log: (message: string) => void,
  candidateOrigins: Set<string>,
) {
  const handleOutput = (chunk: Buffer) => {
    const text = chunk.toString();

    for (const origin of httpOriginsFromText(text)) {
      candidateOrigins.add(origin);
    }

    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) {
        log(line);
      }
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);
}

async function waitForInstanceDevServer(
  child: ChildProcessWithoutNullStreams,
  fetcher: typeof fetch,
  candidateOrigins: Set<string>,
): Promise<string> {
  const startedAt = Date.now();
  let spawnError: Error | null = null;

  child.once("error", (error) => {
    spawnError = error;
  });

  while (Date.now() - startedAt < 30_000) {
    if (spawnError) {
      throw spawnError;
    }

    if (child.exitCode !== null) {
      throw new Error(`Formless instance dev server exited with code ${child.exitCode}.`);
    }

    for (const origin of candidateOrigins) {
      if (await isInstanceDevServerReady(fetcher, origin)) {
        return origin;
      }
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the Formless instance dev server.");
}

async function isInstanceDevServerReady(fetcher: typeof fetch, origin: string): Promise<boolean> {
  try {
    const response = await fetcher(instanceAppInstallsUrl(origin), {
      headers: {
        accept: "application/json",
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

function httpOriginsFromText(text: string): string[] {
  const origins = new Set<string>();

  for (const match of text.matchAll(/https?:\/\/[^\s),]+/g)) {
    try {
      origins.add(new URL(match[0]).origin);
    } catch {
      // Ignore non-URL terminal fragments.
    }
  }

  return [...origins];
}

function waitForChildExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `Formless instance dev server exited with signal ${signal}.`
            : `Formless instance dev server exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

async function fetchWorkspaceJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed GET ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed GET ${url}: response was not JSON.`);
  }
}

function instanceAppInstallsUrl(origin: string): string {
  return new URL("/api/formless/app-installs", `${origin}/`).toString();
}

function restoreErrors(restore: RestorePortableArchiveResult): string {
  return restore.remote.errors?.map((error) => error.message).join("; ") || "unknown error";
}

function withoutAdminToken(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const nextEnv = { ...env };

  delete nextEnv.FORMLESS_ADMIN_TOKEN;
  return nextEnv;
}

function relativeDependencyPath(cwd: string, filePath: string): string {
  const relativePath = path.relative(cwd, filePath);

  return relativePath === "" ? "." : relativePath.split(path.sep).join("/");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
