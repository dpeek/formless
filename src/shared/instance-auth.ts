import type {
  AuthenticationExtensionsClientInputs,
  AuthenticationExtensionsClientOutputs,
  AuthenticationResponseJSON,
  AttestationFormat,
  AuthenticatorAttachment,
  AuthenticatorSelectionCriteria,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialDescriptorJSON,
  PublicKeyCredentialHint,
  PublicKeyCredentialParameters,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialRpEntity,
  PublicKeyCredentialUserEntityJSON,
  RegistrationResponseJSON,
  UserVerificationRequirement,
} from "@simplewebauthn/server";
import type { IdentityInvitationTargetSurface } from "@dpeek/formless-identity-control-plane";

import { parseOwnerSetupToken, type OwnerIdentity, type OwnerIdentityInput } from "./protocol.ts";

export type InstanceAuthConfigInput = {
  canonicalOrigin: string;
  relyingPartyId: string;
  relyingPartyName: string;
};

export const FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME = "FORMLESS_INSTANCE_AUTH_ORIGIN";
export const FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME =
  "FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID";
export const FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME =
  "FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME";
export const COLLABORATOR_INVITATION_ACCEPT_PATH = "/formless/auth/invitations/accept";

export type OwnerSessionSummary = {
  expiresAt: string;
};

export type OwnerPasskeyRegistrationOptionsRequest = {
  setupToken: string;
};

export type OwnerPasskeyRegistrationOptionsResponse = {
  options: PublicKeyCredentialCreationOptionsJSON;
};

export type OwnerPasskeyRegistrationVerifyRequest = {
  setupToken: string;
  owner: OwnerIdentityInput;
  response: RegistrationResponseJSON;
};

export type OwnerPasskeyRegistrationVerifyResponse = {
  owner: OwnerIdentity;
  session?: OwnerSessionSummary;
  setupComplete: true;
};

export type OwnerPasskeyLoginOptionsRequest = Record<string, never>;

export type OwnerPasskeyLoginOptionsResponse = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type OwnerPasskeyLoginVerifyRequest = {
  redirectTo?: string;
  response: AuthenticationResponseJSON;
};

export type OwnerPasskeyLoginVerifyResponse = {
  authenticated: true;
  continueTo: OwnerLoginRedirectTarget;
  owner: OwnerIdentity;
  session: OwnerSessionSummary;
};

export type OwnerSessionStatusResponse =
  | {
      authenticated: false;
      owner?: OwnerIdentity;
      setupComplete: boolean;
    }
  | {
      authenticated: true;
      owner: OwnerIdentity;
      session: OwnerSessionSummary;
      setupComplete: true;
    };

export type OwnerLogoutResponse = {
  authenticated: false;
};

export type InstanceAuthErrorResponse = {
  error: string;
};

export type CollaboratorInvitationAcceptanceFailureReason =
  | "accepted-invitation"
  | "configuration-unavailable"
  | "consumed-invitation"
  | "expired-invitation"
  | "missing-invitation"
  | "revoked-invitation"
  | "wrong-email"
  | "wrong-origin"
  | "wrong-target"
  | "wrong-token";

export type CollaboratorInvitationAcceptanceRequest = {
  invitationId: string;
  token: string;
};

export type CollaboratorInvitationAcceptanceInvitationSummary = {
  expiresAt: string;
  invitationId: string;
  invitedPrincipalDisplayName?: string;
  passkeyRegistrationRequired: boolean;
  targetAppInstallId?: string;
  targetEmail: string;
  targetOrganization?: string;
  targetSurface: IdentityInvitationTargetSurface;
};

export type CollaboratorInvitationAcceptedPrincipalSummary = {
  displayName: string;
  principalId: string;
};

export type CollaboratorInvitationAcceptanceHandoffSummary = {
  returnTo: `/${string}`;
  targetOrigin: string;
};

export type CollaboratorInvitationAcceptanceStatusResponse =
  | {
      eligible: true;
      invitation: CollaboratorInvitationAcceptanceInvitationSummary;
    }
  | {
      eligible: false;
      error: string;
      reason: CollaboratorInvitationAcceptanceFailureReason;
    };

export type CollaboratorInvitationPasskeyRegistrationOptionsRequest =
  CollaboratorInvitationAcceptanceRequest;

export type CollaboratorInvitationPasskeyRegistrationOptionsResponse = {
  options: PublicKeyCredentialCreationOptionsJSON;
};

export type CollaboratorInvitationPasskeyRegistrationVerifyRequest = {
  invitationId: string;
  response: RegistrationResponseJSON;
  token: string;
};

