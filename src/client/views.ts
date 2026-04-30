import type {
  AppSchema,
  EntityActionSchema,
  EntitySchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldSchema,
  ListViewSchema,
  ViewSchema,
} from "../shared/schema.ts";
import type { CollectionAggregateSchema } from "../shared/aggregates.ts";
import type { QueryExpression } from "../shared/query.ts";

export type RecordFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
  commit: FieldCommitPolicy;
};

export type CreateFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
};

export type HomeListViewConfig = {
  viewName: string;
  label: string;
  query: QueryExpression;
  recordFields: RecordFieldConfig[];
};

export type HomeAggregateConfig = {
  aggregateName: string;
  label: string;
  entityName: string;
  aggregate: CollectionAggregateSchema;
};

export type HomeViewModel = {
  entityName: string;
  entity: EntitySchema;
  listViews: HomeListViewConfig[];
  aggregates: HomeAggregateConfig[];
  actions: EntityActionConfig[];
  createFields: CreateFieldConfig[];
  homeActions: HomeActionConfig[];
};

export type EntityActionConfig = {
  actionName: string;
  action: EntityActionSchema;
};

export type HomeActionConfig =
  | {
      type: "create";
      label: string;
      entityName: string;
      entity: EntitySchema;
      fields: CreateFieldConfig[];
      enabled: boolean;
    }
  | {
      type: "entity-action";
      label: string;
      entityName: string;
      actionName: string;
      action: EntityActionSchema;
    };

export function selectHomeModel(schema: AppSchema): HomeViewModel | undefined {
  const viewEntries = Object.entries(schema.views);
  const listViewEntry = viewEntries.find(([, view]) => view.type === "list");

  if (!listViewEntry) {
    return undefined;
  }

  const [, listView] = listViewEntry;

  if (listView.type !== "list") {
    return undefined;
  }

  const entity = schema.entities[listView.entity];

  if (!entity) {
    return undefined;
  }

  const actions = selectActions(entity);
  const createFields = selectCreateFields(viewEntries, listView.entity, entity);
  const listViews = selectListViews(viewEntries, listView.entity, entity);
  const aggregates = selectAggregates(schema, listView.entity);

  return {
    entityName: listView.entity,
    entity,
    listViews,
    aggregates,
    actions,
    createFields,
    homeActions: selectHomeActions(listView.entity, entity, createFields, actions),
  };
}

function selectAggregates(schema: AppSchema, entityName: string): HomeAggregateConfig[] {
  return Object.entries(schema.aggregates)
    .filter(([, aggregate]) => aggregate.entity === entityName)
    .map(([aggregateName, aggregate]) => ({
      aggregateName,
      label: aggregate.label,
      entityName,
      aggregate,
    }));
}

function selectHomeActions(
  entityName: string,
  entity: EntitySchema,
  createFields: CreateFieldConfig[],
  actions: EntityActionConfig[],
): HomeActionConfig[] {
  const homeActions: HomeActionConfig[] = [];

  if (createFields.length > 0) {
    homeActions.push({
      type: "create",
      label: `Create ${entity.label}`,
      entityName,
      entity,
      fields: createFields,
      enabled: entity.mutations.create.enabled,
    });
  }

  homeActions.push(
    ...actions.map(({ action, actionName }) => ({
      type: "entity-action" as const,
      label: action.label,
      entityName,
      actionName,
      action,
    })),
  );

  return homeActions;
}

function selectActions(entity: EntitySchema): EntityActionConfig[] {
  return Object.entries(entity.actions ?? {}).map(([actionName, action]) => ({
    actionName,
    action,
  }));
}

function selectCreateFields(
  viewEntries: Array<[string, ViewSchema]>,
  entityName: string,
  entity: EntitySchema,
): CreateFieldConfig[] {
  const createView = viewEntries.find(([, view]) => {
    return view.type === "create" && view.entity === entityName;
  })?.[1];

  if (!createView || createView.type !== "create") {
    return [];
  }

  return Object.entries(createView.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
  }));
}

function selectListViews(
  viewEntries: Array<[string, ViewSchema]>,
  entityName: string,
  entity: EntitySchema,
): HomeListViewConfig[] {
  const listViews: HomeListViewConfig[] = [];

  for (const [viewName, view] of viewEntries) {
    if (view.type !== "list" || view.entity !== entityName) {
      continue;
    }

    listViews.push({
      viewName,
      label: view.label,
      query: view.query,
      recordFields: selectRecordFields(view, entity),
    });
  }

  return listViews;
}

function selectRecordFields(view: ListViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    commit: viewField.commit,
  }));
}
