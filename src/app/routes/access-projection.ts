import type {
  FormlessUiAccessActionContract,
  FormlessUiAccessConfirmationContract,
  FormlessUiAccessControlledFieldContract,
  FormlessUiAccessDisplayFactContract,
  FormlessUiAccessFeedbackContract,
  FormlessUiAccessGrantOptionContract,
  FormlessUiAccessGrantOptionGroupContract,
  FormlessUiAccessGrantSelectionContract,
  FormlessUiAccessIntent,
  FormlessUiAccessInvitationAuthoringContract,
  FormlessUiAccessInvitationAuthoringOpenChangeIntent,
  FormlessUiAccessInvitationContract,
  FormlessUiAccessInvitationFieldPurpose,
  FormlessUiAccessInvitationRevocationConfirmationOpenChangeIntent,
  FormlessUiAccessInvitationRevokeIntent,
  FormlessUiAccessInvitationSubmitIntent,
  FormlessUiAccessManifestContract,
  FormlessUiAccessPersonContract,
  FormlessUiAccessReadyContract,
  FormlessUiButtonContract,
  FormlessUiCompactStatusIntent,
} from "@dpeek/formless-astryx/contract";
import type {
  IdentityAccessInvitationGrantOptions,
  IdentityAccessInvitationMembershipGrantOption,
  IdentityAccessInvitationRoleGrantOption,
  IdentityAccessInvitationSummary,
  IdentityAccessManagementSummary,
  IdentityAccessRoleSummary,
  IdentityInvitationTargetSurface,
} from "@dpeek/formless-identity-control-plane";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import type {
  CreateIdentityAccessManagementInvitationInput,
  RevokeIdentityAccessManagementInvitationInput,
} from "../../client/identity-access-management.ts";
import { displaySafeText, fieldKeyLabel } from "./instance-management-display-safety.ts";
import {
  INSTANCE_ACCESS_ID,
  instanceAccessInvitationAuthoringReference,
  instanceAccessLoadingManifest,
} from "./access-contract.ts";

const ACCESS_INVITE_ACTION_ID = `${INSTANCE_ACCESS_ID}:invite`;
const ACCESS_INVITE_CONTROL_ID = `${INSTANCE_ACCESS_ID}:invite-control`;
const ACCESS_AUTHORING_CANCEL_ACTION_ID = `${INSTANCE_ACCESS_ID}:authoring-cancel`;
const ACCESS_AUTHORING_CANCEL_CONTROL_ID = `${INSTANCE_ACCESS_ID}:authoring-cancel-control`;
const ACCESS_AUTHORING_SUBMIT_ACTION_ID = `${INSTANCE_ACCESS_ID}:authoring-submit`;
const ACCESS_AUTHORING_SUBMIT_CONTROL_ID = `${INSTANCE_ACCESS_ID}:authoring-submit-control`;
const ACCESS_ROLE_SELECTION_ID = `${INSTANCE_ACCESS_ID}:role-grants`;
const ACCESS_MEMBERSHIP_SELECTION_ID = `${INSTANCE_ACCESS_ID}:membership-grants`;
const ACCESS_REVOCATION_CONFIRMATION_ID = `${INSTANCE_ACCESS_ID}:revocation-confirmation`;
const ACCESS_REVOCATION_CANCEL_ACTION_ID = `${INSTANCE_ACCESS_ID}:revocation-cancel`;
const ACCESS_REVOCATION_CANCEL_CONTROL_ID = `${INSTANCE_ACCESS_ID}:revocation-cancel-control`;
const ACCESS_REVOCATION_ACTION_ID = `${INSTANCE_ACCESS_ID}:revoke`;
const ACCESS_REVOCATION_CONTROL_ID = `${INSTANCE_ACCESS_ID}:revoke-control`;

export type AccessManagementPresentationState =
  | { message: string; status: "failed" }
  | { status: "loading" }
  | { status: "ready"; summary: IdentityAccessManagementSummary }
  | { message: string; status: "unauthorized" };

export type AccessInvitationDraft = {
  displayName: string;
  expiresAt: string;
  membershipOptionIds: readonly string[];
  roleOptionIds: readonly string[];
  targetAppInstallId: string;
  targetEmail: string;
  targetOrganizationId: string;
  targetSurface: IdentityInvitationTargetSurface;
};

export type AccessInvitationSubmissionState =
  | { message: string; status: "failed" }
  | { status: "idle" }
  | { message: string; status: "succeeded" }
  | { status: "submitting" };

export type AccessInvitationRevocationState =
  | { invitationId: string; message: string; status: "failed" }
  | { status: "idle" }
  | { invitationId: string; message: string; status: "succeeded" }
  | { invitationId: string; status: "submitting" };

export type ProjectAccessOptions = {
  authoringOpen: boolean;
  confirmationInvitationId?: string | undefined;
  draft: AccessInvitationDraft;
  installs: readonly AppInstall[];
  now: string;
  revocation: AccessInvitationRevocationState;
  state: AccessManagementPresentationState;
  submission: AccessInvitationSubmissionState;
};

export type AccessProjection = {
  authoring?: FormlessUiAccessInvitationAuthoringContract | undefined;
  manifest: FormlessUiAccessManifestContract;
};

export type ResolvedAccessIntent =
  | { draft: AccessInvitationDraft; kind: "draftChange" }
  | { kind: "ignored" }
  | {
      kind: "invitationSubmit";
      request: Omit<CreateIdentityAccessManagementInvitationInput, "idempotencyKey">;
    }
  | { invitationId: string | undefined; kind: "revocationConfirmationChange" }
  | { invitationId: string; kind: "revokeInvitation" }
  | { kind: "authoringOpenChange"; open: boolean };

