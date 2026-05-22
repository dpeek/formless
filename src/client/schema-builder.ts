import {
  fieldEditorControl,
  getFieldTypeBehavior,
  type FieldEditorControl,
} from "../shared/field-types.ts";
import {
  parseAppSchema,
  stringifySchema,
  type AppSchema,
  type CollectionViewSchema,
  type CreateViewSchema,
  type EnumValueSchema,
  type FieldCommitPolicy,
  type FieldEditor,
  type FieldSchema,
  type ItemViewSchema,
  type ScreenSchema,
  type TextFieldFormat,
  type ViewSchema,
} from "../shared/schema.ts";

export type SchemaBuilderDraft = {
  savedSchema: AppSchema;
  schema: AppSchema;
};

export type SchemaBuilderGeneratedSurface = {
  queryKey: string;
  itemViewKey: string;
  createViewKey: string;
  collectionViewKey: string;
  screenKey: string;
};

export type SchemaBuilderProjection = {
  entities: SchemaBuilderEntityProjection[];
};

export type SchemaBuilderEntityProjection = {
  key: string;
  label: string;
  saved: boolean;
  fields: SchemaBuilderFieldProjection[];
  generatedSurface?: SchemaBuilderGeneratedSurface;
};

export type SchemaBuilderFieldProjection = {
  key: string;
  label: string;
  type: FieldSchema["type"];
  required: boolean;
  saved: boolean;
  keyLocked: boolean;
  referenceTargetLocked: boolean;
  typeLocked: boolean;
  presentation: SchemaBuilderFieldPresentation;
};

export type SchemaBuilderFieldPresentation = {
  createEditor: FieldEditor;
  defaultCommit: FieldCommitPolicy;
  inlineEditor: FieldEditor;
  rendererKind: SchemaBuilderRendererKind;
  validEditors: FieldEditor[];
};

export type SchemaBuilderRendererKind =
  | "checkbox"
  | "color"
  | "date"
  | "icon"
  | "image"
  | "markdown"
  | "media"
  | "number"
  | "reference"
  | "select"
  | "text"
  | "textarea";

export type SchemaBuilderIntent =
  | {
      type: "createEntity";
      key: string;
      label?: string;
    }
  | {
      type: "updateEntityLabel";
      entityKey: string;
      label: string;
    }
  | {
      type: "createGeneratedSurface";
      entityKey: string;
    }
  | {
      type: "addField";
      entityKey: string;
      fieldKey: string;
      fieldType: FieldSchema["type"];
      metadata?: SchemaBuilderFieldMetadataUpdate;
    }
  | {
      type: "updateFieldMetadata";
      entityKey: string;
      fieldKey: string;
      metadata: SchemaBuilderFieldMetadataUpdate;
    }
  | {
      type: "updateFieldPresentation";
      entityKey: string;
      fieldKey: string;
      createEditor?: FieldEditor;
      inlineEditor?: FieldEditor;
    };

export type SchemaBuilderFieldMetadataUpdate = {
  default?: string | number | boolean | null;
  displayField?: string | null;
  format?: TextFieldFormat | null;
  integer?: boolean | null;
  label?: string;
  max?: number | null;
  min?: number | null;
  required?: boolean;
  to?: string;
  type?: FieldSchema["type"];
  values?: Record<string, EnumValueSchema>;
};

export type SchemaBuilderValidationIssue = {
  entityKey?: string;
  fieldKey?: string;
  message: string;
  scope: "schema" | "entity" | "field";
};

export type SchemaBuilderKeyValidationResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

const builderKeyPattern = /^[A-Za-z][A-Za-z0-9]*$/;

export function createSchemaBuilderDraft(schema: AppSchema): SchemaBuilderDraft {
  return {
    savedSchema: cloneSchema(schema),
    schema: cloneSchema(schema),
  };
}

export function revertSchemaBuilderDraft(draft: SchemaBuilderDraft): SchemaBuilderDraft {
  return {
    savedSchema: cloneSchema(draft.savedSchema),
    schema: cloneSchema(draft.savedSchema),
  };
}

export function serializeSchemaBuilderDraft(draft: SchemaBuilderDraft): AppSchema {
  return parseAppSchema(cloneSchema(draft.schema));
}

