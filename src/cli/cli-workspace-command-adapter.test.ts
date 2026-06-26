import { describe, expect, it } from "vite-plus/test";
import {
  WORKSPACE_OPERATION_CAPABILITIES,
  WORKSPACE_OPERATION_STATE_FILE_KIND,
  WORKSPACE_OPERATION_STATE_FILE_VERSION,
  type WorkspaceOperationInput,
  type WorkspaceOperationState,
} from "@dpeek/formless-workspace";

import {
  FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS,
  type FormlessCliWorkspaceOperationBinding,
} from "./cli-command.ts";
import {
  formlessCliWorkspaceOperationInputForBinding,
  formlessCliWorkspaceOperationInputForParsedCommand,
  runFormlessCliWorkspaceOperationCommand,
} from "./cli-workspace-command-adapter.ts";

describe("CLI workspace command adapter", () => {
  it("translates parsed pull and push commands into workspace operation inputs", () => {
    expect(
      formlessCliWorkspaceOperationInputForParsedCommand({
        dryRun: true,
        kind: "workspacePull",
        targetAlias: "staging",
        workspacePath: "../personal",
      }),
    ).toEqual({
      commandName: "formless pull",
      input: {
        dryRun: true,
        kind: "pull",
        targetAlias: "staging",
        workspacePath: "../personal",
      },
    });

    expect(
      formlessCliWorkspaceOperationInputForParsedCommand({
        dryRun: true,
        force: true,
        kind: "workspacePush",
        targetAlias: "production",
        workspacePath: "../personal",
      }),
    ).toEqual({
      commandName: "formless push",
      input: {
        dryRun: true,
        force: true,
        kind: "push",
        targetAlias: "production",
        workspacePath: "../personal",
      },
    });
  });

  it("applies operation defaults without adding unrequested optional inputs", () => {
    const pull = formlessCliWorkspaceOperationInputForParsedCommand({
      dryRun: false,
      kind: "workspacePull",
      targetAlias: null,
      workspacePath: null,
    });
    const push = formlessCliWorkspaceOperationInputForParsedCommand({
      dryRun: false,
      force: false,
      kind: "workspacePush",
      targetAlias: null,
      workspacePath: null,
    });

    expect(pull.input).toEqual({
      dryRun: false,
      kind: "pull",
      targetAlias: null,
      workspacePath: null,
    });
    expect(push.input).toEqual({
      dryRun: false,
      kind: "push",
      targetAlias: null,
      workspacePath: null,
    });
    expect("force" in push.input).toBe(false);
  });

  it("runs parsed pull and push commands through the workspace operation runner as the CLI actor", async () => {
    const calls: Array<{
      input: WorkspaceOperationInput;
      packageVersion?: string;
      options: Parameters<NonNullable<ExecutionDependencies["runWorkspaceOperation"]>>[2];
    }> = [];
    const dependencies = executionDependencies({
      runWorkspaceOperation: async (input, dependencies, options) => {
        calls.push({
          input,
          packageVersion: dependencies.packageVersion,
          options,
        });

        return workspaceOperationState({ operation: input.kind });
      },
    });

    const pullOutput = await runFormlessCliWorkspaceOperationCommand(
      {
        dryRun: true,
        kind: "workspacePull",
        targetAlias: "staging",
        workspacePath: "../personal",
      },
      dependencies,
    );
    const pushOutput = await runFormlessCliWorkspaceOperationCommand(
      {
        dryRun: false,
        force: true,
        kind: "workspacePush",
        targetAlias: "production",
        workspacePath: "../personal",
      },
      dependencies,
    );

    expect(calls).toEqual([
      {
        input: {
          dryRun: true,
          kind: "pull",
          targetAlias: "staging",
          workspacePath: "../personal",
        },
        options: {
          actor: "cli",
          capabilities: WORKSPACE_OPERATION_CAPABILITIES,
        },
        packageVersion: "0.0.0-test",
      },
      {
        input: {
          dryRun: false,
          force: true,
          kind: "push",
          targetAlias: "production",
          workspacePath: "../personal",
        },
        options: {
          actor: "cli",
          capabilities: WORKSPACE_OPERATION_CAPABILITIES,
        },
        packageVersion: "0.0.0-test",
      },
    ]);
    expect(pullOutput.length).toBeGreaterThan(0);
    expect(pushOutput.length).toBeGreaterThan(0);
  });

  it("throws display-safe failed operation errors returned by the workspace operation runner", async () => {
    await expect(
      runFormlessCliWorkspaceOperationCommand(
        {
          dryRun: false,
          kind: "workspacePull",
          targetAlias: null,
          workspacePath: null,
        },
        executionDependencies({
          runWorkspaceOperation: async () =>
            workspaceOperationState({
              errors: [
                {
                  at: "2026-06-25T00:00:00.000Z",
                  message: "Remote source is unavailable.",
                },
              ],
              operation: "pull",
              status: "failed",
              summary: {
                fields: { error: "Remote source is unavailable." },
                title: "Operation failed",
              },
            }),
        }),
      ),
    ).rejects.toThrow("Remote source is unavailable.");
  });

  it("rejects binding mismatches before producing operation input", () => {
    const pullCommand = {
      dryRun: false,
      kind: "workspacePull",
      targetAlias: null,
      workspacePath: null,
    } as const;
    const pullBinding = FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS[0];
    const pushBinding = FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS[1];

    expect(() => formlessCliWorkspaceOperationInputForBinding(pullCommand, pushBinding)).toThrow(
      'Formless CLI command "formless push" dispatches "workspacePush", expected parsed command "workspacePull".',
    );
    expect(() =>
      formlessCliWorkspaceOperationInputForBinding(pullCommand, {
        ...pullBinding,
        options: pullBinding.options.filter((option) => option.fieldKey !== "dryRun"),
      } as unknown as FormlessCliWorkspaceOperationBinding),
    ).toThrow('Formless CLI command "formless pull" does not bind public input field "dryRun".');
    expect(() =>
      formlessCliWorkspaceOperationInputForBinding(pullCommand, {
        ...pullBinding,
        options: [
          ...pullBinding.options,
          { fieldKey: "force", optionName: "--force", syntax: "[--force]" },
        ],
      } as unknown as FormlessCliWorkspaceOperationBinding),
    ).toThrow(
      'Formless CLI command "formless pull" binds unknown public input field "force" for workspace operation "pull".',
    );
  });

  it("rejects unsupported parsed and workspace operation commands", () => {
    expect(() =>
      formlessCliWorkspaceOperationInputForParsedCommand({
        confirm: "personal",
        kind: "workspaceDestroy",
        targetAlias: null,
        workspacePath: null,
      } as never),
    ).toThrow(
      'Formless CLI command kind "workspaceDestroy" is not bound to a workspace operation.',
    );

    expect(() =>
      formlessCliWorkspaceOperationInputForBinding(
        {
          dryRun: false,
          force: false,
          kind: "workspacePush",
          targetAlias: null,
          workspacePath: null,
        },
        {
          ...FORMLESS_CLI_WORKSPACE_OPERATION_BINDINGS[1],
          operationKind: "save",
        } as never,
      ),
    ).toThrow('Workspace CLI operation "save" is not supported.');
  });
});

type ExecutionDependencies = Parameters<typeof runFormlessCliWorkspaceOperationCommand>[1];

function executionDependencies(
  overrides: Partial<ExecutionDependencies> = {},
): ExecutionDependencies {
  return {
    cwd: "/workspace",
    fetch,
    now: () => "2026-06-25T00:00:00.000Z",
    packageVersion: "0.0.0-test",
    ...overrides,
  };
}

function workspaceOperationState(
  overrides: Partial<WorkspaceOperationState> = {},
): WorkspaceOperationState {
  const operation = overrides.operation ?? "pull";

  return {
    actor: "cli",
    createdAt: "2026-06-25T00:00:00.000Z",
    errors: [],
    events: [],
    id: "operation_1",
    input: {},
    kind: WORKSPACE_OPERATION_STATE_FILE_KIND,
    logs: [],
    operation,
    result: {
      summary: {
        fields: {},
        title: "Operation complete",
      },
    },
    status: "succeeded",
    summary: {
      fields: {},
      title: "Operation complete",
    },
    updatedAt: "2026-06-25T00:00:00.000Z",
    version: WORKSPACE_OPERATION_STATE_FILE_VERSION,
    workspace: {
      label: "Workspace",
    },
    ...overrides,
  };
}
