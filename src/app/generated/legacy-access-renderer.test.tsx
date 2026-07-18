import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiAccessIntent,
  FormlessUiAccessReadyContract,
} from "@dpeek/formless-astryx/contract";
import { createFormlessUiMemoryContractHost } from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import type { IdentityAccessManagementSummary } from "@dpeek/formless-identity-control-plane";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import {
  createInitialAccessInvitationDraft,
  projectAccess,
  type ProjectAccessOptions,
} from "../routes/access-projection.ts";
import {
  instanceAccessInvitationAuthoringReference,
  instanceAccessReference,
} from "../routes/access-contract.ts";
import {
  LegacyAccessRenderer,
  LegacyAccessAuthoringContent,
  LegacyAccessConfirmationContent,
  LegacySubscribedAccessRenderer,
  dispatchLegacyAccessFieldChange,
  dispatchLegacyAccessGrantSelection,
} from "./legacy-access-renderer.tsx";

const NOW = "2026-07-17T00:00:00.000Z";

describe("legacy access renderer", () => {
  it("renders accessible loading, unauthorized, failure, and empty states from contracts", () => {
    const loading = projectAccess(options({ status: "loading" }));
    const unauthorized = projectAccess(
      options({
        message: "Denied at /Users/ada/formless with TOKEN=owner-secret.",
        status: "unauthorized",
      }),
    );
    const failed = projectAccess(
      options({
        message: "Failed at /Users/ada/formless with TOKEN=owner-secret.",
        status: "failed",
      }),
    );
    const empty = projectAccess(options({ status: "ready", summary: emptySummary() }));
    const html = [loading, unauthorized, failed, empty].map((projection) =>
      renderToStaticMarkup(
        <LegacyAccessRenderer
          authoring={projection.authoring}
          manifest={projection.manifest}
          onIntent={() => undefined}
        />,
      ),
    );

    expect(html[0]).toContain('data-formless-access-state="loading"');
    expect(html[0]).toContain('aria-live="polite"');
    expect(html[1]).toContain('data-formless-access-state="unauthorized"');
    expect(html[1]).toContain('role="alert"');
    expect(html[2]).toContain('data-formless-access-state="failed"');
    expect(html[3]).toContain('data-formless-access-state="ready"');
    expect(html[3]).toContain("No people.");
    expect(html[3]).toContain("No invitations.");
    expect(html.join(" ")).not.toContain("/Users/ada/formless");
    expect(html.join(" ")).not.toContain("owner-secret");
  });

  it("renders display-safe people, roles, invitations, controlled authoring, and confirmation", () => {
    const summary = populatedSummary();
    Object.assign(summary.invitations[0] as object, {
      rawInviteToken: "private-invite-token",
      sessionId: "private-session",
      tokenHash: "private-token-hash",
    });
    const projection = projectAccess(
      options(
        { status: "ready", summary },
        { authoringOpen: true, confirmationInvitationId: "invitation:lin" },
      ),
    );
    const html = renderToStaticMarkup(
      <LegacyAccessRenderer
        authoring={projection.authoring}
        manifest={projection.manifest}
        onIntent={() => undefined}
      />,
    );
    const dialogHtml = renderToStaticMarkup(
      <>
        <LegacyAccessAuthoringContent
          authoring={required(projection.authoring)}
          onIntent={() => undefined}
        />
        <LegacyAccessConfirmationContent
          confirmation={required(readyManifest(projection.manifest).confirmation)}
          onIntent={() => undefined}
        />
      </>,
    );

    expect(html).toContain('aria-labelledby="instance-access:heading"');
    expect(html).toContain("Ada Owner");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("Owner");
    expect(html).toContain("lin@example.com");
    expect(html).toContain("Personal Site");
    expect(html).toContain('aria-label="Invite collaborator"');
    expect(dialogHtml).not.toContain("Invite a collaborator and choose their access.");
    expect(dialogHtml).toContain("Revoke invitation?");
    expect(dialogHtml).toContain("This action cannot be undone.");
    expect(html).not.toContain("Disable principal");
    expect(html).not.toContain("Remove role");
    expect(html).not.toContain("Transfer owner");
    expect(html).not.toContain("private-invite-token");
    expect(html).not.toContain("private-session");
    expect(html).not.toContain("private-token-hash");
  });

  it("subscribes to access and authoring references on the application host", () => {
    const projection = projectAccess(
      options({ status: "ready", summary: populatedSummary() }, { authoringOpen: true }),
    );
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        { reference: instanceAccessReference, snapshot: projection.manifest },
        {
          reference: instanceAccessInvitationAuthoringReference,
          snapshot: required(projection.authoring),
        },
      ],
    });
    const html = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <LegacySubscribedAccessRenderer accessReference={instanceAccessReference} />
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain('data-formless-access="instance-access"');
    expect(html).toContain("Ada Owner");
    expect(host.read(instanceAccessInvitationAuthoringReference)).toMatchObject({ open: true });
  });

  it("dispatches exact canonical field, selection, and action intent envelopes", async () => {
    const projection = projectAccess(
      options({ status: "ready", summary: populatedSummary() }, { authoringOpen: true }),
    );
    const manifest = readyManifest(projection.manifest);
    const authoring = required(projection.authoring);
    const roleOption = required(authoring.grantSelections[0].groups[0]?.options[0]);
    const intents: FormlessUiAccessIntent[] = [];
    const onIntent = (intent: FormlessUiAccessIntent) => {
      intents.push(intent);
    };

    await dispatchLegacyAccessFieldChange(
      onIntent,
      authoring.fields.targetEmail,
      "new@example.com",
    );
    await dispatchLegacyAccessGrantSelection(onIntent, roleOption.selectionIntent, true);
    onIntent(manifest.invite.intent);
    onIntent(authoring.cancel.intent);
    onIntent(authoring.submit.intent);
    onIntent(
      required(
        manifest.invitations[0]?.revocation.availability === "available"
          ? manifest.invitations[0].revocation.action.intent
          : undefined,
      ),
    );

    expect(intents).toEqual([
      { ...authoring.fields.targetEmail.changeIntent, value: "new@example.com" },
      { ...roleOption.selectionIntent, selected: true },
      manifest.invite.intent,
      authoring.cancel.intent,
      authoring.submit.intent,
      manifest.invitations[0]?.revocation.availability === "available"
        ? manifest.invitations[0].revocation.action.intent
        : undefined,
    ]);
  });
});

