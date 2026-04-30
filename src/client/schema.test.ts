import { describe, expect, it } from "vite-plus/test";
import { appSchema } from "./schema.ts";

describe("seed app schema", () => {
  it("imports and parses the checked-in schema", () => {
    expect(appSchema.version).toBe(1);
    expect(appSchema.entities.task?.label).toBe("Task");
  });

  it("contains task aggregates in schema order", () => {
    expect(Object.keys(appSchema.aggregates)).toEqual([
      "taskTotal",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(Object.values(appSchema.aggregates).map((aggregate) => aggregate.label)).toEqual([
      "Total",
      "Active",
      "Completed",
      "Overdue",
    ]);
  });

  it("parses the overdue aggregate into the normalized and query", () => {
    expect(appSchema.aggregates.taskOverdue?.query).toEqual({
      kind: "and",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: { kind: "today" },
        },
      ],
    });
  });
});
