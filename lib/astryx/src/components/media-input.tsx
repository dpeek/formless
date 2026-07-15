import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { FileInput } from "@astryxdesign/core";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import { Grid } from "@astryxdesign/core/Grid";
import { Popover } from "@astryxdesign/core/Popover";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { borderVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { AstryxInputDensity } from "./input-density.ts";

export type MediaInputOption = {
  isDisabled?: boolean;
  label: string;
  previewUrl: string;
  value: string;
};

export type MediaInputProps = {
  label: string;
  value: string;
  accept?: string;
  density?: AstryxInputDensity;
  description?: string;
  id?: string;
  isDisabled?: boolean;
  isLabelHidden?: boolean;
  isLoading?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  labelTooltip?: string;
  maxSize?: number;
  options?: readonly MediaInputOption[];
  previewUrl?: string;
  status?: FieldStatusInput;
  width?: number | string;
  onSelectOption?: (value: string) => void;
  onUploadFile?: (file: File) => void;
};

export function MediaInput({
  accept = "image/*",
  density = "balanced",
  description,
  id,
  isDisabled = false,
  isLabelHidden = false,
  isLoading = false,
  isReadOnly = false,
  isRequired = false,
  label,
  labelTooltip,
  maxSize,
  onSelectOption,
  onUploadFile,
  options = [],
  previewUrl,
  status,
  value,
  width,
}: MediaInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const isPickerDisabled = isDisabled || isReadOnly || isLoading;
  const hasValue = value.trim() !== "";
  const hasPreview = hasValue && previewUrl?.trim() !== "";
  const canUpload = Boolean(onUploadFile) && !isPickerDisabled;
  const canPick = options.length > 0 && Boolean(onSelectOption) && !isPickerDisabled;
  const canOpen = canUpload || canPick;
  const trigger = (
    <Thumbnail
      id={inputId}
      alt={label}
      src={hasPreview ? previewUrl : undefined}
      isDisabled={isPickerDisabled}
      isLoading={isLoading}
      onClick={canOpen ? () => undefined : undefined}
      onRemove={
        hasValue && !isRequired && !isPickerDisabled && onSelectOption
          ? () => onSelectOption("")
          : undefined
      }
      xstyle={thumbnailSizeStyle(density)}
    />
  );

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputId}
      isRequired={isRequired}
      isDisabled={isDisabled || isReadOnly}
      labelTooltip={labelTooltip}
      status={status}
      width={width}
    >
      {canOpen ? (
        <Popover
          label={`${label} media library`}
          placement="below"
          alignment="start"
          width="min(360px, calc(100vw - 64px))"
          xstyle={styles.libraryPopover}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          content={
            <MediaLibrary
              accept={accept}
              fieldLabel={label}
              isRequired={isRequired}
              maxSize={maxSize}
              options={canPick ? options : []}
              selectedValue={value}
              onSelect={(nextValue) => {
                onSelectOption?.(nextValue);
                setIsOpen(false);
              }}
              onUpload={
                canUpload
                  ? (file) => {
                      onUploadFile?.(file);
                      setIsOpen(false);
                    }
                  : undefined
              }
            />
          }
        >
          {trigger}
        </Popover>
      ) : (
        trigger
      )}
    </Field>
  );
}

export function MediaValueDisplay({
  density = "balanced",
  label,
  previewUrl,
  value,
}: {
  density?: AstryxInputDensity;
  label: string;
  previewUrl?: string;
  value: string;
}) {
  const hasPreview = value.trim() !== "" && previewUrl?.trim() !== "";

  return (
    <Thumbnail
      alt={label}
      src={hasPreview ? previewUrl : undefined}
      xstyle={thumbnailSizeStyle(density)}
    />
  );
}

function MediaLibrary({
  accept,
  fieldLabel,
  isRequired,
  maxSize,
  onSelect,
  onUpload,
  options,
  selectedValue,
}: {
  accept: string;
  fieldLabel: string;
  isRequired: boolean;
  maxSize?: number;
  options: readonly MediaInputOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onUpload?: (file: File) => void;
}) {
  return (
    <Grid columns={{ minWidth: 72, max: 4, repeat: "fit" }} gap={2} xstyle={styles.libraryGrid}>
      {onUpload === undefined ? null : (
        <FileInput
          accept={accept}
          isLabelHidden
          label={`Upload ${fieldLabel}`}
          maxSize={maxSize}
          mode="dropzone"
          placeholder="Upload"
          value={null}
          width="100%"
          xstyle={styles.uploadTile}
          onChange={(file) => {
            if (file instanceof File) {
              onUpload(file);
            }
          }}
        />
      )}
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        const accessibilityLabel = option.label;

        return (
          <SelectableCard
            key={option.value}
            label={accessibilityLabel}
            isDisabled={option.isDisabled}
            isSelected={isSelected}
            padding={0.5}
            variant="transparent"
            xstyle={styles.libraryCard}
            onChange={(nextSelected) => {
              if (nextSelected) {
                onSelect(option.value);
              } else if (!isRequired) {
                onSelect("");
              }
            }}
          >
            <Thumbnail
              alt={accessibilityLabel}
              isDisabled={option.isDisabled}
              src={option.previewUrl}
              xstyle={styles.libraryThumbnail}
            />
          </SelectableCard>
        );
      })}
    </Grid>
  );
}

function thumbnailSizeStyle(density: AstryxInputDensity) {
  if (density === "compact") {
    return styles.compactThumbnail;
  }

  if (density === "comfortable") {
    return styles.comfortableThumbnail;
  }

  return undefined;
}

const styles = stylex.create({
  compactThumbnail: {
    width: 48,
  },
  comfortableThumbnail: {
    width: 96,
  },
  libraryThumbnail: {
    display: "flex",
    width: "100%",
  },
  libraryCard: {
    borderRadius: `calc(${radiusVars["--radius-element"]} + ${spacingVars["--spacing-0-5"]} + ${borderVars["--border-width"]})`,
  },
  libraryPopover: {
    borderRadius: radiusVars["--radius-container"],
    overflow: "hidden",
    padding: 0,
  },
  libraryGrid: {
    boxSizing: "border-box",
    maxHeight: "min(300px, 50dvh)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: spacingVars["--spacing-3"],
    scrollbarGutter: "stable",
    width: "100%",
  },
  uploadTile: {
    aspectRatio: "1",
    backgroundColor: "transparent",
    borderRadius: `calc(${radiusVars["--radius-element"]} + ${spacingVars["--spacing-0-5"]} + ${borderVars["--border-width"]})`,
    gap: spacingVars["--spacing-1"],
    paddingBlock: spacingVars["--spacing-1"],
    paddingInline: spacingVars["--spacing-1"],
    width: "100%",
  },
});
