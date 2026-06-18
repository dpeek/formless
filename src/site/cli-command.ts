import {
  parseInstanceWorkspaceTargetAlias,
  workspaceOperationDefinitionForCliCommand,
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
      kind: "workspaceDev";
      open: boolean;
      reset: boolean;
      workspacePath: string | null;
    }
  | {
      adminToken: string | null;
      kind: "workspaceOwnerSetup";
      open: boolean;
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      dryRun: boolean;
      kind: "workspacePull";
      targetAlias: string | null;
      workspacePath: string | null;
    }
  | {
      dryRun: boolean;
      kind: "workspacePush";
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
    "  dev [--workspace <path>] [--open] [--reset]",
    "                                      Run local workspace and print browser session URL",
    "  save [--workspace <path>] [--check] Save Authority state to storage snapshots",
    "  pull [--workspace <path>] [--target <alias>] [--dry-run]",
    "                                      Sync selected target into workspace source",
    "  push [--workspace <path>] [--target <alias>] [--dry-run]",
    "                                      Sync workspace source to the selected target",
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

function parseWorkspaceDevArgs(args: string[]): FormlessCliCommand {
  const usage = "formless dev [--workspace <path>] [--open] [--reset]";
  const options = parseTopLevelWorkspaceOptions(args, usage);
  let open = false;
  let reset = false;

  for (const arg of options.rest) {
    if (arg === "--open") {
      open = true;
      continue;
    }

    if (arg === "--reset") {
      reset = true;
      continue;
    }

    throw new Error(`Unknown option for formless dev: ${arg}`);
  }

  return { kind: "workspaceDev", open, reset, workspacePath: options.workspacePath };
}

function parseWorkspaceSaveArgs(args: string[]): FormlessCliCommand {
  requireWorkspaceCliOperation("formless save", "save");
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
    "formless pull [--workspace <path>] [--target <alias>] [--dry-run]",
  );
  let dryRun = false;

  for (const arg of options.rest) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown option for formless pull: ${arg}`);
  }

  return {
    dryRun,
    kind: "workspacePull",
    targetAlias: options.targetAlias,
    workspacePath: options.workspacePath,
  };
}

function parseWorkspacePushArgs(args: string[]): FormlessCliCommand {
  requireWorkspaceCliOperation("formless push", "push");
  const options = parseTopLevelTargetOptions(
    args,
    "formless push [--workspace <path>] [--target <alias>] [--dry-run]",
  );
  let dryRun = false;

  for (const arg of options.rest) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown option for formless push: ${arg}`);
  }

  return {
    dryRun,
    kind: "workspacePush",
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