export type AccessIntentActions = {
  changeAuthoringOpen(open: boolean): void;
  changeDraft(draft: AccessInvitationDraft): void;
  changeRevocationConfirmation(invitationId: string | undefined): void;
  createIdempotencyKey(): string;
  revokeInvitation(input: RevokeIdentityAccessManagementInvitationInput): Promise<void> | void;
  submitInvitation(input: CreateIdentityAccessManagementInvitationInput): Promise<void> | void;
};

export function createInitialAccessInvitationDraft({
  installs,
  now,
  summary,
}: {
  installs: readonly AppInstall[];
  now: string;
  summary?: IdentityAccessManagementSummary | undefined;
}): AccessInvitationDraft {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 7);
  expiresAt.setSeconds(0, 0);

  return {
    displayName: "",
    expiresAt: localDateTimeValue(expiresAt),
    membershipOptionIds: [],
    roleOptionIds: [],
    targetAppInstallId: installs[0]?.installId ?? "",
    targetEmail: "",
    targetOrganizationId: summary?.organizations[0]?.organizationId ?? "",
    targetSurface: "instance",
  };
}

export function projectAccess(options: ProjectAccessOptions): AccessProjection {
  const base = {
    accessibilityLabel: "Access",
    id: INSTANCE_ACCESS_ID,
    kind: "accessManifest" as const,
    title: "Access",
  };

  if (options.state.status === "loading") {
    return { manifest: instanceAccessLoadingManifest };
  }

  if (options.state.status === "unauthorized") {
    return {
      manifest: {
        ...base,
        feedback: accessFeedback("unauthorized", "Access denied", options.state.message, "danger"),
        state: "unauthorized",
      },
    };
  }

  if (options.state.status === "failed") {
    return {
      manifest: {
        ...base,
        feedback: accessFeedback(
          "load-failed",
          "Access unavailable",
          options.state.message,
          "danger",
        ),
        state: "failed",
      },
    };
  }

  const summary = options.state.summary;
  const labels = accessLabels(summary, options.installs);
  const authoring = projectAccessInvitationAuthoring(options, summary, labels);
  const people = projectAccessPeople(summary, labels);
  const invitations = projectAccessInvitations(options, summary, labels);
  const confirmation = projectAccessConfirmation(options, invitations);
  const manifest: FormlessUiAccessReadyContract = {
    ...base,
    authoring: instanceAccessInvitationAuthoringReference,
    ...(confirmation === undefined ? {} : { confirmation }),
    ...(accessSummaryIsEmpty(summary)
      ? {
          emptyState: {
            description: "Invite a collaborator to add access.",
            id: `${INSTANCE_ACCESS_ID}:empty`,
            kind: "accessEmptyState",
            title: "No people or invitations",
          },
        }
      : {}),
    ...(readyFeedback(options) === undefined ? {} : { feedback: readyFeedback(options) }),
    invitations,
    invite: accessInviteAction(summary, options.submission),
    kind: "accessManifest",
    people,
    state: "ready",
  };

  return { authoring, manifest };
}

export function resolveAccessIntent(
  options: ProjectAccessOptions,
  projection: AccessProjection,
  intent: FormlessUiAccessIntent,
): ResolvedAccessIntent {
  if (projection.manifest.state !== "ready" || intent.accessId !== projection.manifest.id) {
    return { kind: "ignored" };
  }

  const authoring = projection.authoring;
  if (!authoring) {
    return { kind: "ignored" };
  }

  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange": {
      const expected = intent.open ? projection.manifest.invite : authoring.cancel;
      return sameAccessActionIntent(intent, expected.intent) && expected.control.disabled !== true
        ? { kind: "authoringOpenChange", open: intent.open }
        : { kind: "ignored" };
    }
    case "accessInvitationFieldChange": {
      if (authoring.pending?.isPending) {
        return { kind: "ignored" };
      }
      const field = Object.values(authoring.fields).find(
        (candidate) =>
          candidate.id === intent.fieldId &&
          candidate.changeIntent.authoringId === intent.authoringId,
      );
      if (!field || field.disabledReason) {
        return { kind: "ignored" };
      }
      if (
        field.inputKind === "select" &&
        !field.options?.some(
          (option) => option.value === intent.value && option.disabledReason === undefined,
        )
      ) {
        return { kind: "ignored" };
      }
      return {
        draft: accessDraftWithFieldValue(options.draft, field.purpose, intent.value),
        kind: "draftChange",
      };
    }
    case "accessInvitationGrantSelection": {
      if (authoring.pending?.isPending) {
        return { kind: "ignored" };
      }
      const selection = authoring.grantSelections.find(
        (candidate) => candidate.id === intent.controlId,
      );
      const group = selection?.groups.find((candidate) => candidate.id === intent.groupId);
      const option = group?.options.find((candidate) => candidate.id === intent.optionId);
      if (
        !selection ||
        !option ||
        selection.disabledReason ||
        option.disabledReason ||
        option.selectionIntent.selected !== intent.selected ||
        option.selected === intent.selected
      ) {
        return { kind: "ignored" };
      }
      const current =
        selection.purpose === "roles"
          ? options.draft.roleOptionIds
          : options.draft.membershipOptionIds;
      const next = toggleAccessOption(current, option.id, intent.selected);
      return {
        draft:
          selection.purpose === "roles"
            ? { ...options.draft, roleOptionIds: next }
            : { ...options.draft, membershipOptionIds: next },
        kind: "draftChange",
      };
    }
    case "accessInvitationSubmit":
      return sameAccessActionIntent(intent, authoring.submit.intent) &&
        authoring.submit.control.disabled !== true
        ? {
            kind: "invitationSubmit",
            request: accessInvitationRequest(options, authoring),
          }
        : { kind: "ignored" };
    case "accessInvitationRevocationConfirmationOpenChange": {
      if (!intent.open) {
        const confirmation = projection.manifest.confirmation;
        return confirmation && sameAccessActionIntent(intent, confirmation.cancel.intent)
          ? { invitationId: undefined, kind: "revocationConfirmationChange" }
          : { kind: "ignored" };
      }
      const invitation = projection.manifest.invitations.find(
        (candidate) => candidate.id === intent.invitationId,
      );
      const action =
        invitation?.revocation.availability === "available"
          ? invitation.revocation.action
          : undefined;
      return action &&
        action.control.disabled !== true &&
        sameAccessActionIntent(intent, action.intent)
        ? { invitationId: intent.invitationId, kind: "revocationConfirmationChange" }
        : { kind: "ignored" };
    }
    case "accessInvitationRevoke": {
      const confirmation = projection.manifest.confirmation;
      return confirmation &&
        confirmation.open &&
        confirmation.action.control.disabled !== true &&
        sameAccessActionIntent(intent, confirmation.action.intent)
        ? { invitationId: confirmation.invitationId, kind: "revokeInvitation" }
        : { kind: "ignored" };
    }
  }
}

