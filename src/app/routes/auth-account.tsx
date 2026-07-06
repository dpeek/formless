import { useEffect, useState, type ReactNode } from "react";
import { useSearch } from "wouter";

import {
  parseAccountCompletionGateResolutionResult,
  parseOwnerLoginRedirectTarget,
  type AccountCompletionContinuationResult,
  type AccountCompletionGate,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateResult,
  type AccountCompletionGateTarget,
} from "../../shared/instance-auth.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";

const instanceAuthHandoffStartPath = "/formless/auth/handoff";

export type AuthAccountRouteState =
  | { result: AccountCompletionGateResult; status: "blocked" }
  | { result: AccountCompletionContinuationResult; status: "complete" }
  | {
      continueTo: `/${string}`;
      result: AccountCompletionContinuationResult;
      status: "continuing";
    }
  | { message: string; status: "failed" }
  | { status: "loading" };

type StartAuthAccountRouteSessionOptions = {
  currentOrigin?: string;
  fetcher?: typeof fetch;
  locationSearch: string;
  navigateTo?: (target: `/${string}`) => void;
  onState: (state: AuthAccountRouteState) => void;
};

type AuthAccountFetchOptions = {
  fetcher?: typeof fetch;
  locationSearch: string;
  signal?: AbortSignal;
};

export function AuthAccountRoute() {
  const locationSearch = useSearch();
  const [state, setState] = useState<AuthAccountRouteState>({ status: "loading" });

  useEffect(
    () =>
      startAuthAccountRouteSession({
        currentOrigin: window.location.origin,
        locationSearch,
        navigateTo: (target) => window.location.assign(target),
        onState: setState,
      }),
    [locationSearch],
  );

  return <AuthAccountRouteView state={state} />;
}

export function AuthAccountRouteView({ state }: { state: AuthAccountRouteState }) {
  return (
    <section className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-6 rounded-lg border border-border bg-overlay p-6 shadow-sm">
          <AuthAccountStateBody state={state} />
        </div>
      </div>
    </section>
  );
}

export function startAuthAccountRouteSession({
  currentOrigin,
  fetcher = fetch,
  locationSearch,
  navigateTo,
  onState,
}: StartAuthAccountRouteSessionOptions) {
  const controller = new AbortController();
  let stopped = false;

  onState({ status: "loading" });

  if (!searchHasContinuationTarget(normalizedSearch(locationSearch))) {
    onState({
      message: "Account continuation target is missing.",
      status: "failed",
    });

    return () => {
      stopped = true;
      controller.abort();
    };
  }

  async function loadAccountStatus() {
    try {
      const result = await fetchAuthAccountStatus({
        fetcher,
        locationSearch,
        signal: controller.signal,
      });

      if (stopped) {
        return;
      }

      if (result.status === "blocked") {
        onState({ result, status: "blocked" });
        return;
      }

      const continueTo = authAccountContinuationTarget(result, locationSearch, currentOrigin);

      if (continueTo && navigateTo) {
        onState({ continueTo, result, status: "continuing" });
        navigateTo(continueTo);
        return;
      }

      onState({ result, status: "complete" });
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        onState({
          message: error instanceof Error ? error.message : "Account status could not be loaded.",
          status: "failed",
        });
      }
    }
  }

  void loadAccountStatus();

  return () => {
    stopped = true;
    controller.abort();
  };
}

export async function fetchAuthAccountStatus({
  fetcher = fetch,
  locationSearch,
  signal,
}: AuthAccountFetchOptions): Promise<AccountCompletionGateResolutionResult> {
  const response = await fetcher(authAccountStatusRequestPath(locationSearch), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readAuthAccountJson(response);

  if (response.status === 409) {
    const result = parseAccountCompletionGateResolutionResult(body);

    if (result.status === "blocked") {
      return result;
    }
  }

  if (!response.ok) {
    throw new AuthAccountApiError(authAccountErrorMessage(body, "Account status failed."), {
      status: response.status,
    });
  }

  return parseAccountCompletionGateResolutionResult(body);
}

export function authAccountContinuationTarget(
  result: AccountCompletionContinuationResult,
  locationSearch: string,
  currentOrigin?: string,
): `/${string}` | undefined {
  const search = normalizedSearch(locationSearch);

  if (
    searchHasHandoffTarget(search) &&
    (currentOrigin === undefined || result.target.targetOrigin !== currentOrigin)
  ) {
    return parseOwnerLoginRedirectTarget(`${instanceAuthHandoffStartPath}${search}`);
  }

  return result.continueTo;
}

export class AuthAccountApiError extends Error {
  status: number | undefined;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "AuthAccountApiError";
    this.status = options.status;
  }
}

