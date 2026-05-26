import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { CreateFieldConfig, RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";
import { GeneratedIconPickerEditor } from "./field-control-primitives.tsx";
import { GeneratedRecordFieldControl } from "./record-field-control.tsx";

describe("generated record field presentation rendering", () => {
  it("renders enum icon presentation as a select with resolved icon, color, and accessible value label", () => {
    const html = renderRecordControl(priorityFieldConfig, {
      draft: "high",
      recordValue: "high",
    });

    expect(html).toContain('aria-label="Priority: High"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('data-formless-field-presentation-mode="iconOnly"');
    expect(html).toContain('data-formless-field-presentation-trigger="icon"');
    expect(html).toContain('data-formless-field-presentation-list="both"');
    expect(html).toContain('data-formless-field-presentation-color="danger"');
    expect(html).toContain('data-formless-field-presentation-color-token="priority.high"');
    expect(html).toContain('data-formless-field-presentation-icon="flag"');
    expect(html).toContain("h-9 w-12");
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain('d="M4 15s1-1 4-1');
  });

  it("can render enum icon presentation labels in the select trigger", () => {
    const html = renderRecordControl(
      {
        ...priorityFieldConfig,
        presentation: { list: "label", mode: "iconOnly", trigger: "both" },
      },
      { draft: "high", recordValue: "high" },
    );

    expect(html).toContain('data-formless-field-presentation-trigger="both"');
    expect(html).toContain('data-formless-field-presentation-list="label"');
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain(">High</span>");
  });

  it("renders enum icon-only controls from non-compat catalog presentation tokens", () => {
    const html = renderRecordControl(
      {
        ...priorityFieldConfig,
        field: {
          ...priorityField,
          values: {
            high: {
              label: "High",
              presentation: { color: "priority.high", icon: "github" },
            },
          },
        },
      },
      { draft: "high", recordValue: "high" },
    );

    expect(html).toContain('aria-label="Priority: High"');
    expect(html).toContain('data-formless-field-presentation-icon="github"');
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain('d="M12 .5C5.65 .5.5 5.65.5 12');
    expect(html).not.toContain(">High</span>");
  });

  it("falls back to neutral visible enum text for unknown icon and color tokens", () => {
    const html = renderRecordControl(
      {
        ...priorityFieldConfig,
        field: {
          ...priorityField,
          values: {
            high: {
              label: "High",
              presentation: { color: "priority.unknown", icon: "missing" },
            },
          },
        },
      },
      { draft: "high", recordValue: "high" },
    );

    expect(html).toContain('aria-label="Priority: High"');
    expect(html).toContain('data-formless-field-presentation-color="neutral"');
    expect(html).toContain('data-formless-field-presentation-color-token="priority.unknown"');
    expect(html).toContain('data-formless-field-presentation-icon="missing"');
    expect(html).toContain(">High</span>");
    expect(html).not.toContain('data-web-svg-icon="svg"');
  });

  it("renders boolean completion mode as the larger generated completion control", () => {
    const html = renderRecordControl(doneFieldConfig, { draft: "true", recordValue: true });

    expect(html).toContain('data-formless-field-presentation-mode="completion"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("size-6");
  });

  it("keeps empty value-or-interaction dates quiet until row hover or focus", () => {
    const html = renderRecordControl(dueDateFieldConfig, { draft: "", recordValue: undefined });

    expect(html).toContain('data-formless-field-presentation-visibility="valueOrInteraction"');
    expect(html).toContain("opacity-0");
    expect(html).toContain("group-hover/record-row:opacity-100");
    expect(html).toContain("group-focus-within/record-row:opacity-100");
    expect(html).toContain('data-slot="date-picker-trigger"');
  });

  it("renders create completion presentation through the shared checkbox primitive", () => {
    const html = renderToStaticMarkup(
      <GeneratedCreateFieldControl
        fieldConfig={
          {
            fieldName: "done",
            field: doneField,
            editor: "boolean",
            presentation: { mode: "completion" },
          } satisfies CreateFieldConfig
        }
      />,
    );

    expect(html).toContain('data-formless-field-presentation-mode="completion"');
    expect(html).toContain('name="done"');
    expect(html).toContain("size-6");
  });

  it("opens icon editing as a catalog picker before showing custom SVG source", () => {
    const githubSvg = requiredCatalogSvg("github");
    const html = renderToStaticMarkup(
      <GeneratedIconPickerEditor
        disabled={false}
        label="Icon"
        onChange={() => undefined}
        onSave={() => undefined}
        value={githubSvg}
      />,
    );

    expect(html).toContain('data-web-icon-picker="catalog"');
    expect(html).toContain('aria-label="Search icons"');
    expect(html).toContain('data-web-icon-picker-option="empty"');
    expect(html).toContain('data-web-icon-picker-group="social"');
    expect(html).toContain('data-web-icon-picker-option="github"');
    expect(html).toContain('data-web-icon-picker-selected="true"');
    expect(html).toContain("Custom SVG");
    expect(html).not.toContain('data-web-svg-source="textarea"');
  });

  it("shows the SVG source editor only in custom icon mode", () => {
    const html = renderToStaticMarkup(
      <GeneratedIconPickerEditor
        disabled={false}
        initialMode="custom"
        label="Icon"
        onChange={() => undefined}
        onSave={() => undefined}
        value="<svg><script /></svg>"
      />,
    );

    expect(html).toContain('data-web-icon-picker="custom"');
    expect(html).toContain('data-web-svg-source="textarea"');
    expect(html).toContain('data-web-icon-picker-custom-preview="true"');
    expect(html).toContain('data-web-svg-icon-empty="true"');
  });

  it("submits create icon values through the existing text-backed field name", () => {
    const html = renderToStaticMarkup(
      <GeneratedCreateFieldControl
        fieldConfig={
          {
            fieldName: "icon",
            field: { type: "text", required: false, format: "icon" },
            editor: "icon",
          } satisfies CreateFieldConfig
        }
      />,
    );

    expect(html).toContain('name="icon"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value=""');
    expect(html).toContain('data-web-icon-field-edit="trigger"');
    expect(html).not.toContain('data-web-svg-source="textarea"');
  });
});

function renderRecordControl(
  fieldConfig: RecordFieldConfig,
  options: {
    draft: string;
    iconDialogDraft?: string;
    iconDialogOpen?: boolean;
    recordValue: FieldValue | undefined;
  },
) {
  return renderToStaticMarkup(
    <GeneratedRecordFieldControl
      canPatch={true}
      draft={options.draft}
      error={null}
      fieldConfig={fieldConfig}
      iconDialogDraft={options.iconDialogDraft ?? ""}
      iconDialogOpen={options.iconDialogOpen ?? false}
      isPending={false}
      mediaAssetOptions={[]}
      mediaEditorMode="url"
      numberFormat="plain"
      onDraftChange={() => undefined}
      onDraftRevert={() => undefined}
      onErrorChange={() => undefined}
      onIconCancel={() => undefined}
      onIconDraftChange={() => undefined}
      onIconOpenChange={() => undefined}
      onIconSave={() => Promise.resolve()}
      onImageFileSelect={() => undefined}
      onMediaAssetSelect={() => undefined}
      onPatchValues={(_values: Partial<RecordValues>) => undefined}
      onUnitDraftChange={() => undefined}
      onUnitDraftRevert={() => undefined}
      onValueCommit={() => undefined}
      recordValue={options.recordValue}
      unitDraft=""
      uploadEnabled={false}
    />,
  );
}

function requiredCatalogSvg(key: string) {
  const svg = resolveIconCatalogSvg(key);

  if (!svg) {
    throw new Error(`Missing catalog icon "${key}".`);
  }

  return svg;
}

const priorityField = {
  type: "enum",
  required: true,
  values: {
    low: { label: "Low", presentation: { color: "priority.low", icon: "flag" } },
    normal: { label: "Normal", presentation: { color: "priority.normal", icon: "flag" } },
    high: { label: "High", presentation: { color: "priority.high", icon: "flag" } },
  },
} satisfies FieldSchema;

const doneField = {
  type: "boolean",
  required: true,
  default: false,
} satisfies FieldSchema;

const dueDateField = {
  type: "date",
  required: false,
} satisfies FieldSchema;

const priorityFieldConfig = {
  fieldName: "priority",
  field: priorityField,
  editor: "enum",
  commit: "immediate",
  label: "Priority",
  presentation: { mode: "iconOnly" },
} satisfies RecordFieldConfig;

const doneFieldConfig = {
  fieldName: "done",
  field: doneField,
  editor: "boolean",
  commit: "immediate",
  label: "Done",
  presentation: { mode: "completion" },
} satisfies RecordFieldConfig;

const dueDateFieldConfig = {
  fieldName: "dueDate",
  field: dueDateField,
  editor: "date",
  commit: "field-commit",
  label: "Due date",
  presentation: { visibility: "valueOrInteraction" },
} satisfies RecordFieldConfig;
