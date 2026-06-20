import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreTarget,
  useActiveClientStorageName,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus, useSyncStatus } from "../../client/sync-status.ts";
import { bootstrapClient, startPushSync } from "../../client/sync.ts";
import {
  appStorageIdentityForClientTarget,
  clientTargetLabel,
  clientTargetForSchemaKey,
  clientTargetSourceSchemaKey,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import { selectScreenModelByPath } from "../../client/views.ts";
import { todayDateString } from "../../shared/date.ts";
import { SchemaAppProvider } from "../generated/schema-app-context.tsx";
import { HomeScreen } from "../generated/screen.tsx";
import { NotFoundRoute } from "./not-found.tsx";
import type { AppPackageResolver } from "@dpeek/formless-installed-apps";
import {
  createHomeRouteSelectionState,
  selectHomeRouteSectionContextRecordId,
  selectHomeRouteSectionQueryName,
  useHomeRouteSelectionStore,
  withHomeRouteSelectedSectionContextRecordId,
  withHomeRouteSelectedSectionQueryName,
} from "./home-selection.tsx";

export {
  createHomeRouteSelectionState,
  homeRouteSectionSelectionKey,
  selectHomeRouteSectionContextRecordId,
  selectHomeRouteSectionQueryName,
  withHomeRouteSelectedScreenName,
  withHomeRouteSelectedSectionContextRecordId,
  withHomeRouteSelectedSectionQueryName,
} from "./home-selection.tsx";

export function HomeRoute({
  activePackageResolver,
  target,
  schemaKey,
  sectionOperationControls,
  screenPath,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  target?: ClientAppTarget;
  schemaKey: ClientAppSchemaKey;
  sectionOperationControls?: Record<string, ReactNode>;
  screenPath: string;
}) {
  const appTarget = target ?? clientTargetForSchemaKey(schemaKey);
  const appTargetIdentity = appStorageIdentityForClientTarget(appTarget);
  const appLabel = clientTargetLabel(appTarget);
  const appSchemaKey = clientTargetSourceSchemaKey(appTarget);
  const activeClientStorageName = useActiveClientStorageName();
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeStoreMatchesTarget =
    activeClientStorageName === null ||
    activeClientStorageName === appTargetIdentity.browserDatabaseName;
  const routeIsActive =
    routeStoreMatchesTarget && (activeSchemaKey === null || activeSchemaKey === appSchemaKey);
  const schema = routeIsActive ? activeSchema : null;
  const homeScreen = useMemo(
    () => (schema ? selectScreenModelByPath(schema, screenPath) : undefined),
    [schema, screenPath],
  );
  const [localSelectionState, setLocalSelectionState] = useState(createHomeRouteSelectionState);
  const routeSelectionStore = useHomeRouteSelectionStore();
  const selectionState = routeSelectionStore?.selectionState ?? localSelectionState;
  const setSelectionState = routeSelectionStore?.setSelectionState ?? setLocalSelectionState;
  const today = useTodayDateString();

  useEffect(() => {
    setSelectionState(createHomeRouteSelectionState());
  }, [appTargetIdentity.browserDatabaseName, setSelectionState]);

  useEffect(() => {
    selectClientStoreTarget(appTarget);
    const stopBroadcast = connectBroadcastToClientStore(appTarget);
    let stopPushSync = () => {};
    let cancelled = false;

    async function startSync() {
      setSyncStatus({ state: "syncing", message: `Syncing ${appLabel}...` });

      try {
        await hydrateClientStore(appTarget);
        await bootstrapClient(appTarget);

        if (cancelled) {
          return;
        }

        setSyncStatus({ state: "idle", message: "Synced." });
        if (appTargetIdentity.kind !== "instanceControlPlane") {
          stopPushSync = startPushSync(appTarget);
        }
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
  }, [appLabel, appTargetIdentity.browserDatabaseName, appTargetIdentity.kind]);

  if (!schema) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Formless</h1>
        <p className="text-sm text-slate-600">
          <SchemaLoadingMessage appLabel={appLabel} />
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
      <SchemaAppProvider
        activePackageResolver={activePackageResolver}
        schemaKey={schemaKey}
        target={appTarget}
      >
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
          sectionOperationControls={sectionOperationControls}
          today={today}
        />
      </SchemaAppProvider>
    </section>
  );
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
