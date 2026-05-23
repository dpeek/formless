import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { AppInstallsResponse, CreateAppInstallResponse } from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type AppInstallFailureResponse = {
  code: string;
  error: string;
  field?: string;
};

const adminToken = "test-admin-token";

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

describe("instance app install API routes", () => {
  it("lists bundled packages and persists Site installs", async () => {
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "site",
      label: "Site",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(before.body.packages).toEqual([
      expect.objectContaining({
        defaultInstallId: "site",
        label: "Site",
        packageAppKey: "site",
      }),
    ]);
    expect(before.body.installs).toEqual([]);
    expect(created.response.status).toBe(201);
    expect(created.body.initialization).toEqual({
      installId: "site",
      packageAppKey: "site",
      seedRecordsKey: "site",
      sourceSchemaKey: "site",
    });
    expect(created.body.install).toMatchObject({
      adminRoute: "/apps/site",
      installId: "site",
      label: "Site",
      packageAppKey: "site",
      publicRoute: "/sites/site",
      schemaRoute: "/apps/site/schema",
      status: "installed",
    });
    expect(after.body.installs).toEqual(created.body.installs);
  });

  it("rejects duplicate and invalid Site installs without mutating existing installs", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    const duplicate = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Other Site",
    });
    const invalid = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "Site",
      label: "Bad Site",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: "duplicate-install-id",
      field: "installId",
    });
    expect(invalid.response.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: "invalid-install-id",
      field: "installId",
    });
    expect(after.body.installs.map((install) => install.installId)).toEqual(["personal"]);
  });

  it("requires instance write authorization for install creation when configured", async () => {
    const rejected = await harness.fetch("/api/formless/app-installs", {
      body: JSON.stringify({
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const accepted = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await rejected.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(accepted.response.status).toBe(201);
  });
});

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

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
