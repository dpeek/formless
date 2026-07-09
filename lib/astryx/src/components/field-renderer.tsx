import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector, SelectorOption, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import {
  ColorValueDisplay,
  MarkdownFieldDisplay,
  MarkdownInput,
  SourceIcon,
} from "./field-primitives.tsx";
import { ColorInput } from "./color-input.tsx";
import { ImageInput, ImageValueDisplay } from "./image-input.tsx";
import { StateInput } from "./state-input.tsx";
import type {
  AstryxFieldData,
  AstryxFieldDisplayData,
  AstryxFieldEditorData,
  AstryxFieldIntentHandlers,
  AstryxFieldOption,
  AstryxFieldPresentation,
  AstryxFieldPresentationContent,
  AstryxFieldValue,
} from "../field-contract.ts";

export type AstryxFieldRendererProps = {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
  inputId?: string;
};

export function AstryxFieldRenderer({
  field,
  handlers,
  inputId = defaultFieldInputId(field),
}: AstryxFieldRendererProps) {
  if (isStateMachineEnumField(field)) {
    return <StateMachineField field={field} handlers={handlers} inputId={inputId} />;
  }

  if (field.mode === "editor") {
    return <FieldEditor field={field} handlers={handlers} inputId={inputId} />;
  }

  return <DisplayField field={field} inputId={inputId} />;
}

export function AstryxFieldSubmitFormAdapter({ field }: { field: AstryxFieldData }) {
  if (field.mode !== "editor" || field.commitPolicy !== "submit") {
    return null;
  }

  return (
    <input name={field.name} readOnly type="hidden" value={formatInputValue(field.draftValue)} />
  );
}

function DisplayField({ field, inputId }: { field: AstryxFieldDisplayData; inputId: string }) {
  return (
    <Field
      label={field.label}
      inputID={inputId}
      isLabelHidden={fieldLabelIsHidden(field)}
      description={field.description}
      isDisabled={field.accessMode === "disabled"}
      status={fieldStatus(field)}
      isRequired={field.isRequired}
      labelTooltip={field.labelTooltip}
      width="100%"
    >
      <FieldDisplay field={field} />
    </Field>
  );
}

function FieldEditor({
  field,
  handlers,
  inputId,
}: {
  field: AstryxFieldEditorData;
  handlers: AstryxFieldIntentHandlers;
  inputId: string;
}) {
  const isPending = Boolean(field.pending?.isPending);
  const isDisabled = field.accessMode === "disabled";
  const isReadOnly = field.accessMode !== "editable";
  const isInteractionDisabled = isDisabled || isReadOnly || isPending;
  const stringValue = formatInputValue(field.draftValue);
  const sharedProps = {
    label: field.label,
    isLabelHidden: fieldLabelIsHidden(field),
    description: field.description,
    isRequired: field.isRequired,
    isDisabled: isInteractionDisabled,
    labelTooltip: field.labelTooltip,
    placeholder: field.presentation?.placeholder,
    status: fieldStatus(field),
    width: "100%",
  } satisfies FieldChromeProps;

  if (field.kind === "markdown") {
    return (
      <MarkdownInput
        {...sharedProps}
        value={stringValue}
        isReadOnly={isReadOnly}
        isLoading={isPending}
        size={inputSize(field.density)}
        rows={field.presentation?.maxLines ?? 6}
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );
  }

  if (field.kind === "long-text") {
    return (
      <TextArea
        {...sharedProps}
        value={stringValue}
        isLoading={isPending}
        size={inputSize(field.density)}
        rows={4}
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );
  }

  if (field.kind === "color") {
    return (
      <ColorInput
        id={inputId}
        {...sharedProps}
        value={stringValue}
        density={field.density}
        isReadOnly={isReadOnly}
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );
  }

  if (field.kind === "image" || field.kind === "media") {
    return (
      <ImageInput
        id={inputId}
        {...sharedProps}
        accept={field.presentation?.accept}
        alt={field.presentation?.mediaAlt}
        density={field.density}
        isLoading={isPending}
        isReadOnly={isReadOnly}
        options={field.options}
        previewUrl={field.presentation?.mediaPreviewUrl}
        value={stringValue}
        onSelectOption={(option) => {
          if (handlers.onOpenPicker) {
            handlers.onOpenPicker(
              field.id,
              field.kind === "image" ? "image" : "media",
              option.value,
            );
            return;
          }

          handlers.onDraftChange?.(field.id, option.value);
        }}
        onUploadFile={(file) => handlers.onUploadFile?.(field.id, file)}
      />
    );
  }

  if (field.kind === "boolean") {
    const checkbox = (
      <CheckboxInput
        label={field.label}
        isLabelHidden={fieldLabelIsHidden(field)}
        description={field.description}
        isDisabled={isInteractionDisabled}
        isLoading={isPending}
        isReadOnly={isReadOnly}
        isRequired={field.isRequired}
        size={field.density === "compact" ? "sm" : "md"}
        status={fieldStatus(field)}
        value={field.draftValue === true}
        width="100%"
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );

    if (field.presentation?.boolean?.mode !== "completion") {
      return checkbox;
    }

    return (
      <div
        data-astryx-field-presentation-mode="completion"
        {...stylex.props(styles.booleanCompletion)}
      >
        {checkbox}
      </div>
    );
  }

  if (field.kind === "enum" || field.kind === "reference") {
    return (
      <SelectorFieldEditor
        field={field}
        isDisabled={isInteractionDisabled}
        isLoading={isPending}
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
        value={stringValue}
      />
    );
  }

  if (field.kind === "date") {
    const dateInput = (
      <DateInput
        {...sharedProps}
        hasClear={!field.isRequired}
        isLoading={isPending}
        size={inputSize(field.density)}
        value={dateInputValue(stringValue)}
        onChange={(value) => handlers.onDraftChange?.(field.id, value ?? "")}
      />
    );

    if (!dateValueOrInteractionIsQuiet(field, stringValue)) {
      return dateInput;
    }

    return (
      <div
        data-astryx-field-presentation-visibility="valueOrInteraction"
        {...stylex.props(styles.valueOrInteractionQuiet)}
      >
        {dateInput}
      </div>
    );
  }

  if (field.kind === "number") {
    if (typeof field.draftValue === "string") {
      return (
        <TextInput
          {...sharedProps}
          hasClear
          isLoading={isPending}
          size={inputSize(field.density)}
          value={field.draftValue}
          onChange={(value) => handlers.onDraftChange?.(field.id, value)}
        />
      );
    }

    return (
      <NumberInput
        {...sharedProps}
        hasClear
        size={inputSize(field.density)}
        value={numberInputValue(field.draftValue)}
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );
  }

  return (
    <TextInput
      {...sharedProps}
      isLoading={isPending}
      size={inputSize(field.density)}
      value={stringValue}
      onChange={(value) => handlers.onDraftChange?.(field.id, value)}
    />
  );
}

