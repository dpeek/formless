import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  ListContract,
  ListOperationActionContract,
} from "@dpeek/formless-presentation/contract";
import { createListFixtures } from "./lists.fixtures.ts";
import {
  FormlessListsLayout,
  applyListFieldIntent,
  applyListIntent,
  applyListOperationIntent,
  selectedListFixture,
} from "./lists.tsx";

describe("canonical list fixtures", () => {
  it("cover production list contract states with serializable data", () => {
    const fixtures = createListFixtures();
    const active = requiredFixture(fixtures, "active").list;
    const empty = requiredFixture(fixtures, "empty").list;
    const editingDisabled = requiredFixture(fixtures, "editing-disabled").list;
    const editableTitle = requiredField(active, "task-1", "title");
    const readOnlyTitle = requiredField(active, "task-2", "title");
    const linkFields = active.items.find((item) => item.id === "task-2")?.fields ?? [];
    const articleFields = active.items.find((item) => item.id === "task-1")?.fields ?? [];
    const invalidTitle = requiredField(active, "task-3", "title");
    const deleteAction = requiredDeleteAction(active, "task-1");

    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(active.density).toBe("compact");
    expect(editableTitle.mode).toBe("editor");
    expect(readOnlyTitle.mode).toBe("display");
    expect(readOnlyTitle.pending).toEqual({ isPending: true, label: "Saving task" });
    expect(linkFields.map((field) => field.fieldName)).toContain("url");
    expect(linkFields.map((field) => field.fieldName)).not.toContain("summary");
    expect(requiredField(active, "task-2", "url").visibleWhen).toEqual({
      field: "kind",
      values: ["link"],
    });
    expect(articleFields.map((field) => field.fieldName)).toContain("summary");
    expect(articleFields.map((field) => field.fieldName).includes("url")).toBe(false);
    expect(requiredField(active, "task-1", "status").stateMachineFacts?.interaction.kind).toBe(
      "transitions",
    );
    expect(deleteAction.control.confirmation?.kind).toBe("destructiveConfirmation");
    expect(requiredOrdering(active, "task-1").actions).toMatchObject([
      { direction: "top", structurallyAvailable: false },
      { direction: "up", structurallyAvailable: false },
      { direction: "down", structurallyAvailable: true },
      { direction: "bottom", structurallyAvailable: true },
    ]);
    expect(requiredOrdering(active, "task-2").pending).toBe(true);
    expect(requiredOrdering(active, "task-3").actions).toMatchObject([
      { direction: "top", structurallyAvailable: true },
      { direction: "up", structurallyAvailable: true },
      { direction: "down", structurallyAvailable: false },
      { direction: "bottom", structurallyAvailable: false },
    ]);
    expect(active.items[0]?.warnings[0]?.title).toBe("Readiness warnings");
    expect(invalidTitle.errors?.[0]?.message).toBe("Task title is required.");
    expect(empty.items).toEqual([]);
    expect(empty.emptyState?.title).toBe("No matching tasks");
    expect(editingDisabled.editing).toEqual({
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    });
    expect(editingDisabled.items[0]?.fields.every((field) => field.mode === "display")).toBe(true);
  });
});

