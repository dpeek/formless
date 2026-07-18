import { Button } from "@dpeek/formless-ui/button";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { FieldGroup, Fieldset, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import {
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import { TextField } from "@dpeek/formless-ui/text-field";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiAccessActionContract,
  FormlessUiAccessConfirmationContract,
  FormlessUiAccessControlledFieldContract,
  FormlessUiAccessDisplayFactContract,
  FormlessUiAccessFeedbackContract,
  FormlessUiAccessGrantSelectionContract,
  FormlessUiAccessIntentHandler,
  FormlessUiAccessInvitationAuthoringContract,
  FormlessUiAccessInvitationContract,
  FormlessUiAccessManifestContract,
  FormlessUiAccessManifestReference,
  FormlessUiAccessPersonContract,
  FormlessUiAccessReadyContract,
  FormlessUiButtonContract,
} from "@dpeek/formless-astryx/contract";
import {
  useFormlessUiAccessIntentHandler,
  useFormlessUiAccessInvitationAuthoring,
  useFormlessUiAccessManifest,
} from "@dpeek/formless-astryx/contract-host/react";

export function LegacyAccessRenderer({
  authoring,
  manifest,
  onIntent,
}: {
  authoring?: FormlessUiAccessInvitationAuthoringContract | undefined;
  manifest: FormlessUiAccessManifestContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <LegacyAccessFrame manifest={manifest} onIntent={onIntent}>
      {manifest.state === "ready" ? (
        <LegacyAccessReadyContent authoring={authoring} manifest={manifest} onIntent={onIntent} />
      ) : null}
    </LegacyAccessFrame>
  );
}

export const LegacySubscribedAccessRenderer = memo(
  function LegacySubscribedAccessRenderer({
    accessReference,
  }: {
    accessReference: FormlessUiAccessManifestReference;
  }) {
    const manifest = useFormlessUiAccessManifest(accessReference);
    const onIntent = useFormlessUiAccessIntentHandler();

    if (!manifest) {
      return null;
    }

    return (
      <LegacyAccessFrame manifest={manifest} onIntent={onIntent}>
        {manifest.state === "ready" ? (
          <LegacySubscribedAccessReadyContent manifest={manifest} />
        ) : null}
      </LegacyAccessFrame>
    );
  },
  (previous, next) => previous.accessReference.accessId === next.accessReference.accessId,
);

function LegacySubscribedAccessReadyContent({
  manifest,
}: {
  manifest: FormlessUiAccessReadyContract;
}) {
  const authoring = useFormlessUiAccessInvitationAuthoring(manifest.authoring);
  const onIntent = useFormlessUiAccessIntentHandler();

  return <LegacyAccessReadyContent authoring={authoring} manifest={manifest} onIntent={onIntent} />;
}

function LegacyAccessFrame({
  children,
  manifest,
  onIntent,
}: {
  children?: ReactNode;
  manifest: FormlessUiAccessManifestContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  const headingId = `${manifest.id}:heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6"
      data-formless-access={manifest.id}
      data-formless-access-state={manifest.state}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" id={headingId}>
          {manifest.title}
        </h1>
        {manifest.state === "ready" ? (
          <LegacyAccessAction action={manifest.invite} onIntent={onIntent} />
        ) : null}
      </header>
      {manifest.state === "loading" ? (
        <p aria-live="polite" className="text-sm text-muted-fg">
          {manifest.message}
        </p>
      ) : null}
      {manifest.state === "failed" || manifest.state === "unauthorized" ? (
        <LegacyAccessFeedback feedback={manifest.feedback} />
      ) : null}
      {children}
    </section>
  );
}

function LegacyAccessReadyContent({
  authoring,
  manifest,
  onIntent,
}: {
  authoring?: FormlessUiAccessInvitationAuthoringContract | undefined;
  manifest: FormlessUiAccessReadyContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <>
      {manifest.feedback ? <LegacyAccessFeedback feedback={manifest.feedback} /> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <LegacyAccessPeople people={manifest.people} />
        <LegacyAccessInvitations invitations={manifest.invitations} onIntent={onIntent} />
      </div>
      {authoring ? <LegacyAccessAuthoring authoring={authoring} onIntent={onIntent} /> : null}
      {manifest.confirmation ? (
        <LegacyAccessConfirmation confirmation={manifest.confirmation} onIntent={onIntent} />
      ) : null}
    </>
  );
}

function LegacyAccessPeople({ people }: { people: readonly FormlessUiAccessPersonContract[] }) {
  return (
    <section aria-labelledby="legacy-access-people-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" id="legacy-access-people-heading">
          People
        </h2>
        <span className="text-xs text-muted-fg">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-fg">No people.</p>
      ) : (
        <ol className="grid gap-3">
          {people.map((person) => (
            <li className="rounded-md border border-border bg-overlay p-4" key={person.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{person.displayName}</h3>
                  {person.primaryEmail ? (
                    <p className="break-words text-xs text-muted-fg">{person.primaryEmail}</p>
                  ) : null}
                </div>
                <LegacyAccessFact fact={person.status} />
              </div>
              {person.roles.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {person.roles.map((role) => (
                    <li className="rounded border border-border px-2 py-1 text-xs" key={role.id}>
                      <span className="font-medium">{role.label}</span>
                      {role.scope ? (
                        <span className="text-muted-fg"> · {role.scope.value}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LegacyAccessInvitations({
  invitations,
  onIntent,
}: {
  invitations: readonly FormlessUiAccessInvitationContract[];
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <section aria-labelledby="legacy-access-invitations-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" id="legacy-access-invitations-heading">
          Invitations
        </h2>
        <span className="text-xs text-muted-fg">{invitations.length}</span>
      </div>
      {invitations.length === 0 ? (
        <p className="text-sm text-muted-fg">No invitations.</p>
      ) : (
        <ol className="grid gap-3">
          {invitations.map((invitation) => (
            <li className="rounded-md border border-border bg-overlay p-4" key={invitation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-medium">{invitation.targetEmail}</h3>
                  <p className="text-xs text-muted-fg">{invitation.target.value}</p>
                </div>
                <LegacyAccessFact fact={invitation.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <LegacyAccessDefinition fact={invitation.scope} />
                <LegacyAccessDefinition fact={invitation.expiresAt} />
                <LegacyAccessDefinition fact={invitation.inviter} />
              </dl>
              {invitation.revocation.availability === "available" ? (
                <div className="mt-3">
                  <LegacyAccessAction
                    action={invitation.revocation.action}
                    danger
                    onIntent={onIntent}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LegacyAccessDefinition({
  fact,
}: {
  fact?: FormlessUiAccessDisplayFactContract | undefined;
}) {
  if (!fact) {
    return null;
  }

  return (
    <div>
      <dt className="font-medium text-fg">{fact.label}</dt>
      <dd className="text-muted-fg">
        {fact.presentation === "timestamp" ? (
          <time dateTime={fact.value}>{fact.value}</time>
        ) : (
          fact.value
        )}
      </dd>
    </div>
  );
}

function LegacyAccessFact({ fact }: { fact: FormlessUiAccessDisplayFactContract }) {
  return (
    <span
      className="rounded border border-border px-2 py-1 text-xs text-muted-fg"
      data-formless-access-fact={fact.id}
    >
      {fact.value}
    </span>
  );
}

function LegacyAccessAuthoring({
  authoring,
  onIntent,
}: {
  authoring: FormlessUiAccessInvitationAuthoringContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  if (!authoring.open) {
    return null;
  }

  return (
    <ModalContent
      isOpen={authoring.open}
      onOpenChange={(open) => void onIntent({ ...authoring.cancel.intent, open })}
      size="lg"
    >
      <LegacyAccessAuthoringContent authoring={authoring} onIntent={onIntent} />
    </ModalContent>
  );
}

export function LegacyAccessAuthoringContent({
  authoring,
  onIntent,
}: {
  authoring: FormlessUiAccessInvitationAuthoringContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <form
      className="contents"
      data-formless-access-authoring={authoring.id}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onIntent(authoring.submit.intent);
      }}
    >
      <ModalHeader>
        <ModalTitle>{authoring.title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          <FieldGroup className="space-y-4">
            {[
              authoring.fields.targetEmail,
              authoring.fields.displayName,
              authoring.fields.targetSurface,
              ...(authoring.fields.targetSurface.value === "app-install"
                ? [authoring.fields.targetAppInstall]
                : []),
              ...(authoring.fields.targetSurface.value === "organization"
                ? [authoring.fields.targetOrganization]
                : []),
            ].map((field) => (
              <LegacyAccessField field={field} key={field.id} onIntent={onIntent} />
            ))}
          </FieldGroup>
          {authoring.grantSelections.map((selection) => (
            <LegacyAccessGrantSelection
              key={selection.id}
              onIntent={onIntent}
              selection={selection}
            />
          ))}
          {authoring.errors.length > 0 ? (
            <ul className="space-y-1" role="alert">
              {authoring.errors.map((error) => (
                <li className={fieldErrorStyles()} data-slot="field-error" key={error}>
                  {error}
                </li>
              ))}
            </ul>
          ) : null}
          {authoring.feedback ? <LegacyAccessFeedback feedback={authoring.feedback} /> : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <LegacyAccessAction action={authoring.cancel} onIntent={onIntent} />
        <LegacyAccessAction action={authoring.submit} onIntent={onIntent} />
      </ModalFooter>
    </form>
  );
}

function LegacyAccessField({
  field,
  onIntent,
}: {
  field: FormlessUiAccessControlledFieldContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  const disabled = field.disabledReason !== undefined;

  if (field.inputKind === "select") {
    return (
      <div className="space-y-1" title={field.disabledReason}>
        <NativeSelect>
          <Label htmlFor={field.id}>{field.label}</Label>
          <NativeSelectContent
            aria-describedby={field.errors.length > 0 ? `${field.id}:errors` : undefined}
            disabled={disabled}
            id={field.id}
            name={field.purpose}
            onChange={(event) =>
              void dispatchLegacyAccessFieldChange(onIntent, field, event.target.value)
            }
            required={field.required}
            value={field.value}
          >
            {field.options?.map((option) => (
              <option
                disabled={option.disabledReason !== undefined}
                key={option.id}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </NativeSelectContent>
        </NativeSelect>
        <LegacyAccessFieldErrors field={field} />
      </div>
    );
  }

  return (
    <div className="space-y-1" title={field.disabledReason}>
      <TextField
        isDisabled={disabled}
        isRequired={field.required}
        onChange={(value) => void dispatchLegacyAccessFieldChange(onIntent, field, value)}
        type={field.inputKind === "email" ? "email" : "text"}
        value={field.value}
      >
        <Label>{field.label}</Label>
        <Input
          aria-describedby={field.errors.length > 0 ? `${field.id}:errors` : undefined}
          id={field.id}
          name={field.purpose}
          type={field.inputKind === "datetime" ? "datetime-local" : undefined}
        />
      </TextField>
      <LegacyAccessFieldErrors field={field} />
    </div>
  );
}

function LegacyAccessFieldErrors({ field }: { field: FormlessUiAccessControlledFieldContract }) {
  return field.errors.length > 0 ? (
    <ul id={`${field.id}:errors`}>
      {field.errors.map((error) => (
        <li className={fieldErrorStyles()} data-slot="field-error" key={error}>
          {error}
        </li>
      ))}
    </ul>
  ) : null;
}

function LegacyAccessGrantSelection({
  onIntent,
  selection,
}: {
  onIntent: FormlessUiAccessIntentHandler;
  selection: FormlessUiAccessGrantSelectionContract;
}) {
  return (
    <Fieldset
      className="space-y-3"
      disabled={selection.disabledReason !== undefined}
      title={selection.disabledReason}
    >
      <legend className="text-sm font-medium">{selection.label}</legend>
      {selection.groups.map((group) => (
        <section aria-label={group.label} className="space-y-2" key={group.id}>
          <h3 className="text-xs font-medium text-muted-fg">{group.label}</h3>
          <div className="grid gap-2">
            {group.options.map((option) => (
              <span key={option.id} title={option.disabledReason}>
                <Checkbox
                  isDisabled={option.disabledReason !== undefined}
                  isSelected={option.selected}
                  onChange={(selected) =>
                    void dispatchLegacyAccessGrantSelection(
                      onIntent,
                      option.selectionIntent,
                      selected,
                    )
                  }
                >
                  {option.label}
                </Checkbox>
              </span>
            ))}
          </div>
        </section>
      ))}
    </Fieldset>
  );
}

function LegacyAccessConfirmation({
  confirmation,
  onIntent,
}: {
  confirmation: FormlessUiAccessConfirmationContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  if (!confirmation?.open) {
    return null;
  }

  return (
    <ModalContent
      isOpen={confirmation.open}
      onOpenChange={(open) => void onIntent({ ...confirmation.cancel.intent, open })}
      size="md"
    >
      <LegacyAccessConfirmationContent confirmation={confirmation} onIntent={onIntent} />
    </ModalContent>
  );
}

export function LegacyAccessConfirmationContent({
  confirmation,
  onIntent,
}: {
  confirmation: FormlessUiAccessConfirmationContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <>
      <ModalHeader>
        <ModalTitle>{confirmation.title}</ModalTitle>
        <ModalDescription>{confirmation.description}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <p className="text-sm text-muted-fg">This action cannot be undone.</p>
      </ModalBody>
      <ModalFooter>
        <LegacyAccessAction action={confirmation.cancel} onIntent={onIntent} />
        <LegacyAccessAction action={confirmation.action} danger onIntent={onIntent} />
      </ModalFooter>
    </>
  );
}

function LegacyAccessAction({
  action,
  danger = false,
  onIntent,
}: {
  action: FormlessUiAccessActionContract;
  danger?: boolean;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <span title={action.control.disabledReason}>
      <Button
        aria-label={action.control.accessibilityLabel}
        data-formless-access-control={action.control.id}
        intent={danger ? "danger" : legacyAccessButtonIntent(action.control)}
        isDisabled={action.control.disabled}
        onPress={() => void onIntent(action.intent)}
        size={action.control.density === "compact" ? "sm" : undefined}
        type={action.control.type}
      >
        {action.control.content.kind === "iconOnly"
          ? action.control.accessibilityLabel
          : action.control.content.label}
      </Button>
    </span>
  );
}

function LegacyAccessFeedback({ feedback }: { feedback: FormlessUiAccessFeedbackContract }) {
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${legacyAccessFeedbackClass(feedback.intent)}`}
      data-formless-access-feedback={feedback.id}
      role={feedback.intent === "danger" ? "alert" : "status"}
    >
      <p className="font-medium">{feedback.title}</p>
      {feedback.detail ? <p>{feedback.detail}</p> : null}
    </div>
  );
}

function legacyAccessButtonIntent(button: FormlessUiButtonContract) {
  return button.prominence === "primary"
    ? "primary"
    : button.prominence === "secondary"
      ? "outline"
      : "plain";
}

function legacyAccessFeedbackClass(intent: FormlessUiAccessFeedbackContract["intent"]) {
  switch (intent) {
    case "danger":
      return "border-red-300 bg-red-50 text-red-700";
    case "info":
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "success":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "neutral":
      return "border-border bg-muted text-muted-fg";
  }
}

export function dispatchLegacyAccessFieldChange(
  onIntent: FormlessUiAccessIntentHandler,
  field: FormlessUiAccessControlledFieldContract,
  value: string,
) {
  return onIntent({ ...field.changeIntent, value });
}

export function dispatchLegacyAccessGrantSelection(
  onIntent: FormlessUiAccessIntentHandler,
  intent: Extract<
    Parameters<FormlessUiAccessIntentHandler>[0],
    { type: "accessInvitationGrantSelection" }
  >,
  selected: boolean,
) {
  return onIntent({ ...intent, selected });
}
