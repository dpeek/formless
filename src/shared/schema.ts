import { parseEntityActionsForEntities } from "./schema-actions.ts";
import { parseEntities } from "./schema-fields.ts";
import { assertExactKeys, isRecord } from "./schema-parse-helpers.ts";
import { parseReadModels } from "./schema-read-models.ts";
import { parseRelationships } from "./schema-relationships.ts";
import { parseScreens } from "./schema-screens.ts";
import { parseTableViews } from "./schema-table-views.ts";
import { parseUnions } from "./schema-unions.ts";
import { parseCollectionQueries, parseItemViews, parseViews } from "./schema-views.ts";
import type { AppSchema } from "./schema-types.ts";

export type * from "./schema-types.ts";

export function parseAppSchema(value: unknown): AppSchema {
  if (!isRecord(value)) {
    throw new Error("Schema must be an object.");
  }

  assertExactKeys(
    "Schema",
    value,
    ["version", "entities", "queries", "itemViews", "tableViews", "views"],
    ["relationships", "readModels", "screens", "unions"],
  );

  const version = value.version;
  if (version !== 1) {
    throw new Error("Schema version must be 1.");
  }

  const parsedEntities = parseEntities(value.entities);
  if (Object.keys(parsedEntities.entities).length === 0) {
    throw new Error("Schema must define at least one entity.");
  }

  const relationships = parseRelationships(value.relationships, parsedEntities.entities);
  const queries = parseCollectionQueries(value.queries, parsedEntities.entities);
  const entities = parseEntityActionsForEntities(
    parsedEntities.entities,
    parsedEntities.actionInputsByEntity,
    queries,
    relationships,
  );
  const readModels = parseReadModels(value.readModels, entities, queries);
  const unions = parseUnions(value.unions, entities);
  const itemViews = parseItemViews(value.itemViews, entities, unions);
  const tableViews = parseTableViews(value.tableViews, entities, itemViews, readModels);
  const views = parseViews(
    value.views,
    entities,
    queries,
    itemViews,
    tableViews,
    relationships,
    readModels,
    unions,
    { requirePrimaryCollection: value.screens === undefined },
  );
  const screens = parseScreens(value.screens, views);

  return {
    version,
    entities,
    ...(relationships === undefined ? {} : { relationships }),
    queries,
    ...(readModels === undefined ? {} : { readModels }),
    ...(unions === undefined ? {} : { unions }),
    itemViews,
    tableViews,
    views,
    ...(screens === undefined ? {} : { screens }),
  };
}

export function stringifySchema(schema: AppSchema) {
  return JSON.stringify(schema, null, 2);
}
