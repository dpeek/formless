import { fieldRefsEqual, findAddressableField, getEntityFieldCatalog } from "./fields.ts";
import { collectQueryContextNames, parseQueryExpression, type QueryExpression } from "./query.ts";

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

export type NumberFieldSchema = {
  type: "number";
  required: boolean;
  label?: string;
  default?: number;
  min?: number;
  max?: number;
  integer?: boolean;
};

export type EnumValueSchema = {
  label: string;
};

export type EnumFieldSchema = {
  type: "enum";
  required: boolean;
  label?: string;
  values: Record<string, EnumValueSchema>;
  default?: string;
};

export type ReferenceFieldSchema = {
  type: "reference";
  required: boolean;
  label?: string;
  to: string;
  displayField?: string;
};

export type FieldSchema =
  | TextFieldSchema
  | BooleanFieldSchema
  | DateFieldSchema
  | NumberFieldSchema
  | EnumFieldSchema
  | ReferenceFieldSchema;

export type FieldCommitPolicy = "immediate" | "field-commit";

export type FieldEditor = "text" | "boolean" | "date" | "number" | "enum" | "reference";

export type ViewFieldSchema = {
  editor: FieldEditor;
  commit: FieldCommitPolicy;
};

export type CreateViewFieldSchema = {
  editor: FieldEditor;
};

export type TableColumnAlign = "start" | "center" | "end";
export type TableColumnWidth = "xs" | "sm" | "md" | "lg";
export type TableColumnDisplay = "editor" | "readOnly" | "hidden";
export type TableColumnFormat = "plain" | "number" | "currency" | "percent";

export type TableColumnSchema = {
  type: "field";
  field: string;
  label?: string;
  editor?: FieldEditor;
  commit?: FieldCommitPolicy;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  suffix?: string;
  format?: TableColumnFormat;
  referenceItemView?: string;
};

export type TableViewSchema = {
  entity: string;
  columns: TableColumnSchema[];
};

export type CreateDefaultValueSchema = {
  kind: "context";
  name: string;
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

export type CollectionResultSchema =
  | {
      type: "list";
      itemView: string;
    }
  | {
      type: "table";
      tableView: string;
    };

export type CollectionNavigationSchema = {
  primary: boolean;
};

export type CollectionContextSchema = {
  name: string;
  entity: string;
  query: string;
  labelField: string;
  createView?: string;
  itemView?: string;
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
  navigation?: CollectionNavigationSchema;
  context?: CollectionContextSchema;
  queries: CollectionViewQuerySlotSchema[];
  defaultQuery: string;
  result: CollectionResultSchema;
  actions?: CollectionActionSlotSchema[];
};

export type CreateViewSchema = {
  type: "create";
  entity: string;
  fields: Record<string, CreateViewFieldSchema>;
  defaults?: Record<string, CreateDefaultValueSchema>;
};

export type ViewSchema = CollectionViewSchema | CreateViewSchema;

export type AfterCreateHookSchema = {
  entity: string;
  action: string;
};

export type GenericMutationPolicy = {
  enabled: boolean;
};

export type CreateMutationPolicy = GenericMutationPolicy & {
  afterCreate?: AfterCreateHookSchema[];
};

export type DeleteMutationPolicy = {
  enabled: false;
};

export type EntityMutationPolicy = {
  create: CreateMutationPolicy;
  patch: GenericMutationPolicy;
  delete: DeleteMutationPolicy;
};

export type EntityActionTargetSchema = {
  query: string;
};

export type EntityActionJoinSourceSchema = {
  field: string;
  query: string;
};

export type EntityActionJoinSchema = {
  left: EntityActionJoinSourceSchema;
  right: EntityActionJoinSourceSchema;
};

export type ClearCompletedEntityActionSchema = {
  label: string;
  kind: "clear-completed";
  target: EntityActionTargetSchema;
};

export type CreateMissingJoinRecordsEntityActionSchema = {
  label: string;
  kind: "create-missing-join-records";
  join: EntityActionJoinSchema;
};

export type EntityActionSchema =
  | ClearCompletedEntityActionSchema
  | CreateMissingJoinRecordsEntityActionSchema;

export type UniqueConstraintSchema = {
  kind: "unique";
  fields: string[];
};

export type EntityConstraintSchema = UniqueConstraintSchema;

export type EntitySchema = {
  label: string;
  fields: Record<string, FieldSchema>;
  mutations: EntityMutationPolicy;
  constraints?: Record<string, EntityConstraintSchema>;
  actions?: Record<string, EntityActionSchema>;
};

export type AppSchema = {
  version: number;
  entities: Record<string, EntitySchema>;
  queries: Record<string, CollectionQuerySchema>;
  itemViews: Record<string, ItemViewSchema>;
  tableViews: Record<string, TableViewSchema>;
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

  validateReferenceFields(entities);

  return { entities, actionInputsByEntity };
}

function validateReferenceFields(entities: Record<string, EntitySchema>) {
  for (const [entityName, entity] of Object.entries(entities)) {
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (field.type !== "reference") {
        continue;
      }

      const targetEntity = entities[field.to];
      if (!targetEntity) {
        throw new Error(
          `Field "${entityName}.${fieldName}" references unknown entity "${field.to}".`,
        );
      }

      if (field.displayField === undefined) {
        continue;
      }

      const displayField = targetEntity.fields[field.displayField];
      if (!displayField) {
        throw new Error(
          `Field "${entityName}.${fieldName}" displayField references unknown field "${field.to}.${field.displayField}".`,
        );
      }

      if (displayField.type !== "text") {
        throw new Error(
          `Field "${entityName}.${fieldName}" displayField must reference a text field.`,
        );
      }
    }
  }
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
  const parsedEntities = Object.fromEntries(
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

  validateCreateAfterCreateHooks(parsedEntities);

  return parsedEntities;
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

function parseTableViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
): Record<string, TableViewSchema> {
  if (!isRecord(value)) {
    throw new Error("Schema tableViews must be an object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([tableViewName, tableView]) => {
      if (tableViewName.trim() === "") {
        throw new Error("Table view names must be non-empty.");
      }

      return [tableViewName, parseTableView(tableViewName, tableView, entities, itemViews)];
    }),
  );
}

