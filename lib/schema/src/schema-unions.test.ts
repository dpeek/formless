import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, stringifySchema } from "./index.ts";
import { taskCollectionView, taskEntity, taskSchema } from "./schema-test-fixtures.ts";

describe("schema unions", () => {
  it("parses discriminator variants and preserves them through stringify", () => {
    const schema = parseAppSchema(unionSchema());

    expect(schema.unions?.taskByPriority).toEqual({
      entity: "task",
      discriminator: "priority",
      variants: {
        normal: { label: "Normal", fields: ["title", "priority"], requiredFields: ["title"] },
        high: { label: "High", fields: ["title", "dueDate"] },
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses union-aware item, edit, and create presentations", () => {
    const source = unionSchema();
    const schema = parseAppSchema({
      ...source,
      itemViews: {
        taskItem: {
          entity: "task",
          fields: { priority: { editor: "enum", commit: "immediate" } },
          union: "taskByPriority",
          variants: {
            normal: {
              presentation: "fields",
              fields: { title: { editor: "text", commit: "field-commit" } },
            },
            high: {
              presentation: "contextLink",
              labelField: "title",
              target: { kind: "selectContext", context: "task", record: "self" },
            },
          },
        },
      },
      views: {
        taskHome: taskCollectionView(),
        taskCreate: {
          type: "create",
          entity: "task",
          fields: {
            title: { editor: "text" },
            priority: { editor: "enum" },
          },
          union: "taskByPriority",
          variants: unionFieldPresentations(false),
        },
        taskEdit: {
          type: "edit",
          entity: "task",
          fields: { priority: { editor: "enum", commit: "immediate" } },
          union: "taskByPriority",
          variants: unionFieldPresentations(true),
        },
      },
    });

    expect(schema.itemViews.taskItem).toMatchObject({
      union: "taskByPriority",
      variants: {
        high: {
          presentation: "contextLink",
          labelField: "title",
          target: { kind: "selectContext", context: "task", record: "self" },
        },
      },
    });
    expect(schema.views.taskCreate).toMatchObject({
      type: "create",
      union: "taskByPriority",
    });
    expect(schema.views.taskEdit).toMatchObject({
      type: "edit",
      union: "taskByPriority",
    });
  });

  it("requires discriminator coverage and matching presentation entities", () => {
    const source = unionSchema();

    expect(() =>
      parseAppSchema({
        ...source,
        unions: {
          taskByPriority: {
            entity: "task",
            discriminator: "priority",
            variants: { normal: { label: "Normal", fields: ["title"] } },
          },
        },
      }),
    ).toThrow('must define variants for discriminator values "high" or a fallback');

    expect(() =>
      parseAppSchema({
        ...source,
        itemViews: {
          taskItem: {
            entity: "task",
            fields: { title: { editor: "text", commit: "field-commit" } },
            union: "missing",
            variants: {},
          },
        },
      }),
    ).toThrow('references unknown union "missing"');
  });
});

function unionSchema() {
  return taskSchema({
    entities: { task: taskEntity() },
    unions: {
      taskByPriority: {
        entity: "task",
        discriminator: "priority",
        variants: {
          normal: {
            label: "Normal",
            fields: ["title", "priority"],
            requiredFields: ["title"],
          },
          high: { label: "High", fields: ["title", "dueDate"] },
        },
      },
    },
  });
}

function unionFieldPresentations(edit: boolean) {
  return {
    normal: {
      presentation: "fields",
      fields: {
        title: edit ? { editor: "text", commit: "field-commit" } : { editor: "text" },
      },
    },
    high: {
      presentation: "fields",
      fields: edit
        ? { dueDate: { editor: "date", commit: "field-commit" } }
        : { dueDate: { editor: "date" } },
    },
  };
}
