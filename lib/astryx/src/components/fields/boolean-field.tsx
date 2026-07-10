import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
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
  fieldIsReadOnly,
  fieldLabelIsHidden,
  fieldStatus,
  fieldChromeStyles,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function BooleanFieldEditor({
  field,
  isCompletion,
  onIntent,
}: {
  field: FormlessUiEditorField;
  isCompletion: boolean;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const checkbox = (
    <CheckboxInput
      label={field.label}
      isLabelHidden={fieldLabelIsHidden(field)}
      description={fieldDescription(field)}
      isDisabled={fieldInteractionIsDisabled(field)}
      isLoading={Boolean(field.pending?.isPending)}
      isReadOnly={fieldIsReadOnly(field)}
      isRequired={field.required}
      size={astryxDensity(field) === "compact" ? "sm" : "md"}
      status={fieldStatus(field)}
      value={editorFieldValue(field) === true}
      width="100%"
      onChange={(value) => {
        emitFieldDraftChange(field, value, onIntent);
        emitImmediateRecordFieldCommit(field, value, onIntent);
      }}
    />
  );

  if (!isCompletion) {
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

export function BooleanFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  const isCompletion = field.presentation?.mode === "completion";

  return (
    <div
      data-astryx-field-presentation-mode={isCompletion ? "completion" : undefined}
      {...stylex.props(fieldChromeStyles.displayValue)}
    >
      <Badge
        label={
          field.value === true ? (isCompletion ? "Complete" : "Yes") : isCompletion ? "Open" : "No"
        }
        variant={field.value === true ? "success" : "neutral"}
      />
    </div>
  );
}

const styles = stylex.create({
  booleanCompletion: {
    width: "100%",
    minWidth: 0,
    gap: spacingVars["--spacing-2"],
  },
});
