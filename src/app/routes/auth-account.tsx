import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@dpeek/formless-ui/button";

import {
  parseAccountCompletionGateResolutionResult,
  parseAccountCompletionGateTarget,
  parseInstanceAuthCanonicalOrigin,
  parseOwnerLoginRedirectTarget,
  type AccountCompletionAppRegistrationGate,
  type AccountCompletionContinuationResult,
  type AccountCompletionGate,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateResult,
  type AccountCompletionGateTarget,
  type AccountCompletionTermsAcceptanceGate,
} from "../../shared/instance-auth.ts";
import {
  runtimeAuthAccountGateRoutes,
  runtimeTopologyRoutes,
} from "../../shared/runtime-topology.ts";
import {
  browserSupportsPasskeys,
  createBrowserPasskeyRegistrationResponse,
  passkeyUnavailableMessage,
  type CreatePasskeyRegistrationResponse,
} from "./passkey-browser.ts";

const instanceAuthHandoffStartPath = "/formless/auth/handoff";
const emailVerificationRequestPath = `${runtimeAuthAccountGateRoutes.emailVerification}/request`;
const emailVerificationVerifyPath = `${runtimeAuthAccountGateRoutes.emailVerification}/verify`;
const signupStartPath = `${runtimeTopologyRoutes.authAccountRoute}/signup/start`;
const signupEmailVerifyPath = `${runtimeTopologyRoutes.authAccountRoute}/signup/email/verify`;
const signupPasskeyRegistrationOptionsPath = `${runtimeTopologyRoutes.authAccountRoute}/signup/passkeys/register/options`;
const signupPasskeyRegistrationVerifyPath = `${runtimeTopologyRoutes.authAccountRoute}/signup/passkeys/register/verify`;
const appRegistrationGateCompletePath = `${runtimeAuthAccountGateRoutes.appRegistration}/complete`;
const termsAcceptanceGateCompletePath = `${runtimeAuthAccountGateRoutes.termsAcceptance}/complete`;

type AuthAccountGateActionState =
  | {
      challengeId: string;
      email: string;
      expiresAt: string;
      kind: "email-verification-sent";
      message?: string;
    }
  | { kind: "email-verification-requesting" }
  | {
      challengeId: string;
      email: string;
      expiresAt: string;
      kind: "email-verification-verifying";
    }
  | { kind: "gate-submitting" }
  | { kind: "gate-unavailable"; message: string };

type AuthAccountSignupState = {
  challengeId?: string;
  displayName?: string;
  email?: string;
  expiresAt?: string;
  message?: string;
  target: AccountCompletionGateTarget;
};

export type AuthAccountRouteState =
  | {
      action?: AuthAccountGateActionState;
      result: AccountCompletionGateResult;
      status: "blocked";
    }
  | { result: AccountCompletionContinuationResult; status: "complete" }
  | {
      continueTo: `/${string}`;
      result: AccountCompletionContinuationResult;
      status: "continuing";
    }
  | { message: string; status: "failed" }
  | { status: "loading" }
  | (AuthAccountSignupState & { status: "signup-credential-ready" })
  | (AuthAccountSignupState & { status: "signup-credential-submitting" })
  | (AuthAccountSignupState & { status: "signup-email-sending" })
  | (AuthAccountSignupState & { status: "signup-email-sent" })
  | (AuthAccountSignupState & { status: "signup-email-verifying" })
  | (AuthAccountSignupState & { status: "signup-passkey-unavailable" })
  | (AuthAccountSignupState & { status: "signup-ready" });

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

type AuthAccountApiOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

export type AuthAccountCompletionHandoff = {
  returnTo: `/${string}`;
  targetOrigin: string;
};

export type AuthAccountCompletionApiResult = {
  accountCompletion: AccountCompletionGateResolutionResult;
  continueTo?: `/${string}`;
  handoff?: AuthAccountCompletionHandoff;
};

type EmailVerificationChallengeSummary = {
  challengeId: string;
  displayEmail: string;
  expiresAt: string;
  purpose: "account-completion" | "invitation-acceptance" | "owner-setup" | "recovery" | "signup";
};

type SignupChallengeSummary = {
  challengeId: string;
  displayEmail: string;
  expiresAt: string;
  target: AccountCompletionGateTarget;
};

type AuthAccountPasskeyRegistrationOptions = Parameters<CreatePasskeyRegistrationResponse>[0];

