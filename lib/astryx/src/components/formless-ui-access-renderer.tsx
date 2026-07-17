import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { Banner, type BannerStatus } from "@astryxdesign/core/Banner";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { DateTimeInput, type ISODateTimeString } from "@astryxdesign/core/DateTimeInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type FormEvent, type ReactNode } from "react";
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
} from "../formless-ui-contract.ts";
import {
  useFormlessUiAccessIntentHandler,
  useFormlessUiAccessInvitationAuthoring,
  useFormlessUiAccessManifest,
} from "../formless-ui-contract-host-react.tsx";
import { operationIcon } from "./operation-controls.tsx";

const SEARCHABLE_OPTION_COUNT = 15;

export function AstryxAccessRenderer({
  authoring,
  manifest,
  onIntent,
}: {
  authoring?: FormlessUiAccessInvitationAuthoringContract | undefined;
  manifest: FormlessUiAccessManifestContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <AstryxAccessFrame manifest={manifest} onIntent={onIntent}>
      {manifest.state === "ready" ? (
        <AstryxAccessReadyContent authoring={authoring} manifest={manifest} onIntent={onIntent} />
      ) : null}
    </AstryxAccessFrame>
  );
}

export const AstryxSubscribedAccessRenderer = memo(
  function AstryxSubscribedAccessRenderer({
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
      <AstryxAccessFrame manifest={manifest} onIntent={onIntent}>
        {manifest.state === "ready" ? (
          <AstryxSubscribedAccessReadyContent manifest={manifest} />
        ) : null}
      </AstryxAccessFrame>
    );
  },
  (previous, next) => previous.accessReference.accessId === next.accessReference.accessId,
);

function AstryxSubscribedAccessReadyContent({
  manifest,
}: {
  manifest: FormlessUiAccessReadyContract;
}) {
  const authoring = useFormlessUiAccessInvitationAuthoring(manifest.authoring);
  const onIntent = useFormlessUiAccessIntentHandler();

  return <AstryxAccessReadyContent authoring={authoring} manifest={manifest} onIntent={onIntent} />;
}

function AstryxAccessFrame({
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
    <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
      <Section
        aria-labelledby={headingId}
        data-formless-astryx-access={manifest.id}
        data-formless-astryx-access-state={manifest.state}
        maxWidth={1200}
        padding={0}
        variant="transparent"
        width="100%"
      >
        <VStack gap={6} width="100%">
          <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
            <Heading id={headingId} level={1}>
              {manifest.title}
            </Heading>
            {manifest.state === "ready" ? (
              <AstryxAccessAction action={manifest.invite} onIntent={onIntent} />
            ) : null}
          </HStack>
          {manifest.state === "loading" ? (
            <EmptyState
              description={manifest.message}
              headingLevel={2}
              icon={<Spinner aria-label={manifest.message} size="md" />}
              isCompact
              title={manifest.title}
            />
          ) : null}
          {manifest.state === "failed" || manifest.state === "unauthorized" ? (
            <AstryxAccessFeedback feedback={manifest.feedback} />
          ) : null}
          {children}
        </VStack>
      </Section>
    </VStack>
  );
}

function AstryxAccessReadyContent({
  authoring,
  manifest,
  onIntent,
}: {
  authoring?: FormlessUiAccessInvitationAuthoringContract | undefined;
  manifest: FormlessUiAccessReadyContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <VStack gap={6} width="100%">
      {manifest.feedback ? <AstryxAccessFeedback feedback={manifest.feedback} /> : null}
      {manifest.emptyState ? (
        <EmptyState
          data-formless-astryx-access-empty={manifest.emptyState.id}
          description={manifest.emptyState.description}
          title={manifest.emptyState.title}
        />
      ) : null}
      <Grid columns={{ max: 2, minWidth: 360, repeat: "fit" }} gap={6} width="100%">
        <AstryxAccessPeople accessId={manifest.id} people={manifest.people} />
        <AstryxAccessInvitations
          accessId={manifest.id}
          invitations={manifest.invitations}
          onIntent={onIntent}
        />
      </Grid>
      {authoring ? (
        <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={onIntent} />
      ) : null}
      {manifest.confirmation ? (
        <AstryxAccessConfirmation confirmation={manifest.confirmation} onIntent={onIntent} />
      ) : null}
    </VStack>
  );
}

type AstryxAccessPersonRow = {
  id: string;
  person: FormlessUiAccessPersonContract;
} & Record<string, unknown>;

