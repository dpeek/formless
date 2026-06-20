import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, parseTableViews, type AppSchema, type EntitySchema } from "./index.ts";

describe("schema table views", () => {
  it("parses table columns, actions, and ordering through the table parser", () => {
    const schema = tableParserSchema();
    const tableViews = parseTableViews(
      schema.tableViews,
      schema.entities,
      schema.itemViews,
      schema.readModels,
    );

    expect(tableViews.rateTable).toMatchObject({ entity: "rate" });
    expect(tableViews.rateTable?.columns.map((column) => column.type)).toEqual([
      "referenceField",
      "field",
      "field",
      "field",
      "computed",
    ]);
    expect(tableViews.blockPlacementTable).toMatchObject({
      entity: "block-placement",
      operations: [
        {
          operation: "block.update",
          target: { kind: "reference", field: "block" },
          editView: "blockEdit",
        },
      ],
      ordering: {
        field: "order",
        scope: [
          { kind: "field", field: "parent" },
          { kind: "field", field: "slot" },
        ],
        presentations: ["dragHandle", "moveMenu"],
      },
    });
  });

  it("rejects invalid table parser cases without mutating fixed fixtures", () => {
    const invalidSchema = tableParserSchema();
    invalidSchema.tableViews.rateTable.columns = [{ type: "field", field: "missing" }];

    expect(() => parseAppSchema(invalidSchema)).toThrow('references unknown field "rate.missing"');
    expect(tableParserSchema().tableViews.rateTable.columns.map((column) => column.type)).toEqual([
      "referenceField",
      "field",
      "field",
      "field",
      "computed",
    ]);
  });

  it("parses system field display columns without requiring value fields", () => {
    const schema = tableParserSchema();
    schema.tableViews.rateTable.columns = [
      ...schema.tableViews.rateTable.columns,
      { type: "field", field: "updatedAt", display: "editor" },
      { type: "referenceField", referenceField: "resource", field: "createdAt" },
    ];

    const tableViews = parseTableViews(
      schema.tableViews,
      schema.entities,
      schema.itemViews,
      schema.readModels,
    );

    expect(tableViews.rateTable?.columns.slice(-2)).toEqual([
      { type: "field", field: "updatedAt", display: "editor" },
      { type: "referenceField", referenceField: "resource", field: "createdAt" },
    ]);
  });
});

function tableParserSchema(): AppSchema {
  const entities = {
    resource: entity("Resource", {
      name: { type: "text", required: true, label: "Name" },
    }),
    card: entity("Card", {
      label: { type: "text", required: true, label: "Label" },
    }),
    rate: entity("Rate", {
      resource: { type: "reference", required: true, to: "resource", displayField: "name" },
      card: { type: "reference", required: true, to: "card", displayField: "label" },
      cost: { type: "number", required: true, label: "Cost" },
      price: { type: "number", required: true, label: "Price" },
      active: { type: "boolean", required: true, label: "Active", default: true },
    }),
    block: entity(
      "Block",
      {
        label: { type: "text", required: true, label: "Label" },
      },
      {
        operations: {
          update: updateOperation("Update Block"),
        },
      },
    ),
    "block-placement": entity("Block placement", {
      parent: { type: "reference", required: true, to: "block", displayField: "label" },
      block: { type: "reference", required: true, to: "block", displayField: "label" },
      slot: {
        type: "enum",
        required: true,
        values: {
          main: { label: "Main" },
          sidebar: { label: "Sidebar" },
        },
      },
      order: { type: "number", required: true },
    }),
  } satisfies AppSchema["entities"];

  return {
    version: 1,
    entities,
    queries: {
      rates: { label: "Rates", entity: "rate", expression: { kind: "all" } },
      placements: { label: "Placements", entity: "block-placement", expression: { kind: "all" } },
    },
    readModels: {
      computedValues: {
        margin: {
          entity: "rate",
          type: "number",
          expression: {
            kind: "binary",
            op: "subtract",
            left: { kind: "field", field: "price" },
            right: { kind: "field", field: "cost" },
          },
        },
      },
    },
    itemViews: {
      blockItem: {
        entity: "block",
        fields: {
          label: { editor: "text", commit: "field-commit" },
        },
      },
      rateItem: {
        entity: "rate",
        fields: {
          resource: { editor: "reference", commit: "immediate" },
          cost: { editor: "number", commit: "field-commit" },
        },
      },
    },
    tableViews: {
      rateTable: {
        entity: "rate",
        columns: [
          { type: "referenceField", referenceField: "resource", field: "name" },
          { type: "field", field: "cost" },
          { type: "field", field: "price" },
          { type: "field", field: "active" },
          { type: "computed", computedValue: "margin" },
        ],
      },
      blockPlacementTable: {
        entity: "block-placement",
        operations: [
          {
            operation: "block.update",
            label: "Edit child",
            target: { kind: "reference", field: "block" },
            editView: "blockEdit",
          },
        ],
        ordering: {
          field: "order",
          scope: [
            { kind: "field", field: "parent" },
            { kind: "field", field: "slot" },
          ],
          presentations: ["dragHandle", "moveMenu"],
        },
        columns: [
          { type: "orderingHandle" },
          { type: "field", field: "slot" },
          { type: "referenceField", referenceField: "block", field: "label" },
          { type: "operationControl", operation: "block.update", label: "Actions" },
        ],
      },
    },
    views: {
      rates: {
        type: "collection",
        label: "Rates",
        entity: "rate",
        queries: [{ query: "rates" }],
        defaultQuery: "rates",
        result: { type: "table", tableView: "rateTable" },
      },
      placements: {
        type: "collection",
        label: "Placements",
        entity: "block-placement",
        queries: [{ query: "placements" }],
        defaultQuery: "placements",
        result: { type: "table", tableView: "blockPlacementTable" },
      },
      blockEdit: {
        type: "edit",
        entity: "block",
        fields: {
          label: { editor: "text", commit: "field-commit" },
        },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Home",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [
            { id: "rates", type: "collection", view: "rates" },
            { id: "placements", type: "collection", view: "placements" },
          ],
        },
      },
    },
  };
}

function entity(
  label: string,
  fields: EntitySchema["fields"],
  overrides: Partial<EntitySchema> = {},
): EntitySchema {
  return {
    label,
    fields,
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
    },
    ...overrides,
  };
}

function updateOperation(label: string): NonNullable<EntitySchema["operations"]>[string] {
  return {
    label,
    kind: "update",
    scope: "record",
    effect: { type: "patchRecord" },
    output: { type: "update" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}
