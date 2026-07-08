export type AstryxFieldSurface =
  | "create"
  | "record"
  | "table-cell"
  | "detail"
  | "site-authoring"
  | "public-action";

export type AstryxFieldDensity = "compact" | "balanced" | "comfortable";

export type AstryxFieldAccessMode =
  | "editable"
  | "read-only"
  | "disabled"
  | "system"
  | "state-machine";

export type AstryxFieldKind =
  | "text"
  | "long-text"
  | "number"
  | "date"
  | "boolean"
  | "enum"
  | "reference"
  | "markdown"
  | "icon"
  | "source-icon"
  | "color"
  | "image"
  | "media";

export type AstryxFieldCommitPolicy = "immediate" | "field" | "submit";

export type AstryxFieldValue = string | number | boolean | null;

export type AstryxFieldOption = {
  value: string;
  label: string;
  detail?: string;
  color?: string;
  icon?: string;
  source?: string;
  mediaPreviewUrl?: string;
  mediaAlt?: string;
  isDisabled?: boolean;
  isMissing?: boolean;
};

export type AstryxFieldPresentation = {
  placeholder?: string;
  compactLabel?: string;
  maxLines?: number;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  format?: "plain" | "email" | "phone" | "href" | "currency" | "percent";
  iconName?: string;
  sourceIcon?: string;
  colorValue?: string;
  mediaPreviewUrl?: string;
  mediaAlt?: string;
  accept?: string;
};

export type AstryxFieldError = {
  id: string;
  message: string;
  severity?: "error" | "warning";
};

export type AstryxFieldPendingState = {
  isPending: boolean;
  label?: string;
};

export type AstryxFieldBaseData = {
  id: string;
  name: string;
  label: string;
  description?: string;
  labelTooltip?: string;
  isRequired?: boolean;
  surface: AstryxFieldSurface;
  density: AstryxFieldDensity;
  accessMode: AstryxFieldAccessMode;
  kind: AstryxFieldKind;
  options?: readonly AstryxFieldOption[];
  presentation?: AstryxFieldPresentation;
  pending?: AstryxFieldPendingState;
  errors?: readonly AstryxFieldError[];
};

export type AstryxFieldDisplayData = AstryxFieldBaseData & {
  mode: "display";
  value: AstryxFieldValue;
  displayValue: string;
};

export type AstryxFieldEditorData = AstryxFieldBaseData & {
  mode: "editor";
  draftValue: AstryxFieldValue;
  committedValue?: AstryxFieldValue;
  committedDisplayValue: string;
  commitPolicy: AstryxFieldCommitPolicy;
};

export type AstryxFieldData = AstryxFieldDisplayData | AstryxFieldEditorData;

export type AstryxFieldPickerKind = "reference" | "icon" | "image" | "media";

export type AstryxFieldIntentHandlers = {
  onDraftChange?: (fieldId: string, value: AstryxFieldValue) => void;
  onCommit?: (fieldId: string, value: AstryxFieldValue) => void;
  onRevert?: (fieldId: string) => void;
  onOpenPicker?: (fieldId: string, picker: AstryxFieldPickerKind, value?: string) => void;
  onUploadFile?: (fieldId: string, file: File) => void;
};
