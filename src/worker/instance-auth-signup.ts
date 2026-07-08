import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { instanceControlPlaneEffectiveRouteAccess } from "@dpeek/formless-instance-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";

import type { EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import {
  parseAccountCompletionGateTarget,
  parseOwnerLoginRedirectTarget,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateTarget,
} from "../shared/instance-auth.ts";
import { nowIsoString } from "../shared/clock.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import { createCentralAuthSessionCookie } from "./central-auth-session.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  resolveConfiguredDefaultCloudflareSender,
  resolveDefaultEmailSenderReference,
  scheduleEmailDelivery,
  type EmailDeliveryQueueBinding,
} from "./email-runtime.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { commitIdentityEmailVerifiedSignup } from "./identity-control-plane.ts";
import {
  customOperationProfileCompletionRequirementForTarget,
  resolveAccountCompletionGate,
} from "./instance-auth-account-completion.ts";
import { accountCompletionContinueToFromRequest } from "./instance-auth-continuations.ts";
import {
  consumeEmailVerificationChallenge,
  consumePasskeyChallenge,
  createEmailVerificationChallenge,
  createPasskeyChallenge,
  createPasskeyCredentialInCurrentTransaction,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
  readEmailVerificationChallenge,
  readInstanceAuthConfig,
  readPasskeyCredential,
  validateEmailVerificationChallenge,
  type StoredEmailVerificationChallenge,
} from "./instance-auth-state.ts";

export const INSTANCE_AUTH_SIGNUP_PATH = `${runtimeTopologyRoutes.authAccountRoute}/signup`;
export const INSTANCE_AUTH_SIGNUP_START_PATH = `${INSTANCE_AUTH_SIGNUP_PATH}/start`;
export const INSTANCE_AUTH_SIGNUP_EMAIL_VERIFY_PATH = `${INSTANCE_AUTH_SIGNUP_PATH}/email/verify`;
export const INSTANCE_AUTH_SIGNUP_PASSKEY_REGISTER_OPTIONS_PATH = `${INSTANCE_AUTH_SIGNUP_PATH}/passkeys/register/options`;
export const INSTANCE_AUTH_SIGNUP_PASSKEY_REGISTER_VERIFY_PATH = `${INSTANCE_AUTH_SIGNUP_PATH}/passkeys/register/verify`;

type InstanceAuthSignupEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
  FORMLESS_OWNER_SESSION_SECRET?: string;
};

type SignupStartRequest = {
  email: string;
  target: AccountCompletionGateTarget;
};

type SignupEmailVerifyRequest = SignupStartRequest & {
  challengeId: string;
  token: string;
};

type SignupPasskeyRegistrationOptionsRequest = SignupStartRequest & {
  challengeId: string;
  displayName: string;
};

type SignupPasskeyRegistrationVerifyRequest = SignupPasskeyRegistrationOptionsRequest & {
  response: RegistrationResponseJSON;
};

type SignupAuthConfiguration = {
  authOrigin: string;
  relyingPartyId: string;
  relyingPartyName: string;
};

type SignupDeliveryConfiguration =
  | (SignupAuthConfiguration & {
      controlPlaneRecords: readonly StoredRecord[];
      senderId: string;
    })
  | { response: Response };

const emailVerificationChallengeTtlMs = 15 * 60 * 1000;
const passkeyChallengeTtlMs = 5 * 60 * 1000;
const emailVerificationMessageKind = "identity.emailVerifiedSignup";
const emailVerificationDeliveryPurpose = "email-verified-signup-delivery";
const instanceAuthStorageIdentity = "instance:auth";

