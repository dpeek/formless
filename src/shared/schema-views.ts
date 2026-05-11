import { findAddressableField, getEntityFieldCatalog } from "./fields.ts";
import { fieldHasCreateDefault } from "./field-types.ts";
import { collectQueryContextNames, parseQueryExpression, type QueryExpression } from "./query.ts";
import {
  assertExactKeys,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { parseOptionalResultOrdering, resultOrderingsAreEquivalent } from "./schema-ordering.ts";
import {
  assertTableActionEditViews,
  parseOptionalTableColumnFormat,
  tableFooterColumnName,
} from "./schema-table-views.ts";
import { parseFieldCommitPolicy, parseFieldEditor } from "./schema-view-field-parser.ts";
import type {
  AggregateSchema,
  CollectionActionSlotSchema,
  CollectionContextNavigationSchema,
  CollectionContextPresentation,
  CollectionContextSchema,
  CollectionNavigationSchema,
  CollectionQuerySchema,
  CollectionResultSchema,
  CollectionSummarySlotSchema,
  CollectionTableFooterSlotSchema,
  CollectionViewQuerySlotSchema,
  CollectionViewSchema,
  CountDisplaySchema,
  ContextSelectionTargetSchema,
  CreateDefaultValueSchema,
  CreateViewFieldSchema,
  CreateViewVariantFieldsPresentationSchema,
  CreateViewVariantPresentationSchema,
  CreateViewSchema,
  EditViewVariantPresentationSchema,
  EditViewSchema,
  EntitySchema,
  EntityUnionSchema,
  FieldEditor,
  FieldSchema,
  ItemViewVariantPresentationSchema,
  ItemViewSchema,
  RelationshipSchema,
  ReadModelSchema,
  ToManyRelationshipSchema,
  TableViewSchema,
  TreeBranchActionSchema,
  TreeBranchPolicySchema,
  ViewVariantFieldsPresentationSchema,
  ViewFieldSchema,
  ViewSchema,
} from "./schema-types.ts";

export function parseCollectionQueries(
  value: unknown,
  entities: Record<string, EntitySchema>,
): Record<string, CollectionQuerySchema> {
  if (!isRecord(value)) {
    throw new Error("Schema queries must be an object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([queryName, query]) => {
      if (queryName.trim() === "") {
        throw new Error("Query names must be non-empty.");
      }

      return [queryName, parseCollectionQuery(queryName, query, entities)];
    }),
  );
}

function parseCollectionQuery(
  queryName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): CollectionQuerySchema {
  if (!isRecord(value)) {
    throw new Error(`Query "${queryName}" must be an object.`);
  }

  assertExactKeys(`Query "${queryName}"`, value, ["label", "entity", "expression"]);

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(`Query "${queryName}" label must be a non-empty string.`);
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Query "${queryName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Query "${queryName}" references unknown entity "${value.entity}".`);
  }

  return {
    label: value.label,
    entity: value.entity,
    expression: parseQueryExpression(
      value.expression,
      getEntityFieldCatalog(entity),
      `query ${queryName}`,
    ),
  };
}

export function parseItemViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  unions?: Record<string, EntityUnionSchema>,
): Record<string, ItemViewSchema> {
  if (!isRecord(value)) {
    throw new Error("Schema itemViews must be an object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([itemViewName, itemView]) => {
      if (itemViewName.trim() === "") {
        throw new Error("Item view names must be non-empty.");
      }

      return [itemViewName, parseItemView(itemViewName, itemView, entities, unions)];
    }),
  );
}

function parseItemView(
  itemViewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  unions?: Record<string, EntityUnionSchema>,
): ItemViewSchema {
  if (!isRecord(value)) {
    throw new Error(`Item view "${itemViewName}" must be an object.`);
  }

  assertExactKeys(
    `Item view "${itemViewName}"`,
    value,
    ["entity", "fields"],
    ["union", "variants", "fallback"],
  );

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Item view "${itemViewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Item view "${itemViewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseListViewFields(itemViewName, value.entity, value.fields, entity);
  assertViewHasFields(itemViewName, fields);
  const unionPresentation = parseItemViewUnionPresentation(
    `Item view "${itemViewName}"`,
    itemViewName,
    value,
    value.entity,
    entity,
    unions,
  );

  return {
    entity: value.entity,
    fields,
    ...unionPresentation,
  };
}

export function parseViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
  unions?: Record<string, EntityUnionSchema>,
  options: { requirePrimaryCollection?: boolean } = {},
): Record<string, ViewSchema> {
  if (!isRecord(value)) {
    throw new Error("Schema views must be an object.");
  }

  const views = Object.fromEntries(
    Object.entries(value).map(([viewName, view]) => [
      viewName,
      parseView(
        viewName,
        view,
        entities,
        queries,
        itemViews,
        tableViews,
        relationships,
        readModels,
        unions,
      ),
    ]),
  );

  if (Object.keys(views).length === 0) {
    throw new Error("Schema must define at least one view.");
  }

  assertCollectionViews(views, entities, relationships, options.requirePrimaryCollection ?? true);
  assertTableActionEditViews(views, tableViews, entities);

  return views;
}