export type CollaboratorInvitationPasskeyRegistrationVerifyResponse = {
  acceptedPrincipal: CollaboratorInvitationAcceptedPrincipalSummary;
  handoff?: CollaboratorInvitationAcceptanceHandoffSummary;
  invitation: CollaboratorInvitationAcceptanceInvitationSummary;
  session: OwnerSessionSummary;
  verified: true;
};

export type OwnerLoginRedirectTarget = `/${string}`;

export const ownerLoginDefaultRedirectTarget = "/" satisfies OwnerLoginRedirectTarget;

const ownerLoginRedirectBaseOrigin = "https://formless.local";

export function parseOwnerLoginRedirectTarget(
  value: unknown,
): OwnerLoginRedirectTarget | undefined {
  if (
    typeof value !== "string" ||
    value === "" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    hasOwnerLoginRedirectControlCharacter(value)
  ) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(value, ownerLoginRedirectBaseOrigin);
  } catch {
    return undefined;
  }

  if (url.origin !== ownerLoginRedirectBaseOrigin || url.username || url.password || url.hash) {
    return undefined;
  }

  return `${url.pathname}${url.search}` as OwnerLoginRedirectTarget;
}

export function ownerLoginRedirectTargetFromSearch(search: string): OwnerLoginRedirectTarget {
  const normalized = search.startsWith("?") ? search : `?${search}`;
  const redirectTo = new URLSearchParams(normalized).get("redirectTo");

  return parseOwnerLoginRedirectTarget(redirectTo) ?? ownerLoginDefaultRedirectTarget;
}

export function ownerLoginRedirectLocationForRoute(routeTarget: string): `/login?${string}` {
  const redirectTarget =
    parseOwnerLoginRedirectTarget(routeTarget) ?? ownerLoginDefaultRedirectTarget;

  return `/login?redirectTo=${encodeURIComponent(redirectTarget)}`;
}

function hasOwnerLoginRedirectControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const authenticatorAttachments = ["cross-platform", "platform"] as const;
const authenticatorTransports = [
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
] as const;
const collaboratorInvitationAcceptanceTargetSurfaces = [
  "app-install",
  "instance",
  "organization",
] as const satisfies readonly IdentityInvitationTargetSurface[];
const collaboratorInvitationAcceptanceFailureReasons = [
  "accepted-invitation",
  "configuration-unavailable",
  "consumed-invitation",
  "expired-invitation",
  "missing-invitation",
  "revoked-invitation",
  "wrong-email",
  "wrong-origin",
  "wrong-target",
  "wrong-token",
] as const satisfies readonly CollaboratorInvitationAcceptanceFailureReason[];
const publicKeyCredentialHints = ["client-device", "hybrid", "security-key"] as const;
const userVerificationRequirements = ["discouraged", "preferred", "required"] as const;
const residentKeyRequirements = ["discouraged", "preferred", "required"] as const;
const attestationConveyancePreferences = ["direct", "enterprise", "indirect", "none"] as const;
const attestationFormats = [
  "android-key",
  "android-safetynet",
  "apple",
  "fido-u2f",
  "none",
  "packed",
  "tpm",
] as const;

export function parseInstanceAuthConfigInput(value: unknown): InstanceAuthConfigInput {
  const object = parseObject("Instance auth config", value);

  assertKeys("Instance auth config", object, [
    "canonicalOrigin",
    "relyingPartyId",
    "relyingPartyName",
  ]);

  const canonicalOrigin = parseInstanceAuthCanonicalOrigin(object.canonicalOrigin);

  return {
    canonicalOrigin,
    relyingPartyId: parseInstanceAuthRelyingPartyId(object.relyingPartyId, { canonicalOrigin }),
    relyingPartyName: parseInstanceAuthRelyingPartyName(object.relyingPartyName),
  };
}

export function parseInstanceAuthCanonicalOrigin(value: unknown): string {
  const raw = parseTrimmedNonEmptyString("Instance auth canonical origin", value);
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("Instance auth canonical origin must be an absolute URL origin.");
  }

  if (url.username || url.password) {
    throw new Error("Instance auth canonical origin must not include credentials.");
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("Instance auth canonical origin must not include a path, query, or fragment.");
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost(url.hostname))) {
    throw new Error("Instance auth canonical origin must use HTTPS unless it is localhost.");
  }

  if (url.hostname.trim() === "") {
    throw new Error("Instance auth canonical origin must include a host.");
  }

  return url.origin;
}

