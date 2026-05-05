import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@formless/ui/tabs";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus, useSyncStatus } from "../../client/sync-status.ts";
import { bootstrapClient, startPollingSync } from "../../client/sync.ts";
import { selectPrimaryCollectionModels } from "../../client/views.ts";
import { todayDateString } from "../../shared/date.ts";
import { defaultSchemaKey } from "../../shared/schema-apps.ts";
import { HomeCollection } from "../generated/collection.tsx";
import { DeveloperStatusLine } from "./status-line.tsx";

export function HomeRoute() {
  const schema = useSchema();
  const collectionModels = useMemo(
    () => (schema ? selectPrimaryCollectionModels(schema) : []),
    [schema],
  );
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
    const stopBroadcast = connectBroadcastToClientStore(defaultSchemaKey);
    let stopPolling = () => {};
    let cancelled = false;

    async function startSync() {
      setSyncStatus({ state: "syncing", message: "Syncing with authority..." });

      try {
        await hydrateClientStore(defaultSchemaKey);
        await bootstrapClient(defaultSchemaKey);

        if (cancelled) {
          return;
        }

        setSyncStatus({ state: "idle", message: "Synced." });
        stopPolling = startPollingSync(defaultSchemaKey);
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
