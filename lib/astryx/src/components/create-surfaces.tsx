import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  FormlessUiButtonContract,
  FormlessUiCreateField,
  FormlessUiCreateIntent,
  FormlessUiCreateIntentHandler,
  FormlessUiCreateSurfaceContract,
  FormlessUiFieldIntent,
} from "../formless-ui-contract.ts";
import { FormlessFixtureFrame } from "./fixture-layout.tsx";
import { createField, fieldError, textControl } from "./fields/fixture-helpers.ts";
import { AstryxCreateSurfaceRenderer } from "./formless-ui-create-renderer.tsx";

const requiredTaskMessage = "Task is required.";
const submissionFailureMessage = "The task could not be created. Try again.";
const submissionDelayMs = 700;

const taskFieldSchema = {
  type: "text",
  label: "Task",
  required: true,
} satisfies Extract<FieldSchema, { type: "text" }>;

const summaryFieldSchema = {
  type: "text",
  label: "Summary",
  required: false,
  format: "longText",
} satisfies Extract<FieldSchema, { type: "text" }>;

const createSurfaceFixtures = [
  createSurfaceFixture({
    id: "create-collection-label",
    title: "Create task",
    trigger: { kind: "label", label: "Create task" },
    task: "",
  }),
  createSurfaceFixture({
    id: "create-collection-icon-label",
    title: "Create task",
    trigger: { kind: "iconAndLabel", icon: "add", label: "Create task" },
    task: "Prepare launch notes",
  }),
  createSurfaceFixture({
    id: "create-context",
    title: "Create project",
    trigger: { kind: "iconOnly", icon: "add" },
    triggerLabel: "Create project",
    density: "compact",
    prominence: "secondary",
    task: "Public launch",
  }),
  createSurfaceFixture({
    id: "create-root",
    title: "Create root page",
    trigger: { kind: "iconOnly", icon: "add" },
    triggerLabel: "Create root page",
    density: "compact",
    prominence: "quiet",
    task: "Launch",
    formErrors: [submissionFailureMessage],
  }),
  createSurfaceFixture({
    id: "create-disabled",
    title: "Create task",
    trigger: { kind: "label", label: "Create disabled" },
    triggerLabel: "Create task",
    disabledReason: "Create is disabled for tasks.",
    task: "",
  }),
  createSurfaceFixture({
    id: "create-unresolved-context",
    title: "Create task",
    trigger: { kind: "iconOnly", icon: "add" },
    triggerLabel: "Create task",
    density: "compact",
    prominence: "quiet",
    disabledReason: "Create task requires a selected context.",
    task: "",
  }),
] satisfies readonly FormlessUiCreateSurfaceContract[];

const initiallyFailedSurfaceIds = new Set(["create-root"]);

