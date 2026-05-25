import {
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS,
  normalizeFormlessInstanceWorkspaceTargetUrl,
  parseFormlessInstanceWorkspaceTargetAlias,
} from "./instance-workspace-config.ts";

export type FormlessCliCommand =
  | {
      adminToken: string | null;
      apply: boolean;
      archiveDir: string;
      kind: "archiveRestore";
      replace: boolean;
      target: string;
    }
  | {
      adminToken: string | null;
      apply: boolean;
      archiveDir: string;
      installId: string;
      kind: "archiveRestoreApp";
      replace: boolean;
      target: string;
    }
  | {
      installId: string;
      kind: "archiveExportApp";
      outDir: string;
      target: string;
    }
  | {
      kind: "archiveExport";
      outDir: string;
      target: string;
    }
  | {
      installId: string;
      kind: "archiveImportSite";
      label: string | null;
      outDir: string;
      projectPath: string;
    }
  | {
      fromArchive: string | null;
      fromRemote: boolean;
      kind: "instanceInitWorkspace";
      name: string | null;
      targetAlias: string;
      targetUrl: string | null;
      workspacePath: string;
    }
  | { kind: "instanceStatus"; targetAlias: string | null; workspacePath: string }
  | { kind: "instancePull"; targetAlias: string | null; workspacePath: string }
  | { kind: "instanceCheck"; targetAlias: string | null; workspacePath: string }
  | {
      allowStale: boolean;
      apply: boolean;
      kind: "instancePush";
      replace: boolean;
      replaceInstallSet: boolean;
      targetAlias: string | null;
      workspacePath: string;
    }
  | { kind: "instanceDev"; workspacePath: string }
  | { kind: "instanceResetLocal"; workspacePath: string }
  | {
      kind: "instanceDeploy";
      migrationPolicy: "existing" | "new" | null;
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      adminToken: string | null;
      kind: "instanceTokenAdopt";
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      adminToken: string | null;
      kind: "instanceTokenRotate";
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      accountId: string | null;
      adminToken: string | null;
      createBucket: boolean;
      kind: "deploySetup";
      mediaBucket: string;
      projectPath: string;
      publishUrl: string;
      uploadSecret: boolean;
      workerName: string;
    }
  | { kind: "dev"; projectPath: string }
  | { kind: "help" }
  | { kind: "init"; targetDir: string }
  | {
      credentialProfile: string | null;
      instanceName: string | null;
      kind: "onboard";
      open: boolean;
    }
  | { dryRun: boolean; kind: "publish"; projectPath: string; yes: boolean }
  | { check: boolean; kind: "save"; projectPath: string; source: string | null };

export function formlessCliUsage(): string {
  return [
    "Usage: formless <command>",
    "",
    "Commands:",
    "  init <dir>                         Create a Formless Site project",
    "  onboard [options]                  Create a remote Formless instance",
    "       [--name <name>] [--credential-profile <name>] [--open | --no-open]",
    "  dev [--project <path>]             Run local public preview and /admin editor",
    "  save [--project <path>] [--check]   Save local Site edits back to project files",
    "       [--source <url>]",
    "  deploy setup [options]              Store deploy config and local admin token",
    "  publish [--project <path>]          Deploy code, media, and records",
    "       [--dry-run] [--yes]",
    "  archive export --target <url> --out <dir>",
    "  archive export-app --target <url> --install <id> --out <dir>",
    "  archive restore --target <url> --archive <dir> [--apply] [--replace]",
    "       [--admin-token <token>]",
    "  archive restore-app --target <url> --archive <dir> --install <id>",
    "       [--apply] [--replace] [--admin-token <token>]",
    "  archive import-site --project <path> --install <id> --out <dir>",
    "       [--label <label>]",
    "  instance init-workspace [--workspace <path>] [--name <name>]",
    "       [--target-url <url>] [--target <alias>] [--from-remote | --from-archive <dir>]",
    "  instance status|pull|check [--workspace <path>] [--target <alias>]",
    "  instance push [--workspace <path>] [--target <alias>]",
    "       [--apply] [--replace] [--allow-stale] [--replace-install-set]",
    "  instance dev|reset-local [--workspace <path>]",
    "  instance deploy [--workspace <path>] [--target <alias>]",
    "       [--migration-policy <new|existing>]",
    "  instance token <adopt|rotate> [--workspace <path>] [--target <alias>]",
    "       [--admin-token <token>]",
  ].join("\n");
}

