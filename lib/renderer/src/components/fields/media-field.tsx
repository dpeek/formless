import type {
  DisplayFieldContract,
  FieldIntentHandler,
  MediaAuthoring,
} from "@dpeek/formless-presentation/contract";
import { MediaInput, MediaValueDisplay } from "../media-input.tsx";
import {
  astryxDensity,
  editorFieldValue,
  emitMediaAssetSelect,
  fieldChromeProps,
  fieldIsReadOnly,
  formatInputValue,
  type EditorField,
} from "./field-chrome.tsx";
import { mediaPickerOptions, mediaPreviewHref } from "./field-options.tsx";

export function MediaFieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: EditorField;
  inputId: string;
  onIntent: FieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));
  const media = mediaAuthoring(field);
  const fileSelectEnabled = media?.fileSelectEnabled === true;

  return (
    <MediaInput
      id={inputId}
      {...fieldChromeProps(field)}
      accept={media?.accept ?? "image/*"}
      density={astryxDensity(field)}
      isLoading={Boolean(field.pending?.isPending)}
      isReadOnly={fieldIsReadOnly(field)}
      maxSize={media?.maxSize}
      options={mediaPickerOptions(field.options)}
      previewUrl={mediaPreviewHref(field)}
      value={value}
      onSelectOption={(assetId) => emitMediaAssetSelect(field, assetId, onIntent)}
      onUploadFile={
        !fileSelectEnabled
          ? undefined
          : (file) =>
              void onIntent?.({
                type: "mediaFileSelect",
                fieldName: field.fieldName,
                file,
              })
      }
    />
  );
}

export function MediaFieldDisplay({ field }: { field: DisplayFieldContract }) {
  return (
    <MediaValueDisplay
      density={astryxDensity(field)}
      label={field.label}
      previewUrl={mediaPreviewHref(field)}
      value={formatInputValue(field.value)}
    />
  );
}

function mediaAuthoring(field: EditorField): MediaAuthoring | undefined {
  return field.media && "fileSelectEnabled" in field.media ? field.media : undefined;
}