function options(
  state: ProjectAccessOptions["state"],
  overrides: Partial<ProjectAccessOptions> = {},
): ProjectAccessOptions {
  const installs = [siteInstall()];
  const summary = state.status === "ready" ? state.summary : undefined;
  return {
    authoringOpen: false,
    draft: createInitialAccessInvitationDraft({ installs, summary }),
    installs,
    revocation: { status: "idle" },
    state,
    submission: { status: "idle" },
    ...overrides,
  };
}

function emptySummary(): IdentityAccessManagementSummary {
  return {
    appRegistrations: [],
    groups: [],
    invitationGrantOptions: {
      authority: { instanceAdmin: false, instanceOwner: true },
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

function populatedSummary(): IdentityAccessManagementSummary {
  return {
    ...emptySummary(),
    invitationGrantOptions: {
      authority: { instanceAdmin: false, instanceOwner: true },
      memberships: [],
      roles: [{ displayLabel: "Owner", roleKey: "instance.owner", scopeKind: "instance" }],
    },
    invitations: [
      {
        createdAt: NOW,
        expiresAt: "2026-07-24T00:00:00.000Z",
        invitationId: "invitation:lin",
        inviterPrincipalId: "principal:ada",
        status: "pending",
        targetAppInstallId: "install:site",
        targetEmail: "lin@example.com",
        targetSurface: "app-install",
        updatedAt: NOW,
      },
    ],
    people: [
      {
        createdAt: NOW,
        displayName: "Ada Owner",
        kind: "human",
        primaryEmail: {
          displayEmail: "ada@example.com",
          normalizedEmail: "ada@example.com",
          principalEmailId: "email:ada",
          verificationStatus: "verified",
          verifiedAt: NOW,
        },
        principalId: "principal:ada",
        status: "active",
        updatedAt: NOW,
      },
    ],
    roles: [
      {
        createdAt: NOW,
        displayLabel: "Owner",
        roleAssignmentId: "role-assignment:ada-owner",
        roleId: "role:owner",
        roleKey: "instance.owner",
        scopeKind: "instance",
        status: "active",
        targetKind: "principal",
        targetPrincipalId: "principal:ada",
        updatedAt: NOW,
      },
    ],
  };
}

function siteInstall(): AppInstall {
  return {
    adminRoute: "/apps/install:site",
    createdAt: NOW,
    installId: "install:site",
    label: "Personal Site",
    packageAppKey: "site",
    packageRevision: 1,
    registrationPolicy: "closed",
    sourceSchemaHash: `sha256:${"a".repeat(64)}`,
    status: "installed",
    updatedAt: NOW,
  };
}

function readyManifest(
  manifest: ReturnType<typeof projectAccess>["manifest"],
): FormlessUiAccessReadyContract {
  if (manifest.state !== "ready") {
    throw new Error("Expected ready access manifest.");
  }
  return manifest;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
