import { describe, expect, it } from "vite-plus/test";
import {
  generatedFieldDraftInput,
  type FieldSchema,
  type GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import type { RecordFieldConfig } from "../../client/views.ts";
import { initialGeneratedCreateDraftSessionState } from "./create-field-authoring.ts";
import { initialGeneratedOperationDraftSessionState } from "./operation-field-authoring.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  resolveGeneratedUpdateDraftPatchValues,
} from "./record-field-authoring.ts";
import {
  adaptGeneratedCreateFormlessUiDraftChange,
  adaptGeneratedFormlessUiFieldErrorChange,
  adaptGeneratedFormlessUiIconDialogCancel,
  adaptGeneratedFormlessUiIconDialogDraftChange,
  adaptGeneratedFormlessUiIconDialogOpenChange,
  adaptGeneratedFormlessUiIconDialogSave,
  adaptGeneratedFormlessUiMediaAssetSelect,
  adaptGeneratedFormlessUiMediaFileSelect,
  adaptGeneratedFormlessUiStateTransitionInvoke,
  adaptGeneratedOperationFormlessUiDraftChange,
  adaptGeneratedRecordEditorFormlessUiDraftChange,
  adaptGeneratedRecordFormlessUiDraftRevert,
  adaptGeneratedRecordFormlessUiValueCommit,
  adaptGeneratedRecordFormlessUiValueUnitCommit,
  createGeneratedFormlessUiFieldIntentHandler,
  generatedFormlessUiFieldDraftInput,
  type AdaptGeneratedRecordFormlessUiIntentOptions,
  type GeneratedFormlessUiIconDialogCancelResult,
  type GeneratedFormlessUiIconDialogOpenChangeResult,
  type GeneratedFormlessUiIconDialogSaveResult,
  type GeneratedFormlessUiMediaAssetSelectResult,
  type GeneratedFormlessUiRecordDraftChangeResult,
  type GeneratedFormlessUiRecordValueCommitResult,
  type GeneratedFormlessUiRecordValueUnitCommitResult,
} from "./formless-ui-intents.ts";

