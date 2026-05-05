import { useEffect, useState } from "react";
import { Button } from "@formless/ui/button";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreSchemaKey,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { type SyncStatus } from "../../client/sync-status.ts";
import { fetchActiveSchema, saveActiveSchema } from "../../client/sync.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../../shared/schema-apps.ts";
import { parseAppSchema, stringifySchema } from "../../shared/schema.ts";
import { DevActions } from "../dev-actions.tsx";
import { DeveloperStatusLine } from "./status-line.tsx";

export function SchemaRoute({ schemaKey }: { schemaKey: SchemaKey }) {
  const app = getSchemaAppDefinition(schemaKey);
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeIsActive = activeSchemaKey === null || activeSchemaKey === schemaKey;
  const schema = routeIsActive ? activeSchema : null;
  const [editorText, setEditorText] = useState(() => (schema ? stringifySchema(schema) : ""));
  const routeEditorText = routeIsActive ? editorText : "";
  const [status, setStatus] = useState<SyncStatus>({
    state: "idle",
    message: "Schema editor ready.",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    selectClientStoreSchemaKey(schemaKey);
    setEditorText("");
    setStatus({ state: "syncing", message: "Loading active schema." });
    const stopBroadcast = connectBroadcastToClientStore(schemaKey);
    let cancelled = false;

    async function loadSchema() {
      try {
        await hydrateClientStore(schemaKey);
        await fetchActiveSchema(schemaKey);

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
  }, [schemaKey]);

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
      const response = await saveActiveSchema(schemaKey, parsed);

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
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{app.label} Schema</h1>
          <p className="text-sm text-slate-600">
            Key <code>{app.key}</code>
          </p>
        </div>
        <DeveloperStatusLine schemaVersion={schema?.version} status={status} />
      </header>

      <DevActions
        schemaKey={schemaKey}
        onResetSchema={(response) => {
          setEditorText(stringifySchema(response.schema));
          setStatus({
            state: "idle",
            message: `Reset schema at ${response.schemaUpdatedAt}.`,
          });
        }}
        onResetSeedData={(response) => {
          setEditorText(stringifySchema(response.schema));
          setStatus({
            state: "idle",
            message: `Reset seed data at ${response.schemaUpdatedAt}.`,
          });
        }}
      />

      <form className="space-y-4" onSubmit={submitSchema}>
        <textarea
          className="min-h-96 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
          onChange={(event) => setEditorText(event.currentTarget.value)}
          placeholder="Loading active schema..."
          spellCheck={false}
          value={routeEditorText}
        />

        <Button disabled={isSaving} type="submit">
          {isSaving ? "Saving..." : "Save schema"}
        </Button>
      </form>
    </section>
  );
}
