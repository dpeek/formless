import { useEffect, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import { fieldErrorStyles } from "@dpeek/formless-ui/field";
import { useLocation } from "wouter";
import {
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
import {
  browserSupportsPasskeys,
  createBrowserPasskeyAuthenticationResponse,
  passkeyUnavailableMessage,
  type CreatePasskeyAuthenticationResponse,
} from "./passkey-browser.ts";

export type OwnerLoginRouteState =
  | { status: "complete"; owner: OwnerIdentity }
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
  const [location, setLocation] = useLocation();
  const redirectTarget = ownerLoginRedirectTargetFromSearch(
    ownerLoginSearchFromRouteLocation(location),
  );

  useEffect(
    () =>
      startOwnerLoginRouteSession({
        onState: setState,
      }),
    [],
  );

  const owner =
    state.status === "ready" || state.status === "failed" || state.status === "submitting"
      ? state.owner
      : undefined;
  const disabled = state.status === "submitting" || owner === undefined;

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!owner || disabled) {
      return;
    }

    setState({ status: "submitting", owner });

    try {
      const response = await loginWithPasskey();

      setState({ status: "complete", owner: response.owner });
      navigateAfterOwnerLogin(redirectTarget, { setLocation });
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "Owner login failed.",
        owner,
      });
    }
  }

  async function logout() {
    if (state.status !== "complete") {
      return;
    }

    const loggedOutOwner = state.owner;

    setState({ status: "logging-out", owner: loggedOutOwner });

    try {
      await logoutOwnerSession();
      setState({ status: "ready", owner: loggedOutOwner });
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "Owner logout failed.",
        owner: loggedOutOwner,
      });
    }
  }

  return (
    <OwnerLoginRouteView
      disabled={disabled}
      onLogout={logout}
      onSubmit={submitLogin}
      redirectTarget={redirectTarget}
      state={state}
    />
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

export function OwnerLoginRouteView({
  disabled,
  onLogout,
  onSubmit,
  redirectTarget = "/",
  state,
}: {
  disabled?: boolean;
  onLogout?: () => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  redirectTarget?: `/${string}`;
  state: OwnerLoginRouteState;
}) {
  return (
    <section className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-6 rounded-lg border border-border bg-overlay p-6 shadow-sm">
          <OwnerLoginStateBody
            disabled={disabled ?? state.status === "submitting"}
            onLogout={onLogout}
            onSubmit={onSubmit}
            redirectTarget={redirectTarget}
            state={state}
          />
        </div>
      </div>
    </section>
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
    body: JSON.stringify({ response: assertionResponse }),
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

function OwnerLoginStateBody({
  disabled,
  onLogout,
  onSubmit,
  redirectTarget,
  state,
}: {
  disabled: boolean;
  onLogout?: () => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  redirectTarget: `/${string}`;
  state: OwnerLoginRouteState;
}) {
  switch (state.status) {
    case "complete":
      return (
        <OwnerLoginMessage
          action={<OwnerLoginSessionActions onLogout={onLogout} redirectTarget={redirectTarget} />}
          heading="Owner signed in"
          message={`Signed in as ${state.owner.name}.`}
        />
      );
    case "logging-out":
      return (
        <OwnerLoginMessage heading="Signing out" message={`Signed in as ${state.owner.name}.`} />
      );
    case "passkey-unavailable":
      return <OwnerLoginMessage heading="Passkeys are unavailable" message={state.message} />;
    case "setup-incomplete":
      return (
        <OwnerLoginMessage
          heading="Owner setup is incomplete"
          message="Create the first owner before signing in."
        />
      );
    case "failed":
    case "ready":
    case "submitting":
      return (
        <OwnerLoginForm
          disabled={disabled || state.owner === undefined}
          onSubmit={onSubmit}
          owner={state.owner}
          submitError={state.status === "failed" ? state.message : undefined}
        />
      );
    case "loading":
      return (
        <OwnerLoginMessage heading="Checking owner session" message="Loading sign-in state." />
      );
  }
}

function OwnerLoginForm({
  disabled,
  onSubmit,
  owner,
  submitError,
}: {
  disabled: boolean;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  owner?: OwnerIdentity;
  submitError?: string;
}) {
  return (
    <>
      <OwnerLoginHeader
        heading="Owner sign in"
        message={owner ? `Sign in as ${owner.name}.` : "Sign in to this Formless instance."}
      />
      <form className="space-y-4" onSubmit={onSubmit}>
        {submitError ? (
          <p
            className={fieldErrorStyles()}
            data-slot="field-error"
            role="alert"
            slot="errorMessage"
          >
            {submitError}
          </p>
        ) : null}
        <Button className="w-full" isDisabled={disabled} type="submit">
          {disabled ? "Signing in..." : "Sign in with passkey"}
        </Button>
      </form>
    </>
  );
}

function OwnerLoginMessage({
  action,
  heading,
  message,
}: {
  action?: React.ReactNode;
  heading: string;
  message: string;
}) {
  return (
    <div className="space-y-5">
      <OwnerLoginHeader heading={heading} message={message} />
      {action}
    </div>
  );
}

function OwnerLoginHeader({ heading, message }: { heading: string; message: string }) {
  return (
    <header className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Formless</p>
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="text-sm text-muted-fg">{message}</p>
    </header>
  );
}

function OwnerLoginContinueLink({ redirectTarget }: { redirectTarget: `/${string}` }) {
  return (
    <a
      className="inline-flex h-7 items-center justify-center rounded-md bg-primary px-2 text-xs font-medium text-primary-fg transition-colors hover:bg-primary/80"
      href={redirectTarget}
    >
      Continue
    </a>
  );
}

function OwnerLoginSessionActions({
  onLogout,
  redirectTarget,
}: {
  onLogout?: () => void;
  redirectTarget: `/${string}`;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <OwnerLoginContinueLink redirectTarget={redirectTarget} />
      <Button intent="secondary" onPress={onLogout} type="button">
        Sign out
      </Button>
    </div>
  );
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
