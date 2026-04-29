import { useEffect, useMemo, useState } from "react";
import { Link, Route, Switch } from "wouter";
import {
  connectBroadcastToState,
  getClientState,
  hydrateClientState,
  subscribeToClientState,
  type ClientState,
} from "./client/state.ts";
import {
  bootstrapClient,
  fetchActiveSchema,
  saveActiveSchema,
  startPollingSync,
  submitCreateMutation,
  submitPatchMutation,
} from "./client/sync.ts";
import {
  parseAppSchema,
  stringifySchema,
  type EntitySchema,
  type FieldSchema,
} from "./shared/schema.ts";
import type { FieldValue, RecordValues, StoredRecord } from "./shared/protocol.ts";

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
  const schema = clientState.schema;
  const entityEntry = useMemo(
    () => (schema ? Object.entries(schema.entities)[0] : undefined),
    [schema],
  );

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

  if (!schema) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p className="text-sm text-slate-600">
          {syncStatus.state === "error"
            ? "Could not load the active schema."
            : "Loading active schema..."}
        </p>
        <SyncStatusLine status={syncStatus} lastSyncedAt={clientState.lastSyncedAt} />
      </section>
    );
  }

  if (!entityEntry) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p>No entities are defined in the active schema.</p>
        <SyncStatusLine status={syncStatus} lastSyncedAt={clientState.lastSyncedAt} />
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

      <RecordList
        entity={entity}
        entityName={entityName}
        onStatusChange={setSyncStatus}
        records={records}
      />

      <SyncStatusLine status={syncStatus} lastSyncedAt={clientState.lastSyncedAt} />
    </section>
  );
}

export function GeneratedCreateForm({
  entity,
  entityName,
  onStatusChange,
}: {
  entity: EntitySchema;
  entityName: string;
  onStatusChange: (status: SyncStatus) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canCreate = entity.mutations.create.enabled;

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = getFormValues(formData, entity);

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

      {!canCreate ? (
        <p className="text-sm text-slate-600">Create is disabled for {entity.label}.</p>
      ) : null}

      <fieldset className="space-y-4" disabled={!canCreate || isSubmitting}>
        {Object.entries(entity.fields).map(([fieldName, field]) => (
          <CreateFieldInput field={field} fieldName={fieldName} key={fieldName} />
        ))}
      </fieldset>

      <button
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        disabled={!canCreate || isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Saving..." : canCreate ? `Create ${entity.label}` : "Create disabled"}
      </button>
    </form>
  );
}

function CreateFieldInput({ field, fieldName }: { field: FieldSchema; fieldName: string }) {
  const label = fieldLabel(fieldName, field);

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          className="size-4 rounded border-slate-300"
          defaultChecked={field.default ?? false}
          name={fieldName}
          type="checkbox"
        />
        <span className="font-medium">{label}</span>
      </label>
    );
  }

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="w-full rounded border border-slate-300 px-3 py-2"
        name={fieldName}
        required={field.required}
        type={field.type === "date" ? "date" : "text"}
      />
    </label>
  );
}

function getFormValues(formData: FormData, entity: EntitySchema): RecordValues {
  const values: RecordValues = {};

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (field.type === "boolean") {
      values[fieldName] = formData.has(fieldName);
      continue;
    }

    const value = formData.get(fieldName);
    values[fieldName] = typeof value === "string" ? value : "";
  }

  return values;
}

