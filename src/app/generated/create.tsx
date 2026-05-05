import { useState } from "react";
import { DateInput } from "@formless/ui/date";
import { Button } from "@formless/ui/button";
import { Checkbox } from "@formless/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@formless/ui/dialog";
import { Field, FieldSet } from "@formless/ui/field";
import { Input } from "@formless/ui/input";
import { Label } from "@formless/ui/label";
import { NativeSelect, NativeSelectOption } from "@formless/ui/native-select";
import { useReferenceOptions } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitCreateMutation } from "../../client/sync.ts";
import { fieldLabel, type CreateFieldConfig, type HomeActionConfig } from "../../client/views.ts";
import type { RecordValues } from "../../shared/protocol.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { EntitySchema, FieldSchema } from "../../shared/schema.ts";
import { selectGeneratedFieldEditorAdapter } from "./field-ui-adapters.ts";
import { numberInputValueToFieldValue } from "./format.ts";
import { useSchemaKey } from "./schema-app-context.tsx";

export type CreateHomeActionConfig = Extract<HomeActionConfig, { type: "create" }>;

export function GeneratedCreateForm({
  createFields,
  entity,
  entityName,
}: {
  createFields: CreateFieldConfig[];
  entity: EntitySchema;
  entityName: string;
}) {
  const schemaKey = useSchemaKey();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canCreate = entity.mutations.create.enabled;

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = getVisibleCreateValues(formData, createFields);

    setIsSubmitting(true);
    setSyncStatus({ state: "syncing", message: `Saving ${entity.label.toLowerCase()}...` });

    try {
      await submitCreateMutation(schemaKey, entityName, values);
      form.reset();
      setSyncStatus({ state: "idle", message: "Saved and synced." });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submitForm}>
      <h2 className="text-lg font-medium">Create {entity.label}</h2>

      {!canCreate ? (
        <p className="text-sm text-slate-600">Create is disabled for {entity.label}.</p>
      ) : null}

      <FieldSet className="space-y-4" disabled={!canCreate || isSubmitting}>
        {createFields.map((fieldConfig) => (
          <CreateFieldInput fieldConfig={fieldConfig} key={fieldConfig.fieldName} />
        ))}
      </FieldSet>

      <Button disabled={!canCreate || isSubmitting} type="submit">
        {isSubmitting ? "Saving..." : canCreate ? `Create ${entity.label}` : "Create disabled"}
      </Button>
    </form>
  );
}

export function GeneratedCreateDialog({
  action,
  onOpenChange,
  onSuccess,
  open,
  queryContext,
}: {
  action: CreateHomeActionConfig;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  queryContext?: QueryEvaluationContext;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
        </DialogHeader>
        <GeneratedCreateDialogForm
          action={action}
          onSuccess={(recordId) => {
            onSuccess?.(recordId);
            onOpenChange(false);
          }}
          queryContext={queryContext}
        />
      </DialogContent>
    </Dialog>
  );
}

