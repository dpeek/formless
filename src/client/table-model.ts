import { getFieldTypeBehavior } from "@dpeek/formless-schema";
import type {
  AppSchema,
  CollectionTableFooterSlotSchema,
  EditRecordTableActionSchema,
  EditViewSchema,
  EntitySchema,
  FieldSchema,
  ItemViewSchema,
  TableViewSchema,
} from "@dpeek/formless-schema";
import type {
  EditRecordTableActionConfig,
  EditViewConfig,
  FieldTableColumnConfig,
  InvokeActionTableColumnConfig,
  OrderingHandleTableColumnConfig,
  RecordFieldConfig,
  TableActionConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
  TableOrderingConfig,
  ValueUnitFieldConfig,
} from "./views.ts";
import { selectAggregateSlot } from "./collection-shell-model.ts";
import { selectResultOrderingConfig, type ResultOrderingConfig } from "./result-ordering-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";
import { fieldLabel, humanizeFieldName } from "./view-labels.ts";

export type TableResultModel = {
  columns: TableColumnConfig[];
  ordering?: ResultOrderingConfig;
};

export function selectTableFooterSlots(
  schema: AppSchema,
  slots: CollectionTableFooterSlotSchema[],
  columns: TableColumnConfig[],
): TableFooterSlotConfig[] {
  return slots.map((slot) => {
    const column = columns.find((candidate) => tableFooterColumnName(candidate) === slot.column);

    if (!column) {
      throw new Error(`Missing table footer column "${slot.column}".`);
    }

    return {
      ...selectAggregateSlot(schema, slot),
      columnKey: column.key,
    };
  });
}

export function selectTableResultModel(
  schema: AppSchema,
  tableView: TableViewSchema,
  entity: EntitySchema,
  resultOrdering?: ResultOrderingConfig,
): TableResultModel {
  const ordering = resultOrdering ?? selectResultOrderingConfig(tableView.ordering, entity);
  const columns = selectTableColumns(schema, tableView, entity, ordering);

  return {
    columns,
    ...(ordering === undefined ? {} : { ordering }),
  };
}

