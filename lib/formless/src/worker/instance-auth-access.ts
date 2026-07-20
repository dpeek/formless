import type {
  AccountCompletionGateResolutionResult,
  AccountCompletionGateTarget,
} from "../shared/instance-auth.ts";
import type { OperationInvocationActor } from "../shared/operation-invocation.ts";
import type { OwnerIdentity } from "../shared/protocol.ts";
import type {
  CentralAuthSession,
  CentralAuthSessionValidationFailureReason,
} from "./central-auth-session.ts";
import type {
  ActiveIdentityAuthority,
  ActiveIdentityPrincipal,
} from "./identity-owner-internal.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";
import type { OwnerSession, OwnerSessionValidationFailureReason } from "./owner-session.ts";

export type HostAuthSession = InstanceAuthSessionTargetBinding & {
  expiresAt: string;
  instanceId: string;
  issuedAt: string;
  principalId: string;
  sessionVersion: number;
};

export type HostAuthSessionValidationFailureReason =
  | "account-completion-required"
  | "expired"
  | "malformed-cookie"
  | "malformed-payload"
  | "missing-cookie"
  | "missing-management-authority"
  | "missing-owner-authority"
  | "missing-principal"
  | "missing-secret"
  | "missing-target"
  | "revoked-session"
  | "tampered-cookie"
  | "wrong-instance"
  | "wrong-purpose"
  | "wrong-target";

export type InstanceAuthAuthorityRequirement = "authenticated" | "management" | "owner";
export type InstanceAuthSession = CentralAuthSession | HostAuthSession | OwnerSession;
export type InstanceAuthSessionKind = "central-session" | "host-session" | "owner-session";

export type CentralAuthSessionReadResult =
  | {
      ok: true;
      ownerSessionFallbackAllowed: boolean;
      session: CentralAuthSession;
    }
  | {
      ok: false;
      ownerSessionFallbackAllowed: boolean;
      reason: CentralAuthSessionValidationFailureReason;
    };

export type LocalOwnerSessionReadResult =
  | { ok: true; session: OwnerSession }
  | { ok: false; reason: OwnerSessionValidationFailureReason };

export type HostAuthSessionReadResult =
  | { ok: true; session: HostAuthSession }
  | { ok: false; reason: HostAuthSessionValidationFailureReason };

export type InstanceAuthAccessReaders = {
  readAccountCompletion: (
    session: InstanceAuthSession,
    target: AccountCompletionGateTarget,
  ) => Promise<AccountCompletionGateResolutionResult>;
  readActivePrincipal: (session: InstanceAuthSession) => Promise<ActiveIdentityPrincipal | null>;
  readCentralSession: () => Promise<CentralAuthSessionReadResult>;
  readHostSession: (target: InstanceAuthSessionTargetBinding) => Promise<HostAuthSessionReadResult>;
  readHostSessionVersion: (session: HostAuthSession) => Promise<number>;
  readLocalOwnerSession: () => Promise<LocalOwnerSessionReadResult>;
  readManagementAuthority: (
    session: InstanceAuthSession,
  ) => Promise<ActiveIdentityAuthority | null>;
  readOwnerAuthority: (session: InstanceAuthSession) => Promise<OwnerIdentity | null>;
};

export type InstanceAuthAccessFailureReason =
  | CentralAuthSessionValidationFailureReason
  | HostAuthSessionValidationFailureReason
  | "missing-management-authority"
  | "missing-owner-authority"
  | "missing-principal";

export type InstanceAuthAccessResult =
  | {
      ok: true;
      ownerAuthorized: boolean;
      principalId: string;
      session: InstanceAuthSession;
      target?: InstanceAuthSessionTargetBinding;
      via: InstanceAuthSessionKind;
    }
  | {
      ok: false;
      accountCompletion?: AccountCompletionGateResolutionResult;
      reason: InstanceAuthAccessFailureReason;
    };

export type InstanceAuthAccessInput = {
  accountCompletionTarget?: AccountCompletionGateTarget;
  localOwnerSessionFallbackAllowed: boolean;
  requiredAuthority: InstanceAuthAuthorityRequirement;
  target?: InstanceAuthSessionTargetBinding;
};

