import { fieldRefsEqual, getEntityFieldCatalog } from "./fields.ts";
import { parseQueryExpression, type QueryExpression } from "./query.ts";

export type TextFieldSchema = {
  type: "text";
  required: boolean;
  label?: string;
};

export type BooleanFieldSchema = {
  type: "boolean";
  required: boolean;
  label?: string;
  default?: boolean;
};

export type DateFieldSchema = {
  type: "date";
  required: boolean;
  label?: string;
};

export type FieldSchema = TextFieldSchema | BooleanFieldSchema | DateFieldSchema;

export type FieldCommitPolicy = "immediate" | "field-commit";

export type FieldEditor = "text" | "boolean" | "date";

export type ViewFieldSchema = {
  editor: FieldEditor;
  commit: FieldCommitPolicy;
};

export type CreateViewFieldSchema = {
  editor: FieldEditor;
};

export type CollectionQuerySchema = {
  label: string;
  entity: string;
  expression: QueryExpression;
};

export type ItemViewSchema = {
  entity: string;
  fields: Record<string, ViewFieldSchema>;
};

export type CountDisplaySchema = {
  type: "count";
  label?: string;
};

export type CollectionViewQuerySlotSchema = {
  query: string;
  label?: string;
  count?: CountDisplaySchema;
};

export type CollectionResultSchema = {
  type: "list";
  itemView: string;
};

export type CollectionActionSlotSchema =
  | {
      type: "create";
      createView: string;
      label?: string;
    }
  | {
      type: "entityAction";
      action: string;
      label?: string;
      count?: CountDisplaySchema;
    };

export type CollectionViewSchema = {
  type: "collection";
  label: string;
  entity: string;
  queries: CollectionViewQuerySlotSchema[];
  defaultQuery: string;
  result: CollectionResultSchema;
  actions?: CollectionActionSlotSchema[];
};

export type CreateViewSchema = {
  type: "create";
  entity: string;
  fields: Record<string, CreateViewFieldSchema>;
};

export type ViewSchema = CollectionViewSchema | CreateViewSchema;

export type GenericMutationPolicy = {
  enabled: boolean;
};

export type DeleteMutationPolicy = {
  enabled: false;
};

export type EntityMutationPolicy = {
  create: GenericMutationPolicy;
  patch: GenericMutationPolicy;
  delete: DeleteMutationPolicy;
};

export type EntityActionKind = "clear-completed";

export type EntityActionTargetSchema = {
  query: string;
};

export type EntityActionSchema = {
  label: string;
  kind: EntityActionKind;
  target: EntityActionTargetSchema;
};

export type EntitySchema = {
  label: string;
  fields: Record<string, FieldSchema>;
  mutations: EntityMutationPolicy;
  actions?: Record<string, EntityActionSchema>;
};

export type AppSchema = {
  version: number;
  entities: Record<string, EntitySchema>;
  queries: Record<string, CollectionQuerySchema>;
  itemViews: Record<string, ItemViewSchema>;
  views: Record<string, ViewSchema>;
};

type ParsedEntityCatalog = {
  entities: Record<string, EntitySchema>;
  actionInputsByEntity: Record<string, unknown>;
};

export function parseAppSchema(value: unknown): AppSchema {
  if (!isRecord(value)) {
    throw new Error("Schema must be an object.");
  }

  assertExactKeys("Schema", value, ["version", "entities", "queries", "itemViews", "views"]);

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
  const views = parseViews(value.views, entities, queries, itemViews);

  return { version, entities, queries, itemViews, views };
}

export function stringifySchema(schema: AppSchema) {
  return JSON.stringify(schema, null, 2);
}

function parseEntities(value: unknown): ParsedEntityCatalog {
  if (!isRecord(value)) {
    throw new Error("Schema entities must be an object.");
  }

  const entities: Record<string, EntitySchema> = {};
  const actionInputsByEntity: Record<string, unknown> = {};

  for (const [entityName, entityValue] of Object.entries(value)) {
    if (entityName.trim() === "") {
      throw new Error("Entity names must be non-empty.");
    }

    const { actionsInput, entity } = parseEntityBase(entityName, entityValue);
    entities[entityName] = entity;

    if (actionsInput !== undefined) {
      actionInputsByEntity[entityName] = actionsInput;
    }
  }

  return { entities, actionInputsByEntity };
}

