import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@formless/ui/tabs";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreSchemaKey,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus, useSyncStatus } from "../../client/sync-status.ts";
import { bootstrapClient, startPushSync } from "../../client/sync.ts";
import { selectPrimaryCollectionModels } from "../../client/views.ts";
import { todayDateString } from "../../shared/date.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../../shared/schema-apps.ts";
import { HomeCollection } from "../generated/collection.tsx";
import { SchemaAppProvider } from "../generated/schema-app-context.tsx";
import { DeveloperStatusLine } from "./status-line.tsx";

export function HomeRoute({ schemaKey }: { schemaKey: SchemaKey }) {
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const schema = activeSchemaKey === null || activeSchemaKey === schemaKey ? activeSchema : null;
  const app = getSchemaAppDefinition(schemaKey);
  const collectionModels = useMemo(
    () => (schema ? selectPrimaryCollectionModels(schema) : []),
    [schema],
  );
  const [selectionState, setSelectionState] = useState(createHomeRouteSelectionState);
  const selectedViewName = selectionState.selectedViewName;
  const selectedQueryName = selectionState.selectedQueryName;
  const homeModel =
    collectionModels.find((model) => model.viewName === selectedViewName) ?? collectionModels[0];
  const homeCollection = homeModel?.collection;
  const queryTabs = homeCollection?.queries.tabs ?? [];
  const today = useTodayDateString();

  useEffect(() => {
    setSelectionState(createHomeRouteSelectionState());
  }, [schemaKey]);

  useEffect(() => {
    selectClientStoreSchemaKey(schemaKey);
    const stopBroadcast = connectBroadcastToClientStore(schemaKey);
    let stopPushSync = () => {};
    let cancelled = false;

    async function startSync() {
      setSyncStatus({ state: "syncing", message: `Syncing ${app.label}...` });

      try {
        await hydrateClientStore(schemaKey);
        await bootstrapClient(schemaKey);

        if (cancelled) {
          return;
        }

        setSyncStatus({ state: "idle", message: "Synced." });
        stopPushSync = startPushSync(schemaKey);
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
      stopPushSync();
    };
  }, [app.label, schemaKey]);

  useEffect(() => {
    const selectedViewExists = collectionModels.some(
      (model) => model.viewName === selectedViewName,
    );
    const defaultViewName = collectionModels[0]?.viewName ?? null;

    if (!selectedViewExists && selectedViewName !== defaultViewName) {
      setSelectionState((current) => withHomeRouteSelectedViewName(current, defaultViewName));
    }
  }, [collectionModels, selectedViewName]);

  useEffect(() => {
    const selectedQueryExists = queryTabs.some((tab) => tab.queryName === selectedQueryName);
    const defaultQueryName =
      homeCollection?.queries.defaultQueryName ?? queryTabs[0]?.queryName ?? null;

    if (!selectedQueryExists && selectedQueryName !== defaultQueryName) {
      setSelectionState((current) => withHomeRouteSelectedQueryName(current, defaultQueryName));
    }
  }, [homeCollection?.queries.defaultQueryName, queryTabs, selectedQueryName]);

  if (!schema) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p className="text-sm text-slate-600">
          <SchemaLoadingMessage appLabel={app.label} />
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

  const { entity } = homeModel.collection;
  const selectedQuery =
    queryTabs.find((tab) => tab.queryName === selectedQueryName) ??
    homeModel.collection.queries.defaultTab;
  const selectedContextRecordId = selectHomeRouteContextRecordId(
    selectionState,
    homeModel.viewName,
  );

  if (queryTabs.length === 0) {
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
              setSelectionState((current) => withHomeRouteSelectedViewName(current, value));
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

      <SchemaAppProvider schemaKey={schemaKey}>
        <HomeCollection
          collection={homeModel.collection}
          onSelectContext={(recordId) =>
            setSelectionState((current) =>
              withHomeRouteSelectedContextRecordId(current, homeModel.viewName, recordId),
            )
          }
          onSelectQuery={(queryName) =>
            setSelectionState((current) => withHomeRouteSelectedQueryName(current, queryName))
          }
          selectedContextRecordId={selectedContextRecordId}
          selectedQuery={selectedQuery}
          today={today}
        />
      </SchemaAppProvider>
    </section>
  );
}

export type HomeRouteSelectionState = {
  selectedViewName: string | null;
  selectedQueryName: string | null;
  selectedContextIdsByView: Record<string, string | null>;
};

export function createHomeRouteSelectionState(): HomeRouteSelectionState {
  return {
    selectedViewName: null,
    selectedQueryName: null,
    selectedContextIdsByView: {},
  };
}

export function withHomeRouteSelectedViewName(
  current: HomeRouteSelectionState,
  selectedViewName: string | null,
): HomeRouteSelectionState {
  return current.selectedViewName === selectedViewName ? current : { ...current, selectedViewName };
}

export function withHomeRouteSelectedQueryName(
  current: HomeRouteSelectionState,
  selectedQueryName: string | null,
): HomeRouteSelectionState {
  return current.selectedQueryName === selectedQueryName ? current : { ...current, selectedQueryName };
}

export function withHomeRouteSelectedContextRecordId(
  current: HomeRouteSelectionState,
  viewName: string,
  recordId: string | null,
): HomeRouteSelectionState {
  return current.selectedContextIdsByView[viewName] === recordId
    ? current
    : {
        ...current,
        selectedContextIdsByView: {
          ...current.selectedContextIdsByView,
          [viewName]: recordId,
        },
      };
}

export function selectHomeRouteContextRecordId(
  current: HomeRouteSelectionState,
  viewName: string,
): string | null {
  return current.selectedContextIdsByView[viewName] ?? null;
}

function SchemaLoadingMessage({ appLabel }: { appLabel: string }) {
  const syncStatus = useSyncStatus();

  return syncStatus.state === "error" ? `Could not load ${appLabel}.` : `Loading ${appLabel}...`;
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
