import * as stylex from "@stylexjs/stylex";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import type {
  FormlessUiEnumOption,
  FormlessUiField,
  FormlessUiFieldOptions,
  FormlessUiMediaAssetOption,
} from "../../formless-ui-contract.ts";
import { SourceIcon } from "../field-primitives.tsx";
import {
  editorFieldValue,
  formatInputValue,
  isRecordEditorField,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export type SelectorVisualOption = {
  color?: string;
  detail?: string;
  isMissing?: boolean;
  label: string;
  source?: string;
  value: string;
};

export function selectorVisualOptions(field: FormlessUiEditorField): SelectorVisualOption[] {
  if (field.control.kind === "enum") {
    return (field.options?.enumOptions ?? []).map(enumOptionToSelectorVisualOption);
  }

  if (field.control.kind === "reference") {
    return (field.options?.referenceOptions ?? []).map((option) => ({
      detail: option.missing ? "Missing value" : undefined,
      isMissing: option.missing,
      label: option.label,
      value: option.id,
    }));
  }

  return [];
}

export function enumOptionForValue(
  options: FormlessUiFieldOptions | undefined,
  value: string,
): SelectorVisualOption | undefined {
  return options?.enumOptions
    ?.map(enumOptionToSelectorVisualOption)
    .find((option) => option.value === value);
}

export function enumOptionToSelectorVisualOption(
  option: FormlessUiEnumOption,
): SelectorVisualOption {
  return {
    color: enumOptionColor(option),
    isMissing: option.missing,
    label: option.label,
    source: option.presentation.icon?.source,
    value: option.value,
  };
}

export function mediaPickerOptions(options: FormlessUiFieldOptions | undefined) {
  return (options?.mediaAssetOptions ?? []).map((option) => ({
    detail: option.href,
    label: option.label,
    mediaAlt: option.label,
    mediaPreviewUrl: option.href,
    value: option.id,
  }));
}

export function selectedMediaAsset(field: FormlessUiField): FormlessUiMediaAssetOption | undefined {
  const value =
    field.mode === "display"
      ? formatInputValue(field.value)
      : formatInputValue(editorFieldValue(field));

  return field.options?.mediaAssetOptions?.find((option) => option.id === value);
}

export function mediaPreviewHref(field: FormlessUiField) {
  if (isRecordEditorField(field)) {
    return field.media?.mediaPreviewHref ?? selectedMediaAsset(field)?.href;
  }

  return selectedMediaAsset(field)?.href;
}

export function enumOptionColor(option: FormlessUiEnumOption) {
  if (option.presentation.color.token?.startsWith("#")) {
    return option.presentation.color.token;
  }

  if (option.presentation.color.intent === "success") {
    return colorVars["--color-success"];
  }

  if (option.presentation.color.intent === "warning") {
    return colorVars["--color-warning"];
  }

  if (option.presentation.color.intent === "danger") {
    return colorVars["--color-error"];
  }

  return undefined;
}

export function enumPresentationTriggerContent(field: FormlessUiField): "icon" | "label" | "both" {
  return field.presentation?.trigger ?? (field.presentation?.mode === "iconOnly" ? "icon" : "both");
}

export function enumPresentationListContent(field: FormlessUiField): "icon" | "label" | "both" {
  return field.presentation?.list ?? "both";
}

export function selectorOptionVisual(
  option: SelectorVisualOption | undefined,
  { reserveSpace = false }: { reserveSpace?: boolean } = {},
) {
  if (!option) {
    return reserveSpace ? (
      <span aria-hidden="true" {...stylex.props(styles.optionVisualSpacer)} />
    ) : undefined;
  }

  if (option.source) {
    return option.color ? (
      <span {...stylex.props(dynamicStyles.color(option.color))}>
        <SourceIcon source={option.source} size="sm" color="inherit" aria-hidden />
      </span>
    ) : (
      <SourceIcon source={option.source} size="sm" color="secondary" aria-hidden />
    );
  }

  if (option.color) {
    return (
      <span
        aria-hidden="true"
        {...stylex.props(styles.optionColorSwatch, dynamicStyles.colorSwatch(option.color))}
      />
    );
  }

  return reserveSpace ? (
    <span aria-hidden="true" {...stylex.props(styles.optionVisualSpacer)} />
  ) : undefined;
}

export function hasSelectorOptionVisual(option: SelectorVisualOption) {
  return Boolean(option.source || option.color);
}

const styles = stylex.create({
  optionColorSwatch: {
    boxSizing: "border-box",
    flexShrink: 0,
    width: spacingVars["--spacing-4"],
    height: spacingVars["--spacing-4"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border-emphasized"],
    borderRadius: radiusVars["--radius-full"],
  },
  optionVisualSpacer: {
    flexShrink: 0,
    width: spacingVars["--spacing-4"],
    height: spacingVars["--spacing-4"],
  },
});

const dynamicStyles = stylex.create({
  color: (color: string) => ({
    color,
  }),
  colorSwatch: (color: string) => ({
    backgroundColor: color,
  }),
});
