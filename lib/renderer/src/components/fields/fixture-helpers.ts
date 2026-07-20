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
import {
  parseNumberInputValue,
  resolveGeneratedFieldDraftValue,
  validateAuthorityFieldValue,
} from "@dpeek/formless-schema";
import type {
  FormlessUiCreateField,
  FormlessUiColorFacts,
  FormlessUiDisplayField,
  FormlessUiEnumFacts,
  FormlessUiEnumOption,
  FormlessUiField,
  FormlessUiFieldAccess,
  FormlessUiFieldControl,
  FormlessUiFieldError,
  FormlessUiFieldIntent,
  FormlessUiFieldOptions,
  FormlessUiFieldPending,
  FormlessUiIconPickerSelection,
  FormlessUiMediaAssetOption,
  FormlessUiMediaAuthoring,
  FormlessUiMediaPresentation,
  FormlessUiOperationInputField,
  FormlessUiRecordField,
  FormlessUiRecordFieldRendererKind,
  FormlessUiReferenceFacts,
  FormlessUiReferenceOption,
  FormlessUiReferenceValueStatus,
  FormlessUiStateMachineFacts,
  FormlessUiStateMachineField,
  FormlessUiStateTransitionOperation,
  FormlessUiValueUnitField,
} from "@dpeek/formless-presentation/contract";
import { sourceIconIsRenderable } from "../field-primitives.tsx";
import type { FormlessUiEditorField } from "./field-chrome.tsx";

export type FormlessUiFixtureFieldOccurrence = {
  ownerId: string;
  placementId: string;
};

type CommonFieldInput<TControl extends FormlessUiFieldControl> = {
  access?: FormlessUiFieldAccess;
  color?: FormlessUiColorFacts;
  control: TControl;
  editor: TControl["editor"];
  enum?: FormlessUiEnumFacts;
  errors?: readonly FormlessUiFieldError[];
  field: TControl["field"];
  fieldName: string;
  fieldRef?: FieldRef;
  icon?: FormlessUiField["icon"];
  label?: string;
  labelVisibility: "hidden" | "visible";
  media?: FormlessUiMediaPresentation;
  options?: FormlessUiFieldOptions;
  occurrence: FormlessUiFixtureFieldOccurrence;
  pending?: FormlessUiFieldPending;
  presentation?: FormlessUiField["presentation"];
  reference?: FormlessUiReferenceFacts;
  recordId?: string;
  stateMachine?: FormlessUiStateMachineField;
  stateMachineFacts?: FormlessUiStateMachineFacts;
  suffix?: string;
  visibleWhen?: FormlessUiField["visibleWhen"];
  writable?: boolean;
};

type CreateFixtureInput<TControl extends FormlessUiFieldControl> = CommonFieldInput<TControl> & {
  draftInput?: GeneratedFieldDraftInput;
  media?: FormlessUiMediaAuthoring;
  value?: FieldValue;
};

type OperationFixtureInput<TControl extends FormlessUiFieldControl> = CommonFieldInput<TControl> & {
  draftInput?: GeneratedFieldDraftInput;
  input?: PublicSafeOperationInputField;
  inputName?: string;
  media?: FormlessUiMediaAuthoring;
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
  density?: FormlessUiDisplayField["density"];
  formatting: FormlessUiDisplayField["formatting"];
  surface?: FormlessUiDisplayField["surface"];
  value?: FieldValue;
};

type BaseFieldFacts = {
  color?: FormlessUiColorFacts;
  control: FormlessUiFieldControl;
  editor: FieldEditor;
  enum?: FormlessUiEnumFacts;
  errors?: readonly FormlessUiFieldError[];
  field: FieldSchema;
  fieldId: string;
  fieldName: string;
  fieldRef?: FieldRef;
  icon?: FormlessUiField["icon"];
  inputName?: string;
  label: string;
  labelVisibility: "hidden" | "visible";
  media?: FormlessUiMediaPresentation;
  options?: FormlessUiFieldOptions;
  pending?: FormlessUiFieldPending;
  presentation?: FormlessUiField["presentation"];
  reference?: FormlessUiReferenceFacts;
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
    color: input.color ?? fixtureColorFacts(input.control, draftInput?.value ?? value),
    commit: "submit",
    density: "default",
    draftInput,
    enum:
      input.enum ??
      fixtureEnumEditorFacts({
        field: input.field,
        style: "plain",
        surface: "create",
        value: draftInput?.value ?? value,
      }),
    media: input.media,
    mode: "editor",
    surface: "create",
    value,
  };
}

