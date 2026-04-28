import { useEffect, useMemo, useState } from "react";
import { Link, Route, Switch } from "wouter";
import { appSchema, appSchemaJson } from "./client/schema.ts";
import {
  connectBroadcastToState,
  getClientState,
  hydrateClientState,
  subscribeToClientState,
  type ClientState,
} from "./client/state.ts";
import { bootstrapClient, startPollingSync, submitCreateMutation } from "./client/sync.ts";
import type { EntitySchema } from "./shared/schema.ts";
import type { StoredRecord } from "./shared/protocol.ts";

type SyncStatus = {
  state: "idle" | "syncing" | "error";
  message: string;
};

function HomeRoute() {
  const [clientState, setClientState] = useState<ClientState>(() => getClientState());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: "idle",
    message: "Local cache ready.",
  });
  const schema = clientState.schema ?? appSchema;
  const entityEntry = useMemo(() => Object.entries(schema.entities)[0], [schema]);

  useEffect(() => subscribeToClientState(setClientState), []);

  useEffect(() => {
    const stopBroadcast = connectBroadcastToState();
    let stopPolling = () => {};
    let cancelled = false;

    async function startSync() {
      setSyncStatus({ state: "syncing", message: "Syncing with authority..." });

      try {
        await hydrateClientState();
        await bootstrapClient();

        if (cancelled) {
          return;
        }

        setSyncStatus({ state: "idle", message: "Synced." });
        stopPolling = startPollingSync();
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSyncStatus({
          state: "error",
          message: error instanceof Error ? error.message : "Sync failed.",
        });
      }
    }

    void startSync();

    return () => {
      cancelled = true;
      stopBroadcast();
      stopPolling();
    };
  }, []);

  if (!entityEntry) {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p>No entities are defined in the active schema.</p>
      </section>
    );
  }

  const [entityName, entity] = entityEntry;
  const records = clientState.records.filter((record) => record.entity === entityName);

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p className="text-sm text-slate-600">
          Loaded schema version {schema.version}. Cursor {clientState.cursor}.
        </p>
      </header>

      <GeneratedCreateForm entity={entity} entityName={entityName} onStatusChange={setSyncStatus} />

      <RecordList entity={entity} records={records} />

      <SyncStatusLine status={syncStatus} lastSyncedAt={clientState.lastSyncedAt} />
    </section>
  );
}

function GeneratedCreateForm({
  entity,
  entityName,
  onStatusChange,
}: {
  entity: EntitySchema;
  entityName: string;
  onStatusChange: (status: SyncStatus) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = Object.fromEntries(
      Object.keys(entity.fields).map((fieldName) => [
        fieldName,
        getTextFormValue(formData, fieldName),
      ]),
    );

    setIsSubmitting(true);
    onStatusChange({ state: "syncing", message: `Saving ${entity.label.toLowerCase()}...` });

    try {
      await submitCreateMutation(entityName, values);
      form.reset();
      onStatusChange({ state: "idle", message: "Saved and synced." });
    } catch (error) {
      onStatusChange({
        state: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submitForm}>
      <h2 className="text-lg font-medium">Create {entity.label}</h2>

      {Object.entries(entity.fields).map(([fieldName, field]) => (
        <label className="block space-y-1" key={fieldName}>
          <span className="text-sm font-medium capitalize">{fieldName}</span>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            name={fieldName}
            required={field.required}
            type={field.type === "text" ? "text" : undefined}
          />
        </label>
      ))}

      <button
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving..." : `Create ${entity.label}`}
      </button>
    </form>
  );
}

function getTextFormValue(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

function RecordList({ entity, records }: { entity: EntitySchema; records: StoredRecord[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{entity.label}s</h2>

      {records.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200">
          {records.map((record) => (
            <li className="space-y-1 p-3" key={record.id}>
              {Object.entries(entity.fields).map(([fieldName]) => (
                <p key={fieldName}>{record.values[fieldName]}</p>
              ))}
              <p className="text-xs text-slate-500">{record.createdAt}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SyncStatusLine({
  status,
  lastSyncedAt,
}: {
  status: SyncStatus;
  lastSyncedAt: string | null;
}) {
  return (
    <p className="text-sm text-slate-600" role="status">
      {status.message}
      {lastSyncedAt ? ` Last synced ${lastSyncedAt}.` : ""}
    </p>
  );
}

function SchemaRoute() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Schema</h1>
      <pre className="overflow-auto rounded border border-slate-200 bg-slate-50 p-4 text-sm">
        {appSchemaJson}
      </pre>
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
