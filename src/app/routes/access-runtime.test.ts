import { describe, expect, it } from "vite-plus/test";
import type { FormlessUiAccessReadyContract } from "@dpeek/formless-presentation/contract";
import type { IdentityAccessManagementSummary } from "@dpeek/formless-identity-control-plane";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import { createApplicationRuntimePublicationCoordinator } from "../generated/application-runtime-contract-host.tsx";
import {
  createInitialAccessInvitationDraft,
  dispatchAccessIntent,
  projectAccess,
  resolveAccessIntent,
  type AccessIntentActions,
  type AccessInvitationDraft,
  type ProjectAccessOptions,
} from "./access-projection.ts";
import {
  createAccessRuntimePublicationController,
  prepareAccessRuntimePublication,
} from "./access-runtime.ts";
import {
  initialInstanceAccessRuntimeContribution,
  instanceAccessInvitationAuthoringReference,
  instanceAccessReference,
} from "./access-contract.ts";

describe("access projection", () => {
  it("projects loading, unauthorized, failed, and empty states with display-safe feedback", () => {
    expect(projectAccess(input({ state: { status: "loading" } })).manifest).toEqual({
      accessibilityLabel: "Access",
      id: "instance-access",
      kind: "accessManifest",
      message: "Loading access management...",
      state: "loading",
      title: "Access",
    });

    const unauthorized = projectAccess(
      input({
        state: {
          message: "Denied with owner-setup-token raw-owner-secret",
          status: "unauthorized",
        },
      }),
    ).manifest;
    expect(unauthorized).toMatchObject({
      feedback: {
        detail: "Denied with owner-setup-token [redacted]",
        title: "Access denied",
      },
      state: "unauthorized",
    });

    const failed = projectAccess(
      input({
        state: {
          message: 'Failed at /Users/ada/formless with IDENTITY_API_TOKEN="secret-token".',
          status: "failed",
        },
      }),
    ).manifest;
    expect(failed).toMatchObject({
      feedback: {
        detail: "Failed at <path> with IDENTITY_API_TOKEN=[redacted].",
        title: "Access unavailable",
      },
      state: "failed",
    });
    expect(JSON.stringify(failed)).not.toContain("secret-token");

    const empty = readyProjection({ summary: emptySummary() });
    expect(empty.manifest).toMatchObject({
      invitations: [],
      invitationsEmptyState: { title: "No invitations" },
      people: [],
      peopleEmptyState: { title: "No people" },
      state: "ready",
    });
    expect(required(empty.authoring).fields.targetAppInstall.options).toHaveLength(1);

    const withoutTargetScopes = required(
      readyProjection({
        draft: createInitialAccessInvitationDraft({ installs: [], summary: emptySummary() }),
        installs: [],
        summary: emptySummary(),
      }).authoring,
    );
    expect(withoutTargetScopes.fields.targetSurface.options).toMatchObject([
      { label: "Instance", selected: true, value: "instance" },
    ]);
  });

  it("projects owner people, roles, invitation counts, and resolved or unavailable labels", () => {
    const projection = readyProjection();
    const manifest = readyManifest(projection);

    expect(manifest.people).toHaveLength(2);
    expect(manifest.invitations).toHaveLength(2);
    expect(manifest.people[0]).toMatchObject({
      displayName: "Ada Owner",
      primaryEmail: "ada@example.com",
      roles: [
        {
          label: "Owner",
          scope: { value: "Instance" },
        },
        { label: "Editor", scope: { value: "Site" } },
      ],
      status: { value: "Active" },
    });
    expect(manifest.people[0]?.roles.map((role) => role.label)).toEqual(["Owner", "Editor"]);
    expect(manifest.invitations[0]).toMatchObject({
      inviter: { value: "Ada Owner" },
      revocation: { availability: "available" },
      scope: { value: "Site" },
      status: { intent: "warning", value: "Pending" },
      target: { value: "App install" },
      targetEmail: "lin@example.com",
    });
    expect(manifest.invitations[1]).toMatchObject({
      inviter: { value: "Unavailable person" },
      revocation: { availability: "unavailable" },
      scope: { value: "Unavailable organization" },
      status: { intent: "success", value: "Accepted" },
    });
    expect(
      manifest.people.flatMap((person) => person.roles).map((role) => role.scope?.value),
    ).not.toContain("install:site");
    expect(manifest.invitations.map((invitation) => invitation.scope?.value)).not.toContain(
      "organization:missing",
    );
  });

  it("projects applicable scope fields and separately sectioned role and membership grants", () => {
    const draft = validDraft();
    const projection = readyProjection({ draft, summary: populatedSummary({ owner: true }) });
    const authoring = required(projection.authoring);
    const [roles, memberships] = authoring.grantSelections;

    expect(authoring.fields.targetSurface.options).toMatchObject([
      { label: "Instance", selected: false, value: "instance" },
      { label: "App install", selected: true, value: "app-install" },
      { label: "Organization", selected: false, value: "organization" },
    ]);
    expect(authoring.fields.targetSurface.required).toBe(false);
    expect(authoring.fields.targetAppInstall).toMatchObject({
      options: [{ label: "Site", selected: true, value: "install:site" }],
      required: false,
    });
    expect(authoring.fields.targetAppInstall.disabledReason).toBeUndefined();
    expect(authoring.fields.targetOrganization).toMatchObject({
      disabledReason: "Choose Organization as the target surface.",
      options: [{ label: "Formless", value: "organization:formless" }],
      required: false,
    });
    expect(roles.groups.map(({ label }) => label)).toEqual(["Instance", "App install"]);
    expect(roles.groups.map(({ options }) => options.map(({ label }) => label))).toEqual([
      ["Owner", "Administrator"],
      ["Site editor"],
    ]);
    const organizationRoles = required(
      readyProjection({
        draft: { ...draft, targetSurface: "organization" },
        summary: populatedSummary({ owner: true }),
      }).authoring,
    ).grantSelections[0];
    const instanceRoles = required(
      readyProjection({
        draft: { ...draft, targetSurface: "instance" },
        summary: populatedSummary({ owner: true }),
      }).authoring,
    ).grantSelections[0];
    expect(organizationRoles.groups.map(({ label }) => label)).toEqual([
      "Instance",
      "Organization",
    ]);
    expect(instanceRoles.groups.map(({ label }) => label)).toEqual(["Instance"]);
    expect(memberships.groups.map(({ label }) => label)).toEqual(["Organizations", "Groups"]);
    expect(memberships.groups.map(({ options }) => options.map(({ label }) => label))).toEqual([
      ["Formless", "Unavailable organization"],
      ["Operations", "Unavailable group"],
    ]);
    expect(memberships.groups[0]?.options[1]).toMatchObject({
      disabledReason: "Unavailable organization.",
      label: "Unavailable organization",
    });
  });

  it("uses only the instance-admin grant choices without inferring owner authority", () => {
    const summary = populatedSummary({ owner: false });
    const projection = readyProjection({ summary });
    const manifest = readyManifest(projection);
    const authoring = required(projection.authoring);

    expect(summary.invitationGrantOptions.authority).toEqual({
      instanceAdmin: true,
      instanceOwner: false,
    });
    expect(manifest.invite.control.disabled).toBeUndefined();
    expect(
      authoring.grantSelections[0].groups.flatMap((group) =>
        group.options.map(({ label }) => label),
      ),
    ).toEqual(["Administrator", "Site editor"]);
    expect(JSON.stringify(authoring)).not.toContain("Owner grants");
  });

  it("projects field, scope, and unavailable-selection validation", () => {
    const draft: AccessInvitationDraft = {
      displayName: "",
      membershipOptionIds: ["instance-access:membership-option:group:group_3Amissing"],
      roleOptionIds: ["instance-access:role-option:app-install:app.editor"],
      targetAppInstallId: "install:missing",
      targetEmail: "not-an-email",
      targetOrganizationId: "organization:missing",
      targetSurface: "app-install",
    };
    const authoring = required(readyProjection({ draft }).authoring);

    expect(authoring.fields.displayName.errors).toEqual(["Name is required."]);
    expect(authoring.fields.targetEmail.errors).toEqual(["Email must be valid."]);
    expect(authoring.fields.targetAppInstall.errors).toEqual([
      "Choose an available app install scope.",
    ]);
    expect(authoring.grantSelections[0].errors).toEqual([
      "Choose an available app install scope for app roles.",
    ]);
    expect(authoring.grantSelections[1].errors).toEqual(["Unavailable group."]);
    expect(authoring.submit.control).toMatchObject({
      disabled: true,
      disabledReason: "Name is required.",
    });
    expect(authoring.errors).not.toContain("install:missing");
    expect(authoring.errors).not.toContain("group:missing");
  });

  it("projects pending deduplication and display-safe creation and revocation outcomes", () => {
    const pending = readyProjection({
      authoringOpen: true,
      revocation: { invitationId: "invitation:lin", status: "submitting" },
      submission: { status: "submitting" },
    });
    const pendingAuthoring = required(pending.authoring);
    const pendingManifest = readyManifest(pending);
    const pendingRevocation = pendingManifest.invitations[0]?.revocation;

    expect(pendingAuthoring.pending).toEqual({ isPending: true, label: "Sending invitation" });
    expect(pendingAuthoring.submit.control).toMatchObject({
      disabled: true,
      disabledReason: "Invitation creation is in progress.",
    });
    expect(pendingAuthoring.fields.targetEmail.disabledReason).toBe(
      "Invitation creation is in progress.",
    );
    expect(pendingAuthoring.grantSelections[0].disabledReason).toBe(
      "Invitation creation is in progress.",
    );
    expect(pendingRevocation?.availability).toBe("available");
    if (pendingRevocation?.availability !== "available") {
      throw new Error("Expected available revocation.");
    }
    expect(pendingRevocation.action.control).toMatchObject({
      disabled: true,
      disabledReason: "Invitation revocation is in progress.",
    });

    const creationSucceeded = readyManifest(
      readyProjection({
        authoringOpen: false,
        draft: initialDraft(),
        submission: { message: "Invitation created and delivered.", status: "succeeded" },
      }),
    );
    expect(creationSucceeded.feedback).toMatchObject({
      intent: "success",
      title: "Invitation created",
    });

    const creationFailed = required(
      readyProjection({
        submission: {
          message: "Failed with INVITE_TOKEN=private-invite-token",
          status: "failed",
        },
      }).authoring,
    );
    expect(creationFailed.feedback).toMatchObject({
      detail: "Failed with INVITE_TOKEN=[redacted]",
      title: "Invitation could not be created",
    });

    const revokeSucceeded = readyManifest(
      readyProjection({
        revocation: {
          invitationId: "invitation:lin",
          message: "Pending invitation revoked.",
          status: "succeeded",
        },
      }),
    );
    const revokeFailed = readyManifest(
      readyProjection({
        revocation: {
          invitationId: "invitation:lin",
          message: "Failed with raw token owner-setup-token private-owner-token",
          status: "failed",
        },
      }),
    );
    expect(revokeSucceeded.feedback).toMatchObject({
      intent: "success",
      title: "Invitation revoked",
    });
    expect(revokeFailed.feedback?.detail).toBe(
      "Failed with raw token owner-setup-token [redacted]",
    );
    expect(JSON.stringify(revokeFailed)).not.toContain("private-owner-token");
  });

  it("excludes raw identity records, requests, callbacks, and secret material from snapshots", () => {
    const summary = populatedSummary() as IdentityAccessManagementSummary & {
      adminBearer: string;
      credentialMaterial: string;
      rawInviteToken: string;
      tokenHash: string;
    };
    summary.adminBearer = "private-admin-bearer";
    summary.credentialMaterial = "private-credential";
    summary.rawInviteToken = "private-raw-token";
    summary.tokenHash = "private-token-hash";
    const projection = readyProjection({ summary });
    const serialized = JSON.stringify(
      prepareAccessRuntimePublication({ dispatch: () => undefined, projection }).nodes,
    );

    for (const excluded of [
      "adminBearer",
      "credentialMaterial",
      "private-admin-bearer",
      "private-credential",
      "private-raw-token",
      "private-token-hash",
      "rawInviteToken",
      "tokenHash",
    ]) {
      expect(serialized).not.toContain(excluded);
    }
    expect(serialized).not.toContain("invitationRequest");
    expect(serialized).not.toContain("callback");
  });
});

