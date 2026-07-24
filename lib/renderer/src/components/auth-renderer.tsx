import * as stylex from "@stylexjs/stylex";
import { Banner, type BannerStatus } from "@astryxdesign/core/Banner";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { colorVars, spacingVars, typeScaleVars } from "@astryxdesign/core/theme/tokens.stylex";
import { Fragment, memo, type FormEvent } from "react";
import type {
  AuthFieldContract,
  AuthIntent,
  AuthIntentHandler,
  AuthMessageSeverity,
  AuthSurfaceContract,
  AuthSurfaceReference,
  ButtonContract,
  FieldIntent,
} from "@dpeek/formless-presentation/contract";
import { useAuthIntentHandler, useAuthSurface } from "@dpeek/formless-presentation/host/react";
import {
  editorFieldValue,
  emitFieldDraftChange,
  fieldChromeProps,
  fieldInteractionIsDisabled,
  formatInputValue,
  inputSize,
} from "./fields/field-chrome.tsx";
import { FieldRenderer } from "./fields/field-renderer.tsx";

export function AstryxAuthRenderer({
  onIntent,
  surface,
}: {
  onIntent: AuthIntentHandler;
  surface: AuthSurfaceContract;
}) {
  const headingId = `${surface.id}:heading`;
  const availablePasskey =
    surface.passkey?.availability === "available" ? surface.passkey : undefined;
  const unavailablePasskey =
    surface.passkey?.availability === "unavailable" ? surface.passkey : undefined;
  const submitAction = surface.actions.find((action) => action.purpose === "submit");
  const formControl = availablePasskey ?? submitAction;
  const secondaryActions = surface.actions.filter((action) => action.purpose !== "submit");
  const formContent = (
    <>
      {surface.fields.length > 0 ? (
        <fieldset disabled={surface.pending} {...stylex.props(styles.fieldSet)}>
          <FormLayout direction="vertical">
            {surface.fields.map((field) => (
              <AstryxAuthField
                authField={field}
                key={field.field.fieldId}
                onIntent={onIntent}
                pending={surface.pending}
              />
            ))}
          </FormLayout>
        </fieldset>
      ) : null}
      {surface.policies.length > 0 ? (
        <VStack gap={3} width="100%">
          {surface.policies.map((policy) => (
            <VStack
              data-formless-astryx-auth-policy={policy.id}
              gap={2}
              key={policy.id}
              width="100%"
            >
              <CheckboxInput
                description={policy.description}
                isDisabled={surface.pending}
                isReadOnly={!policy.selectionIntent}
                isRequired={policy.required}
                label={policy.label}
                value={policy.accepted}
                width="100%"
                onChange={() => {
                  if (policy.selectionIntent && !surface.pending) {
                    void onIntent(policy.selectionIntent);
                  }
                }}
              />
              {policy.destination ? (
                <Text color="secondary" display="block" type="supporting">
                  <a
                    data-formless-astryx-auth-policy-destination={policy.id}
                    href={policy.destination.href}
                    {...stylex.props(styles.link)}
                  >
                    {policy.destination.label}
                  </a>
                </Text>
              ) : null}
            </VStack>
          ))}
        </VStack>
      ) : null}
      {surface.feedback ? <AstryxAuthStatus status={surface.feedback} /> : null}
      {formControl ? (
        <AstryxAuthButton
          button={formControl.control}
          controlKind={availablePasskey ? "passkey" : "action"}
          disabled={surface.pending}
        />
      ) : null}
    </>
  );

  return (
    <main
      aria-label={surface.frame.accessibilityLabel}
      data-formless-astryx-auth-frame={surface.id}
      {...stylex.props(styles.screen)}
    >
      <section
        aria-labelledby={headingId}
        data-formless-astryx-auth-surface={surface.id}
        data-formless-astryx-auth-surface-kind={surface.surfaceKind}
        data-formless-astryx-auth-surface-state={surface.state}
        data-formless-astryx-auth-surface-step={"step" in surface ? surface.step : undefined}
        {...stylex.props(styles.frame)}
      >
        <VStack gap={5} hAlign="center" width="100%">
          <Text display="block" type="label" weight="medium">
            {surface.frame.brand.label}
          </Text>
          <Card data-formless-astryx-auth-card={surface.id} padding={6} width="100%">
            <VStack gap={5} width="100%">
              <VStack gap={2} hAlign="center" width="100%">
                <Heading id={headingId} level={1}>
                  {surface.frame.heading.title}
                </Heading>
                {surface.frame.heading.description ? (
                  <Text color="secondary" justify="center" type="body">
                    {surface.frame.heading.description}
                  </Text>
                ) : null}
              </VStack>
              {surface.state === "loading" ? (
                <VStack
                  data-formless-astryx-auth-loading={surface.id}
                  gap={3}
                  hAlign="center"
                  width="100%"
                >
                  <Spinner
                    aria-label={surface.message?.title ?? `Loading ${surface.frame.heading.title}`}
                    size="lg"
                  />
                </VStack>
              ) : null}
              {surface.message && !unavailablePasskey ? (
                <AstryxAuthStatus status={surface.message} />
              ) : null}
              {surface.facts.length > 0 ? <AstryxAuthFacts surface={surface} /> : null}
              {unavailablePasskey ? (
                <Banner
                  container="card"
                  data-formless-astryx-auth-passkey={unavailablePasskey.id}
                  status="warning"
                  title={unavailablePasskey.unavailableReason}
                />
              ) : null}
              {formControl ? (
                <form
                  data-formless-astryx-auth-form={surface.id}
                  noValidate
                  onSubmit={(event) =>
                    submitAstryxAuthForm(event, surface, formControl.intent, onIntent)
                  }
                  {...stylex.props(styles.form)}
                >
                  {formContent}
                </form>
              ) : (
                <VStack gap={4} width="100%">
                  {formContent}
                </VStack>
              )}
              {surface.continuation || secondaryActions.length > 0 ? (
                <HStack gap={2} justify="end" width="100%" wrap="wrap">
                  {surface.continuation ? (
                    <AstryxAuthButton
                      button={surface.continuation.control}
                      controlKind="continuation"
                      disabled={surface.pending}
                      onPress={() => onIntent(surface.continuation!.intent)}
                    />
                  ) : null}
                  {secondaryActions.map((action) => (
                    <AstryxAuthButton
                      button={action.control}
                      controlKind="action"
                      disabled={surface.pending}
                      key={action.id}
                      onPress={() => onIntent(action.intent)}
                    />
                  ))}
                </HStack>
              ) : null}
            </VStack>
          </Card>
        </VStack>
      </section>
    </main>
  );
}