export function validateHostSessionScope(
  session: HostAuthSession,
  facts: {
    instanceId?: string;
    requestOrigin: string;
    target: InstanceAuthSessionTargetBinding;
  },
): "wrong-instance" | "wrong-target" | undefined {
  if (facts.instanceId === undefined || session.instanceId !== facts.instanceId) {
    return "wrong-instance";
  }

  if (
    session.targetOrigin !== facts.requestOrigin ||
    !sessionTargetBindingsEqual(session, facts.target)
  ) {
    return "wrong-target";
  }

  return undefined;
}

type CurrentSessionFailure = Extract<InstanceAuthAccessResult, { ok: false }>;
type CurrentSessionSuccess = Extract<InstanceAuthAccessResult, { ok: true }>;

export async function resolveInstanceAuthAccess(
  input: InstanceAuthAccessInput,
  readers: InstanceAuthAccessReaders,
): Promise<InstanceAuthAccessResult> {
  const centralSession = await readers.readCentralSession();
  let centralFailure: CurrentSessionFailure;

  if (centralSession.ok) {
    const current = await validateCurrentSession(
      centralSession.session,
      "central-session",
      input,
      readers,
    );

    if (current.ok) {
      return current;
    }

    centralFailure = current;
  } else {
    centralFailure = { ok: false, reason: centralSession.reason };
  }

  const ownerSessionFallbackAllowed =
    centralSession.ownerSessionFallbackAllowed || input.localOwnerSessionFallbackAllowed;
  let ownerFailure: CurrentSessionFailure | undefined;

  if (ownerSessionFallbackAllowed) {
    const ownerSession = await readers.readLocalOwnerSession();

    if (ownerSession.ok) {
      const current = await validateCurrentSession(
        ownerSession.session,
        "owner-session",
        input,
        readers,
      );

      if (current.ok) {
        return current;
      }

      if (current.reason === "account-completion-required") {
        return current;
      }

      ownerFailure = current;
    } else {
      ownerFailure = { ok: false, reason: ownerSession.reason };
    }
  }

  if (input.target !== undefined) {
    const hostSession = await readers.readHostSession(input.target);

    if (hostSession.ok) {
      const current = await validateCurrentSession(
        hostSession.session,
        "host-session",
        input,
        readers,
      );

      if (current.ok) {
        return current;
      }

      return current;
    }

    return { ok: false, reason: hostSession.reason };
  }

  if (centralFailure.reason === "account-completion-required") {
    return centralFailure;
  }

  if (
    ownerFailure?.reason === "missing-owner-authority" ||
    centralFailure.reason === "missing-owner-authority"
  ) {
    return { ok: false, reason: "missing-owner-authority" };
  }

  if (
    ownerFailure?.reason === "missing-management-authority" ||
    centralFailure.reason === "missing-management-authority"
  ) {
    return { ok: false, reason: "missing-management-authority" };
  }

  return { ok: false, reason: "missing-principal" };
}

export async function validateCentralInstanceAuthAccess(
  input: Omit<InstanceAuthAccessInput, "localOwnerSessionFallbackAllowed" | "target">,
  readers: InstanceAuthAccessReaders,
): Promise<
  | (Extract<InstanceAuthAccessResult, { ok: true }> & {
      ownerSessionFallbackAllowed: boolean;
      session: CentralAuthSession;
      via: "central-session";
    })
  | (Extract<InstanceAuthAccessResult, { ok: false }> & {
      ownerSessionFallbackAllowed: boolean;
    })
> {
  const session = await readers.readCentralSession();

  if (!session.ok) {
    return {
      ok: false,
      ownerSessionFallbackAllowed: session.ownerSessionFallbackAllowed,
      reason: session.reason,
    };
  }

  const current = await validateCurrentSession(
    session.session,
    "central-session",
    { ...input, localOwnerSessionFallbackAllowed: false },
    readers,
  );

  if (!current.ok) {
    return {
      ...current,
      ownerSessionFallbackAllowed: session.ownerSessionFallbackAllowed,
    };
  }

  return {
    ...current,
    ownerSessionFallbackAllowed: session.ownerSessionFallbackAllowed,
  } as CurrentSessionSuccess & {
    ownerSessionFallbackAllowed: boolean;
    session: CentralAuthSession;
    via: "central-session";
  };
}

