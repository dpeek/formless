import { findAddressableField, getEntityFieldCatalog } from "./fields.ts";
import {
  fieldHasCreateDefault,
  getFieldTypeBehavior,
  isFieldCommitPolicy,
  isFieldEditor,
} from "./field-types.ts";
import { collectQueryContextNames, parseQueryExpression, type QueryExpression } from "./query.ts";
import {
  assertExactKeys,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  AggregateSchema,
  CollectionActionSlotSchema,
  CollectionContextPresentation,
  CollectionContextSchema,
  CollectionNavigationSchema,
  CollectionQuerySchema,
  CollectionResultSchema,
  CollectionSummarySlotSchema,
  CollectionTableFooterSlotSchema,
  CollectionViewQuerySlotSchema,
  CollectionViewSchema,
  ComputedValueSchema,
  CountDisplaySchema,
  CreateDefaultValueSchema,
  CreateViewFieldSchema,
  CreateViewSchema,
  EntitySchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldSchema,
  ItemViewSchema,
  RelationshipSchema,
  ReadModelSchema,
  TableColumnAlign,
  TableColumnDisplay,
  TableColumnFormat,
  TableColumnSchema,
  TableColumnWidth,
  TableActionAvailabilitySchema,
  TableActionPresentation,
  TableActionSchema,
  TableActionVariant,
  ToManyRelationshipSchema,
  TableViewSchema,
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

export function parseTableViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  readModels?: ReadModelSchema,
): Record<string, TableViewSchema> {
  if (!isRecord(value)) {
    throw new Error("Schema tableViews must be an object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([tableViewName, tableView]) => {
      if (tableViewName.trim() === "") {
        throw new Error("Table view names must be non-empty.");
      }

      return [
        tableViewName,
        parseTableView(tableViewName, tableView, entities, itemViews, readModels),
      ];
    }),
  );
}

function parseTableView(
  tableViewName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  readModels?: ReadModelSchema,
): TableViewSchema {
  if (!isRecord(value)) {
    throw new Error(`Table view "${tableViewName}" must be an object.`);
  }

  assertExactKeys(`Table view "${tableViewName}"`, value, ["entity", "columns"], ["actions"]);

  const entityName = parseRequiredNonEmptyString(
    `Table view "${tableViewName}" entity`,
    value.entity,
  );
  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`Table view "${tableViewName}" references unknown entity "${entityName}".`);
  }

  const actions = parseOptionalTableActions(tableViewName, value.actions);
  const columns = parseTableColumns(
    tableViewName,
    entityName,
    value.columns,
    entity,
    itemViews,
    entities,
    readModels?.computedValues ?? {},
    actions,
  );

  return {
    entity: entityName,
    ...(actions === undefined ? {} : { actions }),
    columns,
  };
}

function parseOptionalTableActions(
  tableViewName: string,
  value: unknown,
): Record<string, TableActionSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Table view "${tableViewName}" actions must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([actionName, action]) => {
      if (actionName.trim() === "") {
        throw new Error(`Table view "${tableViewName}" action names must be non-empty.`);
      }

      return [actionName, parseTableAction(tableViewName, actionName, action)];
    }),
  );
}

function parseTableAction(
  tableViewName: string,
  actionName: string,
  value: unknown,
): TableActionSchema {
  const context = `Table view "${tableViewName}" action "${actionName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["label"], ["variant", "availability"]);

  const label = parseRequiredNonEmptyString(`${context} label`, value.label);
  const variant = parseOptionalTableActionVariant(`${context} variant`, value.variant);
  const availability = parseOptionalTableActionAvailability(
    `${context} availability`,
    value.availability,
  );

  return {
    label,
    ...(variant === undefined ? {} : { variant }),
    ...(availability === undefined ? {} : { availability }),
  };
}

function parseTableColumns(
  tableViewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
  entities: Record<string, EntitySchema>,
  computedValues: Record<string, ComputedValueSchema>,
  actions: Record<string, TableActionSchema> | undefined,
): TableColumnSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Table view "${tableViewName}" columns must be a non-empty array.`);
  }

  return value.map((column, index) =>
    parseTableColumn(
      tableViewName,
      entityName,
      index,
      column,
      entity,
      itemViews,
      entities,
      computedValues,
      actions,
    ),
  );
}

