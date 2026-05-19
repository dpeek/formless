import { useEffect, useRef, useState } from "react";
import { DateInput } from "@dpeek/formless-ui/date";
import { Button } from "@dpeek/formless-ui/button";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dpeek/formless-ui/dialog";
import { Field, FieldSet } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { Label } from "@dpeek/formless-ui/label";
import { NativeSelect, NativeSelectOption } from "@dpeek/formless-ui/native-select";
import { Textarea } from "@dpeek/formless-ui/textarea";
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
  createDefaultsAreResolved,
  initialCreateDiscriminatorValue,
  resolveCreateValues as resolveCreateDefaultValues,
  selectCreateFieldsForDiscriminator,
  selectCreateFieldsForInputValues,
} from "../../shared/create-defaults.ts";
import type { FieldVisibilityValue } from "../../shared/schema.ts";
import {
  GeneratedColorFieldControl,
  GeneratedIconSourceFieldControl,
  GeneratedMarkdownFieldControl,
  GeneratedNumberFieldControl,
} from "./field-control-primitives.tsx";
import { selectGeneratedFieldControl } from "./field-controls.ts";
import { encodeNumberEditorInputValue, numberInputValueToFieldValue } from "./format.ts";
import { useSchemaKey } from "./schema-app-context.tsx";

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
  const [inputValues, setInputValues] = useState<Record<string, FieldVisibilityValue>>({});
  const canCreate = entity.mutations.create.enabled;
  const visibleCreateFields = selectCreateFieldsForInputValues(
    selectCreateFieldsForDiscriminator(createFields, union, discriminatorValue),
    inputValues,
  );

  useEffect(() => {
    setDiscriminatorValue(initialCreateDiscriminatorValue(union, defaults));
    setInputValues({});
  }, [defaults, union]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = resolveCreateDefaultValues({
      formData,
      fields: createFields,
      union,
      defaults,
    });

    setIsSubmitting(true);
    setSyncStatus({ state: "syncing", message: `Saving ${entity.label.toLowerCase()}...` });

    try {
      await submitCreateMutation(schemaKey, entityName, values);
      form.reset();
      setDiscriminatorValue(initialCreateDiscriminatorValue(union, defaults));
      setInputValues({});
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
              setInputValues((current) => ({
                ...current,
                [fieldConfig.fieldName]: value,
              }));

              if (fieldConfig.fieldName === union?.discriminatorFieldName) {
                setDiscriminatorValue(String(value));
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
  const [inputValues, setInputValues] = useState<Record<string, FieldVisibilityValue>>({});
  const canSubmit = action.enabled && createDefaultsAreResolved(action.defaults, queryContext);
  const visibleFields = selectCreateFieldsForInputValues(
    selectCreateFieldsForDiscriminator(action.fields, action.union, discriminatorValue),
    inputValues,
  );

  useEffect(() => {
    setDiscriminatorValue(initialCreateDiscriminatorValue(action.union, action.defaults));
    setInputValues({});
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
      setInputValues({});
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
              setInputValues((current) => ({
                ...current,
                [fieldConfig.fieldName]: value,
              }));

              if (fieldConfig.fieldName === action.union?.discriminatorFieldName) {
                setDiscriminatorValue(String(value));
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

export function resolveCreateValues(
  formData: FormData,
  action: CreateHomeActionConfig,
  queryContext?: QueryEvaluationContext,
): RecordValues {
  return resolveCreateDefaultValues({
    formData,
    fields: action.fields,
    union: action.union,
    defaults: action.defaults,
    queryContext,
  });
}
