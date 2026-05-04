import { getFieldTypeBehavior } from "../../shared/field-types.ts";
import type { FieldEditor, FieldSchema } from "../../shared/schema.ts";

export type GeneratedFieldEditorAdapter =
  | { kind: "text"; field: Extract<FieldSchema, { type: "text" }> }
  | { kind: "boolean"; field: Extract<FieldSchema, { type: "boolean" }> }
  | { kind: "date"; field: Extract<FieldSchema, { type: "date" }> }
  | { kind: "number"; field: Extract<FieldSchema, { type: "number" }> }
  | { kind: "enum"; field: Extract<FieldSchema, { type: "enum" }> }
  | { kind: "reference"; field: Extract<FieldSchema, { type: "reference" }> };

export function selectGeneratedFieldEditorAdapter(
  field: FieldSchema,
  editor: FieldEditor,
): GeneratedFieldEditorAdapter {
  if (!getFieldTypeBehavior(field).editors.includes(editor)) {
    throw new Error(`Editor "${editor}" is not valid for field type "${field.type}".`);
  }

  if (field.type === "boolean") {
    return { kind: "boolean", field };
  }

  if (field.type === "date") {
    return { kind: "date", field };
  }

  if (field.type === "number") {
    return { kind: "number", field };
  }

  if (field.type === "enum") {
    return { kind: "enum", field };
  }

  if (field.type === "reference") {
    return { kind: "reference", field };
  }

  return { kind: "text", field };
}