export function fixtureFormlessUiFieldId({
  ownerId,
  placementId,
}: FormlessUiFixtureFieldOccurrence): string {
  return ["fixture-field", ownerId, placementId].map((part) => encodeURIComponent(part)).join(":");
}

export function withFixtureFieldOccurrence<TField extends FormlessUiField>(
  field: TField,
  occurrence: FormlessUiFixtureFieldOccurrence,
): TField {
  return { ...field, fieldId: fixtureFormlessUiFieldId(occurrence) };
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
    color: fieldInput.color ?? fixtureColorFacts(fieldInput.control, draftInput?.value ?? value),
    commit: "submit",
    density: "default",
    draftInput,
    enum:
      fieldInput.enum ??
      fixtureEnumEditorFacts({
        field: fieldInput.field,
        style: "plain",
        surface: "operation",
        value: draftInput?.value ?? value,
      }),
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
    media: fieldInput.media,
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
    color: input.color ?? fixtureColorFacts(input.control, drafts.draft),
    commit,
    density,
    drafts,
    formatting: formatting ?? { displayValue: displayFieldValue(input.field, drafts.recordValue) },
    enum:
      input.enum ??
      fixtureEnumEditorFacts({
        field: input.field,
        presentation: input.presentation,
        style: rendererKind === "enum-icon" ? "rich" : "plain",
        surface,
        value: drafts.draft,
      }),
    media,
    mode: "editor",
    presentationMode,
    rendererKind,
    surface,
    value: drafts.recordValue,
    valueUnit,
  };
}

