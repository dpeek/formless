import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiListContract,
  FormlessUiListOrderingActionContract,
} from "@dpeek/formless-astryx/contract";
import type { GeneratedOperationControlBinding } from "../../client/views.ts";
import { projectGeneratedListOperationAction } from "./formless-ui-list-projection.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import { projectGeneratedRecordFormlessUiField } from "./formless-ui-projection.ts";
import {
  dispatchLegacyListFieldIntent,
  dispatchLegacyListOperationIntent,
  dispatchLegacyListOrderingIntent,
  LegacyListRenderer,
} from "./legacy-list-renderer.tsx";

describe("legacy list renderer", () => {
  it("renders only canonical list facts for fields, actions, warnings, fallbacks, and disabled editing", () => {
    const list = listContract();
    const html = renderToStaticMarkup(
      <LegacyListRenderer
        list={list}
        onFieldIntent={() => {}}
        onListIntent={() => {}}
        onOperationIntent={() => {}}
      />,
    );

    expect(html).toContain('data-formless-legacy-list="tasks:active"');
    expect(html).toContain("Editing is disabled for Task.");
    expect(html).toContain('role="list"');
    expect(html).toContain('role="listitem"');
    expect(html).toContain('aria-label="Title"');
    expect(html).toContain('aria-label="More actions for Review launch"');
    expect(html).toContain('aria-label="Readiness warnings"');
    expect(html).toContain("Missing owner.");
    expect(html).toContain("Record unavailable.");
    expect(html).not.toContain("data-formless-ordering-handle");
    expect(html).not.toContain("data-formless-sortable-list-item");
  });

  it("dispatches projected field, operation, confirmation, and ordering intents unchanged", async () => {
    const list = listContract();
    const item = list.items[0]!;
    const field = item.fields[0]!;
    const operation = item.actions.secondary[0]!;
    const ordering = item.ordering!.actions[1]!;
    const fieldCalls: unknown[] = [];
    const operationCalls: unknown[] = [];
    const orderingCalls: unknown[] = [];
    const fieldIntent = { fieldName: "title", type: "recordDraftRevert" } as const;

    await dispatchLegacyListFieldIntent(
      (itemId, projectedField, intent) => {
        fieldCalls.push(itemId, projectedField, intent);
      },
      item.id,
      field,
      fieldIntent,
    );
    await dispatchLegacyListOperationIntent(
      (action, intent) => {
        operationCalls.push(action, intent);
      },
      operation,
      operation.control.trigger.intent,
    );
    await dispatchLegacyListOperationIntent(
      (action, intent) => {
        operationCalls.push(action, intent);
      },
      operation,
      operation.control.confirmation!.action.intent,
    );
    await dispatchLegacyListOrderingIntent((intent) => {
      orderingCalls.push(intent);
    }, ordering);

    expect(fieldCalls).toEqual([item.id, field, fieldIntent]);
    expect(operationCalls).toEqual([
      operation,
      operation.control.trigger.intent,
      operation,
      operation.control.confirmation!.action.intent,
    ]);
    expect(orderingCalls).toEqual([ordering.intent]);
  });

  it("renders the projected empty state without inventing an action", () => {
    const list: FormlessUiListContract = {
      accessibilityLabel: "Task records",
      density: "compact",
      editing: { enabled: true },
      emptyState: {
        id: "tasks:empty",
        kind: "listEmptyState",
        title: "No records yet.",
      },
      id: "tasks:active",
      items: [],
      kind: "list",
    };
    const html = renderToStaticMarkup(
      <LegacyListRenderer
        list={list}
        onFieldIntent={() => {}}
        onListIntent={() => {}}
        onOperationIntent={() => {}}
      />,
    );

    expect(html).toContain('data-formless-list-empty-state="tasks:empty"');
    expect(html).toContain("No records yet.");
    expect(html).not.toContain("button");
  });
});

function listContract(): FormlessUiListContract {
  const field = projectGeneratedRecordFormlessUiField({
    canPatch: true,
    fieldConfig: {
      commit: "field-commit",
      editor: "text",
      field: { label: "Title", required: true, type: "text" },
      fieldName: "title",
    },
    recordId: "task-1",
    recordValue: "Review launch",
  });
  const operation = projectGeneratedListOperationAction(
    projectGeneratedOperationFormlessUiControl({
      binding: deleteBinding(),
      confirmationOpen: true,
      presentation: {
        accessibilityLabel: "Delete Review launch",
        content: { icon: "delete", kind: "iconOnly" },
        density: "compact",
        prominence: "destructive",
      },
      state: { executionKey: "task.delete:task-1", status: "idle" },
    }),
    "delete",
  );
  const ordering = orderingActions();

  return {
    accessibilityLabel: "Task records",
    density: "compact",
    editing: { disabledReason: "Editing is disabled for Task.", enabled: false },
    id: "tasks:active",
    items: [
      {
        accessibilityLabel: "Review launch",
        actions: {
          id: "task-1:actions",
          kind: "actionGroup",
          primary: [],
          secondary: [operation],
          secondaryAccessibilityLabel: "More actions for Review launch",
        },
        availability: { available: true },
        fields: [field],
        id: "task-1",
        kind: "listItem",
        ordering: {
          accessibilityLabel: "Reorder Review launch",
          actions: ordering,
          affordance: "reorder",
          kind: "ordering",
          pending: false,
        },
        warnings: [
          {
            id: "task-1:warning",
            items: [{ code: "missing-owner", message: "Missing owner." }],
            kind: "listWarning",
            title: "Readiness warnings",
          },
        ],
      },
      {
        accessibilityLabel: "task-2",
        actions: {
          id: "task-2:actions",
          kind: "actionGroup",
          primary: [],
          secondary: [],
          secondaryAccessibilityLabel: "More actions for task-2",
        },
        availability: { available: false, message: "Record unavailable." },
        fields: [],
        id: "task-2",
        kind: "listItem",
        warnings: [],
      },
    ],
    kind: "list",
  };
}

function orderingActions(): FormlessUiListOrderingActionContract[] {
  return [
    {
      direction: "top",
      disabled: true,
      disabledReason: "Already first",
      id: "task-1:order:top",
      intent: {
        actionId: "task-1:order:top",
        direction: "top",
        itemId: "task-1",
        listId: "tasks:active",
        type: "listReorder",
      },
      label: "Move to top",
      structurallyAvailable: false,
    },
    {
      direction: "down",
      id: "task-1:order:down",
      intent: {
        actionId: "task-1:order:down",
        direction: "down",
        itemId: "task-1",
        listId: "tasks:active",
        type: "listReorder",
      },
      label: "Move down",
      structurallyAvailable: true,
    },
  ];
}

function deleteBinding(): GeneratedOperationControlBinding {
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
    id: "task.delete:task-1",
    input: { entityLabel: "Task", kind: "recordDelete", recordLabel: "Review launch" },
    kind: "delete",
    label: "Delete",
    operationKind: "delete",
    operationName: "delete",
    scope: "record",
    visualIntent: "destructive",
  };
}