describe("Lists prototype layout", () => {
  it("renders the active fixture through a real Astryx list", () => {
    const html = renderToStaticMarkup(<FormlessListsLayout />);

    expect(html).toContain("<h1");
    expect(html).toContain("Lists");
    expect(html).toContain('aria-label="Tasks"');
    expect(html).toContain("<ul");
    expect(html).toContain("Prepare launch checklist");
    expect(html).toContain("Review release copy");
    expect(html).toContain("Complete");
    expect(html).toContain("Owner email is missing.");
    expect(html).toContain('aria-label="More actions for Prepare launch checklist"');
  });

  it("simulates editable fields and state transitions through canonical field intents", () => {
    const active = activeList();
    const title = requiredField(active, "task-1", "title");
    const edited = applyListFieldIntent(active, "task-1", title, {
      fieldName: "title",
      type: "recordEditorDraftChange",
      value: "Prepare release checklist",
    });
    const editedTitle = requiredField(edited, "task-1", "title");
    const status = requiredField(edited, "task-1", "status");
    const transition =
      status.stateMachineFacts?.interaction.kind === "transitions"
        ? status.stateMachineFacts.interaction.transitions.find(
            (candidate) => candidate.transitionName === "complete",
          )
        : undefined;

    expect(editedTitle.mode).toBe("editor");
    if (editedTitle.mode !== "editor" || !("drafts" in editedTitle)) {
      throw new Error("Expected editable title fixture.");
    }
    expect(editedTitle.drafts.draft).toBe("Prepare release checklist");
    if (!transition) {
      throw new Error("Expected complete transition fixture.");
    }

    const completed = applyListFieldIntent(edited, "task-1", status, {
      fieldName: status.fieldName,
      operationName: transition.operationName,
      recordId: "task-1",
      source: "menuItem",
      transitionName: transition.transitionName,
      type: "stateTransitionInvoke",
    });
    const completedStatus = requiredField(completed, "task-1", "status");

    expect(completedStatus.value).toBe("done");
    expect(completedStatus.stateMachineFacts?.terminal).toBe(true);
  });

  it("simulates destructive confirmation and operation completion", () => {
    const active = activeList();
    const deleteAction = requiredDeleteAction(active, "task-1");
    const openIntent = deleteAction.control.trigger.intent;

    expect(openIntent.type).toBe("operationConfirmationOpenChange");
    const confirmationOpen = applyListOperationIntent(active, deleteAction, openIntent);
    const openDelete = requiredDeleteAction(confirmationOpen, "task-1");
    expect(openDelete.control.confirmation?.open).toBe(true);

    const confirmIntent = openDelete.control.confirmation?.action.intent;
    if (!confirmIntent || confirmIntent.type !== "operationInvoke") {
      throw new Error("Expected destructive invocation intent.");
    }

    const completed = applyListOperationIntent(confirmationOpen, openDelete, confirmIntent);
    const completedDelete = requiredDeleteAction(completed, "task-1");
    expect(completedDelete.control.confirmation?.open).toBe(false);
    expect(completedDelete.control.status.status).toBe("committed");
    expect(completedDelete.control.feedback?.title).toBe("Task deleted");
  });

  it("simulates a direct operation intent from the projected empty state", () => {
    const empty = requiredFixture(createListFixtures(), "empty").list;
    const refreshAction = empty.emptyState?.action;
    if (!refreshAction || refreshAction.control.trigger.intent.type !== "operationInvoke") {
      throw new Error("Expected refresh operation fixture.");
    }

    const pending = applyListOperationIntent(
      empty,
      refreshAction,
      refreshAction.control.trigger.intent,
    );

    expect(pending.emptyState?.action?.control.status.status).toBe("pending");
    expect(pending.emptyState?.action?.control.trigger.pending?.label).toBe("Refreshing tasks");
  });

  it("simulates reorder intents and recomputes structural boundaries", () => {
    const active = activeList();
    const moveDown = requiredOrdering(active, "task-1").actions.find(
      (action) => action.direction === "down",
    );
    if (!moveDown) {
      throw new Error("Expected move-down fixture action.");
    }

    const reordered = applyListIntent(active, moveDown.intent);

    expect(reordered.items.map((item) => item.id)).toEqual(["task-2", "task-1", "task-3"]);
    expect(
      requiredOrdering(reordered, "task-2").actions.find((action) => action.direction === "up")
        ?.structurallyAvailable,
    ).toBe(false);
    expect(
      requiredOrdering(reordered, "task-1").actions.find((action) => action.direction === "up")
        ?.structurallyAvailable,
    ).toBe(true);
  });
});

function activeList() {
  return requiredFixture(createListFixtures(), "active").list;
}

function requiredFixture(
  fixtures: ReturnType<typeof createListFixtures>,
  id: "active" | "editing-disabled" | "empty",
) {
  const fixture = selectedListFixture(fixtures, id);

  if (!fixture) {
    throw new Error(`Missing ${id} list fixture.`);
  }

  return fixture;
}

function requiredField(list: ListContract, itemId: string, fieldName: string) {
  const field = list.items
    .find((item) => item.id === itemId)
    ?.fields.find((candidate) => candidate.fieldName === fieldName);

  if (!field) {
    throw new Error(`Missing ${fieldName} field for ${itemId}.`);
  }

  return field;
}

function requiredDeleteAction(list: ListContract, itemId: string) {
  const action = list.items
    .find((item) => item.id === itemId)
    ?.actions.secondary.find(
      (candidate): candidate is ListOperationActionContract =>
        candidate.kind === "operationAction" && candidate.role === "delete",
    );

  if (!action) {
    throw new Error(`Missing delete action for ${itemId}.`);
  }

  return action;
}

function requiredOrdering(list: ListContract, itemId: string) {
  const ordering = list.items.find((item) => item.id === itemId)?.ordering;

  if (!ordering) {
    throw new Error(`Missing ordering fixture for ${itemId}.`);
  }

  return ordering;
}