export async function dispatchAccessIntent(
  options: ProjectAccessOptions,
  projection: AccessProjection,
  intent: FormlessUiAccessIntent,
  actions: AccessIntentActions,
): Promise<void> {
  const resolved = resolveAccessIntent(options, projection, intent);

  switch (resolved.kind) {
    case "ignored":
      return;
    case "authoringOpenChange":
      actions.changeAuthoringOpen(resolved.open);
      return;
    case "draftChange":
      actions.changeDraft(resolved.draft);
      return;
    case "revocationConfirmationChange":
      actions.changeRevocationConfirmation(resolved.invitationId);
      return;
    case "invitationSubmit":
      await actions.submitInvitation({
        ...resolved.request,
        idempotencyKey: actions.createIdempotencyKey(),
      });
      return;
    case "revokeInvitation":
      await actions.revokeInvitation({ invitationId: resolved.invitationId });
  }
}

function projectAccessInvitationAuthoring(
  options: ProjectAccessOptions,
  summary: IdentityAccessManagementSummary,
  labels: AccessLabels,
): FormlessUiAccessInvitationAuthoringContract {
  const pending = options.submission.status === "submitting";
  const fields = projectAccessAuthoringFields(options, labels);
  const roleSelection = projectRoleSelection(options, summary.invitationGrantOptions, labels);
  const membershipSelection = projectMembershipSelection(
    options,
    summary.invitationGrantOptions,
    labels,
  );
  const errors = [
    ...Object.values(fields).flatMap((field) => field.errors),
    ...roleSelection.errors,
    ...membershipSelection.errors,
  ];
  const cancelControl = accessButton(
    ACCESS_AUTHORING_CANCEL_CONTROL_ID,
    "Cancel",
    "secondary",
    "button",
    pending ? "Invitation creation is in progress." : undefined,
  );
  const submitDisabledReason = pending
    ? "Invitation creation is in progress."
    : (errors[0] ?? invitationAuthorityDisabledReason(summary.invitationGrantOptions));
  const submitControl = accessButton(
    ACCESS_AUTHORING_SUBMIT_CONTROL_ID,
    pending ? "Sending..." : "Send invite",
    "primary",
    "submit",
    submitDisabledReason,
  );

  return {
    accessId: INSTANCE_ACCESS_ID,
    cancel: {
      control: cancelControl,
      id: ACCESS_AUTHORING_CANCEL_ACTION_ID,
      intent: {
        accessId: INSTANCE_ACCESS_ID,
        actionId: ACCESS_AUTHORING_CANCEL_ACTION_ID,
        authoringId: instanceAccessInvitationAuthoringReference.authoringId,
        controlId: cancelControl.id,
        open: false,
        type: "accessInvitationAuthoringOpenChange",
      },
      kind: "accessAction",
      purpose: "authoring-cancel",
    },
    description: "Invite a collaborator and choose their access.",
    errors,
    ...(options.submission.status === "failed"
      ? {
          feedback: accessFeedback(
            "invitation-failed",
            "Invitation could not be created",
            options.submission.message,
            "danger",
          ),
        }
      : {}),
    fields,
    grantSelections: [roleSelection, membershipSelection],
    id: instanceAccessInvitationAuthoringReference.authoringId,
    kind: "accessInvitationAuthoring",
    open: options.authoringOpen,
    ...(pending ? { pending: { isPending: true, label: "Sending invitation" } } : {}),
    submit: {
      control: submitControl,
      id: ACCESS_AUTHORING_SUBMIT_ACTION_ID,
      intent: {
        accessId: INSTANCE_ACCESS_ID,
        actionId: ACCESS_AUTHORING_SUBMIT_ACTION_ID,
        authoringId: instanceAccessInvitationAuthoringReference.authoringId,
        controlId: submitControl.id,
        type: "accessInvitationSubmit",
      },
      kind: "accessAction",
      purpose: "invitation-submit",
    },
    title: "Invite collaborator",
  };
}

