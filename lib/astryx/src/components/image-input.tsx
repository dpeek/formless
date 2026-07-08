import { useId, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import { Icon } from "@astryxdesign/core/Icon";
import { Popover } from "@astryxdesign/core/Popover";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { ArrowUpTrayIcon, PhotoIcon } from "@heroicons/react/24/outline";
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import type { AstryxFieldDensity, AstryxFieldOption } from "../field-contract.ts";

export type ImageInputProps = {
  id?: string;
  label: string;
  value: string;
  accept?: string;
  alt?: string;
  density?: AstryxFieldDensity;
  description?: string;
  isDisabled?: boolean;
  isLabelHidden?: boolean;
  isLoading?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  labelTooltip?: string;
  options?: readonly AstryxFieldOption[];
  previewUrl?: string;
  status?: FieldStatusInput;
  width?: number | string;
  onSelectOption?: (option: AstryxFieldOption) => void;
  onUploadFile?: (file: File) => void;
};

export function ImageInput({
  id,
  label,
  value,
  accept = "image/*",
  alt,
  density = "balanced",
  description,
  isDisabled = false,
  isLabelHidden = false,
  isLoading = false,
  isReadOnly = false,
  isRequired = false,
  labelTooltip,
  options = [],
  previewUrl,
  status,
  width,
  onSelectOption,
  onUploadFile,
}: ImageInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const isPickerDisabled = isDisabled || isReadOnly || isLoading;
  const hasPreview = value.trim() !== "" && previewUrl?.trim();
  const canUpload = Boolean(onUploadFile) && !isPickerDisabled;
  const canPick = options.length > 0 && Boolean(onSelectOption) && !isPickerDisabled;

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
      <Popover
        label={`${label} image options`}
        placement="below"
        alignment="start"
        width="min(360px, calc(100vw - 64px))"
        isEnabled={!isPickerDisabled}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        content={
          <ImageInputPopoverContent
            accept={accept}
            canPick={canPick}
            canUpload={canUpload}
            label={label}
            options={options}
            selectedValue={value}
            onSelectOption={(option) => {
              onSelectOption?.(option);
              setIsOpen(false);
            }}
            onUploadFile={(file) => {
              onUploadFile?.(file);
              setIsOpen(false);
            }}
          />
        }
      >
        {(triggerProps) => (
          <button
            {...triggerProps}
            id={inputId}
            type="button"
            disabled={isPickerDisabled}
            data-astryx-image-input="true"
            {...stylex.props(
              styles.trigger,
              density === "compact" && styles.compactTrigger,
              density === "comfortable" && styles.comfortableTrigger,
              isPickerDisabled && styles.disabledTrigger,
              status?.type === "error" && styles.errorTrigger,
            )}
          >
            <ImagePreviewFrame
              alt={alt ?? label}
              hasPreview={Boolean(hasPreview)}
              isLoading={isLoading}
              previewUrl={hasPreview ? previewUrl : undefined}
            />
          </button>
        )}
      </Popover>
    </Field>
  );
}

export function ImageValueDisplay({
  alt,
  density = "balanced",
  label,
  previewUrl,
  value,
}: {
  alt?: string;
  density?: AstryxFieldDensity;
  label: string;
  previewUrl?: string;
  value: string;
}) {
  const hasPreview = value.trim() !== "" && previewUrl?.trim();

  return (
    <div
      data-astryx-image-display="true"
      {...stylex.props(
        styles.display,
        density === "compact" && styles.compactDisplay,
        density === "comfortable" && styles.comfortableDisplay,
      )}
    >
      <ImagePreviewFrame
        alt={alt ?? label}
        hasPreview={Boolean(hasPreview)}
        previewUrl={hasPreview ? previewUrl : undefined}
      />
    </div>
  );
}

function ImageInputPopoverContent({
  accept,
  canPick,
  canUpload,
  label,
  options,
  selectedValue,
  onSelectOption,
  onUploadFile,
}: {
  accept: string;
  canPick: boolean;
  canUpload: boolean;
  label: string;
  options: readonly AstryxFieldOption[];
  selectedValue: string;
  onSelectOption: (option: AstryxFieldOption) => void;
  onUploadFile: (file: File) => void;
}) {
  return (
    <div {...stylex.props(styles.popoverContent)}>
      <div {...stylex.props(styles.optionGrid)}>
        {canUpload ? (
          <ImageUploadButton accept={accept} label={label} onUploadFile={onUploadFile} />
        ) : null}
        {canPick
          ? options.map((option) => (
              <ImageOptionButton
                key={option.value}
                label={label}
                option={option}
                isSelected={option.value === selectedValue}
                onSelect={() => onSelectOption(option)}
              />
            ))
          : null}
      </div>
    </div>
  );
}

function ImageUploadButton({
  accept,
  label,
  onUploadFile,
}: {
  accept: string;
  label: string;
  onUploadFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        aria-label={`Choose image for ${label}`}
        onClick={() => inputRef.current?.click()}
        {...stylex.props(styles.optionButton)}
      >
        <span {...stylex.props(styles.uploadTile)}>
          <Icon icon={ArrowUpTrayIcon} size="md" color="secondary" />
          <Text type="supporting" color="secondary" maxLines={2}>
            Choose image
          </Text>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";

          if (file) {
            onUploadFile(file);
          }
        }}
        {...stylex.props(styles.hiddenFileInput)}
      />
    </>
  );
}

