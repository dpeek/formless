import type {
  AppSchema,
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
  TableViewSchema,
  ViewSchema,
} from "../shared/schema.ts";
import type { QueryExpression } from "../shared/query.ts";

export type RecordFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
  commit: FieldCommitPolicy;
  label?: string;
};

export type TableColumnConfig = RecordFieldConfig & {
  label: string;
  align?: TableColumnAlign;
};

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
};

export type HomeViewModel = {
  viewName: string;
  label: string;
  entityName: string;
  entity: EntitySchema;
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
      targetQuery: QueryExpression;
      count?: CountDisplaySchema;
    };

export function selectHomeModel(schema: AppSchema): HomeViewModel | undefined {
  return selectCollectionModels(schema)[0];
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
          viewEntries,
          collectionView.context.createView,
          collectionView.context.entity,
          contextEntity,
          `Create ${contextEntity.label}`,
        );

  return {
    name: collectionView.context.name,
    entityName: collectionView.context.entity,
    entity: contextEntity,
    queryName: collectionView.context.query,
    query: contextQuery.expression,
    labelField: collectionView.context.labelField,
    ...(createAction === undefined ? {} : { createAction }),
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
      columns: selectTableColumns(tableView, entity),
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
      return selectCreateAction(
        viewEntries,
        slot.createView,
        collectionView.entity,
        entity,
        slot.label ?? `Create ${entity.label}`,
      );
    }

    const action = entity.actions?.[slot.action];

    if (!action) {
      throw new Error(`Missing entity action "${slot.action}".`);
    }

    const targetQuery = schema.queries[action.target.query];

    if (!targetQuery) {
      throw new Error(`Missing action target query "${action.target.query}".`);
    }

    return {
      type: "entity-action",
      label: slot.label ?? action.label,
      entityName: collectionView.entity,
      actionName: slot.action,
      action,
      targetQuery: targetQuery.expression,
      ...(slot.count === undefined ? {} : { count: slot.count }),
    };
  });
}

function selectCreateAction(
  viewEntries: Array<[string, ViewSchema]>,
  createViewName: string,
  entityName: string,
  entity: EntitySchema,
  label: string,
): Extract<HomeActionConfig, { type: "create" }> {
  const createView = viewEntries.find(([viewName]) => viewName === createViewName)?.[1];

  if (!createView || createView.type !== "create") {
    throw new Error(`Missing create view "${createViewName}".`);
  }

  return {
    type: "create",
    label,
    entityName,
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

function selectTableColumns(view: TableViewSchema, entity: EntitySchema): TableColumnConfig[] {
  return view.columns.map((column) => {
    const field = entity.fields[column.field] as FieldSchema;

    return {
      fieldName: column.field,
      field,
      editor: column.editor ?? field.type,
      commit: column.commit ?? defaultCommitPolicy(field),
      label: column.label ?? fieldLabel(column.field, field),
      ...(column.align === undefined ? {} : { align: column.align }),
    };
  });
}

function defaultCommitPolicy(field: FieldSchema): FieldCommitPolicy {
  return field.type === "boolean" || field.type === "enum" || field.type === "reference"
    ? "immediate"
    : "field-commit";
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
