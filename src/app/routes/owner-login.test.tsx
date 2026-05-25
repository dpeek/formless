import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  OwnerLoginRouteView,
  createOwnerSession,
  fetchOwnerSessionStatus,
  startOwnerLoginRouteSession,
  type OwnerLoginApiError,
  type OwnerLoginRouteState,
} from "./owner-login.tsx";
import type { OwnerIdentity } from "../../shared/protocol.ts";

const adminToken = "test-admin-token";
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};

describe("owner login route view", () => {
  it("renders visible login states", () => {
    expect(renderOwnerLoginState({ status: "loading" })).toContain("Checking owner session");
    expect(renderOwnerLoginState({ status: "setup-incomplete" })).toContain(
      "Owner setup is incomplete",
    );
    expect(renderOwnerLoginState({ status: "ready", owner })).toContain("Owner sign in");
    expect(renderOwnerLoginState({ status: "submitting", owner })).toContain("Signing in...");
    expect(renderOwnerLoginState({ status: "complete", owner })).toContain(
      "Signed in as Ada Owner.",
    );
    expect(
      renderOwnerLoginState({
        status: "failed",
        message: "Owner login requires the admin token.",
        owner,
      }),
    ).toContain("Owner login requires the admin token.");
  });

  it("renders the admin token form when login is ready", () => {
    const html = renderToStaticMarkup(
      <OwnerLoginRouteView adminToken={adminToken} state={{ status: "ready", owner }} />,
    );

    expect(html).toContain("Owner sign in");
    expect(html).toContain("Sign in as Ada Owner.");
    expect(html).toContain("Admin token");
    expect(html).toContain("Sign in");
  });
});

describe("owner login route data flow", () => {
  it("loads ready state when owner setup is complete but no session exists", async () => {
    const states: OwnerLoginRouteState[] = [];
    const stop = startOwnerLoginRouteSession({
      fetcher: jsonFetcher({ authenticated: false, owner, setupComplete: true }),
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "ready"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "ready", owner }]);
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

  it("posts owner login with the admin token as a bearer credential", async () => {
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

      return Response.json({
        authenticated: true,
        owner,
        session: { expiresAt: "2026-06-21T00:00:00.000Z" },
      });
    };

    await expect(createOwnerSession({ adminToken, fetcher })).resolves.toEqual({
      authenticated: true,
      owner,
      session: { expiresAt: "2026-06-21T00:00:00.000Z" },
    });
    expect(calls).toEqual([
      {
        authorization: `Bearer ${adminToken}`,
        credentials: "same-origin",
        input: "/api/formless/session",
        method: "POST",
      },
    ]);
  });

  it("keeps owner login failure details", async () => {
    await expect(
      createOwnerSession({
        adminToken,
        fetcher: jsonFetcher(
          { authenticated: false, error: "Owner login requires the admin token." },
          { status: 401 },
        ),
      }),
    ).rejects.toMatchObject({
      message: "Owner login requires the admin token.",
      status: 401,
    } satisfies Partial<OwnerLoginApiError>);
  });

  it("parses owner session status responses", async () => {
    await expect(
      fetchOwnerSessionStatus({
        fetcher: jsonFetcher({ authenticated: false, owner, setupComplete: true }),
      }),
    ).resolves.toEqual({ authenticated: false, owner, setupComplete: true });
  });
});

function renderOwnerLoginState(state: OwnerLoginRouteState) {
  return renderToStaticMarkup(<OwnerLoginRouteView adminToken={adminToken} state={state} />);
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
