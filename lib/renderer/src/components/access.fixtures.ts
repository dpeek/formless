import type {
  FormlessUiAccessActionContract,
  FormlessUiAccessConfirmationContract,
  FormlessUiAccessControlledFieldContract,
  FormlessUiAccessDisplayFactContract,
  FormlessUiAccessFeedbackContract,
  FormlessUiAccessGrantOptionGroupContract,
  FormlessUiAccessGrantSelectionContract,
  FormlessUiAccessInvitationAuthoringContract,
  FormlessUiAccessInvitationContract,
  FormlessUiAccessManifestContract,
  FormlessUiAccessPersonContract,
  FormlessUiAccessReadyContract,
  FormlessUiButtonContract,
} from "@dpeek/formless-presentation/contract";
import {
  formlessUiAccessInvitationAuthoringReference,
  formlessUiAccessManifestReference,
} from "@dpeek/formless-presentation/contract-host";

export type FormlessAccessFixtureId =
  | "empty"
  | "failed"
  | "loading"
  | "populated-owner"
  | "unauthorized";

export type FormlessAccessFixtureState = {
  authoring: FormlessUiAccessInvitationAuthoringContract | null;
  manifest: FormlessUiAccessManifestContract;
};

export type FormlessAccessFixture = {
  id: FormlessAccessFixtureId;
  label: string;
  state: FormlessAccessFixtureState;
};

export const accessFixtureReference = formlessUiAccessManifestReference("access:fixture");
export const accessFixtureAuthoringReference = formlessUiAccessInvitationAuthoringReference(
  accessFixtureReference.accessId,
  "access:fixture:authoring",
);

type AccessFixtureAuthority = "instance-admin" | "owner";
type AccessFixtureDraft = "empty" | "invalid" | "valid";

export function createFormlessAccessFixtures(): FormlessAccessFixture[] {
  return [
    fixture("loading", "Loading", { authoring: null, manifest: stateManifest("loading") }),
    fixture("unauthorized", "Unauthorized", {
      authoring: null,
      manifest: stateManifest("unauthorized"),
    }),
    fixture("failed", "Failed", { authoring: null, manifest: stateManifest("failed") }),
    readyFixture("empty", "Empty", { empty: true }),
    readyFixture("populated-owner", "Owner grants", { authority: "owner" }),
  ];
}

function fixture(
  id: FormlessAccessFixtureId,
  label: string,
  state: FormlessAccessFixtureState,
): FormlessAccessFixture {
  return { id, label, state };
}

function readyFixture(
  id: FormlessAccessFixtureId,
  label: string,
  options: {
    authority?: AccessFixtureAuthority;
    authoring?: {
      draft: AccessFixtureDraft;
      feedback?: FormlessUiAccessFeedbackContract;
      open: boolean;
      pending?: "creation";
    };
    confirmation?: FormlessUiAccessConfirmationContract;
    empty?: boolean;
    feedback?: FormlessUiAccessFeedbackContract;
    invitationState?: "pending" | "revoked";
    revocationPending?: boolean;
  },
): FormlessAccessFixture {
  const authority = options.authority ?? "owner";
  const authoring = invitationAuthoring(authority, options.authoring);

  return fixture(id, label, {
    authoring,
    manifest: readyManifest({
      confirmation: options.confirmation,
      empty: options.empty,
      feedback: options.feedback,
      invitationState: options.invitationState,
      revocationPending: options.revocationPending,
    }),
  });
}

function manifestBase() {
  return {
    accessibilityLabel: "Instance access",
    id: accessFixtureReference.accessId,
    kind: "accessManifest" as const,
    title: "Access",
  };
}

function stateManifest(
  state: "failed" | "loading" | "unauthorized",
): FormlessUiAccessManifestContract {
  if (state === "loading") {
    return { ...manifestBase(), message: "Loading access summary", state };
  }

  return {
    ...manifestBase(),
    feedback:
      state === "failed"
        ? feedback(
            "load-failed",
            "Access could not be loaded",
            "The access summary is temporarily unavailable.",
            "danger",
          )
        : feedback(
            "unauthorized",
            "Access unavailable",
            "Owner or administrator access is required.",
            "warning",
          ),
    state,
  };
}

