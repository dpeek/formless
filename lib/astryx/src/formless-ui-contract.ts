import type {
  CreateDefaultValueSchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldEditorControl,
  FieldInputAttributes,
  FieldPresentationSchema,
  FieldRef,
  FieldSchema,
  FieldValue,
  FieldVisibilityConditionSchema,
  GeneratedFieldDraft,
  GeneratedFieldDraftError,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
  QueryEvaluationContext,
  RecordValues,
  StateMachineSchema,
  StateMachineTransitionSchema,
  TableColumnFormat,
} from "@dpeek/formless-schema";

export type FormlessUiFieldSurface =
  | "create"
  | "record"
  | "table-cell"
  | "detail"
  | "operation";

export type FormlessUiFieldMode = "display" | "editor";

export type FormlessUiRecordFieldDensity = "default" | "compact";

export type FormlessUiRecordFieldPresentation = "default" | "heading";

export type FormlessUiFieldAccess =
  | {
      kind: "editable";
      canPatch: true;
      writable: true;
    }
  | {
      kind: "disabled";
      canPatch: false;
      writable: true;
      disabledReason?: string;
    }
  | {
      kind: "readOnly";
      writable: false;
    }
  | {
      kind: "system";
      fieldRef: Extract<FieldRef, { kind: "system" }>;
    }
  | {
      kind: "stateMachine";
      writable: false;
    };

export type FormlessUiFieldCommitPolicy = FieldCommitPolicy | "submit";

export type FormlessUiFieldIdentity = {
  fieldName: string;
  fieldRef?: FieldRef;
  inputName?: string;
  recordId?: string;
};

export type FormlessUiFieldMetadata = {
  editor: FieldEditor;
  field: FieldSchema;
  label: string;
  required: boolean;
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
};

export type FormlessUiValueUnitField = {
  unitFieldName: string;
  unitField: Extract<FieldSchema, { type: "enum" }>;
};

export type FormlessUiStateMachineField = {
  fieldName: string;
  machineName: string;
  machine: StateMachineSchema;
  initialState: string;
  terminalStates: string[];
};

export type FormlessUiFieldConfig = FormlessUiFieldIdentity &
  FormlessUiFieldMetadata & {
    commit: FormlessUiFieldCommitPolicy;
    format?: TableColumnFormat;
    stateMachine?: FormlessUiStateMachineField;
    suffix?: string;
    valueUnit?: FormlessUiValueUnitField;
    writable?: boolean;
  };

export type FormlessUiCreateDefault = {
  fieldName: string;
  field: FieldSchema;
  value: CreateDefaultValueSchema;
};

export type FormlessUiFieldControlKind =
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

export type FormlessUiTextFieldEditor = Extract<
  FieldEditor,
  "color" | "href" | "icon" | "image" | "markdown" | "media" | "slug" | "text" | "textarea"
>;

export type FormlessUiFieldControlFacts = {
  control: FieldEditorControl;
  controlKind: FormlessUiFieldControlKind;
  createDefaultChecked: boolean;
  createDefaultValue: string | undefined;
  editor: FieldEditor;
  inputAttributes: FieldInputAttributes;
  label: string;
  required: boolean;
};

export type FormlessUiFieldControl =
  | ({
      kind: "text";
      field: Extract<FieldSchema, { type: "text" }>;
      editor: FormlessUiTextFieldEditor;
    } & FormlessUiFieldControlFacts)
  | ({
      kind: "boolean";
      field: Extract<FieldSchema, { type: "boolean" }>;
    } & FormlessUiFieldControlFacts)
  | ({
      kind: "date";
      field: Extract<FieldSchema, { type: "date" }>;
    } & FormlessUiFieldControlFacts)
  | ({
      kind: "number";
      field: Extract<FieldSchema, { type: "number" }>;
    } & FormlessUiFieldControlFacts)
  | ({
      kind: "enum";
      field: Extract<FieldSchema, { type: "enum" }>;
    } & FormlessUiFieldControlFacts)
  | ({
      kind: "reference";
      field: Extract<FieldSchema, { type: "reference" }>;
    } & FormlessUiFieldControlFacts);

export type FormlessUiRecordFieldRendererKind =
  | "autosize-text"
  | "checkbox"
  | "completion-checkbox"
  | "color"
  | "date"
  | "enum"
  | "enum-icon"
  | "icon"
  | "image"
  | "markdown"
  | "media"
  | "number"
  | "quiet-date"
  | "reference"
  | "text"
  | "textarea"
  | "value-unit";