export function FormlessCreateSurfacesLayout() {
  const [surfaces, setSurfaces] = useState<FormlessUiCreateSurfaceContract[]>(() =>
    createSurfaceFixtures.map(cloneCreateSurface),
  );
  const [failedSurfaceIds, setFailedSurfaceIds] = useState<Set<string>>(
    () => new Set(initiallyFailedSurfaceIds),
  );

  function handleFieldIntent(surfaceId: string, fieldId: string, intent: FormlessUiFieldIntent) {
    setSurfaces((currentSurfaces) =>
      currentSurfaces.map((surface) =>
        surface.id === surfaceId ? applyCreateFieldIntent(surface, fieldId, intent) : surface,
      ),
    );
  }

  async function handleCreateIntent(intent: FormlessUiCreateIntent) {
    if (intent.type === "createOpenChange") {
      setSurfaces((currentSurfaces) =>
        currentSurfaces.map((surface) => {
          if (surface.id === intent.surfaceId && intent.open && surface.trigger.disabled) {
            return surface;
          }

          return setCreateSurfaceOpen(
            surface,
            surface.id === intent.surfaceId
              ? intent.open
              : intent.open
                ? false
                : surface.dialog.open,
          );
        }),
      );
      return;
    }

    const surface = surfaces.find((candidate) => candidate.id === intent.surfaceId);
    if (!surface || surface.dialog.form.submit.disabled) {
      return;
    }

    const validatedSurface = validateCreateSurfaceForSubmit(surface);
    if (fieldValidationMessages(validatedSurface.dialog.form.fieldSet.fields).length > 0) {
      setSurfaces((currentSurfaces) =>
        updateCreateSurface(currentSurfaces, intent.surfaceId, () => validatedSurface),
      );
      return;
    }

    const shouldFail = !failedSurfaceIds.has(intent.surfaceId);
    setSurfaces((currentSurfaces) =>
      updateCreateSurface(currentSurfaces, intent.surfaceId, (currentSurface) =>
        setCreateSurfacePending(currentSurface, true),
      ),
    );

    await waitForFixtureSubmission();

    if (shouldFail) {
      setFailedSurfaceIds((currentIds) => new Set(currentIds).add(intent.surfaceId));
      setSurfaces((currentSurfaces) =>
        updateCreateSurface(currentSurfaces, intent.surfaceId, setCreateSurfaceFailed),
      );
      return;
    }

    setSurfaces((currentSurfaces) =>
      updateCreateSurface(currentSurfaces, intent.surfaceId, (currentSurface) =>
        setCreateSurfaceOpen(
          setCreateSurfacePending(clearCreateSurfaceFailure(currentSurface), false),
          false,
        ),
      ),
    );
  }

  return (
    <FormlessFixtureFrame ariaLabel="Create fixtures">
      <main {...stylex.props(styles.screen)}>
        <div {...stylex.props(styles.content)}>
          <VStack gap={4}>
            <Heading level={1}>Create</Heading>
            <CreateTriggerGroup
              title="Collection actions"
              surfaces={surfaces.slice(0, 2)}
              onFieldIntent={handleFieldIntent}
              onIntent={handleCreateIntent}
            />
            <CreateTriggerGroup
              title="Compact actions"
              surfaces={surfaces.slice(2, 4)}
              onFieldIntent={handleFieldIntent}
              onIntent={handleCreateIntent}
            />
            <CreateTriggerGroup
              title="Unavailable actions"
              surfaces={surfaces.slice(4)}
              onFieldIntent={handleFieldIntent}
              onIntent={handleCreateIntent}
            />
          </VStack>
        </div>
      </main>
    </FormlessFixtureFrame>
  );
}

function CreateTriggerGroup({
  onFieldIntent,
  onIntent,
  surfaces,
  title,
}: {
  onFieldIntent: (surfaceId: string, fieldId: string, intent: FormlessUiFieldIntent) => void;
  onIntent: FormlessUiCreateIntentHandler;
  surfaces: readonly FormlessUiCreateSurfaceContract[];
  title: string;
}) {
  return (
    <Card padding={4} variant="muted">
      <VStack gap={3}>
        <Heading level={2}>{title}</Heading>
        <HStack gap={2} wrap="wrap">
          {surfaces.map((surface) => (
            <AstryxCreateSurfaceRenderer
              key={surface.id}
              surface={surface}
              onFieldIntent={(fieldId, intent) => onFieldIntent(surface.id, fieldId, intent)}
              onIntent={onIntent}
            />
          ))}
        </HStack>
      </VStack>
    </Card>
  );
}

