import { useEffect, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { Fieldset } from "@dpeek/formless-ui/field";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import { selectEntityOperationByKind } from "../../client/operation-presentation-model.ts";
import {
  type CreateDefaultConfig,
  type CreateFieldConfig,
  type CreateUnionPresentationConfig,
  type HomeOperationConfig,
} from "../../client/views.ts";
import type { RecordValues } from "@dpeek/formless-storage";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";
import type { EntitySchema } from "@dpeek/formless-schema";
import {
  initialGeneratedCreateFieldAuthoringState,
  nextGeneratedCreateFieldAuthoringState,
  resolveGeneratedCreateValues,
  selectGeneratedCreateFieldAuthoring,
} from "./create-field-authoring.ts";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";

export type CreateHomeOperationConfig = Extract<HomeOperationConfig, { type: "create" }>;

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
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authoringState, setAuthoringState] = useState(() =>
    initialGeneratedCreateFieldAuthoringState({ defaults, union }),
  );
  const createOperation = selectEntityOperationByKind(entityName, entity, "create", "collection");
  const canCreate = createOperation !== undefined;
  const authoring = selectGeneratedCreateFieldAuthoring({
    defaults,
    enabled: canCreate,
    fields: createFields,
    state: authoringState,
    union,
  });

  useEffect(() => {
    setAuthoringState(initialGeneratedCreateFieldAuthoringState({ defaults, union }));
  }, [defaults, union]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authoring.canSubmit) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = resolveGeneratedCreateValues({
      formData,
      fields: createFields,
      union,
      defaults,
    });

    setIsSubmitting(true);
    setSyncStatus({ state: "syncing", message: `Saving ${entity.label.toLowerCase()}...` });

    try {
      if (createOperation === undefined) {
        throw new Error(`Create operation is unavailable for ${entity.label}.`);
      }

      await submitOperation(
        appTarget,
        entityName,
        createOperation.operationName,
        {
          input: values,
        },
        undefined,
        writeOptions,
      );
      form.reset();
      setAuthoringState(initialGeneratedCreateFieldAuthoringState({ defaults, union }));
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

      <Fieldset className="space-y-4" disabled={!authoring.canSubmit || isSubmitting}>
        {authoring.visibleFields.map((fieldConfig) => (
          <GeneratedCreateFieldControl
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            onValueChange={(value) => {
              setAuthoringState((state) =>
                nextGeneratedCreateFieldAuthoringState({
                  fieldName: fieldConfig.fieldName,
                  state,
                  union,
                  value,
                }),
              );
            }}
          />
        ))}
      </Fieldset>

      <Button isDisabled={!authoring.canSubmit || isSubmitting} type="submit">
        {isSubmitting ? "Saving..." : canCreate ? `Create ${entity.label}` : "Create disabled"}
      </Button>
    </form>
  );
}

export function GeneratedCreateDialog({
  operation,
  onOpenChange,
  onSuccess,
  open,
  queryContext,
}: {
  operation: CreateHomeOperationConfig;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  queryContext?: QueryEvaluationContext;
}) {
  return (
    <ModalContent isOpen={open} onOpenChange={onOpenChange}>
      <ModalHeader>
        <ModalTitle>{operation.label}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <GeneratedCreateDialogForm
          operation={operation}
          onSuccess={(recordId) => {
            onSuccess?.(recordId);
            onOpenChange(false);
          }}
          queryContext={queryContext}
        />
      </ModalBody>
    </ModalContent>
  );
}

export function GeneratedCreateDialogForm({
  operation,
  onSuccess,
  queryContext,
  renderDialogCancel = true,
  submitValues,
}: {
  operation: CreateHomeOperationConfig;
  onSuccess?: (recordId: string) => void;
  queryContext?: QueryEvaluationContext;
  renderDialogCancel?: boolean;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
}) {
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authoringState, setAuthoringState] = useState(() =>
    initialGeneratedCreateFieldAuthoringState({
      defaults: operation.defaults,
      union: operation.union,
    }),
  );
  const authoring = selectGeneratedCreateFieldAuthoring({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext,
    state: authoringState,
    union: operation.union,
  });

  useEffect(() => {
    setAuthoringState(
      initialGeneratedCreateFieldAuthoringState({
        defaults: operation.defaults,
        union: operation.union,
      }),
    );
  }, [operation.defaults, operation.union]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authoring.canSubmit) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = resolveCreateValues(formData, operation, queryContext);

    setIsSubmitting(true);
    setSyncStatus({
      state: "syncing",
      message: `Saving ${operation.entity.label.toLowerCase()}...`,
    });

    try {
      const response =
        submitValues === undefined
          ? {
              recordId: selectCreatedOperationRecordId(
                await submitOperation(
                  appTarget,
                  operation.entityName,
                  operation.operationName,
                  {
                    input: values,
                  },
                  undefined,
                  writeOptions,
                ),
              ),
            }
          : await submitValues(values);
      form.reset();
      setAuthoringState(
        initialGeneratedCreateFieldAuthoringState({
          defaults: operation.defaults,
          union: operation.union,
        }),
      );
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
      {!operation.enabled ? (
        <p className="text-sm text-slate-600">Create is disabled for {operation.entity.label}.</p>
      ) : null}

      <Fieldset className="space-y-4" disabled={!authoring.canSubmit || isSubmitting}>
        {authoring.visibleFields.map((fieldConfig) => (
          <GeneratedCreateFieldControl
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            onValueChange={(value) => {
              setAuthoringState((state) =>
                nextGeneratedCreateFieldAuthoringState({
                  fieldName: fieldConfig.fieldName,
                  state,
                  union: operation.union,
                  value,
                }),
              );
            }}
          />
        ))}
      </Fieldset>

      <ModalFooter>
        {renderDialogCancel ? (
          <ModalClose intent="outline" type="button">
            Cancel
          </ModalClose>
        ) : (
          <Button type="button" intent="outline">
            Cancel
          </Button>
        )}
        <Button isDisabled={!authoring.canSubmit || isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : operation.enabled ? operation.label : "Create disabled"}
        </Button>
      </ModalFooter>
    </form>
  );
}

export function resolveCreateValues(
  formData: FormData,
  operation: CreateHomeOperationConfig,
  queryContext?: QueryEvaluationContext,
): RecordValues {
  return resolveGeneratedCreateValues({
    formData,
    fields: operation.fields,
    union: operation.union,
    defaults: operation.defaults,
    queryContext,
  });
}

function selectCreatedOperationRecordId(response: Awaited<ReturnType<typeof submitOperation>>) {
  if (response.output.type !== "create") {
    throw new Error("Create operation did not return a created record.");
  }

  return response.output.record.id;
}
