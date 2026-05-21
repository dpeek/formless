import { useEffect, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dpeek/formless-ui/dialog";
import { FieldSet } from "@dpeek/formless-ui/field";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitCreateMutation } from "../../client/sync.ts";
import {
  type CreateDefaultConfig,
  type CreateFieldConfig,
  type CreateUnionPresentationConfig,
  type HomeActionConfig,
} from "../../client/views.ts";
import type { RecordValues } from "../../shared/protocol.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { EntitySchema } from "../../shared/schema.ts";
import {
  createDefaultsAreResolved,
  initialCreateDiscriminatorValue,
  resolveCreateValues as resolveCreateDefaultValues,
  selectCreateFieldsForDiscriminator,
  selectCreateFieldsForInputValues,
} from "../../shared/create-defaults.ts";
import type { FieldVisibilityValue } from "../../shared/schema.ts";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";
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
          <GeneratedCreateFieldControl
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

      <Button isDisabled={!canCreate || isSubmitting} type="submit">
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
          <GeneratedCreateFieldControl
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
          <DialogClose render={<Button intent="outline" type="button" />}>Cancel</DialogClose>
        ) : (
          <Button type="button" intent="outline">
            Cancel
          </Button>
        )}
        <Button isDisabled={!canSubmit || isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : action.enabled ? action.label : "Create disabled"}
        </Button>
      </DialogFooter>
    </form>
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
