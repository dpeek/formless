import { Button } from "@dpeek/formless-ui/button";
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarItem,
  SidebarLabel,
  SidebarProvider,
  SidebarSection,
  SidebarTrigger,
} from "@dpeek/formless-ui/sidebar";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiButtonContract,
  FormlessUiCreateIntent,
  FormlessUiDocumentThemeReference,
  FormlessUiFieldIntent,
  FormlessUiShellDestinationContract,
  FormlessUiShellIntent,
  FormlessUiShellIntentHandler,
  FormlessUiShellManifestContract,
  FormlessUiShellManifestReference,
  FormlessUiShellNavigationSectionContract,
  FormlessUiShellNavigationSectionReference,
  FormlessUiShellResetContract,
  FormlessUiShellSessionContract,
  FormlessUiShellSettingsContract,
} from "@dpeek/formless-astryx/contract";
import {
  useFormlessUiShellIntentHandler,
  useFormlessUiShellManifest,
  useFormlessUiShellNavigationSection,
} from "@dpeek/formless-astryx/contract-host/react";
import { LegacyGeneratedCreateSurface } from "./legacy-create-surface.tsx";
import { LegacySubscribedDocumentThemeRenderer } from "./legacy-document-theme-renderer.tsx";

export function LegacyApplicationShellRenderer({
  children,
  manifest,
  onIntent,
  sections,
}: {
  children: ReactNode;
  manifest: FormlessUiShellManifestContract;
  onIntent: FormlessUiShellIntentHandler;
  sections: readonly FormlessUiShellNavigationSectionContract[];
}) {
  return (
    <LegacyApplicationShellFrame
      manifest={manifest}
      navigation={sections.map((section) => (
        <LegacyApplicationShellSectionRenderer
          key={section.id}
          onIntent={onIntent}
          section={section}
        />
      ))}
      sections={sections}
    >
      {children}
    </LegacyApplicationShellFrame>
  );
}

export const LegacySubscribedApplicationShellRenderer = memo(
  function LegacySubscribedApplicationShellRenderer({
    children,
    shellReference,
    themeReference,
  }: {
    children: ReactNode;
    shellReference: FormlessUiShellManifestReference;
    themeReference?: FormlessUiDocumentThemeReference | undefined;
  }) {
    const manifest = useFormlessUiShellManifest(shellReference);

    if (!manifest) {
      return children;
    }

    const shell = (
      <LegacyApplicationShellFrame
        manifest={manifest}
        navigation={manifest.navigationSections.map((reference) => (
          <LegacySubscribedApplicationShellSection
            key={`${reference.shellId}:${reference.sectionId}`}
            reference={reference}
          />
        ))}
        sections={[]}
      >
        {children}
      </LegacyApplicationShellFrame>
    );

    return themeReference ? (
      <LegacySubscribedDocumentThemeRenderer themeReference={themeReference}>
        {shell}
      </LegacySubscribedDocumentThemeRenderer>
    ) : (
      shell
    );
  },
  (previous, next) =>
    previous.shellReference.shellId === next.shellReference.shellId &&
    previous.themeReference?.themeId === next.themeReference?.themeId &&
    previous.children === next.children,
);

