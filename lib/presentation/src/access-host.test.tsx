import { describe, expect, it } from "vite-plus/test";
import type {
  AccessActionContract,
  AccessConfirmationContract,
  AccessControlledFieldContract,
  AccessDisplayFactContract,
  AccessInvitationAuthoringContract,
  AccessInvitationAuthoringOpenChangeIntent,
  AccessInvitationRevocationConfirmationOpenChangeIntent,
  AccessInvitationRevokeIntent,
  AccessInvitationSubmitIntent,
  AccessManifestContract,
  AccessReadyContract,
  ButtonContract,
} from "./contract.ts";
import {
  createMemoryPresentationHost,
  accessInvitationAuthoringReference,
  accessManifestReference,
  shellManifestReference,
  type AccessInvitationAuthoringNode,
  type AccessManifestNode,
  type PresentationNodeSet,
  type ShellManifestNode,
} from "./host.ts";

const accessReference = accessManifestReference("access:instance");
const authoringReference = accessInvitationAuthoringReference(
  accessReference.accessId,
  "access:instance:invitation-authoring",
);
const shellReference = shellManifestReference("shell:instance");

describe("access memory Presentation Host", () => {
  it("reads every access state and complete invitation authoring beside landed references", () => {
    const host = createMemoryPresentationHost({ nodes: [loadingAccessNode(), shellNode()] });
    const loading: AccessManifestContract | undefined = host.read({
      ...accessReference,
    });

    expect(loading).toMatchObject({ message: "Loading access...", state: "loading" });

    host.publish([unauthorizedAccessNode(), shellNode()]);
    expect(host.read(accessReference)).toMatchObject({
      feedback: { intent: "danger" },
      state: "unauthorized",
    });

    host.publish([failedAccessNode(), shellNode()]);
    expect(host.read(accessReference)).toMatchObject({
      feedback: { title: "Access unavailable" },
      state: "failed",
    });

    host.publish(readyAccessNodes());
    const ready: AccessManifestContract | undefined = host.read(accessReference);
    const authoring: AccessInvitationAuthoringContract | undefined = host.read(authoringReference);

    expect(ready).toMatchObject({
      invitations: [{ targetEmail: "alex@example.com" }],
      people: [{ displayName: "Alex Example" }],
      state: "ready",
    });
    expect(authoring).toMatchObject({
      fields: {
        displayName: { value: "Taylor Example" },
        targetAppInstall: { options: [{ label: "Site" }] },
        targetEmail: { value: "taylor@example.com" },
        targetOrganization: { options: [{ label: "Formless" }] },
        targetSurface: { value: "instance" },
      },
      grantSelections: [
        { purpose: "roles", selectedOptionIds: ["role:instance-admin"] },
        { purpose: "memberships", selectedOptionIds: ["membership:organization"] },
      ],
      open: false,
    });
    expect(host.read(shellReference)?.title).toBe("Formless");
  });

  it("validates access references, controlled identities, selections, and embedded intents", () => {
    expect(() => createMemoryPresentationHost({ nodes: [readyAccessManifestNode()] })).toThrow(
      "has no snapshot",
    );

    const authoring = invitationAuthoringNode();
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...authoring,
            snapshot: {
              ...authoring.snapshot,
              fields: {
                ...authoring.snapshot.fields,
                targetEmail: {
                  ...authoring.snapshot.fields.targetEmail,
                  changeIntent: {
                    ...authoring.snapshot.fields.targetEmail.changeIntent,
                    authoringId: "authoring:other",
                  },
                },
              },
            },
          },
        ],
      }),
    ).toThrow("invalid field contract");

    const roleSelection = authoring.snapshot.grantSelections[0];
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...authoring,
            snapshot: {
              ...authoring.snapshot,
              grantSelections: [
                { ...roleSelection, selectedOptionIds: [] },
                authoring.snapshot.grantSelections[1],
              ],
            },
          },
        ],
      }),
    ).toThrow("inconsistent grant selection");

    const manifest = readyAccessManifestNode();
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...manifest,
            snapshot: {
              ...manifest.snapshot,
              invite: {
                ...manifest.snapshot.invite,
                intent: { ...manifest.snapshot.invite.intent, accessId: "access:other" },
              },
            },
          },
          authoring,
        ],
      }),
    ).toThrow("invalid identity");
  });
});