export function parseInstanceAuthRelyingPartyId(
  value: unknown,
  options: { canonicalOrigin?: string } = {},
): string {
  const relyingPartyId = parseTrimmedNonEmptyString("Instance auth relying-party id", value)
    .toLowerCase()
    .replace(/\.$/, "");

  if (
    relyingPartyId.includes("://") ||
    relyingPartyId.includes("/") ||
    relyingPartyId.includes(":")
  ) {
    throw new Error("Instance auth relying-party id must be a host name, not a URL.");
  }

  if (!isValidRelyingPartyId(relyingPartyId)) {
    throw new Error("Instance auth relying-party id must be a valid host name.");
  }

  if (options.canonicalOrigin !== undefined) {
    const canonicalOrigin = parseInstanceAuthCanonicalOrigin(options.canonicalOrigin);
    const canonicalHost = new URL(canonicalOrigin).hostname.toLowerCase();

    if (canonicalHost !== relyingPartyId && !canonicalHost.endsWith(`.${relyingPartyId}`)) {
      throw new Error(
        "Instance auth relying-party id must match or be a parent domain of the canonical origin.",
      );
    }
  }

  return relyingPartyId;
}

export function parseInstanceAuthRelyingPartyName(value: unknown): string {
  return parseTrimmedNonEmptyString("Instance auth relying-party name", value);
}

export function parseOwnerPasskeyRegistrationOptionsRequest(
  value: unknown,
): OwnerPasskeyRegistrationOptionsRequest {
  const object = parseObject("Passkey registration options request", value);

  assertKeys("Passkey registration options request", object, ["setupToken"]);

  return {
    setupToken: parseOwnerSetupToken(object.setupToken),
  };
}

export function parseOwnerPasskeyRegistrationOptionsResponse(
  value: unknown,
): OwnerPasskeyRegistrationOptionsResponse {
  const object = parseObject("Passkey registration options response", value);

  assertKeys("Passkey registration options response", object, ["options"]);

  return {
    options: parseCreationOptions("Passkey registration options", object.options),
  };
}

export function parseOwnerPasskeyRegistrationVerifyRequest(
  value: unknown,
): OwnerPasskeyRegistrationVerifyRequest {
  const object = parseObject("Passkey registration verify request", value);

  assertKeys("Passkey registration verify request", object, ["owner", "response", "setupToken"]);

  return {
    setupToken: parseOwnerSetupToken(object.setupToken),
    owner: parseOwnerIdentityInput("Passkey registration owner", object.owner),
    response: parseRegistrationResponse("Passkey registration response", object.response),
  };
}

export function parseOwnerPasskeyRegistrationVerifyResponse(
  value: unknown,
): OwnerPasskeyRegistrationVerifyResponse {
  const object = parseObject("Passkey registration verify response", value);

  assertKeys(
    "Passkey registration verify response",
    object,
    ["owner", "setupComplete"],
    ["session"],
  );

  if (object.setupComplete !== true) {
    throw new Error("Passkey registration verify response setupComplete must be true.");
  }

  return {
    owner: parseOwnerIdentity("Passkey registration owner", object.owner),
    ...(object.session === undefined
      ? {}
      : { session: parseOwnerSessionSummary("Passkey registration session", object.session) }),
    setupComplete: true,
  };
}

export function parseOwnerPasskeyLoginOptionsRequest(
  value: unknown,
): OwnerPasskeyLoginOptionsRequest {
  const object = parseObject("Passkey login options request", value);

  assertKeys("Passkey login options request", object, []);

  return {};
}

export function parseOwnerPasskeyLoginOptionsResponse(
  value: unknown,
): OwnerPasskeyLoginOptionsResponse {
  const object = parseObject("Passkey login options response", value);

  assertKeys("Passkey login options response", object, ["options"]);

  return {
    options: parseRequestOptions("Passkey login options", object.options),
  };
}

export function parseOwnerPasskeyLoginVerifyRequest(
  value: unknown,
): OwnerPasskeyLoginVerifyRequest {
  const object = parseObject("Passkey login verify request", value);

  assertKeys("Passkey login verify request", object, ["response"], ["redirectTo"]);

  return {
    ...(object.redirectTo === undefined
      ? {}
      : {
          redirectTo: parseString("Passkey login verify request redirectTo", object.redirectTo),
        }),
    response: parseAuthenticationResponse("Passkey login response", object.response),
  };
}

export function parseOwnerPasskeyLoginVerifyResponse(
  value: unknown,
): OwnerPasskeyLoginVerifyResponse {
  const object = parseObject("Passkey login verify response", value);

  assertKeys("Passkey login verify response", object, [
    "authenticated",
    "continueTo",
    "owner",
    "session",
  ]);

  if (object.authenticated !== true) {
    throw new Error("Passkey login verify response authenticated must be true.");
  }

  return {
    authenticated: true,
    continueTo: parseOwnerLoginContinuationTarget(
      "Passkey login verify response continueTo",
      object.continueTo,
    ),
    owner: parseOwnerIdentity("Passkey login owner", object.owner),
    session: parseOwnerSessionSummary("Passkey login session", object.session),
  };
}

