import type {
  FieldEditor,
  FieldEditorControl,
  FieldInputAttributes,
  FieldRef,
  FieldSchema,
  FieldValue,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
  StateMachineSchema,
} from "@dpeek/formless-schema";
import type {
  FormlessUiCreateField,
  FormlessUiDisplayField,
  FormlessUiEnumOption,
  FormlessUiField,
  FormlessUiFieldAccess,
  FormlessUiFieldControl,
  FormlessUiFieldError,
  FormlessUiFieldIntent,
  FormlessUiFieldOptions,
  FormlessUiFieldPending,
  FormlessUiMediaAssetOption,
  FormlessUiMediaAuthoring,
  FormlessUiOperationInputField,
  FormlessUiRecordField,
  FormlessUiRecordFieldRendererKind,
  FormlessUiStateMachineFacts,
  FormlessUiStateMachineField,
  FormlessUiStateTransitionOperation,
  FormlessUiValueUnitField,
} from "../../formless-ui-contract.ts";

type CommonFieldInput<TControl extends FormlessUiFieldControl> = {
  access?: FormlessUiFieldAccess;
  control: TControl;
  editor: TControl["editor"];
  errors?: readonly FormlessUiFieldError[];
  field: TControl["field"];
  fieldName: string;
  fieldRef?: FieldRef;
  label?: string;
  options?: FormlessUiFieldOptions;
  pending?: FormlessUiFieldPending;
  presentation?: FormlessUiField["presentation"];
  recordId?: string;
  stateMachine?: FormlessUiStateMachineField;
  stateMachineFacts?: FormlessUiStateMachineFacts;
  suffix?: string;
  visibleWhen?: FormlessUiField["visibleWhen"];
  writable?: boolean;
};

type CreateFixtureInput<TControl extends FormlessUiFieldControl> = CommonFieldInput<TControl> & {
  draftInput?: GeneratedFieldDraftInput;
  value?: FieldValue;
};

type OperationFixtureInput<TControl extends FormlessUiFieldControl> = CommonFieldInput<TControl> & {
  draftInput?: GeneratedFieldDraftInput;
  input?: PublicSafeOperationInputField;
  inputName?: string;
  value?: FieldValue;
};

type RecordFixtureInput<TControl extends FormlessUiFieldControl> = CommonFieldInput<TControl> & {
  commit: FormlessUiRecordField["commit"];
  density?: FormlessUiRecordField["density"];
  drafts: FormlessUiRecordField["drafts"];
  formatting?: FormlessUiRecordField["formatting"];
  media?: FormlessUiMediaAuthoring;
  presentationMode?: FormlessUiRecordField["presentationMode"];
  rendererKind: FormlessUiRecordFieldRendererKind;
  surface?: FormlessUiRecordField["surface"];
  valueUnit?: FormlessUiValueUnitField;
};

type DisplayFixtureInput<TControl extends FormlessUiFieldControl> = CommonFieldInput<TControl> & {
  commit?: FormlessUiDisplayField["commit"];
  formatting: FormlessUiDisplayField["formatting"];
  surface?: FormlessUiDisplayField["surface"];
  value?: FieldValue;
};

type BaseFieldFacts = {
  control: FormlessUiFieldControl;
  editor: FieldEditor;
  errors?: readonly FormlessUiFieldError[];
  field: FieldSchema;
  fieldName: string;
  fieldRef?: FieldRef;
  inputName?: string;
  label: string;
  options?: FormlessUiFieldOptions;
  pending?: FormlessUiFieldPending;
  presentation?: FormlessUiField["presentation"];
  recordId?: string;
  required: boolean;
  stateMachine?: FormlessUiStateMachineField;
  stateMachineFacts?: FormlessUiStateMachineFacts;
  suffix?: string;
  surface: FormlessUiField["surface"];
  visibleWhen?: FormlessUiField["visibleWhen"];
  writable?: boolean;
};

export function createField<TControl extends FormlessUiFieldControl>({
  draftInput,
  value,
  ...input
}: CreateFixtureInput<TControl>): FormlessUiCreateField {
  return {
    ...baseField(input, "create"),
    access: input.access ?? editableAccess(),
    commit: "submit",
    draftInput,
    mode: "editor",
    surface: "create",
    value,
  };
}