function projectAccessAuthoringFields(
  options: ProjectAccessOptions,
  labels: AccessLabels,
): FormlessUiAccessInvitationAuthoringContract["fields"] {
  const { draft } = options;
  const pendingReason =
    options.submission.status === "submitting" ? "Invitation creation is in progress." : undefined;
  const appOptions = Array.from(labels.installs.entries()).map(([installId, label]) =>
    fieldOption("app-install", installId, label, installId === draft.targetAppInstallId),
  );
  const organizationOptions = Array.from(labels.organizations.entries()).map(
    ([organizationId, label]) =>
      fieldOption(
        "organization",
        organizationId,
        label,
        organizationId === draft.targetOrganizationId,
      ),
  );
  const surfaceOptions = [
    fieldOption("surface", "instance", "Instance", draft.targetSurface === "instance"),
    fieldOption(
      "surface",
      "app-install",
      "App install",
      draft.targetSurface === "app-install",
      appOptions.length === 0 ? "No app installs are available." : undefined,
    ),
    fieldOption(
      "surface",
      "organization",
      "Organization",
      draft.targetSurface === "organization",
      organizationOptions.length === 0 ? "No organizations are available." : undefined,
    ),
  ];

  return {
    displayName: accessField({
      disabledReason: pendingReason,
      errors: requiredTextErrors("Display name", draft.displayName),
      inputKind: "text",
      label: "Display name",
      purpose: "display-name",
      required: true,
      value: draft.displayName,
    }),
    expiresAt: accessField({
      disabledReason: pendingReason,
      errors: expiresAtErrors(draft.expiresAt, options.now),
      inputKind: "datetime",
      label: "Expires",
      purpose: "expires-at",
      required: true,
      value: draft.expiresAt,
    }),
    targetAppInstall: accessField({
      disabledReason:
        pendingReason ??
        (appOptions.length === 0
          ? "No app installs are available."
          : draft.targetSurface === "app-install"
            ? undefined
            : "Choose App install as the target surface."),
      errors:
        draft.targetSurface === "app-install" && !labels.installs.has(draft.targetAppInstallId)
          ? ["Choose an available app install scope."]
          : [],
      inputKind: "select",
      label: "App install scope",
      options: appOptions,
      purpose: "target-app-install",
      required: draft.targetSurface === "app-install",
      value: draft.targetAppInstallId,
    }),
    targetEmail: accessField({
      disabledReason: pendingReason,
      errors: emailErrors(draft.targetEmail),
      inputKind: "email",
      label: "Email",
      purpose: "target-email",
      required: true,
      value: draft.targetEmail,
    }),
    targetOrganization: accessField({
      disabledReason:
        pendingReason ??
        (organizationOptions.length === 0
          ? "No organizations are available."
          : draft.targetSurface === "organization"
            ? undefined
            : "Choose Organization as the target surface."),
      errors:
        draft.targetSurface === "organization" &&
        !labels.organizations.has(draft.targetOrganizationId)
          ? ["Choose an available organization scope."]
          : [],
      inputKind: "select",
      label: "Organization scope",
      options: organizationOptions,
      purpose: "target-organization",
      required: draft.targetSurface === "organization",
      value: draft.targetOrganizationId,
    }),
    targetSurface: accessField({
      disabledReason: pendingReason,
      errors: surfaceOptions.some(
        (option) => option.value === draft.targetSurface && option.disabledReason === undefined,
      )
        ? []
        : ["Choose an available target surface."],
      inputKind: "select",
      label: "Target surface",
      options: surfaceOptions,
      purpose: "target-surface",
      required: true,
      value: draft.targetSurface,
    }),
  };
}

function projectRoleSelection(
  options: ProjectAccessOptions,
  grantOptions: IdentityAccessInvitationGrantOptions,
  labels: AccessLabels,
): FormlessUiAccessGrantSelectionContract & { purpose: "roles" } {
  const pendingReason =
    options.submission.status === "submitting" ? "Invitation creation is in progress." : undefined;
  const groups = (["instance", "app-install", "organization"] as const).map((scopeKind) => ({
    id: `${INSTANCE_ACCESS_ID}:role-group:${scopeKind}`,
    kind: "accessGrantOptionGroup" as const,
    label: fieldKeyLabel(scopeKind),
    options: grantOptions.roles
      .filter((option) => option.scopeKind === scopeKind)
      .map((option) => projectRoleOption(options, option, labels, scopeKind, pendingReason)),
  }));
  const selectedOptionIds = groups.flatMap((group) =>
    group.options.filter(({ selected }) => selected).map(({ id }) => id),
  );
  const errors = groups.flatMap((group) =>
    group.options.flatMap((option) =>
      option.selected && option.disabledReason ? [option.disabledReason] : [],
    ),
  );

  return {
    ...(pendingReason === undefined ? {} : { disabledReason: pendingReason }),
    errors: distinctStrings(errors),
    groups,
    id: ACCESS_ROLE_SELECTION_ID,
    kind: "accessGrantSelection",
    label: "Roles",
    purpose: "roles",
    selectedOptionIds,
  };
}

function projectRoleOption(
  options: ProjectAccessOptions,
  option: IdentityAccessInvitationRoleGrantOption,
  labels: AccessLabels,
  scopeKind: IdentityAccessInvitationRoleGrantOption["scopeKind"],
  pendingReason: string | undefined,
): FormlessUiAccessGrantOptionContract {
  const id = accessRoleOptionId(option);
  const selected = options.draft.roleOptionIds.includes(id);
  const disabledReason =
    pendingReason ??
    (scopeKind === "app-install" && !labels.installs.has(options.draft.targetAppInstallId)
      ? "Choose an available app install scope for app roles."
      : scopeKind === "organization" &&
          !labels.organizations.has(options.draft.targetOrganizationId)
        ? "Choose an available organization scope for organization roles."
        : undefined);

  return {
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id,
    label: safeLabel(option.displayLabel, "Unnamed role"),
    selected,
    selectionIntent: {
      accessId: INSTANCE_ACCESS_ID,
      authoringId: instanceAccessInvitationAuthoringReference.authoringId,
      controlId: ACCESS_ROLE_SELECTION_ID,
      groupId: `${INSTANCE_ACCESS_ID}:role-group:${scopeKind}`,
      optionId: id,
      selected: !selected,
      type: "accessInvitationGrantSelection",
    },
  };
}