export function parseOwnerSessionStatusResponse(value: unknown): OwnerSessionStatusResponse {
  const object = parseObject("Owner session status response", value);

  if (object.authenticated === true) {
    assertKeys("Owner session status response", object, [
      "authenticated",
      "owner",
      "session",
      "setupComplete",
    ]);

    if (object.setupComplete !== true) {
      throw new Error("Owner session status response setupComplete must be true.");
    }

    return {
      authenticated: true,
      owner: parseOwnerIdentity("Owner session owner", object.owner),
      session: parseOwnerSessionSummary("Owner session", object.session),
      setupComplete: true,
    };
  }

  if (object.authenticated !== false) {
    throw new Error("Owner session status response authenticated must be a boolean.");
  }

  assertKeys(
    "Owner session status response",
    object,
    ["authenticated", "setupComplete"],
    ["owner"],
  );

  if (typeof object.setupComplete !== "boolean") {
    throw new Error("Owner session status response setupComplete must be a boolean.");
  }

  return {
    authenticated: false,
    ...(object.owner === undefined
      ? {}
      : { owner: parseOwnerIdentity("Owner session owner", object.owner) }),
    setupComplete: object.setupComplete,
  };
}

export function parseOwnerLogoutResponse(value: unknown): OwnerLogoutResponse {
  const object = parseObject("Owner logout response", value);

  assertKeys("Owner logout response", object, ["authenticated"]);

  if (object.authenticated !== false) {
    throw new Error("Owner logout response authenticated must be false.");
  }

  return { authenticated: false };
}

export function parseInstanceAuthErrorResponse(value: unknown): InstanceAuthErrorResponse {
  const object = parseObject("Instance auth error response", value);

  assertKeys("Instance auth error response", object, ["error"]);

  return {
    error: parseTrimmedNonEmptyString("Instance auth error response error", object.error),
  };
}

export function parseCollaboratorInvitationAcceptanceRequest(
  value: unknown,
): CollaboratorInvitationAcceptanceRequest {
  const object = parseObject("Collaborator invitation acceptance request", value);

  assertKeys("Collaborator invitation acceptance request", object, ["invitationId", "token"]);

  return {
    invitationId: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance invitationId",
      object.invitationId,
    ),
    token: parseBase64UrlString("Collaborator invitation acceptance token", object.token),
  };
}

export function parseCollaboratorInvitationAcceptanceStatusResponse(
  value: unknown,
): CollaboratorInvitationAcceptanceStatusResponse {
  const object = parseObject("Collaborator invitation acceptance status response", value);

  if (object.eligible === true) {
    assertKeys("Collaborator invitation acceptance status response", object, [
      "eligible",
      "invitation",
    ]);

    return {
      eligible: true,
      invitation: parseCollaboratorInvitationAcceptanceInvitationSummary(object.invitation),
    };
  }

  if (object.eligible !== false) {
    throw new Error("Collaborator invitation acceptance status response eligible must be boolean.");
  }

  assertKeys("Collaborator invitation acceptance status response", object, [
    "eligible",
    "error",
    "reason",
  ]);

  return {
    eligible: false,
    error: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance status response error",
      object.error,
    ),
    reason: parseStringLiteral(
      "Collaborator invitation acceptance status response reason",
      object.reason,
      collaboratorInvitationAcceptanceFailureReasons,
    ),
  };
}

