import { Link, Route, Switch } from "wouter";
import { DevActions } from "./app/dev-actions.tsx";
import { HomeRoute } from "./app/routes/home.tsx";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { SchemaRoute } from "./app/routes/schema.tsx";

export function App() {
  return (
    <main className="min-h-dvh p-6">
      <nav className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex gap-4">
          <Link href="/">Home</Link>
          <Link href="/schema">Schema</Link>
        </div>
        <DevActions />
      </nav>

      <Switch>
        <Route path="/">
          <HomeRoute />
        </Route>
        <Route path="/schema">
          <SchemaRoute />
        </Route>
        <Route>
          <NotFoundRoute />
        </Route>
      </Switch>
    </main>
  );
}
