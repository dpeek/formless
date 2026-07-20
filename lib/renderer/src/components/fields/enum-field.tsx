import * as stylex from "@stylexjs/stylex";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector, SelectorOption, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type {
  DisplayFieldContract,
  FieldContract,
  FieldIntentHandler,
} from "@dpeek/formless-presentation/contract";
import {
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
  type EditorField,
} from "./field-chrome.tsx";
import {
  enumPresentationListContent,
  enumPresentationTriggerContent,
  enumValuePresentationToSelectorVisualOption,
  hasSelectorOptionVisual,
  selectorOptionVisual,
  selectorVisualOptions,
  type SelectorVisualOption,
} from "./field-options.tsx";

export function EnumFieldEditor({
  field,
  onIntent,
}: {
  field: EditorField;
  onIntent: FieldIntentHandler | undefined;
}) {
  return <SelectorFieldEditor field={field} onIntent={onIntent} />;
}

export function SelectorFieldEditor({
  field,
  onIntent,
}: {
  field: EditorField;
  onIntent: FieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));
  const visualOptions = selectorVisualOptions(field);
  const optionsByValue = new Map(visualOptions.map((option) => [option.value, option]));
  const options = visualOptions.map((option) => ({
    disabled: false,
    label: option.label,
    value: option.value,
  }));
  const enumFacts = field.enum?.kind === "editor" ? field.enum : undefined;
  const undeclaredMessage = enumUndeclaredMessage(field);
  const usesEnumOptionVisuals = field.control.kind === "enum" && enumFacts?.style === "rich";
  const enumTriggerContent = enumPresentationTriggerContent(field);
  const enumListContent = enumPresentationListContent(field);
  const selectedOption = optionsByValue.get(value);
  const hasEnumOptionVisuals =
    usesEnumOptionVisuals && visualOptions.some((option) => hasSelectorOptionVisual(option));
  const startIcon =
    usesEnumOptionVisuals && enumTriggerContent === "both" && selectedOption
      ? selectorOptionVisual(selectedOption)
      : undefined;
  const sharedProps = {
    label: field.label,
    isLabelHidden: fieldLabelIsHidden(field),
    description: fieldDescription(field),
    isRequired: enumRequiredMarkerIsVisible(field),
    isDisabled: fieldInteractionIsDisabled(field),
    isLoading: Boolean(field.pending?.isPending),
    options,
    placeholder:
      enumFacts?.valueStatus.kind === "undeclared"
        ? enumFacts.valueStatus.value
        : enumFacts?.placeholder,
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
    status:
      fieldStatus(field) ??
      (undeclaredMessage ? { type: "warning" as const, message: undeclaredMessage } : undefined),
    width: "100%",
  };

  if (!enumFacts?.clearable) {
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

function enumRequiredMarkerIsVisible(field: EditorField) {
  const enumFacts = field.enum?.kind === "editor" ? field.enum : undefined;

  return (
    field.required && !(enumFacts?.clearable === false && enumFacts.valueStatus.kind === "declared")
  );
}

export function EnumFieldDisplay({ field }: { field: DisplayFieldContract }) {
  const value = formatInputValue(field.value);
  const option = field.formatting.enumValuePresentation
    ? enumValuePresentationToSelectorVisualOption(field.formatting.enumValuePresentation, value)
    : undefined;
  const content = field.enum?.kind === "display" ? field.enum.content : "label";
  const showVisual = content === "icon" && option !== undefined && hasSelectorOptionVisual(option);
  const showLabel = content === "label" || !showVisual;
  const label = option?.label ?? field.formatting.displayValue ?? value;
  const undeclaredMessage = enumUndeclaredMessage(field);

  const display = (
    <div
      aria-label={undeclaredMessage ? `${field.label}: ${label}. ${undeclaredMessage}` : undefined}
      data-astryx-field-presentation-mode={field.presentation?.mode}
      data-astryx-field-presentation-trigger={field.presentation?.trigger}
      role={undeclaredMessage ? "status" : undefined}
      tabIndex={undeclaredMessage ? 0 : undefined}
      {...stylex.props(fieldChromeStyles.displayValue, styles.enumDisplayValue)}
    >
      {undeclaredMessage ? (
        <span {...stylex.props(styles.enumUndeclaredIcon)}>
          <Icon icon="warning" color="warning" size="sm" />
        </span>
      ) : null}
      {showVisual ? <VisuallyHidden>{`${field.label}: ${label}`}</VisuallyHidden> : null}
      {showVisual ? selectorOptionVisual(option) : null}
      {showLabel ? (
        <Text type="body" maxLines={2}>
          {label}
        </Text>
      ) : null}
    </div>
  );

  return undeclaredMessage ? <Tooltip content={undeclaredMessage}>{display}</Tooltip> : display;
}

function enumUndeclaredMessage(field: FieldContract): string | undefined {
  const valueStatus = field.enum?.valueStatus;

  if (valueStatus?.kind !== "undeclared") {
    return undefined;
  }

  const message = `Current value “${valueStatus.value}” is not an available option.`;

  return field.mode === "editor" && field.access.kind === "editable"
    ? `${message} Choose another value.`
    : message;
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
    !hasSelectorOptionVisual(option);

  return (
    <SelectorOption
      icon={
        showEnumVisual
          ? selectorOptionVisual(option, { reserveSpace: hasEnumOptionVisuals })
          : undefined
      }
      label={showEnumLabel ? label : <VisuallyHidden>{label}</VisuallyHidden>}
      description={option?.detail}
    />
  );
}

const styles = stylex.create({
  enumDisplayValue: {
    gap: spacingVars["--spacing-2"],
  },
  enumUndeclaredIcon: {
    display: "inline-flex",
    flexShrink: 0,
  },
});
