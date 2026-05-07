import { type ReactNode, useMemo } from "react";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@formless/ui/sidebar";
import { HomeRoute } from "./app/routes/home.tsx";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { SchemaRoute } from "./app/routes/schema.tsx";
import { normalizeSitePageSlug, SitePageRoute } from "./app/routes/site-page.tsx";
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
import { useActiveSchemaKey, useSchema } from "./client/store.ts";
import { selectPrimaryScreenModels, type HomeScreenModel } from "./client/views.ts";

export function App({
  runtimeProfile: runtimeProfileProp,
}: { runtimeProfile?: RuntimeProfile } = {}) {
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

  if (isPublicSiteRoute || runtimeProfile.shell === "publishedSite") {
    return (
      <main className="min-h-dvh">
        <AppRoutes runtimeProfile={runtimeProfile} />
      </main>
    );
  }

  const generatedAppFrame = (
    <GeneratedAppFrame
      activeScreenPath={activeScreenPath}
      routeApp={routeApp}
      routeWorld={routeWorld}
      screenModels={routeAppScreenModels}
    >
      <AppRoutes runtimeProfile={runtimeProfile} />
    </GeneratedAppFrame>
  );

  return runtimeProfile.shell === "dev" ? (
    <WorkbenchFrame routeApp={routeApp} runtimeProfile={runtimeProfile}>
      {generatedAppFrame}
    </WorkbenchFrame>
  ) : (
    generatedAppFrame
  );
}

function WorkbenchFrame({
  children,
  routeApp,
  runtimeProfile,
}: {
  children: ReactNode;
  routeApp: RuntimeWorldMount["app"] | undefined;
  runtimeProfile: RuntimeProfile;
}) {
  return (
    <div className="min-h-dvh bg-slate-100" data-frame="workbench">
      <header className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="text-sm font-semibold text-foreground"
            href={runtimeProfile.defaultRedirect ?? "/"}
          >
            Formless
          </Link>
          <span className="rounded border border-border px-2 py-0.5 text-xs text-slate-600">
            Dev profile
          </span>
          <span className="truncate text-xs text-slate-600">
            {routeApp ? routeApp.label : "No active world"}
          </span>
        </div>
        <nav aria-label="Workbench apps" className="flex flex-wrap items-center gap-1">
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
      </header>
      <div className="bg-background" data-frame="workbench-content">
        {children}
      </div>
    </div>
  );
}

function GeneratedAppFrame({
  activeScreenPath,
  children,
  routeApp,
  routeWorld,
  screenModels,
}: {
  activeScreenPath: string | undefined;
  children: ReactNode;
  routeApp: RuntimeWorldMount["app"] | undefined;
  routeWorld: RuntimeWorldMount | undefined;
  screenModels: HomeScreenModel[];
}) {
  return (
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
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">{routeApp?.label ?? "Formless"}</span>
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function workbenchAppLinkClassName(isActive: boolean) {
  const base =
    "rounded px-2 py-1 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground";

  return isActive ? `${base} bg-muted text-foreground` : `${base} text-slate-600`;
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
  const screenLinks = screenModels.filter(
    (model): model is HomeScreenModel & { path: string } => model.path !== undefined,
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{world.app.label}</SidebarGroupLabel>
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

function AppRoutes({ runtimeProfile }: { runtimeProfile: RuntimeProfile }) {
  const generatedWorlds = runtimeProfile.worlds.filter(hasGeneratedRoutes);

  return (
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
  );
}

function runtimeScreenWildcardRoute(world: RuntimeWorldMount): `/${string}` {
  return world.route === "/" ? "/*" : `${world.route}/*`;
}

function runtimeWildcardScreenPath(params: unknown): string {
  const wildcard = (params as { "*": string | undefined })["*"];

  return `/${wildcard ?? ""}`;
}