describe("generated Formless UI intent adapter", () => {
  it("adapts create draft changes into generated create draft session updates", () => {
    let state = initialGeneratedCreateDraftSessionState({ fields: [] });

    for (const [fieldName, value] of [
      ["title", generatedFormlessUiFieldDraftInput("Launch")],
      ["done", generatedFormlessUiFieldDraftInput(true)],
      ["owner", generatedFormlessUiFieldDraftInput("principal-1")],
      ["estimate", generatedFormlessUiFieldDraftInput("3.5")],
    ] as const) {
      const result = adaptGeneratedCreateFormlessUiDraftChange(
        { type: "createDraftChange", fieldName, fieldValue: value },
        { state },
      );

      state = result.state!;
      expect(result.fieldErrorChange).toEqual({ fieldName, message: null });
    }

    expect(state.draft.values).toEqual({
      done: { kind: "value", value: true },
      estimate: { kind: "input", value: "3.5" },
      owner: { kind: "input", value: "principal-1" },
      title: { kind: "input", value: "Launch" },
    });
  });

  it("adapts operation input intents into generated operation draft session updates", () => {
    let state = initialGeneratedOperationDraftSessionState({ fields: [] });

    for (const [inputName, value] of [
      ["contactEmail", generatedFieldDraftInput("ada@example.com")],
      ["acceptedTerms", generatedFieldDraftInput(false)],
      ["teamSize", generatedFieldDraftInput("4")],
      ["topic", generatedFieldDraftInput("sales")],
    ] as const) {
      const result = adaptGeneratedOperationFormlessUiDraftChange(
        { type: "operationDraftChange", inputName, inputValue: value },
        { state },
      );

      state = result.state!;
      expect(result.fieldErrorChange).toEqual({ fieldName: inputName, message: null });
    }

    expect(state.draft.values).toEqual({
      acceptedTerms: { kind: "value", value: false },
      contactEmail: { kind: "input", value: "ada@example.com" },
      teamSize: { kind: "input", value: "4" },
      topic: { kind: "input", value: "sales" },
    });
  });

  it("adapts record editor draft changes with current number decoding rules", () => {
    const result = adaptGeneratedRecordEditorFormlessUiDraftChange(
      { type: "recordEditorDraftChange", fieldName: "cost", value: "$many" },
      recordContext([costFieldConfig], { cost: 10 }),
    ) as GeneratedFormlessUiRecordDraftChangeResult;

    expect(result.draftChange).toEqual({
      fieldName: "cost",
      fieldValue: { kind: "input", value: "$many" },
    });
    expect(result.editorDraftChange).toEqual({ fieldName: "cost", value: "$many" });
    expect(result.state?.draft.values.cost).toEqual({ kind: "input", value: "$many" });
  });

  it("resolves record value commits through the generated update patch resolver", () => {
    const context = recordContext([titleFieldConfig], { title: "Old" });
    const result = adaptGeneratedRecordFormlessUiValueCommit(
      { type: "recordValueCommit", fieldName: "title", value: "New" },
      context,
    ) as GeneratedFormlessUiRecordValueCommitResult;
    const expected = resolveGeneratedUpdateDraftPatchValues({
      baselineValues: context.state.baselineValues,
      draft: {
        values: {
          ...context.state.draft.values,
          title: { kind: "input", value: "New" },
        },
      },
      fieldNames: ["title"],
      fields: [titleFieldConfig],
    });

    expect(result.draftChange).toEqual({
      fieldName: "title",
      fieldValue: { kind: "input", value: "New" },
    });
    expect(result.fieldErrorChange).toBeUndefined();
    expect(result.patchValues).toEqual(expected.patchValues);
    expect(result.resolution).toEqual(expected);

    const noop = adaptGeneratedRecordFormlessUiValueCommit(
      { type: "recordValueCommit", fieldName: "title", value: "Old" },
      context,
    ) as GeneratedFormlessUiRecordValueCommitResult;

    expect(noop.noop).toBe(true);
    expect(noop.patchValues).toEqual({});
  });

  it("keeps record value commit validation errors out of patch values", () => {
    const result = adaptGeneratedRecordFormlessUiValueCommit(
      { type: "recordValueCommit", fieldName: "estimate", value: "many" },
      recordContext([estimateFieldConfig], { estimate: 2 }),
    ) as GeneratedFormlessUiRecordValueCommitResult;

    expect(result.patchValues).toEqual({});
    expect(result.fieldErrorChange).toEqual({
      fieldName: "estimate",
      message: "Enter a finite number.",
    });
    expect(result.resolution?.fieldErrors).toEqual({
      estimate: {
        draftValue: { kind: "input", value: "many" },
        fieldName: "estimate",
        message: "Enter a finite number.",
      },
    });
  });

  it("adapts record draft revert into the undefined draft input callback shape", () => {
    const state = nextGeneratedUpdateDraftSessionState({
      fieldName: "title",
      fieldValue: { kind: "input", value: "Edited" },
      state: initialGeneratedUpdateDraftSessionState({
        baselineValues: { title: "Old" },
        fields: [titleFieldConfig],
      }),
    });
    const result = adaptGeneratedRecordFormlessUiDraftRevert(
      { type: "recordDraftRevert", fieldName: "title" },
      { fields: [titleFieldConfig], state },
    ) as GeneratedFormlessUiRecordDraftChangeResult;

    expect(result.draftChange).toEqual({
      fieldName: "title",
      fieldValue: undefined,
    });
    expect(result.editorDraftChange).toEqual({ fieldName: "title", value: "Old" });
    expect(result.state?.draft.values.title).toBeUndefined();
  });

  it("resolves value-unit commits for both value and unit fields", () => {
    const result = adaptGeneratedRecordFormlessUiValueUnitCommit(
      {
        type: "recordValueUnitCommit",
        fieldName: "cost",
        unitFieldName: "costUnit",
        commit: {
          fieldDraftInput: { kind: "value", value: 12.5 },
          unitDraftInput: { kind: "input", value: "hour" },
        },
      },
      recordContext([costFieldConfig], { cost: 10, costUnit: "day" }),
    ) as GeneratedFormlessUiRecordValueUnitCommitResult;

    expect(result.draftChange).toEqual({
      fieldName: "cost",
      fieldValue: { kind: "value", value: 12.5 },
    });
    expect(result.patchValues).toEqual({
      cost: 12.5,
      costUnit: "hour",
    });
    expect(result.fieldErrorChange).toBeUndefined();
  });

  it("adapts field error intents into current field error callback payloads", () => {
    const returned = adaptGeneratedFormlessUiFieldErrorChange({
      type: "fieldErrorChange",
      fieldName: "title",
      message: "Save failed.",
    });
    const calls: unknown[] = [];
    const handler = createGeneratedFormlessUiFieldIntentHandler({
      callbacks: {
        onFieldErrorChange(change) {
          calls.push(change);
        },
      },
    });

    void handler({ type: "fieldErrorChange", fieldName: "title", message: null });

    expect(returned.fieldErrorChange).toEqual({
      fieldName: "title",
      message: "Save failed.",
    });
    expect(calls).toEqual([{ fieldName: "title", message: null }]);
  });

  it("maps media asset and file intents without doing upload work", () => {
    const asset = adaptGeneratedFormlessUiMediaAssetSelect(
      { type: "mediaAssetSelect", fieldName: "hero", assetId: "hero.webp" },
      recordContext([mediaFieldConfig], { hero: "old.webp" }, undefined, {
        mediaEditorModeByFieldName: { hero: "asset" },
      }),
    ) as GeneratedFormlessUiMediaAssetSelectResult;
    const file = { name: "hero.webp" } as File;
    const fileSelect = adaptGeneratedFormlessUiMediaFileSelect({
      type: "mediaFileSelect",
      fieldName: "hero",
      file,
    });

    expect(asset.editorDraftChange).toEqual({ fieldName: "hero", value: "hero.webp" });
    expect(asset.commit?.draftChange).toEqual({
      fieldName: "hero",
      fieldValue: { kind: "input", value: "hero.webp" },
    });
    expect(asset.commit?.patchValues).toEqual({ hero: "hero.webp" });
    expect(fileSelect.fileSelect).toEqual({ fieldName: "hero", file });
  });

  it("maps icon dialog intents and keeps save tied to record commit success", () => {
    const iconContext = recordContext(
      [iconFieldConfig],
      { icon: oldSvg },
      { icon: { kind: "input", value: draftSvg } },
      { iconDialogDraftByFieldName: { icon: newSvg } },
    );
    const draft = adaptGeneratedFormlessUiIconDialogDraftChange({
      type: "iconDialogDraftChange",
      fieldName: "icon",
      value: newSvg,
    });
    const open = adaptGeneratedFormlessUiIconDialogOpenChange(
      { type: "iconDialogOpenChange", fieldName: "icon", open: true },
      iconContext,
    ) as GeneratedFormlessUiIconDialogOpenChangeResult;
    const cancel = adaptGeneratedFormlessUiIconDialogCancel(
      { type: "iconDialogCancel", fieldName: "icon" },
      iconContext,
    ) as GeneratedFormlessUiIconDialogCancelResult;
    const save = adaptGeneratedFormlessUiIconDialogSave(
      { type: "iconDialogSave", fieldName: "icon" },
      iconContext,
    ) as GeneratedFormlessUiIconDialogSaveResult;

    expect(draft.iconDialogDraftChange).toEqual({ fieldName: "icon", value: newSvg });
    expect(open.iconDialogDraftChange).toEqual({ fieldName: "icon", value: draftSvg });
    expect(open.iconDialogOpenChange).toEqual({ fieldName: "icon", open: true });
    expect(cancel.iconDialogDraftChange).toEqual({ fieldName: "icon", value: oldSvg });
    expect(cancel.iconDialogOpenChange).toEqual({ fieldName: "icon", open: false });
    expect(save.commit.patchValues).toEqual({ icon: newSvg });
    expect(save.onCommitSuccess).toEqual({
      editorDraftChange: { fieldName: "icon", value: newSvg },
      iconDialogOpenChange: { fieldName: "icon", open: false },
    });
  });

  it("defers executable state-transition binding to the future operation-control contract", () => {
    const result = adaptGeneratedFormlessUiStateTransitionInvoke({
      type: "stateTransitionInvoke",
      fieldName: "status",
      operationName: "startTask",
      recordId: "task-1",
      source: "button",
      transitionName: "start",
    });

    expect(result).toMatchObject({
      kind: "stateTransitionDeferred",
      intent: {
        fieldName: "status",
        operationName: "startTask",
        recordId: "task-1",
        transitionName: "start",
      },
    });
    expect(result.reason).toContain("operation-control binding");
  });
});

