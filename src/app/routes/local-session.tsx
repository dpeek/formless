import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  FormlessReplicaDatabaseDeleteBlockedError,
  type FormlessReplicaDatabaseResetResult,
} from "../../client/db.ts";
import { resetLocalBrowserReplicaState } from "../../client/sync.ts";
import {
  ownerLoginDefaultRedirectTarget,
  parseOwnerLoginRedirectTarget,
  type OwnerLoginRedirectTarget,
} from "../../shared/instance-auth.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import { fetchOwnerSessionStatus } from "./owner-login.tsx";

export type LocalSessionRouteState =
  | { status: "blocked"; blockedDatabaseNames: string[]; message: string }
  | { status: "checking" }
  | { status: "complete" }
  | { status: "failed"; message: string }
  | { status: "resetting" };

type StartLocalSessionRouteSessionOptions = {
  fetcher?: typeof fetch;
  onComplete?: () => void;
  onState: (state: LocalSessionRouteState) => void;
  resetBrowserState?: () => Promise<FormlessReplicaDatabaseResetResult>;
  resetBrowserStateRequested?: boolean;
};

export function LocalSessionRoute() {
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<LocalSessionRouteState>({ status: "checking" });
  const search = localSessionSearchFromRouteLocation(location);
  const redirectTarget = localSessionRedirectTargetFromSearch(search);
  const resetBrowserStateRequested = localSessionBrowserResetRequestedFromSearch(search);

  useEffect(
    () =>
      startLocalSessionRouteSession({
        onComplete: () => setLocation(redirectTarget, { replace: true }),
        onState: setState,
        resetBrowserStateRequested,
      }),
    [redirectTarget, resetBrowserStateRequested, setLocation],
  );

  return <LocalSessionRouteView state={state} />;
}

export function LocalSessionRouteView({ state }: { state: LocalSessionRouteState }) {
  return (
    <section className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-3 rounded-lg border border-border bg-overlay p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Formless</p>
          <h1 className="text-2xl font-semibold">{localSessionRouteHeading(state)}</h1>
          <p className="text-sm text-muted-fg">{localSessionRouteMessage(state)}</p>
          {state.status === "blocked" ? (
            <ul className="space-y-1 text-xs text-muted-fg">
              {state.blockedDatabaseNames.map((databaseName) => (
                <li key={databaseName}>
                  <code>{databaseName}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function startLocalSessionRouteSession({
  fetcher = fetch,
  onComplete,
  onState,
  resetBrowserState = resetLocalBrowserReplicaState,
  resetBrowserStateRequested = false,
}: StartLocalSessionRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;

  onState({ status: "checking" });

  async function startSession() {
    try {
      const session = await fetchOwnerSessionStatus({ fetcher, signal: controller.signal });

      if (stopped) {
        return;
      }

      if (!session.authenticated) {
        onState({
          status: "failed",
          message: "Local owner session is not authenticated.",
        });
        return;
      }

      if (resetBrowserStateRequested) {
        onState({ status: "resetting" });
        await resetBrowserState();
      }

      if (stopped) {
        return;
      }

      onState({ status: "complete" });
      onComplete?.();
    } catch (error) {
      if (stopped || controller.signal.aborted) {
        return;
      }

      if (error instanceof FormlessReplicaDatabaseDeleteBlockedError) {
        onState({
          status: "blocked",
          blockedDatabaseNames: error.blockedDatabaseNames,
          message: error.message,
        });
        return;
      }

      onState({
        status: "failed",
        message: error instanceof Error ? error.message : "Local session failed.",
      });
    }
  }

  void startSession();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export function localSessionRedirectTargetFromSearch(search: string): OwnerLoginRedirectTarget {
  const normalized = search.startsWith("?") ? search : `?${search}`;
  const redirectTo = new URLSearchParams(normalized).get("redirectTo");
  const parsed = parseOwnerLoginRedirectTarget(redirectTo) ?? ownerLoginDefaultRedirectTarget;

  return parsed === runtimeTopologyRoutes.localSessionRoute ||
    parsed.startsWith(`${runtimeTopologyRoutes.localSessionRoute}?`)
    ? ownerLoginDefaultRedirectTarget
    : parsed;
}

export function localSessionBrowserResetRequestedFromSearch(search: string): boolean {
  const normalized = search.startsWith("?") ? search : `?${search}`;

  return new URLSearchParams(normalized).get("reset") === "1";
}

function localSessionSearchFromRouteLocation(location: string): string {
  const queryStart = location.indexOf("?");

  if (queryStart >= 0) {
    return location.slice(queryStart);
  }

  return typeof window === "undefined" ? "" : window.location.search;
}

function localSessionRouteHeading(state: LocalSessionRouteState): string {
  switch (state.status) {
    case "blocked":
      return "Browser cache reset blocked";
    case "checking":
      return "Checking local session";
    case "complete":
      return "Opening local runtime";
    case "failed":
      return "Local session failed";
    case "resetting":
      return "Resetting browser cache";
  }
}

function localSessionRouteMessage(state: LocalSessionRouteState): string {
  switch (state.status) {
    case "blocked":
    case "failed":
      return state.message;
    case "checking":
      return "Verifying owner access.";
    case "complete":
      return "Loading from Authority storage.";
    case "resetting":
      return "Clearing same-origin Formless replicas.";
  }
}