export function isSchemaBuilderDraftDirty(draft: SchemaBuilderDraft): boolean {
  return stringifySchema(draft.schema) !== stringifySchema(draft.savedSchema);
}

export function validateSchemaBuilderDraft(
  draft: SchemaBuilderDraft,
): SchemaBuilderValidationIssue[] {
  try {
    serializeSchemaBuilderDraft(draft);
    return [];
  } catch (error) {
    return [schemaBuilderIssueFromError(error)];
  }
}

export function validateSchemaBuilderKey(
  kind: "entity" | "enum value" | "field",
  value: string,
): SchemaBuilderKeyValidationResult {
  const key = value.trim();

  if (key === "") {
    return { ok: false, message: `${capitalize(kind)} key is required.` };
  }

  if (!builderKeyPattern.test(key)) {
    return {
      ok: false,
      message: `${capitalize(kind)} key must start with a letter and use only letters and numbers.`,
    };
  }

  return { ok: true };
}

export function projectSchemaBuilderDraft(draft: SchemaBuilderDraft): SchemaBuilderProjection {
  return {
    entities: Object.entries(draft.schema.entities).map(([entityKey, entity]) => {
      const savedEntity = draft.savedSchema.entities[entityKey];
      const generatedSurface = findSchemaBuilderGeneratedSurface(draft.schema, entityKey);

      return {
        key: entityKey,
        label: entity.label,
        saved: savedEntity !== undefined,
        fields: Object.entries(entity.fields).map(([fieldKey, field]) => {
          const savedField = savedEntity?.fields[fieldKey];

          return {
            key: fieldKey,
            label: field.label ?? labelFromKey(fieldKey),
            type: field.type,
            required: field.required,
            saved: savedField !== undefined,
            keyLocked: savedField !== undefined,
            referenceTargetLocked: savedField?.type === "reference",
            typeLocked: savedField !== undefined,
            presentation: selectSchemaBuilderFieldPresentation({
              entityKey,
              field,
              fieldKey,
              schema: draft.schema,
              surface: generatedSurface,
            }),
          };
        }),
        ...(generatedSurface === undefined ? {} : { generatedSurface }),
      };
    }),
  };
}

export function applySchemaBuilderIntent(
  draft: SchemaBuilderDraft,
  intent: SchemaBuilderIntent,
): SchemaBuilderDraft {
  return updateSchemaBuilderDraft(draft, (schema, savedSchema) => {
    if (intent.type === "createEntity") {
      createEntity(schema, intent);
      return;
    }

    if (intent.type === "updateEntityLabel") {
      updateEntityLabel(schema, intent.entityKey, intent.label);
      return;
    }

    if (intent.type === "createGeneratedSurface") {
      createGeneratedSurface(schema, intent.entityKey);
      return;
    }

    if (intent.type === "addField") {
      addField(schema, intent);
      return;
    }

    if (intent.type === "updateFieldMetadata") {
      updateFieldMetadata(schema, savedSchema, intent.entityKey, intent.fieldKey, intent.metadata);
      return;
    }

    updateFieldPresentation(schema, intent);
  });
}

export function findSchemaBuilderGeneratedSurface(
  schema: AppSchema,
  entityKey: string,
): SchemaBuilderGeneratedSurface | undefined {
  for (const [collectionViewKey, view] of Object.entries(schema.views)) {
    if (!isBuilderCollectionView(schema, entityKey, view)) {
      continue;
    }

    const queryKey = view.defaultQuery;
    const itemViewKey = view.result.itemView;
    const createViewKey = view.actions[0].createView;
    const screenKey = findBuilderScreenKey(schema, collectionViewKey);

    if (screenKey === undefined) {
      continue;
    }

    return {
      queryKey,
      itemViewKey,
      createViewKey,
      collectionViewKey,
      screenKey,
    };
  }

  return undefined;
}

export function selectSchemaBuilderFieldPresentation({
  entityKey,
  field,
  fieldKey,
  schema,
  surface,
}: {
  entityKey: string;
  field: FieldSchema;
  fieldKey: string;
  schema: AppSchema;
  surface?: SchemaBuilderGeneratedSurface;
}): SchemaBuilderFieldPresentation {
  const behavior = getFieldTypeBehavior(field);
  const createEditor = selectCreateEditor(
    schema,
    entityKey,
    fieldKey,
    behavior.defaultEditor,
    surface,
  );
  const inlineEditor = selectInlineEditor(
    schema,
    entityKey,
    fieldKey,
    behavior.defaultEditor,
    surface,
  );

  return {
    createEditor,
    defaultCommit: behavior.defaultCommit,
    inlineEditor,
    rendererKind: selectRendererKind(field, inlineEditor),
    validEditors: [...behavior.editors],
  };
}

