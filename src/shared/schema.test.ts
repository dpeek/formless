import { describe, expect, it } from "vite-plus/test";
import { parseAppSchema } from "./schema.ts";

describe("schema actions", () => {
  it("accepts valid clear-completed actions", () => {
    const schema = parseAppSchema(schemaWithActions());

    expect(schema.entities.task?.actions?.clearCompletedTasks).toEqual({
      label: "Clear completed",
      kind: "clear-completed",
      target: {
        query: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    });
  });

  it("continues to accept legacy clear-completed actions without targets", () => {
    const schema = parseAppSchema(
      schemaWithActions({
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "clear-completed",
        },
      }),
    );

    expect(schema.entities.task?.actions?.clearCompletedTasks).toEqual({
      label: "Clear completed",
      kind: "clear-completed",
    });
  });

  it("parses action target queries", () => {
    const schema = parseAppSchema(schemaWithActions());

    expect(schema.entities.task?.actions?.clearCompletedTasks.target?.query).toEqual({
      kind: "where",
      ref: { kind: "value", name: "done" },
      op: "eq",
      value: true,
    });
  });

  it("rejects unsupported action kinds", () => {
    expect(() =>
      parseAppSchema(
        schemaWithActions({
          clearCompletedTasks: {
            label: "Clear completed",
            kind: "archive",
          },
        }),
      ),
    ).toThrow('unsupported kind "archive"');
  });

  it("rejects clear-completed actions without a boolean done field", () => {
    expect(() =>
      parseAppSchema({
        ...schemaWithActions(),
        entities: {
          task: {
            ...schemaWithActions().entities.task,
            fields: {
              title: { type: "text", required: true },
              done: { type: "text", required: false },
            },
          },
        },
      }),
    ).toThrow('requires a boolean "done" field');
  });

  it("rejects unknown query fields in actions", () => {
    expect(() =>
      parseAppSchema(
        schemaWithActions({
          clearCompletedTasks: {
            label: "Clear completed",
            kind: "clear-completed",
            target: {
              query: {
                kind: "where",
                ref: { kind: "value", name: "missing" },
                op: "eq",
                value: true,
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "value.missing"');
  });

  it("rejects clear-completed targets that are not done eq true", () => {
    expect(() =>
      parseAppSchema(
        schemaWithActions({
          clearCompletedTasks: {
            label: "Clear completed",
            kind: "clear-completed",
            target: {
              query: {
                kind: "where",
                ref: { kind: "value", name: "done" },
                op: "eq",
                value: false,
              },
            },
          },
        }),
      ),
    ).toThrow("target must be value.done eq true");
  });

  it("continues to accept schemas without actions", () => {
    const { actions, ...task } = schemaWithActions().entities.task;
    const schema = parseAppSchema({
      ...schemaWithActions(),
      entities: { task },
    });

    expect(actions).toBeDefined();
    expect(schema.entities.task?.actions).toBeUndefined();
  });
});

describe("schema list view queries", () => {
  it("parses list view labels and queries", () => {
    const schema = parseAppSchema(schemaWithActions());

    expect(schema.views.taskListItem).toEqual({
      type: "list",
      label: "Completed",
      entity: "task",
      query: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
      },
    });
  });

  it("normalizes missing list queries to all", () => {
    const schema = parseAppSchema(
      schemaWithActions(defaultActions(), {
        taskListItem: {
          type: "list",
          entity: "task",
          fields: {
            title: { editor: "text", commit: "field-commit" },
            done: { editor: "boolean", commit: "immediate" },
          },
        },
        taskCreate: {
          type: "create",
          entity: "task",
          fields: {
            title: { editor: "text" },
          },
        },
      }),
    );

    expect(schema.views.taskListItem).toMatchObject({
      query: { kind: "all" },
    });
  });

  it("rejects malformed list view query objects", () => {
    expect(() =>
      parseAppSchema(
        schemaWithActions(defaultActions(), {
          taskListItem: {
            type: "list",
            entity: "task",
            query: { kind: "all", extra: true },
            fields: {
              title: { editor: "text", commit: "field-commit" },
              done: { editor: "boolean", commit: "immediate" },
            },
          },
          taskCreate: {
            type: "create",
            entity: "task",
            fields: {
              title: { editor: "text" },
            },
          },
        }),
      ),
    ).toThrow('unsupported key "extra"');
  });

  it("rejects unknown query fields in views", () => {
    expect(() =>
      parseAppSchema(
        schemaWithActions(defaultActions(), {
          taskListItem: {
            type: "list",
            entity: "task",
            query: {
              kind: "where",
              ref: { kind: "value", name: "missing" },
              op: "eq",
              value: "x",
            },
            fields: {
              title: { editor: "text", commit: "field-commit" },
              done: { editor: "boolean", commit: "immediate" },
            },
          },
          taskCreate: {
            type: "create",
            entity: "task",
            fields: {
              title: { editor: "text" },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "value.missing"');
  });
});

function schemaWithActions(actions: unknown = defaultActions(), views: unknown = defaultViews()) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
        actions,
      },
    },
    views,
  };
}

function defaultActions() {
  return {
    clearCompletedTasks: {
      label: "Clear completed",
      kind: "clear-completed",
      target: {
        query: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    },
  };
}

function defaultViews() {
  return {
    taskListItem: {
      type: "list",
      label: "Completed",
      entity: "task",
      query: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
      },
    },
    taskCreate: {
      type: "create",
      entity: "task",
      fields: {
        title: { editor: "text" },
      },
    },
  };
}