function AstryxAccessPeople({
  accessId,
  people,
}: {
  accessId: string;
  people: readonly FormlessUiAccessPersonContract[];
}) {
  const headingId = `${accessId}:people-heading`;
  const rows = people.map((person) => ({ id: person.id, person }));
  const columns: TableColumn<AstryxAccessPersonRow>[] = [
    {
      header: "Person",
      key: "person",
      renderCell: ({ person }) => (
        <VStack gap={0.5}>
          <Text type="body" weight="medium">
            {person.displayName}
          </Text>
          {person.primaryEmail ? (
            <Text color="secondary" type="supporting">
              {person.primaryEmail}
            </Text>
          ) : null}
        </VStack>
      ),
      width: proportional(1, { minWidth: 160 }),
    },
    {
      header: "Roles",
      key: "roles",
      renderCell: ({ person }) => (
        <VStack gap={1}>
          {person.roles.map((role) => (
            <VStack data-formless-astryx-access-role={role.id} gap={0.5} key={role.id}>
              <Text type="supporting" weight="medium">
                {role.label}
              </Text>
              <HStack gap={1} wrap="wrap">
                {role.scope ? <AstryxAccessFact fact={role.scope} /> : null}
                {role.status ? <AstryxAccessFact fact={role.status} /> : null}
              </HStack>
            </VStack>
          ))}
        </VStack>
      ),
      width: proportional(1, { minWidth: 180 }),
    },
    {
      header: "Status",
      key: "status",
      renderCell: ({ person }) => <AstryxAccessFact fact={person.status} />,
      width: pixel(104),
    },
  ];

  return (
    <Section aria-labelledby={headingId} padding={0} variant="transparent" width="100%">
      <VStack gap={3} width="100%">
        <HStack align="center" gap={2} justify="between" width="100%">
          <Heading id={headingId} level={2}>
            People
          </Heading>
          <Badge label={people.length} variant="neutral" />
        </HStack>
        <Table<AstryxAccessPersonRow>
          columns={columns}
          data={rows}
          density="balanced"
          dividers="rows"
          idKey="id"
          tableProps={{ "aria-labelledby": headingId }}
          textOverflow="wrap"
          verticalAlign="top"
        />
      </VStack>
    </Section>
  );
}

type AstryxAccessInvitationRow = {
  id: string;
  invitation: FormlessUiAccessInvitationContract;
} & Record<string, unknown>;

function AstryxAccessInvitations({
  accessId,
  invitations,
  onIntent,
}: {
  accessId: string;
  invitations: readonly FormlessUiAccessInvitationContract[];
  onIntent: FormlessUiAccessIntentHandler;
}) {
  const headingId = `${accessId}:invitations-heading`;
  const rows = invitations.map((invitation) => ({ id: invitation.id, invitation }));
  const columns: TableColumn<AstryxAccessInvitationRow>[] = [
    {
      header: "Invitation",
      key: "invitation",
      renderCell: ({ invitation }) => (
        <VStack gap={0.5}>
          <Text type="body" weight="medium">
            {invitation.targetEmail}
          </Text>
          <Text color="secondary" type="supporting">
            {invitation.target.value}
          </Text>
        </VStack>
      ),
      width: proportional(1, { minWidth: 180 }),
    },
    {
      header: "Scope",
      key: "scope",
      renderCell: ({ invitation }) =>
        invitation.scope ? <AstryxAccessFact fact={invitation.scope} /> : null,
      width: proportional(1, { minWidth: 120 }),
    },
    {
      header: "Inviter",
      key: "inviter",
      renderCell: ({ invitation }) =>
        invitation.inviter ? <AstryxAccessFact fact={invitation.inviter} /> : null,
      width: proportional(1, { minWidth: 120 }),
    },
    {
      header: "Expires",
      key: "expiresAt",
      renderCell: ({ invitation }) => <AstryxAccessFact fact={invitation.expiresAt} />,
      width: proportional(1, { minWidth: 140 }),
    },
    {
      header: "Status",
      key: "status",
      renderCell: ({ invitation }) => <AstryxAccessFact fact={invitation.status} />,
      width: pixel(104),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: ({ invitation }) =>
        invitation.revocation.availability === "available" ? (
          <AstryxAccessAction
            action={invitation.revocation.action}
            destructive
            onIntent={onIntent}
          />
        ) : (
          <FieldStatus
            message={invitation.revocation.disabledReason}
            type="warning"
            variant="detached"
          />
        ),
      width: pixel(144),
    },
  ];

  return (
    <Section aria-labelledby={headingId} padding={0} variant="transparent" width="100%">
      <VStack gap={3} width="100%">
        <HStack align="center" gap={2} justify="between" width="100%">
          <Heading id={headingId} level={2}>
            Invitations
          </Heading>
          <Badge label={invitations.length} variant="neutral" />
        </HStack>
        <Table<AstryxAccessInvitationRow>
          columns={columns}
          data={rows}
          density="balanced"
          dividers="rows"
          idKey="id"
          tableProps={{ "aria-labelledby": headingId }}
          textOverflow="wrap"
          verticalAlign="top"
        />
      </VStack>
    </Section>
  );
}