function parseTableView(
  tableViewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
): TableViewSchema {
  if (!isRecord(value)) {
    throw new Error(`Table view "${tableViewName}" must be an object.`);
  }

  assertExactKeys(`Table view "${tableViewName}"`, value, ["entity", "columns"]);

  const entityName = parseRequiredNonEmptyString(
    `Table view "${tableViewName}" entity`,
    value.entity,
  );
  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`Table view "${tableViewName}" references unknown entity "${entityName}".`);
  }

  const columns = parseTableColumns(tableViewName, entityName, value.columns, entity, itemViews);

  return {
    entity: entityName,
    columns,
  };
}

function parseTableColumns(
  tableViewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
): TableColumnSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Table view "${tableViewName}" columns must be a non-empty array.`);
  }

  return value.map((column, index) =>
    parseTableColumn(tableViewName, entityName, index, column, entity, itemViews),
  );
}

function parseTableColumn(
  tableViewName: string,
  entityName: string,
  index: number,
  value: unknown,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
): TableColumnSchema {
  const context = `Table view "${tableViewName}" column ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["type", "field"],
    [
      "label",
      "editor",
      "commit",
      "align",
      "width",
      "display",
      "suffix",
      "format",
      "referenceItemView",
    ],
  );

  if (value.type !== "field") {
    throw new Error(`${context} type must be "field".`);
  }

  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const field = entity.fields[fieldName];

  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const editor =
    value.editor === undefined
      ? undefined
      : parseFieldEditor(`${context} field "${fieldName}"`, value.editor, field);
  const commit =
    value.commit === undefined
      ? undefined
      : parseFieldCommitPolicy(`${context} field "${fieldName}"`, value.commit, field);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);
  const referenceItemView = parseOptionalReferenceItemView(
    `${context} referenceItemView`,
    value.referenceItemView,
    field,
    itemViews,
  );

  return {
    type: "field",
    field: fieldName,
    ...(label === undefined ? {} : { label }),
    ...(editor === undefined ? {} : { editor }),
    ...(commit === undefined ? {} : { commit }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
    ...(referenceItemView === undefined ? {} : { referenceItemView }),
  };
}

function parseViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
): Record<string, ViewSchema> {
  if (!isRecord(value)) {
    throw new Error("Schema views must be an object.");
  }

  const views = Object.fromEntries(
    Object.entries(value).map(([viewName, view]) => [
      viewName,
      parseView(viewName, view, entities, queries, itemViews, tableViews),
    ]),
  );

  if (Object.keys(views).length === 0) {
    throw new Error("Schema must define at least one view.");
  }

  assertCollectionViews(views, entities);

  return views;
}

function assertCollectionViews(
  views: Record<string, ViewSchema>,
  entities: Record<string, EntitySchema>,
) {
  const collectionEntries = Object.entries(views).filter(
    (entry): entry is [string, CollectionViewSchema] => entry[1].type === "collection",
  );

  if (collectionEntries.length === 0) {
    throw new Error('Schema must define at least one "collection" view.');
  }

  if (!collectionEntries.some(([, view]) => view.navigation?.primary ?? true)) {
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

      if (createView.entity !== view.entity) {
        throw new Error(
          `Collection view "${viewName}" create action view "${actionSlot.createView}" must use entity "${view.entity}".`,
        );
      }

      validateCreateActionContextDefaults(
        viewName,
        actionSlot.createView,
        createView,
        entities,
        view.context,
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
    return parseCollectionView(viewName, value, entities, queries, itemViews, tableViews);
  }

  assertExactKeys(`View "${viewName}"`, value, ["type", "entity", "fields"], ["defaults"]);

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

  return {
    type: "create",
    entity: value.entity,
    fields,
    ...(defaults === undefined ? {} : { defaults }),
  };
}

function parseCollectionView(
  viewName: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
): CollectionViewSchema {
  assertExactKeys(
    `Collection view "${viewName}"`,
    value,
    ["type", "label", "entity", "queries", "defaultQuery", "result"],
    ["navigation", "context", "actions"],
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
  const context = parseCollectionContext(viewName, value.context, entities, queries, itemViews);
  const querySlots = parseCollectionViewQuerySlots(
    viewName,
    value.entity,
    entity,
    value.queries,
    queries,
    context,
  );

  if (typeof value.defaultQuery !== "string" || value.defaultQuery.trim() === "") {
    throw new Error(`Collection view "${viewName}" defaultQuery must be a non-empty string.`);
  }

  if (!querySlots.some((slot) => slot.query === value.defaultQuery)) {
    throw new Error(
      `Collection view "${viewName}" defaultQuery must reference one of its query slots.`,
    );
  }

  const result = parseCollectionResult(viewName, value.entity, value.result, itemViews, tableViews);
  const actions = parseCollectionActionSlots(viewName, value.entity, entity, value.actions);

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
): CollectionViewQuerySlotSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Collection view "${viewName}" queries must be a non-empty array.`);
  }

  return value.map((slot, index) =>
    parseCollectionViewQuerySlot(viewName, entityName, entity, index, slot, queries, context),
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
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
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
    ["createView", "itemView"],
  );

  const name = parseRequiredNonEmptyString(`${context} name`, value.name);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const labelField = parseRequiredNonEmptyString(`${context} labelField`, value.labelField);
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
    ...(createView === undefined ? {} : { createView }),
    ...(itemViewName === undefined ? {} : { itemView: itemViewName }),
  };
}

function validateCollectionQueryContextRequirements(
  context: string,
  queryName: string,
  query: QueryExpression,
  entity: EntitySchema,
  collectionContext: CollectionContextSchema | undefined,
) {
  const requiredContextNames = collectQueryContextNames(query);

  if (requiredContextNames.length === 0) {
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
}

function validateContextPredicateTargets(
  context: string,
  query: QueryExpression,
  entity: EntitySchema,
  collectionContext: CollectionContextSchema,
) {
  if (query.kind === "and") {
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

function parseCollectionResult(
  viewName: string,
  entityName: string,
  value: unknown,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
): CollectionResultSchema {
  if (!isRecord(value)) {
    throw new Error(`Collection view "${viewName}" result must be an object.`);
  }

  if (value.type === "list") {
    assertExactKeys(`Collection view "${viewName}" result`, value, ["type", "itemView"]);

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

  if (value.type === "table") {
    assertExactKeys(`Collection view "${viewName}" result`, value, ["type", "tableView"]);

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

    return {
      type: "table",
      tableView: value.tableView,
    };
  }

  throw new Error(`Collection view "${viewName}" result type must be "list" or "table".`);
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

  return parseRequiredNonEmptyString(context, value);
}

function parseRequiredNonEmptyString(context: string, value: unknown): string {
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

function parseFieldEditor(context: string, value: unknown, field: FieldSchema): FieldEditor {
  if (
    value !== "text" &&
    value !== "boolean" &&
    value !== "date" &&
    value !== "number" &&
    value !== "enum" &&
    value !== "reference"
  ) {
    throw new Error(`${context} has unsupported editor "${String(value)}".`);
  }

  if (value !== field.type) {
    throw new Error(`${context} editor must match field type "${field.type}".`);
  }

  return value;
}

function parseFieldCommitPolicy(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldCommitPolicy {
  if (value !== "immediate" && value !== "field-commit") {
    throw new Error(`${context} has unsupported commit policy "${String(value)}".`);
  }

  if (field.type === "boolean" && value !== "immediate") {
    throw new Error(`${context} boolean fields must commit immediately.`);
  }

  if (field.type === "enum" && value !== "immediate") {
    throw new Error(`${context} enum fields must commit immediately.`);
  }

  if (field.type === "reference" && value !== "immediate") {
    throw new Error(`${context} reference fields must commit immediately.`);
  }

  if (
    (field.type === "text" || field.type === "date" || field.type === "number") &&
    value !== "field-commit"
  ) {
    throw new Error(`${context} ${field.type} fields must use field-commit.`);
  }

  return value;
}

function parseOptionalTableColumnAlign(
  context: string,
  value: unknown,
): TableColumnAlign | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "start" && value !== "center" && value !== "end") {
    throw new Error(`${context} must be "start", "center", or "end".`);
  }

  return value;
}

function parseOptionalTableColumnWidth(
  context: string,
  value: unknown,
): TableColumnWidth | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "xs" && value !== "sm" && value !== "md" && value !== "lg") {
    throw new Error(`${context} must be "xs", "sm", "md", or "lg".`);
  }

  return value;
}

function parseOptionalTableColumnDisplay(
  context: string,
  value: unknown,
): TableColumnDisplay | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "editor" && value !== "readOnly" && value !== "hidden") {
    throw new Error(`${context} must be "editor", "readOnly", or "hidden".`);
  }

  return value;
}

function parseOptionalTableColumnFormat(
  context: string,
  value: unknown,
): TableColumnFormat | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "plain" && value !== "number" && value !== "currency" && value !== "percent") {
    throw new Error(`${context} must be "plain", "number", "currency", or "percent".`);
  }

  return value;
}

function parseOptionalReferenceItemView(
  context: string,
  value: unknown,
  field: FieldSchema,
  itemViews: Record<string, ItemViewSchema>,
): string | undefined {
  const itemViewName = parseOptionalNonEmptyString(context, value);

  if (itemViewName === undefined) {
    return undefined;
  }

  if (field.type !== "reference") {
    throw new Error(`${context} requires a reference field.`);
  }

  const itemView = itemViews[itemViewName];
  if (!itemView) {
    throw new Error(`${context} references unknown item view "${itemViewName}".`);
  }

  if (itemView.entity !== field.to) {
    throw new Error(`${context} "${itemViewName}" must use entity "${field.to}".`);
  }

  return itemViewName;
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
      !hasCreateDefault(field)
    ) {
      throw new Error(`Create view "${viewName}" must include required field "${fieldName}".`);
    }
  }
}

function hasCreateDefault(field: FieldSchema) {
  return (
    (field.type === "boolean" && typeof field.default === "boolean") ||
    (field.type === "number" && typeof field.default === "number") ||
    (field.type === "enum" && typeof field.default === "string")
  );
}

function parseEntityBase(
  entityName: string,
  value: unknown,
): { entity: EntitySchema; actionsInput: unknown } {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" must be an object.`);
  }

  assertSupportedKeys(`Entity "${entityName}"`, value, [
    "label",
    "fields",
    "mutations",
    "constraints",
    "actions",
  ]);

  const label = value.label;
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error(`Entity "${entityName}" must have a label.`);
  }

  const fields = parseFields(entityName, value.fields);
  if (Object.keys(fields).length === 0) {
    throw new Error(`Entity "${entityName}" must define at least one field.`);
  }

  const mutations = parseEntityMutations(entityName, value.mutations);
  const constraints = parseEntityConstraints(entityName, value.constraints, fields);

  return {
    entity: {
      label,
      fields,
      mutations,
      ...(constraints === undefined ? {} : { constraints }),
    },
    actionsInput: value.actions,
  };
}

