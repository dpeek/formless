import { nowIsoString } from "../shared/clock.ts";
import { parseInstanceAuthCanonicalOrigin } from "../shared/instance-auth.ts";
import {
  readInternalActiveIdentityPrincipal,
  type ActiveIdentityPrincipal,
} from "./identity-owner-internal.ts";
import {
  createCentralAuthSession,
  readCentralAuthSession,
  readInstanceAuthConfig,
  revokeCentralAuthSession,
  type StoredCentralAuthSession,
} from "./instance-auth-state.ts";
import { ownerSessionSigningSecret, type OwnerSessionEnv } from "./owner-session.ts";

export const CENTRAL_AUTH_SESSION_COOKIE_NAME = "formless_auth_session";

const centralAuthSessionPurpose = "central-auth-session";
const centralAuthSessionVersion = 1;
const defaultCentralAuthSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export type CentralAuthSessionEnv = OwnerSessionEnv;

export type CentralAuthSession = Omit<StoredCentralAuthSession, "revokedAt">;

export type CreateCentralAuthSessionCookieInput = {
  env: CentralAuthSessionEnv;
  idempotencyKey?: string;
  maxAgeSeconds?: number;
  now?: string;
  principalId: string;
  request: Request;
};

export type CreateCentralAuthSessionCookieResult = {
  cookie: string;
  session: CentralAuthSession;
};

export type CentralAuthSessionValidationFailureReason =
  | "expired"
  | "malformed-cookie"
  | "malformed-payload"
  | "missing-auth-origin"
  | "missing-cookie"
  | "missing-principal"
  | "missing-secret"
  | "missing-session"
  | "revoked-session"
  | "tampered-cookie"
  | "wrong-host"
  | "wrong-instance"
  | "wrong-purpose";

export type CentralAuthSessionValidationResult =
  | {
      ok: true;
      session: CentralAuthSession;
    }
  | {
      ok: false;
      reason: CentralAuthSessionValidationFailureReason;
    };

export type CentralAuthSessionRevocationResult =
  | {
      ok: true;
      session: StoredCentralAuthSession;
    }
  | {
      ok: false;
      reason:
        | Exclude<
            CentralAuthSessionValidationFailureReason,
            "expired" | "missing-principal" | "revoked-session"
          >
        | "missing-session";
    };

type CentralAuthSessionPayload = CentralAuthSession & {
  purpose: string;
  sessionId: string;
  version: typeof centralAuthSessionVersion;
};

export async function createCentralAuthSessionCookie(
  storage: DurableObjectStorage,
  input: CreateCentralAuthSessionCookieInput,
): Promise<CreateCentralAuthSessionCookieResult> {
  const secret = ownerSessionSigningSecret(input.env);

  if (!secret) {
    throw new Error("Central auth session signing secret is not configured.");
  }

  const authOrigin = configuredCentralAuthOrigin(storage);

  if (!authOrigin) {
    throw new Error("Central auth origin is not configured.");
  }

  if (requestOriginForCentralAuth(input.request) !== authOrigin) {
    throw new Error("Central auth session request must use the configured auth origin.");
  }

  const maxAgeSeconds = input.maxAgeSeconds ?? defaultCentralAuthSessionMaxAgeSeconds;

  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Central auth session max age must be a positive integer.");
  }

  const issuedAt = input.now ?? nowIsoString();
  const expiresAt = new Date(
    parseTimestampMs("Central auth session issuedAt", issuedAt) + maxAgeSeconds * 1000,
  ).toISOString();
  const instanceId = authOriginInstanceId(authOrigin);
  const principalId = parseNonEmptyString("Central auth session principal id", input.principalId);
  const idempotentSessionId =
    input.idempotencyKey === undefined
      ? undefined
      : await signString(
          `central-auth-session-id\n${parseNonEmptyString(
            "Central auth session idempotency key",
            input.idempotencyKey,
          )}`,
          secret,
        );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sessionId = idempotentSessionId ?? randomBase64Url(32);
    const sessionIdHash = await sha256Base64Url(sessionId);
    const created = createCentralAuthSession(storage, {
      expiresAt,
      instanceId,
      issuedAt,
      principalId,
      sessionIdHash,
    });

    if (
      !created.ok &&
      (idempotentSessionId === undefined ||
        created.session.expiresAt !== expiresAt ||
        created.session.instanceId !== instanceId ||
        created.session.issuedAt !== issuedAt ||
        created.session.principalId !== principalId)
    ) {
      continue;
    }

    const session: CentralAuthSession = {
      expiresAt: created.session.expiresAt,
      instanceId: created.session.instanceId,
      issuedAt: created.session.issuedAt,
      principalId: created.session.principalId,
      sessionIdHash: created.session.sessionIdHash,
    };
    const value = await signCentralAuthSessionPayload(
      {
        ...session,
        purpose: centralAuthSessionPurpose,
        sessionId,
        version: centralAuthSessionVersion,
      },
      secret,
    );

    return {
      cookie: serializeCentralAuthSessionCookie(authOrigin, value, expiresAt, maxAgeSeconds),
      session,
    };
  }

  throw new Error("Central auth session could not be issued.");
}

