import { describe, expect, it } from "vite-plus/test";

import {
  formatEntityOperationKey,
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
            type: "runActionKind",
            kind: "clear-completed",
            action: "clearCompletedTasks",
            query: "taskCompleted",
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
          effect: { type: "runActionKind", kind: "clear-completed", query: "taskCompleted" },
          policy: {
            actors: ["anonymous"],
            access: anonymousPublicAccess(),
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
        type: "runActionKind",
        kind: "clear-completed",
        action: "clearCompletedTasks",
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

  it("does not project mutation policies or entity actions to operations", () => {
    const schema = parseAppSchema(baseTaskSchema());

    expect(schema.entities.task?.operations).toBeUndefined();
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
                  type: "runActionKind",
                  kind: "clear-completed",
                  action: "clearCompletedTasks",
                  query: "taskCompleted",
                },
                policy: { actors: ["owner"], visible: false },
              },
              runnerOnly: {
                label: "Runner only",
                kind: "command",
                scope: "collection",
                effect: {
                  type: "runActionKind",
                  kind: "clear-completed",
                  action: "clearCompletedTasks",
                  query: "taskCompleted",
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
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: true },
        },
        operations,
      },
    },
  });
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
      taskHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }, { query: "taskActive" }, { query: "taskCompleted" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskItem" },
      },
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

function taskEntity() {
  return {
    label: "Task",
    fields: {
      title: { type: "text", required: true, label: "Title" },
      done: { type: "boolean", required: true, label: "Done", default: false },
      dueDate: { type: "date", required: false, label: "Due date" },
    },
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
    },
    actions: {
      clearCompletedTasks: {
        label: "Clear completed",
        kind: "clear-completed",
        target: { query: "taskCompleted" },
      },
    },
  };
}

function anonymousPublicAccess() {
  return {
    actor: "anonymous",
    challenge: { kind: "turnstile" },
    origin: { kind: "same-origin" },
  };
}