function createSurfaceFixture({
  density = "default",
  disabledReason,
  formErrors = [],
  id,
  prominence = "primary",
  task,
  title,
  trigger,
  triggerLabel,
}: {
  density?: FormlessUiButtonContract["density"];
  disabledReason?: string;
  formErrors?: readonly string[];
  id: string;
  prominence?: FormlessUiButtonContract["prominence"];
  task: string;
  title: string;
  trigger: FormlessUiButtonContract["content"];
  triggerLabel?: string;
}): FormlessUiCreateSurfaceContract {
  const fields = createFixtureFields(id, task);
  const disabled = disabledReason !== undefined;
  const submitLabel = formErrors.includes(submissionFailureMessage) ? "Retry" : title;

  return {
    dialog: {
      form: {
        cancel: createButtonContract(`${id}:cancel`, "Cancel", "secondary", "button"),
        errors: formErrors,
        fieldSet: {
          disabled,
          ...(disabledReason ? { disabledReason } : {}),
          errors: formErrors,
          fields,
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          ...createButtonContract(`${id}:submit`, submitLabel, "primary", "submit"),
          disabled,
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title,
    },
    id,
    kind: "createSurface",
    trigger: {
      accessibilityLabel: triggerLabel ?? (trigger.kind === "iconOnly" ? title : trigger.label),
      content: trigger,
      density,
      disabled,
      ...(disabledReason ? { disabledReason } : {}),
      id: `${id}:trigger`,
      kind: "button",
      prominence,
      type: "button",
    },
  };
}

function createFixtureFields(id: string, task: string): readonly FormlessUiCreateField[] {
  return [
    createField({
      control: textControl(taskFieldSchema),
      draftInput: { kind: "input", value: task },
      editor: "text",
      field: taskFieldSchema,
      fieldName: "task",
      labelVisibility: "visible",
      occurrence: { ownerId: id, placementId: "task" },
      recordId: id,
      value: task,
    }),
    createField({
      control: textControl(summaryFieldSchema),
      draftInput: { kind: "input", value: "Confirm scope and owner before launch." },
      editor: "textarea",
      field: summaryFieldSchema,
      fieldName: "summary",
      labelVisibility: "visible",
      occurrence: { ownerId: id, placementId: "summary" },
      recordId: id,
      value: "Confirm scope and owner before launch.",
    }),
  ];
}

function createButtonContract(
  id: string,
  label: string,
  prominence: FormlessUiButtonContract["prominence"],
  type: FormlessUiButtonContract["type"],
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}

function applyCreateFieldIntent(
  surface: FormlessUiCreateSurfaceContract,
  fieldId: string,
  intent: FormlessUiFieldIntent,
): FormlessUiCreateSurfaceContract {
  const fields = surface.dialog.form.fieldSet.fields.map((field) => {
    if (field.fieldId !== fieldId) {
      return field;
    }
    const nextField = applyFixtureFieldIntent(field, intent);
    return nextField === field ? field : validateFixtureField(nextField);
  });

  return setCreateSurfaceFields(surface, fields);
}

function validateCreateSurfaceForSubmit(
  surface: FormlessUiCreateSurfaceContract,
): FormlessUiCreateSurfaceContract {
  return setCreateSurfaceFields(
    surface,
    surface.dialog.form.fieldSet.fields.map(validateFixtureField),
  );
}

function setCreateSurfaceFields(
  surface: FormlessUiCreateSurfaceContract,
  fields: readonly FormlessUiCreateField[],
): FormlessUiCreateSurfaceContract {
  const validationErrors = fieldValidationMessages(fields);

  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        fieldSet: {
          ...surface.dialog.form.fieldSet,
          fields,
        },
        submit: {
          ...surface.dialog.form.submit,
          disabled: surface.dialog.form.fieldSet.disabled || validationErrors.length > 0,
        },
      },
    },
  };
}

function applyFixtureFieldIntent(
  field: FormlessUiCreateField,
  intent: FormlessUiFieldIntent,
): FormlessUiCreateField {
  if (intent.type !== "createDraftChange" || field.fieldName !== intent.fieldName) {
    return field;
  }

  return {
    ...field,
    draftInput: intent.fieldValue,
    value: intent.fieldValue.value,
  };
}