function selectTableColumns(
  schema: AppSchema,
  view: TableViewSchema,
  entity: EntitySchema,
  ordering: TableOrderingConfig | undefined,
): TableColumnConfig[] {
  const columns: TableColumnConfig[] = view.columns.map((column): TableColumnConfig => {
    if (column.type === "computed") {
      const computedValue = schema.readModels?.computedValues?.[column.computedValue];

      if (!computedValue) {
        throw new Error(`Missing computed value "${column.computedValue}".`);
      }

      if (computedValue.entity !== view.entity) {
        throw new Error(
          `Computed value "${column.computedValue}" must use table entity "${view.entity}".`,
        );
      }

      return {
        type: "computed",
        key: `computed:${column.computedValue}`,
        computedValueName: column.computedValue,
        computedValue,
        label: column.label ?? humanizeFieldName(column.computedValue),
        ...(column.align === undefined ? {} : { align: column.align }),
        ...(column.width === undefined ? {} : { width: column.width }),
        display: column.display === "hidden" ? "hidden" : "readOnly",
        ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
        format: column.format ?? "plain",
      };
    }

    if (column.type === "referenceField") {
      const sourceReferenceField = entity.fields[column.referenceField] as FieldSchema;

      if (sourceReferenceField.type !== "reference") {
        throw new Error(`Missing reference field "${column.referenceField}".`);
      }

      const referencedEntity = schema.entities[sourceReferenceField.to] as EntitySchema;
      const field = referencedEntity.fields[column.field] as FieldSchema;

      return {
        type: "referenceField",
        key: `referenceField:${column.referenceField}.${column.field}`,
        sourceReferenceFieldName: column.referenceField,
        referencedEntityName: sourceReferenceField.to,
        referencedEntity,
        fieldName: column.field,
        field,
        editor: column.editor ?? getFieldTypeBehavior(field).defaultEditor,
        commit: column.commit ?? getFieldTypeBehavior(field).defaultCommit,
        label: column.label ?? fieldLabel(column.field, field),
        ...(column.align === undefined ? {} : { align: column.align }),
        ...(column.width === undefined ? {} : { width: column.width }),
        display: column.display ?? "editor",
        ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
        format: column.format ?? "plain",
        ...(column.presentation === undefined ? {} : { presentation: column.presentation }),
      };
    }

    if (column.type === "invokeAction") {
      const actions = selectTableActionConfigs(schema, view, invokeActionNames(column));
      const includeOrdering =
        column.includeOrdering === true && ordering?.presentations.includes("moveMenu") === true;
      const presentation =
        column.presentation ?? (actions.length === 1 && !includeOrdering ? "button" : "dropdown");
      const headerLabel =
        column.label ?? (includeOrdering ? "Actions" : defaultInvokeActionHeaderLabel(actions));

      return {
        type: "invokeAction",
        key: `invokeAction:${[...invokeActionNames(column), ...(includeOrdering ? ["ordering"] : [])].join(",")}`,
        label: column.label ?? "",
        headerLabel,
        actions,
        presentation,
        includeOrdering,
        ...(includeOrdering && ordering ? { ordering } : {}),
        ...(column.align === undefined ? { align: "end" as const } : { align: column.align }),
        ...(column.width === undefined ? { width: "xs" as const } : { width: column.width }),
        display:
          actions.length === 0 && !includeOrdering ? "hidden" : (column.display ?? "readOnly"),
        format: "plain",
      };
    }

    if (column.type === "orderingHandle") {
      return {
        type: "orderingHandle",
        key: "orderingHandle",
        label: column.label ?? "",
        headerLabel: column.label ?? "Reorder",
        ...(column.align === undefined ? { align: "center" as const } : { align: column.align }),
        ...(column.width === undefined ? { width: "xs" as const } : { width: column.width }),
        display: column.display ?? "readOnly",
        format: "plain",
      };
    }

    const field = entity.fields[column.field] as FieldSchema;
    const referenceItem = selectReferenceItem(schema, field, column.referenceItemView);
    const valueUnit = selectValueUnitField(entity, column.valueUnit?.unitField);

    return {
      type: "field",
      key: `field:${column.field}`,
      fieldName: column.field,
      field,
      editor: column.editor ?? getFieldTypeBehavior(field).defaultEditor,
      commit: column.commit ?? getFieldTypeBehavior(field).defaultCommit,
      label: column.label ?? fieldLabel(column.field, field),
      ...(column.align === undefined ? {} : { align: column.align }),
      ...(column.width === undefined ? {} : { width: column.width }),
      display: column.display ?? (ordering?.fieldName === column.field ? "hidden" : "editor"),
      ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
      format: column.format ?? "plain",
      ...(referenceItem === undefined ? {} : { referenceItem }),
      ...(valueUnit === undefined ? {} : { valueUnit }),
      ...(column.presentation === undefined ? {} : { presentation: column.presentation }),
    };
  });

  const columnsWithOrderingHandle =
    ordering?.presentations.includes("dragHandle") &&
    !view.columns.some((column) => column.type === "orderingHandle")
      ? [selectSyntheticOrderingHandleColumn(), ...columns]
      : columns;

  if (
    ordering?.presentations.includes("moveMenu") &&
    !view.columns.some((column) => column.type === "invokeAction" && column.includeOrdering)
  ) {
    return [...columnsWithOrderingHandle, selectSyntheticOrderingMenuColumn(ordering)];
  }

  return columnsWithOrderingHandle;
}

function tableFooterColumnName(column: TableColumnConfig) {
  if (column.type === "field") {
    return column.fieldName;
  }

  if (column.type === "computed") {
    return column.computedValueName;
  }

  if (column.type === "invokeAction" || column.type === "orderingHandle") {
    return "";
  }

  return `${column.sourceReferenceFieldName}.${column.fieldName}`;
}

function selectSyntheticOrderingMenuColumn(
  ordering: TableOrderingConfig,
): InvokeActionTableColumnConfig {
  return {
    type: "invokeAction",
    key: "invokeAction:ordering",
    label: "",
    headerLabel: "Actions",
    actions: [],
    presentation: "dropdown",
    includeOrdering: true,
    ordering,
    align: "end",
    width: "xs",
    display: "readOnly",
    format: "plain",
  };
}

function selectSyntheticOrderingHandleColumn(): OrderingHandleTableColumnConfig {
  return {
    type: "orderingHandle",
    key: "orderingHandle",
    label: "",
    headerLabel: "Reorder",
    align: "center",
    width: "xs",
    display: "readOnly",
    format: "plain",
  };
}

