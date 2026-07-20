import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { FormlessUiAccountGateKind } from "../formless-ui-contract.ts";
import { formlessUiContractReferenceKey } from "../formless-ui-contract-host.ts";
import { createFormlessAuthFixtures, type FormlessAuthFixture } from "./auth.fixtures.ts";
import {
  FormlessAuthLayout,
  applyFormlessAuthFixtureIntent,
  createFormlessAuthFixtureHost,
} from "./auth.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

describe("canonical auth fixtures", () => {
  it("covers every shipped auth family, state, gate, signup step, profile, and policy", () => {
    const fixtures = createFormlessAuthFixtures();
    const surfaces = fixtures.map((fixture) => fixture.surface);
    const ownerSetup = surfaces.filter((surface) => surface.surfaceKind === "owner-setup");
    const ownerSignIn = surfaces.filter((surface) => surface.surfaceKind === "owner-sign-in");
    const accountGates = surfaces.filter((surface) => surface.surfaceKind === "account-gate");
    const signup = surfaces.filter((surface) => surface.surfaceKind === "signup");
    const invitations = surfaces.filter(
      (surface) => surface.surfaceKind === "collaborator-invitation-acceptance",
    );

    expect(new Set(ownerSetup.map(({ state }) => state))).toEqual(
      new Set([
        "already-complete",
        "complete",
        "continuing",
        "failed",
        "incomplete",
        "invalid",
        "loading",
        "passkey-unavailable",
        "ready",
        "submitting",
      ]),
    );
    expect(new Set(ownerSignIn.map(({ state }) => state))).toEqual(
      new Set([
        "complete",
        "continuing",
        "failed",
        "incomplete",
        "loading",
        "logout-pending",
        "passkey-unavailable",
        "ready",
        "submitting",
      ]),
    );
    expect(new Set(accountGates.map(({ state }) => state))).toEqual(
      new Set([
        "blocked",
        "complete",
        "continuing",
        "failed",
        "loading",
        "ready",
        "submitting",
        "unavailable",
      ]),
    );
    expect(
      new Set(accountGates.flatMap((surface) => ("gateKind" in surface ? [surface.gateKind] : []))),
    ).toEqual(
      new Set<FormlessUiAccountGateKind>([
        "app-registration",
        "credential",
        "email-verification",
        "invitation",
        "profile-completion",
        "role-review",
        "terms-acceptance",
      ]),
    );
    expect(new Set(signup.map(({ state }) => state))).toEqual(
      new Set(["complete", "continuing", "failed", "passkey-unavailable", "ready", "submitting"]),
    );
    expect(new Set(signup.flatMap((surface) => ("step" in surface ? [surface.step] : [])))).toEqual(
      new Set(["email-verification", "identity", "passkey"]),
    );
    expect(new Set(invitations.map(({ state }) => state))).toEqual(
      new Set([
        "accepted",
        "continuing",
        "eligible",
        "failed",
        "invalid-link",
        "loading",
        "passkey-unavailable",
        "submitting",
        "unavailable",
      ]),
    );

    const profile = requiredFixture(fixtures, "account-gate:profile-completion:ready").surface;
    const terms = requiredFixture(fixtures, "account-gate:terms-acceptance:ready").surface;
    const tokenFields = surfaces.flatMap((surface) =>
      surface.fields.filter((field) => field.purpose === "verification-token"),
    );
    expect(profile.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: expect.objectContaining({ surface: "operation" }) }),
      ]),
    );
    expect(terms.policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accepted: false,
          required: true,
          selectionIntent: expect.anything(),
        }),
      ]),
    );
    expect(terms.policies.every((policy) => policy.destination === undefined)).toBe(true);
    expect(tokenFields.length).toBeGreaterThan(0);
    expect(
      tokenFields.every(
        (field) =>
          field.autocomplete === "one-time-code" &&
          field.field.required &&
          field.field.draftInput?.kind === "input" &&
          field.field.draftInput.value === "",
      ),
    ).toBe(true);
  });

  it("is structured-cloneable, JSON-serializable, secret-free, and free of unsupported actions", () => {
    const fixtures = createFormlessAuthFixtures();
    const serialized = JSON.stringify(fixtures);
    const actionLabels = fixtures.flatMap((fixture) => [
      ...fixture.surface.actions.map((action) => action.control.accessibilityLabel),
      ...(fixture.surface.passkey?.availability === "available"
        ? [fixture.surface.passkey.control.accessibilityLabel]
        : []),
      ...(fixture.surface.continuation
        ? [fixture.surface.continuation.control.accessibilityLabel]
        : []),
    ]);

    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(JSON.parse(serialized)).toEqual(expect.any(Array));
    expect(new Set(fixtures.map(({ id }) => id)).size).toBe(fixtures.length);
    expect(new Set(fixtures.map(({ surface }) => surface.id)).size).toBe(fixtures.length);
    expect(serialized).not.toMatch(
      /"(?:setupToken|rawInvitationToken|tokenHash|challengeId|credentialId|sessionId|sessionCookie|handoffSecret|storageIdentity|providerResponse|recoveryMaterial)"\s*:/,
    );
    expect(serialized).not.toContain("opaque-base64url-value");
    expect(serialized).not.toContain("raw-invitation-secret");
    expect(serialized).not.toContain("central-session-secret");
    expect(actionLabels).not.toEqual(
      expect.arrayContaining([
        "Choose destination",
        "Contact owner",
        "Decline invitation",
        "Resend code",
      ]),
    );
  });

  it("reduces exact controlled field and policy intents through scoped host updates", () => {
    const fixtures = createFormlessAuthFixtures();
    const fixtureHost = createFormlessAuthFixtureHost(fixtures);
    const ownerFixture = requiredFixture(fixtures, "owner-setup:ready");
    const ownerReference = fixtureHost.referenceFor(ownerFixture.id);
    const unrelatedFixture = requiredFixture(fixtures, "owner-sign-in:ready");
    const unrelatedReference = fixtureHost.referenceFor(unrelatedFixture.id);
    const ownerField = ownerFixture.surface.fields[0];
    const notifications: string[] = [];
    const stopOwner = fixtureHost.host.subscribe(ownerReference, () => {
      notifications.push(formlessUiContractReferenceKey(ownerReference));
    });
    const stopUnrelated = fixtureHost.host.subscribe(unrelatedReference, () => {
      notifications.push(formlessUiContractReferenceKey(unrelatedReference));
    });
    if (!ownerField || ownerField.field.surface !== "create") {
      throw new Error("Missing controlled owner fixture field.");
    }

    fixtureHost.host.dispatch({
      ...ownerField.intent,
      intent: {
        fieldName: ownerField.field.fieldName,
        fieldValue: { kind: "input", value: "Grace Hopper" },
        type: "createDraftChange",
      },
    });
    expect(fixtureHost.getSurface(ownerFixture.id).fields[0]?.field).toMatchObject({
      draftInput: { kind: "input", value: "Grace Hopper" },
      value: "Grace Hopper",
    });
    expect(notifications).toEqual([formlessUiContractReferenceKey(ownerReference)]);

    const currentOwner = fixtureHost.getSurface(ownerFixture.id);
    const rejected = applyFormlessAuthFixtureIntent(currentOwner, {
      ...ownerField.intent,
      fieldId: "field:other",
      intent: {
        fieldName: ownerField.field.fieldName,
        fieldValue: { kind: "input", value: "Ignored" },
        type: "createDraftChange",
      },
    });
    expect(rejected).toBe(currentOwner);

    const termsFixture = requiredFixture(fixtures, "account-gate:terms-acceptance:ready");
    const policy = termsFixture.surface.policies[0];
    if (!policy?.selectionIntent) {
      throw new Error("Missing controlled policy fixture.");
    }
    fixtureHost.host.dispatch(policy.selectionIntent);
    expect(fixtureHost.getSurface(termsFixture.id).policies[0]).toMatchObject({
      accepted: true,
      selectionIntent: { accepted: false },
    });

    const profileFixture = requiredFixture(fixtures, "account-gate:profile-completion:ready");
    const profileField = profileFixture.surface.fields[0];
    if (!profileField || profileField.field.surface !== "operation") {
      throw new Error("Missing controlled profile fixture field.");
    }
    fixtureHost.host.dispatch({
      ...profileField.intent,
      intent: {
        inputName: profileField.field.inputName,
        inputValue: { kind: "input", value: "Rear Admiral Hopper" },
        type: "operationDraftChange",
      },
    });
    expect(fixtureHost.getSurface(profileFixture.id).fields[0]?.field).toMatchObject({
      draftInput: { kind: "input", value: "Rear Admiral Hopper" },
      value: "Rear Admiral Hopper",
    });

    stopOwner();
    stopUnrelated();
  });

  it("marks exact submit, retry, passkey, logout, and continuation controls pending", () => {
    const fixtures = createFormlessAuthFixtures();
    const fixtureHost = createFormlessAuthFixtureHost(fixtures);
    const actionFixtures = [
      requiredFixture(fixtures, "signup:identity:ready"),
      requiredFixture(fixtures, "owner-setup:failed"),
      requiredFixture(fixtures, "owner-sign-in:complete"),
    ];

    for (const fixture of actionFixtures) {
      const action = fixture.surface.actions[0];
      if (!action) {
        throw new Error(`Missing ${fixture.id} action fixture.`);
      }
      fixtureHost.host.dispatch(action.intent);
      const nextSurface = fixtureHost.getSurface(fixture.id);
      expect(nextSurface.actions[0]?.control.pending?.isPending).toBe(true);
      expect(nextSurface.pending).toBe(true);
    }

    const passkeyFixture = requiredFixture(fixtures, "owner-sign-in:ready");
    const passkey = passkeyFixture.surface.passkey;
    if (passkey?.availability !== "available") {
      throw new Error("Missing available passkey fixture.");
    }
    fixtureHost.host.dispatch(passkey.intent);
    expect(fixtureHost.getSurface(passkeyFixture.id)).toMatchObject({
      passkey: { control: { pending: { isPending: true } } },
      pending: true,
    });

    const continuationFixture = requiredFixture(fixtures, "account-gate:complete");
    const continuation = continuationFixture.surface.continuation;
    if (!continuation) {
      throw new Error("Missing continuation fixture.");
    }
    fixtureHost.host.dispatch(continuation.intent);
    expect(fixtureHost.getSurface(continuationFixture.id)).toMatchObject({
      continuation: { control: { pending: { isPending: true } } },
      pending: true,
    });
  });
});

