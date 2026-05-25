import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  APP_ARCHIVE_KIND,
  INSTANCE_ARCHIVE_KIND,
  parsePortableArchive,
  type AppArchive,
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
import { PORTABLE_ARCHIVE_MANIFEST_FILE } from "./archive-workflows.ts";
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