function parseEntityConstraints(
  entityName: string,
  value: unknown,
  fields: Record<string, FieldSchema>,
): Record<string, EntityConstraintSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" constraints must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`Entity "${entityName}" constraints must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([constraintName, constraint]) => {
      if (constraintName.trim() === "") {
        throw new Error(`Entity "${entityName}" constraint names must be non-empty.`);
      }

      return [
        constraintName,
        parseEntityConstraint(entityName, constraintName, constraint, fields),
      ];
    }),
  );
}

function parseEntityConstraint(
  entityName: string,
  constraintName: string,
  value: unknown,
  fields: Record<string, FieldSchema>,
): EntityConstraintSchema {
  const context = `Entity "${entityName}" constraint "${constraintName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "unique") {
    assertExactKeys(context, value, ["kind", "fields"]);

    return {
      kind: "unique",
      fields: parseUniqueConstraintFields(context, value.fields, fields),
    };
  }

  throw new Error(`${context} has unsupported kind "${String(value.kind)}".`);
}

function parseUniqueConstraintFields(
  context: string,
  value: unknown,
  fields: Record<string, FieldSchema>,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} fields must be a non-empty array.`);
  }

  const names = value.map((fieldName) => {
    if (typeof fieldName !== "string" || fieldName.trim() === "") {
      throw new Error(`${context} fields must contain non-empty field names.`);
    }

    if (!fields[fieldName]) {
      throw new Error(`${context} references unknown field "${fieldName}".`);
    }

    return fieldName;
  });

  if (new Set(names).size !== names.length) {
    throw new Error(`${context} fields must be unique.`);
  }

  return names;
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

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" label must be a non-empty string.`,
    );
  }

  if (value.kind === "clear-completed") {
    return parseClearCompletedEntityAction(entityName, actionName, value, entity, queries);
  }

  if (value.kind === "create-missing-join-records") {
    return parseCreateMissingJoinRecordsEntityAction(
      entityName,
      actionName,
      value,
      entity,
      queries,
    );
  }

  throw new Error(
    `Entity action "${entityName}.${actionName}" has unsupported kind "${String(value.kind)}".`,
  );
}