function assertCollectionViews(
  views: Record<string, ViewSchema>,
  entities: Record<string, EntitySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  requirePrimaryCollection: boolean,
) {
  const collectionEntries = Object.entries(views).filter(
    (entry): entry is [string, CollectionViewSchema] => entry[1].type === "collection",
  );

  if (collectionEntries.length === 0) {
    throw new Error('Schema must define at least one "collection" view.');
  }

  if (
    requirePrimaryCollection &&
    !collectionEntries.some(([, view]) => view.navigation?.primary ?? true)
  ) {
    throw new Error("Schema must define at least one primary collection view.");
  }

  for (const [viewName, view] of collectionEntries) {
    if (view.type !== "collection") {
      continue;
    }

    for (const actionSlot of view.actions ?? []) {
      if (actionSlot.type !== "create") {
        continue;
      }

      const createView = views[actionSlot.createView];
      if (!createView) {
        throw new Error(
          `Collection view "${viewName}" create action references unknown view "${actionSlot.createView}".`,
        );
      }

      if (createView.type !== "create") {
        throw new Error(
          `Collection view "${viewName}" create action must reference a create view.`,
        );
      }

      validateCreateActionContextDefaults(
        viewName,
        actionSlot.createView,
        createView,
        entities,
        view.context,
        relationships,
      );
    }

    if (view.context?.createView === undefined) {
      continue;
    }

    const createView = views[view.context.createView];
    if (!createView) {
      throw new Error(
        `Collection view "${viewName}" context createView references unknown view "${view.context.createView}".`,
      );
    }

    if (createView.type !== "create") {
      throw new Error(
        `Collection view "${viewName}" context createView must reference a create view.`,
      );
    }

    if (createView.entity !== view.context.entity) {
      throw new Error(
        `Collection view "${viewName}" context createView "${view.context.createView}" must use entity "${view.context.entity}".`,
      );
    }

    if (createViewRequiresContextDefaults(createView)) {
      throw new Error(
        `Collection view "${viewName}" context createView "${view.context.createView}" must not require context defaults.`,
      );
    }
  }
}

function validateCreateActionContextDefaults(
  collectionViewName: string,
  createViewName: string,
  createView: CreateViewSchema,
  entities: Record<string, EntitySchema>,
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
) {
  if (!createViewRequiresContextDefaults(createView)) {
    return;
  }

  const context = `Collection view "${collectionViewName}" create action view "${createViewName}"`;

  if (!collectionContext) {
    throw new Error(`${context} requires context defaults but the collection has no context.`);
  }

  const entity = entities[createView.entity];

  if (!entity) {
    throw new Error(`${context} references unknown entity "${createView.entity}".`);
  }

  const relationship = getCollectionContextRelationship(collectionContext, relationships);
  if (relationship !== undefined && createView.entity !== relationship.to.entity) {
    throw new Error(`${context} must use relationship target entity "${relationship.to.entity}".`);
  }

  for (const [fieldName, defaultValue] of Object.entries(createView.defaults ?? {})) {
    if (defaultValue.name !== collectionContext.name) {
      throw new Error(
        `${context} requires context "${defaultValue.name}" but the collection context is "${collectionContext.name}".`,
      );
    }

    const field = entity.fields[fieldName];
    if (field?.type !== "reference" || field.to !== collectionContext.entity) {
      throw new Error(
        `${context} default field "${fieldName}" must reference entity "${collectionContext.entity}".`,
      );
    }

    if (relationship !== undefined && fieldName !== relationship.to.field) {
      throw new Error(
        `${context} default field "${fieldName}" must use relationship field "${relationship.to.entity}.${relationship.to.field}".`,
      );
    }
  }
}

function createViewRequiresContextDefaults(createView: CreateViewSchema) {
  return Object.keys(createView.defaults ?? {}).length > 0;
}

function parseView(
  viewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
  unions?: Record<string, EntityUnionSchema>,
): ViewSchema {
  if (viewName.trim() === "") {
    throw new Error("View names must be non-empty.");
  }

  if (!isRecord(value)) {
    throw new Error(`View "${viewName}" must be an object.`);
  }

  if (value.type !== "collection" && value.type !== "create" && value.type !== "edit") {
    throw new Error(`View "${viewName}" type must be "collection", "create", or "edit".`);
  }

  if (value.type === "collection") {
    return parseCollectionView(
      viewName,
      value,
      entities,
      queries,
      itemViews,
      tableViews,
      relationships,
      readModels,
      unions,
    );
  }

  if (value.type === "edit") {
    return parseEditView(viewName, value, entities, unions);
  }

  assertExactKeys(
    `View "${viewName}"`,
    value,
    ["type", "entity", "fields"],
    ["defaults", "union", "variants", "fallback"],
  );

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`View "${viewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`View "${viewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseCreateViewFields(viewName, value.entity, value.fields, entity);
  const defaults = parseCreateViewDefaults(viewName, value.entity, value.defaults, entity, fields);
  assertViewHasFields(viewName, fields);
  assertCreateViewIncludesRequiredFields(viewName, fields, defaults ?? {}, entity);
  const unionPresentation = parseCreateViewUnionPresentation(
    `View "${viewName}"`,
    viewName,
    value,
    value.entity,
    entity,
    unions,
  );

  return {
    type: "create",
    entity: value.entity,
    fields,
    ...(defaults === undefined ? {} : { defaults }),
    ...unionPresentation,
  };
}

function parseEditView(
  viewName: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
  unions?: Record<string, EntityUnionSchema>,
): EditViewSchema {
  assertExactKeys(
    `View "${viewName}"`,
    value,
    ["type", "entity", "fields"],
    ["union", "variants", "fallback"],
  );

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`View "${viewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`View "${viewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseListViewFields(viewName, value.entity, value.fields, entity);
  assertViewHasFields(viewName, fields);
  const unionPresentation = parseEditViewUnionPresentation(
    `View "${viewName}"`,
    viewName,
    value,
    value.entity,
    entity,
    unions,
  );

  return {
    type: "edit",
    entity: value.entity,
    fields,
    ...unionPresentation,
  };
}