function recordContext(
  fields: readonly RecordFieldConfig[],
  baselineValues: RecordValues,
  draftValues: Record<string, GeneratedFieldDraftInput | undefined> = {},
  options: Partial<AdaptGeneratedRecordFormlessUiIntentOptions> = {},
): AdaptGeneratedRecordFormlessUiIntentOptions {
  const state = Object.entries(draftValues).reduce(
    (nextState, [fieldName, fieldValue]) =>
      nextGeneratedUpdateDraftSessionState({
        fieldName,
        fieldValue,
        state: nextState,
      }),
    initialGeneratedUpdateDraftSessionState({
      baselineValues,
      fields: Array.from(fields),
    }),
  );

  return {
    fields,
    state,
    ...options,
  };
}

const textField = { type: "text", required: false } satisfies FieldSchema;
const numberField = { type: "number", required: false } satisfies FieldSchema;
const hrefField = { type: "text", required: false, format: "href" } satisfies FieldSchema;
const costUnitField = {
  type: "enum",
  required: false,
  values: {
    day: { label: "Day" },
    hour: { label: "Hour" },
  },
} satisfies FieldSchema;

const titleFieldConfig = recordField("title", textField, "text");
const estimateFieldConfig = recordField("estimate", numberField, "number");
const costFieldConfig = recordField("cost", numberField, "number", {
  format: "currency",
  valueUnit: {
    unitFieldName: "costUnit",
    unitField: costUnitField,
  },
});
const mediaFieldConfig = recordField("hero", hrefField, "media");
const iconFieldConfig = recordField("icon", textField, "icon");

const oldSvg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';
const draftSvg = '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>';
const newSvg = '<svg viewBox="0 0 24 24"><path d="M8 8h8v8H8z" /></svg>';

function recordField(
  fieldName: string,
  field: FieldSchema,
  editor: RecordFieldConfig["editor"],
  options: {
    commit?: RecordFieldConfig["commit"];
    format?: RecordFieldConfig["format"];
    valueUnit?: RecordFieldConfig["valueUnit"];
    writable?: boolean;
  } = {},
): RecordFieldConfig {
  return {
    commit: options.commit ?? "field-commit",
    editor,
    field,
    fieldName,
    ...(options.format === undefined ? {} : { format: options.format }),
    ...(options.valueUnit === undefined ? {} : { valueUnit: options.valueUnit }),
    ...(options.writable === undefined ? {} : { writable: options.writable }),
  };
}
