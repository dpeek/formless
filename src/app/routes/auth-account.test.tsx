import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  AuthAccountRouteView,
  authAccountContinuationTarget,
  authAccountCompletionApiContinuationTarget,
  authAccountSignupTargetFromSearch,
  completeAuthAccountAppRegistrationGate,
  completeAuthAccountProfileCompletionGate,
  completeAuthAccountTermsAcceptanceGate,
  completeEmailVerifiedSignupWithPasskey,
  fetchAuthAccountStatus,
  profileCompletionInputValuesFromFormData,
  requestAuthAccountEmailVerification,
  startAuthAccountRouteSession,
  startEmailVerifiedSignup,
  type AuthAccountApiError,
  type AuthAccountRouteState,
} from "./auth-account.tsx";
import type {
  AccountCompletionContinuationResult,
  AccountCompletionGate,
  AccountCompletionGateOperationInputContract,
  AccountCompletionGateResult,
  AccountCompletionGateTarget,
  OwnerPasskeyRegistrationVerifyRequest,
} from "../../shared/instance-auth.ts";

const privateValues = [
  "central-session-private",
  "handoff-grant-private",
  "credential-private",
  "token-hash-private",
] as const;

describe("auth account route view", () => {
  it("renders loading, failed, and complete states", () => {
    expect(renderAuthAccountState({ status: "loading" })).toContain("Checking account");
    expect(
      renderAuthAccountState({ message: "Account target is invalid.", status: "failed" }),
    ).toContain("Account unavailable");
    expect(renderAuthAccountState({ result: completeResult(), status: "complete" })).toContain(
      "Account ready",
    );
    expect(
      renderAuthAccountState({
        continueTo: "/formless/auth/handoff?state=runtime",
        result: completeResult(),
        status: "continuing",
      }),
    ).toContain("Continuing to /formless/auth/handoff?state=runtime.");
  });

  it("renders display-safe blocked states for every first-pass account gate", () => {
    const cases: Array<{
      contains: readonly string[];
      gate: AccountCompletionGate;
      heading: string;
    }> = [
      {
        contains: ["Email verification", "Ada.User@example.com"],
        gate: {
          displayEmail: "Ada.User@example.com",
          kind: "email-verification",
        },
        heading: "Verify email",
      },
      {
        contains: ["Credential", "Passkey"],
        gate: { credentialMethod: "passkey", kind: "credential" },
        heading: "Create credential",
      },
      {
        contains: ["Invitation", "Ada.Invited@example.com", "App Install"],
        gate: {
          kind: "invitation",
          targetEmail: "Ada.Invited@example.com",
          targetSurface: "app-install",
        },
        heading: "Accept invitation",
      },
      {
        contains: ["App registration", "task-workspace", "org:north"],
        gate: {
          appInstallId: "task-workspace",
          kind: "app-registration",
          selectedOrganization: "org:north",
        },
        heading: "Register for app",
      },
      {
        contains: ["Profile completion", "Complete profile"],
        gate: {
          kind: "profile-completion",
          operation: { label: "Complete profile", operationKey: "completeProfile" },
        },
        heading: "Complete profile",
      },
      {
        contains: ["Terms acceptance", "Workspace terms", "v2026-07-06"],
        gate: {
          kind: "terms-acceptance",
          policies: [
            {
              accountPolicyId: "policy:workspace",
              displayName: "Workspace terms",
              policyKey: "workspace-terms",
              version: "2026-07-06",
            },
          ],
        },
        heading: "Accept terms",
      },
      {
        contains: ["Role review", "app.user", "App Install"],
        gate: { kind: "role-review", roleKey: "app.user", scopeKind: "app-install" },
        heading: "Access review required",
      },
    ];

    for (const testCase of cases) {
      const html = renderAuthAccountState({
        result: blockedResult(testCase.gate),
        status: "blocked",
      });

      expect(html, testCase.heading).toContain(testCase.heading);
      expect(html, testCase.heading).toContain("/schema?view=board");
      expect(html, testCase.heading).toContain("https://tasks.example.com");
      expect(html, testCase.heading).toContain("route:tasks");

      for (const expected of testCase.contains) {
        expect(html, `${testCase.heading} ${expected}`).toContain(expected);
      }

      for (const privateValue of privateValues) {
        expect(html, `${testCase.heading} ${privateValue}`).not.toContain(privateValue);
      }

      expect(html, testCase.heading).not.toContain("Set-Cookie");
      expect(html, testCase.heading).not.toContain("grantSecret");
      expect(html, testCase.heading).not.toContain("sessionId");
      expect(html, testCase.heading).not.toContain("credentialId");
      expect(html, testCase.heading).not.toContain("tokenHash");
    }
  });

  it("renders closed app-registration gates without self-service controls", () => {
    const html = renderAuthAccountState({
      result: blockedResult({
        appInstallId: "task-workspace",
        kind: "app-registration",
        operation: { label: "Sign up", operationKey: "signup" },
        registrationPolicy: "closed",
        selectedOrganization: "org:north",
      }),
      status: "blocked",
    });

    expect(html).toContain("Registration closed");
    expect(html).toContain("This app uses closed registration.");
    expect(html).toContain("Closed app registration");
    expect(html).toContain("Registration policy");
    expect(html).toContain("Closed");
    expect(html).toContain("task-workspace");
    expect(html).toContain("org:north");
    expect(html).not.toContain("Register for app");
    expect(html).not.toContain("Sign up");
    expect(html).not.toContain("Complete profile");
    expect(html).not.toContain("Action");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });

  it("renders self-service controls only for runtime-owned completable gates", () => {
    const emailHtml = renderAuthAccountState({
      result: blockedResult({
        displayEmail: "Ada.User@example.com",
        kind: "email-verification",
      }),
      status: "blocked",
    });
    const appRegistrationHtml = renderAuthAccountState({
      result: blockedResult({
        appInstallId: "task-workspace",
        kind: "app-registration",
        operation: {
          appInstallId: "task-workspace",
          entityName: "app-registration",
          label: "Register for app",
          operationKey: "auth.app-registration.complete",
        },
        registrationPolicy: "email-verified",
      }),
      status: "blocked",
    });
    const termsHtml = renderAuthAccountState({
      result: blockedResult({
        kind: "terms-acceptance",
        operation: {
          entityName: "principal-policy-acceptance",
          label: "Accept terms",
          operationKey: "auth.terms-acceptance.complete",
        },
        policies: [
          {
            accountPolicyId: "policy:workspace",
            displayName: "Workspace terms",
            policyKey: "workspace-terms",
            version: "2026-07-06",
          },
        ],
      }),
      status: "blocked",
    });
    const roleReviewHtml = renderAuthAccountState({
      result: blockedResult({ kind: "role-review", roleKey: "app.user" }),
      status: "blocked",
    });

    expect(emailHtml).toContain("Send verification email");
    expect(emailHtml).toContain('name="email"');
    expect(appRegistrationHtml).toContain("Register for app");
    expect(appRegistrationHtml).toContain("<form");
    expect(termsHtml).toContain("Accept terms");
    expect(termsHtml).toContain('name="acceptedPolicyIds"');
    expect(roleReviewHtml).not.toContain("<form");
    expect(roleReviewHtml).not.toContain("<button");
  });

  it("renders operation-backed profile-completion gates from the input contract", () => {
    const html = renderAuthAccountState({
      result: blockedResult(profileCompletionGate()),
      status: "blocked",
    });

    expect(html).toContain("Complete profile");
    expect(html).toContain("Display name");
    expect(html).toContain('name="displayName"');
    expect(html).toContain("Contact preference");
    expect(html).toContain('name="contactPreference"');
    expect(html).toContain("Email");
    expect(html).toContain("<form");
    expect(html).toContain("<button");
    expect(html).not.toContain("profileValue-private");
    expect(html).not.toContain("principal:private");
    expect(html).not.toContain("grantSecret");
  });

  it("renders unavailable profile-completion states without app-private data", () => {
    const missingOperationHtml = renderAuthAccountState({
      result: blockedResult({
        appInstallId: "task-workspace",
        kind: "profile-completion",
      }),
      status: "blocked",
    });
    const unsupportedHtml = renderAuthAccountState({
      result: blockedResult(
        profileCompletionGate({
          inputContract: {
            fields: [],
            unsupportedRequiredFields: ["principal"],
          },
        }),
      ),
      status: "blocked",
    });

    expect(missingOperationHtml).toContain("Profile completion operation is unavailable.");
    expect(missingOperationHtml).not.toContain("<form");
    expect(unsupportedHtml).toContain(
      "Profile completion requires fields this form cannot render.",
    );
    expect(unsupportedHtml).not.toContain('name="principal"');
    expect(unsupportedHtml).not.toContain("principal:private");
    expect(unsupportedHtml).not.toContain("profileValue-private");
  });

  it("renders signup email and passkey setup states", () => {
    expect(
      renderAuthAccountState({
        status: "signup-ready",
        target: accountTarget(),
      }),
    ).toContain("Create account");
    expect(
      renderAuthAccountState({
        challengeId: "challenge:signup",
        displayName: "Ada User",
        email: "ada@example.com",
        expiresAt: "2026-07-07T16:00:00.000Z",
        status: "signup-email-sent",
        target: accountTarget(),
      }),
    ).toContain("Verification token");
    expect(
      renderAuthAccountState({
        challengeId: "challenge:signup",
        displayName: "Ada User",
        email: "ada@example.com",
        status: "signup-credential-ready",
        target: accountTarget(),
      }),
    ).toContain("Create passkey");
  });
});

