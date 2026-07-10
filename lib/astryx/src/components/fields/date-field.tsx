import * as stylex from "@stylexjs/stylex";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { FormlessUiFieldIntentHandler } from "../../formless-ui-contract.ts";
import {
  dateInputValue,
  editorFieldValue,
  emitFieldDraftChange,
  emitImmediateRecordFieldCommit,
  fieldChromeProps,
  formatInputValue,
  inputSize,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function DateFieldEditor({
  field,
  isQuiet,
  onIntent,
}: {
  field: FormlessUiEditorField;
  isQuiet: boolean;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));
  const dateInput = (
    <DateInput
      {...fieldChromeProps(field)}
      hasClear={!field.required}
      isLoading={Boolean(field.pending?.isPending)}
      size={inputSize(field)}
      value={dateInputValue(value)}
      onChange={(nextValue) => {
        const value = nextValue ?? "";

        emitFieldDraftChange(field, value, onIntent);
        emitImmediateRecordFieldCommit(field, value, onIntent);
      }}
    />
  );

  if (!isQuiet || value !== "" || field.errors?.length) {
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

const styles = stylex.create({
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
});