export function parseCollaboratorInvitationPasskeyRegistrationOptionsRequest(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationOptionsRequest {
  return parseCollaboratorInvitationAcceptanceRequest(value);
}

export function parseCollaboratorInvitationPasskeyRegistrationOptionsResponse(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationOptionsResponse {
  const object = parseObject(
    "Collaborator invitation passkey registration options response",
    value,
  );

  assertKeys("Collaborator invitation passkey registration options response", object, ["options"]);

  return {
    options: parseCreationOptions(
      "Collaborator invitation passkey registration options",
      object.options,
    ),
  };
}

export function parseCollaboratorInvitationPasskeyRegistrationVerifyRequest(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationVerifyRequest {
  const object = parseObject("Collaborator invitation passkey registration verify request", value);

  assertKeys("Collaborator invitation passkey registration verify request", object, [
    "invitationId",
    "response",
    "token",
  ]);

  return {
    invitationId: parseTrimmedNonEmptyString(
      "Collaborator invitation passkey registration invitationId",
      object.invitationId,
    ),
    response: parseRegistrationResponse(
      "Collaborator invitation passkey registration response",
      object.response,
    ),
    token: parseBase64UrlString("Collaborator invitation passkey registration token", object.token),
  };
}

export function parseCollaboratorInvitationPasskeyRegistrationVerifyResponse(
  value: unknown,
): CollaboratorInvitationPasskeyRegistrationVerifyResponse {
  const object = parseObject("Collaborator invitation passkey registration verify response", value);

  assertKeys(
    "Collaborator invitation passkey registration verify response",
    object,
    ["acceptedPrincipal", "invitation", "session", "verified"],
    ["handoff"],
  );

  if (object.verified !== true) {
    throw new Error(
      "Collaborator invitation passkey registration verify response verified must be true.",
    );
  }

  return {
    acceptedPrincipal: parseCollaboratorInvitationAcceptedPrincipalSummary(
      object.acceptedPrincipal,
    ),
    ...(object.handoff === undefined
      ? {}
      : { handoff: parseCollaboratorInvitationAcceptanceHandoffSummary(object.handoff) }),
    invitation: parseCollaboratorInvitationAcceptanceInvitationSummary(object.invitation),
    session: parseOwnerSessionSummary(
      "Collaborator invitation passkey registration verify session",
      object.session,
    ),
    verified: true,
  };
}

function parseCollaboratorInvitationAcceptedPrincipalSummary(
  value: unknown,
): CollaboratorInvitationAcceptedPrincipalSummary {
  const object = parseObject("Collaborator invitation accepted principal", value);

  assertKeys("Collaborator invitation accepted principal", object, ["displayName", "principalId"]);

  return {
    displayName: parseTrimmedNonEmptyString(
      "Collaborator invitation accepted principal displayName",
      object.displayName,
    ),
    principalId: parseTrimmedNonEmptyString(
      "Collaborator invitation accepted principal principalId",
      object.principalId,
    ),
  };
}

function parseCollaboratorInvitationAcceptanceHandoffSummary(
  value: unknown,
): CollaboratorInvitationAcceptanceHandoffSummary {
  const object = parseObject("Collaborator invitation acceptance handoff", value);

  assertKeys("Collaborator invitation acceptance handoff", object, ["returnTo", "targetOrigin"]);

  const returnTo = parseOwnerLoginRedirectTarget(object.returnTo);

  if (!returnTo) {
    throw new Error("Collaborator invitation acceptance handoff returnTo must be path-only.");
  }

  return {
    returnTo,
    targetOrigin: parseInstanceAuthCanonicalOrigin(object.targetOrigin),
  };
}

function parseOwnerLoginContinuationTarget(
  context: string,
  value: unknown,
): OwnerLoginRedirectTarget {
  const target = parseOwnerLoginRedirectTarget(value);

  if (!target) {
    throw new Error(`${context} must be path-only.`);
  }

  return target;
}

function parseCollaboratorInvitationAcceptanceInvitationSummary(
  value: unknown,
): CollaboratorInvitationAcceptanceInvitationSummary {
  const object = parseObject("Collaborator invitation acceptance invitation summary", value);

  assertKeys(
    "Collaborator invitation acceptance invitation summary",
    object,
    ["expiresAt", "invitationId", "passkeyRegistrationRequired", "targetEmail", "targetSurface"],
    ["invitedPrincipalDisplayName", "targetAppInstallId", "targetOrganization"],
  );

  return {
    expiresAt: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance expiresAt",
      object.expiresAt,
    ),
    invitationId: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance invitationId",
      object.invitationId,
    ),
    ...(object.invitedPrincipalDisplayName === undefined
      ? {}
      : {
          invitedPrincipalDisplayName: parseTrimmedNonEmptyString(
            "Collaborator invitation acceptance invitedPrincipalDisplayName",
            object.invitedPrincipalDisplayName,
          ),
        }),
    passkeyRegistrationRequired: parseBoolean(
      "Collaborator invitation acceptance passkeyRegistrationRequired",
      object.passkeyRegistrationRequired,
    ),
    targetEmail: parseTrimmedNonEmptyString(
      "Collaborator invitation acceptance targetEmail",
      object.targetEmail,
    ),
    ...parseCollaboratorInvitationAcceptanceTargetFacts(object),
  };
}

function parseCollaboratorInvitationAcceptanceTargetFacts(
  object: Record<string, unknown>,
): Pick<
  CollaboratorInvitationAcceptanceInvitationSummary,
  "targetAppInstallId" | "targetOrganization" | "targetSurface"
> {
  const targetSurface = parseStringLiteral(
    "Collaborator invitation acceptance targetSurface",
    object.targetSurface,
    collaboratorInvitationAcceptanceTargetSurfaces,
  );
  const targetAppInstallId =
    object.targetAppInstallId === undefined
      ? undefined
      : parseTrimmedNonEmptyString(
          "Collaborator invitation acceptance targetAppInstallId",
          object.targetAppInstallId,
        );
  const targetOrganization =
    object.targetOrganization === undefined
      ? undefined
      : parseTrimmedNonEmptyString(
          "Collaborator invitation acceptance targetOrganization",
          object.targetOrganization,
        );

  if (targetSurface === "app-install") {
    if (targetAppInstallId === undefined || targetOrganization !== undefined) {
      throw new Error(
        "Collaborator invitation acceptance app-install target requires targetAppInstallId only.",
      );
    }

    return {
      targetSurface,
      targetAppInstallId,
    };
  }

  if (targetSurface === "organization") {
    if (targetOrganization === undefined || targetAppInstallId !== undefined) {
      throw new Error(
        "Collaborator invitation acceptance organization target requires targetOrganization only.",
      );
    }

    return {
      targetSurface,
      targetOrganization,
    };
  }

  if (targetAppInstallId !== undefined || targetOrganization !== undefined) {
    throw new Error(
      "Collaborator invitation acceptance instance target cannot include target ids.",
    );
  }

  return { targetSurface };
}

function parseCreationOptions(
  context: string,
  value: unknown,
): PublicKeyCredentialCreationOptionsJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["challenge", "pubKeyCredParams", "rp", "user"],
    [
      "attestation",
      "attestationFormats",
      "authenticatorSelection",
      "excludeCredentials",
      "extensions",
      "hints",
      "timeout",
    ],
  );

  return {
    rp: parseRelyingPartyEntity(`${context} rp`, object.rp),
    user: parseUserEntity(`${context} user`, object.user),
    challenge: parseBase64UrlString(`${context} challenge`, object.challenge),
    pubKeyCredParams: parseCredentialParameters(
      `${context} pubKeyCredParams`,
      object.pubKeyCredParams,
    ),
    ...(object.timeout === undefined
      ? {}
      : { timeout: parsePositiveInteger(`${context} timeout`, object.timeout) }),
    ...(object.excludeCredentials === undefined
      ? {}
      : {
          excludeCredentials: parseCredentialDescriptors(
            `${context} excludeCredentials`,
            object.excludeCredentials,
          ),
        }),
    ...(object.authenticatorSelection === undefined
      ? {}
      : {
          authenticatorSelection: parseAuthenticatorSelection(
            `${context} authenticatorSelection`,
            object.authenticatorSelection,
          ),
        }),
    ...(object.hints === undefined
      ? {}
      : { hints: parseCredentialHints(`${context} hints`, object.hints) }),
    ...(object.attestation === undefined
      ? {}
      : {
          attestation: parseStringLiteral(
            `${context} attestation`,
            object.attestation,
            attestationConveyancePreferences,
          ),
        }),
    ...(object.attestationFormats === undefined
      ? {}
      : {
          attestationFormats: parseAttestationFormats(
            `${context} attestationFormats`,
            object.attestationFormats,
          ),
        }),
    ...(object.extensions === undefined
      ? {}
      : { extensions: parseExtensions(`${context} extensions`, object.extensions) }),
  };
}