export function displayField<TControl extends FormlessUiFieldControl>({
  commit = "submit",
  density = "default",
  formatting,
  surface = "detail",
  value,
  ...input
}: DisplayFixtureInput<TControl>): FormlessUiDisplayField {
  return {
    ...baseField(input, surface),
    access: input.access ?? { kind: "readOnly", writable: false },
    color: input.color ?? fixtureColorFacts(input.control, value),
    commit,
    density,
    enum:
      input.enum ??
      fixtureEnumDisplayFacts({
        field: input.field,
        presentation: input.presentation,
        value,
      }),
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
      "color" | "icon" | "markdown" | "media" | "text" | "textarea"
    >;
    editor?: Extract<
      FieldEditor,
      "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
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
  input: Partial<Record<string, { iconSource?: string }>> = {},
): FormlessUiEnumOption[] {
  return Object.entries(field.values).map(([value, option]) => ({
    label: option.label,
    presentation: enumValuePresentation(field, value, input[value]?.iconSource),
    status: "declared",
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
  const colorIntent = fixturePresentationColorIntent(color);
  const iconToken = option?.presentation?.icon;

  return {
    color: {
      intent: colorIntent,
      known: color === undefined || colorIntent !== "neutral",
      ...(color === undefined ? {} : { token: color }),
    },
    ...(iconSource ? { icon: { kind: "svg", source: iconSource } } : {}),
    iconKnown: iconToken === undefined || iconSource !== undefined,
    ...(iconToken === undefined ? {} : { iconToken }),
    label: option?.label ?? value,
  };
}

export function referenceOptions(options: readonly FormlessUiReferenceOption[]) {
  return options;
}

export function referenceEditorFacts(
  field: Extract<FieldSchema, { type: "reference" }>,
  value: FieldValue | undefined,
  options: readonly FormlessUiReferenceOption[],
): FormlessUiReferenceFacts {
  return {
    clearable: !field.required,
    kind: "editor",
    valueStatus: fixtureReferenceValueStatus(value, options),
  };
}

export function referenceDisplayFacts(
  value: FieldValue | undefined,
  options: readonly FormlessUiReferenceOption[],
): FormlessUiReferenceFacts {
  return {
    kind: "display",
    valueStatus: fixtureReferenceValueStatus(value, options),
  };
}

function fixtureReferenceValueStatus(
  value: FieldValue | undefined,
  options: readonly FormlessUiReferenceOption[],
): FormlessUiReferenceValueStatus {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }

  return options.some((option) => option.id === value)
    ? { kind: "resolved", value }
    : { kind: "missing", value };
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
  interaction?: "display" | "transitions";
  operationNames: Record<string, string>;
  stateMachine: FormlessUiStateMachineField;
  transitionPatches?: Partial<Record<string, Partial<FormlessUiStateTransitionOperation>>>;
  transitions?: StateMachineSchema["transitions"];
}): FormlessUiStateMachineFacts {
  const transitions = input.transitions ?? input.stateMachine.machine.transitions;
  const currentValue = typeof input.currentValue === "string" ? input.currentValue : "";
  const transitionFacts = Object.entries(transitions).map(([transitionName, transition]) => {
    const undeclared = currentValue.trim() !== "" && input.field.values[currentValue] === undefined;
    const valid =
      transition.from.includes(currentValue) ||
      (undeclared && transition.to === input.stateMachine.initialState);
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
            disabledReason: undeclared
              ? `Current state "${currentValue}" is not declared.`
              : `Requires ${transition.from
                  .map((value) => input.field.values[value]?.label ?? value)
                  .join(", ")}.`,
          },
    } satisfies FormlessUiStateTransitionOperation;

    return {
      ...baseTransition,
      ...input.transitionPatches?.[transitionName],
    };
  });

  return {
    currentValue: input.currentValue,
    initialState: input.stateMachine.initialState,
    interaction:
      input.interaction === "display"
        ? { kind: "display" }
        : {
            invocationSource: "menuItem",
            kind: "transitions",
            transitions: transitionFacts,
          },
    stateMachine: input.stateMachine,
    terminal: input.stateMachine.terminalStates.includes(currentValue),
    valueStatus:
      currentValue.trim() === ""
        ? { kind: "unset", message: "Current state is missing." }
        : input.field.values[currentValue] === undefined
          ? {
              kind: "undeclared",
              message: `Current state "${currentValue}" is not declared.`,
              value: currentValue,
            }
          : { kind: "declared", value: currentValue },
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

export function fieldError(
  fieldName: string,
  message: string,
  draftValue = "",
): FormlessUiFieldError {
  return {
    fieldName,
    message,
    draftValue: { kind: "input", value: draftValue },
  };
}

export function scenarioFieldKey(field: FormlessUiField) {
  return `${field.surface}:${field.recordId ?? "record"}:${field.inputName ?? field.fieldName}`;
}

export function applyScenarioFieldIntent(
  field: FormlessUiField,
  intent: FormlessUiFieldIntent,
): FormlessUiField {
  return withFixtureCurrentColorFacts(applyScenarioFieldIntentResult(field, intent));
}

function applyScenarioFieldIntentResult(
  field: FormlessUiField,
  intent: FormlessUiFieldIntent,
): FormlessUiField {
  if (intent.type === "createDraftChange") {
    if (!isCreateField(field) || field.fieldName !== intent.fieldName) {
      return field;
    }

    return validateScenarioDraftChange(
      withFixtureReferenceValue(
        withFixtureEnumEditorValue(
          { ...field, draftInput: intent.fieldValue, value: intent.fieldValue.value },
          intent.fieldValue.value,
        ),
        intent.fieldValue.value,
      ),
      intent.fieldValue,
    );
  }

  if (intent.type === "operationDraftChange") {
    if (!isOperationField(field) || field.inputName !== intent.inputName) {
      return field;
    }

    return validateScenarioDraftChange(
      withFixtureEnumEditorValue(
        { ...field, draftInput: intent.inputValue, value: intent.inputValue?.value },
        intent.inputValue?.value,
      ),
      intent.inputValue ?? { kind: "value", value: "" },
    );
  }

  if (intent.type === "recordEditorDraftChange") {
    if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
      return field;
    }

    const draftInput = scenarioRecordEditorDraftInput(field, intent.value);

    return withFixtureReferenceValue(
      withFixtureEnumEditorValue(
        {
          ...field,
          drafts: {
            ...field.drafts,
            draft: intent.value,
            draftInput,
          },
        },
        intent.value,
      ),
      intent.value,
    );
  }

  if (intent.type === "recordDraftChange") {
    return applyRecordDraftChange(field, intent.fieldName, intent.fieldValue);
  }

  if (intent.type === "recordDraftRevert") {
    if (!isRecordField(field) || field.fieldName !== intent.fieldName) {
      return field;
    }

    return withFixtureReferenceValue(
      withFixtureEnumEditorValue(
        {
          ...field,
          drafts: {
            ...field.drafts,
            draft: scenarioRecordEditorText(field, field.drafts.recordValue),
            draftInput: undefined,
            unitDraft: String(field.drafts.unitRecordValue ?? ""),
            unitDraftInput: undefined,
          },
          errors: removeFieldErrors(
            removeFieldErrors(field.errors, field.fieldName),
            field.valueUnit?.unitFieldName ?? "",
          ),
        },
        field.drafts.recordValue,
      ),
      field.drafts.recordValue,
    );
  }

  if (intent.type === "recordDraftCommit") {
    return applyRecordDraftCommit(field, intent.fieldName, intent.fieldValue);
  }

  if (intent.type === "iconDialogDraftChange") {
    return applyIconDialogDraftChange(field, intent.fieldName, intent.value);
  }

  if (intent.type === "iconDialogOpenChange") {
    return applyIconDialogOpenChange(field, intent.fieldName, intent.open);
  }

  if (intent.type === "iconDialogCancel") {
    return applyIconDialogCancel(field, intent.fieldName);
  }

  if (intent.type === "iconDialogSave") {
    return applyIconDialogSave(field, intent.fieldName);
  }

  if (intent.type === "mediaAssetSelect") {
    return applyMediaAssetSelect(field, intent.fieldName, intent.assetId);
  }

  if (intent.type === "mediaFileSelect") {
    return applyMediaFileSelect(field, intent.fieldName, intent.file);
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

export function applyScenarioFieldSubmit(field: FormlessUiField): FormlessUiField {
  if (!isCreateField(field) && !isOperationField(field)) {
    return field;
  }

  const fieldName = field.surface === "operation" ? field.inputName : field.fieldName;
  const draftValue =
    field.draftInput ?? (field.value === undefined ? undefined : draftInput(field.value));
  const value =
    draftValue === undefined ? undefined : fieldValueFromDraftInput(field.field, draftValue);
  const validation = validateScenarioFieldValue(
    fieldName,
    field.field,
    value,
    draftValue !== undefined,
    draftValue,
  );

  if (validation.kind === "error") {
    return {
      ...field,
      errors: [
        ...removeFieldErrors(field.errors, fieldName),
        fieldError(fieldName, validation.message, String(draftValue?.value ?? "")),
      ],
    };
  }

  return {
    ...field,
    errors: removeFieldErrors(field.errors, fieldName),
    value: validation.kind === "set" ? validation.value : undefined,
  };
}

function baseField<TControl extends FormlessUiFieldControl>(
  input: CommonFieldInput<TControl> & { inputName?: string },
  surface: FormlessUiField["surface"],
): BaseFieldFacts {
  return {
    control: input.control,
    color: input.color,
    editor: input.editor,
    enum: input.enum,
    errors: input.errors,
    field: input.field,
    fieldId: fixtureFormlessUiFieldId(input.occurrence),
    fieldName: input.fieldName,
    fieldRef: input.fieldRef,
    icon: input.icon,
    inputName: input.inputName,
    label: input.label ?? input.control.label,
    labelVisibility: input.labelVisibility,
    media: input.media,
    options: input.options,
    pending: input.pending,
    presentation: input.presentation,
    reference: input.reference,
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

function fixtureEnumEditorFacts({
  field,
  presentation,
  style,
  surface,
  value,
}: {
  field: FieldSchema;
  presentation?: FormlessUiField["presentation"];
  style: "plain" | "rich";
  surface: "create" | "detail" | "operation" | "record" | "table-cell";
  value: FieldValue | undefined;
}): FormlessUiEnumFacts | undefined {
  if (field.type !== "enum") {
    return undefined;
  }

  const valueStatus = fixtureEnumValueStatus(field, value);
  const placeholder =
    surface === "operation"
      ? "Select"
      : style === "rich" && valueStatus.kind === "unset"
        ? "None"
        : valueStatus.kind === "unset"
          ? ""
          : undefined;

  return {
    clearable: surface === "operation" || !field.required,
    kind: "editor",
    listContent: style === "rich" ? (presentation?.list ?? "both") : "label",
    ...(placeholder === undefined ? {} : { placeholder }),
    style,
    triggerContent: style === "rich" && presentation?.trigger !== "label" ? "both" : "label",
    valueStatus,
  };
}

function fixtureEnumDisplayFacts({
  field,
  presentation,
  value,
}: {
  field: FieldSchema;
  presentation?: FormlessUiField["presentation"];
  value: FieldValue | undefined;
}): FormlessUiEnumFacts | undefined {
  if (field.type !== "enum") {
    return undefined;
  }

  return {
    content: presentation?.mode === "iconOnly" ? "icon" : "label",
    kind: "display",
    valueStatus: fixtureEnumValueStatus(field, value),
  };
}

function fixtureEnumValueStatus(
  field: Extract<FieldSchema, { type: "enum" }>,
  value: FieldValue | undefined,
): FormlessUiEnumFacts["valueStatus"] {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }

  return Object.hasOwn(field.values, value)
    ? { kind: "declared", value }
    : { kind: "undeclared", value };
}

function fixturePresentationColorIntent(
  token: string | undefined,
): FormlessUiEnumOption["presentation"]["color"]["intent"] {
  if (token === "success" || token === "priority.low") {
    return "success";
  }

  if (token === "warning" || token === "priority.normal") {
    return "warning";
  }

  if (token === "danger" || token === "error" || token === "priority.high") {
    return "danger";
  }

  return "neutral";
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
    "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
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

  return withFixtureEnumEditorValue(
    {
      ...field,
      drafts: {
        ...field.drafts,
        draft: String(fieldValue?.value ?? ""),
        draftInput: fieldValue,
      },
    },
    fieldValue?.value,
  );
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
  const committedField = applyRecordValueCommit(field, fieldName, assetId);

  if (!isRecordField(committedField) || committedField.errors?.length) {
    return committedField;
  }

  return {
    ...committedField,
    media:
      committedField.media === undefined
        ? undefined
        : {
            ...committedField.media,
            mediaPreviewHref: asset?.href,
            previewHref: asset?.href,
            selectedAssetId: assetId || undefined,
          },
  };
}

function applyMediaFileSelect(
  field: FormlessUiField,
  fieldName: string,
  file: File | undefined,
): FormlessUiField {
  if (
    file === undefined ||
    field.mode !== "editor" ||
    field.fieldName !== fieldName ||
    field.control.controlKind !== "media"
  ) {
    return field;
  }

  const fileName = file.name || `${fieldName}.png`;
  const assetId = `media-upload-${fixtureMediaFileSlug(fileName)}`;
  const previewHref = URL.createObjectURL(file);
  const mediaAssetOptions = [
    { href: previewHref, id: assetId, label: fileName },
    ...(field.options?.mediaAssetOptions ?? []).filter((option) => option.id !== assetId),
  ];

  if (isRecordField(field)) {
    const committedField = applyRecordValueCommit(
      {
        ...field,
        options: { ...field.options, mediaAssetOptions },
      },
      fieldName,
      assetId,
    );

    return isRecordField(committedField)
      ? {
          ...committedField,
          media:
            committedField.media === undefined
              ? undefined
              : {
                  ...committedField.media,
                  mediaPreviewHref: previewHref,
                  previewHref,
                  selectedAssetId: assetId,
                },
        }
      : committedField;
  }

  return {
    ...field,
    draftInput: draftInput(assetId),
    media:
      field.media && "fileSelectEnabled" in field.media
        ? {
            ...field.media,
            mediaPreviewHref: previewHref,
            previewHref,
            selectedAssetId: assetId,
          }
        : field.media,
    options: { ...field.options, mediaAssetOptions },
    value: assetId,
  };
}

function fixtureMediaFileSlug(fileName: string) {
  const slug = fileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "image";
}

function applyRecordDraftCommit(
  field: FormlessUiField,
  fieldName: string,
  fieldValue: GeneratedFieldDraftInput,
) {
  if (!isRecordField(field) || field.fieldName !== fieldName) {
    return field;
  }

  const value = fieldValueFromDraftInput(field.field, fieldValue);
  const validation = validateScenarioFieldValue(fieldName, field.field, value, true, fieldValue);

  if (validation.kind === "error") {
    return {
      ...field,
      drafts: {
        ...field.drafts,
        draftInput: fieldValue,
      },
      errors: [
        ...removeFieldErrors(field.errors, fieldName),
        fieldError(fieldName, validation.message, field.drafts.draft),
      ],
    };
  }

  const committedValue = validation.kind === "set" ? validation.value : undefined;

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: scenarioRecordEditorText(field, committedValue),
      draftInput: draftInput(committedValue),
      recordValue: committedValue,
    },
    errors: removeFieldErrors(field.errors, fieldName),
    formatting: {
      ...field.formatting,
      displayValue: scenarioNumberDisplayValue(field, committedValue),
    },
  };
}

function applyIconDialogDraftChange(
  field: FormlessUiField,
  fieldName: string,
  value: string,
): FormlessUiField {
  if (field.mode !== "editor" || field.fieldName !== fieldName || field.icon === undefined) {
    return field;
  }

  return withFixtureIconDialogDraft(field, value, field.icon.dialogOpen);
}

function applyIconDialogOpenChange(
  field: FormlessUiField,
  fieldName: string,
  open: boolean,
): FormlessUiField {
  if (field.mode !== "editor" || field.fieldName !== fieldName || field.icon === undefined) {
    return field;
  }

  return withFixtureIconDialogDraft(
    field,
    open ? fixtureIconSavedSource(field) : field.icon.dialogDraft,
    open,
  );
}

function applyIconDialogCancel(field: FormlessUiField, fieldName: string): FormlessUiField {
  if (field.mode !== "editor" || field.fieldName !== fieldName || field.icon === undefined) {
    return field;
  }

  return withFixtureIconDialogDraft(field, fixtureIconSavedSource(field), false);
}

function applyIconDialogSave(field: FormlessUiField, fieldName: string): FormlessUiField {
  if (
    !isRecordField(field) ||
    field.fieldName !== fieldName ||
    field.icon === undefined ||
    !field.icon.canSave
  ) {
    return field;
  }

  const committed = applyRecordValueCommit(field, fieldName, field.icon.dialogDraft);

  return committed.mode === "editor" && committed.icon !== undefined
    ? withFixtureIconDialogDraft(committed, committed.icon.dialogDraft, false)
    : committed;
}

function withFixtureIconDialogDraft(
  field: FormlessUiEditorField,
  dialogDraft: string,
  dialogOpen: boolean,
): FormlessUiEditorField {
  const trimmedDraft = dialogDraft.trim();
  const emptyValue = trimmedDraft === "";
  const customParseError =
    emptyValue || sourceIconIsRenderable(dialogDraft)
      ? undefined
      : "SVG source could not be parsed.";
  const selection = fixtureIconSelection(field, dialogDraft);
  const savedSource = fixtureIconSavedSource(field);

  return {
    ...field,
    icon: {
      canCancel: dialogOpen,
      canSave:
        dialogOpen &&
        !field.pending?.isPending &&
        customParseError === undefined &&
        (!field.required || !emptyValue),
      ...(customParseError === undefined ? {} : { customParseError }),
      dialogDraft,
      dialogOpen,
      emptyValue,
      previewSource: customParseError === undefined ? dialogDraft : savedSource,
      savePending: field.pending?.isPending,
      selection,
      valueMode: "svgSource",
    },
  };
}

function fixtureIconSelection(
  field: FormlessUiEditorField,
  source: string,
): FormlessUiIconPickerSelection {
  if (source.trim() === "") {
    return { kind: "empty" };
  }

  const option = field.options?.iconOptions?.find((candidate) => candidate.source === source);

  return option === undefined || option.custom
    ? { kind: "customSource", source }
    : { kind: "option", optionId: option.id, source };
}

function fixtureIconSavedSource(field: FormlessUiEditorField) {
  if (isRecordField(field)) {
    return field.drafts.draft;
  }

  return typeof field.draftInput?.value === "string"
    ? field.draftInput.value
    : typeof field.value === "string"
      ? field.value
      : "";
}

function applyRecordValueCommit(field: FormlessUiField, fieldName: string, value: FieldValue) {
  if (!isRecordField(field) || field.fieldName !== fieldName) {
    return field;
  }

  const validation = validateScenarioFieldValue(
    fieldName,
    field.field,
    value,
    true,
    draftInput(value),
  );

  if (validation.kind === "error") {
    return {
      ...field,
      errors: [
        ...removeFieldErrors(field.errors, fieldName),
        fieldError(fieldName, validation.message, field.drafts.draft),
      ],
    };
  }

  const committedValue = validation.kind === "set" ? validation.value : undefined;

  return withFixtureReferenceValue(
    withFixtureEnumEditorValue(
      {
        ...field,
        drafts: {
          ...field.drafts,
          draft: String(committedValue ?? ""),
          draftInput: draftInput(committedValue),
          recordValue: committedValue,
        },
        errors: removeFieldErrors(field.errors, field.fieldName),
        formatting: {
          ...field.formatting,
          displayValue: displayFieldValue(field.field, committedValue),
          enumValuePresentation:
            field.field.type === "enum" &&
            typeof committedValue === "string" &&
            committedValue !== ""
              ? enumValuePresentation(field.field, committedValue)
              : undefined,
        },
      },
      committedValue,
    ),
    committedValue,
    { updateFormatting: true },
  );
}

function validateScenarioDraftChange<TField extends FormlessUiField>(
  field: TField,
  fieldValue: GeneratedFieldDraftInput,
): TField {
  if (field.field.type !== "number") {
    return field;
  }

  const rawValue = String(fieldValue.value ?? "");

  if (rawValue.trim() === "") {
    return {
      ...field,
      errors: removeFieldErrors(field.errors, field.fieldName),
    };
  }

  const value = fieldValueFromDraftInput(field.field, fieldValue);
  const validation = validateScenarioFieldValue(
    field.fieldName,
    field.field,
    value,
    true,
    fieldValue,
  );

  return validation.kind === "error"
    ? {
        ...field,
        errors: [
          ...removeFieldErrors(field.errors, field.fieldName),
          fieldError(field.fieldName, validation.message, rawValue),
        ],
      }
    : {
        ...field,
        errors: removeFieldErrors(field.errors, field.fieldName),
      };
}

function scenarioRecordEditorDraftInput(
  field: FormlessUiRecordField,
  value: string,
): GeneratedFieldDraftInput {
  if (field.field.type !== "number") {
    return { kind: "input", value };
  }

  const format = field.formatting.format ?? field.format ?? "plain";
  const normalized =
    format === "currency"
      ? value.replace(/[$]/g, "")
      : format === "percent"
        ? value.replace(/%$/, "")
        : value;
  const result = parseNumberInputValue(normalized.trim());

  if (result.kind === "empty") {
    return { kind: "value", value: "" };
  }

  if (result.kind === "valid") {
    return {
      kind: "value",
      value: format === "percent" ? result.value / 100 : result.value,
    };
  }

  return { kind: "input", value };
}

function scenarioRecordEditorText(field: FormlessUiRecordField, value: FieldValue | undefined) {
  if (field.field.type !== "number" || typeof value !== "number") {
    return String(value ?? "");
  }

  const format = field.formatting.format ?? field.format ?? "plain";

  if (format === "currency") {
    return `$${value.toFixed(2)}`;
  }

  if (format === "percent") {
    return `${scenarioPlainNumber(value * 100)}%`;
  }

  return format === "number" ? scenarioPlainNumber(value) : String(value);
}

function scenarioNumberDisplayValue(field: FormlessUiRecordField, value: FieldValue | undefined) {
  return scenarioRecordEditorText(field, value);
}

function scenarioPlainNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
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
  const fieldValidation = validateScenarioFieldValue(
    field.fieldName,
    field.field,
    fieldValue,
    true,
    commit.fieldDraftInput,
  );
  const unitValidation = validateScenarioFieldValue(
    field.valueUnit.unitFieldName,
    field.valueUnit.unitField,
    unitValue,
    true,
    commit.unitDraftInput,
  );
  const validationError =
    fieldValidation.kind === "error"
      ? { fieldName: field.fieldName, message: fieldValidation.message }
      : unitValidation.kind === "error"
        ? { fieldName: field.valueUnit.unitFieldName, message: unitValidation.message }
        : undefined;

  if (validationError) {
    return {
      ...field,
      errors: [
        ...removeFieldErrors(field.errors, validationError.fieldName),
        fieldError(validationError.fieldName, validationError.message),
      ],
    };
  }

  const committedFieldValue = fieldValidation.kind === "set" ? fieldValidation.value : undefined;
  const committedUnitValue = unitValidation.kind === "set" ? unitValidation.value : undefined;

  return {
    ...field,
    drafts: {
      ...field.drafts,
      draft: scenarioRecordEditorText(field, committedFieldValue),
      draftInput: commit.fieldDraftInput,
      recordValue: committedFieldValue,
      unitDraft: String(committedUnitValue ?? ""),
      unitDraftInput: commit.unitDraftInput,
      unitRecordValue: committedUnitValue,
    },
    errors: removeFieldErrors(
      removeFieldErrors(field.errors, field.fieldName),
      field.valueUnit.unitFieldName,
    ),
    formatting: {
      ...field.formatting,
      displayValue: scenarioNumberDisplayValue(field, committedFieldValue),
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

  if (field.stateMachineFacts.interaction.kind !== "transitions") {
    return field;
  }

  const transition = field.stateMachineFacts.interaction.transitions.find(
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
      field.stateMachineFacts.interaction.transitions.map((candidate) => [
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

function validateScenarioFieldValue(
  fieldName: string,
  field: FieldSchema,
  value: FieldValue | undefined,
  provided: boolean,
  draftValue?: GeneratedFieldDraftInput,
): { kind: "error"; message: string } | { kind: "omit" } | { kind: "set"; value: FieldValue } {
  try {
    const draftResolution =
      draftValue === undefined
        ? undefined
        : resolveGeneratedFieldDraftValue({ draftValue, field, fieldName });

    if (draftResolution?.kind === "error") {
      return { kind: "error", message: draftResolution.error.message };
    }

    const resolvedValue = draftResolution?.kind === "value" ? draftResolution.value : value;

    return validateAuthorityFieldValue(fieldName, field, resolvedValue, provided);
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : `Field "${fieldName}" is invalid.`,
    };
  }
}

function fixtureColorFacts(
  control: FormlessUiFieldControl,
  value: FieldValue | undefined,
): FormlessUiColorFacts | undefined {
  if (control.controlKind !== "color") {
    return undefined;
  }

  const expanded = fixtureExpandedHexColor(typeof value === "string" ? value : "");

  return {
    picker: expanded?.length === 7 ? { kind: "hex", value: expanded } : { kind: "unavailable" },
    swatch: expanded === undefined ? { kind: "unavailable" } : { kind: "hex", value: expanded },
  };
}

function fixtureExpandedHexColor(value: string): string | undefined {
  const clean = value.trim().replace(/^#/, "");

  if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(clean)) {
    return undefined;
  }

  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : clean;

  return `#${expanded.toUpperCase()}`;
}

function withFixtureCurrentColorFacts(field: FormlessUiField): FormlessUiField {
  if (field.control.controlKind !== "color") {
    return field;
  }

  const value =
    field.mode === "display"
      ? field.value
      : isRecordField(field)
        ? field.drafts.draft
        : (field.draftInput?.value ?? field.value);

  return {
    ...field,
    color: fixtureColorFacts(field.control, value),
  };
}

function withFixtureEnumEditorValue(
  field: FormlessUiField,
  value: FieldValue | undefined,
): FormlessUiField {
  if (field.mode !== "editor" || field.field.type !== "enum") {
    return field;
  }

  const style = field.enum?.kind === "editor" ? field.enum.style : "plain";
  const enumOptions = field.options?.enumOptions ?? [];

  return {
    ...field,
    enum: fixtureEnumEditorFacts({
      field: field.field,
      presentation: field.presentation,
      style,
      surface: field.surface,
      value,
    }),
    options: { ...field.options, enumOptions },
  };
}

function withFixtureReferenceValue(
  field: FormlessUiField,
  value: FieldValue | undefined,
  { updateFormatting = false }: { updateFormatting?: boolean } = {},
): FormlessUiField {
  if (field.field.type !== "reference") {
    return field;
  }

  const referenceValue = typeof value === "string" ? value : "";
  const referenceOptions = field.options?.referenceOptions ?? [];
  const selectedOption = referenceOptions.find((option) => option.id === referenceValue);
  const nextField = {
    ...field,
    reference: {
      clearable: !field.required,
      kind: "editor" as const,
      valueStatus: fixtureReferenceValueStatus(value, referenceOptions),
    },
  };

  if (!updateFormatting || !isRecordField(nextField)) {
    return nextField;
  }

  return {
    ...nextField,
    formatting: {
      ...nextField.formatting,
      displayValue: selectedOption?.label ?? referenceValue,
    },
  };
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
