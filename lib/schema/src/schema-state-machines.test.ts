import { describe, expect, it } from "vite-plus/test";

import {
  getOperationHandlerCapabilities,
  parseAppSchema,
  requiredOperationHandlerObjectInput,
  requiredOperationHandlerStringRecordIdInput,
  stringifySchema,
} from "./index.ts";

describe("schema state machines", () => {
  it("parses enum-backed state machines, transition operations, events, and stringify output", () => {
    const schema = parseAppSchema(stateMachineSchema());

    expect(schema.entities.task?.stateMachines?.statusFlow).toEqual({
      field: "status",
      initial: "todo",
      states: ["todo", "doing", "done"],
      terminal: ["done"],
      transitions: {
        start: { label: "Start", from: ["todo"], to: "doing" },
        finish: { label: "Finish", from: ["doing"], to: "done" },
        reopen: {
          label: "Reopen",
          from: ["doing"],
          to: "todo",
        },
      },
      event: {
        entity: "task-event",
        fields: {
          sourceEntity: "sourceEntity",
          sourceRecordId: "sourceRecordId",
          transitionKey: "transitionKey",
          previousState: "previousState",
          nextState: "nextState",
          actorMode: "actorMode",
          occurredAt: "occurredAt",
        },
      },
    });
    expect(schema.entities.task?.operations?.startWork.effect).toEqual({
      type: "operationHandler",
      handler: "transition-state",
      config: {
        machine: "statusFlow",
        transition: "start",
      },
    });
    expect(schema.entities.task?.operations?.startWork).toMatchObject({
      label: "Start work",
      kind: "command",
      policy: { actors: ["owner"] },
    });
    expect(getOperationHandlerCapabilities("transition-state")).toEqual({
      createAfterCreateHook: false,
      publicExecution: false,
      input: requiredOperationHandlerObjectInput({
        recordId: requiredOperationHandlerStringRecordIdInput(),
      }),
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid state-machine declarations", () => {
    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: { field: "missing" },
        }),
      ),
    ).toThrow('field references unknown field "task.missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: { field: "done" },
        }),
      ),
    ).toThrow('field "done" must be an enum field');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          fields: {
            status: { ...taskFields().status, required: false },
          },
        }),
      ),
    ).toThrow('field "status" must be required');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: { initial: "missing" },
        }),
      ),
    ).toThrow('initial references unknown state "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          fields: {
            status: { ...taskFields().status, default: "doing" },
          },
        }),
      ),
    ).toThrow('field "status" default must match initial state');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            transitions: {
              reopen: { label: "Reopen", from: ["done"], to: "doing" },
            },
          },
        }),
      ),
    ).toThrow('from state "done" is terminal');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            transitions: {
              reopen: {
                label: "Reopen",
                from: ["doing"],
                to: "todo",
                allowTerminalRecovery: true,
              },
            },
          },
        }),
      ),
    ).toThrow('transitions.reopen has unsupported key "allowTerminalRecovery"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          extraStateMachines: {
            duplicateStatusFlow: {
              ...statusFlowMachine(),
            },
          },
        }),
      ),
    ).toThrow('field "status" is already owned by another state machine');
  });

  it("rejects invalid transition event mappings", () => {
    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            event: {
              entity: "missing",
              fields: transitionEventFields(),
            },
          },
        }),
      ),
    ).toThrow('event references unknown entity "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          eventFields: {
            occurredAt: { type: "text", required: true },
          },
        }),
      ),
    ).toThrow("fields.occurredAt must reference a date field");

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          machine: {
            event: {
              entity: "task-event",
              fields: {
                ...transitionEventFields(),
                nextState: "missing",
              },
            },
          },
        }),
      ),
    ).toThrow('fields.nextState references unknown field "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          eventFields: {
            label: { type: "text", required: true },
          },
        }),
      ),
    ).toThrow('target entity requires field "label" to have a default or event mapping');
  });

  it("rejects invalid transition-state operations and anonymous public access", () => {
    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          operation: {
            effect: {
              ...transitionEffect(),
              config: { ...transitionEffect().config, machine: "missing" },
            },
          },
        }),
      ),
    ).toThrow('references unknown state machine "missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          operation: {
            effect: {
              ...transitionEffect(),
              config: { ...transitionEffect().config, transition: "missing" },
            },
          },
        }),
      ),
    ).toThrow('references unknown transition "statusFlow.missing"');

    expect(() =>
      parseAppSchema(
        stateMachineSchema({
          operation: {
            policy: {
              actors: ["anonymous"],
              access: {
                actor: "anonymous",
                challenge: { kind: "turnstile" },
                origin: { kind: "same-origin" },
              },
            },
            input: {
              fields: {
                reason: { type: "text", required: true },
              },
            },
          },
        }),
      ),
    ).toThrow("command effect is not eligible for public execution");
  });
});

function stateMachineSchema(
  overrides: {
    eventFields?: Record<string, unknown>;
    extraStateMachines?: Record<string, unknown>;
    fields?: Record<string, unknown>;
    machine?: Record<string, unknown>;
    operation?: Record<string, unknown>;
  } = {},
) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          ...taskFields(),
          ...overrides.fields,
        },
        stateMachines: {
          statusFlow: {
            ...statusFlowMachine(),
            ...overrides.machine,
          },
          ...overrides.extraStateMachines,
        },
        operations: {
          startWork: {
            label: "Start work",
            kind: "command",
            scope: "record",
            effect: transitionEffect(),
            policy: { actors: ["owner"] },
            ...overrides.operation,
          },
        },
      },
      "task-event": {
        label: "Task event",
        fields: {
          sourceEntity: { type: "text", required: true },
          sourceRecordId: { type: "text", required: true },
          transitionKey: { type: "text", required: true },
          previousState: { type: "text", required: true },
          nextState: { type: "text", required: true },
          actorMode: { type: "text", required: true },
          occurredAt: { type: "date", required: true },
          ...overrides.eventFields,
        },
      },
    },
    queries: {
      taskAll: { label: "All", entity: "task", expression: { kind: "all" } },
    },
    itemViews: {
      taskItem: {
        entity: "task",
        fields: {
          title: { editor: "text", commit: "field-commit" },
          status: { editor: "enum", commit: "immediate" },
        },
      },
    },
    tableViews: {},
    views: {
      taskHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskItem" },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Home",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    },
  };
}

function transitionEffect() {
  return {
    type: "operationHandler",
    handler: "transition-state",
    config: {
      machine: "statusFlow",
      transition: "start",
    },
  };
}

function taskFields() {
  return {
    title: { type: "text", required: true },
    done: { type: "boolean", required: true, default: false },
    status: {
      type: "enum",
      required: true,
      default: "todo",
      values: {
        todo: { label: "Todo" },
        doing: { label: "Doing" },
        done: { label: "Done" },
      },
    },
  } as const;
}

function statusFlowMachine() {
  return {
    field: "status",
    initial: "todo",
    states: ["todo", "doing", "done"],
    terminal: ["done"],
    transitions: {
      start: { label: "Start", from: ["todo"], to: "doing" },
      finish: { label: "Finish", from: ["doing"], to: "done" },
      reopen: {
        label: "Reopen",
        from: ["doing"],
        to: "todo",
      },
    },
    event: {
      entity: "task-event",
      fields: transitionEventFields(),
    },
  } as const;
}

function transitionEventFields() {
  return {
    sourceEntity: "sourceEntity",
    sourceRecordId: "sourceRecordId",
    transitionKey: "transitionKey",
    previousState: "previousState",
    nextState: "nextState",
    actorMode: "actorMode",
    occurredAt: "occurredAt",
  } as const;
}
