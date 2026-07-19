import { useMemo, useState } from "react";
import type { EntitySchema, QueryEvaluationContext } from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import { selectEntityOperationByKind } from "../../client/operation-presentation-model.ts";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
} from "../../client/views.ts";
import {
  useGeneratedCreateRuntime,
  type CreateHomeOperationConfig,
  type GeneratedCreateTriggerPresentation,
} from "./generated-create-runtime.ts";
import {
  LegacyGeneratedCreateForm,
  LegacyGeneratedCreateSurface,
} from "./legacy-create-surface.tsx";

const DEFAULT_CREATE_TRIGGER: GeneratedCreateTriggerPresentation = {
  content: { kind: "label", label: "Create" },
  density: "default",
  prominence: "primary",
};

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
  const createOperation = selectEntityOperationByKind(entityName, entity, "create", "collection");
  const operation = useMemo<CreateHomeOperationConfig | undefined>(
    () =>
      createOperation === undefined
        ? undefined
        : {
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
          },
    [createFields, createOperation, defaults, entity, entityName, union],
  );

  if (operation === undefined) {
    return <p className="text-sm text-slate-600">Create is disabled for {entity.label}.</p>;
  }

  return (
    <GeneratedCreateRuntime
      heading={`Create ${entity.label}`}
      mode="form"
      onOpenChange={() => {}}
      open={true}
      operation={operation}
      surfaceId={`create-form:${entityName}`}
      trigger={{
        ...DEFAULT_CREATE_TRIGGER,
        content: { kind: "label", label: operation.label },
      }}
    />
  );
}

export function GeneratedCreateSurface({
  onSuccess,
  operation,
  queryContext,
  surfaceId,
  trigger,
}: {
  onSuccess?: (recordId: string) => void;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
}) {
  const [open, setOpen] = useState(false);

  return (
    <GeneratedCreateRuntime
      mode="surface"
      onOpenChange={setOpen}
      onSuccess={onSuccess}
      open={open}
      operation={operation}
      queryContext={queryContext}
      renderTrigger={true}
      surfaceId={surfaceId}
      trigger={trigger}
    />
  );
}

export function GeneratedCreateDialog({
  onOpenChange,
  onSuccess,
  open,
  operation,
  queryContext,
  submitValues,
}: {
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
}) {
  return (
    <GeneratedCreateRuntime
      mode="surface"
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      open={open}
      operation={operation}
      queryContext={queryContext}
      renderTrigger={false}
      submitValues={submitValues}
      surfaceId={`create-dialog:${operation.operation.canonicalKey}`}
      trigger={{
        ...DEFAULT_CREATE_TRIGGER,
        content: { kind: "label", label: operation.label },
      }}
    />
  );
}

export function GeneratedCreateDialogForm({
  onSuccess,
  operation,
  queryContext,
  renderDialogCancel = true,
  submitValues,
}: {
  onSuccess?: (recordId: string) => void;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  renderDialogCancel?: boolean;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
}) {
  void renderDialogCancel;

  return (
    <GeneratedCreateRuntime
      mode="form"
      onOpenChange={() => {}}
      onSuccess={onSuccess}
      open={true}
      operation={operation}
      queryContext={queryContext}
      submitValues={submitValues}
      surfaceId={`create-dialog-form:${operation.operation.canonicalKey}`}
      trigger={{
        ...DEFAULT_CREATE_TRIGGER,
        content: { kind: "label", label: operation.label },
      }}
    />
  );
}

function GeneratedCreateRuntime({
  heading,
  mode,
  onOpenChange,
  onSuccess,
  open,
  operation,
  queryContext,
  renderTrigger = false,
  submitValues,
  surfaceId,
  trigger,
}: {
  heading?: string;
  mode: "form" | "surface";
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  renderTrigger?: boolean;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
}) {
  const runtime = useGeneratedCreateRuntime({
    closeOnSuccess: mode === "surface",
    onOpenChange,
    onSuccess,
    open,
    operation,
    queryContext,
    submitValues,
    surfaceId,
    trigger,
  });

  if (mode === "form") {
    return (
      <LegacyGeneratedCreateForm
        form={runtime.surface.dialog.form}
        heading={heading}
        onCreateIntent={runtime.onCreateIntent}
        onFieldIntent={runtime.onFieldIntent}
        surfaceId={runtime.surface.id}
      />
    );
  }

  return (
    <LegacyGeneratedCreateSurface
      onCreateIntent={runtime.onCreateIntent}
      onFieldIntent={runtime.onFieldIntent}
      renderTrigger={renderTrigger}
      surface={runtime.surface}
    />
  );
}