export function RecordList({
  entity,
  entityName,
  onStatusChange,
  records,
}: {
  entity: EntitySchema;
  entityName: string;
  onStatusChange: (status: SyncStatus) => void;
  records: StoredRecord[];
}) {
  const canPatch = entity.mutations.patch.enabled;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{entity.label}s</h2>
      {!canPatch && records.length > 0 ? (
        <p className="text-sm text-slate-600">Editing is disabled for {entity.label}.</p>
      ) : null}

      {records.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200">
          {records.map((record) => (
            <li className="space-y-3 p-3" key={record.id}>
              {Object.entries(entity.fields).map(([fieldName, field]) => (
                <RecordFieldEditor
                  canPatch={canPatch}
                  entityName={entityName}
                  field={field}
                  fieldName={fieldName}
                  key={fieldName}
                  onStatusChange={onStatusChange}
                  record={record}
                />
              ))}
              <p className="text-xs text-slate-500">{record.createdAt}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordFieldEditor({
  canPatch,
  entityName,
  field,
  fieldName,
  onStatusChange,
  record,
}: {
  canPatch: boolean;
  entityName: string;
  field: FieldSchema;
  fieldName: string;
  onStatusChange: (status: SyncStatus) => void;
  record: StoredRecord;
}) {
  const recordValue = record.values[fieldName];
  const [draft, setDraft] = useState(() => fieldValueToInputValue(recordValue));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(fieldValueToInputValue(recordValue));
  }, [recordValue]);

  async function commit(value: FieldValue) {
    if (!canPatch || isPending) {
      return;
    }

    if (recordValue === value || (recordValue === undefined && value === "")) {
      return;
    }

    setIsPending(true);
    onStatusChange({ state: "syncing", message: `Updating ${fieldName}...` });

    try {
      await submitPatchMutation(entityName, record.id, { [fieldName]: value });
      setError(null);
      onStatusChange({ state: "idle", message: "Updated and synced." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";

      setDraft(fieldValueToInputValue(recordValue));
      setError(message);
      onStatusChange({
        state: "error",
        message,
      });
    } finally {
      setIsPending(false);
    }
  }

  if (field.type === "boolean") {
    const label = fieldLabel(fieldName, field);

    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={recordValue === true}
            className="size-4 rounded border-slate-300"
            disabled={!canPatch || isPending}
            onChange={(event) => void commit(event.currentTarget.checked)}
            type="checkbox"
          />
          <span className="font-medium">{label}</span>
        </label>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(event.currentTarget.value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(fieldValueToInputValue(recordValue));
    }
  }

  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{fieldLabel(fieldName, field)}</span>
        <input
          className="w-full rounded border border-slate-300 px-3 py-2"
          disabled={!canPatch || isPending}
          onBlur={(event) => void commit(event.currentTarget.value)}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          required={field.required}
          type={field.type === "date" ? "date" : "text"}
          value={draft}
        />
      </label>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function fieldValueToInputValue(value: FieldValue | undefined) {
  return typeof value === "string" ? value : "";
}

function fieldLabel(fieldName: string, field: FieldSchema) {
  return field.label ?? humanizeFieldName(fieldName);
}

function humanizeFieldName(fieldName: string) {
  const withSpaces = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (withSpaces === "") {
    return fieldName;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
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
  const [clientState, setClientState] = useState<ClientState>(() => getClientState());
  const [editorText, setEditorText] = useState(() =>
    clientState.schema ? stringifySchema(clientState.schema) : "",
  );
  const [status, setStatus] = useState<SyncStatus>({
    state: "idle",
    message: "Schema editor ready.",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => subscribeToClientState(setClientState), []);

  useEffect(() => {
    const stopBroadcast = connectBroadcastToState();
    let cancelled = false;

    async function loadSchema() {
      try {
        await hydrateClientState();
        await fetchActiveSchema();

        if (!cancelled) {
          setStatus({ state: "idle", message: "Loaded active schema." });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            state: "error",
            message: error instanceof Error ? error.message : "Could not load schema.",
          });
        }
      }
    }

    void loadSchema();

    return () => {
      cancelled = true;
      stopBroadcast();
    };
  }, []);

  useEffect(() => {
    if (clientState.schema) {
      setEditorText(stringifySchema(clientState.schema));
    }
  }, [clientState.schema]);

  async function submitSchema(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ state: "syncing", message: "Saving schema..." });

    try {
      const parsed = parseAppSchema(JSON.parse(editorText) as unknown);
      const response = await saveActiveSchema(parsed);

      setEditorText(stringifySchema(response.schema));
      setStatus({ state: "idle", message: `Saved schema at ${response.updatedAt}.` });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Schema save failed.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Schema</h1>
        <p className="text-sm text-slate-600">
          {clientState.schema
            ? `Editing schema version ${clientState.schema.version}.`
            : "Loading active schema."}
        </p>
      </header>

      <form className="space-y-4" onSubmit={submitSchema}>
        <textarea
          className="min-h-96 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
          onChange={(event) => setEditorText(event.currentTarget.value)}
          placeholder="Loading active schema..."
          spellCheck={false}
          value={editorText}
        />

        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save schema"}
        </button>
      </form>

      <SyncStatusLine status={status} lastSyncedAt={clientState.lastSyncedAt} />
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
