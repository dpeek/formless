import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  OwnerLoginRouteView,
  fetchOwnerSessionStatus,
  loginWithPasskey,
  logoutOwnerSession,
  navigateAfterOwnerLogin,
  ownerLoginRedirectRequiresDocumentNavigation,
  ownerLoginSuccessContinuationTarget,
  startOwnerLoginRouteSession,
  type OwnerLoginApiError,
  type OwnerLoginRouteState,
} from "./owner-login.tsx";
import type {
  OwnerPasskeyLoginOptionsResponse,
  OwnerPasskeyLoginVerifyRequest,
} from "../../shared/instance-auth.ts";
import type { OwnerIdentity } from "../../shared/protocol.ts";
import { isRuntimeClientShellRoute, runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";

const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};

describe("owner login route view", () => {
  it("uses the account sign-in gate route instead of the deleted legacy login route", () => {
    expect(runtimeTopologyRoutes.authAccountSignInRoute).toBe("/formless/auth/sign-in");
    expect(isRuntimeClientShellRoute(runtimeTopologyRoutes.authAccountSignInRoute)).toBe(true);
    expect(isRuntimeClientShellRoute("/login")).toBe(false);
  });

  it("renders visible login states", () => {
    expect(renderOwnerLoginState({ status: "loading" })).toContain("Checking owner session");
    expect(renderOwnerLoginState({ status: "setup-incomplete" })).toContain(
      "Owner setup is incomplete",
    );
    expect(renderOwnerLoginState({ status: "ready", owner })).toContain("Owner sign in");
    expect(renderOwnerLoginState({ status: "submitting", owner })).toContain("Signing in...");
    expect(renderOwnerLoginState({ status: "logging-out", owner })).toContain("Signing out");
    expect(
      renderOwnerLoginState({
        status: "passkey-unavailable",
        message: "Passkeys are unavailable in this browser.",
        owner,
      }),
    ).toContain("Passkeys are unavailable");
    expect(renderOwnerLoginState({ status: "complete", owner })).toContain(
      "Signed in as Ada Owner.",
    );
    expect(
      renderOwnerLoginState({
        status: "failed",
        message: "Passkey login is required.",
        owner,
      }),
    ).toContain("Passkey login is required.");
  });

  it("renders passkey login without an admin-token input", () => {
    const html = renderToStaticMarkup(<OwnerLoginRouteView state={{ status: "ready", owner }} />);

    expect(html).toContain("Owner sign in");
    expect(html).toContain("Sign in as Ada Owner.");
    expect(html).toContain("Sign in with passkey");
    expect(html).not.toContain("Admin token");
    expect(html).not.toContain("current-password");
  });

  it("renders a logout affordance after sign-in", () => {
    const html = renderOwnerLoginState({ status: "complete", owner });

    expect(html).toContain("Continue");
    expect(html).toContain('href="/"');
    expect(html).toContain("Sign out");
  });

  it("renders signed-in continuation to the safe return target", () => {
    const html = renderToStaticMarkup(
      <OwnerLoginRouteView
        redirectTarget="/apps/personal/settings?panel=routes"
        state={{ status: "complete", owner }}
      />,
    );

    expect(html).toContain('href="/apps/personal/settings?panel=routes"');
  });
});