function parseCollectionView(
  viewName: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
  unions?: Record<string, EntityUnionSchema>,
): CollectionViewSchema {
  assertExactKeys(
    `Collection view "${viewName}"`,
    value,
    ["type", "label", "entity", "queries", "defaultQuery", "result"],
    ["navigation", "context", "actions", "summary"],
  );

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(`Collection view "${viewName}" label must be a non-empty string.`);
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Collection view "${viewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Collection view "${viewName}" references unknown entity "${value.entity}".`);
  }

  const navigation = parseCollectionNavigation(viewName, value.navigation);
  const context = parseCollectionContext(
    viewName,
    value.context,
    value.entity,
    entities,
    queries,
    itemViews,
    relationships,
  );
  const querySlots = parseCollectionViewQuerySlots(
    viewName,
    value.entity,
    entity,
    value.queries,
    queries,
    context,
    relationships,
  );

  if (typeof value.defaultQuery !== "string" || value.defaultQuery.trim() === "") {
    throw new Error(`Collection view "${viewName}" defaultQuery must be a non-empty string.`);
  }

  if (!querySlots.some((slot) => slot.query === value.defaultQuery)) {
    throw new Error(
      `Collection view "${viewName}" defaultQuery must reference one of its query slots.`,
    );
  }

  const result = parseCollectionResult(
    viewName,
    value.entity,
    entity,
    value.result,
    entities,
    itemViews,
    tableViews,
    querySlots,
    context,
    relationships,
    readModels?.aggregates ?? {},
    unions,
  );
  const actions = parseCollectionActionSlots(viewName, value.entity, entity, value.actions);
  const summary = parseCollectionSummarySlots(
    viewName,
    value.entity,
    value.summary,
    querySlots,
    readModels?.aggregates ?? {},
  );

  return {
    type: "collection",
    label: value.label,
    entity: value.entity,
    ...(navigation === undefined ? {} : { navigation }),
    ...(context === undefined ? {} : { context }),
    queries: querySlots,
    defaultQuery: value.defaultQuery,
    result,
    ...(actions ? { actions } : {}),
    ...(summary ? { summary } : {}),
  };
}

function parseCollectionNavigation(
  viewName: string,
  value: unknown,
): CollectionNavigationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  const context = `Collection view "${viewName}" navigation`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["primary"]);

  if (typeof value.primary !== "boolean") {
    throw new Error(`${context} primary must be a boolean.`);
  }

  return { primary: value.primary };
}

function parseCollectionViewQuerySlots(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
  context?: CollectionContextSchema,
  relationships?: Record<string, RelationshipSchema>,
): CollectionViewQuerySlotSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Collection view "${viewName}" queries must be a non-empty array.`);
  }

  return value.map((slot, index) =>
    parseCollectionViewQuerySlot(
      viewName,
      entityName,
      entity,
      index,
      slot,
      queries,
      context,
      relationships,
    ),
  );
}

function parseCollectionViewQuerySlot(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  index: number,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
  collectionContext?: CollectionContextSchema,
  relationships?: Record<string, RelationshipSchema>,
): CollectionViewQuerySlotSchema {
  const context = `Collection view "${viewName}" query slot ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["query"], ["label", "count"]);

  if (typeof value.query !== "string" || value.query.trim() === "") {
    throw new Error(`${context} query must be a non-empty string.`);
  }

  const query = queries[value.query];
  if (!query) {
    throw new Error(`${context} references unknown query "${value.query}".`);
  }

  if (query.entity !== entityName) {
    throw new Error(`${context} query "${value.query}" must use entity "${entityName}".`);
  }

  validateCollectionQueryContextRequirements(
    context,
    value.query,
    query.expression,
    entity,
    collectionContext,
    relationships,
  );

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const count =
    value.count === undefined ? undefined : parseCountDisplay(`${context} count`, value.count);

  return {
    query: value.query,
    ...(label === undefined ? {} : { label }),
    ...(count === undefined ? {} : { count }),
  };
}

function parseCollectionContext(
  viewName: string,
  value: unknown,
  collectionEntityName: string,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
): CollectionContextSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  const context = `Collection view "${viewName}" context`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["name", "entity", "query", "labelField"],
    ["presentation", "navigation", "relationship", "createView", "itemView"],
  );

  const name = parseRequiredNonEmptyString(`${context} name`, value.name);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const labelField = parseRequiredNonEmptyString(`${context} labelField`, value.labelField);
  const presentation = parseCollectionContextPresentation(
    `${context} presentation`,
    value.presentation,
  );
  const navigation = parseCollectionContextNavigation(
    context,
    value.navigation,
    entityName,
    queries,
  );
  const relationship = parseCollectionContextRelationship(
    context,
    parseOptionalNonEmptyString(`${context} relationship`, value.relationship),
    entityName,
    collectionEntityName,
    relationships,
  );
  const createView = parseOptionalNonEmptyString(`${context} createView`, value.createView);
  const itemViewName = parseOptionalNonEmptyString(`${context} itemView`, value.itemView);
  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }

  const query = queries[queryName];
  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  if (query.entity !== entityName) {
    throw new Error(`${context} query "${queryName}" must use entity "${entityName}".`);
  }

  const requiredContextNames = collectQueryContextNames(query.expression);
  if (requiredContextNames.length > 0) {
    throw new Error(`${context} query "${queryName}" must not require context.`);
  }

  const field = entity.fields[labelField];
  if (!field) {
    throw new Error(
      `${context} labelField references unknown field "${entityName}.${labelField}".`,
    );
  }

  if (field.type !== "text") {
    throw new Error(`${context} labelField must reference a text field.`);
  }

  if (itemViewName !== undefined) {
    const itemView = itemViews[itemViewName];

    if (!itemView) {
      throw new Error(`${context} itemView references unknown item view "${itemViewName}".`);
    }

    if (itemView.entity !== entityName) {
      throw new Error(`${context} itemView "${itemViewName}" must use entity "${entityName}".`);
    }
  }

  return {
    name,
    entity: entityName,
    query: queryName,
    labelField,
    presentation,
    ...(navigation === undefined ? {} : { navigation }),
    ...(relationship === undefined ? {} : { relationship }),
    ...(createView === undefined ? {} : { createView }),
    ...(itemViewName === undefined ? {} : { itemView: itemViewName }),
  };
}