function projectMembershipSelection(
  options: ProjectAccessOptions,
  grantOptions: IdentityAccessInvitationGrantOptions,
  labels: AccessLabels,
): FormlessUiAccessGrantSelectionContract & { purpose: "memberships" } {
  const pendingReason =
    options.submission.status === "submitting" ? "Invitation creation is in progress." : undefined;
  const groups: FormlessUiAccessGrantOptionGroupContract[] = [
    {
      id: `${INSTANCE_ACCESS_ID}:membership-group:organizations`,
      kind: "accessGrantOptionGroup",
      label: "Organizations",
      options: grantOptions.memberships
        .filter((option) => option.targetKind === "organization")
        .map((option) =>
          projectMembershipOption(options, option, labels, "organizations", pendingReason),
        ),
    },
    {
      id: `${INSTANCE_ACCESS_ID}:membership-group:groups`,
      kind: "accessGrantOptionGroup",
      label: "Groups",
      options: grantOptions.memberships
        .filter((option) => option.targetKind === "group")
        .map((option) => projectMembershipOption(options, option, labels, "groups", pendingReason)),
    },
  ];
  const selectedOptionIds = groups.flatMap((group) =>
    group.options.filter(({ selected }) => selected).map(({ id }) => id),
  );
  const errors = groups.flatMap((group) =>
    group.options.flatMap((option) =>
      option.selected && option.disabledReason ? [option.disabledReason] : [],
    ),
  );

  return {
    ...(pendingReason === undefined ? {} : { disabledReason: pendingReason }),
    errors: distinctStrings(errors),
    groups,
    id: ACCESS_MEMBERSHIP_SELECTION_ID,
    kind: "accessGrantSelection",
    label: "Memberships",
    purpose: "memberships",
    selectedOptionIds,
  };
}

function projectMembershipOption(
  options: ProjectAccessOptions,
  option: IdentityAccessInvitationMembershipGrantOption,
  labels: AccessLabels,
  groupKey: "groups" | "organizations",
  pendingReason: string | undefined,
): FormlessUiAccessGrantOptionContract {
  const id = accessMembershipOptionId(option);
  const selected = options.draft.membershipOptionIds.includes(id);
  const targetId =
    option.targetKind === "group" ? option.targetGroupId : option.targetOrganizationId;
  const targetLabels = option.targetKind === "group" ? labels.groups : labels.organizations;
  const available = targetId !== undefined && targetLabels.has(targetId);
  const unavailableLabel =
    option.targetKind === "group" ? "Unavailable group" : "Unavailable organization";
  const disabledReason = pendingReason ?? (available ? undefined : `${unavailableLabel}.`);
  const label =
    targetId === undefined ? unavailableLabel : (targetLabels.get(targetId) ?? unavailableLabel);

  return {
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id,
    label,
    selected,
    selectionIntent: {
      accessId: INSTANCE_ACCESS_ID,
      authoringId: instanceAccessInvitationAuthoringReference.authoringId,
      controlId: ACCESS_MEMBERSHIP_SELECTION_ID,
      groupId: `${INSTANCE_ACCESS_ID}:membership-group:${groupKey}`,
      optionId: id,
      selected: !selected,
      type: "accessInvitationGrantSelection",
    },
  };
}

function projectAccessPeople(
  summary: IdentityAccessManagementSummary,
  labels: AccessLabels,
): readonly FormlessUiAccessPersonContract[] {
  const rolesByPrincipalId = new Map<string, IdentityAccessRoleSummary[]>();
  for (const role of summary.roles) {
    if (role.targetKind !== "principal" || role.targetPrincipalId === undefined) {
      continue;
    }
    rolesByPrincipalId.set(role.targetPrincipalId, [
      ...(rolesByPrincipalId.get(role.targetPrincipalId) ?? []),
      role,
    ]);
  }

  return summary.people.map((person) => ({
    displayName: safeLabel(person.displayName, "Unnamed person"),
    id: person.principalId,
    kind: "accessPerson",
    ...(person.primaryEmail === undefined
      ? {}
      : { primaryEmail: displaySafeText(person.primaryEmail.displayEmail) }),
    roles: (rolesByPrincipalId.get(person.principalId) ?? []).map((role) => ({
      id: role.roleAssignmentId,
      kind: "accessRole",
      label: safeLabel(role.displayLabel, "Unnamed role"),
      scope: accessFact(
        `${role.roleAssignmentId}:scope`,
        "Scope",
        accessRoleScopeLabel(role, labels),
      ),
      status: accessStatusFact(`${role.roleAssignmentId}:status`, role.status),
    })),
    status: accessStatusFact(`${person.principalId}:status`, person.status),
  }));
}

function projectAccessInvitations(
  options: ProjectAccessOptions,
  summary: IdentityAccessManagementSummary,
  labels: AccessLabels,
): readonly FormlessUiAccessInvitationContract[] {
  const canManage = canManageInvitations(summary.invitationGrantOptions);

  return summary.invitations.map((invitation) => {
    const revocationDisabledReason = accessRevocationDisabledReason(options, invitation, canManage);
    const revokeControl = accessButton(
      `${ACCESS_REVOCATION_CONTROL_ID}:${correlationSegment(invitation.invitationId)}`,
      options.revocation.status === "submitting" &&
        options.revocation.invitationId === invitation.invitationId
        ? "Revoking..."
        : "Revoke",
      "secondary",
      "button",
      revocationDisabledReason,
    );
    const revocation =
      invitation.status !== "pending" || !canManage
        ? {
            availability: "unavailable" as const,
            disabledReason:
              invitation.status !== "pending"
                ? "Only pending invitations can be revoked."
                : "Owner or administrator access is required.",
          }
        : {
            action: {
              control: revokeControl,
              id: `${INSTANCE_ACCESS_ID}:revocation-open:${correlationSegment(invitation.invitationId)}`,
              intent: {
                accessId: INSTANCE_ACCESS_ID,
                actionId: `${INSTANCE_ACCESS_ID}:revocation-open:${correlationSegment(invitation.invitationId)}`,
                confirmationId: ACCESS_REVOCATION_CONFIRMATION_ID,
                controlId: revokeControl.id,
                invitationId: invitation.invitationId,
                open: true,
                type: "accessInvitationRevocationConfirmationOpenChange" as const,
              },
              kind: "accessAction" as const,
              purpose: "revocation-open" as const,
            },
            availability: "available" as const,
          };

    return {
      expiresAt: accessFact(
        `${invitation.invitationId}:expires-at`,
        "Expires",
        invitation.expiresAt,
        "timestamp",
      ),
      id: invitation.invitationId,
      ...(invitation.inviterPrincipalId === undefined
        ? {}
        : {
            inviter: accessFact(
              `${invitation.invitationId}:inviter`,
              "Invited by",
              labels.people.get(invitation.inviterPrincipalId) ?? "Unavailable person",
            ),
          }),
      kind: "accessInvitation",
      revocation,
      scope: accessFact(
        `${invitation.invitationId}:scope`,
        "Scope",
        accessInvitationScopeLabel(invitation, labels),
      ),
      status: accessStatusFact(`${invitation.invitationId}:status`, invitation.status),
      target: accessFact(
        `${invitation.invitationId}:target`,
        "Target",
        fieldKeyLabel(invitation.targetSurface),
      ),
      targetEmail: displaySafeText(invitation.targetEmail),
    };
  });
}

