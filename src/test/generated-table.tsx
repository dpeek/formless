import { selectCollectionModels, type HomeViewModel } from "../client/views.ts";
import type { AppSchema } from "@dpeek/formless-schema";

export function requiredCollectionModel(schema: AppSchema, viewName: string): HomeViewModel {
  const model = selectCollectionModels(schema).find((candidate) => candidate.viewName === viewName);

  if (!model) {
    throw new Error(`Missing collection model "${viewName}".`);
  }

  return model;
}

export function requiredTableModel(schema: AppSchema, viewName: string) {
  const model = requiredCollectionModel(schema, viewName);

  if (model.result.type !== "table") {
    throw new Error(`Collection model "${viewName}" must render a table.`);
  }

  return {
    model,
    columns: model.result.columns,
    entity: model.entity,
    entityName: model.entityName,
    footer: model.result.footer,
    ordering: model.result.ordering,
    result: model.result,
  };
}
