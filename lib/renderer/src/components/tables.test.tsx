import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  TableActionGroupContract,
  TableContract,
  TableEditActionContract,
  TableOperationActionContract,
  TableOrderingContract,
} from "@dpeek/formless-presentation/contract";
import { createTableFixtures } from "./tables.fixtures.ts";
import {
  FormlessTablesLayout,
  applyTableFieldIntent,
  applyTableIntent,
  applyTableOperationIntent,
  selectedTableFixture,
} from "./tables.tsx";

describe("canonical table fixtures", () => {
  it("cover production table contract states with serializable data", () => {
    const fixtures = createTableFixtures();
    const active = requiredFixture(fixtures, "active").table;
    const empty = requiredFixture(fixtures, "empty").table;
    const editingDisabled = requiredFixture(fixtures, "editing-disabled").table;
    const fields = active.rows.flatMap(tableRowFields);
    const values = active.rows.flatMap((row) =>
      row.cells.flatMap((cell) =>
        cell.contents.filter((content) => content.kind === "displayValue"),
      ),
    );
    const actionGroup = requiredActionGroup(active, "task-1");
    const editAction = requiredEditAction(actionGroup);
    const deleteAction = requiredDeleteAction(actionGroup);

    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect([active.density, empty.density, editingDisabled.density]).toEqual([
      "default",
      "default",
      "default",
    ]);
    expect(active.columns.find((column) => column.id === "score")?.width).toBe("sm");
    expect(fields.some((field) => field.mode === "editor")).toBe(true);
    expect(fields.some((field) => field.mode === "display" && field.fieldName === "title")).toBe(
      true,
    );
    expect(
      fields.some(
        (field) =>
          field.fieldName === "status" &&
          field.stateMachineFacts?.interaction.kind === "transitions",
      ),
    ).toBe(true);
    expect(values.some((value) => value.valueKind === "reference")).toBe(true);
    expect(
      values.some((value) => value.valueKind === "computed" && value.status.kind === "pending"),
    ).toBe(true);
    expect(
      values.some((value) => value.valueKind === "computed" && value.status.kind === "invalid"),
    ).toBe(true);
    expect(actionGroup.primary).toEqual([]);
    expect(editAction.dialog.target.kind).toBe("available");
    if (editAction.dialog.target.kind !== "available") {
      throw new Error("Expected available edit target.");
    }
    expect(editAction.dialog.target.fieldSet.fields).toMatchObject([
      { fieldName: "title", labelVisibility: "visible", surface: "record" },
      { fieldName: "status", labelVisibility: "visible", surface: "record" },
    ]);
    expect(deleteAction.control.confirmation?.kind).toBe("destructiveConfirmation");
    expect(requiredOrdering(active, "task-1").actions).toHaveLength(4);
    expect(active.rows[0]?.warnings[0]?.title).toBe("Readiness warnings");
    expect(active.footer?.cells.some((cell) => cell.kind === "aggregateFooterCell")).toBe(true);
    expect(empty.rows).toEqual([]);
    expect(empty.emptyState?.title).toBe("No matching tasks");
    expect(editingDisabled.editing).toEqual({
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    });
  });
});

