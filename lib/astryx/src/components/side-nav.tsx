import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { NavHeadingMenu, NavHeadingMenuItem } from "@astryxdesign/core/NavMenu";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiButtonContract,
  FormlessUiCreateIntent,
  FormlessUiFieldIntent,
  FormlessUiShellDestinationContract,
  FormlessUiShellIntent,
  FormlessUiShellIntentHandler,
  FormlessUiShellManifestContract,
  FormlessUiShellNavigationSectionContract,
  FormlessUiShellNavigationSectionReference,
  FormlessUiShellResetContract,
  FormlessUiShellSessionContract,
  FormlessUiShellSettingsContract,
} from "../formless-ui-contract.ts";
import {
  useFormlessUiShellIntentHandler,
  useFormlessUiShellNavigationSection,
} from "../formless-ui-contract-host-react.tsx";
import { AstryxCreateSurfaceRenderer } from "./create-surfaces.tsx";
import { operationIcon } from "./operation-controls.tsx";

type AstryxShellSectionSlot = "appSwitcher" | "navigation" | "session";

export function AstryxApplicationSideNav({
  manifest,
  onIntent,
  sections,
  themeControl,
}: {
  manifest: FormlessUiShellManifestContract;
  onIntent: FormlessUiShellIntentHandler;
  sections: readonly FormlessUiShellNavigationSectionContract[];
  themeControl?: ReactNode;
}) {
  return (
    <AstryxApplicationSideNavFrame
      appSwitcher={sections.map((section) => (
        <AstryxApplicationShellSectionSlot
          key={section.id}
          onIntent={onIntent}
          section={section}
          slot="appSwitcher"
        />
      ))}
      manifest={manifest}
      navigation={sections.map((section) => (
        <AstryxApplicationShellSectionSlot
          key={section.id}
          onIntent={onIntent}
          section={section}
          slot="navigation"
        />
      ))}
      session={sections.map((section) => (
        <AstryxApplicationShellSectionSlot
          key={section.id}
          onIntent={onIntent}
          section={section}
          slot="session"
        />
      ))}
      themeControl={themeControl}
    />
  );
}

export function AstryxSubscribedApplicationSideNav({
  manifest,
  references,
  themeControl,
}: {
  manifest: FormlessUiShellManifestContract;
  references: readonly FormlessUiShellNavigationSectionReference[];
  themeControl?: ReactNode;
}) {
  const onIntent = useFormlessUiShellIntentHandler();

  return (
    <AstryxApplicationSideNavFrame
      appSwitcher={references.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="appSwitcher"
        />
      ))}
      manifest={manifest}
      navigation={references.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="navigation"
        />
      ))}
      session={references.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="session"
        />
      ))}
      themeControl={themeControl}
    />
  );
}

function AstryxApplicationSideNavFrame({
  appSwitcher,
  manifest,
  navigation,
  session,
  themeControl,
}: {
  appSwitcher: ReactNode;
  manifest: FormlessUiShellManifestContract;
  navigation: ReactNode;
  session: ReactNode;
  themeControl?: ReactNode;
}) {
  return (
    <SideNav
      footer={
        themeControl ? (
          <VStack gap={2} width="100%">
            {themeControl}
            {session}
          </VStack>
        ) : (
          session
        )
      }
      header={
        <SideNavHeading
          heading={manifest.title}
          menu={
            manifest.scope === "multiApp" ? (
              <NavHeadingMenu size="lg">{appSwitcher}</NavHeadingMenu>
            ) : undefined
          }
        />
      }
    >
      {navigation}
    </SideNav>
  );
}

const AstryxSubscribedApplicationShellSectionSlot = memo(
  function AstryxSubscribedApplicationShellSectionSlot({
    onIntent,
    reference,
    slot,
  }: {
    onIntent: FormlessUiShellIntentHandler;
    reference: FormlessUiShellNavigationSectionReference;
    slot: AstryxShellSectionSlot;
  }) {
    const section = useFormlessUiShellNavigationSection(reference);

    return section ? (
      <AstryxApplicationShellSectionSlot onIntent={onIntent} section={section} slot={slot} />
    ) : null;
  },
  (previous, next) =>
    previous.reference.shellId === next.reference.shellId &&
    previous.reference.sectionId === next.reference.sectionId &&
    previous.slot === next.slot &&
    previous.onIntent === next.onIntent,
);