export function parseFormlessCliArgs(args: string[]): FormlessCliCommand {
  const [command, ...rest] = args;

  if (!command || command === "-h" || command === "--help" || command === "help") {
    return { kind: "help" };
  }

  switch (command) {
    case "init":
      return parseInitArgs(rest);
    case "onboard":
      return parseOnboardArgs(rest);
    case "dev":
      return parseDevArgs(rest);
    case "save":
      return parseSaveArgs(rest);
    case "deploy":
      return parseDeployArgs(rest);
    case "publish":
      return parsePublishArgs(rest);
    case "archive":
      return parseArchiveArgs(rest);
    case "instance":
      return parseInstanceArgs(rest);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Source URL is invalid: ${value}`);
  }
}

function parseInitArgs(args: string[]): FormlessCliCommand {
  if (args.length !== 1 || args[0]?.startsWith("-")) {
    throw new Error("Usage: formless init <dir>");
  }

  return { kind: "init", targetDir: args[0] };
}

function parseOnboardArgs(args: string[]): FormlessCliCommand {
  let credentialProfile: string | null = null;
  let instanceName: string | null = null;
  let open = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      throw new Error(
        "Usage: formless onboard [--name <name>] [--credential-profile <name>] [--open | --no-open]",
      );
    }

    if (arg === "--name") {
      instanceName = readOptionValue(args, index, "--name");
      index += 1;
      continue;
    }

    if (arg === "--credential-profile") {
      credentialProfile = readOptionValue(args, index, "--credential-profile");
      index += 1;
      continue;
    }

    if (arg === "--open") {
      open = true;
      continue;
    }

    if (arg === "--no-open") {
      open = false;
      continue;
    }

    throw new Error(`Unknown option for formless onboard: ${arg}`);
  }

  return { credentialProfile, instanceName, kind: "onboard", open };
}

function parseDevArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless dev");

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for formless dev: ${options.rest[0]}`);
  }

  return { kind: "dev", projectPath: options.projectPath };
}

function parseSaveArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless save");
  let check = false;
  let source: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--check") {
      check = true;
      continue;
    }

    if (arg === "--source") {
      source = normalizeSourceUrl(readOptionValue(options.rest, index, "--source"));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless save: ${arg}`);
  }

  return { check, kind: "save", projectPath: options.projectPath, source };
}

function parseDeployArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  if (subcommand !== "setup") {
    throw new Error(
      "Usage: formless deploy setup [--project <path>] --worker <name> --publish-url <url> --media-bucket <bucket>",
    );
  }

  return parseDeploySetupArgs(rest);
}

function parseDeploySetupArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless deploy setup");
  let accountId: string | null = null;
  let adminToken: string | null = null;
  let createBucket = false;
  let mediaBucket: string | null = null;
  let publishUrl: string | null = null;
  let uploadSecret = true;
  let workerName: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--worker") {
      workerName = readOptionValue(options.rest, index, "--worker");
      index += 1;
      continue;
    }

    if (arg === "--publish-url") {
      publishUrl = normalizeSourceUrl(readOptionValue(options.rest, index, "--publish-url"));
      index += 1;
      continue;
    }

    if (arg === "--media-bucket") {
      mediaBucket = readOptionValue(options.rest, index, "--media-bucket");
      index += 1;
      continue;
    }

    if (arg === "--account-id") {
      accountId = readOptionValue(options.rest, index, "--account-id");
      index += 1;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    if (arg === "--generate-admin-token") {
      adminToken = null;
      continue;
    }

    if (arg === "--create-bucket") {
      createBucket = true;
      continue;
    }

    if (arg === "--skip-secret-upload") {
      uploadSecret = false;
      continue;
    }

    throw new Error(`Unknown option for formless deploy setup: ${arg}`);
  }

  if (!workerName) {
    throw new Error("Missing required option for formless deploy setup: --worker.");
  }

  if (!publishUrl) {
    throw new Error("Missing required option for formless deploy setup: --publish-url.");
  }

  if (!mediaBucket) {
    throw new Error("Missing required option for formless deploy setup: --media-bucket.");
  }

  return {
    accountId,
    adminToken,
    createBucket,
    kind: "deploySetup",
    mediaBucket,
    projectPath: options.projectPath,
    publishUrl,
    uploadSecret,
    workerName,
  };
}

function parsePublishArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless publish");
  let dryRun = false;
  let yes = false;

  for (const arg of options.rest) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      yes = true;
      continue;
    }

    throw new Error(`Unknown option for formless publish: ${arg}`);
  }

  return { dryRun, kind: "publish", projectPath: options.projectPath, yes };
}

function parseArchiveArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "export":
      return parseArchiveExportArgs(rest);
    case "export-app":
      return parseArchiveExportAppArgs(rest);
    case "restore":
      return parseArchiveRestoreArgs(rest);
    case "restore-app":
      return parseArchiveRestoreAppArgs(rest);
    case "import-site":
      return parseArchiveImportSiteArgs(rest);
    default:
      throw new Error(
        "Usage: formless archive <export|export-app|restore|restore-app|import-site>",
      );
  }
}

function parseArchiveExportArgs(args: string[]): FormlessCliCommand {
  const options = parseArchiveTargetOutOptions(args, "formless archive export");

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for formless archive export: ${options.rest[0]}`);
  }

  return {
    kind: "archiveExport",
    outDir: options.outDir,
    target: options.target,
  };
}