function ImageOptionButton({
  label,
  option,
  isSelected,
  onSelect,
}: {
  label: string;
  option: AstryxFieldOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasPreview = option.mediaPreviewUrl?.trim();

  return (
    <button
      type="button"
      aria-label={`Choose ${option.label} for ${label}`}
      aria-pressed={isSelected}
      disabled={option.isDisabled}
      onClick={onSelect}
      {...stylex.props(
        styles.optionButton,
        isSelected && styles.selectedOptionButton,
        option.isDisabled && styles.disabledTrigger,
      )}
    >
      <AspectRatio ratio={4 / 3}>
        <ImagePreviewFrame
          alt={option.mediaAlt ?? option.label}
          hasPreview={Boolean(hasPreview)}
          previewUrl={hasPreview ? option.mediaPreviewUrl : undefined}
        />
      </AspectRatio>
    </button>
  );
}

function ImagePreviewFrame({
  alt,
  hasPreview,
  isLoading = false,
  previewUrl,
}: {
  alt: string;
  hasPreview: boolean;
  isLoading?: boolean;
  previewUrl?: string;
}) {
  return (
    <span {...stylex.props(styles.previewFrame, !hasPreview && styles.emptyPreviewFrame)}>
      {hasPreview && previewUrl ? (
        <img alt={alt} src={previewUrl} {...stylex.props(styles.previewImage)} />
      ) : (
        <span {...stylex.props(styles.emptyState)}>
          <Icon icon={PhotoIcon} size="md" color="secondary" />
          <Text type="supporting" color="secondary" maxLines={1}>
            Empty
          </Text>
        </span>
      )}
      {isLoading ? (
        <span aria-hidden {...stylex.props(styles.loadingOverlay)}>
          <Spinner size="sm" />
        </span>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  trigger: {
    boxSizing: "border-box",
    display: "inline-flex",
    position: "relative",
    "--_image-input-state-width": "2px",
    width: 144,
    height: 72,
    minWidth: 0,
    padding: "var(--_image-input-state-width)",
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: {
      default: colorVars["--color-border-emphasized"],
      ":focus-visible": colorVars["--color-accent"],
    },
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-surface"],
    cursor: "pointer",
    overflow: "hidden",
    outline: "none",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: {
      default: durationVars["--duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: easeVars["--ease-standard"],
    boxShadow: {
      default: "none",
      ":hover": {
        "@media (hover: hover)": `inset 0 0 0 var(--_image-input-state-width) color-mix(in srgb, ${colorVars["--color-border-emphasized"]} 30%, transparent)`,
      },
      ":focus-visible": `inset 0 0 0 var(--_image-input-state-width) ${colorVars["--color-accent-muted"]}`,
    },
  },
  compactTrigger: {
    width: 96,
    height: 48,
  },
  comfortableTrigger: {
    width: 192,
    height: 96,
  },
  disabledTrigger: {
    cursor: "not-allowed",
    opacity: 0.55,
  },
  errorTrigger: {
    borderColor: colorVars["--color-error"],
  },
  display: {
    boxSizing: "border-box",
    "--_image-input-state-width": "2px",
    width: 144,
    height: 72,
    padding: "var(--_image-input-state-width)",
    overflow: "hidden",
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border-emphasized"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-surface"],
  },
  compactDisplay: {
    width: 96,
    height: 48,
  },
  comfortableDisplay: {
    width: 192,
    height: 96,
  },
  popoverContent: {
    minWidth: 0,
  },
  optionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: spacingVars["--spacing-2"],
  },
  optionButton: {
    boxSizing: "border-box",
    display: "block",
    "--_image-input-state-width": "2px",
    minWidth: 0,
    padding: "var(--_image-input-state-width)",
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: {
      default: colorVars["--color-border-emphasized"],
      ":focus-visible": colorVars["--color-accent"],
    },
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-surface"],
    color: colorVars["--color-text-primary"],
    cursor: "pointer",
    outline: "none",
    overflow: "hidden",
    boxShadow: {
      default: "none",
      ":hover": {
        "@media (hover: hover)": `inset 0 0 0 var(--_image-input-state-width) color-mix(in srgb, ${colorVars["--color-border-emphasized"]} 30%, transparent)`,
      },
      ":focus-visible": `inset 0 0 0 var(--_image-input-state-width) ${colorVars["--color-accent-muted"]}`,
    },
  },
  selectedOptionButton: {
    borderColor: colorVars["--color-accent"],
    boxShadow: `inset 0 0 0 var(--_image-input-state-width) ${colorVars["--color-accent-muted"]}`,
  },
  previewFrame: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: `calc(${radiusVars["--radius-element"]} - var(--_image-input-state-width))`,
    backgroundColor: colorVars["--color-background-muted"],
  },
  emptyPreviewFrame: {
    backgroundImage: `linear-gradient(135deg, transparent 0 48%, ${colorVars["--color-border"]} 48% 52%, transparent 52% 100%)`,
  },
  previewImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: spacingVars["--spacing-1"],
    minWidth: 0,
    padding: spacingVars["--spacing-2"],
  },
  uploadTile: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: spacingVars["--spacing-1"],
    width: "100%",
    aspectRatio: "4 / 3",
    minWidth: 0,
    padding: spacingVars["--spacing-2"],
    borderRadius: `calc(${radiusVars["--radius-element"]} - var(--_image-input-state-width))`,
    backgroundColor: colorVars["--color-background-muted"],
  },
  hiddenFileInput: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    pointerEvents: "none",
  },
});
