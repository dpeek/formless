import { useEffect, useMemo, useState } from "react";
import { Link, Route, Switch } from "wouter";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  useCursor,
  useEntityRecordOptionsMatchingQuery,
  useEntityRecordCountMatchingQuery,
  useEntityRecordIdsMatchingQuery,
  useLastSyncedAt,
  useRecordField,
  useReferenceOptions,
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
import type { DevResetSchema } from "./client/sync.ts";
import type {
  CreateFieldConfig,
  HomeActionConfig,
  HomeContextConfig,
  HomeQueryTabConfig,
  HomeResultConfig,
  RecordFieldConfig,
} from "./client/views.ts";
import { selectCollectionModels } from "./client/views.ts";
import { todayDateString } from "./shared/date.ts";
import {
  parseAppSchema,
  stringifySchema,
  type EntitySchema,
  type FieldSchema,
} from "./shared/schema.ts";
import type { FieldValue, RecordValues } from "./shared/protocol.ts";
import type { QueryEvaluationContext } from "./shared/query.ts";
import { Checkbox } from "@formless/ui/checkbox";
import { Button } from "@formless/ui/button";
import { Label } from "@formless/ui/label";
import { Input } from "@formless/ui/input";
import { DateInput } from "@formless/ui/date";
import { NativeSelect, NativeSelectOption } from "@formless/ui/native-select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@formless/ui/dialog";
import { Field, FieldError, FieldSet } from "@formless/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@formless/ui/tabs";
import { Badge } from "@formless/ui/badge";

type CreateHomeActionConfig = Extract<HomeActionConfig, { type: "create" }>;

