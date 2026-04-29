import type {
  AppSchema,
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
  createFields: CreateFieldConfig[];
  recordFields: RecordFieldConfig[];
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

  return {
    entityName: listView.entity,
    entity,
    createFields: selectCreateFields(viewEntries, listView.entity, entity),
    recordFields: selectRecordFields(listView, entity),
  };
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