function parseCollectionContextNavigation(
  context: string,
  value: unknown,
  contextEntityName: string,
  queries: Record<string, CollectionQuerySchema>,
): CollectionContextNavigationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} navigation must be an object.`);
  }

  assertExactKeys(`${context} navigation`, value, ["placement", "groups"]);

  if (value.placement !== "sidebar") {
    throw new Error(`${context} navigation placement must be "sidebar".`);
  }

  if (!Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error(`${context} navigation groups must be a non-empty array.`);
  }

  return {
    placement: "sidebar",
    groups: value.groups.map((group, index) =>
      parseCollectionContextNavigationGroup(context, index, group, contextEntityName, queries),
    ),
  };
}

function parseCollectionContextNavigationGroup(
  context: string,
  index: number,
  value: unknown,
  contextEntityName: string,
  queries: Record<string, CollectionQuerySchema>,
): CollectionContextNavigationSchema["groups"][number] {
  const groupContext = `${context} navigation group ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${groupContext} must be an object.`);
  }

  assertExactKeys(groupContext, value, ["label", "query"]);

  const label = parseRequiredNonEmptyString(`${groupContext} label`, value.label);
  const queryName = parseRequiredNonEmptyString(`${groupContext} query`, value.query);
  const query = queries[queryName];

  if (!query) {
    throw new Error(`${groupContext} references unknown query "${queryName}".`);
  }

  if (query.entity !== contextEntityName) {
    throw new Error(`${groupContext} query "${queryName}" must use entity "${contextEntityName}".`);
  }

  const requiredContextNames = collectQueryContextNames(query.expression);
  if (requiredContextNames.length > 0) {
    throw new Error(`${groupContext} query "${queryName}" must not require context.`);
  }

  return {
    label,
    query: queryName,
  };
}

function parseCollectionContextPresentation(
  context: string,
  value: unknown,
): CollectionContextPresentation {
  if (value === undefined) {
    return "tabs";
  }

  if (value === "tabs" || value === "listDetail") {
    return value;
  }

  throw new Error(`${context} must be "tabs" or "listDetail".`);
}

function parseCollectionContextRelationship(
  context: string,
  relationshipName: string | undefined,
  contextEntityName: string,
  collectionEntityName: string,
  relationships: Record<string, RelationshipSchema> | undefined,
): string | undefined {
  if (relationshipName === undefined) {
    return undefined;
  }

  const relationship = relationships?.[relationshipName];
  if (!relationship) {
    throw new Error(
      `${context} relationship references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "toMany") {
    throw new Error(`${context} relationship "${relationshipName}" must be a toMany relationship.`);
  }

  if (relationship.from.entity !== contextEntityName) {
    throw new Error(
      `${context} relationship "${relationshipName}" must start from context entity "${contextEntityName}".`,
    );
  }

  if (relationship.to.entity !== collectionEntityName) {
    throw new Error(
      `${context} relationship "${relationshipName}" must target collection entity "${collectionEntityName}".`,
    );
  }

  return relationshipName;
}

function validateCollectionQueryContextRequirements(
  context: string,
  queryName: string,
  query: QueryExpression,
  entity: EntitySchema,
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
) {
  const requiredContextNames = collectQueryContextNames(query);

  if (requiredContextNames.length === 0) {
    validateRelationshipContextQuery(context, queryName, query, collectionContext, relationships);
    return;
  }

  if (!collectionContext) {
    throw new Error(
      `${context} query "${queryName}" requires context but the collection has no context.`,
    );
  }

  for (const name of requiredContextNames) {
    if (name !== collectionContext.name) {
      throw new Error(
        `${context} query "${queryName}" requires context "${name}" but the collection context is "${collectionContext.name}".`,
      );
    }
  }

  validateContextPredicateTargets(context, query, entity, collectionContext);
  validateRelationshipContextQuery(context, queryName, query, collectionContext, relationships);
}

function validateContextPredicateTargets(
  context: string,
  query: QueryExpression,
  entity: EntitySchema,
  collectionContext: CollectionContextSchema,
) {
  if (query.kind === "and" || query.kind === "or") {
    for (const expression of query.expressions) {
      validateContextPredicateTargets(context, expression, entity, collectionContext);
    }

    return;
  }

  if (query.kind !== "where" || typeof query.value !== "object" || query.value.kind !== "context") {
    return;
  }

  const field = findAddressableField(getEntityFieldCatalog(entity), query.ref);
  if (field?.type !== "reference" || field.to !== collectionContext.entity) {
    throw new Error(
      `${context} context query field must reference entity "${collectionContext.entity}".`,
    );
  }
}

function validateRelationshipContextQuery(
  context: string,
  queryName: string,
  query: QueryExpression,
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
) {
  if (collectionContext === undefined) {
    return;
  }

  const relationship = getCollectionContextRelationship(collectionContext, relationships);
  if (relationship === undefined) {
    return;
  }

  if (queryFiltersRelationshipField(query, relationship.to.field, collectionContext.name)) {
    return;
  }

  throw new Error(
    `${context} query "${queryName}" must filter relationship field "${relationship.to.entity}.${relationship.to.field}" against context "${collectionContext.name}".`,
  );
}

function queryFiltersRelationshipField(
  query: QueryExpression,
  fieldName: string,
  contextName: string,
): boolean {
  if (query.kind === "and") {
    return query.expressions.some((expression) =>
      queryFiltersRelationshipField(expression, fieldName, contextName),
    );
  }

  if (query.kind === "or") {
    return query.expressions.every((expression) =>
      queryFiltersRelationshipField(expression, fieldName, contextName),
    );
  }

  return (
    query.kind === "where" &&
    query.op === "eq" &&
    query.ref.kind === "value" &&
    query.ref.name === fieldName &&
    typeof query.value === "object" &&
    query.value.kind === "context" &&
    query.value.name === contextName
  );
}

function getCollectionContextRelationship(
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
): ToManyRelationshipSchema | undefined {
  if (collectionContext?.relationship === undefined) {
    return undefined;
  }

  const relationship = relationships?.[collectionContext.relationship];

  if (relationship?.kind !== "toMany") {
    return undefined;
  }

  return relationship;
}

