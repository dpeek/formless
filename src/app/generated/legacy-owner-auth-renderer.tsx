import { memo } from "react";
import { Button } from "@dpeek/formless-ui/button";
import { Description, FieldGroup, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { TextField } from "@dpeek/formless-ui/text-field";
import type {
  FormlessUiAccountGateAuthSurfaceContract,
  FormlessUiAuthFieldContract,
  FormlessUiAuthIntentHandler,
  FormlessUiAuthSurfaceReference,
  FormlessUiButtonContract,
  FormlessUiCollaboratorInvitationAuthSurfaceContract,
  FormlessUiFieldIntent,
  FormlessUiOwnerSetupAuthSurfaceContract,
  FormlessUiOwnerSignInAuthSurfaceContract,
  FormlessUiSignupAuthSurfaceContract,
} from "@dpeek/formless-astryx/contract";
import {
  useFormlessUiAuthIntentHandler,
  useFormlessUiAuthSurface,
} from "@dpeek/formless-astryx/contract-host/react";

type FormlessUiOwnerAuthSurfaceContract =
  | FormlessUiOwnerSetupAuthSurfaceContract
  | FormlessUiOwnerSignInAuthSurfaceContract;

type FormlessUiAccountAuthSurfaceContract =
  | FormlessUiAccountGateAuthSurfaceContract
  | FormlessUiSignupAuthSurfaceContract;

type FormlessUiLegacyAuthSurfaceContract =
  | FormlessUiAccountAuthSurfaceContract
  | FormlessUiCollaboratorInvitationAuthSurfaceContract
  | FormlessUiOwnerAuthSurfaceContract;

export function LegacyOwnerAuthRenderer({
  onIntent,
  surface,
}: {
  onIntent: FormlessUiAuthIntentHandler;
  surface: FormlessUiOwnerAuthSurfaceContract;
}) {
  return <LegacyAuthRenderer onIntent={onIntent} surface={surface} />;
}

export function LegacyAccountAuthRenderer({
  onIntent,
  surface,
}: {
  onIntent: FormlessUiAuthIntentHandler;
  surface: FormlessUiAccountAuthSurfaceContract;
}) {
  return <LegacyAuthRenderer onIntent={onIntent} surface={surface} />;
}

export function LegacyCollaboratorInvitationAuthRenderer({
  onIntent,
  surface,
}: {
  onIntent: FormlessUiAuthIntentHandler;
  surface: FormlessUiCollaboratorInvitationAuthSurfaceContract;
}) {
  return <LegacyAuthRenderer onIntent={onIntent} surface={surface} />;
}

function LegacyAuthRenderer({
  onIntent,
  surface,
}: {
  onIntent: FormlessUiAuthIntentHandler;
  surface: FormlessUiLegacyAuthSurfaceContract;
}) {
  const headingId = `${surface.id}:heading`;
  const availablePasskey =
    surface.passkey?.availability === "available" ? surface.passkey : undefined;
  const submitAction = surface.actions.find((action) => action.purpose === "submit");
  const formControl = availablePasskey ?? submitAction;
  const form = formControl ? (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onIntent(formControl.intent);
      }}
    >
      {surface.fields.length > 0 ? (
        <FieldGroup>
          {surface.fields.map((field) => (
            <LegacyOwnerAuthField
              field={field}
              key={field.field.fieldId}
              onIntent={onIntent}
              pending={surface.pending}
            />
          ))}
        </FieldGroup>
      ) : null}
      {surface.policies.length > 0 ? (
        <div className="space-y-2">
          {surface.policies.map((policy) => (
            <label
              className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
              key={policy.id}
            >
              <input
                checked={policy.accepted}
                className="mt-1"
                disabled={surface.pending || !policy.selectionIntent}
                onChange={() => {
                  if (policy.selectionIntent) void onIntent(policy.selectionIntent);
                }}
                required={policy.required}
                type="checkbox"
              />
              <span>
                <span className="font-medium">{policy.label}</span>
                {policy.description ? (
                  <span className="block text-muted-fg">{policy.description}</span>
                ) : null}
                {policy.destination ? (
                  <a className="underline" href={policy.destination.href}>
                    {policy.destination.label}
                  </a>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      {surface.feedback ? <LegacyOwnerAuthFeedback feedback={surface.feedback} /> : null}
      <Button className="w-full" isDisabled={formControl.control.disabled} type="submit">
        {buttonLabel(formControl.control)}
      </Button>
    </form>
  ) : null;

  const secondaryActions = surface.actions.filter((action) => action.purpose !== "submit");

  return (
    <section
      aria-labelledby={headingId}
      className="min-h-dvh bg-bg text-fg"
      data-formless-auth-surface={surface.id}
      data-formless-auth-surface-state={surface.state}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-6 rounded-lg border border-border bg-overlay p-6 shadow-sm">
          <header className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              {surface.frame.brand.label}
            </p>
            <h1 className="text-2xl font-semibold" id={headingId}>
              {surface.frame.heading.title}
            </h1>
            {surface.frame.heading.description ? (
              <p className="text-sm text-muted-fg">{surface.frame.heading.description}</p>
            ) : null}
          </header>
          {surface.message ? (
            <p
              aria-live={surface.message.severity === "danger" ? undefined : "polite"}
              className="text-sm text-muted-fg"
              role={surface.message.severity === "danger" ? "alert" : undefined}
            >
              {surface.message.title}
            </p>
          ) : null}
          {surface.facts.length > 0 ? (
            <dl className="space-y-2">
              {surface.facts.map((fact) => (
                <div className="flex justify-between gap-4 text-sm" key={fact.id}>
                  <dt className="text-muted-fg">{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {surface.passkey?.availability === "unavailable" ? (
            <p className="text-sm text-muted-fg" role="alert">
              {surface.passkey.unavailableReason}
            </p>
          ) : null}
          {form}
          {!form && surface.feedback ? (
            <LegacyOwnerAuthFeedback feedback={surface.feedback} />
          ) : null}
          {secondaryActions.length > 0 || surface.continuation ? (
            <div className="flex flex-wrap gap-2">
              {surface.continuation ? (
                <Button
                  isDisabled={surface.continuation.control.disabled}
                  onPress={() => void onIntent(surface.continuation!.intent)}
                  type="button"
                >
                  {buttonLabel(surface.continuation.control)}
                </Button>
              ) : null}
              {secondaryActions.map((action) => (
                <Button
                  intent={action.control.prominence === "primary" ? "primary" : "secondary"}
                  isDisabled={action.control.disabled}
                  key={action.id}
                  onPress={() => void onIntent(action.intent)}
                  type="button"
                >
                  {buttonLabel(action.control)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
export const LegacySubscribedOwnerAuthRenderer = memo(function LegacySubscribedOwnerAuthRenderer({
  reference,
}: {
  reference: FormlessUiAuthSurfaceReference<"owner-setup" | "owner-sign-in">;
}) {
  const surface = useFormlessUiAuthSurface(reference);
  const onIntent = useFormlessUiAuthIntentHandler();
  return surface ? <LegacyOwnerAuthRenderer onIntent={onIntent} surface={surface} /> : null;
});

export const LegacySubscribedAccountAuthRenderer = memo(
  function LegacySubscribedAccountAuthRenderer({
    reference,
  }: {
    reference: FormlessUiAuthSurfaceReference<"account-gate" | "signup">;
  }) {
    const surface = useFormlessUiAuthSurface(reference);
    const onIntent = useFormlessUiAuthIntentHandler();
    return surface ? <LegacyAccountAuthRenderer onIntent={onIntent} surface={surface} /> : null;
  },
);

export const LegacySubscribedCollaboratorInvitationAuthRenderer = memo(
  function LegacySubscribedCollaboratorInvitationAuthRenderer({
    reference,
  }: {
    reference: FormlessUiAuthSurfaceReference<"collaborator-invitation-acceptance">;
  }) {
    const surface = useFormlessUiAuthSurface(reference);
    const onIntent = useFormlessUiAuthIntentHandler();
    return surface ? (
      <LegacyCollaboratorInvitationAuthRenderer onIntent={onIntent} surface={surface} />
    ) : null;
  },
);

function LegacyOwnerAuthField({
  field: authField,
  onIntent,
  pending,
}: {
  field: FormlessUiAuthFieldContract;
  onIntent: FormlessUiAuthIntentHandler;
  pending: boolean;
}) {
  const { field } = authField;
  const value = field.draftInput?.value;
  const error = field.errors?.[0]?.message;
  const disabled = pending || field.pending?.isPending;
  const onValueChange = (nextValue: string | boolean) => {
    const draftInput =
      typeof nextValue === "boolean"
        ? ({ kind: "value", value: nextValue } as const)
        : ({ kind: "input", value: nextValue } as const);
    return void dispatchLegacyOwnerAuthFieldIntent(
      onIntent,
      authField,
      field.surface === "create"
        ? {
            fieldName: field.fieldName,
            fieldValue: draftInput,
            type: "createDraftChange",
          }
        : {
            inputName: field.inputName,
            inputValue: draftInput,
            type: "operationDraftChange",
          },
    );
  };

  if (field.control.controlKind === "checkbox") {
    return (
      <div className="space-y-1">
        <label className="flex items-start gap-3 text-sm">
          <input
            checked={value === true}
            disabled={disabled}
            id={field.fieldId}
            onChange={(event) => onValueChange(event.currentTarget.checked)}
            required={field.required}
            type="checkbox"
          />
          <span>{field.label}</span>
        </label>
        {error ? (
          <p className={fieldErrorStyles()} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.control.controlKind === "select" && field.control.kind === "enum") {
    return (
      <label className="block space-y-1 text-sm" htmlFor={field.fieldId}>
        <span className="font-medium">{field.label}</span>
        <select
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg"
          disabled={disabled}
          id={field.fieldId}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          required={field.required}
          value={typeof value === "string" ? value : ""}
        >
          <option value="">Select</option>
          {Object.entries(field.control.field.values).map(([optionValue, option]) => (
            <option key={optionValue} value={optionValue}>
              {option.label}
            </option>
          ))}
        </select>
        {error ? (
          <p className={fieldErrorStyles()} role="alert">
            {error}
          </p>
        ) : null}
      </label>
    );
  }

  if (field.control.controlKind === "textarea") {
    return (
      <label className="block space-y-1 text-sm" htmlFor={field.fieldId}>
        <span className="font-medium">{field.label}</span>
        <textarea
          autoComplete={authField.autocomplete}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg"
          disabled={disabled}
          id={field.fieldId}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          required={field.required}
          rows={4}
          value={typeof value === "string" ? value : ""}
        />
        {error ? (
          <p className={fieldErrorStyles()} role="alert">
            {error}
          </p>
        ) : null}
      </label>
    );
  }

  const inputType =
    authField.purpose === "email"
      ? "email"
      : field.control.controlKind === "date"
        ? "date"
        : field.control.controlKind === "number"
          ? "number"
          : "text";

  return (
    <TextField
      isDisabled={disabled}
      isInvalid={error !== undefined}
      isRequired={field.required}
      onChange={onValueChange}
      type={inputType}
      value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
    >
      <Label htmlFor={field.fieldId}>{field.label}</Label>
      <Input autoComplete={authField.autocomplete} id={field.fieldId} />
      {!field.required ? <Description>Optional</Description> : null}
      {error ? (
        <p className={fieldErrorStyles()} role="alert">
          {error}
        </p>
      ) : null}
    </TextField>
  );
}
function LegacyOwnerAuthFeedback({
  feedback,
}: {
  feedback: NonNullable<FormlessUiLegacyAuthSurfaceContract["feedback"]>;
}) {
  return (
    <div role={feedback.severity === "danger" ? "alert" : "status"}>
      <p className={feedback.severity === "danger" ? fieldErrorStyles() : "text-sm text-muted-fg"}>
        {feedback.title}
        {feedback.detail ? `: ${feedback.detail}` : ""}
      </p>
    </div>
  );
}

export function dispatchLegacyOwnerAuthFieldIntent(
  onIntent: FormlessUiAuthIntentHandler,
  authField: FormlessUiAuthFieldContract,
  intent: FormlessUiFieldIntent,
) {
  return onIntent({ ...authField.intent, intent });
}

function buttonLabel(button: FormlessUiButtonContract) {
  if (button.pending) {
    return button.pending.label;
  }
  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}
