import type {
  AuthActionContract,
  AuthContinuationContract,
  AuthFeedbackContract,
  AuthMessageContract,
  AuthPasskeyContract,
  ButtonContract,
  OwnerSignInAuthSurfaceContract,
} from "@dpeek/formless-presentation/contract";
import { authSurfaceReference } from "@dpeek/formless-presentation/host";
import { displaySafeText } from "./instance-management-display-safety.ts";
import type { OwnerLoginRouteState } from "./owner-login.tsx";

export const OWNER_SIGN_IN_AUTH_SURFACE_ID = "auth:owner-sign-in";

export const ownerSignInAuthSurfaceReference = authSurfaceReference({
  surfaceId: OWNER_SIGN_IN_AUTH_SURFACE_ID,
  surfaceKind: "owner-sign-in",
});

export function projectOwnerSignInAuthSurface({
  state,
}: {
  state: OwnerLoginRouteState;
}): OwnerSignInAuthSurfaceContract {
  const pending =
    state.status === "submitting" ||
    state.status === "logging-out" ||
    state.status === "continuing";
  const passkey = ownerSignInPasskey(state);

  return {
    actions: ownerSignInActions(state),
    ...(state.status === "complete" ? { continuation: authContinuation() } : {}),
    facts: ownerSignInFacts(state),
    ...(state.status === "failed"
      ? { feedback: authFeedback("sign-in-failure", "Owner sign in failed", state.message) }
      : {}),
    fields: [],
    frame: authFrame(ownerSignInHeading(state), ownerSignInDescription(state)),
    id: OWNER_SIGN_IN_AUTH_SURFACE_ID,
    kind: "authSurface",
    ...(ownerSignInMessage(state) ? { message: ownerSignInMessage(state) } : {}),
    ...(passkey ? { passkey } : {}),
    pending,
    policies: [],
    state: ownerSignInContractState(state),
    surfaceKind: "owner-sign-in",
  };
}

function ownerSignInPasskey(state: OwnerLoginRouteState): AuthPasskeyContract | undefined {
  if (state.status === "passkey-unavailable") {
    return {
      availability: "unavailable",
      id: `${OWNER_SIGN_IN_AUTH_SURFACE_ID}:passkey:sign-in`,
      kind: "authPasskey",
      purpose: "sign-in",
      unavailableReason: displaySafeText(state.message),
    };
  }
  if (
    state.status !== "ready" &&
    state.status !== "submitting" &&
    !(state.status === "failed" && state.owner)
  ) {
    return undefined;
  }

  const pending = state.status === "submitting";
  const passkeyId = `${OWNER_SIGN_IN_AUTH_SURFACE_ID}:passkey:sign-in`;
  const control = authButton(
    `${passkeyId}:control`,
    pending
      ? "Signing in..."
      : state.status === "failed"
        ? "Try passkey sign in again"
        : "Sign in with passkey",
    "primary",
    "submit",
    { pending },
  );

  return {
    availability: "available",
    control,
    id: passkeyId,
    intent: {
      controlId: control.id,
      passkeyId,
      surfaceId: OWNER_SIGN_IN_AUTH_SURFACE_ID,
      type: "authPasskey",
    },
    kind: "authPasskey",
    purpose: "sign-in",
  };
}

function ownerSignInActions(state: OwnerLoginRouteState): readonly AuthActionContract[] {
  if (state.status === "complete") {
    return [authAction("logout", "Sign out", "secondary")];
  }
  return state.status === "failed" && !state.owner ? [authAction("retry", "Try again")] : [];
}

function authAction(
  purpose: "logout" | "retry",
  label: string,
  prominence: ButtonContract["prominence"] = "primary",
): AuthActionContract {
  const id = `${OWNER_SIGN_IN_AUTH_SURFACE_ID}:action:${purpose}`;
  const control = authButton(`${id}:control`, label, prominence);
  return {
    control,
    id,
    intent: {
      actionId: id,
      controlId: control.id,
      surfaceId: OWNER_SIGN_IN_AUTH_SURFACE_ID,
      type: "authAction",
    },
    kind: "authAction",
    purpose,
  };
}

