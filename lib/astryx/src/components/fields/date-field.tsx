import * as stylex from "@stylexjs/stylex";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { durationVars, easeVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import {
  dateInputValue,
  editorFieldValue,
  emitFieldDraftChange,
  emitRecordFieldCommit,
  fieldChromeProps,
  fieldChromeStyles,
  fieldDescription,
  formatInputValue,
  inputSize,
  isRecordEditorField,
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
  const changeAction = isRecordEditorField(field)
    ? (nextValue: string | undefined) => emitRecordFieldCommit(field, nextValue ?? "", onIntent)
    : undefined;
  const dateInput = (
    <DateInput
      {...fieldChromeProps(field)}
      changeAction={changeAction}
      description={undefined}
      disabledMessage={fieldDescription(field)}
      hasClear={!field.required}
      isLoading={Boolean(field.pending?.isPending)}
      placeholder={undefined}
      size={inputSize(field)}
      value={dateInputValue(value)}
      onChange={(nextValue) => emitFieldDraftChange(field, nextValue ?? "", onIntent)}
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

export function DateFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  const temporal = field.formatting.temporal;
  const suffix = field.formatting.suffix ?? field.suffix;
  return (
    <div {...stylex.props(fieldChromeStyles.displayValue, styles.displayValue)}>
      {temporal ? (
        <Timestamp
          format={temporal.kind === "date" ? "date" : "date_time"}
          type="body"
          value={temporal.kind === "date" ? `${temporal.value}T00:00:00` : temporal.value}
        />
      ) : (
        <Text type="body">{field.formatting.displayValue}</Text>
      )}
      {suffix ? (
        <Text color="secondary" type="body">
          {suffix}
        </Text>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  displayValue: {
    gap: spacingVars["--spacing-1"],
  },
  valueOrInteractionQuiet: {
    opacity: {
      default: 0,
      ":hover": {
        "@media (hover: hover)": 1,
      },
      ":focus-within": 1,
    },
    transitionProperty: "opacity",
    transitionDuration: {
      default: durationVars["--duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: easeVars["--ease-standard"],
  },
});
