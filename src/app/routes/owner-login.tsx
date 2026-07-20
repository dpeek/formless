import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import { useLocation } from "wouter";
import {
  authAccountContinuationLocationForReturnTarget,
  ownerLoginRedirectTargetFromSearch,
  parseOwnerLogoutResponse,
  parseOwnerPasskeyLoginOptionsResponse,
  parseOwnerPasskeyLoginVerifyResponse,
  parseOwnerSessionStatusResponse,
  type OwnerLogoutResponse,
  type OwnerPasskeyLoginOptionsResponse,
  type OwnerPasskeyLoginVerifyRequest,
  type OwnerPasskeyLoginVerifyResponse,
  type OwnerSessionStatusResponse,
} from "../../shared/instance-auth.ts";
import type { OwnerIdentity } from "../../shared/protocol.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import {
  browserSupportsPasskeys,
  createBrowserPasskeyAuthenticationResponse,
  passkeyUnavailableMessage,
  type CreatePasskeyAuthenticationResponse,
} from "./passkey-browser.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  NoShellAuthRuntimeBoundary,
} from "./auth-runtime-boundary.tsx";
import {
  ownerSignInAuthSurfaceReference,
  projectOwnerSignInAuthSurface,
} from "./owner-auth-projection.ts";

export type OwnerLoginRouteState =
  | { status: "complete"; owner: OwnerIdentity }
  | { continueTo: `/${string}`; owner?: OwnerIdentity; status: "continuing" }
  | { status: "failed"; message: string; owner?: OwnerIdentity }
  | { status: "logging-out"; owner: OwnerIdentity }
  | { status: "loading" }
  | { status: "passkey-unavailable"; message: string; owner?: OwnerIdentity }
  | { status: "ready"; owner: OwnerIdentity }
  | { status: "setup-incomplete" }
  | { status: "submitting"; owner: OwnerIdentity };

type StartOwnerLoginRouteSessionOptions = {
  fetcher?: typeof fetch;
  onState: (state: OwnerLoginRouteState) => void;
  passkeysSupported?: () => boolean;
};

type OwnerLoginFetchOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

type OwnerLoginLocationSetter = (path: `/${string}`, options?: { replace?: boolean }) => void;

export function OwnerLoginRoute() {
  const [state, setState] = useState<OwnerLoginRouteState>({ status: "loading" });
  const [sessionRevision, setSessionRevision] = useState(0);
  const pendingGuard = useRef(createAuthPendingGuard());
  const [location, setLocation] = useLocation();
  const redirectTarget = ownerLoginRedirectTargetFromSearch(
    ownerLoginSearchFromRouteLocation(location),
  );

  useEffect(
    () =>
      startOwnerLoginRouteSession({
        onState: setState,
      }),
    [sessionRevision],
  );

  const owner =
    state.status === "ready" || state.status === "failed" || state.status === "submitting"
      ? state.owner
      : undefined;
  const disabled = state.status === "submitting" || owner === undefined;
  const surface = useMemo(() => projectOwnerSignInAuthSurface({ state }), [state]);

  async function submitLogin() {
    if (!owner || disabled) {
      return;
    }

    await pendingGuard.current.run(async () => {
      setState({ status: "submitting", owner });

      try {
        const response = await loginWithPasskey();
        const continueTo = ownerLoginSuccessContinuationTarget(
          response.continueTo,
          ownerLoginSearchFromRouteLocation(location),
        );

        setState({ continueTo, owner: response.owner, status: "continuing" });
        navigateAfterOwnerLogin(continueTo, { setLocation });
      } catch (error) {
        setState({
          status: "failed",
          message: error instanceof Error ? error.message : "Owner login failed.",
          owner,
        });
      }
    });
  }

  async function logout() {
    if (state.status !== "complete") {
      return;
    }

    const loggedOutOwner = state.owner;

    await pendingGuard.current.run(async () => {
      setState({ status: "logging-out", owner: loggedOutOwner });

      try {
        const response = await logoutOwnerSession();

        if (response.continueTo) {
          setState({ continueTo: response.continueTo, status: "continuing" });
          navigateAfterOwnerLogin(response.continueTo, { setLocation });
          return;
        }

        setState({ status: "ready", owner: loggedOutOwner });
      } catch (error) {
        setState({
          status: "failed",
          message: error instanceof Error ? error.message : "Owner logout failed.",
          owner: loggedOutOwner,
        });
      }
    });
  }

  async function handleIntent(intent: AuthIntent) {
    if (!authIntentIsCurrent(surface, intent)) {
      return;
    }

    if (intent.type === "authPasskey") {
      await submitLogin();
      return;
    }

    if (intent.type === "authAction") {
      const action = surface.actions.find((candidate) => candidate.id === intent.actionId);
      if (action?.purpose === "logout") {
        await logout();
      } else if (action?.purpose === "retry") {
        setSessionRevision((revision) => revision + 1);
      }
      return;
    }

    if (intent.type === "authContinuation") {
      navigateAfterOwnerLogin(redirectTarget, { setLocation });
    }
  }

  return (
    <NoShellAuthRuntimeBoundary
      onIntent={handleIntent}
      reference={ownerSignInAuthSurfaceReference}
      snapshot={surface}
    >
      <ApplicationPresentation
        presentation={{ kind: "auth", reference: ownerSignInAuthSurfaceReference }}
      />
    </NoShellAuthRuntimeBoundary>
  );
}

