import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { CreateFieldConfig, RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";
import { GeneratedRecordFieldControl } from "./record-field-control.tsx";

describe("generated record field presentation rendering", () => {
  it("renders enum icon-only controls with resolved icon, color, and accessible value label", () => {
    const html = renderRecordControl(priorityFieldConfig, {
      draft: "high",
      recordValue: "high",
    });

    expect(html).toContain('aria-label="Priority: High"');
    expect(html).toContain('data-formless-field-presentation-mode="iconOnly"');
    expect(html).toContain('data-formless-field-presentation-color="danger"');
    expect(html).toContain('data-formless-field-presentation-color-token="priority.high"');
    expect(html).toContain('data-formless-field-presentation-icon="flag"');
    expect(html).toContain("lucide-flag");
    expect(html).not.toContain("<select");
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
    expect(html).not.toContain("lucide-flag");
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
});

function renderRecordControl(
  fieldConfig: RecordFieldConfig,
  options: { draft: string; recordValue: FieldValue | undefined },
) {
  return renderToStaticMarkup(
    <GeneratedRecordFieldControl
      canPatch={true}
      draft={options.draft}
      error={null}
      fieldConfig={fieldConfig}
      iconDialogDraft=""
      iconDialogOpen={false}
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
      mediaAssetOptions={[]}
      mediaEditorMode="url"
      uploadEnabled={false}
    />,
  );
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
