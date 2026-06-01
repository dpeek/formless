import { nowIsoString } from "../shared/clock.ts";
import type { OwnerIdentity } from "../shared/protocol.ts";

export const OWNER_SESSION_COOKIE_NAME = "formless_owner_session";

const ownerSessionPurpose = "owner-session";
const ownerSessionVersion = 1;
const defaultSessionMaxAgeSeconds = 60 * 60 * 24 * 30;

export type OwnerSessionEnv = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_OWNER_SESSION_SECRET?: string;
};

export type OwnerSession = {
  expiresAt: string;
  instanceId: string;
  issuedAt: string;
  ownerId: string;
};

export type CreateOwnerSessionCookieInput = {
  env: OwnerSessionEnv;
  maxAgeSeconds?: number;
  now?: string;
  owner: OwnerIdentity;
  request: Request;
};

export type CreateOwnerSessionCookieResult = {
  cookie: string;
  session: OwnerSession;
};

export type OwnerSessionValidationResult =
  | {
      ok: true;
      session: OwnerSession;
    }
  | {
      ok: false;
      reason:
        | "expired"
        | "malformed-cookie"
        | "malformed-payload"
        | "missing-cookie"
        | "missing-secret"
        | "tampered-cookie"
        | "wrong-instance"
        | "wrong-purpose";
    };

type OwnerSessionPayload = OwnerSession & {
  purpose: string;
  version: typeof ownerSessionVersion;
};

export async function createOwnerSessionCookie(
  input: CreateOwnerSessionCookieInput,
): Promise<CreateOwnerSessionCookieResult> {
  const secret = ownerSessionSigningSecret(input.env);

  if (!secret) {
    throw new Error("Owner session signing secret is not configured.");
  }

  const maxAgeSeconds = input.maxAgeSeconds ?? defaultSessionMaxAgeSeconds;

  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Owner session max age must be a positive integer.");
  }

  const issuedAt = input.now ?? nowIsoString();
  const expiresAt = new Date(
    parseTimestampMs("Owner session issuedAt", issuedAt) + maxAgeSeconds * 1000,
  ).toISOString();
  const session: OwnerSession = {
    expiresAt,
    instanceId: requestInstanceId(input.request),
    issuedAt,
    ownerId: parseNonEmptyString("Owner session owner id", input.owner.id),
  };
  const payload: OwnerSessionPayload = {
    ...session,
    purpose: ownerSessionPurpose,
    version: ownerSessionVersion,
  };
  const value = await signOwnerSessionPayload(payload, secret);

  return {
    cookie: serializeOwnerSessionCookie(input.request, value, expiresAt, maxAgeSeconds),
    session,
  };
}

export async function validateOwnerSessionCookie(
  request: Request,
  env: OwnerSessionEnv,
  options: { now?: string } = {},
): Promise<OwnerSessionValidationResult> {
  const value = requestCookie(request, OWNER_SESSION_COOKIE_NAME);

  if (!value) {
    return { ok: false, reason: "missing-cookie" };
  }

  const secret = ownerSessionSigningSecret(env);

  if (!secret) {
    return { ok: false, reason: "missing-secret" };
  }

  const parts = value.split(".");

  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return { ok: false, reason: "malformed-cookie" };
  }

  const [payloadPart, signature] = parts;
  const expectedSignature = await signString(payloadPart, secret);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return { ok: false, reason: "tampered-cookie" };
  }

  const payload = parseOwnerSessionPayload(payloadPart);

  if (!payload) {
    return { ok: false, reason: "malformed-payload" };
  }

  if (payload.purpose !== ownerSessionPurpose) {
    return { ok: false, reason: "wrong-purpose" };
  }

  if (payload.instanceId !== requestInstanceId(request)) {
    return { ok: false, reason: "wrong-instance" };
  }

  if (
    parseTimestampMs("Owner session expiresAt", payload.expiresAt) <=
    parseTimestampMs("Owner session validation time", options.now ?? nowIsoString())
  ) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    session: {
      expiresAt: payload.expiresAt,
      instanceId: payload.instanceId,
      issuedAt: payload.issuedAt,
      ownerId: payload.ownerId,
    },
  };
}

export function clearOwnerSessionCookie(request: Request): string {
  const parts = [
    `${OWNER_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(request.url).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function ownerSessionSigningSecret(env: OwnerSessionEnv): string | undefined {
  return (
    normalizedSecret(env.FORMLESS_OWNER_SESSION_SECRET) ??
    normalizedSecret(env.FORMLESS_ADMIN_TOKEN)
  );
}

async function signOwnerSessionPayload(payload: OwnerSessionPayload, secret: string) {
  const payloadPart = base64UrlEncodeUtf8(JSON.stringify(payload));
  const signature = await signString(payloadPart, secret);

  return `${payloadPart}.${signature}`;
}

async function signString(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(signature));
}

function parseOwnerSessionPayload(payloadPart: string): OwnerSessionPayload | undefined {
  try {
    const payload = JSON.parse(base64UrlDecodeUtf8(payloadPart)) as unknown;

    if (!isRecord(payload)) {
      return undefined;
    }

    if (
      payload.version !== ownerSessionVersion ||
      typeof payload.purpose !== "string" ||
      typeof payload.ownerId !== "string" ||
      payload.ownerId.trim() === "" ||
      typeof payload.instanceId !== "string" ||
      payload.instanceId.trim() === "" ||
      typeof payload.issuedAt !== "string" ||
      payload.issuedAt.trim() === "" ||
      typeof payload.expiresAt !== "string" ||
      payload.expiresAt.trim() === "" ||
      !isTimestamp(payload.issuedAt) ||
      !isTimestamp(payload.expiresAt)
    ) {
      return undefined;
    }

    return {
      expiresAt: payload.expiresAt,
      instanceId: payload.instanceId,
      issuedAt: payload.issuedAt,
      ownerId: payload.ownerId,
      purpose: payload.purpose,
      version: ownerSessionVersion,
    };
  } catch {
    return undefined;
  }
}

function serializeOwnerSessionCookie(
  request: Request,
  value: string,
  expiresAt: string,
  maxAgeSeconds: number,
) {
  const parts = [
    `${OWNER_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(request.url).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function requestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");

  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [cookieName, ...valueParts] = part.split("=");

    if (cookieName?.trim() === name) {
      return valueParts.join("=").trim();
    }
  }

  return undefined;
}

function requestInstanceId(request: Request): string {
  return new URL(request.url).hostname.toLowerCase();
}

function normalizedSecret(value: string | undefined): string | undefined {
  const secret = value?.trim();

  return secret === "" ? undefined : secret;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseTimestampMs(context: string, value: string): number {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${context} must be a valid timestamp.`);
  }

  return timestamp;
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64UrlEncodeUtf8(value: string) {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlDecodeUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
}