function AstryxApplicationShellSectionSlot({
  onIntent,
  section,
  slot,
}: {
  onIntent: FormlessUiShellIntentHandler;
  section: FormlessUiShellNavigationSectionContract;
  slot: AstryxShellSectionSlot;
}) {
  if (slot === "appSwitcher") {
    return section.role === "appSwitcher" ? (
      <AstryxApplicationSwitcherSection section={section} />
    ) : null;
  }

  if (slot === "session") {
    return section.role === "session" && section.session ? (
      <AstryxShellSession onIntent={onIntent} section={section} session={section.session} />
    ) : null;
  }

  if (section.role === "appSwitcher" || section.role === "session") {
    return null;
  }

  return <AstryxShellNavigationSection onIntent={onIntent} section={section} />;
}

function AstryxApplicationSwitcherSection({
  section,
}: {
  section: FormlessUiShellNavigationSectionContract;
}) {
  return section.destinations.map((destination) => (
    <NavHeadingMenuItem
      description={destinationSupportingText(destination)}
      href={destination.kind === "shellLinkDestination" ? destination.href : undefined}
      isDisabled={!destination.availability.available}
      key={destination.id}
      label={
        <HStack align="center" gap={2} justify="between" width="100%">
          <Text type="label" weight={destination.selected ? "semibold" : undefined}>
            {destination.label}
          </Text>
          {destination.countText ? (
            <Badge
              aria-label={`${destination.accessibilityLabel} count`}
              label={destination.countText}
              variant="neutral"
            />
          ) : null}
        </HStack>
      }
    />
  ));
}

function AstryxShellNavigationSection({
  onIntent,
  section,
}: {
  onIntent: FormlessUiShellIntentHandler;
  section: FormlessUiShellNavigationSectionContract;
}) {
  if (section.role === "appSettings" && section.settings) {
    return (
      <AstryxShellSettingsNavigationItem
        onIntent={onIntent}
        section={section}
        settings={section.settings}
      />
    );
  }

  return (
    <SideNavSection
      endContent={
        section.createSurface ? (
          <AstryxCreateSurfaceRenderer
            onFieldIntent={(fieldId, intent) =>
              onIntent(astryxApplicationShellCreateIntent(section, intent, fieldId))
            }
            onIntent={(intent) => onIntent(astryxApplicationShellCreateIntent(section, intent))}
            surface={section.createSurface}
          />
        ) : undefined
      }
      isHeaderHidden={section.label === undefined}
      title={section.label ?? section.accessibilityLabel}
    >
      {section.destinations.map((destination) => (
        <AstryxShellDestination
          destination={destination}
          key={destination.id}
          onIntent={onIntent}
        />
      ))}
    </SideNavSection>
  );
}

function AstryxShellSettingsNavigationItem({
  onIntent,
  section,
  settings,
}: {
  onIntent: FormlessUiShellIntentHandler;
  section: FormlessUiShellNavigationSectionContract;
  settings: FormlessUiShellSettingsContract;
}) {
  return (
    <HoverCard
      alignment="start"
      content={<AstryxShellSettings onIntent={onIntent} section={section} settings={settings} />}
      focusTrigger="always"
      hasHoverIndication={false}
      placement="end"
    >
      <SideNavItem label={section.label ?? section.accessibilityLabel} />
    </HoverCard>
  );
}

function AstryxShellDestination({
  destination,
  onIntent,
}: {
  destination: FormlessUiShellDestinationContract;
  onIntent: FormlessUiShellIntentHandler;
}) {
  const supportingText = destinationSupportingText(destination);

  return (
    <VStack gap={supportingText ? 0.5 : 0} width="100%">
      <SideNavItem
        endContent={
          destination.countText ? (
            <Badge
              aria-label={`${destination.accessibilityLabel} count`}
              label={destination.countText}
              variant="neutral"
            />
          ) : undefined
        }
        href={destination.kind === "shellLinkDestination" ? destination.href : undefined}
        isDisabled={!destination.availability.available}
        isSelected={destination.selected}
        label={destination.label}
        onClick={
          destination.kind === "shellRootRecordDestination"
            ? () => {
                if (destination.availability.available) {
                  void onIntent(destination.selectionIntent);
                }
              }
            : undefined
        }
      />
      {supportingText ? (
        <Text color="secondary" display="block" type="supporting">
          {supportingText}
        </Text>
      ) : null}
    </VStack>
  );
}

