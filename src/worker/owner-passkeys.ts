import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

import {
  parseOwnerPasskeyLoginOptionsRequest,
  parseOwnerPasskeyLoginVerifyRequest,
  parseOwnerPasskeyRegistrationOptionsRequest,
  parseOwnerPasskeyRegistrationVerifyRequest,
  type OwnerPasskeyLoginOptionsResponse,
  type OwnerPasskeyLoginVerifyResponse,
  type OwnerPasskeyRegistrationOptionsResponse,
  type OwnerPasskeyRegistrationVerifyResponse,
} from "../shared/instance-auth.ts";
import { nowIsoString } from "../shared/clock.ts";
import { type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  completeFirstOwnerSetupInCurrentTransaction,
  hashOwnerSetupToken,
  readInstanceSetupState,
  validateFirstOwnerSetupCapability,
  type CompleteFirstOwnerSetupResult,
} from "./instance-setup-state.ts";
import {
  consumePasskeyChallenge,
  createPasskeyChallenge,
  createPasskeyCredentialInCurrentTransaction,
  passkeyCredentialToWebAuthnCredential,
  readInstanceAuthConfig,
  readPasskeyCredential,
  readPasskeyCredentialsForPrincipal,
  updatePasskeyCredentialVerification,
  type StoredInstanceAuthConfig,
} from "./instance-auth-state.ts";
import { ensureIdentityOwner, readIdentityOwner } from "./identity-control-plane.ts";
import { createOwnerSessionCookie, ownerSessionSigningSecret } from "./owner-session.ts";

export const OWNER_PASSKEY_API_PATH = "/api/formless/passkeys";

const registerOptionsPath = `${OWNER_PASSKEY_API_PATH}/register/options`;
const registerVerifyPath = `${OWNER_PASSKEY_API_PATH}/register/verify`;
const loginOptionsPath = `${OWNER_PASSKEY_API_PATH}/login/options`;
const loginVerifyPath = `${OWNER_PASSKEY_API_PATH}/login/verify`;
const passkeyChallengeTtlMs = 5 * 60 * 1000;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

type OwnerPasskeyApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type SetupCapabilityFailureReason = Extract<CompleteFirstOwnerSetupResult, { ok: false }>["reason"];

type SetupCapabilityValidationResult =
  | { ok: true; setupTokenHash: string }
  | {
      ok: false;
      owner?: CompleteFirstOwnerSetupResult extends { owner?: infer Owner } ? Owner : never;
      reason: SetupCapabilityFailureReason;
    };

