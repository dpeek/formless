import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiField,
  FormlessUiRecordResultActionContract,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultIntent,
} from "../formless-ui-contract.ts";
import { AstryxRecordResultRenderer } from "./formless-ui-record-result-renderer.tsx";
import { createFormlessUiRecordResultFixtures } from "./record-results.fixtures.ts";
import {
  FormlessRecordResultsLayout,
  applyRecordResultIntent,
  selectedRecordResultFixture,
} from "./record-results.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

describe("canonical record-result fixtures", () => {
  it("cover production record-result contract states with serializable data", () => {
    const fixtures = createFormlessUiRecordResultFixtures();
    const editable = requiredFixture(fixtures, "editable").recordResult;
    const readOnly = requiredFixture(fixtures, "read-only").recordResult;
    const editingDisabled = requiredFixture(fixtures, "editing-disabled").recordResult;
    const empty = requiredFixture(fixtures, "empty").recordResult;
    const unavailable = requiredFixture(fixtures, "unavailable").recordResult;
    const fields = editable.fields;
    const title = requiredField(editable, "title");
    const ownerEmail = requiredField(editable, "ownerEmail");
    const readOnlyEstimate = requiredField(readOnly, "estimateHours");
    const status = requiredField(editable, "status");
    const transition = requiredAction(editable, "transition");
    const deletion = requiredAction(editable, "delete");

    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(editable.availability.state).toBe("ready");
    expect(new Set(editable.fields.map((field) => field.fieldId)).size).toBe(
      editable.fields.length,
    );
    expect(readOnly.fields.map((field) => field.fieldName)).toEqual(
      editable.fields.map((field) => field.fieldName),
    );
    expect(editingDisabled.fields.map((field) => field.fieldName)).toEqual(
      editable.fields.map((field) => field.fieldName),
    );
    expect(title.mode).toBe("editor");
    expect(title.pending).toEqual({ isPending: true, label: "Saving task" });
    expect(ownerEmail.errors?.[0]?.message).toBe("Owner email is required.");
    expect(requiredField(editable, "slug").mode).toBe("display");
    expect(fields.map((field) => field.fieldName)).toContain("summary");
    expect(fields.map((field) => field.fieldName)).not.toContain("url");
    expect(requiredField(editable, "summary").visibleWhen).toEqual({
      field: "kind",
      values: ["article"],
    });
    expect(
      fields
        .filter((field) => field.mode === "editor" && "rendererKind" in field)
        .map((field) =>
          field.mode === "editor" && "rendererKind" in field ? field.rendererKind : undefined,
        ),
    ).toEqual(
      expect.arrayContaining(["color", "icon", "markdown", "media", "quiet-date", "value-unit"]),
    );
    expect(status.mode).toBe("display");
    expect(status.stateMachineFacts?.interaction.kind).toBe("display");
    expect(transition.control.trigger.content).toMatchObject({ label: "Complete" });
    expect(deletion.control.confirmation?.kind).toBe("destructiveConfirmation");
    expect(editable.warnings[0]?.items[0]?.message).toBe("Owner email is missing.");
    expect(readOnly.fields.every((field) => field.mode === "display")).toBe(true);
    expect(readOnlyEstimate.mode).toBe("display");
    if (readOnlyEstimate.mode !== "display") {
      throw new Error("Expected the read-only Estimate fixture to use display mode.");
    }
    expect(readOnlyEstimate.formatting.suffix).toBe("h");
    expect(
      editingDisabled.fields
        .filter((field) => field.mode === "editor")
        .every((field) => field.access.kind === "disabled"),
    ).toBe(true);
    expect(requiredField(editingDisabled, "slug").access.kind).toBe("readOnly");
    expect(requiredField(editingDisabled, "status").access.kind).toBe("stateMachine");
    expect(editingDisabled.editing).toEqual({
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    });
    expect(empty.availability.state).toBe("empty");
    expect(empty.emptyState?.title).toBe("No task record found.");
    expect(unavailable.availability).toEqual({
      message: "Task record is unavailable.",
      state: "unavailable",
    });
  });
});