function readyManifest({
  confirmation,
  empty = false,
  feedback: manifestFeedback,
  invitationState = "pending",
  revocationPending = false,
}: {
  confirmation?: FormlessUiAccessConfirmationContract;
  empty?: boolean;
  feedback?: FormlessUiAccessFeedbackContract;
  invitationState?: "pending" | "revoked";
  revocationPending?: boolean;
}): FormlessUiAccessReadyContract {
  return {
    ...manifestBase(),
    authoring: accessFixtureAuthoringReference,
    ...(confirmation ? { confirmation } : {}),
    ...(empty
      ? {
          invitationsEmptyState: {
            description: "Invite a collaborator to begin sharing access.",
            id: "access:fixture:invitations:empty",
            kind: "accessEmptyState" as const,
            title: "No invitations",
          },
          peopleEmptyState: {
            description: "Invite a collaborator to begin sharing access.",
            id: "access:fixture:people:empty",
            kind: "accessEmptyState" as const,
            title: "No people",
          },
        }
      : {}),
    ...(manifestFeedback ? { feedback: manifestFeedback } : {}),
    invitations: empty ? [] : accessInvitations(invitationState, revocationPending),
    invite: accessAction("authoring-open", "Invite collaborator", {
      accessId: accessFixtureReference.accessId,
      actionId: "access:fixture:authoring-open",
      authoringId: accessFixtureAuthoringReference.authoringId,
      controlId: "access:fixture:authoring-open:control",
      open: true,
      type: "accessInvitationAuthoringOpenChange",
    }),
    people: empty ? [] : accessPeople(),
    state: "ready",
  };
}

function accessPeople(): readonly FormlessUiAccessPersonContract[] {
  return [
    {
      displayName: "Ada Owner",
      id: "person:ada",
      kind: "accessPerson",
      primaryEmail: "ada@example.com",
      roles: [
        accessRole("ada-owner", "Owner", "Instance"),
        accessRole("ada-site-editor", "Editor", "Site"),
      ],
      status: statusFact("person:ada:status", "Active", "success"),
    },
    {
      displayName: "Bo Admin",
      id: "person:bo",
      kind: "accessPerson",
      primaryEmail: "bo@example.com",
      roles: [
        accessRole("bo-admin", "Administrator", "Instance"),
        accessRole("bo-organization-admin", "Administrator", "Formless"),
      ],
      status: statusFact("person:bo:status", "Active", "success"),
    },
  ];
}

function accessRole(id: string, label: string, scope: string) {
  return {
    id: `role:${id}`,
    kind: "accessRole" as const,
    label,
    scope: fact(`role:${id}:scope`, "Scope", scope),
  };
}

function accessInvitations(
  invitationState: "pending" | "revoked",
  revocationPending: boolean,
): readonly FormlessUiAccessInvitationContract[] {
  const pending = pendingInvitation(invitationState, revocationPending);

  return [
    pending,
    {
      expiresAt: fact(
        "invitation:accepted:expires-at",
        "Expires",
        "2026-08-01T09:00:00.000Z",
        "timestamp",
      ),
      id: "invitation:accepted",
      inviter: fact("invitation:accepted:inviter", "Invited by", "Ada Owner"),
      kind: "accessInvitation",
      revocation: {
        availability: "unavailable",
      },
      scope: fact("invitation:accepted:scope", "Scope", "Formless"),
      status: statusFact("invitation:accepted:status", "Accepted", "success"),
      target: fact("invitation:accepted:target", "Target", "Organization"),
      targetEmail: "accepted@example.com",
    },
  ];
}