function authContinuation(): AuthContinuationContract {
  const destinationId = `${OWNER_SIGN_IN_AUTH_SURFACE_ID}:destination:account`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary");
  return {
    control,
    destination: {
      detail: "Open your approved destination.",
      id: destinationId,
      kind: "authContinuationDestination",
      label: "Continue",
    },
    intent: {
      controlId: control.id,
      destinationId,
      surfaceId: OWNER_SIGN_IN_AUTH_SURFACE_ID,
      type: "authContinuation",
    },
    kind: "authContinuation",
  };
}

function ownerSignInFacts(state: OwnerLoginRouteState) {
  return "owner" in state && state.owner
    ? [
        {
          id: "auth:fact:owner",
          kind: "authFact" as const,
          label: "Owner",
          value: displaySafeText(state.owner.name),
        },
      ]
    : [];
}

function ownerSignInContractState(
  state: OwnerLoginRouteState,
): OwnerSignInAuthSurfaceContract["state"] {
  if (state.status === "logging-out") return "logout-pending";
  if (state.status === "setup-incomplete") return "incomplete";
  return state.status;
}

function ownerSignInHeading(state: OwnerLoginRouteState): string {
  switch (state.status) {
    case "complete":
    case "continuing":
      return "Owner signed in";
    case "logging-out":
      return "Signing out";
    case "loading":
      return "Checking owner session";
    case "passkey-unavailable":
      return "Passkeys are unavailable";
    case "setup-incomplete":
      return "Owner setup is incomplete";
    case "failed":
    case "ready":
    case "submitting":
      return "Owner sign in";
  }
}

function ownerSignInDescription(state: OwnerLoginRouteState): string | undefined {
  switch (state.status) {
    case "complete":
      return `Signed in as ${displaySafeText(state.owner.name)}.`;
    case "continuing":
      return "Opening your approved destination.";
    case "logging-out":
      return `Signed in as ${displaySafeText(state.owner.name)}.`;
    case "ready":
    case "submitting":
      return `Sign in as ${displaySafeText(state.owner.name)}.`;
    case "failed":
      return state.owner
        ? `Sign in as ${displaySafeText(state.owner.name)}.`
        : "Sign in to this Formless instance.";
    case "setup-incomplete":
      return "Create the first owner before signing in.";
    default:
      return undefined;
  }
}

function ownerSignInMessage(state: OwnerLoginRouteState): AuthMessageContract | undefined {
  if (state.status === "loading") return authMessage("loading", "Loading sign-in state.");
  if (state.status === "passkey-unavailable")
    return authMessage("passkey", state.message, "warning");
  if (state.status === "setup-incomplete")
    return authMessage("incomplete", "Owner setup must be completed first.", "warning");
  if (state.status === "logging-out") return authMessage("logout", "Signing out...");
  if (state.status === "continuing") return authMessage("continuing", "Continuing...", "success");
  return undefined;
}

function authFrame(title: string, description?: string) {
  return {
    accessibilityLabel: title,
    brand: { kind: "authBrand" as const, label: "Formless" },
    heading: {
      ...(description ? { description } : {}),
      kind: "authHeading" as const,
      title,
    },
    kind: "authFrame" as const,
  };
}

function authMessage(
  id: string,
  title: string,
  severity: AuthMessageContract["severity"] = "info",
): AuthMessageContract {
  return {
    id: `auth:message:${id}`,
    kind: "authMessage",
    severity,
    title: displaySafeText(title),
  };
}

function authFeedback(id: string, title: string, detail: string): AuthFeedbackContract {
  return {
    detail: displaySafeText(detail),
    id: `auth:feedback:${id}`,
    kind: "authFeedback",
    severity: "danger",
    title,
  };
}

function authButton(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"],
  type: ButtonContract["type"] = "button",
  options: { pending?: boolean } = {},
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    ...(options.pending ? { pending: { isPending: true, label } } : {}),
    prominence,
    type,
  };
}
