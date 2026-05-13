import {
  fieldCreateDefaultValue,
  fieldEditorControl,
  fieldHasCreateDefault,
  fieldInputAttributes,
  fieldValueToInputValue,
  getFieldTypeBehavior,
  type FieldEditorControl,
  type FieldInputAttributes,
} from "../../shared/field-types.ts";
import type { FieldEditor, FieldSchema } from "../../shared/schema.ts";

export type TextFieldEditor = Extract<
  FieldEditor,
  "text" | "textarea" | "markdown" | "href" | "slug" | "color" | "icon" | "image"
>;

export type GeneratedFieldEditorAdapter =
  | ({
      kind: "text";
      field: Extract<FieldSchema, { type: "text" }>;
      editor: TextFieldEditor;
    } & GeneratedFieldEditorAdapterFacts)
  | ({
      kind: "boolean";
      field: Extract<FieldSchema, { type: "boolean" }>;
    } & GeneratedFieldEditorAdapterFacts)
  | ({
      kind: "date";
      field: Extract<FieldSchema, { type: "date" }>;
    } & GeneratedFieldEditorAdapterFacts)
  | ({
      kind: "number";
      field: Extract<FieldSchema, { type: "number" }>;
    } & GeneratedFieldEditorAdapterFacts)
  | ({
      kind: "enum";
      field: Extract<FieldSchema, { type: "enum" }>;
    } & GeneratedFieldEditorAdapterFacts)
  | ({
      kind: "reference";
      field: Extract<FieldSchema, { type: "reference" }>;
    } & GeneratedFieldEditorAdapterFacts);

type GeneratedFieldEditorAdapterFacts = {
  control: FieldEditorControl;
  createDefaultChecked: boolean;
  createDefaultValue: string | undefined;
  inputAttributes: FieldInputAttributes;
  required: boolean;
};

export function selectGeneratedFieldEditorAdapter(
  field: FieldSchema,
  editor: FieldEditor,
): GeneratedFieldEditorAdapter {
  if (!getFieldTypeBehavior(field).editors.includes(editor)) {
    throw new Error(`Editor "${editor}" is not valid for field type "${field.type}".`);
  }

  const facts = selectGeneratedFieldEditorAdapterFacts(field, editor);

  if (field.type === "boolean") {
    return { kind: "boolean", field, ...facts };
  }

  if (field.type === "date") {
    return { kind: "date", field, ...facts };
  }

  if (field.type === "number") {
    return { kind: "number", field, ...facts };
  }

  if (field.type === "enum") {
    return { kind: "enum", field, ...facts };
  }

  if (field.type === "reference") {
    return { kind: "reference", field, ...facts };
  }

  if (!isTextFieldEditor(editor)) {
    throw new Error(`Editor "${editor}" is not valid for field type "text".`);
  }

  return { kind: "text", field, editor, ...facts };
}

function selectGeneratedFieldEditorAdapterFacts(
  field: FieldSchema,
  editor: FieldEditor,
): GeneratedFieldEditorAdapterFacts {
  const control = fieldEditorControl(field, editor);
  const hasDefault = fieldHasCreateDefault(field);
  const defaultValue = hasDefault ? fieldCreateDefaultValue(field) : undefined;
  const createDefaultValue =
    hasDefault || control.kind === "reference" || control.kind === "select"
      ? fieldValueToInputValue(field, defaultValue)
      : undefined;

  return {
    control,
    createDefaultChecked: defaultValue === true,
    createDefaultValue:
      createDefaultValue === "" && field.required ? undefined : createDefaultValue,
    inputAttributes: fieldInputAttributes(field),
    required: field.required,
  };
}

function isTextFieldEditor(editor: FieldEditor): editor is TextFieldEditor {
  return (
    editor === "text" ||
    editor === "textarea" ||
    editor === "markdown" ||
    editor === "href" ||
    editor === "slug" ||
    editor === "color" ||
    editor === "icon" ||
    editor === "image"
  );
}
