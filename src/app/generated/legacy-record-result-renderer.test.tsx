import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiFieldIntent,
  FormlessUiRecordResultContract,
} from "@dpeek/formless-astryx/contract";
import type { GeneratedOperationControlBinding } from "../../client/views.ts";
import {
  generatedRecordResultFieldId,
  projectGeneratedRecordResultOperationAction,
} from "./formless-ui-record-result-projection.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import { projectGeneratedRecordFormlessUiField } from "./formless-ui-projection.ts";
import {
  dispatchLegacyRecordResultFieldIntent,
  dispatchLegacyRecordResultOperationIntent,
  LegacyRecordResultRenderer,
} from "./legacy-record-result-renderer.tsx";

describe("legacy record-result renderer", () => {
  it("renders canonical fields, action hierarchy, failures, confirmation, warnings, and disabled editing", () => {
    const recordResult = readyRecordResult({ editingEnabled: false });
    const html = renderToStaticMarkup(
      <LegacyRecordResultRenderer onIntent={() => {}} recordResult={recordResult} />,
    );

    expect(html).toContain('data-formless-legacy-record-result="tasks:detail"');
    expect(html).toContain('aria-label="Task record"');
    expect(html).toContain("Task updates are unavailable.");
    expect(html).toContain('aria-label="Title"');
    expect(html).toContain("Update failed.");
    expect(html).toContain('aria-label="Edit Icon"');
    expect(html).toContain('data-web-field-kind="media"');
    expect(html).toContain('aria-label="Complete"');
    expect(html).toContain("Transition failed.");
    expect(html).toContain('aria-label="More actions for Review launch"');
    expect(recordResult.actions.secondary[0]?.control.confirmation).toMatchObject({
      open: true,
      title: "Delete Review launch?",
    });
    expect(html).toContain('aria-label="Readiness warnings"');
    expect(html).toContain("Assign an owner.");
  });

  it("dispatches ordinary, failure, icon, media, transition, delete, and confirmation intents through canonical identities", async () => {
    const recordResult = readyRecordResult();
    const calls: unknown[] = [];
    const handler = (intent: unknown) => {
      calls.push(intent);
    };
    const ordinaryIntents: FormlessUiFieldIntent[] = [
      { fieldName: "title", type: "recordEditorDraftChange", value: "Next title" },
      { fieldName: "title", type: "recordValueCommit", value: "Next title" },
      { fieldName: "title", message: "Update failed.", type: "fieldErrorChange" },
    ];
    const iconIntents: FormlessUiFieldIntent[] = [
      { fieldName: "icon", open: true, type: "iconDialogOpenChange" },
      { fieldName: "icon", type: "iconDialogSave" },
    ];
    const mediaIntents: FormlessUiFieldIntent[] = [
      { assetId: "media-2", fieldName: "hero", type: "mediaAssetSelect" },
      { fieldName: "hero", file: undefined, type: "mediaFileSelect" },
    ];

    for (const [fieldName, intents] of [
      ["title", ordinaryIntents],
      ["icon", iconIntents],
      ["hero", mediaIntents],
    ] as const) {
      const field = requiredField(recordResult, fieldName);
      for (const intent of intents) {
        await dispatchLegacyRecordResultFieldIntent(handler, recordResult, "task-1", field, intent);
      }
    }

    const transition = recordResult.actions.primary[0]!;
    const deletion = recordResult.actions.secondary[0]!;
    await dispatchLegacyRecordResultOperationIntent(
      handler,
      recordResult,
      "task-1",
      transition,
      transition.control.trigger.intent,
    );
    await dispatchLegacyRecordResultOperationIntent(
      handler,
      recordResult,
      "task-1",
      deletion,
      deletion.control.trigger.intent,
    );
    await dispatchLegacyRecordResultOperationIntent(
      handler,
      recordResult,
      "task-1",
      deletion,
      deletion.control.confirmation!.action.intent,
    );

    expect(calls).toHaveLength(10);
    expect(calls.slice(0, 7)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "tasks:detail:task-1:field:title",
          intent: { fieldName: "title", type: "recordValueCommit", value: "Next title" },
          recordId: "task-1",
          resultId: "tasks:detail",
          type: "recordResultFieldIntent",
        }),
        expect.objectContaining({
          fieldId: "tasks:detail:task-1:field:icon",
          intent: { fieldName: "icon", type: "iconDialogSave" },
        }),
        expect.objectContaining({
          fieldId: "tasks:detail:task-1:field:hero",
          intent: { assetId: "media-2", fieldName: "hero", type: "mediaAssetSelect" },
        }),
      ]),
    );
    expect(calls.slice(7)).toEqual([
      {
        controlId: transition.control.id,
        intent: transition.control.trigger.intent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultOperationIntent",
      },
      {
        controlId: deletion.control.id,
        intent: deletion.control.trigger.intent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultOperationIntent",
      },
      {
        controlId: deletion.control.id,
        intent: deletion.control.confirmation!.action.intent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultOperationIntent",
      },
    ]);
  });

  it("renders projected empty and unavailable states without inventing record content", () => {
    const empty = stateRecordResult("empty");
    const unavailable = stateRecordResult("unavailable");
    const emptyHtml = renderToStaticMarkup(
      <LegacyRecordResultRenderer onIntent={() => {}} recordResult={empty} />,
    );
    const unavailableHtml = renderToStaticMarkup(
      <LegacyRecordResultRenderer onIntent={() => {}} recordResult={unavailable} />,
    );

    expect(emptyHtml).toContain('data-formless-record-result-empty-state="tasks:empty"');
    expect(emptyHtml).toContain("No task record found.");
    expect(emptyHtml).not.toContain("data-formless-record-result-field=");
    expect(unavailableHtml).toContain("Record unavailable.");
    expect(unavailableHtml).not.toContain("data-formless-record-result-field=");
  });
});