describe("auth account route data flow", () => {
  it("keeps missing continuation targets local", () => {
    const calls: FetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(calls, completeResult()),
      locationSearch: "",
      onState: (state) => states.push(state),
    });

    stop();

    expect(calls).toEqual([]);
    expect(states).toEqual([
      { status: "loading" },
      {
        message: "Account continuation target is missing.",
        status: "failed",
      },
    ]);
  });

  it("loads blocked account completion from the status response", async () => {
    const calls: FetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const blocked = blockedResult({
      displayEmail: "Ada.User@example.com",
      kind: "email-verification",
    });
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(calls, blocked, { status: 409 }),
      locationSearch: "?returnTo=%2Fschema%3Fview%3Dboard",
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "blocked"));
    } finally {
      stop();
    }

    expect(calls).toEqual([
      {
        credentials: "same-origin",
        input: "/formless/auth?returnTo=%2Fschema%3Fview%3Dboard",
        method: undefined,
      },
    ]);
    expect(states).toEqual([{ status: "loading" }, { result: blocked, status: "blocked" }]);
    expect(JSON.stringify(states)).not.toContain("sessionId");
    expect(JSON.stringify(states)).not.toContain("grantSecret");
  });

  it("renders signup when an anonymous target-bound account status can expose safe target facts", async () => {
    const calls: FetchCall[] = [];
    const states: AuthAccountRouteState[] = [];
    const locationSearch = targetBoundLocationSearch();
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(
        calls,
        { error: "Authenticated account session is required." },
        { status: 401 },
      ),
      locationSearch,
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "signup-ready"));
    } finally {
      stop();
    }

    expect(calls).toEqual([
      {
        credentials: "same-origin",
        input: `/formless/auth${locationSearch}`,
        method: undefined,
      },
    ]);
    expect(states).toEqual([
      { status: "loading" },
      { status: "signup-ready", target: accountTarget() },
    ]);
  });

  it("continues to a same-origin path-only target after completion", async () => {
    const states: AuthAccountRouteState[] = [];
    const navigations: string[] = [];
    const complete = completeResult({
      returnTo: "/deployments",
      targetOrigin: "https://auth.example.com",
    });
    const stop = startAuthAccountRouteSession({
      currentOrigin: "https://auth.example.com",
      fetcher: recordingJsonFetcher([], complete),
      locationSearch: "?returnTo=%2Fdeployments",
      navigateTo: (target) => navigations.push(target),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "continuing"));
    } finally {
      stop();
    }

    expect(navigations).toEqual(["/deployments"]);
    expect(states).toEqual([
      { status: "loading" },
      { continueTo: "/deployments", result: complete, status: "continuing" },
    ]);
  });

  it("surfaces missing central session failures without continuing", async () => {
    const states: AuthAccountRouteState[] = [];
    const navigations: string[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(
        [],
        { error: "Authenticated account session is required." },
        { status: 401 },
      ),
      locationSearch: "?returnTo=%2Fdeployments",
      navigateTo: (target) => navigations.push(target),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "failed"));
    } finally {
      stop();
    }

    expect(navigations).toEqual([]);
    expect(states).toEqual([
      { status: "loading" },
      {
        message: "Authenticated account session is required.",
        status: "failed",
      },
    ]);
  });

  it("surfaces unsafe return target failures without continuing", async () => {
    const states: AuthAccountRouteState[] = [];
    const navigations: string[] = [];
    const stop = startAuthAccountRouteSession({
      fetcher: recordingJsonFetcher(
        [],
        { error: "Account return target must be path-only." },
        { status: 400 },
      ),
      locationSearch: "?returnTo=https%3A%2F%2Fevil.example.com%2Fdeployments",
      navigateTo: (target) => navigations.push(target),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "failed"));
    } finally {
      stop();
    }

    expect(navigations).toEqual([]);
    expect(states).toEqual([
      { status: "loading" },
      {
        message: "Account return target must be path-only.",
        status: "failed",
      },
    ]);
  });

  it("continues through the cross-domain handoff path after completion", async () => {
    const locationSearch = targetBoundLocationSearch();
    const complete = {
      ...completeResult(),
      continueTo: `/formless/auth/handoff${locationSearch}` as const,
    };

    expect(
      authAccountContinuationTarget(complete, locationSearch, "https://auth.example.com"),
    ).toBe(`/formless/auth/handoff${locationSearch}`);
  });

  it("uses server-returned completion continuations without rebuilding target facts", () => {
    const locationSearch =
      "?targetOrigin=https%3A%2F%2Fevil.example.com&routeId=route%3Aevil&targetProfile=app&appInstallId=evil&storageIdentity=app%3Aevil&returnTo=%2Fevil&nonceHash=bm9uY2U&state=c3RhdGU";
    const target = accountTarget({
      returnTo: "/schema?view=board",
      targetOrigin: "https://tasks.example.com",
    });
    const continueTo =
      "/formless/auth/handoff?targetOrigin=https%3A%2F%2Ftasks.example.com&routeId=route%3Atasks&targetProfile=app&appInstallId=task-workspace&storageIdentity=app%3Atask-workspace&returnTo=%2Fschema%3Fview%3Dboard&nonceHash=bm9uY2U&state=c3RhdGU" as const;

    expect(
      authAccountCompletionApiContinuationTarget(
        {
          accountCompletion: completeResult(target),
          continueTo,
          handoff: { returnTo: "/schema?view=board", targetOrigin: "https://tasks.example.com" },
        },
        locationSearch,
        "https://auth.example.com",
      ),
    ).toBe(continueTo);
    expect(
      authAccountCompletionApiContinuationTarget(
        {
          accountCompletion: completeResult(target),
          handoff: { returnTo: "/schema?view=board", targetOrigin: "https://tasks.example.com" },
        },
        locationSearch,
        "https://auth.example.com",
      ),
    ).toBeUndefined();
    expect(
      authAccountContinuationTarget(
        completeResult(target),
        locationSearch,
        "https://auth.example.com",
      ),
    ).toBeUndefined();
  });

  it("passes continuation search only to completion APIs", async () => {
    const calls: JsonFetchCall[] = [];
    const locationSearch = targetBoundLocationSearch();
    const target = accountTarget();

    await completeAuthAccountAppRegistrationGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: completeResult(),
            appRegistration: {
              appInstallId: "task-workspace",
              appRegistrationId: "app-registration:ada",
              status: "active",
            },
            completed: true,
            continueTo: "/formless/auth/handoff?state=runtime",
          },
        },
      ]),
      locationSearch,
      target,
    });

    expect(calls).toEqual([
      {
        body: { target },
        credentials: "same-origin",
        input: `/formless/auth/app-registration/complete${locationSearch}`,
        method: "POST",
      },
    ]);
  });

  it("parses target-bound signup searches without accepting return-only searches", () => {
    expect(authAccountSignupTargetFromSearch(targetBoundLocationSearch())).toEqual(accountTarget());
    expect(authAccountSignupTargetFromSearch("?returnTo=%2Fschema")).toBeUndefined();
  });

  it("posts email verification and gate completion submissions to runtime APIs", async () => {
    const calls: JsonFetchCall[] = [];
    const target = accountTarget();

    await requestAuthAccountEmailVerification({
      email: "ada@example.com",
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            challenge: {
              challengeId: "challenge:email",
              displayEmail: "ada@example.com",
              expiresAt: "2026-07-07T16:00:00.000Z",
              purpose: "account-completion",
            },
          },
        },
      ]),
      target,
    });
    await completeAuthAccountAppRegistrationGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: completeResult(),
            appRegistration: {
              appInstallId: "task-workspace",
              appRegistrationId: "app-registration:ada",
              status: "active",
            },
            completed: true,
          },
        },
      ]),
      target,
    });
    await completeAuthAccountTermsAcceptanceGate({
      acceptedPolicyIds: ["policy:workspace"],
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            acceptedPolicies: [],
            accountCompletion: completeResult(),
            completed: true,
          },
        },
      ]),
      target,
    });

    expect(calls.map((call) => call.input)).toEqual([
      "/formless/auth/email-verification/request",
      "/formless/auth/app-registration/complete",
      "/formless/auth/terms-acceptance/complete",
    ]);
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "POST"]);
    expect(calls[0]?.body).toEqual({
      email: "ada@example.com",
      purpose: "account-completion",
      target,
    });
    expect(calls[1]?.body).toEqual({ target });
    expect(calls[2]?.body).toEqual({ acceptedPolicyIds: ["policy:workspace"], target });
  });

  it("posts profile completion input to the auth-origin runtime endpoint", async () => {
    const calls: JsonFetchCall[] = [];
    const target = accountTarget();
    const operation = profileCompletionOperation();
    const input = profileCompletionInputValuesFromFormData(
      profileCompletionInputContract(),
      formData([
        ["displayName", "Ada Profile"],
        ["contactPreference", "email"],
      ]),
    );

    expect(input).toEqual({
      input: { contactPreference: "email", displayName: "Ada Profile" },
      ok: true,
    });

    const completed = await completeAuthAccountProfileCompletionGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: completeResult(target),
            completed: true,
            continueTo: "/formless/auth/handoff?state=runtime",
          },
        },
      ]),
      idempotencyKey: "profile-completion-test",
      input: input.ok ? input.input : {},
      locationSearch: targetBoundLocationSearch(),
      operation,
      target,
    });

    expect(completed.accountCompletion.status).toBe("complete");
    expect(calls).toEqual([
      {
        body: {
          idempotencyKey: "profile-completion-test",
          input: { contactPreference: "email", displayName: "Ada Profile" },
          operation,
          target,
        },
        credentials: "same-origin",
        input: `/formless/auth/profile-completion/complete${targetBoundLocationSearch()}`,
        method: "POST",
      },
    ]);
    expect(
      authAccountCompletionApiContinuationTarget(
        completed,
        "?targetOrigin=https%3A%2F%2Fevil.example.com&returnTo=%2Fevil",
        "https://auth.example.com",
      ),
    ).toBe("/formless/auth/handoff?state=runtime");
  });

  it("returns blocked profile completion results without inventing continuation targets", async () => {
    const calls: JsonFetchCall[] = [];
    const blocked = blockedResult(
      profileCompletionGate({ inputContract: { fields: [], unsupportedRequiredFields: [] } }),
    );

    const completed = await completeAuthAccountProfileCompletionGate({
      fetcher: recordingJsonSequenceFetcher(calls, [
        {
          body: {
            accountCompletion: blocked,
            completed: true,
            error: "Profile-completion gate is not current.",
          },
          init: { status: 409 },
        },
      ]),
      idempotencyKey: "profile-completion-blocked",
      input: {},
      operation: profileCompletionOperation(),
      target: accountTarget(),
    });

    expect(completed).toEqual({ accountCompletion: blocked });
    expect(
      authAccountCompletionApiContinuationTarget(
        completed,
        targetBoundLocationSearch(),
        "https://auth.example.com",
      ),
    ).toBeUndefined();
    expect(JSON.stringify(calls)).not.toContain("grantSecret");
  });

  it("surfaces display-safe profile completion errors", async () => {
    await expect(
      completeAuthAccountProfileCompletionGate({
        fetcher: recordingJsonSequenceFetcher(
          [],
          [
            {
              body: {
                appPrivateProfileValues: { profileValue: "profileValue-private" },
                error: "Profile completion failed.",
              },
              init: { status: 400 },
            },
          ],
        ),
        idempotencyKey: "profile-completion-error",
        input: {},
        operation: profileCompletionOperation(),
        target: accountTarget(),
      }),
    ).rejects.toMatchObject({
      message: "Profile completion failed.",
    } satisfies Partial<AuthAccountApiError>);
  });

  it("sets up email-verified signup credentials through runtime APIs", async () => {
    const calls: JsonFetchCall[] = [];
    const target = accountTarget();
    const signup = {
      challengeId: "challenge:signup",
      displayEmail: "ada.signup@example.com",
      expiresAt: "2026-07-07T16:00:00.000Z",
      target,
    };

    await startEmailVerifiedSignup({
      email: "ada.signup@example.com",
      fetcher: recordingJsonSequenceFetcher(calls, [{ body: { signup } }]),
      target,
    });
    const completed = await completeEmailVerifiedSignupWithPasskey({
      challengeId: signup.challengeId,
      createRegistrationResponse: async () => passkeyRegistrationResponse(),
      displayName: "Ada Signup",
      email: signup.displayEmail,
      fetcher: recordingJsonSequenceFetcher(calls, [
        { body: { options: passkeyRegistrationOptions() } },
        {
          body: {
            accountCompletion: completeResult(),
            principal: { displayName: "Ada Signup", principalId: "principal:signup" },
            session: { expiresAt: "2026-07-07T20:00:00.000Z" },
            verified: true,
          },
        },
      ]),
      target,
    });

    expect(completed.accountCompletion.status).toBe("complete");
    expect(calls.map((call) => call.input)).toEqual([
      "/formless/auth/signup/start",
      "/formless/auth/signup/passkeys/register/options",
      "/formless/auth/signup/passkeys/register/verify",
    ]);
    expect(JSON.stringify(calls)).not.toContain("sessionId");
    expect(JSON.stringify(calls)).not.toContain("grantSecret");
  });

  it("rejects status responses that expose private session or grant material", async () => {
    await expect(
      fetchAuthAccountStatus({
        fetcher: recordingJsonFetcher([], {
          ...completeResult(),
          sessionId: "central-session-private",
        }),
        locationSearch: "?returnTo=%2Fschema",
      }),
    ).rejects.toMatchObject({
      message:
        'Account completion result cannot include private browser-visible field "sessionId".',
    } satisfies Partial<AuthAccountApiError>);
  });
});