function parseArchiveExportAppArgs(args: string[]): FormlessCliCommand {
  const options = parseArchiveTargetOutOptions(args, "formless archive export-app");
  let installId: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--install") {
      installId = readOptionValue(options.rest, index, "--install");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless archive export-app: ${arg}`);
  }

  if (!installId) {
    throw new Error("Missing required option for formless archive export-app: --install.");
  }

  return {
    installId,
    kind: "archiveExportApp",
    outDir: options.outDir,
    target: options.target,
  };
}

function parseArchiveRestoreArgs(args: string[]): FormlessCliCommand {
  const options = parseArchiveRestoreOptions(args, "formless archive restore");

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for formless archive restore: ${options.rest[0]}`);
  }

  return {
    adminToken: options.adminToken,
    apply: options.apply,
    archiveDir: options.archiveDir,
    kind: "archiveRestore",
    replace: options.replace,
    target: options.target,
  };
}

function parseArchiveRestoreAppArgs(args: string[]): FormlessCliCommand {
  const options = parseArchiveRestoreOptions(args, "formless archive restore-app");
  let installId: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--install") {
      installId = readOptionValue(options.rest, index, "--install");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless archive restore-app: ${arg}`);
  }

  if (!installId) {
    throw new Error("Missing required option for formless archive restore-app: --install.");
  }

  return {
    adminToken: options.adminToken,
    apply: options.apply,
    archiveDir: options.archiveDir,
    installId,
    kind: "archiveRestoreApp",
    replace: options.replace,
    target: options.target,
  };
}

function parseArchiveImportSiteArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless archive import-site");
  let installId: string | null = null;
  let label: string | null = null;
  let outDir: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--install") {
      installId = readOptionValue(options.rest, index, "--install");
      index += 1;
      continue;
    }

    if (arg === "--label") {
      label = readOptionValue(options.rest, index, "--label");
      index += 1;
      continue;
    }

    if (arg === "--out") {
      outDir = readOptionValue(options.rest, index, "--out");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless archive import-site: ${arg}`);
  }

  if (!installId) {
    throw new Error("Missing required option for formless archive import-site: --install.");
  }

  if (!outDir) {
    throw new Error("Missing required option for formless archive import-site: --out.");
  }

  return {
    installId,
    kind: "archiveImportSite",
    label,
    outDir,
    projectPath: options.projectPath,
  };
}

function parseInstanceArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "init-workspace":
      return parseInstanceInitWorkspaceArgs(rest);
    case "status":
      return parseInstanceTargetCommandArgs(rest, "formless instance status", "instanceStatus");
    case "pull":
      return parseInstanceTargetCommandArgs(rest, "formless instance pull", "instancePull");
    case "check":
      return parseInstanceTargetCommandArgs(rest, "formless instance check", "instanceCheck");
    case "push":
      return parseInstancePushArgs(rest);
    case "dev":
      return parseInstanceWorkspaceOnlyArgs(rest, "formless instance dev", "instanceDev");
    case "reset-local":
      return parseInstanceWorkspaceOnlyArgs(
        rest,
        "formless instance reset-local",
        "instanceResetLocal",
      );
    case "deploy":
      return parseInstanceDeployArgs(rest);
    case "token":
      return parseInstanceTokenArgs(rest);
    default:
      throw new Error(
        "Usage: formless instance <init-workspace|status|pull|check|push|dev|reset-local|deploy|token>",
      );
  }
}

function parseInstanceInitWorkspaceArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceWorkspaceOptions(args, "formless instance init-workspace");
  let fromArchive: string | null = null;
  let fromRemote = false;
  let name: string | null = null;
  let targetAlias = DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS;
  let targetUrl: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--name") {
      name = readOptionValue(options.rest, index, "--name");
      index += 1;
      continue;
    }

    if (arg === "--target-url") {
      targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(
        readOptionValue(options.rest, index, "--target-url"),
      );
      index += 1;
      continue;
    }

    if (arg === "--target") {
      targetAlias = parseCliTargetAlias(readOptionValue(options.rest, index, "--target"));
      index += 1;
      continue;
    }

    if (arg === "--from-remote") {
      fromRemote = true;
      continue;
    }

    if (arg === "--from-archive") {
      fromArchive = readOptionValue(options.rest, index, "--from-archive");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance init-workspace: ${arg}`);
  }

  if (fromRemote && fromArchive) {
    throw new Error(
      "formless instance init-workspace cannot combine --from-remote and --from-archive.",
    );
  }

  if (fromRemote && !targetUrl) {
    throw new Error("Missing required option for formless instance init-workspace: --target-url.");
  }

  return {
    fromArchive,
    fromRemote,
    kind: "instanceInitWorkspace",
    name,
    targetAlias,
    targetUrl,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceTargetCommandArgs<
  TKind extends "instanceCheck" | "instancePull" | "instanceStatus",
>(args: string[], usage: string, kind: TKind): Extract<FormlessCliCommand, { kind: TKind }> {
  const options = parseInstanceTargetOptions(args, usage);

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for ${usage}: ${options.rest[0]}`);
  }

  return {
    kind,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  } as Extract<FormlessCliCommand, { kind: TKind }>;
}

function parseInstancePushArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance push");
  let allowStale = false;
  let apply = false;
  let replace = false;
  let replaceInstallSet = false;

  for (const arg of options.rest) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      apply = false;
      continue;
    }

    if (arg === "--replace") {
      replace = true;
      continue;
    }

    if (arg === "--replace-install-set") {
      replaceInstallSet = true;
      continue;
    }

    if (arg === "--allow-stale") {
      allowStale = true;
      continue;
    }

    throw new Error(`Unknown option for formless instance push: ${arg}`);
  }

  return {
    allowStale,
    apply,
    kind: "instancePush",
    replace,
    replaceInstallSet,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceWorkspaceOnlyArgs<TKind extends "instanceDev" | "instanceResetLocal">(
  args: string[],
  usage: string,
  kind: TKind,
): Extract<FormlessCliCommand, { kind: TKind }> {
  const options = parseInstanceWorkspaceOptions(args, usage);

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for ${usage}: ${options.rest[0]}`);
  }

  return {
    kind,
    workspacePath: options.workspacePath,
  } as Extract<FormlessCliCommand, { kind: TKind }>;
}

function parseInstanceDeployArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance deploy");
  let migrationPolicy: "existing" | "new" | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--migration-policy") {
      const value = readOptionValue(options.rest, index, "--migration-policy");

      if (value !== "existing" && value !== "new") {
        throw new Error('formless instance deploy --migration-policy must be "new" or "existing".');
      }

      migrationPolicy = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance deploy: ${arg}`);
  }

  return {
    kind: "instanceDeploy",
    migrationPolicy,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceTokenArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "adopt":
      return parseInstanceTokenCommandArgs(
        rest,
        "formless instance token adopt",
        "instanceTokenAdopt",
      );
    case "rotate":
      return parseInstanceTokenCommandArgs(
        rest,
        "formless instance token rotate",
        "instanceTokenRotate",
      );
    default:
      throw new Error("Usage: formless instance token <adopt|rotate>");
  }
}

