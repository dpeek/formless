import type { RecordFieldConfig } from "../../client/views.ts";
import type { GeneratedFieldControl } from "./field-controls.ts";

export type GeneratedRecordFieldControlDensity = "default" | "compact";
export type GeneratedRecordFieldControlPresentation = "default" | "heading";

export type GeneratedRecordFieldRendererKind =
  | "autosize-text"
  | "checkbox"
  | "color"
  | "date"
  | "enum"
  | "icon"
  | "image"
  | "markdown"
  | "media"
  | "number"
  | "reference"
  | "text"
  | "textarea"
  | "value-unit";

export function selectGeneratedRecordFieldRendererKind({
  density = "default",
  fieldConfig,
  fieldControl,
  presentation = "default",
  showLabel = false,
}: {
  density?: GeneratedRecordFieldControlDensity;
  fieldConfig: RecordFieldConfig;
  fieldControl: GeneratedFieldControl;
  presentation?: GeneratedRecordFieldControlPresentation;
  showLabel?: boolean;
}): GeneratedRecordFieldRendererKind {
  if (fieldControl.controlKind === "checkbox") {
    return "checkbox";
  }

  if (fieldControl.kind === "enum") {
    return "enum";
  }

  if (fieldControl.kind === "reference") {
    return "reference";
  }

  if (fieldControl.controlKind === "icon") {
    return "icon";
  }

  if (fieldControl.controlKind === "image") {
    return "image";
  }

  if (fieldControl.controlKind === "media") {
    return "media";
  }

  if (fieldControl.controlKind === "markdown" && density !== "compact") {
    return "markdown";
  }

  if (fieldControl.control.kind === "textarea") {
    return "textarea";
  }

  if (fieldControl.controlKind === "color") {
    return "color";
  }

  if (
    selectAutosizeTextRecordRenderer({
      density,
      fieldConfig,
      fieldControl,
      presentation,
      showLabel,
    })
  ) {
    return "autosize-text";
  }

  if (fieldControl.controlKind === "date") {
    return "date";
  }

  if (fieldControl.controlKind === "number" && fieldConfig.valueUnit !== undefined) {
    return "value-unit";
  }

  if (fieldControl.controlKind === "number") {
    return "number";
  }

  return "text";
}

export function selectAutosizeTextRecordRenderer({
  fieldControl,
  presentation = "default",
}: {
  density?: GeneratedRecordFieldControlDensity;
  fieldConfig: RecordFieldConfig;
  fieldControl: GeneratedFieldControl;
  presentation?: GeneratedRecordFieldControlPresentation;
  showLabel?: boolean;
}) {
  if (
    fieldControl.kind !== "text" ||
    fieldControl.editor !== "text" ||
    fieldControl.controlKind !== "text"
  ) {
    return false;
  }

  if (presentation === "heading") {
    return true;
  }

  return false;
}
