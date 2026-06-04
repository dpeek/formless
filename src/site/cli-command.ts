import {
  DEFAULT_INSTANCE_WORKSPACE_TARGET_ALIAS,
  normalizeInstanceWorkspaceTargetUrl,
  parseInstanceWorkspaceTargetAlias,
} from "@dpeek/formless-workspace";
import type { CloudflareDomainPreflightPolicy } from "./cloudflare-domain-client.ts";
import type { DomainProviderResourceKind } from "../shared/domain-provider-protocol.ts";
import type { InstanceDomainMappingProfile } from "../shared/instance-domain-mappings.ts";

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
      confirm: string;
      kind: "instanceDestroy";
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      kind: "instanceDeploy";
      migrationPolicy: "existing" | "new" | null;
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      kind: "instanceDomainsPlan";
      host: string | null;
      policy: CloudflareDomainPreflightPolicy;
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      kind: "instanceDomainsRemotePlan";
      host: string | null;
      policy: CloudflareDomainPreflightPolicy;
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      adminToken: string | null;
      host: string;
      kind: "instanceDomainsRunDelete";
      logicalId: string;
      resourceKind: DomainProviderResourceKind;
      runnerId: string | null;
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      adminToken: string | null;
      host: string;
      kind: "instanceDomainsForgetRoute";
      profile: InstanceDomainMappingProfile;
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      adminToken: string | null;
      fromHost: string;
      kind: "instanceDomainsForgetRedirect";
      targetAlias: string | null;
      workspacePath: string;
    }
  | {
      adminToken: string | null;
      host: string;
      kind: "instanceDomainsMarkManuallyRemoved";
      logicalId: string;
      resourceKind: DomainProviderResourceKind;
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
  | { kind: "help" }
  | { kind: "workspaceCheck"; targetAlias: string | null; workspacePath: string | null }
  | {
      confirm: string;
      kind: "workspaceDestroy";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      kind: "workspaceDeploy";
      migrationPolicy: "existing" | "new" | null;
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | { kind: "workspaceDev"; open: boolean; workspacePath: string | null }
  | { check: boolean; kind: "workspaceSave"; workspacePath: string | null };

export function formlessCliUsage(): string {
  return [
    "Usage: formless <command>",
    "",
    "Commands:",
    "  dev [--workspace <path>] [--open]   Run local workspace and browser setup",
    "  save [--workspace <path>] [--check] Save Authority state to record source and app archives",
    "  check [--workspace <path>] [--target <alias>]",
    "                                      Check workspace source and target drift",
    "  deploy [--workspace <path>] [--target <alias>]",
    "       [--migration-policy <new|existing>] Deploy workspace source and desired resources",
    "  destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
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
    "       [--migration-policy <new|existing>] Advanced workspace deploy alias",
    "  instance destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
    "  instance domains remote-plan|run-delete|forget-route|forget-redirect",
    "       |mark-manually-removed|plan [--workspace <path>] [--target <alias>]",
    "       [--policy <create-only|adopt|override>] [--host <hostname>]",
    "       [--profile <instance|app|publicSite>] [--kind <provider-kind>]",
    "       [--logical-id <id>] [--from-host <hostname>] [--admin-token <token>]",
    "       [--runner-id <id>]",
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
    case "dev":
      return parseWorkspaceDevArgs(rest);
    case "save":
      return parseWorkspaceSaveArgs(rest);
    case "check":
      return parseWorkspaceCheckArgs(rest);
    case "deploy":
      return parseWorkspaceDeployArgs(rest);
    case "destroy":
      return parseWorkspaceDestroyArgs(rest);
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

function parseWorkspaceDevArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelWorkspaceOptions(args, "formless dev [--workspace <path>] [--open]");
  let open = false;

  for (const arg of options.rest) {
    if (arg === "--open") {
      open = true;
      continue;
    }

    throw new Error(`Unknown option for formless dev: ${arg}`);
  }

  return { kind: "workspaceDev", open, workspacePath: options.workspacePath };
}

function parseWorkspaceSaveArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelWorkspaceOptions(
    args,
    "formless save [--workspace <path>] [--check]",
  );
  let check = false;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--check") {
      check = true;
      continue;
    }

    throw new Error(`Unknown option for formless save: ${arg}`);
  }

  return { check, kind: "workspaceSave", workspacePath: options.workspacePath };
}

function parseWorkspaceCheckArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelTargetOptions(
    args,
    "formless check [--workspace <path>] [--target <alias>]",
  );

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for formless check: ${options.rest[0]}`);
  }

  return {
    kind: "workspaceCheck",
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseWorkspaceDeployArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelTargetOptions(
    args,
    "formless deploy [--workspace <path>] [--target <alias>] [--migration-policy <new|existing>]",
  );
  let migrationPolicy: "existing" | "new" | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--migration-policy") {
      const value = readOptionValue(options.rest, index, "--migration-policy");

      if (value !== "existing" && value !== "new") {
        throw new Error('formless deploy --migration-policy must be "new" or "existing".');
      }

      migrationPolicy = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless deploy: ${arg}`);
  }

  return {
    kind: "workspaceDeploy",
    migrationPolicy,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseWorkspaceDestroyArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelTargetOptions(
    args,
    "formless destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
  );
  const confirm = parseRequiredConfirmOption(options.rest, "formless destroy");

  return {
    confirm,
    kind: "workspaceDestroy",
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
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
    case "destroy":
      return parseInstanceDestroyArgs(rest);
    case "domains":
      return parseInstanceDomainsArgs(rest);
    case "token":
      return parseInstanceTokenArgs(rest);
    default:
      throw new Error(
        "Usage: formless instance <init-workspace|status|pull|check|push|dev|reset-local|deploy|destroy|domains|token>",
      );
  }
}

function parseInstanceInitWorkspaceArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceWorkspaceOptions(args, "formless instance init-workspace");
  let fromArchive: string | null = null;
  let fromRemote = false;
  let name: string | null = null;
  let targetAlias = DEFAULT_INSTANCE_WORKSPACE_TARGET_ALIAS;
  let targetUrl: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--name") {
      name = readOptionValue(options.rest, index, "--name");
      index += 1;
      continue;
    }

    if (arg === "--target-url") {
      targetUrl = normalizeInstanceWorkspaceTargetUrl(
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

function parseInstanceDestroyArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance destroy");
  const confirm = parseRequiredConfirmOption(options.rest, "formless instance destroy");

  return {
    confirm,
    kind: "instanceDestroy",
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceDomainsArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "remote-plan":
      return parseInstanceDomainsRemotePlanArgs(rest);
    case "plan":
      return parseInstanceDomainsPlanArgs(rest);
    case "run-delete":
      return parseInstanceDomainsRunDeleteArgs(rest);
    case "forget-route":
      return parseInstanceDomainsForgetRouteArgs(rest);
    case "forget-redirect":
      return parseInstanceDomainsForgetRedirectArgs(rest);
    case "mark-manually-removed":
      return parseInstanceDomainsMarkManuallyRemovedArgs(rest);
    default:
      throw new Error(
        "Usage: formless instance domains <remote-plan|run-delete|forget-route|forget-redirect|mark-manually-removed|plan>",
      );
  }
}

function parseInstanceDomainsRemotePlanArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance domains remote-plan");
  let host: string | null = null;
  let policy: CloudflareDomainPreflightPolicy = "create-only";

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--dry-run") {
      continue;
    }

    if (arg === "--policy") {
      policy = parseCloudflareDomainPreflightPolicy(
        readOptionValue(options.rest, index, "--policy"),
        "formless instance domains remote-plan",
      );
      index += 1;
      continue;
    }

    if (arg === "--host") {
      host = readOptionValue(options.rest, index, "--host");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance domains remote-plan: ${arg}`);
  }

  return {
    host,
    kind: "instanceDomainsRemotePlan",
    policy,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceDomainsPlanArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance domains plan");
  let host: string | null = null;
  let policy: CloudflareDomainPreflightPolicy = "create-only";

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--dry-run") {
      continue;
    }

    if (arg === "--policy") {
      policy = parseCloudflareDomainPreflightPolicy(
        readOptionValue(options.rest, index, "--policy"),
        "formless instance domains plan",
      );
      index += 1;
      continue;
    }

    if (arg === "--host") {
      host = readOptionValue(options.rest, index, "--host");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance domains plan: ${arg}`);
  }

  return {
    host,
    kind: "instanceDomainsPlan",
    policy,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceDomainsRunDeleteArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance domains run-delete");
  let adminToken: string | null = null;
  let host: string | null = null;
  let logicalId: string | null = null;
  let resourceKind: DomainProviderResourceKind | null = null;
  let runnerId: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--host") {
      host = readOptionValue(options.rest, index, "--host");
      index += 1;
      continue;
    }

    if (arg === "--kind") {
      resourceKind = parseDomainProviderResourceKind(
        readOptionValue(options.rest, index, "--kind"),
        "formless instance domains run-delete",
      );
      index += 1;
      continue;
    }

    if (arg === "--logical-id") {
      logicalId = readOptionValue(options.rest, index, "--logical-id");
      index += 1;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    if (arg === "--runner-id") {
      runnerId = readOptionValue(options.rest, index, "--runner-id");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance domains run-delete: ${arg}`);
  }

  return {
    adminToken,
    host: requireOption(host, "formless instance domains run-delete", "--host"),
    kind: "instanceDomainsRunDelete",
    logicalId: requireOption(logicalId, "formless instance domains run-delete", "--logical-id"),
    resourceKind: requireOption(resourceKind, "formless instance domains run-delete", "--kind"),
    runnerId,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceDomainsForgetRouteArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance domains forget-route");
  let adminToken: string | null = null;
  let host: string | null = null;
  let profile: InstanceDomainMappingProfile | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--host") {
      host = readOptionValue(options.rest, index, "--host");
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      profile = parseInstanceDomainMappingProfile(
        readOptionValue(options.rest, index, "--profile"),
        "formless instance domains forget-route",
      );
      index += 1;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance domains forget-route: ${arg}`);
  }

  return {
    adminToken,
    host: requireOption(host, "formless instance domains forget-route", "--host"),
    kind: "instanceDomainsForgetRoute",
    profile: requireOption(profile, "formless instance domains forget-route", "--profile"),
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceDomainsForgetRedirectArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(args, "formless instance domains forget-redirect");
  let adminToken: string | null = null;
  let fromHost: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--from-host") {
      fromHost = readOptionValue(options.rest, index, "--from-host");
      index += 1;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance domains forget-redirect: ${arg}`);
  }

  return {
    adminToken,
    fromHost: requireOption(fromHost, "formless instance domains forget-redirect", "--from-host"),
    kind: "instanceDomainsForgetRedirect",
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseInstanceDomainsMarkManuallyRemovedArgs(args: string[]): FormlessCliCommand {
  const options = parseInstanceTargetOptions(
    args,
    "formless instance domains mark-manually-removed",
  );
  let adminToken: string | null = null;
  let host: string | null = null;
  let logicalId: string | null = null;
  let resourceKind: DomainProviderResourceKind | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--host") {
      host = readOptionValue(options.rest, index, "--host");
      index += 1;
      continue;
    }

    if (arg === "--kind") {
      resourceKind = parseDomainProviderResourceKind(
        readOptionValue(options.rest, index, "--kind"),
        "formless instance domains mark-manually-removed",
      );
      index += 1;
      continue;
    }

    if (arg === "--logical-id") {
      logicalId = readOptionValue(options.rest, index, "--logical-id");
      index += 1;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless instance domains mark-manually-removed: ${arg}`);
  }

  return {
    adminToken,
    host: requireOption(host, "formless instance domains mark-manually-removed", "--host"),
    kind: "instanceDomainsMarkManuallyRemoved",
    logicalId: requireOption(
      logicalId,
      "formless instance domains mark-manually-removed",
      "--logical-id",
    ),
    resourceKind: requireOption(
      resourceKind,
      "formless instance domains mark-manually-removed",
      "--kind",
    ),
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseCloudflareDomainPreflightPolicy(
  value: string,
  commandName: "formless instance domains plan" | "formless instance domains remote-plan",
): CloudflareDomainPreflightPolicy {
  if (value === "create-only" || value === "adopt" || value === "override") {
    return value;
  }

  throw new Error(`${commandName} --policy must be "create-only", "adopt", or "override".`);
}

function parseDomainProviderResourceKind(
  value: string,
  commandName:
    | "formless instance domains mark-manually-removed"
    | "formless instance domains run-delete",
): DomainProviderResourceKind {
  if (
    value === "cloudflare-dns-records" ||
    value === "cloudflare-redirect-rule" ||
    value === "cloudflare-worker-custom-domain"
  ) {
    return value;
  }

  throw new Error(
    `${commandName} --kind must be "cloudflare-worker-custom-domain", "cloudflare-redirect-rule", or "cloudflare-dns-records".`,
  );
}

function parseInstanceDomainMappingProfile(
  value: string,
  commandName: "formless instance domains forget-route",
): InstanceDomainMappingProfile {
  if (value === "instance" || value === "app" || value === "publicSite") {
    return value;
  }

  throw new Error(`${commandName} --profile must be "instance", "app", or "publicSite".`);
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

function parseRequiredConfirmOption(args: string[], usage: string): string {
  let confirm: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--confirm") {
      confirm = readOptionValue(args, index, "--confirm");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for ${usage}: ${arg}`);
  }

  if (!confirm) {
    throw new Error(`Missing required option for ${usage}: --confirm.`);
  }

  return confirm;
}

function parseTopLevelTargetOptions(
  args: string[],
  usage: string,
): { rest: string[]; targetAlias: string | null; workspacePath: string | null } {
  const options = parseTopLevelWorkspaceOptions(args, usage);
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

function parseTopLevelWorkspaceOptions(
  args: string[],
  usage: string,
): { rest: string[]; workspacePath: string | null } {
  let workspacePath: string | null = null;
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--workspace") {
      workspacePath = readOptionValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage}`);
    }

    rest.push(arg);
  }

  return { rest, workspacePath };
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
  return parseInstanceWorkspaceTargetAlias("Formless instance workspace target alias", value);
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

function requireOption<T>(value: T | null, commandName: string, option: string): T {
  if (value === null) {
    throw new Error(`Missing required option for ${commandName}: ${option}.`);
  }

  return value;
}
