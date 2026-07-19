import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import type { FormlessUiAuthIntent } from "@dpeek/formless-astryx/contract";
import {
  parseOwnerPasskeyRegistrationOptionsResponse,
  parseOwnerPasskeyRegistrationVerifyResponse,
  type OwnerPasskeyRegistrationOptionsResponse,
  type OwnerPasskeyRegistrationVerifyRequest,
  type OwnerPasskeyRegistrationVerifyResponse,
} from "../../shared/instance-auth.ts";
import {
  parseOwnerSetupToken,
  type OwnerIdentity,
  type OwnerIdentityInput,
  type OwnerSetupStatusResponse,
} from "../../shared/protocol.ts";
import {
  browserSupportsPasskeys,
  createBrowserPasskeyRegistrationResponse,
  passkeyUnavailableMessage,
  type CreatePasskeyRegistrationResponse,
} from "./passkey-browser.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  NoShellAuthRuntimeBoundary,
} from "./auth-runtime-boundary.tsx";
import {
  ownerSetupAdminHref,
  ownerSetupAuthSurfaceReference,
  projectOwnerSetupAuthSurface,
} from "./owner-auth-projection.ts";

export type OwnerSetupRouteState =
  | { status: "already-complete"; adminOrigin?: string; owner?: OwnerIdentity }
  | { status: "complete"; adminOrigin?: string; owner: OwnerIdentity }
  | { continueTo: string; owner: OwnerIdentity; status: "continuing" }
  | { status: "failed"; adminOrigin?: string; message: string; setupToken?: string }
  | { status: "invalid-link"; message: string }
  | { status: "loading" }
  | { status: "passkey-unavailable"; message: string }
  | { status: "ready"; adminOrigin?: string; setupToken: string }
  | { status: "submitting"; adminOrigin?: string; setupToken: string };

type StartOwnerSetupRouteSessionOptions = {
  fetcher?: typeof fetch;
  locationSearch: string;
  onState: (state: OwnerSetupRouteState) => void;
  passkeysSupported?: () => boolean;
};

type OwnerSetupFetchOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

type CompleteOwnerSetupOptions = OwnerSetupFetchOptions & {
  createRegistrationResponse?: CreatePasskeyRegistrationResponse;
  owner: OwnerIdentityInput;
  setupToken: string;
};

type OwnerSetupContinuationNavigator = (target: string) => void;

export function OwnerSetupRoute() {
  const locationSearch = useSearch();
  const [state, setState] = useState<OwnerSetupRouteState>({ status: "loading" });
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [sessionRevision, setSessionRevision] = useState(0);
  const pendingGuard = useRef(createAuthPendingGuard());
  const navigateTo: OwnerSetupContinuationNavigator = (target) => {
    window.location.assign(target);
  };

  useEffect(
    () =>
      startOwnerSetupRouteSession({
        locationSearch,
        onState: setState,
      }),
    [locationSearch, sessionRevision],
  );

  const activeSetupState =
    state.status === "ready" || state.status === "failed" || state.status === "submitting"
      ? state
      : undefined;
  const activeSetupToken = activeSetupState?.setupToken;
  const surface = useMemo(
    () => projectOwnerSetupAuthSurface({ ownerEmail, ownerName, state }),
    [ownerEmail, ownerName, state],
  );

  async function submitOwner() {
    if (
      !activeSetupToken ||
      surface.passkey?.availability !== "available" ||
      surface.passkey.control.disabled
    ) {
      return;
    }

    const owner = ownerIdentityInput({ email: ownerEmail, name: ownerName });
    await pendingGuard.current.run(async () => {
      setState({
        status: "submitting",
        ...(activeSetupState?.adminOrigin ? { adminOrigin: activeSetupState.adminOrigin } : {}),
        setupToken: activeSetupToken,
      });

      try {
        const completed = await completeOwnerSetup({
          owner,
          setupToken: activeSetupToken,
        });

        if (completed.continueTo) {
          setState({
            continueTo: completed.continueTo,
            owner: completed.owner,
            status: "continuing",
          });
          navigateTo(completed.continueTo);
          return;
        }

        setState({
          status: "complete",
          ...(activeSetupState?.adminOrigin ? { adminOrigin: activeSetupState.adminOrigin } : {}),
          owner: completed.owner,
        });
      } catch (error) {
        const failure = ownerSetupFailureState(error, activeSetupToken);

        if (
          activeSetupState?.adminOrigin &&
          (failure.status === "already-complete" || failure.status === "failed")
        ) {
          setState({ ...failure, adminOrigin: activeSetupState.adminOrigin });
          return;
        }

        setState(failure);
      }
    });
  }

  async function handleIntent(intent: FormlessUiAuthIntent) {
    if (!authIntentIsCurrent(surface, intent)) {
      return;
    }

    if (intent.type === "authField" && intent.intent.type === "createDraftChange") {
      const value = intent.intent.fieldValue.value;
      if (typeof value !== "string") {
        return;
      }
      if (intent.intent.fieldName === "name") {
        setOwnerName(value);
      } else if (intent.intent.fieldName === "email") {
        setOwnerEmail(value);
      }
      return;
    }

    if (intent.type === "authPasskey") {
      await submitOwner();
      return;
    }

    if (intent.type === "authAction") {
      const action = surface.actions.find((candidate) => candidate.id === intent.actionId);
      if (action?.purpose === "retry") {
        setSessionRevision((revision) => revision + 1);
      }
      return;
    }

    if (intent.type === "authContinuation") {
      navigateTo(
        state.status === "complete" || state.status === "already-complete"
          ? ownerSetupAdminHref(state.adminOrigin)
          : "/",
      );
    }
  }

  return (
    <NoShellAuthRuntimeBoundary
      onIntent={handleIntent}
      reference={ownerSetupAuthSurfaceReference}
      snapshot={surface}
    >
      <ApplicationPresentation
        presentation={{ kind: "auth", reference: ownerSetupAuthSurfaceReference }}
      />
    </NoShellAuthRuntimeBoundary>
  );
}

