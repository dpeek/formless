import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import { HomeRoute } from "./app/routes/home.tsx";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { SchemaRoute } from "./app/routes/schema.tsx";
import {
  defaultSchemaKey,
  findSchemaAppDefinitionByRoute,
  schemaAppDefinitions,
  schemaApps,
} from "./shared/schema-apps.ts";

export function App() {
  const [location] = useLocation();
  const activeApp =
    findSchemaAppDefinitionByRoute(location) ?? schemaAppDefinitions[defaultSchemaKey];

  return (
    <main className="min-h-dvh p-6">
      <nav className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex gap-4">
          {schemaApps.map((app) => (
            <Link key={app.key} href={app.route}>
              {app.label}
            </Link>
          ))}
          <Link href={activeApp.schemaRoute}>Schema</Link>
        </div>
      </nav>

      <Switch>
        <Route path="/">
          <Redirect replace to={schemaAppDefinitions[defaultSchemaKey].route} />
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
    </main>
  );
}
