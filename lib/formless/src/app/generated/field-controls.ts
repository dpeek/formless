import {
  fieldCreateDefaultValue,
  fieldEditorControl,
  fieldHasCreateDefault,
  fieldInputAttributes,
  fieldSupportsEditor,
  fieldValueToInputValue,
  type FieldEditorControl,
  type FieldInputAttributes,
} from "@dpeek/formless-schema";
import type { FieldEditor, FieldSchema } from "@dpeek/formless-schema";

export type TextFieldEditor = Extract<
  FieldEditor,
  "text" | "textarea" | "markdown" | "href" | "slug" | "color" | "icon" | "media"
>;

export type GeneratedFieldControlKind =
  | "checkbox"
  | "color"
  | "date"
  | "icon"
  | "markdown"
  | "media"
  | "number"
  | "reference"
  | "select"
  | "text"
  | "textarea";

export type GeneratedFieldControl =
  | ({
      kind: "text";
      field: Extract<FieldSchema, { type: "text" }>;
      editor: TextFieldEditor;
    } & GeneratedFieldControlFacts)
  | ({
      kind: "boolean";
      field: Extract<FieldSchema, { type: "boolean" }>;
    } & GeneratedFieldControlFacts)
  | ({
      kind: "date";
      field: Extract<FieldSchema, { type: "date" }>;
    } & GeneratedFieldControlFacts)
  | ({
      kind: "number";
      field: Extract<FieldSchema, { type: "number" }>;
    } & GeneratedFieldControlFacts)
  | ({
      kind: "enum";
      field: Extract<FieldSchema, { type: "enum" }>;
    } & GeneratedFieldControlFacts)
  | ({
      kind: "reference";
      field: Extract<FieldSchema, { type: "reference" }>;
    } & GeneratedFieldControlFacts);

export type GeneratedFieldControlFacts = {
  control: FieldEditorControl;
  controlKind: GeneratedFieldControlKind;
  createDefaultChecked: boolean;
  createDefaultValue: string | undefined;
  editor: FieldEditor;
  inputAttributes: FieldInputAttributes;
  label: string;
  required: boolean;
};

export function selectGeneratedFieldControl({
  editor,
  field,
  label,
}: {
  editor: FieldEditor;
  field: FieldSchema;
  label: string;
}): GeneratedFieldControl {
  if (!fieldSupportsEditor(field, editor)) {
    throw new Error(`Editor "${editor}" is not valid for field type "${field.type}".`);
  }

  const facts = selectGeneratedFieldControlFacts(field, editor, label);

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

  return { kind: "text", field, ...facts, editor };
}

function selectGeneratedFieldControlFacts(
  field: FieldSchema,
  editor: FieldEditor,
  label: string,
): GeneratedFieldControlFacts {
  const control = fieldEditorControl(field, editor);
  const hasDefault = fieldHasCreateDefault(field);
  const defaultValue = hasDefault ? fieldCreateDefaultValue(field) : undefined;
  const createDefaultValue =
    hasDefault || control.kind === "reference" || control.kind === "select"
      ? fieldValueToInputValue(field, defaultValue)
      : undefined;

  return {
    control,
    controlKind: selectGeneratedFieldControlKind(field, editor, control),
    createDefaultChecked: defaultValue === true,
    createDefaultValue:
      createDefaultValue === "" && field.required ? undefined : createDefaultValue,
    editor,
    inputAttributes: fieldInputAttributes(field),
    label,
    required: field.required,
  };
}

function selectGeneratedFieldControlKind(
  field: FieldSchema,
  editor: FieldEditor,
  control: FieldEditorControl,
): GeneratedFieldControlKind {
  if (field.type === "boolean") {
    return "checkbox";
  }

  if (field.type === "date" || (control.kind === "input" && control.inputType === "date")) {
    return "date";
  }

  if (field.type === "number") {
    return "number";
  }

  if (field.type === "enum") {
    return "select";
  }

  if (field.type === "reference") {
    return "reference";
  }

  if (editor === "media" || control.kind === "mediaUpload") {
    return "media";
  }

  if (editor === "icon" || field.format === "icon" || control.kind === "icon") {
    return "icon";
  }

  if (editor === "markdown") {
    return "markdown";
  }

  if (editor === "color") {
    return "color";
  }

  if (control.kind === "textarea") {
    return "textarea";
  }

  return "text";
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
    editor === "media"
  );
}