function parseCollectionResult(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  value: unknown,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  querySlots: CollectionViewQuerySlotSchema[],
  collectionContext: CollectionContextSchema | undefined,
  relationships: Record<string, RelationshipSchema> | undefined,
  aggregates: Record<string, AggregateSchema>,
  unions: Record<string, EntityUnionSchema> | undefined,
): CollectionResultSchema {
  if (!isRecord(value)) {
    throw new Error(`Collection view "${viewName}" result must be an object.`);
  }

  if (value.type === "list") {
    assertExactKeys(
      `Collection view "${viewName}" result`,
      value,
      ["type", "itemView"],
      ["ordering"],
    );

    if (typeof value.itemView !== "string" || value.itemView.trim() === "") {
      throw new Error(`Collection view "${viewName}" result itemView must be a non-empty string.`);
    }

    const itemView = itemViews[value.itemView];
    if (!itemView) {
      throw new Error(
        `Collection view "${viewName}" result references unknown item view "${value.itemView}".`,
      );
    }

    if (itemView.entity !== entityName) {
      throw new Error(
        `Collection view "${viewName}" result item view "${value.itemView}" must use entity "${entityName}".`,
      );
    }

    const ordering = parseOptionalResultOrdering(
      `Collection view "${viewName}" result ordering`,
      value.ordering,
      entityName,
      entity,
    );

    return {
      type: "list",
      itemView: value.itemView,
      ...(ordering === undefined ? {} : { ordering }),
    };
  }

  if (value.type === "table") {
    assertExactKeys(
      `Collection view "${viewName}" result`,
      value,
      ["type", "tableView"],
      ["footer", "ordering"],
    );

    if (typeof value.tableView !== "string" || value.tableView.trim() === "") {
      throw new Error(`Collection view "${viewName}" result tableView must be a non-empty string.`);
    }

    const tableView = tableViews[value.tableView];
    if (!tableView) {
      throw new Error(
        `Collection view "${viewName}" result references unknown table view "${value.tableView}".`,
      );
    }

    if (tableView.entity !== entityName) {
      throw new Error(
        `Collection view "${viewName}" result table view "${value.tableView}" must use entity "${entityName}".`,
      );
    }

    const ordering = parseOptionalResultOrdering(
      `Collection view "${viewName}" result ordering`,
      value.ordering,
      entityName,
      entity,
    );

    if (
      ordering !== undefined &&
      tableView.ordering !== undefined &&
      !resultOrderingsAreEquivalent(ordering, tableView.ordering)
    ) {
      throw new Error(
        `Collection view "${viewName}" result ordering conflicts with table view "${value.tableView}" ordering.`,
      );
    }

    const footer = parseCollectionTableFooterSlots(
      viewName,
      entityName,
      value.footer,
      tableView,
      querySlots,
      aggregates,
    );

    return {
      type: "table",
      tableView: value.tableView,
      ...(ordering === undefined ? {} : { ordering }),
      ...(footer === undefined ? {} : { footer }),
    };
  }

  if (value.type === "tree") {
    assertExactKeys(
      `Collection view "${viewName}" result`,
      value,
      ["type", "relationship", "childField", "childItemView"],
      ["placementItemView", "ordering", "branches", "maxDepth"],
    );

    if (!collectionContext) {
      throw new Error(`Collection view "${viewName}" result tree requires a collection context.`);
    }

    const relationshipName = parseRequiredNonEmptyString(
      `Collection view "${viewName}" result relationship`,
      value.relationship,
    );
    const relationship = relationships?.[relationshipName];

    if (!relationship) {
      throw new Error(
        `Collection view "${viewName}" result references unknown relationship "${relationshipName}".`,
      );
    }

    if (relationship.kind !== "toMany") {
      throw new Error(
        `Collection view "${viewName}" result relationship "${relationshipName}" must be a toMany relationship.`,
      );
    }

    if (relationship.from.entity !== collectionContext.entity) {
      throw new Error(
        `Collection view "${viewName}" result relationship "${relationshipName}" must start from context entity "${collectionContext.entity}".`,
      );
    }

    if (relationship.to.entity !== entityName) {
      throw new Error(
        `Collection view "${viewName}" result relationship "${relationshipName}" must target collection entity "${entityName}".`,
      );
    }

    const childFieldName = parseRequiredNonEmptyString(
      `Collection view "${viewName}" result childField`,
      value.childField,
    );
    const childField = entity.fields[childFieldName];

    if (!childField) {
      throw new Error(
        `Collection view "${viewName}" result childField references unknown field "${entityName}.${childFieldName}".`,
      );
    }

    if (childField.type !== "reference") {
      throw new Error(`Collection view "${viewName}" result childField must be a reference field.`);
    }

    if (childField.to !== collectionContext.entity) {
      throw new Error(
        `Collection view "${viewName}" result childField must reference context entity "${collectionContext.entity}".`,
      );
    }

    const childItemViewName = parseRequiredNonEmptyString(
      `Collection view "${viewName}" result childItemView`,
      value.childItemView,
    );
    const childItemView = itemViews[childItemViewName];

    if (!childItemView) {
      throw new Error(
        `Collection view "${viewName}" result references unknown child item view "${childItemViewName}".`,
      );
    }

    if (!entities[childField.to]) {
      throw new Error(`Missing child entity "${childField.to}".`);
    }

    if (childItemView.entity !== childField.to) {
      throw new Error(
        `Collection view "${viewName}" result child item view "${childItemViewName}" must use entity "${childField.to}".`,
      );
    }

    const placementItemViewName = parseOptionalNonEmptyString(
      `Collection view "${viewName}" result placementItemView`,
      value.placementItemView,
    );

    if (placementItemViewName !== undefined) {
      const placementItemView = itemViews[placementItemViewName];

      if (!placementItemView) {
        throw new Error(
          `Collection view "${viewName}" result references unknown placement item view "${placementItemViewName}".`,
        );
      }

      if (placementItemView.entity !== entityName) {
        throw new Error(
          `Collection view "${viewName}" result placement item view "${placementItemViewName}" must use entity "${entityName}".`,
        );
      }
    }

    const maxDepth = parseOptionalTreeMaxDepth(
      `Collection view "${viewName}" result maxDepth`,
      value.maxDepth,
    );
    const ordering = parseOptionalResultOrdering(
      `Collection view "${viewName}" result ordering`,
      value.ordering,
      entityName,
      entity,
    );
    const branches = parseOptionalTreeBranchPolicy(
      `Collection view "${viewName}" result branches`,
      value.branches,
      childItemViewName,
      childItemView,
      unions,
    );

    return {
      type: "tree",
      relationship: relationshipName,
      childField: childFieldName,
      childItemView: childItemViewName,
      ...(placementItemViewName === undefined ? {} : { placementItemView: placementItemViewName }),
      ...(ordering === undefined ? {} : { ordering }),
      ...(branches === undefined ? {} : { branches }),
      ...(maxDepth === undefined ? {} : { maxDepth }),
    };
  }

  throw new Error(`Collection view "${viewName}" result type must be "list", "table", or "tree".`);
}

