import { renderToStaticMarkup } from "react-dom/server";

import { applyBootstrapResponse } from "../client/store.ts";
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
import type { AppSchema, EntitySchema } from "../shared/schema.ts";
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
  schema,
  schemaKey,
}: {
  columns: TableColumnConfig[];
  entity: EntitySchema;
  entityName: string;
  footer?: ReturnType<typeof requiredTableModel>["footer"];
  ordering?: TableOrderingConfig;
  query?: HomeQueryTabConfig["query"];
  queryName?: string;
  records: StoredRecord[];
  schema: AppSchema;
  schemaKey?: SchemaKey;
}) {
  applyBootstrapResponse(bootstrapResponse(schema, records), schemaKey);

  return renderToStaticMarkup(
    <RecordTable
      columns={columns}
      entity={entity}
      entityName={entityName}
      footer={footer}
      ordering={ordering}
      query={query}
      queryName={queryName}
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
    columns: table.columns,
    entity: table.entity,
    entityName: table.entityName,
    footer: table.footer,
    ordering: table.ordering,
    query,
    records,
    schema,
    schemaKey,
  });
}