export async function handleOwnerPasskeyApiRequest(
  request: Request,
  env: OwnerPasskeyApiEnv,
): Promise<Response | undefined> {
  if (!isOwnerPasskeyApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleOwnerPasskeyDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerPasskeyApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (!isOwnerPasskeyApiPath(pathname)) {
    return undefined;
  }

  try {
    if (pathname === registerOptionsPath) {
      return await handleRegistrationOptionsRequest(request, storage, env);
    }

    if (pathname === registerVerifyPath) {
      return await handleRegistrationVerifyRequest(request, storage, env);
    }

    if (pathname === loginOptionsPath) {
      return await handleLoginOptionsRequest(request, storage, env);
    }

    if (pathname === loginVerifyPath) {
      return await handleLoginVerifyRequest(request, storage, env);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function isOwnerPasskeyApiPath(pathname: string) {
  return pathname === OWNER_PASSKEY_API_PATH || pathname.startsWith(`${OWNER_PASSKEY_API_PATH}/`);
}

async function handleRegistrationOptionsRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerPasskeyApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const body = parseOwnerPasskeyRegistrationOptionsRequest(await readJson(request));
  const config = requireInstanceAuthConfig(storage);
  const setupTokenHash = await hashOwnerSetupToken(body.setupToken);
  const setup = await validateSetupCapability(storage, request, env, {
    now: nowIsoString(),
    setupTokenHash,
  });

  if (!setup.ok) {
    return setupCapabilityFailureResponse(setup);
  }

  const options = await generateRegistrationOptions({
    rpID: config.relyingPartyId,
    rpName: config.relyingPartyName,
    userDisplayName: "Formless owner",
    userID: base64UrlDecode(setupTokenHash),
    userName: "owner",
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  const created = createPasskeyChallenge(storage, {
    kind: "registration",
    challenge: options.challenge,
    setupTokenHash,
    createdAt: nowIsoString(),
    expiresAt: challengeExpiresAt(),
  });

  if (!created.ok) {
    return jsonResponse({ error: "Passkey challenge already exists." }, 409);
  }

  const response: OwnerPasskeyRegistrationOptionsResponse = { options };

  return jsonResponse(response);
}

async function handleRegistrationVerifyRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerPasskeyApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  return completeOwnerPasskeyRegistration(request, storage, env, await readJson(request));
}

export async function completeOwnerPasskeyRegistration(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerPasskeyApiEnv,
  value: unknown,
): Promise<Response> {
  const body = parseOwnerPasskeyRegistrationVerifyRequest(value);
  const config = requireInstanceAuthConfig(storage);
  const signingSecret = ownerSessionSigningSecret(env);

  if (!signingSecret) {
    return jsonResponse({ error: "Owner session signing secret is not configured." }, 500);
  }

  const setupTokenHash = await hashOwnerSetupToken(body.setupToken);
  const setup = await validateSetupCapability(storage, request, env, {
    now: nowIsoString(),
    setupTokenHash,
  });

  if (!setup.ok) {
    return setupCapabilityFailureResponse(setup);
  }

  const challengeValue = clientDataChallenge(
    "Passkey registration response",
    body.response.response.clientDataJSON,
  );
  const challenge = consumePasskeyChallenge(storage, {
    kind: "registration",
    challenge: challengeValue,
    now: nowIsoString(),
  });

  if (!challenge.ok) {
    return passkeyChallengeFailureResponse(challenge.reason);
  }

  if (
    challenge.challenge.kind !== "registration" ||
    challenge.challenge.setupTokenHash !== setupTokenHash
  ) {
    return jsonResponse({ error: "Passkey registration challenge is invalid." }, 401);
  }

  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

  try {
    verified = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge.challenge,
      expectedOrigin: config.canonicalOrigin,
      expectedRPID: config.relyingPartyId,
    });
  } catch {
    return jsonResponse({ error: "Passkey registration verification failed." }, 401);
  }

  if (!verified.verified) {
    return jsonResponse({ error: "Passkey registration verification failed." }, 401);
  }

  const credentialId = verified.registrationInfo.credential.id;
  const existingCredential = readPasskeyCredential(storage, credentialId);

  if (existingCredential) {
    return jsonResponse({ error: "Passkey credential already exists." }, 409);
  }

  const completedAt = nowIsoString();
  const owner = await ensureIdentityOwner(env, {
    now: completedAt,
    owner: body.owner,
  });
  let completed: CompleteFirstOwnerSetupResult;

  try {
    completed = storage.transactionSync(() => {
      const ownerSetup = completeFirstOwnerSetupInCurrentTransaction(storage, {
        tokenHash: setupTokenHash,
        instanceId: requestInstanceId(request),
        now: completedAt,
        owner,
      });

      if (!ownerSetup.ok) {
        return ownerSetup;
      }

      const credential = createPasskeyCredentialInCurrentTransaction(storage, {
        credentialId,
        principalId: ownerSetup.owner.id,
        publicKey: new Uint8Array(verified.registrationInfo.credential.publicKey),
        counter: verified.registrationInfo.credential.counter,
        transports: verified.registrationInfo.credential.transports,
        credentialDeviceType: verified.registrationInfo.credentialDeviceType,
        credentialBackedUp: verified.registrationInfo.credentialBackedUp,
        createdAt: completedAt,
        updatedAt: completedAt,
      });

      if (!credential.ok) {
        throw new DuplicatePasskeyCredentialError();
      }

      return ownerSetup;
    });
  } catch (error) {
    if (error instanceof DuplicatePasskeyCredentialError) {
      return jsonResponse({ error: "Passkey credential already exists." }, 409);
    }

    throw error;
  }

  if (!completed.ok) {
    return setupFailureResponse(completed);
  }

  const session = await createOwnerSessionCookie({
    env,
    owner: completed.owner,
    request,
  });
  const headers = new Headers();

  headers.set("Set-Cookie", session.cookie);

  const response: OwnerPasskeyRegistrationVerifyResponse = {
    owner: completed.owner,
    session: { expiresAt: session.session.expiresAt },
    setupComplete: true,
  };

  return jsonResponse(response, 200, headers);
}

class DuplicatePasskeyCredentialError extends Error {
  constructor() {
    super("Passkey credential already exists.");
    this.name = "DuplicatePasskeyCredentialError";
  }
}

async function handleLoginOptionsRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerPasskeyApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  parseOwnerPasskeyLoginOptionsRequest(await readJson(request));

  const config = requireInstanceAuthConfig(storage);
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse({ error: "Owner setup must be complete before passkey login." }, 409);
  }

  const credentials = readPasskeyCredentialsForPrincipal(storage, state.owner.id);

  if (credentials.length === 0) {
    return jsonResponse({ error: "No owner passkeys are registered." }, 409);
  }

  const options = await generateAuthenticationOptions({
    rpID: config.relyingPartyId,
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      ...(credential.transports.length === 0 ? {} : { transports: credential.transports }),
    })),
    userVerification: "preferred",
  });
  const created = createPasskeyChallenge(storage, {
    kind: "login",
    challenge: options.challenge,
    principalId: state.owner.id,
    createdAt: nowIsoString(),
    expiresAt: challengeExpiresAt(),
  });

  if (!created.ok) {
    return jsonResponse({ error: "Passkey challenge already exists." }, 409);
  }

  const response: OwnerPasskeyLoginOptionsResponse = { options };

  return jsonResponse(response);
}