function parseOptionalTreeMaxDepth(context: string, value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function parseOptionalTreeBranchPolicy(
  context: string,
  value: unknown,
  childItemViewName: string,
  childItemView: ItemViewSchema,
  unions: Record<string, EntityUnionSchema> | undefined,
): TreeBranchPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["variants"]);

  if (childItemView.union === undefined) {
    throw new Error(
      `${context} requires child item view "${childItemViewName}" to define a union.`,
    );
  }

  const union = unions?.[childItemView.union];

  if (!union) {
    throw new Error(
      `${context} references missing child item view union "${childItemView.union}".`,
    );
  }

  return {
    variants: parseTreeBranchVariantPolicy(`${context} variants`, value.variants, union),
  };
}

function parseTreeBranchVariantPolicy(
  context: string,
  value: unknown,
  union: EntityUnionSchema,
): Record<string, TreeBranchActionSchema> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([variantName, action]) => {
      if (variantName.trim() === "") {
        throw new Error(`${context} variant keys must be non-empty strings.`);
      }

      if (union.variants[variantName] === undefined) {
        throw new Error(
          `${context} variant "${variantName}" must match a variant in union "${union.entity}.${union.discriminator}".`,
        );
      }

      if (action !== "leaf") {
        throw new Error(`${context} variant "${variantName}" action must be "leaf".`);
      }

      return [variantName, action];
    }),
  );
}

function parseCollectionTableFooterSlots(
  viewName: string,
  entityName: string,
  value: unknown,
  tableView: TableViewSchema,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionTableFooterSlotSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Collection view "${viewName}" result footer must be an array.`);
  }

  const slots = value.map((slot, index) =>
    parseCollectionTableFooterSlot(
      viewName,
      entityName,
      index,
      slot,
      tableView,
      querySlots,
      aggregates,
    ),
  );
  const seenColumns = new Set<string>();

  for (const slot of slots) {
    if (seenColumns.has(slot.column)) {
      throw new Error(
        `Collection view "${viewName}" result footer column "${slot.column}" must be unique.`,
      );
    }

    seenColumns.add(slot.column);
  }

  return slots.length > 0 ? slots : undefined;
}

function parseCollectionTableFooterSlot(
  viewName: string,
  entityName: string,
  index: number,
  value: unknown,
  tableView: TableViewSchema,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionTableFooterSlotSchema {
  const context = `Collection view "${viewName}" result footer slot ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "column", "aggregate"], ["label", "suffix", "format"]);

  if (value.type !== "aggregate") {
    throw new Error(`${context} type must be "aggregate".`);
  }

  const column = parseRequiredNonEmptyString(`${context} column`, value.column);
  const tableColumn = tableView.columns.find(
    (candidate) => tableFooterColumnName(candidate) === column,
  );

  if (!tableColumn || tableColumn.display === "hidden") {
    throw new Error(`${context} references unknown visible table column "${column}".`);
  }

  const aggregateName = parseRequiredNonEmptyString(`${context} aggregate`, value.aggregate);
  const aggregate = aggregates[aggregateName];

  if (!aggregate) {
    throw new Error(`${context} references unknown aggregate "${aggregateName}".`);
  }

  if (!querySlots.some((slot) => slot.query === aggregate.query)) {
    throw new Error(
      `${context} aggregate "${aggregateName}" query "${aggregate.query}" must be one of its query slots for entity "${entityName}".`,
    );
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "aggregate",
    column,
    aggregate: aggregateName,
    ...(label === undefined ? {} : { label }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
}

function parseCollectionActionSlots(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  value: unknown,
): CollectionActionSlotSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Collection view "${viewName}" actions must be an array.`);
  }

  const actions = value.map((slot, index) =>
    parseCollectionActionSlot(viewName, entityName, entity, index, slot),
  );

  return actions.length > 0 ? actions : undefined;
}

function parseCollectionActionSlot(
  viewName: string,
  entityName: string,
  entity: EntitySchema,
  index: number,
  value: unknown,
): CollectionActionSlotSchema {
  const context = `Collection view "${viewName}" action slot ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "create") {
    assertExactKeys(context, value, ["type", "createView"], ["label"]);

    if (typeof value.createView !== "string" || value.createView.trim() === "") {
      throw new Error(`${context} createView must be a non-empty string.`);
    }

    const label = parseOptionalNonEmptyString(`${context} label`, value.label);

    return {
      type: "create",
      createView: value.createView,
      ...(label === undefined ? {} : { label }),
    };
  }

  if (value.type === "entityAction") {
    assertExactKeys(context, value, ["type", "action"], ["label", "count"]);

    if (typeof value.action !== "string" || value.action.trim() === "") {
      throw new Error(`${context} action must be a non-empty string.`);
    }

    if (!entity.actions?.[value.action]) {
      throw new Error(
        `${context} references unknown action "${value.action}" for entity "${entityName}".`,
      );
    }

    const label = parseOptionalNonEmptyString(`${context} label`, value.label);
    const count =
      value.count === undefined ? undefined : parseCountDisplay(`${context} count`, value.count);

    return {
      type: "entityAction",
      action: value.action,
      ...(label === undefined ? {} : { label }),
      ...(count === undefined ? {} : { count }),
    };
  }

  throw new Error(`${context} type must be "create" or "entityAction".`);
}

