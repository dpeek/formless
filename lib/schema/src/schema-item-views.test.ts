import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";
import { taskSchema } from "./schema-test-fixtures.ts";

describe("schema item views", () => {
  it("parses field editors, commit policies, and presentation metadata", () => {
    const schema = parseAppSchema({
      ...taskSchema(),
      itemViews: {
        taskItem: {
          entity: "task",
          fields: {
            title: { editor: "text", commit: "field-commit" },
            done: {
              editor: "boolean",
              commit: "immediate",
              presentation: { mode: "completion" },
            },
            dueDate: {
              editor: "date",
              commit: "field-commit",
              presentation: { visibility: "valueOrInteraction" },
            },
          },
        },
      },
    });

    expect(schema.itemViews.taskItem.fields).toEqual({
      title: { editor: "text", commit: "field-commit" },
      done: {
        editor: "boolean",
        commit: "immediate",
        presentation: { mode: "completion" },
      },
      dueDate: {
        editor: "date",
        commit: "field-commit",
        presentation: { visibility: "valueOrInteraction" },
      },
    });
  });

  it("rejects unknown fields and incompatible commit policies", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: {
          taskItem: {
            entity: "task",
            fields: { missing: { editor: "text", commit: "field-commit" } },
          },
        },
      }),
    ).toThrow('references unknown field "task.missing"');

    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: {
          taskItem: {
            entity: "task",
            fields: { done: { editor: "boolean", commit: "field-commit" } },
          },
        },
      }),
    ).toThrow("boolean fields must commit immediately");
  });
});
