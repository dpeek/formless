import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiAccessGrantSelectionContract,
  FormlessUiAccessInvitationAuthoringContract,
  FormlessUiAccessReadyContract,
} from "@dpeek/formless-presentation/contract";
import { formlessUiContractReferenceKey } from "@dpeek/formless-presentation/contract-host";
import {
  accessFixtureAuthoringReference,
  createFormlessAccessFixtures,
  type FormlessAccessFixture,
  type FormlessAccessFixtureId,
} from "./access.fixtures.ts";
import {
  FormlessAccessFixtureView,
  createFormlessAccessFixtureHost,
  projectFormlessAccessFixturePublication,
} from "./access.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  keyframes: () => "animation",
  props: () => ({}),
}));

describe("canonical access-management fixtures", () => {
  it("covers access and authority states with data only", () => {
    const fixtures = createFormlessAccessFixtures();
    const serialized = JSON.stringify(fixtures);

    expect(fixtures.map(({ id }) => id)).toEqual([
      "loading",
      "unauthorized",
      "failed",
      "empty",
      "populated-owner",
    ]);
    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(requiredFixture(fixtures, "loading").state.manifest.state).toBe("loading");
    expect(requiredFixture(fixtures, "unauthorized").state.manifest.state).toBe("unauthorized");
    expect(requiredFixture(fixtures, "failed").state.manifest.state).toBe("failed");
    expect(readyManifest(fixtures, "empty")).toMatchObject({
      invitations: [],
      invitationsEmptyState: { title: "No invitations" },
      people: [],
      peopleEmptyState: { title: "No people" },
    });

    const ownerAuthoring = requiredAuthoring(fixtures, "populated-owner");
    expect(grantLabels(ownerAuthoring.grantSelections[0])).toEqual([
      ["Owner", "Administrator"],
      ["Site editor"],
      ["Organization administrator"],
    ]);
    expect(ownerAuthoring.grantSelections.map(({ label }) => label)).toEqual([
      "Roles",
      "Memberships",
    ]);
    expect(ownerAuthoring.grantSelections[1].groups.map(({ label }) => label)).toEqual([
      "Organizations",
      "Groups",
    ]);
    expect(ownerAuthoring.fields.targetAppInstall).toMatchObject({
      required: false,
      value: "site",
    });
    expect(ownerAuthoring.fields.targetOrganization).toMatchObject({
      required: false,
      value: "formless",
    });

    const populated = readyManifest(fixtures, "populated-owner");
    expect(populated.people.map(({ displayName }) => displayName)).toEqual([
      "Ada Owner",
      "Bo Admin",
    ]);
    expect(
      populated.people.flatMap((person) =>
        person.roles.map(({ label, scope }) => [label, scope?.value]),
      ),
    ).toEqual([
      ["Owner", "Instance"],
      ["Editor", "Site"],
      ["Administrator", "Instance"],
      ["Administrator", "Formless"],
    ]);
    expect(populated.invitations.map(({ status }) => status.value)).toEqual([
      "Pending",
      "Accepted",
    ]);

    expect(serialized).not.toMatch(
      /rawInvite|tokenHash|credential|challengeSecret|sessionId|handoff|providerResponse|recoveryMaterial|adminBearer|private[-_ ]?key|bearer\s/i,
    );
    expect(serialized).not.toMatch(
      /disablePrincipal|removeRole|transferOwner|removeOwner|owner-transfer|principal-disable/i,
    );
    expect(serialized).not.toContain("className");
  });

  it("reduces exact current field, selection, dialog, submit, confirmation, and revoke intents", () => {
    const fixtures = createFormlessAccessFixtures();
    const draftHost = createFormlessAccessFixtureHost(requiredFixture(fixtures, "populated-owner"));
    const draftInvite = requiredCurrentReadyManifest(draftHost).invite;
    draftHost.host.dispatch(draftInvite.intent);
    const initialDraft = requiredCurrentAuthoring(draftHost);
    const emailField = initialDraft.fields.targetEmail;
    const surfaceField = initialDraft.fields.targetSurface;

    draftHost.host.dispatch({ ...surfaceField.changeIntent, value: "app-install" });
    expect(requiredCurrentAuthoring(draftHost).fields.targetAppInstall).toMatchObject({
      disabledReason: undefined,
      required: false,
      value: "site",
    });
    draftHost.host.dispatch({ ...surfaceField.changeIntent, value: "organization" });
    expect(requiredCurrentAuthoring(draftHost).fields.targetOrganization).toMatchObject({
      disabledReason: undefined,
      required: false,
      value: "formless",
    });

    draftHost.host.dispatch({ ...emailField.changeIntent, value: "updated@example.com" });
    const displayNameField = requiredCurrentAuthoring(draftHost).fields.displayName;
    draftHost.host.dispatch({ ...displayNameField.changeIntent, value: "Grace Hopper" });
    expect(requiredCurrentAuthoring(draftHost).fields.targetEmail.value).toBe(
      "updated@example.com",
    );

    const roleSelection = requiredCurrentAuthoring(draftHost).grantSelections[0];
    const ownerOption = roleSelection.groups[0]?.options.find(({ label }) => label === "Owner");
    if (!ownerOption) {
      throw new Error("Missing owner grant fixture option.");
    }
    draftHost.host.dispatch(ownerOption.selectionIntent);
    expect(requiredCurrentAuthoring(draftHost).grantSelections[0].selectedOptionIds).toContain(
      ownerOption.id,
    );

    const beforeWrongIntent = draftHost.getState();
    draftHost.host.dispatch({
      ...requiredCurrentAuthoring(draftHost).fields.displayName.changeIntent,
      fieldId: "access:fixture:field:missing",
      value: "Ignored",
    });
    expect(draftHost.getState()).toBe(beforeWrongIntent);

    const submit = requiredCurrentAuthoring(draftHost).submit;
    draftHost.host.dispatch(submit.intent);
    expect(requiredCurrentAuthoring(draftHost)).toMatchObject({
      feedback: { intent: "danger", title: "Invitation could not be created" },
      open: true,
    });

    const ownerHost = createFormlessAccessFixtureHost(requiredFixture(fixtures, "populated-owner"));
    const invite = requiredCurrentReadyManifest(ownerHost).invite;
    ownerHost.host.dispatch(invite.intent);
    expect(requiredCurrentAuthoring(ownerHost).open).toBe(true);
    ownerHost.host.dispatch(requiredCurrentAuthoring(ownerHost).cancel.intent);
    expect(requiredCurrentAuthoring(ownerHost).open).toBe(false);

    const revocation = requiredCurrentReadyManifest(ownerHost).invitations[0]?.revocation;
    if (revocation?.availability !== "available") {
      throw new Error("Missing pending invitation revocation action.");
    }
    ownerHost.host.dispatch(revocation.action.intent);
    expect(requiredCurrentReadyManifest(ownerHost).confirmation).toMatchObject({ open: true });
    const confirmation = requiredCurrentReadyManifest(ownerHost).confirmation;
    if (!confirmation) {
      throw new Error("Missing fixture revocation confirmation.");
    }
    ownerHost.host.dispatch(confirmation.cancel.intent);
    expect(requiredCurrentReadyManifest(ownerHost).confirmation).toBeUndefined();

    ownerHost.host.dispatch(revocation.action.intent);
    const revoke = requiredCurrentReadyManifest(ownerHost).confirmation?.action;
    if (!revoke) {
      throw new Error("Missing fixture revoke action.");
    }
    ownerHost.host.dispatch(revoke.intent);
    expect(requiredCurrentReadyManifest(ownerHost)).toMatchObject({
      confirmation: { open: true },
      feedback: { intent: "danger", title: "Invitation could not be revoked" },
    });
    expect(requiredCurrentReadyManifest(ownerHost).invitations[0]?.revocation.availability).toBe(
      "available",
    );
  });

  it("publishes access through one host while notifying only changed access scopes", () => {
    const fixture = requiredFixture(createFormlessAccessFixtures(), "populated-owner");
    const fixtureHost = createFormlessAccessFixtureHost(fixture);
    const publication = projectFormlessAccessFixturePublication(fixture.state);
    const notifications = new Set<string>();
    const stops = [fixtureHost.accessReference, accessFixtureAuthoringReference].map((reference) =>
      fixtureHost.host.subscribe(reference, () => {
        notifications.add(formlessUiContractReferenceKey(reference));
      }),
    );

    expect(fixtureHost.host.read(fixtureHost.accessReference)?.title).toBe("Access");
    expect(
      publication.nodes.some(({ reference }) => reference.kind === "accessManifestReference"),
    ).toBe(true);

    const email = requiredCurrentAuthoring(fixtureHost).fields.targetEmail;
    fixtureHost.host.dispatch({ ...email.changeIntent, value: "scope@example.com" });
    expect(notifications).toEqual(
      new Set([formlessUiContractReferenceKey(accessFixtureAuthoringReference)]),
    );

    notifications.clear();
    const manifest = requiredCurrentReadyManifest(fixtureHost);
    const revocation = manifest.invitations[0]?.revocation;
    if (revocation?.availability !== "available") {
      throw new Error("Missing pending invitation revocation action.");
    }
    fixtureHost.host.dispatch(revocation.action.intent);
    expect(notifications).toEqual(
      new Set([formlessUiContractReferenceKey(fixtureHost.accessReference)]),
    );

    for (const stop of stops) {
      stop();
    }
  });

  it("renders subscribed access without application-shell chrome", () => {
    const fixtureHost = createFormlessAccessFixtureHost(
      requiredFixture(createFormlessAccessFixtures(), "populated-owner"),
    );
    const html = renderToStaticMarkup(<FormlessAccessFixtureView fixtureHost={fixtureHost} />);

    expect(html).not.toContain("formless-astryx-application-shell");
    expect(html).toContain('data-formless-astryx-access="access:fixture"');
    expect(html).toContain('data-formless-astryx-access-state="ready"');
  });

  it("keeps fixture composition runtime-free and package-local", async () => {
    const fixtureSource = await readFile(new URL("./access.fixtures.ts", import.meta.url), "utf8");
    const layoutSource = await readFile(new URL("./access.tsx", import.meta.url), "utf8");
    const rendererSource = await readFile(
      new URL("./formless-ui-access-renderer.tsx", import.meta.url),
      "utf8",
    );
    const rootSource = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
    const imports = [fixtureSource, layoutSource].flatMap(importSpecifiers);

    expect(
      imports.filter((specifier) =>
        /(?:^|\/)(?:src\/app|src\/client|identity|storage|replica|api-client|access-runtime|access-projection)(?:\/|$)|\bwouter\b/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
    expect(`${fixtureSource}\n${layoutSource}`).not.toMatch(
      /\blocalStorage\b|\bsessionStorage\b|\bdocument\.|\bwindow\.|\bfetch\(|\bsetTimeout\b|\bsetInterval\b|className/,
    );
    expect(layoutSource.match(/createFormlessUiMemoryContractHost\(\{/g)).toHaveLength(1);
    expect(layoutSource.match(/<FormlessUiContractHostProvider\b/g)).toHaveLength(1);
    expect(rendererSource).not.toContain("FormlessUiContractHostProvider");
    expect(rootSource).toContain("FormlessAccessLayout");
  });
});

function requiredFixture(fixtures: readonly FormlessAccessFixture[], id: FormlessAccessFixtureId) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} access fixture.`);
  }
  return fixture;
}

function readyManifest(
  fixtures: readonly FormlessAccessFixture[],
  id: FormlessAccessFixtureId,
): FormlessUiAccessReadyContract {
  const manifest = requiredFixture(fixtures, id).state.manifest;
  if (manifest.state !== "ready") {
    throw new Error(`Expected ready ${id} access fixture.`);
  }
  return manifest;
}

function requiredAuthoring(
  fixtures: readonly FormlessAccessFixture[],
  id: FormlessAccessFixtureId,
) {
  const authoring = requiredFixture(fixtures, id).state.authoring;
  if (!authoring) {
    throw new Error(`Expected ${id} access authoring fixture.`);
  }
  return authoring;
}

function requiredCurrentAuthoring(
  fixtureHost: ReturnType<typeof createFormlessAccessFixtureHost>,
): FormlessUiAccessInvitationAuthoringContract {
  const authoring = fixtureHost.getState().authoring;
  if (!authoring) {
    throw new Error("Expected current access authoring fixture.");
  }
  return authoring;
}

function requiredCurrentReadyManifest(
  fixtureHost: ReturnType<typeof createFormlessAccessFixtureHost>,
): FormlessUiAccessReadyContract {
  const manifest = fixtureHost.getState().manifest;
  if (manifest.state !== "ready") {
    throw new Error("Expected current ready access fixture.");
  }
  return manifest;
}

function grantLabels(selection: FormlessUiAccessGrantSelectionContract) {
  return selection.groups.map((group) => group.options.map(({ label }) => label));
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}
