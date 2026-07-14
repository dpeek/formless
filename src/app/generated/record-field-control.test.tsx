import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  MediaFieldControl,
  type ImageMediaAssetOption,
  type MediaFieldControlProps,
} from "@dpeek/formless-media/react";
import { NativeSelectContent } from "@dpeek/formless-ui/native-select";
import type { CreateFieldConfig, RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import type { AppSchema, FieldSchema } from "@dpeek/formless-schema";
import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import type { BootstrapResponse } from "../../shared/protocol.ts";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";
import { GeneratedIconPickerEditor } from "./field-control-primitives.tsx";
import { projectGeneratedCreateFormlessUiField } from "./formless-ui-projection.ts";
import { RecordFieldDisplay } from "./record-field-display.tsx";
import { GeneratedRecordFieldControl } from "./record-field-control.tsx";

beforeEach(() => {
  resetClientStore();
});

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
    expect(html).toContain('data-formless-field-presentation-icon="priority-marker"');
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

  it("renders enum icon-only controls from catalog presentation tokens", () => {
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
    const html = renderCreateField({
      fieldName: "done",
      field: doneField,
      editor: "boolean",
      presentation: { mode: "completion" },
    });

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
    const html = renderCreateField({
      fieldName: "icon",
      field: { type: "text", required: false, format: "icon" },
      editor: "icon",
    });

    expect(html).toContain('name="icon"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value=""');
    expect(html).toContain('data-web-icon-field-edit="trigger"');
    expect(html).not.toContain('data-web-svg-source="textarea"');
  });

  it("keeps media field labels and validation placement in generated UI", () => {
    const html = renderRecordControl(mediaFieldConfig, {
      draft: "hero.webp",
      error: "Upload failed.",
      mediaAssetOptions: [{ href: "/media/hero.webp", id: "hero.webp", label: "Hero" }],
      mediaEditorMode: "asset",
      mediaPreviewHref: "/media/hero.webp",
      recordValue: "hero.webp",
      showLabel: true,
      uploadEnabled: true,
    });

    expect(html).toContain(">Hero image</label>");
    expect(html).toContain("Upload failed.");
    expect(html).toContain('data-web-media-field-mode="asset"');
    expect(html).toContain('aria-label="Hero image asset"');
  });

  it("commits and reverts media URL edits from generated UI policy", () => {
    const committed: FieldValue[] = [];
    let reverted = 0;
    const fieldCommitControl = recordMediaFieldControlProps({
      fieldConfig: mediaFieldConfig,
      onDraftRevert: () => {
        reverted += 1;
      },
      onValueCommit: (value) => {
        committed.push(value);
      },
    });

    fieldCommitControl.onUrlBlur("/blur.webp");
    fieldCommitControl.onUrlEnter("/enter.webp");
    fieldCommitControl.onUrlEscape();

    expect(committed).toEqual(["/blur.webp", "/enter.webp"]);
    expect(reverted).toBe(1);

    const immediateCommitted: FieldValue[] = [];
    const immediateControl = recordMediaFieldControlProps({
      fieldConfig: { ...mediaFieldConfig, commit: "immediate" },
      onValueCommit: (value) => {
        immediateCommitted.push(value);
      },
    });

    immediateControl.onUrlBlur("/ignored.webp");
    immediateControl.onUrlEnter("/entered.webp");

    expect(immediateCommitted).toEqual(["/entered.webp"]);
  });

  it("renders identity reference displays and editors with a stored-id fallback", () => {
    applyBootstrapResponse(identityReferenceBootstrap());

    const displayHtml = renderToStaticMarkup(
      <RecordFieldDisplay column={ownerPrincipalFieldConfig} recordId="account-1" />,
    );
    const editorHtml = renderRecordControl(ownerPrincipalFieldConfig, {
      draft: "principal-1",
      recordValue: "principal-1",
      showLabel: true,
    });

    expect(displayHtml).toContain(">principal-1</span>");
    expect(displayHtml).not.toContain("credential-hash");
    expect(editorHtml).toContain(">Owner</label>");
    expect(editorHtml).toContain('value="principal-1"');
    expect(editorHtml).toContain(">principal-1</option>");
    expect(editorHtml).not.toContain("credential-hash");
  });

  it("commits identity reference editor changes as flat ids", () => {
    const committed: FieldValue[] = [];
    const drafts: string[] = [];
    const props = recordReferenceSelectProps({
      fieldConfig: ownerPrincipalFieldConfig,
      onDraftChange: (value) => {
        drafts.push(value);
      },
      onValueCommit: (value) => {
        committed.push(value);
      },
    });

    props.onChange?.({
      currentTarget: { value: "principal-2" },
    } as Parameters<NonNullable<typeof props.onChange>>[0]);

    expect(drafts).toEqual(["principal-2"]);
    expect(committed).toEqual(["principal-2"]);
  });

  it("renders identity reference create editors without active app replica identity options", () => {
    applyBootstrapResponse(identityReferenceBootstrap());

    const html = renderCreateField(ownerPrincipalCreateFieldConfig);

    expect(html).toContain('name="ownerPrincipal"');
    expect(html).toContain(">Owner</label>");
    expect(html).not.toContain("credential-hash");
  });
});

