import { useEffect, useRef, useState } from "react";
import { DateInput } from "@formless/ui/date";
import { Button } from "@formless/ui/button";
import { Checkbox } from "@formless/ui/checkbox";
import { ColorInput } from "@formless/ui/color";
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
import { MarkdownEditor } from "@formless/ui/markdown";
import { NativeSelect, NativeSelectOption } from "@formless/ui/native-select";
import { FormattedNumberInput } from "@formless/ui/number-input";
import { Textarea } from "@formless/ui/textarea";
import { useReferenceOptions } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitCreateMutation } from "../../client/sync.ts";
import {
  fieldLabel,
  type CreateDefaultConfig,
  type CreateFieldConfig,
  type CreateUnionPresentationConfig,
  type HomeActionConfig,
} from "../../client/views.ts";
import type { RecordValues } from "../../shared/protocol.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { EntitySchema, FieldSchema } from "../../shared/schema.ts";
import {
  createDefaultsAreResolved as createDefaultValuesAreResolved,
  resolveCreateValues as resolvePrimitiveCreateValues,
} from "../../shared/create-defaults.ts";
import { selectGeneratedFieldEditorAdapter } from "./field-ui-adapters.ts";
import {
  decodeNumberEditorInputValue,
  encodeNumberEditorInputValue,
  numberInputValueToFieldValue,
} from "./format.ts";
import { useSchemaKey } from "./schema-app-context.tsx";
import {
  initialCreateDiscriminatorValue,
  selectCreateFieldsForDiscriminator,
} from "./union-presentation.ts";

export type CreateHomeActionConfig = Extract<HomeActionConfig, { type: "create" }>;

