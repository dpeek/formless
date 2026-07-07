import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearch } from "wouter";
import { Button } from "@dpeek/formless-ui/button";

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

  useEffect(
    () =>
      startCollaboratorInvitationAcceptanceRouteSession({
        locationSearch,
        onState: setState,
      }),
    [locationSearch],
  );

  async function submitAcceptance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "eligible" && state.status !== "passkey-unavailable") {
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

    setState({ status: "submitting", invitation: state.invitation });

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
  }

  return <CollaboratorInvitationAcceptanceRouteView onAccept={submitAcceptance} state={state} />;
}

export function CollaboratorInvitationAcceptanceRouteView({
  onAccept,
  state,
}: {
  onAccept?: (event: FormEvent<HTMLFormElement>) => void;
  state: CollaboratorInvitationAcceptanceRouteState;
}) {
  return (
    <section className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-6 rounded-lg border border-border bg-overlay p-6 shadow-sm">
          <CollaboratorInvitationAcceptanceStateBody onAccept={onAccept} state={state} />
        </div>
      </div>
    </section>
  );
}

export function startCollaboratorInvitationAcceptanceRouteSession({
  fetcher = fetch,
  locationSearch,
  onState,
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
          ? { status: "eligible", invitation: status.invitation }
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

function CollaboratorInvitationAcceptanceStateBody({
  onAccept,
  state,
}: {
  onAccept?: (event: FormEvent<HTMLFormElement>) => void;
  state: CollaboratorInvitationAcceptanceRouteState;
}) {
  switch (state.status) {
    case "accepted":
      return <AcceptedInvitation accepted={state} />;
    case "continuing":
      return <AcceptedInvitation accepted={state} />;
    case "eligible":
      return <EligibleInvitation invitation={state.invitation} onAccept={onAccept} />;
    case "failed":
      return (
        <InvitationAcceptanceMessage
          alert
          heading="Invitation unavailable"
          message={state.message}
        />
      );
    case "invalid-link":
      return (
        <InvitationAcceptanceMessage
          alert
          heading="Invitation unavailable"
          message={state.message}
        />
      );
    case "loading":
      return (
        <InvitationAcceptanceMessage
          heading="Checking invitation"
          message="Loading invitation status."
        />
      );
    case "passkey-unavailable":
      return <PasskeyUnavailableInvitation invitation={state.invitation} message={state.message} />;
    case "submitting":
      return <EligibleInvitation disabled invitation={state.invitation} onAccept={onAccept} />;
    case "unavailable":
      return (
        <InvitationAcceptanceMessage
          alert
          heading="Invitation unavailable"
          message={state.message}
        />
      );
  }
}

function EligibleInvitation({
  disabled = false,
  invitation,
  onAccept,
}: {
  disabled?: boolean;
  invitation: CollaboratorInvitationAcceptanceInvitationSummary;
  onAccept?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="space-y-5">
      <InvitationAcceptanceHeader
        heading="Invitation ready"
        message={
          invitation.invitedPrincipalDisplayName
            ? `${invitation.invitedPrincipalDisplayName} has been invited.`
            : "This invitation is ready."
        }
      />
      <dl className="grid gap-3 text-sm">
        <InvitationFact label="Email">{invitation.targetEmail}</InvitationFact>
        <InvitationFact label="Surface">
          {collaboratorInvitationTargetSurfaceLabel(invitation.targetSurface)}
        </InvitationFact>
        {invitation.invitedPrincipalDisplayName ? (
          <InvitationFact label="Name">{invitation.invitedPrincipalDisplayName}</InvitationFact>
        ) : null}
        <InvitationFact label="Expires">
          <time dateTime={invitation.expiresAt}>{invitation.expiresAt}</time>
        </InvitationFact>
      </dl>
      <form onSubmit={onAccept}>
        <Button className="w-full" isDisabled={disabled} type="submit">
          {disabled ? "Creating passkey..." : "Create passkey and accept"}
        </Button>
      </form>
    </div>
  );
}

function PasskeyUnavailableInvitation({
  invitation,
  message,
}: {
  invitation: CollaboratorInvitationAcceptanceInvitationSummary;
  message: string;
}) {
  return (
    <div className="space-y-5">
      <InvitationAcceptanceHeader
        heading="Passkeys are unavailable"
        message={message}
        messageRole="alert"
      />
      <dl className="grid gap-3 text-sm">
        <InvitationFact label="Email">{invitation.targetEmail}</InvitationFact>
        <InvitationFact label="Surface">
          {collaboratorInvitationTargetSurfaceLabel(invitation.targetSurface)}
        </InvitationFact>
        <InvitationFact label="Expires">
          <time dateTime={invitation.expiresAt}>{invitation.expiresAt}</time>
        </InvitationFact>
      </dl>
    </div>
  );
}

function AcceptedInvitation({
  accepted,
}: {
  accepted: Extract<
    CollaboratorInvitationAcceptanceRouteState,
    { status: "accepted" | "continuing" }
  >;
}) {
  const continuing = accepted.status === "continuing";

  return (
    <div className="space-y-5">
      <InvitationAcceptanceHeader
        heading="Invitation accepted"
        message={
          continuing
            ? `Signed in as ${accepted.acceptedPrincipal.displayName}. Continuing to ${
                accepted.handoff?.targetOrigin ?? accepted.continueTo
              }.`
            : `Signed in as ${accepted.acceptedPrincipal.displayName}.`
        }
      />
      <dl className="grid gap-3 text-sm">
        <InvitationFact label="Session expires">
          <time dateTime={accepted.session.expiresAt}>{accepted.session.expiresAt}</time>
        </InvitationFact>
        {accepted.handoff ? (
          <InvitationFact label="Continue to">
            {accepted.handoff.targetOrigin}
            {accepted.handoff.returnTo}
          </InvitationFact>
        ) : continuing ? (
          <InvitationFact label="Continue to">{accepted.continueTo}</InvitationFact>
        ) : null}
      </dl>
    </div>
  );
}

function InvitationFact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-bg px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">{label}</dt>
      <dd className="break-words text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

function InvitationAcceptanceMessage({
  alert,
  heading,
  message,
}: {
  alert?: boolean;
  heading: string;
  message: string;
}) {
  return (
    <div className="space-y-5">
      <InvitationAcceptanceHeader
        heading={heading}
        message={message}
        messageRole={alert ? "alert" : undefined}
      />
    </div>
  );
}

function InvitationAcceptanceHeader({
  heading,
  message,
  messageRole,
}: {
  heading: string;
  message: string;
  messageRole?: "alert";
}) {
  return (
    <header className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Formless</p>
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="text-sm text-muted-fg" role={messageRole}>
        {message}
      </p>
    </header>
  );
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

function collaboratorInvitationTargetSurfaceLabel(
  surface: CollaboratorInvitationAcceptanceInvitationSummary["targetSurface"],
) {
  switch (surface) {
    case "app-install":
      return "App install";
    case "instance":
      return "Instance";
    case "organization":
      return "Organization";
  }
}

function trimSearchPrefix(search: string): string {
  return search.startsWith("?") ? search.slice(1) : search;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
