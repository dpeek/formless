import { useEffect, useMemo, useState } from "react";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreSchemaKey,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus, useSyncStatus } from "../../client/sync-status.ts";
import { bootstrapClient, startPushSync } from "../../client/sync.ts";
import { selectScreenModelByPath } from "../../client/views.ts";
import { todayDateString } from "../../shared/date.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../../shared/schema-apps.ts";
import { SchemaAppProvider } from "../generated/schema-app-context.tsx";
import { HomeScreen } from "../generated/screen.tsx";
import { NotFoundRoute } from "./not-found.tsx";

export function HomeRoute({ schemaKey, screenPath }: { schemaKey: SchemaKey; screenPath: string }) {
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const schema = activeSchemaKey === null || activeSchemaKey === schemaKey ? activeSchema : null;
  const app = getSchemaAppDefinition(schemaKey);
  const homeScreen = useMemo(
    () => (schema ? selectScreenModelByPath(schema, screenPath) : undefined),
    [schema, screenPath],
  );
  const [selectionState, setSelectionState] = useState(createHomeRouteSelectionState);
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

  if (!schema) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p className="text-sm text-slate-600">
          <SchemaLoadingMessage appLabel={app.label} />
        </p>
      </section>
    );
  }

  if (!homeScreen) {
    if (screenPath !== "/") {
      return <NotFoundRoute />;
    }

    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p>No entities are defined in the active schema.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[112rem]">
      <SchemaAppProvider schemaKey={schemaKey}>
        <HomeScreen
          getSectionSelection={(section) => ({
            selectedContextRecordId: selectHomeRouteSectionContextRecordId(
              selectionState,
              homeScreen.screenName,
              section.id,
            ),
            selectedQueryName: selectHomeRouteSectionQueryName(
              selectionState,
              homeScreen.screenName,
              section.id,
            ),
          })}
          onSelectContext={(section, recordId) =>
            setSelectionState((current) =>
              withHomeRouteSelectedSectionContextRecordId(
                current,
                homeScreen.screenName,
                section.id,
                recordId,
              ),
            )
          }
          onSelectQuery={(section, queryName) =>
            setSelectionState((current) =>
              withHomeRouteSelectedSectionQueryName(
                current,
                homeScreen.screenName,
                section.id,
                queryName,
              ),
            )
          }
          screen={homeScreen}
          today={today}
        />
      </SchemaAppProvider>
    </section>
  );
}

export type HomeRouteSelectionState = {
  selectedScreenName: string | null;
  selectedQueryNamesBySection: Record<string, string | null>;
  selectedContextIdsBySection: Record<string, string | null>;
};

export function createHomeRouteSelectionState(): HomeRouteSelectionState {
  return {
    selectedScreenName: null,
    selectedQueryNamesBySection: {},
    selectedContextIdsBySection: {},
  };
}

export function withHomeRouteSelectedScreenName(
  current: HomeRouteSelectionState,
  selectedScreenName: string | null,
): HomeRouteSelectionState {
  return current.selectedScreenName === selectedScreenName
    ? current
    : { ...current, selectedScreenName };
}

export function withHomeRouteSelectedSectionQueryName(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
  selectedQueryName: string | null,
): HomeRouteSelectionState {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedQueryNamesBySection[sectionKey] === selectedQueryName
    ? current
    : {
        ...current,
        selectedQueryNamesBySection: {
          ...current.selectedQueryNamesBySection,
          [sectionKey]: selectedQueryName,
        },
      };
}

export function withHomeRouteSelectedSectionContextRecordId(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
  recordId: string | null,
): HomeRouteSelectionState {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedContextIdsBySection[sectionKey] === recordId
    ? current
    : {
        ...current,
        selectedContextIdsBySection: {
          ...current.selectedContextIdsBySection,
          [sectionKey]: recordId,
        },
      };
}

export function selectHomeRouteSectionQueryName(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
): string | null {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedQueryNamesBySection[sectionKey] ?? null;
}

export function selectHomeRouteSectionContextRecordId(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
): string | null {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedContextIdsBySection[sectionKey] ?? null;
}

export function homeRouteSectionSelectionKey(screenName: string, sectionId: string): string {
  return JSON.stringify([screenName, sectionId]);
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