function StateMachineField({
  field,
  handlers,
  inputId,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
  inputId: string;
}) {
  const value = formatInputValue(field.mode === "editor" ? field.draftValue : field.value);
  const option = field.options?.find((candidate) => candidate.value === value);
  const isPending = stateMachineIsPending(field);
  const isCompact = field.surface === "table-cell" || field.density === "compact";

  return (
    <Field
      label={field.label}
      inputID={inputId}
      isLabelHidden={fieldLabelIsHidden(field)}
      description={field.description}
      isDisabled={field.accessMode === "disabled"}
      isRequired={field.isRequired}
      labelTooltip={field.labelTooltip}
      width="100%"
    >
      <div
        {...stylex.props(
          styles.stateMachine,
          isCompact && styles.stateMachineCompact,
        )}
      >
        <div
          {...stylex.props(
            styles.stateMachineControl,
            isCompact && styles.stateMachineControlCompact,
          )}
        >
          <StateInput
            label={field.label}
            value={value}
            option={option}
            stateLabel={field.stateMachine?.stateLabel}
            transitions={field.stateMachine?.transitions ?? []}
            isCompact={isCompact}
            isDisabled={field.accessMode === "disabled"}
            isPending={isPending}
            pendingLabel={field.pending?.label}
            onTransition={(transition) => handlers.onTransition?.(field.id, transition)}
          />
        </div>
      </div>
    </Field>
  );
}

type FieldChromeProps = {
  label: string;
  isLabelHidden: boolean;
  description?: string;
  isRequired?: boolean;
  isDisabled: boolean;
  labelTooltip?: string;
  placeholder?: string;
  status?: FieldStatusInput;
  width: "100%";
};