function projectAccessConfirmation(
  options: ProjectAccessOptions,
  invitations: readonly FormlessUiAccessInvitationContract[],
): FormlessUiAccessConfirmationContract | undefined {
  if (options.confirmationInvitationId === undefined) {
    return undefined;
  }
  const invitation = invitations.find(
    (candidate) => candidate.id === options.confirmationInvitationId,
  );
  if (!invitation || invitation.revocation.availability !== "available") {
    return undefined;
  }
  const pending =
    options.revocation.status === "submitting" && options.revocation.invitationId === invitation.id;
  const cancelControl = accessButton(
    ACCESS_REVOCATION_CANCEL_CONTROL_ID,
    "Cancel",
    "secondary",
    "button",
    pending ? "Invitation revocation is in progress." : undefined,
  );
  const actionControl = accessButton(
    ACCESS_REVOCATION_CONTROL_ID,
    pending ? "Revoking..." : "Revoke invitation",
    "primary",
    "button",
    pending ? "Invitation revocation is in progress." : undefined,
  );

  return {
    action: {
      control: actionControl,
      id: ACCESS_REVOCATION_ACTION_ID,
      intent: {
        accessId: INSTANCE_ACCESS_ID,
        actionId: ACCESS_REVOCATION_ACTION_ID,
        confirmationId: ACCESS_REVOCATION_CONFIRMATION_ID,
        controlId: actionControl.id,
        invitationId: invitation.id,
        type: "accessInvitationRevoke",
      },
      kind: "accessAction",
      purpose: "invitation-revoke",
    },
    cancel: {
      control: cancelControl,
      id: ACCESS_REVOCATION_CANCEL_ACTION_ID,
      intent: {
        accessId: INSTANCE_ACCESS_ID,
        actionId: ACCESS_REVOCATION_CANCEL_ACTION_ID,
        confirmationId: ACCESS_REVOCATION_CONFIRMATION_ID,
        controlId: cancelControl.id,
        invitationId: invitation.id,
        open: false,
        type: "accessInvitationRevocationConfirmationOpenChange",
      },
      kind: "accessAction",
      purpose: "revocation-cancel",
    },
    description: `The pending invitation for ${invitation.targetEmail} will no longer be usable.`,
    id: ACCESS_REVOCATION_CONFIRMATION_ID,
    invitationId: invitation.id,
    kind: "accessConfirmation",
    open: true,
    title: "Revoke invitation?",
  };
}

function accessInviteAction(
  summary: IdentityAccessManagementSummary,
  submission: AccessInvitationSubmissionState,
): FormlessUiAccessActionContract<FormlessUiAccessInvitationAuthoringOpenChangeIntent> {
  const disabledReason =
    submission.status === "submitting"
      ? "Invitation creation is in progress."
      : invitationAuthorityDisabledReason(summary.invitationGrantOptions);
  const control = accessButton(
    ACCESS_INVITE_CONTROL_ID,
    "Invite collaborator",
    "primary",
    "button",
    disabledReason,
  );

  return {
    control,
    id: ACCESS_INVITE_ACTION_ID,
    intent: {
      accessId: INSTANCE_ACCESS_ID,
      actionId: ACCESS_INVITE_ACTION_ID,
      authoringId: instanceAccessInvitationAuthoringReference.authoringId,
      controlId: control.id,
      open: true,
      type: "accessInvitationAuthoringOpenChange",
    },
    kind: "accessAction",
    purpose: "authoring-open",
  };
}

function accessInvitationRequest(
  options: ProjectAccessOptions,
  authoring: FormlessUiAccessInvitationAuthoringContract,
): Omit<CreateIdentityAccessManagementInvitationInput, "idempotencyKey"> {
  if (options.state.status !== "ready") {
    throw new Error("Access invitation request requires a ready summary.");
  }
  const { draft } = options;
  const grantOptions = options.state.summary.invitationGrantOptions;
  const selectedRoleIds = new Set(authoring.grantSelections[0].selectedOptionIds);
  const selectedMembershipIds = new Set(authoring.grantSelections[1].selectedOptionIds);
  const roleAssignments: NonNullable<
    CreateIdentityAccessManagementInvitationInput["roleAssignments"]
  > = [];
  for (const option of grantOptions.roles) {
    if (!selectedRoleIds.has(accessRoleOptionId(option))) {
      continue;
    }
    if (option.scopeKind === "app-install") {
      roleAssignments.push({
        appInstallId: draft.targetAppInstallId,
        roleKey: option.roleKey,
        scopeKind: option.scopeKind,
      });
    } else if (option.scopeKind === "organization") {
      roleAssignments.push({
        roleKey: option.roleKey,
        scopeKind: option.scopeKind,
        scopeOrganization: draft.targetOrganizationId,
      });
    } else {
      roleAssignments.push({ roleKey: option.roleKey, scopeKind: option.scopeKind });
    }
  }
  const memberships: NonNullable<CreateIdentityAccessManagementInvitationInput["memberships"]> = [];
  for (const option of grantOptions.memberships) {
    if (!selectedMembershipIds.has(accessMembershipOptionId(option))) {
      continue;
    }
    if (option.targetKind === "group" && option.targetGroupId !== undefined) {
      memberships.push({ targetGroup: option.targetGroupId, targetKind: "group" });
    } else if (option.targetKind === "organization" && option.targetOrganizationId !== undefined) {
      memberships.push({
        targetKind: "organization",
        targetOrganization: option.targetOrganizationId,
      });
    }
  }
  const target =
    draft.targetSurface === "app-install"
      ? { targetAppInstallId: draft.targetAppInstallId, targetSurface: draft.targetSurface }
      : draft.targetSurface === "organization"
        ? {
            targetOrganization: draft.targetOrganizationId,
            targetSurface: draft.targetSurface,
          }
        : { targetSurface: draft.targetSurface };

  return {
    ...target,
    appRegistrations:
      draft.targetSurface === "app-install" ? [{ appInstallId: draft.targetAppInstallId }] : [],
    expiresAt: new Date(draft.expiresAt).toISOString(),
    invitedPrincipal: { displayName: draft.displayName.trim() },
    memberships,
    principalEmail: { primary: true, recovery: false },
    roleAssignments,
    targetEmail: draft.targetEmail.trim(),
  };
}

