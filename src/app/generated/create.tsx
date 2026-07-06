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
import { Fieldset, fieldErrorStyles } from "@dpeek/formless-ui/field";
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
  generatedCreateDraftFieldInput,
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  nextGeneratedCreateDraftSessionState,
  resolveGeneratedCreateValues,
  selectGeneratedCreateDraftSession,
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
  const [draftSessionState, setDraftSessionState] = useState(() =>
    initialGeneratedCreateDraftSessionState({ defaults, fields: createFields, union }),
  );
  const createOperation = selectEntityOperationByKind(entityName, entity, "create", "collection");
  const canCreate = createOperation !== undefined;
  const draftSession = selectGeneratedCreateDraftSession({
    defaults,
    enabled: canCreate,
    fields: createFields,
    state: draftSessionState,
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
  const fieldsDisabled = !canCreate || !draftSession.defaultsResolved || submitDisabled;

  useEffect(() => {
    setDraftSessionState(
      initialGeneratedCreateDraftSessionState({ defaults, fields: createFields, union }),
    );
  }, [createFields, defaults, union]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitDisabled) {
      return;
    }

    const submittedState = markGeneratedCreateDraftSessionSubmitted(draftSessionState);
    const submittedSession = selectGeneratedCreateDraftSession({
      defaults,
      enabled: canCreate,
      fields: createFields,
      state: submittedState,
      union,
    });
    setDraftSessionState(submittedState);

    if (!submittedSession.canSubmit) {
      return;
    }

    const form = event.currentTarget;
    const values = submittedSession.values;

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
      setDraftSessionState(
        initialGeneratedCreateDraftSessionState({ defaults, fields: createFields, union }),
      );
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
    <form className="space-y-4" noValidate onSubmit={submitForm}>
      <h2 className="text-lg font-medium">Create {entity.label}</h2>

      {!canCreate ? (
        <p className="text-sm text-slate-600">Create is disabled for {entity.label}.</p>
      ) : null}

      <Fieldset className="space-y-4" disabled={fieldsDisabled}>
        {draftSession.visibleFields.map((fieldConfig) => (
          <GeneratedCreateFieldControl
            draftValue={draftSessionState.draft.values[fieldConfig.fieldName]}
            error={draftSession.fieldErrors[fieldConfig.fieldName]?.message}
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            onValueChange={(value) => {
              setDraftSessionState((state) =>
                nextGeneratedCreateDraftSessionState({
                  fieldName: fieldConfig.fieldName,
                  fieldValue: generatedCreateDraftFieldInput(value),
                  state,
                }),
              );
            }}
          />
        ))}
      </Fieldset>
      <GeneratedCreateDraftErrorList
        fieldErrors={draftSession.fieldErrors}
        visibleFields={draftSession.visibleFields}
      />

      <Button isDisabled={!draftSession.canSubmit || submitDisabled} type="submit">
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
  const [draftSessionState, setDraftSessionState] = useState(() =>
    initialGeneratedCreateDraftSessionState({
      defaults: operation.defaults,
      fields: operation.fields,
      union: operation.union,
    }),
  );
  const draftSession = selectGeneratedCreateDraftSession({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext,
    state: draftSessionState,
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
  const fieldsDisabled = !operation.enabled || !draftSession.defaultsResolved || submitDisabled;

  useEffect(() => {
    setDraftSessionState(
      initialGeneratedCreateDraftSessionState({
        defaults: operation.defaults,
        fields: operation.fields,
        union: operation.union,
      }),
    );
  }, [operation.defaults, operation.fields, operation.union]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitDisabled) {
      return;
    }

    const submittedState = markGeneratedCreateDraftSessionSubmitted(draftSessionState);
    const submittedSession = selectGeneratedCreateDraftSession({
      defaults: operation.defaults,
      enabled: operation.enabled,
      fields: operation.fields,
      queryContext,
      state: submittedState,
      union: operation.union,
    });
    setDraftSessionState(submittedState);

    if (!submittedSession.canSubmit) {
      return;
    }

    const form = event.currentTarget;
    const values = submittedSession.values;

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
      setDraftSessionState(
        initialGeneratedCreateDraftSessionState({
          defaults: operation.defaults,
          fields: operation.fields,
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
    <form className="space-y-4" noValidate onSubmit={submitForm}>
      {!operation.enabled ? (
        <p className="text-sm text-slate-600">Create is disabled for {operation.entity.label}.</p>
      ) : null}

      <Fieldset className="space-y-4" disabled={fieldsDisabled}>
        {draftSession.visibleFields.map((fieldConfig) => (
          <GeneratedCreateFieldControl
            draftValue={draftSessionState.draft.values[fieldConfig.fieldName]}
            error={draftSession.fieldErrors[fieldConfig.fieldName]?.message}
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            onValueChange={(value) => {
              setDraftSessionState((state) =>
                nextGeneratedCreateDraftSessionState({
                  fieldName: fieldConfig.fieldName,
                  fieldValue: generatedCreateDraftFieldInput(value),
                  state,
                }),
              );
            }}
          />
        ))}
      </Fieldset>
      <GeneratedCreateDraftErrorList
        fieldErrors={draftSession.fieldErrors}
        visibleFields={draftSession.visibleFields}
      />

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
        <Button isDisabled={!draftSession.canSubmit || submitDisabled} type="submit">
          {submitDisabled ? "Saving..." : operation.enabled ? operation.label : "Create disabled"}
        </Button>
      </ModalFooter>
    </form>
  );
}

function GeneratedCreateDraftErrorList({
  fieldErrors,
  visibleFields,
}: {
  fieldErrors: Record<string, { fieldName: string; message: string }>;
  visibleFields: CreateFieldConfig[];
}) {
  const visibleFieldNames = new Set(visibleFields.map((field) => field.fieldName));
  const hiddenFieldErrors = Object.values(fieldErrors).filter(
    (error) => !visibleFieldNames.has(error.fieldName),
  );

  if (hiddenFieldErrors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1" role="alert">
      {hiddenFieldErrors.map((error) => (
        <div className={fieldErrorStyles()} data-slot="field-error" key={error.fieldName}>
          {error.message}
        </div>
      ))}
    </div>
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
