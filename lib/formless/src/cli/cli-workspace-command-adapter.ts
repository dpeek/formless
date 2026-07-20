import {
  WORKSPACE_OPERATION_CAPABILITIES,
  workspaceOperationDefinitionForKind,
  workspaceOperationInputDefaults,
  type PullWorkspaceOperationInput,
  type PushWorkspaceOperationInput,
  type WorkspaceOperationState,
} from "@dpeek/formless-workspace";

import {
  FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS,
  type FormlessCliCommand,
  type FormlessCliWorkspaceOperationBinding,
  type FormlessCliWorkspaceOperationCommandName,
} from "./cli-command.ts";
import {
  runFormlessWorkspaceOperation,
  type RunFormlessWorkspaceOperationDependencies,
} from "./instance-workspace-operations.ts";
import { formatCliWorkspaceOperationOutput } from "./cli-workspace-operation-formatter.ts";

export type FormlessCliParsedWorkspaceOperationCommand = Extract<
  FormlessCliCommand,
  { kind: "workspacePull" | "workspacePush" }
>;

export type FormlessCliWorkspaceOperationAdapterInput =
  | PullWorkspaceOperationInput
  | PushWorkspaceOperationInput;

export type FormlessCliWorkspaceOperationAdapterResult = {
  commandName: FormlessCliWorkspaceOperationCommandName;
  input: FormlessCliWorkspaceOperationAdapterInput;
};

export type FormlessCliWorkspaceOperationRunner = typeof runFormlessWorkspaceOperation;

export type FormlessCliWorkspaceOperationExecutionDependencies =
  RunFormlessWorkspaceOperationDependencies & {
    packageVersion: string;
    runWorkspaceOperation?: FormlessCliWorkspaceOperationRunner;
  };

export function formlessCliWorkspaceOperationInputForParsedCommand(
  command: FormlessCliParsedWorkspaceOperationCommand,
): FormlessCliWorkspaceOperationAdapterResult {
  return formlessCliWorkspaceOperationInputForBinding(
    command,
    formlessCliWorkspaceOperationBindingForParsedCommandKind(command.kind),
  );
}

export function formlessCliWorkspaceOperationInputForBinding(
  command: FormlessCliParsedWorkspaceOperationCommand,
  binding: FormlessCliWorkspaceOperationBinding,
): FormlessCliWorkspaceOperationAdapterResult {
  assertSupportedWorkspaceOperationKind(binding);
  assertBindingMatchesParsedCommand(command, binding);

  const fieldKeys = workspaceOperationInputFieldKeysForBinding(binding);
  const input = workspaceOperationInputDefaultsForBoundFields(binding, fieldKeys);

  for (const [fieldKey, value] of Object.entries(parsedCommandInputFields(command))) {
    if (!fieldKeys.has(fieldKey)) {
      throw new Error(
        `Formless CLI command "${binding.command}" received unbound public input field "${fieldKey}".`,
      );
    }

    input[fieldKey] = value;
  }

  return {
    commandName: binding.command,
    input: input as FormlessCliWorkspaceOperationAdapterInput,
  };
}

export async function runFormlessCliWorkspaceOperationCommand(
  command: FormlessCliParsedWorkspaceOperationCommand,
  dependencies: FormlessCliWorkspaceOperationExecutionDependencies,
): Promise<string> {
  const operation = formlessCliWorkspaceOperationInputForParsedCommand(command);
  const state = await runFormlessCliWorkspaceOperationInput(operation.input, dependencies);

  return formatCliWorkspaceOperationOutput(state);
}

async function runFormlessCliWorkspaceOperationInput(
  input: FormlessCliWorkspaceOperationAdapterInput,
  dependencies: FormlessCliWorkspaceOperationExecutionDependencies,
): Promise<WorkspaceOperationState> {
  const { runWorkspaceOperation = runFormlessWorkspaceOperation, ...operationDependencies } =
    dependencies;
  const state = await runWorkspaceOperation(input, operationDependencies, {
    actor: "cli",
    capabilities: WORKSPACE_OPERATION_CAPABILITIES,
  });

  if (state.status === "failed") {
    throw new Error(state.errors[0]?.message ?? "Workspace operation failed.");
  }

  return state;
}

