import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Button } from "@dpeek/formless-ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import {
  parseOwnerSetupToken,
  type OwnerIdentity,
  type OwnerIdentityInput,
  type OwnerSetupCompleteResponse,
  type OwnerSetupStatusResponse,
} from "../../shared/protocol.ts";

export type OwnerSetupRouteState =
  | { status: "already-complete"; owner?: OwnerIdentity }
  | { status: "complete"; owner: OwnerIdentity }
  | { status: "failed"; message: string; setupToken?: string }
  | { status: "invalid-link"; message: string }
  | { status: "loading" }
  | { status: "ready"; setupToken: string }
  | { status: "submitting"; setupToken: string };

type StartOwnerSetupRouteSessionOptions = {
  fetcher?: typeof fetch;
  locationSearch: string;
  onState: (state: OwnerSetupRouteState) => void;
};

type OwnerSetupFetchOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

type CompleteOwnerSetupOptions = OwnerSetupFetchOptions & {
  owner: OwnerIdentityInput;
  setupToken: string;
};

export function OwnerSetupRoute() {
  const locationSearch = useSearch();
  const [state, setState] = useState<OwnerSetupRouteState>({ status: "loading" });
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  useEffect(
    () =>
      startOwnerSetupRouteSession({
        locationSearch,
        onState: setState,
      }),
    [locationSearch],
  );

  const submitError = state.status === "failed" ? state.message : undefined;
  const activeSetupToken =
    state.status === "ready" || state.status === "failed" || state.status === "submitting"
      ? state.setupToken
      : undefined;

  async function submitOwner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSetupToken) {
      return;
    }

    const owner = ownerIdentityInput({ email: ownerEmail, name: ownerName });

    setState({ status: "submitting", setupToken: activeSetupToken });

    try {
      const completed = await completeOwnerSetup({
        owner,
        setupToken: activeSetupToken,
      });

      setState({ status: "complete", owner: completed.owner });
    } catch (error) {
      const failure = ownerSetupFailureState(error, activeSetupToken);

      setState(failure);
    }
  }

  return (
    <OwnerSetupRouteView
      ownerEmail={ownerEmail}
      ownerName={ownerName}
      onOwnerEmailChange={setOwnerEmail}
      onOwnerNameChange={setOwnerName}
      onSubmit={submitOwner}
      state={state}
      submitError={submitError}
    />
  );
}

export function OwnerSetupRouteView({
  ownerEmail = "",
  ownerName = "",
  onOwnerEmailChange,
  onOwnerNameChange,
  onSubmit,
  state,
  submitError,
}: {
  ownerEmail?: string;
  ownerName?: string;
  onOwnerEmailChange?: (value: string) => void;
  onOwnerNameChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  state: OwnerSetupRouteState;
  submitError?: string;
}) {
  const visibleSubmitError = submitError ?? (state.status === "failed" ? state.message : undefined);

  return (
    <section className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
          <OwnerSetupStateBody
            ownerEmail={ownerEmail}
            ownerName={ownerName}
            onOwnerEmailChange={onOwnerEmailChange}
            onOwnerNameChange={onOwnerNameChange}
            onSubmit={onSubmit}
            state={state}
            submitError={visibleSubmitError}
          />
        </div>
      </div>
    </section>
  );
}