function readyRecordResult({
  editingEnabled = true,
}: { editingEnabled?: boolean } = {}): FormlessUiRecordResultContract {
  const title = projectGeneratedRecordFormlessUiField({
    canPatch: editingEnabled,
    disabledReason: editingEnabled ? undefined : "Task updates are unavailable.",
    editorDraft: "Draft title",
    error: "Update failed.",
    fieldConfig: {
      commit: "field-commit",
      editor: "text",
      field: { required: true, type: "text" },
      fieldName: "title",
      label: "Title",
    },
    recordId: "task-1",
    recordValue: "Review launch",
    showLabel: true,
  });
  const icon = projectGeneratedRecordFormlessUiField({
    canPatch: editingEnabled,
    disabledReason: editingEnabled ? undefined : "Task updates are unavailable.",
    fieldConfig: {
      commit: "field-commit",
      editor: "icon",
      field: { format: "icon", required: false, type: "text" },
      fieldName: "icon",
      label: "Icon",
    },
    iconDialogOpen: true,
    recordId: "task-1",
    recordValue: "",
    showLabel: true,
  });
  const hero = projectGeneratedRecordFormlessUiField({
    canPatch: editingEnabled,
    disabledReason: editingEnabled ? undefined : "Task updates are unavailable.",
    fieldConfig: {
      commit: "field-commit",
      editor: "media",
      field: { format: "href", required: false, type: "text" },
      fieldName: "hero",
      label: "Hero",
    },
    mediaAssetOptions: [{ href: "/media/one", id: "media-1", label: "Hero image" }],
    recordId: "task-1",
    recordValue: "media-1",
    showLabel: true,
  });
  const transitionBinding = operationBinding("transition");
  const deleteBinding = operationBinding("delete");
  const transition = projectGeneratedRecordResultOperationAction(
    projectGeneratedOperationFormlessUiControl({
      binding: transitionBinding,
      presentation: {
        accessibilityLabel: "Complete",
        content: { kind: "label", label: "Complete" },
        density: "default",
        prominence: "primary",
      },
      state: {
        completedAt: 2,
        executionKey: transitionBinding.executionKey,
        result: { displayError: "Transition failed.", type: "failed" },
        status: "failed",
      },
    }),
    "transition",
  );
  const deletion = projectGeneratedRecordResultOperationAction(
    projectGeneratedOperationFormlessUiControl({
      binding: deleteBinding,
      confirmationOpen: true,
      presentation: {
        accessibilityLabel: "Delete Review launch",
        content: { kind: "label", label: "Delete" },
        density: "default",
        prominence: "destructive",
      },
      state: { executionKey: deleteBinding.executionKey, status: "idle" },
    }),
    "delete",
  );

  return {
    accessibilityLabel: "Task record",
    actions: {
      id: "tasks:detail:actions",
      kind: "actionGroup",
      primary: [transition],
      secondary: [deletion],
      secondaryAccessibilityLabel: "More actions for Review launch",
    },
    availability: { state: "ready" },
    density: "default",
    editing: editingEnabled
      ? { enabled: true }
      : { disabledReason: "Task updates are unavailable.", enabled: false },
    fields: [title, icon, hero].map((field) => ({
      field,
      id: generatedRecordResultFieldId("tasks:detail", "task-1", field.fieldName),
      kind: "recordResultField" as const,
    })),
    id: "tasks:detail",
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel: "Review launch",
      id: "task-1",
      kind: "recordResultRecord",
    },
    warnings: [
      {
        id: "tasks:detail:task-1:warning",
        items: [{ code: "owner", message: "Assign an owner." }],
        kind: "recordResultWarning",
        title: "Readiness warnings",
      },
    ],
  };
}

