import { describe, expect, it } from "vite-plus/test";
import type { CreateFieldConfig } from "../../client/views.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  nextGeneratedCreateDraftSessionState,
  selectGeneratedCreateDraftSession,
} from "./create-field-authoring.ts";
import { executeGeneratedCreateSubmission } from "./create.tsx";

const fields = [
  {
    editor: "text",
    field: { label: "Title", required: true, type: "text" },
    fieldName: "title",
  },
] satisfies CreateFieldConfig[];

describe("generated create surface submission", () => {
  it("returns the created record id and resets the controlled draft after success", async () => {
    const resetState = initialGeneratedCreateDraftSessionState({ fields });
    const state = markGeneratedCreateDraftSessionSubmitted(
      nextGeneratedCreateDraftSessionState({
        fieldName: "title",
        fieldValue: { kind: "input", value: "Prepare launch" },
        state: resetState,
      }),
    );
    const session = selectGeneratedCreateDraftSession({ enabled: true, fields, state });
    let selectedRecordId: string | undefined;
    const result = await executeGeneratedCreateSubmission({
      resetState,
      state,
      submitValues: async (values) => {
        expect(values).toEqual({ title: "Prepare launch" });
        return { recordId: "task-42" };
      },
      values: session.values,
    });

    if (result.type === "created") {
      selectedRecordId = result.recordId;
    }

    expect(selectedRecordId).toBe("task-42");
    expect(result.state).toEqual(resetState);
  });

  it("retains the submitted draft when create execution fails", async () => {
    const resetState = initialGeneratedCreateDraftSessionState({ fields });
    const state = markGeneratedCreateDraftSessionSubmitted(
      nextGeneratedCreateDraftSessionState({
        fieldName: "title",
        fieldValue: { kind: "input", value: "Retry this" },
        state: resetState,
      }),
    );
    const session = selectGeneratedCreateDraftSession({ enabled: true, fields, state });
    const result = await executeGeneratedCreateSubmission({
      resetState,
      state,
      submitValues: async () => {
        throw new Error("Create failed.");
      },
      values: session.values,
    });

    expect(result).toMatchObject({
      displayError: "Create failed.",
      state: {
        draft: { values: { title: { kind: "input", value: "Retry this" } } },
        submitAttempted: true,
      },
      type: "failed",
    });
    expect(result.state).toBe(state);
  });
});
