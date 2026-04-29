import { useEffect, useState } from "react";
import { Link, Route, Switch } from "wouter";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  useCursor,
  useEntityRecordIds,
  useHomeViewModel,
  useLastSyncedAt,
  useRecordCreatedAt,
  useRecordField,
  useSchema,
} from "./client/store.ts";
import { setSyncStatus, useSyncStatus, type SyncStatus } from "./client/sync-status.ts";
import {
  bootstrapClient,
  fetchActiveSchema,
  resetRemoteData,
  saveActiveSchema,
  startPollingSync,
  submitCreateMutation,
  submitPatchMutation,
} from "./client/sync.ts";
import type { CreateFieldConfig, RecordFieldConfig } from "./client/views.ts";
import {
  parseAppSchema,
  stringifySchema,
  type EntitySchema,
  type FieldSchema,
} from "./shared/schema.ts";
import type { FieldValue, RecordValues } from "./shared/protocol.ts";

function HomeRoute() {
  const schema = useSchema();
  const homeModel = useHomeViewModel();

  useEffect(() => {
    const stopBroadcast = connectBroadcastToClientStore();
    let stopPolling = () => {};
    let cancelled = false;

    async function startSync() {
      setSyncStatus({ state: "syncing", message: "Syncing with authority..." });

      try {
        await hydrateClientStore();
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
          <SchemaLoadingMessage />
        </p>
        <DeveloperStatusLine />
      </section>
    );
  }

  if (!homeModel) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p>No entities are defined in the active schema.</p>
        <DeveloperStatusLine schemaVersion={schema.version} />
      </section>
    );
  }

  const { createFields, entityName, entity, recordFields } = homeModel;

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <DeveloperStatusLine schemaVersion={schema.version} />
      </header>

      <GeneratedCreateForm createFields={createFields} entity={entity} entityName={entityName} />

      <RecordList entity={entity} entityName={entityName} recordFields={recordFields} />
    </section>
  );
}

function SchemaLoadingMessage() {
  const syncStatus = useSyncStatus();

  return syncStatus.state === "error"
    ? "Could not load the active schema."
    : "Loading active schema...";
}