describe("Record Results prototype layout", () => {
  it("renders the editable fixture through the real Astryx record-result renderer", () => {
    const html = renderToStaticMarkup(<FormlessRecordResultsLayout />);

    expect(html).toContain("<h1");
    expect(html).toContain("Record Results");
    expect(html).toContain('aria-label="Task record"');
    expect(html).toContain('aria-label="Prepare launch checklist"');
    expect(html).toContain("Prepare launch checklist");
    expect(html).toContain("Edit Page Icon");
    expect(html).toContain("Complete");
    expect(html).toContain("Owner email is missing.");
    expect(html).toContain('aria-label="More actions for Prepare launch checklist"');
  });

  it("shows a shared editing-disabled reason only in the record banner", () => {
    const disabled = requiredFixture(
      createFormlessUiRecordResultFixtures(),
      "editing-disabled",
    ).recordResult;
    const html = renderToStaticMarkup(
      <AstryxRecordResultRenderer onIntent={() => undefined} recordResult={disabled} />,
    );

    expect(html.split("Editing requires an owner session.")).toHaveLength(2);
    expect(html).toContain("Owner email is required.");
  });

  it("simulates controlled field changes and visible union fields", () => {
    const editable = editableRecordResult();
    const title = requiredField(editable, "title");
    const kind = requiredField(editable, "kind");
    const edited = applyRecordResultIntent(
      editable,
      fieldIntent(editable, title, {
        fieldName: "title",
        type: "recordEditorDraftChange",
        value: "Prepare release checklist",
      }),
    );
    const editedTitle = requiredField(edited, "title");

    expect(editedTitle.mode).toBe("editor");
    if (editedTitle.mode !== "editor" || !("drafts" in editedTitle)) {
      throw new Error("Expected editable title fixture.");
    }
    expect(editedTitle.drafts.draft).toBe("Prepare release checklist");

    const linked = applyRecordResultIntent(
      edited,
      fieldIntent(edited, kind, {
        fieldName: "kind",
        type: "recordValueCommit",
        value: "link",
      }),
    );

    expect(linked.fields.map((field) => field.fieldName)).toContain("url");
    expect(linked.fields.map((field) => field.fieldName)).not.toContain("summary");
    expect(requiredField(linked, "url").visibleWhen).toEqual({
      field: "kind",
      values: ["link"],
    });
  });

  it("simulates a projected transition invocation", () => {
    const editable = editableRecordResult();
    const transition = requiredAction(editable, "transition");
    const completed = applyRecordResultIntent(
      editable,
      operationIntent(editable, transition, transition.control.trigger.intent),
    );
    const completedTransition = requiredAction(completed, "transition");
    const status = requiredField(completed, "status");

    expect(completedTransition.control.status.status).toBe("committed");
    expect(completedTransition.control.feedback?.title).toBe("Task completed");
    expect(status.value).toBe("done");
    expect(status.stateMachineFacts?.terminal).toBe(true);
  });

  it("simulates destructive confirmation and completion", () => {
    const editable = editableRecordResult();
    const deletion = requiredAction(editable, "delete");
    const confirmationOpen = applyRecordResultIntent(
      editable,
      operationIntent(editable, deletion, deletion.control.trigger.intent),
    );
    const openDeletion = requiredAction(confirmationOpen, "delete");

    expect(openDeletion.control.confirmation?.open).toBe(true);
    const confirmIntent = openDeletion.control.confirmation?.action.intent;
    if (!confirmIntent) {
      throw new Error("Expected destructive confirmation intent.");
    }

    const completed = applyRecordResultIntent(
      confirmationOpen,
      operationIntent(confirmationOpen, openDeletion, confirmIntent),
    );
    const completedDeletion = requiredAction(completed, "delete");

    expect(completedDeletion.control.confirmation?.open).toBe(false);
    expect(completedDeletion.control.status.status).toBe("committed");
    expect(completedDeletion.control.feedback?.title).toBe("Task deleted");
  });

  it("renders only projected empty and unavailable presentation", () => {
    const fixtures = createFormlessUiRecordResultFixtures();
    const empty = requiredFixture(fixtures, "empty").recordResult;
    const unavailable = requiredFixture(fixtures, "unavailable").recordResult;
    const emptyHtml = renderRecordResult(empty);
    const unavailableHtml = renderRecordResult(unavailable);

    expect(emptyHtml).toContain("No task record found.");
    expect(emptyHtml).toContain("Change the current query to select a task.");
    expect(emptyHtml).not.toContain("<article");
    expect(unavailableHtml).toContain("Task record is unavailable.");
    expect(unavailableHtml).not.toContain("<article");
  });
});

function editableRecordResult() {
  return requiredFixture(createFormlessUiRecordResultFixtures(), "editable").recordResult;
}

function requiredFixture(
  fixtures: ReturnType<typeof createFormlessUiRecordResultFixtures>,
  id: "editable" | "editing-disabled" | "empty" | "read-only" | "unavailable",
) {
  const fixture = selectedRecordResultFixture(fixtures, id);

  if (!fixture) {
    throw new Error(`Missing ${id} record-result fixture.`);
  }

  return fixture;
}

function requiredField(recordResult: FormlessUiRecordResultContract, fieldName: string) {
  const field = recordResult.fields.find((candidate) => candidate.fieldName === fieldName);

  if (!field) {
    throw new Error(`Missing ${fieldName} record-result field.`);
  }

  return field;
}

function requiredAction(
  recordResult: FormlessUiRecordResultContract,
  role: "delete" | "transition",
) {
  const action = [...recordResult.actions.primary, ...recordResult.actions.secondary].find(
    (candidate) => candidate.role === role,
  );

  if (!action) {
    throw new Error(`Missing ${role} record-result action.`);
  }

  return action;
}

function fieldIntent(
  recordResult: FormlessUiRecordResultContract,
  field: FormlessUiField,
  intent: Extract<FormlessUiRecordResultIntent, { type: "recordResultFieldIntent" }>["intent"],
): FormlessUiRecordResultIntent {
  return {
    fieldId: field.fieldId,
    intent,
    recordId: requiredRecordId(recordResult),
    resultId: recordResult.id,
    type: "recordResultFieldIntent",
  };
}

function operationIntent(
  recordResult: FormlessUiRecordResultContract,
  action: FormlessUiRecordResultActionContract,
  intent: Extract<FormlessUiRecordResultIntent, { type: "recordResultOperationIntent" }>["intent"],
): FormlessUiRecordResultIntent {
  return {
    controlId: action.control.id,
    intent,
    recordId: requiredRecordId(recordResult),
    resultId: recordResult.id,
    type: "recordResultOperationIntent",
  };
}

function requiredRecordId(recordResult: FormlessUiRecordResultContract) {
  if (!recordResult.selectedRecord) {
    throw new Error("Expected selected record fixture.");
  }

  return recordResult.selectedRecord.id;
}

function renderRecordResult(recordResult: FormlessUiRecordResultContract) {
  return renderToStaticMarkup(
    <AstryxRecordResultRenderer onIntent={() => undefined} recordResult={recordResult} />,
  );
}