function parseCollectionSummarySlots(
  viewName: string,
  entityName: string,
  value: unknown,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionSummarySlotSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Collection view "${viewName}" summary must be an array.`);
  }

  const slots = value.map((slot, index) =>
    parseCollectionSummarySlot(viewName, entityName, index, slot, querySlots, aggregates),
  );

  return slots.length > 0 ? slots : undefined;
}

function parseCollectionSummarySlot(
  viewName: string,
  entityName: string,
  index: number,
  value: unknown,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
): CollectionSummarySlotSchema {
  const context = `Collection view "${viewName}" summary slot ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "aggregate"], ["label", "suffix", "format"]);

  if (value.type !== "aggregate") {
    throw new Error(`${context} type must be "aggregate".`);
  }

  const aggregateName = parseRequiredNonEmptyString(`${context} aggregate`, value.aggregate);
  const aggregate = aggregates[aggregateName];

  if (!aggregate) {
    throw new Error(`${context} references unknown aggregate "${aggregateName}".`);
  }

  if (!querySlots.some((slot) => slot.query === aggregate.query)) {
    throw new Error(
      `${context} aggregate "${aggregateName}" query "${aggregate.query}" must be one of its query slots for entity "${entityName}".`,
    );
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "aggregate",
    aggregate: aggregateName,
    ...(label === undefined ? {} : { label }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
}

function parseCountDisplay(context: string, value: unknown): CountDisplaySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type"], ["label"]);

  if (value.type !== "count") {
    throw new Error(`${context} type must be "count".`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);

  return {
    type: "count",
    ...(label === undefined ? {} : { label }),
  };
}

function parseItemViewUnionPresentation(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  unions: Record<string, EntityUnionSchema> | undefined,
):
  | {
      union: string;
      variants: Record<string, ItemViewVariantPresentationSchema>;
      fallback?: ItemViewVariantPresentationSchema;
    }
  | Record<string, never> {
  return parseViewUnionPresentation(
    context,
    viewName,
    value,
    entityName,
    unions,
    (variantContext, variantViewName, variant) =>
      parseItemViewVariantPresentation(
        variantContext,
        variantViewName,
        variant,
        entityName,
        entity,
      ),
  );
}

function parseEditViewUnionPresentation(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  unions: Record<string, EntityUnionSchema> | undefined,
):
  | {
      union: string;
      variants: Record<string, EditViewVariantPresentationSchema>;
      fallback?: EditViewVariantPresentationSchema;
    }
  | Record<string, never> {
  return parseViewUnionPresentation(
    context,
    viewName,
    value,
    entityName,
    unions,
    (variantContext, variantViewName, variant) =>
      parseRecordFieldsVariantPresentation(
        variantContext,
        variantViewName,
        variant,
        entityName,
        entity,
      ),
  );
}

function parseCreateViewUnionPresentation(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  unions: Record<string, EntityUnionSchema> | undefined,
):
  | {
      union: string;
      variants: Record<string, CreateViewVariantPresentationSchema>;
      fallback?: CreateViewVariantPresentationSchema;
    }
  | Record<string, never> {
  return parseViewUnionPresentation(
    context,
    viewName,
    value,
    entityName,
    unions,
    (variantContext, variantViewName, variant) =>
      parseCreateFieldsVariantPresentation(
        variantContext,
        variantViewName,
        variant,
        entityName,
        entity,
      ),
  );
}

function parseViewUnionPresentation<TPresentation>(
  context: string,
  viewName: string,
  value: Record<string, unknown>,
  entityName: string,
  unions: Record<string, EntityUnionSchema> | undefined,
  parseVariant: (context: string, viewName: string, value: unknown) => TPresentation,
):
  | {
      union: string;
      variants: Record<string, TPresentation>;
      fallback?: TPresentation;
    }
  | Record<string, never> {
  if (value.union === undefined) {
    if (value.variants !== undefined || value.fallback !== undefined) {
      throw new Error(`${context} variants require a union.`);
    }

    return {};
  }

  const unionName = parseRequiredNonEmptyString(`${context} union`, value.union);
  const union = unions?.[unionName];

  if (!union) {
    throw new Error(`${context} references unknown union "${unionName}".`);
  }

  if (union.entity !== entityName) {
    throw new Error(`${context} union "${unionName}" must use entity "${entityName}".`);
  }

  const variants = parseViewUnionVariants(context, viewName, value.variants, union, parseVariant);
  const fallback =
    value.fallback === undefined
      ? undefined
      : parseVariant(`${context} fallback`, `${viewName}.fallback`, value.fallback);

  assertViewUnionCoverage(context, unionName, union, variants, fallback);

  return {
    union: unionName,
    variants,
    ...(fallback === undefined ? {} : { fallback }),
  };
}

function parseViewUnionVariants<TPresentation>(
  context: string,
  viewName: string,
  value: unknown,
  union: EntityUnionSchema,
  parseVariant: (context: string, viewName: string, value: unknown) => TPresentation,
): Record<string, TPresentation> {
  if (!isRecord(value)) {
    throw new Error(`${context} variants must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${context} variants must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([variantName, variant]) => {
      if (variantName.trim() === "") {
        throw new Error(`${context} variant keys must be non-empty strings.`);
      }

      if (union.variants[variantName] === undefined) {
        throw new Error(
          `${context} variant "${variantName}" must match a variant in union "${union.entity}.${union.discriminator}".`,
        );
      }

      return [
        variantName,
        parseVariant(`${context} variant "${variantName}"`, `${viewName}.${variantName}`, variant),
      ];
    }),
  );
}

function assertViewUnionCoverage<TPresentation>(
  context: string,
  unionName: string,
  union: EntityUnionSchema,
  variants: Record<string, TPresentation>,
  fallback: TPresentation | undefined,
) {
  if (fallback !== undefined) {
    return;
  }

  if (union.fallback !== undefined) {
    throw new Error(
      `${context} union "${unionName}" must define a fallback presentation because the union has a fallback.`,
    );
  }

  const missingVariants = Object.keys(union.variants).filter(
    (variantName) => variants[variantName] === undefined,
  );

  if (missingVariants.length > 0) {
    throw new Error(
      `${context} union "${unionName}" must define variant presentations for "${missingVariants.join(
        '", "',
      )}" or a fallback.`,
    );
  }
}