function AuthAccountStateBody({ state }: { state: AuthAccountRouteState }) {
  switch (state.status) {
    case "blocked":
      return <BlockedAccountGate result={state.result} />;
    case "complete":
      return (
        <AuthAccountMessage heading="Account ready" message="Your account is ready to continue." />
      );
    case "continuing":
      return (
        <AuthAccountMessage
          heading="Account ready"
          message={`Continuing to ${state.continueTo}.`}
        />
      );
    case "failed":
      return <AuthAccountMessage alert heading="Account unavailable" message={state.message} />;
    case "loading":
      return <AuthAccountMessage heading="Checking account" message="Loading account status." />;
  }
}

function BlockedAccountGate({ result }: { result: AccountCompletionGateResult }) {
  const copy = gateCopy(result.gate);

  return (
    <div className="space-y-5">
      <AuthAccountHeader heading={copy.heading} message={copy.message} messageRole="alert" />
      <dl className="grid gap-3 text-sm">
        {gateFacts(result.gate)}
        {targetFacts(result.target)}
      </dl>
      {result.gate.kind === "terms-acceptance" && result.gate.policies.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Policies</p>
          <ul className="grid gap-2 text-sm">
            {result.gate.policies.map((policy) => (
              <li key={policy.accountPolicyId} className="rounded-md border border-border p-3">
                <span className="font-medium">{policy.displayName}</span>
                <span className="text-muted-fg"> v{policy.version}</span>
                {policy.policyDocumentUrl ? (
                  <a className="ml-2 underline" href={policy.policyDocumentUrl}>
                    Open policy
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AuthAccountMessage({
  alert = false,
  heading,
  message,
}: {
  alert?: boolean;
  heading: string;
  message: string;
}) {
  return (
    <AuthAccountHeader
      heading={heading}
      message={message}
      messageRole={alert ? "alert" : undefined}
    />
  );
}

function AuthAccountHeader({
  heading,
  message,
  messageRole,
}: {
  heading: string;
  message: string;
  messageRole?: "alert";
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Formless</p>
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="text-sm text-muted-fg" role={messageRole}>
        {message}
      </p>
    </div>
  );
}

function gateFacts(gate: AccountCompletionGate): ReactNode {
  switch (gate.kind) {
    case "email-verification":
      return (
        <>
          <AccountFact label="Gate">Email verification</AccountFact>
          <AccountFact label="Email">{gate.displayEmail}</AccountFact>
          {operationFact(gate.operation)}
        </>
      );
    case "credential":
      return (
        <>
          <AccountFact label="Gate">Credential</AccountFact>
          <AccountFact label="Method">{credentialMethodLabel(gate.credentialMethod)}</AccountFact>
          {operationFact(gate.operation)}
        </>
      );
    case "invitation":
      return (
        <>
          <AccountFact label="Gate">Invitation</AccountFact>
          <AccountFact label="Email">{gate.targetEmail}</AccountFact>
          <AccountFact label="Surface">{targetSurfaceLabel(gate.targetSurface)}</AccountFact>
          {operationFact(gate.operation)}
        </>
      );
    case "app-registration":
      return (
        <>
          <AccountFact label="Gate">App registration</AccountFact>
          <AccountFact label="App install">{gate.appInstallId}</AccountFact>
          <AccountFact label="Organization">{gate.selectedOrganization}</AccountFact>
          {operationFact(gate.operation)}
        </>
      );
    case "profile-completion":
      return (
        <>
          <AccountFact label="Gate">Profile completion</AccountFact>
          <AccountFact label="App install">{gate.appInstallId}</AccountFact>
          <AccountFact label="Organization">{gate.selectedOrganization}</AccountFact>
          {operationFact(gate.operation)}
        </>
      );
    case "terms-acceptance":
      return (
        <>
          <AccountFact label="Gate">Terms acceptance</AccountFact>
          {operationFact(gate.operation)}
        </>
      );
    case "role-review":
      return (
        <>
          <AccountFact label="Gate">Role review</AccountFact>
          <AccountFact label="Role">{gate.roleKey}</AccountFact>
          <AccountFact label="Scope">{scopeKindLabel(gate.scopeKind)}</AccountFact>
          {operationFact(gate.operation)}
        </>
      );
  }
}

function targetFacts(target: AccountCompletionGateTarget): ReactNode {
  return (
    <>
      <AccountFact label="Destination">{target.returnTo}</AccountFact>
      <AccountFact label="Origin">{target.targetOrigin}</AccountFact>
      <AccountFact label="Surface">{targetProfileLabel(target.targetProfile)}</AccountFact>
      <AccountFact label="Route">{target.routeId}</AccountFact>
      <AccountFact label="App install">{target.appInstallId}</AccountFact>
      <AccountFact label="Organization">{target.selectedOrganization}</AccountFact>
    </>
  );
}

function operationFact(operation: AccountCompletionGate["operation"]): ReactNode {
  return <AccountFact label="Action">{operationLabel(operation)}</AccountFact>;
}

function AccountFact({ children, label }: { children: ReactNode; label: string }) {
  if (children === undefined || children === null || children === "") {
    return null;
  }

  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">{label}</dt>
      <dd className="mt-1 break-words text-fg">{children}</dd>
    </div>
  );
}

function gateCopy(gate: AccountCompletionGate): { heading: string; message: string } {
  switch (gate.kind) {
    case "email-verification":
      return {
        heading: "Verify email",
        message: "Email verification is required before continuing.",
      };
    case "credential":
      return {
        heading: "Create credential",
        message: "A passkey credential is required before continuing.",
      };
    case "invitation":
      return {
        heading: "Accept invitation",
        message: "An invitation must be accepted before continuing.",
      };
    case "app-registration":
      return {
        heading: "Register for app",
        message: "App registration is required before continuing.",
      };
    case "profile-completion":
      return {
        heading: "Complete profile",
        message: "Profile information is required before continuing.",
      };
    case "terms-acceptance":
      return {
        heading: "Accept terms",
        message: "Required account policies must be accepted before continuing.",
      };
    case "role-review":
      return {
        heading: "Access review required",
        message: "Access must be reviewed before continuing.",
      };
  }
}

function operationLabel(operation: AccountCompletionGate["operation"]): string | undefined {
  if (!operation) {
    return undefined;
  }

  return operation.label ?? operation.operationName ?? operation.operationKey;
}

function credentialMethodLabel(
  value: Extract<AccountCompletionGate, { kind: "credential" }>["credentialMethod"],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === "passkey" ? "Passkey" : value;
}

function targetSurfaceLabel(
  value: Extract<AccountCompletionGate, { kind: "invitation" }>["targetSurface"],
) {
  if (value === undefined) {
    return undefined;
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function targetProfileLabel(value: AccountCompletionGateTarget["targetProfile"]) {
  switch (value) {
    case "app":
      return "App";
    case "instance":
      return "Instance";
    case "public-site":
      return "Public Site";
  }
}

function scopeKindLabel(
  value: Extract<AccountCompletionGate, { kind: "role-review" }>["scopeKind"],
) {
  if (value === undefined) {
    return undefined;
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function authAccountStatusRequestPath(locationSearch: string): string {
  return `${runtimeTopologyRoutes.authAccountRoute}${normalizedSearch(locationSearch)}`;
}

function normalizedSearch(locationSearch: string): string {
  if (locationSearch === "") {
    return "";
  }

  return locationSearch.startsWith("?") ? locationSearch : `?${locationSearch}`;
}

function searchHasHandoffTarget(search: string): boolean {
  if (search === "") {
    return false;
  }

  return new URLSearchParams(search).has("targetOrigin");
}

function searchHasContinuationTarget(search: string): boolean {
  if (search === "") {
    return false;
  }

  const params = new URLSearchParams(search);

  return params.has("returnTo") || params.has("targetOrigin");
}

async function readAuthAccountJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AuthAccountApiError("Account status response was invalid.", {
      status: response.status,
    });
  }
}

function authAccountErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
