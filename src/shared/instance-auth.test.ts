import { describe, expect, it } from "vite-plus/test";

import {
  parseAccountCompletionContinuationResult,
  parseAccountCompletionGate,
  parseAccountCompletionGateResolutionResult,
  parseAccountCompletionGateResult,
  parseAccountCompletionGateTarget,
  parseCollaboratorInvitationAcceptanceRequest,
  parseCollaboratorInvitationAcceptanceStatusResponse,
  parseCollaboratorInvitationPasskeyRegistrationOptionsRequest,
  parseCollaboratorInvitationPasskeyRegistrationOptionsResponse,
  parseCollaboratorInvitationPasskeyRegistrationVerifyRequest,
  parseCollaboratorInvitationPasskeyRegistrationVerifyResponse,
  parseInstanceAuthCanonicalOrigin,
  parseInstanceAuthConfigInput,
  parseInstanceAuthErrorResponse,
  parseInstanceAuthRelyingPartyId,
  parseOwnerLogoutResponse,
  parseOwnerPasskeyLoginOptionsRequest,
  parseOwnerPasskeyLoginOptionsResponse,
  parseOwnerPasskeyLoginVerifyRequest,
  parseOwnerPasskeyLoginVerifyResponse,
  parseOwnerPasskeyRegistrationOptionsRequest,
  parseOwnerPasskeyRegistrationOptionsResponse,
  parseOwnerPasskeyRegistrationVerifyRequest,
  parseOwnerPasskeyRegistrationVerifyResponse,
  parseOwnerSessionStatusResponse,
  ownerLoginRedirectLocationForRoute,
  ownerLoginRedirectTargetFromSearch,
  parseOwnerLoginRedirectTarget,
} from "./instance-auth.ts";

const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const invitationToken = "aW52aXRlLXJhdy10b2tlbi0x";
const owner = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-28T00:00:00.000Z",
};

