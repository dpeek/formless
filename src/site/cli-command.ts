import {
  parseInstanceWorkspaceTargetAlias,
  workspaceCliOperationDefinitions,
  workspaceOperationInputDefaults,
  type WorkspaceCliCommandName,
  type WorkspaceCliOperationDefinition,
  type WorkspaceCliOperationKind,
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
    ...workspaceCliOperationUsageLines(),
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

  const workspaceOperation = workspaceCliOperationDefinitionForTopLevelCommand(command);
  if (workspaceOperation) {
    return parseWorkspaceCliOperationArgs(workspaceOperation, rest);
  }

  switch (command) {
    case "dev":
      return parseWorkspaceDevArgs(rest);
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

function workspaceCliOperationUsageLines(): string[] {
  return workspaceCliOperationDefinitions().flatMap((definition) => [
    `  ${workspaceCliOperationUsage(definition)}`,
    `                                      ${definition.label}`,
  ]);
}

function workspaceCliOperationUsage(definition: WorkspaceCliOperationDefinition): string {
  return [
    workspaceCliTopLevelCommand(singleWorkspaceCliCommand(definition)),
    ...workspaceCliOperationOptionSyntax(definition),
  ].join(" ");
}

function workspaceCliOperationOptionSyntax(definition: WorkspaceCliOperationDefinition): string[] {
  const allowed = workspaceCliOperationInputFieldSet(definition);
  const orderedFieldKeys = ["workspacePath", "targetAlias", "dryRun"];

  return orderedFieldKeys.flatMap((fieldKey) => {
    if (!allowed.has(fieldKey)) {
      return [];
    }

    switch (fieldKey) {
      case "workspacePath":
        return ["[--workspace <path>]"];
      case "targetAlias":
        return ["[--target <alias>]"];
      case "dryRun":
        return ["[--dry-run]"];
      default:
        return [];
    }
  });
}

function workspaceCliOperationDefinitionForTopLevelCommand(
  command: string,
): WorkspaceCliOperationDefinition | undefined {
  return workspaceCliOperationDefinitions().find((definition) =>
    definition.bindings.cli.commands.some(
      (cliCommand) => workspaceCliTopLevelCommand(cliCommand) === command,
    ),
  );
}

function parseWorkspaceCliOperationArgs(
  definition: WorkspaceCliOperationDefinition,
  args: string[],
): FormlessCliCommand {
  const operationKind: string = definition.kind;

  switch (definition.kind) {
    case "pull":
      return parseWorkspaceSourceSyncCliOperationArgs(definition, args, "workspacePull");
    case "push":
      return parseWorkspaceSourceSyncCliOperationArgs(definition, args, "workspacePush");
    default:
      throw new Error(`Workspace CLI operation "${operationKind}" is not supported.`);
  }
}

function parseWorkspaceSourceSyncCliOperationArgs<TKind extends "workspacePull" | "workspacePush">(
  definition: Extract<WorkspaceCliOperationDefinition, { readonly kind: "pull" | "push" }>,
  args: string[],
  kind: TKind,
): Extract<FormlessCliCommand, { kind: TKind }> {
  const commandName = singleWorkspaceCliCommand(definition);
  const usage = workspaceCliOperationUsage(definition);
  const allowed = workspaceCliOperationInputFieldSet(definition);
  let dryRun = workspaceCliOperationBooleanDefault(definition.kind, "dryRun");
  let targetAlias: string | null = null;
  let workspacePath: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage}`);
    }

    if (arg === "--workspace" && allowed.has("workspacePath")) {
      workspacePath = readOptionValue(args, index, "--workspace");
      index += 1;
      continue;
    }

    if (arg === "--target" && allowed.has("targetAlias")) {
      targetAlias = parseCliTargetAlias(readOptionValue(args, index, "--target"));
      index += 1;
      continue;
    }

    if (arg === "--dry-run" && allowed.has("dryRun")) {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown option for ${commandName}: ${arg}`);
  }

  return {
    dryRun,
    kind,
    targetAlias,
    workspacePath,
  } as Extract<FormlessCliCommand, { kind: TKind }>;
}

function workspaceCliOperationBooleanDefault(
  kind: WorkspaceCliOperationKind,
  fieldKey: string,
): boolean {
  const value = workspaceOperationInputDefaults(kind)[fieldKey];

  if (typeof value === "boolean") {
    return value;
  }

  return false;
}

function workspaceCliOperationInputFieldSet(
  definition: WorkspaceCliOperationDefinition,
): Set<string> {
  const allowed = new Set<string>();

  for (const field of definition.input.fields) {
    const fieldKey: string = field.key;

    switch (fieldKey) {
      case "dryRun":
      case "targetAlias":
      case "workspacePath":
        allowed.add(fieldKey);
        break;
      default:
        throw new Error(
          `Workspace CLI operation "${definition.kind}" exposes unsupported public input field "${fieldKey}".`,
        );
    }
  }

  return allowed;
}

function singleWorkspaceCliCommand(
  definition: WorkspaceCliOperationDefinition,
): WorkspaceCliCommandName {
  const [command] = definition.bindings.cli.commands;

  if (definition.bindings.cli.commands.length !== 1 || !command) {
    throw new Error(
      `Workspace CLI operation "${definition.kind}" must expose exactly one public command binding.`,
    );
  }

  return command;
}

function workspaceCliTopLevelCommand(command: WorkspaceCliCommandName): string {
  const prefix = "formless ";

  if (!command.startsWith(prefix)) {
    throw new Error(`Workspace CLI command "${command}" must start with "formless ".`);
  }

  const topLevelCommand = command.slice(prefix.length);

  if (!topLevelCommand || topLevelCommand.includes(" ")) {
    throw new Error(`Workspace CLI command "${command}" must be a top-level command.`);
  }

  return topLevelCommand;
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
