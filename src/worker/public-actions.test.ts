import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  BootstrapResponse,
  MutationResponse,
  PublicActionResponse,
  SitePageTreeResponse,
  StoredRecord,
} from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type DispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

const adminToken = "test-admin-token";
const turnstileSiteKey = "test-turnstile-site-key";
const turnstileSecret = "test-turnstile-secret";
const mappedHost = "subscribe.example.com";
const installId = "personal";

let harness: Harness;
let turnstileRequests: unknown[];
let turnstileResponse: Record<string, unknown>;

beforeAll(async () => {
  harness = await createPublicActionHarness({
    bindings: {
      FORMLESS_ADMIN_TOKEN: adminToken,
      FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
      FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
    },
    turnstileVerify: turnstileVerifyResponse,
  });
});

beforeEach(async () => {
  turnstileRequests = [];
  turnstileResponse = {
    success: true,
    challenge_ts: "2026-05-28T00:00:00.000Z",
    hostname: "example.com",
  };

  await resetSchemaApp("tasks");
  await resetSchemaApp("site");
  await resetInstalledApp("site", installId);
});

afterAll(async () => {
  await harness.dispose();
});

describe("public action runtime", () => {
  it("executes schema-key public subscribe actions without opening generic writes", async () => {
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const mutation = await harness.fetch("/api/site/mutations", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const action = await harness.fetch("/api/site/actions", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const unavailable = await postPublicAction(
      "/api/tasks/public/actions/clearCompletedTasks",
      publicSubscribeBody({ idempotencyKey: "not-public" }),
    );
    const accepted = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({ idempotencyKey: "schema-key-exec" }),
    );
    const body = (await accepted.json()) as PublicActionResponse;
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const records = contactSubscriptionRecords(after.records);

    expect(mutation.status).toBe(401);
    expect(action.status).toBe(401);
    expect(unavailable.status).toBe(404);
    expect(accepted.status).toBe(200);
    expect(body).toEqual({
      actionId: expect.stringMatching(/^public:subscribe:/),
      cursor: after.cursor,
      status: "accepted",
    });
    expect(JSON.stringify(body)).not.toContain(turnstileSecret);
    expect(JSON.stringify(body)).not.toContain("ada@example.com");
    expect(after.records.length).toBe(before.records.length + 4);
    expect(records.contacts).toHaveLength(1);
    expect(records.emailAddresses).toHaveLength(1);
    expect(records.audiences).toHaveLength(1);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.contacts[0]?.values).toEqual({
      label: "ada@example.com",
    });
    expect(records.emailAddresses[0]?.values).toEqual({
      contact: records.contacts[0]?.id,
      address: "ada@example.com",
      normalizedAddress: "ada@example.com",
    });
    expect(records.audiences[0]?.values).toEqual({
      key: "default",
      label: "Default audience",
    });
    expect(records.subscriptions[0]?.values).toMatchObject({
      emailAddress: records.emailAddresses[0]?.id,
      audience: records.audiences[0]?.id,
      status: "subscribed",
      sourceKind: "publicAction",
      sourceTargetKind: "schemaKey",
      sourcePackageAppKey: "site",
      sourceSchemaKey: "site",
      sourceApiRoutePrefix: "/api/site",
      sourceActionName: "subscribe",
      sourceHost: "example.com",
      sourcePath: "/api/site/public/actions/subscribe",
      sourceSiteBlockId: "rec_site_subscribe_form",
    });
    expect(records.subscriptions[0]?.values.consentedAt).toEqual(expect.any(String));
    expect(records.subscriptions[0]?.values).not.toHaveProperty("sourceIp");
    expect(records.subscriptions[0]?.values).not.toHaveProperty("sourceUserAgent");
    expect(turnstileRequests).toEqual([
      {
        secret: turnstileSecret,
        response: "token-ok",
        idempotency_key: "schema-key-exec",
      },
    ]);
  });

  it("supports installed app public action routes with accepted replay idempotency", async () => {
    const first = await postPublicAction(
      `/api/app-installs/site/${installId}/public/actions/subscribe`,
      publicSubscribeBody({ idempotencyKey: "installed-replay" }),
    );
    const replay = await postPublicAction(
      `/api/app-installs/site/${installId}/public/actions/subscribe`,
      publicSubscribeBody({ idempotencyKey: "installed-replay", token: "token-replay" }),
    );
    const firstBody = (await first.json()) as PublicActionResponse;
    const replayBody = (await replay.json()) as PublicActionResponse;
    const after = await getJson<BootstrapResponse>(`/api/app-installs/site/${installId}/bootstrap`);
    const records = contactSubscriptionRecords(after.records);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replayBody).toEqual(firstBody);
    expect(records.emailAddresses).toHaveLength(1);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values).toMatchObject({
      sourceTargetKind: "appInstall",
      sourceInstallId: installId,
      sourceApiRoutePrefix: `/api/app-installs/site/${installId}`,
    });
    expect(turnstileRequests).toEqual([
      {
        secret: turnstileSecret,
        response: "token-ok",
        idempotency_key: "installed-replay",
      },
    ]);
  });

  it("rejects undeclared public input before challenge verification or idempotency reservation", async () => {
    const rejected = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({
        idempotencyKey: "input-retry",
        input: { email: "ada@example.com", admin: true },
      }),
    );
    const accepted = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({ idempotencyKey: "input-retry" }),
    );

    expect(rejected.status).toBe(400);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: 'Public action input includes undeclared field "admin".',
    });
    expect(accepted.status).toBe(200);
    expect(turnstileRequests).toHaveLength(1);
  });

  it("fails closed when Turnstile verification fails", async () => {
    turnstileResponse = { success: false, "error-codes": ["invalid-input-response"] };

    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const response = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({ idempotencyKey: "failed-turnstile" }),
    );
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toEqual({
      error: "Public action challenge failed.",
    });
    expect(after.records).toEqual(before.records);
  });

  it("fails closed when Turnstile secret configuration is missing", async () => {
    const missingConfigRequests: unknown[] = [];
    const missingConfigHarness = await createPublicActionHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      turnstileVerify: async (request) => {
        missingConfigRequests.push(await request.json());

        return Response.json({ success: true });
      },
    });

    try {
      const response = await postPublicAction(
        "/api/site/public/actions/subscribe",
        publicSubscribeBody({ idempotencyKey: "missing-config" }),
        missingConfigHarness,
      );

      expect(response.status).toBe(503);
      expect((await response.json()) as { error: string }).toEqual({
        error: "Public action challenge is unavailable.",
      });
      expect(missingConfigRequests).toEqual([]);
    } finally {
      await missingConfigHarness.dispose();
    }
  });

  it("projects configured Turnstile site key without exposing the secret", async () => {
    const block = await postAdminJson<MutationResponse>("/api/site/mutations", {
      mutationId: "mutation-create-configured-subscribe-form",
      entity: "block",
      op: "create",
      values: {
        type: "subscribeForm",
        label: "Join the list",
        actionName: "subscribe",
        buttonLabel: "Join",
      },
    });
    await postAdminJson<MutationResponse>("/api/site/mutations", {
      mutationId: "mutation-place-configured-subscribe-form",
      entity: "block-placement",
      op: "create",
      values: {
        parent: "rec_site_starter_page_home",
        block: block.record.id,
        order: 4500,
        label: "Join the list",
      },
    });

    const tree = await getJson<SitePageTreeResponse>("/api/site/tree/home");
    const subscribePlacement = tree.page.placements.find(
      (placement) => placement.block.id === block.record.id,
    );

    expect(subscribePlacement?.block.publicAction).toEqual({
      actionName: "subscribe",
      route: "/api/site/public/actions/subscribe",
      challenge: {
        kind: "turnstile",
        siteKey: turnstileSiteKey,
      },
    });
    expect(JSON.stringify(tree)).not.toContain(turnstileSecret);
  });

  it("keeps one email address and one subscription for duplicate subscribes", async () => {
    const first = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({
        idempotencyKey: "duplicate-first",
        input: { email: "Ada@Example.com" },
      }),
    );
    const duplicate = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({
        idempotencyKey: "duplicate-second",
        input: { email: "ada@example.com" },
      }),
    );
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const records = contactSubscriptionRecords(after.records);

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(records.emailAddresses).toHaveLength(1);
    expect(records.emailAddresses[0]?.values.normalizedAddress).toBe("ada@example.com");
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values.status).toBe("subscribed");
  });

  it("resubscribes an existing unsubscribed membership", async () => {
    const first = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({ idempotencyKey: "resubscribe-first" }),
    );
    const beforePatch = contactSubscriptionRecords(
      (await getJson<BootstrapResponse>("/api/site/bootstrap")).records,
    );
    const subscription = beforePatch.subscriptions[0];

    if (!subscription) {
      throw new Error("Expected subscription record.");
    }

    await patchSubscriptionStatus(subscription.id, "unsubscribed");

    const resubscribe = await postPublicAction(
      "/api/site/public/actions/subscribe",
      publicSubscribeBody({ idempotencyKey: "resubscribe-second" }),
    );
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const records = contactSubscriptionRecords(after.records);

    expect(first.status).toBe(200);
    expect(resubscribe.status).toBe(200);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.id).toBe(subscription.id);
    expect(records.subscriptions[0]?.values.status).toBe("subscribed");
  });

  it("routes mapped public Site host public actions without exposing admin shell or schema-key APIs", async () => {
    const mappedHarness = await createPublicActionHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_RUNTIME_PROFILE: "instance",
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: turnstileVerifyResponse,
    });

    try {
      await postAdminJson(
        "/api/formless/app-installs",
        {
          packageAppKey: "site",
          installId,
          label: "Personal",
        },
        mappedHarness,
      );
      await postAdminJson(
        "/api/formless/domain-mappings",
        {
          host: mappedHost,
          surface: "site",
          installId,
        },
        mappedHarness,
      );

      const accepted = await fetchHost(
        mappedHarness,
        mappedHost,
        `/api/app-installs/site/${installId}/public/actions/subscribe`,
        {
          body: JSON.stringify(publicSubscribeBody({ idempotencyKey: "mapped-host" })),
          headers: {
            "Content-Type": "application/json",
            Origin: `http://${mappedHost}`,
          },
          method: "POST",
        },
      );
      const adminShell = await fetchHost(mappedHarness, mappedHost, `/apps/${installId}`, {
        headers: { Accept: "text/html" },
      });
      const schemaKeyApi = await fetchHost(
        mappedHarness,
        mappedHost,
        "/api/site/public/actions/subscribe",
        {
          body: JSON.stringify(publicSubscribeBody({ idempotencyKey: "mapped-schema-key" })),
          headers: {
            "Content-Type": "application/json",
            Origin: `http://${mappedHost}`,
          },
          method: "POST",
        },
      );

      expect(accepted.status).toBe(200);
      expect(adminShell.status).toBe(404);
      expect(schemaKeyApi.status).toBe(404);
    } finally {
      await mappedHarness.dispose();
    }
  });
});

