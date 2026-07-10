import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Selector, SelectorOption, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { FieldStatusInput } from "@astryxdesign/core/Field";
import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import {
  astryxDensity,
  editorFieldValue,
  emitFieldDraftChange,
  emitImmediateRecordFieldCommit,
  fieldChromeStyles,
  fieldDescription,
  fieldInteractionIsDisabled,
  fieldLabelIsHidden,
  fieldStatus,
  formatInputValue,
  inputSize,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";
import {
  enumOptionForValue,
  enumPresentationListContent,
  enumPresentationTriggerContent,
  hasSelectorOptionVisual,
  selectorOptionVisual,
  selectorVisualOptions,
  type SelectorVisualOption,
} from "./field-options.tsx";

export function EnumFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  return <SelectorFieldEditor field={field} onIntent={onIntent} />;
}

export function SelectorFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));
  const visualOptions = selectorVisualOptions(field);
  const optionsByValue = new Map(visualOptions.map((option) => [option.value, option]));
  const options = visualOptions.map((option) => ({
    disabled: false,
    label: option.label,
    value: option.value,
  }));
  const usesEnumOptionVisuals = field.control.kind === "enum";
  const enumTriggerContent = enumPresentationTriggerContent(field);
  const enumListContent = enumPresentationListContent(field);
  const selectedOption = optionsByValue.get(value);
  const hasEnumOptionVisuals =
    usesEnumOptionVisuals && visualOptions.some((option) => hasSelectorOptionVisual(option));
  const startIcon =
    usesEnumOptionVisuals &&
    (enumTriggerContent === "icon" || enumTriggerContent === "both") &&
    selectedOption
      ? selectorOptionVisual(selectedOption)
      : undefined;
  const sharedProps = {
    label: field.label,
    isLabelHidden: fieldLabelIsHidden(field),
    description: fieldDescription(field),
    isRequired: field.required,
    isDisabled: fieldInteractionIsDisabled(field),
    isLoading: Boolean(field.pending?.isPending),
    options,
    placeholder: field.options?.unknownEnumValue ?? "Select",
    renderOption: (option: SelectorOptionData) => (
      <RichSelectorOption
        enumListContent={enumListContent}
        fallback={option}
        hasEnumOptionVisuals={hasEnumOptionVisuals}
        option={optionsByValue.get(option.value)}
        usesEnumOptionVisuals={usesEnumOptionVisuals}
      />
    ),
    size: inputSize(field),
    startIcon,
    status: fieldStatus(field) ?? invalidEnumFieldStatus(field, value),
    width: "100%",
  };

  if (field.required) {
    return (
      <Selector
        {...sharedProps}
        value={value || undefined}
        onChange={(nextValue) => {
          emitFieldDraftChange(field, nextValue, onIntent);
          emitImmediateRecordFieldCommit(field, nextValue, onIntent);
        }}
      />
    );
  }

  return (
    <Selector
      {...sharedProps}
      hasClear
      value={value || null}
      onChange={(nextValue) => {
        const value = nextValue ?? "";

        emitFieldDraftChange(field, value, onIntent);
        emitImmediateRecordFieldCommit(field, value, onIntent);
      }}
    />
  );
}

export function EnumFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  const value = formatInputValue(field.value);
  const option = enumOptionForValue(field.options, value);
  const content = enumPresentationTriggerContent(field);
  const showVisual = content !== "label" && option !== undefined && hasSelectorOptionVisual(option);
  const showLabel = content !== "icon" || !showVisual || option?.isMissing;
  const label = option?.label ?? field.formatting.displayValue ?? value;

  return (
    <div
      data-astryx-field-presentation-mode={field.presentation?.mode}
      data-astryx-field-presentation-trigger={field.presentation?.trigger}
      {...stylex.props(fieldChromeStyles.displayValue, styles.enumDisplayValue)}
    >
      {showVisual ? selectorOptionVisual(option) : null}
      {showLabel ? (
        <Text type={astryxDensity(field) === "compact" ? "supporting" : "body"} maxLines={2}>
          {label || "Empty"}
        </Text>
      ) : null}
      {option?.isMissing ? <Badge label="Missing" variant="warning" /> : null}
    </div>
  );
}

function RichSelectorOption({
  enumListContent,
  fallback,
  hasEnumOptionVisuals,
  option,
  usesEnumOptionVisuals,
}: {
  enumListContent: "icon" | "label" | "both";
  fallback: SelectorOptionData;
  hasEnumOptionVisuals: boolean;
  option: SelectorVisualOption | undefined;
  usesEnumOptionVisuals: boolean;
}) {
  const label = option?.label ?? fallback.label ?? fallback.value;
  const showEnumVisual = usesEnumOptionVisuals && enumListContent !== "label";
  const showEnumLabel =
    !usesEnumOptionVisuals ||
    enumListContent !== "icon" ||
    !option ||
    !hasSelectorOptionVisual(option) ||
    option.isMissing;

  return (
    <SelectorOption
      icon={
        showEnumVisual
          ? selectorOptionVisual(option, { reserveSpace: hasEnumOptionVisuals })
          : undefined
      }
      label={showEnumLabel ? label : ""}
      description={option?.detail ?? (option?.isMissing ? "Missing value" : undefined)}
      endContent={option?.isMissing ? <Badge label="Missing" variant="warning" /> : undefined}
    />
  );
}

function invalidEnumFieldStatus(
  field: FormlessUiEditorField,
  value: string,
): FieldStatusInput | undefined {
  if (field.control.kind !== "enum" || !field.options?.unknownEnumValue || value === "") {
    return undefined;
  }

  return {
    type: "error",
    message: `"${field.options.unknownEnumValue}" is not a valid value.`,
  };
}

const styles = stylex.create({
  enumDisplayValue: {
    gap: spacingVars["--spacing-2"],
  },
});