function readyAccessNodes({ authoringOpen = false }: { authoringOpen?: boolean } = {}) {
  return [
    readyAccessManifestNode(),
    invitationAuthoringNode({ open: authoringOpen }),
    shellNode(),
  ] satisfies PresentationNodeSet;
}

function readyAccessManifestNode(): AccessManifestNode & {
  snapshot: AccessReadyContract;
} {
  const inviteControl = button("control:invite", "Invite collaborator", "primary");
  const invite = {
    control: inviteControl,
    id: "action:invite",
    intent: {
      accessId: accessReference.accessId,
      actionId: "action:invite",
      authoringId: authoringReference.authoringId,
      controlId: inviteControl.id,
      open: true,
      type: "accessInvitationAuthoringOpenChange",
    },
    kind: "accessAction",
    purpose: "authoring-open",
  } satisfies AccessActionContract<AccessInvitationAuthoringOpenChangeIntent>;
  const revokeControl = button("control:revoke-open", "Revoke", "secondary");
  const revoke = {
    control: revokeControl,
    id: "action:revoke-open",
    intent: {
      accessId: accessReference.accessId,
      actionId: "action:revoke-open",
      confirmationId: "confirmation:revoke",
      controlId: revokeControl.id,
      invitationId: "invitation:alex",
      open: true,
      type: "accessInvitationRevocationConfirmationOpenChange",
    },
    kind: "accessAction",
    purpose: "revocation-open",
  } satisfies AccessActionContract<AccessInvitationRevocationConfirmationOpenChangeIntent>;

  return {
    reference: accessReference,
    snapshot: {
      accessibilityLabel: "Access",
      authoring: authoringReference,
      confirmation: revocationConfirmation(),
      id: accessReference.accessId,
      invitations: [
        {
          expiresAt: fact(
            "invitation:alex:expires",
            "Expires",
            "2030-01-01T00:00:00Z",
            "timestamp",
          ),
          id: "invitation:alex",
          inviter: fact("invitation:alex:inviter", "Invited by", "Instance owner"),
          kind: "accessInvitation",
          revocation: { action: revoke, availability: "available" },
          scope: fact("invitation:alex:scope", "Scope", "Instance"),
          status: fact("invitation:alex:status", "Status", "Pending", "status", "warning"),
          target: fact("invitation:alex:target", "Target", "Instance"),
          targetEmail: "alex@example.com",
        },
      ],
      invite,
      kind: "accessManifest",
      people: [
        {
          displayName: "Alex Example",
          id: "person:alex",
          kind: "accessPerson",
          primaryEmail: "alex@example.com",
          roles: [
            {
              id: "role:owner",
              kind: "accessRole",
              label: "Owner",
              scope: fact("role:owner:scope", "Scope", "Instance"),
            },
          ],
          status: fact("person:alex:status", "Status", "Active", "status", "success"),
        },
      ],
      state: "ready",
      title: "Access",
    },
  };
}

