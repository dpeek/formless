import { describe, expect, it } from "vite-plus/test";
import type { RecordFieldConfig } from "../../client/views.ts";
import type { FieldEditor, FieldSchema } from "../../shared/schema.ts";
import { selectGeneratedFieldControl } from "./field-controls.ts";
import { selectGeneratedRecordFieldRendererKind } from "./record-field-renderer-model.ts";

describe("generated record field renderer model", () => {
  it("selects field-specific record renderers from field behavior facts", () => {
    expect(recordRenderer("title", "text")).toBe("text");
    expect(recordRenderer("title", "text", { presentation: "heading" })).toBe("autosize-text");
    expect(recordRenderer("body", "textarea")).toBe("textarea");
    expect(recordRenderer("body", "markdown")).toBe("markdown");
    expect(recordRenderer("body", "markdown", { density: "compact" })).toBe("textarea");
    expect(recordRenderer("done", "boolean")).toBe("checkbox");
    expect(recordRenderer("dueDate", "date")).toBe("date");
    expect(recordRenderer("estimate", "number")).toBe("number");
    expect(recordRenderer("cost", "number")).toBe("value-unit");
    expect(recordRenderer("priority", "enum")).toBe("enum");
    expect(recordRenderer("resource", "reference")).toBe("reference");
    expect(recordRenderer("color", "color")).toBe("color");
    expect(recordRenderer("icon", "icon")).toBe("icon");
    expect(recordRenderer("image", "image")).toBe("image");
    expect(recordRenderer("image", "media")).toBe("media");
    expect(recordRenderer("href", "href", { showLabel: true })).toBe("text");
  });
});

function recordRenderer(
  fieldName: keyof typeof fields,
  editor: FieldEditor,
  options: {
    density?: "default" | "compact";
    presentation?: "default" | "heading";
    showLabel?: boolean;
  } = {},
) {
  const field = fields[fieldName];
  const fieldConfig: RecordFieldConfig = {
    fieldName,
    field,
    editor,
    commit: "field-commit",
    valueUnit:
      fieldName === "cost"
        ? {
            unitFieldName: "costUnit",
            unitField: fields.costUnit,
          }
        : undefined,
  };
  const fieldControl = selectGeneratedFieldControl({
    editor,
    field,
    label: labels[fieldName],
  });

  return selectGeneratedRecordFieldRendererKind({
    fieldConfig,
    fieldControl,
    ...options,
  });
}

const fields = {
  title: { type: "text", required: true },
  body: { type: "text", required: false },
  href: { type: "text", required: false, format: "href" },
  color: { type: "text", required: false },
  icon: { type: "text", required: false, format: "icon" },
  image: { type: "text", required: false, format: "href" },
  done: { type: "boolean", required: true },
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false },
  cost: { type: "number", required: false },
  costUnit: {
    type: "enum",
    required: false,
    values: {
      hour: { label: "Hour" },
      day: { label: "Day" },
    },
  },
  priority: {
    type: "enum",
    required: false,
    values: {
      normal: { label: "Normal" },
      high: { label: "High" },
    },
  },
  resource: { type: "reference", required: true, to: "resource", displayField: "name" },
} satisfies Record<string, FieldSchema>;

const labels = Object.fromEntries(
  Object.keys(fields).map((fieldName) => [fieldName, fieldName]),
) as Record<keyof typeof fields, string>;
