import type {
  AppSchema,
  CollectionNavigationSchema,
  CollectionViewSchema,
  CountDisplaySchema,
  CreateDefaultValueSchema,
  CreateViewSchema,
  EntityActionSchema,
  EntitySchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldSchema,
  ItemViewSchema,
  TableColumnAlign,
  TableColumnDisplay,
  TableColumnFormat,
  TableColumnWidth,
  TableViewSchema,
  ViewSchema,
} from "../shared/schema.ts";
import type { QueryExpression } from "../shared/query.ts";
import { getFieldTypeBehavior } from "../shared/field-types.ts";

export type RecordFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
  commit: FieldCommitPolicy;
  label?: string;
};

export type TableColumnBaseConfig = {
  key: string;
  label: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display: TableColumnDisplay;
  suffix?: string;
  format: TableColumnFormat;
};

export type FieldTableColumnConfig = RecordFieldConfig &
  TableColumnBaseConfig & {
    type: "field";
    referenceItem?: {
      itemViewName: string;
      entityName: string;
      entity: EntitySchema;
      recordFields: RecordFieldConfig[];
    };
  };

export type ReferenceFieldTableColumnConfig = RecordFieldConfig &
  TableColumnBaseConfig & {
    type: "referenceField";
    sourceReferenceFieldName: string;
    referencedEntityName: string;
    referencedEntity: EntitySchema;
  };

export type TableColumnConfig = FieldTableColumnConfig | ReferenceFieldTableColumnConfig;

export type CreateFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
};

export type CreateDefaultConfig = {
  fieldName: string;
  field: FieldSchema;
  value: CreateDefaultValueSchema;
};

export type HomeQueryTabConfig = {
  queryName: string;
  label: string;
  query: QueryExpression;
  count?: CountDisplaySchema;
};

export type HomeResultConfig =
  | {
      type: "list";
      itemViewName: string;
      recordFields: RecordFieldConfig[];
    }
  | {
      type: "table";
      tableViewName: string;
      columns: TableColumnConfig[];
    };

export type HomeContextConfig = {
  name: string;
  entityName: string;
  entity: EntitySchema;
  queryName: string;
  query: QueryExpression;
  labelField: string;
  createAction?: Extract<HomeActionConfig, { type: "create" }>;
  itemViewName?: string;
  recordFields?: RecordFieldConfig[];
};

export type HomeViewModel = {
  viewName: string;
  label: string;
  entityName: string;
  entity: EntitySchema;
  navigation: CollectionNavigationSchema;
  context?: HomeContextConfig;
  queryTabs: HomeQueryTabConfig[];
  defaultQueryName: string;
  result: HomeResultConfig;
  actions: HomeActionConfig[];
};

export type HomeActionConfig =
  | {
      type: "create";
      label: string;
      entityName: string;
      entity: EntitySchema;
      fields: CreateFieldConfig[];
      defaults: CreateDefaultConfig[];
      enabled: boolean;
    }
  | {
      type: "entity-action";
      label: string;
      entityName: string;
      actionName: string;
      action: EntityActionSchema;
      targetQuery?: QueryExpression;
      count?: CountDisplaySchema;
    };

export function selectPrimaryCollectionModels(schema: AppSchema): HomeViewModel[] {
  return selectCollectionModels(schema).filter((model) => model.navigation.primary);
}

export function selectCollectionModels(schema: AppSchema): HomeViewModel[] {
  const viewEntries = Object.entries(schema.views);
  const collectionViewEntries = viewEntries.filter(
    (entry): entry is [string, CollectionViewSchema] => entry[1].type === "collection",
  );

  return collectionViewEntries.map(([viewName, collectionView]) => {
    const entity = schema.entities[collectionView.entity];

    if (!entity) {
      throw new Error(`Missing entity "${collectionView.entity}".`);
    }

    return {
      viewName,
      label: collectionView.label,
      entityName: collectionView.entity,
      entity,
      navigation: {
        primary: collectionView.navigation?.primary ?? true,
      },
      context: selectContext(schema, viewEntries, collectionView),
      queryTabs: selectQueryTabs(schema, collectionView),
      defaultQueryName: collectionView.defaultQuery,
      result: selectResult(schema, collectionView, entity),
      actions: selectHomeActions(schema, viewEntries, collectionView, entity),
    };
  });
}

