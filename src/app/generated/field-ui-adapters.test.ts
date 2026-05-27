import { describe, expect, it } from "vite-plus/test";
import type { RecordFieldConfig } from "../../client/views.ts";
import type { FieldEditor, FieldPresentationSchema, FieldSchema } from "../../shared/schema.ts";
import { selectGeneratedFieldControl } from "./field-controls.ts";
import {
  selectGeneratedFieldEditorAdapter,
  selectGeneratedRecordFieldAuthoringAdapter,
} from "./field-ui-adapters.ts";

describe("generated field controls", () => {
  it("exposes field behavior facts for generated create and inline editors", () => {
    expect(
      Object.fromEntries(
        textEditors.map((editor) => [
          editor,
          selectGeneratedFieldControl({
            editor,
            field: fields.title,
            label: labels.title,
          }).control,
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
      image: { kind: "imageUpload" },
      media: { kind: "mediaUpload" },
    });
    expect(
      selectGeneratedFieldControl({
        editor: "text",
        field: fields.title,
        label: labels.title,
      }),
    ).toMatchObject({
      kind: "text",
      control: { kind: "input", inputType: "text" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      inputAttributes: {},
      label: "Title",
      required: true,
    });
    expect(selectGeneratedFieldEditorAdapter(fields.title, "text")).toMatchObject({
      kind: "text",
      editor: "text",
      controlKind: "text",
    });
    expect(
      selectGeneratedFieldControl({
        editor: "markdown",
        field: fields.title,
        label: labels.title,
      }),
    ).toMatchObject({
      kind: "text",
      control: { kind: "textarea" },
      controlKind: "markdown",
    });
    expect(
      selectGeneratedFieldControl({
        editor: "icon",
        field: fields.icon,
        label: labels.icon,
      }),
    ).toMatchObject({
      kind: "text",
      editor: "icon",
      control: { kind: "icon" },
      controlKind: "icon",
      createDefaultValue: undefined,
      label: "Icon",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "image",
        field: fields.image,
        label: labels.image,
      }),
    ).toMatchObject({
      kind: "text",
      editor: "image",
      control: { kind: "imageUpload" },
      controlKind: "image",
      createDefaultValue: undefined,
      label: "Image",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "media",
        field: fields.image,
        label: labels.image,
      }),
    ).toMatchObject({
      kind: "text",
      editor: "media",
      control: { kind: "mediaUpload" },
      controlKind: "media",
      createDefaultValue: undefined,
      label: "Image",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "date",
        field: fields.dueDate,
        label: labels.dueDate,
      }),
    ).toMatchObject({
      kind: "date",
      control: { kind: "input", inputType: "date" },
      controlKind: "date",
      createDefaultValue: undefined,
      editor: "date",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "boolean",
        field: fields.done,
        label: labels.done,
      }),
    ).toMatchObject({
      kind: "boolean",
      control: { kind: "checkbox" },
      controlKind: "checkbox",
      createDefaultChecked: true,
      editor: "boolean",
      required: true,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "number",
        field: fields.estimate,
        label: labels.estimate,
      }),
    ).toMatchObject({
      kind: "number",
      control: { kind: "formattedNumber" },
      controlKind: "number",
      createDefaultValue: "2",
      editor: "number",
      inputAttributes: { max: 10, min: 0, step: "1" },
    });
    expect(
      selectGeneratedFieldControl({
        editor: "enum",
        field: fields.priority,
        label: labels.priority,
      }),
    ).toMatchObject({
      kind: "enum",
      control: { kind: "select" },
      controlKind: "select",
      createDefaultValue: "normal",
      editor: "enum",
    });
    expect(
      selectGeneratedFieldControl({
        editor: "enum",
        field: fields.optionalPriority,
        label: labels.optionalPriority,
      }),
    ).toMatchObject({
      kind: "enum",
      control: { kind: "select" },
      controlKind: "select",
      createDefaultValue: "",
      required: false,
    });
    expect(
      selectGeneratedFieldControl({
        editor: "reference",
        field: fields.resource,
        label: labels.resource,
      }),
    ).toMatchObject({
      kind: "reference",
      control: { kind: "reference" },
      controlKind: "reference",
      createDefaultValue: undefined,
      editor: "reference",
      required: true,
    });
  });

  it("selects icon controls from text fields with icon format", () => {
    expect(
      selectGeneratedFieldControl({
        editor: "text",
        field: fields.icon,
        label: labels.icon,
      }),
    ).toMatchObject({
      kind: "text",
      editor: "text",
      control: { kind: "input", inputType: "text" },
      controlKind: "icon",
    });
  });

  it("adapts generated field controls to record renderer selection facts", () => {
    expect(recordAuthoring("title", "text")).toMatchObject({
      rendererKind: "text",
      fieldControl: { controlKind: "text", editor: "text", label: "Title" },
    });
    expect(recordAuthoring("title", "text", { presentation: "heading" })).toMatchObject({
      rendererKind: "autosize-text",
      fieldControl: { controlKind: "text", editor: "text" },
    });
    expect(recordAuthoring("body", "markdown")).toMatchObject({
      rendererKind: "markdown",
      fieldControl: { controlKind: "markdown", editor: "markdown" },
    });
    expect(
      recordAuthoring("done", "boolean", { fieldPresentation: { mode: "completion" } }),
    ).toMatchObject({
      rendererKind: "completion-checkbox",
      fieldControl: { controlKind: "checkbox", editor: "boolean" },
    });
    expect(
      recordAuthoring("dueDate", "date", {
        fieldPresentation: { visibility: "valueOrInteraction" },
      }),
    ).toMatchObject({
      rendererKind: "quiet-date",
      fieldControl: { controlKind: "date", editor: "date" },
    });
    expect(recordAuthoring("cost", "number")).toMatchObject({
      rendererKind: "value-unit",
      fieldControl: { controlKind: "number", editor: "number" },
    });
    expect(
      recordAuthoring("priority", "enum", { fieldPresentation: { list: "icon" } }),
    ).toMatchObject({
      rendererKind: "enum-icon",
      fieldControl: { controlKind: "select", editor: "enum" },
    });
    expect(recordAuthoring("resource", "reference")).toMatchObject({
      rendererKind: "reference",
      fieldControl: { controlKind: "reference", editor: "reference" },
    });
    expect(recordAuthoring("color", "color")).toMatchObject({
      rendererKind: "color",
      fieldControl: { controlKind: "color", editor: "color" },
    });
    expect(recordAuthoring("icon", "icon")).toMatchObject({
      rendererKind: "icon",
      fieldControl: { controlKind: "icon", editor: "icon" },
    });
    expect(recordAuthoring("image", "image")).toMatchObject({
      rendererKind: "image",
      fieldControl: { controlKind: "image", editor: "image" },
    });
    expect(recordAuthoring("image", "media")).toMatchObject({
      rendererKind: "media",
      fieldControl: { controlKind: "media", editor: "media" },
    });
  });
});

