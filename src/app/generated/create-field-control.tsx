import { useEffect, useRef, useState } from "react";
import { DateInput } from "@dpeek/formless-ui/date";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { Field, Label } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import { TextField } from "@dpeek/formless-ui/text-field";
import { Textarea } from "@dpeek/formless-ui/textarea";
import { useReferenceOptions } from "../../client/store.ts";
import { fieldLabel, type CreateFieldConfig } from "../../client/views.ts";
import type { FieldVisibilityValue } from "../../shared/schema.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import {
  GeneratedColorFieldControl,
  GeneratedIconSourceFieldControl,
  GeneratedMarkdownFieldControl,
  GeneratedNumberFieldControl,
} from "./field-control-primitives.tsx";
import { selectGeneratedFieldControl, type GeneratedFieldControl } from "./field-controls.ts";
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
    return (
      <Checkbox
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
      <Field>
        <Label>{fieldControl.label}</Label>
        <DateInput
          defaultValue={fieldControl.createDefaultValue}
          name={fieldName}
          required={fieldControl.required}
        />
      </Field>
    );
  }

  if (fieldControl.controlKind === "color") {
    return (
      <Field>
        <Label>{fieldControl.label}</Label>
        <CreateColorField
          defaultValue={fieldControl.createDefaultValue}
          fieldName={fieldName}
          label={fieldControl.label}
          required={fieldControl.required}
        />
      </Field>
    );
  }

  if (fieldControl.controlKind === "markdown") {
    return (
      <Field>
        <Label>{fieldControl.label}</Label>
        <CreateMarkdownField
          defaultValue={fieldControl.createDefaultValue}
          fieldName={fieldName}
          label={fieldControl.label}
        />
      </Field>
    );
  }

  if (fieldControl.controlKind === "icon") {
    return (
      <Field>
        <Label>{fieldControl.label}</Label>
        <CreateIconField
          defaultValue={fieldControl.createDefaultValue}
          fieldName={fieldName}
          label={fieldControl.label}
          required={fieldControl.required}
        />
      </Field>
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

function CreateIconField({
  defaultValue,
  fieldName,
  label,
  required,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  label: string;
  required: boolean;
}) {
  const resetValue = defaultValue ?? "";
  const [value, setValue] = useState(resetValue);
  const fieldRef = useRef<HTMLDivElement>(null);

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
    <div ref={fieldRef}>
      <GeneratedIconSourceFieldControl
        label={label}
        name={fieldName}
        onChange={setValue}
        required={required}
        value={value}
      />
    </div>
  );
}

function CreateMarkdownField({
  defaultValue,
  fieldName,
  label,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  label: string;
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
    <>
      <input name={fieldName} readOnly ref={hiddenInputRef} type="hidden" value={value} />
      <GeneratedMarkdownFieldControl label={label} onChange={setValue} value={value} />
    </>
  );
}

function CreateColorField({
  defaultValue,
  fieldName,
  label,
  required,
}: {
  defaultValue: string | undefined;
  fieldName: string;
  label: string;
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
    <>
      <input name={fieldName} readOnly ref={hiddenInputRef} type="hidden" value={value} />
      <GeneratedColorFieldControl
        label={label}
        onChange={setValue}
        required={required}
        value={value}
      />
    </>
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
