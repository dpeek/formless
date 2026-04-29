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

export type HomeViewModel = {
  entityName: string;
  entity: EntitySchema;
  actions: EntityActionConfig[];
  createFields: CreateFieldConfig[];
  homeActions: HomeActionConfig[];
  recordFields: RecordFieldConfig[];
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
  const listView = viewEntries.find(([, view]) => view.type === "list")?.[1];

  if (!listView || listView.type !== "list") {
    return undefined;
  }

  const entity = schema.entities[listView.entity];

  if (!entity) {
    return undefined;
  }

  const actions = selectActions(entity);
  const createFields = selectCreateFields(viewEntries, listView.entity, entity);

  return {
    entityName: listView.entity,
    entity,
    actions,
    createFields,
    homeActions: selectHomeActions(listView.entity, entity, createFields, actions),
    recordFields: selectRecordFields(listView, entity),
  };
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

function selectRecordFields(view: ListViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    commit: viewField.commit,
  }));
}