export async function handleInstanceAuthSignupApiRequest(
  request: Request,
  env: InstanceAuthSignupEnv,
): Promise<Response | undefined> {
  if (!isInstanceAuthSignupApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceAuthSignupDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthSignupEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isInstanceAuthSignupApiPath(url.pathname)) {
    return undefined;
  }

  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  try {
    if (url.pathname === INSTANCE_AUTH_SIGNUP_START_PATH) {
      return await handleSignupStart(request, storage, env);
    }

    const config = signupAuthConfiguration(request, storage);

    if ("response" in config) {
      return config.response;
    }

    if (url.pathname === INSTANCE_AUTH_SIGNUP_EMAIL_VERIFY_PATH) {
      return await handleSignupEmailVerify(request, storage, env, config);
    }

    if (url.pathname === INSTANCE_AUTH_SIGNUP_PASSKEY_REGISTER_OPTIONS_PATH) {
      return await handleSignupPasskeyRegistrationOptions(request, storage, env, config);
    }

    if (url.pathname === INSTANCE_AUTH_SIGNUP_PASSKEY_REGISTER_VERIFY_PATH) {
      return await handleSignupPasskeyRegistrationVerify(request, storage, env, config);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function isInstanceAuthSignupApiPath(pathname: string): boolean {
  return (
    pathname === INSTANCE_AUTH_SIGNUP_START_PATH ||
    pathname === INSTANCE_AUTH_SIGNUP_EMAIL_VERIFY_PATH ||
    pathname === INSTANCE_AUTH_SIGNUP_PASSKEY_REGISTER_OPTIONS_PATH ||
    pathname === INSTANCE_AUTH_SIGNUP_PASSKEY_REGISTER_VERIFY_PATH
  );
}

async function handleSignupStart(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthSignupEnv,
): Promise<Response> {
  const config = await signupDeliveryConfiguration(request, storage, env);

  if ("response" in config) {
    return config.response;
  }

  const input = parseSignupStartRequest(await readJson(request));
  const target = validatedSignupTarget(input.target, request, config.controlPlaneRecords);
  const displayEmail = normalizeEmailDeliveryAddress("Email-verified signup email", input.email);
  const normalizedEmail = displayEmail.toLowerCase();
  const idempotencyKey = await signupEmailChallengeIdempotencyKey({
    normalizedEmail,
    target,
  });
  const principalId = await signupPrincipalId(idempotencyKey);
  const now = nowIsoString();
  const expiresAt = new Date(Date.parse(now) + emailVerificationChallengeTtlMs).toISOString();
  let created: ReturnType<typeof createEmailVerificationChallenge> | undefined;
  let rawToken: string | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    rawToken = generateEmailVerificationToken();
    created = createEmailVerificationChallenge(storage, {
      authOrigin: config.authOrigin,
      createdAt: now,
      email: displayEmail,
      expiresAt,
      idempotencyKey,
      principalId,
      purpose: "signup",
      target,
      tokenHash: await hashEmailVerificationToken(rawToken),
    });

    if (created.ok) {
      if (created.replayed) {
        rawToken = undefined;
      }

      break;
    }

    if (created.reason !== "duplicate-token-hash") {
      return jsonResponse({ error: "Signup email verification challenge already exists." }, 409);
    }
  }

  if (!created?.ok) {
    return jsonResponse(
      { error: "Signup email verification challenge could not be created." },
      409,
    );
  }

  let delivery: Awaited<ReturnType<typeof scheduleEmailDelivery>>;

  try {
    delivery = await scheduleEmailDelivery({
      controlPlaneRecords: config.controlPlaneRecords,
      emailDeliveryQueue: env.FORMLESS_EMAIL_DELIVERY_QUEUE,
      now,
      request: signupEmailVerificationDeliveryScheduleRequest({
        authOrigin: config.authOrigin,
        challenge: created.challenge,
        senderId: config.senderId,
        verificationLink:
          rawToken === undefined
            ? undefined
            : buildSignupEmailVerificationLink({
                authOrigin: config.authOrigin,
                challengeId: created.challenge.challengeId,
                token: rawToken,
              }),
      }),
      storage,
      targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
    });
  } catch {
    return jsonResponse({ error: "Signup email delivery is not configured." }, 503);
  }

  return jsonResponse({
    delivery: {
      deliveryId: delivery.delivery.id,
      queued: delivery.queued,
      replayed: delivery.replayed,
      status: "scheduled",
    },
    signup: signupChallengeSummary(created.challenge),
  });
}

async function handleSignupEmailVerify(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthSignupEnv,
  config: SignupAuthConfiguration,
): Promise<Response> {
  const input = parseSignupEmailVerifyRequest(await readJson(request));
  const target = await validatedCurrentSignupTarget(input.target, request, env);
  const tokenHash = await hashEmailVerificationToken(input.token);
  const now = nowIsoString();
  const validation = validateEmailVerificationChallenge(storage, {
    challengeId: input.challengeId,
    email: input.email,
    now,
    purpose: "signup",
    target,
    tokenHash,
  });

  if (!validation.ok) {
    return emailVerificationChallengeFailureResponse(validation.reason);
  }

  if (validation.challenge.authOrigin !== config.authOrigin) {
    return jsonResponse({ error: "Signup email verification link is invalid." }, 401);
  }

  const consumed = consumeEmailVerificationChallenge(storage, {
    challengeId: validation.challenge.challengeId,
    email: input.email,
    now,
    principalId: validation.challenge.principalId,
    purpose: "signup",
    target,
    tokenHash,
  });

  if (!consumed.ok) {
    return emailVerificationChallengeFailureResponse(consumed.reason);
  }

  return jsonResponse({
    signup: signupChallengeSummary(consumed.challenge),
    verified: true,
  });
}

async function handleSignupPasskeyRegistrationOptions(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthSignupEnv,
  config: SignupAuthConfiguration,
): Promise<Response> {
  const input = parseSignupPasskeyRegistrationOptionsRequest(await readJson(request));
  const target = await validatedCurrentSignupTarget(input.target, request, env);
  const challenge = verifiedSignupEmailChallenge(storage, {
    authOrigin: config.authOrigin,
    challengeId: input.challengeId,
    email: input.email,
    target,
  });

  if (!challenge.ok) {
    return signupEmailChallengeFailureResponse(challenge.reason);
  }

  const options = await generateRegistrationOptions({
    rpID: config.relyingPartyId,
    rpName: config.relyingPartyName,
    userDisplayName: input.displayName,
    userID: textBytes(challenge.challenge.principalId),
    userName: challenge.challenge.displayEmail,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  const created = createPasskeyChallenge(storage, {
    kind: "registration",
    challenge: options.challenge,
    signupEmailChallengeId: challenge.challenge.challengeId,
    principalId: challenge.challenge.principalId,
    canonicalOrigin: config.authOrigin,
    relyingPartyId: config.relyingPartyId,
    createdAt: nowIsoString(),
    expiresAt: challengeExpiresAt(),
  });

  if (!created.ok) {
    return jsonResponse({ error: "Passkey challenge already exists." }, 409);
  }

  return jsonResponse({ options } satisfies { options: PublicKeyCredentialCreationOptionsJSON });
}

async function handleSignupPasskeyRegistrationVerify(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthSignupEnv,
  config: SignupAuthConfiguration,
): Promise<Response> {
  const body = parseSignupPasskeyRegistrationVerifyRequest(await readJson(request));
  const target = await validatedCurrentSignupTarget(body.target, request, env);
  const emailChallenge = verifiedSignupEmailChallenge(storage, {
    authOrigin: config.authOrigin,
    challengeId: body.challengeId,
    email: body.email,
    target,
  });

  if (!emailChallenge.ok) {
    return signupEmailChallengeFailureResponse(emailChallenge.reason);
  }

  const challengeValue = clientDataChallenge(
    "Email-verified signup passkey registration response",
    body.response.response.clientDataJSON,
  );
  const passkeyChallenge = consumePasskeyChallenge(storage, {
    kind: "registration",
    challenge: challengeValue,
    now: nowIsoString(),
  });

  if (!passkeyChallenge.ok) {
    return passkeyChallengeFailureResponse(passkeyChallenge.reason);
  }

  if (
    passkeyChallenge.challenge.kind !== "registration" ||
    !("signupEmailChallengeId" in passkeyChallenge.challenge) ||
    passkeyChallenge.challenge.signupEmailChallengeId !== emailChallenge.challenge.challengeId ||
    passkeyChallenge.challenge.principalId !== emailChallenge.challenge.principalId ||
    passkeyChallenge.challenge.canonicalOrigin !== config.authOrigin ||
    passkeyChallenge.challenge.relyingPartyId !== config.relyingPartyId
  ) {
    return jsonResponse({ error: "Passkey registration challenge is invalid." }, 401);
  }

  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

  try {
    verified = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: passkeyChallenge.challenge.challenge,
      expectedOrigin: config.authOrigin,
      expectedRPID: config.relyingPartyId,
    });
  } catch {
    return jsonResponse({ error: "Passkey registration verification failed." }, 401);
  }

  if (!verified.verified) {
    return jsonResponse({ error: "Passkey registration verification failed." }, 401);
  }

  const credentialId = verified.registrationInfo.credential.id;

  if (readPasskeyCredential(storage, credentialId)) {
    return jsonResponse({ error: "Passkey credential already exists." }, 409);
  }

  const completedAt = nowIsoString();
  const identityCommit = await commitIdentityEmailVerifiedSignup(env, {
    appInstallId: target.appInstallId,
    displayEmail: emailChallenge.challenge.displayEmail,
    displayName: body.displayName,
    normalizedEmail: emailChallenge.challenge.normalizedEmail,
    principalId: emailChallenge.challenge.principalId,
    ...(target.selectedOrganization === undefined
      ? {}
      : { selectedOrganization: target.selectedOrganization }),
    signupId: emailChallenge.challenge.challengeId,
    verifiedAt: completedAt,
  });

  if (!identityCommit.ok) {
    return jsonResponse({ error: identityCommit.error }, 409);
  }

  const credential = storage.transactionSync(() =>
    createPasskeyCredentialInCurrentTransaction(storage, {
      credentialId,
      principalId: identityCommit.principal.principalId,
      publicKey: new Uint8Array(verified.registrationInfo.credential.publicKey),
      counter: verified.registrationInfo.credential.counter,
      transports: verified.registrationInfo.credential.transports,
      credentialDeviceType: verified.registrationInfo.credentialDeviceType,
      credentialBackedUp: verified.registrationInfo.credentialBackedUp,
      createdAt: completedAt,
      updatedAt: completedAt,
    }),
  );

  if (!credential.ok) {
    return jsonResponse({ error: "Passkey credential already exists." }, 409);
  }

  const session = await createCentralAuthSessionCookie(storage, {
    env,
    now: completedAt,
    principalId: identityCommit.principal.principalId,
    request,
  });
  const profileCompletion = await customOperationProfileCompletionRequirementForTarget(env, target);
  const accountCompletion = await resolveAccountCompletionGate({
    env,
    input: {
      actorKind: "authenticated",
      principalId: identityCommit.principal.principalId,
      ...(profileCompletion === undefined ? {} : { profileCompletion }),
      target,
    },
    storage,
  });
  const headers = new Headers();

  headers.set("Set-Cookie", session.cookie);

  return jsonResponse(
    {
      accountCompletion,
      ...accountCompletionContinueToFromRequest(request, accountCompletion, config.authOrigin),
      ...(accountCompletion.status === "complete" && target.targetOrigin !== config.authOrigin
        ? { handoff: { returnTo: target.returnTo, targetOrigin: target.targetOrigin } }
        : {}),
      principal: identityCommit.principal,
      session: { expiresAt: session.session.expiresAt },
      verified: true,
    } satisfies {
      accountCompletion: AccountCompletionGateResolutionResult;
      continueTo?: `/${string}`;
      handoff?: { returnTo: `/${string}`; targetOrigin: string };
      principal: { displayName: string; principalId: string };
      session: { expiresAt: string };
      verified: true;
    },
    200,
    headers,
  );
}

async function signupDeliveryConfiguration(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthSignupEnv,
): Promise<SignupDeliveryConfiguration> {
  const config = signupAuthConfiguration(request, storage);

  if ("response" in config) {
    return config;
  }

  if (!env.FORMLESS_EMAIL_DELIVERY_QUEUE) {
    return { response: jsonResponse({ error: "Signup email delivery is not configured." }, 503) };
  }

  let controlPlaneRecords: Awaited<ReturnType<typeof readControlPlaneRecords>>;

  try {
    controlPlaneRecords = await readControlPlaneRecords({ env, requestUrl: request.url });
  } catch {
    return { response: jsonResponse({ error: "Signup email delivery is not configured." }, 503) };
  }

  const sender = resolveDefaultEmailSenderReference(controlPlaneRecords ?? [], "auth");

  if (!sender) {
    return { response: jsonResponse({ error: "Signup email delivery is not configured." }, 503) };
  }

  try {
    resolveConfiguredDefaultCloudflareSender(controlPlaneRecords ?? [], "auth");
  } catch {
    return { response: jsonResponse({ error: "Signup email delivery is not configured." }, 503) };
  }

  return {
    authOrigin: config.authOrigin,
    controlPlaneRecords: controlPlaneRecords ?? [],
    relyingPartyId: config.relyingPartyId,
    relyingPartyName: config.relyingPartyName,
    senderId: sender.id,
  };
}

function signupAuthConfiguration(
  request: Request,
  storage: DurableObjectStorage,
): SignupAuthConfiguration | { response: Response } {
  const config = readInstanceAuthConfig(storage);
  const requestOrigin = new URL(request.url).origin;

  if (!config) {
    return { response: jsonResponse({ error: "Signup is unavailable." }, 503) };
  }

  if (requestOrigin !== config.canonicalOrigin) {
    return {
      response: jsonResponse({ error: "Signup must use the configured auth origin." }, 404),
    };
  }

  return {
    authOrigin: config.canonicalOrigin,
    relyingPartyId: config.relyingPartyId,
    relyingPartyName: config.relyingPartyName,
  };
}

async function validatedCurrentSignupTarget(
  value: AccountCompletionGateTarget,
  request: Request,
  env: InstanceAuthSignupEnv,
): Promise<AccountCompletionGateTarget & { appInstallId: string }> {
  const records = await readControlPlaneRecords({ env, requestUrl: request.url });

  return validatedSignupTarget(value, request, records ?? []);
}

function validatedSignupTarget(
  value: AccountCompletionGateTarget,
  request: Request,
  records: readonly StoredRecord[],
): AccountCompletionGateTarget & { appInstallId: string } {
  const target = parseAccountCompletionGateTarget(value);

  if (target.targetProfile !== "app") {
    throw new Error("Signup target must be an app route.");
  }

  if (target.appInstallId === undefined) {
    throw new Error("Signup target requires an app install id.");
  }

  const storageIdentity = target.storageIdentity ?? `app:${target.appInstallId}`;

  if (storageIdentity !== `app:${target.appInstallId}`) {
    throw new Error("Signup target storage identity does not match the app install.");
  }

  const install = records.find(
    (record) =>
      record.entity === "app-install" &&
      !record.deletedAt &&
      (record.id === target.appInstallId || record.values.installId === target.appInstallId),
  );

  if (!install) {
    throw new Error("Signup target app install is missing.");
  }

  if (install.values.status !== "installed") {
    throw new Error("Signup target app install is disabled.");
  }

  if (
    install.values.registrationPolicy !== "email-verified" &&
    install.values.registrationPolicy !== "custom-operation"
  ) {
    throw new Error("Signup target app install does not allow email-verified signup.");
  }

  const route = records.find(
    (record) =>
      record.entity === "route" &&
      record.id === target.routeId &&
      !record.deletedAt &&
      record.values.kind === "mount" &&
      record.values.enabled === true &&
      record.values.targetProfile === "app" &&
      record.values.appInstall === target.appInstallId,
  );

  if (!route) {
    throw new Error("Signup target route is not available.");
  }

  const access = instanceControlPlaneEffectiveRouteAccess({
    kind: "mount",
    access:
      route.values.access === "anonymous" ||
      route.values.access === "authenticated" ||
      route.values.access === "owner"
        ? route.values.access
        : undefined,
    surface:
      route.values.surface === "admin" || route.values.surface === "public-site"
        ? route.values.surface
        : undefined,
    targetProfile: "app",
  });

  if (access === "anonymous") {
    throw new Error("Signup target route is public.");
  }

  assertSignupRouteMatchesTarget(
    route,
    { ...target, appInstallId: target.appInstallId, storageIdentity },
    request,
  );

  return {
    ...target,
    appInstallId: target.appInstallId,
    storageIdentity,
  };
}

function assertSignupRouteMatchesTarget(
  route: StoredRecord,
  target: AccountCompletionGateTarget & { appInstallId: string },
  request: Request,
) {
  const returnTo = parseOwnerLoginRedirectTarget(target.returnTo);

  if (!returnTo) {
    throw new Error("Signup target return target must be path-only.");
  }

  const targetUrl = new URL(returnTo, target.targetOrigin);
  const routeHost = typeof route.values.matchHost === "string" ? route.values.matchHost : undefined;

  if (routeHost === undefined) {
    if (target.targetOrigin !== new URL(request.url).origin) {
      throw new Error("Signup target origin does not match a same-origin app route.");
    }
  } else if (new URL(target.targetOrigin).hostname.toLowerCase() !== routeHost.toLowerCase()) {
    throw new Error("Signup target origin does not match the mapped app route.");
  }

  const matchPath = absolutePath(route.values.matchPath);
  const matchPrefix = optionalAbsolutePath(route.values.matchPrefix);

  if (
    matchPath === undefined ||
    (targetUrl.pathname !== matchPath &&
      (matchPrefix === undefined ||
        (matchPrefix !== "/" && !targetUrl.pathname.startsWith(matchPrefix))))
  ) {
    throw new Error("Signup return target does not match the app route.");
  }
}

function verifiedSignupEmailChallenge(
  storage: DurableObjectStorage,
  input: {
    authOrigin: string;
    challengeId: string;
    email: string;
    target: AccountCompletionGateTarget;
  },
):
  | { challenge: StoredEmailVerificationChallenge; ok: true }
  | {
      ok: false;
      reason:
        | "expired-challenge"
        | "missing-challenge"
        | "revoked-challenge"
        | "unverified-email"
        | "wrong-email"
        | "wrong-origin"
        | "wrong-purpose"
        | "wrong-target";
    } {
  const challenge = readEmailVerificationChallenge(storage, input.challengeId);

  if (!challenge) {
    return { ok: false, reason: "missing-challenge" };
  }

  if (challenge.expiresAt <= nowIsoString()) {
    return { ok: false, reason: "expired-challenge" };
  }

  if (challenge.revokedAt !== undefined) {
    return { ok: false, reason: "revoked-challenge" };
  }

  if (challenge.consumedAt === undefined) {
    return { ok: false, reason: "unverified-email" };
  }

  if (challenge.authOrigin !== input.authOrigin) {
    return { ok: false, reason: "wrong-origin" };
  }

  if (challenge.purpose !== "signup") {
    return { ok: false, reason: "wrong-purpose" };
  }

  if (
    normalizeEmailDeliveryAddress(
      "Email-verified signup expected email",
      input.email,
    ).toLowerCase() !== challenge.normalizedEmail
  ) {
    return { ok: false, reason: "wrong-email" };
  }

  if (!accountCompletionTargetsEqual(input.target, challenge)) {
    return { ok: false, reason: "wrong-target" };
  }

  return { challenge, ok: true };
}

function signupEmailVerificationDeliveryScheduleRequest(input: {
  authOrigin: string;
  challenge: StoredEmailVerificationChallenge;
  senderId: string;
  verificationLink: string | undefined;
}): EmailDeliveryScheduleRequest {
  return {
    canonicalOrigin: input.authOrigin,
    idempotencyKey: `${input.challenge.challengeId}:${emailVerificationDeliveryPurpose}`,
    message: renderSignupEmailVerificationDeliveryMessage({
      expiresAt: input.challenge.expiresAt,
      verificationLink: input.verificationLink,
    }),
    messageKind: emailVerificationMessageKind,
    recipients: [{ address: input.challenge.displayEmail }],
    sender: { id: input.senderId },
    source: {
      recordId: input.challenge.challengeId,
      storageIdentity: instanceAuthStorageIdentity,
    },
  };
}

function buildSignupEmailVerificationLink(input: {
  authOrigin: string;
  challengeId: string;
  token: string;
}): string {
  const url = new URL(INSTANCE_AUTH_SIGNUP_PATH, input.authOrigin);

  url.searchParams.set(
    "challengeId",
    parseNonEmptyString("Signup challenge id", input.challengeId),
  );
  url.searchParams.set("token", parseBase64UrlString("Signup email token", input.token));

  return url.toString();
}

function renderSignupEmailVerificationDeliveryMessage(input: {
  expiresAt: string;
  verificationLink: string | undefined;
}) {
  if (input.verificationLink === undefined) {
    return {
      subject: "Verify your Formless signup email",
      text: "This signup email verification request has already been rendered.",
    };
  }

  const escapedLink = htmlAttributeEscape(input.verificationLink);

  return {
    subject: "Verify your Formless signup email",
    text: [
      "Verify your email address for Formless signup.",
      "",
      `Verify email: ${input.verificationLink}`,
      "",
      `This verification link expires at ${input.expiresAt}.`,
    ].join("\n"),
    html: [
      "<p>Verify your email address for Formless signup.</p>",
      `<p><a href="${escapedLink}">Verify email</a></p>`,
      `<p>This verification link expires at ${htmlTextEscape(input.expiresAt)}.</p>`,
    ].join(""),
  };
}

function signupChallengeSummary(challenge: StoredEmailVerificationChallenge) {
  return {
    challengeId: challenge.challengeId,
    displayEmail: challenge.displayEmail,
    expiresAt: challenge.expiresAt,
    target: {
      appInstallId: challenge.appInstallId,
      returnTo: challenge.returnTo,
      routeId: challenge.routeId,
      ...(challenge.storageIdentity === undefined
        ? {}
        : { storageIdentity: challenge.storageIdentity }),
      targetOrigin: challenge.targetOrigin,
      targetProfile: challenge.targetProfile,
    },
  };
}

function parseSignupStartRequest(value: unknown): SignupStartRequest {
  const object = parseRecord("Email-verified signup start request", value);

  assertAllowedKeys("Email-verified signup start request", object, ["email", "target"]);

  return parseSignupBaseFields(object);
}

function parseSignupBaseFields(object: Record<string, unknown>): SignupStartRequest {
  return {
    email: normalizeEmailDeliveryAddress("Email-verified signup email", object.email),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function parseSignupEmailVerifyRequest(value: unknown): SignupEmailVerifyRequest {
  const object = parseRecord("Email-verified signup email verify request", value);

  assertAllowedKeys("Email-verified signup email verify request", object, [
    "challengeId",
    "email",
    "target",
    "token",
  ]);

  return {
    ...parseSignupBaseFields(object),
    challengeId: parseNonEmptyString(
      "Email-verified signup email challenge id",
      object.challengeId,
    ),
    token: parseBase64UrlString("Email-verified signup email token", object.token),
  };
}

function parseSignupPasskeyRegistrationOptionsRequest(
  value: unknown,
): SignupPasskeyRegistrationOptionsRequest {
  const object = parseRecord("Email-verified signup passkey options request", value);

  assertAllowedKeys("Email-verified signup passkey options request", object, [
    "challengeId",
    "displayName",
    "email",
    "target",
  ]);

  return {
    ...parseSignupBaseFields(object),
    challengeId: parseNonEmptyString(
      "Email-verified signup email challenge id",
      object.challengeId,
    ),
    displayName: parseNonEmptyString("Email-verified signup display name", object.displayName),
  };
}

function parseSignupPasskeyRegistrationVerifyRequest(
  value: unknown,
): SignupPasskeyRegistrationVerifyRequest {
  const object = parseRecord("Email-verified signup passkey verify request", value);

  assertAllowedKeys("Email-verified signup passkey verify request", object, [
    "challengeId",
    "displayName",
    "email",
    "response",
    "target",
  ]);

  return {
    ...parseSignupBaseFields(object),
    challengeId: parseNonEmptyString(
      "Email-verified signup email challenge id",
      object.challengeId,
    ),
    displayName: parseNonEmptyString("Email-verified signup display name", object.displayName),
    response: parseRegistrationResponse(
      "Email-verified signup passkey registration response",
      object.response,
    ),
  };
}

function parseRegistrationResponse(context: string, value: unknown): RegistrationResponseJSON {
  const object = parseRecord(context, value);
  const response = parseRecord(`${context} response`, object.response);

  parseBase64UrlString(`${context} id`, object.id);
  parseBase64UrlString(`${context} rawId`, object.rawId);
  parseBase64UrlString(`${context} clientDataJSON`, response.clientDataJSON);
  parseBase64UrlString(`${context} attestationObject`, response.attestationObject);

  return object as unknown as RegistrationResponseJSON;
}

function emailVerificationChallengeFailureResponse(
  reason:
    | "already-consumed"
    | "expired-challenge"
    | "missing-challenge"
    | "revoked-challenge"
    | "wrong-email"
    | "wrong-purpose"
    | "wrong-target"
    | "wrong-token",
): Response {
  switch (reason) {
    case "already-consumed":
    case "revoked-challenge":
      return jsonResponse({ error: "Signup email verification link is no longer available." }, 409);
    case "expired-challenge":
      return jsonResponse({ error: "Signup email verification link has expired." }, 410);
    case "missing-challenge":
      return jsonResponse({ error: "Signup email verification link is invalid." }, 404);
    case "wrong-email":
    case "wrong-purpose":
    case "wrong-target":
    case "wrong-token":
      return jsonResponse({ error: "Signup email verification link is invalid." }, 401);
  }
}

function signupEmailChallengeFailureResponse(
  reason:
    | "expired-challenge"
    | "missing-challenge"
    | "revoked-challenge"
    | "unverified-email"
    | "wrong-email"
    | "wrong-origin"
    | "wrong-purpose"
    | "wrong-target",
): Response {
  switch (reason) {
    case "expired-challenge":
      return jsonResponse({ error: "Signup email verification link has expired." }, 410);
    case "missing-challenge":
      return jsonResponse({ error: "Signup email verification link is invalid." }, 404);
    case "revoked-challenge":
      return jsonResponse({ error: "Signup email verification link is no longer available." }, 409);
    case "unverified-email":
      return jsonResponse({ error: "Signup email must be verified before passkey setup." }, 409);
    case "wrong-email":
    case "wrong-origin":
    case "wrong-purpose":
    case "wrong-target":
      return jsonResponse({ error: "Signup email verification link is invalid." }, 401);
  }
}

function passkeyChallengeFailureResponse(
  reason: "already-consumed" | "expired-challenge" | "missing-challenge" | "wrong-kind",
): Response {
  switch (reason) {
    case "already-consumed":
    case "missing-challenge":
    case "wrong-kind":
      return jsonResponse({ error: "Passkey challenge is invalid." }, 401);
    case "expired-challenge":
      return jsonResponse({ error: "Passkey challenge has expired." }, 410);
  }
}

async function signupEmailChallengeIdempotencyKey(input: {
  normalizedEmail: string;
  target: AccountCompletionGateTarget;
}): Promise<string> {
  return `email-verified-signup:${await sha256Base64Url(
    [
      input.normalizedEmail,
      input.target.targetOrigin,
      input.target.routeId,
      input.target.targetProfile,
      input.target.appInstallId ?? "",
      input.target.storageIdentity ?? "",
      input.target.selectedOrganization ?? "",
      input.target.returnTo,
    ].join("\n"),
  )}`;
}

async function signupPrincipalId(idempotencyKey: string): Promise<string> {
  return `principal:signup:${await sha256Base64Url(idempotencyKey)}`;
}

function challengeExpiresAt() {
  return new Date(Date.now() + passkeyChallengeTtlMs).toISOString();
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

function accountCompletionTargetsEqual(
  left: AccountCompletionGateTarget,
  right: AccountCompletionGateTarget,
): boolean {
  return (
    left.targetOrigin === right.targetOrigin &&
    left.routeId === right.routeId &&
    left.targetProfile === right.targetProfile &&
    (left.appInstallId ?? undefined) === (right.appInstallId ?? undefined) &&
    (left.storageIdentity ?? undefined) === (right.storageIdentity ?? undefined) &&
    (left.selectedOrganization ?? undefined) === (right.selectedOrganization ?? undefined) &&
    left.returnTo === right.returnTo
  );
}

function absolutePath(value: unknown): `/${string}` | undefined {
  return typeof value === "string" && value.startsWith("/") ? (value as `/${string}`) : undefined;
}

function optionalAbsolutePath(value: unknown): `/${string}` | undefined {
  return value === undefined ? undefined : absolutePath(value);
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value;
}

function assertAllowedKeys(
  context: string,
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} field "${key}" is not supported.`);
    }
  }
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseBase64UrlString(context: string, value: unknown): string {
  const normalized = parseNonEmptyString(context, value);

  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`${context} must be base64url.`);
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(body, {
    headers: responseHeaders,
    status,
  });
}

function textBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(value);
  const output = new Uint8Array(new ArrayBuffer(bytes.byteLength));

  output.set(bytes);

  return output;
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = parseBase64UrlString("base64url value", value);
  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  return new Uint8Array(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)).buffer);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";

  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function htmlAttributeEscape(value: string): string {
  return htmlTextEscape(value).replaceAll('"', "&quot;");
}

function htmlTextEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
