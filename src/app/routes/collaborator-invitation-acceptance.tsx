import { useEffect, useMemo, useRef, useState } from "react";
import type { FormlessUiAuthIntent } from "@dpeek/formless-astryx/contract";
import { useSearch } from "wouter";

import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  parseCollaboratorInvitationAcceptanceRequest,
  parseCollaboratorInvitationAcceptanceStatusResponse,
  parseCollaboratorInvitationPasskeyRegistrationOptionsResponse,
  parseCollaboratorInvitationPasskeyRegistrationVerifyResponse,
  type CollaboratorInvitationAcceptanceHandoffSummary,
  type CollaboratorInvitationAcceptanceFailureReason,
  type CollaboratorInvitationAcceptanceInvitationSummary,
  type CollaboratorInvitationAcceptanceRequest,
  type CollaboratorInvitationAcceptanceStatusResponse,
  type CollaboratorInvitationAcceptedPrincipalSummary,
  type CollaboratorInvitationPasskeyRegistrationOptionsResponse,
  type CollaboratorInvitationPasskeyRegistrationVerifyRequest,
  type CollaboratorInvitationPasskeyRegistrationVerifyResponse,
} from "../../shared/instance-auth.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  NoShellAuthRuntimeBoundary,
} from "./auth-runtime-boundary.tsx";
import {
  collaboratorInvitationAuthSurfaceReference,
  projectCollaboratorInvitationAuthSurface,
} from "./collaborator-invitation-auth-projection.ts";
import {
  browserSupportsPasskeys,
  createBrowserPasskeyRegistrationResponse,
  passkeyUnavailableMessage,
  type CreatePasskeyRegistrationResponse,
} from "./passkey-browser.ts";

export const COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_ROUTE = `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/options`;
export const COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_ROUTE = `${COLLABORATOR_INVITATION_ACCEPT_PATH}/passkeys/register/verify`;

export type CollaboratorInvitationAcceptanceRouteState =
  | {
      status: "accepted";
      acceptedPrincipal: CollaboratorInvitationAcceptedPrincipalSummary;
      handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
      session: CollaboratorInvitationPasskeyRegistrationVerifyResponse["session"];
    }
  | {
      status: "continuing";
      acceptedPrincipal: CollaboratorInvitationAcceptedPrincipalSummary;
      continueTo: string;
      handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
      session: CollaboratorInvitationPasskeyRegistrationVerifyResponse["session"];
    }
  | { status: "eligible"; invitation: CollaboratorInvitationAcceptanceInvitationSummary }
  | { status: "failed"; message: string }
  | { status: "invalid-link"; message: string }
  | { status: "loading" }
  | {
      status: "passkey-unavailable";
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
      message: string;
    }
  | { status: "submitting"; invitation: CollaboratorInvitationAcceptanceInvitationSummary }
  | {
      status: "unavailable";
      message: string;
      reason: CollaboratorInvitationAcceptanceFailureReason;
    };

type StartCollaboratorInvitationAcceptanceRouteSessionOptions = {
  fetcher?: typeof fetch;
  locationSearch: string;
  onState: (state: CollaboratorInvitationAcceptanceRouteState) => void;
  passkeysSupported?: () => boolean;
};

type CollaboratorInvitationAcceptanceFetchOptions = {
  fetcher?: typeof fetch;
  request: CollaboratorInvitationAcceptanceRequest;
  signal?: AbortSignal;
};

type CompleteCollaboratorInvitationAcceptanceOptions =
  CollaboratorInvitationAcceptanceFetchOptions & {
    createRegistrationResponse?: CreatePasskeyRegistrationResponse;
  };

