import type { FieldEditor, FieldSchema } from "../../shared/schema.ts";
import {
  selectGeneratedFieldControl,
  type GeneratedFieldControl,
  type TextFieldEditor,
} from "./field-controls.ts";

export type { TextFieldEditor };
export type GeneratedFieldEditorAdapter = GeneratedFieldControl;

export function selectGeneratedFieldEditorAdapter(
  field: FieldSchema,
  editor: FieldEditor,
): GeneratedFieldEditorAdapter {
  return selectGeneratedFieldControl({ editor, field, label: "" });
}