describe("access intent resolution", () => {
  it("resolves exact-current authoring, field, and grant intents and ignores stale identities", () => {
    const options = input({ authoringOpen: true, draft: validDraft() });
    const projection = projectAccess(options);
    const manifest = readyManifest(projection);
    const authoring = required(projection.authoring);
    const emailIntent = {
      ...authoring.fields.targetEmail.changeIntent,
      value: "new@example.com",
    } as const;
    const roleOption = authoring.grantSelections[0].groups[0]?.options[0];

    expect(resolveAccessIntent(options, projection, manifest.invite.intent)).toEqual({
      kind: "authoringOpenChange",
      open: true,
    });
    expect(resolveAccessIntent(options, projection, authoring.cancel.intent)).toEqual({
      kind: "authoringOpenChange",
      open: false,
    });
    expect(resolveAccessIntent(options, projection, emailIntent)).toEqual({
      draft: { ...options.draft, targetEmail: "new@example.com" },
      kind: "draftChange",
    });
    expect(required(roleOption).selected).toBe(false);
    expect(resolveAccessIntent(options, projection, required(roleOption).selectionIntent)).toEqual({
      draft: {
        ...options.draft,
        roleOptionIds: [required(roleOption).id],
      },
      kind: "draftChange",
    });
    expect(
      resolveAccessIntent(options, projection, {
        ...emailIntent,
        fieldId: "instance-access:field:stale",
      }),
    ).toEqual({ kind: "ignored" });
    expect(
      resolveAccessIntent(options, projection, {
        ...required(roleOption).selectionIntent,
        selected: false,
      }),
    ).toEqual({ kind: "ignored" });
  });

  it("constructs authorized invitation requests in runtime dispatch and deduplicates pending submit", async () => {
    const draft = selectedDraft();
    const options = input({ authoringOpen: true, draft });
    const projection = projectAccess(options);
    const authoring = required(projection.authoring);
    const calls: unknown[] = [];
    const actions = recordingActions(calls);

    const resolved = resolveAccessIntent(options, projection, authoring.submit.intent);
    expect(resolved).toMatchObject({
      kind: "invitationSubmit",
      request: {
        appRegistrations: [{ appInstallId: "install:site" }],
        invitedPrincipal: { displayName: "Lin Example" },
        memberships: [
          { targetKind: "organization", targetOrganization: "organization:formless" },
          { targetGroup: "group:operations", targetKind: "group" },
        ],
        roleAssignments: [
          { roleKey: "instance.admin", scopeKind: "instance" },
          {
            appInstallId: "install:site",
            roleKey: "app.editor",
            scopeKind: "app-install",
          },
        ],
        targetAppInstallId: "install:site",
        targetEmail: "lin@example.com",
        targetSurface: "app-install",
      },
    });
    await dispatchAccessIntent(options, projection, authoring.submit.intent, actions);
    expect(calls).toEqual([
      {
        kind: "submit",
        value: expect.objectContaining({
          idempotencyKey: "access-invitation:test",
          targetEmail: "lin@example.com",
        }),
      },
    ]);

    const pendingOptions = input({
      authoringOpen: true,
      draft,
      submission: { status: "submitting" },
    });
    const pendingProjection = projectAccess(pendingOptions);
    expect(resolveAccessIntent(pendingOptions, pendingProjection, authoring.submit.intent)).toEqual(
      { kind: "ignored" },
    );
  });

  it("requires exact destructive confirmation before resolving revocation", async () => {
    const options = input();
    const projection = projectAccess(options);
    const manifest = readyManifest(projection);
    const revocation = manifest.invitations[0]?.revocation;
    if (revocation?.availability !== "available") {
      throw new Error("Expected available revocation.");
    }

    expect(resolveAccessIntent(options, projection, revocation.action.intent)).toEqual({
      invitationId: "invitation:lin",
      kind: "revocationConfirmationChange",
    });
    expect(
      resolveAccessIntent(options, projection, {
        accessId: "instance-access",
        actionId: "instance-access:revoke",
        confirmationId: "instance-access:revocation-confirmation",
        controlId: "instance-access:revoke-control",
        invitationId: "invitation:lin",
        type: "accessInvitationRevoke",
      }),
    ).toEqual({ kind: "ignored" });

    const confirmedOptions = input({ confirmationInvitationId: "invitation:lin" });
    const confirmedProjection = projectAccess(confirmedOptions);
    const confirmation = required(readyManifest(confirmedProjection).confirmation);
    expect(
      resolveAccessIntent(confirmedOptions, confirmedProjection, confirmation.cancel.intent),
    ).toEqual({ invitationId: undefined, kind: "revocationConfirmationChange" });
    expect(
      resolveAccessIntent(confirmedOptions, confirmedProjection, confirmation.action.intent),
    ).toEqual({ invitationId: "invitation:lin", kind: "revokeInvitation" });

    const calls: unknown[] = [];
    await dispatchAccessIntent(
      confirmedOptions,
      confirmedProjection,
      confirmation.action.intent,
      recordingActions(calls),
    );
    expect(calls).toEqual([{ kind: "revoke", value: { invitationId: "invitation:lin" } }]);
  });

  it("propagates runtime creation failure without publishing private effect state", async () => {
    const options = input({ authoringOpen: true, draft: validDraft() });
    const projection = projectAccess(options);
    const authoring = required(projection.authoring);
    const actions = recordingActions([], new Error("runtime-private-delivery-failed"));

    await expect(
      dispatchAccessIntent(options, projection, authoring.submit.intent, actions),
    ).rejects.toThrow("runtime-private-delivery-failed");
    expect(
      JSON.stringify(prepareAccessRuntimePublication({ dispatch: () => undefined, projection })),
    ).not.toContain("runtime-private-delivery-failed");
  });
});