export function CollaboratorInvitationAcceptanceRoute() {
  const locationSearch = useSearch();
  const [state, setState] = useState<CollaboratorInvitationAcceptanceRouteState>({
    status: "loading",
  });
  const pendingGuard = useRef(createAuthPendingGuard());

  useEffect(
    () =>
      startCollaboratorInvitationAcceptanceRouteSession({
        locationSearch,
        onState: setState,
      }),
    [locationSearch],
  );

  const surface = useMemo(() => projectCollaboratorInvitationAuthSurface({ state }), [state]);

  async function submitAcceptance() {
    if (state.status !== "eligible") {
      return;
    }

    const routeRequest = collaboratorInvitationAcceptanceRequestFromSearch(locationSearch);

    if (!routeRequest.ok) {
      setState({ status: "invalid-link", message: routeRequest.message });
      return;
    }

    if (!browserSupportsPasskeys()) {
      setState({
        status: "passkey-unavailable",
        invitation: state.invitation,
        message: passkeyUnavailableMessage,
      });
      return;
    }

    const invitation = state.invitation;

    await pendingGuard.current.run(async () => {
      setState({ status: "submitting", invitation });

      try {
        const accepted = await completeCollaboratorInvitationAcceptance({
          request: routeRequest.request,
        });
        const continuationUrl = collaboratorInvitationAcceptanceContinuationUrl(accepted);

        if (continuationUrl) {
          setState({
            status: "continuing",
            acceptedPrincipal: accepted.acceptedPrincipal,
            continueTo: continuationUrl,
            ...(accepted.handoff === undefined ? {} : { handoff: accepted.handoff }),
            invitation: accepted.invitation,
            session: accepted.session,
          });
          window.location.assign(continuationUrl);
          return;
        }

        setState({
          status: "accepted",
          acceptedPrincipal: accepted.acceptedPrincipal,
          ...(accepted.handoff === undefined ? {} : { handoff: accepted.handoff }),
          invitation: accepted.invitation,
          session: accepted.session,
        });
      } catch (error) {
        setState({
          status: "failed",
          message: error instanceof Error ? error.message : "Invitation acceptance failed.",
        });
      }
    });
  }

  async function handleIntent(intent: FormlessUiAuthIntent) {
    if (!authIntentIsCurrent(surface, intent)) {
      return;
    }

    if (intent.type === "authPasskey") {
      await submitAcceptance();
      return;
    }

    if (intent.type === "authContinuation" && state.status === "continuing") {
      window.location.assign(state.continueTo);
    }
  }

  return (
    <NoShellAuthRuntimeBoundary
      onIntent={handleIntent}
      reference={collaboratorInvitationAuthSurfaceReference}
      snapshot={surface}
    >
      <ApplicationPresentation
        presentation={{
          kind: "auth",
          reference: collaboratorInvitationAuthSurfaceReference,
        }}
      />
    </NoShellAuthRuntimeBoundary>
  );
}

export function startCollaboratorInvitationAcceptanceRouteSession({
  fetcher = fetch,
  locationSearch,
  onState,
  passkeysSupported = browserSupportsPasskeys,
}: StartCollaboratorInvitationAcceptanceRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;
  const routeRequest = collaboratorInvitationAcceptanceRequestFromSearch(locationSearch);

  onState({ status: "loading" });

  if (!routeRequest.ok) {
    onState({ status: "invalid-link", message: routeRequest.message });

    return () => {
      stopped = true;
      controller.abort();
    };
  }

  const acceptanceRequest = routeRequest.request;

  async function loadInvitationStatus() {
    try {
      const status = await fetchCollaboratorInvitationAcceptanceStatus({
        fetcher,
        request: acceptanceRequest,
        signal: controller.signal,
      });

      if (stopped) {
        return;
      }

      onState(
        status.eligible
          ? passkeysSupported()
            ? { status: "eligible", invitation: status.invitation }
            : {
                status: "passkey-unavailable",
                invitation: status.invitation,
                message: passkeyUnavailableMessage,
              }
          : {
              status: "unavailable",
              message: status.error,
              reason: status.reason,
            },
      );
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          status: "failed",
          message:
            error instanceof Error ? error.message : "Invitation status could not be loaded.",
        });
      }
    }
  }

  void loadInvitationStatus();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function completeCollaboratorInvitationAcceptance({
  createRegistrationResponse = createBrowserPasskeyRegistrationResponse,
  fetcher = fetch,
  request,
  signal,
}: CompleteCollaboratorInvitationAcceptanceOptions): Promise<CollaboratorInvitationPasskeyRegistrationVerifyResponse> {
  const options = await fetchCollaboratorInvitationPasskeyRegistrationOptions({
    fetcher,
    request,
    signal,
  });
  const response = await createRegistrationResponse(options.options);

  return await verifyCollaboratorInvitationPasskeyRegistration({
    fetcher,
    request,
    response,
    signal,
  });
}

