import { useEffect, useId, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import { Icon } from "@astryxdesign/core/Icon";
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  sizeVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import type { AstryxInputDensity } from "./input-density.ts";

const nativeColorFallback = "#000000";

export type ColorInputProps = {
  id?: string;
  label: string;
  value: string;
  description?: string;
  placeholder?: string;
  pickerLabel?: string;
  density?: AstryxInputDensity;
  isDisabled?: boolean;
  isLabelHidden?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  labelTooltip?: string;
  status?: FieldStatusInput;
  width?: number | string;
  "aria-describedby"?: string;
  onChange?: (
    value: string,
    event?: ChangeEvent<HTMLInputElement> | MouseEvent<HTMLButtonElement>,
  ) => void;
};

export function ColorInput({
  id,
  label,
  value,
  description,
  pickerLabel = "Choose color",
  density = "balanced",
  isDisabled = false,
  isLabelHidden = false,
  isReadOnly = false,
  isRequired = false,
  labelTooltip,
  status,
  width,
  "aria-describedby": ariaDescribedBy,
  onChange,
}: ColorInputProps) {
  const generatedId = useId();
  const nativeColorInputRef = useRef<HTMLInputElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const inputId = id ?? generatedId;
  const pickerValue = opaqueHexColorForNativeInput(value);
  const isCompact = density === "compact";
  const isComfortable = density === "comfortable";
  const isPickerDisabled = isDisabled || isReadOnly;
  const canClear = !isRequired && !isPickerDisabled && value.trim() !== "";
  const describedBy =
    [
      description ? `${inputId}-desc` : null,
      status?.message ? (status.messageID ?? `${inputId}-status`) : null,
      ariaDescribedBy,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  useEffect(() => {
    const nativeColorInput = nativeColorInputRef.current;

    if (!nativeColorInput) {
      return;
    }

    const handleNativeChange = () => setIsPickerOpen(false);

    nativeColorInput.addEventListener("change", handleNativeChange);

    return () => nativeColorInput.removeEventListener("change", handleNativeChange);
  }, []);

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputId}
      isRequired={isRequired}
      isDisabled={isDisabled}
      labelTooltip={labelTooltip}
      status={status}
      width={width}
    >
      <div
        {...stylex.props(
          styles.colorInput,
          isCompact && styles.compactColorInput,
          isDisabled && styles.disabledControl,
        )}
        data-astryx-color-input="true"
        data-astryx-color-picker-open={isPickerOpen ? "true" : "false"}
        data-astryx-color-picker-valid={pickerValue ? "true" : "false"}
      >
        <span
          {...stylex.props(
            styles.nativeColorInputContainer,
            isCompact && styles.compactNativeColorInputContainer,
            isComfortable && styles.comfortableNativeColorInputContainer,
            !pickerValue && styles.emptyNativeColorInputContainer,
            isPickerOpen && styles.openNativeColorInputContainer,
          )}
        >
          {!pickerValue ? <span aria-hidden {...stylex.props(styles.emptyColorInputMark)} /> : null}
          <span
            onPointerDown={(event) => {
              if (event.button !== 0 || event.target !== event.currentTarget || isPickerDisabled) {
                return;
              }

              const nativeColorInput = nativeColorInputRef.current;

              if (!nativeColorInput) {
                return;
              }

              event.preventDefault();
              setIsPickerOpen(true);
              nativeColorInput.focus();
              nativeColorInput.showPicker();
            }}
            {...stylex.props(styles.nativeColorInputContainerHitArea)}
          />
          <span {...stylex.props(styles.nativeColorInputSwatchClip)}>
            <input
              id={inputId}
              ref={nativeColorInputRef}
              aria-describedby={describedBy}
              aria-invalid={status?.type === "error" ? "true" : undefined}
              aria-label={pickerLabel}
              aria-required={isRequired ? "true" : undefined}
              disabled={isPickerDisabled}
              type="color"
              value={pickerValue ?? nativeColorFallback}
              onBlur={() => setIsPickerOpen(false)}
              onChange={(event) => onChange?.(event.currentTarget.value, event)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  setIsPickerOpen(true);
                }
              }}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  setIsPickerOpen(true);
                }
              }}
              {...stylex.props(
                styles.nativeColorInput,
                !pickerValue && styles.emptyNativeColorInput,
              )}
            />
          </span>
          <span
            aria-hidden
            data-astryx-color-input-overlay="true"
            {...stylex.props(styles.colorInputOverlay)}
          />
          {canClear ? (
            <button
              aria-label={`Clear ${label}`}
              type="button"
              onClick={(event) => {
                setIsPickerOpen(false);
                onChange?.("", event);
              }}
              {...stylex.props(styles.colorClearButton)}
            >
              <Icon icon="close" size="sm" color="secondary" />
            </button>
          ) : null}
        </span>
      </div>
    </Field>
  );
}

