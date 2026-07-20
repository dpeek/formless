import type { StoredRecord } from "@dpeek/formless-storage";
import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import {
  EMAIL_DELIVERY_SCHEDULE_API_PATH,
  emailDeliverySendRuntimeJob,
  parseEmailDeliveryAddress,
  parseEmailDeliverySendRuntimeJob,
  parseEmailDeliveryRenderedMessage,
  parseEmailDeliveryScheduleRequest,
  type EmailDeliveryAddress,
  type EmailDeliveryRecord,
  type EmailDeliveryRenderedMessage,
  type EmailDeliveryScheduleRequest,
  type EmailDeliveryScheduleResponse,
  type EmailDeliverySendRuntimeJob,
  type EmailDeliverySender,
} from "../shared/email-runtime.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import type { DeploymentControlPlaneClientEnv } from "./deployment-control-plane-client.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  createEmailDeliveryIfAbsent,
  markEmailDeliveryAccepted,
  markEmailDeliveryFailed,
  markEmailDeliveryQueued,
  markEmailDeliverySending,
  readEmailDeliveryById,
  readEmailDeliveryQueueHandoff,
  readEmailDeliveryRenderedMessageById,
} from "./email-runtime-state.ts";

export const INTERNAL_EMAIL_DELIVERY_SCHEDULE_PATH = "/_internal/email/deliveries/schedule";
export const INTERNAL_EMAIL_DELIVERY_ATTEMPT_PATH = "/_internal/email/deliveries/attempt";

type EmailRuntimeApiEnv = AuthorityAdminGuardEnv &
  DeploymentControlPlaneClientEnv & {
    FORMLESS_AUTHORITY: DurableObjectNamespace;
    FORMLESS_EMAIL?: CloudflareSendEmailBinding;
  };

type DurableObjectEmailRuntimeEnv = AuthorityAdminGuardEnv &
  DeploymentControlPlaneClientEnv & {
    FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
    FORMLESS_EMAIL?: CloudflareSendEmailBinding;
  };

type EmailDeliveryQueueConsumerEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export type CloudflareSendEmailAddress = string | { email: string; name: string };

export type CloudflareSendEmailMessage = {
  from: CloudflareSendEmailAddress;
  to: CloudflareSendEmailAddress | CloudflareSendEmailAddress[];
  subject: string;
  replyTo?: CloudflareSendEmailAddress;
  text: string;
  html?: string;
};

export type CloudflareSendEmailBinding = {
  send(message: CloudflareSendEmailMessage): Promise<{ messageId: string }>;
};

export type EmailDeliveryQueueBinding = {
  send(message: EmailDeliverySendRuntimeJob): Promise<unknown>;
};

export type PlatformEmailDefaultSenderPurpose = "auth" | "contact-notification";

const defaultSenderFieldByPurpose = {
  auth: "defaultAuthSender",
  "contact-notification": "defaultContactSender",
} as const satisfies Record<PlatformEmailDefaultSenderPurpose, string>;

export type ScheduleEmailDeliveryInput = {
  controlPlaneRecords: readonly StoredRecord[];
  emailDeliveryQueue?: EmailDeliveryQueueBinding;
  now?: string;
  request: EmailDeliveryScheduleRequest;
  storage: DurableObjectStorage;
  targetAuthorityName: string;
};

export type ScheduleEmailDeliveryResult = EmailDeliveryScheduleResponse & {
  queued: boolean;
};

export type EmailDeliveryAttemptDisposition =
  | "accepted"
  | "already-accepted"
  | "permanent-failure"
  | "retry";

export type EmailDeliveryAttemptResult = {
  delivery?: EmailDeliveryRecord;
  disposition: EmailDeliveryAttemptDisposition;
  error?: string;
};

