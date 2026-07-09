import * as stylex from "@stylexjs/stylex";
import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import { Icon } from "@astryxdesign/core/Icon";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector, SelectorOption, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
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
  ArrowPathIcon,
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import {
  ColorValueDisplay,
  MarkdownFieldDisplay,
  MarkdownInput,
  SourceIcon,
} from "./field-primitives.tsx";
import { ColorInput } from "./color-input.tsx";
import { ImageInput, ImageValueDisplay } from "./image-input.tsx";
import type {
  AstryxFieldData,
  AstryxFieldDisplayData,
  AstryxFieldEditorData,
  AstryxFieldIntentHandlers,
  AstryxFieldOption,
  AstryxFieldStateFact,
  AstryxFieldTransitionOperation,
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
    return (
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
    return (
      <DateInput
        {...sharedProps}
        hasClear={!field.isRequired}
        isLoading={isPending}
        size={inputSize(field.density)}
        value={dateInputValue(stringValue)}
        onChange={(value) => handlers.onDraftChange?.(field.id, value ?? "")}
      />
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
  const error = field.errors?.[0];
  const isCompact = field.surface === "table-cell" || field.density === "compact";

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
      <div
        {...stylex.props(
          styles.stateMachine,
          isCompact && styles.stateMachineCompact,
          error && styles.stateMachineError,
        )}
      >
        <div
          {...stylex.props(
            styles.stateMachineControl,
            isCompact && styles.stateMachineControlCompact,
          )}
        >
          <StateMachineBadge field={field} option={option} value={value} />
          <StateTransitionActions
            field={field}
            handlers={handlers}
            isCompact={isCompact}
            isDisabled={field.accessMode === "disabled" || isPending}
          />
        </div>
        {field.pending?.isPending ? (
          <StateMachineNotice
            icon="pending"
            role="status"
            title={field.pending.label ?? "Updating state"}
          />
        ) : null}
        {field.surface !== "table-cell" && field.stateMachine?.facts?.length ? (
          <StateMachineFacts facts={field.stateMachine.facts} />
        ) : null}
      </div>
    </Field>
  );
}

function StateMachineBadge({
  field,
  option,
  value,
}: {
  field: AstryxFieldData;
  option: AstryxFieldOption | undefined;
  value: string;
}) {
  const label = option?.label ?? field.stateMachine?.stateLabel ?? (value ? value : "No state");
  const isUnknown = Boolean(value && !option);
  const icon =
    option?.source ? (
      <SourceIcon source={option.source} size="sm" color="secondary" aria-hidden />
    ) : option?.color ? (
      <span
        aria-label={`${label} color`}
        role="img"
        {...stylex.props(styles.stateBadgeSwatch, dynamicStyles.colorSwatch(option.color))}
      />
    ) : isUnknown ? (
      <Icon icon={ExclamationTriangleIcon} color="warning" size="sm" />
    ) : undefined;

  return (
    <Badge
      label={isUnknown ? `Unknown: ${label}` : label}
      variant={stateBadgeVariant(value, option)}
      icon={icon}
    />
  );
}

function StateTransitionActions({
  field,
  handlers,
  isCompact,
  isDisabled,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
  isCompact: boolean;
  isDisabled: boolean;
}) {
  const transitions = field.stateMachine?.transitions ?? [];
  const primaryTransition =
    transitions.find((transition) => transition.isPrimary) ?? transitions[0];
  const menuTransitions = transitions.filter(
    (transition) => transition.id !== primaryTransition?.id,
  );

  if (!primaryTransition) {
    return null;
  }

  return (
    <div {...stylex.props(styles.stateTransitionActions)}>
      <StateTransitionButton
        field={field}
        handlers={handlers}
        isCompact={isCompact}
        isDisabled={isDisabled}
        transition={primaryTransition}
      />
      {menuTransitions.length ? (
        <StateTransitionMenu
          field={field}
          handlers={handlers}
          isDisabled={isDisabled}
          transitions={menuTransitions}
        />
      ) : null}
    </div>
  );
}

function StateTransitionButton({
  field,
  handlers,
  isCompact,
  isDisabled,
  transition,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
  isCompact: boolean;
  isDisabled: boolean;
  transition: AstryxFieldTransitionOperation;
}) {
  const disabledReason = transition.disabledReason;
  const transitionIsDisabled = isDisabled || transition.isDisabled || transition.pending?.isPending;
  const isIconOnly = field.surface === "table-cell";

  return (
    <Button
      label={transition.label}
      variant={transitionButtonVariant(transition)}
      size={isCompact ? "sm" : "md"}
      icon={
        <Icon icon={transition.pending?.isPending ? ArrowPathIcon : CheckCircleIcon} size="sm" />
      }
      isIconOnly={isIconOnly}
      isDisabled={Boolean(transitionIsDisabled)}
      isLoading={transition.pending?.isPending}
      tooltip={isIconOnly ? disabledReason ?? transition.label : disabledReason}
      onClick={() => handlers.onTransition?.(field.id, transition)}
    />
  );
}

function StateTransitionMenu({
  field,
  handlers,
  isDisabled,
  transitions,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
  isDisabled: boolean;
  transitions: readonly AstryxFieldTransitionOperation[];
}) {
  return (
    <DropdownMenu
      button={{
        label: "State actions",
        tooltip: "State actions",
        variant: "secondary",
        size: field.density === "compact" ? "sm" : "md",
        icon: <Icon icon={EllipsisHorizontalIcon} color="inherit" size="sm" />,
        isIconOnly: true,
        isDisabled,
      }}
      menuWidth={248}
      placement="below"
    >
      {transitions.map((transition) => {
        const transitionIsDisabled =
          isDisabled || transition.isDisabled || transition.pending?.isPending;

        return (
          <DropdownMenuItem
            key={transition.id}
            label={transition.label}
            description={transition.disabledReason}
            icon={
              transition.pending?.isPending ? (
                <Spinner size="sm" shade="inherit" />
              ) : transition.isDisabled ? (
                <Icon icon={NoSymbolIcon} color="warning" size="sm" />
              ) : (
                <Icon icon={CheckCircleIcon} color="success" size="sm" />
              )
            }
            endContent={
              transition.pending?.isPending ? (
                <Text type="supporting" color="secondary">
                  Running
                </Text>
              ) : undefined
            }
            isDisabled={Boolean(transitionIsDisabled)}
            onClick={() => handlers.onTransition?.(field.id, transition)}
          />
        );
      })}
    </DropdownMenu>
  );
}

function StateMachineNotice({
  icon,
  role,
  title,
}: {
  icon: "error" | "pending";
  role: "alert" | "status";
  title: string;
}) {
  return (
    <div
      role={role}
      {...stylex.props(
        styles.stateMachineNotice,
        icon === "error" && styles.stateMachineNoticeError,
      )}
    >
      {icon === "pending" ? (
        <Spinner size="sm" shade="inherit" />
      ) : (
        <Icon icon={ExclamationTriangleIcon} color="error" size="sm" />
      )}
      <Text type="supporting" color="secondary">
        {title}
      </Text>
    </div>
  );
}

function StateMachineFacts({ facts }: { facts: readonly AstryxFieldStateFact[] }) {
  return (
    <div {...stylex.props(styles.stateFacts)}>
      {facts.map((fact) => (
        <span key={fact.id} {...stylex.props(styles.stateFact)}>
          <Text type="supporting" color="secondary">
            {formatStateFactKind(fact.kind)}
          </Text>
          <Text type="supporting" maxLines={1}>
            {fact.label}: {fact.value}
          </Text>
        </span>
      ))}
    </div>
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
  const sharedProps = {
    label: field.label,
    isLabelHidden: fieldLabelIsHidden(field),
    description: field.description,
    isRequired: field.isRequired,
    isDisabled,
    isLoading,
    labelTooltip: field.labelTooltip,
    options,
    placeholder: field.presentation?.placeholder ?? "Select",
    renderOption: (option: SelectorOptionData) => (
      <RichSelectorOption option={optionsByValue.get(option.value)} fallback={option} />
    ),
    size: inputSize(field.density),
    status: fieldStatus(field),
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
  fallback,
  option,
}: {
  fallback: SelectorOptionData;
  option: AstryxFieldOption | undefined;
}) {
  return (
    <SelectorOption
      icon={
        option?.source ? (
          <SourceIcon source={option.source} size="sm" color="secondary" aria-hidden />
        ) : undefined
      }
      label={option?.label ?? fallback.label ?? fallback.value}
      description={option?.detail ?? (option?.isMissing ? "Missing value" : undefined)}
      endContent={
        option?.isMissing ? (
          <Badge label="Missing" variant="warning" />
        ) : option?.color ? (
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
  return Boolean(
    field.pending?.isPending ||
      field.stateMachine?.transitions?.some((transition) => transition.pending?.isPending),
  );
}

function stateBadgeVariant(
  value: string,
  option: AstryxFieldOption | undefined,
): BadgeVariant {
  if (!value) {
    return "neutral";
  }

  if (!option) {
    return "warning";
  }

  const normalizedValue = value.toLowerCase();

  if (["done", "complete", "completed", "published", "active"].includes(normalizedValue)) {
    return "success";
  }

  if (["waiting", "queued", "review", "blocked"].includes(normalizedValue)) {
    return normalizedValue === "blocked" ? "error" : "warning";
  }

  if (["open", "draft", "new"].includes(normalizedValue)) {
    return "info";
  }

  return "neutral";
}

function transitionButtonVariant(transition: AstryxFieldTransitionOperation): ButtonVariant {
  return transition.visualIntent ?? "secondary";
}

function formatStateFactKind(kind: AstryxFieldStateFact["kind"]) {
  const labelByKind: Record<AstryxFieldStateFact["kind"], string> = {
    derived: "Derived",
    hidden: "Hidden",
    owned: "Owned",
  };

  return labelByKind[kind];
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

function FieldDisplay({ field }: { field: AstryxFieldDisplayData }) {
  if (field.kind === "boolean") {
    return (
      <div {...stylex.props(styles.displayValue)}>
        <Badge
          label={field.value === true ? "Yes" : "No"}
          variant={field.value === true ? "success" : "neutral"}
        />
      </div>
    );
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
  stateMachine: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
    minWidth: 0,
    width: "100%",
  },
  stateMachineCompact: {
    gap: spacingVars["--spacing-1"],
  },
  stateMachineError: {
    color: colorVars["--color-text-primary"],
  },
  stateMachineControl: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-2"],
    minHeight: spacingVars["--spacing-9"],
    minWidth: 0,
    flexWrap: "wrap",
  },
  stateMachineControlCompact: {
    justifyContent: "flex-start",
    gap: spacingVars["--spacing-1"],
    minHeight: spacingVars["--spacing-8"],
  },
  stateTransitionActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1"],
    flexWrap: "wrap",
  },
  stateMachineNotice: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    gap: spacingVars["--spacing-1"],
  },
  stateMachineNoticeError: {
    color: colorVars["--color-error"],
  },
  stateFacts: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-1"],
  },
  stateFact: {
    display: "inline-flex",
    alignItems: "center",
    maxWidth: "100%",
    gap: spacingVars["--spacing-1"],
    paddingBlock: spacingVars["--spacing-0-5"],
    paddingInline: spacingVars["--spacing-2"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-full"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  stateBadgeSwatch: {
    flexShrink: 0,
    width: spacingVars["--spacing-2"],
    height: spacingVars["--spacing-2"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border-emphasized"],
    borderRadius: radiusVars["--radius-full"],
  },
  optionColorSwatch: {
    flexShrink: 0,
    width: spacingVars["--spacing-4"],
    height: spacingVars["--spacing-4"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border-emphasized"],
    borderRadius: radiusVars["--radius-full"],
  },
});

const dynamicStyles = stylex.create({
  colorSwatch: (color: string) => ({
    backgroundColor: color,
  }),
});
