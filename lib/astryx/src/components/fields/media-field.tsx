import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import { ImageInput, ImageValueDisplay } from "../image-input.tsx";
import {
  astryxDensity,
  editorFieldValue,
  emitMediaAssetSelect,
  fieldChromeProps,
  fieldIsReadOnly,
  formatInputValue,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";
import { mediaPickerOptions, mediaPreviewHref } from "./field-options.tsx";

export function MediaFieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: FormlessUiEditorField;
  inputId: string;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));

  return (
    <ImageInput
      id={inputId}
      {...fieldChromeProps(field)}
      accept="image/*"
      alt={field.label}
      density={astryxDensity(field)}
      isLoading={Boolean(field.pending?.isPending)}
      isReadOnly={fieldIsReadOnly(field)}
      options={mediaPickerOptions(field.options)}
      previewUrl={mediaPreviewHref(field)}
      value={value}
      onSelectOption={(option) => emitMediaAssetSelect(field, option.value, onIntent)}
      onUploadFile={(file) =>
        onIntent?.({
          type: "mediaFileSelect",
          fieldName: field.fieldName,
          file,
        })
      }
    />
  );
}

export function MediaFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  return (
    <ImageValueDisplay
      alt={field.label}
      density={astryxDensity(field)}
      label={field.label}
      previewUrl={mediaPreviewHref(field)}
      value={formatInputValue(field.value)}
    />
  );
}