export const AstryxSubscribedAuthRenderer = memo(
  function AstryxSubscribedAuthRenderer({ reference }: { reference: AuthSurfaceReference }) {
    const surface = useAuthSurface(reference);
    const onIntent = useAuthIntentHandler();

    return surface ? <AstryxAuthRenderer onIntent={onIntent} surface={surface} /> : null;
  },
  (previous, next) =>
    previous.reference.surfaceId === next.reference.surfaceId &&
    previous.reference.surfaceKind === next.reference.surfaceKind,
);

function AstryxAuthField({
  authField,
  onIntent,
  pending,
}: {
  authField: AuthFieldContract;
  onIntent: AuthIntentHandler;
  pending: boolean;
}) {
  const { field } = authField;
  const fieldIntent = (intent: FieldIntent) =>
    dispatchAstryxAuthFieldIntent(onIntent, authField, intent);
  const isDisabled = pending || fieldInteractionIsDisabled(field);
  const chrome = fieldChromeProps(field);

  if (field.control.controlKind === "text") {
    return (
      <TextInput
        {...chrome}
        {...authAutocompleteProps(authField.autocomplete)}
        data-formless-astryx-auth-field={field.fieldId}
        htmlName={field.surface === "create" ? field.fieldName : field.inputName}
        isDisabled={isDisabled}
        isLoading={!pending && Boolean(field.pending?.isPending)}
        isOptional={!field.required}
        size={inputSize(field)}
        type={authField.autocomplete === "email" ? "email" : "text"}
        value={formatInputValue(editorFieldValue(field))}
        onChange={(value) => emitFieldDraftChange(field, value, fieldIntent)}
      />
    );
  }

  if (field.control.controlKind === "textarea") {
    return (
      <TextArea
        {...chrome}
        {...authAutocompleteProps(authField.autocomplete)}
        data-formless-astryx-auth-field={field.fieldId}
        htmlName={field.surface === "create" ? field.fieldName : field.inputName}
        isDisabled={isDisabled}
        isLoading={!pending && Boolean(field.pending?.isPending)}
        isOptional={!field.required}
        rows={4}
        size={inputSize(field)}
        value={formatInputValue(editorFieldValue(field))}
        onChange={(value) => emitFieldDraftChange(field, value, fieldIntent)}
      />
    );
  }

  return (
    <div data-formless-astryx-auth-field={field.fieldId}>
      <FieldRenderer field={field} inputId={field.fieldId} onIntent={fieldIntent} />
    </div>
  );
}