export function GeneratedCreateDialogForm({
  action,
  onSuccess,
  queryContext,
  renderDialogCancel = true,
}: {
  action: CreateHomeActionConfig;
  onSuccess?: (recordId: string) => void;
  queryContext?: QueryEvaluationContext;
  renderDialogCancel?: boolean;
}) {
  const schemaKey = useSchemaKey();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = action.enabled && createDefaultsAreResolved(action, queryContext);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = resolveCreateValues(formData, action, queryContext);

    setIsSubmitting(true);
    setSyncStatus({
      state: "syncing",
      message: `Saving ${action.entity.label.toLowerCase()}...`,
    });

    try {
      const response = await submitCreateMutation(schemaKey, action.entityName, values);
      form.reset();
      onSuccess?.(response.record.id);
      setSyncStatus({ state: "idle", message: "Saved and synced." });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submitForm}>
      {!action.enabled ? (
        <p className="text-sm text-slate-600">Create is disabled for {action.entity.label}.</p>
      ) : null}

      <FieldSet className="space-y-4" disabled={!canSubmit || isSubmitting}>
        {action.fields.map((fieldConfig) => (
          <CreateFieldInput fieldConfig={fieldConfig} key={fieldConfig.fieldName} />
        ))}
      </FieldSet>

      <DialogFooter>
        {renderDialogCancel ? (
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        ) : (
          <Button type="button" variant="outline">
            Cancel
          </Button>
        )}
        <Button disabled={!canSubmit || isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : action.enabled ? action.label : "Create disabled"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateFieldInput({ fieldConfig }: { fieldConfig: CreateFieldConfig }) {
  const { field, fieldName, editor } = fieldConfig;
  const adapter = selectGeneratedFieldEditorAdapter(field, editor);
  const label = fieldLabel(fieldName, field);

  if (adapter.kind === "boolean") {
    return (
      <Field orientation="horizontal">
        <Checkbox defaultChecked={adapter.field.default ?? false} name={fieldName} />
        <Label>{label}</Label>
      </Field>
    );
  }

  if (adapter.kind === "date") {
    return (
      <Field>
        <Label>{label}</Label>
        <DateInput name={fieldName} required={adapter.field.required} />
      </Field>
    );
  }

  if (adapter.kind === "number") {
    return (
      <Field>
        <Label>{label}</Label>
        <Input
          defaultValue={adapter.field.default}
          max={adapter.field.max}
          min={adapter.field.min}
          name={fieldName}
          required={adapter.field.required}
          step={adapter.field.integer ? "1" : "any"}
          type="number"
        />
      </Field>
    );
  }

  if (adapter.kind === "enum") {
    return (
      <Field>
        <Label>{label}</Label>
        <NativeSelect
          className="w-full"
          defaultValue={adapter.field.default ?? (adapter.field.required ? undefined : "")}
          name={fieldName}
          required={adapter.field.required}
        >
          {adapter.field.required ? null : <NativeSelectOption value="" />}
          {Object.entries(adapter.field.values).map(([value, option]) => (
            <NativeSelectOption key={value} value={value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    );
  }

  if (adapter.kind === "reference") {
    return <ReferenceCreateField field={adapter.field} fieldName={fieldName} label={label} />;
  }

  return (
    <Field>
      <Label>{label}</Label>
      <Input name={fieldName} required={field.required} />
    </Field>
  );
}

function ReferenceCreateField({
  field,
  fieldName,
  label,
}: {
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldName: string;
  label: string;
}) {
  const options = useReferenceOptions(field.to, field.displayField);

  return (
    <Field>
      <Label>{label}</Label>
      <NativeSelect
        className="w-full"
        defaultValue={field.required ? undefined : ""}
        name={fieldName}
        required={field.required}
      >
        {field.required ? null : <NativeSelectOption value="" />}
        {options.map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

export function resolveCreateValues(
  formData: FormData,
  action: CreateHomeActionConfig,
  queryContext?: QueryEvaluationContext,
): RecordValues {
  const values = getVisibleCreateValues(formData, action.fields);

  for (const defaultConfig of action.defaults) {
    if (Object.hasOwn(values, defaultConfig.fieldName)) {
      continue;
    }

    if (defaultConfig.value.kind === "context") {
      values[defaultConfig.fieldName] = resolveContextDefaultValue(
        defaultConfig.fieldName,
        defaultConfig.value.name,
        queryContext,
      );
    }
  }

  return values;
}

function getVisibleCreateValues(formData: FormData, fields: CreateFieldConfig[]): RecordValues {
  const values: RecordValues = {};

  for (const { field, fieldName } of fields) {
    if (field.type === "boolean") {
      values[fieldName] = formData.has(fieldName);
      continue;
    }

    if (field.type === "number") {
      const value = formData.get(fieldName);
      values[fieldName] = typeof value === "string" ? numberInputValueToFieldValue(value) : "";
      continue;
    }

    const value = formData.get(fieldName);
    values[fieldName] = typeof value === "string" ? value : "";
  }

  return values;
}

export function createDefaultsAreResolved(
  action: CreateHomeActionConfig,
  queryContext?: QueryEvaluationContext,
) {
  try {
    for (const defaultConfig of action.defaults) {
      if (defaultConfig.value.kind === "context") {
        resolveContextDefaultValue(defaultConfig.fieldName, defaultConfig.value.name, queryContext);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function resolveContextDefaultValue(
  fieldName: string,
  contextName: string,
  queryContext?: QueryEvaluationContext,
): string {
  const value = queryContext?.values?.[contextName];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Create default for "${fieldName}" requires selected context "${contextName}".`,
    );
  }

  return value;
}