async function createPublicActionHarness(input: {
  bindings: Record<string, string>;
  turnstileVerify: (request: Request) => Promise<Response> | Response;
}) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: input.bindings,
      compatibilityDate: "2026-04-28",
      r2Buckets: ["FORMLESS_MEDIA"],
      serviceBindings: {
        FORMLESS_TURNSTILE_SITEVERIFY: input.turnstileVerify,
      },
    },
  );
}

async function turnstileVerifyResponse(request: Request) {
  turnstileRequests.push(await request.json());

  return Response.json(turnstileResponse);
}

async function resetSchemaApp(schemaKey: "tasks" | "site") {
  const response = await harness.fetch(`/api/${schemaKey}/reset/seed`, {
    body: "{}",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function resetInstalledApp(packageAppKey: "site", appInstallId: string) {
  const response = await harness.fetch(
    `/api/app-installs/${packageAppKey}/${appInstallId}/reset/seed`,
    {
      body: "{}",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

function publicSubscribeBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  token?: string;
}) {
  return {
    input: input.input ?? { email: "ada@example.com" },
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: "rec_site_subscribe_form" },
    idempotencyKey: input.idempotencyKey,
  };
}

function contactSubscriptionRecords(records: StoredRecord[]) {
  return {
    contacts: records.filter((record) => record.entity === "contact"),
    emailAddresses: records.filter((record) => record.entity === "email-address"),
    audiences: records.filter((record) => record.entity === "audience"),
    subscriptions: records.filter((record) => record.entity === "subscription"),
  };
}

async function patchSubscriptionStatus(recordId: string, status: "subscribed" | "unsubscribed") {
  return postAdminJson<MutationResponse>("/api/site/mutations", {
    mutationId: `test-subscription-status-${status}`,
    entity: "subscription",
    op: "patch",
    recordId,
    values: { status },
  });
}

async function getJson<T>(path: string, target: Harness = harness) {
  const response = await target.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAdminJson<T = unknown>(path: string, body: unknown, target: Harness = harness) {
  const response = await target.fetch(path, {
    body: JSON.stringify(body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect([200, 201]).toContain(response.status);

  return (await response.json()) as T;
}

function postPublicAction(path: string, body: unknown, target: Harness = harness) {
  return target.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://example.com",
    },
    method: "POST",
  });
}

function fetchHost(target: Harness, host: string, path: string, init?: DispatchFetchInit) {
  return target.mf.dispatchFetch(`http://${host}${path}`, init);
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}
