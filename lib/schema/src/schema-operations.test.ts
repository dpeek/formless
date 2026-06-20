import { describe, expect, it } from "vite-plus/test";

import {
  classifyCollectionOperationBinding,
  classifyTableOperationBinding,
  entityOperationBindingKinds,
  entityOperationCommandEffectTypes,
  formatEntityOperationKey,
  isEntityOperationBindingKind,
  isEntityOperationCommandEffect,
  isEntityOperationReadKind,
  isEntityOperationWriteKind,
  operationHandlerKinds,
  parseAppSchema,
  parseEntityOperationKey,
  stringifySchema,
} from "./index.ts";

describe("schema entity operations", () => {
  it("parses explicit entity-local operations and preserves operation output contracts", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        activeList: {
          kind: "list",
          scope: "collection",
          target: { query: "taskActive" },
        },
        get: {
          kind: "get",
          scope: "record",
        },
        create: {
          kind: "create",
          scope: "collection",
          input: {
            fields: {
              title: { field: "title", required: true },
              dueDate: { field: "dueDate" },
            },
          },
          effect: { type: "createRecord" },
          policy: { actors: ["owner"], visible: true },
          audit: { input: "hash" },
          idempotency: { required: true, source: "caller" },
        },
        update: {
          kind: "update",
          scope: "record",
          input: {
            fields: {
              title: { field: "title" },
              done: { field: "done" },
              dueDate: { field: "dueDate" },
            },
          },
          effect: { type: "patchRecord" },
        },
        delete: {
          kind: "delete",
          scope: "record",
          effect: { type: "tombstoneRecord", entity: "task" },
          idempotency: { required: true, source: "runtime" },
        },
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          effect: {
            type: "operationHandler",
            handler: "clear-completed",
            config: { query: "taskCompleted" },
          },
        },
        annotate: {
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          input: {
            fields: {
              note: { type: "text", required: true, label: "Note" },
              severity: {
                type: "enum",
                required: false,
                values: {
                  low: { label: "Low" },
                  high: { label: "High" },
                },
              },
            },
          },
          effect: {
            type: "operationHandler",
            handler: "clear-completed",
            config: { query: "taskCompleted" },
          },
          policy: {
            actors: ["owner"],
          },
          audit: { input: "summary" },
        },
      }),
    );
    const operations = schema.entities.task?.operations;

    expect(formatEntityOperationKey({ entityKey: "task", operationKey: "create" })).toBe(
      "task.create",
    );
    expect(parseEntityOperationKey("Operation", "task.clearCompletedTasks")).toEqual({
      entityKey: "task",
      operationKey: "clearCompletedTasks",
    });
    expect(operations?.activeList).toMatchObject({
      kind: "list",
      scope: "collection",
      target: { query: "taskActive" },
      output: { type: "list", query: "taskActive" },
      idempotency: { required: false },
    });
    expect(operations?.create).toMatchObject({
      kind: "create",
      scope: "collection",
      output: { type: "create" },
      effect: { type: "createRecord" },
      idempotency: { required: true, source: "caller" },
      audit: { input: "hash" },
    });
    expect(operations?.delete).toMatchObject({
      kind: "delete",
      scope: "record",
      output: { type: "delete" },
      effect: { type: "tombstoneRecord", entity: "task" },
      idempotency: { required: true, source: "runtime" },
    });
    expect(operations?.clearCompletedTasks).toMatchObject({
      kind: "command",
      scope: "collection",
      target: { query: "taskCompleted" },
      effect: {
        type: "operationHandler",
        handler: "clear-completed",
        config: { query: "taskCompleted" },
      },
      output: { type: "command" },
    });
    expect(operations?.annotate.input).toEqual({
      fields: {
        note: { type: "text", required: true, label: "Note" },
        severity: {
          type: "enum",
          required: false,
          values: {
            low: { label: "Low" },
            high: { label: "High" },
          },
        },
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("classifies operations, operation bindings, and command effects", () => {
    const schema = parseAppSchema(
      schemaWithTaskLogOperations({
        activeList: {
          kind: "list",
          scope: "collection",
          target: { query: "taskActive" },
        },
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          effect: {
            type: "operationHandler",
            handler: "clear-completed",
            config: { query: "taskCompleted" },
          },
        },
        submitIntake: recordPlanOperation(),
      }),
    );
    const operations = schema.entities.task?.operations;
    const clearCompletedEffect = operations?.clearCompletedTasks.effect;
    const submitIntakeEffect = operations?.submitIntake.effect;
    const binding = classifyCollectionOperationBinding({
      operation: "task.clearCompletedTasks",
      count: { type: "count" },
    });
    const tableBinding = classifyTableOperationBinding({
      operation: "task.update",
      editView: "taskEdit",
    });

    expect(isEntityOperationReadKind("list")).toBe(true);
    expect(isEntityOperationReadKind("command")).toBe(false);
    expect(isEntityOperationWriteKind("command")).toBe(true);
    expect(entityOperationBindingKinds).toEqual(["collection", "table"]);
    expect(isEntityOperationBindingKind(binding.kind)).toBe(true);
    expect(isEntityOperationBindingKind(tableBinding.kind)).toBe(true);
    expect(binding).toEqual({
      kind: "collection",
      operationKey: { entityKey: "task", operationKey: "clearCompletedTasks" },
      canonicalOperationKey: "task.clearCompletedTasks",
    });
    expect(tableBinding).toEqual({
      kind: "table",
      operationKey: { entityKey: "task", operationKey: "update" },
      canonicalOperationKey: "task.update",
    });
    expect(operationHandlerKinds).toContain("create-tree-child");
    expect(entityOperationCommandEffectTypes).toEqual(["operationHandler", "recordPlan"]);
    expect(isEntityOperationCommandEffect(clearCompletedEffect)).toBe(true);
    expect(isEntityOperationCommandEffect(submitIntakeEffect)).toBe(true);
  });

  it("rejects unsupported action-backed command effects", () => {
    expect(() =>
      parseAppSchema(
        schemaWithTaskOperations({
          clearCompletedTasks: {
            label: "Clear completed",
            kind: "command",
            scope: "collection",
            target: { query: "taskCompleted" },
            effect: {
              type: "runActionKind",
              kind: "clear-completed",
              action: "clearCompletedTasks",
              query: "taskCompleted",
            },
            policy: {
              actors: ["anonymous"],
              access: anonymousPublicAccess(),
            },
            audit: { input: "summary" },
          },
        }),
      ),
    ).toThrow('has unsupported type "runActionKind"');
  });

  it("rejects source entity actions and mutation policies", () => {
    expect(() =>
      parseAppSchema(
        baseTaskSchema({
          entities: {
            task: taskEntity({
              actions: {
                subscribePublic: {
                  label: "Subscribe",
                  kind: "subscribe",
                  access: anonymousPublicAccess(),
                  publicInput: {
                    fields: {
                      email: { type: "text", required: true, label: "Email" },
                    },
                  },
                },
              },
            }),
          },
        }),
      ),
    ).toThrow('Entity "task" has unsupported key "actions"');

    expect(() =>
      parseAppSchema(
        baseTaskSchema({
          entities: {
            task: taskEntity({
              mutations: {
                create: { enabled: true },
                patch: { enabled: true },
                delete: { enabled: false },
              },
            }),
          },
        }),
      ),
    ).toThrow('Entity "task" has unsupported key "mutations"');
  });

  it("does not synthesize operation bindings without source-declared operations", () => {
    const schema = parseAppSchema(baseTaskSchema());
    const view = schema.views.taskHome;

    if (view?.type !== "collection") {
      throw new Error("Missing taskHome collection view.");
    }

    expect(schema.entities.task?.operations).toBeUndefined();
    expect(schema.entities.task).not.toHaveProperty("actions");
    expect(schema.entities.task).not.toHaveProperty("mutations");
    expect(view.operations).toBeUndefined();

    expect(() =>
      parseAppSchema(
        baseTaskSchema({
          views: {
            taskHome: taskHomeCollectionView({
              operations: [{ operation: "task.clearCompletedTasks" }],
            }),
          },
        }),
      ),
    ).toThrow('references unknown operation "task.clearCompletedTasks"');
  });

  it("does not project runtime action or mutation state from source-declared operations", () => {
    const schema = parseAppSchema(
      schemaWithTaskOperations({
        create: {
          kind: "create",
          scope: "collection",
          effect: { type: "createRecord" },
        },
        update: {
          kind: "update",
          scope: "record",
          effect: { type: "patchRecord" },
        },
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: { query: "taskCompleted" },
          effect: {
            type: "operationHandler",
            handler: "clear-completed",
            config: { query: "taskCompleted" },
          },
        },
      }),
    );

    expect(schema.entities.task).not.toHaveProperty("mutations");
    expect(schema.entities.task).not.toHaveProperty("actions");
    expect(schema.entities.task?.operations?.clearCompletedTasks.effect).toEqual({
      type: "operationHandler",
      handler: "clear-completed",
      config: { query: "taskCompleted" },
    });
  });

  it("keeps browser-hidden collection operation bindings parseable for client selection", () => {
    const schema = parseAppSchema(
      baseTaskSchema({
        entities: {
          task: {
            ...taskEntity(),
            operations: {
              hiddenOwner: {
                label: "Hidden owner",
                kind: "command",
                scope: "collection",
                effect: {
                  type: "operationHandler",
                  handler: "clear-completed",
                  config: { query: "taskCompleted" },
                },
                policy: { actors: ["owner"], visible: false },
              },
              runnerOnly: {
                label: "Runner only",
                kind: "command",
                scope: "collection",
                effect: {
                  type: "operationHandler",
                  handler: "clear-completed",
                  config: { query: "taskCompleted" },
                },
                policy: { actors: ["runner"] },
              },
            },
          },
        },
        views: {
          taskHome: {
            type: "collection",
            label: "Tasks",
            entity: "task",
            queries: [{ query: "taskAll" }],
            defaultQuery: "taskAll",
            result: { type: "list", itemView: "taskItem" },
            operations: [{ operation: "task.hiddenOwner" }, { operation: "task.runnerOnly" }],
          },
        },
      }),
    );
    const view = schema.views.taskHome;

    if (view?.type !== "collection") {
      throw new Error("Missing taskHome collection view.");
    }

    expect(view.operations).toEqual([
      { operation: "task.hiddenOwner" },
      { operation: "task.runnerOnly" },
    ]);
  });

  it("parses command record-plan effects with ordered named steps", () => {
    const schema = parseAppSchema(
      schemaWithTaskLogOperations({
        submitIntake: recordPlanOperation(),
      }),
    );
    const effect = schema.entities.task?.operations?.submitIntake.effect;

    expect(effect).toEqual({
      type: "recordPlan",
      steps: [
        {
          name: "createTask",
          kind: "create",
          entity: "task",
          recordId: { kind: "generatedId", prefix: "task" },
          values: {
            title: { kind: "input", field: "title" },
            done: { kind: "literal", value: false },
            dueDate: { kind: "generatedTimestamp" },
          },
        },
        {
          name: "createLog",
          kind: "create",
          entity: "task-log",
          values: {
            task: {
              kind: "reference",
              entity: "task",
              id: { kind: "stepOutput", step: "createTask", output: "id" },
            },
            label: { kind: "input", field: "note" },
            actorMode: { kind: "actor", field: "mode" },
            sourcePath: { kind: "source", field: "path" },
            occurredAt: { kind: "generatedTimestamp" },
          },
        },
        {
          name: "touchTask",
          kind: "patch",
          entity: "task",
          recordId: { kind: "stepOutput", step: "createTask", output: "id" },
          values: {
            title: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
          },
        },
      ],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid command record-plan declarations", () => {
    const invalidCases = [
      {
        operations: {
          submitIntake: {
            kind: "create",
            scope: "collection",
            input: { fields: { title: { field: "title" } } },
            effect: recordPlanEffect(),
          },
        },
        message: "type is only valid for command operations",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({ effect: recordPlanEffect({ provider: "mail" }) }),
        },
        message: 'has unsupported key "provider"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [{ ...createTaskStep(), entity: "crm:task" }],
            }),
          }),
        },
        message: "must target an entity from the same schema",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [{ ...createTaskStep(), entity: "missing" }],
            }),
          }),
        },
        message: 'references unknown entity "missing"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { missing: { kind: "literal", value: "x" } },
                },
              ],
            }),
          }),
        },
        message: 'references unknown field "missing"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { updatedAt: { kind: "generatedTimestamp" } },
                },
              ],
            }),
          }),
        },
        message: 'must not target system field "updatedAt"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "input", field: "missing" } },
                },
              ],
            }),
          }),
        },
        message: 'references unknown operation input field "missing"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                createTaskStep(),
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: { kind: "stepOutput", step: "createTask", output: "id" },
                  },
                },
              ],
            }),
          }),
        },
        message: "must use a reference expression",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                createTaskStep(),
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: {
                      kind: "reference",
                      entity: "task-log",
                      id: { kind: "stepOutput", step: "createTask", output: "id" },
                    },
                  },
                },
              ],
            }),
          }),
        },
        message: 'reference entity must target "task"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "literal", value: { nested: true } } },
                },
              ],
            }),
          }),
        },
        message: "value must be a string, boolean, or finite number",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "actor", field: "id" } },
                },
              ],
            }),
          }),
        },
        message: "field must be mode",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "source", field: "query" } },
                },
              ],
            }),
          }),
        },
        message: "field must be protocol, route, host, or path",
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createLogStep(),
                  values: {
                    ...createLogStep().values,
                    task: {
                      kind: "reference",
                      entity: "task",
                      id: { kind: "stepOutput", step: "createTask", output: "id" },
                    },
                  },
                },
                createTaskStep(),
              ],
            }),
          }),
        },
        message: 'references unknown earlier step "createTask"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [{ ...createTaskStep(), loop: { over: "items" } }],
            }),
          }),
        },
        message: 'has unsupported key "loop"',
      },
      {
        operations: {
          submitIntake: recordPlanOperation({
            effect: recordPlanEffect({
              steps: [
                {
                  ...createTaskStep(),
                  values: { title: { kind: "code", body: "return input.title" } },
                },
              ],
            }),
          }),
        },
        message: 'has unsupported expression kind "code"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(schemaWithTaskLogOperations(invalidCase.operations))).toThrow(
        invalidCase.message,
      );
    }
  });

  it("rejects invalid operation declarations", () => {
    const invalidCases = [
      {
        operations: { "bad.key": { kind: "get", scope: "record" } },
        message: "must not contain whitespace, dots, slashes, or colons",
      },
      {
        operations: { list: { kind: "list", scope: "public", target: { query: "taskAll" } } },
        message: "scope must be collection or record",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            input: { fields: { missing: { field: "missing" } } },
          },
        },
        message: 'references unknown field "missing"',
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            input: { fields: { note: { type: "text", required: true } } },
          },
        },
        message: "inline scalar fields are only supported for command operations",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            output: { type: "delete" },
          },
        },
        message: 'type "delete" must match operation kind "create"',
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            effect: { type: "patchRecord" },
          },
        },
        message: "type is only valid for update operations",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            policy: {
              actors: ["owner"],
              access: anonymousPublicAccess(),
            },
          },
        },
        message: "access requires anonymous actor policy",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            audit: { input: "full" },
          },
        },
        message: "audit input must be none, hash, summary, or snapshot",
      },
      {
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            idempotency: { required: false },
          },
        },
        message: "idempotency is required for write and command operations",
      },
      {
        operations: { list: { kind: "list", scope: "collection" } },
        message: "output for list operations requires a target query or explicit output query",
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(schemaWithTaskOperations(invalidCase.operations))).toThrow(
        invalidCase.message,
      );
    }
  });
});

