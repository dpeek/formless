import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import type { AppSchema, EntityOperationSchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";

import {
  installedAppStorageIdentity,
  schemaKeyStorageIdentity,
  type AppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { scheduleSiteOperationInputNotificationAfterPublicOperation } from "./site-operation-input-notifications.ts";

type OperationFormTarget =
  | {
      kind: "schemaKey";
      schemaKey: string;
    }
  | {
      installId: string;
      kind: "appInstall";
      packageAppKey: string;
    };

describe("Site operation input notification scheduling", () => {
  it("schedules structured operation input email from a committed public operation form", async () => {
    const scheduled: unknown[] = [];

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env: fakeNotificationEnv(notificationControlPlaneRecords(), scheduled),
      identity: schemaKeyStorageIdentity("site"),
      records: operationFormSourceRecords({ replyToField: "email" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response: operationInputResponse({
        input: {
          fullName: "Ada Lovelace",
          email: "Ada@Example.COM",
          details: "Need <testing> & review.\nSecond line.",
          tier: "priority",
          acceptedTerms: true,
          quantity: 3,
        },
      }),
      schema: operationInputSchema(),
    });

    expect(scheduled).toEqual([
      {
        canonicalOrigin: "https://www.example.com",
        idempotencyKey: expect.stringMatching(/^operation-input-notification:[a-f0-9]{64}$/),
        message: {
          subject: "New public operation input for request.submit",
          text: expect.stringContaining("Target storage: site"),
          html: expect.stringContaining("Need &lt;testing&gt; &amp; review.<br>Second line."),
        },
        messageKind: "site-operation-input-notification",
        recipients: [
          {
            address: "owner@example.com",
            displayName: "Public operation",
          },
        ],
        replyTo: {
          address: "Ada@example.com",
        },
        sender: {
          id: "email-sender:contact@mail.example.com",
        },
        source: {
          operationId: "operation:request.submit:operation-input-notify",
          recordId: "request-1",
          storageIdentity: "site",
        },
      },
    ]);
    const message = (scheduled[0] as { message: { html: string; text: string } }).message;

    expect(message.text).toContain("Request details <safe label>: Need <testing> & review.");
    expect(message.text).toContain("Tier: Priority");
    expect(message.text).toContain("Accepted terms: Yes");
    expect(message.text).toContain("Quantity: 3");
    expect(message.html).toContain("<table");
    expect(message.html).not.toContain("<dl>");
    expect(message.html).toMatch(
      /<tr><th scope="row"[^>]*>Target storage<\/th><td[^>]*>site<\/td><\/tr>/,
    );
    expect(message.html).toMatch(
      /<tr><th scope="row"[^>]*>Request details &lt;safe label&gt;<\/th><td[^>]*>Need &lt;testing&gt; &amp; review\.<br>Second line\.<\/td><\/tr>/,
    );
    expect(message.html).toContain("Request details &lt;safe label&gt;");
    expect(message.html).not.toContain("<testing>");
  });

  it("omits invalid reply-to values without skipping the notification", async () => {
    const scheduled: unknown[] = [];

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env: fakeNotificationEnv(notificationControlPlaneRecords(), scheduled),
      identity: schemaKeyStorageIdentity("site"),
      records: operationFormSourceRecords({ replyToField: "email" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response: operationInputResponse({
        input: {
          fullName: "Ada Lovelace",
          email: "not-an-email",
          details: "Need review.",
          tier: "standard",
        },
      }),
      schema: operationInputSchema(),
    });

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).not.toHaveProperty("replyTo");
  });

  it("schedules command handler operation input email from the public command wrapper", async () => {
    const scheduled: unknown[] = [];
    const operation = requestSubmitCommandHandlerOperation();

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env: fakeNotificationEnv(notificationControlPlaneRecords(), scheduled),
      identity: schemaKeyStorageIdentity("site"),
      records: operationFormSourceRecords({ replyToField: "email" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response: operationInputCommandResponse({
        input: {
          email: "Ada@Example.COM",
          wantsNewsletter: false,
        },
        operation,
      }),
      schema: operationInputSchema(operation),
    });

    expect(scheduled).toHaveLength(1);

    const delivery = scheduled[0] as {
      message: { html: string; text: string };
      replyTo: { address: string };
      source: Record<string, unknown>;
    };

    expect(delivery.message.text).toContain("Email: Ada@Example.COM");
    expect(delivery.message.text).toContain("Wants newsletter: No");
    expect(delivery.message.html).toMatch(
      /<tr><th scope="row"[^>]*>Wants newsletter<\/th><td[^>]*>No<\/td><\/tr>/,
    );
    expect(delivery.replyTo).toEqual({ address: "Ada@example.com" });
    expect(delivery.source).not.toHaveProperty("recordId");
  });

  it("skips scheduling when form or email configuration is incomplete", async () => {
    const scheduled: unknown[] = [];
    const response = operationInputResponse();

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env: fakeNotificationEnv(notificationControlPlaneRecords(), scheduled),
      identity: schemaKeyStorageIdentity("site"),
      records: operationFormSourceRecords({ mode: "none" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });
    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env: fakeNotificationEnv([], scheduled),
      identity: schemaKeyStorageIdentity("site"),
      records: operationFormSourceRecords(),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });

    expect(scheduled).toEqual([]);
  });

  it("requires declared public operation form targets to match the committed operation target", async () => {
    const scheduled: unknown[] = [];
    const identity = installedAppStorageIdentity({ installId: "requests", packageAppKey: "tasks" });

    if (!identity) {
      throw new Error("Expected installed app identity.");
    }

    const matchingRecords = operationFormSourceRecords({
      target: {
        installId: "requests",
        kind: "appInstall",
        packageAppKey: "tasks",
      },
    });
    const mismatchedRecords = operationFormSourceRecords({
      target: {
        installId: "other",
        kind: "appInstall",
        packageAppKey: "tasks",
      },
    });

    expect(matchingRecords[0]?.values.operationTargetInstallId).toBe("requests");
    expect(mismatchedRecords[0]?.values.operationTargetInstallId).toBe("other");

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env: fakeNotificationEnv(notificationControlPlaneRecords(), scheduled),
      identity,
      records: matchingRecords,
      requestUrl:
        "https://www.example.com/api/app-installs/tasks/requests/public/operations/request/submit",
      response: operationInputResponse({ identity }),
      schema: operationInputSchema(),
    });
    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env: fakeNotificationEnv(notificationControlPlaneRecords(), scheduled),
      identity,
      records: mismatchedRecords,
      requestUrl:
        "https://www.example.com/api/app-installs/tasks/requests/public/operations/request/submit",
      response: operationInputResponse({ identity }),
      schema: operationInputSchema(),
    });

    expect(scheduled).toHaveLength(1);
  });

  it("uses stable operation input notification idempotency for the same operation retry", async () => {
    const scheduled: unknown[] = [];
    const env = fakeNotificationEnv(notificationControlPlaneRecords(), scheduled);
    const response = operationInputResponse();

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env,
      identity: schemaKeyStorageIdentity("site"),
      records: operationFormSourceRecords(),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });
    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      env,
      identity: schemaKeyStorageIdentity("site"),
      records: operationFormSourceRecords(),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });

    expect(scheduled).toHaveLength(2);
    expect((scheduled[0] as { idempotencyKey: string }).idempotencyKey).toBe(
      (scheduled[1] as { idempotencyKey: string }).idempotencyKey,
    );
  });
});

