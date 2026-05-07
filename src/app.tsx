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
import { useActiveSchemaKey, useSchema } from "./client/store.ts";
import { selectPrimaryScreenModels, type HomeScreenModel } from "./client/views.ts";
import {
  defaultSchemaKey,
  findSchemaAppDefinitionByRoute,
  schemaAppScreenPathFromRoute,
  schemaAppScreenRoute,
  type SchemaAppDefinition,
  schemaAppDefinitions,
  schemaApps,
} from "./shared/schema-apps.ts";

export function App() {
  const [location] = useLocation();
  const isPublicSiteRoute = location === "/pages" || location.startsWith("/pages/");
  const routeApp = findSchemaAppDefinitionByRoute(location);
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
  const activeScreenPath = routeApp ? schemaAppScreenPathFromRoute(routeApp, location) : undefined;

  if (isPublicSiteRoute) {
    return (
      <main className="min-h-dvh">
        <AppRoutes />
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div className="px-2 py-1 text-sm font-semibold">Formless</div>
        </SidebarHeader>
        <SidebarContent>
          <AppNavigation routeApp={routeApp} />
          {routeApp ? (
            <AppScreenNavigation
              activeScreenPath={activeScreenPath}
              app={routeApp}
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
          <AppRoutes />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppNavigation({ routeApp }: { routeApp: SchemaAppDefinition | undefined }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Apps</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {schemaApps.map((app) => (
            <SidebarMenuItem key={app.key}>
              <SidebarMenuButton
                isActive={routeApp?.key === app.key}
                render={<Link href={app.route} />}
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
  app,
  screenModels,
}: {
  activeScreenPath: string | undefined;
  app: SchemaAppDefinition;
  screenModels: HomeScreenModel[];
}) {
  const screenLinks = screenModels.filter(
    (model): model is HomeScreenModel & { path: string } => model.path !== undefined,
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{app.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label={`${app.label} screens`}>
          {screenLinks.map((model) => (
            <SidebarMenuItem key={model.screenName}>
              <SidebarMenuButton
                isActive={activeScreenPath === model.path}
                render={<Link href={schemaAppScreenRoute(app, model.path)} />}
              >
                <span>{model.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeScreenPath === undefined}
              render={<Link href={app.schemaRoute} />}
            >
              <span>Schema</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/">
        <Redirect replace to={schemaAppDefinitions[defaultSchemaKey].route} />
      </Route>
      <Route path="/pages">
        <Redirect replace to="/pages/home" />
      </Route>
      <Route path="/pages/*">
        {(params) => <SitePageRoute slug={normalizeSitePageSlug(params["*"])} />}
      </Route>
      <Route path="/rates/schema">
        <Redirect replace to="/estii/schema" />
      </Route>
      <Route path="/rates">
        <Redirect replace to="/estii" />
      </Route>
      {schemaApps.map((app) => (
        <Route key={app.schemaRoute} path={app.schemaRoute}>
          <SchemaRoute schemaKey={app.key} />
        </Route>
      ))}
      {schemaApps.map((app) => (
        <Route key={app.route} path={app.route}>
          <HomeRoute schemaKey={app.key} screenPath="/" />
        </Route>
      ))}
      {schemaApps.map((app) => (
        <Route key={`${app.route}/*`} path={`${app.route}/*`}>
          {(params) => <HomeRoute schemaKey={app.key} screenPath={`/${params["*"]}`} />}
        </Route>
      ))}
      <Route>
        <NotFoundRoute />
      </Route>
    </Switch>
  );
}
