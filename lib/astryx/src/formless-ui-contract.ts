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

export type FormlessUiFieldSurface = "create" | "record" | "table-cell" | "detail" | "operation";

export type FormlessUiFieldMode = "display" | "editor";

export type FormlessUiFieldDensity = "default" | "compact";

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
  clearable: boolean;
  options: readonly FormlessUiValueUnitOption[];
  required: boolean;
  unitFieldName: string;
  unitField: Extract<FieldSchema, { type: "enum" }>;
};

export type FormlessUiValueUnitOption = {
  label: string;
  status: "declared" | "undeclaredCurrent";
  value: string;
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
};

export type FormlessUiReferenceValueStatus =
  | {
      kind: "resolved";
      value: string;
    }
  | {
      kind: "unset";
    }
  | {
      kind: "missing";
      value: string;
    };

export type FormlessUiReferenceFacts =
  | {
      clearable: boolean;
      kind: "editor";
      valueStatus: FormlessUiReferenceValueStatus;
    }
  | {
      kind: "display";
      valueStatus: FormlessUiReferenceValueStatus;
    };

export type FormlessUiMediaAssetOption = {
  height?: number;
  href: string;
  id: string;
  label: string;
  missing?: boolean;
  width?: number;
};

export type FormlessUiMediaEditorMode = "asset" | "url";

export type FormlessUiMediaUploadPatchFields = {
  heightFieldName?: string;
  hrefFieldName?: string;
  mediaAssetFieldName?: string;
  widthFieldName?: string;
};

export type FormlessUiMissingMediaAsset = {
  assetId: string;
  reason?: string;
};

export type FormlessUiMediaPresentation = {
  missingSelectedAsset?: FormlessUiMissingMediaAsset;
  previewHref?: string;
  selectedAssetId?: string;
  selectedUrl?: string;
};

export type FormlessUiMediaPickerFacts = FormlessUiMediaPresentation & {
  fileSelectEnabled: boolean;
  uploadEnabled: boolean;
  uploadPatchFields: FormlessUiMediaUploadPatchFields;
};

export type FormlessUiMediaAuthoring = FormlessUiMediaPickerFacts & {
  accept?: string;
  maxSize?: number;
  mediaEditorMode: FormlessUiMediaEditorMode;
  mediaPreviewHref?: string;
};

export type FormlessUiIconOption = {
  custom?: boolean;
  group?: string;
  id: string;
  label: string;
  missing?: boolean;
  source: string;
};

export type FormlessUiIconPickerSelection =
  | {
      kind: "empty";
    }
  | {
      kind: "option";
      optionId: string;
      source: string;
    }
  | {
      kind: "customSource";
      source: string;
    };

export type FormlessUiIconPickerFacts = {
  canCancel: boolean;
  canSave: boolean;
  customParseError?: string;
  dialogDraft: string;
  dialogOpen: boolean;
  emptyValue: boolean;
  previewSource: string;
  savePending?: boolean;
  selection: FormlessUiIconPickerSelection;
  valueMode: "svgSource";
};

export type FormlessUiFieldPresentationColorIntent = "neutral" | "success" | "warning" | "danger";

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
  iconKnown: boolean;
  iconToken?: string;
  label: string;
};

export type FormlessUiEnumOption = {
  label: string;
  presentation: FormlessUiEnumValuePresentation;
  status: "declared";
  value: string;
};

export type FormlessUiEnumValueStatus =
  | {
      kind: "declared";
      value: string;
    }
  | {
      kind: "unset";
    }
  | {
      kind: "undeclared";
      value: string;
    };

export type FormlessUiEnumFacts =
  | {
      clearable: boolean;
      kind: "editor";
      listContent: "icon" | "label" | "both";
      placeholder?: string;
      style: "plain" | "rich";
      triggerContent: "label" | "both";
      valueStatus: FormlessUiEnumValueStatus;
    }
  | {
      content: "icon" | "label";
      kind: "display";
      valueStatus: FormlessUiEnumValueStatus;
    };

export type FormlessUiFieldOptions = {
  enumOptions?: readonly FormlessUiEnumOption[];
  iconOptions?: readonly FormlessUiIconOption[];
  referenceOptions?: readonly FormlessUiReferenceOption[];
  mediaAssetOptions?: readonly FormlessUiMediaAssetOption[];
};

export type FormlessUiTemporalDisplay =
  | {
      kind: "date";
      value: string;
    }
  | {
      kind: "dateTime";
      value: string;
    };

