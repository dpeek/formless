import { useEffect, useMemo, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import { Link, useLocation } from "wouter";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreSchemaKey,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { fetchActiveSchema, saveActiveSchema } from "../../client/sync.ts";
import {
  projectSchemaBuilderDraft,
  validateSchemaBuilderKey,
  type SchemaBuilderEntityProjection,
  type SchemaBuilderFieldMetadataUpdate,
  type SchemaBuilderFieldProjection,
  type SchemaBuilderIntent,
} from "../../client/schema-builder.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../../shared/schema-apps.ts";
import type { EnumValueSchema, FieldSchema, TextFieldFormat } from "../../shared/schema.ts";
import {
  applySchemaRouteBuilderIntent,
  commitSchemaRouteDraftState,
  createSchemaRouteDraftState,
  isSchemaRouteDraftDirty,
  revertSchemaRouteDraftState,
  serializeSchemaRouteDraftForSave,
  updateSchemaRouteSourceText,
  type SchemaRouteDraftState,
} from "./schema-draft.ts";

type SchemaRouteMode = "builder" | "source";

export function SchemaRoute({ schemaKey }: { schemaKey: SchemaKey }) {
  const app = getSchemaAppDefinition(schemaKey);
  const [location] = useLocation();
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeIsActive = activeSchemaKey === null || activeSchemaKey === schemaKey;
  const schema = routeIsActive ? activeSchema : null;
  const [mode, setMode] = useState<SchemaRouteMode>("builder");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<SchemaRouteDraftState | null>(() =>
    schema ? createSchemaRouteDraftState(schema) : null,
  );
  const routeDraftState = routeIsActive ? draftState : null;
  const routeSourceText = routeDraftState?.sourceText ?? "";
  const isDirty = routeDraftState ? isSchemaRouteDraftDirty(routeDraftState) : false;
  const sourceError = routeDraftState?.sourceError ?? null;
  const [isSaving, setIsSaving] = useState(false);
  const appRoute = appRouteFromSchemaRoute(location);

  useEffect(() => {
    selectClientStoreSchemaKey(schemaKey);
    setMode("builder");
    setRouteError(null);
    setDraftState(null);
    setSyncStatus({ state: "syncing", message: "Loading active schema." });
    const stopBroadcast = connectBroadcastToClientStore(schemaKey);
    let cancelled = false;

    async function loadSchema() {
      try {
        await hydrateClientStore(schemaKey);
        await fetchActiveSchema(schemaKey);

        if (!cancelled) {
          setSyncStatus({ state: "idle", message: "Loaded active schema." });
        }
      } catch (error) {
        if (!cancelled) {
          setSyncStatus({
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
  }, [schemaKey]);

  useEffect(() => {
    if (schema) {
      setDraftState(createSchemaRouteDraftState(schema));
      setRouteError(null);
    }
  }, [schema]);

  async function submitSchema(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!routeDraftState) {
      return;
    }

    const saveResult = serializeSchemaRouteDraftForSave(routeDraftState);

    if (!saveResult.ok) {
      setRouteError(saveResult.message);
      setMode("source");
      setSyncStatus({ state: "error", message: saveResult.message });
      return;
    }

    setIsSaving(true);
    setRouteError(null);
    setSyncStatus({ state: "syncing", message: "Saving schema..." });

    try {
      const response = await saveActiveSchema(schemaKey, saveResult.schema);

      setDraftState(commitSchemaRouteDraftState(response.schema));
      setSyncStatus({ state: "idle", message: `Saved schema at ${response.updatedAt}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Schema save failed.";
      setRouteError(message);
      setSyncStatus({
        state: "error",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  function updateSourceText(sourceText: string) {
    setRouteError(null);
    setDraftState((current) =>
      current ? updateSchemaRouteSourceText(current, sourceText) : current,
    );
  }

  function revertDraft() {
    if (!routeDraftState) {
      return;
    }

    setDraftState(revertSchemaRouteDraftState(routeDraftState));
    setRouteError(null);
    setMode("builder");
    setSyncStatus({ state: "idle", message: "Reverted schema draft." });
  }

  function applyBuilderIntent(intent: SchemaBuilderIntent): boolean {
    if (!routeDraftState) {
      return false;
    }

    const result = applySchemaRouteBuilderIntent(routeDraftState, intent);

    if (!result.ok) {
      setRouteError(result.message);
      setSyncStatus({ state: "error", message: result.message });
      return false;
    }

    setDraftState(result.state);
    setRouteError(null);
    setSyncStatus({ state: "idle", message: "Updated schema draft." });
    return true;
  }

  return (
    <section className="mx-auto w-full max-w-[112rem] space-y-4">
      <form className="space-y-4" onSubmit={submitSchema}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold">{app.label} Schema</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>
                Key <code>{app.key}</code>
              </span>
              <SchemaDraftStatus
                isDirty={isDirty}
                isLoaded={routeDraftState !== null}
                sourceError={sourceError}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              intent="outline"
              isDisabled={!isDirty || isSaving || routeDraftState === null}
              onPress={revertDraft}
              type="button"
            >
              Revert draft
            </Button>
            <Button
              isDisabled={!isDirty || isSaving || routeDraftState === null || sourceError !== null}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save schema"}
            </Button>
            <Link
              className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 hover:no-underline"
              href={appRoute}
            >
              Open app
            </Link>
          </div>
        </header>

        {(routeError || sourceError) && (
          <p
            className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-800"
            role="alert"
          >
            {routeError ?? `Source schema is invalid. ${sourceError}`}
          </p>
        )}

        <SchemaModeTabs mode={mode} onModeChange={setMode} sourceError={sourceError} />

        <div hidden={mode !== "builder"} id="schema-builder-panel" role="tabpanel">
          <SchemaBuilderWorkspace
            draftState={routeDraftState}
            onApplyIntent={applyBuilderIntent}
            sourceError={sourceError}
          />
        </div>

        <div hidden={mode !== "source"} id="schema-source-panel" role="tabpanel">
          <textarea
            aria-label="Schema source"
            className="min-h-[32rem] w-full resize-y rounded border border-slate-300 px-3 py-2 font-mono text-sm"
            onChange={(event) => updateSourceText(event.currentTarget.value)}
            placeholder="Loading active schema..."
            spellCheck={false}
            value={routeSourceText}
          />
        </div>
      </form>
    </section>
  );
}

function SchemaDraftStatus({
  isDirty,
  isLoaded,
  sourceError,
}: {
  isDirty: boolean;
  isLoaded: boolean;
  sourceError: string | null;
}) {
  const label = !isLoaded
    ? "Loading draft"
    : sourceError
      ? "Source invalid"
      : isDirty
        ? "Unsaved draft"
        : "Saved draft";
  const tone = sourceError
    ? "border-red-200 bg-red-50 text-red-700"
    : isDirty
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${tone}`} role="status">
      {label}
    </span>
  );
}

function SchemaModeTabs({
  mode,
  onModeChange,
  sourceError,
}: {
  mode: SchemaRouteMode;
  onModeChange: (mode: SchemaRouteMode) => void;
  sourceError: string | null;
}) {
  return (
    <div
      aria-label="Schema editor mode"
      className="inline-flex rounded border border-slate-300 p-0.5"
      role="tablist"
    >
      <button
        aria-controls="schema-builder-panel"
        aria-selected={mode === "builder"}
        className={modeTabClassName(mode === "builder")}
        disabled={sourceError !== null}
        onClick={() => onModeChange("builder")}
        role="tab"
        type="button"
      >
        Builder
      </button>
      <button
        aria-controls="schema-source-panel"
        aria-selected={mode === "source"}
        className={modeTabClassName(mode === "source")}
        onClick={() => onModeChange("source")}
        role="tab"
        type="button"
      >
        Source
      </button>
    </div>
  );
}

function modeTabClassName(isSelected: boolean) {
  const base = "rounded px-3 py-1.5 text-sm font-medium";
  return isSelected
    ? `${base} bg-slate-900 text-white`
    : `${base} text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50`;
}

function SchemaBuilderWorkspace({
  draftState,
  onApplyIntent,
  sourceError,
}: {
  draftState: SchemaRouteDraftState | null;
  onApplyIntent: (intent: SchemaBuilderIntent) => boolean;
  sourceError: string | null;
}) {
  const [selectedEntityKeyState, setSelectedEntityKey] = useState<string | null>(null);
  const [selectedFieldKeyState, setSelectedFieldKey] = useState<string | null>(null);
  const [newEntityKey, setNewEntityKey] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [entityFormError, setEntityFormError] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldSchema["type"]>("text");
  const [newReferenceTarget, setNewReferenceTarget] = useState("");
  const [fieldFormError, setFieldFormError] = useState<string | null>(null);
  const projection = useMemo(
    () => (draftState ? projectSchemaBuilderDraft(draftState.draft) : null),
    [draftState],
  );

  if (!draftState) {
    return (
      <div className="rounded border border-slate-200 px-4 py-6 text-sm text-slate-600">
        Loading active schema.
      </div>
    );
  }

  if (sourceError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800">
        Builder is paused until Source is valid.
      </div>
    );
  }

  const entities = projection?.entities ?? [];
  const schema = draftState.draft.schema;
  const selectedEntityKey =
    selectedEntityKeyState && entities.some((entity) => entity.key === selectedEntityKeyState)
      ? selectedEntityKeyState
      : (entities[0]?.key ?? null);
  const selectedEntity =
    selectedEntityKey === null
      ? undefined
      : entities.find((entity) => entity.key === selectedEntityKey);
  const selectedFieldKey =
    selectedFieldKeyState &&
    selectedEntity?.fields.some((field) => field.key === selectedFieldKeyState)
      ? selectedFieldKeyState
      : (selectedEntity?.fields[0]?.key ?? null);
  const selectedFieldProjection =
    selectedEntity && selectedFieldKey
      ? selectedEntity.fields.find((field) => field.key === selectedFieldKey)
      : undefined;
  const selectedField =
    selectedEntity && selectedFieldProjection
      ? schema.entities[selectedEntity.key]?.fields[selectedFieldProjection.key]
      : undefined;
  const referenceTargetForNewField =
    newReferenceTarget && schema.entities[newReferenceTarget] !== undefined
      ? newReferenceTarget
      : (selectedEntity?.key ?? entities[0]?.key ?? "");

  function createEntity() {
    const key = newEntityKey.trim();
    const keyResult = validateSchemaBuilderKey("entity", key);

    if (!keyResult.ok) {
      setEntityFormError(keyResult.message);
      return;
    }

    if (schema.entities[key] !== undefined) {
      setEntityFormError(`Entity key "${key}" already exists.`);
      return;
    }

    const created = onApplyIntent({
      type: "createEntity",
      key,
      label: newEntityLabel.trim() === "" ? undefined : newEntityLabel,
    });

    if (created) {
      setSelectedEntityKey(key);
      setSelectedFieldKey(null);
      setNewEntityKey("");
      setNewEntityLabel("");
      setEntityFormError(null);
    }
  }

  function addField() {
    if (!selectedEntity) {
      return;
    }

    const fieldKey = newFieldKey.trim();
    const keyResult = validateSchemaBuilderKey("field", fieldKey);

    if (!keyResult.ok) {
      setFieldFormError(keyResult.message);
      return;
    }

    if (schema.entities[selectedEntity.key]?.fields[fieldKey] !== undefined) {
      setFieldFormError(`Field key "${selectedEntity.key}.${fieldKey}" already exists.`);
      return;
    }

    const metadata: SchemaBuilderFieldMetadataUpdate =
      newFieldType === "reference" ? { to: referenceTargetForNewField } : {};
    const added = onApplyIntent({
      type: "addField",
      entityKey: selectedEntity.key,
      fieldKey,
      fieldType: newFieldType,
      metadata,
    });

    if (added) {
      setSelectedFieldKey(fieldKey);
      setNewFieldKey("");
      setFieldFormError(null);
    }
  }

  function updateSelectedEntityLabel(label: string) {
    if (!selectedEntity || label === selectedEntity.label) {
      return;
    }

    onApplyIntent({
      type: "updateEntityLabel",
      entityKey: selectedEntity.key,
      label,
    });
  }

  function createSelectedEntitySurface() {
    if (!selectedEntity) {
      return;
    }

    onApplyIntent({
      type: "createGeneratedSurface",
      entityKey: selectedEntity.key,
    });
  }

  function updateSelectedFieldMetadata(metadata: SchemaBuilderFieldMetadataUpdate) {
    if (!selectedEntity || !selectedFieldProjection) {
      return false;
    }

    return onApplyIntent({
      type: "updateFieldMetadata",
      entityKey: selectedEntity.key,
      fieldKey: selectedFieldProjection.key,
      metadata,
    });
  }

  return (
    <div className="grid min-h-[32rem] grid-cols-1 overflow-hidden rounded border border-slate-200 bg-white lg:grid-cols-[18rem_22rem_minmax(0,1fr)]">
      <aside
        aria-label="Builder entities"
        className="border-b border-slate-200 bg-slate-50 lg:border-r lg:border-b-0"
      >
        <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Entities
        </div>
        <div className="divide-y divide-slate-200">
          <ul className="max-h-[28rem] overflow-auto">
            {entities.map((entity) => (
              <li key={entity.key}>
                <button
                  aria-current={entity.key === selectedEntityKey ? "true" : undefined}
                  className={`block w-full px-3 py-2 text-left hover:bg-white ${
                    entity.key === selectedEntityKey ? "bg-white" : ""
                  }`}
                  onClick={() => {
                    setSelectedEntityKey(entity.key);
                    setSelectedFieldKey(null);
                  }}
                  type="button"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {entity.label}
                    </span>
                    <code className="shrink-0 text-xs text-slate-500">{entity.key}</code>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {entity.fields.length} {entity.fields.length === 1 ? "field" : "fields"}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div aria-label="Create entity" className="space-y-2 p-3" role="form">
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              New entity
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Key</span>
              <input
                className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
                onChange={(event) => setNewEntityKey(event.currentTarget.value)}
                placeholder="project"
                value={newEntityKey}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Label</span>
              <input
                className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
                onChange={(event) => setNewEntityLabel(event.currentTarget.value)}
                placeholder="Project"
                value={newEntityLabel}
              />
            </label>
            {entityFormError && <BuilderInlineError>{entityFormError}</BuilderInlineError>}
            <Button onPress={createEntity} type="button">
              Create entity
            </Button>
          </div>
        </div>
      </aside>
      <section
        aria-label={selectedEntity ? `${selectedEntity.label} fields` : "Builder fields"}
        className="border-b border-slate-200 lg:border-r lg:border-b-0"
      >
        {selectedEntity ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="truncate text-sm font-semibold text-slate-900">
                  {selectedEntity.label}
                </h2>
                <code className="shrink-0 text-xs text-slate-500">{selectedEntity.key}</code>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {selectedEntity.generatedSurface ? "Builder surface" : "Source-owned surface"}
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-auto divide-y divide-slate-200">
              {selectedEntity.fields.map((field) => (
                <li key={field.key}>
                  <button
                    aria-current={field.key === selectedFieldKey ? "true" : undefined}
                    className={`block w-full px-4 py-2 text-left hover:bg-slate-50 ${
                      field.key === selectedFieldKey ? "bg-slate-50" : ""
                    }`}
                    onClick={() => setSelectedFieldKey(field.key)}
                    type="button"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {field.label}
                      </span>
                      <code className="shrink-0 text-xs text-slate-500">{field.key}</code>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{field.type}</span>
                      {field.required && <span>Required</span>}
                      {field.saved ? <span>Saved</span> : <span>Draft</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <div
              aria-label="Add field"
              className="space-y-2 border-t border-slate-200 p-4"
              role="form"
            >
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                New field
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Key</span>
                <input
                  className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
                  onChange={(event) => setNewFieldKey(event.currentTarget.value)}
                  placeholder="title"
                  value={newFieldKey}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Type</span>
                <FieldTypeSelect
                  onChange={(fieldType) => setNewFieldType(fieldType)}
                  value={newFieldType}
                />
              </label>
              {newFieldType === "reference" && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600">Reference target</span>
                  <EntitySelect
                    entities={entities}
                    onChange={setNewReferenceTarget}
                    value={referenceTargetForNewField}
                  />
                </label>
              )}
              {fieldFormError && <BuilderInlineError>{fieldFormError}</BuilderInlineError>}
              <Button onPress={addField} type="button">
                Add field
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 text-sm text-slate-600">Create an entity to start building.</div>
        )}
      </section>
      <section aria-label="Field details" className="min-w-0 p-4">
        {selectedEntity ? (
          <div className="space-y-5">
            <EntityDetails
              entity={selectedEntity}
              onCreateSurface={createSelectedEntitySurface}
              onUpdateLabel={updateSelectedEntityLabel}
            />

            {selectedField && selectedFieldProjection ? (
              <FieldDetails
                entities={entities}
                entity={selectedEntity}
                field={selectedField}
                fieldProjection={selectedFieldProjection}
                onUpdateMetadata={updateSelectedFieldMetadata}
                schema={schema}
              />
            ) : (
              <div className="rounded border border-slate-200 px-3 py-4 text-sm text-slate-600">
                Add a field to configure this entity.
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-600">No entity selected.</div>
        )}
      </section>
    </div>
  );
}

function EntityDetails({
  entity,
  onCreateSurface,
  onUpdateLabel,
}: {
  entity: SchemaBuilderEntityProjection;
  onCreateSurface: () => void;
  onUpdateLabel: (label: string) => void;
}) {
  return (
    <section className="space-y-3" aria-label={`${entity.label} details`}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Entity</h2>
        <p className="text-xs text-slate-500">
          <code>{entity.key}</code> {entity.saved ? "saved" : "draft"}
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Label</span>
        <input
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          defaultValue={entity.label}
          key={`${entity.key}-label`}
          onBlur={(event) => onUpdateLabel(event.currentTarget.value)}
        />
      </label>
      {entity.generatedSurface ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Generated surface is builder-owned.
        </div>
      ) : (
        <div className="space-y-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <p>This entity is using source-owned app surfaces.</p>
          <Button intent="outline" onPress={onCreateSurface} type="button">
            Create generated surface
          </Button>
        </div>
      )}
    </section>
  );
}

function FieldDetails({
  entities,
  entity,
  field,
  fieldProjection,
  onUpdateMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  entity: SchemaBuilderEntityProjection;
  field: FieldSchema;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  function updateFieldType(fieldType: FieldSchema["type"]) {
    const metadata: SchemaBuilderFieldMetadataUpdate = { type: fieldType };

    if (fieldType === "reference") {
      metadata.to = field.type === "reference" ? field.to : (entities[0]?.key ?? entity.key);
      metadata.displayField = null;
    }

    onUpdateMetadata(metadata);
  }

  return (
    <section className="space-y-4" aria-label={`${fieldProjection.label} field details`}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Field</h2>
        <p className="text-xs text-slate-500">
          <code>
            {entity.key}.{fieldProjection.key}
          </code>{" "}
          {fieldProjection.saved ? "saved" : "draft"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Key</span>
          <input
            className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-600"
            disabled
            value={fieldProjection.key}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Type</span>
          <FieldTypeSelect
            disabled={fieldProjection.typeLocked}
            onChange={updateFieldType}
            value={field.type}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Label</span>
        <input
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          defaultValue={fieldProjection.label}
          key={`${entity.key}.${fieldProjection.key}.label`}
          onBlur={(event) => onUpdateMetadata({ label: event.currentTarget.value })}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          checked={field.required}
          className="h-4 w-4 rounded border-slate-300"
          onChange={(event) => onUpdateMetadata({ required: event.currentTarget.checked })}
          type="checkbox"
        />
        Required
      </label>

      <TypedFieldMetadataControls
        entities={entities}
        field={field}
        fieldProjection={fieldProjection}
        onUpdateMetadata={onUpdateMetadata}
        schema={schema}
      />
    </section>
  );
}

function TypedFieldMetadataControls({
  entities,
  field,
  fieldProjection,
  onUpdateMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  field: FieldSchema;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  if (field.type === "text") {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Text format</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({ format: event.currentTarget.value as TextFieldFormat })
          }
          value={field.format ?? "plain"}
        >
          {textFormatOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Default</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({ default: booleanDefaultFromInput(event.currentTarget.value) })
          }
          value={booleanDefaultInputValue(field.default)}
        >
          <option value="">No default</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    );
  }

  if (field.type === "number") {
    return <NumberFieldControls field={field} onUpdateMetadata={onUpdateMetadata} />;
  }

  if (field.type === "enum") {
    return <EnumFieldControls field={field} onUpdateMetadata={onUpdateMetadata} />;
  }

  if (field.type === "reference") {
    return (
      <ReferenceFieldControls
        entities={entities}
        field={field}
        fieldProjection={fieldProjection}
        onUpdateMetadata={onUpdateMetadata}
        schema={schema}
      />
    );
  }

  return null;
}

function NumberFieldControls({
  field,
  onUpdateMetadata,
}: {
  field: Extract<FieldSchema, { type: "number" }>;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <NumberMetadataInput
        label="Default"
        onChange={(value) => onUpdateMetadata({ default: value })}
        value={field.default}
      />
      <NumberMetadataInput
        label="Min"
        onChange={(value) => onUpdateMetadata({ min: value })}
        value={field.min}
      />
      <NumberMetadataInput
        label="Max"
        onChange={(value) => onUpdateMetadata({ max: value })}
        value={field.max}
      />
      <label className="flex items-center gap-2 pt-6 text-sm text-slate-800">
        <input
          checked={field.integer ?? false}
          className="h-4 w-4 rounded border-slate-300"
          onChange={(event) => onUpdateMetadata({ integer: event.currentTarget.checked })}
          type="checkbox"
        />
        Integer
      </label>
    </div>
  );
}

function NumberMetadataInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number | null) => void;
  value: number | undefined;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
        defaultValue={value ?? ""}
        key={`${label}-${value ?? "empty"}`}
        onBlur={(event) => {
          const input = event.currentTarget.value.trim();
          if (input === "") {
            onChange(null);
            return;
          }

          const parsed = Number(input);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        type="number"
      />
    </label>
  );
}

function EnumFieldControls({
  field,
  onUpdateMetadata,
}: {
  field: Extract<FieldSchema, { type: "enum" }>;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
}) {
  const [enumError, setEnumError] = useState<string | null>(null);

  function updateValues(value: string) {
    const result = enumValuesFromText(value);

    if (!result.ok) {
      setEnumError(result.message);
      return;
    }

    setEnumError(null);
    onUpdateMetadata({
      values: result.values,
      ...(field.default && result.values[field.default] === undefined ? { default: null } : {}),
    });
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Values</span>
        <textarea
          className="min-h-24 w-full rounded border border-slate-300 px-2 py-2 font-mono text-sm"
          defaultValue={enumValuesToText(field.values)}
          key={enumValuesToText(field.values)}
          onBlur={(event) => updateValues(event.currentTarget.value)}
          spellCheck={false}
        />
      </label>
      {enumError && <BuilderInlineError>{enumError}</BuilderInlineError>}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Default</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({
              default: event.currentTarget.value === "" ? null : event.currentTarget.value,
            })
          }
          value={field.default ?? ""}
        >
          <option value="">No default</option>
          {Object.entries(field.values).map(([valueKey, value]) => (
            <option key={valueKey} value={valueKey}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ReferenceFieldControls({
  entities,
  field,
  fieldProjection,
  onUpdateMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  const targetEntity = schema.entities[field.to];
  const textFields = Object.entries(targetEntity?.fields ?? {}).filter(
    ([, targetField]) => targetField.type === "text",
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Reference target</span>
        <EntitySelect
          disabled={fieldProjection.referenceTargetLocked}
          entities={entities}
          onChange={(target) => onUpdateMetadata({ to: target, displayField: null })}
          value={field.to}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Display field</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({
              displayField: event.currentTarget.value === "" ? null : event.currentTarget.value,
            })
          }
          value={field.displayField ?? ""}
        >
          <option value="">Record id</option>
          {textFields.map(([fieldKey, targetField]) => (
            <option key={fieldKey} value={fieldKey}>
              {targetField.label ?? fieldKey}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function FieldTypeSelect({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (fieldType: FieldSchema["type"]) => void;
  value: FieldSchema["type"];
}) {
  return (
    <select
      className="h-9 w-full rounded border border-slate-300 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value as FieldSchema["type"])}
      value={value}
    >
      {fieldTypeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EntitySelect({
  disabled,
  entities,
  onChange,
  value,
}: {
  disabled?: boolean;
  entities: SchemaBuilderEntityProjection[];
  onChange: (entityKey: string) => void;
  value: string;
}) {
  return (
    <select
      className="h-9 w-full rounded border border-slate-300 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    >
      {entities.map((entity) => (
        <option key={entity.key} value={entity.key}>
          {entity.label}
        </option>
      ))}
    </select>
  );
}

function BuilderInlineError({ children }: { children: string }) {
  return (
    <p
      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800"
      role="alert"
    >
      {children}
    </p>
  );
}

const fieldTypeOptions = [
  { value: "text", label: "Text" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "enum", label: "Enum" },
  { value: "reference", label: "Reference" },
] satisfies { label: string; value: FieldSchema["type"] }[];

const textFormatOptions = [
  { value: "plain", label: "Plain text" },
  { value: "longText", label: "Long text" },
  { value: "markdown", label: "Markdown" },
  { value: "href", label: "Link" },
  { value: "slug", label: "Slug" },
  { value: "color", label: "Color" },
  { value: "icon", label: "Icon" },
] satisfies { label: string; value: TextFieldFormat }[];

function booleanDefaultInputValue(value: boolean | undefined) {
  if (value === true) {
    return "true";
  }

  if (value === false) {
    return "false";
  }

  return "";
}

function booleanDefaultFromInput(value: string) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function enumValuesToText(values: Record<string, EnumValueSchema>) {
  return Object.entries(values)
    .map(([valueKey, value]) => `${valueKey}: ${value.label}`)
    .join("\n");
}

function enumValuesFromText(
  value: string,
): { ok: true; values: Record<string, EnumValueSchema> } | { message: string; ok: false } {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { ok: false, message: "Enum values must not be empty." };
  }

  const values: Record<string, EnumValueSchema> = {};

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    const valueKey = (separatorIndex === -1 ? line : line.slice(0, separatorIndex)).trim();
    const label = (separatorIndex === -1 ? line : line.slice(separatorIndex + 1)).trim();
    const keyResult = validateSchemaBuilderKey("enum value", valueKey);

    if (!keyResult.ok) {
      return { ok: false, message: keyResult.message };
    }

    if (label === "") {
      return { ok: false, message: `Enum value "${valueKey}" label is required.` };
    }

    values[valueKey] = { label };
  }

  return { ok: true, values };
}

function appRouteFromSchemaRoute(location: string): `/${string}` {
  if (location === "/schema") {
    return "/";
  }

  if (location.endsWith("/schema")) {
    const appRoute = location.slice(0, -"/schema".length);
    return (appRoute === "" ? "/" : appRoute) as `/${string}`;
  }

  return "/";
}