function parseRequestOptions(
  context: string,
  value: unknown,
): PublicKeyCredentialRequestOptionsJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["challenge"],
    ["allowCredentials", "extensions", "hints", "rpId", "timeout", "userVerification"],
  );

  return {
    challenge: parseBase64UrlString(`${context} challenge`, object.challenge),
    ...(object.timeout === undefined
      ? {}
      : { timeout: parsePositiveInteger(`${context} timeout`, object.timeout) }),
    ...(object.rpId === undefined ? {} : { rpId: parseInstanceAuthRelyingPartyId(object.rpId) }),
    ...(object.allowCredentials === undefined
      ? {}
      : {
          allowCredentials: parseCredentialDescriptors(
            `${context} allowCredentials`,
            object.allowCredentials,
          ),
        }),
    ...(object.userVerification === undefined
      ? {}
      : {
          userVerification: parseStringLiteral(
            `${context} userVerification`,
            object.userVerification,
            userVerificationRequirements,
          ) as UserVerificationRequirement,
        }),
    ...(object.hints === undefined
      ? {}
      : { hints: parseCredentialHints(`${context} hints`, object.hints) }),
    ...(object.extensions === undefined
      ? {}
      : { extensions: parseExtensions(`${context} extensions`, object.extensions) }),
  };
}

function parseRegistrationResponse(context: string, value: unknown): RegistrationResponseJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["clientExtensionResults", "id", "rawId", "response", "type"],
    ["authenticatorAttachment"],
  );

  return {
    id: parseBase64UrlString(`${context} id`, object.id),
    rawId: parseBase64UrlString(`${context} rawId`, object.rawId),
    response: parseAttestationResponse(`${context} response`, object.response),
    ...(object.authenticatorAttachment === undefined
      ? {}
      : {
          authenticatorAttachment: parseStringLiteral(
            `${context} authenticatorAttachment`,
            object.authenticatorAttachment,
            authenticatorAttachments,
          ) as AuthenticatorAttachment,
        }),
    clientExtensionResults: parseClientExtensionResults(
      `${context} clientExtensionResults`,
      object.clientExtensionResults,
    ),
    type: parsePublicKeyCredentialType(`${context} type`, object.type),
  };
}

