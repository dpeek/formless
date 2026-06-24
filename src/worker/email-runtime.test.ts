import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import type { EmailDeliveryRecord } from "../shared/email-runtime.ts";
import type { CloudflareSendEmailMessage } from "./email-runtime.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessFetchInit = Parameters<Harness["fetch"]>[1];

let harness: Harness | undefined;
let harnessDir: string | undefined;

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;

  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("email runtime delivery scheduling", () => {
  it("records accepted provider status and replays accepted idempotency keys without duplicate sends", async () => {
    harness = await createEmailRuntimeHarness();

    const first = await postSchedule();
    const second = await postSchedule();
    const sends = await getJson<{ sends: CloudflareSendEmailMessage[] }>("/sends");
    const deliveries = await getJson<{ deliveries: EmailDeliveryRecord[] }>("/deliveries");

    expect(first).toMatchObject({
      replayed: false,
      sent: true,
      delivery: {
        attemptCount: 1,
        canonicalOrigin: "https://www.example.com",
        idempotencyKey: "contact-message-1",
        messageKind: "site.contactNotification",
        providerFamily: "cloudflare",
        providerMessageId: "message-1",
        recipients: [{ address: "owner@example.com" }],
        replyTo: { address: "visitor@example.net" },
        sender: {
          address: "contact@mail.example.com",
          displayName: "Example Contact",
          id: "email-sender:contact@mail.example.com",
        },
        status: "accepted",
      },
    });
    expect(first.delivery).not.toHaveProperty("latestError");
    expect(second).toMatchObject({
      replayed: true,
      sent: false,
      delivery: {
        id: first.delivery.id,
        providerMessageId: "message-1",
        status: "accepted",
      },
    });
    expect(sends.sends).toEqual([
      {
        from: { email: "contact@mail.example.com", name: "Example Contact" },
        to: ["owner@example.com"],
        subject: "New contact message",
        replyTo: "visitor@example.net",
        text: "Plain text body",
        html: "<p>HTML body</p>",
      },
    ]);
    expect(deliveries.deliveries).toHaveLength(1);
    expect(JSON.stringify(deliveries.deliveries[0])).not.toContain("Plain text body");
    expect(JSON.stringify(deliveries.deliveries[0])).not.toContain("<p>HTML body</p>");
  });

  it("retries failed deliveries and records only display-safe provider errors", async () => {
    harness = await createEmailRuntimeHarness();

    const failed = await postSchedule({ failProvider: true, idempotencyKey: "retry-message-1" });
    const accepted = await postSchedule({ idempotencyKey: "retry-message-1" });
    const sends = await getJson<{ sends: CloudflareSendEmailMessage[] }>("/sends");

    expect(failed).toMatchObject({
      replayed: false,
      sent: false,
      delivery: {
        attemptCount: 1,
        latestError: "Email provider delivery failed.",
        status: "failed",
      },
    });
    expect(failed.delivery).not.toHaveProperty("providerMessageId");
    expect(accepted).toMatchObject({
      replayed: true,
      sent: true,
      delivery: {
        attemptCount: 2,
        providerMessageId: "message-2",
        status: "accepted",
      },
    });
    expect(accepted.delivery).not.toHaveProperty("latestError");
    expect(sends.sends).toHaveLength(2);
    expect(JSON.stringify(accepted.delivery)).not.toContain("secret-provider-token");
  });

  it("rejects unverified senders before recording a delivery", async () => {
    harness = await createEmailRuntimeHarness();

    const response = await fetchEmailRuntime("/schedule", {
      body: JSON.stringify(scheduleBody({ senderId: "email-sender:pending@mail.example.com" })),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as { error: string };
    const deliveries = await getJson<{ deliveries: EmailDeliveryRecord[] }>("/deliveries");

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Email sender must be enabled and verified." });
    expect(deliveries.deliveries).toEqual([]);
  });
});

async function createEmailRuntimeHarness() {
  return createWorkerHarness(await writeEmailRuntimeHarness(), {
    EMAIL_RUNTIME_HARNESS: { className: "EmailRuntimeHarness", useSQLite: true },
  });
}

async function writeEmailRuntimeHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-email-runtime-harness-"));
  const harnessPath = join(harnessDir, "email-runtime-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        parseEmailDeliveryScheduleRequest,
      } from "${process.cwd()}/src/shared/email-runtime.ts";
      import {
        scheduleEmailDelivery,
      } from "${process.cwd()}/src/worker/email-runtime.ts";
      import {
        ensureEmailDeliveryTables,
        listEmailDeliveries,
      } from "${process.cwd()}/src/worker/email-runtime-state.ts";

      export default {
        fetch(request, env) {
          const id = env.EMAIL_RUNTIME_HARNESS.idFromName("email-runtime");
          return env.EMAIL_RUNTIME_HARNESS.get(id).fetch(request);
        },
      };

      export class EmailRuntimeHarness extends DurableObject {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/schedule") {
            try {
              const body = await request.json();
              const scheduleBody = { ...body };
              delete scheduleBody.now;
              delete scheduleBody.failProvider;
              const result = await scheduleEmailDelivery({
                controlPlaneRecords,
                now: body.now,
                request: parseEmailDeliveryScheduleRequest(scheduleBody),
                sendEmail: sendEmailBinding(this.ctx.storage, body.failProvider === true),
                storage: this.ctx.storage,
              });

              return Response.json(result);
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Email scheduling failed." },
                { status: 400 },
              );
            }
          }

          if (url.pathname === "/deliveries") {
            return Response.json({ deliveries: listEmailDeliveries(this.ctx.storage) });
          }

          if (url.pathname === "/sends") {
            ensureSendTable(this.ctx.storage);
            return Response.json({
              sends: this.ctx.storage.sql
                .exec("SELECT message_json FROM fake_email_sends ORDER BY send_id ASC")
                .toArray()
                .map((row) => JSON.parse(row.message_json)),
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function sendEmailBinding(storage, failProvider) {
        return {
          async send(message) {
            ensureEmailDeliveryTables(storage);
            ensureSendTable(storage);
            storage.sql.exec(
              "INSERT INTO fake_email_sends (message_json) VALUES (?)",
              JSON.stringify(message),
            );
            const sendCount = storage.sql
              .exec("SELECT COUNT(*) AS count FROM fake_email_sends")
              .one().count;

            if (failProvider) {
              throw new Error("secret-provider-token leaked from provider");
            }

            return { messageId: \`message-\${sendCount}\` };
          },
        };
      }

      function ensureSendTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_sends (
            send_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_json TEXT NOT NULL
          )
        \`);
      }

      const createdAt = "2026-06-24T00:00:00.000Z";

      function record(id, entity, values) {
        return { id, entity, values, createdAt, updatedAt: createdAt };
      }

      const controlPlaneRecords = [
        record("email-domain:mail.example.com", "email-domain", {
          enabled: true,
          providerFamily: "cloudflare",
          domain: "mail.example.com",
          verificationStatus: "verified",
        }),
        record("email-sender:contact@mail.example.com", "email-sender", {
          enabled: true,
          address: "contact@mail.example.com",
          displayName: "Example Contact",
          purpose: "contact-notification",
          emailDomain: "email-domain:mail.example.com",
          verificationStatus: "verified",
        }),
        record("email-sender:pending@mail.example.com", "email-sender", {
          enabled: true,
          address: "pending@mail.example.com",
          purpose: "contact-notification",
          emailDomain: "email-domain:mail.example.com",
          verificationStatus: "pending",
        }),
      ];
    `,
  );

  return harnessPath;
}

type ScheduleBodyOverrides = {
  failProvider?: boolean;
  idempotencyKey?: string;
  senderId?: string;
};

async function postSchedule(overrides: ScheduleBodyOverrides = {}) {
  return postJson<{
    delivery: EmailDeliveryRecord;
    replayed: boolean;
    sent: boolean;
  }>("/schedule", scheduleBody(overrides));
}

function scheduleBody(overrides: ScheduleBodyOverrides = {}) {
  return {
    messageKind: "site.contactNotification",
    source: {
      storageIdentity: "app:site",
      operationId: "operation_123",
    },
    idempotencyKey: overrides.idempotencyKey ?? "contact-message-1",
    sender: { id: overrides.senderId ?? "email-sender:contact@mail.example.com" },
    recipients: [{ address: "owner@example.com" }],
    replyTo: { address: "visitor@example.net" },
    canonicalOrigin: "https://www.example.com",
    message: {
      subject: "New contact message",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    },
    now: "2026-06-24T00:01:00.000Z",
    ...(overrides.failProvider === undefined ? {} : { failProvider: overrides.failProvider }),
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchEmailRuntime(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetchEmailRuntime(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function fetchEmailRuntime(path: string, init?: HarnessFetchInit) {
  if (!harness) {
    throw new Error("Email runtime harness was not created.");
  }

  return harness.fetch(path, init);
}
