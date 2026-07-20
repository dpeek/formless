import { describe, expect, it } from "vite-plus/test";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  createNoShellAuthRuntimeHost,
} from "./auth-runtime-boundary.tsx";
import {
  ownerSignInAuthSurfaceReference,
  projectOwnerSetupAuthSurface,
  projectOwnerSignInAuthSurface,
} from "./owner-auth-projection.ts";
import type { OwnerLoginRouteState } from "./owner-login.tsx";
import type { OwnerSetupRouteState } from "./owner-setup.tsx";
import type { OwnerIdentity } from "../../shared/protocol.ts";

const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const owner: OwnerIdentity = {
  createdAt: "2026-05-21T00:00:00.000Z",
  email: "ada@example.com",
  id: "owner-1",
  name: "Ada Owner",
};

describe("owner auth projection", () => {
  it("projects every owner setup and sign-in runtime state", () => {
    const setupStates: Array<[OwnerSetupRouteState, string]> = [
      [{ status: "loading" }, "loading"],
      [{ message: "Missing token.", status: "invalid-link" }, "invalid"],
      [{ setupToken, status: "ready" }, "ready"],
      [{ setupToken, status: "submitting" }, "submitting"],
      [{ message: "Unavailable.", status: "passkey-unavailable" }, "passkey-unavailable"],
      [{ message: "Failed.", setupToken, status: "failed" }, "failed"],
      [{ owner, status: "already-complete" }, "already-complete"],
      [{ owner, status: "complete" }, "complete"],
      [{ continueTo: "/formless/auth", owner, status: "continuing" }, "continuing"],
    ];
    const signInStates: Array<[OwnerLoginRouteState, string]> = [
      [{ status: "loading" }, "loading"],
      [{ status: "setup-incomplete" }, "incomplete"],
      [{ owner, status: "ready" }, "ready"],
      [{ owner, status: "submitting" }, "submitting"],
      [{ message: "Unavailable.", owner, status: "passkey-unavailable" }, "passkey-unavailable"],
      [{ message: "Failed.", owner, status: "failed" }, "failed"],
      [{ owner, status: "complete" }, "complete"],
      [{ owner, status: "logging-out" }, "logout-pending"],
      [{ continueTo: "/apps", owner, status: "continuing" }, "continuing"],
    ];

    expect(
      setupStates.map(
        ([state]) =>
          projectOwnerSetupAuthSurface({ ownerEmail: "", ownerName: "Ada", state }).state,
      ),
    ).toEqual(setupStates.map(([, state]) => state));
    expect(signInStates.map(([state]) => projectOwnerSignInAuthSurface({ state }).state)).toEqual(
      signInStates.map(([, state]) => state),
    );
  });

  it("projects controlled canonical owner fields and current exact intents", () => {
    const surface = projectOwnerSetupAuthSurface({
      ownerEmail: "ada@example.com",
      ownerName: "Ada Owner",
      state: { setupToken, status: "ready" },
    });
    const [nameField, emailField] = surface.fields;
    if (!nameField || !emailField || surface.passkey?.availability !== "available") {
      throw new Error("Expected ready owner setup controls.");
    }

    expect(nameField).toMatchObject({
      autocomplete: "name",
      field: { draftInput: { value: "Ada Owner" }, surface: "create" },
      purpose: "display-name",
    });
    expect(emailField).toMatchObject({
      autocomplete: "email",
      field: { draftInput: { value: "ada@example.com" }, surface: "create" },
      purpose: "email",
    });
    expect(authIntentIsCurrent(surface, surface.passkey.intent)).toBe(true);
    expect(authIntentIsCurrent(surface, { ...surface.passkey.intent, passkeyId: "stale" })).toBe(
      false,
    );
    expect(
      authIntentIsCurrent(
        projectOwnerSetupAuthSurface({
          ownerEmail: "ada@example.com",
          ownerName: "Ada Owner",
          state: { setupToken, status: "submitting" },
        }),
        surface.passkey.intent,
      ),
    ).toBe(false);

    const fieldIntent: AuthIntent = {
      ...nameField.intent,
      intent: {
        fieldName: "name",
        fieldValue: { kind: "input", value: "Grace Owner" },
        type: "createDraftChange",
      },
    };
    expect(authIntentIsCurrent(surface, fieldIntent)).toBe(true);
    expect(authIntentIsCurrent(surface, { ...fieldIntent, fieldId: "field:stale" })).toBe(false);
  });

  it("uses canonical draft validity to gate owner passkey creation", () => {
    const invalidEmail = projectOwnerSetupAuthSurface({
      ownerEmail: "not-an-email",
      ownerName: "Ada Owner",
      state: { setupToken, status: "ready" },
    });
    const optionalEmail = projectOwnerSetupAuthSurface({
      ownerEmail: "",
      ownerName: "Ada Owner",
      state: { setupToken, status: "ready" },
    });
    const missingName = projectOwnerSetupAuthSurface({
      ownerEmail: "ada@example.com",
      ownerName: "",
      state: { setupToken, status: "ready" },
    });

    expect(invalidEmail.fields[1]?.field.errors?.[0]?.message).toContain("email");
    expect(invalidEmail.passkey).toMatchObject({
      availability: "available",
      control: { disabled: true },
    });
    if (invalidEmail.passkey?.availability !== "available") {
      throw new Error("Expected projected owner passkey.");
    }
    expect(authIntentIsCurrent(invalidEmail, invalidEmail.passkey.intent)).toBe(false);
    expect(optionalEmail.passkey?.availability).toBe("available");
    if (optionalEmail.passkey?.availability !== "available") {
      throw new Error("Expected optional-email owner passkey.");
    }
    expect(optionalEmail.passkey.control.disabled).toBeFalsy();
    expect(missingName.passkey).toMatchObject({
      availability: "available",
      control: { disabled: true },
    });
  });

  it("projects passkey availability, logout, continuation, and display-safe failures", () => {
    const unavailable = projectOwnerSignInAuthSurface({
      state: {
        message: "Passkeys unavailable with owner-setup-token secret-value",
        owner,
        status: "passkey-unavailable",
      },
    });
    const complete = projectOwnerSignInAuthSurface({ state: { owner, status: "complete" } });
    const failedSetup = projectOwnerSetupAuthSurface({
      ownerEmail: "ada@example.com",
      ownerName: "Ada Owner",
      state: {
        message: "Failed with API_TOKEN=owner-secret at /Users/ada/formless",
        setupToken,
        status: "failed",
      },
    });
    const serialized = JSON.stringify(failedSetup);

    expect(unavailable.passkey).toMatchObject({
      availability: "unavailable",
      unavailableReason: "Passkeys unavailable with owner-setup-token [redacted]",
    });
    expect(complete.actions.map((action) => action.purpose)).toEqual(["logout"]);
    expect(complete.continuation?.destination.label).toBe("Continue");
    expect(failedSetup.feedback?.detail).toBe("Failed with API_TOKEN=[redacted] at <path>");
    expect(serialized).not.toContain(setupToken);
    expect(serialized).not.toContain("owner-secret");
  });

  it("projects accessible owner presentation without private setup state", () => {
    const surface = projectOwnerSetupAuthSurface({
      ownerEmail: "ada@example.com",
      ownerName: "Ada Owner",
      state: { setupToken, status: "ready" },
    });
    expect(surface.frame.accessibilityLabel).toBe("Claim this Formless instance");
    expect(surface.fields.map(({ autocomplete }) => autocomplete)).toEqual(["name", "email"]);
    expect(surface.passkey).toMatchObject({
      availability: "available",
      control: { accessibilityLabel: "Create owner passkey" },
    });
    expect(JSON.stringify(surface)).not.toContain(setupToken);
  });

  it("keeps the no-shell host stable and deduplicates pending operations", async () => {
    const first = projectOwnerSignInAuthSurface({ state: { owner, status: "ready" } });
    const calls: AuthIntent[] = [];
    const runtime = createNoShellAuthRuntimeHost(
      ownerSignInAuthSurfaceReference,
      first,
      (intent) => {
        calls.push(intent);
      },
    );
    const host = runtime.host;
    const passkey = first.passkey;
    if (passkey?.availability !== "available") {
      throw new Error("Expected sign-in passkey.");
    }

    await host.dispatch(passkey.intent);
    runtime.publish(projectOwnerSignInAuthSurface({ state: { owner, status: "complete" } }));
    expect(runtime.host).toBe(host);
    expect(host.read(ownerSignInAuthSurfaceReference)?.state).toBe("complete");
    expect(calls).toEqual([passkey.intent]);

    const guard = createAuthPendingGuard();
    let release: (() => void) | undefined;
    let operationCalls = 0;
    const operation = () =>
      guard.run(
        () =>
          new Promise<void>((resolve) => {
            operationCalls += 1;
            release = resolve;
          }),
      );
    const firstRun = operation();
    const duplicateRun = operation();
    expect(await duplicateRun).toBe(false);
    expect(operationCalls).toBe(1);
    release?.();
    expect(await firstRun).toBe(true);
  });
});
