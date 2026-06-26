export const EMAIL_RUNTIME_API_ROUTE_PREFIX = "/api/formless/email";
export const EMAIL_DELIVERY_SCHEDULE_API_PATH =
  `${EMAIL_RUNTIME_API_ROUTE_PREFIX}/deliveries/schedule` as const;
export const EMAIL_DELIVERY_SEND_RUNTIME_JOB_KIND = "email.delivery.send";
export const EMAIL_DELIVERY_SEND_RUNTIME_JOB_SCHEMA_VERSION = 1;

export type EmailDeliveryStatus = "accepted" | "failed" | "pending" | "sending";

export const emailDeliveryStatuses = [
  "accepted",
  "failed",
  "pending",
  "sending",
] as const satisfies readonly EmailDeliveryStatus[];

export type EmailDeliveryAddress = {
  address: string;
  displayName?: string;
};

export type EmailDeliverySender = EmailDeliveryAddress & {
  id: string;
};

export type EmailDeliverySource = {
  storageIdentity: string;
  operationId?: string;
  recordId?: string;
};

export type EmailDeliveryRenderedMessage = {
  subject: string;
  text: string;
  html?: string;
};

export type EmailDeliveryScheduleRequest = {
  messageKind: string;
  source: EmailDeliverySource;
  idempotencyKey: string;
  sender: {
    id: string;
  };
  recipients: EmailDeliveryAddress[];
  replyTo?: EmailDeliveryAddress;
  canonicalOrigin: string;
  message: EmailDeliveryRenderedMessage;
};

export type EmailDeliveryRecord = {
  id: string;
  messageKind: string;
  sourceStorageIdentity: string;
  sourceOperationId?: string;
  sourceRecordId?: string;
  idempotencyKey: string;
  sender: EmailDeliverySender;
  recipients: EmailDeliveryAddress[];
  replyTo?: EmailDeliveryAddress;
  canonicalOrigin: string;
  status: EmailDeliveryStatus;
  providerFamily: "cloudflare";
  providerMessageId?: string;
  latestError?: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  firstAttemptedAt?: string;
  latestAttemptedAt?: string;
  acceptedAt?: string;
  failedAt?: string;
};

export type EmailDeliveryScheduleResponse = {
  delivery: EmailDeliveryRecord;
  replayed: boolean;
};

export type EmailDeliverySendRuntimeJob = {
  schemaVersion: typeof EMAIL_DELIVERY_SEND_RUNTIME_JOB_SCHEMA_VERSION;
  kind: typeof EMAIL_DELIVERY_SEND_RUNTIME_JOB_KIND;
  jobId: string;
  idempotencyKey: string;
  enqueuedAt: string;
  targetAuthorityName: string;
  deliveryId: string;
};

export type EmailMessageRenderInput<Kind extends string = string, Facts = unknown> = {
  canonicalOrigin: string;
  facts: Facts;
  kind: Kind;
};

export type EmailMessageRenderer<Kind extends string = string, Facts = unknown> = (
  input: EmailMessageRenderInput<Kind, Facts>,
) => EmailDeliveryRenderedMessage | Promise<EmailDeliveryRenderedMessage>;

export type EmailMessageRendererRegistry = Readonly<Record<string, EmailMessageRenderer>>;

const idLikePattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const runtimeJobTargetPattern = /^[A-Za-z0-9_][A-Za-z0-9._:@/-]{0,255}$/;
const emailHostPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const allowedAddressLocalPattern = /^[^\s@<>()[\]\\,;:"']+$/;

export function parseEmailDeliveryScheduleRequest(value: unknown): EmailDeliveryScheduleRequest {
  if (!isRecord(value)) {
    throw new Error("Email delivery schedule request must be an object.");
  }

  assertAllowedKeys("Email delivery schedule request", value, [
    "canonicalOrigin",
    "idempotencyKey",
    "message",
    "messageKind",
    "recipients",
    "replyTo",
    "sender",
    "source",
  ]);

  return {
    messageKind: parseEmailRuntimeId("Email delivery message kind", value.messageKind),
    source: parseEmailDeliverySource(value.source),
    idempotencyKey: parseEmailRuntimeId("Email delivery idempotency key", value.idempotencyKey),
    sender: parseEmailDeliverySenderReference(value.sender),
    recipients: parseEmailDeliveryRecipients(value.recipients),
    ...optionalEmailDeliveryAddressProperty("replyTo", "Email delivery reply-to", value.replyTo),
    canonicalOrigin: parseEmailDeliveryCanonicalOrigin(value.canonicalOrigin),
    message: parseEmailDeliveryRenderedMessage("Email delivery message", value.message),
  };
}

export function emailDeliverySendRuntimeJob(
  input: Pick<
    EmailDeliverySendRuntimeJob,
    "deliveryId" | "enqueuedAt" | "idempotencyKey" | "targetAuthorityName"
  >,
): EmailDeliverySendRuntimeJob {
  return parseEmailDeliverySendRuntimeJob({
    schemaVersion: EMAIL_DELIVERY_SEND_RUNTIME_JOB_SCHEMA_VERSION,
    kind: EMAIL_DELIVERY_SEND_RUNTIME_JOB_KIND,
    jobId: emailDeliverySendRuntimeJobId(input.deliveryId),
    idempotencyKey: input.idempotencyKey,
    enqueuedAt: input.enqueuedAt,
    targetAuthorityName: input.targetAuthorityName,
    deliveryId: input.deliveryId,
  });
}

export function parseEmailDeliverySendRuntimeJob(value: unknown): EmailDeliverySendRuntimeJob {
  if (!isRecord(value)) {
    throw new Error("Email delivery send runtime job must be an object.");
  }

  assertAllowedKeys("Email delivery send runtime job", value, [
    "deliveryId",
    "enqueuedAt",
    "idempotencyKey",
    "jobId",
    "kind",
    "schemaVersion",
    "targetAuthorityName",
  ]);

  if (value.schemaVersion !== EMAIL_DELIVERY_SEND_RUNTIME_JOB_SCHEMA_VERSION) {
    throw new Error("Email delivery send runtime job schemaVersion is unsupported.");
  }

  if (value.kind !== EMAIL_DELIVERY_SEND_RUNTIME_JOB_KIND) {
    throw new Error("Email delivery send runtime job kind is unsupported.");
  }

  return {
    schemaVersion: EMAIL_DELIVERY_SEND_RUNTIME_JOB_SCHEMA_VERSION,
    kind: EMAIL_DELIVERY_SEND_RUNTIME_JOB_KIND,
    jobId: parseEmailRuntimeId("Email delivery send runtime job id", value.jobId),
    idempotencyKey: parseEmailRuntimeId(
      "Email delivery send runtime job idempotency key",
      value.idempotencyKey,
    ),
    enqueuedAt: parseEmailRuntimeTimestamp(
      "Email delivery send runtime job enqueue timestamp",
      value.enqueuedAt,
    ),
    targetAuthorityName: parseEmailRuntimeTargetName(
      "Email delivery send runtime job target authority name",
      value.targetAuthorityName,
    ),
    deliveryId: parseEmailRuntimeId(
      "Email delivery send runtime job delivery id",
      value.deliveryId,
    ),
  };
}

export function emailDeliverySendRuntimeJobId(deliveryId: string): string {
  return `email.delivery.send:${parseEmailRuntimeId(
    "Email delivery send runtime job delivery id",
    deliveryId,
  )}`;
}

export function parseEmailDeliveryAddress(context: string, value: unknown): EmailDeliveryAddress {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertAllowedKeys(context, value, ["address", "displayName"]);

  return {
    address: normalizeEmailDeliveryAddress(context, value.address),
    ...optionalDisplayNameProperty("displayName", `${context} display name`, value.displayName),
  };
}

export function parseEmailDeliveryRenderedMessage(
  context: string,
  value: unknown,
): EmailDeliveryRenderedMessage {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertAllowedKeys(context, value, ["html", "subject", "text"]);

  return {
    subject: parseDisplaySafeText(`${context} subject`, value.subject, 998),
    text: parseDisplaySafeText(`${context} text body`, value.text, 200_000),
    ...optionalDisplaySafeTextProperty("html", `${context} HTML body`, value.html, 200_000),
  };
}

export async function renderEmailDeliveryMessage(
  input: EmailMessageRenderInput,
  renderers: EmailMessageRendererRegistry,
): Promise<EmailDeliveryRenderedMessage> {
  const renderer = renderers[input.kind];

  if (!renderer) {
    throw new Error(`Email message renderer "${input.kind}" is not configured.`);
  }

  return parseEmailDeliveryRenderedMessage(
    `Email message renderer "${input.kind}" output`,
    await renderer(input),
  );
}

export function emailDeliveryIdempotencyScope(
  input: Pick<EmailDeliveryScheduleRequest, "idempotencyKey" | "messageKind" | "source">,
): string {
  return [
    input.source.storageIdentity,
    input.messageKind,
    input.source.operationId ?? "",
    input.source.recordId ?? "",
    input.idempotencyKey,
  ].join("\n");
}

export function normalizeEmailDeliveryAddress(context: string, value: unknown): string {
  const raw = parseDisplaySafeText(context, value, 320);
  const [localPart, host, extra] = raw.split("@");

  if (
    extra !== undefined ||
    !localPart ||
    !host ||
    !allowedAddressLocalPattern.test(localPart) ||
    !emailHostPattern.test(host.toLowerCase())
  ) {
    throw new Error(`${context} must be a valid email address.`);
  }

  return `${localPart}@${host.toLowerCase()}`;
}

function parseEmailDeliverySource(value: unknown): EmailDeliverySource {
  if (!isRecord(value)) {
    throw new Error("Email delivery source must be an object.");
  }

  assertAllowedKeys("Email delivery source", value, ["operationId", "recordId", "storageIdentity"]);

  const operationId = optionalEmailRuntimeId(
    "Email delivery source operation id",
    value.operationId,
  );
  const recordId = optionalEmailRuntimeId("Email delivery source record id", value.recordId);

  if (operationId === undefined && recordId === undefined) {
    throw new Error("Email delivery source must include operationId or recordId.");
  }

  return {
    storageIdentity: parseEmailRuntimeId(
      "Email delivery source storage identity",
      value.storageIdentity,
    ),
    ...(operationId === undefined ? {} : { operationId }),
    ...(recordId === undefined ? {} : { recordId }),
  };
}

function parseEmailDeliverySenderReference(value: unknown): { id: string } {
  if (!isRecord(value)) {
    throw new Error("Email delivery sender must be an object.");
  }

  assertAllowedKeys("Email delivery sender", value, ["id"]);

  return {
    id: parseEmailRuntimeId("Email delivery sender id", value.id),
  };
}

function parseEmailDeliveryRecipients(value: unknown): EmailDeliveryAddress[] {
  if (!Array.isArray(value)) {
    throw new Error("Email delivery recipients must be an array.");
  }

  if (value.length < 1) {
    throw new Error("Email delivery recipients must include at least one recipient.");
  }

  if (value.length > 50) {
    throw new Error("Email delivery recipients must include 50 or fewer recipients.");
  }

  return value.map((recipient, index) =>
    parseEmailDeliveryAddress(`Email delivery recipients[${index}]`, recipient),
  );
}

function parseEmailDeliveryCanonicalOrigin(value: unknown): string {
  const raw = parseDisplaySafeText("Email delivery canonical origin", value, 2048);
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("Email delivery canonical origin must be a valid URL origin.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Email delivery canonical origin must use http or https.");
  }

  return url.origin;
}