export function opaqueHexColorForNativeInput(value: string) {
  const trimmedValue = value.trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  if (/^#[0-9A-Fa-f]{3}$/.test(trimmedValue)) {
    const [, red, green, blue] = trimmedValue;
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }

  return null;
}

const styles = stylex.create({
  colorInput: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
    minWidth: 0,
  },
  compactColorInput: {
    gap: spacingVars["--spacing-1"],
  },
  disabledControl: {
    opacity: 0.5,
  },
  nativeColorInputContainer: {
    boxSizing: "border-box",
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
    aspectRatio: "2 / 1",
    height: sizeVars["--size-element-md"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: {
      default: colorVars["--color-border-emphasized"],
      ":focus-within": colorVars["--color-accent"],
    },
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-surface"],
    "--_color-input-overlay-shadow": {
      default: "none",
      ":hover:not(:focus-within)": {
        "@media (hover: hover)": `inset 0px 0px 0px var(--_color-input-state-width) color-mix(in srgb, ${colorVars["--color-border-emphasized"]} 30%, transparent)`,
      },
      ":focus-within": `inset 0px 0px 0px var(--_color-input-state-width) ${colorVars["--color-accent-muted"]}`,
    },
    "--_color-input-state-width": "2px",
    cursor: "pointer",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: {
      default: durationVars["--duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: easeVars["--ease-standard"],
  },
  compactNativeColorInputContainer: {
    height: sizeVars["--size-element-sm"],
  },
  comfortableNativeColorInputContainer: {
    height: sizeVars["--size-element-lg"],
  },
  nativeColorInput: {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    bottom: "-8px",
    left: "-8px",
    width: "calc(100% + 16px)",
    height: "calc(100% + 16px)",
    padding: 0,
    borderWidth: 0,
    borderStyle: "none",
    appearance: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    "::-webkit-color-swatch-wrapper": {
      padding: 0,
    },
    "::-webkit-color-swatch": {
      borderWidth: 0,
      borderStyle: "none",
    },
    "::-moz-color-swatch": {
      borderWidth: 0,
      borderStyle: "none",
    },
  },
  nativeColorInputContainerHitArea: {
    position: "absolute",
    inset: 0,
    cursor: "pointer",
  },
  nativeColorInputSwatchClip: {
    position: "absolute",
    inset: "var(--_color-input-state-width)",
    overflow: "hidden",
    borderRadius: `calc(${radiusVars["--radius-element"]} - var(--_color-input-state-width))`,
  },
  emptyNativeColorInputContainer: {
    backgroundColor: colorVars["--color-background-surface"],
  },
  openNativeColorInputContainer: {
    borderColor: colorVars["--color-border-emphasized"],
    "--_color-input-overlay-shadow": "none",
  },
  emptyNativeColorInput: {
    opacity: 0,
  },
  emptyColorInputMark: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "140%",
    height: borderVars["--border-width"],
    backgroundColor: colorVars["--color-border-emphasized"],
    transform: "translate(-50%, -50%) rotate(-45deg)",
    pointerEvents: "none",
  },
  colorInputOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderRadius: "inherit",
    boxShadow: "var(--_color-input-overlay-shadow)",
    pointerEvents: "none",
  },
  colorClearButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: spacingVars["--spacing-1"],
    right: spacingVars["--spacing-1"],
    zIndex: 2,
    width: spacingVars["--spacing-5"],
    height: spacingVars["--spacing-5"],
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    filter: "drop-shadow(0px 1px 1px rgba(0, 0, 0, 0.8))",
    outline: {
      default: "none",
      ":focus-visible": `${borderVars["--border-width"]} solid ${colorVars["--color-accent"]}`,
    },
    outlineOffset: 1,
  },
});
