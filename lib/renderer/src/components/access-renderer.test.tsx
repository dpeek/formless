// @vitest-environment jsdom

import { fireEvent, render, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  AccessActionContract,
  AccessConfirmationContract,
  AccessControlledFieldContract,
  AccessDisplayFactContract,
  AccessFeedbackContract,
  AccessGrantOptionGroupContract,
  AccessGrantSelectionContract,
  AccessIntent,
  AccessInvitationAuthoringContract,
  AccessInvitationContract,
  AccessManifestContract,
  AccessPersonContract,
  AccessReadyContract,
  ButtonContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  accessInvitationAuthoringReference,
  accessManifestReference,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import {
  AstryxAccessInvitationAuthoring,
  AstryxAccessInvitationAuthoringContent,
  AstryxAccessRenderer,
  AstryxSubscribedAccessRenderer,
  astryxAccessFeedbackToastOptions,
} from "./access-renderer.tsx";

vi.mock("@astryxdesign/core/Toast", () => ({
  useToast: () => () => undefined,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const accessReference = accessManifestReference("access:test");
const authoringReference = accessInvitationAuthoringReference(
  accessReference.accessId,
  "access:test:authoring",
);

describe("Astryx access renderer", () => {
  it("renders loading, unauthorized, failed, empty, populated, feedback, and confirmation states", () => {
    const loadingHtml = renderAccess(manifestState("loading"));
    const unauthorizedHtml = renderAccess(manifestState("unauthorized"));
    const failedHtml = renderAccess(manifestState("failed"));
    const emptyHtml = renderAccess(readyManifest({ empty: true }));
    const populatedHtml = renderAccess(
      readyManifest({
        confirmation: revocationConfirmation(),
        feedback: accessFeedback("success"),
      }),
      invitationAuthoring(),
    );

    expect(loadingHtml).toContain('data-formless-astryx-access-state="loading"');
    expect(loadingHtml).toContain('role="status"');
    expect(loadingHtml).toContain("Loading access summary");
    expect(unauthorizedHtml).toContain('data-formless-astryx-access-state="unauthorized"');
    expect(unauthorizedHtml).toContain("Access unavailable");
    expect(failedHtml).toContain('data-formless-astryx-access-state="failed"');
    expect(failedHtml).toContain('role="alert"');
    expect(failedHtml).toContain("Access failed");
    expect(emptyHtml).toContain('data-formless-astryx-access-empty="access:test:people:empty"');
    expect(emptyHtml).toContain(
      'data-formless-astryx-access-empty="access:test:invitations:empty"',
    );
    expect(emptyHtml).toContain("No people");
    expect(emptyHtml).toContain("No invitations");
    expect(populatedHtml.match(/<table/g)).toHaveLength(2);
    expect(populatedHtml.match(/<thead/g)).toHaveLength(2);
    expect(populatedHtml.match(/<tbody/g)).toHaveLength(2);
    expect(populatedHtml).toContain("People");
    expect(populatedHtml).toContain("Invitations");
    expect(populatedHtml).toContain("Ada Lovelace");
    expect(populatedHtml).toContain("ada@example.com");
    expect(populatedHtml).toContain("Owner");
    expect(populatedHtml).toContain("pending@example.com");
    expect(populatedHtml).toContain('data-formless-astryx-access-fact="person:ada:status"');
    expect(populatedHtml).toContain(
      'data-formless-astryx-access-fact="invitation:pending:expires"',
    );
    expect(populatedHtml).not.toContain("Invitation created");
    expect(populatedHtml).toContain('role="alertdialog"');
    expect(populatedHtml).toContain("Revoke invitation?");
    expect(populatedHtml).toContain("Revoke invitation");
    expect(populatedHtml).not.toContain("raw-invitation-token");
    expect(populatedHtml).not.toContain("owner-secret");
  });

  it("maps invitation results to operation-style toast behavior", () => {
    expect(astryxAccessFeedbackToastOptions(accessFeedback("success"))).toMatchObject({
      autoHideDuration: 5_000,
      body: "Invitation created",
      isAutoHide: true,
      type: "info",
    });
    expect(astryxAccessFeedbackToastOptions(accessFeedback("danger"))).toMatchObject({
      body: "Invitation failed",
      isAutoHide: false,
      type: "error",
    });
  });

  it("composes an accessible controlled form dialog with separate sectioned grant selectors", async () => {
    const emailError = "Email must be valid.";
    const roleError = "Choose at least one available role.";
    const authoringBase = invitationAuthoring({
      errors: [emailError, roleError, "Review the invitation."],
      feedback: accessFeedback("danger"),
      pending: { isPending: true, label: "Sending invitation" },
    });
    const authoring: AccessInvitationAuthoringContract = {
      ...authoringBase,
      fields: {
        ...authoringBase.fields,
        targetEmail: { ...authoringBase.fields.targetEmail, errors: [emailError] },
      },
      grantSelections: [
        { ...authoringBase.grantSelections[0], errors: [roleError] },
        authoringBase.grantSelections[1],
      ],
    };
    const { container, unmount } = render(
      <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={() => undefined} />,
    );
    const queries = within(container);
    const dialog = queries.getByRole("dialog", { name: "Invite person" });
    const emailField = queries.getByRole<HTMLInputElement>("textbox", { name: /^Email/ });
    const nameField = queries.getByRole<HTMLInputElement>("textbox", { name: /^Name/ });
    const surfaceSelector = queries.getByRole("combobox", { name: /^Surface/ });
    const scopeSelector = queries.getByRole("combobox", { name: /^Scope/ });
    const roleSelector = queries.getByRole("combobox", { name: /^Roles/ });
    const membershipSelector = queries.getByRole("combobox", { name: /^Memberships/ });

    expect(dialog).toHaveProperty("open", true);
    expect([emailField.value, nameField.value]).toEqual(["invitee@example.com", "Grace Hopper"]);
    expect(emailField.getAttribute("aria-invalid")).toBe("true");
    expect(queries.getAllByRole("alert").map((alert) => alert.textContent)).toContain(emailError);
    expect(surfaceSelector.textContent).toContain("Organization");
    expect(scopeSelector.textContent).toContain("Analytical Engine");
    expect(roleSelector.textContent).toContain("Instance role 1");
    expect(roleSelector.getAttribute("aria-invalid")).toBe("true");
    expect(membershipSelector.getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).toContain(
      "Instance role 6: Instance administrators cannot be invited.",
    );
    expect(container.textContent).toContain("Membership grants are unavailable while sending.");

    const html = renderToStaticMarkup(
      <AstryxAccessInvitationAuthoringContent authoring={authoring} onIntent={() => undefined} />,
    );
    expect(html).toContain('data-formless-astryx-access-authoring="access:test:authoring"');
    expect(html).toContain('data-formless-astryx-access-grants="roles"');
    expect(html).toContain('data-formless-astryx-access-grants="memberships"');
    expect(html).toContain("Review the invitation.");
    expect(html).not.toContain("Invitation failed");
    expect(html).toContain("Sending invitation");

    const appInstallHtml = renderToStaticMarkup(
      <AstryxAccessInvitationAuthoringContent
        authoring={{
          ...authoring,
          fields: {
            ...authoring.fields,
            targetSurface: { ...authoring.fields.targetSurface, value: "app-install" },
          },
        }}
        onIntent={() => undefined}
      />,
    );
    expect(appInstallHtml).toContain(
      'data-formless-astryx-access-field="field:target-app-install"',
    );
    expect(appInstallHtml).not.toContain(
      'data-formless-astryx-access-field="field:target-organization"',
    );

    const instanceHtml = renderToStaticMarkup(
      <AstryxAccessInvitationAuthoringContent
        authoring={{
          ...authoring,
          fields: {
            ...authoring.fields,
            targetSurface: { ...authoring.fields.targetSurface, value: "instance" },
          },
        }}
        onIntent={() => undefined}
      />,
    );
    expect(instanceHtml).not.toContain(
      'data-formless-astryx-access-field="field:target-app-install"',
    );
    expect(instanceHtml).not.toContain(
      'data-formless-astryx-access-field="field:target-organization"',
    );

    unmount();
  });

  it("dispatches exact field, selection, dialog, submit, confirmation, and revoke intents", async () => {
    const authoring = invitationAuthoring();
    const confirmation = revocationConfirmation();
    const manifest = readyManifest({ confirmation });
    const intents: AccessIntent[] = [];
    const onIntent = (intent: AccessIntent) => {
      intents.push(intent);
    };
    const authoringRender = render(
      <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={onIntent} />,
    );
    const accessRender = render(
      <AstryxAccessRenderer authoring={authoring} manifest={manifest} onIntent={onIntent} />,
    );
    const authoringQueries = within(authoringRender.container);
    const accessQueries = within(accessRender.container);

    fireEvent.change(authoringQueries.getByRole("textbox", { name: /^Email/ }), {
      target: { value: "next@example.com" },
    });
    fireEvent.click(authoringQueries.getByRole("combobox", { name: /^Surface/ }));
    fireEvent.click(authoringQueries.getByRole("option", { name: "App install" }));
    fireEvent.click(authoringQueries.getByRole("combobox", { name: /^Roles/ }));
    fireEvent.click(authoringQueries.getByRole("option", { name: "Instance role 2" }));
    fireEvent.submit(required(authoringRender.container.querySelector("form")));
    fireEvent.click(authoringQueries.getByRole("button", { name: "Close" }));
    const confirmationDialog = accessQueries.getByRole("alertdialog", {
      name: "Revoke invitation?",
    });
    fireEvent.click(within(confirmationDialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(confirmationDialog).getByRole("button", { name: "Revoke invitation" }));

    expect(intents).toEqual([
      {
        accessId: "access:test",
        authoringId: "access:test:authoring",
        fieldId: "field:target-email",
        type: "accessInvitationFieldChange",
        value: "next@example.com",
      },
      {
        accessId: "access:test",
        authoringId: "access:test:authoring",
        fieldId: "field:target-surface",
        type: "accessInvitationFieldChange",
        value: "app-install",
      },
      {
        accessId: "access:test",
        authoringId: "access:test:authoring",
        controlId: "access:test:roles",
        groupId: "roles:instance",
        optionId: "role:instance:1",
        selected: true,
        type: "accessInvitationGrantSelection",
      },
      authoring.submit.intent,
      { ...authoring.cancel.intent, open: false },
      { ...confirmation.cancel.intent, open: false },
      confirmation.action.intent,
    ]);

    authoringRender.unmount();
    accessRender.unmount();
  });

  it("subscribes to manifest and authoring snapshots through one Presentation Host", () => {
    const manifest = readyManifest();
    const authoring = invitationAuthoring();
    const host = createMemoryPresentationHost({
      nodes: [
        { reference: accessReference, snapshot: manifest },
        { reference: authoringReference, snapshot: authoring },
      ],
    });
    const html = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedAccessRenderer accessReference={accessReference} />
      </PresentationHostProvider>,
    );

    expect(html).toContain('data-formless-astryx-access-state="ready"');
    expect(html).toContain('data-formless-astryx-access-authoring="access:test:authoring"');
    expect(html).toContain('value="invitee@example.com"');
    expect(html).not.toContain("data-formless-access-state");
  });
});

function renderAccess(
  manifest: AccessManifestContract,
  authoring?: AccessInvitationAuthoringContract,
) {
  return renderToStaticMarkup(
    <AstryxAccessRenderer authoring={authoring} manifest={manifest} onIntent={() => undefined} />,
  );
}

function manifestState(state: "failed" | "loading" | "unauthorized"): AccessManifestContract {
  const base = {
    accessibilityLabel: "Instance access",
    id: accessReference.accessId,
    kind: "accessManifest" as const,
    title: "Access",
  };

  return state === "loading"
    ? { ...base, message: "Loading access summary", state }
    : {
        ...base,
        feedback:
          state === "failed"
            ? accessFeedback("danger", "Access failed")
            : accessFeedback("warning", "Access unavailable"),
        state,
      };
}

function readyManifest({
  confirmation,
  empty = false,
  feedback,
}: {
  confirmation?: AccessConfirmationContract;
  empty?: boolean;
  feedback?: AccessFeedbackContract;
} = {}): AccessReadyContract {
  return {
    accessibilityLabel: "Instance access",
    authoring: authoringReference,
    ...(confirmation ? { confirmation } : {}),
    ...(empty
      ? {
          invitationsEmptyState: {
            description: "Invite someone to begin sharing access.",
            id: "access:test:invitations:empty",
            kind: "accessEmptyState" as const,
            title: "No invitations",
          },
          peopleEmptyState: {
            description: "Invite someone to begin sharing access.",
            id: "access:test:people:empty",
            kind: "accessEmptyState" as const,
            title: "No people",
          },
        }
      : {}),
    ...(feedback ? { feedback } : {}),
    id: accessReference.accessId,
    invitations: empty ? [] : [pendingInvitation()],
    invite: accessAction("authoring-open", "Invite person", {
      accessId: accessReference.accessId,
      actionId: "action:invite",
      authoringId: authoringReference.authoringId,
      controlId: "control:invite",
      open: true,
      type: "accessInvitationAuthoringOpenChange",
    }),
    kind: "accessManifest",
    people: empty ? [] : [accessPerson()],
    state: "ready",
    title: "Access",
  };
}

function accessPerson(): AccessPersonContract {
  return {
    displayName: "Ada Lovelace",
    id: "person:ada",
    kind: "accessPerson",
    primaryEmail: "ada@example.com",
    roles: [
      {
        id: "role:owner",
        kind: "accessRole",
        label: "Owner",
        scope: accessFact("role:owner:scope", "Scope", "Instance", "text"),
      },
    ],
    status: accessFact("person:ada:status", "Status", "Active", "status", "success"),
  };
}

function pendingInvitation(): AccessInvitationContract {
  return {
    expiresAt: accessFact(
      "invitation:pending:expires",
      "Expires",
      "2026-07-24T12:30:00.000Z",
      "timestamp",
    ),
    id: "invitation:pending",
    inviter: accessFact("invitation:pending:inviter", "Inviter", "Ada Lovelace", "text"),
    kind: "accessInvitation",
    revocation: {
      action: accessAction("revocation-open", "Revoke invitation", {
        accessId: accessReference.accessId,
        actionId: "action:revocation-open",
        confirmationId: "confirmation:revoke",
        controlId: "control:revocation-open",
        invitationId: "invitation:pending",
        open: true,
        type: "accessInvitationRevocationConfirmationOpenChange",
      }),
      availability: "available",
    },
    scope: accessFact("invitation:pending:scope", "Scope", "Analytical Engine", "text"),
    status: accessFact("invitation:pending:status", "Status", "Pending", "status", "warning"),
    target: accessFact("invitation:pending:target", "Target", "Organization", "text"),
    targetEmail: "pending@example.com",
  };
}

function invitationAuthoring({
  errors = [],
  feedback,
  pending,
}: {
  errors?: readonly string[];
  feedback?: AccessFeedbackContract;
  pending?: AccessInvitationAuthoringContract["pending"];
} = {}): AccessInvitationAuthoringContract {
  const fields = {
    displayName: accessField("display-name", "Name", "text", "Grace Hopper"),
    targetAppInstall: accessField("target-app-install", "Scope", "select", "site", {
      options: [
        {
          disabledReason: "The CRM install is paused.",
          id: "app:crm",
          label: "CRM",
          selected: false,
          value: "crm",
        },
        { id: "app:site", label: "Site", selected: true, value: "site" },
      ],
      required: false,
    }),
    targetEmail: accessField("target-email", "Email", "email", "invitee@example.com"),
    targetOrganization: accessField("target-organization", "Scope", "select", "analytical-engine", {
      options: [
        {
          id: "organization:analytical-engine",
          label: "Analytical Engine",
          selected: true,
          value: "analytical-engine",
        },
      ],
      required: false,
    }),
    targetSurface: accessField("target-surface", "Surface", "select", "organization", {
      options: [
        { id: "surface:instance", label: "Instance", selected: false, value: "instance" },
        {
          id: "surface:app",
          label: "App install",
          selected: false,
          value: "app-install",
        },
        {
          id: "surface:organization",
          label: "Organization",
          selected: true,
          value: "organization",
        },
      ],
      required: false,
    }),
  } satisfies AccessInvitationAuthoringContract["fields"];

  return {
    accessId: accessReference.accessId,
    cancel: accessAction("authoring-cancel", "Cancel", {
      accessId: accessReference.accessId,
      actionId: "action:authoring-cancel",
      authoringId: authoringReference.authoringId,
      controlId: "control:authoring-cancel",
      open: false,
      type: "accessInvitationAuthoringOpenChange",
    }),
    description: "Invite a person and assign access.",
    errors,
    ...(feedback ? { feedback } : {}),
    fields,
    grantSelections: [roleSelection(), membershipSelection(pending !== undefined)],
    id: authoringReference.authoringId,
    kind: "accessInvitationAuthoring",
    open: true,
    ...(pending ? { pending } : {}),
    submit: accessAction(
      "invitation-submit",
      pending ? "Sending invitation" : "Send invitation",
      {
        accessId: accessReference.accessId,
        actionId: "action:authoring-submit",
        authoringId: authoringReference.authoringId,
        controlId: "control:authoring-submit",
        type: "accessInvitationSubmit",
      },
      pending?.label,
      "submit",
    ),
    title: "Invite person",
  };
}

function roleSelection(): AccessGrantSelectionContract & { purpose: "roles" } {
  const instanceGroup = roleGroup("roles:instance", "Instance", 6);
  const groups = [
    {
      ...instanceGroup,
      options: instanceGroup.options.map((option, index) => ({
        ...option,
        ...(index === 0
          ? {
              selected: true,
              selectionIntent: { ...option.selectionIntent, selected: false },
            }
          : {}),
        ...(index === 5 ? { disabledReason: "Instance administrators cannot be invited." } : {}),
      })),
    },
    roleGroup("roles:app-install", "App install", 5),
    roleGroup("roles:organization", "Organization", 5),
  ];

  return {
    errors: [],
    groups,
    id: "access:test:roles",
    kind: "accessGrantSelection",
    label: "Roles",
    purpose: "roles",
    selectedOptionIds: ["role:instance:0"],
  };
}

function membershipSelection(
  pending: boolean,
): AccessGrantSelectionContract & { purpose: "memberships" } {
  const disabledReason = pending ? "Membership grants are unavailable while sending." : undefined;
  return {
    ...(disabledReason ? { disabledReason } : {}),
    errors: [],
    groups: [
      grantGroup("memberships:organizations", "Organizations", ["Analytical Engine"]),
      grantGroup("memberships:groups", "Groups", ["Research"]),
    ],
    id: "access:test:memberships",
    kind: "accessGrantSelection",
    label: "Memberships",
    purpose: "memberships",
    selectedOptionIds: [],
  };
}

function roleGroup(id: string, label: string, optionCount: number): AccessGrantOptionGroupContract {
  return {
    id,
    kind: "accessGrantOptionGroup",
    label,
    options: Array.from({ length: optionCount }, (_, index) => {
      const optionId = `role:${id.split(":")[1]}:${index}`;
      return {
        id: optionId,
        label: `${label} role ${index + 1}`,
        selected: false,
        selectionIntent: {
          accessId: accessReference.accessId,
          authoringId: authoringReference.authoringId,
          controlId: "access:test:roles",
          groupId: id,
          optionId,
          selected: true,
          type: "accessInvitationGrantSelection",
        },
      };
    }),
  };
}

function grantGroup(
  id: string,
  label: string,
  optionLabels: readonly string[],
): AccessGrantOptionGroupContract {
  return {
    id,
    kind: "accessGrantOptionGroup",
    label,
    options: optionLabels.map((optionLabel, index) => {
      const optionId = `${id}:option:${index}`;
      return {
        id: optionId,
        label: optionLabel,
        selected: false,
        selectionIntent: {
          accessId: accessReference.accessId,
          authoringId: authoringReference.authoringId,
          controlId: "access:test:memberships",
          groupId: id,
          optionId,
          selected: true,
          type: "accessInvitationGrantSelection",
        },
      };
    }),
  };
}

function accessField(
  purpose: AccessControlledFieldContract["purpose"],
  label: string,
  inputKind: AccessControlledFieldContract["inputKind"],
  value: string,
  options: Partial<Pick<AccessControlledFieldContract, "options" | "required">> = {},
): AccessControlledFieldContract {
  const id = `field:${purpose}`;
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
    ...options,
    purpose,
    required: options.required ?? true,
    value,
  };
}

function revocationConfirmation(): AccessConfirmationContract {
  return {
    action: accessAction("invitation-revoke", "Revoke invitation", {
      accessId: accessReference.accessId,
      actionId: "action:revoke",
      confirmationId: "confirmation:revoke",
      controlId: "control:revoke",
      invitationId: "invitation:pending",
      type: "accessInvitationRevoke",
    }),
    cancel: accessAction("revocation-cancel", "Cancel", {
      accessId: accessReference.accessId,
      actionId: "action:revocation-cancel",
      confirmationId: "confirmation:revoke",
      controlId: "control:revocation-cancel",
      invitationId: "invitation:pending",
      open: false,
      type: "accessInvitationRevocationConfirmationOpenChange",
    }),
    description: "The pending invitation for pending@example.com will no longer be usable.",
    id: "confirmation:revoke",
    invitationId: "invitation:pending",
    kind: "accessConfirmation",
    open: true,
    title: "Revoke invitation?",
  };
}

function accessAction<Intent extends AccessActionContract["intent"]>(
  purpose: AccessActionContract<Intent>["purpose"],
  label: string,
  intent: Intent,
  disabledReason?: string,
  type: ButtonContract["type"] = "button",
): AccessActionContract<Intent> {
  return {
    control: accessButton(intent.controlId, label, disabledReason, type),
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function accessButton(
  id: string,
  label: string,
  disabledReason?: string,
  type: ButtonContract["type"] = "button",
): ButtonContract {
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

function accessFact(
  id: string,
  label: string,
  value: string,
  presentation: AccessDisplayFactContract["presentation"],
  intent?: AccessDisplayFactContract["intent"],
): AccessDisplayFactContract {
  return {
    id,
    ...(intent ? { intent } : {}),
    kind: "accessDisplayFact",
    label,
    presentation,
    value,
  };
}

function accessFeedback(
  intent: AccessFeedbackContract["intent"],
  title = intent === "danger" ? "Invitation failed" : "Invitation created",
): AccessFeedbackContract {
  return {
    detail: intent === "danger" ? "Try again later." : "An invitation email was sent.",
    id: `feedback:${intent}`,
    intent,
    kind: "accessFeedback",
    title,
  };
}

function required<Value>(value: Value): NonNullable<Value> {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value as NonNullable<Value>;
}
