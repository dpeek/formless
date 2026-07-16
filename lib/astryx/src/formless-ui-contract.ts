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
  | "markdown"
  | "media"
  | "number"
  | "reference"
  | "select"
  | "text"
  | "textarea";

export type FormlessUiTextFieldEditor = Extract<
  FieldEditor,
  "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
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

export type FormlessUiMediaUploadPatchFields = {
  heightFieldName?: string;
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
};

export type FormlessUiMediaPickerFacts = FormlessUiMediaPresentation & {
  fileSelectEnabled: boolean;
  uploadEnabled: boolean;
  uploadPatchFields: FormlessUiMediaUploadPatchFields;
};

export type FormlessUiMediaAuthoring = FormlessUiMediaPickerFacts & {
  accept?: string;
  maxSize?: number;
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
  value: FieldValue | undefined;
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

export type FormlessUiButtonContent =
  | {
      kind: "label";
      label: string;
    }
  | {
      icon: FormlessUiSemanticIconId;
      kind: "iconAndLabel";
      label: string;
    }
  | {
      icon: FormlessUiSemanticIconId;
      kind: "iconOnly";
    };

export type FormlessUiButtonContract = FormlessUiActionControlState & {
  accessibilityLabel: string;
  content: FormlessUiButtonContent;
  density: "default" | "compact";
  id: string;
  kind: "button";
  prominence: "primary" | "secondary" | "quiet";
  type: "button" | "submit";
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

export type FormlessUiOperationExecutionStatus =
  | "committed"
  | "failed"
  | "idle"
  | "pending"
  | "replayed";

export type FormlessUiCompactStatusContract = {
  accessibilityLabel: string;
  detail: string;
  id: string;
  intent: FormlessUiCompactStatusIntent;
  kind: "compactStatus";
  label: string;
  pending?: FormlessUiFieldPending;
  status: FormlessUiOperationExecutionStatus;
};

export type FormlessUiOperationCountBadgeContract = {
  accessibilityLabel: string;
  count: number;
  id: string;
  kind: "countBadge";
};

export type FormlessUiOperationInvokeIntent = {
  controlId: string;
  invocationSource: Extract<FormlessUiOperationInvocationSource, "button" | "confirmationDialog">;
  type: "operationInvoke";
};

export type FormlessUiOperationConfirmationOpenChangeIntent = {
  controlId: string;
  open: boolean;
  type: "operationConfirmationOpenChange";
};

export type FormlessUiOperationPresentationIntent =
  | FormlessUiOperationConfirmationOpenChangeIntent
  | FormlessUiOperationInvokeIntent;

export type FormlessUiOperationPresentationIntentHandler = (
  intent: FormlessUiOperationPresentationIntent,
) => Promise<void> | void;

export type FormlessUiOperationButtonContract = Omit<FormlessUiButtonContract, "prominence"> & {
  countBadge?: FormlessUiOperationCountBadgeContract;
  intent: FormlessUiOperationPresentationIntent;
  prominence: "destructive" | "primary" | "quiet" | "secondary";
};

export type FormlessUiOperationDestructiveConfirmationContract = {
  action: FormlessUiOperationButtonContract;
  cancel: FormlessUiOperationButtonContract;
  closeIntent: FormlessUiOperationConfirmationOpenChangeIntent;
  description: string;
  id: string;
  kind: "destructiveConfirmation";
  open: boolean;
  title: string;
};

export type FormlessUiOperationProgressStepStatus =
  | "failed"
  | "pending"
  | "running"
  | "skipped"
  | "succeeded";

export type FormlessUiOperationProgressStepContract = {
  detail?: string;
  id: string;
  label: string;
  status: FormlessUiOperationProgressStepStatus;
};

export type FormlessUiOperationProgressContract = {
  detail?: string;
  id: string;
  kind: "operationProgress";
  steps: readonly FormlessUiOperationProgressStepContract[];
  title: string;
  updatedAt: number;
};

export type FormlessUiOperationActiveProgressContract = {
  detail?: string;
  label: string;
  stepId?: string;
};

export type FormlessUiOperationFeedbackEventContract = {
  activeProgress?: FormlessUiOperationActiveProgressContract;
  detail?: string;
  id: string;
  intent: FormlessUiCompactStatusIntent;
  kind: "operationFeedbackEvent";
  progress?: FormlessUiOperationProgressContract;
  status: Exclude<FormlessUiOperationExecutionStatus, "idle">;
  title: string;
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
  confirmation?: FormlessUiOperationDestructiveConfirmationContract;
  feedback?: FormlessUiOperationFeedbackEventContract;
  id: string;
  kind: "operationControl";
  progress?: FormlessUiOperationProgressContract;
  status: FormlessUiCompactStatusContract;
  trigger: FormlessUiOperationButtonContract;
};

export type FormlessUiFieldSetContract = {
  disabled: boolean;
  disabledReason?: string;
  kind: "fieldSet";
  errors?: readonly string[];
  fields: readonly FormlessUiField[];
  id: string;
  label?: string;
};

export type FormlessUiListDensity = "compact" | "default";

export type FormlessUiListReorderIntent = {
  actionId: string;
  direction: "bottom" | "down" | "top" | "up";
  itemId: string;
  listId: string;
  type: "listReorder";
};

export type FormlessUiListIntent = FormlessUiListReorderIntent;

export type FormlessUiListIntentHandler = (intent: FormlessUiListIntent) => Promise<void> | void;

export type FormlessUiListOperationActionContract = {
  control: FormlessUiOperationControlContract;
  kind: "operationAction";
  role: "command" | "delete" | "transition";
};

export type FormlessUiListActionContract = FormlessUiListOperationActionContract;

export type FormlessUiListActionGroupContract = {
  id: string;
  kind: "actionGroup";
  primary: readonly FormlessUiListActionContract[];
  secondary: readonly FormlessUiListActionContract[];
  secondaryAccessibilityLabel: string;
};

export type FormlessUiListOrderingActionContract = FormlessUiActionControlState & {
  direction: FormlessUiListReorderIntent["direction"];
  id: string;
  intent: FormlessUiListReorderIntent;
  label: string;
  structurallyAvailable: boolean;
};

export type FormlessUiListOrderingContract = {
  accessibilityLabel: string;
  actions: readonly FormlessUiListOrderingActionContract[];
  affordance: "reorder";
  kind: "ordering";
  pending: boolean;
};

export type FormlessUiListWarningContract = {
  id: string;
  items: readonly {
    code: string;
    message: string;
  }[];
  kind: "listWarning";
  title: string;
};

export type FormlessUiListItemAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type FormlessUiListItemContract = {
  accessibilityLabel: string;
  actions: FormlessUiListActionGroupContract;
  availability: FormlessUiListItemAvailability;
  fields: readonly FormlessUiField[];
  id: string;
  kind: "listItem";
  ordering?: FormlessUiListOrderingContract;
  warnings: readonly FormlessUiListWarningContract[];
};

export type FormlessUiListEmptyStateContract = {
  action?: FormlessUiListActionContract;
  description?: string;
  id: string;
  kind: "listEmptyState";
  title: string;
};

export type FormlessUiListEditingAvailability =
  | {
      enabled: true;
    }
  | {
      disabledReason: string;
      enabled: false;
    };

export type FormlessUiListContract = {
  accessibilityLabel: string;
  density: FormlessUiListDensity;
  editing: FormlessUiListEditingAvailability;
  emptyState?: FormlessUiListEmptyStateContract;
  id: string;
  items: readonly FormlessUiListItemContract[];
  kind: "list";
};

export type FormlessUiRecordResultDensity = "compact" | "default";

export type FormlessUiRecordResultAvailability =
  | {
      state: "ready";
    }
  | {
      state: "empty";
    }
  | {
      message: string;
      state: "unavailable";
    };

export type FormlessUiRecordResultEditingAvailability =
  | {
      enabled: true;
    }
  | {
      disabledReason: string;
      enabled: false;
    };

export type FormlessUiRecordResultSelectedRecordContract = {
  accessibilityLabel: string;
  id: string;
  kind: "recordResultRecord";
};

export type FormlessUiRecordResultFieldContract = {
  field: FormlessUiField;
  id: string;
  kind: "recordResultField";
};

export type FormlessUiRecordResultOperationActionContract = {
  control: FormlessUiOperationControlContract;
  kind: "operationAction";
  role: "command" | "delete" | "transition";
};

export type FormlessUiRecordResultActionContract = FormlessUiRecordResultOperationActionContract;

export type FormlessUiRecordResultActionGroupContract = {
  id: string;
  kind: "actionGroup";
  primary: readonly FormlessUiRecordResultActionContract[];
  secondary: readonly FormlessUiRecordResultActionContract[];
  secondaryAccessibilityLabel: string;
};

export type FormlessUiRecordResultWarningContract = {
  id: string;
  items: readonly {
    code: string;
    message: string;
  }[];
  kind: "recordResultWarning";
  title: string;
};

export type FormlessUiRecordResultEmptyStateContract = {
  action?: FormlessUiRecordResultActionContract;
  description?: string;
  id: string;
  kind: "recordResultEmptyState";
  title: string;
};

export type FormlessUiRecordResultFieldIntent = {
  fieldId: string;
  intent: FormlessUiFieldIntent;
  recordId: string;
  resultId: string;
  type: "recordResultFieldIntent";
};

export type FormlessUiRecordResultOperationIntent = {
  controlId: string;
  intent: FormlessUiOperationPresentationIntent;
  recordId: string;
  resultId: string;
  type: "recordResultOperationIntent";
};

export type FormlessUiRecordResultIntent =
  | FormlessUiRecordResultFieldIntent
  | FormlessUiRecordResultOperationIntent;

export type FormlessUiRecordResultIntentHandler = (
  intent: FormlessUiRecordResultIntent,
) => Promise<void> | void;

export type FormlessUiRecordResultContract = {
  accessibilityLabel: string;
  actions: FormlessUiRecordResultActionGroupContract;
  availability: FormlessUiRecordResultAvailability;
  density: FormlessUiRecordResultDensity;
  editing: FormlessUiRecordResultEditingAvailability;
  emptyState?: FormlessUiRecordResultEmptyStateContract;
  fields: readonly FormlessUiRecordResultFieldContract[];
  id: string;
  kind: "recordResult";
  selectedRecord?: FormlessUiRecordResultSelectedRecordContract;
  warnings: readonly FormlessUiRecordResultWarningContract[];
};

export type FormlessUiTableDensity = "compact" | "default";

export type FormlessUiTableColumnAlignment = "center" | "end" | "start";

export type FormlessUiTableColumnWidth = "auto" | "lg" | "md" | "sm" | "xs";

export type FormlessUiTableColumnContentRole =
  | "actions"
  | "computed"
  | "delete"
  | "field"
  | "ordering"
  | "reference";

export type FormlessUiTableColumnContract = {
  accessibilityLabel: string;
  alignment: FormlessUiTableColumnAlignment;
  contentRole: FormlessUiTableColumnContentRole;
  id: string;
  isRowHeader: boolean;
  kind: "tableColumn";
  label: string;
  labelVisibility: "hidden" | "visible";
  width: FormlessUiTableColumnWidth;
};

export type FormlessUiTableValueStatus =
  | {
      kind: "ready";
    }
  | {
      kind: "pending";
      label?: string;
    }
  | {
      kind: "invalid" | "unavailable";
      message: string;
    };

export type FormlessUiTableDisplayValueContract = {
  accessibilityLabel: string;
  displayValue: string;
  kind: "displayValue";
  status: FormlessUiTableValueStatus;
  suffix?: string;
  valueKind: "computed" | "reference" | "text";
};

export type FormlessUiTableFieldContentContract = {
  field: FormlessUiField;
  kind: "field";
  source: "record" | "referencedRecord";
};

export type FormlessUiTableUnavailableContentContract = {
  accessibilityLabel: string;
  kind: "unavailable";
  message: string;
};

export type FormlessUiTableActionInvokeIntent = {
  actionId: string;
  invocationSource: Extract<FormlessUiOperationInvocationSource, "button" | "menuItem">;
  operationName?: string;
  rowId: string;
  tableId: string;
  type: "tableActionInvoke";
};

export type FormlessUiTableEditDialogOpenChangeIntent = {
  dialogId: string;
  open: boolean;
  rowId: string;
  tableId: string;
  type: "tableEditDialogOpenChange";
};

export type FormlessUiTableReorderIntent = {
  actionId: string;
  direction: "bottom" | "down" | "top" | "up";
  rowId: string;
  tableId: string;
  type: "tableReorder";
};

export type FormlessUiTableIntent =
  | FormlessUiTableActionInvokeIntent
  | FormlessUiTableEditDialogOpenChangeIntent
  | FormlessUiTableReorderIntent;

export type FormlessUiTableIntentHandler = (intent: FormlessUiTableIntent) => Promise<void> | void;

export type FormlessUiTableInvokeActionContract = {
  intent: FormlessUiTableActionInvokeIntent;
  kind: "invokeAction";
  role: "command" | "transition";
  trigger: FormlessUiButtonContract;
};

export type FormlessUiTableOperationActionContract = {
  control: FormlessUiOperationControlContract;
  kind: "operationAction";
  role: "command" | "delete" | "transition";
};

export type FormlessUiTableEditDialogAvailableTargetContract = {
  actionGroup?: FormlessUiTableActionGroupContract;
  fieldSet: FormlessUiFieldSetContract;
  kind: "available";
};

export type FormlessUiTableEditDialogUnavailableTargetContract = {
  kind: "unavailable";
  message: string;
};

export type FormlessUiTableEditDialogContract = {
  close: FormlessUiButtonContract;
  description?: string;
  id: string;
  kind: "tableEditDialog";
  open: boolean;
  openChangeIntent: FormlessUiTableEditDialogOpenChangeIntent;
  target:
    | FormlessUiTableEditDialogAvailableTargetContract
    | FormlessUiTableEditDialogUnavailableTargetContract;
  targetKind: "reference" | "row";
  title: string;
};

export type FormlessUiTableEditActionContract = {
  dialog: FormlessUiTableEditDialogContract;
  kind: "editAction";
  openIntent: FormlessUiTableEditDialogOpenChangeIntent;
  trigger: FormlessUiButtonContract;
};

export type FormlessUiTableActionContract =
  | FormlessUiTableEditActionContract
  | FormlessUiTableInvokeActionContract
  | FormlessUiTableOperationActionContract;

export type FormlessUiTableActionGroupContract = {
  id: string;
  kind: "actionGroup";
  primary: readonly FormlessUiTableActionContract[];
  secondary: readonly FormlessUiTableActionContract[];
  secondaryAccessibilityLabel: string;
};

export type FormlessUiTableOrderingActionContract = FormlessUiActionControlState & {
  direction: FormlessUiTableReorderIntent["direction"];
  id: string;
  intent: FormlessUiTableReorderIntent;
  label: string;
};

export type FormlessUiTableOrderingContract = {
  accessibilityLabel: string;
  actions: readonly FormlessUiTableOrderingActionContract[];
  affordance: "reorder";
  kind: "ordering";
  pending: boolean;
};

export type FormlessUiTableCellContentContract =
  | FormlessUiTableActionGroupContract
  | FormlessUiTableDisplayValueContract
  | FormlessUiTableFieldContentContract
  | FormlessUiTableOrderingContract
  | FormlessUiTableUnavailableContentContract;

export type FormlessUiTableCellContract = {
  columnId: string;
  contents: readonly FormlessUiTableCellContentContract[];
  id: string;
  kind: "tableCell";
};

export type FormlessUiTableWarningContract = {
  id: string;
  items: readonly {
    code: string;
    message: string;
  }[];
  kind: "tableWarning";
  title: string;
};

export type FormlessUiTableRowContract = {
  accessibilityLabel: string;
  cells: readonly FormlessUiTableCellContract[];
  id: string;
  kind: "tableRow";
  warnings: readonly FormlessUiTableWarningContract[];
};

export type FormlessUiTableFooterCellContract =
  | {
      columnId: string;
      id: string;
      kind: "emptyFooterCell";
    }
  | {
      accessibilityLabel: string;
      columnId: string;
      displayValue: string;
      id: string;
      kind: "aggregateFooterCell";
      status: FormlessUiTableValueStatus;
      suffix?: string;
    };

export type FormlessUiTableFooterContract = {
  accessibilityLabel: string;
  cells: readonly FormlessUiTableFooterCellContract[];
  id: string;
  kind: "tableFooter";
};

export type FormlessUiTableEmptyStateContract = {
  action?: FormlessUiTableActionContract;
  description?: string;
  id: string;
  kind: "tableEmptyState";
  title: string;
};

export type FormlessUiTableEditingAvailability =
  | {
      enabled: true;
    }
  | {
      disabledReason: string;
      enabled: false;
    };

export type FormlessUiTableContract = {
  accessibilityLabel: string;
  columns: readonly FormlessUiTableColumnContract[];
  density: FormlessUiTableDensity;
  editing: FormlessUiTableEditingAvailability;
  emptyState?: FormlessUiTableEmptyStateContract;
  footer?: FormlessUiTableFooterContract;
  id: string;
  kind: "table";
  rows: readonly FormlessUiTableRowContract[];
};

export type FormlessUiCreateOpenIntent = {
  open: boolean;
  surfaceId: string;
  type: "createOpenChange";
};

export type FormlessUiCreateSubmitIntent = {
  surfaceId: string;
  type: "createSubmit";
};

export type FormlessUiCreateIntent = FormlessUiCreateOpenIntent | FormlessUiCreateSubmitIntent;

export type FormlessUiCreateIntentHandler = (
  intent: FormlessUiCreateIntent,
) => Promise<void> | void;

export type FormlessUiCreateFormContract = {
  cancel: FormlessUiButtonContract;
  errors: readonly string[];
  fieldSet: Omit<FormlessUiFieldSetContract, "fields"> & {
    fields: readonly FormlessUiCreateField[];
  };
  id: string;
  kind: "createForm";
  submit: FormlessUiButtonContract;
};

export type FormlessUiCreateDialogContract = {
  form: FormlessUiCreateFormContract;
  id: string;
  kind: "createDialog";
  open: boolean;
  title: string;
};

export type FormlessUiCreateSurfaceContract = {
  dialog: FormlessUiCreateDialogContract;
  id: string;
  kind: "createSurface";
  trigger: FormlessUiButtonContract;
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

export type FormlessUiWorkspaceItemAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type FormlessUiWorkspaceEmptyStateContract = {
  description?: string;
  id: string;
  kind: "workspaceEmptyState";
  title: string;
};

export type FormlessUiWorkspaceAvailability =
  | {
      state: "ready";
    }
  | {
      emptyState: FormlessUiWorkspaceEmptyStateContract;
      state: "empty";
    }
  | {
      message: string;
      state: "unavailable";
    };

export type FormlessUiWorkspaceQuerySelectionIntent = {
  collectionId: string;
  queryId: string;
  screenId: string;
  sectionId: string;
  type: "workspaceQuerySelection";
};

export type FormlessUiWorkspaceQueryContract = {
  availability: FormlessUiWorkspaceItemAvailability;
  countText?: string;
  id: string;
  kind: "workspaceQuery";
  label: string;
  selected: boolean;
  selectionIntent: FormlessUiWorkspaceQuerySelectionIntent;
};

export type FormlessUiWorkspaceQueryNavigationContract = {
  accessibilityLabel: string;
  id: string;
  items: readonly FormlessUiWorkspaceQueryContract[];
  kind: "workspaceQueryNavigation";
};

export type FormlessUiWorkspaceContextSelectionIntent = {
  collectionId: string;
  contextId: string;
  contextOptionId: string;
  screenId: string;
  sectionId: string;
  type: "workspaceContextSelection";
};

export type FormlessUiWorkspaceContextOptionContract = {
  availability: FormlessUiWorkspaceItemAvailability;
  countText?: string;
  id: string;
  kind: "workspaceContextOption";
  label: string;
  selected: boolean;
  selectionIntent: FormlessUiWorkspaceContextSelectionIntent;
};

export type FormlessUiWorkspaceCreateActionContract = {
  kind: "createAction";
  surface: FormlessUiCreateSurfaceContract;
};

export type FormlessUiWorkspaceOperationActionContract = {
  control: FormlessUiOperationControlContract;
  kind: "operationAction";
};

export type FormlessUiWorkspaceCollectionActionContract =
  | FormlessUiWorkspaceCreateActionContract
  | FormlessUiWorkspaceOperationActionContract;

export type FormlessUiWorkspaceCollectionActionGroupContract = {
  id: string;
  kind: "workspaceCollectionActions";
  primary: readonly FormlessUiWorkspaceCollectionActionContract[];
  secondary: readonly FormlessUiWorkspaceCollectionActionContract[];
  secondaryAccessibilityLabel: string;
};

export type FormlessUiWorkspaceContextPresentation =
  | "externalNavigation"
  | "localListDetail"
  | "localTabs"
  | "singletonDetail";

export type FormlessUiWorkspaceContextContract = {
  accessibilityLabel: string;
  availability: FormlessUiWorkspaceAvailability;
  createAction?: FormlessUiWorkspaceCreateActionContract;
  id: string;
  kind: "workspaceContext";
  label: string;
  options: readonly FormlessUiWorkspaceContextOptionContract[];
  presentation: FormlessUiWorkspaceContextPresentation;
  selectedOptionId?: string;
};

export type FormlessUiWorkspaceSummaryContract = {
  availability: FormlessUiWorkspaceItemAvailability;
  displayValue: string;
  id: string;
  kind: "workspaceSummary";
  label: string;
  suffix?: string;
};

export type FormlessUiWorkspaceResultContract =
  | FormlessUiListContract
  | FormlessUiRecordResultContract
  | FormlessUiTableContract;

export type FormlessUiWorkspaceOrdinaryCollectionContract = {
  actions: FormlessUiWorkspaceCollectionActionGroupContract;
  context?: FormlessUiWorkspaceContextContract;
  contextDetail?: FormlessUiRecordResultContract;
  kind: "ordinary";
  queryNavigation?: FormlessUiWorkspaceQueryNavigationContract;
  result: FormlessUiWorkspaceResultContract;
  summaries: readonly FormlessUiWorkspaceSummaryContract[];
};

export type FormlessUiWorkspaceListDetailContract = {
  accessibilityLabel: string;
  actions: FormlessUiWorkspaceCollectionActionGroupContract;
  contextDetail?: FormlessUiRecordResultContract;
  id: string;
  kind: "listDetail";
  queryNavigation?: FormlessUiWorkspaceQueryNavigationContract;
  result: FormlessUiWorkspaceResultContract;
  selector: FormlessUiWorkspaceContextContract & {
    presentation: "localListDetail";
  };
  summaries: readonly FormlessUiWorkspaceSummaryContract[];
};

export type FormlessUiWorkspaceCollectionPresentationContract =
  | FormlessUiWorkspaceListDetailContract
  | FormlessUiWorkspaceOrdinaryCollectionContract;

export type FormlessUiWorkspaceCollectionContract = {
  accessibilityLabel: string;
  availability: FormlessUiWorkspaceAvailability;
  id: string;
  kind: "workspaceCollection";
  label: string;
  presentation: FormlessUiWorkspaceCollectionPresentationContract;
  selectedQueryId: string | null;
};

export type FormlessUiWorkspaceExternalActionContract = {
  action: FormlessUiActionTriggerContract;
  id: string;
  kind: "workspaceExternalAction";
};

export type FormlessUiWorkspaceSectionContract = {
  accessibilityLabel: string;
  actions: readonly FormlessUiWorkspaceExternalActionContract[];
  collection: FormlessUiWorkspaceCollectionContract;
  headingVisibility: "hidden" | "visible";
  id: string;
  kind: "workspaceSection";
  label: string;
};

export type FormlessUiWorkspaceContract = {
  accessibilityLabel: string;
  id: string;
  kind: "workspace";
  label: string;
  sections: readonly FormlessUiWorkspaceSectionContract[];
};

export type FormlessUiWorkspaceIntentScope = {
  collectionId: string;
  screenId: string;
  sectionId: string;
};

export type FormlessUiWorkspaceExternalActionIntent = FormlessUiWorkspaceIntentScope & {
  actionId: string;
  controlId: string;
  intent: FormlessUiActionTriggerIntent;
  type: "workspaceExternalAction";
};

export type FormlessUiWorkspaceCreateIntent = FormlessUiWorkspaceIntentScope & {
  contextId?: string;
  intent: FormlessUiCreateIntent;
  surfaceId: string;
  type: "workspaceCreate";
};

export type FormlessUiWorkspaceOperationIntent = FormlessUiWorkspaceIntentScope & {
  contextId?: string;
  controlId: string;
  intent: FormlessUiOperationPresentationIntent;
  recordId?: string;
  resultId?: string;
  type: "workspaceOperation";
};

export type FormlessUiWorkspaceFieldIntent = FormlessUiWorkspaceIntentScope & {
  contextId?: string;
  fieldId: string;
  intent: FormlessUiFieldIntent;
  recordId?: string;
  resultId?: string;
  surfaceId?: string;
  type: "workspaceField";
};

export type FormlessUiWorkspaceListIntent = FormlessUiWorkspaceIntentScope & {
  intent: FormlessUiListIntent;
  resultId: string;
  type: "workspaceList";
};

export type FormlessUiWorkspaceTableIntent = FormlessUiWorkspaceIntentScope & {
  intent: FormlessUiTableIntent;
  resultId: string;
  type: "workspaceTable";
};

export type FormlessUiWorkspaceRecordResultIntent = FormlessUiWorkspaceIntentScope & {
  contextId?: string;
  intent: FormlessUiRecordResultIntent;
  resultId: string;
  type: "workspaceRecordResult";
};

export type FormlessUiWorkspaceIntent =
  | FormlessUiWorkspaceContextSelectionIntent
  | FormlessUiWorkspaceCreateIntent
  | FormlessUiWorkspaceExternalActionIntent
  | FormlessUiWorkspaceFieldIntent
  | FormlessUiWorkspaceListIntent
  | FormlessUiWorkspaceOperationIntent
  | FormlessUiWorkspaceQuerySelectionIntent
  | FormlessUiWorkspaceRecordResultIntent
  | FormlessUiWorkspaceTableIntent;

export type FormlessUiWorkspaceIntentHandler = (
  intent: FormlessUiWorkspaceIntent,
) => Promise<void> | void;
