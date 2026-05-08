import { useEffect, useState } from "react";
import { Checkbox } from "@formless/ui/checkbox";
import { ColorInput } from "@formless/ui/color";
import { DateInput } from "@formless/ui/date";
import { Field, FieldError } from "@formless/ui/field";
import { Input } from "@formless/ui/input";
import { Label } from "@formless/ui/label";
import { MarkdownEditor } from "@formless/ui/markdown";
import { NativeSelect, NativeSelectOption } from "@formless/ui/native-select";
import { FormattedNumberInput } from "@formless/ui/number-input";
import { Textarea } from "@formless/ui/textarea";
import { AutosizeTextInput } from "@formless/ui/text-input";
import { ValueUnitInput } from "@formless/ui/value-unit-input";
import { useRecordField, useReferenceOptions } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitPatchMutation } from "../../client/sync.ts";
import { fieldLabel, type RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { selectGeneratedFieldEditorAdapter } from "./field-ui-adapters.ts";
import {
  decodeNumberEditorInputValue,
  encodeNumberEditorInputValue,
  fieldValueToInputValue,
  inputValueToFieldValue,
} from "./format.ts";
import { useSchemaKey } from "./schema-app-context.tsx";

export function RecordFieldEditor({
  canPatch,
  density = "default",
  entityName,
  fieldConfig,
  presentation = "default",
  recordId,
  showLabel = false,
}: {
  canPatch: boolean;
  density?: "default" | "compact";
  entityName: string;
  fieldConfig: RecordFieldConfig;
  presentation?: "default" | "heading";
  recordId: string;
  showLabel?: boolean;
}) {
  const schemaKey = useSchemaKey();
  const { commit: commitPolicy, editor, field, fieldName } = fieldConfig;
  const adapter = selectGeneratedFieldEditorAdapter(field, editor);
  const numberFormat = fieldConfig.format ?? "plain";
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const labelClass =
    showLabel && presentation !== "heading" ? "text-xs font-medium text-slate-600" : "sr-only";
  const recordValue = useRecordField(recordId, fieldName);
  const valueUnitConfig = fieldConfig.valueUnit;
  const unitRecordValue = useRecordField(recordId, valueUnitConfig?.unitFieldName ?? fieldName);
  const [draft, setDraft] = useState(() =>
    fieldValueToEditorInputValue(field, recordValue, numberFormat),
  );
  const [unitDraft, setUnitDraft] = useState(() =>
    valueUnitConfig ? fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue) : "",
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
  }, [field, numberFormat, recordValue]);

  useEffect(() => {
    setUnitDraft(
      valueUnitConfig ? fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue) : "",
    );
  }, [unitRecordValue, valueUnitConfig]);

  async function commitPatch(values: Partial<RecordValues>) {
    if (!canPatch || isPending) {
      return;
    }

    const patchValues: Partial<RecordValues> = {};

    for (const [patchFieldName, value] of Object.entries(values)) {
      const currentValue = currentValueForPatchField(patchFieldName);

      if (currentValue === value || (currentValue === undefined && value === "")) {
        continue;
      }

      patchValues[patchFieldName] = value;
    }

    const patchFieldNames = Object.keys(patchValues);

    if (patchFieldNames.length === 0) {
      return;
    }

    setIsPending(true);
    setSyncStatus({ state: "syncing", message: `Updating ${patchFieldNames.join(", ")}...` });

    try {
      await submitPatchMutation(schemaKey, entityName, recordId, patchValues);
      setError(null);
      setSyncStatus({ state: "idle", message: "Updated and synced." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";

      setDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
      setUnitDraft(
        valueUnitConfig ? fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue) : "",
      );
      setError(message);
      setSyncStatus({
        state: "error",
        message,
      });
    } finally {
      setIsPending(false);
    }
  }

  function currentValueForPatchField(patchFieldName: string) {
    if (patchFieldName === fieldName) {
      return recordValue;
    }

    if (valueUnitConfig && patchFieldName === valueUnitConfig.unitFieldName) {
      return unitRecordValue;
    }

    return undefined;
  }

  async function commit(value: FieldValue) {
    await commitPatch({ [fieldName]: value });
  }

  if (adapter.kind === "boolean") {
    if (showLabel) {
      return (
        <div className="min-w-28 flex-none space-y-1">
          <Label className={labelClass}>{label}</Label>
          <Field orientation="horizontal">
            <Checkbox
              aria-label={label}
              checked={recordValue === true}
              className="size-4 rounded border-slate-300"
              disabled={!canPatch || isPending}
              onCheckedChange={(checked) => {
                if (commitPolicy === "immediate") {
                  void commit(checked);
                }
              }}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </div>
      );
    }

    return (
      <div className={`${density === "compact" ? "h-6" : "h-7"} flex shrink-0 items-center`}>
        <Field orientation="horizontal">
          <Checkbox
            aria-label={label}
            checked={recordValue === true}
            className="size-4 rounded border-slate-300"
            disabled={!canPatch || isPending}
            onCheckedChange={(checked) => {
              if (commitPolicy === "immediate") {
                void commit(checked);
              }
            }}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
      </div>
    );
  }

  if (adapter.kind === "enum") {
    const unknownValue = draft !== "" && !Object.hasOwn(adapter.field.values, draft) ? draft : null;

    return (
      <div
        className={
          density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-40 flex-none space-y-1"
        }
      >
        <Field>
          <Label className={labelClass}>{label}</Label>
          <NativeSelect
            aria-label={label}
            className="w-full"
            disabled={!canPatch || isPending}
            size={density === "compact" ? "sm" : "default"}
            onChange={(event) => {
              const value = event.currentTarget.value;

              setDraft(value);
              void commit(inputValueToFieldValue(field, value));
            }}
            required={adapter.required}
            value={draft}
          >
            {!adapter.required || draft === "" ? <NativeSelectOption value="" /> : null}
            {unknownValue ? (
              <NativeSelectOption value={unknownValue}>{unknownValue}</NativeSelectOption>
            ) : null}
            {Object.entries(adapter.field.values).map(([value, option]) => (
              <NativeSelectOption key={value} value={value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    );
  }

  if (adapter.kind === "reference") {
    return (
      <RecordReferenceEditor
        canPatch={canPatch}
        density={density}
        draft={draft}
        error={error}
        field={adapter.field}
        isPending={isPending}
        label={label}
        labelClass={labelClass}
        onCommit={commit}
        onDraftChange={setDraft}
      />
    );
  }

  const control = adapter.control;
  const isMarkdownEditor = adapter.kind === "text" && adapter.editor === "markdown";
  const isRichMarkdownEditor = isMarkdownEditor && density !== "compact";
  const isMultilineTextEditor = control.kind === "textarea" && !isRichMarkdownEditor;
  const isColorEditor = adapter.kind === "text" && adapter.editor === "color";
  const isDateEditor = control.kind === "input" && control.inputType === "date";
  const isNumberEditor = adapter.kind === "number";
  const isValueUnitEditor = isNumberEditor && valueUnitConfig !== undefined;
  const isHeadingTextEditor =
    presentation === "heading" &&
    adapter.kind === "text" &&
    adapter.editor === "text" &&
    control.kind === "input" &&
    control.inputType === "text";
  const isAutosizeTextEditor =
    isHeadingTextEditor ||
    (adapter.kind === "text" &&
      adapter.editor === "text" &&
      control.kind === "input" &&
      control.inputType === "text" &&
      (density === "compact" || (!showLabel && isTitleLikeTextField(fieldName, field))));

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(inputValueToFieldValue(field, event.currentTarget.value));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(fieldValueToInputValue(field, recordValue));
    }
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(fieldValueToInputValue(field, recordValue));
    }
  }

  function handleMarkdownBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
      return;
    }

    if (commitPolicy === "field-commit") {
      void commit(inputValueToFieldValue(field, draft));
    }
  }

  function handleMarkdownKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(fieldValueToInputValue(field, recordValue));
    }
  }

  return (
    <div
      className={
        density === "compact"
          ? "w-full min-w-0 space-y-1"
          : isDateEditor || isNumberEditor
            ? "min-w-36 flex-none space-y-1"
            : "min-w-52 flex-1 space-y-1"
      }
    >
      <Field>
        <Label className={labelClass}>{label}</Label>
        {isRichMarkdownEditor ? (
          <MarkdownEditor
            aria-invalid={error !== null}
            aria-label={label}
            className="min-h-40 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            onBlur={handleMarkdownBlur}
            onChange={setDraft}
            onKeyDown={handleMarkdownKeyDown}
            placeholder={label}
            readOnly={!canPatch || isPending}
            value={draft}
          />
        ) : isMultilineTextEditor ? (
          <Textarea
            aria-label={label}
            className={
              density === "compact"
                ? "min-h-20 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                : "min-h-28 w-full rounded border border-slate-300 px-3 py-2"
            }
            disabled={!canPatch || isPending}
            onBlur={(event) => {
              if (commitPolicy === "field-commit") {
                void commit(inputValueToFieldValue(field, event.currentTarget.value));
              }
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleTextareaKeyDown}
            required={adapter.required}
            value={draft}
          />
        ) : isColorEditor ? (
          <ColorInput
            ariaLabel={label}
            className={
              density === "compact"
                ? "w-full [&_[data-slot=input-group]]:h-6 [&_input]:h-6 [&_input]:text-xs"
                : "w-full"
            }
            disabled={!canPatch || isPending}
            error={error ?? undefined}
            onBlur={() => {
              if (commitPolicy === "field-commit") {
                void commit(inputValueToFieldValue(field, draft));
              }
            }}
            onChange={setDraft}
            required={adapter.required}
            value={draft}
          />
        ) : isAutosizeTextEditor ? (
          <AutosizeTextInput
            aria-invalid={error !== null ? true : undefined}
            aria-label={label}
            autoSelect
            className={
              isHeadingTextEditor
                ? "w-full min-w-0"
                : density === "compact"
                  ? "w-full min-w-0"
                  : "min-w-[8ch] max-w-full"
            }
            commitOnBlur={commitPolicy === "field-commit"}
            controlClassName={
              isHeadingTextEditor
                ? "h-9 w-full text-2xl font-semibold"
                : density === "compact"
                  ? "h-6 w-full text-xs"
                  : "h-7 w-full text-sm font-medium"
            }
            disabled={!canPatch || isPending}
            onValueChange={setDraft}
            onValueCommit={(value) => {
              void commit(inputValueToFieldValue(field, value));
            }}
            onValueRevert={() => {
              setDraft(fieldValueToInputValue(field, recordValue));
            }}
            placeholder={label}
            required={adapter.required}
            type="text"
            value={draft}
            {...adapter.inputAttributes}
          />
        ) : isDateEditor ? (
          <DateInput
            aria-label={label}
            className={
              density === "compact"
                ? "h-6 w-full rounded border border-slate-300 text-xs"
                : "w-full rounded border border-slate-300"
            }
            disabled={!canPatch || isPending}
            onBlur={(event) => {
              if (commitPolicy === "field-commit") {
                void commit(inputValueToFieldValue(field, event.currentTarget.value));
              }
            }}
            onKeyDown={handleInputKeyDown}
            onValueCommit={(value) => {
              if (commitPolicy === "field-commit") {
                void commit(inputValueToFieldValue(field, value));
              }
            }}
            onValueChange={setDraft}
            required={adapter.required}
            value={draft}
          />
        ) : isValueUnitEditor ? (
          <ValueUnitInput
            className="w-full"
            commitOnBlur={commitPolicy === "field-commit"}
            decode={(value) => decodeNumberEditorInputValue(value, numberFormat)}
            disabled={!canPatch || isPending}
            encode={(value) => encodeNumberEditorInputValue(value, numberFormat)}
            inputClassName={
              density === "compact"
                ? "h-6 rounded border border-slate-300 px-2 py-0.5 text-xs"
                : "rounded border border-slate-300 px-3 py-2"
            }
            inputRequired={adapter.required}
            inputValue={draft}
            label={label}
            onInputValueChange={setDraft}
            onInputValueCommit={(value) => {
              setError(null);
              void commitPatch({
                [fieldName]: value,
                [valueUnitConfig.unitFieldName]: inputValueToFieldValue(
                  valueUnitConfig.unitField,
                  unitDraft,
                ),
              });
            }}
            onInputValueRevert={() => {
              setDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
              setUnitDraft(fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue));
            }}
            onInvalidCommit={(message) => {
              setError(message);
            }}
            onUnitChange={setUnitDraft}
            onUnitCommit={(unit) => {
              setError(null);
              void commitPatch(
                valueUnitPatch(fieldName, draft, numberFormat, valueUnitConfig, unit),
              );
            }}
            options={enumValueUnitOptions(valueUnitConfig.unitField)}
            unit={unitDraft}
            unitClassName={density === "compact" ? "w-16" : "w-24"}
            unitLabel={`${label} unit`}
            unitRequired={valueUnitConfig.unitField.required}
          />
        ) : isNumberEditor ? (
          <FormattedNumberInput
            aria-invalid={error !== null ? true : undefined}
            aria-label={label}
            className={
              density === "compact"
                ? "h-6 w-full rounded border border-slate-300 px-2 py-0.5 text-xs"
                : "w-full rounded border border-slate-300 px-3 py-2"
            }
            commitOnBlur={commitPolicy === "field-commit"}
            decode={(value) => decodeNumberEditorInputValue(value, numberFormat)}
            disabled={!canPatch || isPending}
            encode={(value) => encodeNumberEditorInputValue(value, numberFormat)}
            onInvalidCommit={(message) => {
              setError(message);
            }}
            onValueChange={setDraft}
            onValueCommit={(value) => {
              setError(null);
              void commit(value);
            }}
            onValueRevert={() => {
              setDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
            }}
            required={adapter.required}
            value={draft}
            {...adapter.inputAttributes}
          />
        ) : (
          <Input
            aria-label={label}
            className={
              density === "compact"
                ? "h-6 w-full rounded border border-slate-300 px-2 py-0.5 text-xs"
                : "w-full rounded border border-slate-300 px-3 py-2"
            }
            disabled={!canPatch || isPending}
            onBlur={(event) => {
              if (commitPolicy === "field-commit") {
                void commit(inputValueToFieldValue(field, event.currentTarget.value));
              }
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            required={adapter.required}
            {...adapter.inputAttributes}
            type={control.kind === "input" ? control.inputType : "text"}
            value={draft}
          />
        )}
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

function valueUnitPatch(
  fieldName: string,
  draft: string,
  numberFormat: "plain" | "number" | "currency" | "percent",
  valueUnitConfig: NonNullable<RecordFieldConfig["valueUnit"]>,
  unit: string,
): Partial<RecordValues> {
  const patch: Partial<RecordValues> = {
    [valueUnitConfig.unitFieldName]: inputValueToFieldValue(valueUnitConfig.unitField, unit),
  };
  const amount = decodeNumberEditorInputValue(draft, numberFormat);

  if (amount.kind === "valid") {
    patch[fieldName] = amount.value;
  }

  return patch;
}

function enumValueUnitOptions(field: NonNullable<RecordFieldConfig["valueUnit"]>["unitField"]) {
  return Object.entries(field.values).map(([value, option]) => ({
    value,
    label: option.label,
  }));
}

function isTitleLikeTextField(fieldName: string, field: FieldSchema) {
  const normalizedFieldName = fieldName.toLowerCase();
  const normalizedLabel = (field.label ?? "").toLowerCase();

  return (
    normalizedFieldName === "title" ||
    normalizedFieldName === "name" ||
    normalizedLabel === "title" ||
    normalizedLabel === "name"
  );
}

function fieldValueToEditorInputValue(
  field: FieldSchema,
  value: FieldValue | undefined,
  format: "plain" | "number" | "currency" | "percent",
) {
  if (field.type === "number" && typeof value === "number") {
    return encodeNumberEditorInputValue(value, format);
  }

  return fieldValueToInputValue(field, value);
}

function RecordReferenceEditor({
  canPatch,
  density = "default",
  draft,
  error,
  field,
  isPending,
  label,
  labelClass,
  onCommit,
  onDraftChange,
}: {
  canPatch: boolean;
  density?: "default" | "compact";
  draft: string;
  error: string | null;
  field: Extract<FieldSchema, { type: "reference" }>;
  isPending: boolean;
  label: string;
  labelClass: string;
  onCommit: (value: FieldValue) => Promise<void>;
  onDraftChange: (value: string) => void;
}) {
  const options = useReferenceOptions(field.to, field.displayField);
  const unknownValue =
    draft !== "" && !options.some((option) => option.id === draft) ? draft : null;

  return (
    <div
      className={
        density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-48 flex-none space-y-1"
      }
    >
      <Field>
        <Label className={labelClass}>{label}</Label>
        <NativeSelect
          aria-label={label}
          className="w-full"
          disabled={!canPatch || isPending}
          size={density === "compact" ? "sm" : "default"}
          onChange={(event) => {
            const value = event.currentTarget.value;

            onDraftChange(value);
            void onCommit(inputValueToFieldValue(field, value));
          }}
          required={field.required}
          value={draft}
        >
          {!field.required || draft === "" ? <NativeSelectOption value="" /> : null}
          {unknownValue ? (
            <NativeSelectOption value={unknownValue}>{unknownValue}</NativeSelectOption>
          ) : null}
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
