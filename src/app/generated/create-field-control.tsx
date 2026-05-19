import { useEffect, useRef, useState } from "react";
import { DateInput } from "@dpeek/formless-ui/date";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { Field } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { Label } from "@dpeek/formless-ui/label";
import { NativeSelect, NativeSelectOption } from "@dpeek/formless-ui/native-select";
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
      <Field orientation="horizontal">
        <Checkbox
          defaultChecked={fieldControl.createDefaultChecked}
          name={fieldName}
          onCheckedChange={(checked) => onValueChange?.(checked)}
        />
        <Label>{fieldControl.label}</Label>
      </Field>
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
      <Field>
        <Label>{fieldControl.label}</Label>
        <CreateNumberField
          defaultValue={fieldControl.createDefaultValue}
          fieldName={fieldName}
          inputAttributes={fieldControl.inputAttributes}
          label={fieldControl.label}
          required={fieldControl.required}
        />
      </Field>
    );
  }

  if (fieldControl.kind === "enum") {
    return (
      <Field>
        <Label>{fieldControl.label}</Label>
        <NativeSelect
          className="w-full"
          defaultValue={fieldControl.createDefaultValue}
          name={fieldName}
          onChange={(event) => onValueChange?.(event.currentTarget.value)}
          required={fieldControl.required}
        >
          {fieldControl.required ? null : <NativeSelectOption value="" />}
          {Object.entries(fieldControl.field.values).map(([value, option]) => (
            <NativeSelectOption key={value} value={value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
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
      <Field>
        <Label>{fieldControl.label}</Label>
        <Textarea
          defaultValue={fieldControl.createDefaultValue}
          name={fieldName}
          onChange={(event) => onValueChange?.(event.currentTarget.value)}
          required={fieldControl.required}
        />
      </Field>
    );
  }

  return (
    <Field>
      <Label>{fieldControl.label}</Label>
      <Input
        defaultValue={fieldControl.createDefaultValue}
        name={fieldName}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        required={fieldControl.required}
        type={fieldControl.control.kind === "input" ? fieldControl.control.inputType : "text"}
      />
    </Field>
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
    <span className="block" ref={fieldRef}>
      <GeneratedNumberFieldControl
        aria-label={label}
        name={fieldName}
        onValueChange={setValue}
        required={required}
        value={value}
        {...inputAttributes}
      />
    </span>
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
    <Field>
      <Label>{label}</Label>
      <NativeSelect
        className="w-full"
        defaultValue={defaultValue}
        name={fieldName}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        required={required}
      >
        {required ? null : <NativeSelectOption value="" />}
        {options.map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
