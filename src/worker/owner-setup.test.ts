import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  AppInstallsResponse,
  BootstrapResponse,
  CreateAppInstallResponse,
  OwnerSetupCompleteResponse,
  OwnerSetupStatusResponse,
} from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessFetchInit = NonNullable<Parameters<Harness["fetch"]>[1]>;

type OwnerSetupCapabilityResponse =
  | {
      capabilityCreated: true;
      expiresAt?: string;
      setupComplete: false;
    }
  | {
      error: string;
      reason: "already-complete";
      setupComplete: true;
    };

type OwnerSetupFailureResponse = {
  error: string;
  reason: string;
  setupComplete: boolean;
};

type OwnerSessionStatusResponse =
  | {
      authenticated: false;
      owner?: OwnerSetupStatusResponse["owner"];
      setupComplete: boolean;
    }
  | {
      authenticated: true;
      owner: NonNullable<OwnerSetupStatusResponse["owner"]>;
      session: { expiresAt: string };
      setupComplete: true;
    };

const adminToken = "test-admin-token";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const otherSetupToken = "xyzXYZ0123456789_-xyzXYZ0123456789_-";
const futureExpiresAt = "2999-01-01T00:00:00.000Z";
const pastExpiresAt = "2000-01-01T00:00:00.000Z";

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("owner setup API routes", () => {
  it("reads public setup status without exposing stored setup capability details", async () => {
    const before = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(before.response.headers.get("Cache-Control")).toBe("no-store");
    expect(before.body).toEqual({ setupComplete: false });

    const created = await createSetupCapability();
    const after = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(created.body).toEqual({
      capabilityCreated: true,
      expiresAt: futureExpiresAt,
      setupComplete: false,
    });
    expect(JSON.stringify(created.body)).not.toContain(setupToken);
    expect(after.body).toEqual({ setupComplete: false });
  });

  it("requires the admin bearer token before creating setup capabilities", async () => {
    const rejected = await harness.fetch("/api/formless/setup/capability", {
      body: "not-json",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const accepted = await createSetupCapability();

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await rejected.json()).toEqual({
      error: "Admin authorization is required for this write endpoint.",
    });
    expect(accepted.response.status).toBe(200);
  });

  it("completes first owner setup with the stored setup capability", async () => {
    await createSetupCapability();

    const completed = await postJson<OwnerSetupCompleteResponse>("/api/formless/setup/complete", {
      setupToken,
      owner: {
        name: "Ada Owner",
        email: "ada@example.com",
      },
    });
    const status = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");
    const appInstalls = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const setupCookie = cookiePair(completed.response.headers.get("Set-Cookie"));
    const created = await postJson<CreateAppInstallResponse>(
      "/api/formless/app-installs",
      {
        packageAppKey: "site",
        installId: "site",
        label: "Site",
      },
      { headers: { Cookie: setupCookie } },
    );
    const appInstallsAfter = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlaneAfter = await getJson<BootstrapResponse>(
      "/api/formless/control-plane/bootstrap",
    );

    expect(completed.body).toEqual({
      setupComplete: true,
      owner: {
        id: expect.any(String),
        name: "Ada Owner",
        email: "ada@example.com",
        createdAt: expect.any(String),
      },
    });
    expect(completed.response.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(completed.response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(completed.response.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(status.body).toEqual(completed.body);
    expect(appInstalls.body.installs).toEqual([]);
    expect(controlPlane.body.records.filter((record) => record.entity === "app-install")).toEqual(
      [],
    );
    expect(controlPlane.body.records.filter((record) => record.entity === "route")).toEqual([]);
    expect(created.response.status).toBe(201);
    expect(created.body.install).toMatchObject({
      installId: "site",
      label: "Site",
      packageAppKey: "site",
    });
    expect(appInstallsAfter.body.installs).toEqual([
      expect.objectContaining({
        adminRoute: "/apps/site",
        installId: "site",
        label: "Site",
        packageAppKey: "site",
        publicRoute: "/sites/site",
        status: "installed",
      }),
    ]);
    expect(
      controlPlaneAfter.body.records
        .filter((record) => record.entity === "route")
        .map((record) => [record.values.matchPath, record.values.surface]),
    ).toEqual([
      ["/apps/site", "admin"],
      ["/apps/site/schema", "schema"],
      ["/sites/site", "public-site"],
    ]);
  });

  it("preserves an existing Site install during owner setup", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "site",
      label: "Existing Site",
    });
    await createSetupCapability();

    const completed = await postJson<OwnerSetupCompleteResponse>("/api/formless/setup/complete", {
      setupToken,
      owner: { name: "Ada Owner" },
    });
    const appInstalls = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(completed.response.status).toBe(200);
    expect(appInstalls.body.installs).toEqual([
      expect.objectContaining({
        installId: "site",
        label: "Existing Site",
      }),
    ]);
  });

  it("preserves preseeded workspace installs during owner setup", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "david",
      label: "David Peek",
    });
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "dom",
      label: "Dominic De Lorenzo",
    });
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "james",
      label: "James Peek",
    });
    await createSetupCapability();

    const completed = await postJson<OwnerSetupCompleteResponse>("/api/formless/setup/complete", {
      setupToken,
      owner: { name: "Ada Owner" },
    });
    const appInstalls = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(completed.response.status).toBe(200);
    expect(appInstalls.body.installs.map((install) => install.installId)).toEqual([
      "david",
      "dom",
      "james",
    ]);
    expect(appInstalls.body.installs).toEqual([
      expect.objectContaining({
        installId: "david",
        label: "David Peek",
        publicRoute: "/sites/david",
      }),
      expect.objectContaining({
        installId: "dom",
        label: "Dominic De Lorenzo",
        publicRoute: "/sites/dom",
      }),
      expect.objectContaining({
        installId: "james",
        label: "James Peek",
        publicRoute: "/sites/james",
      }),
    ]);
  });

  it("rejects malformed and invalid setup completion requests without completing setup", async () => {
    await createSetupCapability();

    const malformed = await harness.fetch("/api/formless/setup/complete", {
      body: JSON.stringify({
        owner: { name: "Ada Owner" },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const invalid = await postJson<OwnerSetupFailureResponse>("/api/formless/setup/complete", {
      setupToken: otherSetupToken,
      owner: { name: "Ada Owner" },
    });
    const status = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: 'Owner setup request must include "setupToken".',
    });
    expect(invalid.response.status).toBe(401);
    expect(invalid.body).toEqual({
      error: "Owner setup link is invalid.",
      reason: "invalid-token",
      setupComplete: false,
    });
    expect(status.body).toEqual({ setupComplete: false });
  });

  it("rejects expired setup completion requests without completing setup", async () => {
    await createSetupCapability({ expiresAt: pastExpiresAt });

    const expired = await postJson<OwnerSetupFailureResponse>("/api/formless/setup/complete", {
      setupToken,
      owner: { name: "Ada Owner" },
    });
    const expiredStatus = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(expired.response.status).toBe(410);
    expect(expired.body).toEqual({
      error: "Owner setup link has expired.",
      reason: "expired-token",
      setupComplete: false,
    });
    expect(expiredStatus.body).toEqual({ setupComplete: false });
  });

  it("binds setup completion to the instance host", async () => {
    await createSetupCapability();

    const response = await harness.mf.dispatchFetch(
      "http://other.example.com/api/formless/setup/complete",
      {
        body: JSON.stringify({
          setupToken,
          owner: { name: "Ada Owner" },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const body = (await response.json()) as OwnerSetupFailureResponse;
    const status = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Owner setup link is not valid for this instance.",
      reason: "wrong-instance",
      setupComplete: false,
    });
    expect(status.body).toEqual({ setupComplete: false });
  });

  it("blocks setup replay and setup capability rotation after the first owner exists", async () => {
    await createSetupCapability();

    const completed = await postJson<OwnerSetupCompleteResponse>("/api/formless/setup/complete", {
      setupToken,
      owner: { name: "Ada Owner" },
    });
    const replay = await postJson<OwnerSetupFailureResponse>("/api/formless/setup/complete", {
      setupToken,
      owner: { name: "Second Owner" },
    });
    const rotated = await createSetupCapability({ setupToken: otherSetupToken });
    const status = await getJson<OwnerSetupStatusResponse>("/api/formless/setup");

    expect(replay.response.status).toBe(409);
    expect(replay.body).toMatchObject({
      error: "Owner setup is already complete.",
      reason: "already-complete",
      setupComplete: true,
    });
    expect(rotated.response.status).toBe(409);
    expect(rotated.body).toMatchObject({
      error: "Owner setup is already complete.",
      reason: "already-complete",
      setupComplete: true,
    });
    expect(status.body).toEqual(completed.body);
  });

  it("rejects token-only owner login while preserving setup session status", async () => {
    await createSetupCapability();

    const completed = await postJson<OwnerSetupCompleteResponse>("/api/formless/setup/complete", {
      setupToken,
      owner: { name: "Ada Owner", email: "ada@example.com" },
    });
    const setupCookie = cookiePair(completed.response.headers.get("Set-Cookie"));
    const statusWithoutCookie = await getJson<OwnerSessionStatusResponse>("/api/formless/session");
    const statusWithSetupCookie = await harness.fetch("/api/formless/session", {
      headers: { Cookie: setupCookie },
    });
    const statusWithSetupCookieBody =
      (await statusWithSetupCookie.json()) as OwnerSessionStatusResponse;
    const tokenOnlyLogin = await harness.fetch("/api/formless/session", {
      headers: { Authorization: `Bearer ${adminToken}` },
      method: "POST",
    });

    expect(statusWithoutCookie.body).toEqual({
      authenticated: false,
      owner: completed.body.owner,
      setupComplete: true,
    });
    expect(statusWithSetupCookieBody).toEqual({
      authenticated: true,
      owner: completed.body.owner,
      session: { expiresAt: expect.any(String) },
      setupComplete: true,
    });
    expect(tokenOnlyLogin.status).toBe(401);
    expect(tokenOnlyLogin.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-passkey"');
    expect(tokenOnlyLogin.headers.get("Set-Cookie")).toBeNull();
    expect(await tokenOnlyLogin.json()).toEqual({
      authenticated: false,
      error: "Passkey login is required.",
    });
  });

  it("requires owner setup before owner login", async () => {
    const rejected = await harness.fetch("/api/formless/session", {
      headers: { Authorization: `Bearer ${adminToken}` },
      method: "POST",
    });

    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({
      authenticated: false,
      error: "Owner setup must be complete before login.",
    });
  });

  it("returns method errors for known setup API paths", async () => {
    const status = await harness.fetch("/api/formless/setup", { method: "POST" });
    const complete = await harness.fetch("/api/formless/setup/complete", { method: "GET" });
    const session = await harness.fetch("/api/formless/session", { method: "PUT" });
    const logout = await harness.fetch("/api/formless/session/logout", { method: "GET" });

    expect(status.status).toBe(405);
    expect(status.headers.get("Allow")).toBe("GET");
    expect(complete.status).toBe(405);
    expect(complete.headers.get("Allow")).toBe("POST");
    expect(session.status).toBe(405);
    expect(session.headers.get("Allow")).toBe("GET, POST");
    expect(logout.status).toBe(405);
    expect(logout.headers.get("Allow")).toBe("POST");
  });
});

async function createSetupCapability(
  overrides: Partial<{ expiresAt: string; setupToken: string }> = {},
) {
  return postAdminJson<OwnerSetupCapabilityResponse>("/api/formless/setup/capability", {
    setupToken: overrides.setupToken ?? setupToken,
    expiresAt: overrides.expiresAt ?? futureExpiresAt,
  });
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postJson<T>(path: string, body: unknown, init: HarnessFetchInit = {}) {
  const headers = {
    ...(init.headers as Record<string, string> | undefined),
    "Content-Type": "application/json",
  };
  const response = await harness.fetch(path, {
    ...init,
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postAdminJson<T>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

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