function parseAuthenticationResponse(context: string, value: unknown): AuthenticationResponseJSON {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["clientExtensionResults", "id", "rawId", "response", "type"],
    ["authenticatorAttachment"],
  );

  return {
    id: parseBase64UrlString(`${context} id`, object.id),
    rawId: parseBase64UrlString(`${context} rawId`, object.rawId),
    response: parseAssertionResponse(`${context} response`, object.response),
    ...(object.authenticatorAttachment === undefined
      ? {}
      : {
          authenticatorAttachment: parseStringLiteral(
            `${context} authenticatorAttachment`,
            object.authenticatorAttachment,
            authenticatorAttachments,
          ) as AuthenticatorAttachment,
        }),
    clientExtensionResults: parseClientExtensionResults(
      `${context} clientExtensionResults`,
      object.clientExtensionResults,
    ),
    type: parsePublicKeyCredentialType(`${context} type`, object.type),
  };
}

function parseAttestationResponse(
  context: string,
  value: unknown,
): RegistrationResponseJSON["response"] {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    ["attestationObject", "clientDataJSON"],
    ["authenticatorData", "publicKey", "publicKeyAlgorithm", "transports"],
  );

  return {
    clientDataJSON: parseBase64UrlString(`${context} clientDataJSON`, object.clientDataJSON),
    attestationObject: parseBase64UrlString(
      `${context} attestationObject`,
      object.attestationObject,
    ),
    ...(object.authenticatorData === undefined
      ? {}
      : {
          authenticatorData: parseBase64UrlString(
            `${context} authenticatorData`,
            object.authenticatorData,
          ),
        }),
    ...(object.transports === undefined
      ? {}
      : { transports: parseTransports(`${context} transports`, object.transports) }),
    ...(object.publicKeyAlgorithm === undefined
      ? {}
      : {
          publicKeyAlgorithm: parseInteger(
            `${context} publicKeyAlgorithm`,
            object.publicKeyAlgorithm,
          ),
        }),
    ...(object.publicKey === undefined
      ? {}
      : { publicKey: parseBase64UrlString(`${context} publicKey`, object.publicKey) }),
  };
}

function parseAssertionResponse(
  context: string,
  value: unknown,
): AuthenticationResponseJSON["response"] {
  const object = parseObject(context, value);

  assertKeys(context, object, ["authenticatorData", "clientDataJSON", "signature"], ["userHandle"]);

  return {
    clientDataJSON: parseBase64UrlString(`${context} clientDataJSON`, object.clientDataJSON),
    authenticatorData: parseBase64UrlString(
      `${context} authenticatorData`,
      object.authenticatorData,
    ),
    signature: parseBase64UrlString(`${context} signature`, object.signature),
    ...(object.userHandle === undefined
      ? {}
      : { userHandle: parseBase64UrlString(`${context} userHandle`, object.userHandle) }),
  };
}

function parseRelyingPartyEntity(context: string, value: unknown): PublicKeyCredentialRpEntity {
  const object = parseObject(context, value);

  assertKeys(context, object, ["id", "name"]);

  return {
    id: parseInstanceAuthRelyingPartyId(object.id),
    name: parseTrimmedNonEmptyString(`${context} name`, object.name),
  };
}

function parseUserEntity(context: string, value: unknown): PublicKeyCredentialUserEntityJSON {
  const object = parseObject(context, value);

  assertKeys(context, object, ["displayName", "id", "name"]);

  return {
    id: parseBase64UrlString(`${context} id`, object.id),
    name: parseTrimmedNonEmptyString(`${context} name`, object.name),
    displayName: parseTrimmedNonEmptyString(`${context} displayName`, object.displayName),
  };
}

function parseCredentialParameters(
  context: string,
  value: unknown,
): PublicKeyCredentialParameters[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  return value.map((item, index) => {
    const object = parseObject(`${context}[${index}]`, item);

    assertKeys(`${context}[${index}]`, object, ["alg", "type"]);

    return {
      type: parsePublicKeyCredentialType(`${context}[${index}] type`, object.type),
      alg: parseInteger(`${context}[${index}] alg`, object.alg),
    };
  });
}

function parseCredentialDescriptors(
  context: string,
  value: unknown,
): PublicKeyCredentialDescriptorJSON[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) => {
    const object = parseObject(`${context}[${index}]`, item);

    assertKeys(`${context}[${index}]`, object, ["id", "type"], ["transports"]);

    return {
      id: parseBase64UrlString(`${context}[${index}] id`, object.id),
      type: parsePublicKeyCredentialType(`${context}[${index}] type`, object.type),
      ...(object.transports === undefined
        ? {}
        : { transports: parseTransports(`${context}[${index}] transports`, object.transports) }),
    };
  });
}