export function startOwnerSetupRouteSession({
  fetcher = fetch,
  locationSearch,
  onState,
  passkeysSupported = browserSupportsPasskeys,
}: StartOwnerSetupRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;

  onState({ status: "loading" });

  async function loadSetupState() {
    try {
      const status = await fetchOwnerSetupStatus({ fetcher, signal: controller.signal });

      if (stopped) {
        return;
      }

      if (status.setupComplete) {
        onState({
          status: "already-complete",
          ...(status.adminOrigin ? { adminOrigin: status.adminOrigin } : {}),
          owner: status.owner,
        });
        return;
      }

      const tokenState = parseOwnerSetupRouteToken(locationSearch);

      if (tokenState.status !== "ready") {
        onState(tokenState);
        return;
      }

      if (!passkeysSupported()) {
        onState({ status: "passkey-unavailable", message: passkeyUnavailableMessage });
        return;
      }

      onState({
        ...tokenState,
        ...(status.adminOrigin ? { adminOrigin: status.adminOrigin } : {}),
      });
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          status: "failed",
          message: error instanceof Error ? error.message : "Owner setup could not load.",
        });
      }
    }
  }

  void loadSetupState();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function fetchOwnerSetupStatus({
  fetcher = fetch,
  signal,
}: OwnerSetupFetchOptions = {}): Promise<OwnerSetupStatusResponse> {
  const response = await fetcher("/api/formless/setup", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readOwnerSetupJson(response);

  if (!response.ok) {
    throw new OwnerSetupApiError(ownerSetupErrorMessage(body, "Owner setup status failed."), {
      status: response.status,
    });
  }

  return parseOwnerSetupStatusResponse(body);
}

export async function completeOwnerSetup({
  createRegistrationResponse = createBrowserPasskeyRegistrationResponse,
  fetcher = fetch,
  owner,
  setupToken,
  signal,
}: CompleteOwnerSetupOptions): Promise<OwnerPasskeyRegistrationVerifyResponse> {
  const options = await fetchOwnerPasskeyRegistrationOptions({ fetcher, setupToken, signal });
  const response = await createRegistrationResponse(options.options);

  return await verifyOwnerPasskeyRegistration({
    fetcher,
    owner,
    response,
    setupToken,
    signal,
  });
}

export async function fetchOwnerPasskeyRegistrationOptions({
  fetcher = fetch,
  setupToken,
  signal,
}: OwnerSetupFetchOptions & {
  setupToken: string;
}): Promise<OwnerPasskeyRegistrationOptionsResponse> {
  const response = await fetcher("/api/formless/passkeys/register/options", {
    body: JSON.stringify({ setupToken }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readOwnerSetupJson(response);

  if (!response.ok) {
    const failure = parseOwnerSetupFailureResponse(body);

    throw new OwnerSetupApiError(
      ownerSetupErrorMessage(body, "Passkey registration options failed."),
      {
        ...failure,
        status: response.status,
      },
    );
  }

  return parseOwnerPasskeyRegistrationOptionsResponse(body);
}

async function verifyOwnerPasskeyRegistration({
  fetcher = fetch,
  owner,
  response: registrationResponse,
  setupToken,
  signal,
}: OwnerSetupFetchOptions & {
  owner: OwnerIdentityInput;
  response: OwnerPasskeyRegistrationVerifyRequest["response"];
  setupToken: string;
}): Promise<OwnerPasskeyRegistrationVerifyResponse> {
  const response = await fetcher("/api/formless/setup/complete", {
    body: JSON.stringify({ owner, response: registrationResponse, setupToken }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readOwnerSetupJson(response);

  if (!response.ok) {
    const failure = parseOwnerSetupFailureResponse(body);

    throw new OwnerSetupApiError(ownerSetupErrorMessage(body, "Owner setup failed."), {
      ...failure,
      status: response.status,
    });
  }

  return parseOwnerPasskeyRegistrationVerifyResponse(body);
}

export class OwnerSetupApiError extends Error {
  owner: OwnerIdentity | undefined;
  setupComplete: boolean | undefined;
  status: number | undefined;

  constructor(
    message: string,
    options: { owner?: OwnerIdentity; setupComplete?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "OwnerSetupApiError";
    this.owner = options.owner;
    this.setupComplete = options.setupComplete;
    this.status = options.status;
  }
}

function parseOwnerSetupRouteToken(locationSearch: string): OwnerSetupRouteState {
  const setupToken = new URLSearchParams(trimSearchPrefix(locationSearch)).get("token");

  if (!setupToken) {
    return {
      status: "invalid-link",
      message: "Owner setup link is missing a setup token.",
    };
  }

  try {
    return { status: "ready", setupToken: parseOwnerSetupToken(setupToken) };
  } catch {
    return {
      status: "invalid-link",
      message: "Owner setup link is invalid.",
    };
  }
}

function ownerSetupFailureState(error: unknown, setupToken: string): OwnerSetupRouteState {
  if (error instanceof OwnerSetupApiError && error.setupComplete) {
    return { status: "already-complete", owner: error.owner };
  }

  if (error instanceof OwnerSetupApiError && isSetupLinkFailureStatus(error.status)) {
    return { status: "invalid-link", message: error.message };
  }

  return {
    status: "failed",
    message: error instanceof Error ? error.message : "Owner setup failed.",
    setupToken,
  };
}

function isSetupLinkFailureStatus(status: number | undefined) {
  return status === 401 || status === 404 || status === 410;
}

function ownerIdentityInput(input: { email: string; name: string }): OwnerIdentityInput {
  const email = input.email.trim();

  return {
    name: input.name.trim(),
    ...(email === "" ? {} : { email }),
  };
}

async function readOwnerSetupJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new OwnerSetupApiError("Owner setup response was not JSON.", {
      status: response.status,
    });
  }
}

function parseOwnerSetupStatusResponse(value: unknown): OwnerSetupStatusResponse {
  if (!isRecord(value) || typeof value.setupComplete !== "boolean") {
    throw new Error("Owner setup status response is malformed.");
  }

  return {
    ...(typeof value.adminOrigin === "string" ? { adminOrigin: value.adminOrigin } : {}),
    ...(typeof value.authOrigin === "string" ? { authOrigin: value.authOrigin } : {}),
    setupComplete: value.setupComplete,
    ...(value.owner === undefined ? {} : { owner: parseOwnerIdentity(value.owner) }),
  };
}

function parseOwnerSetupFailureResponse(value: unknown): {
  owner?: OwnerIdentity;
  setupComplete?: boolean;
  status?: number;
} {
  if (!isRecord(value)) {
    return {};
  }

  const setupComplete = typeof value.setupComplete === "boolean" ? value.setupComplete : undefined;
  const owner = value.owner === undefined ? undefined : parseOwnerIdentity(value.owner);

  return {
    ...(owner === undefined ? {} : { owner }),
    ...(setupComplete === undefined ? {} : { setupComplete }),
  };
}

function ownerSetupErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" && value.error.trim() !== ""
    ? value.error
    : fallback;
}

function parseOwnerIdentity(value: unknown): OwnerIdentity {
  if (!isRecord(value)) {
    throw new Error("Owner identity response is malformed.");
  }

  const email =
    value.email === undefined ? undefined : parseNonEmptyString("Owner email", value.email);

  return {
    id: parseNonEmptyString("Owner id", value.id),
    name: parseNonEmptyString("Owner name", value.name),
    ...(email === undefined ? {} : { email }),
    createdAt: parseNonEmptyString("Owner createdAt", value.createdAt),
  };
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function trimSearchPrefix(search: string) {
  return search.startsWith("?") ? search.slice(1) : search;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
