import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AppSchema,
  EntityOperationSchema,
  RecordPlanStepSchema,
} from "@dpeek/formless-schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { StoredRecord } from "@dpeek/formless-storage";
import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import type {
  BootstrapResponse,
  ChangeRow,
  PublicOperationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
} from "../shared/protocol.ts";
import type {
  EmailDeliveryScheduleRequest,
  EmailDeliveryScheduleResponse,
} from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import { recordOperationRequest, operationWriteRequest } from "../test/authority-write.ts";
import {
  emailStylePublicIntakeFormBlockId,
  emailStylePublicIntakeFormBlockValues,
  emailStylePublicIntakeInput,
  emailStylePublicIntakeOperationKey,
  schemaWithEmailStylePublicIntake,
} from "../test/public-intake-schema.ts";
import { BadRequestError } from "./errors.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { selectPublicOperationRoute } from "./public-operations.ts";
import type { StoredOperationInvocation } from "./storage.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type DispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];
type PublicOperationHarnessState = {
  commandExecutionCount: number;
  changes: ChangeRow[];
  invocations: StoredOperationInvocation[];
  records: StoredRecord[];
};
type TurnstileVerifyRequest = {
  idempotency_key?: unknown;
  response?: unknown;
  secret?: unknown;
};

const adminToken = "test-admin-token";
const turnstileSiteKey = "test-turnstile-site-key";
const turnstileSecret = "test-turnstile-secret";
const mappedHost = "subscribe.example.com";
const installId = "personal";
const defaultSiteInstallId = "site";
const defaultCrmInstallId = "crm";
const recordPlanInstallId = "public-intake";

let harness: Harness;
let publicOperationHarness: Harness;
let publicOperationHarnessDir: string | undefined;
let publicOperationHarnessName: string;
let turnstileRequests: TurnstileVerifyRequest[];
let turnstileResponse: Record<string, unknown>;

beforeAll(async () => {
  harness = await createPublicOperationWorkerHarness({
    bindings: {
      FORMLESS_ADMIN_TOKEN: adminToken,
      FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
      FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
    },
    turnstileVerify: turnstileVerifyResponse,
  });
  publicOperationHarness = await createPublicOperationHarness({
    bindings: {
      FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
      FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
    },
    turnstileVerify: turnstileVerifyResponse,
  });
});

beforeEach(async () => {
  publicOperationHarnessName = randomUUID();
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
  await publicOperationHarness.dispose();

  if (publicOperationHarnessDir) {
    await rm(publicOperationHarnessDir, { recursive: true, force: true });
    publicOperationHarnessDir = undefined;
  }
});

