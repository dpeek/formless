import { describe, expect, it } from "vite-plus/test";

import {
  invalidSchemaFrom,
  sourceLikeRateSchema,
  sourceLikeSiteSchema,
} from "../test/schema-builders.ts";
import { parseAppSchema } from "./schema.ts";
import { parseTableViews } from "./schema-table-views.ts";

describe("schema table views", () => {
  it("parses post-TAO table columns, actions, and ordering through the table parser", () => {
    const rateSourceSchema = sourceLikeRateSchema();
    const tableViews = parseTableViews(
      rateSourceSchema.tableViews,
      rateSourceSchema.entities,
      rateSourceSchema.itemViews,
      rateSourceSchema.readModels,
    );

    const rateTable = tableViews.rateTable;

    expect(rateTable).toMatchObject({ entity: "rate" });
    expect(rateTable?.columns.map((column) => column.type)).toEqual([
      "referenceField",
      "field",
      "field",
      "field",
      "computed",
    ]);

    const siteSourceSchema = sourceLikeSiteSchema();
    const siteTableViews = parseTableViews(
      siteSourceSchema.tableViews,
      siteSourceSchema.entities,
      siteSourceSchema.itemViews,
      siteSourceSchema.readModels,
    );

    expect(siteTableViews.blockPlacementTable).toMatchObject({
      entity: "blockPlacement",
      actions: {
        editChildBlock: {
          type: "editRecord",
          target: { kind: "reference", field: "block" },
          editView: "blockEdit",
        },
      },
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

  it("builds invalid source-like table parser cases without mutating source fixtures", () => {
    const invalidRateSchema = invalidSchemaFrom(sourceLikeRateSchema(), (schema) => {
      const rateTable = schema.tableViews.rateTable;

      if (!rateTable) {
        throw new Error("Missing rate table fixture.");
      }

      rateTable.columns = [{ type: "field", field: "missing" }];
    });

    expect(() => parseAppSchema(invalidRateSchema)).toThrow(
      'references unknown field "rate.missing"',
    );
    expect(
      sourceLikeRateSchema().tableViews.rateTable?.columns.map((column) => column.type),
    ).toEqual(["referenceField", "field", "field", "field", "computed"]);
  });
});