function renderCreateField(fieldConfig: CreateFieldConfig) {
  const field = projectGeneratedCreateFormlessUiField({ fieldConfig });

  return renderToStaticMarkup(
    <GeneratedCreateFieldControl field={field} onIntent={() => undefined} />,
  );
}

function renderRecordControl(
  fieldConfig: RecordFieldConfig,
  options: {
    draft: string;
    error?: string | null;
    iconDialogDraft?: string;
    iconDialogOpen?: boolean;
    mediaAssetOptions?: ImageMediaAssetOption[];
    mediaEditorMode?: "asset" | "url";
    mediaPreviewHref?: string;
    recordValue: FieldValue | undefined;
    showLabel?: boolean;
    uploadEnabled?: boolean;
  },
) {
  return renderToStaticMarkup(
    <GeneratedRecordFieldControl
      canPatch={true}
      draft={options.draft}
      error={options.error ?? null}
      fieldConfig={fieldConfig}
      iconDialogDraft={options.iconDialogDraft ?? ""}
      iconDialogOpen={options.iconDialogOpen ?? false}
      isPending={false}
      mediaAssetOptions={options.mediaAssetOptions ?? []}
      mediaEditorMode={options.mediaEditorMode ?? "url"}
      mediaPreviewHref={options.mediaPreviewHref}
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
      onUnitDraftChange={() => undefined}
      onUnitDraftRevert={() => undefined}
      onValueCommit={() => undefined}
      onValueUnitCommit={() => undefined}
      recordValue={options.recordValue}
      showLabel={options.showLabel ?? false}
      unitDraft=""
      uploadEnabled={options.uploadEnabled ?? false}
    />,
  );
}

function recordMediaFieldControlProps({
  fieldConfig,
  onDraftRevert = () => undefined,
  onValueCommit = () => undefined,
}: {
  fieldConfig: RecordFieldConfig;
  onDraftRevert?: () => void;
  onValueCommit?: (value: FieldValue) => void;
}): MediaFieldControlProps {
  const props = findMediaFieldControlProps(
    <GeneratedRecordFieldControl
      canPatch={true}
      draft="/draft.webp"
      error={null}
      fieldConfig={fieldConfig}
      iconDialogDraft=""
      iconDialogOpen={false}
      isPending={false}
      mediaAssetOptions={[]}
      mediaEditorMode="url"
      numberFormat="plain"
      onDraftChange={() => undefined}
      onDraftRevert={onDraftRevert}
      onErrorChange={() => undefined}
      onIconCancel={() => undefined}
      onIconDraftChange={() => undefined}
      onIconOpenChange={() => undefined}
      onIconSave={() => Promise.resolve()}
      onImageFileSelect={() => undefined}
      onMediaAssetSelect={() => undefined}
      onUnitDraftChange={() => undefined}
      onUnitDraftRevert={() => undefined}
      onValueCommit={onValueCommit}
      onValueUnitCommit={() => undefined}
      recordValue="/record.webp"
      unitDraft=""
      uploadEnabled={true}
    />,
  );

  if (!props) {
    throw new Error("Expected generated media field control props.");
  }

  return props;
}