function pendingInvitation(
  state: "pending" | "revoked" = "pending",
  pending = false,
): FormlessUiAccessInvitationContract {
  const revocationAction = accessAction(
    "revocation-open",
    pending ? "Revoking..." : "Revoke",
    {
      accessId: accessFixtureReference.accessId,
      actionId: "access:fixture:revocation-open",
      confirmationId: "access:fixture:revocation-confirmation",
      controlId: "access:fixture:revocation-open:control",
      invitationId: "invitation:pending",
      open: true,
      type: "accessInvitationRevocationConfirmationOpenChange",
    },
    pending ? "Invitation revocation is in progress." : undefined,
  );

  return {
    expiresAt: fact(
      "invitation:pending:expires-at",
      "Expires",
      "2026-07-24T12:30:00.000Z",
      "timestamp",
    ),
    id: "invitation:pending",
    inviter: fact("invitation:pending:inviter", "Invited by", "Ada Owner"),
    kind: "accessInvitation",
    revocation:
      state === "pending"
        ? { action: revocationAction, availability: "available" }
        : {
            availability: "unavailable",
          },
    scope: fact("invitation:pending:scope", "Scope", "Site"),
    status:
      state === "pending"
        ? statusFact("invitation:pending:status", "Pending", "warning")
        : statusFact("invitation:pending:status", "Revoked", "neutral"),
    target: fact("invitation:pending:target", "Target", "App install"),
    targetEmail: "grace@example.com",
  };
}

function invitationAuthoring(
  authority: AccessFixtureAuthority,
  options:
    | {
        draft: AccessFixtureDraft;
        feedback?: FormlessUiAccessFeedbackContract;
        open: boolean;
        pending?: "creation";
      }
    | undefined,
): FormlessUiAccessInvitationAuthoringContract {
  const draft = options?.draft ?? "empty";
  const pendingReason =
    options?.pending === "creation" ? "Invitation creation is in progress." : undefined;
  const fields = authoringFields(draft);
  const grantSelections = authoringGrantSelections(authority, draft);
  const errors = [
    ...Object.values(fields).flatMap((field) => field.errors),
    ...grantSelections.flatMap((selection) => selection.errors),
  ];
  const submitDisabledReason = pendingReason ?? errors[0];

  return {
    accessId: accessFixtureReference.accessId,
    cancel: accessAction("authoring-cancel", "Cancel", {
      accessId: accessFixtureReference.accessId,
      actionId: "access:fixture:authoring-cancel",
      authoringId: accessFixtureAuthoringReference.authoringId,
      controlId: "access:fixture:authoring-cancel:control",
      open: false,
      type: "accessInvitationAuthoringOpenChange",
    }),
    description: "Invite a collaborator and choose their access.",
    errors,
    ...(options?.feedback ? { feedback: options.feedback } : {}),
    fields,
    grantSelections,
    id: accessFixtureAuthoringReference.authoringId,
    kind: "accessInvitationAuthoring",
    open: options?.open ?? false,
    ...(options?.pending ? { pending: { isPending: true, label: "Sending invitation" } } : {}),
    submit: pendingAccessAction(
      accessAction(
        "invitation-submit",
        options?.pending ? "Sending invitation" : "Send invitation",
        {
          accessId: accessFixtureReference.accessId,
          actionId: "access:fixture:authoring-submit",
          authoringId: accessFixtureAuthoringReference.authoringId,
          controlId: "access:fixture:authoring-submit:control",
          type: "accessInvitationSubmit",
        },
        submitDisabledReason,
        "submit",
      ),
      options?.pending === "creation",
    ),
    title: "Invite collaborator",
  };
}

