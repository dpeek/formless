import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  AuthAccountRouteView,
  authAccountContinuationTarget,
  fetchAuthAccountStatus,
  startAuthAccountRouteSession,
  type AuthAccountApiError,
  type AuthAccountRouteState,
} from "./auth-account.tsx";
import type {
  AccountCompletionContinuationResult,
  AccountCompletionGate,
  AccountCompletionGateResult,
  AccountCompletionGateTarget,
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

  it("continues through the cross-domain handoff path after completion", async () => {
    const locationSearch =
      "?targetOrigin=https%3A%2F%2Ftasks.example.com&routeId=route%3Atasks&targetProfile=app&appInstallId=task-workspace&storageIdentity=app%3Atask-workspace&returnTo=%2Fschema%3Fview%3Dboard&nonceHash=bm9uY2U&state=c3RhdGU";
    const complete = completeResult();

    expect(
      authAccountContinuationTarget(complete, locationSearch, "https://auth.example.com"),
    ).toBe(`/formless/auth/handoff${locationSearch}`);
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