function parseEmailRuntimeId(context: string, value: unknown): string {
  const text = parseDisplaySafeText(context, value, 256);

  if (!idLikePattern.test(text)) {
    throw new Error(`${context} is invalid.`);
  }

  return text;
}

function parseEmailRuntimeTargetName(context: string, value: unknown): string {
  const text = parseDisplaySafeText(context, value, 256);

  if (!runtimeJobTargetPattern.test(text)) {
    throw new Error(`${context} is invalid.`);
  }

  return text;
}

function parseEmailRuntimeTimestamp(context: string, value: unknown): string {
  const text = parseDisplaySafeText(context, value, 64);
  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${context} must be a valid timestamp.`);
  }

  return date.toISOString();
}

function optionalEmailRuntimeId(context: string, value: unknown): string | undefined {
  return value === undefined ? undefined : parseEmailRuntimeId(context, value);
}

function optionalEmailDeliveryAddressProperty(
  key: string,
  context: string,
  value: unknown,
): { [key: string]: EmailDeliveryAddress } | object {
  return value === undefined ? {} : { [key]: parseEmailDeliveryAddress(context, value) };
}

function optionalDisplayNameProperty(
  key: string,
  context: string,
  value: unknown,
): { [key: string]: string } | object {
  if (value === undefined) {
    return {};
  }

  const text = parseDisplaySafeText(context, value, 320);

  if (/[\r\n]/.test(text)) {
    throw new Error(`${context} must not contain line breaks.`);
  }

  return { [key]: text };
}

function optionalDisplaySafeTextProperty(
  key: string,
  context: string,
  value: unknown,
  maxLength: number,
): { [key: string]: string } | object {
  return value === undefined ? {} : { [key]: parseDisplaySafeText(context, value, maxLength) };
}

function parseDisplaySafeText(context: string, value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }

  const text = value.trim();

  if (text.length === 0) {
    throw new Error(`${context} must be non-empty.`);
  }

  if (text.length > maxLength) {
    throw new Error(`${context} must be ${maxLength} characters or fewer.`);
  }

  if (text.includes("\u0000")) {
    throw new Error(`${context} must not contain null bytes.`);
  }

  return text;
}

function assertAllowedKeys(context: string, value: Record<string, unknown>, keys: string[]) {
  const allowed = new Set(keys);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} field "${key}" is not supported.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
