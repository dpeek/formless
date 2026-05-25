import { useEffect, useMemo, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import { Description, FieldGroup, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { TextField } from "@dpeek/formless-ui/text-field";
import type { OwnerIdentity } from "../../shared/protocol.ts";

export type OwnerLoginRouteState =
  | { status: "complete"; owner: OwnerIdentity }
  | { status: "failed"; message: string; owner?: OwnerIdentity }
  | { status: "loading" }
  | { status: "ready"; owner: OwnerIdentity }
  | { status: "setup-incomplete" }
  | { status: "submitting"; owner: OwnerIdentity };

type StartOwnerLoginRouteSessionOptions = {
  fetcher?: typeof fetch;
  onState: (state: OwnerLoginRouteState) => void;
};

type OwnerLoginFetchOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

type OwnerSessionStatusResponse =
  | {
      authenticated: false;
      owner?: OwnerIdentity;
      setupComplete: boolean;
    }
  | {
      authenticated: true;
      owner: OwnerIdentity;
      session: { expiresAt: string };
      setupComplete: true;
    };

type OwnerLoginResponse = {
  authenticated: true;
  owner: OwnerIdentity;
  session: { expiresAt: string };
};

export function OwnerLoginRoute() {
  const [state, setState] = useState<OwnerLoginRouteState>({ status: "loading" });
  const [adminToken, setAdminToken] = useState("");

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
  const disabled = state.status === "submitting" || adminToken.trim() === "";

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!owner || disabled) {
      return;
    }

    setState({ status: "submitting", owner });

    try {
      const response = await createOwnerSession({ adminToken });

      setState({ status: "complete", owner: response.owner });
      setAdminToken("");
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "Owner login failed.",
        owner,
      });
    }
  }

  return (
    <OwnerLoginRouteView
      adminToken={adminToken}
      disabled={disabled}
      onAdminTokenChange={setAdminToken}
      onSubmit={submitLogin}
      state={state}
    />
  );
}

export function OwnerLoginRouteView({
  adminToken = "",
  disabled,
  onAdminTokenChange,
  onSubmit,
  state,
}: {
  adminToken?: string;
  disabled?: boolean;
  onAdminTokenChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  state: OwnerLoginRouteState;
}) {
  return (
    <section className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-6 rounded-lg border border-border bg-overlay p-6 shadow-sm">
          <OwnerLoginStateBody
            adminToken={adminToken}
            disabled={disabled ?? state.status === "submitting"}
            onAdminTokenChange={onAdminTokenChange}
            onSubmit={onSubmit}
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

export async function createOwnerSession({
  adminToken,
  fetcher = fetch,
  signal,
}: OwnerLoginFetchOptions & { adminToken: string }): Promise<OwnerLoginResponse> {
  const response = await fetcher("/api/formless/session", {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${adminToken.trim()}`,
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

  return parseOwnerLoginResponse(body);
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
  adminToken,
  disabled,
  onAdminTokenChange,
  onSubmit,
  state,
}: {
  adminToken: string;
  disabled: boolean;
  onAdminTokenChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  state: OwnerLoginRouteState;
}) {
  switch (state.status) {
    case "complete":
      return (
        <OwnerLoginMessage
          action={<OwnerLoginContinueLink />}
          heading="Owner signed in"
          message={`Signed in as ${state.owner.name}.`}
        />
      );
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
          adminToken={adminToken}
          disabled={disabled}
          onAdminTokenChange={onAdminTokenChange}
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
  adminToken,
  disabled,
  onAdminTokenChange,
  onSubmit,
  owner,
  submitError,
}: {
  adminToken: string;
  disabled: boolean;
  onAdminTokenChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  owner?: OwnerIdentity;
  submitError?: string;
}) {
  const tokenInputId = useMemo(() => "owner-login-admin-token", []);

  return (
    <>
      <OwnerLoginHeader
        heading="Owner sign in"
        message={owner ? `Sign in as ${owner.name}.` : "Sign in to this Formless instance."}
      />
      <form className="space-y-4" onSubmit={onSubmit}>
        <FieldGroup>
          <TextField
            isDisabled={disabled && adminToken.trim() !== ""}
            isRequired
            onChange={(value) => onAdminTokenChange?.(value)}
            type="password"
            value={adminToken}
          >
            <Label htmlFor={tokenInputId}>Admin token</Label>
            <Input autoComplete="current-password" id={tokenInputId} />
            <Description>Stored only as an HTTP-only owner session cookie.</Description>
          </TextField>
        </FieldGroup>
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
          {disabled && adminToken.trim() !== "" ? "Signing in..." : "Sign in"}
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

function OwnerLoginContinueLink() {
  return (
    <a
      className="inline-flex h-7 items-center justify-center rounded-md bg-primary px-2 text-xs font-medium text-primary-fg transition-colors hover:bg-primary/80"
      href="/"
    >
      Continue
    </a>
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

function parseOwnerSessionStatusResponse(value: unknown): OwnerSessionStatusResponse {
  if (!isRecord(value) || typeof value.authenticated !== "boolean") {
    throw new Error("Owner session status response is malformed.");
  }

  if (value.authenticated) {
    return {
      authenticated: true,
      owner: parseOwnerIdentity(value.owner),
      session: parseSessionSummary(value.session),
      setupComplete: true,
    };
  }

  const owner = value.owner === undefined ? undefined : parseOwnerIdentity(value.owner);

  return {
    authenticated: false,
    ...(owner === undefined ? {} : { owner }),
    setupComplete: value.setupComplete === true,
  };
}

function parseOwnerLoginResponse(value: unknown): OwnerLoginResponse {
  if (!isRecord(value) || value.authenticated !== true) {
    throw new Error("Owner login response is malformed.");
  }

  return {
    authenticated: true,
    owner: parseOwnerIdentity(value.owner),
    session: parseSessionSummary(value.session),
  };
}

function parseSessionSummary(value: unknown): { expiresAt: string } {
  if (!isRecord(value)) {
    throw new Error("Owner session response is malformed.");
  }

  return {
    expiresAt: parseNonEmptyString("Owner session expiresAt", value.expiresAt),
  };
}

function ownerLoginErrorMessage(value: unknown, fallback: string): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
