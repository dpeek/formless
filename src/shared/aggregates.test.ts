import { describe, expect, it } from "vite-plus/test";
import { evaluateCollectionAggregateValue } from "./aggregates.ts";
import { parseAppSchema } from "./schema.ts";
import type { StoredRecord } from "./protocol.ts";

describe("schema aggregates", () => {
  it("normalizes schemas without aggregates", () => {
    expect(parseAppSchema(schema()).aggregates).toEqual({});
  });

  it("parses valid count aggregates", () => {
    const parsed = parseAppSchema(
      schema({
        taskActive: {
          type: "count",
          label: "Active",
          entity: "task",
          query: {
            kind: "where",
            ref: { kind: "value", name: "done" },
            op: "eq",
            value: false,
          },
        },
      }),
    );

    expect(parsed.aggregates).toEqual({
      taskActive: {
        type: "count",
        label: "Active",
        entity: "task",
        query: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
      },
    });
  });

  it("rejects unknown aggregate entities", () => {
    expect(() =>
      parseAppSchema(
        schema({
          missingEntityCount: {
            type: "count",
            label: "Missing",
            entity: "missing",
            query: { kind: "all" },
          },
        }),
      ),
    ).toThrow('references unknown entity "missing"');
  });

  it("rejects unsupported aggregate types", () => {
    expect(() =>
      parseAppSchema(
        schema({
          taskTotal: {
            type: "sum",
            label: "Total",
            entity: "task",
            query: { kind: "all" },
          },
        }),
      ),
    ).toThrow('type must be "count"');
  });

  it("rejects unknown aggregate query fields", () => {
    expect(() =>
      parseAppSchema(
        schema({
          taskMissing: {
            type: "count",
            label: "Missing",
            entity: "task",
            query: {
              kind: "where",
              ref: { kind: "value", name: "missing" },
              op: "eq",
              value: true,
            },
          },
        }),
      ),
    ).toThrow('references unknown field "value.missing"');
  });

  it("rejects malformed aggregate queries", () => {
    expect(() =>
      parseAppSchema(
        schema({
          taskMalformed: {
            type: "count",
            label: "Malformed",
            entity: "task",
            query: { kind: "and", expressions: [] },
          },
        }),
      ),
    ).toThrow("expressions must be a non-empty array");
  });
});

describe("collection aggregate evaluation", () => {
  it("evaluates count aggregates over active records for the aggregate entity", () => {
    const aggregate = aggregateFromSchema("taskActive", {
      type: "count",
      label: "Active",
      entity: "task",
      query: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: false,
      },
    });

    expect(
      evaluateCollectionAggregateValue(aggregateRecords, aggregate, { today: "2026-05-02" }),
    ).toBe(2);
  });

  it("excludes tombstoned records from aggregate counts", () => {
    const aggregate = aggregateFromSchema("taskCompleted", {
      type: "count",
      label: "Completed",
      entity: "task",
      query: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
    });

    expect(
      evaluateCollectionAggregateValue(aggregateRecords, aggregate, { today: "2026-05-02" }),
    ).toBe(1);
  });

  it("counts overdue records with an injected today", () => {
    const aggregate = aggregateFromSchema("taskOverdue", {
      type: "count",
      label: "Overdue",
      entity: "task",
      query: {
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
      },
    });

    expect(
      evaluateCollectionAggregateValue(aggregateRecords, aggregate, { today: "2026-05-02" }),
    ).toBe(1);
  });
});

function aggregateFromSchema(name: string, aggregate: unknown) {
  const parsed = parseAppSchema(schema({ [name]: aggregate }));
  const parsedAggregate = parsed.aggregates[name];

  if (!parsedAggregate) {
    throw new Error(`Missing aggregate "${name}".`);
  }

  return parsedAggregate;
}

function schema(aggregates?: unknown) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
          dueDate: { type: "date", required: false },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
      },
    },
    views: {
      taskList: {
        type: "list",
        label: "All",
        entity: "task",
        query: { kind: "all" },
        fields: {
          title: { editor: "text", commit: "field-commit" },
          done: { editor: "boolean", commit: "immediate" },
          dueDate: { editor: "date", commit: "field-commit" },
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
    ...(aggregates === undefined ? {} : { aggregates }),
  };
}

const aggregateRecords: StoredRecord[] = [
  {
    id: "task-1",
    entity: "task",
    values: { title: "Open overdue", done: false, dueDate: "2026-05-01" },
    createdAt: "2026-04-28T00:00:00.000Z",
  },
  {
    id: "task-2",
    entity: "task",
    values: { title: "Open later", done: false, dueDate: "2026-05-03" },
    createdAt: "2026-04-28T00:01:00.000Z",
  },
  {
    id: "task-3",
    entity: "task",
    values: { title: "Completed", done: true, dueDate: "2026-05-01" },
    createdAt: "2026-04-28T00:02:00.000Z",
  },
  {
    id: "task-4",
    entity: "task",
    values: { title: "Deleted completed", done: true, dueDate: "2026-05-01" },
    createdAt: "2026-04-28T00:03:00.000Z",
    deletedAt: "2026-04-28T00:04:00.000Z",
  },
  {
    id: "note-1",
    entity: "note",
    values: { title: "Other entity", done: false, dueDate: "2026-05-01" },
    createdAt: "2026-04-28T00:05:00.000Z",
  },
];