export function operationField<TControl extends FormlessUiFieldControl>({
  draftInput,
  input,
  inputName,
  value,
  ...fieldInput
}: OperationFixtureInput<TControl>): FormlessUiOperationInputField {
  const resolvedInputName = inputName ?? fieldInput.fieldName;

  return {
    ...baseField({ ...fieldInput, inputName: resolvedInputName }, "operation"),
    access: fieldInput.access ?? editableAccess(),
    commit: "submit",
    draftInput,
    input:
      input ??
      publicSafeOperationInputField({
        controlKind: fieldInput.control.controlKind,
        field: fieldInput.field,
        inputName: resolvedInputName,
        label: fieldInput.label ?? fieldInput.control.label,
        options: fieldInput.options,
      }),
    inputName: resolvedInputName,
    mode: "editor",
    surface: "operation",
    value,
  };
}

export function recordField<TControl extends FormlessUiFieldControl>({
  commit,
  density = "default",
  drafts,
  formatting,
  media,
  presentationMode = "default",
  rendererKind,
  surface = "record",
  valueUnit,
  ...input
}: RecordFixtureInput<TControl>): FormlessUiRecordField {
  return {
    ...baseField(input, surface),
    access: input.access ?? editableAccess(),
    commit,
    density,
    drafts,
    formatting: formatting ?? { displayValue: displayFieldValue(input.field, drafts.recordValue) },
    media,
    mode: "editor",
    presentationMode,
    rendererKind,
    surface,
    valueUnit,
  };
}

export function displayField<TControl extends FormlessUiFieldControl>({
  commit = "submit",
  formatting,
  surface = "detail",
  value,
  ...input
}: DisplayFixtureInput<TControl>): FormlessUiDisplayField {
  return {
    ...baseField(input, surface),
    access: input.access ?? { kind: "readOnly", writable: false },
    commit,
    formatting,
    mode: "display",
    surface,
    value,
  };
}

export function textControl(
  field: Extract<FieldSchema, { type: "text" }>,
  input: {
    controlKind?: Extract<
      FormlessUiFieldControl["controlKind"],
      "color" | "icon" | "image" | "markdown" | "media" | "text" | "textarea"
    >;
    editor?: Extract<
      FieldEditor,
      "color" | "href" | "icon" | "image" | "markdown" | "media" | "slug" | "text" | "textarea"
    >;
    label?: string;
    control?: FieldEditorControl;
  } = {},
): Extract<FormlessUiFieldControl, { kind: "text" }> {
  const editor = input.editor ?? textEditorFromField(field);
  const controlKind = input.controlKind ?? textControlKind(editor);

  return controlFacts({
    control: input.control ?? textEditorControl(editor),
    controlKind,
    editor,
    field,
    kind: "text",
    label: input.label ?? field.label ?? "Text",
  });
}

export function booleanControl(
  field: Extract<FieldSchema, { type: "boolean" }>,
  label = field.label ?? "Boolean",
): Extract<FormlessUiFieldControl, { kind: "boolean" }> {
  return controlFacts({
    control: { kind: "checkbox" },
    controlKind: "checkbox",
    editor: "boolean",
    field,
    kind: "boolean",
    label,
  });
}

export function dateControl(
  field: Extract<FieldSchema, { type: "date" }>,
  label = field.label ?? "Date",
): Extract<FormlessUiFieldControl, { kind: "date" }> {
  return controlFacts({
    control: { kind: "input", inputType: "date" },
    controlKind: "date",
    editor: "date",
    field,
    kind: "date",
    label,
  });
}

export function numberControl(
  field: Extract<FieldSchema, { type: "number" }>,
  label = field.label ?? "Number",
): Extract<FormlessUiFieldControl, { kind: "number" }> {
  return controlFacts({
    control: { kind: "formattedNumber" },
    controlKind: "number",
    editor: "number",
    field,
    inputAttributes: {
      max: field.max,
      min: field.min,
      step: field.integer ? "1" : "any",
    },
    kind: "number",
    label,
  });
}