function invitationAuthoringNode({
  open = false,
}: { open?: boolean } = {}): AccessInvitationAuthoringNode {
  const cancelControl = button("control:authoring-cancel", "Cancel");
  const submitControl = button("control:authoring-submit", "Send invite", "primary", "submit");
  const roleControlId = "control:role-grants";
  const membershipControlId = "control:membership-grants";

  return {
    reference: authoringReference,
    snapshot: {
      accessId: accessReference.accessId,
      cancel: {
        control: cancelControl,
        id: "action:authoring-cancel",
        intent: {
          accessId: accessReference.accessId,
          actionId: "action:authoring-cancel",
          authoringId: authoringReference.authoringId,
          controlId: cancelControl.id,
          open: false,
          type: "accessInvitationAuthoringOpenChange",
        },
        kind: "accessAction",
        purpose: "authoring-cancel",
      },
      description: "Invite a collaborator and choose their access.",
      errors: [],
      fields: {
        displayName: field("field:display-name", "Name", "display-name", "text", "Taylor Example"),
        targetAppInstall: field(
          "field:target-app-install",
          "Scope",
          "target-app-install",
          "select",
          "site",
          [{ id: "app:site", label: "Site", selected: true, value: "site" }],
        ),
        targetEmail: field(
          "field:target-email",
          "Email",
          "target-email",
          "email",
          "taylor@example.com",
        ),
        targetOrganization: field(
          "field:target-organization",
          "Scope",
          "target-organization",
          "select",
          "organization:formless",
          [
            {
              id: "organization:formless",
              label: "Formless",
              selected: true,
              value: "organization:formless",
            },
          ],
        ),
        targetSurface: field(
          "field:target-surface",
          "Surface",
          "target-surface",
          "select",
          "instance",
          [
            { id: "surface:instance", label: "Instance", selected: true, value: "instance" },
            { id: "surface:app", label: "App install", selected: false, value: "app-install" },
            {
              id: "surface:organization",
              label: "Organization",
              selected: false,
              value: "organization",
            },
          ],
        ),
      },
      grantSelections: [
        {
          errors: [],
          groups: [
            {
              id: "role-group:instance",
              kind: "accessGrantOptionGroup",
              label: "Instance",
              options: [
                {
                  id: "role:instance-admin",
                  label: "Administrator",
                  selected: true,
                  selectionIntent: {
                    accessId: accessReference.accessId,
                    authoringId: authoringReference.authoringId,
                    controlId: roleControlId,
                    groupId: "role-group:instance",
                    optionId: "role:instance-admin",
                    selected: false,
                    type: "accessInvitationGrantSelection",
                  },
                },
              ],
            },
            {
              id: "role-group:app",
              kind: "accessGrantOptionGroup",
              label: "App install",
              options: [
                {
                  disabledReason: "Choose an app install target.",
                  id: "role:app-editor",
                  label: "Editor · Site",
                  selected: false,
                  selectionIntent: {
                    accessId: accessReference.accessId,
                    authoringId: authoringReference.authoringId,
                    controlId: roleControlId,
                    groupId: "role-group:app",
                    optionId: "role:app-editor",
                    selected: true,
                    type: "accessInvitationGrantSelection",
                  },
                },
              ],
            },
          ],
          id: roleControlId,
          kind: "accessGrantSelection",
          label: "Roles",
          purpose: "roles",
          selectedOptionIds: ["role:instance-admin"],
        },
        {
          errors: [],
          groups: [
            {
              id: "membership-group:organizations",
              kind: "accessGrantOptionGroup",
              label: "Organizations",
              options: [
                {
                  id: "membership:organization",
                  label: "Formless",
                  selected: true,
                  selectionIntent: {
                    accessId: accessReference.accessId,
                    authoringId: authoringReference.authoringId,
                    controlId: membershipControlId,
                    groupId: "membership-group:organizations",
                    optionId: "membership:organization",
                    selected: false,
                    type: "accessInvitationGrantSelection",
                  },
                },
              ],
            },
          ],
          id: membershipControlId,
          kind: "accessGrantSelection",
          label: "Memberships",
          purpose: "memberships",
          selectedOptionIds: ["membership:organization"],
        },
      ],
      id: authoringReference.authoringId,
      kind: "accessInvitationAuthoring",
      open,
      submit: {
        control: submitControl,
        id: "action:authoring-submit",
        intent: {
          accessId: accessReference.accessId,
          actionId: "action:authoring-submit",
          authoringId: authoringReference.authoringId,
          controlId: submitControl.id,
          type: "accessInvitationSubmit",
        },
        kind: "accessAction",
        purpose: "invitation-submit",
      } satisfies AccessActionContract<AccessInvitationSubmitIntent>,
      title: "Invite collaborator",
    },
  };
}