function AstryxShellSettings({
  onIntent,
  section,
  settings,
}: {
  onIntent: FormlessUiShellIntentHandler;
  section: FormlessUiShellNavigationSectionContract;
  settings: FormlessUiShellSettingsContract;
}) {
  return (
    <VStack gap={3} width="100%">
      {settings.sync ? (
        <VStack aria-label={settings.sync.label} gap={1} role="status" width="100%">
          <HStack align="center" gap={2} justify="between" width="100%">
            <Text type="supporting" weight="medium">
              {settings.sync.message}
            </Text>
            <Badge label={settings.sync.label} variant={syncStatusVariant(settings.sync.state)} />
          </HStack>
          {settings.sync.details ? (
            <MetadataList columns="single">
              {settings.sync.details.map((detail) => (
                <MetadataListItem key={detail.label} label={detail.label}>
                  {detail.value}
                </MetadataListItem>
              ))}
            </MetadataList>
          ) : null}
        </VStack>
      ) : null}
      {settings.workspaceSave ? (
        <HStack align="center" gap={2} justify="between" role="status" width="100%">
          <Text type="supporting">{settings.workspaceSave.message}</Text>
          <Badge
            label={settings.workspaceSave.label}
            variant={workspaceSaveStatusVariant(settings.workspaceSave.state)}
          />
        </HStack>
      ) : null}
      {settings.reset ? (
        <AstryxShellReset onIntent={onIntent} reset={settings.reset} section={section} />
      ) : null}
    </VStack>
  );
}

function AstryxShellReset({
  onIntent,
  reset,
  section,
}: {
  onIntent: FormlessUiShellIntentHandler;
  reset: FormlessUiShellResetContract;
  section: FormlessUiShellNavigationSectionContract;
}) {
  const dispatchOpenChange = (open: boolean) =>
    onIntent(astryxApplicationShellResetIntent(section, reset, { open, type: "resetOpenChange" }));

  return (
    <VStack gap={1} width="100%">
      <AstryxShellButton button={reset.trigger} onClick={() => dispatchOpenChange(true)} />
      {reset.status.message ? (
        <HStack align="center" gap={2} role={reset.status.state === "error" ? "alert" : "status"}>
          <Badge label={reset.status.state} variant={resetStatusVariant(reset.status.state)} />
          <Text type="supporting">{reset.status.message}</Text>
        </HStack>
      ) : null}
      <AlertDialog
        actionLabel={shellButtonLabel(reset.confirmation.confirm)}
        actionVariant={shellButtonVariant(reset.confirmation.confirm)}
        cancelLabel={shellButtonLabel(reset.confirmation.cancel)}
        description={reset.confirmation.description}
        isActionLoading={Boolean(reset.confirmation.confirm.pending?.isPending)}
        isOpen={reset.confirmation.open}
        onAction={() =>
          onIntent(astryxApplicationShellResetIntent(section, reset, { type: "resetConfirm" }))
        }
        onOpenChange={(open) => void dispatchOpenChange(open)}
        title={reset.confirmation.title}
      />
    </VStack>
  );
}

function AstryxShellSession({
  onIntent,
  section,
  session,
}: {
  onIntent: FormlessUiShellIntentHandler;
  section: FormlessUiShellNavigationSectionContract;
  session: FormlessUiShellSessionContract;
}) {
  if (session.state === "anonymous") {
    return null;
  }

  return (
    <VStack gap={2} width="100%">
      <VStack gap={0.5} width="100%">
        <Text display="block" maxLines={1} type="label">
          {session.identity.displayName}
        </Text>
        {session.identity.secondaryLabel ? (
          <Text color="secondary" display="block" maxLines={1} type="supporting">
            {session.identity.secondaryLabel}
          </Text>
        ) : null}
      </VStack>
      <AstryxShellButton
        button={session.logout}
        onClick={() => onIntent(astryxApplicationShellLogoutIntent(section, session))}
      />
      {session.logout.errors?.map((error) => (
        <Text color="secondary" display="block" key={error} role="alert" type="supporting">
          {error}
        </Text>
      ))}
    </VStack>
  );
}

