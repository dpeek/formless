import * as stylex from "@stylexjs/stylex";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { FormlessUiField, FormlessUiFieldIntentHandler } from "../../formless-ui-contract.ts";
import { StateInput } from "../state-input.tsx";
import { FieldChrome, formatInputValue } from "./field-chrome.tsx";
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
  const facts = field.stateMachineFacts;

  if (facts === undefined) {
    return null;
  }

  const value = formatInputValue(facts.currentValue);
  const option = enumOptionForValue(field.options, value);
  const transitionOperations =
    facts.interaction.kind === "transitions"
      ? facts.interaction.transitions.filter(
          (transition) => transition.availability?.valid !== false,
        )
      : [];
  const transitions = transitionOperations.map((transition) => ({
    id: transition.transitionName,
    label: transition.label,
    operationKey: transition.operationName,
    pending: transition.pending,
    targetValue: transition.transition.to,
  }));
  const selectedTransitionByName = new Map(
    transitionOperations.map((transition) => [transition.transitionName, transition]),
  );
  const isCompact = "density" in field && field.density === "compact";

  return (
    <FieldChrome field={field} inputId={inputId}>
      <div {...stylex.props(styles.stateMachine, isCompact && styles.stateMachineCompact)}>
        <StateInput
          label={field.label}
          value={value}
          option={option}
          isTerminal={facts.terminal}
          transitions={transitions}
          isCompact={isCompact}
          isDisabled={stateMachineTransitionControlIsDisabled(field)}
          isPending={Boolean(field.pending?.isPending)}
          pendingLabel={field.pending?.label}
          valueStatus={facts.valueStatus}
          onTransition={(transition) => {
            const selectedTransition = selectedTransitionByName.get(transition.id);

            if (
              !selectedTransition ||
              !field.recordId ||
              facts.interaction.kind !== "transitions"
            ) {
              return;
            }

            void onIntent?.({
              type: "stateTransitionInvoke",
              fieldName: field.fieldName,
              operationName: selectedTransition.operationName,
              recordId: field.recordId,
              source: facts.interaction.invocationSource,
              transitionName: selectedTransition.transitionName,
            });
          }}
        />
      </div>
    </FieldChrome>
  );
}

function stateMachineTransitionControlIsDisabled(field: FormlessUiField) {
  return (
    field.access.kind === "disabled" ||
    field.access.kind === "readOnly" ||
    field.access.kind === "system"
  );
}

const styles = stylex.create({
  stateMachine: {
    display: "inline-block",
    maxWidth: "100%",
    minWidth: 0,
  },
  stateMachineCompact: {
    gap: spacingVars["--spacing-1"],
  },
});
