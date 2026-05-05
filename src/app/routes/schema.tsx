import { useEffect, useState } from "react";
import { Button } from "@formless/ui/button";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  useSchema,
} from "../../client/store.ts";
import { type SyncStatus } from "../../client/sync-status.ts";
import { fetchActiveSchema, saveActiveSchema } from "../../client/sync.ts";
import { defaultSchemaKey } from "../../shared/schema-apps.ts";
import { parseAppSchema, stringifySchema } from "../../shared/schema.ts";
import { DeveloperStatusLine } from "./status-line.tsx";

export function SchemaRoute() {
  const schema = useSchema();
  const [editorText, setEditorText] = useState(() => (schema ? stringifySchema(schema) : ""));
  const [status, setStatus] = useState<SyncStatus>({
    state: "idle",
    message: "Schema editor ready.",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const stopBroadcast = connectBroadcastToClientStore(defaultSchemaKey);
    let cancelled = false;

    async function loadSchema() {
      try {
        await hydrateClientStore(defaultSchemaKey);
        await fetchActiveSchema(defaultSchemaKey);

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
      const response = await saveActiveSchema(defaultSchemaKey, parsed);

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
