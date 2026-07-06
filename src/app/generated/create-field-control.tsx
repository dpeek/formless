import { useEffect, useState } from "react";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { DatePicker, DatePickerTrigger } from "@dpeek/formless-ui/date-picker";
import { FieldError, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import { TextField } from "@dpeek/formless-ui/text-field";
import { Textarea } from "@dpeek/formless-ui/textarea";
import { useReferenceOptions, type ReferenceOption } from "../../client/store.ts";
import { fieldLabel, type CreateFieldConfig } from "../../client/views.ts";
import type { CreateDraftFieldInput } from "@dpeek/formless-schema";
import type { FieldVisibilityValue } from "@dpeek/formless-schema";
import type { FieldSchema } from "@dpeek/formless-schema";
import {
  GeneratedColorFieldControl,
  GeneratedIconPickerFieldControl,
  GeneratedMarkdownFieldControl,
  GeneratedNumberFieldControl,
} from "./field-control-primitives.tsx";
import { dateValueToStoredDateValue, storedDateValueToDateValue } from "./date-value.ts";
import { selectGeneratedFieldControl, type GeneratedFieldControl } from "./field-controls.ts";
import { completionCheckboxClassName } from "./field-presentation.tsx";
import { encodeNumberEditorInputValue, numberInputValueToFieldValue } from "./format.ts";
import {
  EMPTY_GENERATED_REFERENCE_OPTIONS,
  shouldUseAppReplicaReferenceOptions,
} from "./reference-field-options.ts";
import { StateMachineStateBadge } from "./state-machine-ui.tsx";

export function GeneratedCreateFieldControl({
  draftValue,
  error,
  fieldConfig,
  onValueChange,
}: {
  draftValue?: CreateDraftFieldInput;
  error?: string;
  fieldConfig: CreateFieldConfig;
  onValueChange?: (value: FieldVisibilityValue) => void;
}) {
  const { field, fieldName, editor } = fieldConfig;
  const label = fieldLabel(fieldName, field);
  const fieldControl = selectGeneratedFieldControl({ editor, field, label });

  if (field.type === "enum" && fieldConfig.stateMachine) {
    return (
      <CreateStateMachineField
        field={field}
        fieldName={fieldName}
        label={label}
        onValueChange={onValueChange}
        stateMachine={fieldConfig.stateMachine}
        value={draftValueToString(draftValue, fieldConfig.stateMachine.initialState)}
      />
    );
  }

  if (fieldControl.controlKind === "checkbox") {
    const completionMode = fieldConfig.presentation?.mode === "completion";

    return (
      <div className="space-y-1">
        <Checkbox
          className={completionMode ? completionCheckboxClassName() : undefined}
          data-formless-field-presentation-mode={completionMode ? "completion" : undefined}
          isInvalid={error !== undefined}
          isRequired={fieldControl.required}
          isSelected={draftValueToBoolean(draftValue, fieldControl.createDefaultChecked)}
          name={fieldName}
          onChange={(selected) => onValueChange?.(selected)}
        >
          {fieldControl.label}
        </Checkbox>
        {error ? <StaticFieldError>{error}</StaticFieldError> : null}
      </div>
    );
  }

  if (fieldControl.controlKind === "date") {
    return (
      <CreateDateField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "color") {
    return (
      <CreateColorField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "markdown") {
    return (
      <CreateMarkdownField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "icon") {
    return (
      <CreateIconField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "image") {
    return (
      <TextField
        isInvalid={error !== undefined}
        isRequired={fieldControl.required}
        name={fieldName}
        onChange={(value) => onValueChange?.(value)}
        type="text"
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      >
        <Label>{fieldControl.label}</Label>
        <Input {...fieldControl.inputAttributes} />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    );
  }

  if (fieldControl.controlKind === "number") {
    return (
      <CreateNumberField
        error={error}
        fieldName={fieldName}
        inputAttributes={fieldControl.inputAttributes}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(
          draftValue,
          encodeNumberCreateDefaultValue(fieldControl.createDefaultValue),
        )}
      />
    );
  }

  if (fieldControl.kind === "enum") {
    const value = draftValueToString(draftValue, fieldControl.createDefaultValue ?? "");

    return (
      <NativeSelect>
        <Label>{fieldControl.label}</Label>
        <NativeSelectContent
          aria-label={fieldControl.label}
          isInvalid={error !== undefined}
          name={fieldName}
          onChange={(event) => onValueChange?.(event.currentTarget.value)}
          required={fieldControl.required}
          value={value}
        >
          {fieldControl.required ? null : <option value="" />}
          {Object.entries(fieldControl.field.values).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </NativeSelectContent>
        {error ? <StaticFieldError>{error}</StaticFieldError> : null}
      </NativeSelect>
    );
  }

  if (fieldControl.kind === "reference") {
    return (
      <ReferenceCreateField
        defaultValue={fieldControl.createDefaultValue}
        error={error}
        field={fieldControl.field}
        fieldName={fieldName}
        hasDraftValue={draftValue !== undefined}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "textarea") {
    return (
      <TextField
        isInvalid={error !== undefined}
        isRequired={fieldControl.required}
        name={fieldName}
        onChange={(value) => onValueChange?.(value)}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      >
        <Label>{fieldControl.label}</Label>
        <Textarea />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    );
  }

  return (
    <TextField
      isInvalid={error !== undefined}
      isRequired={fieldControl.required}
      name={fieldName}
      onChange={(value) => onValueChange?.(value)}
      type={fieldControl.control.kind === "input" ? fieldControl.control.inputType : "text"}
      value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
    >
      <Label>{fieldControl.label}</Label>
      <Input />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateStateMachineField({
  field,
  fieldName,
  label,
  onValueChange,
  stateMachine,
  value,
}: {
  field: Extract<FieldSchema, { type: "enum" }>;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  stateMachine: NonNullable<CreateFieldConfig["stateMachine"]>;
  value: string;
}) {
  return (
    <div className="space-y-1" data-formless-state-machine-create={fieldName}>
      <Label>{label}</Label>
      <StateMachineStateBadge
        field={field}
        label={label}
        stateMachine={stateMachine}
        value={value}
      />
      <input
        name={fieldName}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        readOnly
        type="hidden"
        value={value}
      />
    </div>
  );
}

function CreateDateField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  const dateValue = storedDateValueToDateValue(value).value;

  return (
    <DatePicker
      isInvalid={error !== undefined}
      isRequired={required}
      onChange={(nextValue) => {
        onValueChange?.(dateValueToStoredDateValue(nextValue));
      }}
      value={dateValue}
    >
      <Label>{label}</Label>
      <DatePickerTrigger />
      <input name={fieldName} readOnly type="hidden" value={value} />
      {error ? <FieldError>{error}</FieldError> : null}
    </DatePicker>
  );
}

function CreateIconField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  const [dialogDraft, setDialogDraft] = useState(value);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!dialogOpen) {
      setDialogDraft(value);
    }
  }, [dialogOpen, value]);

  function handleOpenChange(open: boolean) {
    setDialogDraft(value);
    setDialogOpen(open);
  }

  function handleCancel() {
    setDialogDraft(value);
    setDialogOpen(false);
  }

  function handleSave() {
    onValueChange?.(dialogDraft);
    setDialogOpen(false);
  }

  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly type="hidden" value={value} />
      <div data-slot="control">
        <GeneratedIconPickerFieldControl
          label={label}
          onCancel={handleCancel}
          onChange={setDialogDraft}
          onOpenChange={handleOpenChange}
          onSave={handleSave}
          open={dialogOpen}
          previewSource={value}
          value={dialogDraft}
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateMarkdownField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly type="hidden" value={value} />
      <GeneratedMarkdownFieldControl
        label={label}
        onChange={(nextValue) => {
          onValueChange?.(nextValue);
        }}
        value={value}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateColorField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly type="hidden" value={value} />
      <GeneratedColorFieldControl
        label={label}
        onChange={(nextValue) => {
          onValueChange?.(nextValue);
        }}
        required={required}
        value={value}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateNumberField({
  error,
  fieldName,
  inputAttributes,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  inputAttributes: GeneratedFieldControl["inputAttributes"];
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <span className="block" data-slot="control">
        <GeneratedNumberFieldControl
          aria-label={label}
          name={fieldName}
          onValueChange={(nextValue) => onValueChange?.(nextValue)}
          required={required}
          value={value}
          {...inputAttributes}
        />
      </span>
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function encodeNumberCreateDefaultValue(value: string | undefined) {
  const fieldValue = numberInputValueToFieldValue(value ?? "");

  return typeof fieldValue === "number" && Number.isFinite(fieldValue)
    ? encodeNumberEditorInputValue(fieldValue, "plain")
    : "";
}

function ReferenceCreateField({
  error,
  field,
  hasDraftValue,
  ...props
}: {
  defaultValue: string | undefined;
  error?: string;
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldName: string;
  hasDraftValue: boolean;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  if (!shouldUseAppReplicaReferenceOptions(field)) {
    return (
      <ReferenceCreateFieldSelect
        {...props}
        error={error}
        hasDraftValue={hasDraftValue}
        options={EMPTY_GENERATED_REFERENCE_OPTIONS}
      />
    );
  }

  return (
    <LocalReferenceCreateField
      {...props}
      error={error}
      field={field}
      hasDraftValue={hasDraftValue}
    />
  );
}

function LocalReferenceCreateField({
  defaultValue,
  error,
  field,
  fieldName,
  hasDraftValue,
  label,
  onValueChange,
  required,
  value,
}: {
  defaultValue: string | undefined;
  error?: string;
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldName: string;
  hasDraftValue: boolean;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  const options = useReferenceOptions(field.to, field.displayField);

  return (
    <ReferenceCreateFieldSelect
      defaultValue={defaultValue}
      error={error}
      fieldName={fieldName}
      hasDraftValue={hasDraftValue}
      label={label}
      onValueChange={onValueChange}
      options={options}
      required={required}
      value={value}
    />
  );
}

function ReferenceCreateFieldSelect({
  defaultValue,
  error,
  fieldName,
  hasDraftValue,
  label,
  onValueChange,
  options,
  required,
  value,
}: {
  defaultValue: string | undefined;
  error?: string;
  fieldName: string;
  hasDraftValue: boolean;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  options: readonly ReferenceOption[];
  required: boolean;
  value: string;
}) {
  const selectedValue = hasDraftValue
    ? value
    : (defaultValue ?? (required ? (options[0]?.id ?? "") : ""));

  useEffect(() => {
    if (!hasDraftValue && selectedValue !== "") {
      onValueChange?.(selectedValue);
    }
  }, [hasDraftValue, onValueChange, selectedValue]);

  return (
    <NativeSelect>
      <Label>{label}</Label>
      <NativeSelectContent
        aria-label={label}
        isInvalid={error !== undefined}
        name={fieldName}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        required={required}
        value={selectedValue}
      >
        {required ? null : <option value="" />}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelectContent>
      {error ? <StaticFieldError>{error}</StaticFieldError> : null}
    </NativeSelect>
  );
}

function draftValueToString(draftValue: CreateDraftFieldInput | undefined, fallback: string) {
  if (draftValue === undefined) {
    return fallback;
  }

  return String(draftValue.value);
}

function draftValueToBoolean(draftValue: CreateDraftFieldInput | undefined, fallback: boolean) {
  if (draftValue === undefined) {
    return fallback;
  }

  return draftValue.value === true || draftValue.value === "true" || draftValue.value === "on";
}

function StaticFieldError({ children }: { children: string }) {
  return (
    <div className={fieldErrorStyles()} data-slot="field-error" role="alert" slot="errorMessage">
      {children}
    </div>
  );
}
