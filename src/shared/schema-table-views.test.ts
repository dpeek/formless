import { describe, expect, it } from "vite-plus/test";

import { rateSourceSchema, siteSourceSchema } from "../test/schema-apps.ts";
import { parseTableViews } from "./schema-table-views.ts";

describe("schema table views", () => {
  it("parses post-TAO table columns, actions, and ordering through the table parser", () => {
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
});