function recordAuthoring(
  fieldName: keyof typeof fields,
  editor: FieldEditor,
  options: {
    fieldPresentation?: FieldPresentationSchema;
    presentation?: "default" | "heading";
  } = {},
) {
  const field = fields[fieldName];
  const fieldConfig: RecordFieldConfig = {
    fieldName,
    field,
    editor,
    commit: "field-commit",
    ...(options.fieldPresentation === undefined ? {} : { presentation: options.fieldPresentation }),
    valueUnit:
      fieldName === "cost"
        ? {
            unitFieldName: "costUnit",
            unitField: fields.costUnit,
          }
        : undefined,
  };

  return selectGeneratedRecordFieldAuthoringAdapter({
    fieldConfig,
    label: labels[fieldName],
    ...(options.presentation === undefined ? {} : { presentation: options.presentation }),
  });
}

const fields = {
  title: { type: "text", required: true },
  body: { type: "text", required: false },
  icon: { type: "text", required: false, format: "icon" },
  image: { type: "text", required: false, format: "href" },
  color: { type: "text", required: false },
  done: { type: "boolean", required: true, default: true },
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false, default: 2, min: 0, max: 10, integer: true },
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

const textEditors = [
  "text",
  "textarea",
  "markdown",
  "href",
  "slug",
  "color",
  "icon",
  "image",
  "media",
] as const;

const labels = {
  title: "Title",
  body: "Body",
  icon: "Icon",
  image: "Image",
  color: "Color",
  done: "Done",
  dueDate: "Due date",
  estimate: "Estimate",
  cost: "Cost",
  costUnit: "Cost unit",
  priority: "Priority",
  optionalPriority: "Optional priority",
  resource: "Resource",
} satisfies Record<keyof typeof fields, string>;