describe("Tables prototype layout", () => {
  it("renders the active fixture through a real Astryx table", () => {
    const html = renderToStaticMarkup(<FormlessTablesLayout />);

    expect(html).toContain("<h1");
    expect(html).toContain("Tables");
    expect(html).toContain('<table aria-label="Tasks"');
    expect(html).toContain("Prepare launch");
    expect(html).toContain("Complete");
    expect(html).toContain('aria-label="Editing is unavailable"');
    expect(html).toContain('aria-label="Row warning: Owner email is missing."');
    expect(html).toContain("Task aggregates");
  });

  it("simulates inline and dialog field edits through canonical field intents", () => {
    const active = activeTable();
    const titleField = requiredField(active, "task-1", "title");
    const updated = applyTableFieldIntent(active, titleField.fieldId, {
      fieldName: "title",
      type: "recordEditorDraftChange",
      value: "Prepare launch plan",
    });
    const updatedTitle = requiredField(updated, "task-1", "title");
    const editAction = requiredEditAction(requiredActionGroup(updated, "task-1"));

    expect(updatedTitle.mode).toBe("editor");
    if (updatedTitle.mode !== "editor" || !("drafts" in updatedTitle)) {
      throw new Error("Expected editable title fixture.");
    }
    expect(updatedTitle.drafts.draft).toBe("Prepare launch plan");
    expect(editAction.dialog.target.kind).toBe("available");
    if (editAction.dialog.target.kind !== "available") {
      throw new Error("Expected available edit target.");
    }
    const dialogTitle = editAction.dialog.target.fieldSet.fields[0];
    expect(dialogTitle?.mode).toBe("editor");
    expect(dialogTitle && "drafts" in dialogTitle ? dialogTitle.drafts.draft : undefined).toBe(
      "Prepare launch checklist",
    );
    const updatedDialog = dialogTitle
      ? applyTableFieldIntent(updated, dialogTitle.fieldId, {
          fieldName: "title",
          type: "recordEditorDraftChange",
          value: "Prepare launch dialog",
        })
      : updated;
    const updatedDialogAction = requiredEditAction(requiredActionGroup(updatedDialog, "task-1"));
    expect(
      updatedDialogAction.dialog.target.kind === "available" &&
        "drafts" in updatedDialogAction.dialog.target.fieldSet.fields[0]!
        ? updatedDialogAction.dialog.target.fieldSet.fields[0]!.drafts.draft
        : undefined,
    ).toBe("Prepare launch dialog");
  });

  it("simulates controlled dialogs, state-field transitions, and ordering intents", () => {
    const active = activeTable();
    const actionGroup = requiredActionGroup(active, "task-1");
    const editAction = requiredEditAction(actionGroup);
    const status = requiredField(active, "task-1", "status");
    const facts = status.stateMachineFacts;
    const ordering = requiredOrdering(active, "task-1");

    if (facts?.interaction.kind !== "transitions") {
      throw new Error("Expected state transition fixture.");
    }
    const completeTransition = facts.interaction.transitions.find(
      (transition) => transition.transitionName === "complete",
    );
    if (!completeTransition) {
      throw new Error("Expected complete transition fixture.");
    }

    const dialogOpen = applyTableIntent(active, editAction.openIntent);
    expect(requiredEditAction(requiredActionGroup(dialogOpen, "task-1")).dialog.open).toBe(true);

    const completed = applyTableFieldIntent(active, status.fieldId, {
      fieldName: status.fieldName,
      operationName: completeTransition.operationName,
      recordId: "task-1",
      source: facts.interaction.invocationSource,
      transitionName: completeTransition.transitionName,
      type: "stateTransitionInvoke",
    });
    const completedStatus = requiredField(completed, "task-1", "status");
    expect(completedStatus.value).toBe("done");
    expect(completedStatus.stateMachineFacts?.terminal).toBe(true);
    expect(
      completedStatus.stateMachineFacts?.interaction.kind === "transitions"
        ? completedStatus.stateMachineFacts.interaction.transitions.some(
            (transition) => transition.availability?.valid,
          )
        : false,
    ).toBe(false);

    const moveDown = ordering.actions.find((action) => action.direction === "down");
    if (!moveDown) {
      throw new Error("Expected move-down fixture action.");
    }
    const reordered = applyTableIntent(active, moveDown.intent);
    expect(reordered.rows.map((row) => row.id)).toEqual(["task-2", "task-1", "task-3"]);
    const firstOrdering = requiredOrdering(reordered, "task-2");
    expect(firstOrdering.actions.find((action) => action.direction === "up")?.disabled).toBe(true);
  });

  it("simulates destructive confirmation and operation completion", () => {
    const active = activeTable();
    const deleteAction = requiredDeleteAction(requiredActionGroup(active, "task-1"));
    const openIntent = deleteAction.control.trigger.intent;

    expect(openIntent.type).toBe("operationConfirmationOpenChange");
    if (openIntent.type !== "operationConfirmationOpenChange") {
      throw new Error("Expected confirmation trigger intent.");
    }

    const confirmationOpen = applyTableOperationIntent(active, deleteAction, openIntent);
    const openDelete = requiredDeleteAction(requiredActionGroup(confirmationOpen, "task-1"));
    expect(openDelete.control.confirmation?.open).toBe(true);

    const confirmIntent = openDelete.control.confirmation?.action.intent;
    if (!confirmIntent || confirmIntent.type !== "operationInvoke") {
      throw new Error("Expected destructive invocation intent.");
    }

    const completed = applyTableOperationIntent(confirmationOpen, openDelete, confirmIntent);
    const completedDelete = requiredDeleteAction(requiredActionGroup(completed, "task-1"));
    expect(completedDelete.control.confirmation?.open).toBe(false);
    expect(completedDelete.control.status.status).toBe("committed");
    expect(completedDelete.control.feedback?.title).toBe("Task deleted");
  });
});