export function enumControl(
  field: Extract<FieldSchema, { type: "enum" }>,
  label = field.label ?? "Enum",
): Extract<FormlessUiFieldControl, { kind: "enum" }> {
  return controlFacts({
    control: { kind: "select" },
    controlKind: "select",
    createDefaultValue: field.default,
    editor: "enum",
    field,
    kind: "enum",
    label,
  });
}

export function referenceControl(
  field: Extract<FieldSchema, { type: "reference" }>,
  label = field.label ?? "Reference",
): Extract<FormlessUiFieldControl, { kind: "reference" }> {
  return controlFacts({
    control: { kind: "reference" },
    controlKind: "reference",
    editor: "reference",
    field,
    kind: "reference",
    label,
  });
}

export function enumOptions(
  field: Extract<FieldSchema, { type: "enum" }>,
  input: Partial<Record<string, { iconSource?: string; missing?: boolean }>> = {},
): FormlessUiEnumOption[] {
  return Object.entries(field.values).map(([value, option]) => ({
    label: option.label,
    missing: input[value]?.missing,
    presentation: enumValuePresentation(field, value, input[value]?.iconSource),
    value,
  }));
}

export function enumValuePresentation(
  field: Extract<FieldSchema, { type: "enum" }>,
  value: string,
  iconSource?: string,
): FormlessUiEnumOption["presentation"] {
  const option = field.values[value];
  const color = option?.presentation?.color;

  return {
    color: {
      intent:
        color === "success"
          ? "success"
          : color === "warning"
            ? "warning"
            : color === "danger"
              ? "danger"
              : "neutral",
      known: Boolean(color),
      token: color,
    },
    ...(iconSource ? { icon: { kind: "svg", source: iconSource } } : {}),
    label: option?.label ?? value,
  };
}

export function referenceOptions(
  options: readonly { id: string; label: string; missing?: boolean }[],
) {
  return options;
}

export function mediaAssetOptions(
  options: readonly FormlessUiMediaAssetOption[],
): readonly FormlessUiMediaAssetOption[] {
  return options;
}

export function stateMachineField(input: {
  fieldName: string;
  machineName: string;
  machine: StateMachineSchema;
}): FormlessUiStateMachineField {
  return {
    fieldName: input.fieldName,
    initialState: input.machine.initial,
    machine: input.machine,
    machineName: input.machineName,
    terminalStates: input.machine.terminal ?? [],
  };
}

export function stateMachineFacts(input: {
  currentValue: FieldValue | undefined;
  field: Extract<FieldSchema, { type: "enum" }>;
  operationNames: Record<string, string>;
  stateMachine: FormlessUiStateMachineField;
  transitionPatches?: Partial<Record<string, Partial<FormlessUiStateTransitionOperation>>>;
  transitions?: StateMachineSchema["transitions"];
}): FormlessUiStateMachineFacts {
  const transitions = input.transitions ?? input.stateMachine.machine.transitions;
  const currentValue = typeof input.currentValue === "string" ? input.currentValue : "";

  return {
    currentValue: input.currentValue,
    initialState: input.stateMachine.initialState,
    stateMachine: input.stateMachine,
    terminal: input.stateMachine.terminalStates.includes(currentValue),
    transitions: Object.entries(transitions).map(([transitionName, transition]) => {
      const valid =
        transition.from.includes(currentValue) ||
        (currentValue.trim() !== "" &&
          input.field.values[currentValue] === undefined &&
          transition.to === input.stateMachine.initialState);
      const baseTransition = {
        operationName: input.operationNames[transitionName] ?? transitionName,
        label: transition.label,
        machineName: input.stateMachine.machineName,
        machine: input.stateMachine.machine,
        transitionName,
        transition,
        fieldName: input.stateMachine.fieldName,
        field: input.field,
        availability: valid
          ? { valid: true }
          : {
              valid: false,
              disabledReason: `Requires ${transition.from
                .map((value) => input.field.values[value]?.label ?? value)
                .join(", ")}.`,
            },
      } satisfies FormlessUiStateTransitionOperation;

      return {
        ...baseTransition,
        ...input.transitionPatches?.[transitionName],
      };
    }),
  };
}

