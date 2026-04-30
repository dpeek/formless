import { describe, expect, it } from "vite-plus/test";
import { fieldRefsEqual, getEntityFieldCatalog, resolveRecordFieldValue } from "./fields.ts";
import { matchesQuery, parseQueryExpression } from "./query.ts";
import type { StoredRecord } from "./protocol.ts";
import type { EntitySchema } from "./schema.ts";

describe("field catalog", () => {
  it("includes value fields and readable system fields", () => {
    const catalog = getEntityFieldCatalog(taskEntity);

    expect(catalog).toEqual([
      {
        ref: { kind: "value", name: "title" },
        type: "text",
        label: "Title",
        writable: true,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "value", name: "done" },
        type: "boolean",
        label: "Done",
        writable: true,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "value", name: "dueDate" },
        type: "date",
        label: "Due date",
        writable: true,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "system", name: "id" },
        type: "id",
        label: "ID",
        writable: false,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "system", name: "createdAt" },
        type: "datetime",
        label: "Created at",
        writable: false,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "system", name: "deletedAt" },
        type: "datetime",
        label: "Deleted at",
        writable: false,
        filterOps: ["eq"],
      },
    ]);
  });

  it("compares refs by kind and name", () => {
    expect(fieldRefsEqual({ kind: "value", name: "done" }, { kind: "value", name: "done" })).toBe(
      true,
    );
    expect(fieldRefsEqual({ kind: "value", name: "done" }, { kind: "system", name: "id" })).toBe(
      false,
    );
  });

  it("resolves system refs from StoredRecord instead of record values", () => {
    expect(resolveRecordFieldValue(record, { kind: "system", name: "id" })).toBe("record-1");
    expect(resolveRecordFieldValue(record, { kind: "system", name: "createdAt" })).toBe(
      "2026-04-28T00:00:00.000Z",
    );
    expect(resolveRecordFieldValue(record, { kind: "system", name: "deletedAt" })).toBeUndefined();
  });
});

describe("query parsing", () => {
  it("parses valid all queries", () => {
    expect(parseQueryExpression({ kind: "all" }, catalog, "taskList")).toEqual({ kind: "all" });
  });

  it("parses valid where queries", () => {
    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
        catalog,
        "completed tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "done" },
      op: "eq",
      value: true,
    });
  });

  it("rejects unknown refs", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "missing" },
          op: "eq",
          value: "x",
        },
        catalog,
        "bad query",
      ),
    ).toThrow('references unknown field "value.missing"');
  });

  it("rejects unsupported operators", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "ne",
          value: true,
        },
        catalog,
        "bad query",
      ),
    ).toThrow('does not support operator "ne"');
  });

  it("rejects type mismatches", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: "true",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("requires a boolean value");
  });

  it("rejects malformed date values", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "eq",
          value: "05/01/2026",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("must be a YYYY-MM-DD date");
  });
});

describe("query evaluation", () => {
  it("matches all active records", () => {
    expect(matchesQuery(record, { kind: "all" })).toBe(true);
  });

  it("matches where queries against value refs", () => {
    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: false,
      }),
    ).toBe(true);
  });

  it("matches where queries against system refs", () => {
    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "system", name: "id" },
        op: "eq",
        value: "record-1",
      }),
    ).toBe(true);
  });

  it("does not match tombstoned records", () => {
    expect(
      matchesQuery(
        {
          ...record,
          deletedAt: "2026-04-29T00:00:00.000Z",
        },
        { kind: "all" },
      ),
    ).toBe(false);
  });
});

const taskEntity = {
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
} satisfies EntitySchema;

const catalog = getEntityFieldCatalog(taskEntity);

const record: StoredRecord = {
  id: "record-1",
  entity: "task",
  values: {
    id: "value-id",
    title: "Plan week",
    done: false,
    dueDate: "2026-05-01",
  },
  createdAt: "2026-04-28T00:00:00.000Z",
};