function parseClearCompletedEntityAction(
  entityName: string,
  actionName: string,
  value: Record<string, unknown>,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): ClearCompletedEntityActionSchema {
  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind"],
    ["target"],
  );

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
    label: value.label as string,
    kind: "clear-completed",
    target,
  };
}

function parseCreateMissingJoinRecordsEntityAction(
  entityName: string,
  actionName: string,
  value: Record<string, unknown>,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): CreateMissingJoinRecordsEntityActionSchema {
  assertExactKeys(`Entity action "${entityName}.${actionName}"`, value, ["label", "kind", "join"]);

  const join = parseEntityActionJoin(entityName, actionName, value.join, entity, queries);
  validateCreateMissingJoinRecordDefaults(entityName, actionName, entity, join);

  return {
    label: value.label as string,
    kind: "create-missing-join-records",
    join,
  };
}

function parseEntityActionJoin(
  entityName: string,
  actionName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionJoinSchema {
  const context = `Entity action "${entityName}.${actionName}" join`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["left", "right"]);

  const left = parseEntityActionJoinSource(
    entityName,
    actionName,
    "left",
    value.left,
    entity,
    queries,
  );
  const right = parseEntityActionJoinSource(
    entityName,
    actionName,
    "right",
    value.right,
    entity,
    queries,
  );

  if (left.field === right.field) {
    throw new Error(`${context} fields must be different.`);
  }

  return { left, right };
}