type AccessLabels = {
  groups: ReadonlyMap<string, string>;
  installs: ReadonlyMap<string, string>;
  organizations: ReadonlyMap<string, string>;
  people: ReadonlyMap<string, string>;
};

function accessLabels(
  summary: IdentityAccessManagementSummary,
  installs: readonly AppInstall[],
): AccessLabels {
  return {
    groups: new Map(
      summary.groups.map((group) => [group.groupId, safeLabel(group.displayName, "Unnamed group")]),
    ),
    installs: new Map(
      installs.map((install) => [install.installId, safeLabel(install.label, "Unnamed app")]),
    ),
    organizations: new Map(
      summary.organizations.map((organization) => [
        organization.organizationId,
        safeLabel(organization.displayName, "Unnamed organization"),
      ]),
    ),
    people: new Map(
      summary.people.map((person) => [
        person.principalId,
        safeLabel(person.displayName, "Unnamed person"),
      ]),
    ),
  };
}

function accessRoleScopeLabel(role: IdentityAccessRoleSummary, labels: AccessLabels): string {
  if (role.scopeKind === "app-install") {
    return role.appInstallId === undefined
      ? "Unavailable app install"
      : (labels.installs.get(role.appInstallId) ?? "Unavailable app install");
  }
  if (role.scopeKind === "organization") {
    return role.scopeOrganizationId === undefined
      ? "Unavailable organization"
      : (labels.organizations.get(role.scopeOrganizationId) ?? "Unavailable organization");
  }
  return "Instance";
}

function accessInvitationScopeLabel(
  invitation: IdentityAccessInvitationSummary,
  labels: AccessLabels,
): string {
  if (invitation.targetSurface === "app-install") {
    return invitation.targetAppInstallId === undefined
      ? "Unavailable app install"
      : (labels.installs.get(invitation.targetAppInstallId) ?? "Unavailable app install");
  }
  if (invitation.targetSurface === "organization") {
    return invitation.targetOrganizationId === undefined
      ? "Unavailable organization"
      : (labels.organizations.get(invitation.targetOrganizationId) ?? "Unavailable organization");
  }
  return "Instance";
}

function accessRevocationDisabledReason(
  options: ProjectAccessOptions,
  invitation: IdentityAccessInvitationSummary,
  canManage: boolean,
): string | undefined {
  if (!canManage || invitation.status !== "pending") {
    return undefined;
  }
  if (options.revocation.status !== "submitting") {
    return undefined;
  }
  return options.revocation.invitationId === invitation.invitationId
    ? "Invitation revocation is in progress."
    : "Another invitation revocation is in progress.";
}

function readyFeedback(
  options: ProjectAccessOptions,
): FormlessUiAccessFeedbackContract | undefined {
  if (options.revocation.status === "failed") {
    return accessFeedback(
      "revocation-failed",
      "Invitation could not be revoked",
      options.revocation.message,
      "danger",
    );
  }
  if (options.revocation.status === "succeeded") {
    return accessFeedback(
      "revocation-succeeded",
      "Invitation revoked",
      options.revocation.message,
      "success",
    );
  }
  if (options.submission.status === "succeeded") {
    return accessFeedback(
      "invitation-succeeded",
      "Invitation created",
      options.submission.message,
      "success",
    );
  }
  return undefined;
}

function accessFeedback(
  id: string,
  title: string,
  detail: string,
  intent: FormlessUiCompactStatusIntent,
): FormlessUiAccessFeedbackContract {
  return {
    detail: displaySafeText(detail),
    id: `${INSTANCE_ACCESS_ID}:feedback:${id}`,
    intent,
    kind: "accessFeedback",
    title,
  };
}

function accessField({
  disabledReason,
  errors,
  inputKind,
  label,
  options,
  purpose,
  required,
  value,
}: {
  disabledReason?: string | undefined;
  errors: readonly string[];
  inputKind: FormlessUiAccessControlledFieldContract["inputKind"];
  label: string;
  options?: FormlessUiAccessControlledFieldContract["options"];
  purpose: FormlessUiAccessInvitationFieldPurpose;
  required: boolean;
  value: string;
}): FormlessUiAccessControlledFieldContract {
  const id = `${INSTANCE_ACCESS_ID}:field:${purpose}`;
  return {
    changeIntent: {
      accessId: INSTANCE_ACCESS_ID,
      authoringId: instanceAccessInvitationAuthoringReference.authoringId,
      fieldId: id,
      type: "accessInvitationFieldChange",
    },
    ...(disabledReason === undefined ? {} : { disabledReason }),
    errors,
    id,
    inputKind,
    kind: "accessControlledField",
    label,
    ...(options === undefined ? {} : { options }),
    purpose,
    required,
    value,
  };
}

