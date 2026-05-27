import type { AppSchema, CollectionViewSchema, EntitySchema } from "../shared/schema.ts";
import { selectRecordFields } from "./collection-shell-model.ts";
import { selectResultOrderingConfig } from "./result-ordering-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";
import type { HomeResultConfig } from "./views.ts";

export type ListResultModel = Extract<HomeResultConfig, { type: "list" }>;
export type RecordResultModel = Extract<HomeResultConfig, { type: "record" }>;

export function selectListResultModel(
  schema: AppSchema,
  result: Extract<CollectionViewSchema["result"], { type: "list" }>,
  entity: EntitySchema,
): ListResultModel {
  const itemView = schema.itemViews[result.itemView];

  if (!itemView) {
    throw new Error(`Missing item view "${result.itemView}".`);
  }
  const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);
  const ordering = selectResultOrderingConfig(result.ordering, entity);

  return {
    type: "list",
    itemViewName: result.itemView,
    recordFields: selectRecordFields(itemView, entity),
    ...(recordUnion === undefined ? {} : { recordUnion }),
    ...(ordering === undefined ? {} : { ordering }),
  };
}

export function selectRecordResultModel(
  schema: AppSchema,
  result: Extract<CollectionViewSchema["result"], { type: "record" }>,
  entity: EntitySchema,
): RecordResultModel {
  const itemView = schema.itemViews[result.itemView];

  if (!itemView) {
    throw new Error(`Missing item view "${result.itemView}".`);
  }
  const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);

  return {
    type: "record",
    itemViewName: result.itemView,
    recordFields: selectRecordFields(itemView, entity),
    ...(recordUnion === undefined ? {} : { recordUnion }),
  };
}