function parseAuthenticatorSelection(
  context: string,
  value: unknown,
): AuthenticatorSelectionCriteria {
  const object = parseObject(context, value);

  assertKeys(
    context,
    object,
    [],
    ["authenticatorAttachment", "residentKey", "requireResidentKey", "userVerification"],
  );

  return {
    ...(object.authenticatorAttachment === undefined
      ? {}
      : {
          authenticatorAttachment: parseStringLiteral(
            `${context} authenticatorAttachment`,
            object.authenticatorAttachment,
            authenticatorAttachments,
          ),
        }),
    ...(object.residentKey === undefined
      ? {}
      : {
          residentKey: parseStringLiteral(
            `${context} residentKey`,
            object.residentKey,
            residentKeyRequirements,
          ),
        }),
    ...(object.requireResidentKey === undefined
      ? {}
      : {
          requireResidentKey: parseBoolean(
            `${context} requireResidentKey`,
            object.requireResidentKey,
          ),
        }),
    ...(object.userVerification === undefined
      ? {}
      : {
          userVerification: parseStringLiteral(
            `${context} userVerification`,
            object.userVerification,
            userVerificationRequirements,
          ),
        }),
  };
}

function parseTransports(context: string, value: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) =>
    parseStringLiteral(`${context}[${index}]`, item, authenticatorTransports),
  ) as AuthenticatorTransportFuture[];
}

function parseCredentialHints(context: string, value: unknown): PublicKeyCredentialHint[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) =>
    parseStringLiteral(`${context}[${index}]`, item, publicKeyCredentialHints),
  ) as PublicKeyCredentialHint[];
}

function parseAttestationFormats(context: string, value: unknown): AttestationFormat[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((item, index) =>
    parseStringLiteral(`${context}[${index}]`, item, attestationFormats),
  ) as AttestationFormat[];
}

function parseExtensions(context: string, value: unknown): AuthenticationExtensionsClientInputs {
  const object = parseObject(context, value);

  return { ...object } as AuthenticationExtensionsClientInputs;
}

function parseClientExtensionResults(
  context: string,
  value: unknown,
): AuthenticationExtensionsClientOutputs {
  const object = parseObject(context, value);

  return { ...object } as AuthenticationExtensionsClientOutputs;
}

function parseOwnerIdentityInput(context: string, value: unknown): OwnerIdentityInput {
  const object = parseObject(context, value);

  assertKeys(context, object, ["name"], ["email"]);

  const email =
    object.email === undefined
      ? undefined
      : parseTrimmedNonEmptyString(`${context} email`, object.email);

  return {
    name: parseTrimmedNonEmptyString(`${context} name`, object.name),
    ...(email === undefined ? {} : { email }),
  };
}

function parseOwnerIdentity(context: string, value: unknown): OwnerIdentity {
  const object = parseObject(context, value);

  assertKeys(context, object, ["createdAt", "id", "name"], ["email"]);

  const email =
    object.email === undefined
      ? undefined
      : parseTrimmedNonEmptyString(`${context} email`, object.email);

  return {
    id: parseTrimmedNonEmptyString(`${context} id`, object.id),
    name: parseTrimmedNonEmptyString(`${context} name`, object.name),
    ...(email === undefined ? {} : { email }),
    createdAt: parseTrimmedNonEmptyString(`${context} createdAt`, object.createdAt),
  };
}

function parseOwnerSessionSummary(context: string, value: unknown): OwnerSessionSummary {
  const object = parseObject(context, value);

  assertKeys(context, object, ["expiresAt"]);

  return {
    expiresAt: parseTrimmedNonEmptyString(`${context} expiresAt`, object.expiresAt),
  };
}

function parsePublicKeyCredentialType(context: string, value: unknown): "public-key" {
  if (value !== "public-key") {
    throw new Error(`${context} must be "public-key".`);
  }

  return "public-key";
}

function parseBase64UrlString(context: string, value: unknown): string {
  const stringValue = parseTrimmedNonEmptyString(context, value);

  if (!base64UrlPattern.test(stringValue)) {
    throw new Error(`${context} must be base64url.`);
  }

  return stringValue;
}

function parseStringLiteral<T extends readonly string[]>(
  context: string,
  value: unknown,
  allowedValues: T,
): T[number] {
  if (typeof value !== "string" || !allowedValues.includes(value as T[number])) {
    throw new Error(`${context} is unsupported.`);
  }

  return value;
}

function parsePositiveInteger(context: string, value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseInteger(context: string, value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== "number") {
    throw new Error(`${context} must be an integer.`);
  }

  return value;
}

function parseBoolean(context: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseString(context: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }

  return value;
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertKeys(
  context: string,
  object: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in object)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isValidRelyingPartyId(value: string): boolean {
  if (value === "localhost") {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    return false;
  }

  return value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
