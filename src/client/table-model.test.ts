import { describe, expect, it } from "vite-plus/test";

import { rateSourceSchema, siteSourceSchema } from "../test/schema-apps.ts";
import { selectTableResultModel } from "./table-model.ts";

describe("table model", () => {
  it("selects render-ready rate table columns", () => {
    const result = selectTableResultModel(
      rateSourceSchema,
      rateSourceSchema.tableViews.rateTable,
      rateSourceSchema.entities.rate,
    );

    expect(result.columns.map((column) => column.key)).toEqual([
      "referenceField:resource.name",
      "field:cost",
      "field:costUnit",
      "field:price",
      "computed:rateMargin",
    ]);
  });

  it("selects table ordering, row actions, and edit-dialog facts", () => {
    const result = selectTableResultModel(
      siteSourceSchema,
      siteSourceSchema.tableViews.blockPlacementTable,
      siteSourceSchema.entities.blockPlacement,
    );
    const actionsColumn = result.columns.find((column) => column.type === "invokeAction");

    expect(result.ordering).toMatchObject({
      fieldName: "order",
      scope: [
        { kind: "field", fieldName: "parent" },
        { kind: "field", fieldName: "slot" },
      ],
      presentations: ["dragHandle", "moveMenu"],
    });
    expect(actionsColumn).toMatchObject({
      type: "invokeAction",
      key: "invokeAction:editChildBlock,ordering",
      actions: [
        {
          type: "editRecord",
          actionName: "editChildBlock",
          target: { kind: "reference", fieldName: "block", entityName: "block" },
          editView: { viewName: "blockEdit", entityName: "block" },
        },
      ],
      includeOrdering: true,
    });
  });
});
