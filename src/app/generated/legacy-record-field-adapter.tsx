import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
  FormlessUiRecordField,
} from "@dpeek/formless-astryx/contract";
import type { RecordFieldConfig } from "../../client/views.ts";
import { ColorSwatch } from "@dpeek/formless-ui/color-swatch";
import { MarkdownRenderer } from "@dpeek/formless-ui/markdown";
import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { expandHexColor, isHexColor } from "./color-utils.ts";
import { GeneratedRecordFieldControl } from "./record-field-control.tsx";

export function LegacyRecordFieldAdapter({
  field,
  onIntent,
}: {
  field: FormlessUiRecordField;
  onIntent: FormlessUiFieldIntentHandler;
}) {
  const fieldConfig = legacyRecordFieldConfig(field);
  const error = field.errors?.[0]?.message ?? null;
  const canPatch = field.access.kind === "editable";

  return (
    <>
      <GeneratedRecordFieldControl
        canPatch={canPatch}
        density={field.density}
        draft={field.drafts.draft}
        error={error}
        fieldConfig={fieldConfig}
        iconDialogDraft={field.icon?.dialogDraft ?? ""}
        iconDialogOpen={field.icon?.dialogOpen ?? false}
        isPending={field.pending?.isPending ?? false}
        mediaAssetOptions={[...(field.options?.mediaAssetOptions ?? [])]}
        mediaPreviewHref={field.media?.mediaPreviewHref}
        numberFormat={field.format ?? "plain"}
        onDraftChange={(value) =>
          onIntent({ type: "recordEditorDraftChange", fieldName: field.fieldName, value })
        }
        onDraftRevert={() => onIntent({ type: "recordDraftRevert", fieldName: field.fieldName })}
        onErrorChange={(message) =>
          onIntent({ type: "fieldErrorChange", fieldName: field.fieldName, message })
        }
        onIconCancel={() => onIntent({ type: "iconDialogCancel", fieldName: field.fieldName })}
        onIconDraftChange={(value) =>
          onIntent({ type: "iconDialogDraftChange", fieldName: field.fieldName, value })
        }
        onIconOpenChange={(open) =>
          onIntent({ type: "iconDialogOpenChange", fieldName: field.fieldName, open })
        }
        onIconSave={async () => onIntent({ type: "iconDialogSave", fieldName: field.fieldName })}
        onMediaFileSelect={(file) =>
          onIntent({ type: "mediaFileSelect", fieldName: field.fieldName, file })
        }
        onMediaAssetSelect={(assetId) =>
          onIntent({ type: "mediaAssetSelect", fieldName: field.fieldName, assetId })
        }
        onUnitDraftChange={(value) =>
          onIntent({
            type: "recordDraftChange",
            fieldName: field.valueUnit?.unitFieldName ?? field.fieldName,
            fieldValue: { kind: "input", value },
          })
        }
        onUnitDraftRevert={() =>
          onIntent({
            type: "recordDraftRevert",
            fieldName: field.valueUnit?.unitFieldName ?? field.fieldName,
          })
        }
        onValueCommit={(value) =>
          onIntent({ type: "recordValueCommit", fieldName: field.fieldName, value })
        }
        onValueUnitCommit={(commit) =>
          onIntent({
            type: "recordValueUnitCommit",
            fieldName: field.fieldName,
            unitFieldName: field.valueUnit?.unitFieldName ?? field.fieldName,
            commit,
          })
        }
        presentation={field.presentationMode}
        recordValue={field.value}
        showLabel={field.labelVisibility === "visible"}
        unitDraft={field.drafts.unitDraft ?? ""}
        uploadEnabled={field.media?.uploadEnabled ?? false}
      />
      {field.suffix ? (
        <span className="shrink-0 text-xs text-slate-500">{field.suffix}</span>
      ) : null}
    </>
  );
}

export function LegacyDisplayFieldAdapter({ field }: { field: FormlessUiDisplayField }) {
  const displayValue = field.formatting.displayValue;

  return (
    <>
      {field.control.editor === "icon" && typeof field.value === "string" ? (
        <SvgIcon ariaLabel={field.label} className="size-4" source={field.value} />
      ) : field.control.editor === "color" &&
        typeof field.value === "string" &&
        isHexColor(field.value) ? (
        <ColorSwatch
          aria-label={`${field.label} color swatch`}
          className="size-3.5 overflow-hidden rounded-sm border border-slate-300"
          color={expandHexColor(field.value)}
        />
      ) : null}
      {field.control.editor === "icon" ? null : field.control.editor === "markdown" &&
        typeof field.value === "string" &&
        field.value ? (
        <MarkdownRenderer
          className="min-w-0 flex-1 text-xs [&>:first-child]:mt-0 [&>:last-child]:mb-0"
          content={field.value}
          minHeadingLevel={2}
        />
      ) : field.enum?.kind === "display" &&
        field.enum.content === "icon" &&
        field.formatting.enumValuePresentation?.icon ? (
        <span
          aria-label={`${field.label}: ${displayValue}`}
          className="inline-flex items-center gap-1"
          data-formless-field-presentation-color={
            field.formatting.enumValuePresentation.color.intent
          }
          data-formless-field-presentation-color-token={
            field.formatting.enumValuePresentation.color.token
          }
          data-formless-field-presentation-mode="iconOnly"
        >
          <SvgIcon
            ariaLabel={`${field.label}: ${displayValue}`}
            className="size-4"
            source={field.formatting.enumValuePresentation.icon.source}
          />
        </span>
      ) : (
        <span>{displayValue}</span>
      )}
      {field.suffix ? <span className="text-slate-500">{field.suffix}</span> : null}
    </>
  );
}

function legacyRecordFieldConfig(field: FormlessUiRecordField): RecordFieldConfig {
  return {
    commit: field.commit,
    editor: field.control.editor,
    field: field.control.field,
    fieldName: field.fieldName,
    format: field.format,
    label: field.label,
    presentation:
      field.rendererKind === "completion-checkbox"
        ? { mode: "completion" }
        : field.rendererKind === "quiet-date"
          ? { visibility: "valueOrInteraction" }
          : field.enum?.kind === "editor" && field.enum.style === "rich"
            ? {
                list: field.enum.listContent,
                mode: "iconOnly",
                trigger: field.enum.triggerContent,
              }
            : undefined,
    valueUnit: field.valueUnit,
  };
}