type FetchCall = {
  credentials: RequestCredentials | undefined;
  input: string;
  method: string | undefined;
};

type JsonFetchCall = FetchCall & {
  body: unknown;
};

function renderAuthAccountState(state: AuthAccountRouteState) {
  return renderToStaticMarkup(<AuthAccountRouteView state={state} />);
}

function recordingJsonFetcher(
  calls: FetchCall[],
  body: unknown,
  init: ResponseInit = {},
): typeof fetch {
  return async (input, requestInit) => {
    calls.push({
      credentials: requestInit?.credentials,
      input: requestInputString(input),
      method: requestInit?.method,
    });

    return Response.json(body, init);
  };
}

function recordingJsonSequenceFetcher(
  calls: JsonFetchCall[],
  responses: Array<{ body: unknown; init?: ResponseInit }>,
): typeof fetch {
  return async (input, requestInit) => {
    const body =
      typeof requestInit?.body === "string" ? JSON.parse(requestInit.body) : requestInit?.body;

    calls.push({
      body,
      credentials: requestInit?.credentials,
      input: requestInputString(input),
      method: requestInit?.method,
    });

    const response = responses.shift();

    if (!response) {
      throw new Error("No recorded response.");
    }

    return Response.json(response.body, response.init);
  };
}

function blockedResult(gate: AccountCompletionGate): AccountCompletionGateResult {
  return {
    gate,
    status: "blocked",
    target: accountTarget(),
  };
}

