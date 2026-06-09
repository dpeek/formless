import { renderToStaticMarkup } from "react-dom/server";

import { applyBootstrapResponse } from "../client/store.ts";
import type { TableCollectionResultModel } from "../client/collection-result-model.ts";
import {
  selectCollectionModels,
  type HomeQueryTabConfig,
  type HomeViewModel,
  type TableColumnConfig,
  type TableOrderingConfig,
} from "../client/views.ts";
import { RecordTable } from "../app/generated/table.tsx";
import type { StoredRecord } from "../shared/protocol.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { AppSchema, EntitySchema } from "@dpeek/formless-schema";
import { bootstrapResponse } from "./protocol-builders.ts";

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

export function renderRecordTableHtml({
  columns,
  entity,
  entityName,
  footer,
  ordering,
  query = { kind: "all" },
  queryName,
  records,
  result,
  schema,
  schemaKey,
  tableViewName = "testTable",
}: {
  columns?: TableColumnConfig[];
  entity: EntitySchema;
  entityName: string;
  footer?: ReturnType<typeof requiredTableModel>["footer"];
  ordering?: TableOrderingConfig;
  query?: HomeQueryTabConfig["query"];
  queryName?: string;
  records: StoredRecord[];
  result?: TableCollectionResultModel;
  schema: AppSchema;
  schemaKey?: SchemaKey;
  tableViewName?: string;
}) {
  applyBootstrapResponse(bootstrapResponse(schema, records), schemaKey);
  const tableResult = result ?? tableResultFromProps({ columns, footer, ordering, tableViewName });

  return renderToStaticMarkup(
    <RecordTable
      entity={entity}
      entityName={entityName}
      query={query}
      queryName={queryName}
      result={tableResult}
    />,
  );
}

export function renderTableViewHtml({
  query = { kind: "all" },
  records,
  schema,
  schemaKey,
  viewName,
}: {
  query?: HomeQueryTabConfig["query"];
  records: StoredRecord[];
  schema: AppSchema;
  schemaKey?: SchemaKey;
  viewName: string;
}) {
  const table = requiredTableModel(schema, viewName);

  return renderRecordTableHtml({
    entity: table.entity,
    entityName: table.entityName,
    query,
    records,
    result: table.result,
    schema,
    schemaKey,
  });
}

function tableResultFromProps({
  columns,
  footer,
  ordering,
  tableViewName,
}: {
  columns: TableColumnConfig[] | undefined;
  footer?: ReturnType<typeof requiredTableModel>["footer"];
  ordering?: TableOrderingConfig;
  tableViewName: string;
}): TableCollectionResultModel {
  if (columns === undefined) {
    throw new Error("RecordTable test helper requires columns or a table result.");
  }

  return {
    type: "table",
    tableViewName,
    columns,
    transitionActions: [],
    ...(ordering === undefined ? {} : { ordering }),
    ...(footer === undefined ? {} : { footer }),
  };
}