export async function handleInstanceEmailRuntimeApiRequest(
  request: Request,
  env: EmailRuntimeApiEnv,
): Promise<Response | undefined> {
  if (new URL(request.url).pathname !== EMAIL_DELIVERY_SCHEDULE_API_PATH) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceEmailRuntimeDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectEmailRuntimeEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const isSchedulePath =
    url.pathname === INTERNAL_EMAIL_DELIVERY_SCHEDULE_PATH ||
    url.pathname === EMAIL_DELIVERY_SCHEDULE_API_PATH;
  const isAttemptPath = url.pathname === INTERNAL_EMAIL_DELIVERY_ATTEMPT_PATH;

  if (!isSchedulePath && !isAttemptPath) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  if (isAttemptPath) {
    const job = parseEmailDeliverySendRuntimeJob(await readJson(request));
    const result = await attemptEmailDelivery({
      deliveryId: job.deliveryId,
      sendEmail: env.FORMLESS_EMAIL,
      storage,
    });

    return jsonResponse(result);
  }

  if (url.pathname !== INTERNAL_EMAIL_DELIVERY_SCHEDULE_PATH) {
    const authorization = await authorizeInstanceWrite(request, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }
  }

  try {
    const scheduleRequest = parseEmailDeliveryScheduleRequest(await readJson(request));
    const controlPlaneRecords =
      (await readControlPlaneRecords({
        env,
        requestUrl: request.url,
      })) ?? [];
    const result = await scheduleEmailDelivery({
      controlPlaneRecords,
      emailDeliveryQueue: env.FORMLESS_EMAIL_DELIVERY_QUEUE,
      request: scheduleRequest,
      storage,
      targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
    });

    return jsonResponse({
      delivery: result.delivery,
      replayed: result.replayed,
    } satisfies EmailDeliveryScheduleResponse);
  } catch (error) {
    return jsonResponse({ error: displaySafeEmailError(error) }, 400);
  }
}

export async function handleInstanceEmailDeliveryQueueBatch(
  batch: MessageBatch<unknown>,
  env: EmailDeliveryQueueConsumerEnv,
): Promise<void> {
  await Promise.all(
    batch.messages.map(async (message) => {
      const disposition = await consumeEmailDeliveryQueueMessage(message.body, env);

      if (disposition === "retry") {
        message.retry();
        return;
      }

      message.ack();
    }),
  );
}