describe("Auth prototype layout", () => {
  it("renders the selected memory-host fixture through the real subscribed Astryx renderer", () => {
    const html = renderToStaticMarkup(<FormlessAuthLayout />);

    expect(html).toContain('data-formless-astryx-auth-frame="auth:fixture:owner-setup:loading"');
    expect(html).toContain('data-formless-astryx-auth-surface-kind="owner-setup"');
    expect(html).toContain('data-formless-astryx-auth-surface-state="loading"');
    expect(html).toContain('aria-label="Switch auth fixture"');
    expect(html).toContain('aria-label="Auth view"');
    expect(html).toContain('aria-label="Owner setup state"');
    expect(html).toContain("Owner setup");
    expect(html).toContain("Loading");
    expect(html).not.toContain("Choose destination");
    expect(html).not.toContain("Decline invitation");
  });

  it("keeps fixtures and reducers runtime-free", async () => {
    const fixtureSource = await readFile(new URL("./auth.fixtures.ts", import.meta.url), "utf8");
    const layoutSource = await readFile(new URL("./auth.tsx", import.meta.url), "utf8");
    const rendererSource = await readFile(
      new URL("./formless-ui-auth-renderer.tsx", import.meta.url),
      "utf8",
    );
    const imports = [fixtureSource, layoutSource].flatMap(importSpecifiers);
    const forbiddenImports = imports.filter((specifier) =>
      /(?:^|\/)(?:src\/app|src\/client|routing|storage|replica|operation-controller|session-client|instance-auth)(?:\/|$)|\bwouter\b/.test(
        specifier,
      ),
    );

    expect(fixtureSource).not.toMatch(/\breact\b|formless-ui-contract-host/);
    expect(layoutSource).toContain("createFormlessUiMemoryContractHost");
    expect(layoutSource).toContain("AstryxSubscribedAuthRenderer");
    expect(layoutSource).not.toMatch(
      /navigator\.credentials|setTimeout|location\.(?:assign|replace)|sessionStorage|localStorage/,
    );
    expect(fixtureSource).not.toMatch(
      /Choose destination|Contact owner|Decline invitation|Resend code/,
    );
    expect(forbiddenImports).toEqual([]);
    expect(rendererSource).not.toMatch(/className=|src\/app/);
  });
});

function requiredFixture(
  fixtures: readonly FormlessAuthFixture[],
  id: string,
): FormlessAuthFixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} auth fixture.`);
  }
  return fixture;
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}
