import * as stylex from "@stylexjs/stylex";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { FormlessUiFieldIntentHandler } from "../../formless-ui-contract.ts";
import {
  draftInputFromValue,
  editorFieldValue,
  emitFieldDraftChange,
  emitRecordUnitDraftChange,
  emitValueUnitCommit,
  fieldChromeProps,
  fieldInteractionIsDisabled,
  formatInputValue,
  inputSize,
  isRecordEditorField,
  numberDraftIsInvalid,
  numberInputValue,
  recordCommitHandlers,
  valueUnitCommitHandlers,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function NumberFieldEditor({
  field,
  showUnit,
  onIntent,
}: {
  field: FormlessUiEditorField;
  showUnit: boolean;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const stringValue = formatInputValue(editorFieldValue(field));
  const recordField = isRecordEditorField(field) ? field : undefined;
  const valueUnit = showUnit ? recordField?.valueUnit : undefined;
  const fieldCommitHandlers =
    valueUnit && recordField
      ? valueUnitCommitHandlers(recordField, onIntent)
      : recordCommitHandlers(field, onIntent);
  const renderedInput = numberDraftIsInvalid(field) ? (
    <TextInput
      {...fieldChromeProps(field)}
      hasClear
      isLoading={Boolean(field.pending?.isPending)}
      size={inputSize(field)}
      value={stringValue}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onEnter={() => fieldCommitHandlers.commitInput(stringValue)}
    />
  ) : (
    <NumberInput
      {...fieldChromeProps(field)}
      hasClear
      size={inputSize(field)}
      value={numberInputValue(stringValue)}
      onBlur={() => fieldCommitHandlers.commitInput(stringValue)}
      onChange={(value) => {
        const nextValue = value ?? "";

        emitFieldDraftChange(field, nextValue, onIntent);
        fieldCommitHandlers.commitImmediate(nextValue);
      }}
      onKeyDown={(event) => fieldCommitHandlers.onKeyDown(event, stringValue)}
    />
  );

  if (!recordField || !valueUnit) {
    return renderedInput;
  }

  const unitDraft = recordField.drafts.unitDraft ?? "";
  const unitOptions = Object.entries(valueUnit.unitField.values).map(([value, option]) => ({
    label: option.label,
    value,
  }));

  return (
    <div {...stylex.props(styles.valueUnitEditor)}>
      {renderedInput}
      <Selector
        label={`${field.label} unit`}
        isLabelHidden
        isDisabled={fieldInteractionIsDisabled(field)}
        isRequired={valueUnit.unitField.required}
        options={unitOptions}
        size={inputSize(field)}
        value={unitDraft || undefined}
        width="100%"
        onChange={(unit) => {
          emitRecordUnitDraftChange(recordField, unit, onIntent);
          emitValueUnitCommit(
            recordField,
            recordField.drafts.draftInput ?? draftInputFromValue(stringValue),
            { kind: "input", value: unit },
            onIntent,
          );
        }}
      />
    </div>
  );
}

const styles = stylex.create({
  valueUnitEditor: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "end",
    gap: spacingVars["--spacing-2"],
    minWidth: 0,
  },
});