export async function validateHostInstanceAuthAccess(
  input: Omit<InstanceAuthAccessInput, "localOwnerSessionFallbackAllowed"> & {
    target: InstanceAuthSessionTargetBinding;
  },
  readers: InstanceAuthAccessReaders,
): Promise<
  | (Extract<InstanceAuthAccessResult, { ok: true }> & {
      session: HostAuthSession;
      via: "host-session";
    })
  | Extract<InstanceAuthAccessResult, { ok: false }>
> {
  const session = await readers.readHostSession(input.target);

  if (!session.ok) {
    return { ok: false, reason: session.reason };
  }

  return validateCurrentSession(
    session.session,
    "host-session",
    { ...input, localOwnerSessionFallbackAllowed: false },
    readers,
  ) as Promise<
    | (Extract<InstanceAuthAccessResult, { ok: true }> & {
        session: HostAuthSession;
        via: "host-session";
      })
    | Extract<InstanceAuthAccessResult, { ok: false }>
  >;
}

export function authenticatedOperationActorForAccess(
  access: Pick<CurrentSessionSuccess, "principalId" | "session" | "target">,
): OperationInvocationActor | undefined {
  if (access.target === undefined) {
    return undefined;
  }

  return {
    kind: "authenticated",
    principalId: access.principalId,
    sessionTarget: {
      instanceId: access.session.instanceId,
      routeId: access.target.routeId,
      targetOrigin: access.target.targetOrigin,
      targetProfile: access.target.targetProfile,
      ...(access.target.appInstallId === undefined
        ? {}
        : { appInstallId: access.target.appInstallId }),
      ...(access.target.storageIdentity === undefined
        ? {}
        : { storageIdentity: access.target.storageIdentity }),
    },
  };
}

async function validateCurrentSession(
  session: InstanceAuthSession,
  via: InstanceAuthSessionKind,
  input: InstanceAuthAccessInput,
  readers: InstanceAuthAccessReaders,
): Promise<InstanceAuthAccessResult> {
  const currentAuthority = await readCurrentAuthority(session, input.requiredAuthority, readers);

  if (!currentAuthority) {
    return { ok: false, reason: missingAuthorityReason(input.requiredAuthority) };
  }

  if (
    via === "host-session" &&
    (await readers.readHostSessionVersion(session as HostAuthSession)) !==
      (session as HostAuthSession).sessionVersion
  ) {
    return { ok: false, reason: "revoked-session" };
  }

  if (input.requiredAuthority === "authenticated" && input.accountCompletionTarget !== undefined) {
    const accountCompletion = await readers.readAccountCompletion(
      session,
      input.accountCompletionTarget,
    );

    if (accountCompletion.status === "blocked") {
      return {
        accountCompletion,
        ok: false,
        reason: "account-completion-required",
      };
    }
  }

  return {
    ok: true,
    ownerAuthorized: input.requiredAuthority === "owner",
    principalId: session.principalId,
    session,
    ...(input.target === undefined ? {} : { target: input.target }),
    via,
  };
}

async function readCurrentAuthority(
  session: InstanceAuthSession,
  requirement: InstanceAuthAuthorityRequirement,
  readers: InstanceAuthAccessReaders,
): Promise<boolean> {
  switch (requirement) {
    case "authenticated":
      return (await readers.readActivePrincipal(session))?.id === session.principalId;
    case "management": {
      const authority = await readers.readManagementAuthority(session);

      return (
        authority?.id === session.principalId &&
        (authority.instanceAdmin === true || authority.instanceOwner === true)
      );
    }
    case "owner":
      return (await readers.readOwnerAuthority(session))?.id === session.principalId;
  }
}

function missingAuthorityReason(
  requirement: InstanceAuthAuthorityRequirement,
): InstanceAuthAccessFailureReason {
  switch (requirement) {
    case "authenticated":
      return "missing-principal";
    case "management":
      return "missing-management-authority";
    case "owner":
      return "missing-owner-authority";
  }
}

function sessionTargetBindingsEqual(
  left: InstanceAuthSessionTargetBinding,
  right: InstanceAuthSessionTargetBinding,
): boolean {
  return (
    left.targetOrigin === right.targetOrigin &&
    left.routeId === right.routeId &&
    left.targetProfile === right.targetProfile &&
    left.appInstallId === right.appInstallId &&
    left.storageIdentity === right.storageIdentity
  );
}