describe("instance auth origin policy", () => {
  it("parses explicit canonical origin and relying-party config", () => {
    expect(
      parseInstanceAuthConfigInput({
        canonicalOrigin: "https://Instance.Example.com/",
        relyingPartyId: " example.com ",
        relyingPartyName: " Formless ",
      }),
    ).toEqual({
      canonicalOrigin: "https://instance.example.com",
      relyingPartyId: "example.com",
      relyingPartyName: "Formless",
    });

    expect(parseInstanceAuthCanonicalOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(
      parseInstanceAuthRelyingPartyId("instance.example.com", {
        canonicalOrigin: "https://instance.example.com",
      }),
    ).toBe("instance.example.com");
  });

  it("rejects non-origin values and mapped sibling hosts as relying parties", () => {
    expect(() => parseInstanceAuthCanonicalOrigin("https://instance.example.com/login")).toThrow(
      "Instance auth canonical origin must not include a path, query, or fragment.",
    );
    expect(() => parseInstanceAuthCanonicalOrigin("http://instance.example.com")).toThrow(
      "Instance auth canonical origin must use HTTPS unless it is localhost.",
    );
    expect(() =>
      parseInstanceAuthRelyingPartyId("mapped.example.com", {
        canonicalOrigin: "https://instance.example.com",
      }),
    ).toThrow(
      "Instance auth relying-party id must match or be a parent domain of the canonical origin.",
    );
    expect(() => parseInstanceAuthRelyingPartyId("https://example.com")).toThrow(
      "Instance auth relying-party id must be a host name, not a URL.",
    );
  });
});

describe("collaborator invitation acceptance protocol", () => {
  it("parses invitation acceptance requests, passkey requests, and display-safe responses", () => {
    expect(
      parseCollaboratorInvitationAcceptanceRequest({
        invitationId: " invitation:ada ",
        token: invitationToken,
      }),
    ).toEqual({
      invitationId: "invitation:ada",
      token: invitationToken,
    });
    expect(
      parseCollaboratorInvitationAcceptanceStatusResponse({
        eligible: true,
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "app-install",
          targetAppInstallId: "site",
          expiresAt: "2999-02-01T00:00:00.000Z",
          invitedPrincipalDisplayName: "Ada Collaborator",
          passkeyRegistrationRequired: true,
        },
      }),
    ).toEqual({
      eligible: true,
      invitation: {
        invitationId: "invitation:ada",
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "app-install",
        targetAppInstallId: "site",
        expiresAt: "2999-02-01T00:00:00.000Z",
        invitedPrincipalDisplayName: "Ada Collaborator",
        passkeyRegistrationRequired: true,
      },
    });
    expect(
      parseCollaboratorInvitationAcceptanceStatusResponse({
        eligible: false,
        error: "Invitation link is invalid.",
        reason: "wrong-target",
      }),
    ).toEqual({
      eligible: false,
      error: "Invitation link is invalid.",
      reason: "wrong-target",
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationOptionsRequest({
        invitationId: "invitation:ada",
        token: invitationToken,
      }),
    ).toEqual({
      invitationId: "invitation:ada",
      token: invitationToken,
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationOptionsResponse({
        options: registrationOptions(),
      }),
    ).toEqual({
      options: registrationOptions(),
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationVerifyRequest({
        invitationId: "invitation:ada",
        token: invitationToken,
        response: registrationResponse(),
      }),
    ).toEqual({
      invitationId: "invitation:ada",
      token: invitationToken,
      response: registrationResponse(),
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationVerifyResponse({
        acceptedPrincipal: {
          principalId: "principal:ada",
          displayName: "Ada Collaborator",
        },
        handoff: {
          targetOrigin: "https://app.example.com",
          returnTo: "/",
        },
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "app-install",
          targetAppInstallId: "site",
          expiresAt: "2999-02-01T00:00:00.000Z",
          passkeyRegistrationRequired: true,
        },
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        verified: true,
      }),
    ).toEqual({
      acceptedPrincipal: {
        principalId: "principal:ada",
        displayName: "Ada Collaborator",
      },
      handoff: {
        targetOrigin: "https://app.example.com",
        returnTo: "/",
      },
      invitation: {
        invitationId: "invitation:ada",
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "app-install",
        targetAppInstallId: "site",
        expiresAt: "2999-02-01T00:00:00.000Z",
        passkeyRegistrationRequired: true,
      },
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      verified: true,
    });
    expect(
      parseCollaboratorInvitationPasskeyRegistrationVerifyResponse({
        acceptedPrincipal: {
          principalId: "principal:ada",
          displayName: "Ada Collaborator",
        },
        accountCompletion: {
          gate: { credentialMethod: "passkey", kind: "credential" },
          status: "blocked",
          target: accountCompletionTarget(),
        },
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "app-install",
          targetAppInstallId: "site",
          expiresAt: "2999-02-01T00:00:00.000Z",
          passkeyRegistrationRequired: true,
        },
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        verified: true,
      }),
    ).toEqual({
      acceptedPrincipal: {
        principalId: "principal:ada",
        displayName: "Ada Collaborator",
      },
      accountCompletion: {
        gate: { credentialMethod: "passkey", kind: "credential" },
        status: "blocked",
        target: accountCompletionTarget(),
      },
      invitation: {
        invitationId: "invitation:ada",
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "app-install",
        targetAppInstallId: "site",
        expiresAt: "2999-02-01T00:00:00.000Z",
        passkeyRegistrationRequired: true,
      },
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      verified: true,
    });
  });

  it("rejects malformed invitation acceptance payloads and private fields", () => {
    expect(() =>
      parseCollaboratorInvitationAcceptanceRequest({
        invitationId: "invitation:ada",
        token: "not+base64",
      }),
    ).toThrow("Collaborator invitation acceptance token must be base64url.");
    expect(() =>
      parseCollaboratorInvitationAcceptanceStatusResponse({
        eligible: true,
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "instance",
          targetAppInstallId: "site",
          expiresAt: "2999-02-01T00:00:00.000Z",
          passkeyRegistrationRequired: true,
        },
      }),
    ).toThrow("Collaborator invitation acceptance instance target cannot include target ids.");
    expect(() =>
      parseCollaboratorInvitationAcceptanceStatusResponse({
        eligible: false,
        error: "Invitation link is invalid.",
        reason: "wrong-token",
        tokenHash: "private",
      }),
    ).toThrow(
      'Collaborator invitation acceptance status response has unsupported key "tokenHash".',
    );
    expect(() =>
      parseCollaboratorInvitationPasskeyRegistrationOptionsResponse({
        options: registrationOptions(),
        tokenHash: "private",
      }),
    ).toThrow(
      'Collaborator invitation passkey registration options response has unsupported key "tokenHash".',
    );
    expect(() =>
      parseCollaboratorInvitationPasskeyRegistrationVerifyResponse({
        acceptedPrincipal: {
          principalId: "principal:ada",
          displayName: "Ada Collaborator",
        },
        invitation: {
          invitationId: "invitation:ada",
          targetEmail: "Ada.Collab@example.com",
          targetSurface: "app-install",
          targetAppInstallId: "site",
          expiresAt: "2999-02-01T00:00:00.000Z",
          passkeyRegistrationRequired: true,
        },
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        sessionId: "private",
        verified: true,
      }),
    ).toThrow(
      'Collaborator invitation passkey registration verify response has unsupported key "sessionId".',
    );
    expect(() =>
      parseCollaboratorInvitationPasskeyRegistrationVerifyRequest({
        invitationId: "invitation:ada",
        token: invitationToken,
        response: { ...registrationResponse(), type: "password" },
      }),
    ).toThrow('Collaborator invitation passkey registration response type must be "public-key".');
  });
});

describe("account completion gate protocol", () => {
  it("parses all first-pass gate kinds with display-safe target facts", () => {
    const target = accountCompletionTarget();
    const gates = [
      {
        kind: "email-verification",
        displayEmail: "Ada.User@example.com",
        principalEmailId: "principal-email:ada",
      },
      {
        kind: "credential",
        credentialMethod: "passkey",
        operation: {
          operationKey: "auth.passkey.create",
          label: "Create passkey",
        },
      },
      {
        kind: "invitation",
        invitationId: "invitation:ada",
        targetEmail: "ada@example.com",
        targetSurface: "app-install",
      },
      {
        kind: "app-registration",
        appInstallId: "site",
        selectedOrganization: "organization:acme",
        operation: {
          appInstallId: "site",
          entityName: "app-registration",
          operationKey: "app.registration.accept",
        },
      },
      {
        kind: "profile-completion",
        appInstallId: "crm",
        profileRecordId: "profile:ada",
        selectedOrganization: "organization:acme",
        operation: {
          appInstallId: "crm",
          entityName: "profile",
          operationKey: "profile.complete",
          operationName: "complete",
        },
      },
      {
        kind: "terms-acceptance",
        policies: [
          {
            accountPolicyId: "account-policy:terms",
            displayName: "Terms of Service",
            policyContentRef: "block:terms",
            policyDocumentUrl: "https://policies.example.com/terms",
            policyKey: "terms",
            version: "2026-07",
          },
        ],
      },
      {
        kind: "role-review",
        roleId: "role:app-admin",
        roleKey: "app.admin",
        scopeKind: "app-install",
        operation: {
          operationKey: "role-review.request",
        },
      },
    ] as const;

    for (const gate of gates) {
      expect(parseAccountCompletionGateResult({ gate, status: "blocked", target })).toEqual({
        gate,
        status: "blocked",
        target,
      });
    }
  });

  it("parses target binding fields and requires a selected app install or storage identity", () => {
    expect(
      parseAccountCompletionGateTarget({
        appInstallId: " site ",
        returnTo: "/records?view=mine",
        routeId: " route:site ",
        selectedOrganization: " organization:acme ",
        storageIdentity: " app:site ",
        targetOrigin: "https://App.Example.com/",
        targetProfile: "app",
      }),
    ).toEqual({
      appInstallId: "site",
      returnTo: "/records?view=mine",
      routeId: "route:site",
      selectedOrganization: "organization:acme",
      storageIdentity: "app:site",
      targetOrigin: "https://app.example.com",
      targetProfile: "app",
    });

    expect(() =>
      parseAccountCompletionGateTarget({
        returnTo: "/",
        routeId: "route:site",
        targetOrigin: "https://app.example.com",
        targetProfile: "app",
      }),
    ).toThrow("Account completion gate target requires appInstallId or storageIdentity.");
  });

  it("keeps continuation targets path-only", () => {
    const complete = {
      continueTo: "/formless/auth/handoff?targetOrigin=https%3A%2F%2Fapp.example.com",
      status: "complete",
      target: accountCompletionTarget(),
    } as const;

    expect(parseAccountCompletionContinuationResult(complete)).toEqual(complete);
    expect(parseAccountCompletionGateResolutionResult(complete)).toEqual(complete);

    expect(() =>
      parseAccountCompletionContinuationResult({
        ...complete,
        continueTo: "https://evil.example.com/formless/auth/handoff",
      }),
    ).toThrow("Account completion continuation result continueTo must be path-only.");
    expect(() =>
      parseAccountCompletionContinuationResult({
        ...complete,
        continueTo: "/formless/auth/handoff#session",
      }),
    ).toThrow("Account completion continuation result continueTo must be path-only.");
  });

  it("rejects unsupported gates and gate payload values", () => {
    expect(() => parseAccountCompletionGate({ kind: "captcha" })).toThrow(
      "Account completion gate kind is unsupported.",
    );
    expect(() =>
      parseAccountCompletionGate({
        kind: "credential",
        credentialMethod: "oauth",
      }),
    ).toThrow("Account completion credential gate credentialMethod is unsupported.");
    expect(() =>
      parseAccountCompletionGateResolutionResult({
        status: "waiting",
        target: accountCompletionTarget(),
      }),
    ).toThrow("Account completion result status is unsupported.");
  });

  it("rejects private material in browser-visible gate and continuation responses", () => {
    const target = accountCompletionTarget();
    const privateResponses = [
      {
        gate: { kind: "email-verification" },
        sessionId: "private-session",
        status: "blocked",
        target,
      },
      {
        gate: { kind: "invitation", tokenHash: "private-token-hash" },
        status: "blocked",
        target,
      },
      {
        gate: { credentialId: "private-credential-id", kind: "credential" },
        status: "blocked",
        target,
      },
      {
        gate: {
          kind: "email-verification",
          operation: {
            operationKey: "auth.verify-email",
            providerResponse: { id: "provider-response" },
          },
        },
        status: "blocked",
        target,
      },
      {
        gate: {
          appInstallId: "crm",
          kind: "profile-completion",
          profileValues: { firstName: "Ada" },
        },
        status: "blocked",
        target,
      },
      {
        continueTo: "/apps/site",
        hostSessionCookie: "private-cookie",
        status: "complete",
        target,
      },
    ] as const;

    for (const response of privateResponses) {
      expect(() => parseAccountCompletionGateResolutionResult(response)).toThrow(
        "private browser-visible field",
      );
    }
  });
});

describe("owner passkey protocol", () => {
  it("parses registration options and registration verify payloads", () => {
    const verifyRequest = {
      setupToken,
      owner: { name: " Ada Owner ", email: " ada@example.com " },
      response: registrationResponse(),
    };

    expect(parseOwnerPasskeyRegistrationOptionsRequest({ setupToken })).toEqual({ setupToken });
    expect(
      parseOwnerPasskeyRegistrationOptionsResponse({ options: registrationOptions() }),
    ).toEqual({
      options: registrationOptions(),
    });
    expect(parseOwnerPasskeyRegistrationVerifyRequest(verifyRequest)).toEqual({
      setupToken,
      owner: { name: "Ada Owner", email: "ada@example.com" },
      response: registrationResponse(),
    });
    expect(
      parseOwnerPasskeyRegistrationVerifyResponse({
        owner,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        setupComplete: true,
      }),
    ).toEqual({
      owner,
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      setupComplete: true,
    });
  });

  it("parses login options, login verify, session status, and logout responses", () => {
    expect(parseOwnerPasskeyLoginOptionsRequest({})).toEqual({});
    expect(parseOwnerPasskeyLoginOptionsResponse({ options: loginOptions() })).toEqual({
      options: loginOptions(),
    });
    expect(
      parseOwnerPasskeyLoginVerifyRequest({
        redirectTo: "/apps/site?screen=owner",
        response: authenticationResponse(),
      }),
    ).toEqual({
      redirectTo: "/apps/site?screen=owner",
      response: authenticationResponse(),
    });
    expect(
      parseOwnerPasskeyLoginVerifyRequest({
        redirectTo: "https://evil.example/apps/site",
        response: authenticationResponse(),
      }),
    ).toEqual({
      redirectTo: "https://evil.example/apps/site",
      response: authenticationResponse(),
    });
    expect(
      parseOwnerPasskeyLoginVerifyResponse({
        authenticated: true,
        continueTo: "/formless/auth/handoff?targetOrigin=https%3A%2F%2Fadmin.example.com",
        owner,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      }),
    ).toEqual({
      authenticated: true,
      continueTo: "/formless/auth/handoff?targetOrigin=https%3A%2F%2Fadmin.example.com",
      owner,
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
    });
    expect(
      parseOwnerSessionStatusResponse({
        authenticated: false,
        owner,
        setupComplete: true,
      }),
    ).toEqual({
      authenticated: false,
      owner,
      setupComplete: true,
    });
    expect(
      parseOwnerSessionStatusResponse({
        authenticated: true,
        owner,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
        setupComplete: true,
      }),
    ).toEqual({
      authenticated: true,
      owner,
      session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      setupComplete: true,
    });
    expect(parseOwnerLogoutResponse({ authenticated: false })).toEqual({ authenticated: false });
  });

  it("rejects malformed passkey payloads and unsupported keys", () => {
    expect(() =>
      parseOwnerPasskeyRegistrationOptionsResponse({
        options: { ...registrationOptions(), challenge: "not+base64" },
      }),
    ).toThrow("Passkey registration options challenge must be base64url.");
    expect(() =>
      parseOwnerPasskeyRegistrationVerifyRequest({
        setupToken,
        owner: { name: "Ada Owner" },
        response: registrationResponse(),
        redirectTo: "/apps/site",
      }),
    ).toThrow('Passkey registration verify request has unsupported key "redirectTo".');
    expect(() =>
      parseOwnerPasskeyLoginVerifyRequest({
        redirectTo: 42,
        response: authenticationResponse(),
      }),
    ).toThrow("Passkey login verify request redirectTo must be a string.");
    expect(() =>
      parseOwnerPasskeyLoginVerifyRequest({
        response: {
          ...authenticationResponse(),
          type: "password",
        },
      }),
    ).toThrow('Passkey login response type must be "public-key".');
    expect(() =>
      parseOwnerPasskeyLoginVerifyResponse({
        authenticated: true,
        continueTo: "https://evil.example/apps/site",
        owner,
        session: { expiresAt: "2026-06-28T00:00:00.000Z" },
      }),
    ).toThrow("Passkey login verify response continueTo must be path-only.");
    expect(() => parseOwnerPasskeyLoginOptionsRequest({ setupToken })).toThrow(
      'Passkey login options request has unsupported key "setupToken".',
    );
  });

  it("parses public-safe error shapes without accepting private details", () => {
    expect(parseInstanceAuthErrorResponse({ error: "Passkey challenge is invalid." })).toEqual({
      error: "Passkey challenge is invalid.",
    });
    expect(() =>
      parseInstanceAuthErrorResponse({
        error: "Passkey challenge is invalid.",
        stack: "private stack trace",
      }),
    ).toThrow('Instance auth error response has unsupported key "stack".');
  });
});

describe("owner login redirects", () => {
  it("keeps only same-origin path and query return targets", () => {
    expect(parseOwnerLoginRedirectTarget("/apps/personal?screen=routes")).toBe(
      "/apps/personal?screen=routes",
    );
    expect(
      ownerLoginRedirectTargetFromSearch(
        "?redirectTo=%2Fapps%2Fpersonal%2Fsettings%3Fpanel%3Ddeploy",
      ),
    ).toBe("/apps/personal/settings?panel=deploy");
    expect(ownerLoginRedirectLocationForRoute("/apps/personal?screen=routes")).toBe(
      "/login?redirectTo=%2Fapps%2Fpersonal%3Fscreen%3Droutes",
    );
  });

  it("ignores unsafe owner login return targets", () => {
    for (const value of [
      "https://formless.local/apps/personal",
      "https://example.com/apps/personal",
      "//example.com/apps/personal",
      "apps/personal",
      "/apps/personal#secret",
      "/\\example.com",
      "/apps/personal\u0000",
      undefined,
    ]) {
      expect(parseOwnerLoginRedirectTarget(value)).toBeUndefined();
    }

    expect(ownerLoginRedirectTargetFromSearch("?redirectTo=https%3A%2F%2Fexample.com")).toBe("/");
    expect(ownerLoginRedirectLocationForRoute("https://example.com/apps/personal")).toBe(
      "/login?redirectTo=%2F",
    );
  });
});

function accountCompletionTarget() {
  return {
    appInstallId: "site",
    returnTo: "/apps/site?screen=home",
    routeId: "route:site",
    selectedOrganization: "organization:acme",
    storageIdentity: "app:site",
    targetOrigin: "https://app.example.com",
    targetProfile: "app",
  } as const;
}

function registrationOptions() {
  return {
    rp: { id: "example.com", name: "Formless" },
    user: {
      id: "b3duZXItMQ",
      name: "ada@example.com",
      displayName: "Ada Owner",
    },
    challenge: "cmVnaXN0cmF0aW9uLWNoYWxsZW5nZQ",
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
    excludeCredentials: [
      { id: "ZXhpc3RpbmctY3JlZGVudGlhbA", type: "public-key", transports: ["internal"] },
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    attestation: "none",
    hints: ["client-device"],
    extensions: {},
  } as const;
}

function registrationResponse() {
  return {
    id: "Y3JlZGVudGlhbC0x",
    rawId: "Y3JlZGVudGlhbC0x",
    response: {
      clientDataJSON: "Y2xpZW50LWRhdGE",
      attestationObject: "YXR0ZXN0YXRpb24",
      transports: ["internal"],
      publicKeyAlgorithm: -7,
      publicKey: "cHVibGljLWtleQ",
    },
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    type: "public-key",
  } as const;
}

function loginOptions() {
  return {
    challenge: "bG9naW4tY2hhbGxlbmdl",
    rpId: "example.com",
    allowCredentials: [{ id: "Y3JlZGVudGlhbC0x", type: "public-key", transports: ["internal"] }],
    timeout: 60000,
    userVerification: "preferred",
    hints: ["client-device"],
    extensions: {},
  } as const;
}

function authenticationResponse() {
  return {
    id: "Y3JlZGVudGlhbC0x",
    rawId: "Y3JlZGVudGlhbC0x",
    response: {
      clientDataJSON: "Y2xpZW50LWRhdGE",
      authenticatorData: "YXV0aGVudGljYXRvci1kYXRh",
      signature: "c2lnbmF0dXJl",
      userHandle: "b3duZXItMQ",
    },
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    type: "public-key",
  } as const;
}