function updateSchemaBuilderDraft(
  draft: SchemaBuilderDraft,
  update: (schema: AppSchema, savedSchema: AppSchema) => void,
): SchemaBuilderDraft {
  const schema = cloneSchema(draft.schema);
  update(schema, draft.savedSchema);

  return {
    savedSchema: cloneSchema(draft.savedSchema),
    schema,
  };
}

function createEntity(
  schema: AppSchema,
  input: Extract<SchemaBuilderIntent, { type: "createEntity" }>,
) {
  const entityKey = cleanKey("entity", input.key);

  if (schema.entities[entityKey] !== undefined) {
    throw new Error(`Entity key "${entityKey}" already exists.`);
  }

  schema.entities[entityKey] = {
    label: cleanLabel(input.label ?? labelFromKey(entityKey), "Entity label"),
    fields: {},
    mutations: defaultMutationPolicy(),
  };

  createGeneratedSurface(schema, entityKey);
}

function updateEntityLabel(schema: AppSchema, entityKey: string, label: string) {
  const entity = getEntity(schema, entityKey);
  entity.label = cleanLabel(label, `Entity "${entityKey}" label`);
}

function createGeneratedSurface(
  schema: AppSchema,
  entityKey: string,
): SchemaBuilderGeneratedSurface {
  const existingSurface = findSchemaBuilderGeneratedSurface(schema, entityKey);
  if (existingSurface !== undefined) {
    return existingSurface;
  }

  const entity = getEntity(schema, entityKey);
  const queryKey = uniqueName(`${entityKey}All`, schema.queries);
  const itemViewKey = uniqueName(`${entityKey}Item`, schema.itemViews);
  const createViewKey = uniqueName(`${entityKey}Create`, schema.views);
  const collectionViewKey = uniqueName(`${entityKey}Home`, schema.views);
  const screenKey = uniqueName(`${entityKey}Screen`, schema.screens ?? {});
  const fields = builderViewFieldsForEntity(entity.fields);
  const path = uniqueScreenPath(schema, `/${pathSegmentFromKey(entityKey)}`);

  schema.queries[queryKey] = {
    label: "All",
    entity: entityKey,
    expression: { kind: "all" },
  };
  schema.itemViews[itemViewKey] = {
    entity: entityKey,
    fields: fields.itemFields,
  };
  schema.views[createViewKey] = {
    type: "create",
    entity: entityKey,
    fields: fields.createFields,
  };
  schema.views[collectionViewKey] = {
    type: "collection",
    label: pluralLabel(entity.label),
    entity: entityKey,
    queries: [{ query: queryKey }],
    defaultQuery: queryKey,
    result: { type: "list", itemView: itemViewKey },
    actions: [{ type: "create", createView: createViewKey }],
  };
  schema.screens = {
    ...schema.screens,
    [screenKey]: {
      type: "workspace",
      label: pluralLabel(entity.label),
      path,
      navigation: { primary: true },
      layout: {
        type: "stack",
        sections: [{ id: `${entityKey}List`, type: "collection", view: collectionViewKey }],
      },
    },
  };

  return {
    queryKey,
    itemViewKey,
    createViewKey,
    collectionViewKey,
    screenKey,
  };
}

function addField(schema: AppSchema, input: Extract<SchemaBuilderIntent, { type: "addField" }>) {
  const entity = getEntity(schema, input.entityKey);
  const fieldKey = cleanKey("field", input.fieldKey);

  if (entity.fields[fieldKey] !== undefined) {
    throw new Error(`Field key "${input.entityKey}.${fieldKey}" already exists.`);
  }

  const field = createField(schema, fieldKey, input.fieldType, input.metadata ?? {});
  entity.fields[fieldKey] = field;

  const surface = findSchemaBuilderGeneratedSurface(schema, input.entityKey);
  if (surface !== undefined) {
    addFieldToGeneratedSurface(schema, surface, fieldKey, field);
  }
}