describe("access runtime publication controller", () => {
  it("publishes the complete graph atomically, reuses semantic identity, and removes it on dispose", () => {
    const application = createApplicationRuntimePublicationCoordinator([
      initialInstanceAccessRuntimeContribution,
    ]);
    const controller = createAccessRuntimePublicationController(application);
    const options = input({ authoringOpen: true, draft: validDraft() });
    const calls: string[] = [];
    application.host.subscribe(instanceAccessReference, () => calls.push("manifest"));
    application.host.subscribe(instanceAccessInvitationAuthoringReference, () =>
      calls.push("authoring"),
    );

    controller.updateRuntime(options, recordingActions([]));
    const firstManifest = application.host.read(instanceAccessReference);
    const firstAuthoring = application.host.read(instanceAccessInvitationAuthoringReference);
    expect(firstManifest?.state).toBe("ready");
    expect(firstAuthoring?.open).toBe(true);
    expect(calls).toEqual(["manifest", "authoring"]);

    controller.updateRuntime(options, recordingActions([]));
    expect(application.host.read(instanceAccessReference)).toBe(firstManifest);
    expect(application.host.read(instanceAccessInvitationAuthoringReference)).toBe(firstAuthoring);
    expect(calls).toEqual(["manifest", "authoring"]);

    controller.updateRuntime({ ...options, authoringOpen: false }, recordingActions([]));
    expect(application.host.read(instanceAccessReference)).toBe(firstManifest);
    expect(application.host.read(instanceAccessInvitationAuthoringReference)?.open).toBe(false);
    expect(calls).toEqual(["manifest", "authoring", "authoring"]);

    controller.dispose();
    expect(application.host.read(instanceAccessReference)).toBeUndefined();
    expect(application.host.read(instanceAccessInvitationAuthoringReference)).toBeUndefined();
    expect(calls).toEqual(["manifest", "authoring", "authoring", "manifest", "authoring"]);
  });

  it("dispatches against the latest projection and pending state", async () => {
    const application = createApplicationRuntimePublicationCoordinator();
    const controller = createAccessRuntimePublicationController(application);
    const calls: unknown[] = [];
    const readyOptions = input({ authoringOpen: true, draft: validDraft() });
    controller.updateRuntime(readyOptions, recordingActions(calls));
    const authoring = required(application.host.read(instanceAccessInvitationAuthoringReference));
    const staleSubmit = authoring.submit.intent;
    const staleEmailIntent = {
      ...authoring.fields.targetEmail.changeIntent,
      value: "current@example.com",
    } as const;

    await application.host.dispatch(staleEmailIntent);
    expect(calls).toEqual([
      {
        kind: "draft",
        value: { ...readyOptions.draft, targetEmail: "current@example.com" },
      },
    ]);

    controller.updateRuntime(
      { ...readyOptions, submission: { status: "submitting" } },
      recordingActions(calls),
    );
    await application.host.dispatch(staleSubmit);
    expect(calls).toHaveLength(1);
  });

  it("routes only exact access intents to one current handler", async () => {
    const application = createApplicationRuntimePublicationCoordinator();
    const controller = createAccessRuntimePublicationController(application);
    const calls: unknown[] = [];
    controller.updateRuntime(input(), recordingActions(calls));
    const manifest = application.host.read(instanceAccessReference);
    if (manifest?.state !== "ready") {
      throw new Error("Expected ready access manifest.");
    }

    await application.host.dispatch(manifest.invite.intent);
    expect(calls).toEqual([{ kind: "open", value: true }]);
    expect(() =>
      application.host.dispatch({
        destinationId: "other",
        recordId: "record:other",
        sectionId: "section:other",
        shellId: "shell:other",
        type: "shellRootRecordSelection",
      }),
    ).toThrow("no current handler");
  });
});

