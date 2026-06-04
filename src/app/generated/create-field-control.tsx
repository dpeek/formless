import { useEffect, useRef, useState } from "react";
import type { DateValue } from "@internationalized/date";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { DatePicker, DatePickerTrigger } from "@dpeek/formless-ui/date-picker";
import { Label } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import { TextField } from "@dpeek/formless-ui/text-field";
import { Textarea } from "@dpeek/formless-ui/textarea";
import { useReferenceOptions } from "../../client/store.ts";
import { fieldLabel, type CreateFieldConfig } from "../../client/views.ts";
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

export function GeneratedCreateFieldControl({
  fieldConfig,
  onValueChange,
}: {
  fieldConfig: CreateFieldConfig;
  onValueChange?: (value: FieldVisibilityValue) => void;
}) {
  const { field, fieldName, editor } = fieldConfig;
  const label = fieldLabel(fieldName, field);
  const fieldControl = selectGeneratedFieldControl({ editor, field, label });

  if (fieldControl.controlKind === "checkbox") {
    const completionMode = fieldConfig.presentation?.mode === "completion";

    return (
      <Checkbox
        className={completionMode ? completionCheckboxClassName() : undefined}
        data-formless-field-presentation-mode={completionMode ? "completion" : undefined}
        defaultSelected={fieldControl.createDefaultChecked}
        isRequired={fieldControl.required}
        name={fieldName}
        onChange={(selected) => onValueChange?.(selected)}
      >
        {fieldControl.label}
      </Checkbox>
    );
  }

  if (fieldControl.controlKind === "date") {
    return (
      <CreateDateField
        defaultValue={fieldControl.createDefaultValue}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
      />
    );
  }

  if (fieldControl.controlKind === "color") {
    return (
      <CreateColorField
        defaultValue={fieldControl.createDefaultValue}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
      />
    );
  }

  if (fieldControl.controlKind === "markdown") {
    return (
      <CreateMarkdownField
        defaultValue={fieldControl.createDefaultValue}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
      />
    );
  }

  if (fieldControl.controlKind === "icon") {
    return (
      <CreateIconField
        defaultValue={fieldControl.createDefaultValue}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
      />
    );
  }

  if (fieldControl.controlKind === "image") {
    return (
      <TextField
        defaultValue={fieldControl.createDefaultValue}
        isRequired={fieldControl.required}
        name={fieldName}
        onChange={(value) => onValueChange?.(value)}
        type="text"
      >
        <Label>{fieldControl.label}</Label>
        <Input {...fieldControl.inputAttributes} />
      </TextField>
    );
  }

  if (fieldControl.controlKind === "number") {
    return (
      <CreateNumberField
        defaultValue={fieldControl.createDefaultValue}
        fieldName={fieldName}
        inputAttributes={fieldControl.inputAttributes}
        label={fieldControl.label}
        required={fieldControl.required}
      />
    );
  }

  if (fieldControl.kind === "enum") {
    return (
      <NativeSelect>
        <Label>{fieldControl.label}</Label>
        <NativeSelectContent
          aria-label={fieldControl.label}
          defaultValue={fieldControl.createDefaultValue}
          name={fieldName}
          onChange={(event) => onValueChange?.(event.currentTarget.value)}
          required={fieldControl.required}
        >
          {fieldControl.required ? null : <option value="" />}
          {Object.entries(fieldControl.field.values).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </NativeSelectContent>
      </NativeSelect>
    );
  }

  if (fieldControl.kind === "reference") {
    return (
      <ReferenceCreateField
        defaultValue={fieldControl.createDefaultValue}
        field={fieldControl.field}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
      />
    );
  }

  if (fieldControl.controlKind === "textarea") {
    return (
      <TextField
        defaultValue={fieldControl.createDefaultValue}
        isRequired={fieldControl.required}
        name={fieldName}
        onChange={(value) => onValueChange?.(value)}
      >
        <Label>{fieldControl.label}</Label>
        <Textarea />
      </TextField>
    );
  }

  return (
    <TextField
      defaultValue={fieldControl.createDefaultValue}
      isRequired={fieldControl.required}
      name={fieldName}
      onChange={(value) => onValueChange?.(value)}
      type={fieldControl.control.kind === "input" ? fieldControl.control.inputType : "text"}
    >
      <Label>{fieldControl.label}</Label>
      <Input />
    </TextField>
  );
}

function CreateDateField({
  defaultValue,
  fieldName,
  label,
  onValueChange,
  required,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
}) {
  const resetValue = defaultValue ?? "";
  const [value, setValue] = useState<DateValue | null>(
    () => storedDateValueToDateValue(resetValue).value,
  );
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const storedValue = dateValueToStoredDateValue(value);

  useEffect(() => {
    const form = hiddenInputRef.current?.form;

    if (!form) {
      return;
    }

    const handleReset = () => setValue(storedDateValueToDateValue(resetValue).value);
    form.addEventListener("reset", handleReset);

    return () => form.removeEventListener("reset", handleReset);
  }, [resetValue]);

  return (
    <DatePicker
      isRequired={required}
      onChange={(nextValue) => {
        setValue(nextValue);
        onValueChange?.(dateValueToStoredDateValue(nextValue));
      }}
      value={value}
    >
      <Label>{label}</Label>
      <DatePickerTrigger />
      <input name={fieldName} readOnly ref={hiddenInputRef} type="hidden" value={storedValue} />
    </DatePicker>
  );
}

function CreateIconField({
  defaultValue,
  fieldName,
  label,
  onValueChange,
  required,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
}) {
  const resetValue = defaultValue ?? "";
  const [value, setValue] = useState(resetValue);
  const [dialogDraft, setDialogDraft] = useState(resetValue);
  const [dialogOpen, setDialogOpen] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = hiddenInputRef.current?.form;

    if (!form) {
      return;
    }

    const handleReset = () => {
      setValue(resetValue);
      setDialogDraft(resetValue);
      setDialogOpen(false);
    };
    form.addEventListener("reset", handleReset);

    return () => form.removeEventListener("reset", handleReset);
  }, [resetValue]);

  function handleOpenChange(open: boolean) {
    setDialogDraft(value);
    setDialogOpen(open);
  }

  function handleCancel() {
    setDialogDraft(value);
    setDialogOpen(false);
  }

  function handleSave() {
    setValue(dialogDraft);
    onValueChange?.(dialogDraft);
    setDialogOpen(false);
  }

  return (
    <TextField isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly ref={hiddenInputRef} type="hidden" value={value} />
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
    </TextField>
  );
}