export function GeneratedCreateForm({
  createFields,
  defaults = [],
  entity,
  entityName,
  union,
}: {
  createFields: CreateFieldConfig[];
  defaults?: CreateDefaultConfig[];
  entity: EntitySchema;
  entityName: string;
  union?: CreateUnionPresentationConfig;
}) {
  const schemaKey = useSchemaKey();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discriminatorValue, setDiscriminatorValue] = useState(() =>
    initialCreateDiscriminatorValue(union, defaults),
  );
  const canCreate = entity.mutations.create.enabled;
  const visibleCreateFields = selectCreateFieldsForDiscriminator(
    createFields,
    union,
    discriminatorValue,
  );

  useEffect(() => {
    setDiscriminatorValue(initialCreateDiscriminatorValue(union, defaults));
  }, [defaults, union]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = resolveCreateValuesForFields(formData, createFields, union, defaults);

    setIsSubmitting(true);
    setSyncStatus({ state: "syncing", message: `Saving ${entity.label.toLowerCase()}...` });

    try {
      await submitCreateMutation(schemaKey, entityName, values);
      form.reset();
      setDiscriminatorValue(initialCreateDiscriminatorValue(union, defaults));
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
        {visibleCreateFields.map((fieldConfig) => (
          <CreateFieldInput
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            onValueChange={(value) => {
              if (fieldConfig.fieldName === union?.discriminatorFieldName) {
                setDiscriminatorValue(value);
              }
            }}
          />
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
  submitValues,
}: {
  action: CreateHomeActionConfig;
  onSuccess?: (recordId: string) => void;
  queryContext?: QueryEvaluationContext;
  renderDialogCancel?: boolean;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
}) {
  const schemaKey = useSchemaKey();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discriminatorValue, setDiscriminatorValue] = useState(() =>
    initialCreateDiscriminatorValue(action.union, action.defaults),
  );
  const canSubmit = action.enabled && createDefaultsAreResolved(action, queryContext);
  const visibleFields = selectCreateFieldsForDiscriminator(
    action.fields,
    action.union,
    discriminatorValue,
  );

  useEffect(() => {
    setDiscriminatorValue(initialCreateDiscriminatorValue(action.union, action.defaults));
  }, [action.defaults, action.union]);

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
      const response =
        submitValues === undefined
          ? {
              recordId: (await submitCreateMutation(schemaKey, action.entityName, values)).record
                .id,
            }
          : await submitValues(values);
      form.reset();
      setDiscriminatorValue(initialCreateDiscriminatorValue(action.union, action.defaults));
      onSuccess?.(response.recordId);
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
        {visibleFields.map((fieldConfig) => (
          <CreateFieldInput
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            onValueChange={(value) => {
              if (fieldConfig.fieldName === action.union?.discriminatorFieldName) {
                setDiscriminatorValue(value);
              }
            }}
          />
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

function CreateFieldInput({
  fieldConfig,
  onValueChange,
}: {
  fieldConfig: CreateFieldConfig;
  onValueChange?: (value: string) => void;
}) {
  const { field, fieldName, editor } = fieldConfig;
  const adapter = selectGeneratedFieldEditorAdapter(field, editor);
  const label = fieldLabel(fieldName, field);

  if (adapter.kind === "boolean") {
    return (
      <Field orientation="horizontal">
        <Checkbox defaultChecked={adapter.createDefaultChecked} name={fieldName} />
        <Label>{label}</Label>
      </Field>
    );
  }

  if (adapter.control.kind === "input" && adapter.control.inputType === "date") {
    return (
      <Field>
        <Label>{label}</Label>
        <DateInput
          defaultValue={adapter.createDefaultValue}
          name={fieldName}
          required={adapter.required}
        />
      </Field>
    );
  }

  if (adapter.kind === "text" && adapter.editor === "color") {
    return (
      <Field>
        <Label>{label}</Label>
        <CreateColorField
          defaultValue={adapter.createDefaultValue}
          fieldName={fieldName}
          label={label}
          required={adapter.required}
        />
      </Field>
    );
  }

  if (adapter.kind === "text" && adapter.editor === "markdown") {
    return (
      <Field>
        <Label>{label}</Label>
        <CreateMarkdownField
          defaultValue={adapter.createDefaultValue}
          fieldName={fieldName}
          label={label}
        />
      </Field>
    );
  }

  if (adapter.kind === "number") {
    return (
      <Field>
        <Label>{label}</Label>
        <CreateNumberField
          defaultValue={adapter.createDefaultValue}
          fieldName={fieldName}
          inputAttributes={adapter.inputAttributes}
          label={label}
          required={adapter.required}
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
          defaultValue={adapter.createDefaultValue}
          name={fieldName}
          onChange={(event) => onValueChange?.(event.currentTarget.value)}
          required={adapter.required}
        >
          {adapter.required ? null : <NativeSelectOption value="" />}
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
    return (
      <ReferenceCreateField
        defaultValue={adapter.createDefaultValue}
        field={adapter.field}
        fieldName={fieldName}
        label={label}
        required={adapter.required}
      />
    );
  }

  if (adapter.control.kind === "textarea") {
    return (
      <Field>
        <Label>{label}</Label>
        <Textarea
          defaultValue={adapter.createDefaultValue}
          name={fieldName}
          required={adapter.required}
        />
      </Field>
    );
  }

  return (
    <Field>
      <Label>{label}</Label>
      <Input
        defaultValue={adapter.createDefaultValue}
        name={fieldName}
        required={adapter.required}
        type={adapter.control.kind === "input" ? adapter.control.inputType : "text"}
      />
    </Field>
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
      <MarkdownEditor
        aria-label={label}
        className="min-h-40 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        onChange={setValue}
        placeholder={label}
        value={value}
      />
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
      <ColorInput
        ariaLabel={label}
        onBlur={() => undefined}
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
  inputAttributes: Record<string, number | string | undefined>;
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
      <FormattedNumberInput
        aria-label={label}
        decode={(inputValue) => decodeNumberEditorInputValue(inputValue, "plain")}
        encode={(inputValue) => encodeNumberEditorInputValue(inputValue, "plain")}
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
  required,
}: {
  defaultValue: string | undefined;
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldName: string;
  label: string;
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

export function resolveCreateValues(
  formData: FormData,
  action: CreateHomeActionConfig,
  queryContext?: QueryEvaluationContext,
): RecordValues {
  return resolveCreateValuesForFields(
    formData,
    action.fields,
    action.union,
    action.defaults,
    queryContext,
  );
}

function resolveCreateValuesForFields(
  formData: FormData,
  fields: CreateFieldConfig[],
  union: CreateUnionPresentationConfig | undefined,
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
): RecordValues {
  return resolvePrimitiveCreateValues({
    formData,
    fields,
    union,
    defaults,
    queryContext,
  });
}

export function createDefaultsAreResolved(
  action: CreateHomeActionConfig,
  queryContext?: QueryEvaluationContext,
) {
  return createDefaultValuesAreResolved(action.defaults, queryContext);
}
