import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "../../shared/schema.ts";
import { selectGeneratedFieldEditorAdapter } from "./field-ui-adapters.ts";

describe("generated field UI adapters", () => {
  it("exposes field behavior facts for generated create and inline editors", () => {
    expect(selectGeneratedFieldEditorAdapter(fields.title, "text")).toMatchObject({
      kind: "text",
      control: { kind: "input", inputType: "text" },
      createDefaultChecked: false,
      createDefaultValue: undefined,
      inputAttributes: {},
      required: true,
    });
    expect(selectGeneratedFieldEditorAdapter(fields.title, "markdown")).toMatchObject({
      kind: "text",
      control: { kind: "textarea" },
    });
    expect(selectGeneratedFieldEditorAdapter(fields.done, "boolean")).toMatchObject({
      kind: "boolean",
      control: { kind: "checkbox" },
      createDefaultChecked: true,
      required: true,
    });
    expect(selectGeneratedFieldEditorAdapter(fields.estimate, "number")).toMatchObject({
      kind: "number",
      control: { kind: "input", inputType: "number" },
      createDefaultValue: "2",
      inputAttributes: { max: 10, min: 0, step: "1" },
    });
    expect(selectGeneratedFieldEditorAdapter(fields.priority, "enum")).toMatchObject({
      kind: "enum",
      control: { kind: "select" },
      createDefaultValue: "normal",
    });
    expect(selectGeneratedFieldEditorAdapter(fields.optionalPriority, "enum")).toMatchObject({
      kind: "enum",
      control: { kind: "select" },
      createDefaultValue: "",
      required: false,
    });
    expect(selectGeneratedFieldEditorAdapter(fields.resource, "reference")).toMatchObject({
      kind: "reference",
      control: { kind: "reference" },
      createDefaultValue: undefined,
      required: true,
    });
  });
});

const fields = {
  title: { type: "text", required: true },
  done: { type: "boolean", required: true, default: true },
  estimate: { type: "number", required: false, default: 2, min: 0, max: 10, integer: true },
  priority: {
    type: "enum",
    required: false,
    default: "normal",
    values: {
      normal: { label: "Normal" },
      high: { label: "High" },
    },
  },
  optionalPriority: {
    type: "enum",
    required: false,
    values: {
      low: { label: "Low" },
      high: { label: "High" },
    },
  },
  resource: { type: "reference", required: true, to: "resource", displayField: "name" },
} satisfies Record<string, FieldSchema>;