function stateRecordResult(state: "empty" | "unavailable"): FormlessUiRecordResultContract {
  return {
    accessibilityLabel: "Task record",
    actions: {
      id: `tasks:${state}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More actions for Task record",
    },
    availability: state === "empty" ? { state } : { message: "Record unavailable.", state },
    density: "default",
    editing: { enabled: true },
    ...(state === "empty"
      ? {
          emptyState: {
            id: "tasks:empty",
            kind: "recordResultEmptyState" as const,
            title: "No task record found.",
          },
        }
      : {
          selectedRecord: {
            accessibilityLabel: "Task missing",
            id: "missing",
            kind: "recordResultRecord" as const,
          },
        }),
    fields: [],
    id: `tasks:${state}`,
    kind: "recordResult",
    warnings: [],
  };
}

function requiredField(recordResult: FormlessUiRecordResultContract, fieldName: string) {
  const field = recordResult.fields.find((candidate) => candidate.field.fieldName === fieldName);

  if (!field) {
    throw new Error(`Missing field ${fieldName}.`);
  }

  return field;
}

function operationBinding(kind: "delete" | "transition"): GeneratedOperationControlBinding {
  if (kind === "delete") {
    return {
      availability: { state: "enabled" },
      canonicalOperationKey: "task.delete",
      confirmation: {
        actionLabel: "Delete",
        description: "The task will be deleted.",
        title: "Delete Review launch?",
      },
      destructive: true,
      entityName: "task",
      executionKey: "task.delete:task-1",
      id: "tasks:detail:task-1:delete",
      input: { entityLabel: "Task", kind: "recordDelete", recordLabel: "Review launch" },
      kind: "delete",
      label: "Delete",
      operationKind: "delete",
      operationName: "delete",
      scope: "record",
      visualIntent: "destructive",
    };
  }

  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "task.complete",
    entityName: "task",
    executionKey: "task.complete:task-1",
    id: "tasks:detail:task-1:complete",
    input: {
      fieldName: "status",
      kind: "stateTransition",
      machineName: "taskStatus",
      targetState: "done",
      transitionName: "complete",
    },
    kind: "stateTransition",
    label: "Complete",
    operationKind: "command",
    operationName: "complete",
    scope: "record",
    visualIntent: "primary",
  };
}
