import type {
  FormlessUiAuthActionContract,
  FormlessUiAuthContinuationContract,
  FormlessUiAuthFeedbackContract,
  FormlessUiAuthFieldContract,
  FormlessUiAuthMessageContract,
  FormlessUiAuthPasskeyContract,
  FormlessUiButtonContract,
  FormlessUiOwnerSetupAuthSurfaceContract,
  FormlessUiOwnerSignInAuthSurfaceContract,
} from "@dpeek/formless-presentation/contract";
import { formlessUiAuthSurfaceReference } from "@dpeek/formless-presentation/contract-host";
import type { CreateFieldConfig } from "../../client/views.ts";
import {
  markGeneratedCreateDraftSessionSubmitted,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "../generated/create-field-authoring.ts";
import { projectGeneratedCreateFormlessUiFields } from "../generated/formless-ui-projection.ts";
import { displaySafeText } from "./instance-management-display-safety.ts";
import type { OwnerLoginRouteState } from "./owner-login.tsx";
import type { OwnerSetupRouteState } from "./owner-setup.tsx";

export const OWNER_SETUP_AUTH_SURFACE_ID = "auth:owner-setup";
export const OWNER_SIGN_IN_AUTH_SURFACE_ID = "auth:owner-sign-in";

const ownerSetupFieldConfigs: CreateFieldConfig[] = [
  {
    editor: "text",
    field: { label: "Name", required: true, type: "text" },
    fieldName: "name",
  },
  {
    editor: "text",
    field: { format: "email", label: "Email", required: false, type: "text" },
    fieldName: "email",
  },
];

export const ownerSetupAuthSurfaceReference = formlessUiAuthSurfaceReference({
  surfaceId: OWNER_SETUP_AUTH_SURFACE_ID,
  surfaceKind: "owner-setup",
});
export const ownerSignInAuthSurfaceReference = formlessUiAuthSurfaceReference({
  surfaceId: OWNER_SIGN_IN_AUTH_SURFACE_ID,
  surfaceKind: "owner-sign-in",
});

export function projectOwnerSetupAuthSurface({
  ownerEmail,
  ownerName,
  state,
}: {
  ownerEmail: string;
  ownerName: string;
  state: OwnerSetupRouteState;
}): FormlessUiOwnerSetupAuthSurfaceContract {
  const pending = state.status === "submitting" || state.status === "continuing";
  const draft = ownerSetupDraft(ownerName, ownerEmail);
  const fields = ownerSetupFields(state, draft);
  const passkey = ownerSetupPasskey(state, draft);

  return {
    actions: ownerSetupActions(state),
    ...(ownerSetupContinuation(state) === undefined
      ? {}
      : { continuation: ownerSetupContinuation(state) }),
    facts: ownerSetupFacts(state),
    ...(state.status === "failed"
      ? { feedback: authFeedback("setup-failure", "Owner setup failed", state.message) }
      : {}),
    fields,
    frame: authFrame(ownerSetupHeading(state), ownerSetupDescription(state)),
    id: OWNER_SETUP_AUTH_SURFACE_ID,
    kind: "authSurface",
    ...(ownerSetupMessage(state) === undefined ? {} : { message: ownerSetupMessage(state) }),
    ...(passkey === undefined ? {} : { passkey }),
    pending,
    policies: [],
    state: ownerSetupContractState(state),
    surfaceKind: "owner-setup",
  };
}

export function projectOwnerSignInAuthSurface({
  state,
}: {
  state: OwnerLoginRouteState;
}): FormlessUiOwnerSignInAuthSurfaceContract {
  const pending =
    state.status === "submitting" ||
    state.status === "logging-out" ||
    state.status === "continuing";
  const passkey = ownerSignInPasskey(state);

  return {
    actions: ownerSignInActions(state),
    ...(state.status === "complete" ? { continuation: authContinuation("account") } : {}),
    facts: ownerSignInFacts(state),
    ...(state.status === "failed"
      ? { feedback: authFeedback("sign-in-failure", "Owner sign in failed", state.message) }
      : {}),
    fields: [],
    frame: authFrame(ownerSignInHeading(state), ownerSignInDescription(state)),
    id: OWNER_SIGN_IN_AUTH_SURFACE_ID,
    kind: "authSurface",
    ...(ownerSignInMessage(state) === undefined ? {} : { message: ownerSignInMessage(state) }),
    ...(passkey === undefined ? {} : { passkey }),
    pending,
    policies: [],
    state: ownerSignInContractState(state),
    surfaceKind: "owner-sign-in",
  };
}

function ownerSetupFields(
  state: OwnerSetupRouteState,
  draft: ReturnType<typeof ownerSetupDraft>,
): readonly FormlessUiAuthFieldContract[] {
  if (
    state.status !== "ready" &&
    state.status !== "submitting" &&
    !(state.status === "failed" && state.setupToken)
  ) {
    return [];
  }

  return draft.fields;
}

function ownerSetupDraft(ownerName: string, ownerEmail: string) {
  const draftState: GeneratedCreateDraftSessionState = {
    draft: {
      values: {
        email: { kind: "input", value: ownerEmail },
        name: { kind: "input", value: ownerName },
      },
    },
    submitAttempted: false,
  };
  const selected = selectGeneratedCreateDraftSession({
    enabled: true,
    fields: ownerSetupFieldConfigs,
    state: draftState,
  });
  const submitted = selectGeneratedCreateDraftSession({
    enabled: true,
    fields: ownerSetupFieldConfigs,
    state: markGeneratedCreateDraftSessionSubmitted(draftState),
  });
  const fields = projectGeneratedCreateFormlessUiFields({
    owner: { kind: "createSurface", surfaceId: OWNER_SETUP_AUTH_SURFACE_ID },
    session: { ...selected, fieldErrors: submitted.fieldErrors },
    state: draftState,
  }).map(
    (field): FormlessUiAuthFieldContract => ({
      autocomplete: field.fieldName === "email" ? "email" : "name",
      field,
      intent: {
        fieldId: field.fieldId,
        surfaceId: OWNER_SETUP_AUTH_SURFACE_ID,
        type: "authField",
      },
      kind: "authField",
      purpose: field.fieldName === "email" ? "email" : "display-name",
    }),
  );

  return {
    canSubmit: submitted.canSubmit,
    disabledReason: Object.values(submitted.fieldErrors)[0]?.message,
    fields,
  };
}

function ownerSetupPasskey(
  state: OwnerSetupRouteState,
  draft: ReturnType<typeof ownerSetupDraft>,
): FormlessUiAuthPasskeyContract | undefined {
  if (state.status === "passkey-unavailable") {
    return authUnavailablePasskey("create", state.message);
  }

  if (
    state.status !== "ready" &&
    state.status !== "submitting" &&
    !(state.status === "failed" && state.setupToken)
  ) {
    return undefined;
  }

  const pending = state.status === "submitting";
  return authAvailablePasskey(
    "create",
    pending
      ? "Creating passkey..."
      : state.status === "failed"
        ? "Try owner setup again"
        : "Create owner passkey",
    pending,
    !draft.canSubmit,
    draft.disabledReason,
  );
}

function ownerSignInPasskey(
  state: OwnerLoginRouteState,
): FormlessUiAuthPasskeyContract | undefined {
  if (state.status === "passkey-unavailable") {
    return authUnavailablePasskey("sign-in", state.message);
  }

  if (
    state.status !== "ready" &&
    state.status !== "submitting" &&
    !(state.status === "failed" && state.owner)
  ) {
    return undefined;
  }

  const pending = state.status === "submitting";
  return authAvailablePasskey(
    "sign-in",
    pending
      ? "Signing in..."
      : state.status === "failed"
        ? "Try passkey sign in again"
        : "Sign in with passkey",
    pending,
  );
}

function authAvailablePasskey(
  purpose: "create" | "sign-in",
  label: string,
  pending: boolean,
  disabled = false,
  disabledReason?: string,
): FormlessUiAuthPasskeyContract {
  const passkeyId = `${purpose === "create" ? OWNER_SETUP_AUTH_SURFACE_ID : OWNER_SIGN_IN_AUTH_SURFACE_ID}:passkey:${purpose}`;
  const control = authButton(`${passkeyId}:control`, label, "primary", "submit", {
    disabled,
    disabledReason,
    pending,
  });

  return {
    availability: "available",
    control,
    id: passkeyId,
    intent: {
      controlId: control.id,
      passkeyId,
      surfaceId: purpose === "create" ? OWNER_SETUP_AUTH_SURFACE_ID : OWNER_SIGN_IN_AUTH_SURFACE_ID,
      type: "authPasskey",
    },
    kind: "authPasskey",
    purpose,
  };
}

function authUnavailablePasskey(
  purpose: "create" | "sign-in",
  reason: string,
): FormlessUiAuthPasskeyContract {
  return {
    availability: "unavailable",
    id: `${purpose === "create" ? OWNER_SETUP_AUTH_SURFACE_ID : OWNER_SIGN_IN_AUTH_SURFACE_ID}:passkey:${purpose}`,
    kind: "authPasskey",
    purpose,
    unavailableReason: displaySafeText(reason),
  };
}

function ownerSetupActions(state: OwnerSetupRouteState): readonly FormlessUiAuthActionContract[] {
  return state.status === "failed" && !state.setupToken
    ? [authAction(OWNER_SETUP_AUTH_SURFACE_ID, "retry", "Try again")]
    : [];
}

function ownerSignInActions(state: OwnerLoginRouteState): readonly FormlessUiAuthActionContract[] {
  if (state.status === "complete") {
    return [authAction(OWNER_SIGN_IN_AUTH_SURFACE_ID, "logout", "Sign out", "secondary")];
  }
  return state.status === "failed" && !state.owner
    ? [authAction(OWNER_SIGN_IN_AUTH_SURFACE_ID, "retry", "Try again")]
    : [];
}

function authAction(
  surfaceId: string,
  purpose: "logout" | "retry",
  label: string,
  prominence: FormlessUiButtonContract["prominence"] = "primary",
): FormlessUiAuthActionContract {
  const id = `${surfaceId}:action:${purpose}`;
  const control = authButton(`${id}:control`, label, prominence);
  return {
    control,
    id,
    intent: { actionId: id, controlId: control.id, surfaceId, type: "authAction" },
    kind: "authAction",
    purpose,
  };
}

function ownerSetupContinuation(
  state: OwnerSetupRouteState,
): FormlessUiAuthContinuationContract | undefined {
  if (state.status !== "already-complete" && state.status !== "complete") {
    return undefined;
  }
  return authContinuation("administration", safeHttpOrigin(state.adminOrigin));
}

function authContinuation(
  id: "account" | "administration",
  origin?: string,
): FormlessUiAuthContinuationContract {
  const surfaceId = id === "account" ? OWNER_SIGN_IN_AUTH_SURFACE_ID : OWNER_SETUP_AUTH_SURFACE_ID;
  const destinationId = `${surfaceId}:destination:${id}`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary");
  return {
    control,
    destination: {
      detail:
        id === "account" ? "Open your approved destination." : "Open instance administration.",
      id: destinationId,
      kind: "authContinuationDestination",
      label: "Continue",
      ...(origin === undefined ? {} : { origin }),
    },
    intent: {
      controlId: control.id,
      destinationId,
      surfaceId,
      type: "authContinuation",
    },
    kind: "authContinuation",
  };
}

function ownerSetupFacts(state: OwnerSetupRouteState) {
  if (
    state.status !== "already-complete" &&
    state.status !== "complete" &&
    state.status !== "continuing"
  ) {
    return [];
  }
  return [authFact("owner", "Owner", state.owner?.name ?? "Configured owner")];
}

function ownerSignInFacts(state: OwnerLoginRouteState) {
  return "owner" in state && state.owner ? [authFact("owner", "Owner", state.owner.name)] : [];
}

function authFact(id: string, label: string, value: string) {
  return {
    id: `auth:fact:${id}`,
    kind: "authFact" as const,
    label,
    value: displaySafeText(value),
  };
}

function ownerSetupContractState(
  state: OwnerSetupRouteState,
): FormlessUiOwnerSetupAuthSurfaceContract["state"] {
  return state.status === "invalid-link" ? "invalid" : state.status;
}

function ownerSignInContractState(
  state: OwnerLoginRouteState,
): FormlessUiOwnerSignInAuthSurfaceContract["state"] {
  if (state.status === "logging-out") {
    return "logout-pending";
  }
  if (state.status === "setup-incomplete") {
    return "incomplete";
  }
  return state.status;
}

function ownerSetupHeading(state: OwnerSetupRouteState): string {
  switch (state.status) {
    case "already-complete":
      return "Owner setup is complete";
    case "complete":
    case "continuing":
      return "Owner setup complete";
    case "invalid-link":
      return "Setup link unavailable";
    case "loading":
      return "Checking setup link";
    case "passkey-unavailable":
      return "Passkeys are unavailable";
    case "failed":
    case "ready":
    case "submitting":
      return "Claim this Formless instance";
  }
}

function ownerSetupDescription(state: OwnerSetupRouteState): string | undefined {
  switch (state.status) {
    case "already-complete":
      return state.owner
        ? `${displaySafeText(state.owner.name)} owns this Formless instance.`
        : "This instance has an owner.";
    case "complete":
      return `Signed in as ${displaySafeText(state.owner.name)}.`;
    case "continuing":
      return "Opening your approved destination.";
    case "ready":
    case "submitting":
    case "failed":
      return "Create the first owner.";
    default:
      return undefined;
  }
}

function ownerSignInHeading(state: OwnerLoginRouteState): string {
  switch (state.status) {
    case "complete":
      return "Owner signed in";
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

function ownerSetupMessage(state: OwnerSetupRouteState): FormlessUiAuthMessageContract | undefined {
  if (state.status === "loading") return authMessage("loading", "Loading setup status.");
  if (state.status === "invalid-link") return authMessage("invalid", state.message, "danger");
  if (state.status === "passkey-unavailable")
    return authMessage("passkey", state.message, "warning");
  if (state.status === "continuing") return authMessage("continuing", "Continuing...", "success");
  return undefined;
}

function ownerSignInMessage(
  state: OwnerLoginRouteState,
): FormlessUiAuthMessageContract | undefined {
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
      ...(description === undefined ? {} : { description }),
      kind: "authHeading" as const,
      title,
    },
    kind: "authFrame" as const,
  };
}

function authMessage(
  id: string,
  title: string,
  severity: FormlessUiAuthMessageContract["severity"] = "info",
): FormlessUiAuthMessageContract {
  return { id: `auth:message:${id}`, kind: "authMessage", severity, title: displaySafeText(title) };
}

function authFeedback(id: string, title: string, detail: string): FormlessUiAuthFeedbackContract {
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
  prominence: FormlessUiButtonContract["prominence"],
  type: FormlessUiButtonContract["type"] = "button",
  options: { disabled?: boolean; disabledReason?: string; pending?: boolean } = {},
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    ...(options.disabled ? { disabled: true, disabledReason: options.disabledReason } : {}),
    id,
    kind: "button",
    ...(options.pending ? { pending: { isPending: true, label } } : {}),
    prominence,
    type,
  };
}

export function ownerSetupAdminHref(adminOrigin: string | undefined): string {
  const origin = safeHttpOrigin(adminOrigin);
  return origin ? `${origin}/` : "/";
}

function safeHttpOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
