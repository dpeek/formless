import {
  parseInstanceWorkspaceTargetAlias,
  workspaceOperationDefinitionForCliCommand,
  workspaceOperationInputFieldDefaultValue,
  type WorkspaceOperationKind,
} from "@dpeek/formless-workspace";

export type FormlessCliCommand =
  | { kind: "help" }
  | {
      confirm: string;
      kind: "workspaceDestroy";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      dryRun: boolean;
      kind: "workspaceDeploy";
      migrationPolicy: "existing" | "new" | null;
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | { kind: "workspaceDev"; open: boolean; workspacePath: string | null }
  | {
      adminToken: string | null;
      kind: "workspaceOwnerSetup";
      open: boolean;
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | { kind: "workspacePull"; targetAlias: string | null; workspacePath: string | null }
  | {
      allowStale: boolean;
      apply: boolean;
      kind: "workspacePush";
      replace: boolean;
      replaceInstallSet: boolean;
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | { check: boolean; kind: "workspaceSave"; workspacePath: string | null }
  | {
      adminToken: string | null;
      kind: "workspaceTokenAdopt";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      adminToken: string | null;
      kind: "workspaceTokenRotate";
      targetAlias: string | null;
      workspacePath: string | null;
    };

export function formlessCliUsage(): string {
  return [
    "Usage: formless <command>",
    "",
    "Commands:",
    "  dev [--workspace <path>] [--open]   Run local workspace and browser setup",
    "  save [--workspace <path>] [--check] Save Authority state to record source and app archives",
    "  pull [--workspace <path>] [--target <alias>]",
    "                                      Pull remote instance state into workspace source",
    "  push [--workspace <path>] [--target <alias>]",
    "       [--apply] [--replace] [--allow-stale] [--replace-install-set]",
    "  deploy [--workspace <path>] [--target <alias>] [--dry-run]",
    "       [--migration-policy <new|existing>] Deploy workspace source and desired resources",
    "  destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
    "  owner setup [--workspace <path>] [--target <alias>]",
    "       [--open] [--admin-token <token>]",
    "  token <adopt|rotate> [--workspace <path>] [--target <alias>]",
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
    case "pull":
      return parseWorkspacePullArgs(rest);
    case "push":
      return parseWorkspacePushArgs(rest);
    case "deploy":
      return parseWorkspaceDeployArgs(rest);
    case "destroy":
      return parseWorkspaceDestroyArgs(rest);
    case "owner":
      return parseWorkspaceOwnerArgs(rest);
    case "token":
      return parseWorkspaceTokenArgs(rest);
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

function requireWorkspaceCliOperation(commandName: string, operationKind: WorkspaceOperationKind) {
  const definition = workspaceOperationDefinitionForCliCommand(commandName);

  if (definition.kind !== operationKind) {
    throw new Error(
      `Workspace CLI command "${commandName}" is bound to operation "${definition.kind}", expected "${operationKind}".`,
    );
  }
}

function workspaceOperationBooleanDefault(
  operationKind: WorkspaceOperationKind,
  fieldKey: string,
): boolean {
  const defaultValue = workspaceOperationInputFieldDefaultValue(operationKind, fieldKey);

  if (typeof defaultValue !== "boolean") {
    throw new Error(
      `Workspace operation "${operationKind}" input field "${fieldKey}" does not declare a boolean default.`,
    );
  }

  return defaultValue;
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
  requireWorkspaceCliOperation("formless save", "save");
  const options = parseTopLevelWorkspaceOptions(
    args,
    "formless save [--workspace <path>] [--check]",
  );
  let check = workspaceOperationBooleanDefault("save", "check");

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

function parseWorkspaceDeployArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelTargetOptions(
    args,
    "formless deploy [--workspace <path>] [--target <alias>] [--dry-run] [--migration-policy <new|existing>]",
  );
  let dryRun = false;
  let migrationPolicy: "existing" | "new" | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

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

  requireWorkspaceCliOperation(
    dryRun ? "formless deploy --dry-run" : "formless deploy",
    dryRun ? "deployPlan" : "deployApply",
  );

  return {
    dryRun,
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

function parseWorkspacePullArgs(args: string[]): FormlessCliCommand {
  requireWorkspaceCliOperation("formless pull", "pull");
  const options = parseTopLevelTargetOptions(
    args,
    "formless pull [--workspace <path>] [--target <alias>]",
  );

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for formless pull: ${options.rest[0]}`);
  }

  return {
    kind: "workspacePull",
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseWorkspacePushArgs(args: string[]): FormlessCliCommand {
  requireWorkspaceCliOperation("formless push", "push");
  const options = parseTopLevelTargetOptions(
    args,
    "formless push [--workspace <path>] [--target <alias>]",
  );
  let allowStale = workspaceOperationBooleanDefault("push", "allowStale");
  let apply = workspaceOperationBooleanDefault("push", "apply");
  let replace = workspaceOperationBooleanDefault("push", "replace");
  let replaceInstallSet = workspaceOperationBooleanDefault("push", "replaceInstallSet");

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

    throw new Error(`Unknown option for formless push: ${arg}`);
  }

  return {
    allowStale,
    apply,
    kind: "workspacePush",
    replace,
    replaceInstallSet,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseWorkspaceTokenArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "adopt":
      return parseWorkspaceTokenCommandArgs(rest, "formless token adopt", "workspaceTokenAdopt");
    case "rotate":
      return parseWorkspaceTokenCommandArgs(rest, "formless token rotate", "workspaceTokenRotate");
    default:
      throw new Error("Usage: formless token <adopt|rotate>");
  }
}

function parseWorkspaceTokenCommandArgs<
  TKind extends "workspaceTokenAdopt" | "workspaceTokenRotate",
>(args: string[], usage: string, kind: TKind): Extract<FormlessCliCommand, { kind: TKind }> {
  const options = parseTopLevelTargetOptions(args, usage);
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

function parseWorkspaceOwnerArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "setup":
      return parseWorkspaceOwnerSetupArgs(rest);
    default:
      throw new Error("Usage: formless owner <setup>");
  }
}

function parseWorkspaceOwnerSetupArgs(args: string[]): FormlessCliCommand {
  const options = parseTopLevelTargetOptions(args, "formless owner setup");
  let adminToken: string | null = null;
  let open = false;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    if (arg === "--open") {
      open = true;
      continue;
    }

    throw new Error(`Unknown option for formless owner setup: ${arg}`);
  }

  return {
    adminToken,
    kind: "workspaceOwnerSetup",
    open,
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
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

function parseCliTargetAlias(value: string): string {
  return parseInstanceWorkspaceTargetAlias("Formless instance workspace target alias", value);
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}