export function GeneratedCreateForm({
  createFields,
  entity,
  entityName,
}: {
  createFields: CreateFieldConfig[];
  entity: EntitySchema;
  entityName: string;
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
    const values = getFormValues(formData, createFields);

    setIsSubmitting(true);
    setSyncStatus({ state: "syncing", message: `Saving ${entity.label.toLowerCase()}...` });

    try {
      await submitCreateMutation(entityName, values);
      form.reset();
      setSyncStatus({ state: "idle", message: "Saved and synced." });
    } catch (error) {
      setSyncStatus({
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
        {createFields.map((fieldConfig) => (
          <CreateFieldInput fieldConfig={fieldConfig} key={fieldConfig.fieldName} />
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

function CreateFieldInput({ fieldConfig }: { fieldConfig: CreateFieldConfig }) {
  const { editor, field, fieldName } = fieldConfig;
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
        type={editor === "date" ? "date" : "text"}
      />
    </label>
  );
}

function getFormValues(formData: FormData, fields: CreateFieldConfig[]): RecordValues {
  const values: RecordValues = {};

  for (const { field, fieldName } of fields) {
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
  recordFields,
}: {
  entity: EntitySchema;
  entityName: string;
  recordFields: RecordFieldConfig[];
}) {
  const canPatch = entity.mutations.patch.enabled;
  const recordIds = useEntityRecordIds(entityName);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{entity.label}s</h2>
      {!canPatch && recordIds.length > 0 ? (
        <p className="text-sm text-slate-600">Editing is disabled for {entity.label}.</p>
      ) : null}

      {recordIds.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200">
          {recordIds.map((recordId) => (
            <RecordRow
              canPatch={canPatch}
              entityName={entityName}
              key={recordId}
              recordFields={recordFields}
              recordId={recordId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordRow({
  canPatch,
  entityName,
  recordFields,
  recordId,
}: {
  canPatch: boolean;
  entityName: string;
  recordFields: RecordFieldConfig[];
  recordId: string;
}) {
  const createdAt = useRecordCreatedAt(recordId);

  if (!createdAt) {
    return null;
  }

  return (
    <li className="space-y-3 p-3">
      {recordFields.map((fieldConfig) => (
        <RecordFieldEditor
          canPatch={canPatch}
          entityName={entityName}
          fieldConfig={fieldConfig}
          key={fieldConfig.fieldName}
          recordId={recordId}
        />
      ))}
      <p className="text-xs text-slate-500">{createdAt}</p>
    </li>
  );
}

function RecordFieldEditor({
  canPatch,
  entityName,
  fieldConfig,
  recordId,
}: {
  canPatch: boolean;
  entityName: string;
  fieldConfig: RecordFieldConfig;
  recordId: string;
}) {
  const { commit: commitPolicy, editor, field, fieldName } = fieldConfig;
  const recordValue = useRecordField(recordId, fieldName);
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
    setSyncStatus({ state: "syncing", message: `Updating ${fieldName}...` });

    try {
      await submitPatchMutation(entityName, recordId, { [fieldName]: value });
      setError(null);
      setSyncStatus({ state: "idle", message: "Updated and synced." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";

      setDraft(fieldValueToInputValue(recordValue));
      setError(message);
      setSyncStatus({
        state: "error",
        message,
      });
    } finally {
      setIsPending(false);
    }
  }

  if (editor === "boolean") {
    const label = fieldLabel(fieldName, field);

    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={recordValue === true}
            className="size-4 rounded border-slate-300"
            disabled={!canPatch || isPending}
            onChange={(event) => {
              if (commitPolicy === "immediate") {
                void commit(event.currentTarget.checked);
              }
            }}
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
          onBlur={(event) => {
            if (commitPolicy === "field-commit") {
              void commit(event.currentTarget.value);
            }
          }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          required={field.required}
          type={editor === "date" ? "date" : "text"}
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

function DeveloperStatusLine({
  schemaVersion,
  status,
}: {
  schemaVersion?: number;
  status?: SyncStatus;
}) {
  const globalStatus = useSyncStatus();
  const lastSyncedAt = useLastSyncedAt();
  const cursor = useCursor();
  const syncStatus = status ?? globalStatus;

  return (
    <p className="text-sm text-slate-600" role="status">
      <span>{schemaVersion ? `Schema v${schemaVersion}` : "Schema loading"}</span>
      <span aria-hidden="true"> · </span>
      <span>Cursor {cursor}</span>
      <span aria-hidden="true"> · </span>
      <span>{syncStatus.message}</span>
      {lastSyncedAt ? (
        <>
          <span aria-hidden="true"> · </span>
          <time dateTime={lastSyncedAt} title={lastSyncedAt}>
            Last sync {formatTimestamp(lastSyncedAt)}
          </time>
        </>
      ) : null}
    </p>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function SchemaRoute() {
  const schema = useSchema();
  const [editorText, setEditorText] = useState(() => (schema ? stringifySchema(schema) : ""));
  const [status, setStatus] = useState<SyncStatus>({
    state: "idle",
    message: "Schema editor ready.",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const stopBroadcast = connectBroadcastToClientStore();
    let cancelled = false;

    async function loadSchema() {
      try {
        await hydrateClientStore();
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
    if (schema) {
      setEditorText(stringifySchema(schema));
    }
  }, [schema]);

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
        <DeveloperStatusLine schemaVersion={schema?.version} status={status} />
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
    </section>
  );
}

function NotFoundRoute() {
  return <p>Not found</p>;
}

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

function DevActions() {
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetLocalData() {
    if (isResetting) {
      return;
    }

    setIsResetting(true);
    setError(null);

    try {
      await resetRemoteData();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <button
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60"
        disabled={isResetting}
        onClick={() => void resetLocalData()}
        type="button"
      >
        {isResetting ? "Resetting..." : "Reset data"}
      </button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}
