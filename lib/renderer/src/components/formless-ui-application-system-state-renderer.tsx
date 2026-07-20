import { Banner, type BannerStatus } from "@astryxdesign/core/Banner";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo } from "react";
import type {
  FormlessUiApplicationSystemStateContract,
  FormlessUiApplicationSystemStateIntentHandler,
  FormlessUiApplicationSystemStateReference,
  FormlessUiCompactStatusIntent,
} from "@dpeek/formless-presentation/contract";
import {
  useFormlessUiApplicationSystemState,
  useFormlessUiApplicationSystemStateIntentHandler,
} from "@dpeek/formless-presentation/contract-host/react";

export function AstryxApplicationSystemStateRenderer({
  onIntent,
  systemState,
}: {
  onIntent: FormlessUiApplicationSystemStateIntentHandler;
  systemState: FormlessUiApplicationSystemStateContract;
}) {
  const loading = systemState.state === "loading";

  return (
    <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
      <Section
        aria-busy={loading || undefined}
        aria-label={systemState.accessibilityLabel}
        data-formless-astryx-application-system-state={systemState.id}
        data-formless-astryx-application-system-state-kind={systemState.state}
        maxWidth={640}
        padding={0}
        role={systemState.state === "failure" ? "alert" : loading ? "status" : "region"}
        variant="transparent"
        width="100%"
      >
        <VStack gap={4} width="100%">
          <EmptyState
            actions={
              systemState.actions.length > 0 ? (
                <>
                  {systemState.actions.map((action) => (
                    <Button
                      data-formless-astryx-application-system-state-control={action.control.id}
                      isDisabled={Boolean(action.control.disabled)}
                      key={action.id}
                      label={action.control.accessibilityLabel}
                      onClick={() => void onIntent(action.intent)}
                      type={action.control.type}
                      variant={astryxButtonVariant(action.control.prominence)}
                    >
                      {action.control.content.kind === "iconOnly"
                        ? undefined
                        : action.control.content.label}
                    </Button>
                  ))}
                </>
              ) : undefined
            }
            description={systemState.message}
            headingLevel={1}
            icon={loading ? <Spinner aria-label={systemState.message} size="md" /> : undefined}
            isCompact
            title={systemState.heading}
          />
          {systemState.facts.length > 0 ? (
            <dl aria-label={`${systemState.accessibilityLabel} details`}>
              {systemState.facts.map((fact) => (
                <div key={fact.id}>
                  <dt>
                    <Text weight="medium">{fact.label}</Text>
                  </dt>
                  <dd>
                    <Text color="secondary">{fact.value}</Text>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {systemState.feedback ? (
            <Banner
              container="card"
              data-formless-astryx-application-system-state-feedback={systemState.feedback.id}
              description={systemState.feedback.detail}
              status={astryxFeedbackStatus(systemState.feedback.intent)}
              title={systemState.feedback.title}
            />
          ) : null}
        </VStack>
      </Section>
    </VStack>
  );
}

export const AstryxSubscribedApplicationSystemStateRenderer = memo(
  function AstryxSubscribedApplicationSystemStateRenderer({
    systemStateReference,
  }: {
    systemStateReference: FormlessUiApplicationSystemStateReference;
  }) {
    const systemState = useFormlessUiApplicationSystemState(systemStateReference);
    const onIntent = useFormlessUiApplicationSystemStateIntentHandler();

    return systemState ? (
      <AstryxApplicationSystemStateRenderer onIntent={onIntent} systemState={systemState} />
    ) : null;
  },
  (previous, next) => previous.systemStateReference.stateId === next.systemStateReference.stateId,
);

function astryxButtonVariant(prominence: "primary" | "quiet" | "secondary"): ButtonVariant {
  return prominence === "primary" ? "primary" : prominence === "quiet" ? "ghost" : "secondary";
}

function astryxFeedbackStatus(intent: FormlessUiCompactStatusIntent): BannerStatus {
  switch (intent) {
    case "danger":
      return "error";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
    case "neutral":
      return "info";
  }
}