export type FormlessUiFieldError = GeneratedFieldDraftError & {
  message: string;
};

export type FormlessUiFieldPending = {
  isPending: boolean;
  label?: string;
};

export type FormlessUiReferenceOption = {
  id: string;
  label: string;
  missing?: boolean;
};

export type FormlessUiMediaAssetOption = {
  height?: number;
  href: string;
  id: string;
  label: string;
  width?: number;
};

export type FormlessUiMediaEditorMode = "asset" | "url";

export type FormlessUiMediaUploadPatchFields = {
  heightFieldName?: string;
  hrefFieldName?: string;
  mediaAssetFieldName?: string;
  widthFieldName?: string;
};

export type FormlessUiMediaAuthoring = {
  mediaEditorMode: FormlessUiMediaEditorMode;
  mediaPreviewHref?: string;
  uploadEnabled: boolean;
  uploadPatchFields: FormlessUiMediaUploadPatchFields;
};

export type FormlessUiFieldPresentationColorIntent =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export type FormlessUiFieldPresentationColor = {
  intent: FormlessUiFieldPresentationColorIntent;
  known: boolean;
  token?: string;
};

export type FormlessUiFieldPresentationIcon = {
  kind: "svg";
  source: string;
};

export type FormlessUiEnumValuePresentation = {
  color: FormlessUiFieldPresentationColor;
  icon?: FormlessUiFieldPresentationIcon;
  label: string;
};

export type FormlessUiEnumOption = {
  label: string;
  presentation: FormlessUiEnumValuePresentation;
  value: string;
  missing?: boolean;
};

export type FormlessUiFieldOptions = {
  enumOptions?: readonly FormlessUiEnumOption[];
  referenceOptions?: readonly FormlessUiReferenceOption[];
  mediaAssetOptions?: readonly FormlessUiMediaAssetOption[];
  missingReferenceValue?: string | null;
  unknownEnumValue?: string | null;
};

export type FormlessUiFieldFormatting = {
  displayValue?: string;
  enumValuePresentation?: FormlessUiEnumValuePresentation;
  format?: TableColumnFormat;
  suffix?: string;
};

export type FormlessUiStateTransitionAvailability = {
  valid: boolean;
  disabledReason?: string;
};

export type FormlessUiStateTransitionOperation = {
  operationName: string;
  label: string;
  machineName: string;
  machine: StateMachineSchema;
  transitionName: string;
  transition: StateMachineTransitionSchema;
  fieldName: string;
  field: Extract<FieldSchema, { type: "enum" }>;
  availability?: FormlessUiStateTransitionAvailability;
  pending?: FormlessUiFieldPending;
};

export type FormlessUiStateMachineFacts = {
  currentValue: FieldValue | undefined;
  initialState: string;
  stateMachine: FormlessUiStateMachineField;
  terminal: boolean;
  transitions?: readonly FormlessUiStateTransitionOperation[];
};

export type FormlessUiBaseField = FormlessUiFieldConfig & {
  access: FormlessUiFieldAccess;
  control: FormlessUiFieldControl;
  errors?: readonly FormlessUiFieldError[];
  options?: FormlessUiFieldOptions;
  pending?: FormlessUiFieldPending;
  stateMachineFacts?: FormlessUiStateMachineFacts;
  surface: FormlessUiFieldSurface;
};

export type FormlessUiDisplayField = FormlessUiBaseField & {
  mode: "display";
  value: FieldValue | undefined;
  formatting: FormlessUiFieldFormatting & {
    displayValue: string;
  };
};

export type FormlessUiCreateField = FormlessUiBaseField & {
  surface: "create";
  mode: "editor";
  commit: "submit";
  draftInput?: GeneratedFieldDraftInput;
  value: FieldValue | undefined;
};

export type FormlessUiOperationInputField = FormlessUiBaseField & {
  surface: "operation";
  mode: "editor";
  commit: "submit";
  input: PublicSafeOperationInputField;
  inputName: string;
  draftInput?: GeneratedFieldDraftInput;
  value: FieldValue | undefined;
};

export type FormlessUiRecordFieldDrafts = {
  draft: string;
  draftInput?: GeneratedFieldDraftInput;
  recordValue: FieldValue | undefined;
  unitDraft?: string;
  unitDraftInput?: GeneratedFieldDraftInput;
  unitRecordValue?: FieldValue | undefined;
};

