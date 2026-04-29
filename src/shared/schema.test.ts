import { describe, expect, it } from "vite-plus/test";
import { parseAppSchema } from "./schema.ts";

describe("schema actions", () => {
  it("accepts valid clear-completed actions", () => {
    const schema = parseAppSchema(schemaWithActions());

    expect(schema.entities.task?.actions?.clearCompletedTasks).toEqual({
      label: "Clear completed",
      kind: "clear-completed",
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

function schemaWithActions(actions: unknown = defaultActions()) {
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
    views: {
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
    },
  };
}

function defaultActions() {
  return {
    clearCompletedTasks: {
      label: "Clear completed",
      kind: "clear-completed",
    },
  };
}
