import type {
  AuthActionContract,
  AuthContinuationContract,
  AuthFeedbackContract,
  AuthMessageContract,
  AuthPasskeyContract,
  ButtonContract,
  AccountSignInAuthSurfaceContract,
} from "@dpeek/formless-presentation/contract";
import { authSurfaceReference } from "@dpeek/formless-presentation/host";
import { displaySafeText } from "./instance-management-display-safety.ts";
import type { AccountSignInRouteState } from "./account-sign-in.tsx";

export const ACCOUNT_SIGN_IN_AUTH_SURFACE_ID = "auth:account-sign-in";

export const accountSignInAuthSurfaceReference = authSurfaceReference({
  surfaceId: ACCOUNT_SIGN_IN_AUTH_SURFACE_ID,
  surfaceKind: "account-sign-in",
});

export function projectAccountSignInAuthSurface({
  state,
}: {
  state: AccountSignInRouteState;
}): AccountSignInAuthSurfaceContract {
  const pending =
    state.status === "submitting" ||
    state.status === "logging-out" ||
    state.status === "continuing";
  const passkey = accountSignInPasskey(state);

  return {
    actions: accountSignInActions(state),
    ...(state.status === "complete" ? { continuation: authContinuation() } : {}),
    facts: accountSignInFacts(state),
    ...(state.status === "failed"
      ? {
          feedback: authFeedback("sign-in-failure", "Account sign in failed", state.message),
        }
      : {}),
    fields: [],
    frame: authFrame(accountSignInHeading(state), accountSignInDescription(state)),
    id: ACCOUNT_SIGN_IN_AUTH_SURFACE_ID,
    kind: "authSurface",
    ...(accountSignInMessage(state) ? { message: accountSignInMessage(state) } : {}),
    ...(passkey ? { passkey } : {}),
    pending,
    policies: [],
    state: accountSignInContractState(state),
    surfaceKind: "account-sign-in",
  };
}

function accountSignInPasskey(state: AccountSignInRouteState): AuthPasskeyContract | undefined {
  if (state.status === "passkey-unavailable") {
    return {
      availability: "unavailable",
      id: `${ACCOUNT_SIGN_IN_AUTH_SURFACE_ID}:passkey:sign-in`,
      kind: "authPasskey",
      purpose: "sign-in",
      unavailableReason: displaySafeText(state.message),
    };
  }
  if (
    state.status !== "ready" &&
    state.status !== "submitting" &&
    !(state.status === "failed" && state.retry === "sign-in")
  ) {
    return undefined;
  }

  const pending = state.status === "submitting";
  const passkeyId = `${ACCOUNT_SIGN_IN_AUTH_SURFACE_ID}:passkey:sign-in`;
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
      surfaceId: ACCOUNT_SIGN_IN_AUTH_SURFACE_ID,
      type: "authPasskey",
    },
    kind: "authPasskey",
    purpose: "sign-in",
  };
}

function accountSignInActions(state: AccountSignInRouteState): readonly AuthActionContract[] {
  if (state.status === "complete") {
    return [authAction("logout", "Sign out", "secondary")];
  }
  return state.status === "failed" && state.retry === "load"
    ? [authAction("retry", "Try again")]
    : [];
}

function authAction(
  purpose: "logout" | "retry",
  label: string,
  prominence: ButtonContract["prominence"] = "primary",
): AuthActionContract {
  const id = `${ACCOUNT_SIGN_IN_AUTH_SURFACE_ID}:action:${purpose}`;
  const control = authButton(`${id}:control`, label, prominence);
  return {
    control,
    id,
    intent: {
      actionId: id,
      controlId: control.id,
      surfaceId: ACCOUNT_SIGN_IN_AUTH_SURFACE_ID,
      type: "authAction",
    },
    kind: "authAction",
    purpose,
  };
}

function authContinuation(): AuthContinuationContract {
  const destinationId = `${ACCOUNT_SIGN_IN_AUTH_SURFACE_ID}:destination:account`;
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
      surfaceId: ACCOUNT_SIGN_IN_AUTH_SURFACE_ID,
      type: "authContinuation",
    },
    kind: "authContinuation",
  };
}

function accountSignInFacts(state: AccountSignInRouteState) {
  return "principal" in state && state.principal
    ? [
        {
          id: "auth:fact:principal",
          kind: "authFact" as const,
          label: "Account",
          value: displaySafeText(state.principal.displayName),
        },
      ]
    : [];
}

function accountSignInContractState(
  state: AccountSignInRouteState,
): AccountSignInAuthSurfaceContract["state"] {
  if (state.status === "logging-out") return "logout-pending";
  if (state.status === "setup-incomplete") return "incomplete";
  return state.status;
}

function accountSignInHeading(state: AccountSignInRouteState): string {
  switch (state.status) {
    case "complete":
    case "continuing":
      return "Signed in";
    case "logging-out":
      return "Signing out";
    case "loading":
      return "Checking account session";
    case "passkey-unavailable":
      return "Passkeys are unavailable";
    case "setup-incomplete":
      return "Owner setup is incomplete";
    case "failed":
    case "ready":
    case "submitting":
      return "Account sign in";
  }
}

function accountSignInDescription(state: AccountSignInRouteState): string | undefined {
  switch (state.status) {
    case "complete":
      return `Signed in as ${displaySafeText(state.principal.displayName)}.`;
    case "continuing":
      return "Opening your approved destination.";
    case "logging-out":
      return `Signed in as ${displaySafeText(state.principal.displayName)}.`;
    case "ready":
    case "submitting":
      return "Use a passkey for your Formless account.";
    case "failed":
      return state.principal
        ? `Signed in as ${displaySafeText(state.principal.displayName)}.`
        : "Sign in to this Formless instance.";
    case "setup-incomplete":
      return "Create the first owner before signing in.";
    default:
      return undefined;
  }
}

function accountSignInMessage(state: AccountSignInRouteState): AuthMessageContract | undefined {
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