export async function validateCentralAuthSessionCookie(
  request: Request,
  storage: DurableObjectStorage,
  env: CentralAuthSessionEnv,
  options: {
    now?: string;
    resolveActivePrincipal?: (principalId: string) => Promise<ActiveIdentityPrincipal | null>;
  } = {},
): Promise<CentralAuthSessionValidationResult> {
  const validated = await validateCentralAuthSessionState(request, storage, env, options);

  if (!validated.ok) {
    return validated;
  }

  const principal = options.resolveActivePrincipal
    ? await options.resolveActivePrincipal(validated.session.principalId)
    : await readInternalActiveIdentityPrincipal(env, validated.session.principalId);

  if (!principal || principal.id !== validated.session.principalId) {
    return { ok: false, reason: "missing-principal" };
  }

  return validated;
}

export async function validateCentralAuthSessionState(
  request: Request,
  storage: DurableObjectStorage,
  env: CentralAuthSessionEnv,
  options: { now?: string } = {},
): Promise<CentralAuthSessionValidationResult> {
  const decoded = await decodeCentralAuthSessionCookie(request, storage, env);

  if (!decoded.ok) {
    return decoded;
  }

  const now = parseTimestampMs(
    "Central auth session validation time",
    options.now ?? nowIsoString(),
  );

  if (
    parseTimestampMs("Central auth session expiresAt", decoded.payload.expiresAt) <= now ||
    parseTimestampMs("Stored central auth session expiresAt", decoded.session.expiresAt) <= now
  ) {
    return { ok: false, reason: "expired" };
  }

  if (decoded.session.revokedAt !== undefined) {
    return { ok: false, reason: "revoked-session" };
  }

  return {
    ok: true,
    session: {
      expiresAt: decoded.session.expiresAt,
      instanceId: decoded.session.instanceId,
      issuedAt: decoded.session.issuedAt,
      principalId: decoded.session.principalId,
      sessionIdHash: decoded.session.sessionIdHash,
    },
  };
}

export function validateCentralAuthSessionBinding(
  storage: DurableObjectStorage,
  value: unknown,
  options: { now?: string } = {},
): CentralAuthSessionValidationResult {
  const session = parseCentralAuthSession(value);

  if (!session) {
    return { ok: false, reason: "malformed-payload" };
  }

  const stored = readCentralAuthSession(storage, session.sessionIdHash);

  if (!stored) {
    return { ok: false, reason: "missing-session" };
  }

  if (
    stored.instanceId !== session.instanceId ||
    stored.principalId !== session.principalId ||
    stored.issuedAt !== session.issuedAt ||
    stored.expiresAt !== session.expiresAt
  ) {
    return { ok: false, reason: "malformed-payload" };
  }

  if (
    parseTimestampMs("Central auth session expiresAt", stored.expiresAt) <=
    parseTimestampMs("Central auth session validation time", options.now ?? nowIsoString())
  ) {
    return { ok: false, reason: "expired" };
  }

  if (stored.revokedAt !== undefined) {
    return { ok: false, reason: "revoked-session" };
  }

  return { ok: true, session };
}

export async function revokeCentralAuthSessionCookie(
  request: Request,
  storage: DurableObjectStorage,
  env: CentralAuthSessionEnv,
  options: { now?: string } = {},
): Promise<CentralAuthSessionRevocationResult> {
  const decoded = await decodeCentralAuthSessionCookie(request, storage, env);

  if (!decoded.ok) {
    return decoded;
  }

  return revokeCentralAuthSession(
    storage,
    decoded.session.sessionIdHash,
    options.now ?? nowIsoString(),
  );
}