function SelectorFieldEditor({
  field,
  isDisabled,
  isLoading,
  onChange,
  value,
}: {
  field: AstryxFieldEditorData;
  isDisabled: boolean;
  isLoading: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const options = selectorOptions(field);
  const optionsByValue = new Map((field.options ?? []).map((option) => [option.value, option]));
  const usesEnumOptionVisuals = field.kind === "enum";
  const enumTriggerContent = enumPresentationTriggerContent(field.presentation?.enum);
  const enumListContent = enumPresentationListContent(field.presentation?.enum);
  const selectedOption = optionsByValue.get(value);
  const hasEnumOptionVisuals =
    usesEnumOptionVisuals && (field.options ?? []).some((option) => hasEnumOptionVisual(option));
  const invalidEnumValue =
    field.kind === "enum" && value !== "" && !optionsByValue.has(value) ? value : undefined;
  const startIcon =
    usesEnumOptionVisuals &&
    (enumTriggerContent === "icon" || enumTriggerContent === "both") &&
    selectedOption
      ? enumOptionVisual(selectedOption)
      : undefined;
  const sharedProps = {
    label: field.label,
    isLabelHidden: fieldLabelIsHidden(field),
    description: field.description,
    isRequired: field.isRequired,
    isDisabled,
    isLoading,
    labelTooltip: field.labelTooltip,
    options,
    placeholder: invalidEnumValue ?? field.presentation?.placeholder ?? "Select",
    startIcon,
    renderOption: (option: SelectorOptionData) => (
      <RichSelectorOption
        option={optionsByValue.get(option.value)}
        fallback={option}
        enumListContent={enumListContent}
        hasEnumOptionVisuals={hasEnumOptionVisuals}
        usesEnumOptionVisuals={usesEnumOptionVisuals}
      />
    ),
    size: inputSize(field.density),
    status: fieldStatus(field) ?? invalidEnumFieldStatus(invalidEnumValue),
    width: "100%",
  };

  if (field.isRequired) {
    return (
      <Selector
        {...sharedProps}
        value={value || undefined}
        onChange={(nextValue) => onChange(nextValue)}
      />
    );
  }

  return (
    <Selector
      {...sharedProps}
      hasClear
      value={value || null}
      onChange={(nextValue) => onChange(nextValue ?? "")}
    />
  );
}

function RichSelectorOption({
  enumListContent,
  fallback,
  hasEnumOptionVisuals,
  option,
  usesEnumOptionVisuals,
}: {
  enumListContent: AstryxFieldPresentationContent;
  fallback: SelectorOptionData;
  hasEnumOptionVisuals: boolean;
  option: AstryxFieldOption | undefined;
  usesEnumOptionVisuals: boolean;
}) {
  const label = option?.label ?? fallback.label ?? fallback.value;
  const showEnumVisual = usesEnumOptionVisuals && enumListContent !== "label";
  const showEnumLabel =
    !usesEnumOptionVisuals ||
    enumListContent !== "icon" ||
    !option ||
    !hasEnumOptionVisual(option) ||
    option.isMissing;

  return (
    <SelectorOption
      icon={
        showEnumVisual ? (
          enumOptionVisual(option, { reserveSpace: hasEnumOptionVisuals })
        ) : option?.source ? (
          <SourceIcon source={option.source} size="sm" color="secondary" aria-hidden />
        ) : undefined
      }
      label={showEnumLabel ? label : ""}
      description={option?.detail ?? (option?.isMissing ? "Missing value" : undefined)}
      endContent={
        option?.isMissing ? (
          <Badge label="Missing" variant="warning" />
        ) : !usesEnumOptionVisuals && option?.color ? (
          <span
            aria-label={`${option.label} color`}
            role="img"
            {...stylex.props(styles.optionColorSwatch, dynamicStyles.colorSwatch(option.color))}
          />
        ) : undefined
      }
    />
  );
}

function hasEnumOptionVisual(option: AstryxFieldOption) {
  return Boolean(option.source || option.color);
}

function enumPresentationTriggerContent(
  presentation: AstryxFieldPresentation["enum"] | undefined,
): AstryxFieldPresentationContent {
  return presentation?.trigger ?? (presentation?.mode === "iconOnly" ? "icon" : "both");
}

function enumPresentationListContent(
  presentation: AstryxFieldPresentation["enum"] | undefined,
): AstryxFieldPresentationContent {
  return presentation?.list ?? "both";
}

function invalidEnumFieldStatus(value: string | undefined): FieldStatusInput | undefined {
  if (!value) {
    return undefined;
  }

  return {
    type: "error",
    message: `"${value}" is not a valid value.`,
  };
}

function enumOptionVisual(
  option: AstryxFieldOption | undefined,
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

function selectorOptions(field: AstryxFieldEditorData): SelectorOptionData[] {
  return (field.options ?? []).map((option) => ({
    disabled: option.isDisabled,
    label: option.label,
    value: option.value,
  }));
}

function isStateMachineEnumField(field: AstryxFieldData) {
  return field.accessMode === "state-machine" && field.kind === "enum";
}

function stateMachineIsPending(field: AstryxFieldData) {
  return Boolean(field.pending?.isPending);
}

function fieldStatus(field: AstryxFieldData): FieldStatusInput | undefined {
  const error = field.errors?.[0];

  if (!error) {
    return undefined;
  }

  return {
    type: error.severity ?? "error",
    message: error.message,
  };
}

function fieldLabelIsHidden(field: AstryxFieldData) {
  return field.surface === "table-cell";
}

type FieldInputSize = "sm" | "md" | "lg";
type ISODateInputValue =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function inputSize(density: AstryxFieldData["density"]): FieldInputSize {
  if (density === "compact") {
    return "sm";
  }

  if (density === "comfortable") {
    return "lg";
  }

  return "md";
}

function dateInputValue(value: string): ISODateInputValue | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (value as ISODateInputValue) : undefined;
}

function numberInputValue(value: AstryxFieldValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function dateValueOrInteractionIsQuiet(field: AstryxFieldEditorData, value: string) {
  return (
    field.presentation?.date?.visibility === "valueOrInteraction" &&
    value === "" &&
    !field.errors?.length
  );
}

function FieldDisplay({ field }: { field: AstryxFieldDisplayData }) {
  if (field.kind === "boolean") {
    const isCompletion = field.presentation?.boolean?.mode === "completion";

    return (
      <div
        data-astryx-field-presentation-mode={isCompletion ? "completion" : undefined}
        {...stylex.props(styles.displayValue)}
      >
        <Badge
          label={field.value === true ? (isCompletion ? "Complete" : "Yes") : isCompletion ? "Open" : "No"}
          variant={field.value === true ? "success" : "neutral"}
        />
      </div>
    );
  }

  if (field.kind === "enum") {
    return <EnumDisplayValue field={field} />;
  }

  if (field.kind === "color") {
    return (
      <ColorValueDisplay label={field.label} value={field.displayValue} density={field.density} />
    );
  }

  if (field.kind === "image" || field.kind === "media") {
    return (
      <ImageValueDisplay
        alt={field.presentation?.mediaAlt}
        density={field.density}
        label={field.label}
        previewUrl={field.presentation?.mediaPreviewUrl}
        value={field.displayValue}
      />
    );
  }

  if (field.kind === "markdown") {
    return <MarkdownFieldDisplay value={field.displayValue} density={field.density} />;
  }

  if (field.kind === "source-icon") {
    return (
      <div {...stylex.props(styles.displayValue, styles.sourceIconDisplay)}>
        <SourceIcon
          source={field.presentation?.sourceIcon ?? null}
          color="secondary"
          size={field.density === "compact" ? "sm" : "md"}
          aria-label={field.label}
        />
        <Text type={field.density === "compact" ? "supporting" : "body"} maxLines={1}>
          {field.displayValue || "Icon"}
        </Text>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.displayValue)}>
      <Text
        type={field.density === "compact" ? "supporting" : "body"}
        maxLines={field.presentation?.maxLines ?? 2}
      >
        {field.displayValue || "Empty"}
      </Text>
    </div>
  );
}

function EnumDisplayValue({ field }: { field: AstryxFieldDisplayData }) {
  const value = formatInputValue(field.value);
  const option = field.options?.find((candidate) => candidate.value === value);
  const content = enumPresentationTriggerContent(field.presentation?.enum);
  const showVisual = content !== "label" && option !== undefined && hasEnumOptionVisual(option);
  const showLabel = content !== "icon" || !showVisual || option?.isMissing;
  const label = option?.label ?? field.displayValue ?? value;

  return (
    <div
      data-astryx-field-presentation-mode={field.presentation?.enum?.mode}
      data-astryx-field-presentation-trigger={field.presentation?.enum?.trigger}
      {...stylex.props(styles.displayValue, styles.enumDisplayValue)}
    >
      {showVisual ? enumOptionVisual(option) : null}
      {showLabel ? (
        <Text
          type={field.density === "compact" ? "supporting" : "body"}
          maxLines={field.presentation?.maxLines ?? 2}
        >
          {label || "Empty"}
        </Text>
      ) : null}
      {option?.isMissing ? <Badge label="Missing" variant="warning" /> : null}
    </div>
  );
}

function defaultFieldInputId(field: AstryxFieldData) {
  return `astryx-field-${field.id}`;
}

function formatInputValue(value: AstryxFieldValue) {
  if (value === null) {
    return "";
  }

  return String(value);
}

const styles = stylex.create({
  displayValue: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    minHeight: spacingVars["--spacing-9"],
    minWidth: 0,
  },
  sourceIconDisplay: {
    gap: spacingVars["--spacing-2"],
  },
  enumDisplayValue: {
    gap: spacingVars["--spacing-2"],
  },
  booleanCompletion: {
    width: "100%",
  },
  valueOrInteractionQuiet: {
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "140ms",
    transitionTimingFunction: "ease-out",
    ":hover": {
      opacity: 1,
    },
    ":focus-within": {
      opacity: 1,
    },
  },
  stateMachine: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
    minWidth: 0,
    width: "100%",
  },
  stateMachineCompact: {
    gap: spacingVars["--spacing-1"],
  },
  stateMachineControl: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacingVars["--spacing-1"],
    minHeight: spacingVars["--spacing-9"],
    minWidth: 0,
    flexWrap: "wrap",
  },
  stateMachineControlCompact: {
    justifyContent: "flex-start",
    gap: spacingVars["--spacing-1"],
    minHeight: spacingVars["--spacing-8"],
  },
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