function AstryxAuthFacts({ surface }: { surface: AuthSurfaceContract }) {
  return (
    <dl data-formless-astryx-auth-facts={surface.id} {...stylex.props(styles.facts)}>
      {surface.facts.map((fact) => (
        <Fragment key={fact.id}>
          <dt>
            <Text as="span" color="secondary" type="supporting">
              {fact.label}
            </Text>
          </dt>
          <dd {...stylex.props(styles.factValue)}>
            <Text as="span" type="supporting">
              {fact.value}
            </Text>
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

function AstryxAuthStatus({
  status,
}: {
  status: {
    detail?: string;
    id: string;
    severity: AuthMessageSeverity;
    title: string;
  };
}) {
  return (
    <Banner
      container="card"
      data-formless-astryx-auth-status={status.id}
      description={status.detail}
      status={astryxAuthStatus(status.severity)}
      title={status.title}
    />
  );
}

function AstryxAuthButton({
  button,
  controlKind,
  disabled,
  onPress,
}: {
  button: ButtonContract;
  controlKind: "action" | "continuation" | "passkey";
  disabled: boolean;
  onPress?: (() => Promise<void> | void) | undefined;
}) {
  const pending = Boolean(button.pending?.isPending);
  const content = button.content;

  return (
    <Button
      data-formless-astryx-auth-control={button.id}
      data-formless-astryx-auth-control-kind={controlKind}
      isDisabled={Boolean(button.disabled || disabled || pending)}
      isIconOnly={content.kind === "iconOnly"}
      isLoading={pending}
      label={button.accessibilityLabel}
      onClick={
        onPress && !button.disabled && !disabled && !pending
          ? () => {
              void onPress();
            }
          : undefined
      }
      size={button.density === "compact" ? "sm" : "md"}
      tooltip={button.disabledReason}
      type={button.type}
      variant={astryxAuthButtonVariant(button.prominence)}
      xstyle={styles.action}
    >
      {content.kind === "iconOnly" ? undefined : (button.pending?.label ?? content.label)}
    </Button>
  );
}

export function dispatchAstryxAuthFieldIntent(
  onIntent: AuthIntentHandler,
  authField: AuthFieldContract,
  intent: FieldIntent,
) {
  return onIntent({ ...authField.intent, intent });
}

function submitAstryxAuthForm(
  event: FormEvent<HTMLFormElement>,
  surface: AuthSurfaceContract,
  intent: AuthIntent,
  onIntent: AuthIntentHandler,
) {
  event.preventDefault();

  if (!surface.pending) {
    void onIntent(intent);
  }
}

function astryxAuthStatus(severity: AuthMessageSeverity): BannerStatus {
  return severity === "danger" ? "error" : severity;
}

function astryxAuthButtonVariant(prominence: ButtonContract["prominence"]): ButtonVariant {
  return prominence === "primary" ? "primary" : prominence === "quiet" ? "ghost" : "secondary";
}

function authAutocompleteProps(autocomplete: AuthFieldContract["autocomplete"]) {
  return autocomplete ? { autoComplete: autocomplete } : {};
}

const styles = stylex.create({
  screen: {
    alignItems: "center",
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
    display: "grid",
    minHeight: "100vh",
    paddingBlock: spacingVars["--spacing-10"],
    paddingInline: spacingVars["--spacing-5"],
  },
  frame: {
    marginInline: "auto",
    width: "min(100%, 480px)",
  },
  form: {
    display: "grid",
    gap: spacingVars["--spacing-4"],
    width: "100%",
  },
  fieldSet: {
    borderWidth: 0,
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
  facts: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    margin: 0,
    width: "100%",
  },
  factValue: {
    margin: 0,
    overflowWrap: "anywhere",
    textAlign: "end",
  },
  link: {
    color: colorVars["--color-text-primary"],
    fontSize: typeScaleVars["--text-supporting-size"],
  },
  action: {
    width: "100%",
  },
});