function fakeNotificationEnv(records: StoredRecord[], scheduled: unknown[]) {
  return {
    FORMLESS_AUTHORITY: {
      idFromName(name: string) {
        return { name };
      },
      get(_id: unknown) {
        return {
          async fetch(request: Request) {
            const url = new URL(request.url);

            if (url.pathname === "/api/formless/control-plane/_internal/read-records") {
              return Response.json({ records });
            }

            if (url.pathname === "/_internal/email/deliveries/schedule") {
              scheduled.push(await request.json());

              return Response.json({
                delivery: { id: "delivery-1" },
                replayed: false,
              });
            }

            return Response.json({ error: "Not found." }, { status: 404 });
          },
        };
      },
    } as unknown as DurableObjectNamespace,
  };
}

function notificationControlPlaneRecords(): StoredRecord[] {
  return [
    record("route:primary", "route", {
      enabled: true,
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
      surface: "admin",
    }),
    record("settings:instance", "instance-settings", {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      primaryRoute: "route:primary",
      defaultContactSender: "email-sender:contact@mail.example.com",
      contactNotificationRecipient: "owner@example.com",
      productionIdentityStatus: "configured",
    }),
  ];
}

function operationFormSourceRecords(
  input: {
    mode?: "email" | "none";
    replyToField?: string;
    target?: OperationFormTarget;
  } = {},
): StoredRecord[] {
  return [
    record("form-block", "block", {
      type: "publicOperationForm",
      label: "Request a review",
      operationKey: "request.submit",
      operationNotificationMode: input.mode ?? "email",
      ...(input.replyToField === undefined
        ? {}
        : { operationNotificationReplyToField: input.replyToField }),
      ...operationFormTargetValues(input.target),
    }),
  ];
}

function operationFormTargetValues(target: OperationFormTarget | undefined): RecordValues {
  if (!target) {
    return {};
  }

  if (target.kind === "schemaKey") {
    return {
      operationTargetKind: "schemaKey",
      operationTargetSchemaKey: target.schemaKey,
    };
  }

  return {
    operationTargetKind: "appInstall",
    operationTargetPackageAppKey: target.packageAppKey,
    operationTargetInstallId: target.installId,
  };
}