function LegacyApplicationShellFrame({
  children,
  manifest,
  navigation,
  sections,
}: {
  children: ReactNode;
  manifest: FormlessUiShellManifestContract;
  navigation: ReactNode;
  sections: readonly FormlessUiShellNavigationSectionContract[];
}) {
  const activeDestination = manifest.activeDestination
    ? sections
        .find((section) => section.id === manifest.activeDestination?.sectionId)
        ?.destinations.find(
          (destination) => destination.id === manifest.activeDestination?.destinationId,
        )
    : undefined;

  return (
    <SidebarProvider
      className="min-h-dvh bg-bg text-fg"
      data-formless-application-shell={manifest.id}
      data-formless-shell-scope={manifest.scope}
      data-frame="application-shell"
    >
      <Sidebar closeButton={false} collapsible="hidden">
        <SidebarHeader>
          <div className="px-2 py-1 text-sm font-semibold">{manifest.title}</div>
        </SidebarHeader>
        <SidebarContent>{navigation}</SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger aria-label={`Toggle ${manifest.title} navigation`} />
          <h1 className="truncate text-sm font-medium">
            {activeDestination?.label ?? manifest.title}
          </h1>
        </header>
        <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

const LegacySubscribedApplicationShellSection = memo(
  function LegacySubscribedApplicationShellSection({
    reference,
  }: {
    reference: FormlessUiShellNavigationSectionReference;
  }) {
    const onIntent = useFormlessUiShellIntentHandler();
    const section = useFormlessUiShellNavigationSection(reference);

    return section ? (
      <LegacyApplicationShellSectionRenderer onIntent={onIntent} section={section} />
    ) : null;
  },
  (previous, next) =>
    previous.reference.shellId === next.reference.shellId &&
    previous.reference.sectionId === next.reference.sectionId,
);

function LegacyApplicationShellSectionRenderer({
  onIntent,
  section,
}: {
  onIntent: FormlessUiShellIntentHandler;
  section: FormlessUiShellNavigationSectionContract;
}) {
  return (
    <SidebarSection
      aria-label={section.accessibilityLabel}
      data-formless-shell-section={section.id}
      label={section.label}
    >
      {section.destinations.map((destination) => (
        <LegacyShellDestination
          destination={destination}
          key={destination.id}
          onIntent={onIntent}
        />
      ))}
      {section.createSurface ? (
        <LegacyGeneratedCreateSurface
          onCreateIntent={(intent) => onIntent(legacyApplicationShellCreateIntent(section, intent))}
          onFieldIntent={(fieldId, intent) =>
            onIntent(legacyApplicationShellCreateIntent(section, intent, fieldId))
          }
          surface={section.createSurface}
        />
      ) : null}
      {section.settings ? (
        <LegacyShellSettings onIntent={onIntent} section={section} settings={section.settings} />
      ) : null}
      {section.session ? (
        <LegacyShellSession onIntent={onIntent} section={section} session={section.session} />
      ) : null}
    </SidebarSection>
  );
}

function LegacyShellDestination({
  destination,
  onIntent,
}: {
  destination: FormlessUiShellDestinationContract;
  onIntent: FormlessUiShellIntentHandler;
}) {
  if (destination.kind === "shellLinkDestination") {
    return (
      <SidebarItem
        aria-label={destination.accessibilityLabel}
        badge={destination.countText}
        href={destination.href}
        isCurrent={destination.selected}
        isDisabled={!destination.availability.available}
        tooltip={
          destination.availability.available
            ? destination.description
            : destination.availability.message
        }
      >
        <SidebarLabel>{destination.label}</SidebarLabel>
      </SidebarItem>
    );
  }

  return (
    <span
      className="col-span-full"
      title={
        destination.availability.available
          ? destination.description
          : destination.availability.message
      }
    >
      <Button
        aria-label={destination.accessibilityLabel}
        aria-pressed={destination.selected}
        className="w-full justify-start"
        data-formless-shell-destination={destination.id}
        intent="plain"
        isDisabled={!destination.availability.available}
        onPress={() => void onIntent(destination.selectionIntent)}
        size="sm"
        type="button"
      >
        <span className="truncate">{destination.label}</span>
        {destination.countText ? (
          <span className="ms-auto text-xs text-muted-fg">{destination.countText}</span>
        ) : null}
      </Button>
    </span>
  );
}

function LegacyShellSettings({
  onIntent,
  section,
  settings,
}: {
  onIntent: FormlessUiShellIntentHandler;
  section: FormlessUiShellNavigationSectionContract;
  settings: FormlessUiShellSettingsContract;
}) {
  return (
    <div className="col-span-full space-y-3 px-2 text-xs">
      {settings.sync ? (
        <section aria-label={settings.sync.label} data-sync-status-control={settings.sync.state}>
          <p className={settings.sync.state === "error" ? "text-red-700" : "text-muted-fg"}>
            {settings.sync.label}: {settings.sync.message}
          </p>
          {settings.sync.details ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
              {settings.sync.details.map((detail) => (
                <div className="contents" key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}
      {settings.workspaceSave ? (
        <p aria-live="polite">
          {settings.workspaceSave.label}: {settings.workspaceSave.message}
        </p>
      ) : null}
      {settings.reset ? (
        <LegacyShellReset onIntent={onIntent} reset={settings.reset} section={section} />
      ) : null}
    </div>
  );
}

function LegacyShellReset({
  onIntent,
  reset,
  section,
}: {
  onIntent: FormlessUiShellIntentHandler;
  reset: FormlessUiShellResetContract;
  section: FormlessUiShellNavigationSectionContract;
}) {
  const dispatchOpenChange = (open: boolean) =>
    onIntent(legacyApplicationShellResetIntent(section, reset, { open, type: "resetOpenChange" }));

  return (
    <>
      <LegacyShellButton button={reset.trigger} onPress={() => dispatchOpenChange(true)} />
      {reset.status.message ? (
        <p aria-live="polite" className={reset.status.state === "error" ? "text-red-700" : ""}>
          {reset.status.message}
        </p>
      ) : null}
      {reset.confirmation.open ? (
        <ModalContent
          isOpen={reset.confirmation.open}
          onOpenChange={(open) => void dispatchOpenChange(open)}
          role="alertdialog"
        >
          <ModalHeader>
            <ModalTitle>{reset.confirmation.title}</ModalTitle>
          </ModalHeader>
          <ModalBody>{reset.confirmation.description}</ModalBody>
          <ModalFooter>
            <LegacyShellButton
              button={reset.confirmation.cancel}
              onPress={() => dispatchOpenChange(false)}
            />
            <LegacyShellButton
              button={reset.confirmation.confirm}
              onPress={() =>
                onIntent(
                  legacyApplicationShellResetIntent(section, reset, { type: "resetConfirm" }),
                )
              }
            />
          </ModalFooter>
        </ModalContent>
      ) : null}
    </>
  );
}

function LegacyShellSession({
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
    <div className="col-span-full space-y-2 px-2 text-xs">
      <p className="font-medium">{session.identity.displayName}</p>
      {session.identity.secondaryLabel ? (
        <p className="text-muted-fg">{session.identity.secondaryLabel}</p>
      ) : null}
      <LegacyShellButton
        button={session.logout}
        onPress={() => onIntent(legacyApplicationShellLogoutIntent(section, session))}
      />
      {session.logout.errors?.map((error) => (
        <p className="text-red-700" key={error} role="alert">
          {error}
        </p>
      ))}
    </div>
  );
}

function LegacyShellButton({
  button,
  onPress,
}: {
  button: FormlessUiButtonContract;
  onPress: () => Promise<void> | void;
}) {
  return (
    <span title={button.disabledReason}>
      <Button
        aria-label={button.accessibilityLabel}
        intent={
          button.prominence === "primary"
            ? "primary"
            : button.prominence === "secondary"
              ? "outline"
              : "plain"
        }
        isDisabled={button.disabled}
        onPress={() => void onPress()}
        size={button.density === "compact" ? "xs" : "sm"}
        type={button.type}
      >
        {shellButtonLabel(button)}
      </Button>
    </span>
  );
}

function shellButtonLabel(button: FormlessUiButtonContract) {
  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

export function legacyApplicationShellCreateIntent(
  section: FormlessUiShellNavigationSectionContract,
  intent: FormlessUiCreateIntent,
): FormlessUiShellIntent;
export function legacyApplicationShellCreateIntent(
  section: FormlessUiShellNavigationSectionContract,
  intent: FormlessUiFieldIntent,
  fieldId: string,
): FormlessUiShellIntent;
export function legacyApplicationShellCreateIntent(
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

export function legacyApplicationShellResetIntent(
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

export function legacyApplicationShellLogoutIntent(
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
