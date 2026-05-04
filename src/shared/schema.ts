import { parseEntityActionsForEntities } from "./schema-actions.ts";
import { parseEntities } from "./schema-fields.ts";
import { assertExactKeys, isRecord } from "./schema-parse-helpers.ts";
import {
  parseCollectionQueries,
  parseItemViews,
  parseTableViews,
  parseViews,
} from "./schema-views.ts";
import type { AppSchema } from "./schema-types.ts";

export type * from "./schema-types.ts";

export function parseAppSchema(value: unknown): AppSchema {
  if (!isRecord(value)) {
    throw new Error("Schema must be an object.");
  }

  assertExactKeys("Schema", value, [
    "version",
    "entities",
    "queries",
    "itemViews",
    "tableViews",
    "views",
  ]);

  const version = value.version;
  if (version !== 1) {
    throw new Error("Schema version must be 1.");
  }

  const parsedEntities = parseEntities(value.entities);
  if (Object.keys(parsedEntities.entities).length === 0) {
    throw new Error("Schema must define at least one entity.");
  }

  const queries = parseCollectionQueries(value.queries, parsedEntities.entities);
  const entities = parseEntityActionsForEntities(
    parsedEntities.entities,
    parsedEntities.actionInputsByEntity,
    queries,
  );
  const itemViews = parseItemViews(value.itemViews, entities);
  const tableViews = parseTableViews(value.tableViews, entities, itemViews);
  const views = parseViews(value.views, entities, queries, itemViews, tableViews);

  return { version, entities, queries, itemViews, tableViews, views };
}

export function stringifySchema(schema: AppSchema) {
  return JSON.stringify(schema, null, 2);
}
