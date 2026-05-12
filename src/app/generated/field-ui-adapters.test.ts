import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "../../shared/schema.ts";
import { selectGeneratedFieldEditorAdapter } from "./field-ui-adapters.ts";

describe("generated field UI adapters", () => {
  it("exposes field behavior facts for generated create and inline editors", () => {
    expect(
      Object.fromEntries(
        textEditors.map((editor) => [
          editor,
          selectGeneratedFieldEditorAdapter(fields.title, editor).control,
        ]),
      ),
    ).toEqual({
      text: { kind: "input", inputType: "text" },
      textarea: { kind: "textarea" },
      markdown: { kind: "textarea" },
      href: { kind: "input", inputType: "text" },
      slug: { kind: "input", inputType: "text" },
      color: { kind: "input", inputType: "text" },
      icon: { kind: "icon" },
    });
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
    expect(selectGeneratedFieldEditorAdapter(fields.icon, "icon")).toMatchObject({
      kind: "text",
      editor: "icon",
      control: { kind: "icon" },
      createDefaultValue: undefined,
      required: false,
    });
    expect(selectGeneratedFieldEditorAdapter(fields.dueDate, "date")).toMatchObject({
      kind: "date",
      control: { kind: "input", inputType: "date" },
      createDefaultValue: undefined,
      required: false,
    });
    expect(selectGeneratedFieldEditorAdapter(fields.done, "boolean")).toMatchObject({
      kind: "boolean",
      control: { kind: "checkbox" },
      createDefaultChecked: true,
      required: true,
    });
    expect(selectGeneratedFieldEditorAdapter(fields.estimate, "number")).toMatchObject({
      kind: "number",
      control: { kind: "formattedNumber" },
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
  icon: { type: "text", required: false, format: "icon" },
  done: { type: "boolean", required: true, default: true },
  dueDate: { type: "date", required: false },
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

const textEditors = ["text", "textarea", "markdown", "href", "slug", "color", "icon"] as const;
