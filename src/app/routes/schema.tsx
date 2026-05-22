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
import { projectSchemaBuilderDraft } from "../../client/schema-builder.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../../shared/schema-apps.ts";
import {
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
          <SchemaBuilderWorkspace draftState={routeDraftState} sourceError={sourceError} />
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
  sourceError,
}: {
  draftState: SchemaRouteDraftState | null;
  sourceError: string | null;
}) {
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

  return (
    <div className="grid min-h-[32rem] grid-cols-1 overflow-hidden rounded border border-slate-200 bg-white lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside
        aria-label="Builder entities"
        className="border-b border-slate-200 bg-slate-50 lg:border-r lg:border-b-0"
      >
        <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Entities
        </div>
        <ul className="divide-y divide-slate-200">
          {entities.map((entity) => (
            <li className="px-3 py-2" key={entity.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-900">{entity.label}</span>
                <code className="shrink-0 text-xs text-slate-500">{entity.key}</code>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {entity.fields.length} {entity.fields.length === 1 ? "field" : "fields"}
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <section aria-label="Builder draft summary" className="min-w-0 p-4">
        <dl className="grid max-w-xl grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          <dt className="font-medium text-slate-500">Entities</dt>
          <dd className="text-slate-900">{entities.length}</dd>
          <dt className="font-medium text-slate-500">Fields</dt>
          <dd className="text-slate-900">
            {entities.reduce((count, entity) => count + entity.fields.length, 0)}
          </dd>
          <dt className="font-medium text-slate-500">Surfaces</dt>
          <dd className="text-slate-900">
            {entities.filter((entity) => entity.generatedSurface !== undefined).length}
          </dd>
        </dl>
      </section>
    </div>
  );
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