export function draftInput(value: FieldValue | string | undefined): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value: value === undefined ? "" : String(value) };
}

export function recordDrafts(input: {
  draft?: string;
  draftInput?: GeneratedFieldDraftInput;
  recordValue?: FieldValue;
  unitDraft?: string;
  unitDraftInput?: GeneratedFieldDraftInput;
  unitRecordValue?: FieldValue;
}): FormlessUiRecordField["drafts"] {
  return {
    draft: input.draft ?? String(input.recordValue ?? ""),
    draftInput: input.draftInput ?? draftInput(input.recordValue),
    recordValue: input.recordValue,
    unitDraft: input.unitDraft,
    unitDraftInput: input.unitDraftInput,
    unitRecordValue: input.unitRecordValue,
  };
}

export function fieldError(fieldName: string, message: string): FormlessUiFieldError {
  return {
    fieldName,
    message,
    draftValue: { kind: "input", value: "" },
  };
}

export function scenarioFieldKey(field: FormlessUiField) {
  return `${field.surface}:${field.recordId ?? "record"}:${field.inputName ?? field.fieldName}`;
}

export function applyScenarioFieldIntent(
  field: FormlessUiField,
  intent: FormlessUiFieldIntent,
): FormlessUiField {
  if (intent.type === "createDraftChange") {
    return isCreateField(field) && field.fieldName === intent.fieldName
      ? { ...field, draftInput: intent.fieldValue, value: intent.fieldValue.value }
      : field;
  }

  if (intent.type === "operationDraftChange") {
    return isOperationField(field) && field.inputName === intent.inputName
      ? { ...field, draftInput: intent.inputValue, value: intent.inputValue?.value }
      : field;
  }

  if (intent.type === "recordEditorDraftChange") {
    return isRecordField(field) && field.fieldName === intent.fieldName
      ? {
          ...field,
          drafts: {
            ...field.drafts,
            draft: intent.value,
            draftInput: { kind: "input" as const, value: intent.value },
          },
        }
      : field;
  }

  if (intent.type === "recordDraftChange") {
    return applyRecordDraftChange(field, intent.fieldName, intent.fieldValue);
  }

  if (intent.type === "mediaAssetSelect") {
    return applyMediaAssetSelect(field, intent.fieldName, intent.assetId);
  }

  if (intent.type === "recordValueCommit") {
    return applyRecordValueCommit(field, intent.fieldName, intent.value);
  }

  if (intent.type === "recordValueUnitCommit") {
    return applyRecordValueUnitCommit(field, intent.fieldName, intent.commit);
  }

  if (intent.type === "fieldErrorChange") {
    return field.fieldName === intent.fieldName
      ? {
          ...field,
          errors:
            intent.message === null
              ? removeFieldErrors(field.errors, intent.fieldName)
              : [
                  ...removeFieldErrors(field.errors, intent.fieldName),
                  fieldError(intent.fieldName, intent.message),
                ],
        }
      : field;
  }

  if (intent.type === "stateTransitionInvoke") {
    return applyStateTransition(field, intent.fieldName, intent.transitionName);
  }

  return field;
}

export function displayFieldValue(field: FieldSchema, value: FieldValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (field.type === "boolean") {
    return value === true ? "Yes" : "No";
  }

  if (field.type === "enum" && typeof value === "string") {
    return field.values[value]?.label ?? value;
  }

  return String(value);
}

function baseField<TControl extends FormlessUiFieldControl>(
  input: CommonFieldInput<TControl> & { inputName?: string },
  surface: FormlessUiField["surface"],
): BaseFieldFacts {
  return {
    control: input.control,
    editor: input.editor,
    errors: input.errors,
    field: input.field,
    fieldName: input.fieldName,
    fieldRef: input.fieldRef,
    inputName: input.inputName,
    label: input.label ?? input.control.label,
    options: input.options,
    pending: input.pending,
    presentation: input.presentation,
    recordId: input.recordId,
    required: input.field.required,
    stateMachine: input.stateMachine,
    stateMachineFacts: input.stateMachineFacts,
    suffix: input.suffix,
    surface,
    visibleWhen: input.visibleWhen,
    writable: input.writable,
  };
}