async function handleLoginVerifyRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerPasskeyApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const body = parseOwnerPasskeyLoginVerifyRequest(await readJson(request));
  const config = requireInstanceAuthConfig(storage);
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse(
      { authenticated: false, error: "Owner setup must be complete before passkey login." },
      409,
    );
  }

  const challengeValue = clientDataChallenge(
    "Passkey login response",
    body.response.response.clientDataJSON,
  );
  const challenge = consumePasskeyChallenge(storage, {
    kind: "login",
    challenge: challengeValue,
    now: nowIsoString(),
  });

  if (!challenge.ok) {
    return passkeyChallengeFailureResponse(challenge.reason);
  }

  if (challenge.challenge.kind !== "login" || challenge.challenge.principalId !== state.owner.id) {
    return jsonResponse(
      { authenticated: false, error: "Passkey login challenge is invalid." },
      401,
    );
  }

  const credential = readPasskeyCredential(storage, body.response.id);

  if (!credential || credential.principalId !== state.owner.id) {
    return jsonResponse({ authenticated: false, error: "Passkey credential is invalid." }, 401);
  }

  let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;

  try {
    verified = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge.challenge,
      expectedOrigin: config.canonicalOrigin,
      expectedRPID: config.relyingPartyId,
      credential: passkeyCredentialToWebAuthnCredential(credential),
    });
  } catch {
    return jsonResponse({ authenticated: false, error: "Passkey login verification failed." }, 401);
  }

  if (!verified.verified) {
    return jsonResponse({ authenticated: false, error: "Passkey login verification failed." }, 401);
  }

  const updated = updatePasskeyCredentialVerification(storage, {
    credentialId: credential.credentialId,
    counter: verified.authenticationInfo.newCounter,
    userVerified: verified.authenticationInfo.userVerified,
    credentialDeviceType: verified.authenticationInfo.credentialDeviceType,
    credentialBackedUp: verified.authenticationInfo.credentialBackedUp,
    origin: verified.authenticationInfo.origin,
    relyingPartyId: verified.authenticationInfo.rpID,
    verifiedAt: nowIsoString(),
  });

  if (!updated.ok) {
    return jsonResponse({ authenticated: false, error: "Passkey login verification failed." }, 401);
  }

  const session = await createOwnerSessionCookie({
    env,
    owner: state.owner,
    request,
  });
  const headers = new Headers();

  headers.set("Set-Cookie", session.cookie);

  const response: OwnerPasskeyLoginVerifyResponse = {
    authenticated: true,
    owner: state.owner,
    session: { expiresAt: session.session.expiresAt },
  };

  return jsonResponse(response, 200, headers);
}