describe("owner login route data flow", () => {
  it("uses document navigation for internal auth handoff redirects", () => {
    const clientLocations: unknown[] = [];
    const documentLocations: string[] = [];
    const handoffTarget =
      "/formless/auth/handoff?targetOrigin=https%3A%2F%2Fadmin.example.com&state=c0tPAI" as const;

    navigateAfterOwnerLogin(handoffTarget, {
      replaceDocumentLocation: (target) => documentLocations.push(target),
      setLocation: (...args) => clientLocations.push(args),
    });

    expect(ownerLoginRedirectRequiresDocumentNavigation(handoffTarget)).toBe(true);
    expect(documentLocations).toEqual([handoffTarget]);
    expect(clientLocations).toEqual([]);
  });

  it("routes passkey login success through the account continuation contract", () => {
    expect(
      ownerLoginSuccessContinuationTarget(
        "/formless/auth",
        "?redirectTo=%2Fapps%2Fpersonal%3Fscreen%3Droutes",
      ),
    ).toBe("/formless/auth?returnTo=%2Fapps%2Fpersonal%3Fscreen%3Droutes");
    expect(
      ownerLoginSuccessContinuationTarget(
        "/formless/auth",
        "?redirectTo=https%3A%2F%2Fevil.example.com%2Fadmin",
      ),
    ).toBe("/formless/auth?returnTo=%2F");
    expect(
      ownerLoginSuccessContinuationTarget(
        "/formless/auth?returnTo=%2Fdeployments",
        "?redirectTo=%2Fapps%2Fpersonal",
      ),
    ).toBe("/formless/auth?returnTo=%2Fdeployments");
  });

  it("uses client navigation for normal owner login redirects", () => {
    const clientLocations: unknown[] = [];
    const documentLocations: string[] = [];
    const redirectTarget = "/apps/personal/settings?panel=routes" as const;

    navigateAfterOwnerLogin(redirectTarget, {
      replaceDocumentLocation: (target) => documentLocations.push(target),
      setLocation: (...args) => clientLocations.push(args),
    });

    expect(ownerLoginRedirectRequiresDocumentNavigation(redirectTarget)).toBe(false);
    expect(clientLocations).toEqual([[redirectTarget, { replace: true }]]);
    expect(documentLocations).toEqual([]);
  });

  it("loads ready state when owner setup is complete but no session exists", async () => {
    const states: OwnerLoginRouteState[] = [];
    const stop = startOwnerLoginRouteSession({
      fetcher: jsonFetcher({ authenticated: false, owner, setupComplete: true }),
      onState: (state) => states.push(state),
      passkeysSupported: () => true,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "ready"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "ready", owner }]);
  });

  it("loads unavailable state when setup is complete but WebAuthn is unavailable", async () => {
    const states: OwnerLoginRouteState[] = [];
    const stop = startOwnerLoginRouteSession({
      fetcher: jsonFetcher({ authenticated: false, owner, setupComplete: true }),
      onState: (state) => states.push(state),
      passkeysSupported: () => false,
    });

    try {
      await waitFor(() => states.some((state) => state.status === "passkey-unavailable"));
    } finally {
      stop();
    }

    expect(states).toEqual([
      { status: "loading" },
      {
        status: "passkey-unavailable",
        message: "Passkeys are unavailable in this browser.",
        owner,
      },
    ]);
  });

  it("loads complete state when an owner session already exists", async () => {
    const states: OwnerLoginRouteState[] = [];
    const stop = startOwnerLoginRouteSession({
      fetcher: jsonFetcher({
        authenticated: true,
        owner,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
        setupComplete: true,
      }),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "complete"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "complete", owner }]);
  });

  it("loads setup-incomplete state before the first owner exists", async () => {
    const states: OwnerLoginRouteState[] = [];
    const stop = startOwnerLoginRouteSession({
      fetcher: jsonFetcher({ authenticated: false, setupComplete: false }),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "setup-incomplete"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "setup-incomplete" }]);
  });

  it("runs owner login through passkey assertion without admin authorization", async () => {
    const calls: Array<{
      authorization: string | null;
      body: unknown;
      credentials: RequestCredentials | undefined;
      input: RequestInfo | URL;
      method: string | undefined;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      calls.push({
        authorization: new Headers(init?.headers).get("Authorization"),
        body: body as unknown,
        credentials: init?.credentials,
        input,
        method: init?.method,
      });

      if (input === "/api/formless/passkeys/login/options") {
        return Response.json(loginOptionsResponse);
      }

      return Response.json({
        authenticated: true,
        continueTo: "/formless/auth",
        owner,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
      });
    };

    await expect(
      loginWithPasskey({
        createAuthenticationResponse: async () => authenticationResponse,
        fetcher,
      }),
    ).resolves.toEqual({
      authenticated: true,
      continueTo: "/formless/auth",
      owner,
      session: { expiresAt: "2026-06-21T00:00:00.000Z" },
    });
    expect(calls).toEqual([
      {
        authorization: null,
        body: {},
        credentials: "same-origin",
        input: "/api/formless/passkeys/login/options",
        method: "POST",
      },
      {
        authorization: null,
        body: {
          response: authenticationResponse,
        },
        credentials: "same-origin",
        input: "/api/formless/passkeys/login/verify",
        method: "POST",
      },
    ]);
  });

  it("keeps owner login failure details", async () => {
    await expect(
      loginWithPasskey({
        createAuthenticationResponse: async () => authenticationResponse,
        fetcher: jsonFetcher(
          { authenticated: false, error: "Instance auth configuration is missing." },
          { status: 400 },
        ),
      }),
    ).rejects.toMatchObject({
      message: "Instance auth configuration is missing.",
      status: 400,
    } satisfies Partial<OwnerLoginApiError>);
  });

  it("posts logout without admin authorization", async () => {
    const calls: Array<{
      authorization: string | null;
      credentials: RequestCredentials | undefined;
      input: RequestInfo | URL;
      method: string | undefined;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        authorization: new Headers(init?.headers).get("Authorization"),
        credentials: init?.credentials,
        input,
        method: init?.method,
      });

      return Response.json({ authenticated: false, continueTo: "/formless/auth/sign-in" });
    };

    await expect(logoutOwnerSession({ fetcher })).resolves.toEqual({
      authenticated: false,
      continueTo: "/formless/auth/sign-in",
    });
    expect(calls).toEqual([
      {
        authorization: null,
        credentials: "same-origin",
        input: "/api/formless/session/logout",
        method: "POST",
      },
    ]);
  });

  it("parses owner session status responses", async () => {
    await expect(
      fetchOwnerSessionStatus({
        fetcher: jsonFetcher({ authenticated: false, owner, setupComplete: true }),
      }),
    ).resolves.toEqual({ authenticated: false, owner, setupComplete: true });
  });
});

const loginOptionsResponse = {
  options: {
    allowCredentials: [{ id: "Y3JlZA", transports: ["internal"], type: "public-key" }],
    challenge: "Y2hhbGxlbmdl",
    rpId: "example.com",
    userVerification: "preferred",
  },
} satisfies OwnerPasskeyLoginOptionsResponse;

const authenticationResponse = {
  clientExtensionResults: {},
  id: "Y3JlZA",
  rawId: "Y3JlZA",
  response: {
    authenticatorData: "YXV0aA",
    clientDataJSON: "Y2xpZW50",
    signature: "c2ln",
    userHandle: "dXNlcg",
  },
  type: "public-key",
} satisfies OwnerPasskeyLoginVerifyRequest["response"];

function renderOwnerLoginState(state: OwnerLoginRouteState) {
  return renderToStaticMarkup(<OwnerLoginRouteView state={state} />);
}

function jsonFetcher(body: unknown, init: ResponseInit = {}): typeof fetch {
  return async () => Response.json(body, init);
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