function parseCollectionQueries(
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

function parseEntityActionsForEntities(
  entities: Record<string, EntitySchema>,
  actionInputsByEntity: Record<string, unknown>,
  queries: Record<string, CollectionQuerySchema>,
): Record<string, EntitySchema> {
  return Object.fromEntries(
    Object.entries(entities).map(([entityName, entity]) => {
      const actions = parseEntityActions(
        entityName,
        actionInputsByEntity[entityName],
        entity,
        queries,
      );

      return [entityName, actions ? { ...entity, actions } : entity];
    }),
  );
}

function parseItemViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
): Record<string, ItemViewSchema> {
  if (!isRecord(value)) {
    throw new Error("Schema itemViews must be an object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([itemViewName, itemView]) => {
      if (itemViewName.trim() === "") {
        throw new Error("Item view names must be non-empty.");
      }

      return [itemViewName, parseItemView(itemViewName, itemView, entities)];
    }),
  );
}

function parseItemView(
  itemViewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): ItemViewSchema {
  if (!isRecord(value)) {
    throw new Error(`Item view "${itemViewName}" must be an object.`);
  }

  assertExactKeys(`Item view "${itemViewName}"`, value, ["entity", "fields"]);

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Item view "${itemViewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Item view "${itemViewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseListViewFields(itemViewName, value.entity, value.fields, entity);
  assertViewHasFields(itemViewName, fields);

  return {
    entity: value.entity,
    fields,
  };
}

function parseViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
): Record<string, ViewSchema> {
  if (!isRecord(value)) {
    throw new Error("Schema views must be an object.");
  }

  const views = Object.fromEntries(
    Object.entries(value).map(([viewName, view]) => [
      viewName,
      parseView(viewName, view, entities, queries, itemViews),
    ]),
  );

  if (Object.keys(views).length === 0) {
    throw new Error("Schema must define at least one view.");
  }

  assertCollectionViews(views);

  return views;
}

function assertCollectionViews(views: Record<string, ViewSchema>) {
  const collectionEntries = Object.entries(views).filter(([, view]) => view.type === "collection");

  if (collectionEntries.length === 0) {
    throw new Error('Schema must define at least one "collection" view.');
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

      if (createView.entity !== view.entity) {
        throw new Error(
          `Collection view "${viewName}" create action view "${actionSlot.createView}" must use entity "${view.entity}".`,
        );
      }
    }
  }
}

function parseView(
  viewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
): ViewSchema {
  if (viewName.trim() === "") {
    throw new Error("View names must be non-empty.");
  }

  if (!isRecord(value)) {
    throw new Error(`View "${viewName}" must be an object.`);
  }

  if (value.type !== "collection" && value.type !== "create") {
    throw new Error(`View "${viewName}" type must be "collection" or "create".`);
  }

  if (value.type === "collection") {
    return parseCollectionView(viewName, value, entities, queries, itemViews);
  }

  assertExactKeys(`View "${viewName}"`, value, ["type", "entity", "fields"]);

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`View "${viewName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`View "${viewName}" references unknown entity "${value.entity}".`);
  }

  const fields = parseCreateViewFields(viewName, value.entity, value.fields, entity);
  assertViewHasFields(viewName, fields);
  assertCreateViewIncludesRequiredFields(viewName, fields, entity);

  return {
    type: "create",
    entity: value.entity,
    fields,
  };
}

function parseCollectionView(
  viewName: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
): CollectionViewSchema {
  assertExactKeys(
    `Collection view "${viewName}"`,
    value,
    ["type", "label", "entity", "queries", "defaultQuery", "result"],
    ["actions"],
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

  const querySlots = parseCollectionViewQuerySlots(viewName, value.entity, value.queries, queries);

  if (typeof value.defaultQuery !== "string" || value.defaultQuery.trim() === "") {
    throw new Error(`Collection view "${viewName}" defaultQuery must be a non-empty string.`);
  }

  if (!querySlots.some((slot) => slot.query === value.defaultQuery)) {
    throw new Error(
      `Collection view "${viewName}" defaultQuery must reference one of its query slots.`,
    );
  }

  const result = parseCollectionResult(viewName, value.entity, value.result, itemViews);
  const actions = parseCollectionActionSlots(viewName, value.entity, entity, value.actions);

  return {
    type: "collection",
    label: value.label,
    entity: value.entity,
    queries: querySlots,
    defaultQuery: value.defaultQuery,
    result,
    ...(actions ? { actions } : {}),
  };
}

function parseCollectionViewQuerySlots(
  viewName: string,
  entityName: string,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
): CollectionViewQuerySlotSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Collection view "${viewName}" queries must be a non-empty array.`);
  }

  return value.map((slot, index) =>
    parseCollectionViewQuerySlot(viewName, entityName, index, slot, queries),
  );
}

function parseCollectionViewQuerySlot(
  viewName: string,
  entityName: string,
  index: number,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
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

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const count =
    value.count === undefined ? undefined : parseCountDisplay(`${context} count`, value.count);

  return {
    query: value.query,
    ...(label === undefined ? {} : { label }),
    ...(count === undefined ? {} : { count }),
  };
}

