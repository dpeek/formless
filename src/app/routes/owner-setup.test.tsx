import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  OwnerSetupRouteView,
  completeOwnerSetup,
  fetchOwnerSetupStatus,
  startOwnerSetupRouteSession,
  type OwnerSetupApiError,
  type OwnerSetupRouteState,
} from "./owner-setup.tsx";
import type { OwnerIdentity } from "../../shared/protocol.ts";

const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};

describe("owner setup route view", () => {
  it("renders visible setup states", () => {
    expect(renderOwnerSetupState({ status: "loading" })).toContain("Checking setup link");
    expect(
      renderOwnerSetupState({
        status: "invalid-link",
        message: "Owner setup link is invalid.",
      }),
    ).toContain("Setup link unavailable");
    expect(
      renderOwnerSetupState({
        status: "already-complete",
        owner,
      }),
    ).toContain("Owner setup is complete");
    expect(
      renderOwnerSetupState({
        status: "complete",
        owner,
      }),
    ).toContain("Signed in as Ada Owner.");
    expect(
      renderOwnerSetupState({
        status: "failed",
        message: "Owner setup failed.",
        setupToken,
      }),
    ).toContain("Owner setup failed.");
  });

  it("renders the first owner form when setup is ready", () => {
    const html = renderOwnerSetupState({ status: "ready", setupToken });

    expect(html).toContain("Claim this Formless instance");
    expect(html).toContain("Create owner");
    expect(html).toContain("Name");
    expect(html).toContain("Email");
  });
});

describe("owner setup route data flow", () => {
  it("loads setup status before accepting a route token", async () => {
    const states: OwnerSetupRouteState[] = [];

    const stop = startOwnerSetupRouteSession({
      fetcher: jsonFetcher({ setupComplete: false }),
      locationSearch: `?token=${setupToken}`,
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "ready"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "ready", setupToken }]);
  });

  it("shows already-complete state without requiring a route token", async () => {
    const states: OwnerSetupRouteState[] = [];

    const stop = startOwnerSetupRouteSession({
      fetcher: jsonFetcher({ setupComplete: true, owner }),
      locationSearch: "",
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "already-complete"));
    } finally {
      stop();
    }

    expect(states).toEqual([{ status: "loading" }, { status: "already-complete", owner }]);
  });

  it("rejects missing and malformed setup tokens after status loads", async () => {
    const missingTokenStates: OwnerSetupRouteState[] = [];
    const shortTokenStates: OwnerSetupRouteState[] = [];
    const stopMissing = startOwnerSetupRouteSession({
      fetcher: jsonFetcher({ setupComplete: false }),
      locationSearch: "",
      onState: (state) => missingTokenStates.push(state),
    });
    const stopShort = startOwnerSetupRouteSession({
      fetcher: jsonFetcher({ setupComplete: false }),
      locationSearch: "?token=short",
      onState: (state) => shortTokenStates.push(state),
    });

    try {
      await waitFor(() => missingTokenStates.some((state) => state.status === "invalid-link"));
      await waitFor(() => shortTokenStates.some((state) => state.status === "invalid-link"));
    } finally {
      stopMissing();
      stopShort();
    }

    expect(missingTokenStates.at(-1)).toEqual({
      status: "invalid-link",
      message: "Owner setup link is missing a setup token.",
    });
    expect(shortTokenStates.at(-1)).toEqual({
      status: "invalid-link",
      message: "Owner setup link is invalid.",
    });
  });

  it("reports setup status load failures", async () => {
    const states: OwnerSetupRouteState[] = [];
    const stop = startOwnerSetupRouteSession({
      fetcher: jsonFetcher({ error: "Setup storage unavailable." }, { status: 500 }),
      locationSearch: `?token=${setupToken}`,
      onState: (state) => states.push(state),
    });

    try {
      await waitFor(() => states.some((state) => state.status === "failed"));
    } finally {
      stop();
    }

    expect(states.at(-1)).toEqual({
      status: "failed",
      message: "Setup storage unavailable.",
    });
  });

  it("posts first owner setup without exposing admin authorization", async () => {
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

      return Response.json({ setupComplete: true, owner });
    };

    await expect(
      completeOwnerSetup({
        fetcher,
        owner: { email: "ada@example.com", name: "Ada Owner" },
        setupToken,
      }),
    ).resolves.toEqual({ setupComplete: true, owner });
    expect(calls).toEqual([
      {
        authorization: null,
        body: {
          owner: { email: "ada@example.com", name: "Ada Owner" },
          setupToken,
        },
        credentials: "same-origin",
        input: "/api/formless/setup/complete",
        method: "POST",
      },
    ]);
  });

  it("keeps setup failure details for visible route states", async () => {
    await expect(
      completeOwnerSetup({
        fetcher: jsonFetcher(
          {
            error: "Owner setup link has expired.",
            reason: "expired-token",
            setupComplete: false,
          },
          { status: 410 },
        ),
        owner: { name: "Ada Owner" },
        setupToken,
      }),
    ).rejects.toMatchObject({
      message: "Owner setup link has expired.",
      setupComplete: false,
      status: 410,
    } satisfies Partial<OwnerSetupApiError>);
  });

  it("parses setup status responses", async () => {
    await expect(
      fetchOwnerSetupStatus({ fetcher: jsonFetcher({ setupComplete: true, owner }) }),
    ).resolves.toEqual({
      setupComplete: true,
      owner,
    });
  });
});

function renderOwnerSetupState(state: OwnerSetupRouteState) {
  return renderToStaticMarkup(<OwnerSetupRouteView state={state} />);
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
