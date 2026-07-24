import { describe, expect, it } from "vite-plus/test";
import type { AuthIntent } from "@dpeek/formless-presentation/contract";
import type { OwnerIdentity } from "../../shared/protocol.ts";
import {
  authIntentIsCurrent,
  createAuthPendingGuard,
  createNoShellAuthRuntimeHost,
} from "./auth-runtime-boundary.tsx";
import type { OwnerLoginRouteState } from "./owner-login.tsx";
import {
  ownerSignInAuthSurfaceReference,
  projectOwnerSignInAuthSurface,
} from "./owner-sign-in-auth-projection.ts";

const owner: OwnerIdentity = {
  createdAt: "2026-05-21T00:00:00.000Z",
  email: "ada@example.com",
  id: "owner-1",
  name: "Ada Owner",
};

describe("owner sign-in auth projection", () => {
  it("projects every owner sign-in runtime state", () => {
    const states: Array<[OwnerLoginRouteState, string]> = [
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

    expect(states.map(([state]) => projectOwnerSignInAuthSurface({ state }).state)).toEqual(
      states.map(([, state]) => state),
    );
  });

  it("projects passkey, logout, continuation, and display-safe failures", () => {
    const unavailable = projectOwnerSignInAuthSurface({
      state: {
        message: "Passkeys unavailable with owner-setup-token secret-value",
        owner,
        status: "passkey-unavailable",
      },
    });
    const complete = projectOwnerSignInAuthSurface({ state: { owner, status: "complete" } });

    expect(unavailable.passkey).toMatchObject({
      availability: "unavailable",
      unavailableReason: "Passkeys unavailable with owner-setup-token [redacted]",
    });
    expect(complete.actions.map((action) => action.purpose)).toEqual(["logout"]);
    expect(complete.continuation?.destination.label).toBe("Continue");
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
    if (passkey?.availability !== "available") throw new Error("Expected sign-in passkey.");

    await host.dispatch(passkey.intent);
    runtime.publish(projectOwnerSignInAuthSurface({ state: { owner, status: "complete" } }));
    expect(runtime.host).toBe(host);
    expect(host.read(ownerSignInAuthSurfaceReference)?.state).toBe("complete");
    expect(calls).toEqual([passkey.intent]);
    expect(authIntentIsCurrent(first, passkey.intent)).toBe(true);

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
    expect(await operation()).toBe(false);
    expect(operationCalls).toBe(1);
    release?.();
    expect(await firstRun).toBe(true);
  });
});