export async function schedulePlatformEmailDelivery(input: {
  env: Pick<EmailRuntimeApiEnv, "FORMLESS_AUTHORITY">;
  request: EmailDeliveryScheduleRequest;
  requestUrl: string;
}): Promise<EmailDeliveryScheduleResponse> {
  const id = input.env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(INTERNAL_EMAIL_DELIVERY_SCHEDULE_PATH, input.requestUrl), {
      body: JSON.stringify(input.request),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = (await response.json()) as {
    delivery?: EmailDeliveryRecord;
    error?: string;
    replayed?: boolean;
  };

  if (!response.ok || !body.delivery || typeof body.replayed !== "boolean") {
    throw new Error(body.error ?? "Email delivery scheduling failed.");
  }

  return {
    delivery: body.delivery,
    replayed: body.replayed,
  };
}

export function resolveDefaultEmailSenderReference(
  records: readonly StoredRecord[],
  purpose: PlatformEmailDefaultSenderPurpose,
): { id: string } | undefined {
  const settings = activeInstanceSettingsRecord(records);
  const fieldName = defaultSenderFieldByPurpose[purpose];
  const senderId = stringRecordValue(settings?.values[fieldName]);

  return senderId === undefined ? undefined : { id: senderId };
}

export function resolveConfiguredDefaultCloudflareSender(
  records: readonly StoredRecord[],
  purpose: PlatformEmailDefaultSenderPurpose,
): EmailDeliverySender | undefined {
  const sender = resolveDefaultEmailSenderReference(records, purpose);

  if (sender === undefined) {
    return undefined;
  }

  const senderRecord = activeControlPlaneRecord(records, "email-sender", sender.id);

  if (stringRecordValue(senderRecord?.values.purpose) !== purpose) {
    throw new DisplaySafeEmailRuntimeError(
      `Default ${purpose} email sender must reference a sender with purpose "${purpose}".`,
    );
  }

  return resolveConfiguredCloudflareSender(records, sender.id);
}

export async function scheduleEmailDelivery(
  input: ScheduleEmailDeliveryInput,
): Promise<ScheduleEmailDeliveryResult> {
  const now = input.now ?? nowIsoString();
  const sender = resolveConfiguredCloudflareSender(
    input.controlPlaneRecords,
    input.request.sender.id,
  );
  const request = {
    ...input.request,
    message: parseEmailDeliveryRenderedMessage(
      "Email delivery rendered message",
      input.request.message,
    ),
  };
  const ensured = createEmailDeliveryIfAbsent(input.storage, {
    now,
    request,
    sender,
  });

  if (ensured.delivery.status === "accepted" || ensured.delivery.status === "sending") {
    return {
      delivery: ensured.delivery,
      replayed: ensured.replayed,
      queued: false,
    };
  }

  const existingHandoff = readEmailDeliveryQueueHandoff(input.storage, ensured.delivery.id);

  if (existingHandoff) {
    return {
      delivery: ensured.delivery,
      replayed: ensured.replayed,
      queued: false,
    };
  }

  const job = await enqueueEmailDeliverySendRuntimeJob({
    delivery: ensured.delivery,
    enqueuedAt: now,
    queue: input.emailDeliveryQueue,
    targetAuthorityName: input.targetAuthorityName,
  });

  markEmailDeliveryQueued(input.storage, {
    deliveryId: ensured.delivery.id,
    enqueuedAt: job.enqueuedAt,
    jobId: job.jobId,
  });

  return {
    delivery: ensured.delivery,
    replayed: ensured.replayed,
    queued: true,
  };
}

export async function enqueueEmailDeliverySendRuntimeJob(input: {
  delivery: EmailDeliveryRecord;
  enqueuedAt: string;
  queue?: EmailDeliveryQueueBinding;
  targetAuthorityName: string;
}): Promise<EmailDeliverySendRuntimeJob> {
  if (!input.queue) {
    throw new DisplaySafeEmailRuntimeError("Email delivery queue is not configured.");
  }

  const job = emailDeliverySendRuntimeJob({
    deliveryId: input.delivery.id,
    enqueuedAt: input.enqueuedAt,
    idempotencyKey: input.delivery.idempotencyKey,
    targetAuthorityName: input.targetAuthorityName,
  });

  try {
    await input.queue.send(job);
  } catch {
    throw new DisplaySafeEmailRuntimeError("Email delivery queue handoff failed.");
  }

  return job;
}

export async function attemptEmailDelivery(input: {
  deliveryId: string;
  now?: string;
  sendEmail?: CloudflareSendEmailBinding;
  storage: DurableObjectStorage;
}): Promise<EmailDeliveryAttemptResult> {
  const delivery = readEmailDeliveryById(input.storage, input.deliveryId);

  if (!delivery) {
    return {
      disposition: "permanent-failure",
      error: "Email delivery record was not found.",
    };
  }

  if (delivery.status === "accepted") {
    return {
      delivery,
      disposition: "already-accepted",
    };
  }

  const message = readEmailDeliveryRenderedMessageById(input.storage, delivery.id);
  const now = input.now ?? nowIsoString();

  if (!message) {
    return {
      delivery: markEmailDeliveryFailed(input.storage, {
        deliveryId: delivery.id,
        latestError: "Email delivery message state was not found.",
        now,
      }),
      disposition: "permanent-failure",
      error: "Email delivery message state was not found.",
    };
  }

  const sending = markEmailDeliverySending(input.storage, {
    deliveryId: delivery.id,
    now,
  });

  try {
    const accepted = await sendCloudflareEmailDelivery({
      delivery: sending,
      message,
      sendEmail: input.sendEmail,
    });

    return {
      delivery: markEmailDeliveryAccepted(input.storage, {
        deliveryId: delivery.id,
        now,
        providerMessageId: accepted.messageId,
      }),
      disposition: "accepted",
    };
  } catch (error) {
    const failure = displaySafeEmailAttemptFailure(error);
    const failed = markEmailDeliveryFailed(input.storage, {
      deliveryId: delivery.id,
      latestError: failure.message,
      now,
    });

    return {
      delivery: failed,
      disposition: failure.retryable ? "retry" : "permanent-failure",
      error: failure.message,
    };
  }
}

export function resolveConfiguredCloudflareSender(
  records: readonly StoredRecord[],
  senderId: string,
): EmailDeliverySender {
  const sender = activeControlPlaneRecord(records, "email-sender", senderId);

  if (!sender) {
    throw new DisplaySafeEmailRuntimeError(`Email sender "${senderId}" was not found.`);
  }

  if (sender.values.enabled !== true) {
    throw new DisplaySafeEmailRuntimeError("Email sender must be enabled.");
  }

  const domainId = stringRecordValue(sender.values.emailDomain);
  const domain = domainId ? activeControlPlaneRecord(records, "email-domain", domainId) : undefined;

  if (!domain || domain.values.enabled !== true || domain.values.providerFamily !== "cloudflare") {
    throw new DisplaySafeEmailRuntimeError(
      "Email sender domain must be an enabled Cloudflare email domain.",
    );
  }

  const address = stringRecordValue(sender.values.address);

  if (!address) {
    throw new DisplaySafeEmailRuntimeError("Email sender address is missing.");
  }

  return {
    id: sender.id,
    ...parseEmailDeliveryAddress("Email sender", {
      address,
      ...optionalRecordString("displayName", sender.values.displayName),
    }),
  };
}

export function cloudflareSendEmailMessageForDelivery(input: {
  delivery: EmailDeliveryRecord;
  message: EmailDeliveryRenderedMessage;
}): CloudflareSendEmailMessage {
  return {
    from: cloudflareEmailAddress(input.delivery.sender),
    to: input.delivery.recipients.map(cloudflareEmailAddress),
    subject: input.message.subject,
    ...(input.delivery.replyTo === undefined
      ? {}
      : { replyTo: cloudflareEmailAddress(input.delivery.replyTo) }),
    text: input.message.text,
    ...(input.message.html === undefined ? {} : { html: input.message.html }),
  };
}

export async function sendCloudflareEmailDelivery(input: {
  delivery: EmailDeliveryRecord;
  message: EmailDeliveryRenderedMessage;
  sendEmail?: CloudflareSendEmailBinding;
}): Promise<{ messageId: string }> {
  if (!input.sendEmail) {
    throw new DisplaySafeEmailRuntimeError("Email delivery binding is not configured.");
  }

  try {
    const result = await input.sendEmail.send(cloudflareSendEmailMessageForDelivery(input));

    if (!result.messageId) {
      throw new Error("Cloudflare Email Sending did not return a message id.");
    }

    return {
      messageId: result.messageId,
    };
  } catch (error) {
    if (error instanceof DisplaySafeEmailRuntimeError) {
      throw error;
    }

    throw new DisplaySafeEmailRuntimeError("Email provider delivery failed.", {
      retryable: true,
    });
  }
}

async function consumeEmailDeliveryQueueMessage(
  body: unknown,
  env: EmailDeliveryQueueConsumerEnv,
): Promise<"ack" | "retry"> {
  let job: EmailDeliverySendRuntimeJob;

  try {
    job = parseEmailDeliverySendRuntimeJob(body);
  } catch {
    return "ack";
  }

  try {
    const result = await requestEmailDeliveryAttempt({
      env,
      job,
    });

    return result.disposition === "retry" ? "retry" : "ack";
  } catch {
    return "retry";
  }
}

async function requestEmailDeliveryAttempt(input: {
  env: EmailDeliveryQueueConsumerEnv;
  job: EmailDeliverySendRuntimeJob;
}): Promise<EmailDeliveryAttemptResult> {
  const id = input.env.FORMLESS_AUTHORITY.idFromName(input.job.targetAuthorityName);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(INTERNAL_EMAIL_DELIVERY_ATTEMPT_PATH, "https://formless.internal"), {
      body: JSON.stringify(input.job),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = await readJsonResponse(response);
  const result = parseEmailDeliveryAttemptResult(body);

  if (!response.ok || !result) {
    throw new Error("Email delivery attempt request failed.");
  }

  return result;
}

function activeControlPlaneRecord(
  records: readonly StoredRecord[],
  entity: string,
  id: string,
): StoredRecord | undefined {
  return records.find(
    (record) => record.entity === entity && record.id === id && !record.deletedAt,
  );
}

function activeInstanceSettingsRecord(records: readonly StoredRecord[]): StoredRecord | undefined {
  return records.find(
    (record) =>
      record.entity === "instance-settings" &&
      !record.deletedAt &&
      stringRecordValue(record.values.settingsId) === INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  );
}

function cloudflareEmailAddress(address: EmailDeliveryAddress): CloudflareSendEmailAddress {
  return address.displayName === undefined
    ? address.address
    : { email: address.address, name: address.displayName };
}

function displaySafeEmailError(error: unknown): string {
  if (error instanceof DisplaySafeEmailRuntimeError) {
    return error.message;
  }

  return "Email delivery failed.";
}

function displaySafeEmailAttemptFailure(error: unknown): {
  message: string;
  retryable: boolean;
} {
  if (error instanceof DisplaySafeEmailRuntimeError) {
    return {
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    message: "Email delivery failed.",
    retryable: true,
  };
}

function parseEmailDeliveryAttemptResult(value: unknown): EmailDeliveryAttemptResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    value.disposition !== "accepted" &&
    value.disposition !== "already-accepted" &&
    value.disposition !== "permanent-failure" &&
    value.disposition !== "retry"
  ) {
    return undefined;
  }

  return {
    disposition: value.disposition,
  };
}

function optionalRecordString(key: string, value: unknown): { [key: string]: string } | object {
  const parsed = stringRecordValue(value);

  return parsed === undefined ? {} : { [key]: parsed };
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Cache-Control", "no-store");

  if (!responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    headers: responseHeaders,
    status,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class DisplaySafeEmailRuntimeError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { retryable?: boolean } = {}) {
    super(message);
    this.retryable = options.retryable === true;
  }
}