function parseTableColumn(
  tableViewName: string,
  entityName: string,
  index: number,
  value: unknown,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
  entities: Record<string, EntitySchema>,
  computedValues: Record<string, ComputedValueSchema>,
  actions: Record<string, TableActionSchema> | undefined,
): TableColumnSchema {
  const context = `Table view "${tableViewName}" column ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "referenceField") {
    return parseReferenceFieldTableColumn(context, value, entityName, entity, entities);
  }

  if (value.type === "computed") {
    return parseComputedTableColumn(context, value, entityName, computedValues);
  }

  if (value.type === "invokeAction") {
    return parseInvokeActionTableColumn(context, value, actions);
  }

  return parseFieldTableColumn(context, value, entityName, entity, itemViews);
}

function parseFieldTableColumn(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  itemViews: Record<string, ItemViewSchema>,
): TableColumnSchema {
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
      "valueUnit",
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
  const valueUnit = parseOptionalValueUnitEditor(
    `${context} valueUnit`,
    value.valueUnit,
    entityName,
    fieldName,
    field,
    entity,
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
    ...(valueUnit === undefined ? {} : { valueUnit }),
  };
}

function parseReferenceFieldTableColumn(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type", "referenceField", "field"],
    ["label", "editor", "commit", "align", "width", "display", "suffix", "format"],
  );

  const referenceFieldName = parseRequiredNonEmptyString(
    `${context} referenceField`,
    value.referenceField,
  );
  const sourceField = entity.fields[referenceFieldName];

  if (!sourceField) {
    throw new Error(
      `${context} references unknown referenceField "${entityName}.${referenceFieldName}".`,
    );
  }

  if (sourceField.type !== "reference") {
    throw new Error(
      `${context} referenceField "${entityName}.${referenceFieldName}" must be a reference field.`,
    );
  }

  const referencedEntity = entities[sourceField.to];
  if (!referencedEntity) {
    throw new Error(
      `${context} referenceField "${entityName}.${referenceFieldName}" targets unknown entity "${sourceField.to}".`,
    );
  }

  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const field = referencedEntity.fields[fieldName];

  if (!field) {
    throw new Error(`${context} references unknown field "${sourceField.to}.${fieldName}".`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const editor =
    value.editor === undefined
      ? undefined
      : parseFieldEditor(`${context} field "${sourceField.to}.${fieldName}"`, value.editor, field);
  const commit =
    value.commit === undefined
      ? undefined
      : parseFieldCommitPolicy(
          `${context} field "${sourceField.to}.${fieldName}"`,
          value.commit,
          field,
        );
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);
  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "referenceField",
    referenceField: referenceFieldName,
    field: fieldName,
    ...(label === undefined ? {} : { label }),
    ...(editor === undefined ? {} : { editor }),
    ...(commit === undefined ? {} : { commit }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
}

function parseComputedTableColumn(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  computedValues: Record<string, ComputedValueSchema>,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type", "computedValue"],
    ["label", "align", "width", "display", "suffix", "format"],
  );

  const computedValueName = parseRequiredNonEmptyString(
    `${context} computedValue`,
    value.computedValue,
  );
  const computedValue = computedValues[computedValueName];

  if (!computedValue) {
    throw new Error(`${context} references unknown computed value "${computedValueName}".`);
  }

  if (computedValue.entity !== entityName) {
    throw new Error(
      `${context} computed value "${computedValueName}" must use entity "${entityName}".`,
    );
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);

  if (display === "editor") {
    throw new Error(`${context} computed columns must be read-only or hidden.`);
  }

  const suffix = parseOptionalNonEmptyString(`${context} suffix`, value.suffix);
  const format = parseOptionalTableColumnFormat(`${context} format`, value.format);

  return {
    type: "computed",
    computedValue: computedValueName,
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(format === undefined ? {} : { format }),
  };
}

function parseInvokeActionTableColumn(
  context: string,
  value: Record<string, unknown>,
  actions: Record<string, TableActionSchema> | undefined,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type"],
    ["action", "actions", "label", "align", "width", "display", "presentation"],
  );

  const referencedActions = parseInvokeActionReferences(context, value.action, value.actions);

  for (const actionName of referencedActions) {
    if (!actions?.[actionName]) {
      throw new Error(`${context} references unknown table action "${actionName}".`);
    }
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);

  if (display === "editor") {
    throw new Error(`${context} invokeAction columns must be read-only or hidden.`);
  }

  const presentation = parseOptionalTableActionPresentation(
    `${context} presentation`,
    value.presentation,
  );

  if (presentation === "button" && referencedActions.length > 1) {
    throw new Error(`${context} button presentation requires exactly one action.`);
  }

  return {
    type: "invokeAction",
    ...(value.action === undefined
      ? { actions: referencedActions }
      : { action: referencedActions[0] }),
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseInvokeActionReferences(
  context: string,
  action: unknown,
  actions: unknown,
): string[] {
  if (action !== undefined && actions !== undefined) {
    throw new Error(`${context} must use either action or actions, not both.`);
  }

  if (action !== undefined) {
    return [parseRequiredNonEmptyString(`${context} action`, action)];
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error(`${context} must reference at least one table action.`);
  }

  const actionNames = actions.map((candidate, index) =>
    parseRequiredNonEmptyString(`${context} actions ${index}`, candidate),
  );
  const duplicate = actionNames.find(
    (candidate, index) => actionNames.indexOf(candidate) !== index,
  );

  if (duplicate) {
    throw new Error(`${context} references duplicate table action "${duplicate}".`);
  }

  return actionNames;
}

export function parseViews(
  value: unknown,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
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
      ),
    ]),
  );

  if (Object.keys(views).length === 0) {
    throw new Error("Schema must define at least one view.");
  }

  assertCollectionViews(views, entities, relationships, options.requirePrimaryCollection ?? true);

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
    return parseCollectionView(
      viewName,
      value,
      entities,
      queries,
      itemViews,
      tableViews,
      relationships,
      readModels,
    );
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
  relationships: Record<string, RelationshipSchema> | undefined,
  readModels?: ReadModelSchema,
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
    value.result,
    itemViews,
    tableViews,
    querySlots,
    readModels?.aggregates ?? {},
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
    ["presentation", "relationship", "createView", "itemView"],
  );

  const name = parseRequiredNonEmptyString(`${context} name`, value.name);
  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const labelField = parseRequiredNonEmptyString(`${context} labelField`, value.labelField);
  const presentation = parseCollectionContextPresentation(
    `${context} presentation`,
    value.presentation,
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
    ...(relationship === undefined ? {} : { relationship }),
    ...(createView === undefined ? {} : { createView }),
    ...(itemViewName === undefined ? {} : { itemView: itemViewName }),
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
  value: unknown,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  querySlots: CollectionViewQuerySlotSchema[],
  aggregates: Record<string, AggregateSchema>,
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
    assertExactKeys(
      `Collection view "${viewName}" result`,
      value,
      ["type", "tableView"],
      ["footer"],
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
      ...(footer === undefined ? {} : { footer }),
    };
  }

  throw new Error(`Collection view "${viewName}" result type must be "list" or "table".`);
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

function tableFooterColumnName(column: TableColumnSchema) {
  if (column.type === "field") {
    return column.field;
  }

  if (column.type === "computed") {
    return column.computedValue;
  }

  if (column.type === "invokeAction") {
    return undefined;
  }

  return `${column.referenceField}.${column.field}`;
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
  if (!isFieldEditor(value)) {
    throw new Error(`${context} has unsupported editor "${String(value)}".`);
  }

  if (!getFieldTypeBehavior(field).editors.includes(value)) {
    throw new Error(`${context} editor must match field type "${field.type}".`);
  }

  return value;
}

function parseFieldCommitPolicy(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldCommitPolicy {
  if (!isFieldCommitPolicy(value)) {
    throw new Error(`${context} has unsupported commit policy "${String(value)}".`);
  }

  const defaultCommit = getFieldTypeBehavior(field).defaultCommit;
  if (value !== defaultCommit) {
    const requirement =
      defaultCommit === "immediate" ? "must commit immediately" : "must use field-commit";
    throw new Error(`${context} ${field.type} fields ${requirement}.`);
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

function parseOptionalTableActionVariant(
  context: string,
  value: unknown,
): TableActionVariant | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "default" && value !== "destructive") {
    throw new Error(`${context} must be "default" or "destructive".`);
  }

  return value;
}

function parseOptionalTableActionPresentation(
  context: string,
  value: unknown,
): TableActionPresentation | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "button" && value !== "dropdown") {
    throw new Error(`${context} must be "button" or "dropdown".`);
  }

  return value;
}

function parseOptionalTableActionAvailability(
  context: string,
  value: unknown,
): TableActionAvailabilitySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["state"], ["reason"]);

  const state = parseTableActionAvailabilityState(`${context} state`, value.state);
  const reason = parseOptionalNonEmptyString(`${context} reason`, value.reason);

  return {
    state,
    ...(reason === undefined ? {} : { reason }),
  };
}

function parseTableActionAvailabilityState(
  context: string,
  value: unknown,
): TableActionAvailabilitySchema["state"] {
  if (value !== "visible" && value !== "hidden" && value !== "disabled") {
    throw new Error(`${context} must be "visible", "hidden", or "disabled".`);
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

function parseOptionalValueUnitEditor(
  context: string,
  value: unknown,
  entityName: string,
  valueFieldName: string,
  valueField: FieldSchema,
  entity: EntitySchema,
) {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["unitField"]);

  if (valueField.type !== "number") {
    throw new Error(`${context} requires a number field.`);
  }

  const unitFieldName = parseRequiredNonEmptyString(`${context} unitField`, value.unitField);

  if (unitFieldName === valueFieldName) {
    throw new Error(`${context} unitField must reference a different field.`);
  }

  const unitField = entity.fields[unitFieldName];

  if (!unitField) {
    throw new Error(`${context} references unknown unitField "${entityName}.${unitFieldName}".`);
  }

  if (unitField.type !== "enum") {
    throw new Error(`${context} unitField "${entityName}.${unitFieldName}" must be an enum field.`);
  }

  return { unitField: unitFieldName };
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