function recordReferenceSelectProps({
  fieldConfig,
  onDraftChange = () => undefined,
  onValueCommit = () => undefined,
}: {
  fieldConfig: RecordFieldConfig;
  onDraftChange?: (value: string) => void;
  onValueCommit?: (value: FieldValue) => void;
}): ComponentProps<typeof NativeSelectContent> {
  const props = findNativeSelectContentProps(
    <GeneratedRecordFieldControl
      canPatch={true}
      draft="principal-1"
      error={null}
      fieldConfig={fieldConfig}
      iconDialogDraft=""
      iconDialogOpen={false}
      isPending={false}
      mediaAssetOptions={[]}
      mediaEditorMode="url"
      numberFormat="plain"
      onDraftChange={onDraftChange}
      onDraftRevert={() => undefined}
      onErrorChange={() => undefined}
      onIconCancel={() => undefined}
      onIconDraftChange={() => undefined}
      onIconOpenChange={() => undefined}
      onIconSave={() => Promise.resolve()}
      onImageFileSelect={() => undefined}
      onMediaAssetSelect={() => undefined}
      onUnitDraftChange={() => undefined}
      onUnitDraftRevert={() => undefined}
      onValueCommit={onValueCommit}
      onValueUnitCommit={() => undefined}
      recordValue="principal-1"
      unitDraft=""
      uploadEnabled={true}
    />,
  );

  if (!props) {
    throw new Error("Expected generated reference select props.");
  }

  return props;
}

function findMediaFieldControlProps(node: ReactNode): MediaFieldControlProps | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) {
      continue;
    }

    if (child.type === MediaFieldControl) {
      return child.props as MediaFieldControlProps;
    }

    const childProps = child.props as { children?: ReactNode };
    const nestedProps = findMediaFieldControlProps(childProps.children);

    if (nestedProps) {
      return nestedProps;
    }

    if (typeof child.type === "function") {
      const rendered = (child.type as (props: unknown) => ReactNode)(child.props);
      const renderedProps = findMediaFieldControlProps(rendered);

      if (renderedProps) {
        return renderedProps;
      }
    }
  }

  return undefined;
}

function findNativeSelectContentProps(
  node: ReactNode,
): ComponentProps<typeof NativeSelectContent> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) {
      continue;
    }

    if (child.type === NativeSelectContent) {
      return child.props as ComponentProps<typeof NativeSelectContent>;
    }

    const childProps = child.props as { children?: ReactNode };
    const nestedProps = findNativeSelectContentProps(childProps.children);

    if (nestedProps) {
      return nestedProps;
    }

    if (typeof child.type === "function") {
      const rendered = (child.type as (props: unknown) => ReactNode)(child.props);
      const renderedProps = findNativeSelectContentProps(rendered);

      if (renderedProps) {
        return renderedProps;
      }
    }
  }

  return undefined;
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
    low: { label: "Low", presentation: { color: "priority.low", icon: "priority-marker" } },
    normal: {
      label: "Normal",
      presentation: { color: "priority.normal", icon: "priority-marker" },
    },
    high: { label: "High", presentation: { color: "priority.high", icon: "priority-marker" } },
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

const imageTextField = { type: "text", required: false, format: "href" } satisfies FieldSchema;

const ownerPrincipalField = {
  type: "reference",
  required: true,
  label: "Owner",
  to: "auth:principal",
  displayField: "credentialHash",
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

const mediaFieldConfig = {
  fieldName: "mediaAsset",
  field: imageTextField,
  editor: "media",
  commit: "field-commit",
  label: "Hero image",
} satisfies RecordFieldConfig;

const ownerPrincipalFieldConfig = {
  fieldName: "ownerPrincipal",
  field: ownerPrincipalField,
  editor: "reference",
  commit: "immediate",
  label: "Owner",
} satisfies RecordFieldConfig;

const ownerPrincipalCreateFieldConfig = {
  fieldName: "ownerPrincipal",
  field: ownerPrincipalField,
  editor: "reference",
} satisfies CreateFieldConfig;

const identityReferenceSchema = {
  version: 1,
  entities: {
    account: {
      label: "Account",
      fields: {
        ownerPrincipal: ownerPrincipalField,
      },
    },
  },
  queries: {},
  itemViews: {},
  tableViews: {},
  views: {},
  screens: {},
} satisfies AppSchema;

function identityReferenceBootstrap(): BootstrapResponse {
  return {
    schema: identityReferenceSchema,
    schemaUpdatedAt: "2026-06-30T12:40:00.000Z",
    records: [
      storedRecord("account-1", "account", { ownerPrincipal: "principal-1" }),
      storedRecord("principal-1", "auth:principal", {
        credentialHash: "credential-hash",
        displayName: "Raw Principal",
      }),
    ],
    cursor: 1,
  };
}

function storedRecord(id: string, entity: string, values: RecordValues) {
  return {
    id,
    entity,
    values,
    createdAt: "2026-06-30T12:40:00.000Z",
    updatedAt: "2026-06-30T12:40:00.000Z",
  };
}