function operationInputSchema(
  operation: EntityOperationSchema = requestSubmitOperation(),
): AppSchema {
  return {
    version: 1,
    entities: {
      request: {
        label: "Request",
        fields: {
          fullName: { type: "text", required: true, label: "Full name" },
          email: { type: "text", required: false, label: "Email" },
          details: {
            type: "text",
            required: true,
            label: "Request details <safe label>",
            format: "longText",
          },
          tier: {
            type: "enum",
            required: true,
            label: "Tier",
            values: {
              standard: { label: "Standard" },
              priority: { label: "Priority" },
            },
          },
          acceptedTerms: { type: "boolean", required: false, label: "Accepted terms" },
          quantity: { type: "number", required: false, label: "Quantity" },
        },
        operations: {
          submit: operation,
        },
      },
    },
    queries: {},
    itemViews: {},
    tableViews: {},
    views: {},
  };
}

function requestSubmitOperation(): EntityOperationSchema {
  return {
    label: "Submit request",
    kind: "create",
    scope: "collection",
    input: {
      fields: {
        fullName: { field: "fullName", required: true },
        email: { field: "email", required: false },
        details: { field: "details", required: true },
        tier: { field: "tier", required: true },
        acceptedTerms: { field: "acceptedTerms", required: false },
        quantity: { field: "quantity", required: false },
      },
    },
    effect: { type: "createRecord" },
    output: { type: "create" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function requestSubmitCommandHandlerOperation(): EntityOperationSchema {
  return {
    label: "Submit request",
    kind: "command",
    scope: "collection",
    input: {
      fields: {
        email: { field: "email", required: true },
        wantsNewsletter: { type: "boolean", required: false, label: "Wants newsletter" },
      },
    },
    effect: { type: "operationHandler", handler: "subscribe", config: {} },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function operationInputResponse(
  input: {
    identity?: AppStorageIdentity;
    input?: RecordValues;
  } = {},
): OperationInvocationResponse {
  const identity = input.identity ?? schemaKeyStorageIdentity("site");
  const values = input.input ?? {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    details: "Need review.",
    tier: "priority",
  };
  const operation = requestSubmitOperation();

  return {
    invocation: {
      invocationId: "operation:request.submit:operation-input-notify",
      actor: { kind: "anonymous" },
      appStorageIdentity: identity,
      idempotency: {
        required: true,
        key: "operation-input-notify",
        source: "caller",
        writeIdentity: "operation:request.submit:operation-input-notify",
      },
      input: {
        type: "create",
        values,
      },
      operation: {
        entityName: "request",
        operationName: "submit",
        canonicalKey: "request.submit",
        kind: "create",
        scope: "collection",
        output: { type: "create" },
      },
      receivedAt: "2026-06-24T00:00:00.000Z",
      schemaOperation: operation,
      source: {
        host: "www.example.com",
        path: "/api/site/public/operations/request/submit",
        protocol: "public",
        siteBlockId: "form-block",
      },
    },
    output: {
      type: "create",
      affectedChangeIds: ["1"],
      changes: [],
      cursor: 1,
      record: {
        id: "request-1",
        entity: "request",
        values,
        createdAt: "2026-06-24T00:00:00.000Z",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
    },
    status: "committed",
  };
}

function operationInputCommandResponse(input: {
  identity?: AppStorageIdentity;
  input: RecordValues;
  operation: EntityOperationSchema;
}): OperationInvocationResponse {
  const identity = input.identity ?? schemaKeyStorageIdentity("site");

  return {
    invocation: {
      invocationId: "operation:request.submit:operation-input-notify",
      actor: { kind: "anonymous" },
      appStorageIdentity: identity,
      idempotency: {
        required: true,
        key: "operation-input-notify",
        source: "caller",
        writeIdentity: "operation:request.submit:operation-input-notify",
      },
      input: {
        type: "command",
        input: {
          input: input.input,
          proof: { kind: "turnstile", token: "token-ok" },
        },
      },
      operation: {
        entityName: "request",
        operationName: "submit",
        canonicalKey: "request.submit",
        kind: input.operation.kind,
        scope: input.operation.scope,
        output: input.operation.output,
        ...(input.operation.effect === undefined ? {} : { effect: input.operation.effect }),
      },
      receivedAt: "2026-06-24T00:00:00.000Z",
      schemaOperation: input.operation,
      source: {
        host: "www.example.com",
        path: "/api/site/public/operations/request/submit",
        protocol: "public",
        siteBlockId: "form-block",
      },
    },
    output: {
      type: "command",
      affectedChangeIds: ["1"],
      changes: [],
      cursor: 1,
    },
    status: "committed",
  };
}

function record(id: string, entity: string, values: RecordValues): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}