function parseInstanceTokenCommandArgs<TKind extends "instanceTokenAdopt" | "instanceTokenRotate">(
  args: string[],
  usage: string,
  kind: TKind,
): Extract<FormlessCliCommand, { kind: TKind }> {
  const options = parseInstanceTargetOptions(args, usage);
  let adminToken: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for ${usage}: ${arg}`);
  }

  return {
    adminToken,
    kind,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  } as Extract<FormlessCliCommand, { kind: TKind }>;
}

function parseInstanceTargetOptions(
  args: string[],
  usage: string,
): { rest: string[]; targetAlias: string | null; workspacePath: string } {
  const options = parseInstanceWorkspaceOptions(args, usage);
  let targetAlias: string | null = null;
  const rest: string[] = [];

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--target") {
      targetAlias = parseCliTargetAlias(readOptionValue(options.rest, index, "--target"));
      index += 1;
      continue;
    }

    rest.push(arg);
  }

  return { rest, targetAlias, workspacePath: options.workspacePath };
}

function parseInstanceWorkspaceOptions(
  args: string[],
  usage: string,
): { rest: string[]; workspacePath: string } {
  let workspacePath = ".";
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = readOptionValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage} [--workspace <path>]`);
    }

    rest.push(arg);
  }

  return { rest, workspacePath };
}

function parseCliTargetAlias(value: string): string {
  return parseFormlessInstanceWorkspaceTargetAlias(
    "Formless instance workspace target alias",
    value,
  );
}

function parseArchiveTargetOutOptions(
  args: string[],
  usage: string,
): { outDir: string; rest: string[]; target: string } {
  let outDir: string | null = null;
  const options = parseArchiveTargetOptions(args, usage);
  const rest: string[] = [];

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--out") {
      outDir = readOptionValue(options.rest, index, "--out");
      index += 1;
      continue;
    }

    rest.push(arg);
  }

  if (!outDir) {
    throw new Error(`Missing required option for ${usage}: --out.`);
  }

  return { outDir, rest, target: options.target };
}

function parseArchiveRestoreOptions(
  args: string[],
  usage: string,
): {
  adminToken: string | null;
  apply: boolean;
  archiveDir: string;
  replace: boolean;
  rest: string[];
  target: string;
} {
  const options = parseArchiveTargetOptions(args, usage);
  let adminToken: string | null = null;
  let apply = false;
  let archiveDir: string | null = null;
  let replace = false;
  const rest: string[] = [];

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--archive") {
      archiveDir = readOptionValue(options.rest, index, "--archive");
      index += 1;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      apply = false;
      continue;
    }

    if (arg === "--replace") {
      replace = true;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    rest.push(arg);
  }

  if (!archiveDir) {
    throw new Error(`Missing required option for ${usage}: --archive.`);
  }

  return {
    adminToken,
    apply,
    archiveDir,
    replace,
    rest,
    target: options.target,
  };
}

function parseArchiveTargetOptions(
  args: string[],
  usage: string,
): { rest: string[]; target: string } {
  let target: string | null = null;
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--target") {
      target = normalizeSourceUrl(readOptionValue(args, index, "--target"));
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage} --target <url>`);
    }

    rest.push(arg);
  }

  if (!target) {
    throw new Error(`Missing required option for ${usage}: --target.`);
  }

  return { rest, target };
}

function parseProjectOptions(
  args: string[],
  usage: string,
): { projectPath: string; rest: string[] } {
  let projectPath = ".";
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--project") {
      projectPath = readOptionValue(args, index, "--project");
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage} [--project <path>]`);
    }

    rest.push(arg);
  }

  return { projectPath, rest };
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}
