import { useMemo } from "react";
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

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div className="px-2 py-1 text-sm font-semibold">
            {runtimeProfile.shell === "dev" ? "Formless" : routeApp?.label}
          </div>
        </SidebarHeader>
        <SidebarContent>
          {runtimeProfile.shell === "dev" ? (
            <AppNavigation routeApp={routeApp} runtimeProfile={runtimeProfile} />
          ) : null}
          {routeWorld ? (
            <AppScreenNavigation
              activeScreenPath={activeScreenPath}
              world={routeWorld}
              screenModels={routeAppScreenModels}
            />
          ) : null}
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">{routeApp?.label ?? "Formless"}</span>
        </header>
        <div className="flex-1 p-6">
          <AppRoutes runtimeProfile={runtimeProfile} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppNavigation({
  routeApp,
  runtimeProfile,
}: {
  routeApp: RuntimeWorldMount["app"] | undefined;
  runtimeProfile: RuntimeProfile;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Apps</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {runtimeProfile.worlds.map(({ app, route }) => (
            <SidebarMenuItem key={app.key}>
              <SidebarMenuButton
                isActive={routeApp?.key === app.key}
                render={<Link href={route} />}
              >
                <span>{app.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
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
          {world.schemaRoute ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeScreenPath === undefined}
                render={<Link href={world.schemaRoute} />}
              >
                <span>Schema</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
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
