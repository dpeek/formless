import { Button } from "@dpeek/formless-ui/button";
import { memo } from "react";
import type {
  FormlessUiApplicationSystemStateContract,
  FormlessUiApplicationSystemStateIntentHandler,
  FormlessUiApplicationSystemStateReference,
  FormlessUiCompactStatusIntent,
} from "@dpeek/formless-astryx/contract";
import {
  useFormlessUiApplicationSystemState,
  useFormlessUiApplicationSystemStateIntentHandler,
} from "@dpeek/formless-astryx/contract-host/react";

export function LegacyApplicationSystemStateRenderer({
  onIntent,
  systemState,
}: {
  onIntent: FormlessUiApplicationSystemStateIntentHandler;
  systemState: FormlessUiApplicationSystemStateContract;
}) {
  const headingId = `${systemState.id}:heading`;
  const loading = systemState.state === "loading";

  return (
    <section
      aria-busy={loading || undefined}
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-3xl space-y-4 px-6 py-10"
      data-formless-application-system-state={systemState.id}
      data-formless-application-system-state-kind={systemState.state}
      role={systemState.state === "failure" ? "alert" : loading ? "status" : "region"}
    >
      <h1 className="text-2xl font-semibold" id={headingId}>
        {systemState.heading}
      </h1>
      <p aria-live={loading ? "polite" : undefined} className="text-sm text-muted-fg">
        {systemState.message}
      </p>
      {systemState.facts.length > 0 ? (
        <dl className="grid gap-2 text-sm">
          {systemState.facts.map((fact) => (
            <div className="grid gap-1" key={fact.id}>
              <dt className="font-medium">{fact.label}</dt>
              <dd className="text-muted-fg">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {systemState.feedback ? (
        <div
          className={`rounded border px-3 py-2 text-sm ${legacyFeedbackClass(systemState.feedback.intent)}`}
          data-formless-application-system-state-feedback={systemState.feedback.id}
          role={systemState.feedback.intent === "danger" ? "alert" : "status"}
        >
          <p className="font-medium">{systemState.feedback.title}</p>
          {systemState.feedback.detail ? <p>{systemState.feedback.detail}</p> : null}
        </div>
      ) : null}
      {systemState.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {systemState.actions.map((action) => (
            <Button
              aria-label={action.control.accessibilityLabel}
              data-formless-application-system-state-control={action.control.id}
              intent={
                action.control.prominence === "primary"
                  ? "primary"
                  : action.control.prominence === "secondary"
                    ? "outline"
                    : "plain"
              }
              isDisabled={action.control.disabled}
              key={action.id}
              onPress={() => void onIntent(action.intent)}
              type={action.control.type}
            >
              {action.control.content.kind === "iconOnly"
                ? action.control.accessibilityLabel
                : action.control.content.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export const LegacySubscribedApplicationSystemStateRenderer = memo(
  function LegacySubscribedApplicationSystemStateRenderer({
    systemStateReference,
  }: {
    systemStateReference: FormlessUiApplicationSystemStateReference;
  }) {
    const systemState = useFormlessUiApplicationSystemState(systemStateReference);
    const onIntent = useFormlessUiApplicationSystemStateIntentHandler();

    return systemState ? (
      <LegacyApplicationSystemStateRenderer onIntent={onIntent} systemState={systemState} />
    ) : null;
  },
  (previous, next) => previous.systemStateReference.stateId === next.systemStateReference.stateId,
);

function legacyFeedbackClass(intent: FormlessUiCompactStatusIntent): string {
  switch (intent) {
    case "danger":
      return "border-danger/30 bg-danger/10 text-danger";
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning-fg";
    case "success":
      return "border-success/30 bg-success/10 text-success-fg";
    case "info":
    case "neutral":
      return "border-border bg-overlay text-fg";
  }
}