export async function fetchCollaboratorInvitationAcceptanceStatus({
  fetcher = fetch,
  request,
  signal,
}: CollaboratorInvitationAcceptanceFetchOptions): Promise<CollaboratorInvitationAcceptanceStatusResponse> {
  const url = new URL(COLLABORATOR_INVITATION_ACCEPT_PATH, "https://formless.local");

  url.searchParams.set("invitationId", request.invitationId);
  url.searchParams.set("token", request.token);

  const response = await fetcher(`${url.pathname}${url.search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readCollaboratorInvitationAcceptanceJson(response, {
    context: "Invitation status response",
  });

  try {
    return parseCollaboratorInvitationAcceptanceStatusResponse(body);
  } catch (error) {
    const parseErrorMessage =
      error instanceof Error ? error.message : "Invitation status response was invalid.";

    throw new CollaboratorInvitationAcceptanceApiError(
      response.ok
        ? parseErrorMessage
        : collaboratorInvitationAcceptanceErrorMessage(body, parseErrorMessage),
      { status: response.status },
    );
  }
}

export async function fetchCollaboratorInvitationPasskeyRegistrationOptions({
  fetcher = fetch,
  request,
  signal,
}: CollaboratorInvitationAcceptanceFetchOptions): Promise<CollaboratorInvitationPasskeyRegistrationOptionsResponse> {
  const response = await fetcher(COLLABORATOR_INVITATION_PASSKEY_REGISTER_OPTIONS_ROUTE, {
    body: JSON.stringify(request),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readCollaboratorInvitationAcceptanceJson(response, {
    context: "Passkey registration options response",
  });

  if (!response.ok) {
    throw new CollaboratorInvitationAcceptanceApiError(
      collaboratorInvitationAcceptanceErrorMessage(body, "Passkey registration options failed."),
      { status: response.status },
    );
  }

  try {
    return parseCollaboratorInvitationPasskeyRegistrationOptionsResponse(body);
  } catch (error) {
    throw new CollaboratorInvitationAcceptanceApiError(
      error instanceof Error ? error.message : "Passkey registration options response was invalid.",
      { status: response.status },
    );
  }
}

export async function verifyCollaboratorInvitationPasskeyRegistration({
  fetcher = fetch,
  request,
  response: registrationResponse,
  signal,
}: CollaboratorInvitationAcceptanceFetchOptions & {
  response: CollaboratorInvitationPasskeyRegistrationVerifyRequest["response"];
}): Promise<CollaboratorInvitationPasskeyRegistrationVerifyResponse> {
  const response = await fetcher(COLLABORATOR_INVITATION_PASSKEY_REGISTER_VERIFY_ROUTE, {
    body: JSON.stringify({
      invitationId: request.invitationId,
      response: registrationResponse,
      token: request.token,
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readCollaboratorInvitationAcceptanceJson(response, {
    context: "Passkey registration verify response",
  });

  if (!response.ok) {
    throw new CollaboratorInvitationAcceptanceApiError(
      collaboratorInvitationAcceptanceErrorMessage(
        body,
        "Passkey registration verification failed.",
      ),
      { status: response.status },
    );
  }

  try {
    return parseCollaboratorInvitationPasskeyRegistrationVerifyResponse(body);
  } catch (error) {
    throw new CollaboratorInvitationAcceptanceApiError(
      error instanceof Error ? error.message : "Passkey registration verify response was invalid.",
      { status: response.status },
    );
  }
}

export function collaboratorInvitationAcceptanceContinuationUrl(
  accepted: Pick<
    CollaboratorInvitationPasskeyRegistrationVerifyResponse,
    "accountCompletion" | "continueTo" | "handoff"
  >,
  currentOrigin = typeof window === "undefined" ? undefined : window.location.origin,
): string | undefined {
  void currentOrigin;

  return accepted.accountCompletion?.status === "complete" ? accepted.continueTo : undefined;
}

export class CollaboratorInvitationAcceptanceApiError extends Error {
  status: number | undefined;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "CollaboratorInvitationAcceptanceApiError";
    this.status = options.status;
  }
}

function collaboratorInvitationAcceptanceRequestFromSearch(
  locationSearch: string,
): { ok: true; request: CollaboratorInvitationAcceptanceRequest } | { ok: false; message: string } {
  const searchParams = new URLSearchParams(trimSearchPrefix(locationSearch));

  try {
    return {
      ok: true,
      request: parseCollaboratorInvitationAcceptanceRequest({
        invitationId: searchParams.get("invitationId"),
        token: searchParams.get("token"),
      }),
    };
  } catch {
    return {
      ok: false,
      message: "Invitation link is invalid.",
    };
  }
}

async function readCollaboratorInvitationAcceptanceJson(
  response: Response,
  options: { context: string },
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CollaboratorInvitationAcceptanceApiError(`${options.context} was not JSON.`, {
      status: response.status,
    });
  }
}

function collaboratorInvitationAcceptanceErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" && value.error.trim() !== ""
    ? value.error
    : fallback;
}

function trimSearchPrefix(search: string): string {
  return search.startsWith("?") ? search.slice(1) : search;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
