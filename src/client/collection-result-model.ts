import type { AppSchema, CollectionViewSchema, EntitySchema } from "@dpeek/formless-schema";
import { selectListResultModel, selectRecordResultModel } from "./list-result-model.ts";
import { selectTableFooterSlots, selectTableResultModel } from "./table-model.ts";
import { selectTreeResultModel } from "./tree-result-model.ts";
import type { HomeResultConfig } from "./views.ts";
import { selectResultOrderingConfig } from "./result-ordering-model.ts";

export type CollectionResultModel = HomeResultConfig;
export type TableCollectionResultModel = Extract<HomeResultConfig, { type: "table" }>;

export function selectHomeResultModel(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): CollectionResultModel {
  const result = collectionView.result;

  if (result.type === "table") {
    const tableView = schema.tableViews[result.tableView];

    if (!tableView) {
      throw new Error(`Missing table view "${result.tableView}".`);
    }
    const resultOrdering = selectResultOrderingConfig(result.ordering, entity);
    const tableResult = selectTableResultModel(schema, tableView, entity, resultOrdering);
    const footer = selectTableFooterSlots(schema, result.footer ?? [], tableResult.columns);

    return {
      type: "table",
      tableViewName: result.tableView,
      columns: tableResult.columns,
      ...(tableResult.ordering === undefined ? {} : { ordering: tableResult.ordering }),
      ...(footer.length === 0 ? {} : { footer }),
    };
  }

  if (result.type === "tree") {
    return selectTreeResultModel(schema, result, entity);
  }

  if (result.type === "record") {
    return selectRecordResultModel(schema, result, entity);
  }

  return selectListResultModel(schema, result, entity);
}
