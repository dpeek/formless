import { describe, expect, it } from "vite-plus/test";
import {
  generatedFieldDraftInput,
  generatedFieldDraftInputFromNativeFormData,
  resolveGeneratedFieldDraftValues,
} from "./index.ts";
import type { FieldSchema } from "./index.ts";

describe("generated field draft primitives", () => {
  it("normalizes controlled generated field draft values", () => {
    expect(generatedFieldDraftInput("Draft title")).toEqual({
      kind: "input",
      value: "Draft title",
    });
    expect(generatedFieldDraftInput(false)).toEqual({
      kind: "value",
      value: false,
    });
    expect(generatedFieldDraftInput(12)).toEqual({
      kind: "value",
      value: 12,
    });
  });

  it("adapts native FormData into field-aware typed draft values", () => {
    const formData = new FormData();
    formData.set("title", "Launch");
    formData.append("done", "false");
    formData.append("done", "on");
    formData.set("estimate", "1.5");

    expect(generatedFieldDraftInputFromNativeFormData(formData, fieldConfigs)).toEqual({
      values: {
        title: { kind: "input", value: "Launch" },
        done: { kind: "value", value: true },
        estimate: { kind: "input", value: "1.5" },
      },
    });

    const falseFormData = new FormData();
    falseFormData.set("done", "false");

    expect(generatedFieldDraftInputFromNativeFormData(falseFormData, fieldConfigs)).toEqual({
      values: {
        done: { kind: "value", value: false },
      },
    });
  });

  it("resolves flat values, field errors, and future omit-missing drafts", () => {
    expect(
      resolveGeneratedFieldDraftValues({
        draft: {
          values: {
            done: { kind: "value", value: false },
            estimate: { kind: "input", value: "many" },
            owner: { kind: "value", value: "principal-1" },
            title: { kind: "input", value: "Launch" },
          },
        },
        fields: fieldConfigs,
      }),
    ).toEqual({
      values: {
        done: false,
        owner: "principal-1",
        title: "Launch",
      },
      fieldErrors: {
        estimate: {
          fieldName: "estimate",
          message: "Enter a finite number.",
          draftValue: { kind: "input", value: "many" },
        },
      },
    });

    expect(
      resolveGeneratedFieldDraftValues({
        draft: {
          values: {
            title: { kind: "input", value: "Launch" },
          },
        },
        fields: fieldConfigs,
        missingDraft: "omit",
      }),
    ).toEqual({
      values: {
        title: "Launch",
      },
      fieldErrors: {},
    });
  });
});

const fields = {
  done: { type: "boolean", required: true, default: false },
  estimate: { type: "number", required: false },
  owner: { type: "reference", required: true, to: "principal" },
  title: { type: "text", required: true },
} satisfies Record<string, FieldSchema>;

const fieldConfigs = [
  { fieldName: "done", field: fields.done },
  { fieldName: "estimate", field: fields.estimate },
  { fieldName: "owner", field: fields.owner },
  { fieldName: "title", field: fields.title },
];