function selectTableActionConfigs(
  schema: AppSchema,
  tableView: TableViewSchema,
  actionNames: string[],
): TableActionConfig[] {
  const configs: TableActionConfig[] = [];

  for (const actionName of actionNames) {
    const action = tableView.actions?.[actionName];

    if (!action || action.availability?.state === "hidden") {
      continue;
    }

    const base = {
      actionName,
      label: action.label,
      variant: action.variant ?? "default",
      disabled: action.availability?.state === "disabled",
      ...(action.availability?.reason === undefined
        ? {}
        : { disabledReason: action.availability.reason }),
    };

    if (action.type !== "editRecord") {
      configs.push({ ...base, type: "static" });
      continue;
    }

    configs.push({
      ...base,
      type: "editRecord",
      target: selectEditRecordTarget(schema, tableView, action),
      editView: selectEditViewConfig(schema, action.editView),
    });
  }

  return configs;
}

function selectEditRecordTarget(
  schema: AppSchema,
  tableView: TableViewSchema,
  action: EditRecordTableActionSchema,
): EditRecordTableActionConfig["target"] {
  const tableEntity = schema.entities[tableView.entity];

  if (!tableEntity) {
    throw new Error(`Missing table entity "${tableView.entity}".`);
  }

  if (action.target.kind === "row") {
    return {
      kind: "row",
      entityName: tableView.entity,
      entity: tableEntity,
    };
  }

  const field = tableEntity.fields[action.target.field];

  if (field?.type !== "reference") {
    throw new Error(`Missing reference field "${tableView.entity}.${action.target.field}".`);
  }

  const referencedEntity = schema.entities[field.to];

  if (!referencedEntity) {
    throw new Error(`Missing referenced entity "${field.to}".`);
  }

  return {
    kind: "reference",
    fieldName: action.target.field,
    field,
    entityName: field.to,
    entity: referencedEntity,
  };
}

function selectEditViewConfig(schema: AppSchema, editViewName: string): EditViewConfig {
  const view = schema.views[editViewName];

  if (!view || view.type !== "edit") {
    throw new Error(`Missing edit view "${editViewName}".`);
  }

  const entity = schema.entities[view.entity];

  if (!entity) {
    throw new Error(`Missing edit view entity "${view.entity}".`);
  }
  const union = selectRecordUnionPresentation(schema, view, entity);

  return {
    viewName: editViewName,
    entityName: view.entity,
    entity,
    fields: selectEditFields(view, entity),
    ...(union === undefined ? {} : { union }),
  };
}

function selectEditFields(view: EditViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    commit: viewField.commit,
    ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
  }));
}

function selectRecordFields(view: ItemViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    commit: viewField.commit,
    ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
  }));
}

function invokeActionNames(
  column: Extract<TableViewSchema["columns"][number], { type: "invokeAction" }>,
): string[] {
  return column.action === undefined ? (column.actions ?? []) : [column.action];
}

function defaultInvokeActionHeaderLabel(actions: TableActionConfig[]) {
  if (actions.length === 1) {
    return actions[0]?.label ?? "Action";
  }

  return "Actions";
}

function selectValueUnitField(
  entity: EntitySchema,
  unitFieldName: string | undefined,
): ValueUnitFieldConfig | undefined {
  if (unitFieldName === undefined) {
    return undefined;
  }

  const unitField = entity.fields[unitFieldName];

  if (!unitField || unitField.type !== "enum") {
    return undefined;
  }

  return {
    unitFieldName,
    unitField,
  };
}

function selectReferenceItem(
  schema: AppSchema,
  field: FieldSchema,
  itemViewName: string | undefined,
): FieldTableColumnConfig["referenceItem"] | undefined {
  if (itemViewName === undefined || field.type !== "reference") {
    return undefined;
  }

  const entity = schema.entities[field.to];
  const itemView = schema.itemViews[itemViewName];

  if (!entity || !itemView) {
    return undefined;
  }
  const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);

  return {
    itemViewName,
    entityName: field.to,
    entity,
    recordFields: selectRecordFields(itemView, entity),
    ...(recordUnion === undefined ? {} : { recordUnion }),
  };
}