function fieldOption(
  kind: string,
  value: string,
  label: string,
  selected: boolean,
  disabledReason?: string,
) {
  return {
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id: `${INSTANCE_ACCESS_ID}:${kind}-option:${correlationSegment(value)}`,
    label,
    selected,
    value,
  };
}

function accessFact(
  id: string,
  label: string,
  value: string,
  presentation: FormlessUiAccessDisplayFactContract["presentation"] = "text",
  intent?: FormlessUiCompactStatusIntent,
): FormlessUiAccessDisplayFactContract {
  return {
    id,
    ...(intent === undefined ? {} : { intent }),
    kind: "accessDisplayFact",
    label,
    presentation,
    value: displaySafeText(value),
  };
}

function accessStatusFact(id: string, value: string): FormlessUiAccessDisplayFactContract {
  return accessFact(id, "Status", fieldKeyLabel(value), "status", statusIntent(value));
}

function statusIntent(value: string): FormlessUiCompactStatusIntent {
  if (["accepted", "active", "verified"].includes(value)) {
    return "success";
  }
  if (["invited", "pending", "unverified"].includes(value)) {
    return "warning";
  }
  if (["disabled", "expired", "revoked"].includes(value)) {
    return "danger";
  }
  return "neutral";
}

function accessButton(
  id: string,
  label: string,
  prominence: FormlessUiButtonContract["prominence"],
  type: FormlessUiButtonContract["type"],
  disabledReason?: string,
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    ...(disabledReason === undefined
      ? {}
      : { disabled: true, disabledReason, errors: [disabledReason] }),
    id,
    kind: "button",
    prominence,
    type,
  };
}

function accessRoleOptionId(option: IdentityAccessInvitationRoleGrantOption): string {
  return `${INSTANCE_ACCESS_ID}:role-option:${correlationSegment(option.scopeKind)}:${correlationSegment(option.roleKey)}`;
}

function accessMembershipOptionId(option: IdentityAccessInvitationMembershipGrantOption): string {
  const targetId =
    option.targetKind === "group" ? option.targetGroupId : option.targetOrganizationId;
  return `${INSTANCE_ACCESS_ID}:membership-option:${correlationSegment(option.targetKind)}:${correlationSegment(targetId ?? "unavailable")}`;
}

function invitationAuthorityDisabledReason(
  grantOptions: IdentityAccessInvitationGrantOptions,
): string | undefined {
  return canManageInvitations(grantOptions)
    ? undefined
    : "Owner or administrator access is required.";
}

function canManageInvitations(grantOptions: IdentityAccessInvitationGrantOptions): boolean {
  return grantOptions.authority.instanceOwner || grantOptions.authority.instanceAdmin;
}

function accessDraftWithFieldValue(
  draft: AccessInvitationDraft,
  purpose: FormlessUiAccessInvitationFieldPurpose,
  value: string,
): AccessInvitationDraft {
  switch (purpose) {
    case "display-name":
      return { ...draft, displayName: value };
    case "expires-at":
      return { ...draft, expiresAt: value };
    case "target-app-install":
      return { ...draft, targetAppInstallId: value };
    case "target-email":
      return { ...draft, targetEmail: value };
    case "target-organization":
      return { ...draft, targetOrganizationId: value };
    case "target-surface":
      return {
        ...draft,
        targetSurface: value as IdentityInvitationTargetSurface,
      };
  }
}

function sameAccessActionIntent(
  actual: FormlessUiAccessIntent,
  expected:
    | FormlessUiAccessInvitationAuthoringOpenChangeIntent
    | FormlessUiAccessInvitationRevocationConfirmationOpenChangeIntent
    | FormlessUiAccessInvitationRevokeIntent
    | FormlessUiAccessInvitationSubmitIntent,
): boolean {
  if (actual.type !== expected.type) {
    return false;
  }
  return Object.entries(expected).every(
    ([key, value]) => (actual as unknown as Record<string, unknown>)[key] === value,
  );
}

function toggleAccessOption(
  current: readonly string[],
  optionId: string,
  selected: boolean,
): readonly string[] {
  if (selected) {
    return current.includes(optionId) ? [...current] : [...current, optionId];
  }
  return current.filter((candidate) => candidate !== optionId);
}

function requiredTextErrors(label: string, value: string): readonly string[] {
  return value.trim() === "" ? [`${label} is required.`] : [];
}

function emailErrors(value: string): readonly string[] {
  const required = requiredTextErrors("Email", value);
  if (required.length > 0) {
    return required;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? [] : ["Email must be valid."];
}

function expiresAtErrors(value: string, now: string): readonly string[] {
  const required = requiredTextErrors("Expires", value);
  if (required.length > 0) {
    return required;
  }
  const expiresAt = new Date(value);
  const current = new Date(now);
  if (Number.isNaN(expiresAt.getTime())) {
    return ["Expires must be a valid date and time."];
  }
  return expiresAt.getTime() > current.getTime() ? [] : ["Expires must be in the future."];
}

function accessSummaryIsEmpty(summary: IdentityAccessManagementSummary): boolean {
  return (
    summary.people.length === 0 &&
    summary.invitations.length === 0 &&
    summary.roles.length === 0 &&
    summary.appRegistrations.length === 0 &&
    summary.memberships.length === 0 &&
    summary.organizations.length === 0 &&
    summary.groups.length === 0
  );
}

function safeLabel(value: string, fallback: string): string {
  const safe = displaySafeText(value).trim();
  return safe === "" ? fallback : safe;
}

function correlationSegment(value: string): string {
  return encodeURIComponent(value).replaceAll("%", "_");
}

function localDateTimeValue(value: Date): string {
  return `${value.getFullYear()}-${datePart(value.getMonth() + 1)}-${datePart(value.getDate())}T${datePart(value.getHours())}:${datePart(value.getMinutes())}`;
}

function datePart(value: number): string {
  return String(value).padStart(2, "0");
}

function distinctStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}