export function AuthAccountRoute() {
  const [locationPath] = useLocation();
  const locationSearch = useSearch();
  const [state, setState] = useState<AuthAccountRouteState>({ status: "loading" });
  const currentOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  const navigateTo = (target: `/${string}`) => {
    if (typeof window !== "undefined") {
      window.location.assign(target);
    }
  };

  useEffect(
    () =>
      startAuthAccountRouteSession({
        currentOrigin,
        locationSearch,
        navigateTo,
        onState: setState,
      }),
    [currentOrigin, locationPath, locationSearch],
  );

  function applyGateCompletionResult(result: AuthAccountCompletionApiResult) {
    if (result.accountCompletion.status === "blocked") {
      setState({ result: result.accountCompletion, status: "blocked" });
      return;
    }

    const continueTo = authAccountCompletionApiContinuationTarget(
      result,
      locationSearch,
      currentOrigin,
    );

    if (continueTo) {
      setState({ continueTo, result: result.accountCompletion, status: "continuing" });
      navigateTo(continueTo);
      return;
    }

    setState({ result: result.accountCompletion, status: "complete" });
  }

  async function submitEmailVerificationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "blocked" || state.result.gate.kind !== "email-verification") {
      return;
    }

    const email = formString(new FormData(event.currentTarget), "email");

    if (!email) {
      setState({
        action: { kind: "gate-unavailable", message: "Email is required." },
        result: state.result,
        status: "blocked",
      });
      return;
    }

    setState({
      action: { kind: "email-verification-requesting" },
      result: state.result,
      status: "blocked",
    });

    try {
      const requested = await requestAuthAccountEmailVerification({
        email,
        target: state.result.target,
      });

      setState({
        action: {
          challengeId: requested.challenge.challengeId,
          email: requested.challenge.displayEmail,
          expiresAt: requested.challenge.expiresAt,
          kind: "email-verification-sent",
        },
        result: state.result,
        status: "blocked",
      });
    } catch (error) {
      setState({
        action: {
          kind: "gate-unavailable",
          message: error instanceof Error ? error.message : "Email verification request failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitEmailVerificationToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      state.status !== "blocked" ||
      state.result.gate.kind !== "email-verification" ||
      state.action?.kind !== "email-verification-sent"
    ) {
      return;
    }

    const token = formString(new FormData(event.currentTarget), "token");

    if (!token) {
      setState({
        action: { ...state.action, message: "Verification token is required." },
        result: state.result,
        status: "blocked",
      });
      return;
    }

    const action = state.action;

    setState({
      action: {
        challengeId: action.challengeId,
        email: action.email,
        expiresAt: action.expiresAt,
        kind: "email-verification-verifying",
      },
      result: state.result,
      status: "blocked",
    });

    try {
      await verifyAuthAccountEmailVerification({
        challengeId: action.challengeId,
        email: action.email,
        target: state.result.target,
        token,
      });
      const result = await fetchAuthAccountStatus({ locationSearch });

      applyGateCompletionResult({ accountCompletion: result });
    } catch (error) {
      setState({
        action: {
          ...action,
          kind: "email-verification-sent",
          message: error instanceof Error ? error.message : "Email verification failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitAppRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "blocked" || !isEmailVerifiedAppRegistrationGate(state.result.gate)) {
      return;
    }

    setState({ action: { kind: "gate-submitting" }, result: state.result, status: "blocked" });

    try {
      applyGateCompletionResult(
        await completeAuthAccountAppRegistrationGate({
          locationSearch,
          target: state.result.target,
        }),
      );
    } catch (error) {
      setState({
        action: {
          kind: "gate-unavailable",
          message: error instanceof Error ? error.message : "App registration failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitTermsAcceptance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "blocked" || state.result.gate.kind !== "terms-acceptance") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const acceptedPolicyIds = formData
      .getAll("acceptedPolicyIds")
      .map((value) => (typeof value === "string" ? value : ""))
      .filter((value) => value !== "");

    setState({ action: { kind: "gate-submitting" }, result: state.result, status: "blocked" });

    try {
      applyGateCompletionResult(
        await completeAuthAccountTermsAcceptanceGate({
          acceptedPolicyIds,
          locationSearch,
          target: state.result.target,
        }),
      );
    } catch (error) {
      setState({
        action: {
          kind: "gate-unavailable",
          message: error instanceof Error ? error.message : "Terms acceptance failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitSignupStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "signup-ready") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const displayName = formString(formData, "displayName");
    const email = formString(formData, "email");

    if (!displayName || !email) {
      setState({
        message: "Name and email are required.",
        target: state.target,
        status: "signup-ready",
      });
      return;
    }

    setState({ displayName, email, target: state.target, status: "signup-email-sending" });

    try {
      const started = await startEmailVerifiedSignup({ email, target: state.target });

      setState({
        challengeId: started.signup.challengeId,
        displayName,
        email: started.signup.displayEmail,
        expiresAt: started.signup.expiresAt,
        target: started.signup.target,
        status: "signup-email-sent",
      });
    } catch (error) {
      setState({
        message: error instanceof Error ? error.message : "Signup email verification failed.",
        target: state.target,
        status: "signup-ready",
      });
    }
  }

  async function submitSignupEmailToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "signup-email-sent" || !state.challengeId || !state.email) {
      return;
    }

    const token = formString(new FormData(event.currentTarget), "token");

    if (!token) {
      setState({ ...state, message: "Verification token is required." });
      return;
    }

    setState({ ...state, status: "signup-email-verifying" });

    try {
      const verified = await verifyEmailVerifiedSignupEmail({
        challengeId: state.challengeId,
        email: state.email,
        target: state.target,
        token,
      });

      setState({
        challengeId: verified.signup.challengeId,
        displayName: state.displayName,
        email: verified.signup.displayEmail,
        expiresAt: verified.signup.expiresAt,
        target: verified.signup.target,
        status: "signup-credential-ready",
      });
    } catch (error) {
      setState({
        ...state,
        message: error instanceof Error ? error.message : "Signup email verification failed.",
        status: "signup-email-sent",
      });
    }
  }

  async function submitSignupPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      state.status !== "signup-credential-ready" ||
      !state.challengeId ||
      !state.email ||
      !state.displayName
    ) {
      return;
    }

    if (!browserSupportsPasskeys()) {
      setState({
        ...state,
        message: passkeyUnavailableMessage,
        status: "signup-passkey-unavailable",
      });
      return;
    }

    setState({ ...state, status: "signup-credential-submitting" });

    try {
      applyGateCompletionResult(
        await completeEmailVerifiedSignupWithPasskey({
          challengeId: state.challengeId,
          displayName: state.displayName,
          email: state.email,
          locationSearch,
          target: state.target,
        }),
      );
    } catch (error) {
      setState({
        ...state,
        message: error instanceof Error ? error.message : "Signup passkey setup failed.",
        status: "signup-credential-ready",
      });
    }
  }

  return (
    <AuthAccountRouteView
      onAppRegistrationComplete={submitAppRegistration}
      onEmailVerificationRequest={submitEmailVerificationRequest}
      onEmailVerificationVerify={submitEmailVerificationToken}
      onSignupEmailVerify={submitSignupEmailToken}
      onSignupPasskeyRegister={submitSignupPasskey}
      onSignupStart={submitSignupStart}
      onTermsAcceptanceComplete={submitTermsAcceptance}
      state={state}
    />
  );
}

export function AuthAccountRouteView({
  onAppRegistrationComplete,
  onEmailVerificationRequest,
  onEmailVerificationVerify,
  onSignupEmailVerify,
  onSignupPasskeyRegister,
  onSignupStart,
  onTermsAcceptanceComplete,
  state,
}: {
  onAppRegistrationComplete?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationRequest?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationVerify?: (event: FormEvent<HTMLFormElement>) => void;
  onSignupEmailVerify?: (event: FormEvent<HTMLFormElement>) => void;
  onSignupPasskeyRegister?: (event: FormEvent<HTMLFormElement>) => void;
  onSignupStart?: (event: FormEvent<HTMLFormElement>) => void;
  onTermsAcceptanceComplete?: (event: FormEvent<HTMLFormElement>) => void;
  state: AuthAccountRouteState;
}) {
  return (
    <section className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-12">
        <div className="space-y-6 rounded-lg border border-border bg-overlay p-6 shadow-sm">
          <AuthAccountStateBody
            onAppRegistrationComplete={onAppRegistrationComplete}
            onEmailVerificationRequest={onEmailVerificationRequest}
            onEmailVerificationVerify={onEmailVerificationVerify}
            onSignupEmailVerify={onSignupEmailVerify}
            onSignupPasskeyRegister={onSignupPasskeyRegister}
            onSignupStart={onSignupStart}
            onTermsAcceptanceComplete={onTermsAcceptanceComplete}
            state={state}
          />
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
        const signupTarget =
          error instanceof AuthAccountApiError && error.status === 401
            ? authAccountSignupTargetFromSearch(locationSearch)
            : undefined;

        if (signupTarget) {
          onState({ status: "signup-ready", target: signupTarget });
          return;
        }

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

export async function requestAuthAccountEmailVerification({
  email,
  fetcher = fetch,
  signal,
  target,
}: AuthAccountApiOptions & {
  email: string;
  target: AccountCompletionGateTarget;
}): Promise<{ challenge: EmailVerificationChallengeSummary }> {
  const response = await postAuthAccountJson({
    body: { email, purpose: "account-completion", target },
    fetcher,
    path: emailVerificationRequestPath,
    signal,
  });

  if (!response.ok) {
    throw new AuthAccountApiError(
      authAccountErrorMessage(response.body, "Email verification request failed."),
      { status: response.status },
    );
  }

  return parseEmailVerificationRequestResponse(response.body);
}

export async function verifyAuthAccountEmailVerification({
  challengeId,
  email,
  fetcher = fetch,
  signal,
  target,
  token,
}: AuthAccountApiOptions & {
  challengeId: string;
  email: string;
  target: AccountCompletionGateTarget;
  token: string;
}): Promise<void> {
  const response = await postAuthAccountJson({
    body: { challengeId, email, purpose: "account-completion", target, token },
    fetcher,
    path: emailVerificationVerifyPath,
    signal,
  });

  if (!response.ok) {
    throw new AuthAccountApiError(
      authAccountErrorMessage(response.body, "Email verification failed."),
      { status: response.status },
    );
  }
}

export async function startEmailVerifiedSignup({
  email,
  fetcher = fetch,
  signal,
  target,
}: AuthAccountApiOptions & {
  email: string;
  target: AccountCompletionGateTarget;
}): Promise<{ signup: SignupChallengeSummary }> {
  const response = await postAuthAccountJson({
    body: { email, target },
    fetcher,
    path: signupStartPath,
    signal,
  });

  if (!response.ok) {
    throw new AuthAccountApiError(
      authAccountErrorMessage(response.body, "Signup email verification failed."),
      { status: response.status },
    );
  }

  return parseSignupChallengeResponse(response.body);
}

export async function verifyEmailVerifiedSignupEmail({
  challengeId,
  email,
  fetcher = fetch,
  signal,
  target,
  token,
}: AuthAccountApiOptions & {
  challengeId: string;
  email: string;
  target: AccountCompletionGateTarget;
  token: string;
}): Promise<{ signup: SignupChallengeSummary }> {
  const response = await postAuthAccountJson({
    body: { challengeId, email, target, token },
    fetcher,
    path: signupEmailVerifyPath,
    signal,
  });

  if (!response.ok) {
    throw new AuthAccountApiError(
      authAccountErrorMessage(response.body, "Signup email verification failed."),
      { status: response.status },
    );
  }

  return parseSignupChallengeResponse(response.body);
}

export async function completeEmailVerifiedSignupWithPasskey({
  challengeId,
  createRegistrationResponse = createBrowserPasskeyRegistrationResponse,
  displayName,
  email,
  fetcher = fetch,
  locationSearch = "",
  signal,
  target,
}: AuthAccountApiOptions & {
  challengeId: string;
  createRegistrationResponse?: CreatePasskeyRegistrationResponse;
  displayName: string;
  email: string;
  locationSearch?: string;
  target: AccountCompletionGateTarget;
}): Promise<AuthAccountCompletionApiResult> {
  const optionsResponse = await postAuthAccountJson({
    body: { challengeId, displayName, email, target },
    fetcher,
    path: signupPasskeyRegistrationOptionsPath,
    signal,
  });

  if (!optionsResponse.ok) {
    throw new AuthAccountApiError(
      authAccountErrorMessage(optionsResponse.body, "Signup passkey options failed."),
      { status: optionsResponse.status },
    );
  }

  const options = parsePasskeyRegistrationOptionsResponse(optionsResponse.body);
  const registrationResponse = await createRegistrationResponse(options.options);
  const verifyResponse = await postAuthAccountJson({
    body: { challengeId, displayName, email, response: registrationResponse, target },
    fetcher,
    path: authAccountApiPathWithSearch(signupPasskeyRegistrationVerifyPath, locationSearch),
    signal,
  });

  if (!verifyResponse.ok) {
    throw new AuthAccountApiError(
      authAccountErrorMessage(verifyResponse.body, "Signup passkey verification failed."),
      { status: verifyResponse.status },
    );
  }

  return parseAuthAccountCompletionApiResult(verifyResponse.body, {
    completedRequired: false,
    context: "Signup passkey verification response",
  });
}

export async function completeAuthAccountAppRegistrationGate({
  fetcher = fetch,
  locationSearch = "",
  signal,
  target,
}: AuthAccountApiOptions & {
  locationSearch?: string;
  target: AccountCompletionGateTarget;
}): Promise<AuthAccountCompletionApiResult> {
  const response = await postAuthAccountJson({
    body: { target },
    fetcher,
    path: authAccountApiPathWithSearch(appRegistrationGateCompletePath, locationSearch),
    signal,
  });

  return parseGateCompletionResponse(response, "App registration completion response");
}

export async function completeAuthAccountTermsAcceptanceGate({
  acceptedPolicyIds,
  fetcher = fetch,
  locationSearch = "",
  signal,
  target,
}: AuthAccountApiOptions & {
  acceptedPolicyIds: string[];
  locationSearch?: string;
  target: AccountCompletionGateTarget;
}): Promise<AuthAccountCompletionApiResult> {
  const response = await postAuthAccountJson({
    body: { acceptedPolicyIds, target },
    fetcher,
    path: authAccountApiPathWithSearch(termsAcceptanceGateCompletePath, locationSearch),
    signal,
  });

  return parseGateCompletionResponse(response, "Terms acceptance completion response");
}

export function authAccountContinuationTarget(
  result: AccountCompletionContinuationResult,
  locationSearch: string,
  currentOrigin?: string,
): `/${string}` | undefined {
  void locationSearch;

  if (
    currentOrigin !== undefined &&
    result.target.targetOrigin !== currentOrigin &&
    !result.continueTo.startsWith(instanceAuthHandoffStartPath)
  ) {
    return undefined;
  }

  return result.continueTo;
}

export function authAccountCompletionApiContinuationTarget(
  result: AuthAccountCompletionApiResult,
  locationSearch: string,
  currentOrigin?: string,
): `/${string}` | undefined {
  void locationSearch;

  if (result.accountCompletion.status !== "complete") {
    return undefined;
  }

  if (result.continueTo) {
    return result.continueTo;
  }

  if (
    currentOrigin !== undefined &&
    result.accountCompletion.target.targetOrigin !== currentOrigin
  ) {
    return undefined;
  }

  return result.accountCompletion.continueTo;
}

export function authAccountHandoffContinuationTarget(
  result: AuthAccountCompletionApiResult,
  locationSearch: string,
): `/${string}` | undefined {
  void locationSearch;

  if (result.accountCompletion.status !== "complete") {
    return undefined;
  }

  return result.continueTo;
}

export function authAccountSignupTargetFromSearch(
  locationSearch: string,
): AccountCompletionGateTarget | undefined {
  const params = new URLSearchParams(normalizedSearch(locationSearch));

  if (!params.has("targetOrigin") || !params.has("routeId") || !params.has("targetProfile")) {
    return undefined;
  }

  try {
    return parseAccountCompletionGateTarget({
      appInstallId: optionalSearchParam(params, "appInstallId"),
      returnTo: params.get("returnTo"),
      routeId: params.get("routeId"),
      selectedOrganization: optionalSearchParam(params, "selectedOrganization"),
      storageIdentity: optionalSearchParam(params, "storageIdentity"),
      targetOrigin: params.get("targetOrigin"),
      targetProfile: params.get("targetProfile"),
    });
  } catch {
    return undefined;
  }
}

export class AuthAccountApiError extends Error {
  status: number | undefined;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "AuthAccountApiError";
    this.status = options.status;
  }
}

function AuthAccountStateBody({
  onAppRegistrationComplete,
  onEmailVerificationRequest,
  onEmailVerificationVerify,
  onSignupEmailVerify,
  onSignupPasskeyRegister,
  onSignupStart,
  onTermsAcceptanceComplete,
  state,
}: {
  onAppRegistrationComplete?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationRequest?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationVerify?: (event: FormEvent<HTMLFormElement>) => void;
  onSignupEmailVerify?: (event: FormEvent<HTMLFormElement>) => void;
  onSignupPasskeyRegister?: (event: FormEvent<HTMLFormElement>) => void;
  onSignupStart?: (event: FormEvent<HTMLFormElement>) => void;
  onTermsAcceptanceComplete?: (event: FormEvent<HTMLFormElement>) => void;
  state: AuthAccountRouteState;
}) {
  switch (state.status) {
    case "blocked":
      return (
        <BlockedAccountGate
          action={state.action}
          onAppRegistrationComplete={onAppRegistrationComplete}
          onEmailVerificationRequest={onEmailVerificationRequest}
          onEmailVerificationVerify={onEmailVerificationVerify}
          onTermsAcceptanceComplete={onTermsAcceptanceComplete}
          result={state.result}
        />
      );
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
    case "signup-ready":
    case "signup-email-sending":
      return <SignupStartForm onSignupStart={onSignupStart} state={state} />;
    case "signup-email-sent":
    case "signup-email-verifying":
      return (
        <SignupEmailVerificationForm onSignupEmailVerify={onSignupEmailVerify} state={state} />
      );
    case "signup-credential-ready":
    case "signup-credential-submitting":
    case "signup-passkey-unavailable":
      return (
        <SignupCredentialForm onSignupPasskeyRegister={onSignupPasskeyRegister} state={state} />
      );
  }
}

function BlockedAccountGate({
  action,
  onAppRegistrationComplete,
  onEmailVerificationRequest,
  onEmailVerificationVerify,
  onTermsAcceptanceComplete,
  result,
}: {
  action?: AuthAccountGateActionState;
  onAppRegistrationComplete?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationRequest?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationVerify?: (event: FormEvent<HTMLFormElement>) => void;
  onTermsAcceptanceComplete?: (event: FormEvent<HTMLFormElement>) => void;
  result: AccountCompletionGateResult;
}) {
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
      <BlockedAccountGateControl
        action={action}
        gate={result.gate}
        onAppRegistrationComplete={onAppRegistrationComplete}
        onEmailVerificationRequest={onEmailVerificationRequest}
        onEmailVerificationVerify={onEmailVerificationVerify}
        onTermsAcceptanceComplete={onTermsAcceptanceComplete}
      />
    </div>
  );
}

function BlockedAccountGateControl({
  action,
  gate,
  onAppRegistrationComplete,
  onEmailVerificationRequest,
  onEmailVerificationVerify,
  onTermsAcceptanceComplete,
}: {
  action?: AuthAccountGateActionState;
  gate: AccountCompletionGate;
  onAppRegistrationComplete?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationRequest?: (event: FormEvent<HTMLFormElement>) => void;
  onEmailVerificationVerify?: (event: FormEvent<HTMLFormElement>) => void;
  onTermsAcceptanceComplete?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (action?.kind === "gate-unavailable") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {action.message}
      </p>
    );
  }

  switch (gate.kind) {
    case "email-verification":
      return (
        <EmailVerificationGateForm
          action={action}
          gate={gate}
          onRequest={onEmailVerificationRequest}
          onVerify={onEmailVerificationVerify}
        />
      );
    case "app-registration":
      if (!isEmailVerifiedAppRegistrationGate(gate)) {
        return null;
      }

      return (
        <form onSubmit={onAppRegistrationComplete}>
          <Button className="w-full" isDisabled={action?.kind === "gate-submitting"} type="submit">
            {action?.kind === "gate-submitting"
              ? "Registering..."
              : (operationLabel(gate.operation) ?? "Register for app")}
          </Button>
        </form>
      );
    case "terms-acceptance":
      return (
        <TermsAcceptanceGateForm action={action} gate={gate} onAccept={onTermsAcceptanceComplete} />
      );
    case "credential":
    case "invitation":
    case "profile-completion":
    case "role-review":
      return null;
  }
}

function EmailVerificationGateForm({
  action,
  gate,
  onRequest,
  onVerify,
}: {
  action?: AuthAccountGateActionState;
  gate: Extract<AccountCompletionGate, { kind: "email-verification" }>;
  onRequest?: (event: FormEvent<HTMLFormElement>) => void;
  onVerify?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (
    action?.kind === "email-verification-sent" ||
    action?.kind === "email-verification-verifying"
  ) {
    return (
      <form className="space-y-3" onSubmit={onVerify}>
        <AuthAccountField
          autoComplete="one-time-code"
          label="Verification token"
          name="token"
          required
        />
        <p className="text-xs text-muted-fg">
          Sent to {action.email}. Expires at {action.expiresAt}.
        </p>
        {action.kind === "email-verification-sent" && action.message ? (
          <p className="text-sm text-destructive" role="alert">
            {action.message}
          </p>
        ) : null}
        <Button
          className="w-full"
          isDisabled={action.kind === "email-verification-verifying"}
          type="submit"
        >
          {action.kind === "email-verification-verifying" ? "Verifying..." : "Verify email"}
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-3" onSubmit={onRequest}>
      <AuthAccountField
        autoComplete="email"
        defaultValue={gate.displayEmail}
        label="Email"
        name="email"
        required
        type="email"
      />
      <Button
        className="w-full"
        isDisabled={action?.kind === "email-verification-requesting"}
        type="submit"
      >
        {action?.kind === "email-verification-requesting"
          ? "Sending..."
          : "Send verification email"}
      </Button>
    </form>
  );
}

function TermsAcceptanceGateForm({
  action,
  gate,
  onAccept,
}: {
  action?: AuthAccountGateActionState;
  gate: AccountCompletionTermsAcceptanceGate;
  onAccept?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="space-y-4" onSubmit={onAccept}>
      <div className="space-y-2">
        {gate.policies.map((policy) => (
          <label
            key={policy.accountPolicyId}
            className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
          >
            <input
              className="mt-1"
              name="acceptedPolicyIds"
              required
              type="checkbox"
              value={policy.accountPolicyId}
            />
            <span>
              <span className="font-medium">{policy.displayName}</span>
              <span className="text-muted-fg"> v{policy.version}</span>
            </span>
          </label>
        ))}
      </div>
      <Button className="w-full" isDisabled={action?.kind === "gate-submitting"} type="submit">
        {action?.kind === "gate-submitting"
          ? "Accepting..."
          : (operationLabel(gate.operation) ?? "Accept terms")}
      </Button>
    </form>
  );
}

function SignupStartForm({
  onSignupStart,
  state,
}: {
  onSignupStart?: (event: FormEvent<HTMLFormElement>) => void;
  state: Extract<AuthAccountRouteState, { status: "signup-ready" | "signup-email-sending" }>;
}) {
  return (
    <div className="space-y-5">
      <AuthAccountHeader
        heading="Create account"
        message="Verify your email and create a passkey to continue."
      />
      <dl className="grid gap-3 text-sm">{targetFacts(state.target)}</dl>
      <form className="space-y-3" onSubmit={onSignupStart}>
        <AuthAccountField autoComplete="name" label="Name" name="displayName" required />
        <AuthAccountField autoComplete="email" label="Email" name="email" required type="email" />
        {state.message ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
        <Button
          className="w-full"
          isDisabled={state.status === "signup-email-sending"}
          type="submit"
        >
          {state.status === "signup-email-sending" ? "Sending..." : "Send verification email"}
        </Button>
      </form>
    </div>
  );
}

function SignupEmailVerificationForm({
  onSignupEmailVerify,
  state,
}: {
  onSignupEmailVerify?: (event: FormEvent<HTMLFormElement>) => void;
  state: Extract<AuthAccountRouteState, { status: "signup-email-sent" | "signup-email-verifying" }>;
}) {
  return (
    <div className="space-y-5">
      <AuthAccountHeader
        heading="Verify email"
        message={`A verification email was sent to ${state.email ?? "your email"}.`}
      />
      <form className="space-y-3" onSubmit={onSignupEmailVerify}>
        <AuthAccountField
          autoComplete="one-time-code"
          label="Verification token"
          name="token"
          required
        />
        {state.expiresAt ? (
          <p className="text-xs text-muted-fg">Expires at {state.expiresAt}.</p>
        ) : null}
        {state.message ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
        <Button
          className="w-full"
          isDisabled={state.status === "signup-email-verifying"}
          type="submit"
        >
          {state.status === "signup-email-verifying" ? "Verifying..." : "Verify email"}
        </Button>
      </form>
    </div>
  );
}

function SignupCredentialForm({
  onSignupPasskeyRegister,
  state,
}: {
  onSignupPasskeyRegister?: (event: FormEvent<HTMLFormElement>) => void;
  state: Extract<
    AuthAccountRouteState,
    {
      status:
        | "signup-credential-ready"
        | "signup-credential-submitting"
        | "signup-passkey-unavailable";
    }
  >;
}) {
  return (
    <div className="space-y-5">
      <AuthAccountHeader
        heading={
          state.status === "signup-passkey-unavailable"
            ? "Passkeys are unavailable"
            : "Create passkey"
        }
        message={
          state.status === "signup-passkey-unavailable"
            ? (state.message ?? passkeyUnavailableMessage)
            : "Create a passkey credential to finish account setup."
        }
        messageRole={state.status === "signup-passkey-unavailable" ? "alert" : undefined}
      />
      <dl className="grid gap-3 text-sm">
        <AccountFact label="Email">{state.email}</AccountFact>
        <AccountFact label="Name">{state.displayName}</AccountFact>
        {targetFacts(state.target)}
      </dl>
      {state.message && state.status !== "signup-passkey-unavailable" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <form onSubmit={onSignupPasskeyRegister}>
        <Button
          className="w-full"
          isDisabled={state.status === "signup-credential-submitting"}
          type="submit"
        >
          {state.status === "signup-credential-submitting"
            ? "Creating passkey..."
            : "Create passkey"}
        </Button>
      </form>
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

function AuthAccountField({
  autoComplete,
  defaultValue,
  label,
  name,
  required = false,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        autoComplete={autoComplete}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg"
        defaultValue={defaultValue}
        name={name}
        required={required}
        type={type}
      />
    </label>
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
          <AccountFact label="Gate">
            {isClosedAppRegistrationGate(gate) ? "Closed app registration" : "App registration"}
          </AccountFact>
          <AccountFact label="Registration policy">
            {registrationPolicyLabel(gate.registrationPolicy)}
          </AccountFact>
          <AccountFact label="App install">{gate.appInstallId}</AccountFact>
          <AccountFact label="Organization">{gate.selectedOrganization}</AccountFact>
          {isClosedAppRegistrationGate(gate) ? null : operationFact(gate.operation)}
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
      if (isClosedAppRegistrationGate(gate)) {
        return {
          heading: "Registration closed",
          message:
            "This app uses closed registration. Ask an administrator to grant access before continuing.",
        };
      }

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

function isClosedAppRegistrationGate(
  gate: Extract<AccountCompletionGate, { kind: "app-registration" }>,
): boolean {
  return gate.registrationPolicy === "closed";
}

function isEmailVerifiedAppRegistrationGate(
  gate: AccountCompletionGate,
): gate is AccountCompletionAppRegistrationGate {
  return (
    gate.kind === "app-registration" &&
    gate.registrationPolicy === "email-verified" &&
    gate.operation?.operationKey === "auth.app-registration.complete"
  );
}

function registrationPolicyLabel(
  value: Extract<AccountCompletionGate, { kind: "app-registration" }>["registrationPolicy"],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === "closed" ? "Closed" : value;
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

function authAccountApiPathWithSearch(path: string, locationSearch: string): string {
  return `${path}${normalizedSearch(locationSearch)}`;
}

function normalizedSearch(locationSearch: string): string {
  if (locationSearch === "") {
    return "";
  }

  return locationSearch.startsWith("?") ? locationSearch : `?${locationSearch}`;
}

function searchHasContinuationTarget(search: string): boolean {
  if (search === "") {
    return false;
  }

  const params = new URLSearchParams(search);

  return params.has("returnTo") || params.has("targetOrigin");
}

async function postAuthAccountJson({
  body,
  fetcher,
  path,
  signal,
}: {
  body: unknown;
  fetcher: typeof fetch;
  path: string;
  signal?: AbortSignal;
}): Promise<{ body: unknown; ok: boolean; status: number }> {
  const response = await fetcher(path, {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return {
    body: await readAuthAccountJson(response),
    ok: response.ok,
    status: response.status,
  };
}

function parseGateCompletionResponse(
  response: { body: unknown; ok: boolean; status: number },
  context: string,
): AuthAccountCompletionApiResult {
  const parsed = parseAuthAccountCompletionApiResult(response.body, {
    completedRequired: true,
    context,
  });

  if (response.ok || parsed.accountCompletion.status === "blocked") {
    return parsed;
  }

  throw new AuthAccountApiError(authAccountErrorMessage(response.body, `${context} failed.`), {
    status: response.status,
  });
}

function parseAuthAccountCompletionApiResult(
  value: unknown,
  options: { completedRequired: boolean; context: string },
): AuthAccountCompletionApiResult {
  const object = parseRecord(options.context, value);

  if (options.completedRequired && object.completed !== true) {
    throw new AuthAccountApiError(authAccountErrorMessage(object, `${options.context} failed.`));
  }

  return {
    accountCompletion: parseAccountCompletionGateResolutionResult(object.accountCompletion),
    ...parseOptionalPathOnlyContinueTo(object.continueTo),
    ...parseOptionalAuthAccountCompletionHandoff(object.handoff),
  };
}

function parseOptionalPathOnlyContinueTo(value: unknown): { continueTo?: `/${string}` } {
  if (value === undefined) {
    return {};
  }

  const continueTo = parseOwnerLoginRedirectTarget(value);

  if (!continueTo) {
    throw new AuthAccountApiError("Account completion continueTo must be path-only.");
  }

  return { continueTo };
}

function parseOptionalAuthAccountCompletionHandoff(value: unknown): {
  handoff?: AuthAccountCompletionHandoff;
} {
  if (value === undefined) {
    return {};
  }

  const object = parseRecord("Account completion handoff", value);
  const returnTo = parseOwnerLoginRedirectTarget(object.returnTo);

  if (!returnTo) {
    throw new AuthAccountApiError("Account completion handoff returnTo must be path-only.");
  }

  return {
    handoff: {
      returnTo,
      targetOrigin: parseInstanceAuthCanonicalOrigin(object.targetOrigin),
    },
  };
}

function parseEmailVerificationRequestResponse(value: unknown): {
  challenge: EmailVerificationChallengeSummary;
} {
  const object = parseRecord("Email verification request response", value);

  return {
    challenge: parseEmailVerificationChallengeSummary(object.challenge),
  };
}

function parseEmailVerificationChallengeSummary(value: unknown): EmailVerificationChallengeSummary {
  const object = parseRecord("Email verification challenge", value);

  return {
    challengeId: requiredString(object.challengeId, "Email verification challenge id"),
    displayEmail: requiredString(object.displayEmail, "Email verification display email"),
    expiresAt: requiredString(object.expiresAt, "Email verification expiry"),
    purpose: requiredString(
      object.purpose,
      "Email verification purpose",
    ) as EmailVerificationChallengeSummary["purpose"],
  };
}

function parseSignupChallengeResponse(value: unknown): { signup: SignupChallengeSummary } {
  const object = parseRecord("Signup challenge response", value);

  return { signup: parseSignupChallengeSummary(object.signup) };
}

function parseSignupChallengeSummary(value: unknown): SignupChallengeSummary {
  const object = parseRecord("Signup challenge", value);

  return {
    challengeId: requiredString(object.challengeId, "Signup challenge id"),
    displayEmail: requiredString(object.displayEmail, "Signup display email"),
    expiresAt: requiredString(object.expiresAt, "Signup expiry"),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function parsePasskeyRegistrationOptionsResponse(value: unknown): {
  options: AuthAccountPasskeyRegistrationOptions;
} {
  const object = parseRecord("Signup passkey options response", value);

  if (!isRecord(object.options)) {
    throw new AuthAccountApiError("Signup passkey options response was invalid.");
  }

  return { options: object.options as unknown as AuthAccountPasskeyRegistrationOptions };
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AuthAccountApiError(`${context} was invalid.`);
  }

  return value;
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== "string" || value === "") {
    throw new AuthAccountApiError(`${context} is required.`);
  }

  return value;
}

function formString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

function optionalSearchParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);

  return value === null || value === "" ? undefined : value;
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
