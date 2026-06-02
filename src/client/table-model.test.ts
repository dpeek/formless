import { describe, expect, it } from "vite-plus/test";

import { sourceLikeRateSchema, sourceLikeSiteSchema } from "../test/schema-builders.ts";
import { selectTableResultModel } from "./table-model.ts";

describe("table model", () => {
  it("selects render-ready rate table columns", () => {
    const rateSourceSchema = sourceLikeRateSchema();
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

  it("propagates field presentation metadata into table columns", () => {
    const rateSourceSchema = sourceLikeRateSchema();
    const rateTable = rateSourceSchema.tableViews.rateTable;

    rateTable.columns = rateTable.columns.map((column) =>
      column.type === "field" && column.field === "costUnit"
        ? { ...column, presentation: { mode: "iconOnly" as const } }
        : column,
    );

    const result = selectTableResultModel(
      rateSourceSchema,
      rateTable,
      rateSourceSchema.entities.rate,
    );
    const costUnitColumn = result.columns.find(
      (column) => column.type === "field" && column.fieldName === "costUnit",
    );

    expect(costUnitColumn).toMatchObject({
      type: "field",
      fieldName: "costUnit",
      presentation: { mode: "iconOnly" },
    });
  });

  it("selects table ordering, row actions, and edit-dialog facts", () => {
    const siteSourceSchema = sourceLikeSiteSchema();
    const result = selectTableResultModel(
      siteSourceSchema,
      siteSourceSchema.tableViews.blockPlacementTable,
      siteSourceSchema.entities["block-placement"],
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