function input({
  authoringOpen = false,
  confirmationInvitationId,
  draft = validDraft(),
  installs = [siteInstall()],
  revocation = { status: "idle" },
  state,
  submission = { status: "idle" },
  summary = populatedSummary(),
}: Partial<ProjectAccessOptions> & {
  summary?: IdentityAccessManagementSummary;
} = {}): ProjectAccessOptions {
  return {
    authoringOpen,
    ...(confirmationInvitationId === undefined ? {} : { confirmationInvitationId }),
    draft,
    installs,
    revocation,
    state: state ?? { status: "ready", summary },
    submission,
  };
}

function readyProjection({
  summary = populatedSummary(),
  ...overrides
}: Partial<ProjectAccessOptions> & {
  summary?: IdentityAccessManagementSummary;
} = {}) {
  return projectAccess(input({ ...overrides, summary }));
}

function initialDraft(): AccessInvitationDraft {
  return createInitialAccessInvitationDraft({
    installs: [siteInstall()],
    summary: populatedSummary(),
  });
}

function validDraft(): AccessInvitationDraft {
  return {
    displayName: "Lin Example",
    membershipOptionIds: [],
    roleOptionIds: [],
    targetAppInstallId: "install:site",
    targetEmail: "lin@example.com",
    targetOrganizationId: "organization:formless",
    targetSurface: "app-install",
  };
}

