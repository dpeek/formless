import { useEffect, useMemo, useState } from "react";
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
import { selectEntityOperationByKind } from "../../client/operation-presentation-model.ts";
import {
  type CreateDefaultConfig,
  type CreateFieldConfig,
  type CreateUnionPresentationConfig,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationExecutionResult,
  type HomeOperationConfig,
  projectCollectionOperationControlBinding,
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
import {
  executeGeneratedOperationControl,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";

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
  const operationConfig = useMemo(
    () =>
      createOperation === undefined
        ? undefined
        : ({
            type: "create",
            label: `Create ${entity.label}`,
            entityName,
            entity,
            operationName: createOperation.operationName,
            operation: createOperation,
            fields: createFields,
            defaults,
            ...(union === undefined ? {} : { union }),
            enabled: true,
          } satisfies CreateHomeOperationConfig),
    [createFields, createOperation, defaults, entity, entityName, union],
  );
  const binding = useMemo(
    () =>
      operationConfig === undefined
        ? undefined
        : projectCreateSubmitBinding(operationConfig, "create-form"),
    [operationConfig],
  );
  const bindings = useMemo(() => (binding === undefined ? [] : [binding]), [binding]);
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const isOperationSubmitting = binding === undefined ? false : controller.isPending(binding.id);
  const submitDisabled = isSubmitting || isOperationSubmitting;

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

    try {
      if (binding === undefined) {
        throw new Error(`Create operation is unavailable for ${entity.label}.`);
      }

      const result = await executeCreateSubmitOperation({
        binding,
        controller,
        progressMessage: `Saving ${entity.label.toLowerCase()}...`,
        values,
      });

      if (result.type === "failed") {
        return;
      }

      form.reset();
      setAuthoringState(initialGeneratedCreateFieldAuthoringState({ defaults, union }));
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

      <Fieldset className="space-y-4" disabled={!authoring.canSubmit || submitDisabled}>
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

      <Button isDisabled={!authoring.canSubmit || submitDisabled} type="submit">
        {submitDisabled ? "Saving..." : canCreate ? `Create ${entity.label}` : "Create disabled"}
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
  const binding = useMemo(
    () =>
      submitValues === undefined
        ? projectCreateSubmitBinding(operation, "create-dialog")
        : undefined,
    [operation, submitValues],
  );
  const bindings = useMemo(() => (binding === undefined ? [] : [binding]), [binding]);
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const isOperationSubmitting = binding === undefined ? false : controller.isPending(binding.id);
  const submitDisabled = isSubmitting || isOperationSubmitting;

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

    try {
      let response: { recordId: string };

      if (submitValues === undefined) {
        if (binding === undefined) {
          throw new Error(`Create operation is unavailable for ${operation.entity.label}.`);
        }

        const result = await executeCreateSubmitOperation({
          binding,
          controller,
          progressMessage: `Saving ${operation.entity.label.toLowerCase()}...`,
          values,
        });

        if (result.type === "failed") {
          return;
        }

        response = {
          recordId: selectCreatedOperationRecordId(result),
        };
      } else {
        setSyncStatus({
          state: "syncing",
          message: `Saving ${operation.entity.label.toLowerCase()}...`,
        });
        response = await submitValues(values);
        setSyncStatus({ state: "idle", message: "Saved and synced." });
      }

      form.reset();
      setAuthoringState(
        initialGeneratedCreateFieldAuthoringState({
          defaults: operation.defaults,
          union: operation.union,
        }),
      );
      onSuccess?.(response.recordId);
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

      <Fieldset className="space-y-4" disabled={!authoring.canSubmit || submitDisabled}>
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
        <Button isDisabled={!authoring.canSubmit || submitDisabled} type="submit">
          {submitDisabled ? "Saving..." : operation.enabled ? operation.label : "Create disabled"}
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

export function projectCreateSubmitBinding(
  operation: CreateHomeOperationConfig,
  idPrefix: string,
): GeneratedOperationControlBinding {
  return projectCollectionOperationControlBinding(operation, { idPrefix });
}

export async function executeCreateSubmitOperation({
  binding,
  controller,
  progressMessage,
  values,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  progressMessage: string;
  values: RecordValues;
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      input: values,
      source: "submitButton",
    },
    controller,
    feedback: {
      committedMessage: "Saved and synced.",
      progressMessage,
      replayedMessage: "Saved and synced.",
    },
  });
}

function selectCreatedOperationRecordId(result: GeneratedOperationExecutionResult) {
  if (result.type === "failed") {
    throw new Error(result.displayError);
  }

  const recordId = result.createdRecordIds?.[0];

  if (recordId === undefined) {
    throw new Error("Create operation did not return a created record.");
  }

  return recordId;
}