function completeResult(
  target: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionContinuationResult {
  const resolvedTarget = accountTarget(target);

  return {
    continueTo: resolvedTarget.returnTo,
    status: "complete",
    target: resolvedTarget,
  };
}

function profileCompletionGate(
  input: Partial<Extract<AccountCompletionGate, { kind: "profile-completion" }>> = {},
): Extract<AccountCompletionGate, { kind: "profile-completion" }> {
  return {
    appInstallId: "task-workspace",
    inputContract: profileCompletionInputContract(),
    kind: "profile-completion",
    operation: profileCompletionOperation(),
    ...input,
  };
}

function profileCompletionOperation() {
  return {
    appInstallId: "task-workspace",
    entityName: "profile",
    label: "Complete profile",
    operationKey: "profile.completeRegistration",
    operationName: "completeRegistration",
  };
}

function profileCompletionInputContract(
  input: Partial<AccountCompletionGateOperationInputContract> = {},
): AccountCompletionGateOperationInputContract {
  return {
    fields: [
      {
        control: "text",
        label: "Display name",
        name: "displayName",
        required: true,
      },
      {
        control: "enum",
        label: "Contact preference",
        name: "contactPreference",
        options: [
          { label: "Email", value: "email" },
          { label: "Phone", value: "phone" },
        ],
        required: false,
      },
    ],
    unsupportedRequiredFields: [],
    ...input,
  };
}

function accountTarget(
  input: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionGateTarget {
  return {
    appInstallId: "task-workspace",
    returnTo: "/schema?view=board",
    routeId: "route:tasks",
    storageIdentity: "app:task-workspace",
    targetOrigin: "https://tasks.example.com",
    targetProfile: "app",
    ...input,
  };
}

function formData(entries: Array<[string, string]>): FormData {
  const data = new FormData();

  for (const [key, value] of entries) {
    data.set(key, value);
  }

  return data;
}

function targetBoundLocationSearch(): string {
  return "?targetOrigin=https%3A%2F%2Ftasks.example.com&routeId=route%3Atasks&targetProfile=app&appInstallId=task-workspace&storageIdentity=app%3Atask-workspace&returnTo=%2Fschema%3Fview%3Dboard&nonceHash=bm9uY2U&state=c3RhdGU";
}

function passkeyRegistrationOptions() {
  return {
    challenge: "registration-challenge",
  };
}

function passkeyRegistrationResponse(): OwnerPasskeyRegistrationVerifyRequest["response"] {
  return {
    id: "credential-id",
    rawId: "credential-id",
    response: {
      attestationObject: "attestation-object",
      clientDataJSON: "client-data-json",
    },
    type: "public-key",
    clientExtensionResults: {},
  };
}

function requestInputString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for condition.");
}
