import {
  lazy,
  Suspense,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useMemo,
} from "react";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@formless/ui/sidebar";
import {
  SnapshotExportControl,
  SnapshotRestoreControl,
  SourceResetControl,
} from "./app/dev-actions.tsx";
import {
  HomeRouteSelectionProvider,
  selectHomeRouteSectionContextRecordId,
  useHomeRouteSelectionStore,
  withHomeRouteSelectedSectionContextRecordId,
} from "./app/routes/home-selection.tsx";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { normalizeSitePageSlug } from "./app/routes/site-page-slug.ts";
import { SyncStatusControl } from "./app/routes/status-line.tsx";
import {
  findRuntimeWorldMountByRoute,
  hasGeneratedRoutes,
  isRuntimePublicSiteRoute,
  resolveRuntimeProfile,
  runtimeScreenPathFromRoute,
  runtimeScreenRoute,
  type RuntimeProfile,
  type RuntimeWorldMount,
} from "./app/runtime-profile.ts";
import {
  useActiveSchemaKey,
  useEntityRecordCountReferencingField,
  useEntityRecordOptionsMatchingQuery,
  useSchema,
} from "./client/store.ts";
import {
  selectGeneratedRootNavigationFacts,
  selectGeneratedRootNavigationGroupFacts,
  selectGeneratedRootNavigationStateFacts,
  type GeneratedRootNavigationContext,
  type GeneratedRootNavigationFacts,
} from "./client/generated-authoring.ts";
import { todayDateString } from "./shared/date.ts";
import type { SchemaKey } from "./shared/schema-apps.ts";
import { selectPrimaryScreenModels, type HomeScreenModel } from "./client/views.ts";

type HomeRouteProps = { schemaKey: SchemaKey; screenPath: string };
type SchemaRouteProps = { schemaKey: SchemaKey };
type SitePageRouteProps = { linkMode?: "preview" | "published"; slug: string };

export type AppRouteComponents = {
  HomeRoute: ElementType<HomeRouteProps>;
  SchemaRoute: ElementType<SchemaRouteProps>;
  SitePageRoute: ElementType<SitePageRouteProps>;
};

const defaultRouteComponents: AppRouteComponents = {
  HomeRoute: lazy(() =>
    import("./app/routes/home.tsx").then((module) => ({ default: module.HomeRoute })),
  ),
  SchemaRoute: lazy(() =>
    import("./app/routes/schema.tsx").then((module) => ({ default: module.SchemaRoute })),
  ),
  SitePageRoute: lazy(() =>
    import("./app/routes/site-page.tsx").then((module) => ({ default: module.SitePageRoute })),
  ),
};

export function App({
  routeComponents = defaultRouteComponents,
  runtimeProfile: runtimeProfileProp,
}: { routeComponents?: AppRouteComponents; runtimeProfile?: RuntimeProfile } = {}) {
  const [location] = useLocation();
  const runtimeProfile = useMemo(
    () => runtimeProfileProp ?? resolveRuntimeProfile(),
    [runtimeProfileProp],
  );
  const isPublicSiteRoute = isRuntimePublicSiteRoute(runtimeProfile, location);
  const routeWorld = findRuntimeWorldMountByRoute(runtimeProfile, location);
  const routeApp = routeWorld?.app;
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeAppSchema =
    routeApp && (activeSchemaKey === null || activeSchemaKey === routeApp.key)
      ? activeSchema
      : null;
  const routeAppScreenModels = useMemo(
    () => (routeAppSchema ? selectPrimaryScreenModels(routeAppSchema) : []),
    [routeAppSchema],
  );
  const activeScreenPath = routeWorld
    ? runtimeScreenPathFromRoute(routeWorld, location)
    : undefined;
  const isWorkbenchToolRoute =
    runtimeProfile.shell === "dev" && routeWorld?.schemaRoute === location;

  if (isPublicSiteRoute || runtimeProfile.shell === "publishedSite") {
    return (
      <main className="min-h-dvh">
        <AppRoutes routeComponents={routeComponents} runtimeProfile={runtimeProfile} />
      </main>
    );
  }

  const generatedAppFrame = (
    <GeneratedAppFrame
      activeScreenPath={activeScreenPath}
      routeApp={routeApp}
      routeWorld={routeWorld}
      screenModels={routeAppScreenModels}
      showSyncStatus={runtimeProfile.shell === "app"}
    >
      <AppRoutes routeComponents={routeComponents} runtimeProfile={runtimeProfile} />
    </GeneratedAppFrame>
  );

  return runtimeProfile.shell === "dev" ? (
    <WorkbenchFrame routeWorld={routeWorld} runtimeProfile={runtimeProfile}>
      {isWorkbenchToolRoute ? (
        <main className="bg-background p-6" data-frame="workbench-tool">
          <AppRoutes routeComponents={routeComponents} runtimeProfile={runtimeProfile} />
        </main>
      ) : (
        generatedAppFrame
      )}
    </WorkbenchFrame>
  ) : (
    generatedAppFrame
  );
}