describe("public operation runtime", () => {
  it("selects valid public operation route suffixes", () => {
    expect(
      selectPublicOperationRoute({
        method: "POST",
        path: "/public/operations/contact-message/submit",
      }),
    ).toEqual({
      entityName: "contact-message",
      operationName: "submit",
      path: "/public/operations/contact-message/submit",
    });

    expect(
      selectPublicOperationRoute({
        method: "POST",
        path: "/public/operations/contact%2Fmessage/submit%20request",
      }),
    ).toEqual({
      entityName: "contact/message",
      operationName: "submit request",
      path: "/public/operations/contact%2Fmessage/submit%20request",
    });
  });

  it("ignores non-public-operation routes", () => {
    expect(
      selectPublicOperationRoute({
        method: "GET",
        path: "/public/operations/contact-message/submit",
      }),
    ).toBeUndefined();
    expect(
      selectPublicOperationRoute({
        method: "POST",
        path: "/public/operations",
      }),
    ).toBeUndefined();
  });

  it("rejects invalid public operation route suffix shape", () => {
    expectBadPublicOperationRoute(
      "/public/operations/contact-message",
      "Public operation route must use /public/operations/:entity/:operation.",
    );
    expectBadPublicOperationRoute(
      "/public/operations/contact-message/submit/extra",
      "Public operation route must use /public/operations/:entity/:operation.",
    );
    expectBadPublicOperationRoute(
      "/public/operations//submit",
      "Public operation route must use /public/operations/:entity/:operation.",
    );
    expectBadPublicOperationRoute(
      "/public/operations/contact-message/",
      "Public operation route must use /public/operations/:entity/:operation.",
    );
  });

  it("rejects invalid public operation path encoding", () => {
    expectBadPublicOperationRoute(
      "/public/operations/contact-message/%",
      "Public operation route segments must be valid URL path text.",
    );
    expectBadPublicOperationRoute(
      "/public/operations/%E0%A4%A/submit",
      "Public operation route segments must be valid URL path text.",
    );
  });

  it("rejects empty decoded public operation entity and operation segments", () => {
    expectBadPublicOperationRoute(
      "/public/operations/%20/submit",
      "Public operation entity and operation must be non-empty.",
    );
    expectBadPublicOperationRoute(
      "/public/operations/contact-message/%20",
      "Public operation entity and operation must be non-empty.",
    );
  });

  it("executes schema-key public subscribe operations without opening generic writes", async () => {
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const retiredRecordWriteRoute = await harness.fetch("/api/site/mutations", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const retiredCommandRoute = await harness.fetch("/api/site/actions", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const unavailable = await postPublicOperation(
      "/api/tasks/public/operations/task/clearCompletedTasks",
      publicSubscribeBody({ idempotencyKey: "not-public" }),
    );
    const accepted = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "schema-key-exec" }),
    );
    const body = (await accepted.json()) as PublicOperationResponse;
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const records = contactSubscriptionRecords(after.records);

    expect(retiredRecordWriteRoute.status).toBe(401);
    expect(retiredCommandRoute.status).toBe(401);
    expect(unavailable.status).toBe(404);
    expect(accepted.status).toBe(200);
    expect(body).toMatchObject({
      invocationId: "operation:subscription.subscribe:schema-key-exec",
      operation: {
        entityName: "subscription",
        operationName: "subscribe",
        canonicalKey: "subscription.subscribe",
        kind: "command",
      },
      output: {
        type: "command",
        cursor: after.cursor,
      },
      status: "committed",
    });
    expect(body.output.affectedChangeIds).toHaveLength(4);
    expect(Object.keys(body.output).sort()).toEqual(["affectedChangeIds", "cursor", "type"]);
    expect(body.output).not.toHaveProperty("response");
    expect(JSON.stringify(body)).not.toContain("actionId");
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
      sourceKind: "publicOperation",
      sourceTargetKind: "schemaKey",
      sourcePackageAppKey: "site",
      sourceSchemaKey: "site",
      sourceApiRoutePrefix: "/api/site",
      sourceOperationKey: "subscription.subscribe",
      sourceHost: "example.com",
      sourcePath: "/api/site/public/operations/subscription/subscribe",
      sourceSiteBlockId: "rec_site_subscribe_form",
    });
    expect(records.subscriptions[0]?.values.consentedAt).toEqual(expect.any(String));
    expect(records.subscriptions[0]?.values).not.toHaveProperty("sourceIp");
    expect(records.subscriptions[0]?.values).not.toHaveProperty("sourceUserAgent");
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("uses operation policy for subscribe availability", async () => {
    await installSiteSchema(() => {});

    const accepted = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "operation-policy-only" }),
    );
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const records = contactSubscriptionRecords(after.records);

    expect(accepted.status).toBe(200);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values).toMatchObject({
      sourceKind: "publicOperation",
      sourceOperationKey: "subscription.subscribe",
    });

    await resetSchemaApp("site");
    await installSiteSchema((schema) => {
      delete schema.entities.subscription?.operations?.subscribe;
    });
    turnstileRequests = [];

    const rejected = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "unsupported-command-only" }),
    );
    const rejectedAfter = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(rejected.status).toBe(404);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: "Public operation is not available.",
    });
    expect(contactSubscriptionRecords(rejectedAfter.records).subscriptions).toHaveLength(0);

    await resetSchemaApp("site");
    const current = await getJson<SchemaResponse>("/api/site/schema");
    const schema = structuredClone(current.schema);
    const subscribe = schema.entities.subscription?.operations?.subscribe;

    if (!subscribe) {
      throw new Error("Expected subscribe operation.");
    }

    subscribe.effect = {
      type: "unsupportedPublicEffect",
      handler: "subscribe",
    } as never;
    const unsupportedEffect = await harness.fetch("/api/site/schema", {
      body: JSON.stringify(operationWriteRequest("/api/site/schema", { schema }).body),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    });

    const unsupportedEffectAfter = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(unsupportedEffect.status).toBe(400);
    expect((await unsupportedEffect.json()) as { error: string }).toEqual({
      error:
        'Entity operation "subscription.subscribe" effect has unsupported type "unsupportedPublicEffect".',
    });
    expect(contactSubscriptionRecords(unsupportedEffectAfter.records).subscriptions).toHaveLength(
      0,
    );
    expect(turnstileRequests).toEqual([]);
  });

  it("audits public operation policy rejections before challenge verification", async () => {
    const beforeState = await readPublicOperationHarnessState();
    const rejected = await postPublicOperationHarness("/api/site/public/operations/block/create", {
      input: {
        type: "content",
        label: "Private block",
      },
      proof: { turnstileToken: "policy-secret-token" },
      source: { siteBlockId: "rec_site_private_form" },
      idempotencyKey: "public-policy-rejected",
    });
    const rejectedAfter = await readPublicOperationHarnessState();

    expect(rejected.status).toBe(404);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: "Public operation is not available.",
    });
    expect(rejectedAfter.records).toEqual(beforeState.records);
    expect(rejectedAfter.changes).toEqual(beforeState.changes);
    expect(rejectedAfter.commandExecutionCount).toBe(0);
    expect(rejectedAfter.invocations).toHaveLength(1);
    expect(rejectedAfter.invocations[0]).toMatchObject({
      actorKind: "anonymous",
      affectedChangeIds: [],
      auditInput: {
        kind: "summary",
        summary: {
          fieldNames: ["label", "type"],
          type: "create",
          valuesType: "object",
        },
      },
      authDecision: "denied",
      errorMessage: "Public operation is not available.",
      idempotency: {
        key: "public-policy-rejected",
        source: "caller",
        writeIdentity: "operation:block.create:public-policy-rejected",
      },
      operationKey: "block.create",
      operationKind: "create",
      source: {
        host: "example.com",
        path: "/api/site/public/operations/block/create",
        protocol: "public",
        siteBlockId: "rec_site_private_form",
      },
      status: "rejected",
      statusHistory: [expect.objectContaining({ status: "rejected" })],
    });
    expect(rejectedAfter.invocations[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "rejected",
    ]);
    expect(rejectedAfter.invocations[0]?.output).toBeUndefined();
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain("policy-secret-token");
    expect(turnstileRequests).toEqual([]);
  });

  it("rejects unavailable public operations before challenge verification", async () => {
    const beforeState = await readPublicOperationHarnessState();
    const rejected = await postPublicOperationHarness(
      "/api/site/public/operations/contact-message/missing",
      publicContactMessageBody({
        idempotencyKey: "public-operation-unavailable",
        token: "unavailable-secret-token",
      }),
    );
    const rejectedAfter = await readPublicOperationHarnessState();

    expect(rejected.status).toBe(404);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: "Public operation is not available.",
    });
    expect(rejectedAfter.records).toEqual(beforeState.records);
    expect(rejectedAfter.changes).toEqual(beforeState.changes);
    expect(rejectedAfter.commandExecutionCount).toBe(0);
    expect(rejectedAfter.invocations).toEqual(beforeState.invocations);
    expect(turnstileRequests).toEqual([]);
  });

  it("executes subscribe through operation-native command materialization", async () => {
    const accepted = await postPublicOperationHarness(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "operation-native-subscribe" }),
    );
    const body = (await accepted.json()) as PublicOperationResponse;
    const state = await readPublicOperationHarnessState();
    const records = contactSubscriptionRecords(state.records);

    expect(accepted.status).toBe(200);
    expect(body.output.type).toBe("command");
    expect(body.output).not.toHaveProperty("response");
    expect(state.commandExecutionCount).toBe(0);
    expect(state.invocations).toHaveLength(1);
    expect(state.invocations[0]).toMatchObject({
      affectedChangeIds: body.output.affectedChangeIds,
      operationKey: "subscription.subscribe",
      operationKind: "command",
      source: {
        host: "example.com",
        path: "/api/site/public/operations/subscription/subscribe",
        protocol: "public",
        siteBlockId: "rec_site_subscribe_form",
      },
      status: "committed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "committed" }),
      ],
    });
    expect(state.invocations[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
    ]);
    expect(state.invocations[0]?.output).toMatchObject({
      type: "command",
      affectedChangeIds: body.output.affectedChangeIds,
      cursor: body.output.cursor,
    });
    expect(JSON.stringify(state.invocations[0]?.output)).not.toContain("actionId");
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values).toMatchObject({
      sourceKind: "publicOperation",
      sourceHost: "example.com",
      sourceOperationKey: "subscription.subscribe",
      sourcePath: "/api/site/public/operations/subscription/subscribe",
      sourceSiteBlockId: "rec_site_subscribe_form",
    });
  });

  it("stores public-safe installed CRM subscribe invocation facts", async () => {
    const crmRoute = `/api/app-installs/crm/${defaultCrmInstallId}/public/operations/subscription/subscribe`;
    const accepted = await postPublicOperationHarness(
      crmRoute,
      publicSubscribeBody({
        idempotencyKey: "crm-invocation-safe",
        input: { email: "Crm.Audit@Example.com" },
        token: "crm-audit-token",
      }),
    );
    const body = (await accepted.json()) as PublicOperationResponse;
    const state = await readPublicOperationHarnessState();
    const records = contactSubscriptionRecords(state.records);
    const emailAddresses = records.emailAddresses.filter(
      (record) => record.values.normalizedAddress === "crm.audit@example.com",
    );

    expect(accepted.status).toBe(200);
    expect(body).toMatchObject({
      invocationId: "operation:subscription.subscribe:crm-invocation-safe",
      operation: {
        entityName: "subscription",
        operationName: "subscribe",
        canonicalKey: "subscription.subscribe",
        kind: "command",
      },
      status: "committed",
    });
    expect(body.output.type).toBe("command");
    expect(state.commandExecutionCount).toBe(0);
    expect(emailAddresses).toHaveLength(1);
    expect(state.invocations).toHaveLength(1);
    expect(state.invocations[0]).toMatchObject({
      affectedChangeIds: body.output.affectedChangeIds,
      appStorageIdentity: {
        kind: "appInstall",
        packageAppKey: "crm",
        sourceSchemaKey: "crm",
        installId: defaultCrmInstallId,
        apiRoutePrefix: `/api/app-installs/crm/${defaultCrmInstallId}`,
      },
      auditInput: {
        kind: "summary",
        summary: {
          inputFields: ["email"],
          inputType: "object",
          type: "command",
        },
      },
      authDecision: "allowed",
      idempotency: {
        key: "crm-invocation-safe",
        source: "caller",
        writeIdentity: "operation:subscription.subscribe:crm-invocation-safe",
      },
      operationKey: "subscription.subscribe",
      operationKind: "command",
      source: {
        host: "example.com",
        path: crmRoute,
        protocol: "public",
        siteBlockId: "rec_site_subscribe_form",
      },
      status: "committed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "committed" }),
      ],
    });
    expect(state.invocations[0]?.output).toMatchObject({
      type: "command",
      affectedChangeIds: body.output.affectedChangeIds,
      cursor: body.output.cursor,
    });
    expect(JSON.stringify(body)).not.toContain("Crm.Audit@Example.com");
    expect(JSON.stringify(body)).not.toContain("crm.audit@example.com");
    expect(JSON.stringify(body)).not.toContain("crm-audit-token");
    expect(JSON.stringify(body)).not.toContain("turnstileToken");
    expect(JSON.stringify(body)).not.toContain(turnstileSecret);
    expect(JSON.stringify(body)).not.toContain("providerMessageId");
    expect(JSON.stringify(state.invocations[0])).not.toContain("Crm.Audit@Example.com");
    expect(JSON.stringify(state.invocations[0])).not.toContain("crm.audit@example.com");
    expect(JSON.stringify(state.invocations[0])).not.toContain("crm-audit-token");
    expect(JSON.stringify(state.invocations[0])).not.toContain("turnstileToken");
    expect(JSON.stringify(state.invocations[0])).not.toContain(turnstileSecret);
    expect(JSON.stringify(state.invocations[0])).not.toContain("providerMessageId");
  });

  it("supports installed app public operation routes with accepted replay idempotency", async () => {
    const first = await postPublicOperation(
      `/api/app-installs/site/${installId}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "installed-replay" }),
    );
    const replay = await postPublicOperation(
      `/api/app-installs/site/${installId}/public/operations/subscription/subscribe`,
      publicSubscribeBody({ idempotencyKey: "installed-replay", token: "token-replay" }),
    );
    const firstBody = (await first.json()) as PublicOperationResponse;
    const replayBody = (await replay.json()) as PublicOperationResponse;
    const after = await getJson<BootstrapResponse>(`/api/app-installs/site/${installId}/bootstrap`);
    const records = contactSubscriptionRecords(after.records);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(firstBody.status).toBe("committed");
    expect(replayBody).toEqual({ ...firstBody, status: "replayed" });
    expect(records.emailAddresses).toHaveLength(1);
    expect(records.subscriptions).toHaveLength(1);
    expect(records.subscriptions[0]?.values).toMatchObject({
      sourceTargetKind: "appInstall",
      sourceInstallId: installId,
      sourceApiRoutePrefix: `/api/app-installs/site/${installId}`,
    });
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("executes CRM-targeted Site subscribe forms in CRM install storage", async () => {
    const crmApiPrefix = `/api/app-installs/crm/${defaultCrmInstallId}`;
    const crmRoute = `${crmApiPrefix}/public/operations/subscription/subscribe`;

    await resetInstalledApp("crm", defaultCrmInstallId);

    const initialSiteTree = await getJson<SitePageTreeResponse>("/api/site/tree/home");
    const siteSubscribeBlock = await postAdminRecordOperation({
      idempotencyKey: "crm-installed-subscribe-site-form-block",
      entity: "block",
      operationName: "create",
      input: {
        type: "subscribeForm",
        label: "Join the CRM isolation list",
        operationName: "subscribe",
        operationTargetKind: "appInstall",
        operationTargetPackageAppKey: "crm",
        operationTargetInstallId: defaultCrmInstallId,
        buttonLabel: "Join",
      },
    });
    await postAdminRecordOperation({
      idempotencyKey: "crm-installed-subscribe-site-form-placement",
      entity: "block-placement",
      operationName: "create",
      input: {
        parent: initialSiteTree.page.id,
        block: siteSubscribeBlock.record.id,
        order: 4500,
        label: "Join the CRM isolation list",
      },
    });

    const crmBefore = await getJson<BootstrapResponse>(`${crmApiPrefix}/bootstrap`);
    const siteBefore = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const siteTree = await getJson<SitePageTreeResponse>("/api/site/tree/home");
    const siteSubscribeForm = siteTree.page.placements.find(
      (placement) => placement.block.id === siteSubscribeBlock.record.id,
    );
    const projectedOperation = siteSubscribeForm?.block.publicOperation;

    expect(projectedOperation).toMatchObject({
      entityName: "subscription",
      operationName: "subscribe",
      canonicalKey: "subscription.subscribe",
      target: {
        kind: "appInstall",
        packageAppKey: "crm",
        installId: defaultCrmInstallId,
        apiRoutePrefix: crmApiPrefix,
      },
      route: crmRoute,
    });

    if (!projectedOperation) {
      throw new Error("Expected CRM-targeted subscribe form operation.");
    }

    const accepted = await postPublicOperation(
      projectedOperation.route,
      publicSubscribeBody({
        idempotencyKey: "crm-targeted-site-subscribe",
        input: { email: "Crm.Visitor@Example.com" },
        sourceBlockId: siteSubscribeBlock.record.id,
      }),
    );
    const body = (await accepted.json()) as PublicOperationResponse;
    const crmAfter = await getJson<BootstrapResponse>(`${crmApiPrefix}/bootstrap`);
    const siteAfter = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const beforeRecords = contactSubscriptionRecords(crmBefore.records);
    const records = contactSubscriptionRecords(crmAfter.records);
    const contacts = records.contacts.filter(
      (record) => record.values.label === "crm.visitor@example.com",
    );
    const emailAddresses = records.emailAddresses.filter(
      (record) => record.values.normalizedAddress === "crm.visitor@example.com",
    );
    const defaultAudiences = records.audiences.filter((record) => record.values.key === "default");
    const subscriptions = records.subscriptions.filter(
      (record) =>
        record.values.emailAddress === emailAddresses[0]?.id &&
        record.values.audience === defaultAudiences[0]?.id,
    );
    expect(accepted.status).toBe(200);
    expect(body).toMatchObject({
      invocationId: "operation:subscription.subscribe:crm-targeted-site-subscribe",
      operation: {
        entityName: "subscription",
        operationName: "subscribe",
        canonicalKey: "subscription.subscribe",
        kind: "command",
      },
      output: {
        type: "command",
        cursor: crmAfter.cursor,
      },
      status: "committed",
    });
    expect(body.output.affectedChangeIds).toHaveLength(4);
    expect(Object.keys(body.output).sort()).toEqual(["affectedChangeIds", "cursor", "type"]);
    expect(body.output).not.toHaveProperty("response");
    expect(JSON.stringify(body)).not.toContain("Crm.Visitor@Example.com");
    expect(JSON.stringify(body)).not.toContain("crm.visitor@example.com");
    expect(JSON.stringify(body)).not.toContain("token-ok");
    expect(JSON.stringify(body)).not.toContain("turnstileToken");
    expect(JSON.stringify(body)).not.toContain(turnstileSecret);
    expect(JSON.stringify(body)).not.toContain("providerMessageId");
    expect(crmAfter.records.length).toBe(crmBefore.records.length + 4);
    expect(records.contacts).toHaveLength(beforeRecords.contacts.length + 1);
    expect(records.emailAddresses).toHaveLength(beforeRecords.emailAddresses.length + 1);
    expect(records.audiences).toHaveLength(beforeRecords.audiences.length + 1);
    expect(records.subscriptions).toHaveLength(beforeRecords.subscriptions.length + 1);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.values).toMatchObject({
      label: "crm.visitor@example.com",
      lifecycle: "lead",
      source: "owner",
    });
    expect(emailAddresses).toHaveLength(1);
    expect(emailAddresses[0]?.values).toMatchObject({
      contact: contacts[0]?.id,
      address: "Crm.Visitor@Example.com",
      normalizedAddress: "crm.visitor@example.com",
      status: "active",
      primary: true,
    });
    expect(defaultAudiences).toHaveLength(1);
    expect(defaultAudiences[0]?.values).toMatchObject({
      key: "default",
      label: "Default audience",
      status: "active",
    });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.values).toMatchObject({
      emailAddress: emailAddresses[0]?.id,
      audience: defaultAudiences[0]?.id,
      status: "subscribed",
      sourceKind: "publicOperation",
      sourceTargetKind: "appInstall",
      sourcePackageAppKey: "crm",
      sourceSchemaKey: "crm",
      sourceInstallId: defaultCrmInstallId,
      sourceApiRoutePrefix: crmApiPrefix,
      sourceOperationKey: "subscription.subscribe",
      sourceHost: "example.com",
      sourcePath: crmRoute,
      sourceSiteBlockId: siteSubscribeBlock.record.id,
    });
    expect(subscriptions[0]?.values.consentedAt).toEqual(expect.any(String));
    expect(subscriptions[0]?.values).not.toHaveProperty("sourceIp");
    expect(subscriptions[0]?.values).not.toHaveProperty("sourceUserAgent");
    expect(siteAfter.records).toEqual(siteBefore.records);
    expect(contactSubscriptionRecords(siteAfter.records)).toEqual(
      contactSubscriptionRecords(siteBefore.records),
    );
    expect(projectedOperation).not.toHaveProperty("fields");
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("keeps installed CRM duplicate subscribe and resubscribe idempotent by membership", async () => {
    const crmApiPrefix = `/api/app-installs/crm/${defaultCrmInstallId}`;
    const crmRoute = `${crmApiPrefix}/public/operations/subscription/subscribe`;

    await resetInstalledApp("crm", defaultCrmInstallId);

    const first = await postPublicOperation(
      crmRoute,
      publicSubscribeBody({
        idempotencyKey: "crm-duplicate-first",
        input: { email: "Crm.Duplicate@Example.com" },
      }),
    );
    const duplicate = await postPublicOperation(
      crmRoute,
      publicSubscribeBody({
        idempotencyKey: "crm-duplicate-second",
        input: { email: "crm.duplicate@example.com" },
      }),
    );
    const afterDuplicate = await getJson<BootstrapResponse>(`${crmApiPrefix}/bootstrap`);
    const duplicateRecords = contactSubscriptionRecords(afterDuplicate.records);
    const emailAddresses = duplicateRecords.emailAddresses.filter(
      (record) => record.values.normalizedAddress === "crm.duplicate@example.com",
    );
    const defaultAudience = duplicateRecords.audiences.find(
      (record) => record.values.key === "default",
    );
    const duplicateSubscriptions = duplicateRecords.subscriptions.filter(
      (record) =>
        record.values.emailAddress === emailAddresses[0]?.id &&
        record.values.audience === defaultAudience?.id,
    );
    const subscription = duplicateSubscriptions[0];

    if (!subscription) {
      throw new Error("Expected installed CRM subscription record.");
    }

    await patchSubscriptionStatus(
      subscription.id,
      "unsubscribed",
      harness,
      `/api/app-installs/crm/${defaultCrmInstallId}`,
    );

    const resubscribe = await postPublicOperation(
      crmRoute,
      publicSubscribeBody({
        idempotencyKey: "crm-resubscribe",
        input: { email: "crm.duplicate@example.com" },
        sourceBlockId: "rec_site_subscribe_form_resubscribe",
      }),
    );
    const afterResubscribe = await getJson<BootstrapResponse>(`${crmApiPrefix}/bootstrap`);
    const resubscribeRecords = contactSubscriptionRecords(afterResubscribe.records);
    const resubscribeEmailAddresses = resubscribeRecords.emailAddresses.filter(
      (record) => record.values.normalizedAddress === "crm.duplicate@example.com",
    );
    const resubscribeDefaultAudience = resubscribeRecords.audiences.find(
      (record) => record.values.key === "default",
    );
    const resubscribeSubscriptions = resubscribeRecords.subscriptions.filter(
      (record) =>
        record.values.emailAddress === resubscribeEmailAddresses[0]?.id &&
        record.values.audience === resubscribeDefaultAudience?.id,
    );

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(emailAddresses).toHaveLength(1);
    expect(duplicateSubscriptions).toHaveLength(1);
    expect(duplicateSubscriptions[0]?.values.status).toBe("subscribed");
    expect(resubscribe.status).toBe(200);
    expect(resubscribeEmailAddresses).toHaveLength(1);
    expect(resubscribeSubscriptions).toHaveLength(1);
    expect(resubscribeSubscriptions[0]?.id).toBe(subscription.id);
    expect(resubscribeSubscriptions[0]?.values).toMatchObject({
      status: "subscribed",
      sourceKind: "publicOperation",
      sourceTargetKind: "appInstall",
      sourcePackageAppKey: "crm",
      sourceSchemaKey: "crm",
      sourceInstallId: defaultCrmInstallId,
      sourceApiRoutePrefix: crmApiPrefix,
      sourceOperationKey: "subscription.subscribe",
      sourcePath: crmRoute,
      sourceSiteBlockId: "rec_site_subscribe_form_resubscribe",
    });
  });

  it("executes schema-key public create operations with create-shaped output", async () => {
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const accepted = await postPublicOperation(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-exec" }),
    );
    const body = (await accepted.json()) as PublicOperationResponse;
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const messages = contactMessageRecords(after.records);

    expect(accepted.status).toBe(200);
    expect(body).toMatchObject({
      invocationId: "operation:contact-message.submit:contact-create-exec",
      operation: {
        entityName: "contact-message",
        operationName: "submit",
        canonicalKey: "contact-message.submit",
        kind: "create",
      },
      output: {
        type: "create",
        cursor: after.cursor,
      },
      status: "committed",
    });
    if (body.output.type !== "create") {
      throw new Error("Expected create output.");
    }
    expect(body.output.affectedChangeIds).toHaveLength(1);
    expect(Object.keys(body.output).sort()).toEqual([
      "affectedChangeIds",
      "changes",
      "cursor",
      "record",
      "type",
    ]);
    expect(body.output.record).toEqual(messages[0]);
    expect(body.output.record.values).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    });
    expect(after.records.length).toBe(before.records.length + 1);
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(turnstileSecret);
    expect(JSON.stringify(body)).not.toContain("token-ok");
    expect(JSON.stringify(body)).not.toContain("turnstileToken");
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("keeps configured contact notification scheduling out of public create responses", async () => {
    const emailHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: turnstileVerifyResponse,
    });

    try {
      await resetSchemaApp("site", emailHarness);
      const emailConfig = await configureContactNotificationEmail(emailHarness);

      const first = await postPublicOperation(
        "/api/site/public/operations/contact-message/submit",
        publicContactMessageBody({ idempotencyKey: "contact-create-email-notify" }),
        emailHarness,
      );
      const replay = await postPublicOperation(
        "/api/site/public/operations/contact-message/submit",
        publicContactMessageBody({
          idempotencyKey: "contact-create-email-notify",
          token: "token-replay",
        }),
        emailHarness,
      );
      const firstBody = (await first.json()) as PublicOperationResponse;
      const replayBody = (await replay.json()) as PublicOperationResponse;
      const after = await getJson<BootstrapResponse>("/api/site/bootstrap", emailHarness);

      expect(first.status).toBe(200);
      expect(replay.status).toBe(200);
      expect(firstBody.status).toBe("committed");
      expect(replayBody).toEqual({ ...firstBody, status: "replayed" });
      expect(contactMessageRecords(after.records)).toHaveLength(1);
      if (firstBody.output.type !== "create") {
        throw new Error("Expected create output.");
      }
      const deliveryReplay = await postEmailDeliveryScheduleReplay(
        {
          canonicalOrigin: "https://www.example.com",
          idempotencyKey: contactNotificationIdempotencyKey(
            firstBody.invocationId,
            "contact-create-email-notify",
          ),
          message: {
            subject: "Replay probe",
            text: "Replay probe",
          },
          messageKind: "site-contact-notification",
          recipients: [{ address: "owner@example.com", displayName: "Site contact" }],
          replyTo: { address: "ada@example.com", displayName: "Ada Lovelace" },
          sender: { id: emailConfig.sender.id },
          source: {
            operationId: firstBody.invocationId,
            recordId: firstBody.output.record.id,
            storageIdentity: "site",
          },
        },
        emailHarness,
      );

      expect(deliveryReplay).toMatchObject({
        replayed: true,
        delivery: {
          attemptCount: 0,
          messageKind: "site-contact-notification",
          sourceOperationId: firstBody.invocationId,
          sourceRecordId: firstBody.output.record.id,
          sourceStorageIdentity: "site",
          status: "pending",
        },
      });
      expect(deliveryReplay.delivery).not.toHaveProperty("providerMessageId");
      expect(deliveryReplay.delivery).not.toHaveProperty("latestError");
      expect(JSON.stringify(firstBody)).not.toContain("owner@example.com");
      expect(JSON.stringify(firstBody)).not.toContain("contact@mail.example.com");
      expect(JSON.stringify(firstBody)).not.toContain("email.delivery.send");
      expect(JSON.stringify(firstBody)).not.toContain("email_delivery_");
      expect(JSON.stringify(firstBody)).not.toContain("providerMessageId");
      expect(JSON.stringify(firstBody)).not.toContain("latestError");
      expect(JSON.stringify(replayBody)).not.toContain("providerMessageId");
      expect(JSON.stringify(replayBody)).not.toContain("token-replay");
      expectTurnstileRequests(turnstileRequests, [
        {
          secret: turnstileSecret,
          response: "token-ok",
        },
      ]);
    } finally {
      await emailHarness.dispose();
    }
  });

  it("commits contact messages without provider sends when contact email settings are missing", async () => {
    const missingEmailConfigHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: turnstileVerifyResponse,
    });

    try {
      await resetSchemaApp("site", missingEmailConfigHarness);

      const accepted = await postPublicOperation(
        "/api/site/public/operations/contact-message/submit",
        publicContactMessageBody({ idempotencyKey: "contact-create-email-missing" }),
        missingEmailConfigHarness,
      );
      const body = (await accepted.json()) as PublicOperationResponse;
      const after = await getJson<BootstrapResponse>(
        "/api/site/bootstrap",
        missingEmailConfigHarness,
      );

      expect(accepted.status).toBe(200);
      expect(body).toMatchObject({
        operation: {
          entityName: "contact-message",
          operationName: "submit",
          kind: "create",
        },
        status: "committed",
      });
      expect(contactMessageRecords(after.records)).toHaveLength(1);
      expect(JSON.stringify(body)).not.toContain("providerMessageId");
    } finally {
      await missingEmailConfigHarness.dispose();
    }
  });

  it("keeps queue handoff failures out of committed public operation responses", async () => {
    const missingQueueHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      emailDeliveryQueue: "missing",
      turnstileVerify: turnstileVerifyResponse,
    });

    try {
      await resetSchemaApp("site", missingQueueHarness);
      await configureContactNotificationEmail(missingQueueHarness);

      const accepted = await postPublicOperation(
        "/api/site/public/operations/contact-message/submit",
        publicContactMessageBody({ idempotencyKey: "contact-create-email-queue-missing" }),
        missingQueueHarness,
      );
      const body = (await accepted.json()) as PublicOperationResponse;
      const after = await getJson<BootstrapResponse>("/api/site/bootstrap", missingQueueHarness);

      expect(accepted.status).toBe(200);
      expect(body).toMatchObject({
        operation: {
          entityName: "contact-message",
          operationName: "submit",
          kind: "create",
        },
        status: "committed",
      });
      expect(contactMessageRecords(after.records)).toHaveLength(1);
      expect(JSON.stringify(body)).not.toContain("Email delivery queue");
      expect(JSON.stringify(body)).not.toContain("owner@example.com");
      expect(JSON.stringify(body)).not.toContain("providerMessageId");
      expect(JSON.stringify(body)).not.toContain("latestError");
    } finally {
      await missingQueueHarness.dispose();
    }
  });

  it("keeps configured generic operation input notifications out of public command responses", async () => {
    const emailHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: turnstileVerifyResponse,
    });

    try {
      await resetSchemaApp("site", emailHarness);
      const emailConfig = await configureContactNotificationEmail(emailHarness);
      const block = await postAdminRecordOperation(
        {
          idempotencyKey: "write-create-generic-operation-input-form",
          entity: "block",
          operationName: "create",
          input: {
            type: "publicOperationForm",
            label: "Request updates",
            operationKey: "subscription.subscribe",
            operationNotificationMode: "email",
            operationNotificationReplyToField: "email",
          },
        },
        emailHarness,
      );

      const first = await postPublicOperation(
        "/api/site/public/operations/subscription/subscribe",
        publicSubscribeBody({
          idempotencyKey: "generic-operation-input-notify",
          input: { email: "visitor@example.com" },
          sourceBlockId: block.record.id,
        }),
        emailHarness,
      );
      const replay = await postPublicOperation(
        "/api/site/public/operations/subscription/subscribe",
        publicSubscribeBody({
          idempotencyKey: "generic-operation-input-notify",
          input: { email: "visitor@example.com" },
          sourceBlockId: block.record.id,
          token: "token-replay",
        }),
        emailHarness,
      );
      const firstBody = (await first.json()) as PublicOperationResponse;
      const replayBody = (await replay.json()) as PublicOperationResponse;

      expect(first.status).toBe(200);
      expect(replay.status).toBe(200);
      expect(firstBody.status).toBe("committed");
      expect(replayBody).toEqual({ ...firstBody, status: "replayed" });
      const deliveryReplay = await postEmailDeliveryScheduleReplay(
        {
          canonicalOrigin: "https://www.example.com",
          idempotencyKey: operationInputNotificationIdempotencyKey(
            "subscription.subscribe",
            "generic-operation-input-notify",
          ),
          message: {
            subject: "Replay probe",
            text: "Replay probe",
          },
          messageKind: "site-operation-input-notification",
          recipients: [{ address: "owner@example.com", displayName: "Public operation" }],
          replyTo: { address: "visitor@example.com" },
          sender: { id: emailConfig.sender.id },
          source: {
            operationId: firstBody.invocationId,
            storageIdentity: "site",
          },
        },
        emailHarness,
      );

      expect(deliveryReplay).toMatchObject({
        replayed: true,
        delivery: {
          attemptCount: 0,
          messageKind: "site-operation-input-notification",
          sourceOperationId: firstBody.invocationId,
          sourceStorageIdentity: "site",
          status: "pending",
        },
      });
      expect(deliveryReplay.delivery).not.toHaveProperty("providerMessageId");
      expect(deliveryReplay.delivery).not.toHaveProperty("latestError");
      expect(JSON.stringify(firstBody)).not.toContain("owner@example.com");
      expect(JSON.stringify(firstBody)).not.toContain("contact@mail.example.com");
      expect(JSON.stringify(firstBody)).not.toContain("providerMessageId");
      expect(JSON.stringify(firstBody)).not.toContain("email.delivery.send");
      expect(JSON.stringify(firstBody)).not.toContain("email_delivery_");
      expect(JSON.stringify(firstBody)).not.toContain("latestError");
      expect(JSON.stringify(firstBody)).not.toContain("operation-input-notification");
      expect(JSON.stringify(firstBody)).not.toContain("token-ok");
      expect(JSON.stringify(replayBody)).not.toContain("operation-input-notification");
      expect(JSON.stringify(replayBody)).not.toContain("token-replay");
      expectTurnstileRequests(turnstileRequests, [
        {
          secret: turnstileSecret,
          response: "token-ok",
        },
      ]);
    } finally {
      await emailHarness.dispose();
    }
  });

  it("executes email-style generic public operation form create submissions with replay-safe response filtering", async () => {
    const emailHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: turnstileVerifyResponse,
    });

    try {
      await resetSchemaApp("site", emailHarness);
      await installEmailStylePublicIntakeSchema(emailHarness);
      await configureContactNotificationEmail(emailHarness);
      const block = await postAdminRecordOperation(
        {
          idempotencyKey: "write-create-email-style-public-intake-form",
          entity: "block",
          operationName: "create",
          input: emailStylePublicIntakeFormBlockValues,
        },
        emailHarness,
      );
      const first = await postPublicOperation(
        "/api/site/public/operations/intake-request/submit",
        publicEmailStyleIntakeBody({
          idempotencyKey: "generic-create-email-style-intake",
          sourceBlockId: block.record.id,
        }),
        emailHarness,
      );
      const replay = await postPublicOperation(
        "/api/site/public/operations/intake-request/submit",
        publicEmailStyleIntakeBody({
          idempotencyKey: "generic-create-email-style-intake",
          sourceBlockId: block.record.id,
          token: "token-replay",
        }),
        emailHarness,
      );
      const firstBody = (await first.json()) as PublicOperationResponse;
      const replayBody = (await replay.json()) as PublicOperationResponse;
      const after = await getJson<BootstrapResponse>("/api/site/bootstrap", emailHarness);
      const requests = emailStyleIntakeRecords(after.records);

      expect(first.status).toBe(200);
      expect(replay.status).toBe(200);
      expect(firstBody).toMatchObject({
        operation: {
          entityName: "intake-request",
          operationName: "submit",
          canonicalKey: emailStylePublicIntakeOperationKey,
          kind: "create",
        },
        status: "committed",
      });
      expect(replayBody).toEqual({ ...firstBody, status: "replayed" });
      expect(requests).toHaveLength(1);
      expect(firstBody.output.type).toBe("create");
      if (firstBody.output.type !== "create") {
        throw new Error("Expected create output.");
      }
      expect(firstBody.output.record.values).toEqual(emailStylePublicIntakeInput);
      expect(JSON.stringify(firstBody)).not.toContain("owner@example.com");
      expect(JSON.stringify(firstBody)).not.toContain("contact@mail.example.com");
      expect(JSON.stringify(firstBody)).not.toContain("providerMessageId");
      expect(JSON.stringify(firstBody)).not.toContain("operation-input-notification");
      expect(JSON.stringify(firstBody)).not.toContain("token-ok");
      expect(JSON.stringify(replayBody)).not.toContain("token-replay");
      expect(JSON.stringify(replayBody)).not.toContain(turnstileSecret);
      expectTurnstileRequests(turnstileRequests, [
        {
          secret: turnstileSecret,
          response: "token-ok",
        },
      ]);
    } finally {
      await emailHarness.dispose();
    }
  });

  it("schedules generic operation input notifications from installed Site forms targeting another app install", async () => {
    const emailHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: turnstileVerifyResponse,
    });
    const publicIdempotencyKey = "cross-app-operation-input-notify";
    const targetApiPrefix = `/api/app-installs/tasks/${recordPlanInstallId}`;

    try {
      await resetInstalledApp("site", defaultSiteInstallId, emailHarness);
      await resetInstalledApp("tasks", recordPlanInstallId, emailHarness);
      await installEmailStylePublicIntakeSchema(emailHarness, targetApiPrefix);
      const emailConfig = await configureContactNotificationEmail(emailHarness);

      const block = await postAdminRecordOperation(
        {
          idempotencyKey: "write-create-cross-app-operation-input-form",
          entity: "block",
          operationName: "create",
          input: crossAppEmailStylePublicIntakeFormBlockValues(),
        },
        emailHarness,
        `/api/app-installs/site/${defaultSiteInstallId}`,
      );
      const first = await postPublicOperation(
        `${targetApiPrefix}/public/operations/intake-request/submit`,
        publicEmailStyleIntakeBody({
          idempotencyKey: publicIdempotencyKey,
          sourceBlockId: block.record.id,
        }),
        emailHarness,
      );
      const firstBody = (await first.json()) as PublicOperationResponse;
      const after = await getJson<BootstrapResponse>(`${targetApiPrefix}/bootstrap`, emailHarness);
      const requests = emailStyleIntakeRecords(after.records);

      expect(first.status).toBe(200);
      expect(firstBody).toMatchObject({
        invocationId: `operation:${emailStylePublicIntakeOperationKey}:${publicIdempotencyKey}`,
        operation: {
          entityName: "intake-request",
          operationName: "submit",
          canonicalKey: emailStylePublicIntakeOperationKey,
          kind: "create",
        },
        status: "committed",
      });
      expect(requests).toHaveLength(1);

      if (firstBody.output.type !== "create") {
        throw new Error("Expected create output.");
      }

      const deliveryReplay = await postAdminJson<{
        delivery: {
          latestError?: string;
          messageKind: string;
          sourceOperationId?: string;
          sourceRecordId?: string;
          sourceStorageIdentity: string;
          status: string;
        };
        replayed: boolean;
      }>(
        "/api/formless/email/deliveries/schedule",
        {
          canonicalOrigin: "https://www.example.com",
          idempotencyKey: operationInputNotificationIdempotencyKey(
            emailStylePublicIntakeOperationKey,
            publicIdempotencyKey,
          ),
          message: {
            subject: "Replay probe",
            text: "Replay probe",
          },
          messageKind: "site-operation-input-notification",
          recipients: [{ address: "owner@example.com", displayName: "Public operation" }],
          replyTo: { address: "ada@example.com" },
          sender: { id: emailConfig.sender.id },
          source: {
            operationId: firstBody.invocationId,
            recordId: firstBody.output.record.id,
            storageIdentity: `app:${recordPlanInstallId}`,
          },
        },
        emailHarness,
      );

      expect(deliveryReplay).toMatchObject({
        replayed: true,
        delivery: {
          messageKind: "site-operation-input-notification",
          sourceOperationId: firstBody.invocationId,
          sourceRecordId: firstBody.output.record.id,
          sourceStorageIdentity: `app:${recordPlanInstallId}`,
          status: "pending",
        },
      });
      expect(deliveryReplay.delivery).not.toHaveProperty("latestError");
      expect(JSON.stringify(firstBody)).not.toContain("owner@example.com");
      expect(JSON.stringify(firstBody)).not.toContain("contact@mail.example.com");
      expect(JSON.stringify(firstBody)).not.toContain("operation-input-notification");
    } finally {
      await emailHarness.dispose();
    }
  });

  it("rejects generic public operation form create unknown and invalid input before challenge verification", async () => {
    await installEmailStylePublicIntakeSchema();

    const beforeUnknown = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const unknown = await postPublicOperation(
      "/api/site/public/operations/intake-request/submit",
      publicEmailStyleIntakeBody({
        idempotencyKey: "generic-create-email-style-unknown",
        input: {
          ...emailStylePublicIntakeInput,
          internalNotes: "not public",
        },
        token: "secret-generic-create-token",
      }),
    );
    const afterUnknown = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const beforeInvalid = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const invalid = await postPublicOperation(
      "/api/site/public/operations/intake-request/submit",
      publicEmailStyleIntakeBody({
        idempotencyKey: "generic-create-email-style-invalid",
        input: {
          ...emailStylePublicIntakeInput,
          message: "",
        },
      }),
    );
    const afterInvalid = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const retry = await postPublicOperation(
      "/api/site/public/operations/intake-request/submit",
      publicEmailStyleIntakeBody({ idempotencyKey: "generic-create-email-style-unknown" }),
    );
    const afterRetry = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(unknown.status).toBe(400);
    expect((await unknown.json()) as { error: string }).toEqual({
      error: 'Public operation input includes undeclared field "internalNotes".',
    });
    expect(afterUnknown.records).toEqual(beforeUnknown.records);
    expect(afterUnknown.cursor).toBe(beforeUnknown.cursor);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()) as { error: string }).toEqual({
      error: 'Field "message" cannot be empty.',
    });
    expect(afterInvalid.records).toEqual(beforeInvalid.records);
    expect(afterInvalid.cursor).toBe(beforeInvalid.cursor);
    expect(retry.status).toBe(200);
    expect(emailStyleIntakeRecords(afterRetry.records)).toHaveLength(1);
    expect(turnstileRequests).toHaveLength(1);
    expect(JSON.stringify(await retry.json())).not.toContain("secret-generic-create-token");
  });

  it("executes and rejects schema-key public record-plan command operations", async () => {
    await installPublicRecordPlanSchema("/api/tasks");

    const before = await getJson<BootstrapResponse>("/api/tasks/bootstrap");
    const accepted = await postPublicOperation(
      "/api/tasks/public/operations/task/submitPublicPlan",
      publicRecordPlanBody({
        idempotencyKey: "record-plan-schema-key",
        sourceBlockId: "rec_site_block_public_plan_form",
      }),
    );
    const replay = await postPublicOperation(
      "/api/tasks/public/operations/task/submitPublicPlan",
      publicRecordPlanBody({
        idempotencyKey: "record-plan-schema-key",
        sourceBlockId: "rec_site_block_public_plan_form",
        token: "token-replay",
      }),
    );
    const body = (await accepted.json()) as PublicOperationResponse;
    const replayBody = (await replay.json()) as PublicOperationResponse;
    const after = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(accepted.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(body).toMatchObject({
      invocationId: "operation:task.submitPublicPlan:record-plan-schema-key",
      operation: {
        entityName: "task",
        operationName: "submitPublicPlan",
        canonicalKey: "task.submitPublicPlan",
        kind: "command",
      },
      output: {
        type: "command",
        cursor: after.cursor,
        recordPlan: {
          steps: [
            { name: "createTask", kind: "create", entity: "task" },
            { name: "createLog", kind: "create", entity: "task-log" },
            { name: "touchTask", kind: "patch", entity: "task" },
          ],
        },
      },
      status: "committed",
    });
    expect(replayBody).toEqual({ ...body, status: "replayed" });
    if (body.output.type !== "command") {
      throw new Error("Expected command output.");
    }
    const steps = body.output.recordPlan?.steps ?? [];
    const records = taskRecordPlanRecords(after.records);
    const taskId = steps[0]?.recordId;
    const task = records.tasks.find((record) => record.id === taskId);
    const log = records.logs.find((record) => record.values.task === taskId);

    expect(body.output).not.toHaveProperty("changes");
    expect(body.output).not.toHaveProperty("response");
    expect(body.output.affectedChangeIds).toHaveLength(3);
    expect(steps.map((step) => step.changeId)).toEqual(body.output.affectedChangeIds);
    expect(after.records.length).toBe(before.records.length + 2);
    expect(task?.values).toMatchObject({
      title: "Public plan task",
      done: false,
      priority: "normal",
    });
    expect(log?.values).toMatchObject({
      task: taskId,
      label: "Created from public plan",
      actorMode: "anonymous",
      sourcePath: "/api/tasks/public/operations/task/submitPublicPlan",
    });
    expect(JSON.stringify(body)).not.toContain("token-ok");
    expect(JSON.stringify(replayBody)).not.toContain("token-replay");
    expect(JSON.stringify(body)).not.toContain(turnstileSecret);
    expect(JSON.stringify(body)).not.toContain("Public plan task");
    expect(JSON.stringify(body)).not.toContain("Created from public plan");

    const beforeRejected = await getJson<BootstrapResponse>("/api/tasks/bootstrap");
    const rejected = await postPublicOperation(
      "/api/tasks/public/operations/task/submitPublicPlan",
      publicRecordPlanBody({
        idempotencyKey: "record-plan-schema-key-rejected",
        input: {
          title: "Rejected task",
          note: "Rejected note",
          admin: true,
        },
        sourceBlockId: "rec_site_block_public_plan_form",
      }),
    );
    const afterRejected = await getJson<BootstrapResponse>("/api/tasks/bootstrap");
    const beforeInvalid = await getJson<BootstrapResponse>("/api/tasks/bootstrap");
    const invalid = await postPublicOperation(
      "/api/tasks/public/operations/task/submitPublicPlan",
      publicRecordPlanBody({
        idempotencyKey: "record-plan-schema-key-invalid",
        input: {
          title: "",
          note: "Invalid declared field",
        },
        sourceBlockId: "rec_site_block_public_plan_form",
      }),
    );
    const afterInvalid = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(rejected.status).toBe(400);
    const rejectedBody = (await rejected.json()) as { error: string };

    expect(rejectedBody).toEqual({
      error: 'Public operation input includes undeclared field "admin".',
    });
    expect(Object.keys(rejectedBody)).toEqual(["error"]);
    expect(JSON.stringify(rejectedBody)).not.toContain("Rejected task");
    expect(JSON.stringify(rejectedBody)).not.toContain("token-ok");
    expect(afterRejected.records).toEqual(beforeRejected.records);
    expect(afterRejected.cursor).toBe(beforeRejected.cursor);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()) as { error: string }).toEqual({
      error: 'Public operation input field "title" cannot be empty.',
    });
    expect(afterInvalid.records).toEqual(beforeInvalid.records);
    expect(afterInvalid.cursor).toBe(beforeInvalid.cursor);
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("executes and rejects installed app public record-plan command operations", async () => {
    await resetInstalledApp("tasks", recordPlanInstallId);
    await installPublicRecordPlanSchema(`/api/app-installs/tasks/${recordPlanInstallId}`);

    const route = `/api/app-installs/tasks/${recordPlanInstallId}/public/operations/task/submitPublicPlan`;
    const accepted = await postPublicOperation(
      route,
      publicRecordPlanBody({ idempotencyKey: "record-plan-installed" }),
    );
    const body = (await accepted.json()) as PublicOperationResponse;
    const after = await getJson<BootstrapResponse>(
      `/api/app-installs/tasks/${recordPlanInstallId}/bootstrap`,
    );

    expect(accepted.status).toBe(200);
    expect(body).toMatchObject({
      invocationId: "operation:task.submitPublicPlan:record-plan-installed",
      operation: {
        entityName: "task",
        operationName: "submitPublicPlan",
        canonicalKey: "task.submitPublicPlan",
        kind: "command",
      },
      output: {
        type: "command",
        recordPlan: {
          steps: [
            { name: "createTask", kind: "create", entity: "task" },
            { name: "createLog", kind: "create", entity: "task-log" },
            { name: "touchTask", kind: "patch", entity: "task" },
          ],
        },
      },
      status: "committed",
    });
    if (body.output.type !== "command") {
      throw new Error("Expected command output.");
    }
    const steps = body.output.recordPlan?.steps ?? [];
    const records = taskRecordPlanRecords(after.records);
    const taskId = steps[0]?.recordId;

    expect(body.output).not.toHaveProperty("changes");
    expect(body.output).not.toHaveProperty("response");
    expect(body.output.affectedChangeIds).toHaveLength(3);
    expect(records.tasks.some((record) => record.id === taskId)).toBe(true);
    expect(records.logs).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          task: taskId,
          actorMode: "anonymous",
          sourcePath: route,
        }),
      }),
    ]);

    const beforeRejected = await getJson<BootstrapResponse>(
      `/api/app-installs/tasks/${recordPlanInstallId}/bootstrap`,
    );
    const rejected = await postPublicOperation(
      route,
      publicRecordPlanBody({
        idempotencyKey: "record-plan-installed-rejected",
        input: {
          title: "Rejected installed task",
          note: "Rejected installed note",
          providerSecret: "not-public",
        },
      }),
    );
    const afterRejected = await getJson<BootstrapResponse>(
      `/api/app-installs/tasks/${recordPlanInstallId}/bootstrap`,
    );

    expect(rejected.status).toBe(400);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: 'Public operation input includes undeclared field "providerSecret".',
    });
    expect(afterRejected.records).toEqual(beforeRejected.records);
    expect(afterRejected.cursor).toBe(beforeRejected.cursor);
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
  });

  it("rejects undeclared public create input before challenge verification or idempotency reservation", async () => {
    const beforeState = await readPublicOperationHarnessState();
    const rejected = await postPublicOperationHarness(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({
        idempotencyKey: "contact-create-input-retry",
        token: "secret-audit-token",
        input: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          message: "Please send details.",
          turnstileToken: "payload-token",
        },
      }),
    );
    const rejectedAfter = await readPublicOperationHarnessState();
    const accepted = await postPublicOperation(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-input-retry" }),
    );
    const acceptedAfter = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(rejected.status).toBe(400);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: 'Public operation input includes undeclared field "turnstileToken".',
    });
    expect(rejectedAfter.records).toEqual(beforeState.records);
    expect(rejectedAfter.changes).toEqual(beforeState.changes);
    expect(rejectedAfter.commandExecutionCount).toBe(0);
    expect(rejectedAfter.invocations).toHaveLength(1);
    expect(rejectedAfter.invocations[0]).toMatchObject({
      actorKind: "anonymous",
      affectedChangeIds: [],
      appStorageIdentity: {
        kind: "schemaKey",
        sourceSchemaKey: "site",
      },
      auditInput: {
        kind: "summary",
        summary: {
          fieldNames: ["email", "message", "name"],
          type: "create",
          valuesType: "object",
        },
      },
      authDecision: "allowed",
      errorMessage: 'Public operation input includes undeclared field "[redacted]".',
      idempotency: {
        key: "contact-create-input-retry",
        source: "caller",
        writeIdentity: "operation:contact-message.submit:contact-create-input-retry",
      },
      operationKey: "contact-message.submit",
      source: {
        host: "example.com",
        path: "/api/site/public/operations/contact-message/submit",
        protocol: "public",
        siteBlockId: "rec_site_contact_form",
      },
      status: "failed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "failed" }),
      ],
    });
    expect(rejectedAfter.invocations[0]?.output).toBeUndefined();
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain("payload-token");
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain("secret-audit-token");
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain("turnstileToken");
    expect(accepted.status).toBe(200);
    expect(contactMessageRecords(acceptedAfter.records)).toHaveLength(1);
    expect(turnstileRequests).toHaveLength(1);
  });

  it("rejects invalid declared public create input before challenge verification or idempotency reservation", async () => {
    const rejected = await postPublicOperation(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({
        idempotencyKey: "contact-create-invalid-retry",
        input: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          message: "",
        },
      }),
    );
    const rejectedAfter = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const accepted = await postPublicOperation(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-invalid-retry" }),
    );
    const acceptedAfter = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(rejected.status).toBe(400);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: 'Field "message" cannot be empty.',
    });
    expect(contactMessageRecords(rejectedAfter.records)).toHaveLength(0);
    expect(accepted.status).toBe(200);
    expect(contactMessageRecords(acceptedAfter.records)).toHaveLength(1);
    expect(turnstileRequests).toHaveLength(1);
  });

  it("fails closed before committing public create when Turnstile fails or config is missing", async () => {
    turnstileResponse = { success: false, "error-codes": ["invalid-input-response"] };

    const beforeState = await readPublicOperationHarnessState();
    const failed = await postPublicOperationHarness(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-failed-turnstile" }),
    );
    const afterState = await readPublicOperationHarnessState();

    expect(failed.status).toBe(403);
    expect((await failed.json()) as { error: string }).toEqual({
      error: "Public operation challenge failed.",
    });
    expect(afterState.records).toEqual(beforeState.records);
    expect(afterState.changes).toEqual(beforeState.changes);
    expect(afterState.commandExecutionCount).toBe(0);
    expect(afterState.invocations).toHaveLength(1);
    expect(afterState.invocations[0]).toMatchObject({
      actorKind: "anonymous",
      affectedChangeIds: [],
      appStorageIdentity: {
        kind: "schemaKey",
        sourceSchemaKey: "site",
      },
      auditInput: {
        kind: "summary",
        summary: {
          fieldNames: ["email", "message", "name"],
          type: "create",
          valuesType: "object",
        },
      },
      authDecision: "allowed",
      errorMessage: "Public operation challenge failed.",
      operationKey: "contact-message.submit",
      source: {
        host: "example.com",
        path: "/api/site/public/operations/contact-message/submit",
        protocol: "public",
        siteBlockId: "rec_site_contact_form",
      },
      status: "failed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "failed" }),
      ],
    });
    expect(afterState.invocations[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "failed",
    ]);
    expect(afterState.invocations[0]?.output).toBeUndefined();
    expect(JSON.stringify(afterState.invocations[0])).not.toContain("token-ok");
    expect(JSON.stringify(afterState.invocations[0])).not.toContain(turnstileSecret);
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);

    const missingConfigRequests: unknown[] = [];
    const missingConfigHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      turnstileVerify: async (request) => {
        missingConfigRequests.push(await request.json());

        return Response.json({ success: true });
      },
    });

    try {
      const missingConfig = await postPublicOperation(
        "/api/site/public/operations/contact-message/submit",
        publicContactMessageBody({ idempotencyKey: "contact-create-missing-config" }),
        missingConfigHarness,
      );
      const missingAfter = await getJson<BootstrapResponse>(
        "/api/site/bootstrap",
        missingConfigHarness,
      );

      expect(missingConfig.status).toBe(503);
      expect((await missingConfig.json()) as { error: string }).toEqual({
        error: "Public operation challenge is unavailable.",
      });
      expect(contactMessageRecords(missingAfter.records)).toHaveLength(0);
      expect(missingConfigRequests).toEqual([]);
    } finally {
      await missingConfigHarness.dispose();
    }
  });

  it("replays public create output without duplicate records or proof-bearing audit rows", async () => {
    const first = await postPublicOperationHarness(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-replay" }),
    );
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);

    turnstileRequests = [];

    const replay = await postPublicOperationHarness(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: "contact-create-replay", token: "token-replay" }),
    );
    const firstBody = (await first.json()) as PublicOperationResponse;
    const replayBody = (await replay.json()) as PublicOperationResponse;
    const records = await readPublicOperationHarnessRecords();
    const rows = await readPublicOperationInvocations();
    const messages = contactMessageRecords(records);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(firstBody.status).toBe("committed");
    expect(replayBody).toEqual({ ...firstBody, status: "replayed" });
    expect(messages).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: firstBody.output.affectedChangeIds,
      auditInput: {
        kind: "summary",
        summary: {
          fieldNames: ["email", "message", "name"],
          type: "create",
          valuesType: "object",
        },
      },
      operationKey: "contact-message.submit",
      operationKind: "create",
      status: "replayed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "committed" }),
        expect.objectContaining({ status: "replayed" }),
      ],
    });
    expect(rows[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);
    expect(JSON.stringify(rows[0])).not.toContain(turnstileSecret);
    expect(JSON.stringify(rows[0])).not.toContain("token-ok");
    expect(JSON.stringify(rows[0])).not.toContain("token-replay");
    expect(JSON.stringify(rows[0])).not.toContain("turnstileToken");
    expect(JSON.stringify(firstBody)).not.toContain("token-ok");
    expect(JSON.stringify(replayBody)).not.toContain("token-replay");
    expect(turnstileRequests).toEqual([]);
  });

  it("rejects undeclared public subscribe input before challenge verification and audits source facts", async () => {
    const beforeState = await readPublicOperationHarnessState();
    const rejected = await postPublicOperationHarness(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({
        idempotencyKey: "input-retry",
        input: { email: "ada@example.com", admin: true },
      }),
    );
    const rejectedAfter = await readPublicOperationHarnessState();
    const accepted = await postPublicOperationHarness(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "input-retry" }),
    );
    const acceptedAfter = await readPublicOperationHarnessState();

    expect(rejected.status).toBe(400);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: 'Public operation input includes undeclared field "admin".',
    });
    expect(rejectedAfter.records).toEqual(beforeState.records);
    expect(rejectedAfter.changes).toEqual(beforeState.changes);
    expect(rejectedAfter.commandExecutionCount).toBe(0);
    expect(rejectedAfter.invocations).toHaveLength(1);
    expect(rejectedAfter.invocations[0]).toMatchObject({
      actorKind: "anonymous",
      affectedChangeIds: [],
      appStorageIdentity: {
        kind: "schemaKey",
        sourceSchemaKey: "site",
      },
      auditInput: {
        kind: "summary",
        summary: {
          inputFields: ["admin", "email"],
          inputType: "object",
          type: "command",
        },
      },
      authDecision: "allowed",
      errorMessage: 'Public operation input includes undeclared field "admin".',
      idempotency: {
        key: "input-retry",
        source: "caller",
        writeIdentity: "operation:subscription.subscribe:input-retry",
      },
      operationKey: "subscription.subscribe",
      operationKind: "command",
      source: {
        host: "example.com",
        path: "/api/site/public/operations/subscription/subscribe",
        protocol: "public",
        siteBlockId: "rec_site_subscribe_form",
      },
      status: "failed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "failed" }),
      ],
    });
    expect(rejectedAfter.invocations[0]?.output).toBeUndefined();
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain("token-ok");
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain(turnstileSecret);
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain("turnstileToken");
    expect(accepted.status).toBe(200);
    expect(contactSubscriptionRecords(acceptedAfter.records).subscriptions).toHaveLength(1);
    expect(turnstileRequests).toHaveLength(1);
  });

  it("rejects malformed public proof before challenge verification", async () => {
    const beforeState = await readPublicOperationHarnessState();
    const rejected = await postPublicOperationHarness(
      "/api/site/public/operations/contact-message/submit",
      {
        ...publicContactMessageBody({ idempotencyKey: "contact-create-proof-rejected" }),
        proof: { turnstileToken: " " },
      },
    );
    const rejectedAfter = await readPublicOperationHarnessState();

    expect(rejected.status).toBe(400);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: "Public operation Turnstile token is required.",
    });
    expect(rejectedAfter.records).toEqual(beforeState.records);
    expect(rejectedAfter.changes).toEqual(beforeState.changes);
    expect(rejectedAfter.commandExecutionCount).toBe(0);
    expect(rejectedAfter.invocations).toHaveLength(1);
    expect(rejectedAfter.invocations[0]).toMatchObject({
      affectedChangeIds: [],
      errorMessage: "Public operation Turnstile token is required.",
      operationKey: "contact-message.submit",
      operationKind: "create",
      status: "failed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "failed" }),
      ],
    });
    expect(rejectedAfter.invocations[0]?.output).toBeUndefined();
    expect(turnstileRequests).toEqual([]);
  });

  it("audits public subscribe same-origin rejections without challenge verification", async () => {
    const beforeState = await readPublicOperationHarnessState();
    const rejected = await postPublicOperationHarnessHost(
      "example.com",
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "origin-rejected" }),
      "http://evil.example",
    );
    const rejectedAfter = await readPublicOperationHarnessState();

    expect(rejected.status).toBe(403);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: "Public operation origin is not allowed.",
    });
    expect(rejectedAfter.records).toEqual(beforeState.records);
    expect(rejectedAfter.changes).toEqual(beforeState.changes);
    expect(rejectedAfter.commandExecutionCount).toBe(0);
    expect(rejectedAfter.invocations).toHaveLength(1);
    expect(rejectedAfter.invocations[0]).toMatchObject({
      actorKind: "anonymous",
      affectedChangeIds: [],
      auditInput: {
        kind: "summary",
        summary: {
          inputFields: ["email"],
          inputType: "object",
          type: "command",
        },
      },
      authDecision: "allowed",
      errorMessage: "Public operation origin is not allowed.",
      operationKey: "subscription.subscribe",
      operationKind: "command",
      source: {
        host: "example.com",
        path: "/api/site/public/operations/subscription/subscribe",
        protocol: "public",
        siteBlockId: "rec_site_subscribe_form",
      },
      status: "failed",
    });
    expect(rejectedAfter.invocations[0]?.output).toBeUndefined();
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain("token-ok");
    expect(JSON.stringify(rejectedAfter.invocations[0])).not.toContain(turnstileSecret);
    expect(turnstileRequests).toEqual([]);
  });

  it("fails closed when Turnstile verification fails", async () => {
    turnstileResponse = { success: false, "error-codes": ["invalid-input-response"] };

    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const response = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({ idempotencyKey: "failed-turnstile" }),
    );
    const after = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toEqual({
      error: "Public operation challenge failed.",
    });
    expect(after.records).toEqual(before.records);
  });

  it("sends a UUID Siteverify idempotency key for domain-scoped public operation idempotency", async () => {
    const publicIdempotencyKey = `site-contact:rec_site_block_contact_form:${randomUUID()}`;
    const siteverifyRequests: TurnstileVerifyRequest[] = [];
    const uuidRequiredHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: async (request) => {
        const body = (await request.json()) as TurnstileVerifyRequest;

        siteverifyRequests.push(body);

        if (typeof body.idempotency_key !== "string" || !isUuid(body.idempotency_key)) {
          return Response.json(
            { success: false, "error-codes": ["invalid-idempotency-key"], messages: [] },
            { status: 400 },
          );
        }

        return Response.json({
          success: true,
          challenge_ts: "2026-05-28T00:00:00.000Z",
          hostname: "example.com",
        });
      },
    });

    try {
      await resetSchemaApp("site", uuidRequiredHarness);

      const response = await postPublicOperation(
        "/api/site/public/operations/contact-message/submit",
        publicContactMessageBody({ idempotencyKey: publicIdempotencyKey }),
        uuidRequiredHarness,
      );
      const after = await getJson<BootstrapResponse>("/api/site/bootstrap", uuidRequiredHarness);

      expect(response.status).toBe(200);
      expect(contactMessageRecords(after.records)).toHaveLength(1);
      expectTurnstileRequests(siteverifyRequests, [
        {
          secret: turnstileSecret,
          response: "token-ok",
        },
      ]);
      expect(siteverifyRequests[0]?.idempotency_key).not.toBe(publicIdempotencyKey);
    } finally {
      await uuidRequiredHarness.dispose();
    }
  });

  it("passes UUID public operation idempotency keys through to Siteverify", async () => {
    const publicIdempotencyKey = randomUUID();
    const response = await postPublicOperation(
      "/api/site/public/operations/contact-message/submit",
      publicContactMessageBody({ idempotencyKey: publicIdempotencyKey }),
    );

    expect(response.status).toBe(200);
    expectTurnstileRequests(turnstileRequests, [
      {
        secret: turnstileSecret,
        response: "token-ok",
      },
    ]);
    expect(turnstileRequests[0]?.idempotency_key).toBe(publicIdempotencyKey);
  });

  it("maps non-OK Siteverify JSON failures to challenge failure", async () => {
    const siteverifyRequests: TurnstileVerifyRequest[] = [];
    const nonOkFailureHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: turnstileSecret,
      },
      turnstileVerify: async (request) => {
        siteverifyRequests.push((await request.json()) as TurnstileVerifyRequest);

        return Response.json(
          { success: false, "error-codes": ["invalid-input-response"], messages: [] },
          { status: 400 },
        );
      },
    });

    try {
      await resetSchemaApp("site", nonOkFailureHarness);

      const before = await getJson<BootstrapResponse>("/api/site/bootstrap", nonOkFailureHarness);
      const response = await postPublicOperation(
        "/api/site/public/operations/subscription/subscribe",
        publicSubscribeBody({ idempotencyKey: "site-subscribe:rec_site_subscribe_form:key-1" }),
        nonOkFailureHarness,
      );
      const after = await getJson<BootstrapResponse>("/api/site/bootstrap", nonOkFailureHarness);

      expect(response.status).toBe(403);
      expect((await response.json()) as { error: string }).toEqual({
        error: "Public operation challenge failed.",
      });
      expect(after.records).toEqual(before.records);
      expectTurnstileRequests(siteverifyRequests, [
        {
          secret: turnstileSecret,
          response: "token-ok",
        },
      ]);
    } finally {
      await nonOkFailureHarness.dispose();
    }
  });

  it("fails closed when Turnstile secret configuration is missing or blank", async () => {
    const missingConfigRequests: unknown[] = [];
    const missingConfigHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      turnstileVerify: async (request) => {
        missingConfigRequests.push(await request.json());

        return Response.json({ success: true });
      },
    });

    try {
      const response = await postPublicOperation(
        "/api/site/public/operations/subscription/subscribe",
        publicSubscribeBody({ idempotencyKey: "missing-config" }),
        missingConfigHarness,
      );

      expect(response.status).toBe(503);
      expect((await response.json()) as { error: string }).toEqual({
        error: "Public operation challenge is unavailable.",
      });
      expect(missingConfigRequests).toEqual([]);
    } finally {
      await missingConfigHarness.dispose();
    }

    const blankConfigRequests: unknown[] = [];
    const blankConfigHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: turnstileSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: " ",
      },
      turnstileVerify: async (request) => {
        blankConfigRequests.push(await request.json());

        return Response.json({ success: true });
      },
    });

    try {
      const response = await postPublicOperation(
        "/api/site/public/operations/subscription/subscribe",
        publicSubscribeBody({ idempotencyKey: "blank-config" }),
        blankConfigHarness,
      );

      expect(response.status).toBe(503);
      expect((await response.json()) as { error: string }).toEqual({
        error: "Public operation challenge is unavailable.",
      });
      expect(blankConfigRequests).toEqual([]);
    } finally {
      await blankConfigHarness.dispose();
    }
  });

  it("projects configured Turnstile site key without exposing the secret", async () => {
    const block = await postAdminRecordOperation({
      idempotencyKey: "write-create-configured-subscribe-form",
      entity: "block",
      operationName: "create",
      input: {
        type: "subscribeForm",
        label: "Join the list",
        operationName: "subscribe",
        buttonLabel: "Join",
      },
    });
    await postAdminRecordOperation({
      idempotencyKey: "write-place-configured-subscribe-form",
      entity: "block-placement",
      operationName: "create",
      input: {
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

    expect(subscribePlacement?.block.publicOperation).toEqual({
      entityName: "subscription",
      operationName: "subscribe",
      canonicalKey: "subscription.subscribe",
      route: "/api/site/public/operations/subscription/subscribe",
      challenge: {
        kind: "turnstile",
        siteKey: turnstileSiteKey,
      },
    });
    expect(JSON.stringify(tree)).not.toContain(turnstileSecret);
  });

  it("uses deployed Turnstile bindings for subscribe form rendering and verification", async () => {
    const deployedSiteKey = "deployed-turnstile-site-key";
    const deployedSecret = "deployed-turnstile-secret";
    const deployedRequests: TurnstileVerifyRequest[] = [];
    const deployedHarness = await createPublicOperationWorkerHarness({
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_TURNSTILE_SITE_KEY: deployedSiteKey,
        FORMLESS_TURNSTILE_SECRET_KEY: deployedSecret,
      },
      turnstileVerify: async (request) => {
        deployedRequests.push((await request.json()) as TurnstileVerifyRequest);

        return Response.json({ success: true });
      },
    });

    try {
      await resetSchemaApp("site", deployedHarness);
      const block = await postAdminRecordOperation(
        {
          idempotencyKey: "write-create-deployed-subscribe-form",
          entity: "block",
          operationName: "create",
          input: {
            type: "subscribeForm",
            label: "Join the deployed list",
            operationName: "subscribe",
            buttonLabel: "Join",
          },
        },
        deployedHarness,
      );
      await postAdminRecordOperation(
        {
          idempotencyKey: "write-place-deployed-subscribe-form",
          entity: "block-placement",
          operationName: "create",
          input: {
            parent: "rec_site_starter_page_home",
            block: block.record.id,
            order: 4500,
            label: "Join the deployed list",
          },
        },
        deployedHarness,
      );

      const tree = await getJson<SitePageTreeResponse>("/api/site/tree/home", deployedHarness);
      const subscribePlacement = tree.page.placements.find(
        (placement) => placement.block.id === block.record.id,
      );
      const accepted = await postPublicOperation(
        "/api/site/public/operations/subscription/subscribe",
        publicSubscribeBody({ idempotencyKey: "deployed-bindings" }),
        deployedHarness,
      );

      expect(subscribePlacement?.block.publicOperation?.challenge).toEqual({
        kind: "turnstile",
        siteKey: deployedSiteKey,
      });
      expect(accepted.status).toBe(200);
      expectTurnstileRequests(deployedRequests, [
        {
          secret: deployedSecret,
          response: "token-ok",
        },
      ]);
      expect(JSON.stringify(tree)).not.toContain(deployedSecret);
    } finally {
      await deployedHarness.dispose();
    }
  });

  it("keeps one email address and one subscription for duplicate subscribes", async () => {
    const first = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({
        idempotencyKey: "duplicate-first",
        input: { email: "Ada@Example.com" },
      }),
    );
    const duplicate = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
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

  it("keeps subscribe email address validation in handler execution", async () => {
    const rejected = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
      publicSubscribeBody({
        idempotencyKey: "subscribe-invalid-email",
        input: { email: "not an email address" },
      }),
    );

    expect(rejected.status).toBe(400);
    expect((await rejected.json()) as { error: string }).toEqual({
      error: 'Subscribe operation public input "email" must be an email address.',
    });
  });

  it("resubscribes an existing unsubscribed membership", async () => {
    const first = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
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

    const resubscribe = await postPublicOperation(
      "/api/site/public/operations/subscription/subscribe",
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

  it("routes mapped public Site host public operations without exposing admin shell or schema-key APIs", async () => {
    const mappedHarness = await createPublicOperationWorkerHarness({
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
      await createMappedPublicSiteRoute(mappedHarness, mappedHost, installId);

      const accepted = await fetchHost(
        mappedHarness,
        mappedHost,
        `/api/app-installs/site/${installId}/public/operations/subscription/subscribe`,
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
        "/api/site/public/operations/subscription/subscribe",
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

function expectBadPublicOperationRoute(path: string, message: string): void {
  try {
    selectPublicOperationRoute({ method: "POST", path });
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toBe(message);
    return;
  }

  throw new Error(`Expected bad public operation route for ${path}.`);
}

async function createPublicOperationWorkerHarness(input: {
  bindings: Record<string, string>;
  emailDeliveryQueue?: "enabled" | "missing";
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
      ...(input.emailDeliveryQueue === "missing"
        ? {}
        : {
            queueProducers: {
              FORMLESS_EMAIL_DELIVERY_QUEUE: "formless-email-delivery",
            },
          }),
      r2Buckets: ["FORMLESS_MEDIA"],
      serviceBindings: {
        FORMLESS_TURNSTILE_SITEVERIFY: input.turnstileVerify,
      },
    },
  );
}

async function createPublicOperationHarness(input: {
  bindings: Record<string, string>;
  turnstileVerify: (request: Request) => Promise<Response> | Response;
}) {
  publicOperationHarnessDir = await mkdtemp(join(tmpdir(), "formless-public-operation-harness-"));
  const harnessPath = join(publicOperationHarnessDir, "public-operation-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import { parseAuthorityApiRoute } from "${process.cwd()}/src/shared/app-storage-identity.ts";
      import {
        executePublicOperationRequest,
        PublicOperationError,
        selectPublicOperationRoute,
      } from "${process.cwd()}/src/worker/public-operations.ts";
      import { BadRequestError } from "${process.cwd()}/src/worker/errors.ts";
      import { workerSchemaAppDefinitions } from "${process.cwd()}/src/worker/schema-apps.ts";
      import {
        ensureStorageTables,
        getChangesAfter,
        getBootstrapRecords,
        initializeStorageFromSource,
        readOperationInvocations,
      } from "${process.cwd()}/src/worker/storage.ts";

      export class PublicOperationHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;
          ensureStorageTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "GET" && url.pathname === "/state") {
            initializeHarnessStorage(this.ctx.storage);

            return Response.json({
              commandExecutionCount: readCommandExecutionCount(this.ctx.storage),
              changes: getChangesAfter(this.ctx.storage, 0),
              invocations: readOperationInvocations(this.ctx.storage),
              records: getBootstrapRecords(this.ctx.storage),
            });
          }

          if (request.method === "GET" && url.pathname === "/operation-invocations") {
            return Response.json(readOperationInvocations(this.ctx.storage));
          }

          if (request.method === "GET" && url.pathname === "/records") {
            initializeHarnessStorage(this.ctx.storage);

            return Response.json(getBootstrapRecords(this.ctx.storage));
          }

          try {
            const authorityRoute = parseAuthorityApiRoute(url.pathname);
            const route = authorityRoute
              ? selectPublicOperationRoute({
                  method: request.method,
                  path: authorityRoute.path,
                })
              : undefined;

            if (!authorityRoute || !route) {
              return Response.json({ error: "Unsupported public operation." }, { status: 404 });
            }

            const app = workerSchemaAppDefinitions[authorityRoute.identity.sourceSchemaKey];
            if (!app) {
              return Response.json({ error: "Unsupported app." }, { status: 404 });
            }

            ensureStorageTables(this.ctx.storage);
            const stored = initializeStorageFromSource(this.ctx.storage, {
              schema: app.sourceSchema,
              records: app.seedRecords,
              changeWritePrefix: app.seedChangeWritePrefix,
            });
            const result = await executePublicOperationRequest({
              body: await request.json(),
              env: this.env,
              identity: authorityRoute.identity,
              request,
              route,
              schema: stored.schema,
              storage: this.ctx.storage,
              writes: {
                apply(write) {
                  return write();
                },
              },
            });

            return Response.json(result.body, {
              headers: result.headers,
              status: result.status,
            });
          } catch (error) {
            if (error instanceof PublicOperationError) {
              return Response.json({ error: error.message }, { status: error.status });
            }

            if (error instanceof BadRequestError) {
              return Response.json({ error: error.message }, { status: 400 });
            }

            throw error;
          }
        }
      }

      function initializeHarnessStorage(storage) {
        const app = workerSchemaAppDefinitions.site;

        if (!app) {
          throw new Error("Public operation harness requires the Site app schema.");
        }

        initializeStorageFromSource(storage, {
          schema: app.sourceSchema,
          records: app.seedRecords,
          changeWritePrefix: app.seedChangeWritePrefix,
        });
      }

      function readCommandExecutionCount(storage) {
        const row = storage.sql.exec("SELECT COUNT(*) AS count FROM command_executions").one();

        return Number(row.count);
      }

      export default {
        fetch(request, env) {
          const id = env.PUBLIC_OPERATION_HARNESS.idFromName(
            request.headers.get("x-public-operation-harness-name") ?? "default",
          );

          return env.PUBLIC_OPERATION_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return createWorkerHarness(
    harnessPath,
    {
      PUBLIC_OPERATION_HARNESS: { className: "PublicOperationHarness", useSQLite: true },
    },
    {
      bindings: input.bindings,
      compatibilityDate: "2026-04-28",
      serviceBindings: {
        FORMLESS_TURNSTILE_SITEVERIFY: input.turnstileVerify,
      },
    },
  );
}

async function turnstileVerifyResponse(request: Request) {
  turnstileRequests.push((await request.json()) as TurnstileVerifyRequest);

  return Response.json(turnstileResponse);
}

function expectTurnstileRequests(
  actual: TurnstileVerifyRequest[],
  expected: Array<{ response: string; secret: string }>,
) {
  expect(actual).toHaveLength(expected.length);

  for (const [index, request] of actual.entries()) {
    expect(request).toMatchObject(expected[index] ?? {});
    expect(request.idempotency_key).toEqual(expect.any(String));
    expect(isUuid(String(request.idempotency_key))).toBe(true);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resetSchemaApp(schemaKey: "tasks" | "site", target: Harness = harness) {
  const response = await target.fetch(`/api/${schemaKey}/reset/seed`, {
    body: "{}",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function resetInstalledApp(
  packageAppKey: "crm" | "site" | "tasks",
  appInstallId: string,
  target: Harness = harness,
) {
  const response = await target.fetch(
    `/api/app-installs/${packageAppKey}/${appInstallId}/reset/seed`,
    {
      body: "{}",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function installSiteSchema(transform: (schema: AppSchema) => void) {
  const current = await getJson<SchemaResponse>("/api/site/schema");
  const schema = structuredClone(current.schema);

  transform(schema);

  await postAdminJson<SchemaUpdateResponse>("/api/site/schema", { schema });
}

async function installEmailStylePublicIntakeSchema(
  target: Harness = harness,
  apiPrefix = "/api/site",
) {
  const current = await getJson<SchemaResponse>(`${apiPrefix}/schema`, target);
  const schema = schemaWithEmailStylePublicIntake(current.schema);

  await postAdminJson<SchemaUpdateResponse>(`${apiPrefix}/schema`, { schema }, target);
}

function publicSubscribeBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  sourceBlockId?: string;
  token?: string;
}) {
  return {
    input: input.input ?? { email: "ada@example.com" },
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: input.sourceBlockId ?? "rec_site_subscribe_form" },
    idempotencyKey: input.idempotencyKey,
  };
}

function publicContactMessageBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  token?: string;
}) {
  return {
    input: input.input ?? {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: "rec_site_contact_form" },
    idempotencyKey: input.idempotencyKey,
  };
}

function publicEmailStyleIntakeBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  sourceBlockId?: string;
  token?: string;
}) {
  return {
    input: input.input ?? emailStylePublicIntakeInput,
    proof: { turnstileToken: input.token ?? "token-ok" },
    source: { siteBlockId: input.sourceBlockId ?? emailStylePublicIntakeFormBlockId },
    idempotencyKey: input.idempotencyKey,
  };
}

async function installPublicRecordPlanSchema(apiPrefix: string) {
  const current = await getJson<SchemaResponse>(`${apiPrefix}/schema`);
  const schema = schemaWithPublicRecordPlanOperation(current.schema);

  await postAdminJson<SchemaUpdateResponse>(`${apiPrefix}/schema`, { schema });
}

function publicRecordPlanBody(input: {
  idempotencyKey: string;
  input?: Record<string, unknown>;
  sourceBlockId?: string;
  token?: string;
}) {
  return {
    input: input.input ?? {
      title: "Public plan task",
      note: "Created from public plan",
    },
    proof: { turnstileToken: input.token ?? "token-ok" },
    ...(input.sourceBlockId === undefined ? {} : { source: { siteBlockId: input.sourceBlockId } }),
    idempotencyKey: input.idempotencyKey,
  };
}

function schemaWithPublicRecordPlanOperation(sourceSchema: AppSchema): AppSchema {
  const schema = structuredClone(sourceSchema);
  const taskEntity = schema.entities.task;

  if (!taskEntity) {
    throw new Error("Expected task entity.");
  }

  schema.entities["task-log"] = taskLogEntity();
  schema.entities.task = {
    ...taskEntity,
    operations: {
      ...taskEntity.operations,
      submitPublicPlan: publicRecordPlanOperation(),
    },
  };

  return schema;
}

function publicRecordPlanOperation(): EntityOperationSchema {
  return {
    label: "Submit public plan",
    kind: "command",
    scope: "collection",
    input: {
      fields: {
        title: { type: "text", required: true, label: "Title" },
        note: { type: "text", required: true, label: "Note" },
      },
    },
    effect: {
      type: "recordPlan",
      steps: publicRecordPlanSteps(),
    },
    output: { type: "command" },
    policy: {
      actors: ["anonymous"],
      access: {
        actor: "anonymous",
        challenge: { kind: "turnstile" },
        origin: { kind: "same-origin" },
      },
    },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function publicRecordPlanSteps(): RecordPlanStepSchema[] {
  return [
    {
      name: "createTask",
      kind: "create",
      entity: "task",
      recordId: { kind: "generatedId", prefix: "task-public" },
      values: {
        title: { kind: "input", field: "title" },
        done: { kind: "literal", value: false },
      },
    },
    {
      name: "createLog",
      kind: "create",
      entity: "task-log",
      values: {
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "stepOutput", step: "createTask", output: "id" },
        },
        label: { kind: "input", field: "note" },
        actorMode: { kind: "actor", field: "mode" },
        sourcePath: { kind: "source", field: "path" },
        occurredAt: { kind: "generatedTimestamp" },
      },
    },
    {
      name: "touchTask",
      kind: "patch",
      entity: "task",
      recordId: { kind: "stepOutput", step: "createTask", output: "id" },
      values: {
        title: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
      },
    },
  ];
}

function taskLogEntity(): AppSchema["entities"][string] {
  return {
    label: "Task log",
    fields: {
      task: {
        type: "reference",
        required: true,
        label: "Task",
        to: "task",
        displayField: "title",
      },
      label: { type: "text", required: true, label: "Label" },
      actorMode: { type: "text", required: true, label: "Actor mode" },
      sourcePath: { type: "text", required: false, label: "Source path" },
      occurredAt: { type: "text", required: true, label: "Occurred at" },
    },
  } as unknown as AppSchema["entities"][string];
}

function contactSubscriptionRecords(records: StoredRecord[]) {
  return {
    contacts: records.filter((record) => record.entity === "contact"),
    emailAddresses: records.filter((record) => record.entity === "email-address"),
    audiences: records.filter((record) => record.entity === "audience"),
    subscriptions: records.filter((record) => record.entity === "subscription"),
  };
}

function contactMessageRecords(records: StoredRecord[]) {
  return records.filter((record) => record.entity === "contact-message");
}

function emailStyleIntakeRecords(records: StoredRecord[]) {
  return records.filter((record) => record.entity === "intake-request");
}

function taskRecordPlanRecords(records: StoredRecord[]) {
  return {
    tasks: records.filter((record) => record.entity === "task"),
    logs: records.filter((record) => record.entity === "task-log"),
  };
}

async function patchSubscriptionStatus(
  recordId: string,
  status: "subscribed" | "unsubscribed",
  target: Harness = harness,
  apiPrefix = "/api/site",
) {
  return postAdminRecordOperation(
    {
      idempotencyKey: `test-subscription-status-${status}`,
      entity: "subscription",
      operationName: "update",
      recordId,
      input: { status },
    },
    target,
    apiPrefix,
  );
}

async function getJson<T>(path: string, target: Harness = harness) {
  const response = await target.fetch(path, {
    headers: adminHeaders(),
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAdminJson<T = unknown>(path: string, body: unknown, target: Harness = harness) {
  const request = operationWriteRequest(path, body);
  const response = await target.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const text = await response.text();

  expect([200, 201], text).toContain(response.status);

  return request.response(JSON.parse(text)) as T;
}

async function postEmailDeliveryScheduleReplay(
  body: EmailDeliveryScheduleRequest,
  target: Harness,
): Promise<EmailDeliveryScheduleResponse> {
  const replay = await postAdminJson<EmailDeliveryScheduleResponse>(
    "/api/formless/email/deliveries/schedule",
    body,
    target,
  );

  expect(replay.replayed).toBe(true);

  return replay;
}

async function postAdminRecordOperation(
  body: Parameters<typeof recordOperationRequest>[0],
  target: Harness = harness,
  apiPrefix = "/api/site",
) {
  const request = recordOperationRequest(body);
  const response = await target.fetch(`${apiPrefix}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const text = await response.text();

  expect([200, 201], text).toContain(response.status);

  return request.response(JSON.parse(text));
}

function crossAppEmailStylePublicIntakeFormBlockValues(): Record<string, unknown> {
  const values = {
    ...emailStylePublicIntakeFormBlockValues,
    operationTargetKind: "appInstall",
    operationTargetPackageAppKey: "tasks",
    operationTargetInstallId: recordPlanInstallId,
  };

  delete (values as Record<string, unknown>).operationTargetSchemaKey;

  return values;
}

function operationInputNotificationIdempotencyKey(operationKey: string, key: string): string {
  const digest = createHash("sha256")
    .update(`operation-input-notification\n${operationKey}\n${key}`)
    .digest("hex");

  return `operation-input-notification:${digest}`;
}

function contactNotificationIdempotencyKey(invocationId: string, key: string): string {
  const digest = createHash("sha256").update(`${invocationId}\n${key}`).digest("hex");

  return `contact-notification:${digest}`;
}

async function configureContactNotificationEmail(target: Harness) {
  const route = await createControlPlaneRecord(
    "route",
    "contact-notification-primary-route",
    {
      enabled: true,
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
      surface: "admin",
      access: "owner",
    },
    target,
  );
  const domain = await createControlPlaneRecord(
    "email-domain",
    "contact-notification-email-domain",
    {
      enabled: true,
      providerFamily: "cloudflare",
      domain: "mail.example.com",
      primaryRoute: route.id,
      dnsStatus: "verified",
    },
    target,
  );
  const sender = await createControlPlaneRecord(
    "email-sender",
    "contact-notification-email-sender",
    {
      enabled: true,
      address: "contact@mail.example.com",
      displayName: "Contact",
      purpose: "contact-notification",
      emailDomain: domain.id,
    },
    target,
  );

  await createControlPlaneRecord(
    "instance-settings",
    "contact-notification-instance-settings",
    {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      primaryRoute: route.id,
      authRelyingPartyId: "www.example.com",
      defaultEmailDomain: domain.id,
      defaultContactSender: sender.id,
      contactNotificationRecipient: "owner@example.com",
      productionIdentityStatus: "configured",
    },
    target,
  );

  return { domain, route, sender };
}

async function createControlPlaneRecord(
  entity: string,
  idempotencyKey: string,
  input: Record<string, unknown>,
  target: Harness,
): Promise<StoredRecord> {
  const response = await postAdminJson<OperationInvocationResponse>(
    `/api/formless/control-plane/operations/${entity}/create`,
    {
      idempotencyKey,
      input,
    },
    target,
  );

  if (response.output.type !== "create") {
    throw new Error(`Expected ${entity}.create to return create output.`);
  }

  return response.output.record;
}

async function createMappedPublicSiteRoute(target: Harness, host: string, appInstallId: string) {
  await postAdminJson(
    "/api/formless/control-plane/operations/route/create",
    {
      idempotencyKey: `route-host-publicSite-${host}`,
      input: {
        enabled: true,
        matchHost: host,
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: appInstallId,
        surface: "public-site",
      },
    },
    target,
  );
}

function postPublicOperation(path: string, body: unknown, target: Harness = harness) {
  return target.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://example.com",
    },
    method: "POST",
  });
}

