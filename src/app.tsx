import { Link, Route, Switch } from "wouter";

function HomeRoute() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Formless</h1>
      <p>Home route</p>
    </section>
  );
}

function SchemaRoute() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Schema</h1>
      <p>Schema route</p>
    </section>
  );
}

function NotFoundRoute() {
  return <p>Not found</p>;
}

export function App() {
  return (
    <main className="min-h-dvh p-6">
      <nav className="mb-6 flex gap-4">
        <Link href="/">Home</Link>
        <Link href="/schema">Schema</Link>
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
