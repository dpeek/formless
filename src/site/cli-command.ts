import {
  parseInstanceWorkspaceTargetAlias,
  workspaceOperationDefinitionForKind,
  workspaceOperationInputDefaults,
  type WorkspaceOperationDefinition,
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

type SiteCliWorkspaceOperationOptionField = "dryRun" | "targetAlias" | "workspacePath";

type SiteCliWorkspaceOperationOptionBinding = {
  fieldKey: SiteCliWorkspaceOperationOptionField;
  optionName: string;
  syntax: string;
};

type SiteCliWorkspaceOperationBindingContract = {
  command: string;
  dispatchKind: Extract<FormlessCliCommand["kind"], "workspacePull" | "workspacePush">;
  operationKind: Extract<WorkspaceOperationKind, "pull" | "push">;
  options: readonly SiteCliWorkspaceOperationOptionBinding[];
  terminalDescription: string;
  terminalLabel: string;
};

export const SITE_CLI_WORKSPACE_OPERATION_BINDINGS = [
  {
    command: "formless pull",
    dispatchKind: "workspacePull",
    operationKind: "pull",
    options: [
      { fieldKey: "workspacePath", optionName: "--workspace", syntax: "[--workspace <path>]" },
      { fieldKey: "targetAlias", optionName: "--target", syntax: "[--target <alias>]" },
      { fieldKey: "dryRun", optionName: "--dry-run", syntax: "[--dry-run]" },
    ],
    terminalDescription: "Workspace source pull",
    terminalLabel: "pull",
  },
  {
    command: "formless push",
    dispatchKind: "workspacePush",
    operationKind: "push",
    options: [
      { fieldKey: "workspacePath", optionName: "--workspace", syntax: "[--workspace <path>]" },
      { fieldKey: "targetAlias", optionName: "--target", syntax: "[--target <alias>]" },
      { fieldKey: "dryRun", optionName: "--dry-run", syntax: "[--dry-run]" },
    ],
    terminalDescription: "Workspace source push",
    terminalLabel: "push",
  },
] as const satisfies readonly SiteCliWorkspaceOperationBindingContract[];

export type SiteCliWorkspaceOperationBinding =
  (typeof SITE_CLI_WORKSPACE_OPERATION_BINDINGS)[number];

export type SiteCliWorkspaceOperationCommandName = SiteCliWorkspaceOperationBinding["command"];

export type SiteCliWorkspaceOperationKind = SiteCliWorkspaceOperationBinding["operationKind"];

const siteCliWorkspaceOperationBindingsByKind = new Map<
  SiteCliWorkspaceOperationKind,
  SiteCliWorkspaceOperationBinding
>(SITE_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => [binding.operationKind, binding]));

const siteCliWorkspaceOperationBindingsByCommand = new Map<
  SiteCliWorkspaceOperationCommandName,
  SiteCliWorkspaceOperationBinding
>(SITE_CLI_WORKSPACE_OPERATION_BINDINGS.map((binding) => [binding.command, binding]));

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

  const workspaceOperationBinding = siteCliWorkspaceOperationBindingForTopLevelCommand(command);
  if (workspaceOperationBinding) {
    return parseWorkspaceCliOperationArgs(workspaceOperationBinding, rest);
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
  return SITE_CLI_WORKSPACE_OPERATION_BINDINGS.flatMap((binding) => [
    `  ${workspaceCliOperationUsage(binding)}`,
    `                                      ${binding.terminalDescription}`,
  ]);
}

export function siteCliWorkspaceOperationCommandNameForKind(
  kind: SiteCliWorkspaceOperationKind,
): SiteCliWorkspaceOperationCommandName {
  return siteCliWorkspaceOperationBindingForKind(kind).command;
}

export function siteCliWorkspaceOperationBindingForKind(
  kind: SiteCliWorkspaceOperationKind,
): SiteCliWorkspaceOperationBinding {
  const binding = siteCliWorkspaceOperationBindingsByKind.get(kind);

  if (!binding) {
    throw new Error(`Workspace operation "${kind}" is not bound to a Site CLI command.`);
  }

  return binding;
}

