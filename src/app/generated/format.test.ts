import { describe, expect, it } from "vite-plus/test";
import type {
  FieldCommitPolicy,
  FieldEditor,
  FieldSchema,
  TableColumnFormat,
} from "../../shared/schema.ts";
import type { TableColumnConfig } from "../../client/views.ts";
import {
  createInputValueToFieldValue,
  fieldValueToInputValue,
  formatFieldDisplayValue,
  inputValueToFieldValue,
  numberInputAttributes,
  numberInputValueToFieldValue,
} from "./format.ts";

describe("generated field format helpers", () => {
  it("formats current display values for generated table cells", () => {
    expect(formatFieldDisplayValue(fieldColumn(fields.title), undefined)).toBe("");
    expect(formatFieldDisplayValue(fieldColumn(fields.title), "")).toBe("");
    expect(formatFieldDisplayValue(fieldColumn(fields.title), "Alpha")).toBe("Alpha");
    expect(formatFieldDisplayValue(fieldColumn(fields.done), true)).toBe("Yes");
    expect(formatFieldDisplayValue(fieldColumn(fields.done), false)).toBe("No");
    expect(formatFieldDisplayValue(fieldColumn(fields.estimate), 1.5)).toBe("1.5");
    expect(formatFieldDisplayValue(fieldColumn(fields.estimate, "number"), 1.5)).toBe("1.5");
    expect(formatFieldDisplayValue(fieldColumn(fields.estimate, "currency"), 1.5)).toBe("$1.50");
    expect(formatFieldDisplayValue(fieldColumn(fields.estimate, "percent"), 0.125)).toBe("12.5%");
    expect(formatFieldDisplayValue(fieldColumn(fields.priority), "high")).toBe("High");
    expect(formatFieldDisplayValue(fieldColumn(fields.priority), "missing")).toBe("missing");
    expect(formatFieldDisplayValue(fieldColumn(fields.resource), "rec_resource_1")).toBe(
      "rec_resource_1",
    );
  });

  it("converts current inline editor values for patch mutations", () => {
    expect(fieldValueToInputValue(fields.title, "Alpha")).toBe("Alpha");
    expect(fieldValueToInputValue(fields.estimate, 1.5)).toBe("1.5");
    expect(fieldValueToInputValue(fields.done, true)).toBe("");
    expect(fieldValueToInputValue(fields.title, undefined)).toBe("");
    expect(inputValueToFieldValue(fields.title, "Alpha")).toBe("Alpha");
    expect(inputValueToFieldValue(fields.dueDate, "2026-05-06")).toBe("2026-05-06");
    expect(inputValueToFieldValue(fields.estimate, "")).toBe("");
    expect(inputValueToFieldValue(fields.estimate, "1.5")).toBe(1.5);
    expect(inputValueToFieldValue(fields.priority, "high")).toBe("high");
    expect(inputValueToFieldValue(fields.resource, "rec_resource_1")).toBe("rec_resource_1");
    expect(numberInputValueToFieldValue("0")).toBe(0);
  });

  it("converts current create form input values", () => {
    expect(createInputValueToFieldValue(fields.done, undefined, false)).toBe(false);
    expect(createInputValueToFieldValue(fields.done, "on", true)).toBe(true);
    expect(createInputValueToFieldValue(fields.title, "Alpha", true)).toBe("Alpha");
    expect(createInputValueToFieldValue(fields.title, undefined, false)).toBe("");
    expect(createInputValueToFieldValue(fields.estimate, "", true)).toBe("");
    expect(createInputValueToFieldValue(fields.estimate, "1.5", true)).toBe(1.5);
  });

  it("derives current number input attributes from number field schema", () => {
    expect(numberInputAttributes(fields.estimate)).toEqual({
      max: 10,
      min: 0,
      step: "1",
    });
    expect(numberInputAttributes({ type: "number", required: false })).toEqual({
      max: undefined,
      min: undefined,
      step: "any",
    });
    expect(numberInputAttributes(fields.title)).toEqual({});
  });
});

const fields = {
  title: { type: "text", required: true },
  done: { type: "boolean", required: true, default: false },
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false, min: 0, max: 10, integer: true },
  priority: {
    type: "enum",
    required: false,
    values: {
      low: { label: "Low" },
      high: { label: "High" },
    },
  },
  resource: { type: "reference", required: true, to: "resource", displayField: "name" },
} satisfies Record<string, FieldSchema>;

function fieldColumn(field: FieldSchema, format: TableColumnFormat = "plain"): TableColumnConfig {
  return {
    type: "field",
    key: "value",
    label: "Value",
    fieldName: "value",
    field,
    editor: defaultEditorFor(field),
    commit: defaultCommitFor(field),
    display: "readOnly",
    format,
  };
}

function defaultEditorFor(field: FieldSchema): FieldEditor {
  return field.type === "text" ? "text" : field.type;
}

function defaultCommitFor(field: FieldSchema): FieldCommitPolicy {
  return field.type === "boolean" || field.type === "enum" || field.type === "reference"
    ? "immediate"
    : "field-commit";
}