export function startOwnerSetupRouteSession({
  fetcher = fetch,
  locationSearch,
  onState,
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
        onState({ status: "already-complete", owner: status.owner });
        return;
      }

      onState(parseOwnerSetupRouteToken(locationSearch));
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
  fetcher = fetch,
  owner,
  setupToken,
  signal,
}: CompleteOwnerSetupOptions): Promise<OwnerSetupCompleteResponse> {
  const response = await fetcher("/api/formless/setup/complete", {
    body: JSON.stringify({ owner, setupToken }),
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

  return parseOwnerSetupCompleteResponse(body);
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

function OwnerSetupStateBody({
  ownerEmail,
  ownerName,
  onOwnerEmailChange,
  onOwnerNameChange,
  onSubmit,
  state,
  submitError,
}: {
  ownerEmail: string;
  ownerName: string;
  onOwnerEmailChange?: (value: string) => void;
  onOwnerNameChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  state: OwnerSetupRouteState;
  submitError?: string;
}) {
  switch (state.status) {
    case "already-complete":
      return (
        <OwnerSetupMessage
          heading="Owner setup is complete"
          message={
            state.owner
              ? `${state.owner.name} owns this Formless instance.`
              : "This instance has an owner."
          }
        />
      );
    case "complete":
      return (
        <OwnerSetupMessage
          action={<OwnerSetupContinueLink />}
          heading="Owner setup complete"
          message={`Signed in as ${state.owner.name}.`}
        />
      );
    case "failed":
    case "ready":
    case "submitting":
      return (
        <OwnerSetupForm
          disabled={state.status === "submitting"}
          ownerEmail={ownerEmail}
          ownerName={ownerName}
          onOwnerEmailChange={onOwnerEmailChange}
          onOwnerNameChange={onOwnerNameChange}
          onSubmit={onSubmit}
          submitError={submitError}
        />
      );
    case "invalid-link":
      return <OwnerSetupMessage heading="Setup link unavailable" message={state.message} />;
    case "loading":
      return <OwnerSetupMessage heading="Checking setup link" message="Loading setup status." />;
  }
}

function OwnerSetupForm({
  disabled,
  ownerEmail,
  ownerName,
  onOwnerEmailChange,
  onOwnerNameChange,
  onSubmit,
  submitError,
}: {
  disabled: boolean;
  ownerEmail: string;
  ownerName: string;
  onOwnerEmailChange?: (value: string) => void;
  onOwnerNameChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  submitError?: string;
}) {
  const nameInputId = useMemo(() => "owner-setup-name", []);
  const emailInputId = useMemo(() => "owner-setup-email", []);

  return (
    <>
      <OwnerSetupHeader heading="Claim this Formless instance" message="Create the first owner." />
      <form className="space-y-4" onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={nameInputId}>Name</FieldLabel>
            <Input
              autoComplete="name"
              disabled={disabled}
              id={nameInputId}
              onChange={(event) => onOwnerNameChange?.(event.currentTarget.value)}
              required
              value={ownerName}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={emailInputId}>Email</FieldLabel>
            <Input
              autoComplete="email"
              disabled={disabled}
              id={emailInputId}
              onChange={(event) => onOwnerEmailChange?.(event.currentTarget.value)}
              type="email"
              value={ownerEmail}
            />
            <FieldDescription>Optional</FieldDescription>
          </Field>
        </FieldGroup>
        {submitError ? <FieldError>{submitError}</FieldError> : null}
        <Button className="w-full" disabled={disabled} type="submit">
          {disabled ? "Creating owner..." : "Create owner"}
        </Button>
      </form>
    </>
  );
}

function OwnerSetupMessage({
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
      <OwnerSetupHeader heading={heading} message={message} />
      {action}
    </div>
  );
}

function OwnerSetupHeader({ heading, message }: { heading: string; message: string }) {
  return (
    <header className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Formless</p>
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </header>
  );
}

function OwnerSetupContinueLink() {
  return (
    <a
      className="inline-flex h-7 items-center justify-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      href="/"
    >
      Continue
    </a>
  );
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
    setupComplete: value.setupComplete,
    ...(value.owner === undefined ? {} : { owner: parseOwnerIdentity(value.owner) }),
  };
}

function parseOwnerSetupCompleteResponse(value: unknown): OwnerSetupCompleteResponse {
  if (!isRecord(value) || value.setupComplete !== true || value.owner === undefined) {
    throw new Error("Owner setup completion response is malformed.");
  }

  return {
    setupComplete: true,
    owner: parseOwnerIdentity(value.owner),
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
