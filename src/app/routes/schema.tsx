import { useEffect, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreSchemaKey,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { fetchActiveSchema, saveActiveSchema } from "../../client/sync.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../../shared/schema-apps.ts";
import { parseAppSchema, stringifySchema } from "../../shared/schema.ts";

export function SchemaRoute({ schemaKey }: { schemaKey: SchemaKey }) {
  const app = getSchemaAppDefinition(schemaKey);
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeIsActive = activeSchemaKey === null || activeSchemaKey === schemaKey;
  const schema = routeIsActive ? activeSchema : null;
  const [editorText, setEditorText] = useState(() => (schema ? stringifySchema(schema) : ""));
  const routeEditorText = routeIsActive ? editorText : "";
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    selectClientStoreSchemaKey(schemaKey);
    setEditorText("");
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
      setEditorText(stringifySchema(schema));
    }
  }, [schema]);

  async function submitSchema(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSyncStatus({ state: "syncing", message: "Saving schema..." });

    try {
      const parsed = parseAppSchema(JSON.parse(editorText) as unknown);
      const response = await saveActiveSchema(schemaKey, parsed);

      setEditorText(stringifySchema(response.schema));
      setSyncStatus({ state: "idle", message: `Saved schema at ${response.updatedAt}.` });
    } catch (error) {
      setSyncStatus({
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
      </header>

      <form className="space-y-4" onSubmit={submitSchema}>
        <textarea
          className="min-h-96 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
          onChange={(event) => setEditorText(event.currentTarget.value)}
          placeholder="Loading active schema..."
          spellCheck={false}
          value={routeEditorText}
        />

        <Button isDisabled={isSaving} type="submit">
          {isSaving ? "Saving..." : "Save schema"}
        </Button>
      </form>
    </section>
  );
}
