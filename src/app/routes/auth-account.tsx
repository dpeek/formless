import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import { useLocation, useSearch } from "wouter";

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
  type AccountCompletionProfileCompletionGate,
} from "../../shared/instance-auth.ts";
import {
  runtimeAuthAccountGateRoutes,
  runtimeTopologyRoutes,
} from "../../shared/runtime-topology.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  NoShellAuthRuntimeBoundary,
} from "./auth-runtime-boundary.tsx";
import {
  authAccountSurfaceReference,
  initialAuthAccountDraftSession,
  markAuthAccountDraftSessionSubmitted,
  nextAuthAccountDraftSession,
  prepareAuthAccountDraftSession,
  projectAuthAccountSurface,
  selectAuthAccountDraftSubmission,
} from "./auth-account-projection.ts";
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
const profileCompletionGateCompletePath = `${runtimeAuthAccountGateRoutes.profileCompletion}/complete`;
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
  | { kind: "gate-unavailable"; message: string }
  | { kind: "profile-completion-submitting" };

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
  | {
      continueTo?: `/${string}`;
      result: AccountCompletionContinuationResult;
      status: "complete";
    }
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
  | (AuthAccountSignupState & {
      continueTo?: `/${string}`;
      result: AccountCompletionContinuationResult;
      status: "signup-complete";
    })
  | (AuthAccountSignupState & {
      continueTo: `/${string}`;
      result: AccountCompletionContinuationResult;
      status: "signup-continuing";
    })
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
  const [draftSession, setDraftSession] = useState(() =>
    initialAuthAccountDraftSession({ status: "loading" }),
  );
  const [sessionRevision, setSessionRevision] = useState(0);
  const pendingGuard = useRef(createAuthPendingGuard());
  const currentOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  const navigateTo = (target: `/${string}`) => {
    if (typeof window !== "undefined") {
      window.location.assign(target);
    }
  };
  const publishState = useCallback((nextState: AuthAccountRouteState) => {
    setState(nextState);
    setDraftSession((session) => prepareAuthAccountDraftSession(session, nextState));
  }, []);

  useEffect(
    () =>
      startAuthAccountRouteSession({
        currentOrigin,
        locationSearch,
        navigateTo,
        onState: publishState,
      }),
    [currentOrigin, locationPath, locationSearch, publishState, sessionRevision],
  );

  const surface = useMemo(
    () => projectAuthAccountSurface({ session: draftSession, state }),
    [draftSession, state],
  );
  const reference = authAccountSurfaceReference(surface);

  function applyGateCompletionResult(
    result: AuthAccountCompletionApiResult,
    signupState?: AuthAccountSignupState,
  ) {
    if (result.accountCompletion.status === "blocked") {
      publishState({ result: result.accountCompletion, status: "blocked" });
      return;
    }

    const continueTo = authAccountCompletionApiContinuationTarget(
      result,
      locationSearch,
      currentOrigin,
    );

    if (continueTo) {
      publishState(
        signupState
          ? {
              ...signupState,
              continueTo,
              result: result.accountCompletion,
              status: "signup-continuing",
            }
          : { continueTo, result: result.accountCompletion, status: "continuing" },
      );
      navigateTo(continueTo);
      return;
    }

    publishState(
      signupState
        ? {
            ...signupState,
            result: result.accountCompletion,
            status: "signup-complete",
          }
        : { result: result.accountCompletion, status: "complete" },
    );
  }

  async function submitEmailVerificationRequest(email: string) {
    if (state.status !== "blocked" || state.result.gate.kind !== "email-verification") {
      return;
    }

    publishState({
      action: { kind: "email-verification-requesting" },
      result: state.result,
      status: "blocked",
    });

    try {
      const requested = await requestAuthAccountEmailVerification({
        email,
        target: state.result.target,
      });

      publishState({
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
      publishState({
        action: {
          kind: "gate-unavailable",
          message: error instanceof Error ? error.message : "Email verification request failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitEmailVerificationToken(token: string) {
    if (
      state.status !== "blocked" ||
      state.result.gate.kind !== "email-verification" ||
      state.action?.kind !== "email-verification-sent"
    ) {
      return;
    }

    const action = state.action;

    publishState({
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
      publishState({
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

  async function submitAppRegistration() {
    if (state.status !== "blocked" || !isEmailVerifiedAppRegistrationGate(state.result.gate)) {
      return;
    }

    publishState({ action: { kind: "gate-submitting" }, result: state.result, status: "blocked" });

    try {
      applyGateCompletionResult(
        await completeAuthAccountAppRegistrationGate({
          locationSearch,
          target: state.result.target,
        }),
      );
    } catch (error) {
      publishState({
        action: {
          kind: "gate-unavailable",
          message: error instanceof Error ? error.message : "App registration failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitTermsAcceptance(acceptedPolicyIds: string[]) {
    if (state.status !== "blocked" || state.result.gate.kind !== "terms-acceptance") {
      return;
    }

    publishState({ action: { kind: "gate-submitting" }, result: state.result, status: "blocked" });

    try {
      applyGateCompletionResult(
        await completeAuthAccountTermsAcceptanceGate({
          acceptedPolicyIds,
          locationSearch,
          target: state.result.target,
        }),
      );
    } catch (error) {
      publishState({
        action: {
          kind: "gate-unavailable",
          message: error instanceof Error ? error.message : "Terms acceptance failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitProfileCompletion(input: Record<string, unknown>) {
    if (state.status !== "blocked" || state.result.gate.kind !== "profile-completion") {
      return;
    }

    const { gate } = state.result;

    if (gate.operation === undefined || gate.inputContract === undefined) {
      publishState({
        action: {
          kind: "gate-unavailable",
          message: "Profile completion operation is unavailable.",
        },
        result: state.result,
        status: "blocked",
      });
      return;
    }

    publishState({
      action: { kind: "profile-completion-submitting" },
      result: state.result,
      status: "blocked",
    });

    try {
      applyGateCompletionResult(
        await completeAuthAccountProfileCompletionGate({
          input,
          locationSearch,
          operation: gate.operation,
          target: state.result.target,
        }),
      );
    } catch (error) {
      publishState({
        action: {
          kind: "gate-unavailable",
          message: error instanceof Error ? error.message : "Profile completion failed.",
        },
        result: state.result,
        status: "blocked",
      });
    }
  }

  async function submitSignupStart(displayName: string, email: string) {
    if (state.status !== "signup-ready") {
      return;
    }

    publishState({ displayName, email, target: state.target, status: "signup-email-sending" });

    try {
      const started = await startEmailVerifiedSignup({ email, target: state.target });

      publishState({
        challengeId: started.signup.challengeId,
        displayName,
        email: started.signup.displayEmail,
        expiresAt: started.signup.expiresAt,
        target: started.signup.target,
        status: "signup-email-sent",
      });
    } catch (error) {
      publishState({
        message: error instanceof Error ? error.message : "Signup email verification failed.",
        target: state.target,
        status: "signup-ready",
      });
    }
  }

  async function submitSignupEmailToken(token: string) {
    if (state.status !== "signup-email-sent" || !state.challengeId || !state.email) {
      return;
    }

    publishState({ ...state, status: "signup-email-verifying" });

    try {
      const verified = await verifyEmailVerifiedSignupEmail({
        challengeId: state.challengeId,
        email: state.email,
        target: state.target,
        token,
      });

      publishState({
        challengeId: verified.signup.challengeId,
        displayName: state.displayName,
        email: verified.signup.displayEmail,
        expiresAt: verified.signup.expiresAt,
        target: verified.signup.target,
        status: "signup-credential-ready",
      });
    } catch (error) {
      publishState({
        ...state,
        message: error instanceof Error ? error.message : "Signup email verification failed.",
        status: "signup-email-sent",
      });
    }
  }

  async function submitSignupPasskey() {
    if (
      state.status !== "signup-credential-ready" ||
      !state.challengeId ||
      !state.email ||
      !state.displayName
    ) {
      return;
    }

    if (!browserSupportsPasskeys()) {
      publishState({
        ...state,
        message: passkeyUnavailableMessage,
        status: "signup-passkey-unavailable",
      });
      return;
    }

    publishState({ ...state, status: "signup-credential-submitting" });

    try {
      const signupState = state;
      applyGateCompletionResult(
        await completeEmailVerifiedSignupWithPasskey({
          challengeId: state.challengeId,
          displayName: state.displayName,
          email: state.email,
          locationSearch,
          target: state.target,
        }),
        signupState,
      );
    } catch (error) {
      publishState({
        ...state,
        message: error instanceof Error ? error.message : "Signup passkey setup failed.",
        status: "signup-credential-ready",
      });
    }
  }

  async function submitCurrentAction() {
    const submittedSession = markAuthAccountDraftSessionSubmitted(draftSession);
    const submission = selectAuthAccountDraftSubmission({ session: submittedSession, state });
    if (!submission.ok) {
      setDraftSession(submittedSession);
      return;
    }

    await pendingGuard.current.run(async () => {
      switch (submission.kind) {
        case "email-verification":
          await submitEmailVerificationRequest(submission.email);
          return;
        case "verification-token":
          if (state.status === "blocked") await submitEmailVerificationToken(submission.token);
          else await submitSignupEmailToken(submission.token);
          return;
        case "app-registration":
          await submitAppRegistration();
          return;
        case "profile-completion":
          await submitProfileCompletion(submission.input);
          return;
        case "terms-acceptance":
          await submitTermsAcceptance(submission.acceptedPolicyIds);
          return;
        case "signup-identity":
          await submitSignupStart(submission.displayName, submission.email);
          return;
      }
    });
  }

  function retryCurrentState() {
    if (state.status === "failed") {
      setSessionRevision((revision) => revision + 1);
      return;
    }
    if (state.status === "blocked" && state.action) {
      publishState({ result: state.result, status: "blocked" });
      return;
    }
    if (state.status.startsWith("signup-") && "message" in state && state.message) {
      const { message: _message, ...nextState } = state;
      publishState(nextState);
    }
  }

  async function handleIntent(intent: AuthIntent) {
    if (!authIntentIsCurrent(surface, intent)) return;

    if (intent.type === "authField") {
      setDraftSession((session) => nextAuthAccountDraftSession(session, intent.intent));
      return;
    }
    if (intent.type === "authPolicySelection") {
      setDraftSession((session) => nextAuthAccountDraftSession(session, intent));
      return;
    }
    if (intent.type === "authPasskey") {
      await pendingGuard.current.run(submitSignupPasskey);
      return;
    }
    if (intent.type === "authAction") {
      const action = surface.actions.find((candidate) => candidate.id === intent.actionId);
      if (action?.purpose === "submit") await submitCurrentAction();
      else if (action?.purpose === "retry") retryCurrentState();
      return;
    }
    if (intent.type === "authContinuation" && "continueTo" in state && state.continueTo) {
      navigateTo(state.continueTo);
    }
  }

  return (
    <NoShellAuthRuntimeBoundary
      key={surface.surfaceKind}
      onIntent={handleIntent}
      reference={reference}
      snapshot={surface}
    >
      <ApplicationPresentation presentation={{ kind: "auth", reference }} />
    </NoShellAuthRuntimeBoundary>
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

      onState({ ...(continueTo ? { continueTo } : {}), result, status: "complete" });
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

export async function completeAuthAccountProfileCompletionGate({
  fetcher = fetch,
  idempotencyKey = profileCompletionIdempotencyKey(),
  input,
  locationSearch = "",
  operation,
  signal,
  target,
}: AuthAccountApiOptions & {
  idempotencyKey?: string;
  input: Record<string, unknown>;
  locationSearch?: string;
  operation: NonNullable<AccountCompletionProfileCompletionGate["operation"]>;
  target: AccountCompletionGateTarget;
}): Promise<AuthAccountCompletionApiResult> {
  const response = await postAuthAccountJson({
    body: { idempotencyKey, input, operation, target },
    fetcher,
    path: authAccountApiPathWithSearch(profileCompletionGateCompletePath, locationSearch),
    signal,
  });

  return parseGateCompletionResponse(response, "Profile completion response");
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

function isEmailVerifiedAppRegistrationGate(
  gate: AccountCompletionGate,
): gate is AccountCompletionAppRegistrationGate {
  return (
    gate.kind === "app-registration" &&
    gate.registrationPolicy === "email-verified" &&
    gate.operation?.operationKey === "auth.app-registration.complete"
  );
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

function profileCompletionIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return `profile-completion:${cryptoApi.randomUUID()}`;
  }

  return `profile-completion:${Date.now()}:${Math.random().toString(36).slice(2)}`;
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