function parseEntityActionJoinSource(
  entityName: string,
  actionName: string,
  side: "left" | "right",
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionJoinSourceSchema {
  const context = `Entity action "${entityName}.${actionName}" join ${side}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["field", "query"]);

  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const field = entity.fields[fieldName];

  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  if (field.type !== "reference") {
    throw new Error(`${context} field "${fieldName}" must be a reference field.`);
  }

  const query = queries[queryName];
  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  if (query.entity !== field.to) {
    throw new Error(`${context} query "${queryName}" must use entity "${field.to}".`);
  }

  if (collectQueryContextNames(query.expression).length > 0) {
    throw new Error(`${context} query "${queryName}" must not require context.`);
  }

  return {
    field: fieldName,
    query: queryName,
  };
}

function validateCreateMissingJoinRecordDefaults(
  entityName: string,
  actionName: string,
  entity: EntitySchema,
  join: EntityActionJoinSchema,
) {
  const joinFields = new Set([join.left.field, join.right.field]);

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (joinFields.has(fieldName) || !field.required || fieldHasCreateDefault(field)) {
      continue;
    }

    throw new Error(
      `Entity action "${entityName}.${actionName}" kind "create-missing-join-records" requires field "${fieldName}" to have a default.`,
    );
  }
}

function fieldHasCreateDefault(field: FieldSchema) {
  return (
    (field.type === "boolean" && field.default !== undefined) ||
    (field.type === "enum" && field.default !== undefined) ||
    (field.type === "number" && field.default !== undefined)
  );
}

function validateCreateAfterCreateHooks(entities: Record<string, EntitySchema>) {
  for (const [entityName, entity] of Object.entries(entities)) {
    for (const [index, hook] of (entity.mutations.create.afterCreate ?? []).entries()) {
      const context = `Entity "${entityName}" create.afterCreate hook ${index}`;
      const targetEntity = entities[hook.entity];

      if (!targetEntity) {
        throw new Error(`${context} references unknown entity "${hook.entity}".`);
      }

      const action = targetEntity.actions?.[hook.action];

      if (!action) {
        throw new Error(
          `${context} references unknown action "${hook.action}" for entity "${hook.entity}".`,
        );
      }

      if (action.kind !== "create-missing-join-records") {
        throw new Error(`${context} action must create missing join records.`);
      }
    }
  }
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

  if (collectQueryContextNames(query.expression).length > 0) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target query "${value.query}" must not require context.`,
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
    create: parseCreateMutationPolicy(entityName, value.create),
    patch: parseGenericMutationPolicy(entityName, "patch", value.patch),
    delete: parseDeleteMutationPolicy(entityName, value.delete),
  };
}

function parseCreateMutationPolicy(entityName: string, value: unknown): CreateMutationPolicy {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" create mutation policy must be an object.`);
  }

  assertExactPolicyKeys(entityName, "create", value);

  if (typeof value.enabled !== "boolean") {
    throw new Error(`Entity "${entityName}" create.enabled must be a boolean.`);
  }

  const afterCreate = parseAfterCreateHooks(entityName, value.afterCreate);

  return {
    enabled: value.enabled,
    ...(afterCreate === undefined ? {} : { afterCreate }),
  };
}