function parseCollectionResult(
  viewName: string,
  entityName: string,
  value: unknown,
  itemViews: Record<string, ItemViewSchema>,
): CollectionResultSchema {
  if (!isRecord(value)) {
    throw new Error(`Collection view "${viewName}" result must be an object.`);
  }

  assertExactKeys(`Collection view "${viewName}" result`, value, ["type", "itemView"]);

  if (value.type !== "list") {
    throw new Error(`Collection view "${viewName}" result type must be "list".`);
  }

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

  return {
    type: "list",
    itemView: value.itemView,
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

function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
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

  const editor = parseViewFieldEditor(viewName, fieldName, value.editor, field);

  if (value.commit !== "immediate" && value.commit !== "field-commit") {
    throw new Error(
      `View field "${viewName}.${fieldName}" has unsupported commit policy "${String(
        value.commit,
      )}".`,
    );
  }

  if (field.type === "boolean" && value.commit !== "immediate") {
    throw new Error(
      `View field "${viewName}.${fieldName}" boolean fields must commit immediately.`,
    );
  }

  if ((field.type === "text" || field.type === "date") && value.commit !== "field-commit") {
    throw new Error(
      `View field "${viewName}.${fieldName}" ${field.type} fields must use field-commit.`,
    );
  }

  return {
    editor,
    commit: value.commit,
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

function parseViewFieldEditor(
  viewName: string,
  fieldName: string,
  value: unknown,
  field: FieldSchema,
): FieldEditor {
  if (value !== "text" && value !== "boolean" && value !== "date") {
    throw new Error(
      `View field "${viewName}.${fieldName}" has unsupported editor "${String(value)}".`,
    );
  }

  if (value !== field.type) {
    throw new Error(
      `View field "${viewName}.${fieldName}" editor must match field type "${field.type}".`,
    );
  }

  return value;
}

function assertViewHasFields(viewName: string, fields: Record<string, unknown>) {
  if (Object.keys(fields).length === 0) {
    throw new Error(`View "${viewName}" must define at least one field.`);
  }
}

function assertCreateViewIncludesRequiredFields(
  viewName: string,
  fields: Record<string, CreateViewFieldSchema>,
  entity: EntitySchema,
) {
  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (field.required && !(fieldName in fields) && !hasCreateDefault(field)) {
      throw new Error(`Create view "${viewName}" must include required field "${fieldName}".`);
    }
  }
}

function hasCreateDefault(field: FieldSchema) {
  return field.type === "boolean" && typeof field.default === "boolean";
}

function parseEntityBase(
  entityName: string,
  value: unknown,
): { entity: EntitySchema; actionsInput: unknown } {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" must be an object.`);
  }

  const label = value.label;
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error(`Entity "${entityName}" must have a label.`);
  }

  const fields = parseFields(entityName, value.fields);
  if (Object.keys(fields).length === 0) {
    throw new Error(`Entity "${entityName}" must define at least one field.`);
  }

  const mutations = parseEntityMutations(entityName, value.mutations);

  return {
    entity: { label, fields, mutations },
    actionsInput: value.actions,
  };
}

function parseEntityActions(
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): Record<string, EntityActionSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" actions must be an object.`);
  }

  const actions = Object.fromEntries(
    Object.entries(value).map(([actionName, action]) => {
      if (actionName.trim() === "") {
        throw new Error(`Entity "${entityName}" action names must be non-empty.`);
      }

      return [actionName, parseEntityAction(entityName, actionName, action, entity, queries)];
    }),
  );

  return Object.keys(actions).length > 0 ? actions : undefined;
}

function parseEntityAction(
  entityName: string,
  actionName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionSchema {
  if (!isRecord(value)) {
    throw new Error(`Entity action "${entityName}.${actionName}" must be an object.`);
  }

  const allowedKeys = new Set(["label", "kind", "target"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Entity action "${entityName}.${actionName}" has unsupported key "${key}".`);
    }
  }

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" label must be a non-empty string.`,
    );
  }

  if (value.kind !== "clear-completed") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" has unsupported kind "${String(value.kind)}".`,
    );
  }

  if (entity.fields.done?.type !== "boolean") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" kind "clear-completed" requires a boolean "done" field.`,
    );
  }

  const target = parseEntityActionTarget(entityName, actionName, value.target, queries);
  const targetQuery = queries[target.query];

  if (!targetQuery) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target references unknown query "${target.query}".`,
    );
  }

  if (!isClearCompletedTargetQuery(targetQuery.expression)) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" kind "clear-completed" target must be value.done eq true.`,
    );
  }

  return {
    label: value.label,
    kind: value.kind,
    target,
  };
}

