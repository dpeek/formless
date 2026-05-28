import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";

import { IMAGE_UPLOAD_ACCEPT, type ImageMediaAssetOption } from "./client.ts";

export type { ImageMediaAssetOption } from "./client.ts";

export type MediaFieldControlDensity = "default" | "compact";
export type MediaFieldEditorMode = "asset" | "url";
export type MediaFieldKind = "image" | "media";

export type MediaFieldControlProps = {
  controlDisabled: boolean;
  density: MediaFieldControlDensity;
  draft: string;
  fieldKind: MediaFieldKind;
  invalid: boolean;
  label: string;
  mediaAssetOptions: ImageMediaAssetOption[];
  mediaEditorMode: MediaFieldEditorMode;
  mediaPreviewHref?: string;
  onDraftChange: (value: string) => void;
  onFileSelect: (file: File | undefined) => void;
  onMediaAssetSelect: (assetId: string) => void;
  onUrlBlur: (value: string) => void;
  onUrlEnter: (value: string) => void;
  onUrlEscape: () => void;
  required: boolean;
  uploadDisabled: boolean;
};

const compactNativeInputClassName =
  "h-6 w-full rounded border border-slate-300 px-2 py-0.5 text-xs/4 sm:px-2 sm:py-0.5 sm:text-xs/4 md:text-xs/4";
const compactNativeSelectClassName =
  "h-6 py-0.5 pe-6 ps-2 text-xs/4 sm:py-0.5 sm:pe-6 sm:ps-2 sm:pr-6 sm:pl-2 sm:text-xs/4 md:text-xs/4";

export function MediaFieldControl({
  controlDisabled,
  density,
  draft,
  fieldKind,
  invalid,
  mediaAssetOptions,
  mediaEditorMode,
  mediaPreviewHref,
  label,
  onDraftChange,
  onFileSelect,
  onMediaAssetSelect,
  onUrlBlur,
  onUrlEnter,
  onUrlEscape,
  required,
  uploadDisabled,
}: MediaFieldControlProps) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewHref = mediaEditorMode === "asset" ? mediaPreviewHref : draft;
  const previewState =
    draft === "" ? "empty" : previewHref === undefined || previewFailed ? "broken" : "image";
  const assetLabel = mediaEditorMode === "asset" ? mediaAssetLabel(label) : label;
  const inputLabel = mediaEditorMode === "asset" ? `${assetLabel} id` : `${label} URL`;
  const unknownAssetSelected =
    mediaEditorMode === "asset" &&
    draft !== "" &&
    !mediaAssetOptions.some((asset) => asset.id === draft);
  const previewClassName =
    density === "compact"
      ? `relative flex h-16 w-full items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 ${
          uploadDisabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:border-slate-300 hover:bg-slate-100"
        }`
      : `relative flex aspect-[4/3] max-h-72 w-full items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 ${
          uploadDisabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:border-slate-300 hover:bg-slate-100"
        }`;

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewHref]);

  function handleUrlKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onUrlEnter(event.currentTarget.value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onUrlEscape();
    }
  }

  return (
    <div
      className={density === "compact" ? "w-full min-w-0 space-y-2" : "w-full min-w-0 space-y-3"}
      data-slot="control"
      data-web-field-kind={fieldKind}
      data-web-media-field-mode={fieldKind === "media" ? mediaEditorMode : undefined}
    >
      <label
        className={previewClassName}
        data-web-image-field-preview={previewState}
        data-web-image-field-upload="trigger"
        data-web-media-field-preview={fieldKind === "media" ? previewState : undefined}
        data-web-media-field-upload={fieldKind === "media" ? "trigger" : undefined}
        title={`Upload ${label}`}
      >
        {previewState === "empty" ? (
          <span aria-hidden="true" className="text-2xl leading-none text-slate-500">
            +
          </span>
        ) : previewState === "broken" ? (
          <span className="px-3 text-center text-xs font-medium text-slate-500">Missing image</span>
        ) : (
          <img
            alt={`${label} preview`}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={() => setPreviewFailed(true)}
            src={previewHref ?? ""}
          />
        )}
        <input
          accept={IMAGE_UPLOAD_ACCEPT}
          aria-label={`Upload ${label}`}
          className="sr-only"
          disabled={uploadDisabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];

            event.currentTarget.value = "";
            onFileSelect(file);
          }}
          type="file"
        />
      </label>
      {mediaEditorMode === "asset" ? (
        <NativeSelect>
          <NativeSelectContent
            aria-label={assetLabel}
            className={density === "compact" ? compactNativeSelectClassName : undefined}
            disabled={controlDisabled}
            isInvalid={invalid}
            onChange={(event) => {
              const value = event.currentTarget.value;

              onDraftChange(value);
              onMediaAssetSelect(value);
            }}
            value={draft}
          >
            {!required || draft === "" ? <option value="" /> : null}
            {unknownAssetSelected ? <option value={draft}>Current asset: {draft}</option> : null}
            {mediaAssetOptions.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.label}
              </option>
            ))}
          </NativeSelectContent>
        </NativeSelect>
      ) : null}
      <Input
        aria-invalid={invalid ? true : undefined}
        aria-label={inputLabel}
        className={
          density === "compact"
            ? compactNativeInputClassName
            : "w-full rounded border border-slate-300 px-3 py-2"
        }
        disabled={controlDisabled}
        onBlur={(event) => onUrlBlur(event.currentTarget.value)}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={handleUrlKeyDown}
        placeholder={inputLabel}
        required={required}
        type="text"
        value={draft}
      />
    </div>
  );
}

function mediaAssetLabel(label: string) {
  return label.toLowerCase().includes("asset") ? label : `${label} asset`;
}