function parseAfterCreateHooks(
  entityName: string,
  value: unknown,
): AfterCreateHookSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Entity "${entityName}" create.afterCreate must be a non-empty array.`);
  }

  return value.map((hook, index) => parseAfterCreateHook(entityName, index, hook));
}

function parseAfterCreateHook(
  entityName: string,
  index: number,
  value: unknown,
): AfterCreateHookSchema {
  const context = `Entity "${entityName}" create.afterCreate hook ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["entity", "action"]);

  return {
    entity: parseRequiredNonEmptyString(`${context} entity`, value.entity),
    action: parseRequiredNonEmptyString(`${context} action`, value.action),
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
  const optionalKeys = mutationName === "create" ? new Set(["afterCreate"]) : new Set<string>();

  for (const key of Object.keys(value)) {
    if (key !== "enabled" && !optionalKeys.has(key)) {
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

  if (value.type === "number") {
    assertExactKeys(
      `Field "${entityName}.${fieldName}"`,
      value,
      ["type", "required"],
      ["label", "default", "min", "max", "integer"],
    );

    const field: NumberFieldSchema = {
      type: "number",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if ("min" in value) {
      if (!isFiniteNumber(value.min)) {
        throw new Error(`Field "${entityName}.${fieldName}" number min must be finite.`);
      }

      field.min = value.min;
    }

    if ("max" in value) {
      if (!isFiniteNumber(value.max)) {
        throw new Error(`Field "${entityName}.${fieldName}" number max must be finite.`);
      }

      field.max = value.max;
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      throw new Error(
        `Field "${entityName}.${fieldName}" number min must be less than or equal to max.`,
      );
    }

    if ("integer" in value) {
      if (typeof value.integer !== "boolean") {
        throw new Error(`Field "${entityName}.${fieldName}" number integer must be a boolean.`);
      }

      field.integer = value.integer;
    }

    if ("default" in value) {
      if (!isFiniteNumber(value.default)) {
        throw new Error(`Field "${entityName}.${fieldName}" number default must be finite.`);
      }

      assertNumberFieldValue(entityName, fieldName, value.default, field, "default");
      field.default = value.default;
    }

    return field;
  }

  if (value.type === "enum") {
    assertExactKeys(
      `Field "${entityName}.${fieldName}"`,
      value,
      ["type", "required", "values"],
      ["label", "default"],
    );

    const values = parseEnumValues(entityName, fieldName, value.values);
    const field: EnumFieldSchema = {
      type: "enum",
      required: value.required,
      values,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if ("default" in value) {
      if (typeof value.default !== "string" || !Object.hasOwn(values, value.default)) {
        throw new Error(
          `Field "${entityName}.${fieldName}" enum default must match one of its values.`,
        );
      }

      field.default = value.default;
    }

    return field;
  }

  if (value.type === "reference") {
    assertExactKeys(
      `Field "${entityName}.${fieldName}"`,
      value,
      ["type", "required", "to"],
      ["label", "displayField"],
    );

    if (typeof value.to !== "string" || value.to.trim() === "") {
      throw new Error(
        `Field "${entityName}.${fieldName}" reference target must be a non-empty entity name.`,
      );
    }

    const displayField = parseOptionalNonEmptyString(
      `Field "${entityName}.${fieldName}" displayField`,
      value.displayField,
    );
    const field: ReferenceFieldSchema = {
      type: "reference",
      required: value.required,
      to: value.to,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if (displayField !== undefined) {
      field.displayField = displayField;
    }

    return field;
  }

  throw new Error(
    `Field "${entityName}.${fieldName}" has unsupported type "${String(value.type)}".`,
  );
}

function assertNumberFieldValue(
  entityName: string,
  fieldName: string,
  value: number,
  field: NumberFieldSchema,
  valueLabel: string,
) {
  if (field.min !== undefined && value < field.min) {
    throw new Error(`Field "${entityName}.${fieldName}" number ${valueLabel} must be >= min.`);
  }

  if (field.max !== undefined && value > field.max) {
    throw new Error(`Field "${entityName}.${fieldName}" number ${valueLabel} must be <= max.`);
  }

  if (field.integer && !Number.isInteger(value)) {
    throw new Error(`Field "${entityName}.${fieldName}" number ${valueLabel} must be an integer.`);
  }
}

function parseEnumValues(
  entityName: string,
  fieldName: string,
  value: unknown,
): Record<string, EnumValueSchema> {
  if (!isRecord(value)) {
    throw new Error(`Field "${entityName}.${fieldName}" enum values must be an object.`);
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    throw new Error(`Field "${entityName}.${fieldName}" enum values must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([enumValue, enumValueSchema]) => {
      if (enumValue.trim() === "") {
        throw new Error(
          `Field "${entityName}.${fieldName}" enum value keys must be non-empty strings.`,
        );
      }

      return [enumValue, parseEnumValue(entityName, fieldName, enumValue, enumValueSchema)];
    }),
  );
}

function parseEnumValue(
  entityName: string,
  fieldName: string,
  enumValue: string,
  value: unknown,
): EnumValueSchema {
  if (!isRecord(value)) {
    throw new Error(
      `Field "${entityName}.${fieldName}" enum value "${enumValue}" must be an object.`,
    );
  }

  assertExactKeys(`Field "${entityName}.${fieldName}" enum value "${enumValue}"`, value, ["label"]);

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(
      `Field "${entityName}.${fieldName}" enum value "${enumValue}" label must be a non-empty string.`,
    );
  }

  return { label: value.label };
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

function assertSupportedKeys(context: string, value: Record<string, unknown>, keys: string[]) {
  const allowedKeys = new Set(keys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
