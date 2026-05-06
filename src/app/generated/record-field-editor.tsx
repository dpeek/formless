import { useEffect, useState } from "react";
import { Checkbox } from "@formless/ui/checkbox";
import { DateInput } from "@formless/ui/date";
import { Field, FieldError } from "@formless/ui/field";
import { Input } from "@formless/ui/input";
import { Label } from "@formless/ui/label";
import { NativeSelect, NativeSelectOption } from "@formless/ui/native-select";
import { Textarea } from "@formless/ui/textarea";
import { useRecordField, useReferenceOptions } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitPatchMutation } from "../../client/sync.ts";
import { fieldLabel, type RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { selectGeneratedFieldEditorAdapter } from "./field-ui-adapters.ts";
import { fieldValueToInputValue, inputValueToFieldValue } from "./format.ts";
import { useSchemaKey } from "./schema-app-context.tsx";

export function RecordFieldEditor({
  canPatch,
  density = "default",
  entityName,
  fieldConfig,
  recordId,
  showLabel = false,
}: {
  canPatch: boolean;
  density?: "default" | "compact";
  entityName: string;
  fieldConfig: RecordFieldConfig;
  recordId: string;
  showLabel?: boolean;
}) {
  const schemaKey = useSchemaKey();
  const { commit: commitPolicy, editor, field, fieldName } = fieldConfig;
  const adapter = selectGeneratedFieldEditorAdapter(field, editor);
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const labelClass = showLabel ? "text-xs font-medium text-slate-600" : "sr-only";
  const recordValue = useRecordField(recordId, fieldName);
  const [draft, setDraft] = useState(() => fieldValueToInputValue(field, recordValue));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(fieldValueToInputValue(field, recordValue));
  }, [field, recordValue]);

  async function commit(value: FieldValue) {
    if (!canPatch || isPending) {
      return;
    }

    if (recordValue === value || (recordValue === undefined && value === "")) {
      return;
    }

    setIsPending(true);
    setSyncStatus({ state: "syncing", message: `Updating ${fieldName}...` });

    try {
      await submitPatchMutation(schemaKey, entityName, recordId, { [fieldName]: value });
      setError(null);
      setSyncStatus({ state: "idle", message: "Updated and synced." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";

      setDraft(fieldValueToInputValue(field, recordValue));
      setError(message);
      setSyncStatus({
        state: "error",
        message,
      });
    } finally {
      setIsPending(false);
    }
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
  const isMultilineTextEditor = control.kind === "textarea";
  const isDateEditor = control.kind === "input" && control.inputType === "date";

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

  return (
    <div
      className={
        density === "compact"
          ? "w-full min-w-0 space-y-1"
          : control.kind === "input" &&
              (control.inputType === "date" || control.inputType === "number")
            ? "min-w-36 flex-none space-y-1"
            : "min-w-52 flex-1 space-y-1"
      }
    >
      <Field>
        <Label className={labelClass}>{label}</Label>
        {isMultilineTextEditor ? (
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
