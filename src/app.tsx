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
  submitAction,
  submitCreateMutation,
  submitPatchMutation,
} from "./client/sync.ts";
import type { CreateFieldConfig, HomeActionConfig, RecordFieldConfig } from "./client/views.ts";
import {
  parseAppSchema,
  stringifySchema,
  type EntitySchema,
  type FieldSchema,
} from "./shared/schema.ts";
import type { FieldValue, RecordValues } from "./shared/protocol.ts";
import { Checkbox } from "@formless/ui/checkbox";
import { Button } from "@formless/ui/button";
import { Label } from "@formless/ui/label";
import { Input } from "@formless/ui/input";
import { DateInput } from "@formless/ui/date";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@formless/ui/dialog";
import { Field, FieldError, FieldSet } from "@formless/ui/field";

type CreateHomeActionConfig = Extract<HomeActionConfig, { type: "create" }>;

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

  const { entityName, entity, homeActions, recordFields } = homeModel;

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <DeveloperStatusLine schemaVersion={schema.version} />
      </header>

      <RecordList
        entity={entity}
        entityName={entityName}
        homeActions={homeActions}
        recordFields={recordFields}
      />
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

      <FieldSet className="space-y-4" disabled={!canCreate || isSubmitting}>
        {createFields.map((fieldConfig) => (
          <CreateFieldInput fieldConfig={fieldConfig} key={fieldConfig.fieldName} />
        ))}
      </FieldSet>

      <Button disabled={!canCreate || isSubmitting} type="submit">
        {isSubmitting ? "Saving..." : canCreate ? `Create ${entity.label}` : "Create disabled"}
      </Button>
    </form>
  );
}

export function GeneratedCreateDialog({
  action,
  onOpenChange,
  open,
}: {
  action: CreateHomeActionConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
        </DialogHeader>
        <GeneratedCreateDialogForm action={action} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function GeneratedCreateDialogForm({
  action,
  onSuccess,
  renderDialogCancel = true,
}: {
  action: CreateHomeActionConfig;
  onSuccess?: () => void;
  renderDialogCancel?: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!action.enabled) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = getFormValues(formData, action.fields);

    setIsSubmitting(true);
    setSyncStatus({
      state: "syncing",
      message: `Saving ${action.entity.label.toLowerCase()}...`,
    });

    try {
      await submitCreateMutation(action.entityName, values);
      form.reset();
      onSuccess?.();
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
      {!action.enabled ? (
        <p className="text-sm text-slate-600">Create is disabled for {action.entity.label}.</p>
      ) : null}

      <FieldSet className="space-y-4" disabled={!action.enabled || isSubmitting}>
        {action.fields.map((fieldConfig) => (
          <CreateFieldInput fieldConfig={fieldConfig} key={fieldConfig.fieldName} />
        ))}
      </FieldSet>

      <DialogFooter>
        {renderDialogCancel ? (
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        ) : (
          <Button type="button" variant="outline">
            Cancel
          </Button>
        )}
        <Button disabled={!action.enabled || isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : action.enabled ? action.label : "Create disabled"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateFieldInput({ fieldConfig }: { fieldConfig: CreateFieldConfig }) {
  const { field, fieldName } = fieldConfig;
  const label = fieldLabel(fieldName, field);

  if (field.type === "boolean") {
    return (
      <Field orientation="horizontal">
        <Checkbox defaultChecked={field.default ?? false} name={fieldName} />
        <Label>{label}</Label>
      </Field>
    );
  }

  if (field.type === "date") {
    return (
      <Field>
        <Label>{label}</Label>
        <DateInput name={fieldName} required={field.required} />
      </Field>
    );
  }

  return (
    <Field>
      <Label>{label}</Label>
      <Input name={fieldName} required={field.required} />
    </Field>
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
  homeActions = [],
  recordFields,
}: {
  entity: EntitySchema;
  entityName: string;
  homeActions?: HomeActionConfig[];
  recordFields: RecordFieldConfig[];
}) {
  const canPatch = entity.mutations.patch.enabled;
  const recordIds = useEntityRecordIds(entityName);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{entity.label}s</h2>
        {homeActions.length > 0 ? <HomeActionRow actions={homeActions} /> : null}
      </div>
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

function HomeActionRow({ actions }: { actions: HomeActionConfig[] }) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogAction, setCreateDialogAction] = useState<CreateHomeActionConfig | null>(null);

  async function runAction(action: Extract<HomeActionConfig, { type: "entity-action" }>) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action.actionName);
    setSyncStatus({ state: "syncing", message: `${action.label}...` });

    try {
      await submitAction(action.entityName, action.actionName);
      setSyncStatus({ state: "idle", message: `${action.label} synced.` });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Action failed.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) =>
        action.type === "create" ? (
          <Button
            disabled={!action.enabled}
            key={`${action.type}:${action.entityName}`}
            onClick={() => setCreateDialogAction(action)}
            type="button"
          >
            {action.enabled ? action.label : "Create disabled"}
          </Button>
        ) : (
          <Button
            disabled={pendingAction !== null}
            key={`${action.type}:${action.actionName}`}
            onClick={() => void runAction(action)}
            type="button"
            variant="outline"
          >
            {pendingAction === action.actionName ? `${action.label}...` : action.label}
          </Button>
        ),
      )}
      {createDialogAction ? (
        <GeneratedCreateDialog
          action={createDialogAction}
          onOpenChange={(open) => {
            if (!open) {
              setCreateDialogAction(null);
            }
          }}
          open={true}
        />
      ) : null}
    </div>
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
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-start gap-2">
        {recordFields.map((fieldConfig) => (
          <RecordFieldEditor
            canPatch={canPatch}
            entityName={entityName}
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            recordId={recordId}
          />
        ))}
      </div>
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
      <div className="flex h-7 shrink-0 items-center">
        <Field orientation="horizontal">
          <Checkbox
            aria-label={label}
            checked={recordValue === true}
            className="size-4 rounded border-slate-300"
            disabled={!canPatch || isPending}
            onCheckedChange={(checked) => {
              if (commitPolicy === "immediate") {
                void commit(checked);
              }
            }}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
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
    <div
      className={editor === "date" ? "min-w-36 flex-none space-y-1" : "min-w-52 flex-1 space-y-1"}
    >
      <Field>
        <Label className="sr-only">{fieldLabel(fieldName, field)}</Label>
        <Input
          aria-label={fieldLabel(fieldName, field)}
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
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
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

        <Button disabled={isSaving} type="submit">
          {isSaving ? "Saving..." : "Save schema"}
        </Button>
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
      <Button disabled={isResetting} onClick={() => void resetLocalData()}>
        {isResetting ? "Resetting..." : "Reset data"}
      </Button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}