function formlessCliWorkspaceOperationBindingForParsedCommandKind(
  kind: string,
): FormlessCliWorkspaceOperationBinding {
  const binding = FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS.find(
    (candidate) => candidate.dispatchKind === kind,
  );

  if (!binding) {
    throw new Error(`Formless CLI command kind "${kind}" is not bound to a workspace operation.`);
  }

  return binding;
}

function assertBindingMatchesParsedCommand(
  command: FormlessCliParsedWorkspaceOperationCommand,
  binding: FormlessCliWorkspaceOperationBinding,
): void {
  if (binding.dispatchKind !== command.kind) {
    throw new Error(
      `Formless CLI command "${binding.command}" dispatches "${binding.dispatchKind}", ` +
        `expected parsed command "${command.kind}".`,
    );
  }

  const expectedOperationKind = workspaceOperationKindForParsedCommand(command);

  if (binding.operationKind !== expectedOperationKind) {
    throw new Error(
      `Formless CLI command "${binding.command}" is bound to operation ` +
        `"${binding.operationKind}", expected "${expectedOperationKind}".`,
    );
  }
}

function assertSupportedWorkspaceOperationKind(
  binding: FormlessCliWorkspaceOperationBinding,
): void {
  const operationKind: string = binding.operationKind;

  switch (operationKind) {
    case "pull":
    case "push":
      return;
    default:
      throw new Error(`Workspace CLI operation "${operationKind}" is not supported.`);
  }
}

function workspaceOperationKindForParsedCommand(
  command: FormlessCliParsedWorkspaceOperationCommand,
): "pull" | "push" {
  switch (command.kind) {
    case "workspacePull":
      return "pull";
    case "workspacePush":
      return "push";
    default: {
      const commandKind = (command as { kind: string }).kind;

      throw new Error(
        `Formless CLI command kind "${commandKind}" is not bound to a workspace operation.`,
      );
    }
  }
}

function workspaceOperationInputFieldKeysForBinding(
  binding: FormlessCliWorkspaceOperationBinding,
): Set<string> {
  const definition = workspaceOperationDefinitionForKind(binding.operationKind);
  const definitionFieldKeys = new Set(definition.input.fields.map((field) => field.key));
  const boundFieldKeys = new Set<string>();

  for (const option of binding.options) {
    if (!definitionFieldKeys.has(option.fieldKey)) {
      throw new Error(
        `Formless CLI command "${binding.command}" binds unknown public input field ` +
          `"${option.fieldKey}" for workspace operation "${binding.operationKind}".`,
      );
    }

    boundFieldKeys.add(option.fieldKey);
  }

  for (const field of definition.input.fields) {
    if (!boundFieldKeys.has(field.key)) {
      throw new Error(
        `Formless CLI command "${binding.command}" does not bind public input field "${field.key}".`,
      );
    }
  }

  return definitionFieldKeys;
}

function workspaceOperationInputDefaultsForBoundFields(
  binding: FormlessCliWorkspaceOperationBinding,
  fieldKeys: Set<string>,
): Record<string, unknown> {
  const defaults = workspaceOperationInputDefaults(binding.operationKind);
  const input: Record<string, unknown> = { kind: binding.operationKind };

  for (const fieldKey of fieldKeys) {
    if (Object.prototype.hasOwnProperty.call(defaults, fieldKey)) {
      input[fieldKey] = defaults[fieldKey];
    }
  }

  return input;
}

function parsedCommandInputFields(
  command: FormlessCliParsedWorkspaceOperationCommand,
): Record<string, boolean | string | null> {
  switch (command.kind) {
    case "workspacePull":
      return {
        dryRun: command.dryRun,
        targetAlias: command.targetAlias,
        workspacePath: command.workspacePath,
      };
    case "workspacePush":
      return {
        dryRun: command.dryRun,
        ...(command.force ? { force: true } : {}),
        targetAlias: command.targetAlias,
        workspacePath: command.workspacePath,
      };
    default: {
      const commandKind = (command as { kind: string }).kind;

      throw new Error(
        `Formless CLI command kind "${commandKind}" is not bound to a workspace operation.`,
      );
    }
  }
}