function activeTable() {
  return requiredFixture(createTableFixtures(), "active").table;
}

function requiredFixture(
  fixtures: ReturnType<typeof createTableFixtures>,
  id: "active" | "editing-disabled" | "empty",
) {
  const fixture = selectedTableFixture(fixtures, id);

  if (!fixture) {
    throw new Error(`Missing ${id} table fixture.`);
  }

  return fixture;
}

function tableRowFields(tableRow: TableContract["rows"][number]) {
  return tableRow.cells.flatMap((cell) =>
    cell.contents.flatMap((content) => {
      if (content.kind === "field") {
        return [content.field];
      }

      if (content.kind !== "actionGroup") {
        return [];
      }

      return content.secondary.flatMap((action) => {
        if (action.kind !== "editAction" || action.dialog.target.kind !== "available") {
          return [];
        }

        return action.dialog.target.fieldSet.fields;
      });
    }),
  );
}

function requiredField(table: TableContract, rowId: string, fieldName: string) {
  const field = table.rows
    .find((row) => row.id === rowId)
    ?.cells.flatMap((cell) => cell.contents)
    .find((content) => content.kind === "field" && content.field.fieldName === fieldName);

  if (field?.kind !== "field") {
    throw new Error(`Missing ${fieldName} field for ${rowId}.`);
  }

  return field.field;
}

function requiredActionGroup(table: TableContract, rowId: string) {
  const content = table.rows
    .find((row) => row.id === rowId)
    ?.cells.flatMap((cell) => cell.contents)
    .find((candidate) => candidate.kind === "actionGroup");

  if (content?.kind !== "actionGroup") {
    throw new Error(`Missing action group for ${rowId}.`);
  }

  return content;
}

function requiredEditAction(group: TableActionGroupContract) {
  const action = group.secondary.find(
    (candidate): candidate is TableEditActionContract => candidate.kind === "editAction",
  );

  if (!action) {
    throw new Error("Missing edit action fixture.");
  }

  return action;
}

function requiredDeleteAction(group: TableActionGroupContract) {
  const action = group.secondary.find(
    (candidate): candidate is TableOperationActionContract =>
      candidate.kind === "operationAction" && candidate.role === "delete",
  );

  if (!action) {
    throw new Error("Missing delete action fixture.");
  }

  return action;
}

function requiredOrdering(table: TableContract, rowId: string) {
  const content = table.rows
    .find((row) => row.id === rowId)
    ?.cells.flatMap((cell) => cell.contents)
    .find((candidate): candidate is TableOrderingContract => candidate.kind === "ordering");

  if (!content) {
    throw new Error(`Missing ordering fixture for ${rowId}.`);
  }

  return content;
}