function HomeRoute() {
  const schema = useSchema();
  const collectionModels = useMemo(() => (schema ? selectCollectionModels(schema) : []), [schema]);
  const [selectedViewName, setSelectedViewName] = useState<string | null>(null);
  const homeModel =
    collectionModels.find((model) => model.viewName === selectedViewName) ?? collectionModels[0];
  const queryTabs = homeModel?.queryTabs ?? [];
  const today = useTodayDateString();
  const [selectedQueryName, setSelectedQueryName] = useState<string | null>(null);
  const [selectedContextIdsByView, setSelectedContextIdsByView] = useState<
    Record<string, string | null>
  >({});

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

  useEffect(() => {
    const selectedViewExists = collectionModels.some(
      (model) => model.viewName === selectedViewName,
    );
    const defaultViewName = collectionModels[0]?.viewName ?? null;

    if (!selectedViewExists && selectedViewName !== defaultViewName) {
      setSelectedViewName(defaultViewName);
    }
  }, [collectionModels, selectedViewName]);

  useEffect(() => {
    const selectedQueryExists = queryTabs.some((tab) => tab.queryName === selectedQueryName);
    const defaultQueryName = homeModel?.defaultQueryName ?? queryTabs[0]?.queryName ?? null;

    if (!selectedQueryExists && selectedQueryName !== defaultQueryName) {
      setSelectedQueryName(defaultQueryName);
    }
  }, [homeModel?.defaultQueryName, queryTabs, selectedQueryName]);

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

  const { actions, entityName, entity, result } = homeModel;
  const selectedQuery =
    queryTabs.find((tab) => tab.queryName === selectedQueryName) ?? queryTabs[0];
  const selectedContextRecordId = selectedContextIdsByView[homeModel.viewName] ?? null;

  if (!selectedQuery) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">{homeModel.label}</h1>
        <p>No queries are defined for {entity.label}.</p>
        <DeveloperStatusLine schemaVersion={schema.version} />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{homeModel.label}</h1>
        <DeveloperStatusLine schemaVersion={schema.version} />
      </header>

      {collectionModels.length <= 1 ? null : (
        <Tabs
          onValueChange={(value) => {
            if (typeof value === "string") {
              setSelectedViewName(value);
            }
          }}
          value={homeModel.viewName}
        >
          <TabsList aria-label="Collections" variant="line">
            {collectionModels.map((model) => (
              <TabsTrigger key={model.viewName} value={model.viewName}>
                {model.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <HomeCollection
        actions={actions}
        context={homeModel.context}
        entity={entity}
        entityName={entityName}
        onSelectContext={(recordId) =>
          setSelectedContextIdsByView((current) =>
            current[homeModel.viewName] === recordId
              ? current
              : { ...current, [homeModel.viewName]: recordId },
          )
        }
        onSelectQuery={setSelectedQueryName}
        queryTabs={queryTabs}
        result={result}
        selectedContextRecordId={selectedContextRecordId}
        selectedQuery={selectedQuery}
        today={today}
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
  onSuccess,
  open,
}: {
  action: CreateHomeActionConfig;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
        </DialogHeader>
        <GeneratedCreateDialogForm
          action={action}
          onSuccess={(recordId) => {
            onSuccess?.(recordId);
            onOpenChange(false);
          }}
        />
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
  onSuccess?: (recordId: string) => void;
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
      const response = await submitCreateMutation(action.entityName, values);
      form.reset();
      onSuccess?.(response.record.id);
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

  if (field.type === "number") {
    return (
      <Field>
        <Label>{label}</Label>
        <Input
          defaultValue={field.default}
          max={field.max}
          min={field.min}
          name={fieldName}
          required={field.required}
          step={field.integer ? "1" : "any"}
          type="number"
        />
      </Field>
    );
  }

  if (field.type === "enum") {
    return (
      <Field>
        <Label>{label}</Label>
        <NativeSelect
          className="w-full"
          defaultValue={field.default ?? (field.required ? undefined : "")}
          name={fieldName}
          required={field.required}
        >
          {field.required ? null : <NativeSelectOption value="" />}
          {Object.entries(field.values).map(([value, option]) => (
            <NativeSelectOption key={value} value={value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    );
  }

  if (field.type === "reference") {
    return <ReferenceCreateField field={field} fieldName={fieldName} label={label} />;
  }

  return (
    <Field>
      <Label>{label}</Label>
      <Input name={fieldName} required={field.required} />
    </Field>
  );
}

function ReferenceCreateField({
  field,
  fieldName,
  label,
}: {
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldName: string;
  label: string;
}) {
  const options = useReferenceOptions(field.to, field.displayField);

  return (
    <Field>
      <Label>{label}</Label>
      <NativeSelect
        className="w-full"
        defaultValue={field.required ? undefined : ""}
        name={fieldName}
        required={field.required}
      >
        {field.required ? null : <NativeSelectOption value="" />}
        {options.map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
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

    if (field.type === "number") {
      const value = formData.get(fieldName);
      values[fieldName] = typeof value === "string" ? numberInputValueToFieldValue(value) : "";
      continue;
    }

    const value = formData.get(fieldName);
    values[fieldName] = typeof value === "string" ? value : "";
  }

  return values;
}

export function HomeCollection({
  actions,
  context,
  entity,
  entityName,
  onSelectContext,
  onSelectQuery,
  queryTabs,
  result,
  selectedContextRecordId,
  selectedQuery,
  today,
}: {
  actions: HomeActionConfig[];
  context?: HomeContextConfig;
  entity: EntitySchema;
  entityName: string;
  onSelectContext?: (recordId: string | null) => void;
  onSelectQuery: (queryName: string) => void;
  queryTabs: HomeQueryTabConfig[];
  result: HomeResultConfig;
  selectedContextRecordId?: string | null;
  selectedQuery: HomeQueryTabConfig;
  today: string;
}) {
  if (context) {
    return (
      <ScopedHomeCollection
        actions={actions}
        context={context}
        entity={entity}
        entityName={entityName}
        onSelectContext={onSelectContext}
        onSelectQuery={onSelectQuery}
        queryTabs={queryTabs}
        result={result}
        selectedContextRecordId={selectedContextRecordId ?? null}
        selectedQuery={selectedQuery}
        today={today}
      />
    );
  }

  const queryContext = { today };

  return (
    <div className="space-y-6">
      {queryTabs.length <= 1 ? null : (
        <Tabs
          onValueChange={(value) => {
            if (typeof value === "string") {
              onSelectQuery(value);
            }
          }}
          value={selectedQuery.queryName}
        >
          <TabsList aria-label={`${entity.label} queries`} variant="line">
            {queryTabs.map((queryTab) => (
              <HomeQueryTabTrigger
                entityName={entityName}
                key={queryTab.queryName}
                queryContext={queryContext}
                queryTab={queryTab}
              />
            ))}
          </TabsList>
        </Tabs>
      )}

      <RecordList
        entity={entity}
        entityName={entityName}
        query={selectedQuery.query}
        queryContext={queryContext}
        recordFields={result.recordFields}
      />

      {actions.length > 0 ? <HomeActionRow actions={actions} queryContext={queryContext} /> : null}
    </div>
  );
}

function ScopedHomeCollection({
  actions,
  context,
  entity,
  entityName,
  onSelectContext,
  onSelectQuery,
  queryTabs,
  result,
  selectedContextRecordId,
  selectedQuery,
  today,
}: {
  actions: HomeActionConfig[];
  context: HomeContextConfig;
  entity: EntitySchema;
  entityName: string;
  onSelectContext?: (recordId: string | null) => void;
  onSelectQuery: (queryName: string) => void;
  queryTabs: HomeQueryTabConfig[];
  result: HomeResultConfig;
  selectedContextRecordId: string | null;
  selectedQuery: HomeQueryTabConfig;
  today: string;
}) {
  const contextOptions = useEntityRecordOptionsMatchingQuery(
    context.entityName,
    context.query,
    context.labelField,
    { today },
  );
  const activeContextRecordId = contextOptions.some(
    (option) => option.id === selectedContextRecordId,
  )
    ? selectedContextRecordId
    : (contextOptions[0]?.id ?? null);
  const queryContext = activeContextRecordId
    ? { today, values: { [context.name]: activeContextRecordId } }
    : undefined;

  useEffect(() => {
    if (selectedContextRecordId !== activeContextRecordId) {
      onSelectContext?.(activeContextRecordId);
    }
  }, [activeContextRecordId, onSelectContext, selectedContextRecordId]);

  return (
    <div className="space-y-6">
      <ContextSelector
        context={context}
        onSelectContext={onSelectContext}
        options={contextOptions}
        selectedContextRecordId={activeContextRecordId}
      />

      {queryTabs.length <= 1 ? null : (
        <Tabs
          onValueChange={(value) => {
            if (typeof value === "string") {
              onSelectQuery(value);
            }
          }}
          value={selectedQuery.queryName}
        >
          <TabsList aria-label={`${entity.label} queries`} variant="line">
            {queryTabs.map((queryTab) => (
              <HomeQueryTabTrigger
                entityName={entityName}
                key={queryTab.queryName}
                queryContext={queryContext}
                queryTab={queryTab}
              />
            ))}
          </TabsList>
        </Tabs>
      )}

      {queryContext ? (
        <RecordList
          entity={entity}
          entityName={entityName}
          query={selectedQuery.query}
          queryContext={queryContext}
          recordFields={result.recordFields}
        />
      ) : null}

      {actions.length > 0 ? (
        <HomeActionRow actions={actions} queryContext={queryContext ?? { today }} />
      ) : null}
    </div>
  );
}

function ContextSelector({
  context,
  onSelectContext,
  options,
  selectedContextRecordId,
}: {
  context: HomeContextConfig;
  onSelectContext?: (recordId: string | null) => void;
  options: Array<{ id: string; label: string }>;
  selectedContextRecordId: string | null;
}) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <section className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-4">
      <Field className="min-w-60 flex-1">
        <Label>{context.entity.label}</Label>
        <NativeSelect
          className="w-full"
          disabled={options.length === 0}
          onChange={(event) => onSelectContext?.(event.currentTarget.value || null)}
          value={selectedContextRecordId ?? ""}
        >
          {options.length === 0 ? <NativeSelectOption value="" /> : null}
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      {context.createAction ? (
        <Button
          disabled={!context.createAction.enabled}
          onClick={() => setCreateDialogOpen(true)}
          type="button"
          variant="outline"
        >
          {context.createAction.enabled ? context.createAction.label : "Create disabled"}
        </Button>
      ) : null}

      {options.length === 0 ? (
        <p className="basis-full text-sm text-slate-600">
          No {context.entity.label.toLowerCase()} records yet.
        </p>
      ) : null}

      {context.createAction && createDialogOpen ? (
        <GeneratedCreateDialog
          action={context.createAction}
          onOpenChange={(open) => setCreateDialogOpen(open)}
          onSuccess={(recordId) => {
            onSelectContext?.(recordId);
            setCreateDialogOpen(false);
          }}
          open={true}
        />
      ) : null}
    </section>
  );
}

function HomeQueryTabTrigger({
  entityName,
  queryContext,
  queryTab,
}: {
  entityName: string;
  queryContext?: QueryEvaluationContext;
  queryTab: HomeQueryTabConfig;
}) {
  return (
    <TabsTrigger value={queryTab.queryName}>
      <span>{queryTab.label}</span>
      {queryTab.count?.type === "count" && queryContext ? (
        <QueryCountBadge entityName={entityName} queryContext={queryContext} queryTab={queryTab} />
      ) : null}
    </TabsTrigger>
  );
}

function QueryCountBadge({
  entityName,
  queryContext,
  queryTab,
}: {
  entityName: string;
  queryContext: QueryEvaluationContext;
  queryTab: HomeQueryTabConfig;
}) {
  const count = useEntityRecordCountMatchingQuery(entityName, queryTab.query, queryContext);

  return (
    <Badge aria-label={`${queryTab.label} count`} className="h-4 px-1.5" variant="outline">
      {count}
    </Badge>
  );
}

export function RecordList({
  entity,
  entityName,
  query,
  queryContext,
  recordFields,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  recordFields: RecordFieldConfig[];
}) {
  const canPatch = entity.mutations.patch.enabled;
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);

  return (
    <section className="space-y-3">
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

function HomeActionRow({
  actions,
  queryContext,
}: {
  actions: HomeActionConfig[];
  queryContext: QueryEvaluationContext;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogAction, setCreateDialogAction] = useState<CreateHomeActionConfig | null>(null);

  async function runAction(action: Extract<HomeActionConfig, { type: "entity-action" }>) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action.actionName);
    setSyncStatus({ state: "syncing", message: `${action.label}...` });

    try {
      const response = await submitAction(action.entityName, action.actionName);
      const affected = response.changes.length;
      const message =
        action.count?.type === "count"
          ? `${action.label} synced. ${affected} affected.`
          : `${action.label} synced.`;

      setSyncStatus({ state: "idle", message });
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
    <section aria-label="Task actions" className="flex flex-wrap gap-2">
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
          <HomeEntityActionButton
            action={action}
            disabled={pendingAction !== null}
            key={`${action.type}:${action.actionName}`}
            onRun={runAction}
            pending={pendingAction === action.actionName}
            queryContext={queryContext}
          />
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
    </section>
  );
}

function HomeEntityActionButton({
  action,
  disabled,
  onRun,
  pending,
  queryContext,
}: {
  action: Extract<HomeActionConfig, { type: "entity-action" }>;
  disabled: boolean;
  onRun: (action: Extract<HomeActionConfig, { type: "entity-action" }>) => Promise<void>;
  pending: boolean;
  queryContext: QueryEvaluationContext;
}) {
  const count = useEntityRecordCountMatchingQuery(
    action.entityName,
    action.targetQuery,
    queryContext,
  );

  return (
    <Button disabled={disabled} onClick={() => void onRun(action)} type="button" variant="outline">
      <span>{pending ? `${action.label}...` : action.label}</span>
      {action.count?.type === "count" ? (
        <Badge
          aria-label={`${action.label} target count`}
          className="ml-2 h-4 px-1.5"
          variant="outline"
        >
          {count}
        </Badge>
      ) : null}
    </Button>
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
  return (
    <li className="p-3">
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

  if (editor === "enum" && field.type === "enum") {
    const label = fieldLabel(fieldName, field);
    const unknownValue = draft !== "" && !Object.hasOwn(field.values, draft) ? draft : null;

    return (
      <div className="min-w-40 flex-none space-y-1">
        <Field>
          <Label className="sr-only">{label}</Label>
          <NativeSelect
            aria-label={label}
            className="w-full"
            disabled={!canPatch || isPending}
            onChange={(event) => {
              const value = event.currentTarget.value;

              setDraft(value);
              void commit(value);
            }}
            required={field.required}
            value={draft}
          >
            {!field.required || draft === "" ? <NativeSelectOption value="" /> : null}
            {unknownValue ? (
              <NativeSelectOption value={unknownValue}>{unknownValue}</NativeSelectOption>
            ) : null}
            {Object.entries(field.values).map(([value, option]) => (
              <NativeSelectOption key={value} value={value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    );
  }

  if (editor === "reference" && field.type === "reference") {
    return (
      <RecordReferenceEditor
        canPatch={canPatch}
        draft={draft}
        error={error}
        field={field}
        fieldName={fieldName}
        isPending={isPending}
        onCommit={commit}
        onDraftChange={setDraft}
      />
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(inputValueToFieldValue(field, event.currentTarget.value));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(fieldValueToInputValue(recordValue));
    }
  }

  return (
    <div
      className={
        editor === "date" || editor === "number"
          ? "min-w-36 flex-none space-y-1"
          : "min-w-52 flex-1 space-y-1"
      }
    >
      <Field>
        <Label className="sr-only">{fieldLabel(fieldName, field)}</Label>
        <Input
          aria-label={fieldLabel(fieldName, field)}
          className="w-full rounded border border-slate-300 px-3 py-2"
          disabled={!canPatch || isPending}
          onBlur={(event) => {
            if (commitPolicy === "field-commit") {
              void commit(inputValueToFieldValue(field, event.currentTarget.value));
            }
          }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          required={field.required}
          {...numberInputAttributes(field)}
          type={editor === "date" ? "date" : editor === "number" ? "number" : "text"}
          value={draft}
        />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

function RecordReferenceEditor({
  canPatch,
  draft,
  error,
  field,
  fieldName,
  isPending,
  onCommit,
  onDraftChange,
}: {
  canPatch: boolean;
  draft: string;
  error: string | null;
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldName: string;
  isPending: boolean;
  onCommit: (value: FieldValue) => Promise<void>;
  onDraftChange: (value: string) => void;
}) {
  const label = fieldLabel(fieldName, field);
  const options = useReferenceOptions(field.to, field.displayField);
  const unknownValue =
    draft !== "" && !options.some((option) => option.id === draft) ? draft : null;

  return (
    <div className="min-w-48 flex-none space-y-1">
      <Field>
        <Label className="sr-only">{label}</Label>
        <NativeSelect
          aria-label={label}
          className="w-full"
          disabled={!canPatch || isPending}
          onChange={(event) => {
            const value = event.currentTarget.value;

            onDraftChange(value);
            void onCommit(value);
          }}
          required={field.required}
          value={draft}
        >
          {!field.required || draft === "" ? <NativeSelectOption value="" /> : null}
          {unknownValue ? (
            <NativeSelectOption value={unknownValue}>{unknownValue}</NativeSelectOption>
          ) : null}
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

function fieldValueToInputValue(value: FieldValue | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function inputValueToFieldValue(field: FieldSchema, value: string): FieldValue {
  return field.type === "number" ? numberInputValueToFieldValue(value) : value;
}

function numberInputValueToFieldValue(value: string): FieldValue {
  return value === "" ? "" : Number(value);
}

function numberInputAttributes(field: FieldSchema) {
  if (field.type !== "number") {
    return {};
  }

  return {
    max: field.max,
    min: field.min,
    step: field.integer ? "1" : "any",
  };
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

function useTodayDateString() {
  const [today, setToday] = useState(() => todayDateString());

  useEffect(() => {
    let timeoutId: number | undefined;

    function scheduleNextMidnight() {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);

      timeoutId = window.setTimeout(
        () => {
          setToday(todayDateString());
          scheduleNextMidnight();
        },
        nextMidnight.getTime() - now.getTime() + 1,
      );
    }

    scheduleNextMidnight();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return today;
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
  const [resettingSchema, setResettingSchema] = useState<DevResetSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resetLocalData(schema: DevResetSchema) {
    if (resettingSchema) {
      return;
    }

    setResettingSchema(schema);
    setError(null);

    try {
      await resetRemoteData(schema);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setResettingSchema(null);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <Button disabled={resettingSchema !== null} onClick={() => void resetLocalData("default")}>
        {resettingSchema === "default" ? "Resetting..." : "Reset task schema"}
      </Button>
      <Button
        disabled={resettingSchema !== null}
        onClick={() => void resetLocalData("rate-card")}
        variant="outline"
      >
        {resettingSchema === "rate-card" ? "Resetting..." : "Reset rate-card schema"}
      </Button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}
