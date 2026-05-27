import type { RecordFieldConfig } from "../../client/views.ts";
import type { FieldEditor, FieldSchema } from "../../shared/schema.ts";
import {
  selectGeneratedFieldControl,
  type GeneratedFieldControl,
  type TextFieldEditor,
} from "./field-controls.ts";
import {
  selectGeneratedRecordFieldRendererKind,
  type GeneratedRecordFieldControlDensity,
  type GeneratedRecordFieldControlPresentation,
  type GeneratedRecordFieldRendererKind,
} from "./record-field-renderer-model.ts";

export type { TextFieldEditor };
export type GeneratedFieldEditorAdapter = GeneratedFieldControl;
export type GeneratedRecordFieldAuthoringAdapter = {
  fieldControl: GeneratedFieldControl;
  rendererKind: GeneratedRecordFieldRendererKind;
};

export function selectGeneratedFieldEditorAdapter(
  field: FieldSchema,
  editor: FieldEditor,
): GeneratedFieldEditorAdapter {
  return selectGeneratedFieldControl({ editor, field, label: "" });
}

export function selectGeneratedRecordFieldAuthoringAdapter({
  density = "default",
  fieldConfig,
  label,
  presentation = "default",
  showLabel = false,
}: {
  density?: GeneratedRecordFieldControlDensity;
  fieldConfig: RecordFieldConfig;
  label: string;
  presentation?: GeneratedRecordFieldControlPresentation;
  showLabel?: boolean;
}): GeneratedRecordFieldAuthoringAdapter {
  const fieldControl = selectGeneratedFieldControl({
    editor: fieldConfig.editor,
    field: fieldConfig.field,
    label,
  });

  return {
    fieldControl,
    rendererKind: selectGeneratedRecordFieldRendererKind({
      density,
      fieldConfig,
      fieldControl,
      presentation,
      showLabel,
    }),
  };
}