function controlFacts<TControl extends FormlessUiFieldControl>({
  control,
  controlKind,
  createDefaultValue,
  editor,
  field,
  inputAttributes = {},
  kind,
  label,
}: {
  control: FieldEditorControl;
  controlKind: TControl["controlKind"];
  createDefaultValue?: string;
  editor: TControl["editor"];
  field: TControl["field"];
  inputAttributes?: FieldInputAttributes;
  kind: TControl["kind"];
  label: string;
}): TControl {
  return {
    control,
    controlKind,
    createDefaultChecked: field.type === "boolean" && field.default === true,
    createDefaultValue,
    editor,
    field,
    inputAttributes,
    kind,
    label,
    required: field.required,
  } as TControl;
}

function textEditorFromField(field: Extract<FieldSchema, { type: "text" }>) {
  if (field.format === "longText") {
    return "textarea";
  }

  if (field.format === "markdown") {
    return "markdown";
  }

  if (
    field.format === "color" ||
    field.format === "href" ||
    field.format === "icon" ||
    field.format === "slug"
  ) {
    return field.format;
  }

  return "text";
}

function textControlKind(
  editor: Extract<
    FieldEditor,
    "color" | "href" | "icon" | "image" | "markdown" | "media" | "slug" | "text" | "textarea"
  >,
) {
  if (editor === "href" || editor === "slug") {
    return "text";
  }

  return editor;
}

function textEditorControl(editor: FieldEditor): FieldEditorControl {
  if (editor === "icon") {
    return { kind: "icon" };
  }

  if (editor === "image") {
    return { kind: "imageUpload" };
  }

  if (editor === "media") {
    return { kind: "mediaUpload" };
  }

  if (editor === "textarea" || editor === "markdown") {
    return { kind: "textarea" };
  }

  return { kind: "input", inputType: "text" };
}

function editableAccess(): Extract<FormlessUiFieldAccess, { kind: "editable" }> {
  return { kind: "editable", canPatch: true, writable: true };
}

function publicSafeOperationInputField({
  controlKind,
  field,
  inputName,
  label,
  options,
}: {
  controlKind: FormlessUiFieldControl["controlKind"];
  field: FieldSchema;
  inputName: string;
  label: string;
  options: FormlessUiFieldOptions | undefined;
}): PublicSafeOperationInputField {
  return {
    name: inputName,
    label,
    required: field.required,
    control:
      field.type === "boolean"
        ? "boolean"
        : field.type === "date"
          ? "date"
          : field.type === "number"
            ? "number"
            : field.type === "enum"
              ? "enum"
              : controlKind === "textarea"
                ? "longText"
                : "text",
    options:
      field.type === "enum"
        ? options?.enumOptions?.map((option) => ({ value: option.value, label: option.label }))
        : undefined,
  };
}

function applyRecordDraftChange(
  field: FormlessUiField,
  fieldName: string,
  fieldValue: GeneratedFieldDraftInput | undefined,
): FormlessUiField {
  if (!isRecordField(field)) {
    return field;
  }

  if (field.valueUnit?.unitFieldName === fieldName) {
    return {
      ...field,
      drafts: {
        ...field.drafts,
        unitDraft: String(fieldValue?.value ?? ""),
        unitDraftInput: fieldValue,
      },
    };
  }

  if (field.fieldName !== fieldName) {
    return field;
  }

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: String(fieldValue?.value ?? ""),
      draftInput: fieldValue,
    },
  };
}

function applyMediaAssetSelect(
  field: FormlessUiField,
  fieldName: string,
  assetId: string,
): FormlessUiField {
  if (!isRecordField(field) || field.fieldName !== fieldName) {
    return field;
  }

  const asset = field.options?.mediaAssetOptions?.find((option) => option.id === assetId);

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: assetId,
      draftInput: { kind: "input" as const, value: assetId },
      recordValue: assetId,
    },
    formatting: { ...field.formatting, displayValue: assetId },
    media:
      field.media === undefined
        ? undefined
        : {
            ...field.media,
            mediaPreviewHref: asset?.href ?? field.media.mediaPreviewHref,
            previewHref: asset?.href ?? field.media.previewHref,
            selectedAssetId: assetId,
          },
  };
}