function revocationConfirmation(): AccessConfirmationContract {
  const cancelControl = button("control:revoke-cancel", "Cancel");
  const actionControl = button("control:revoke-confirm", "Revoke invitation", "primary");

  return {
    action: {
      control: actionControl,
      id: "action:revoke-confirm",
      intent: {
        accessId: accessReference.accessId,
        actionId: "action:revoke-confirm",
        confirmationId: "confirmation:revoke",
        controlId: actionControl.id,
        invitationId: "invitation:alex",
        type: "accessInvitationRevoke",
      },
      kind: "accessAction",
      purpose: "invitation-revoke",
    } satisfies AccessActionContract<AccessInvitationRevokeIntent>,
    cancel: {
      control: cancelControl,
      id: "action:revoke-cancel",
      intent: {
        accessId: accessReference.accessId,
        actionId: "action:revoke-cancel",
        confirmationId: "confirmation:revoke",
        controlId: cancelControl.id,
        invitationId: "invitation:alex",
        open: false,
        type: "accessInvitationRevocationConfirmationOpenChange",
      },
      kind: "accessAction",
      purpose: "revocation-cancel",
    },
    description: "The invitation will no longer be usable.",
    id: "confirmation:revoke",
    invitationId: "invitation:alex",
    kind: "accessConfirmation",
    open: true,
    title: "Revoke invitation?",
  };
}

function field(
  id: string,
  label: string,
  purpose: AccessControlledFieldContract["purpose"],
  inputKind: AccessControlledFieldContract["inputKind"],
  value: string,
  options?: AccessControlledFieldContract["options"],
): AccessControlledFieldContract {
  return {
    changeIntent: {
      accessId: accessReference.accessId,
      authoringId: authoringReference.authoringId,
      fieldId: id,
      type: "accessInvitationFieldChange",
    },
    errors: [],
    id,
    inputKind,
    kind: "accessControlledField",
    label,
    ...(options === undefined ? {} : { options }),
    purpose,
    required: true,
    value,
  };
}

function fact(
  id: string,
  label: string,
  value: string,
  presentation: AccessDisplayFactContract["presentation"] = "text",
  intent?: AccessDisplayFactContract["intent"],
): AccessDisplayFactContract {
  return {
    id,
    ...(intent === undefined ? {} : { intent }),
    kind: "accessDisplayFact",
    label,
    presentation,
    value,
  };
}

function loadingAccessNode(): AccessManifestNode {
  return {
    reference: accessReference,
    snapshot: {
      accessibilityLabel: "Access",
      id: accessReference.accessId,
      kind: "accessManifest",
      message: "Loading access...",
      state: "loading",
      title: "Access",
    },
  };
}

function unauthorizedAccessNode(): AccessManifestNode {
  return {
    reference: accessReference,
    snapshot: {
      accessibilityLabel: "Access",
      feedback: {
        detail: "Owner or administrator access is required.",
        id: "feedback:unauthorized",
        intent: "danger",
        kind: "accessFeedback",
        title: "Access denied",
      },
      id: accessReference.accessId,
      kind: "accessManifest",
      state: "unauthorized",
      title: "Access",
    },
  };
}

function failedAccessNode(): AccessManifestNode {
  return {
    reference: accessReference,
    snapshot: {
      accessibilityLabel: "Access",
      feedback: {
        detail: "Try again.",
        id: "feedback:failed",
        intent: "danger",
        kind: "accessFeedback",
        title: "Access unavailable",
      },
      id: accessReference.accessId,
      kind: "accessManifest",
      state: "failed",
      title: "Access",
    },
  };
}

function shellNode(): ShellManifestNode {
  return {
    reference: shellReference,
    snapshot: {
      accessibilityLabel: "Formless application shell",
      activeDestination: null,
      id: shellReference.shellId,
      kind: "shellManifest",
      navigationSections: [],
      scope: "multiApp",
      title: "Formless",
    },
  };
}

function button(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"] = "secondary",
  type: ButtonContract["type"] = "button",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}