export type FormlessUiFieldFormatting = {
  displayValue?: string;
  enumValuePresentation?: FormlessUiEnumValuePresentation;
  format?: TableColumnFormat;
  suffix?: string;
  temporal?: FormlessUiTemporalDisplay;
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

export type FormlessUiStateMachineInteraction =
  | {
      kind: "display";
    }
  | {
      kind: "transitions";
      invocationSource: Extract<FormlessUiOperationInvocationSource, "menuItem">;
      transitions: readonly FormlessUiStateTransitionOperation[];
    };

export type FormlessUiStateMachineValueStatus =
  | {
      kind: "declared";
      value: string;
    }
  | {
      kind: "unset";
      message: string;
    }
  | {
      kind: "undeclared";
      message: string;
      value: string;
    };

export type FormlessUiStateMachineFacts = {
  currentValue: FieldValue | undefined;
  initialState: string;
  interaction: FormlessUiStateMachineInteraction;
  stateMachine: FormlessUiStateMachineField;
  terminal: boolean;
  valueStatus: FormlessUiStateMachineValueStatus;
};

export type FormlessUiColorValue =
  | {
      kind: "hex";
      value: string;
    }
  | {
      kind: "unavailable";
    };

export type FormlessUiColorFacts = {
  picker: FormlessUiColorValue;
  swatch: FormlessUiColorValue;
};

export type FormlessUiBaseField = FormlessUiFieldConfig & {
  access: FormlessUiFieldAccess;
  color?: FormlessUiColorFacts;
  control: FormlessUiFieldControl;
  enum?: FormlessUiEnumFacts;
  errors?: readonly FormlessUiFieldError[];
  icon?: FormlessUiIconPickerFacts;
  labelVisibility: "hidden" | "visible";
  options?: FormlessUiFieldOptions;
  pending?: FormlessUiFieldPending;
  reference?: FormlessUiReferenceFacts;
  stateMachineFacts?: FormlessUiStateMachineFacts;
  surface: FormlessUiFieldSurface;
};

export type FormlessUiDisplayField = FormlessUiBaseField & {
  density: FormlessUiFieldDensity;
  mode: "display";
  media?: FormlessUiMediaPresentation;
  value: FieldValue | undefined;
  formatting: FormlessUiFieldFormatting & {
    displayValue: string;
  };
};

export type FormlessUiCreateField = FormlessUiBaseField & {
  surface: "create";
  mode: "editor";
  commit: "submit";
  density: FormlessUiFieldDensity;
  draftInput?: GeneratedFieldDraftInput;
  media?: FormlessUiMediaAuthoring;
  value: FieldValue | undefined;
};

export type FormlessUiOperationInputField = FormlessUiBaseField & {
  surface: "operation";
  mode: "editor";
  commit: "submit";
  density: FormlessUiFieldDensity;
  input: PublicSafeOperationInputField;
  inputName: string;
  draftInput?: GeneratedFieldDraftInput;
  media?: FormlessUiMediaAuthoring;
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
  density: FormlessUiFieldDensity;
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

export type FormlessUiSemanticIconId =
  | "add"
  | "archive"
  | "calendar"
  | "close"
  | "confirm"
  | "copy"
  | "delete"
  | "disclosure"
  | "disclosureDown"
  | "dragHandle"
  | "edit"
  | "indeterminate"
  | "loading"
  | "menu"
  | "next"
  | "previous"
  | "publish"
  | "remove"
  | "select"
  | "selectDown"
  | "sort"
  | "sync"
  | "treeDisclosure"
  | "upload";

export type FormlessUiActionIntent = "neutral" | "primary" | "success" | "warning" | "danger";

export type FormlessUiActionControlState = {
  disabled?: boolean;
  disabledReason?: string;
  errors?: readonly string[];
  pending?: FormlessUiFieldPending;
  selected?: boolean;
};

export type FormlessUiActionControlBase = FormlessUiActionControlState & {
  accessibilityLabel?: string;
  icon?: FormlessUiSemanticIconId;
  id: string;
  intent?: FormlessUiActionIntent;
  label: string;
};

export type FormlessUiActionTriggerIntent = {
  controlId: string;
  invocationSource: FormlessUiOperationInvocationSource;
  operationName?: string;
};

export type FormlessUiActionIntentHandler = (
  intent: FormlessUiActionTriggerIntent,
) => Promise<void> | void;

export type FormlessUiButtonContract = FormlessUiActionControlBase & {
  kind: "button";
};

export type FormlessUiActionTriggerContract = FormlessUiActionControlBase & {
  invocationSource: FormlessUiOperationInvocationSource;
  invoke: FormlessUiActionTriggerIntent;
  kind: "actionTrigger";
  operationName?: string;
};

export type FormlessUiMenuItemContract = FormlessUiActionControlBase & {
  invoke: FormlessUiActionTriggerIntent;
  invocationSource: Extract<FormlessUiOperationInvocationSource, "menuItem">;
  kind: "menuItem";
  operationName?: string;
};

export type FormlessUiMenuContract = {
  accessibilityLabel?: string;
  id: string;
  items: readonly FormlessUiMenuItemContract[];
  label?: string;
  trigger: FormlessUiButtonContract;
};

export type FormlessUiConfirmationPromptContract = {
  action: FormlessUiActionTriggerContract;
  cancel: FormlessUiButtonContract;
  description?: string;
  id: string;
  title: string;
};

export type FormlessUiCompactStatusIntent = "neutral" | "success" | "warning" | "danger" | "info";

export type FormlessUiCompactStatusContract = {
  accessibilityLabel?: string;
  detail?: string;
  id: string;
  intent: FormlessUiCompactStatusIntent;
  label: string;
  pending?: FormlessUiFieldPending;
};

export type FormlessUiSubmitHiddenInput = {
  disabled?: boolean;
  name: string;
  value: string;
};

export type FormlessUiSubmitBoundaryAdapter = {
  hiddenInputs: readonly FormlessUiSubmitHiddenInput[];
  id: string;
  kind: "submitBoundary";
};

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
      type: "recordDraftCommit";
      fieldName: string;
      fieldValue: GeneratedFieldDraftInput;
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
      source: Extract<FormlessUiOperationInvocationSource, "menuItem">;
      transitionName: string;
    };

export type FormlessUiFieldIntentHandler = (intent: FormlessUiFieldIntent) => Promise<void> | void;

export type FormlessUiOperationControlContract = {
  kind: "operationControl";
  confirmation?: FormlessUiConfirmationPromptContract;
  id: string;
  menu?: FormlessUiMenuContract;
  onInvoke?: FormlessUiActionIntentHandler;
  operationName?: string;
  status?: FormlessUiCompactStatusContract;
  trigger: FormlessUiActionTriggerContract;
};

export type FormlessUiFieldSetContract = {
  kind: "fieldSet";
  errors?: readonly string[];
  fields: readonly FormlessUiField[];
  id?: string;
  label?: string;
  submitBoundary?: FormlessUiSubmitBoundaryAdapter;
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
