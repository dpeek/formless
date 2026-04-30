import { describe, expect, it } from "vite-plus/test";
import { appSchema } from "./schema.ts";
import { selectHomeModel } from "./views.ts";
import type { AppSchema, EntitySchema } from "../shared/schema.ts";

describe("home view model aggregates", () => {
  it("returns task aggregates in schema order", () => {
    const model = selectHomeModel(appSchema);

    expect(model?.aggregates.map((aggregate) => aggregate.aggregateName)).toEqual([
      "taskTotal",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(model?.aggregates.map((aggregate) => aggregate.label)).toEqual([
      "Total",
      "Active",
      "Completed",
      "Overdue",
    ]);
  });

  it("returns an empty aggregate list for schemas with no aggregates", () => {
    const model = selectHomeModel({ ...appSchema, aggregates: {} });

    expect(model?.aggregates).toEqual([]);
  });

  it("filters aggregate configs to the selected home entity", () => {
    const taskTotal = appSchema.aggregates.taskTotal;
    const taskActive = appSchema.aggregates.taskActive;

    if (!taskTotal || !taskActive) {
      throw new Error("Missing seed task aggregates.");
    }

    const schema: AppSchema = {
      ...appSchema,
      entities: {
        ...appSchema.entities,
        note: noteEntity,
      },
      aggregates: {
        noteTotal: {
          type: "count",
          label: "Notes",
          entity: "note",
          query: { kind: "all" },
        },
        taskTotal,
        taskActive,
      },
    };
    const model = selectHomeModel(schema);

    expect(model?.entityName).toBe("task");
    expect(model?.aggregates.map((aggregate) => aggregate.aggregateName)).toEqual([
      "taskTotal",
      "taskActive",
    ]);
  });
});

const noteEntity: EntitySchema = {
  label: "Note",
  fields: {
    title: { type: "text", required: true },
  },
  mutations: {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  },
};