function parseEntityActionTarget(
  entityName: string,
  actionName: string,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionTargetSchema {
  if (!isRecord(value)) {
    throw new Error(`Entity action "${entityName}.${actionName}" target must be an object.`);
  }

  assertExactKeys(`Entity action "${entityName}.${actionName}" target`, value, ["query"]);

  if (typeof value.query !== "string" || value.query.trim() === "") {
    throw new Error(`Entity action "${entityName}.${actionName}" target query must be a string.`);
  }

  const query = queries[value.query];
  if (!query) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target references unknown query "${value.query}".`,
    );
  }

  if (query.entity !== entityName) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target query "${value.query}" must use entity "${entityName}".`,
    );
  }

  return {
    query: value.query,
  };
}

function isClearCompletedTargetQuery(query: QueryExpression) {
  return (
    query.kind === "where" &&
    query.op === "eq" &&
    query.value === true &&
    fieldRefsEqual(query.ref, { kind: "value", name: "done" })
  );
}

function parseEntityMutations(entityName: string, value: unknown): EntityMutationPolicy {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" mutations must be an object.`);
  }

  const allowedKeys = new Set(["create", "patch", "delete"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Entity "${entityName}" mutations has unsupported key "${key}".`);
    }
  }

  for (const key of allowedKeys) {
    if (!(key in value)) {
      throw new Error(`Entity "${entityName}" mutations must include "${key}".`);
    }
  }

  return {
    create: parseGenericMutationPolicy(entityName, "create", value.create),
    patch: parseGenericMutationPolicy(entityName, "patch", value.patch),
    delete: parseDeleteMutationPolicy(entityName, value.delete),
  };
}

function parseGenericMutationPolicy(
  entityName: string,
  mutationName: "create" | "patch",
  value: unknown,
): GenericMutationPolicy {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" ${mutationName} mutation policy must be an object.`);
  }

  assertExactPolicyKeys(entityName, mutationName, value);

  if (typeof value.enabled !== "boolean") {
    throw new Error(`Entity "${entityName}" ${mutationName}.enabled must be a boolean.`);
  }

  return { enabled: value.enabled };
}

function parseDeleteMutationPolicy(entityName: string, value: unknown): DeleteMutationPolicy {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" delete mutation policy must be an object.`);
  }

  assertExactPolicyKeys(entityName, "delete", value);

  if (value.enabled !== false) {
    throw new Error(
      `Entity "${entityName}" delete.enabled must be false until delete mutations are implemented.`,
    );
  }

  return { enabled: false };
}

function assertExactPolicyKeys(
  entityName: string,
  mutationName: "create" | "patch" | "delete",
  value: Record<string, unknown>,
) {
  for (const key of Object.keys(value)) {
    if (key !== "enabled") {
      throw new Error(
        `Entity "${entityName}" ${mutationName} mutation policy has unsupported key "${key}".`,
      );
    }
  }

  if (!("enabled" in value)) {
    throw new Error(`Entity "${entityName}" ${mutationName} mutation policy must include enabled.`);
  }
}

function parseFields(entityName: string, value: unknown): Record<string, FieldSchema> {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" fields must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldName, field]) => [
      fieldName,
      parseField(entityName, fieldName, field),
    ]),
  );
}

function parseField(entityName: string, fieldName: string, value: unknown): FieldSchema {
  if (!isRecord(value)) {
    throw new Error(`Field "${entityName}.${fieldName}" must be an object.`);
  }

  if (typeof value.required !== "boolean") {
    throw new Error(`Field "${entityName}.${fieldName}" must declare whether it is required.`);
  }

  const label = parseFieldLabel(entityName, fieldName, value.label);

  if (value.type === "text") {
    const field: TextFieldSchema = {
      type: "text",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    return field;
  }

  if (value.type === "boolean") {
    if ("default" in value && typeof value.default !== "boolean") {
      throw new Error(`Field "${entityName}.${fieldName}" boolean default must be a boolean.`);
    }

    const field: BooleanFieldSchema = {
      type: "boolean",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if ("default" in value) {
      field.default = value.default as boolean;
    }

    return field;
  }

  if (value.type === "date") {
    const field: DateFieldSchema = {
      type: "date",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    return field;
  }

  throw new Error(
    `Field "${entityName}.${fieldName}" has unsupported type "${String(value.type)}".`,
  );
}

function parseFieldLabel(
  entityName: string,
  fieldName: string,
  value: unknown,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Field "${entityName}.${fieldName}" label must be a non-empty string.`);
  }

  return value;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: string[],
  optionalKeys: string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
