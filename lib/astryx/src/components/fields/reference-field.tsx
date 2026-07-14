import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import {
  astryxDensity,
  editorFieldValue,
  emitFieldDraftChange,
  emitImmediateRecordFieldCommit,
  fieldDescription,
  fieldInteractionIsDisabled,
  fieldLabelIsHidden,
  fieldStatus,
  formatInputValue,
  inputSize,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function ReferenceFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));
  const referenceFacts = field.reference?.kind === "editor" ? field.reference : undefined;
  const missingValue =
    referenceFacts?.valueStatus.kind === "missing" ? referenceFacts.valueStatus.value : undefined;
  const options = (field.options?.referenceOptions ?? []).map((option) => ({
    label: option.label,
    value: option.id,
  }));
  const sharedProps = {
    disabledMessage: fieldDescription(field),
    isDisabled: fieldInteractionIsDisabled(field),
    isLabelHidden: fieldLabelIsHidden(field),
    isLoading: Boolean(field.pending?.isPending),
    isRequired: field.required,
    label: field.label,
    options,
    placeholder: missingValue,
    size: inputSize(field),
    status:
      fieldStatus(field) ??
      (missingValue
        ? {
            message: missingReferenceMessage(field, missingValue),
            type: "warning" as const,
          }
        : undefined),
    width: "100%" as const,
  };
  const changeValue = (nextValue: string) => {
    emitFieldDraftChange(field, nextValue, onIntent);
    emitImmediateRecordFieldCommit(field, nextValue, onIntent);
  };

  if (!referenceFacts?.clearable) {
    return <Selector {...sharedProps} value={value || undefined} onChange={changeValue} />;
  }

  return (
    <Selector
      {...sharedProps}
      hasClear
      value={value || null}
      onChange={(nextValue) => changeValue(nextValue ?? "")}
    />
  );
}

export function ReferenceFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  const missingValue =
    field.reference?.kind === "display" && field.reference.valueStatus.kind === "missing"
      ? field.reference.valueStatus.value
      : undefined;
  const value = (
    <Text
      display="block"
      maxLines={2}
      type={astryxDensity(field) === "compact" ? "supporting" : "body"}
    >
      {field.formatting.displayValue}
    </Text>
  );

  if (!missingValue) {
    return value;
  }

  const message = missingReferenceMessage(field, missingValue);

  return (
    <Tooltip content={message}>
      <HStack
        aria-label={`${field.label}: ${missingValue}. ${message}`}
        gap={1}
        role="status"
        tabIndex={0}
        vAlign="center"
      >
        <Icon icon="warning" color="warning" size="sm" />
        {value}
      </HStack>
    </Tooltip>
  );
}

function missingReferenceMessage(
  field: FormlessUiEditorField | FormlessUiDisplayField,
  value: string,
) {
  const message = `Current reference “${value}” is unavailable.`;

  return field.mode === "editor" && field.access.kind === "editable"
    ? `${message} Choose another value.`
    : message;
}