function CreateMarkdownField({
  defaultValue,
  fieldName,
  label,
  onValueChange,
  required,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
}) {
  const resetValue = defaultValue ?? "";
  const [value, setValue] = useState(resetValue);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = hiddenInputRef.current?.form;

    if (!form) {
      return;
    }

    const handleReset = () => setValue(resetValue);
    form.addEventListener("reset", handleReset);

    return () => form.removeEventListener("reset", handleReset);
  }, [resetValue]);

  return (
    <TextField isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly ref={hiddenInputRef} type="hidden" value={value} />
      <GeneratedMarkdownFieldControl
        label={label}
        onChange={(nextValue) => {
          setValue(nextValue);
          onValueChange?.(nextValue);
        }}
        value={value}
      />
    </TextField>
  );
}

function CreateColorField({
  defaultValue,
  fieldName,
  label,
  onValueChange,
  required,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
}) {
  const resetValue = defaultValue ?? "";
  const [value, setValue] = useState(resetValue);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = hiddenInputRef.current?.form;

    if (!form) {
      return;
    }

    const handleReset = () => setValue(resetValue);
    form.addEventListener("reset", handleReset);

    return () => form.removeEventListener("reset", handleReset);
  }, [resetValue]);

  return (
    <TextField isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly ref={hiddenInputRef} type="hidden" value={value} />
      <GeneratedColorFieldControl
        label={label}
        onChange={(nextValue) => {
          setValue(nextValue);
          onValueChange?.(nextValue);
        }}
        required={required}
        value={value}
      />
    </TextField>
  );
}

function CreateNumberField({
  defaultValue,
  fieldName,
  inputAttributes,
  label,
  required,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  inputAttributes: GeneratedFieldControl["inputAttributes"];
  label: string;
  required: boolean;
}) {
  const resetValue = encodeNumberCreateDefaultValue(defaultValue);
  const [value, setValue] = useState(resetValue);
  const fieldRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = fieldRef.current?.closest("form");

    if (!form) {
      return;
    }

    const handleReset = () => setValue(resetValue);
    form.addEventListener("reset", handleReset);

    return () => form.removeEventListener("reset", handleReset);
  }, [resetValue]);

  return (
    <TextField isRequired={required}>
      <Label>{label}</Label>
      <span className="block" data-slot="control" ref={fieldRef}>
        <GeneratedNumberFieldControl
          aria-label={label}
          name={fieldName}
          onValueChange={setValue}
          required={required}
          value={value}
          {...inputAttributes}
        />
      </span>
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
  defaultValue,
  field,
  fieldName,
  label,
  onValueChange,
  required,
}: {
  defaultValue: string | undefined;
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
}) {
  const options = useReferenceOptions(field.to, field.displayField);

  return (
    <NativeSelect>
      <Label>{label}</Label>
      <NativeSelectContent
        aria-label={label}
        defaultValue={defaultValue}
        name={fieldName}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        required={required}
      >
        {required ? null : <option value="" />}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelectContent>
    </NativeSelect>
  );
}