function WorkbenchFrame({
  children,
  routeWorld,
  runtimeProfile,
}: {
  children: ReactNode;
  routeWorld: RuntimeWorldMount | undefined;
  runtimeProfile: RuntimeProfile;
}) {
  const routeApp = routeWorld?.app;

  return (
    <div
      className="min-h-dvh bg-slate-950"
      data-frame="workbench"
      style={{ "--workbench-toolbar-height": "3.5rem" } as CSSProperties}
    >
      <div
        className="min-h-[calc(100dvh-var(--workbench-toolbar-height))] bg-background pb-[var(--workbench-toolbar-height)] text-foreground"
        data-frame="workbench-content"
      >
        {children}
      </div>
      <footer
        aria-label="Workbench toolbar"
        className="fixed inset-x-0 bottom-0 z-[60] overflow-x-auto border-t border-slate-800 bg-slate-950 text-slate-100 shadow-lg shadow-black/25"
        data-frame="workbench-toolbar"
      >
        <div className="flex h-14 min-w-max items-center justify-between gap-4 px-3 sm:px-4">
          <nav aria-label="Workbench apps" className="flex items-center gap-1">
            {runtimeProfile.worlds.map(({ app, route }) => (
              <Link
                className={workbenchAppLinkClassName(routeApp?.key === app.key)}
                href={route}
                key={app.key}
              >
                {app.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <SyncStatusControl appKey={routeApp?.key} tone="dark" />
            <WorkbenchToolbarActions world={routeWorld} />
          </div>
        </div>
      </footer>
    </div>
  );
}

function WorkbenchToolbarActions({ world }: { world: RuntimeWorldMount | undefined }) {
  const app = world?.app;

  return (
    <div aria-label="Workbench actions" className="flex items-center gap-2">
      {world?.schemaRoute ? (
        <Link className={workbenchActionLinkClassName()} href={world.schemaRoute}>
          Schema
        </Link>
      ) : (
        <span className={workbenchUnavailableActionClassName()}>Schema</span>
      )}

      {app ? (
        <>
          <SnapshotExportControl
            buttonClassName={workbenchActionLinkClassName()}
            className="[&>p]:sr-only"
            messageClassName="sr-only"
            schemaKey={app.key}
          />
          <SnapshotRestoreControl
            buttonClassName={workbenchActionLinkClassName()}
            className="[&>p]:sr-only"
            messageClassName="sr-only"
            schemaKey={app.key}
          />
          <SourceResetControl buttonLabel="Reset" className="[&>p]:sr-only" schemaKey={app.key} />
        </>
      ) : (
        <>
          <button className={workbenchUnavailableActionClassName()} disabled type="button">
            Export
          </button>
          <button className={workbenchUnavailableActionClassName()} disabled type="button">
            Restore
          </button>
          <button className={workbenchUnavailableActionClassName()} disabled type="button">
            Reset
          </button>
        </>
      )}
    </div>
  );
}

function GeneratedAppFrame({
  activeScreenPath,
  children,
  routeApp,
  routeWorld,
  screenModels,
  showSyncStatus,
}: {
  activeScreenPath: string | undefined;
  children: ReactNode;
  routeApp: RuntimeWorldMount["app"] | undefined;
  routeWorld: RuntimeWorldMount | undefined;
  screenModels: HomeScreenModel[];
  showSyncStatus: boolean;
}) {
  const headerTitle = generatedAppHeaderTitle({
    activeScreenPath,
    routeAppLabel: routeApp?.label,
    screenModels,
  });

  return (
    <HomeRouteSelectionProvider>
      <SidebarProvider data-frame="generated-app">
        <Sidebar collapsible="offcanvas">
          <SidebarHeader>
            <div className="px-2 py-1 text-sm font-semibold">{routeApp?.label ?? "Formless"}</div>
          </SidebarHeader>
          <SidebarContent>
            {routeWorld ? (
              <AppScreenNavigation
                activeScreenPath={activeScreenPath}
                world={routeWorld}
                screenModels={screenModels}
              />
            ) : null}
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <h1 className="truncate text-sm font-medium">{headerTitle}</h1>
            </div>
            {showSyncStatus ? <SyncStatusControl appKey={routeApp?.key} /> : null}
          </header>
          <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </HomeRouteSelectionProvider>
  );
}

function generatedAppHeaderTitle({
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

function workbenchAppLinkClassName(isActive: boolean) {
  const base = "flex h-7 items-center rounded px-2 text-xs font-medium transition-colors";

  return isActive
    ? `${base} bg-slate-100 text-slate-950`
    : `${base} text-slate-300 hover:bg-slate-800 hover:text-white`;
}

function workbenchActionLinkClassName() {
  return "flex h-7 cursor-pointer items-center rounded border border-slate-700 px-2 text-xs font-medium text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800";
}

function workbenchUnavailableActionClassName() {
  return "flex h-7 items-center rounded border border-slate-800 px-2 text-xs font-medium text-slate-500";
}

function AppScreenNavigation({
  activeScreenPath,
  screenModels,
  world,
}: {
  activeScreenPath: string | undefined;
  screenModels: HomeScreenModel[];
  world: RuntimeWorldMount;
}) {
  const activeScreen = screenModels.find((model) => model.path === activeScreenPath);
  const rootNavigation = activeScreen
    ? selectGeneratedRootNavigationFacts(activeScreen)
    : undefined;

  if (rootNavigation) {
    return <AppRootRecordNavigation rootNavigation={rootNavigation} />;
  }

  const screenLinks = screenModels.filter(
    (model): model is HomeScreenModel & { path: string } => model.path !== undefined,
  );

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu aria-label={`${world.app.label} screens`}>
          {screenLinks.map((model) => (
            <SidebarMenuItem key={model.screenName}>
              <SidebarMenuButton
                isActive={activeScreenPath === model.path}
                render={<Link href={runtimeScreenRoute(world, model.path)} />}
              >
                <span>{model.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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

  if (groupFacts.isEmpty) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label={`${group.label} roots`}>
          {groupFacts.items.map(({ isActive, option }) => (
            <SidebarMenuItem key={option.id}>
              <SidebarMenuButton
                isActive={isActive}
                onClick={() => onSelectRecord(option.id)}
                type="button"
              >
                <span>{option.label}</span>
              </SidebarMenuButton>
              {context.relatedCollection ? (
                <AppRootRecordCountBadge context={context} option={option} />
              ) : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AppRootRecordCountBadge({
  context,
  option,
}: {
  context: GeneratedRootNavigationContext;
  option: { id: string; label: string };
}) {
  const relatedCollection = context.relatedCollection;

  if (!relatedCollection) {
    return null;
  }

  const count = useEntityRecordCountReferencingField(
    relatedCollection.entityName,
    relatedCollection.referenceFieldName,
    option.id,
  );

  return (
    <SidebarMenuBadge aria-label={`${option.label} ${relatedCollection.label} count`}>
      {count}
    </SidebarMenuBadge>
  );
}

function AppRoutes({
  routeComponents,
  runtimeProfile,
}: {
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
}) {
  const { HomeRoute, SchemaRoute, SitePageRoute } = routeComponents;
  const generatedWorlds = runtimeProfile.worlds.filter(hasGeneratedRoutes);

  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        {runtimeProfile.defaultRedirect ? (
          <Route path="/">
            <Redirect replace to={runtimeProfile.defaultRedirect} />
          </Route>
        ) : null}
        {runtimeProfile.publicSitePreview ? (
          <Route path={runtimeProfile.publicSitePreview.rootRoute}>
            <Redirect replace to={runtimeProfile.publicSitePreview.homeRoute} />
          </Route>
        ) : null}
        {runtimeProfile.publicSitePreview ? (
          <Route path={runtimeProfile.publicSitePreview.routePattern}>
            {(params) => (
              <SitePageRoute linkMode="preview" slug={normalizeSitePageSlug(params["*"])} />
            )}
          </Route>
        ) : null}
        {runtimeProfile.publishedSite ? (
          <Route path={runtimeProfile.publishedSite.rootRoute}>
            <SitePageRoute linkMode="published" slug={runtimeProfile.publishedSite.homeSlug} />
          </Route>
        ) : null}
        {runtimeProfile.publishedSite ? (
          <Route path={runtimeProfile.publishedSite.routePattern}>
            {(params) => (
              <SitePageRoute linkMode="published" slug={normalizeSitePageSlug(params["*"])} />
            )}
          </Route>
        ) : null}
        {runtimeProfile.legacyRedirects.map((redirect) => (
          <Route key={redirect.from} path={redirect.from}>
            <Redirect replace to={redirect.to} />
          </Route>
        ))}
        {generatedWorlds.map((world) =>
          world.schemaRoute ? (
            <Route key={world.schemaRoute} path={world.schemaRoute}>
              <SchemaRoute schemaKey={world.app.key} />
            </Route>
          ) : null,
        )}
        {generatedWorlds.map((world) => (
          <Route key={world.route} path={world.route}>
            <HomeRoute schemaKey={world.app.key} screenPath="/" />
          </Route>
        ))}
        {generatedWorlds.map((world) => (
          <Route key={`${world.route}/*`} path={runtimeScreenWildcardRoute(world)}>
            {(params) => (
              <HomeRoute schemaKey={world.app.key} screenPath={runtimeWildcardScreenPath(params)} />
            )}
          </Route>
        ))}
        <Route>
          <NotFoundRoute />
        </Route>
      </Switch>
    </Suspense>
  );
}

function RouteLoading() {
  return <p className="text-sm text-muted-foreground">Loading...</p>;
}

function runtimeScreenWildcardRoute(world: RuntimeWorldMount): `/${string}` {
  return world.route === "/" ? "/*" : `${world.route}/*`;
}

function runtimeWildcardScreenPath(params: unknown): string {
  const wildcard = (params as { "*": string | undefined })["*"];

  return `/${wildcard ?? ""}`;
}