function validateFixtureField(field: FormlessUiCreateField): FormlessUiCreateField {
  if (field.fieldName !== "task") {
    return field;
  }

  const task = String(field.draftInput?.value ?? "");
  return {
    ...field,
    errors: task.trim() === "" ? [fieldError("task", requiredTaskMessage, task)] : undefined,
  };
}

function fieldValidationMessages(fields: readonly FormlessUiCreateField[]) {
  return fields.flatMap((field) => field.errors?.map((error) => error.message) ?? []);
}

function setCreateSurfaceOpen(
  surface: FormlessUiCreateSurfaceContract,
  open: boolean,
): FormlessUiCreateSurfaceContract {
  return surface.dialog.open === open
    ? surface
    : { ...surface, dialog: { ...surface.dialog, open } };
}

function setCreateSurfacePending(
  surface: FormlessUiCreateSurfaceContract,
  pending: boolean,
): FormlessUiCreateSurfaceContract {
  const pendingFacts = pending ? { isPending: true, label: "Saving" } : undefined;
  const validationErrors = fieldValidationMessages(surface.dialog.form.fieldSet.fields);
  const submitLabel = surface.dialog.form.errors.includes(submissionFailureMessage)
    ? "Retry"
    : surface.dialog.title;

  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        fieldSet: {
          ...surface.dialog.form.fieldSet,
          disabled: pending,
          disabledReason: pending ? "Create task is being submitted." : undefined,
        },
        submit: {
          ...surface.dialog.form.submit,
          accessibilityLabel: pending ? "Saving" : submitLabel,
          content: { kind: "label", label: pending ? "Saving..." : submitLabel },
          disabled: pending || validationErrors.length > 0,
          pending: pendingFacts,
        },
      },
    },
  };
}

function setCreateSurfaceFailed(
  surface: FormlessUiCreateSurfaceContract,
): FormlessUiCreateSurfaceContract {
  const currentSurface = setCreateSurfacePending(surface, false);
  const errors = [
    ...currentSurface.dialog.form.errors.filter((message) => message !== submissionFailureMessage),
    submissionFailureMessage,
  ];

  return {
    ...currentSurface,
    dialog: {
      ...currentSurface.dialog,
      form: {
        ...currentSurface.dialog.form,
        errors,
        fieldSet: {
          ...currentSurface.dialog.form.fieldSet,
          errors,
        },
        submit: {
          ...currentSurface.dialog.form.submit,
          accessibilityLabel: "Retry",
          content: { kind: "label", label: "Retry" },
        },
      },
    },
  };
}

function clearCreateSurfaceFailure(
  surface: FormlessUiCreateSurfaceContract,
): FormlessUiCreateSurfaceContract {
  const errors = surface.dialog.form.errors.filter(
    (message) => message !== submissionFailureMessage,
  );

  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        errors,
        fieldSet: {
          ...surface.dialog.form.fieldSet,
          errors,
        },
      },
    },
  };
}

function updateCreateSurface(
  surfaces: readonly FormlessUiCreateSurfaceContract[],
  surfaceId: string,
  update: (surface: FormlessUiCreateSurfaceContract) => FormlessUiCreateSurfaceContract,
) {
  return surfaces.map((surface) => (surface.id === surfaceId ? update(surface) : surface));
}

function cloneCreateSurface(surface: FormlessUiCreateSurfaceContract) {
  return structuredClone(surface);
}

function waitForFixtureSubmission() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, submissionDelayMs);
  });
}

const styles = stylex.create({
  screen: {
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
    minHeight: "100vh",
    paddingBlock: spacingVars["--spacing-6"],
    paddingInline: spacingVars["--spacing-6"],
    "@media (max-width: 720px)": {
      paddingBlock: spacingVars["--spacing-4"],
      paddingInline: spacingVars["--spacing-4"],
    },
  },
  content: {
    marginInline: "auto",
    width: "min(100%, 760px)",
  },
});