function updateFieldMetadata(
  schema: AppSchema,
  savedSchema: AppSchema,
  entityKey: string,
  fieldKey: string,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  const entity = getEntity(schema, entityKey);
  const field = getField(schema, entityKey, fieldKey);
  const savedField = savedSchema.entities[entityKey]?.fields[fieldKey];
  const nextType = metadata.type ?? field.type;

  if (savedField !== undefined && nextType !== savedField.type) {
    throw new Error(`Saved field "${entityKey}.${fieldKey}" type is locked.`);
  }

  if (nextType !== field.type) {
    entity.fields[fieldKey] = createField(schema, fieldKey, nextType, {
      ...metadata,
      label: metadata.label ?? field.label ?? labelFromKey(fieldKey),
      required: metadata.required ?? field.required,
    });
    return;
  }

  applyCommonFieldMetadata(field, metadata, fieldKey);
  applyTypedFieldMetadata(schema, savedField, entityKey, fieldKey, field, metadata);
}

function updateFieldPresentation(
  schema: AppSchema,
  input: Extract<SchemaBuilderIntent, { type: "updateFieldPresentation" }>,
) {
  const field = getField(schema, input.entityKey, input.fieldKey);
  const surface = findSchemaBuilderGeneratedSurface(schema, input.entityKey);

  if (surface === undefined) {
    throw new Error(`Entity "${input.entityKey}" does not have a builder generated surface.`);
  }

  if (input.createEditor !== undefined) {
    assertEditorMatchesField(field, input.createEditor);
    const createView = getCreateView(schema, surface.createViewKey);
    createView.fields[input.fieldKey] = { editor: input.createEditor };
  }

  if (input.inlineEditor !== undefined) {
    assertEditorMatchesField(field, input.inlineEditor);
    const itemView = getItemView(schema, surface.itemViewKey);
    itemView.fields[input.fieldKey] = {
      editor: input.inlineEditor,
      commit: getFieldTypeBehavior(field).defaultCommit,
    };
  }
}

function createField(
  schema: AppSchema,
  fieldKey: string,
  fieldType: FieldSchema["type"],
  metadata: SchemaBuilderFieldMetadataUpdate,
): FieldSchema {
  const required = metadata.required ?? false;
  const label = cleanLabel(metadata.label ?? labelFromKey(fieldKey), `Field "${fieldKey}" label`);

  if (fieldType === "text") {
    const field: Extract<FieldSchema, { type: "text" }> = { type: "text", required, label };
    applyTextMetadata(field, metadata);
    return field;
  }

  if (fieldType === "boolean") {
    const field: Extract<FieldSchema, { type: "boolean" }> = { type: "boolean", required, label };
    applyBooleanMetadata(field, metadata);
    return field;
  }

  if (fieldType === "date") {
    return { type: "date", required, label };
  }

  if (fieldType === "number") {
    const field: Extract<FieldSchema, { type: "number" }> = { type: "number", required, label };
    applyNumberMetadata(field, metadata);
    return field;
  }

  if (fieldType === "enum") {
    const field: Extract<FieldSchema, { type: "enum" }> = {
      type: "enum",
      required,
      label,
      values: metadata.values ?? { option: { label: "Option" } },
    };
    applyEnumMetadata(field, metadata);
    return field;
  }

  const target = metadata.to;
  if (target === undefined) {
    throw new Error(`Reference field "${fieldKey}" must choose a target entity.`);
  }

  const field: Extract<FieldSchema, { type: "reference" }> = {
    type: "reference",
    required,
    label,
    to: target,
  };
  applyReferenceMetadata(schema, undefined, fieldKey, field, metadata);
  return field;
}

function applyCommonFieldMetadata(
  field: FieldSchema,
  metadata: SchemaBuilderFieldMetadataUpdate,
  fieldKey: string,
) {
  if (metadata.label !== undefined) {
    field.label = cleanLabel(metadata.label, `Field "${fieldKey}" label`);
  }

  if (metadata.required !== undefined) {
    field.required = metadata.required;
  }
}