function selectedDraft(): AccessInvitationDraft {
  return {
    ...validDraft(),
    membershipOptionIds: [
      "instance-access:membership-option:organization:organization_3Aformless",
      "instance-access:membership-option:group:group_3Aoperations",
    ],
    roleOptionIds: [
      "instance-access:role-option:instance:instance.admin",
      "instance-access:role-option:app-install:app.editor",
    ],
  };
}

function emptySummary(): IdentityAccessManagementSummary {
  return {
    appRegistrations: [],
    groups: [],
    invitationGrantOptions: {
      authority: { instanceAdmin: true, instanceOwner: false },
      memberships: [],
      roles: [],
    },
    invitations: [],
    memberships: [],
    organizations: [],
    people: [],
    roles: [],
  };
}

function populatedSummary({
  owner = true,
}: { owner?: boolean } = {}): IdentityAccessManagementSummary {
  return {
    appRegistrations: [
      {
        appInstallId: "install:site",
        appRegistrationId: "registration:ada-site",
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "active",
        targetKind: "principal",
        targetPrincipalId: "principal:ada",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    groups: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayName: "Operations",
        groupId: "group:operations",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    invitationGrantOptions: {
      authority: { instanceAdmin: !owner, instanceOwner: owner },
      memberships: [
        {
          displayLabel: "Formless membership",
          targetKind: "organization",
          targetOrganizationId: "organization:formless",
        },
        {
          displayLabel: "Missing organization membership",
          targetKind: "organization",
          targetOrganizationId: "organization:missing",
        },
        {
          displayLabel: "Operations membership",
          targetGroupId: "group:operations",
          targetKind: "group",
        },
        {
          displayLabel: "Missing group membership",
          targetGroupId: "group:missing",
          targetKind: "group",
        },
      ],
      roles: [
        ...(owner
          ? [
              {
                displayLabel: "Owner",
                roleKey: "instance.owner" as const,
                scopeKind: "instance" as const,
              },
            ]
          : []),
        {
          displayLabel: "Administrator",
          roleKey: "instance.admin" as const,
          scopeKind: "instance" as const,
        },
        {
          displayLabel: "Site editor",
          roleKey: "app.editor" as const,
          scopeKind: "app-install" as const,
        },
        {
          displayLabel: "Organization administrator",
          roleKey: "app.admin" as const,
          scopeKind: "organization" as const,
        },
      ],
    },
    invitations: [
      {
        createdAt: "2026-07-16T00:00:00.000Z",
        expiresAt: "2026-07-24T00:00:00.000Z",
        invitationId: "invitation:lin",
        inviterPrincipalId: "principal:ada",
        status: "pending",
        targetAppInstallId: "install:site",
        targetEmail: "lin@example.com",
        targetSurface: "app-install",
        updatedAt: "2026-07-16T00:00:00.000Z",
      },
      {
        acceptedAt: "2026-07-16T05:00:00.000Z",
        createdAt: "2026-07-15T00:00:00.000Z",
        expiresAt: "2026-07-22T00:00:00.000Z",
        invitationId: "invitation:sam",
        inviterPrincipalId: "principal:missing",
        status: "accepted",
        targetEmail: "sam@example.com",
        targetOrganizationId: "organization:missing",
        targetSurface: "organization",
        updatedAt: "2026-07-16T05:00:00.000Z",
      },
    ],
    memberships: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        membershipId: "membership:ada-formless",
        principalId: "principal:ada",
        status: "active",
        targetKind: "organization",
        targetOrganizationId: "organization:formless",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    organizations: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayName: "Formless",
        organizationId: "organization:formless",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    people: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayName: "Ada Owner",
        kind: "human",
        primaryEmail: {
          displayEmail: "ada@example.com",
          normalizedEmail: "ada@example.com",
          principalEmailId: "email:ada",
          verificationStatus: "verified",
          verifiedAt: "2026-01-01T00:00:00.000Z",
        },
        principalId: "principal:ada",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        createdAt: "2026-01-02T00:00:00.000Z",
        displayName: "Bo Admin",
        kind: "human",
        primaryEmail: {
          displayEmail: "bo@example.com",
          normalizedEmail: "bo@example.com",
          principalEmailId: "email:bo",
          verificationStatus: "verified",
        },
        principalId: "principal:bo",
        status: "invited",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    roles: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayLabel: "Owner",
        roleAssignmentId: "role-assignment:ada-owner",
        roleId: "role:owner",
        roleKey: "instance.owner",
        scopeKind: "instance",
        status: "active",
        targetKind: "principal",
        targetPrincipalId: "principal:ada",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        appInstallId: "install:site",
        createdAt: "2026-01-01T00:00:00.000Z",
        displayLabel: "Site editor",
        roleAssignmentId: "role-assignment:ada-site-editor",
        roleId: "role:app-editor",
        roleKey: "app.editor",
        scopeKind: "app-install",
        status: "active",
        targetKind: "principal",
        targetPrincipalId: "principal:ada",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayLabel: "Administrator",
        roleAssignmentId: "role-assignment:ada-disabled-admin",
        roleId: "role:instance-admin",
        roleKey: "instance.admin",
        scopeKind: "instance",
        status: "disabled",
        targetKind: "principal",
        targetPrincipalId: "principal:ada",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function siteInstall(): AppInstall {
  return {
    adminRoute: "/apps/install:site",
    createdAt: "2026-01-01T00:00:00.000Z",
    installId: "install:site",
    label: "Site",
    packageAppKey: "site",
    packageRevision: 1,
    registrationPolicy: "closed",
    sourceSchemaHash: `sha256:${"a".repeat(64)}`,
    status: "installed",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function recordingActions(calls: unknown[], submitError?: Error): AccessIntentActions {
  return {
    changeAuthoringOpen: (open) => calls.push({ kind: "open", value: open }),
    changeDraft: (draft) => calls.push({ kind: "draft", value: draft }),
    changeRevocationConfirmation: (invitationId) =>
      calls.push({ kind: "confirmation", value: invitationId }),
    createIdempotencyKey: () => "access-invitation:test",
    revokeInvitation: (value) => {
      calls.push({ kind: "revoke", value });
    },
    submitInvitation: (value) => {
      if (submitError) {
        throw submitError;
      }
      calls.push({ kind: "submit", value });
    },
  };
}

function readyManifest(
  projection: ReturnType<typeof projectAccess>,
): FormlessUiAccessReadyContract {
  if (projection.manifest.state !== "ready") {
    throw new Error("Expected ready access projection.");
  }
  return projection.manifest;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
