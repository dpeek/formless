import type { ChangeEvent, KeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { Field } from "@astryxdesign/core/Field";
import {
  borderVars,
  colorVars,
  fontWeightVars,
  radiusVars,
  sizeVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import type { FormlessUiFieldIntentHandler } from "@dpeek/formless-presentation/contract";
import {
  editorFieldValue,
  emitFieldDraftChange,
  emitRecordFieldCommit,
  emitRecordFieldRevert,
  fieldDescription,
  fieldInteractionIsDisabled,
  fieldLabelIsHidden,
  fieldStatus,
  formatInputValue,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function AutosizeTextFieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: FormlessUiEditorField;
  inputId: string;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));
  const placeholder = field.control.label;
  const disabled = fieldInteractionIsDisabled(field);
  const description = fieldDescription(field);
  const describedBy = [
    description ? `${inputId}-desc` : undefined,
    field.errors?.length ? `${inputId}-status` : undefined,
  ]
    .filter((id): id is string => id !== undefined)
    .join(" ");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    emitFieldDraftChange(field, event.currentTarget.value, onIntent);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      emitRecordFieldCommit(field, event.currentTarget.value, onIntent);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      emitRecordFieldRevert(field, onIntent);
    }
  }

  return (
    <Field
      description={description}
      inputID={inputId}
      isDisabled={disabled}
      isLabelHidden={fieldLabelIsHidden(field)}
      isRequired={field.required}
      label={field.label}
      status={fieldStatus(field)}
      width="100%"
    >
      <span {...stylex.props(styles.autosize)} data-astryx-autosize-text-field="true">
        <span aria-hidden="true" {...stylex.props(styles.sizer)}>
          {value || placeholder || " "}
        </span>
        <input
          aria-busy={field.pending?.isPending || undefined}
          aria-describedby={describedBy || undefined}
          aria-invalid={field.errors?.length ? true : undefined}
          disabled={disabled}
          id={inputId}
          placeholder={placeholder}
          required={field.required}
          type="text"
          value={value}
          onBlur={(event) => emitRecordFieldCommit(field, event.currentTarget.value, onIntent)}
          onChange={handleChange}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={handleKeyDown}
          {...stylex.props(styles.input)}
        />
      </span>
    </Field>
  );
}

const sharedTextMetrics = {
  boxSizing: "border-box",
  fontFamily: typographyVars["--font-family-body"],
  fontSize: typeScaleVars["--text-heading-1-size"],
  fontWeight: fontWeightVars["--font-weight-semibold"],
  lineHeight: typeScaleVars["--text-heading-1-leading"],
  minHeight: sizeVars["--size-element-lg"],
  paddingBlock: spacingVars["--spacing-1"],
  paddingInline: spacingVars["--spacing-1"],
} as const;

const styles = stylex.create({
  autosize: {
    display: "inline-grid",
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  sizer: {
    ...sharedTextMetrics,
    gridColumn: 1,
    gridRow: 1,
    minWidth: "1ch",
    visibility: "hidden",
    whiteSpace: "pre",
  },
  input: {
    ...sharedTextMetrics,
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: {
      default: "transparent",
      ":focus-visible": colorVars["--color-accent"],
    },
    borderRadius: radiusVars["--radius-element"],
    borderStyle: "solid",
    borderWidth: borderVars["--border-width"],
    color: {
      default: colorVars["--color-text-primary"],
      ":disabled": colorVars["--color-text-disabled"],
    },
    cursor: {
      default: "text",
      ":disabled": "not-allowed",
    },
    gridColumn: 1,
    gridRow: 1,
    outline: "none",
    width: "100%",
    "::placeholder": {
      color: colorVars["--color-text-secondary"],
    },
  },
});