function applyRecordValueCommit(field: FormlessUiField, fieldName: string, value: FieldValue) {
  if (!isRecordField(field) || field.fieldName !== fieldName) {
    return field;
  }

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: String(value ?? ""),
      draftInput: draftInput(value),
      recordValue: value,
    },
    errors: removeFieldErrors(field.errors, field.fieldName),
    formatting: {
      ...field.formatting,
      displayValue: displayFieldValue(field.field, value),
    },
  };
}

function applyRecordValueUnitCommit(
  field: FormlessUiField,
  fieldName: string,
  commit: { fieldDraftInput: GeneratedFieldDraftInput; unitDraftInput: GeneratedFieldDraftInput },
) {
  if (!isRecordField(field) || field.fieldName !== fieldName || !field.valueUnit) {
    return field;
  }

  const fieldValue = fieldValueFromDraftInput(field.field, commit.fieldDraftInput);
  const unitValue = fieldValueFromDraftInput(field.valueUnit.unitField, commit.unitDraftInput);

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: String(fieldValue ?? ""),
      draftInput: commit.fieldDraftInput,
      recordValue: fieldValue,
      unitDraft: String(unitValue ?? ""),
      unitDraftInput: commit.unitDraftInput,
      unitRecordValue: unitValue,
    },
    errors: removeFieldErrors(field.errors, field.fieldName),
    formatting: {
      ...field.formatting,
      displayValue: displayFieldValue(field.field, fieldValue),
    },
  };
}

function applyStateTransition(
  field: FormlessUiField,
  fieldName: string,
  transitionName: string,
): FormlessUiField {
  if (field.fieldName !== fieldName || field.stateMachineFacts === undefined) {
    return field;
  }

  const transition = field.stateMachineFacts.transitions?.find(
    (candidate) => candidate.transitionName === transitionName,
  );

  if (!transition || transition.availability?.valid === false) {
    return field;
  }

  const nextValue = transition.transition.to;

  const nextFacts = stateMachineFacts({
    currentValue: nextValue,
    field: transition.field,
    operationNames: Object.fromEntries(
      (field.stateMachineFacts.transitions ?? []).map((candidate) => [
        candidate.transitionName,
        candidate.operationName,
      ]),
    ),
    stateMachine: field.stateMachineFacts.stateMachine,
  });

  if (field.mode === "display") {
    return {
      ...field,
      formatting: {
        ...field.formatting,
        displayValue: displayFieldValue(transition.field, nextValue),
        enumValuePresentation: enumValuePresentation(transition.field, nextValue),
      },
      stateMachineFacts: nextFacts,
      value: nextValue,
    };
  }

  if (isRecordField(field)) {
    return {
      ...field,
      drafts: {
        ...field.drafts,
        draft: nextValue,
        draftInput: { kind: "input", value: nextValue },
        recordValue: nextValue,
      },
      formatting: {
        ...field.formatting,
        displayValue: displayFieldValue(transition.field, nextValue),
        enumValuePresentation: enumValuePresentation(transition.field, nextValue),
      },
      stateMachineFacts: nextFacts,
    };
  }

  return { ...field, stateMachineFacts: nextFacts, value: nextValue };
}

function fieldValueFromDraftInput(field: FieldSchema, input: GeneratedFieldDraftInput): FieldValue {
  if (input.kind === "value") {
    return input.value;
  }

  if (field.type === "number") {
    const value = Number(input.value);

    return Number.isFinite(value) ? value : input.value;
  }

  return input.value;
}

function removeFieldErrors(errors: readonly FormlessUiFieldError[] | undefined, fieldName: string) {
  return (errors ?? []).filter((error) => error.fieldName !== fieldName);
}

function isRecordField(field: FormlessUiField): field is FormlessUiRecordField {
  return field.mode === "editor" && field.surface !== "create" && field.surface !== "operation";
}

function isCreateField(field: FormlessUiField): field is FormlessUiCreateField {
  return field.mode === "editor" && field.surface === "create";
}

function isOperationField(field: FormlessUiField): field is FormlessUiOperationInputField {
  return field.mode === "editor" && field.surface === "operation";
}
