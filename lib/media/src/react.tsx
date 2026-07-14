import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import { useEffect, useState } from "react";

import { IMAGE_UPLOAD_ACCEPT, type ImageMediaAssetOption } from "./client.ts";

export type { ImageMediaAssetOption } from "./client.ts";

export type MediaFieldControlDensity = "default" | "compact";

export type MediaFieldControlProps = {
  controlDisabled: boolean;
  density: MediaFieldControlDensity;
  draft: string;
  invalid: boolean;
  label: string;
  mediaAssetOptions: ImageMediaAssetOption[];
  mediaPreviewHref?: string;
  onFileSelect: (file: File | undefined) => void;
  onMediaAssetSelect: (assetId: string) => void;
  required: boolean;
  uploadDisabled: boolean;
};

const compactNativeSelectClassName =
  "h-6 py-0.5 pe-6 ps-2 text-xs/4 sm:py-0.5 sm:pe-6 sm:ps-2 sm:pr-6 sm:pl-2 sm:text-xs/4 md:text-xs/4";

export function MediaFieldControl({
  controlDisabled,
  density,
  draft,
  invalid,
  mediaAssetOptions,
  mediaPreviewHref,
  label,
  onFileSelect,
  onMediaAssetSelect,
  required,
  uploadDisabled,
}: MediaFieldControlProps) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewHref = mediaPreviewHref;
  const previewState =
    draft === "" ? "empty" : previewHref === undefined || previewFailed ? "broken" : "image";
  const assetLabel = mediaAssetLabel(label);
  const unknownAssetSelected =
    draft !== "" && !mediaAssetOptions.some((asset) => asset.id === draft);
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

  return (
    <div
      className={density === "compact" ? "w-full min-w-0 space-y-2" : "w-full min-w-0 space-y-3"}
      data-slot="control"
      data-web-field-kind="media"
    >
      <label
        className={previewClassName}
        data-web-media-field-preview={previewState}
        data-web-media-field-upload="trigger"
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
      <NativeSelect>
        <NativeSelectContent
          aria-label={assetLabel}
          className={density === "compact" ? compactNativeSelectClassName : undefined}
          disabled={controlDisabled}
          isInvalid={invalid}
          onChange={(event) => onMediaAssetSelect(event.currentTarget.value)}
          value={draft}
        >
          {!required || draft === "" ? <option value="">Unset</option> : null}
          {unknownAssetSelected ? (
            <option value={draft}>
              {previewHref === undefined ? "Missing image" : "Current image"}
            </option>
          ) : null}
          {mediaAssetOptions.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.label}
            </option>
          ))}
        </NativeSelectContent>
      </NativeSelect>
    </div>
  );
}

function mediaAssetLabel(label: string) {
  return label.toLowerCase().includes("asset") ? label : `${label} asset`;
}
