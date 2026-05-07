import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@formless/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@formless/ui/tabs";
import { HomeRoute } from "./app/routes/home.tsx";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { SchemaRoute } from "./app/routes/schema.tsx";
import { normalizeSitePageSlug, SitePageRoute } from "./app/routes/site-page.tsx";
import {
  defaultSchemaKey,
  findSchemaAppDefinitionByRoute,
  type SchemaAppDefinition,
  schemaAppDefinitions,
  schemaApps,
} from "./shared/schema-apps.ts";

export function App() {
  const [location, setLocation] = useLocation();
  const isPublicSiteRoute = location === "/pages" || location.startsWith("/pages/");
  const routeApp = findSchemaAppDefinitionByRoute(location);

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
          <SidebarGroup>
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
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">{routeApp?.label ?? "Formless"}</span>
        </header>
        <div className="flex-1 p-6">
          {routeApp ? (
            <AppContentTabs
              activeTab={location === routeApp.schemaRoute ? "schema" : "home"}
              app={routeApp}
              onNavigate={(path) => setLocation(path)}
            />
          ) : null}
          <AppRoutes />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppContentTabs({
  activeTab,
  app,
  onNavigate,
}: {
  activeTab: "home" | "schema";
  app: SchemaAppDefinition;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="mx-auto mb-6 max-w-3xl">
      <Tabs
        onValueChange={(value) => {
          if (value === "home") {
            onNavigate(app.route);
          }

          if (value === "schema") {
            onNavigate(app.schemaRoute);
          }
        }}
        value={activeTab}
      >
        <TabsList aria-label={`${app.label} content`} variant="line">
          <TabsTrigger value="home">Home</TabsTrigger>
          <TabsTrigger value="schema">Schema</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
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
        <Route key={app.route} path={app.route}>
          <HomeRoute schemaKey={app.key} />
        </Route>
      ))}
      {schemaApps.map((app) => (
        <Route key={app.schemaRoute} path={app.schemaRoute}>
          <SchemaRoute schemaKey={app.key} />
        </Route>
      ))}
      <Route>
        <NotFoundRoute />
      </Route>
    </Switch>
  );
}
