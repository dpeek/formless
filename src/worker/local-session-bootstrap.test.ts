import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  AppInstallsResponse,
  BootstrapResponse,
  CreateAppInstallResponse,
  OwnerSetupStatusResponse,
} from "../shared/protocol.ts";
import type { OwnerSessionStatusResponse } from "../shared/instance-auth.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import { createWorkerHarness } from "./miniflare-test.ts";
import { OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessFetchInit = NonNullable<Parameters<Harness["fetch"]>[1]>;

const adminToken = "test-admin-token";
const ownerSessionSecret = "test-owner-session-secret";
const localSessionBootstrapToken = "test-local-session-bootstrap-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createLocalBootstrapHarness();
});

afterEach(async () => {
  await harness.dispose();
});

describe("local session bootstrap API routes", () => {
  it("mints a local owner session that authorizes app install writes without exposing admin tokens", async () => {
    const rejectedBefore = await createSiteInstall({ cookie: null });
    const bootstrap = await bootstrapLocalSession({
      init: { headers: { Origin: "http://example.com" } },
      redirectTo: "/apps/site",
      reset: true,
    });
    const cookie = cookiePair(bootstrap.headers.get("Set-Cookie"));
    const session = await getJson<OwnerSessionStatusResponse>("/api/formless/session", {
      headers: { Cookie: cookie },
    });
    const installsBefore = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlaneBefore = await getJson<BootstrapResponse>(
      "/api/formless/control-plane/bootstrap",
    );
    const created = await createSiteInstall({ cookie });
    const installsAfter = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(rejectedBefore.status).toBe(401);
    expect(await rejectedBefore.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(bootstrap.status).toBe(302);
    expect(bootstrap.headers.get("Location")).toBe(
      "http://example.com/local-session?reset=1&redirectTo=%2Fapps%2Fsite",
    );
    expect(bootstrap.headers.get("Location")).not.toContain(localSessionBootstrapToken);
    expect(bootstrap.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(bootstrap.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(bootstrap.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(bootstrap.headers.get("Set-Cookie")).not.toContain(adminToken);
    expect(bootstrap.headers.get("Set-Cookie")).not.toContain(localSessionBootstrapToken);
    expect(session.body).toEqual({
      authenticated: true,
      owner: {
        id: "local-dev-owner",
        name: "Local Dev Owner",
        createdAt: expect.any(String),
      },
      session: { expiresAt: expect.any(String) },
      setupComplete: true,
    });
    expect(JSON.stringify(session.body)).not.toContain(adminToken);
    expect(JSON.stringify(session.body)).not.toContain(localSessionBootstrapToken);
    expect(installsBefore.body.installs).toEqual([]);
    for (const entity of [
      "app-install",
      "route",
      "deploy-target",
      "provider-config-ref",
      "deploy-desired-resource",
    ]) {
      expect(controlPlaneBefore.body.records.filter((record) => record.entity === entity)).toEqual(
        [],
      );
    }
    expect(created.status).toBe(201);
    expect((await created.json()) as CreateAppInstallResponse).toMatchObject({
      install: {
        installId: "site",
        label: "Site",
        packageAppKey: "site",
      },
    });
    expect(installsAfter.body.installs.map((install) => install.installId)).toEqual(["site"]);
  });

  it("redirects same-origin local bootstrap requests back to the original named proxy origin", async () => {
    const bootstrap = await bootstrapLocalSession({
      init: {
        headers: {
          "x-forwarded-host": "ooga.formless.local",
          "x-forwarded-proto": "https",
        },
      },
      origin: "http://127.0.0.1:4334",
      reset: true,
    });

    expect(bootstrap.status).toBe(302);
    expect(bootstrap.headers.get("Location")).toBe(
      "https://ooga.formless.local/local-session?reset=1&redirectTo=%2F",
    );
    expect(bootstrap.headers.get("Location")).not.toContain(localSessionBootstrapToken);
    expect(bootstrap.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
  });

  it("rejects invalid, replayed, cross-origin, and non-local bootstrap requests", async () => {
    const invalid = await harness.fetch(`${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=wrong`, {
      redirect: "manual",
    });
    const invalidBody = await invalid.json();
    const crossOrigin = await bootstrapLocalSession({
      init: { headers: { Origin: "http://evil.example.com" } },
    });
    const crossOriginBody = await crossOrigin.json();
    const setupAfterRejected = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");
    const accepted = await bootstrapLocalSession();
    const replay = await bootstrapLocalSession();
    const replayBody = await replay.json();
    const nonLocalHarness = await createLocalBootstrapHarness({
      FORMLESS_RUNTIME_PROFILE: "publishedSite",
    });

    try {
      const nonLocal = await nonLocalHarness.fetch(
        `${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=${localSessionBootstrapToken}`,
        { redirect: "manual" },
      );
      const nonLocalBody = await nonLocal.json();

      expect(invalid.status).toBe(401);
      expect(invalidBody).toEqual({
        error: "Local session bootstrap token is invalid.",
      });
      expect(crossOrigin.status).toBe(403);
      expect(crossOriginBody).toEqual({
        error: "Local session bootstrap requests must be same-origin.",
      });
      expect(setupAfterRejected.body).toEqual({ setupComplete: false });
      expect(accepted.status).toBe(302);
      expect(accepted.headers.get("Location")).toBe("http://example.com/");
      expect(replay.status).toBe(401);
      expect(replayBody).toEqual({
        error: "Local session bootstrap token is invalid.",
      });
      expect(nonLocal.status).toBe(404);
      expect(nonLocalBody).toEqual({ error: "Not found." });
      expect(nonLocal.headers.get("Set-Cookie")).toBeNull();
    } finally {
      await nonLocalHarness.dispose();
    }
  });
});

async function bootstrapLocalSession({
  init = {},
  origin = "http://example.com",
  redirectTo,
  reset = false,
}: {
  init?: HarnessFetchInit;
  origin?: string;
  redirectTo?: string;
  reset?: boolean;
} = {}) {
  const url = new URL(
    `${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=${localSessionBootstrapToken}`,
    origin,
  );

  if (redirectTo !== undefined) {
    url.searchParams.set("redirectTo", redirectTo);
  }
  if (reset) {
    url.searchParams.set("reset", "1");
  }

  const requestTarget =
    origin === "http://example.com" ? `${url.pathname}${url.search}` : url.toString();

  if (origin !== "http://example.com") {
    return harness.mf.dispatchFetch(requestTarget, {
      ...init,
      redirect: "manual",
    });
  }

  return harness.fetch(requestTarget, {
    ...init,
    redirect: "manual",
  });
}

async function createSiteInstall(input: { cookie: string | null }) {
  return harness.fetch("/api/formless/app-installs", {
    body: JSON.stringify({
      packageAppKey: "site",
      installId: "site",
      label: "Site",
    }),
    headers: {
      "Content-Type": "application/json",
      ...(input.cookie === null ? {} : { Cookie: input.cookie }),
    },
    method: "POST",
  });
}

async function getJson<T>(path: string, init?: HarnessFetchInit) {
  const response = await harness.fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

function cookiePair(cookie: string | null) {
  if (!cookie) {
    throw new Error("Missing Set-Cookie header.");
  }

  return cookie.split(";")[0] ?? cookie;
}

function createLocalBootstrapHarness(bindings: Record<string, string> = {}) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_OWNER_SESSION_SECRET: ownerSessionSecret,
        FORMLESS_RUNTIME_PROFILE: "instance",
        [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: localSessionBootstrapToken,
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "local-gateway-proxy-token",
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1",
        ...bindings,
      },
    },
  );
}
