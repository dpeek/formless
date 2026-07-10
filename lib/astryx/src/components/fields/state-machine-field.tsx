import * as stylex from "@stylexjs/stylex";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { FormlessUiField, FormlessUiFieldIntentHandler } from "../../formless-ui-contract.ts";
import { StateInput } from "../state-input.tsx";
import {
  FieldChrome,
  fieldInteractionIsDisabled,
  formatInputValue,
  isRecordEditorField,
  stateMachineFieldValue,
} from "./field-chrome.tsx";
import { enumOptionForValue } from "./field-options.tsx";

export function StateMachineField({
  field,
  inputId,
  onIntent,
}: {
  field: FormlessUiField;
  inputId: string;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = formatInputValue(stateMachineFieldValue(field));
  const option = enumOptionForValue(field.options, value);
  const transitions = (field.stateMachineFacts?.transitions ?? []).map((transition) => ({
    disabledReason: transition.availability?.disabledReason,
    id: transition.transitionName,
    isDisabled: transition.availability?.valid === false,
    label: transition.label,
    operationKey: transition.operationName,
    pending: transition.pending,
    targetValue: transition.transition.to,
  }));
  const selectedTransitionByName = new Map(
    (field.stateMachineFacts?.transitions ?? []).map((transition) => [
      transition.transitionName,
      transition,
    ]),
  );
  const isCompact =
    field.surface === "table-cell" || (isRecordEditorField(field) && field.density === "compact");

  return (
    <FieldChrome field={field} inputId={inputId}>
      <div {...stylex.props(styles.stateMachine, isCompact && styles.stateMachineCompact)}>
        <StateInput
          label={field.label}
          value={value}
          option={option}
          stateLabel={field.stateMachineFacts?.terminal ? "Terminal" : undefined}
          transitions={transitions}
          isCompact={isCompact}
          isDisabled={fieldInteractionIsDisabled(field)}
          isPending={Boolean(field.pending?.isPending)}
          pendingLabel={field.pending?.label}
          onTransition={(transition) => {
            const selectedTransition = selectedTransitionByName.get(transition.id);

            if (!selectedTransition || !field.recordId) {
              return;
            }

            onIntent?.({
              type: "stateTransitionInvoke",
              fieldName: field.fieldName,
              operationName: selectedTransition.operationName,
              recordId: field.recordId,
              source: "button",
              transitionName: selectedTransition.transitionName,
            });
          }}
        />
      </div>
    </FieldChrome>
  );
}

const styles = stylex.create({
  stateMachine: {
    display: "grid",
    minWidth: 0,
    width: "100%",
  },
  stateMachineCompact: {
    gap: spacingVars["--spacing-1"],
  },
});