function authoringFields(
  draft: AccessFixtureDraft,
): FormlessUiAccessInvitationAuthoringContract["fields"] {
  const valid = draft === "valid";
  const invalid = draft === "invalid";
  const targetSurface: string = valid ? "app-install" : "instance";
  const targetAppInstall = "site";
  const targetOrganization = "formless";

  return {
    displayName: field("display-name", "Name", "text", valid ? "Grace Hopper" : "", {
      errors: valid ? [] : ["Name is required."],
    }),
    targetAppInstall: field("target-app-install", "Scope", "select", targetAppInstall, {
      disabledReason:
        targetSurface === "app-install" ? undefined : "Choose App install as the target surface.",
      errors: invalid ? ["Choose an available app install scope."] : [],
      options: [fieldOption("app-install:site", "Site", "site", targetAppInstall === "site")],
      required: false,
    }),
    targetEmail: field(
      "target-email",
      "Email",
      "email",
      valid ? "grace@example.com" : invalid ? "not-an-email" : "",
      {
        errors: valid ? [] : [invalid ? "Email must be valid." : "Email is required."],
      },
    ),
    targetOrganization: field("target-organization", "Scope", "select", targetOrganization, {
      disabledReason:
        targetSurface === "organization" ? undefined : "Choose Organization as the target surface.",
      errors: [],
      options: [
        fieldOption(
          "organization:formless",
          "Formless",
          "formless",
          targetOrganization === "formless",
        ),
      ],
      required: false,
    }),
    targetSurface: field("target-surface", "Surface", "select", targetSurface, {
      errors: [],
      options: [
        fieldOption("surface:instance", "Instance", "instance", targetSurface === "instance"),
        fieldOption(
          "surface:app-install",
          "App install",
          "app-install",
          targetSurface === "app-install",
        ),
        fieldOption(
          "surface:organization",
          "Organization",
          "organization",
          targetSurface === "organization",
        ),
      ],
      required: false,
    }),
  };
}

function field(
  purpose: FormlessUiAccessControlledFieldContract["purpose"],
  label: string,
  inputKind: FormlessUiAccessControlledFieldContract["inputKind"],
  value: string,
  options: {
    disabledReason?: string;
    errors?: readonly string[];
    options?: FormlessUiAccessControlledFieldContract["options"];
    required?: boolean;
  } = {},
): FormlessUiAccessControlledFieldContract {
  const id = `access:fixture:field:${purpose}`;

  return {
    changeIntent: {
      accessId: accessFixtureReference.accessId,
      authoringId: accessFixtureAuthoringReference.authoringId,
      fieldId: id,
      type: "accessInvitationFieldChange",
    },
    ...(options.disabledReason ? { disabledReason: options.disabledReason } : {}),
    errors: options.errors ?? [],
    id,
    inputKind,
    kind: "accessControlledField",
    label,
    ...(options.options ? { options: options.options } : {}),
    purpose,
    required: options.required ?? true,
    value,
  };
}

function fieldOption(id: string, label: string, value: string, selected: boolean) {
  return { id: `access:fixture:${id}`, label, selected, value };
}

function authoringGrantSelections(
  authority: AccessFixtureAuthority,
  draft: AccessFixtureDraft,
): FormlessUiAccessInvitationAuthoringContract["grantSelections"] {
  const selected = draft === "valid";
  const validation = draft === "invalid";
  const instanceRoleOptions: readonly (readonly [id: string, label: string])[] = [
    ...(authority === "owner" ? [["role:owner", "Owner"] as const] : []),
    ["role:administrator", "Administrator"],
  ];
  const roleGroups = [
    grantGroup(
      "role-group:instance",
      "Instance",
      instanceRoleOptions,
      "roles",
      selected ? ["role:administrator"] : [],
    ),
    grantGroup(
      "role-group:app-install",
      "App install",
      [["role:site-editor", "Site editor"]],
      "roles",
      selected || validation ? ["role:site-editor"] : [],
      validation ? "Choose an available app install scope for app roles." : undefined,
    ),
    grantGroup(
      "role-group:organization",
      "Organization",
      [["role:organization-admin", "Organization administrator"]],
      "roles",
      [],
    ),
  ];
  const membershipGroups = [
    grantGroup(
      "membership-group:organizations",
      "Organizations",
      [["membership:formless", "Formless"]],
      "memberships",
      selected ? ["membership:formless"] : [],
    ),
    grantGroup(
      "membership-group:groups",
      "Groups",
      [["membership:operations", "Operations"]],
      "memberships",
      selected ? ["membership:operations"] : [],
    ),
  ];
  const roleErrors = validation ? ["Choose an available app install scope for app roles."] : [];

  return [
    grantSelection("roles", roleGroups, roleErrors),
    grantSelection("memberships", membershipGroups, []),
  ];
}