export function navigateAfterOwnerLogin(
  redirectTarget: `/${string}`,
  options: {
    replaceDocumentLocation?: (target: `/${string}`) => void;
    setLocation: OwnerLoginLocationSetter;
  },
): void {
  if (ownerLoginRedirectRequiresDocumentNavigation(redirectTarget)) {
    const replaceDocumentLocation =
      options.replaceDocumentLocation ??
      ((target: `/${string}`) => window.location.replace(target));

    replaceDocumentLocation(redirectTarget);
    return;
  }

  options.setLocation(redirectTarget, { replace: true });
}

export function ownerLoginRedirectRequiresDocumentNavigation(
  redirectTarget: `/${string}`,
): boolean {
  return redirectTarget === "/formless" || redirectTarget.startsWith("/formless/");
}

export function ownerLoginSuccessContinuationTarget(
  continueTo: `/${string}`,
  locationSearch: string,
): `/${string}` {
  const continuationUrl = new URL(continueTo, "https://formless.local");

  if (
    continuationUrl.pathname !== runtimeTopologyRoutes.authAccountRoute ||
    continuationUrl.search !== ""
  ) {
    return continueTo;
  }

  return authAccountContinuationLocationForReturnTarget(
    ownerLoginRedirectTargetFromSearch(locationSearch),
  );
}

export function startOwnerLoginRouteSession({
  fetcher = fetch,
  onState,
  passkeysSupported = browserSupportsPasskeys,
}: StartOwnerLoginRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;

  onState({ status: "loading" });

  async function loadSessionState() {
    try {
      const status = await fetchOwnerSessionStatus({ fetcher, signal: controller.signal });

      if (stopped) {
        return;
      }

      if (status.authenticated) {
        onState({ status: "complete", owner: status.owner });
        return;
      }

      if (status.setupComplete && status.owner) {
        if (!passkeysSupported()) {
          onState({
            status: "passkey-unavailable",
            message: passkeyUnavailableMessage,
            owner: status.owner,
          });
          return;
        }

        onState({ status: "ready", owner: status.owner });
        return;
      }

      onState({ status: "setup-incomplete" });
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          status: "failed",
          message: error instanceof Error ? error.message : "Owner login could not load.",
        });
      }
    }
  }

  void loadSessionState();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function fetchOwnerSessionStatus({
  fetcher = fetch,
  signal,
}: OwnerLoginFetchOptions = {}): Promise<OwnerSessionStatusResponse> {
  const response = await fetcher("/api/formless/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readOwnerLoginJson(response);

  if (!response.ok) {
    throw new OwnerLoginApiError(ownerLoginErrorMessage(body, "Owner session status failed."), {
      status: response.status,
    });
  }

  return parseOwnerSessionStatusResponse(body);
}

export async function loginWithPasskey({
  createAuthenticationResponse = createBrowserPasskeyAuthenticationResponse,
  fetcher = fetch,
  signal,
}: OwnerLoginFetchOptions & {
  createAuthenticationResponse?: CreatePasskeyAuthenticationResponse;
} = {}): Promise<OwnerPasskeyLoginVerifyResponse> {
  const options = await fetchOwnerPasskeyLoginOptions({ fetcher, signal });
  const response = await createAuthenticationResponse(options.options);

  return await verifyOwnerPasskeyLogin({ fetcher, response, signal });
}

export async function fetchOwnerPasskeyLoginOptions({
  fetcher = fetch,
  signal,
}: OwnerLoginFetchOptions = {}): Promise<OwnerPasskeyLoginOptionsResponse> {
  const response = await fetcher("/api/formless/passkeys/login/options", {
    body: "{}",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readOwnerLoginJson(response);

  if (!response.ok) {
    throw new OwnerLoginApiError(ownerLoginErrorMessage(body, "Passkey login options failed."), {
      status: response.status,
    });
  }

  return parseOwnerPasskeyLoginOptionsResponse(body);
}

async function verifyOwnerPasskeyLogin({
  fetcher = fetch,
  response: assertionResponse,
  signal,
}: OwnerLoginFetchOptions & {
  response: OwnerPasskeyLoginVerifyRequest["response"];
}): Promise<OwnerPasskeyLoginVerifyResponse> {
  const response = await fetcher("/api/formless/passkeys/login/verify", {
    body: JSON.stringify({
      response: assertionResponse,
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readOwnerLoginJson(response);

  if (!response.ok) {
    throw new OwnerLoginApiError(ownerLoginErrorMessage(body, "Owner login failed."), {
      status: response.status,
    });
  }

  return parseOwnerPasskeyLoginVerifyResponse(body);
}

export async function logoutOwnerSession({
  fetcher = fetch,
  signal,
}: OwnerLoginFetchOptions = {}): Promise<OwnerLogoutResponse> {
  const response = await fetcher("/api/formless/session/logout", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    method: "POST",
    signal,
  });
  const body = await readOwnerLoginJson(response);

  if (!response.ok) {
    throw new OwnerLoginApiError(ownerLoginErrorMessage(body, "Owner logout failed."), {
      status: response.status,
    });
  }

  return parseOwnerLogoutResponse(body);
}

export class OwnerLoginApiError extends Error {
  status: number | undefined;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "OwnerLoginApiError";
    this.status = options.status;
  }
}

async function readOwnerLoginJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new OwnerLoginApiError("Owner login response was not JSON.", {
      status: response.status,
    });
  }
}

function ownerLoginErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" && value.error.trim() !== ""
    ? value.error
    : fallback;
}

function ownerLoginSearchFromRouteLocation(location: string): string {
  const queryStart = location.indexOf("?");

  if (queryStart >= 0) {
    return location.slice(queryStart);
  }

  return typeof window === "undefined" ? "" : window.location.search;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
