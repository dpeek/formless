import {
  assertExactKeys,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { parseOptionalResultOrdering } from "./schema-ordering.ts";
import type {
  ComputedValueSchema,
  EntitySchema,
  FieldSchema,
  ItemViewSchema,
  ReadModelSchema,
  TableActionAvailabilitySchema,
  TableActionPresentation,
  TableActionSchema,
  TableActionVariant,
  TableColumnAlign,
  TableColumnDisplay,
  TableColumnFormat,
  TableColumnSchema,
  TableColumnWidth,
  TableEditRecordTargetSchema,
  TableOrderingSchema,
  TableViewSchema,
  ViewSchema,
} from "./types.ts";
import { parseFieldCommitPolicy, parseFieldEditor } from "./schema-view-field-parser.ts";
import { parseOptionalFieldPresentation } from "./schema-view-fields.ts";

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

  assertExactKeys(
    `Table view "${tableViewName}"`,
    value,
    ["entity", "columns"],
    ["actions", "ordering"],
  );

  const entityName = parseRequiredNonEmptyString(
    `Table view "${tableViewName}" entity`,
    value.entity,
  );
  const entity = entities[entityName];

  if (!entity) {
    throw new Error(`Table view "${tableViewName}" references unknown entity "${entityName}".`);
  }

  const actions = parseOptionalTableActions(tableViewName, value.actions, entityName, entity);
  const ordering = parseOptionalResultOrdering(
    `Table view "${tableViewName}" ordering`,
    value.ordering,
    entityName,
    entity,
  );
  const columns = parseTableColumns(
    tableViewName,
    entityName,
    value.columns,
    entity,
    itemViews,
    entities,
    readModels?.computedValues ?? {},
    actions,
    ordering,
  );

  return {
    entity: entityName,
    ...(actions === undefined ? {} : { actions }),
    ...(ordering === undefined ? {} : { ordering }),
    columns,
  };
}

function parseOptionalTableActions(
  tableViewName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
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

      return [actionName, parseTableAction(tableViewName, actionName, action, entityName, entity)];
    }),
  );
}