function selectContext(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
): HomeContextConfig | undefined {
  if (!collectionView.context) {
    return undefined;
  }

  const contextEntity = schema.entities[collectionView.context.entity];
  const contextQuery = schema.queries[collectionView.context.query];

  if (!contextEntity) {
    throw new Error(`Missing context entity "${collectionView.context.entity}".`);
  }

  if (!contextQuery) {
    throw new Error(`Missing context query "${collectionView.context.query}".`);
  }

  const createAction =
    collectionView.context.createView === undefined
      ? undefined
      : selectCreateAction(
          schema,
          viewEntries,
          collectionView.context.createView,
          `Create ${contextEntity.label}`,
        );
  const itemViewName = collectionView.context.itemView;
  const itemView = itemViewName === undefined ? undefined : schema.itemViews[itemViewName];

  if (itemViewName !== undefined && itemView === undefined) {
    throw new Error(`Missing context item view "${itemViewName}".`);
  }

  const recordFields =
    itemView === undefined ? undefined : selectRecordFields(itemView, contextEntity);

  return {
    name: collectionView.context.name,
    entityName: collectionView.context.entity,
    entity: contextEntity,
    queryName: collectionView.context.query,
    query: contextQuery.expression,
    labelField: collectionView.context.labelField,
    ...(createAction === undefined ? {} : { createAction }),
    ...(itemViewName === undefined
      ? {}
      : {
          itemViewName,
          recordFields,
        }),
  };
}

function selectQueryTabs(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
): HomeQueryTabConfig[] {
  return collectionView.queries.map((slot) => {
    const query = schema.queries[slot.query];

    if (!query) {
      throw new Error(`Missing query "${slot.query}".`);
    }

    return {
      queryName: slot.query,
      label: slot.label ?? query.label,
      query: query.expression,
      ...(slot.count === undefined ? {} : { count: slot.count }),
    };
  });
}

function selectResult(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeResultConfig {
  if (collectionView.result.type === "table") {
    const tableView = schema.tableViews[collectionView.result.tableView];

    if (!tableView) {
      throw new Error(`Missing table view "${collectionView.result.tableView}".`);
    }

    return {
      type: "table",
      tableViewName: collectionView.result.tableView,
      columns: selectTableColumns(schema, tableView, entity),
    };
  }

  const itemView = schema.itemViews[collectionView.result.itemView];

  if (!itemView) {
    throw new Error(`Missing item view "${collectionView.result.itemView}".`);
  }

  return {
    type: "list",
    itemViewName: collectionView.result.itemView,
    recordFields: selectRecordFields(itemView, entity),
  };
}

function selectHomeActions(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeActionConfig[] {
  return (collectionView.actions ?? []).map((slot) => {
    if (slot.type === "create") {
      return selectCreateAction(schema, viewEntries, slot.createView, slot.label);
    }

    const action = entity.actions?.[slot.action];

    if (!action) {
      throw new Error(`Missing entity action "${slot.action}".`);
    }

    const targetQuery =
      action.kind === "clear-completed" ? schema.queries[action.target.query] : undefined;

    if (action.kind === "clear-completed" && !targetQuery) {
      throw new Error(`Missing action target query "${action.target.query}".`);
    }

    return {
      type: "entity-action",
      label: slot.label ?? action.label,
      entityName: collectionView.entity,
      actionName: slot.action,
      action,
      ...(targetQuery === undefined ? {} : { targetQuery: targetQuery.expression }),
      ...(slot.count === undefined ? {} : { count: slot.count }),
    };
  });
}

function selectCreateAction(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  createViewName: string,
  label?: string,
): Extract<HomeActionConfig, { type: "create" }> {
  const createView = viewEntries.find(([viewName]) => viewName === createViewName)?.[1];

  if (!createView || createView.type !== "create") {
    throw new Error(`Missing create view "${createViewName}".`);
  }

  const entity = schema.entities[createView.entity];

  if (!entity) {
    throw new Error(`Missing create view entity "${createView.entity}".`);
  }

  return {
    type: "create",
    label: label ?? `Create ${entity.label}`,
    entityName: createView.entity,
    entity,
    fields: selectCreateFields(createView, entity),
    defaults: selectCreateDefaults(createView, entity),
    enabled: entity.mutations.create.enabled,
  };
}

function selectCreateFields(view: CreateViewSchema, entity: EntitySchema): CreateFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
  }));
}

function selectCreateDefaults(view: CreateViewSchema, entity: EntitySchema): CreateDefaultConfig[] {
  return Object.entries(view.defaults ?? {}).map(([fieldName, defaultValue]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    value: defaultValue,
  }));
}

function selectRecordFields(view: ItemViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    commit: viewField.commit,
  }));
}

function selectTableColumns(
  schema: AppSchema,
  view: TableViewSchema,
  entity: EntitySchema,
): TableColumnConfig[] {
  return view.columns.map((column) => {
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
      };
    }

    const field = entity.fields[column.field] as FieldSchema;
    const referenceItem = selectReferenceItem(schema, field, column.referenceItemView);

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
      display: column.display ?? "editor",
      ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
      format: column.format ?? "plain",
      ...(referenceItem === undefined ? {} : { referenceItem }),
    };
  });
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

  return {
    itemViewName,
    entityName: field.to,
    entity,
    recordFields: selectRecordFields(itemView, entity),
  };
}

export function fieldLabel(fieldName: string, field: FieldSchema) {
  return field.label ?? humanizeFieldName(fieldName);
}

function humanizeFieldName(fieldName: string) {
  const withSpaces = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (withSpaces === "") {
    return fieldName;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}