function schemaWithTaskOperations(operations: Record<string, unknown>) {
  return baseTaskSchema({
    entities: {
      task: {
        ...taskEntity(),
        operations,
      },
    },
  });
}

function schemaWithTaskLogOperations(operations: Record<string, unknown>) {
  return baseTaskSchema({
    entities: {
      task: {
        ...taskEntity(),
        operations,
      },
      "task-log": taskLogEntity(),
    },
  });
}

function recordPlanOperation(overrides: Record<string, unknown> = {}) {
  return {
    kind: "command",
    scope: "collection",
    input: {
      fields: {
        title: { type: "text", required: true, label: "Title" },
        note: { type: "text", required: false, label: "Note" },
      },
    },
    effect: recordPlanEffect(),
    ...overrides,
  };
}

function recordPlanEffect(overrides: Record<string, unknown> = {}) {
  return {
    type: "recordPlan",
    steps: [createTaskStep(), createLogStep(), touchTaskStep()],
    ...overrides,
  };
}

function createTaskStep() {
  return {
    name: "createTask",
    kind: "create",
    entity: "task",
    recordId: { kind: "generatedId", prefix: "task" },
    values: {
      title: { kind: "input", field: "title" },
      done: { kind: "literal", value: false },
      dueDate: { kind: "generatedTimestamp" },
    },
  };
}