function AstryxAccessFact({ fact }: { fact: FormlessUiAccessDisplayFactContract }) {
  const data = { "data-formless-astryx-access-fact": fact.id };

  if (fact.presentation === "status") {
    return <Badge {...data} label={fact.value} variant={astryxAccessBadgeVariant(fact.intent)} />;
  }

  if (fact.presentation === "timestamp") {
    return (
      <span {...data}>
        <Timestamp format="date_time" value={fact.value} />
      </span>
    );
  }

  return (
    <Text {...data} color="secondary" type="supporting">
      {fact.value}
    </Text>
  );
}

export function AstryxAccessInvitationAuthoring({
  authoring,
  onIntent,
}: {
  authoring: FormlessUiAccessInvitationAuthoringContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  return (
    <Dialog
      aria-label={authoring.title}
      isOpen={authoring.open}
      onOpenChange={(open) => void onIntent({ ...authoring.cancel.intent, open })}
      purpose="form"
      width={680}
    >
      <AstryxAccessInvitationAuthoringContent authoring={authoring} onIntent={onIntent} />
    </Dialog>
  );
}

export function AstryxAccessInvitationAuthoringContent({
  authoring,
  onIntent,
}: {
  authoring: FormlessUiAccessInvitationAuthoringContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  const formId = `${authoring.id}:form`;

  return (
    <form
      data-formless-astryx-access-authoring={authoring.id}
      id={formId}
      noValidate
      onSubmit={(event) => submitAstryxAccessInvitation(event, authoring, onIntent)}
    >
      <Layout
        content={
          <LayoutContent>
            <VStack gap={5} width="100%">
              <FormLayout direction="vertical">
                {[
                  authoring.fields.targetEmail,
                  authoring.fields.displayName,
                  authoring.fields.expiresAt,
                  authoring.fields.targetSurface,
                  authoring.fields.targetAppInstall,
                  authoring.fields.targetOrganization,
                ].map((field) => (
                  <AstryxAccessControlledField
                    field={field}
                    key={field.id}
                    onIntent={onIntent}
                    pending={authoring.pending}
                  />
                ))}
                {authoring.grantSelections.map((selection) => (
                  <AstryxAccessGrantSelection
                    key={selection.id}
                    onIntent={onIntent}
                    pending={authoring.pending}
                    selection={selection}
                  />
                ))}
              </FormLayout>
              {authoring.pending ? (
                <HStack align="center" gap={2} role="status">
                  <Spinner aria-label={authoring.pending.label} size="sm" />
                  <Text type="supporting">{authoring.pending.label}</Text>
                </HStack>
              ) : null}
              {authoring.errors.length > 0 ? (
                <VStack aria-live="assertive" gap={1} role="alert">
                  {authoring.errors.map((error) => (
                    <FieldStatus key={error} message={error} type="error" variant="detached" />
                  ))}
                </VStack>
              ) : null}
              {authoring.feedback ? <AstryxAccessFeedback feedback={authoring.feedback} /> : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} justify="end" width="100%" wrap="wrap">
              <AstryxAccessAction action={authoring.cancel} onIntent={onIntent} />
              <AstryxAccessAction action={authoring.submit} form={formId} onIntent={onIntent} />
            </HStack>
          </LayoutFooter>
        }
        header={
          <DialogHeader
            onOpenChange={(open) => void onIntent({ ...authoring.cancel.intent, open })}
            subtitle={authoring.description}
            title={authoring.title}
          />
        }
        height="auto"
      />
    </form>
  );
}

function AstryxAccessControlledField({
  field,
  onIntent,
  pending,
}: {
  field: FormlessUiAccessControlledFieldContract;
  onIntent: FormlessUiAccessIntentHandler;
  pending?: FormlessUiAccessInvitationAuthoringContract["pending"];
}) {
  const isDisabled = field.disabledReason !== undefined || pending !== undefined;
  const disabledMessage = field.disabledReason ?? pending?.label;
  const status = field.errors.length > 0 ? ({ type: "error" } as const) : undefined;
  let control: ReactNode;

  if (field.inputKind === "select") {
    const options = field.options ?? [];
    control = (
      <Selector
        data-formless-astryx-access-field={field.id}
        disabledMessage={disabledMessage}
        hasSearch={options.length > SEARCHABLE_OPTION_COUNT}
        isDisabled={isDisabled}
        isRequired={field.required}
        label={field.label}
        onChange={(value) => void dispatchAstryxAccessFieldChange(onIntent, field, value)}
        options={options.map((option) => ({
          disabled: option.disabledReason !== undefined,
          label: option.label,
          value: option.value,
        }))}
        status={status}
        value={field.value}
        width="100%"
      />
    );
  } else if (field.inputKind === "datetime") {
    control = (
      <DateTimeInput
        data-formless-astryx-access-field={field.id}
        disabledMessage={disabledMessage}
        isDisabled={isDisabled}
        isRequired={field.required}
        label={field.label}
        onChange={(value) =>
          void dispatchAstryxAccessFieldChange(onIntent, field, value?.toString() ?? "")
        }
        status={status}
        value={(field.value || undefined) as ISODateTimeString | undefined}
        width="100%"
      />
    );
  } else {
    control = (
      <TextInput
        data-formless-astryx-access-field={field.id}
        disabledMessage={disabledMessage}
        isDisabled={isDisabled}
        isRequired={field.required}
        label={field.label}
        onChange={(value) => void dispatchAstryxAccessFieldChange(onIntent, field, value)}
        status={status}
        type={field.inputKind === "email" ? "email" : "text"}
        value={field.value}
        width="100%"
      />
    );
  }

  return (
    <VStack gap={1} width="100%">
      {control}
      <AstryxAccessFieldMessages field={field} />
    </VStack>
  );
}

function AstryxAccessFieldMessages({ field }: { field: FormlessUiAccessControlledFieldContract }) {
  const disabledReasons = [
    ...(field.disabledReason ? [field.disabledReason] : []),
    ...(field.options ?? []).flatMap((option) =>
      option.disabledReason ? [`${option.label}: ${option.disabledReason}`] : [],
    ),
  ];

  return (
    <>
      {field.errors.map((error) => (
        <FieldStatus key={error} message={error} type="error" variant="detached" />
      ))}
      {distinctStrings(disabledReasons).map((reason) => (
        <FieldStatus key={reason} message={reason} type="warning" variant="detached" />
      ))}
    </>
  );
}

function AstryxAccessGrantSelection({
  onIntent,
  pending,
  selection,
}: {
  onIntent: FormlessUiAccessIntentHandler;
  pending?: FormlessUiAccessInvitationAuthoringContract["pending"];
  selection: FormlessUiAccessGrantSelectionContract;
}) {
  const optionCount = selection.groups.reduce((count, group) => count + group.options.length, 0);
  const isDisabled = selection.disabledReason !== undefined || pending !== undefined;
  const disabledMessage = selection.disabledReason ?? pending?.label;
  const disabledReasons = [
    ...(selection.disabledReason ? [selection.disabledReason] : []),
    ...selection.groups.flatMap((group) =>
      group.options.flatMap((option) =>
        option.disabledReason ? [`${option.label}: ${option.disabledReason}`] : [],
      ),
    ),
  ];

  return (
    <VStack data-formless-astryx-access-grants={selection.purpose} gap={1} width="100%">
      <MultiSelector
        disabledMessage={disabledMessage}
        hasSearch={optionCount > SEARCHABLE_OPTION_COUNT}
        hasSelectAll={false}
        isDisabled={isDisabled}
        label={selection.label}
        onChange={(selectedOptionIds) =>
          void dispatchAstryxAccessGrantSelectionChanges(onIntent, selection, selectedOptionIds)
        }
        options={selection.groups.map((group) => ({
          options: group.options.map((option) => ({
            disabled: option.disabledReason !== undefined,
            label: option.label,
            value: option.id,
          })),
          title: group.label,
          type: "section" as const,
        }))}
        status={selection.errors.length > 0 ? { type: "error" } : undefined}
        triggerDisplay="labels"
        value={[...selection.selectedOptionIds]}
        width="100%"
      />
      {selection.errors.map((error) => (
        <FieldStatus key={error} message={error} type="error" variant="detached" />
      ))}
      {distinctStrings(disabledReasons).map((reason) => (
        <FieldStatus key={reason} message={reason} type="warning" variant="detached" />
      ))}
    </VStack>
  );
}

function AstryxAccessConfirmation({
  confirmation,
  onIntent,
}: {
  confirmation: FormlessUiAccessConfirmationContract;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  const actionDisabled = Boolean(
    confirmation.action.control.disabled || confirmation.action.control.pending?.isPending,
  );
  const cancelDisabled = Boolean(
    confirmation.cancel.control.disabled || confirmation.cancel.control.pending?.isPending,
  );
  const description = [confirmation.description, confirmation.action.control.disabledReason]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return (
    <AlertDialog
      actionLabel={astryxAccessButtonLabel(confirmation.action.control)}
      actionVariant="destructive"
      cancelLabel={astryxAccessButtonLabel(confirmation.cancel.control)}
      data-formless-astryx-access-confirmation={confirmation.id}
      description={description}
      isActionLoading={actionDisabled}
      isOpen={confirmation.open}
      onAction={() => {
        if (!actionDisabled) {
          void onIntent(confirmation.action.intent);
        }
      }}
      onOpenChange={(open) => {
        if (!cancelDisabled) {
          void onIntent({ ...confirmation.cancel.intent, open });
        }
      }}
      title={confirmation.title}
    />
  );
}

function AstryxAccessAction({
  action,
  destructive = false,
  form,
  onIntent,
}: {
  action: FormlessUiAccessActionContract;
  destructive?: boolean;
  form?: string;
  onIntent: FormlessUiAccessIntentHandler;
}) {
  const button = action.control;
  const content = button.content;
  const isIconOnly = content.kind === "iconOnly";
  const isLoading = Boolean(button.pending?.isPending);

  return (
    <Button
      data-formless-astryx-access-control={button.id}
      form={form}
      icon={content.kind === "label" ? undefined : operationIcon(content.icon)}
      isDisabled={Boolean(button.disabled || isLoading)}
      isIconOnly={isIconOnly}
      isLoading={isLoading}
      label={button.accessibilityLabel}
      onClick={form ? undefined : () => void onIntent(action.intent)}
      size={button.density === "compact" ? "sm" : "md"}
      tooltip={button.disabledReason}
      type={button.type}
      variant={destructive ? "destructive" : astryxAccessButtonVariant(button.prominence)}
    >
      {isIconOnly ? undefined : content.label}
    </Button>
  );
}

function AstryxAccessFeedback({ feedback }: { feedback: FormlessUiAccessFeedbackContract }) {
  return (
    <Banner
      container="card"
      data-formless-astryx-access-feedback={feedback.id}
      description={feedback.detail}
      status={astryxAccessBannerStatus(feedback.intent)}
      title={feedback.title}
    />
  );
}

export function dispatchAstryxAccessFieldChange(
  onIntent: FormlessUiAccessIntentHandler,
  field: FormlessUiAccessControlledFieldContract,
  value: string,
) {
  return onIntent({ ...field.changeIntent, value });
}

export function dispatchAstryxAccessGrantSelectionChanges(
  onIntent: FormlessUiAccessIntentHandler,
  selection: FormlessUiAccessGrantSelectionContract,
  selectedOptionIds: readonly string[],
) {
  const nextSelectedOptionIds = new Set(selectedOptionIds);
  return Promise.all(
    selection.groups.flatMap((group) =>
      group.options.flatMap((option) => {
        const selected = nextSelectedOptionIds.has(option.id);
        return selected === option.selected
          ? []
          : [Promise.resolve(onIntent({ ...option.selectionIntent, selected }))];
      }),
    ),
  );
}

function submitAstryxAccessInvitation(
  event: FormEvent<HTMLFormElement>,
  authoring: FormlessUiAccessInvitationAuthoringContract,
  onIntent: FormlessUiAccessIntentHandler,
) {
  event.preventDefault();
  void onIntent(authoring.submit.intent);
}

function astryxAccessButtonLabel(button: FormlessUiButtonContract): string {
  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

function astryxAccessButtonVariant(
  prominence: FormlessUiButtonContract["prominence"],
): ButtonVariant {
  switch (prominence) {
    case "primary":
      return "primary";
    case "secondary":
      return "secondary";
    case "quiet":
      return "ghost";
  }
}

function astryxAccessBadgeVariant(
  intent: FormlessUiAccessDisplayFactContract["intent"],
): BadgeVariant {
  switch (intent) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "error";
    case "info":
      return "info";
    case "neutral":
    case undefined:
      return "neutral";
  }
}

function astryxAccessBannerStatus(
  intent: FormlessUiAccessFeedbackContract["intent"],
): BannerStatus {
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

function distinctStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}