function pendingAccessAction<Intent extends FormlessUiAccessActionContract["intent"]>(
  action: FormlessUiAccessActionContract<Intent>,
  pending: boolean,
): FormlessUiAccessActionContract<Intent> {
  return pending
    ? {
        ...action,
        control: {
          ...action.control,
          pending: { isPending: true, label: action.control.accessibilityLabel },
        },
      }
    : action;
}

function grantSelection<Purpose extends "memberships" | "roles">(
  purpose: Purpose,
  groups: readonly FormlessUiAccessGrantOptionGroupContract[],
  errors: readonly string[],
  disabledReason?: string,
): FormlessUiAccessGrantSelectionContract & { purpose: Purpose } {
  return {
    ...(disabledReason ? { disabledReason } : {}),
    errors,
    groups,
    id: `access:fixture:${purpose}`,
    kind: "accessGrantSelection",
    label: purpose === "roles" ? "Roles" : "Memberships",
    purpose,
    selectedOptionIds: groups.flatMap((group) =>
      group.options.filter((option) => option.selected).map((option) => option.id),
    ),
  };
}

function grantGroup(
  localId: string,
  label: string,
  options: readonly (readonly [id: string, label: string])[],
  purpose: "memberships" | "roles",
  selectedIds: readonly string[],
  disabledReason?: string,
): FormlessUiAccessGrantOptionGroupContract {
  const id = `access:fixture:${localId}`;
  const controlId = `access:fixture:${purpose}`;

  return {
    id,
    kind: "accessGrantOptionGroup",
    label,
    options: options.map(([optionLocalId, optionLabel]) => {
      const optionId = `access:fixture:${optionLocalId}`;
      const selected = selectedIds.includes(optionLocalId);
      const optionDisabledReason = disabledReason;

      return {
        ...(optionDisabledReason ? { disabledReason: optionDisabledReason } : {}),
        id: optionId,
        label: optionLabel,
        selected,
        selectionIntent: {
          accessId: accessFixtureReference.accessId,
          authoringId: accessFixtureAuthoringReference.authoringId,
          controlId,
          groupId: id,
          optionId,
          selected: !selected,
          type: "accessInvitationGrantSelection",
        },
      };
    }),
  };
}

function accessAction<Intent extends FormlessUiAccessActionContract["intent"]>(
  purpose: FormlessUiAccessActionContract<Intent>["purpose"],
  label: string,
  intent: Intent,
  disabledReason?: string,
  type: FormlessUiButtonContract["type"] = "button",
): FormlessUiAccessActionContract<Intent> {
  return {
    control: button(intent.controlId, label, disabledReason, type),
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function button(
  id: string,
  label: string,
  disabledReason?: string,
  type: FormlessUiButtonContract["type"] = "button",
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    ...(disabledReason ? { disabled: true, disabledReason } : {}),
    id,
    kind: "button",
    prominence: type === "submit" ? "primary" : "secondary",
    type,
  };
}

function fact(
  id: string,
  label: string,
  value: string,
  presentation: FormlessUiAccessDisplayFactContract["presentation"] = "text",
): FormlessUiAccessDisplayFactContract {
  return { id, kind: "accessDisplayFact", label, presentation, value };
}

function statusFact(
  id: string,
  value: string,
  intent: FormlessUiAccessDisplayFactContract["intent"],
): FormlessUiAccessDisplayFactContract {
  return { ...fact(id, "Status", value, "status"), intent };
}

function feedback(
  id: string,
  title: string,
  detail: string,
  intent: FormlessUiAccessFeedbackContract["intent"],
): FormlessUiAccessFeedbackContract {
  return {
    detail,
    id: `access:fixture:feedback:${id}`,
    intent,
    kind: "accessFeedback",
    title,
  };
}