function parseItemViewVariantPresentation(
  context: string,
  viewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): ItemViewVariantPresentationSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.presentation === "fields") {
    return parseRecordFieldsVariantPresentation(context, viewName, value, entityName, entity);
  }

  if (value.presentation !== "contextLink") {
    throw new Error(`${context} presentation must be "fields" or "contextLink".`);
  }

  assertExactKeys(context, value, ["presentation", "labelField", "target"]);

  const labelField = parseRequiredNonEmptyString(`${context} labelField`, value.labelField);
  const field = entity.fields[labelField];

  if (!field) {
    throw new Error(
      `${context} labelField references unknown field "${entityName}.${labelField}".`,
    );
  }

  if (field.type !== "text") {
    throw new Error(`${context} labelField must reference a text field.`);
  }

  return {
    presentation: "contextLink",
    labelField,
    target: parseContextSelectionTarget(`${context} target`, value.target),
  };
}

function parseRecordFieldsVariantPresentation(
  context: string,
  viewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): ViewVariantFieldsPresentationSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.presentation !== "fields") {
    throw new Error(`${context} presentation must be "fields".`);
  }

  assertExactKeys(context, value, ["presentation", "fields"]);

  const fields = parseListViewFields(viewName, entityName, value.fields, entity);
  assertViewHasFields(viewName, fields);

  return {
    presentation: "fields",
    fields,
  };
}

function parseCreateFieldsVariantPresentation(
  context: string,
  viewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): CreateViewVariantFieldsPresentationSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.presentation !== "fields") {
    throw new Error(`${context} presentation must be "fields".`);
  }

  assertExactKeys(context, value, ["presentation", "fields"]);

  const fields = parseCreateViewFields(viewName, entityName, value.fields, entity);
  assertViewHasFields(viewName, fields);

  return {
    presentation: "fields",
    fields,
  };
}

function parseContextSelectionTarget(
  context: string,
  value: unknown,
): ContextSelectionTargetSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind", "context", "record"]);

  if (value.kind !== "selectContext") {
    throw new Error(`${context} kind must be "selectContext".`);
  }

  const contextName = parseRequiredNonEmptyString(`${context} context`, value.context);

  if (value.record !== "self") {
    throw new Error(`${context} record must be "self".`);
  }

  return {
    kind: "selectContext",
    context: contextName,
    record: "self",
  };
}

function parseListViewFields(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
): Record<string, ViewFieldSchema> {
  if (!isRecord(value)) {
    throw new Error(`View "${viewName}" fields must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldName, field]) => [
      fieldName,
      parseListViewField(viewName, entityName, fieldName, field, entity),
    ]),
  );
}

function parseListViewField(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
): ViewFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`View field "${viewName}.${fieldName}" must be an object.`);
  }

  const allowedKeys = new Set(["editor", "commit"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`View field "${viewName}.${fieldName}" has unsupported key "${key}".`);
    }
  }

  const field = entity.fields[fieldName];
  if (!field) {
    throw new Error(`View "${viewName}" references unknown field "${entityName}.${fieldName}".`);
  }

  const context = `View field "${viewName}.${fieldName}"`;
  const editor = parseFieldEditor(context, value.editor, field);
  const commit = parseFieldCommitPolicy(context, value.commit, field);

  return {
    editor,
    commit,
  };
}

function parseCreateViewFields(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
): Record<string, CreateViewFieldSchema> {
  if (!isRecord(value)) {
    throw new Error(`View "${viewName}" fields must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldName, field]) => [
      fieldName,
      parseCreateViewField(viewName, entityName, fieldName, field, entity),
    ]),
  );
}

function parseCreateViewField(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
): CreateViewFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`View field "${viewName}.${fieldName}" must be an object.`);
  }

  const allowedKeys = new Set(["editor"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`View field "${viewName}.${fieldName}" has unsupported key "${key}".`);
    }
  }

  const field = entity.fields[fieldName];
  if (!field) {
    throw new Error(`View "${viewName}" references unknown field "${entityName}.${fieldName}".`);
  }

  const editor = parseViewFieldEditor(viewName, fieldName, value.editor, field);

  return {
    editor,
  };
}

function parseCreateViewDefaults(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  fields: Record<string, CreateViewFieldSchema>,
): Record<string, CreateDefaultValueSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Create view "${viewName}" defaults must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`Create view "${viewName}" defaults must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([fieldName, defaultValue]) => [
      fieldName,
      parseCreateViewDefault(viewName, entityName, fieldName, defaultValue, entity, fields),
    ]),
  );
}

function parseCreateViewDefault(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
  fields: Record<string, CreateViewFieldSchema>,
): CreateDefaultValueSchema {
  const context = `Create view "${viewName}" default "${fieldName}"`;

  if (fieldName.trim() === "") {
    throw new Error(`Create view "${viewName}" default field names must be non-empty.`);
  }

  const field = entity.fields[fieldName];
  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  if (fieldName in fields) {
    throw new Error(`${context} must not also appear in fields.`);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind", "name"]);

  if (value.kind !== "context") {
    throw new Error(`${context} has unsupported kind "${String(value.kind)}".`);
  }

  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error(`${context} name must be a non-empty string.`);
  }

  if (field.type !== "reference") {
    throw new Error(`${context} requires a reference field.`);
  }

  return { kind: "context", name: value.name };
}

function parseViewFieldEditor(
  viewName: string,
  fieldName: string,
  value: unknown,
  field: FieldSchema,
): FieldEditor {
  return parseFieldEditor(`View field "${viewName}.${fieldName}"`, value, field);
}

function assertViewHasFields(viewName: string, fields: Record<string, unknown>) {
  if (Object.keys(fields).length === 0) {
    throw new Error(`View "${viewName}" must define at least one field.`);
  }
}

function assertCreateViewIncludesRequiredFields(
  viewName: string,
  fields: Record<string, CreateViewFieldSchema>,
  defaults: Record<string, CreateDefaultValueSchema>,
  entity: EntitySchema,
) {
  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (
      field.required &&
      !(fieldName in fields) &&
      !(fieldName in defaults) &&
      !fieldHasCreateDefault(field)
    ) {
      throw new Error(`Create view "${viewName}" must include required field "${fieldName}".`);
    }
  }
}