function applyTypedFieldMetadata(
  schema: AppSchema,
  savedField: FieldSchema | undefined,
  entityKey: string,
  fieldKey: string,
  field: FieldSchema,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (field.type === "text") {
    applyTextMetadata(field, metadata);
    return;
  }

  if (field.type === "boolean") {
    applyBooleanMetadata(field, metadata);
    return;
  }

  if (field.type === "number") {
    applyNumberMetadata(field, metadata);
    return;
  }

  if (field.type === "enum") {
    applyEnumMetadata(field, metadata);
    return;
  }

  if (field.type === "reference") {
    applyReferenceMetadata(schema, savedField, `${entityKey}.${fieldKey}`, field, metadata);
  }
}

function applyTextMetadata(
  field: Extract<FieldSchema, { type: "text" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (!("format" in metadata)) {
    return;
  }

  if (metadata.format === null || metadata.format === undefined || metadata.format === "plain") {
    delete field.format;
    return;
  }

  field.format = metadata.format;
}

function applyBooleanMetadata(
  field: Extract<FieldSchema, { type: "boolean" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (!("default" in metadata)) {
    return;
  }

  if (metadata.default === null || metadata.default === undefined) {
    delete field.default;
    return;
  }

  if (typeof metadata.default !== "boolean") {
    throw new Error("Boolean default must be a boolean.");
  }

  field.default = metadata.default;
}

function applyNumberMetadata(
  field: Extract<FieldSchema, { type: "number" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if ("min" in metadata) {
    if (metadata.min === null || metadata.min === undefined) {
      delete field.min;
    } else {
      field.min = metadata.min;
    }
  }

  if ("max" in metadata) {
    if (metadata.max === null || metadata.max === undefined) {
      delete field.max;
    } else {
      field.max = metadata.max;
    }
  }

  if ("integer" in metadata) {
    if (metadata.integer === null || metadata.integer === undefined) {
      delete field.integer;
    } else {
      field.integer = metadata.integer;
    }
  }

  if (!("default" in metadata)) {
    return;
  }

  if (metadata.default === null || metadata.default === undefined) {
    delete field.default;
    return;
  }

  if (typeof metadata.default !== "number") {
    throw new Error("Number default must be a number.");
  }

  field.default = metadata.default;
}

function applyEnumMetadata(
  field: Extract<FieldSchema, { type: "enum" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (metadata.values !== undefined) {
    field.values = metadata.values;
  }

  if (!("default" in metadata)) {
    return;
  }

  if (metadata.default === null || metadata.default === undefined) {
    delete field.default;
    return;
  }

  if (typeof metadata.default !== "string") {
    throw new Error("Enum default must be an enum value key.");
  }

  field.default = metadata.default;
}

function applyReferenceMetadata(
  schema: AppSchema,
  savedField: FieldSchema | undefined,
  context: string,
  field: Extract<FieldSchema, { type: "reference" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (metadata.to !== undefined) {
    if (savedField?.type === "reference" && metadata.to !== savedField.to) {
      throw new Error(`Saved reference field "${context}" target is locked.`);
    }

    field.to = metadata.to;
  }

  validateReferenceTarget(schema, context, field.to);

  if (!("displayField" in metadata)) {
    return;
  }

  if (metadata.displayField === null || metadata.displayField === undefined) {
    delete field.displayField;
    return;
  }

  validateReferenceDisplayField(schema, context, field.to, metadata.displayField);
  field.displayField = metadata.displayField;
}

function addFieldToGeneratedSurface(
  schema: AppSchema,
  surface: SchemaBuilderGeneratedSurface,
  fieldKey: string,
  field: FieldSchema,
) {
  const createView = getCreateView(schema, surface.createViewKey);
  const itemView = getItemView(schema, surface.itemViewKey);
  const behavior = getFieldTypeBehavior(field);

  createView.fields[fieldKey] = { editor: behavior.defaultEditor };
  itemView.fields[fieldKey] = {
    editor: behavior.defaultEditor,
    commit: behavior.defaultCommit,
  };
}

function builderViewFieldsForEntity(fields: Record<string, FieldSchema>) {
  return Object.entries(fields).reduce(
    (viewFields, [fieldKey, field]) => {
      const behavior = getFieldTypeBehavior(field);

      viewFields.createFields[fieldKey] = { editor: behavior.defaultEditor };
      viewFields.itemFields[fieldKey] = {
        editor: behavior.defaultEditor,
        commit: behavior.defaultCommit,
      };
      return viewFields;
    },
    {
      createFields: {} as CreateViewSchema["fields"],
      itemFields: {} as ItemViewSchema["fields"],
    },
  );
}

function isBuilderCollectionView(
  schema: AppSchema,
  entityKey: string,
  view: ViewSchema,
): view is CollectionViewSchema & {
  actions: [{ type: "create"; createView: string; label?: string }];
  result: { type: "list"; itemView: string };
} {
  if (
    view.type !== "collection" ||
    view.entity !== entityKey ||
    view.context !== undefined ||
    view.summary !== undefined ||
    view.queries.length !== 1 ||
    view.defaultQuery !== view.queries[0].query ||
    view.result.type !== "list" ||
    view.actions?.length !== 1 ||
    view.actions[0].type !== "create"
  ) {
    return false;
  }

  const query = schema.queries[view.defaultQuery];
  const itemView = schema.itemViews[view.result.itemView];
  const createView = schema.views[view.actions[0].createView];

  return (
    query?.entity === entityKey &&
    query.expression.kind === "all" &&
    itemView !== undefined &&
    isBuilderItemView(itemView, entityKey) &&
    createView !== undefined &&
    isBuilderCreateView(createView, entityKey)
  );
}

function isBuilderItemView(itemView: ItemViewSchema, entityKey: string): boolean {
  return (
    itemView.entity === entityKey &&
    itemView.union === undefined &&
    Object.values(itemView.fields).every((field) => field.visibleWhen === undefined)
  );
}

function isBuilderCreateView(view: ViewSchema, entityKey: string): view is CreateViewSchema {
  return (
    view.type === "create" &&
    view.entity === entityKey &&
    view.defaults === undefined &&
    view.union === undefined &&
    Object.values(view.fields).every((field) => field.visibleWhen === undefined)
  );
}

function findBuilderScreenKey(schema: AppSchema, collectionViewKey: string): string | undefined {
  return Object.entries(schema.screens ?? {}).find(([, screen]) =>
    isBuilderScreen(screen, collectionViewKey),
  )?.[0];
}

function isBuilderScreen(screen: ScreenSchema, collectionViewKey: string): boolean {
  return (
    screen.type === "workspace" &&
    screen.layout.type === "stack" &&
    screen.layout.sections.length === 1 &&
    screen.layout.sections[0].type === "collection" &&
    screen.layout.sections[0].view === collectionViewKey
  );
}

function selectCreateEditor(
  schema: AppSchema,
  entityKey: string,
  fieldKey: string,
  defaultEditor: FieldEditor,
  surface?: SchemaBuilderGeneratedSurface,
): FieldEditor {
  if (surface === undefined) {
    return defaultEditor;
  }

  const createView = schema.views[surface.createViewKey];

  if (createView?.type !== "create" || createView.entity !== entityKey) {
    return defaultEditor;
  }

  return createView.fields[fieldKey]?.editor ?? defaultEditor;
}

function selectInlineEditor(
  schema: AppSchema,
  entityKey: string,
  fieldKey: string,
  defaultEditor: FieldEditor,
  surface?: SchemaBuilderGeneratedSurface,
): FieldEditor {
  if (surface === undefined) {
    return defaultEditor;
  }

  const itemView = schema.itemViews[surface.itemViewKey];

  if (itemView?.entity !== entityKey) {
    return defaultEditor;
  }

  return itemView.fields[fieldKey]?.editor ?? defaultEditor;
}

function selectRendererKind(field: FieldSchema, editor: FieldEditor): SchemaBuilderRendererKind {
  const control = fieldEditorControl(field, editor);

  if (editor === "markdown") {
    return "markdown";
  }

  if (editor === "color") {
    return "color";
  }

  if (control.kind === "checkbox") {
    return "checkbox";
  }

  if (control.kind === "textarea") {
    return "textarea";
  }

  if (control.kind === "select") {
    return "select";
  }

  if (control.kind === "reference") {
    return "reference";
  }

  if (control.kind === "icon") {
    return "icon";
  }

  if (control.kind === "imageUpload") {
    return "image";
  }

  if (control.kind === "mediaUpload") {
    return "media";
  }

  if (control.kind === "input") {
    return controlKindFromInput(control);
  }

  return "text";
}

function controlKindFromInput(control: Extract<FieldEditorControl, { kind: "input" }>) {
  if (control.inputType === "date") {
    return "date";
  }

  if (control.inputType === "number") {
    return "number";
  }

  return "text";
}

function assertEditorMatchesField(field: FieldSchema, editor: FieldEditor) {
  if (!getFieldTypeBehavior(field).editors.includes(editor)) {
    throw new Error(`Editor "${editor}" is not valid for field type "${field.type}".`);
  }
}

function schemaBuilderIssueFromError(error: unknown): SchemaBuilderValidationIssue {
  const message = error instanceof Error ? error.message : "Schema is invalid.";
  const fieldMatch = /^Field "([^".]+)\.([^"]+)"/.exec(message);

  if (fieldMatch) {
    return {
      scope: "field",
      entityKey: fieldMatch[1],
      fieldKey: fieldMatch[2],
      message,
    };
  }

  const entityMatch = /^Entity "([^"]+)"/.exec(message);

  if (entityMatch) {
    return {
      scope: "entity",
      entityKey: entityMatch[1],
      message,
    };
  }

  return { scope: "schema", message };
}

function getEntity(schema: AppSchema, entityKey: string) {
  const entity = schema.entities[entityKey];

  if (entity === undefined) {
    throw new Error(`Unknown entity "${entityKey}".`);
  }

  return entity;
}

function getField(schema: AppSchema, entityKey: string, fieldKey: string) {
  const entity = getEntity(schema, entityKey);
  const field = entity.fields[fieldKey];

  if (field === undefined) {
    throw new Error(`Unknown field "${entityKey}.${fieldKey}".`);
  }

  return field;
}

function getCreateView(schema: AppSchema, viewKey: string): CreateViewSchema {
  const view = schema.views[viewKey];

  if (view?.type !== "create") {
    throw new Error(`Builder create view "${viewKey}" is missing.`);
  }

  return view;
}

function getItemView(schema: AppSchema, itemViewKey: string): ItemViewSchema {
  const itemView = schema.itemViews[itemViewKey];

  if (itemView === undefined) {
    throw new Error(`Builder item view "${itemViewKey}" is missing.`);
  }

  return itemView;
}

function validateReferenceTarget(schema: AppSchema, context: string, target: string) {
  if (schema.entities[target] === undefined) {
    throw new Error(`Reference field "${context}" target must be an existing entity.`);
  }
}

function validateReferenceDisplayField(
  schema: AppSchema,
  context: string,
  target: string,
  displayField: string,
) {
  const targetField = schema.entities[target]?.fields[displayField];

  if (targetField === undefined) {
    throw new Error(`Reference field "${context}" display field must exist on "${target}".`);
  }

  if (targetField.type !== "text") {
    throw new Error(`Reference field "${context}" display field must be a text field.`);
  }
}

function uniqueName(base: string, existing: Record<string, unknown>): string {
  if (existing[base] === undefined) {
    return base;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${suffix}`;

    if (existing[candidate] === undefined) {
      return candidate;
    }
  }
}

function uniqueScreenPath(schema: AppSchema, basePath: string): string {
  const usedPaths = new Set<string>();
  const screens = schema.screens ?? {};

  for (const screen of Object.values(screens)) {
    if (screen.path !== undefined) {
      usedPaths.add(screen.path);
    }
  }

  const pathlessPrimaryScreen = Object.values(screens).find(
    (screen) => (screen.navigation?.primary ?? true) && screen.path === undefined,
  );

  if (pathlessPrimaryScreen !== undefined) {
    usedPaths.add("/");
  }

  if (!usedPaths.has(basePath)) {
    return basePath;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${basePath}-${suffix}`;

    if (!usedPaths.has(candidate)) {
      return candidate;
    }
  }
}

function cleanKey(kind: "entity" | "enum value" | "field", value: string): string {
  const key = value.trim();
  const result = validateSchemaBuilderKey(kind, key);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return key;
}

function cleanLabel(value: string, context: string): string {
  const label = value.trim();

  if (label === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return label;
}

function cloneSchema(schema: AppSchema): AppSchema {
  return structuredClone(schema);
}

function defaultMutationPolicy() {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
}

function labelFromKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function pluralLabel(label: string): string {
  if (label.endsWith("s")) {
    return label;
  }

  if (label.endsWith("y")) {
    return `${label.slice(0, -1)}ies`;
  }

  return `${label}s`;
}

function pathSegmentFromKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