function AstryxShellButton({
  button,
  onClick,
}: {
  button: FormlessUiButtonContract;
  onClick: () => Promise<void> | void;
}) {
  const isLoading = Boolean(button.pending?.isPending);
  const isDisabled = Boolean(button.disabled || isLoading);
  const icon = button.content.kind === "label" ? undefined : operationIcon(button.content.icon);

  return (
    <Button
      icon={icon}
      isDisabled={isDisabled}
      isIconOnly={button.content.kind === "iconOnly"}
      isLoading={isLoading}
      label={button.accessibilityLabel}
      onClick={() => {
        if (!isDisabled) {
          void onClick();
        }
      }}
      size={button.density === "compact" ? "sm" : "md"}
      tooltip={
        button.disabledReason ??
        (button.content.kind === "iconOnly" ? button.accessibilityLabel : undefined)
      }
      type={button.type}
      variant={shellButtonVariant(button)}
    >
      {button.content.kind === "iconOnly" ? undefined : button.content.label}
    </Button>
  );
}

function destinationSupportingText(destination: FormlessUiShellDestinationContract) {
  return destination.availability.available
    ? destination.description
    : destination.availability.message;
}

function shellButtonLabel(button: FormlessUiButtonContract) {
  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

function shellButtonVariant(button: FormlessUiButtonContract): ButtonVariant {
  return button.prominence === "primary"
    ? "primary"
    : button.prominence === "secondary"
      ? "secondary"
      : "ghost";
}

function syncStatusVariant(
  state: NonNullable<FormlessUiShellSettingsContract["sync"]>["state"],
): BadgeVariant {
  return state === "error" ? "error" : state === "syncing" ? "info" : "success";
}

function workspaceSaveStatusVariant(
  state: NonNullable<FormlessUiShellSettingsContract["workspaceSave"]>["state"],
): BadgeVariant {
  return state === "failed"
    ? "error"
    : state === "clean" || state === "saved"
      ? "success"
      : state === "dirty"
        ? "warning"
        : "info";
}

function resetStatusVariant(state: FormlessUiShellResetContract["status"]["state"]): BadgeVariant {
  return state === "error" ? "error" : state === "success" ? "success" : "info";
}

export function astryxApplicationShellCreateIntent(
  section: FormlessUiShellNavigationSectionContract,
  intent: FormlessUiCreateIntent,
): FormlessUiShellIntent;
export function astryxApplicationShellCreateIntent(
  section: FormlessUiShellNavigationSectionContract,
  intent: FormlessUiFieldIntent,
  fieldId: string,
): FormlessUiShellIntent;
export function astryxApplicationShellCreateIntent(
  section: FormlessUiShellNavigationSectionContract,
  intent: FormlessUiCreateIntent | FormlessUiFieldIntent,
  fieldId?: string,
): FormlessUiShellIntent {
  if (!section.createSurface) {
    throw new Error(`Shell section "${section.id}" has no create surface.`);
  }

  const scope = {
    sectionId: section.id,
    shellId: section.shellId,
    surfaceId: section.createSurface.id,
    type: "shellCreate" as const,
  };

  if ("surfaceId" in intent) {
    return { ...scope, intent };
  }

  if (fieldId === undefined) {
    throw new Error("Shell create field intents require a projected field occurrence id.");
  }

  return {
    ...scope,
    fieldId,
    intent,
  };
}

export function astryxApplicationShellResetIntent(
  section: FormlessUiShellNavigationSectionContract,
  reset: FormlessUiShellResetContract,
  intent: Extract<FormlessUiShellIntent, { type: "shellReset" }>["intent"],
): FormlessUiShellIntent {
  return {
    controlId: reset.id,
    intent,
    sectionId: section.id,
    shellId: section.shellId,
    type: "shellReset",
  };
}

export function astryxApplicationShellLogoutIntent(
  section: FormlessUiShellNavigationSectionContract,
  session: Extract<FormlessUiShellSessionContract, { state: "authenticated" }>,
): FormlessUiShellIntent {
  return {
    controlId: session.logout.id,
    sectionId: section.id,
    shellId: section.shellId,
    type: "shellLogout",
  };
}
