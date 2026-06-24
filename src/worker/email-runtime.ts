import type { StoredRecord } from "@dpeek/formless-storage";
import {
  EMAIL_DELIVERY_SCHEDULE_API_PATH,
  parseEmailDeliveryAddress,
  parseEmailDeliveryRenderedMessage,
  parseEmailDeliveryScheduleRequest,
  type EmailDeliveryAddress,
  type EmailDeliveryRecord,
  type EmailDeliveryRenderedMessage,
  type EmailDeliveryScheduleRequest,
  type EmailDeliveryScheduleResponse,
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
  markEmailDeliverySending,
} from "./email-runtime-state.ts";

export const INTERNAL_EMAIL_DELIVERY_SCHEDULE_PATH = "/_internal/email/deliveries/schedule";

type EmailRuntimeApiEnv = AuthorityAdminGuardEnv &
  DeploymentControlPlaneClientEnv & {
    FORMLESS_AUTHORITY: DurableObjectNamespace;
    FORMLESS_EMAIL?: CloudflareSendEmailBinding;
  };

type DurableObjectEmailRuntimeEnv = AuthorityAdminGuardEnv &
  DeploymentControlPlaneClientEnv & {
    FORMLESS_EMAIL?: CloudflareSendEmailBinding;
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

export type ScheduleEmailDeliveryInput = {
  controlPlaneRecords: readonly StoredRecord[];
  now?: string;
  request: EmailDeliveryScheduleRequest;
  sendEmail?: CloudflareSendEmailBinding;
  storage: DurableObjectStorage;
};

export type ScheduleEmailDeliveryResult = EmailDeliveryScheduleResponse & {
  sent: boolean;
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

  if (!isSchedulePath) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
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
      request: scheduleRequest,
      sendEmail: env.FORMLESS_EMAIL,
      storage,
    });

    return jsonResponse({
      delivery: result.delivery,
      replayed: result.replayed,
    } satisfies EmailDeliveryScheduleResponse);
  } catch (error) {
    return jsonResponse({ error: displaySafeEmailError(error) }, 400);
  }
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

export async function scheduleEmailDelivery(
  input: ScheduleEmailDeliveryInput,
): Promise<ScheduleEmailDeliveryResult> {
  const now = input.now ?? nowIsoString();
  const sender = resolveVerifiedCloudflareSender(
    input.controlPlaneRecords,
    input.request.sender.id,
  );
  const message = parseEmailDeliveryRenderedMessage(
    "Email delivery rendered message",
    input.request.message,
  );
  const ensured = createEmailDeliveryIfAbsent(input.storage, {
    now,
    request: input.request,
    sender,
  });

  if (ensured.delivery.status === "accepted" || ensured.delivery.status === "sending") {
    return {
      delivery: ensured.delivery,
      replayed: ensured.replayed,
      sent: false,
    };
  }

  const sending = markEmailDeliverySending(input.storage, {
    deliveryId: ensured.delivery.id,
    now,
  });

  try {
    const providerResult = await sendCloudflareEmailDelivery({
      delivery: sending,
      message,
      sendEmail: input.sendEmail,
    });

    return {
      delivery: markEmailDeliveryAccepted(input.storage, {
        deliveryId: sending.id,
        now,
        providerMessageId: providerResult.messageId,
      }),
      replayed: ensured.replayed,
      sent: true,
    };
  } catch (error) {
    return {
      delivery: markEmailDeliveryFailed(input.storage, {
        deliveryId: sending.id,
        latestError: displaySafeEmailError(error),
        now,
      }),
      replayed: ensured.replayed,
      sent: false,
    };
  }
}

export function resolveVerifiedCloudflareSender(
  records: readonly StoredRecord[],
  senderId: string,
): EmailDeliverySender {
  const sender = activeControlPlaneRecord(records, "email-sender", senderId);

  if (!sender) {
    throw new DisplaySafeEmailRuntimeError(`Email sender "${senderId}" was not found.`);
  }

  if (sender.values.enabled !== true || sender.values.verificationStatus !== "verified") {
    throw new DisplaySafeEmailRuntimeError("Email sender must be enabled and verified.");
  }

  const domainId = stringRecordValue(sender.values.emailDomain);
  const domain = domainId ? activeControlPlaneRecord(records, "email-domain", domainId) : undefined;

  if (
    !domain ||
    domain.values.enabled !== true ||
    domain.values.providerFamily !== "cloudflare" ||
    domain.values.verificationStatus !== "verified"
  ) {
    throw new DisplaySafeEmailRuntimeError(
      "Email sender domain must be an enabled verified Cloudflare email domain.",
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

    throw new DisplaySafeEmailRuntimeError("Email provider delivery failed.");
  }
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

class DisplaySafeEmailRuntimeError extends Error {}