function createLogStep() {
  return {
    name: "createLog",
    kind: "create",
    entity: "task-log",
    values: {
      task: {
        kind: "reference",
        entity: "task",
        id: { kind: "stepOutput", step: "createTask", output: "id" },
      },
      label: { kind: "input", field: "note" },
      actorMode: { kind: "actor", field: "mode" },
      sourcePath: { kind: "source", field: "path" },
      occurredAt: { kind: "generatedTimestamp" },
    },
  };
}

function touchTaskStep() {
  return {
    name: "touchTask",
    kind: "patch",
    entity: "task",
    recordId: { kind: "stepOutput", step: "createTask", output: "id" },
    values: {
      title: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
    },
  };
}

function taskLogEntity() {
  return {
    label: "Task log",
    fields: {
      task: {
        type: "reference",
        required: true,
        label: "Task",
        to: "task",
        displayField: "title",
      },
      label: { type: "text", required: true, label: "Label" },
      actorMode: { type: "text", required: true, label: "Actor mode" },
      sourcePath: { type: "text", required: false, label: "Source path" },
      occurredAt: { type: "date", required: true, label: "Occurred at" },
    },
  };
}

function baseTaskSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: {
      task: taskEntity(),
    },
    queries: {
      taskAll: { label: "All", entity: "task", expression: { kind: "all" } },
      taskActive: {
        label: "Active",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
      },
      taskCompleted: {
        label: "Completed",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    },
    itemViews: {
      taskItem: {
        entity: "task",
        fields: {
          title: { editor: "text", commit: "field-commit" },
          done: { editor: "boolean", commit: "immediate" },
          dueDate: { editor: "date", commit: "field-commit" },
        },
      },
    },
    tableViews: {},
    views: {
      taskHome: taskHomeCollectionView(),
    },
    screens: {
      home: {
        type: "workspace",
        label: "Tasks",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    },
    ...overrides,
  };
}

function taskHomeCollectionView(overrides: Record<string, unknown> = {}) {
  return {
    type: "collection",
    label: "Tasks",
    entity: "task",
    queries: [{ query: "taskAll" }, { query: "taskActive" }, { query: "taskCompleted" }],
    defaultQuery: "taskAll",
    result: { type: "list", itemView: "taskItem" },
    ...overrides,
  };
}

function taskEntity(overrides: Record<string, unknown> = {}) {
  return {
    label: "Task",
    fields: {
      title: { type: "text", required: true, label: "Title" },
      done: { type: "boolean", required: true, label: "Done", default: false },
      dueDate: { type: "date", required: false, label: "Due date" },
    },
    ...overrides,
  };
}

function anonymousPublicAccess() {
  return {
    actor: "anonymous",
    challenge: { kind: "turnstile" },
    origin: { kind: "same-origin" },
  };
}