function postPublicOperationHarness(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return publicOperationHarness.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://example.com",
      "x-public-operation-harness-name": publicOperationHarnessName,
      ...headers,
    },
    method: "POST",
  });
}

function postPublicOperationHarnessHost(host: string, path: string, body: unknown, origin: string) {
  return publicOperationHarness.mf.dispatchFetch(`http://${host}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "x-public-operation-harness-name": publicOperationHarnessName,
    },
    method: "POST",
  });
}

async function readPublicOperationHarnessRecords() {
  const response = await publicOperationHarness.fetch("/records", {
    headers: {
      "x-public-operation-harness-name": publicOperationHarnessName,
    },
  });

  expect(response.status).toBe(200);

  return (await response.json()) as StoredRecord[];
}

async function readPublicOperationInvocations() {
  const response = await publicOperationHarness.fetch("/operation-invocations", {
    headers: {
      "x-public-operation-harness-name": publicOperationHarnessName,
    },
  });

  expect(response.status).toBe(200);

  return (await response.json()) as StoredOperationInvocation[];
}

async function readPublicOperationHarnessState() {
  const response = await publicOperationHarness.fetch("/state", {
    headers: {
      "x-public-operation-harness-name": publicOperationHarnessName,
    },
  });

  expect(response.status).toBe(200);

  return (await response.json()) as PublicOperationHarnessState;
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
