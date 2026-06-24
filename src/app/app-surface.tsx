import { type ReactNode, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import { AddIcon } from "@dpeek/formless-ui/icons";
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
import { GeneratedCreateDialog } from "./generated/create.tsx";
import { SchemaAppProvider } from "./generated/schema-app-context.tsx";
import { SourceResetControl } from "./dev-actions.tsx";
import {
  HomeRouteSelectionProvider,
  selectHomeRouteSectionContextRecordId,
  useHomeRouteSelectionStore,
  withHomeRouteSelectedSectionContextRecordId,
} from "./routes/home-selection.tsx";
import { SyncStatusControl } from "./routes/status-line.tsx";
import { runtimeScreenRoute, type RuntimeWorldMount } from "./runtime-profile.ts";
import { InstanceRail } from "./instance-rail.tsx";
import {
  useEntityRecordCountReferencingField,
  useEntityRecordOptionsMatchingQuery,
} from "../client/store.ts";
import { clientTargetForSchemaKey } from "../client/app-target.ts";
import {
  selectGeneratedRootNavigationFacts,
  selectGeneratedRootNavigationGroupFacts,
  selectGeneratedRootNavigationStateFacts,
  type GeneratedRootNavigationContext,
  type GeneratedRootNavigationFacts,
} from "../client/generated-authoring.ts";
import { todayDateString } from "../shared/date.ts";
import type { HomeScreenModel } from "../client/views.ts";
import type { AppInstall, AppPackageResolver } from "@dpeek/formless-installed-apps";

export function ActiveAppSurface({
  activePackageResolver,
  activeScreenPath,
  children,
  currentPath,
  instanceRailInstalls,
  managementHref,
  screenModels,
  world,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  activeScreenPath: string | undefined;
  children: ReactNode;
  currentPath: string;
  instanceRailInstalls?: readonly AppInstall[] | undefined;
  managementHref: "/" | undefined;
  screenModels: HomeScreenModel[];
  world: RuntimeWorldMount | undefined;
}) {
  const headerTitle = activeAppHeaderTitle({
    activeScreenPath,
    routeAppLabel: world?.app.label,
    screenModels,
  });

  const frame = (
    <HomeRouteSelectionProvider>
      <SidebarProvider
        className={instanceRailInstalls ? "[--instance-rail-width:3.5rem]" : undefined}
        data-frame="generated-app"
      >
        {instanceRailInstalls ? (
          <InstanceRail currentPath={currentPath} installs={instanceRailInstalls} />
        ) : null}
        <Sidebar
          className={instanceRailInstalls ? "md:left-[var(--instance-rail-width)]" : undefined}
          closeButton={false}
          collapsible="hidden"
        >
          <SidebarHeader>
            <div className="px-2 py-1 text-sm font-semibold">{world?.app.label ?? "Formless"}</div>
          </SidebarHeader>
          <SidebarContent>
            {world ? (
              <ActiveAppNavigation
                activeScreenPath={activeScreenPath}
                activePackageResolver={activePackageResolver}
                managementHref={instanceRailInstalls ? undefined : managementHref}
                screenModels={screenModels}
                world={world}
              />
            ) : null}
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger aria-label={activeAppSidebarTriggerLabel(world?.app.label)} />
              <h1 className="truncate text-sm font-medium">{headerTitle}</h1>
            </div>
          </header>
          <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </HomeRouteSelectionProvider>
  );

  return world ? (
    <SchemaAppProvider
      activePackageResolver={activePackageResolver}
      schemaKey={world.app.key}
      target={world.target}
    >
      {frame}
    </SchemaAppProvider>
  ) : (
    frame
  );
}

function activeAppHeaderTitle({
  activeScreenPath,
  routeAppLabel,
  screenModels,
}: {
  activeScreenPath: string | undefined;
  routeAppLabel: string | undefined;
  screenModels: HomeScreenModel[];
}) {
  return (
    screenModels.find((model) => model.path === activeScreenPath)?.label ??
    routeAppLabel ??
    "Formless"
  );
}

function activeAppSidebarTriggerLabel(appLabel: string | undefined) {
  return appLabel
    ? `Toggle ${appLabel} navigation and app settings`
    : "Toggle app navigation and settings";
}

function ActiveAppNavigation({
  activeScreenPath,
  activePackageResolver,
  managementHref,
  screenModels,
  world,
}: {
  activeScreenPath: string | undefined;
  activePackageResolver?: AppPackageResolver | undefined;
  managementHref: "/" | undefined;
  screenModels: HomeScreenModel[];
  world: RuntimeWorldMount;
}) {
  const activeScreen = screenModels.find((model) => model.path === activeScreenPath);
  const rootNavigation = activeScreen
    ? selectGeneratedRootNavigationFacts(activeScreen)
    : undefined;
  const screenLinks = screenModels.filter(
    (model): model is HomeScreenModel & { path: string } => model.path !== undefined,
  );

  if (rootNavigation) {
    return (
      <>
        {managementHref ? <AppManagementLink href={managementHref} world={world} /> : null}
        {screenLinks.length > 1 ? (
          <AppScreenLinks
            activeScreenPath={activeScreenPath}
            screenLinks={screenLinks}
            world={world}
          />
        ) : null}
        <AppRootRecordNavigation rootNavigation={rootNavigation} />
        <AppSettingsNavigation activePackageResolver={activePackageResolver} world={world} />
      </>
    );
  }

  return (
    <>
      {managementHref ? <AppManagementLink href={managementHref} world={world} /> : null}
      <AppScreenLinks activeScreenPath={activeScreenPath} screenLinks={screenLinks} world={world} />
      <AppSettingsNavigation activePackageResolver={activePackageResolver} world={world} />
    </>
  );
}

function AppManagementLink({ href, world }: { href: "/"; world: RuntimeWorldMount }) {
  return (
    <SidebarSection aria-label={`${world.app.label} management`} label="Management">
      <SidebarItem href={href}>
        <SidebarLabel>App management</SidebarLabel>
      </SidebarItem>
    </SidebarSection>
  );
}

function AppScreenLinks({
  activeScreenPath,
  screenLinks,
  world,
}: {
  activeScreenPath: string | undefined;
  screenLinks: (HomeScreenModel & { path: string })[];
  world: RuntimeWorldMount;
}) {
  return (
    <SidebarSection aria-label={`${world.app.label} screens`}>
      {screenLinks.map((model) => (
        <SidebarItem
          href={runtimeScreenRoute(world, model.path)}
          isCurrent={activeScreenPath === model.path}
          key={model.screenName}
        >
          <SidebarLabel>{model.label}</SidebarLabel>
        </SidebarItem>
      ))}
    </SidebarSection>
  );
}

function AppSettingsNavigation({
  activePackageResolver,
  world,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  world: RuntimeWorldMount;
}) {
  const appTarget = world.target ?? clientTargetForSchemaKey(world.app.key);

  return (
    <SidebarSection aria-label={`${world.app.label} app settings`} label="App settings">
      <div className="col-span-full px-2 py-1">
        <SyncStatusControl target={appTarget} />
      </div>
      <SourceResetControl
        activePackageResolver={activePackageResolver}
        appLabel={world.app.label}
        buttonClassName="w-full"
        buttonLabel="Reset source seed data"
        className="col-span-full px-2 py-1 [&>p]:text-xs"
        schemaKey={world.app.key}
        target={world.target}
      />
    </SidebarSection>
  );
}

function AppRootRecordNavigation({
  rootNavigation,
}: {
  rootNavigation: GeneratedRootNavigationFacts;
}) {
  const routeSelectionStore = useHomeRouteSelectionStore();
  const today = todayDateString();
  const { context, screen, section } = rootNavigation;
  const allOptions = useEntityRecordOptionsMatchingQuery(
    context.entityName,
    context.query,
    context.labelField,
    { today },
  );
  const selectedRecordId =
    routeSelectionStore === null
      ? null
      : selectHomeRouteSectionContextRecordId(
          routeSelectionStore.selectionState,
          screen.screenName,
          section.id,
        );
  const { activeRecordId } = selectGeneratedRootNavigationStateFacts({
    options: allOptions,
    selectedRecordId,
  });

  function selectRecord(recordId: string) {
    routeSelectionStore?.setSelectionState((current) =>
      withHomeRouteSelectedSectionContextRecordId(current, screen.screenName, section.id, recordId),
    );
  }

  return (
    <>
      {rootNavigation.groups.map((group) => (
        <AppRootRecordNavigationGroup
          activeRecordId={activeRecordId}
          context={context}
          group={group}
          key={group.queryName}
          onSelectRecord={selectRecord}
          today={today}
        />
      ))}
    </>
  );
}

function AppRootRecordNavigationGroup({
  activeRecordId,
  context,
  group,
  onSelectRecord,
  today,
}: {
  activeRecordId: string | null;
  context: GeneratedRootNavigationContext;
  group: GeneratedRootNavigationFacts["groups"][number];
  onSelectRecord: (recordId: string) => void;
  today: string;
}) {
  const options = useEntityRecordOptionsMatchingQuery(
    context.entityName,
    group.query,
    context.labelField,
    {
      today,
    },
  );
  const groupFacts = selectGeneratedRootNavigationGroupFacts({
    activeRecordId,
    options,
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  if (groupFacts.isEmpty && !group.createOperation) {
    return null;
  }

  return (
    <SidebarSection
      aria-label={`${group.label} roots`}
      label={group.label}
      action={
        group.createOperation ? (
          <Button
            aria-label={group.createOperation.label}
            className="ms-auto"
            data-slot="control"
            intent="plain"
            isDisabled={!group.createOperation.enabled}
            onPress={() => setCreateDialogOpen(true)}
            size="sq-xs"
            type="button"
          >
            <AddIcon />
          </Button>
        ) : null
      }
    >
      {groupFacts.isEmpty
        ? null
        : groupFacts.items.map(({ isActive, option }) => (
            <AppRootRecordNavigationItem
              context={context}
              isActive={isActive}
              key={option.id}
              onSelectRecord={onSelectRecord}
              option={option}
            />
          ))}
      {group.createOperation && createDialogOpen ? (
        <GeneratedCreateDialog
          operation={group.createOperation}
          onOpenChange={(open) => setCreateDialogOpen(open)}
          onSuccess={onSelectRecord}
          open={true}
        />
      ) : null}
    </SidebarSection>
  );
}

function AppRootRecordNavigationItem({
  context,
  isActive,
  onSelectRecord,
  option,
}: {
  context: GeneratedRootNavigationContext;
  isActive: boolean;
  onSelectRecord: (recordId: string) => void;
  option: { id: string; label: string };
}) {
  const relatedCollection = context.relatedCollection;

  if (!relatedCollection) {
    return (
      <SidebarItem isCurrent={isActive} onPress={() => onSelectRecord(option.id)}>
        <SidebarLabel>{option.label}</SidebarLabel>
      </SidebarItem>
    );
  }

  return (
    <AppRootRecordNavigationItemWithCount
      isActive={isActive}
      onSelectRecord={onSelectRecord}
      option={option}
      relatedCollection={relatedCollection}
    />
  );
}

function AppRootRecordNavigationItemWithCount({
  isActive,
  onSelectRecord,
  option,
  relatedCollection,
}: {
  isActive: boolean;
  onSelectRecord: (recordId: string) => void;
  option: { id: string; label: string };
  relatedCollection: NonNullable<GeneratedRootNavigationContext["relatedCollection"]>;
}) {
  const count = useEntityRecordCountReferencingField(
    relatedCollection.entityName,
    relatedCollection.referenceFieldName,
    option.id,
  );

  return (
    <SidebarItem badge={count} isCurrent={isActive} onPress={() => onSelectRecord(option.id)}>
      <SidebarLabel>{option.label}</SidebarLabel>
      <span className="sr-only" aria-label={`${option.label} ${relatedCollection.label} count`}>
        {count}
      </span>
    </SidebarItem>
  );
}