function parseTableAction(
  tableViewName: string,
  actionName: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): TableActionSchema {
  const context = `Table view "${tableViewName}" action "${actionName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === undefined) {
    assertExactKeys(context, value, ["label"], ["variant", "availability"]);
  } else if (value.type === "editRecord") {
    assertExactKeys(
      context,
      value,
      ["type", "label", "target", "editView"],
      ["variant", "availability"],
    );
  } else {
    throw new Error(`${context} type must be "editRecord".`);
  }

  const label = parseRequiredNonEmptyString(`${context} label`, value.label);
  const variant = parseOptionalTableActionVariant(`${context} variant`, value.variant);
  const availability = parseOptionalTableActionAvailability(
    `${context} availability`,
    value.availability,
  );

  if (value.type === "editRecord") {
    const target = parseTableEditRecordTarget(
      `${context} target`,
      value.target,
      entityName,
      entity,
    );
    const editView = parseRequiredNonEmptyString(`${context} editView`, value.editView);

    return {
      type: "editRecord",
      label,
      target,
      editView,
      ...(variant === undefined ? {} : { variant }),
      ...(availability === undefined ? {} : { availability }),
    };
  }

  return {
    label,
    ...(variant === undefined ? {} : { variant }),
    ...(availability === undefined ? {} : { availability }),
  };
}

function parseTableEditRecordTarget(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
): TableEditRecordTargetSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "row") {
    assertExactKeys(context, value, ["kind"]);

    return { kind: "row" };
  }

  if (value.kind === "reference") {
    assertExactKeys(context, value, ["kind", "field"]);

    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    const field = entity.fields[fieldName];

    if (!field) {
      throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
    }

    if (field.type !== "reference") {
      throw new Error(`${context} field "${entityName}.${fieldName}" must be a reference field.`);
    }

    return { kind: "reference", field: fieldName };
  }

  throw new Error(`${context} kind must be "row" or "reference".`);
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
  ordering: TableOrderingSchema | undefined,
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
      ordering,
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
  ordering: TableOrderingSchema | undefined,
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
    return parseInvokeActionTableColumn(context, value, actions, ordering);
  }

  if (value.type === "orderingHandle") {
    return parseOrderingHandleTableColumn(context, value, ordering);
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
      "presentation",
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
  const presentation = parseOptionalFieldPresentation(
    `${context} field "${fieldName}"`,
    value.presentation,
    field,
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
    ...(presentation === undefined ? {} : { presentation }),
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
    ["label", "editor", "commit", "align", "width", "display", "suffix", "format", "presentation"],
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
  const presentation = parseOptionalFieldPresentation(
    `${context} field "${sourceField.to}.${fieldName}"`,
    value.presentation,
    field,
  );

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
    ...(presentation === undefined ? {} : { presentation }),
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
  ordering: TableOrderingSchema | undefined,
): TableColumnSchema {
  assertExactKeys(
    context,
    value,
    ["type"],
    ["action", "actions", "includeOrdering", "label", "align", "width", "display", "presentation"],
  );

  const parsedIncludeOrdering = parseOptionalBoolean(
    `${context} includeOrdering`,
    value.includeOrdering,
  );
  const includeOrdering =
    parsedIncludeOrdering ??
    (value.action === undefined && value.actions === undefined && ordering !== undefined
      ? true
      : undefined);

  if (includeOrdering && !ordering) {
    throw new Error(`${context} includeOrdering requires table ordering.`);
  }

  const referencedActions = parseInvokeActionReferences(
    context,
    value.action,
    value.actions,
    includeOrdering,
  );

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

  if (presentation === "button" && includeOrdering) {
    throw new Error(`${context} button presentation cannot include ordering controls.`);
  }

  return {
    type: "invokeAction",
    ...(value.action === undefined
      ? { actions: referencedActions }
      : { action: referencedActions[0] }),
    ...(includeOrdering === undefined ? {} : { includeOrdering }),
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseOrderingHandleTableColumn(
  context: string,
  value: Record<string, unknown>,
  ordering: TableOrderingSchema | undefined,
): TableColumnSchema {
  assertExactKeys(context, value, ["type"], ["label", "align", "width", "display"]);

  if (!ordering) {
    throw new Error(`${context} orderingHandle requires table ordering.`);
  }

  if (!ordering.presentations?.includes("dragHandle")) {
    throw new Error(`${context} orderingHandle requires dragHandle ordering presentation.`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const align = parseOptionalTableColumnAlign(`${context} align`, value.align);
  const width = parseOptionalTableColumnWidth(`${context} width`, value.width);
  const display = parseOptionalTableColumnDisplay(`${context} display`, value.display);

  if (display === "editor") {
    throw new Error(`${context} orderingHandle columns must be read-only or hidden.`);
  }

  return {
    type: "orderingHandle",
    ...(label === undefined ? {} : { label }),
    ...(align === undefined ? {} : { align }),
    ...(width === undefined ? {} : { width }),
    ...(display === undefined ? {} : { display }),
  };
}

function parseInvokeActionReferences(
  context: string,
  action: unknown,
  actions: unknown,
  allowEmpty: boolean | undefined,
): string[] {
  if (action !== undefined && actions !== undefined) {
    throw new Error(`${context} must use either action or actions, not both.`);
  }

  if (action !== undefined) {
    return [parseRequiredNonEmptyString(`${context} action`, action)];
  }

  if ((actions === undefined || (Array.isArray(actions) && actions.length === 0)) && allowEmpty) {
    return [];
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

export function assertTableActionEditViews(
  views: Record<string, ViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  entities: Record<string, EntitySchema>,
) {
  for (const [tableViewName, tableView] of Object.entries(tableViews)) {
    const tableEntity = entities[tableView.entity];

    if (!tableEntity) {
      continue;
    }

    for (const [actionName, action] of Object.entries(tableView.actions ?? {})) {
      if (action.type !== "editRecord") {
        continue;
      }

      const context = `Table view "${tableViewName}" action "${actionName}"`;
      const editView = views[action.editView];

      if (!editView) {
        throw new Error(`${context} references unknown edit view "${action.editView}".`);
      }

      if (editView.type !== "edit") {
        throw new Error(`${context} must reference an edit view.`);
      }

      let targetEntityName = tableView.entity;
      if (action.target.kind === "reference") {
        const targetField = tableEntity.fields[action.target.field];

        if (targetField?.type !== "reference") {
          throw new Error(
            `${context} target field "${tableView.entity}.${action.target.field}" must be a reference field.`,
          );
        }

        targetEntityName = targetField.to;
      }

      if (editView.entity !== targetEntityName) {
        throw new Error(
          `${context} edit view "${action.editView}" must use entity "${targetEntityName}".`,
        );
      }
    }
  }
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

export function parseOptionalTableColumnFormat(
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

function parseOptionalBoolean(context: string, value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
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

export function tableFooterColumnName(column: TableColumnSchema) {
  if (column.type === "field") {
    return column.field;
  }

  if (column.type === "computed") {
    return column.computedValue;
  }

  if (column.type === "invokeAction" || column.type === "orderingHandle") {
    return undefined;
  }

  return `${column.referenceField}.${column.field}`;
}