export function clearCentralAuthSessionCookie(request: Request): string {
  const parts = [
    `${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(requestOriginForCentralAuth(request)).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

type DecodedCentralAuthSessionCookie =
  | {
      ok: true;
      payload: CentralAuthSessionPayload;
      session: StoredCentralAuthSession;
    }
  | {
      ok: false;
      reason:
        | Exclude<
            CentralAuthSessionValidationFailureReason,
            "expired" | "missing-principal" | "revoked-session"
          >
        | "missing-session";
    };

async function decodeCentralAuthSessionCookie(
  request: Request,
  storage: DurableObjectStorage,
  env: CentralAuthSessionEnv,
): Promise<DecodedCentralAuthSessionCookie> {
  const value = requestCookie(request, CENTRAL_AUTH_SESSION_COOKIE_NAME);

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

  const payload = parseCentralAuthSessionPayload(payloadPart);

  if (!payload) {
    return { ok: false, reason: "malformed-payload" };
  }

  if (payload.purpose !== centralAuthSessionPurpose) {
    return { ok: false, reason: "wrong-purpose" };
  }

  const authOrigin = configuredCentralAuthOrigin(storage);

  if (!authOrigin) {
    return { ok: false, reason: "missing-auth-origin" };
  }

  if (requestOriginForCentralAuth(request) !== authOrigin) {
    return { ok: false, reason: "wrong-host" };
  }

  if (payload.instanceId !== authOriginInstanceId(authOrigin)) {
    return { ok: false, reason: "wrong-instance" };
  }

  const sessionIdHash = await sha256Base64Url(payload.sessionId);

  if (sessionIdHash !== payload.sessionIdHash) {
    return { ok: false, reason: "malformed-payload" };
  }

  const session = readCentralAuthSession(storage, sessionIdHash);

  if (!session) {
    return { ok: false, reason: "missing-session" };
  }

  if (
    session.instanceId !== payload.instanceId ||
    session.sessionIdHash !== payload.sessionIdHash
  ) {
    return { ok: false, reason: "wrong-instance" };
  }

  if (session.principalId !== payload.principalId || session.issuedAt !== payload.issuedAt) {
    return { ok: false, reason: "malformed-payload" };
  }

  return { ok: true, payload, session };
}

function configuredCentralAuthOrigin(storage: DurableObjectStorage): string | undefined {
  const config = readInstanceAuthConfig(storage);

  return config === undefined
    ? undefined
    : parseInstanceAuthCanonicalOrigin(config.canonicalOrigin);
}

function authOriginInstanceId(authOrigin: string): string {
  return new URL(authOrigin).hostname.toLowerCase();
}

function serializeCentralAuthSessionCookie(
  authOrigin: string,
  value: string,
  expiresAt: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${CENTRAL_AUTH_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(authOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function parseCentralAuthSessionPayload(
  payloadPart: string,
): CentralAuthSessionPayload | undefined {
  try {
    const payload = JSON.parse(base64UrlDecodeUtf8(payloadPart)) as unknown;

    if (
      !isRecord(payload) ||
      payload.version !== centralAuthSessionVersion ||
      typeof payload.purpose !== "string" ||
      typeof payload.sessionId !== "string" ||
      !base64UrlPattern.test(payload.sessionId) ||
      typeof payload.sessionIdHash !== "string" ||
      !base64UrlPattern.test(payload.sessionIdHash) ||
      typeof payload.principalId !== "string" ||
      payload.principalId.trim() === "" ||
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
      instanceId: payload.instanceId.trim(),
      issuedAt: payload.issuedAt,
      principalId: payload.principalId.trim(),
      purpose: payload.purpose,
      sessionId: payload.sessionId,
      sessionIdHash: payload.sessionIdHash,
      version: centralAuthSessionVersion,
    };
  } catch {
    return undefined;
  }
}

function parseCentralAuthSession(value: unknown): CentralAuthSession | undefined {
  if (
    !isRecord(value) ||
    typeof value.sessionIdHash !== "string" ||
    !base64UrlPattern.test(value.sessionIdHash) ||
    typeof value.principalId !== "string" ||
    value.principalId.trim() === "" ||
    typeof value.instanceId !== "string" ||
    value.instanceId.trim() === "" ||
    typeof value.issuedAt !== "string" ||
    value.issuedAt.trim() === "" ||
    typeof value.expiresAt !== "string" ||
    value.expiresAt.trim() === "" ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt)
  ) {
    return undefined;
  }

  return {
    expiresAt: value.expiresAt,
    instanceId: value.instanceId.trim(),
    issuedAt: value.issuedAt,
    principalId: value.principalId.trim(),
    sessionIdHash: value.sessionIdHash,
  };
}

async function signCentralAuthSessionPayload(
  payload: CentralAuthSessionPayload,
  secret: string,
): Promise<string> {
  const payloadPart = base64UrlEncodeUtf8(JSON.stringify(payload));
  const signature = await signString(payloadPart, secret);

  return `${payloadPart}.${signature}`;
}

async function signString(value: string, secret: string): Promise<string> {
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

function requestOriginForCentralAuth(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "host");
  const forwardedProto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "proto");
  const originUrl = new URL(
    `${forwardedProto ?? requestUrl.protocol.replace(/:$/, "")}://${forwardedHost ?? requestUrl.host}`,
  );

  if (originUrl.protocol === "http:" && !isLocalhost(originUrl.hostname)) {
    originUrl.protocol = "https:";
  }

  return parseInstanceAuthCanonicalOrigin(originUrl.origin);
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

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

function forwardedHeaderValue(header: string | null, key: "host" | "proto"): string | undefined {
  if (!header) {
    return undefined;
  }

  for (const segment of header.split(";")) {
    const [segmentKey, ...valueParts] = segment.trim().split("=");

    if (segmentKey.toLowerCase() !== key) {
      continue;
    }

    return valueParts.join("=").replace(/^"|"$/g, "").trim() || undefined;
  }

  return undefined;
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(digest));
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
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

function base64UrlEncodeUtf8(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlDecodeUtf8(value: string): string {
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