function requireInstanceAuthConfig(storage: DurableObjectStorage): StoredInstanceAuthConfig {
  const config = readInstanceAuthConfig(storage);

  if (!config) {
    throw new Error("Instance auth configuration is missing.");
  }

  return config;
}

async function validateSetupCapability(
  storage: DurableObjectStorage,
  request: Request,
  env: OwnerPasskeyApiEnv,
  input: { now: string; setupTokenHash: string },
): Promise<SetupCapabilityValidationResult> {
  const owner = await readIdentityOwner(env);
  const setup = validateFirstOwnerSetupCapability(storage, {
    tokenHash: input.setupTokenHash,
    instanceId: requestInstanceId(request),
    now: input.now,
    owner,
  });

  if (!setup.ok) {
    return setup;
  }

  return { ok: true, setupTokenHash: input.setupTokenHash };
}

function setupCapabilityFailureResponse(
  result: Extract<SetupCapabilityValidationResult, { ok: false }>,
) {
  return setupFailureResponse({
    ok: false,
    ...(result.owner === undefined ? {} : { owner: result.owner }),
    reason: result.reason,
  });
}

function setupFailureResponse(result: Extract<CompleteFirstOwnerSetupResult, { ok: false }>) {
  const failure = setupFailure(result.reason);

  return jsonResponse(
    {
      error: failure.error,
      ...(result.owner === undefined ? {} : { owner: result.owner }),
      reason: result.reason,
      setupComplete: result.reason === "already-complete",
    },
    failure.status,
  );
}

function setupFailure(reason: SetupCapabilityFailureReason): { error: string; status: number } {
  switch (reason) {
    case "already-complete":
      return { error: "Owner setup is already complete.", status: 409 };
    case "expired-token":
      return { error: "Owner setup link has expired.", status: 410 };
    case "invalid-token":
      return { error: "Owner setup link is invalid.", status: 401 };
    case "missing-capability":
      return { error: "Owner setup link is missing or has already been used.", status: 404 };
    case "wrong-instance":
      return { error: "Owner setup link is not valid for this instance.", status: 401 };
  }
}

function passkeyChallengeFailureResponse(
  reason: "already-consumed" | "expired-challenge" | "missing-challenge" | "wrong-kind",
) {
  switch (reason) {
    case "already-consumed":
    case "missing-challenge":
    case "wrong-kind":
      return jsonResponse({ error: "Passkey challenge is invalid." }, 401);
    case "expired-challenge":
      return jsonResponse({ error: "Passkey challenge has expired." }, 410);
  }
}

function clientDataChallenge(context: string, value: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
  } catch {
    throw new Error(`${context} clientDataJSON must be valid JSON.`);
  }

  if (!isRecord(parsed) || typeof parsed.challenge !== "string") {
    throw new Error(`${context} clientDataJSON challenge must be a string.`);
  }

  return parseBase64UrlString(`${context} clientDataJSON challenge`, parsed.challenge);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function challengeExpiresAt() {
  return new Date(Date.now() + passkeyChallengeTtlMs).toISOString();
}

function requestInstanceId(request: Request): string {
  return new URL(request.url).hostname.toLowerCase();
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}

function parseBase64UrlString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  const normalized = value.trim();

  if (!base64UrlPattern.test(normalized)) {
    throw new Error(`${context} must be base64url.`);
  }

  return normalized;
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = parseBase64UrlString("Passkey base64url value", value);
  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  let binary: string;

  try {
    binary = atob(padded);
  } catch {
    throw new Error("Passkey base64url value must be valid base64url.");
  }

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