export type FormlessUiRecordField = FormlessUiBaseField & {
  surface: "detail" | "record" | "table-cell";
  mode: "editor";
  commit: FieldCommitPolicy;
  density: FormlessUiRecordFieldDensity;
  drafts: FormlessUiRecordFieldDrafts;
  formatting: FormlessUiFieldFormatting;
  media?: FormlessUiMediaAuthoring;
  presentationMode: FormlessUiRecordFieldPresentation;
  rendererKind: FormlessUiRecordFieldRendererKind;
};

export type FormlessUiField =
  | FormlessUiCreateField
  | FormlessUiDisplayField
  | FormlessUiOperationInputField
  | FormlessUiRecordField;

export type FormlessUiFieldSession = {
  canSubmit?: boolean;
  configurationErrors?: readonly { inputName: string; message: string }[];
  defaults?: readonly FormlessUiCreateDefault[];
  defaultsResolved?: boolean;
  draft: GeneratedFieldDraft;
  fieldErrors: Record<string, FormlessUiFieldError>;
  queryContext?: QueryEvaluationContext;
  values: Partial<RecordValues>;
  visibleFieldNames: readonly string[];
};

export type FormlessUiValueUnitCommit = {
  fieldDraftInput: GeneratedFieldDraftInput;
  unitDraftInput: GeneratedFieldDraftInput;
};

export type FormlessUiOperationInvocationSource =
  | "button"
  | "confirmationDialog"
  | "menuItem"
  | "submitButton";

export type FormlessUiFieldIntent =
  | {
      type: "createDraftChange";
      fieldName: string;
      fieldValue: GeneratedFieldDraftInput;
    }
  | {
      type: "operationDraftChange";
      inputName: string;
      inputValue: GeneratedFieldDraftInput | undefined;
    }
  | {
      type: "recordDraftChange";
      fieldName: string;
      fieldValue: GeneratedFieldDraftInput | undefined;
    }
  | {
      type: "recordEditorDraftChange";
      fieldName: string;
      value: string;
    }
  | {
      type: "recordDraftRevert";
      fieldName: string;
    }
  | {
      type: "recordValueCommit";
      fieldName: string;
      value: FieldValue;
    }
  | {
      type: "recordValueUnitCommit";
      fieldName: string;
      unitFieldName: string;
      commit: FormlessUiValueUnitCommit;
    }
  | {
      type: "fieldErrorChange";
      fieldName: string;
      message: string | null;
    }
  | {
      type: "iconDialogDraftChange";
      fieldName: string;
      value: string;
    }
  | {
      type: "iconDialogOpenChange";
      fieldName: string;
      open: boolean;
    }
  | {
      type: "iconDialogCancel";
      fieldName: string;
    }
  | {
      type: "iconDialogSave";
      fieldName: string;
    }
  | {
      type: "mediaAssetSelect";
      assetId: string;
      fieldName: string;
    }
  | {
      type: "mediaFileSelect";
      fieldName: string;
      file: File | undefined;
    }
  | {
      type: "stateTransitionInvoke";
      fieldName: string;
      operationName: string;
      recordId: string;
      source: Extract<FormlessUiOperationInvocationSource, "button" | "menuItem">;
      transitionName: string;
    };

export type FormlessUiFieldIntentHandler = (
  intent: FormlessUiFieldIntent,
) => Promise<void> | void;

export type FormlessUiOperationControlContract = {
  kind: "operationControl";
  // Future work: executable operation bindings belong in a platform control contract, not field rendering.
};

export type FormlessUiFieldSetContract = {
  kind: "fieldSet";
  fields: readonly FormlessUiField[];
  // Future work: union discriminator state and visible-field reasoning belong at the field-set boundary.
};

export type FormlessUiTableContract = {
  kind: "table";
  fields: readonly FormlessUiField[];
  operationControls?: readonly FormlessUiOperationControlContract[];
};

export type FormlessUiCreateDialogContract = {
  kind: "createDialog";
  fields: readonly FormlessUiCreateField[];
  fieldSet?: FormlessUiFieldSetContract;
};

export type FormlessUiItemDetailContract = {
  kind: "itemDetail";
  fields: readonly FormlessUiField[];
  operationControls?: readonly FormlessUiOperationControlContract[];
};

export type FormlessUiActionFormContract = {
  kind: "actionForm";
  fields: readonly FormlessUiOperationInputField[];
};