export function siteCliWorkspaceOperationBindingForCommand(
  command: string,
): SiteCliWorkspaceOperationBinding {
  const binding = siteCliWorkspaceOperationBindingsByCommand.get(
    command as SiteCliWorkspaceOperationCommandName,
  );

  if (!binding) {
    throw new Error(`Site CLI command "${command}" is not bound to a workspace operation.`);
  }

  return binding;
}

function workspaceCliOperationUsage(binding: SiteCliWorkspaceOperationBinding): string {
  return [binding.terminalLabel, ...workspaceCliOperationOptionSyntax(binding)].join(" ");
}

function workspaceCliOperationOptionSyntax(binding: SiteCliWorkspaceOperationBinding): string[] {
  const definition = workspaceOperationDefinitionForKind(binding.operationKind);
  const allowed = workspaceCliOperationInputFieldSet(definition, binding);

  return binding.options.flatMap((option) => (allowed.has(option.fieldKey) ? [option.syntax] : []));
}

function siteCliWorkspaceOperationBindingForTopLevelCommand(
  command: string,
): SiteCliWorkspaceOperationBinding | undefined {
  return SITE_CLI_WORKSPACE_OPERATION_BINDINGS.find(
    (binding) => workspaceCliTopLevelCommand(binding.command) === command,
  );
}

function parseWorkspaceCliOperationArgs(
  binding: SiteCliWorkspaceOperationBinding,
  args: string[],
): FormlessCliCommand {
  const operationKind: string = binding.operationKind;

  switch (binding.operationKind) {
    case "pull":
      return parseWorkspaceSourceSyncCliOperationArgs(binding, args, "workspacePull");
    case "push":
      return parseWorkspaceSourceSyncCliOperationArgs(binding, args, "workspacePush");
    default:
      throw new Error(`Workspace CLI operation "${operationKind}" is not supported.`);
  }
}

function parseWorkspaceSourceSyncCliOperationArgs<TKind extends "workspacePull" | "workspacePush">(
  binding: SiteCliWorkspaceOperationBinding,
  args: string[],
  kind: TKind,
): Extract<FormlessCliCommand, { kind: TKind }> {
  const definition = workspaceOperationDefinitionForKind(binding.operationKind);
  const commandName = binding.command;
  const usage = workspaceCliOperationUsage(binding);
  const allowed = workspaceCliOperationInputFieldSet(definition, binding);
  let dryRun = workspaceCliOperationBooleanDefault(binding.operationKind, "dryRun");
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
  kind: WorkspaceOperationKind,
  fieldKey: string,
): boolean {
  const value = workspaceOperationInputDefaults(kind)[fieldKey];

  if (typeof value === "boolean") {
    return value;
  }

  return false;
}

function workspaceCliOperationInputFieldSet(
  definition: WorkspaceOperationDefinition,
  binding: SiteCliWorkspaceOperationBinding,
): Set<string> {
  const allowed = new Set<string>();
  const boundFieldKeys = new Set<string>(binding.options.map((option) => option.fieldKey));

  for (const field of definition.input.fields) {
    const fieldKey: string = field.key;

    if (!boundFieldKeys.has(fieldKey)) {
      throw new Error(
        `Site CLI command "${binding.command}" does not bind public input field "${fieldKey}".`,
      );
    }

    allowed.add(fieldKey);
  }

  return allowed;
}

function workspaceCliTopLevelCommand(command: SiteCliWorkspaceOperationCommandName): string {
  const prefix = "formless ";

  if (!command.startsWith(prefix)) {
    throw new Error(`Site CLI command "${command}" must start with "formless ".`);
  }

  const topLevelCommand = command.slice(prefix.length);

  if (!topLevelCommand || topLevelCommand.includes(" ")) {
    throw new Error(`Site CLI command "${command}" must be a top-level command.`);
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
