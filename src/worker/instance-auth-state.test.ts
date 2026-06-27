import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  ConsumeHandoffGrantResult,
  ConsumePasskeyChallengeResult,
  CreateCentralAuthSessionResult,
  CreateHandoffGrantResult,
  CreatePasskeyChallengeResult,
  CreatePasskeyCredentialResult,
  RevokeCentralAuthSessionResult,
  StoredCentralAuthSession,
  StoredHandoffGrant,
  StoredHostSessionRevocationVersion,
  StoredInstanceAuthConfig,
  StoredPasskeyChallenge,
  StoredPasskeyCredential,
  UpdatePasskeyCredentialVerificationResult,
} from "./instance-auth-state.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const canonicalOrigin = "https://instance.example.com";
const relyingPartyId = "example.com";
const relyingPartyName = "Formless";
const createdAt = "2026-05-21T00:00:00.000Z";
const updatedAt = "2026-05-21T00:05:00.000Z";
const expiresAt = "2026-05-21T01:00:00.000Z";
const expiredAt = "2026-05-21T00:00:30.000Z";
const registrationChallenge = "cmVnaXN0cmF0aW9uLWNoYWxsZW5nZQ";
const loginChallenge = "bG9naW4tY2hhbGxlbmdl";
const deleteChallenge = "ZGVsZXRlLWNoYWxsZW5nZQ";
const setupTokenHash = "c2V0dXAtdG9rZW4taGFzaA";
const centralSessionIdHash = "Y2VudHJhbC1zZXNzaW9uLWhhc2g";
const grantId = "aGFuZG9mZi1ncmFudC0x";
const duplicateGrantId = "aGFuZG9mZi1ncmFudC0y";
const expiredGrantId = "ZXhwaXJlZC1oYW5kb2ZmLWdyYW50";
const grantSecretHash = "Z3JhbnQtc2VjcmV0LWhhc2g";
const duplicateGrantSecretHash = "Z3JhbnQtc2VjcmV0LWhhc2gtMg";
const expiredGrantSecretHash = "ZXhwaXJlZC1ncmFudC1zZWNyZXQtaGFzaA";
const nonceHash = "bm9uY2UtaGFzaA";
const state = "c3RhdGU";
const instanceId = "instance.example.com";
const principalId = "principal-1";
const targetOrigin = "https://app.example.com";
const routeId = "route:personal:admin";
const appInstallId = "personal";
const storageIdentity = "app:personal";
const returnTo = "/settings?panel=routes";
const credentialId = "Y3JlZGVudGlhbC0x";
const publicKey = [1, 2, 3, 4, 5];
const publicKeyBase64Url = "AQIDBAU";

let harness: Harness;
let instanceAuthHarnessDir: string | undefined;
let instanceAuthHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeInstanceAuthHarness(), {
    INSTANCE_AUTH_HARNESS: { className: "InstanceAuthHarness", useSQLite: true },
  });
});

beforeEach(() => {
  instanceAuthHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (instanceAuthHarnessDir) {
    await rm(instanceAuthHarnessDir, { recursive: true, force: true });
    instanceAuthHarnessDir = undefined;
  }
});

describe("instance auth state", () => {
  it("stores normalized auth config with stable created timestamps", async () => {
    const first = await writeConfig({
      canonicalOrigin: "https://instance.example.com/",
      relyingPartyId: "EXAMPLE.com.",
      relyingPartyName,
      now: createdAt,
    });
    const second = await writeConfig({
      canonicalOrigin,
      relyingPartyId: "instance.example.com",
      relyingPartyName: "Formless Instance",
      now: updatedAt,
    });
    const stored = await getJson<{ config: StoredInstanceAuthConfig | null }>("/config");

    expect(first).toEqual({
      canonicalOrigin,
      relyingPartyId,
      relyingPartyName,
      createdAt,
      updatedAt: createdAt,
    });
    expect(second).toEqual({
      canonicalOrigin,
      relyingPartyId: "instance.example.com",
      relyingPartyName: "Formless Instance",
      createdAt,
      updatedAt,
    });
    expect(stored.config).toEqual(second);
  });

  it("rejects invalid auth config without mutating stored config", async () => {
    const first = await writeConfig({
      canonicalOrigin,
      relyingPartyId,
      relyingPartyName,
      now: createdAt,
    });
    const rejected = await fetchInstanceAuth("/config", {
      body: JSON.stringify({
        canonicalOrigin: "https://other.example.net",
        relyingPartyId,
        relyingPartyName,
        now: updatedAt,
      }),
      method: "POST",
    });
    const stored = await getJson<{ config: StoredInstanceAuthConfig | null }>("/config");

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error:
        "Instance auth relying-party id must match or be a parent domain of the canonical origin.",
    });
    expect(stored.config).toEqual(first);
  });

  it("creates, consumes, rejects replay, expires, and deletes passkey challenges", async () => {
    const registration = await createChallenge({
      kind: "registration",
      challenge: registrationChallenge,
      setupTokenHash,
      createdAt,
      expiresAt,
    });

    expect(registration).toEqual({
      ok: true,
      challenge: {
        id: expect.any(String),
        kind: "registration",
        challenge: registrationChallenge,
        setupTokenHash,
        createdAt,
        expiresAt,
      },
    });

    const consumed = await consumeChallenge({
      kind: "registration",
      challenge: registrationChallenge,
      now: updatedAt,
    });
    const replay = await consumeChallenge({
      kind: "registration",
      challenge: registrationChallenge,
      now: updatedAt,
    });

    expect(consumed).toEqual({
      ok: true,
      challenge: {
        ...(registration.ok ? registration.challenge : undefined),
        consumedAt: updatedAt,
      },
    });
    expect(replay).toEqual({
      ok: false,
      challenge: consumed.ok ? consumed.challenge : undefined,
      reason: "already-consumed",
    });

    await createChallenge({
      kind: "login",
      challenge: loginChallenge,
      principalId,
      createdAt,
      expiresAt: expiredAt,
    });

    const expired = await consumeChallenge({
      kind: "login",
      challenge: loginChallenge,
      now: updatedAt,
    });
    const expiredCount = await postJson<{ expired: number }>("/expire", { now: updatedAt });

    expect(expired).toEqual({
      ok: false,
      challenge: {
        id: expect.any(String),
        kind: "login",
        challenge: loginChallenge,
        principalId,
        createdAt,
        expiresAt: expiredAt,
      },
      reason: "expired-challenge",
    });
    expect(expiredCount).toEqual({ expired: 1 });
    expect(await readChallenge(loginChallenge)).toEqual({ challenge: null });

    await createChallenge({
      kind: "login",
      challenge: deleteChallenge,
      principalId,
      createdAt,
      expiresAt,
    });

    expect(
      await postJson<{ deleted: boolean }>("/delete-challenge", { challenge: deleteChallenge }),
    ).toEqual({ deleted: true });
    expect(await readChallenge(deleteChallenge)).toEqual({ challenge: null });
  });

  it("prevents duplicate passkey credentials and updates verification facts", async () => {
    const created = await createCredential();
    const duplicate = await createCredential({ principalId: "principal-2" });
    const updated = await updateCredentialVerification({
      credentialId,
      counter: 9,
      credentialBackedUp: true,
      credentialDeviceType: "multiDevice",
      origin: canonicalOrigin,
      relyingPartyId,
      userVerified: true,
      verifiedAt: updatedAt,
    });
    const regression = await updateCredentialVerification({
      credentialId,
      counter: 8,
      credentialBackedUp: true,
      credentialDeviceType: "multiDevice",
      origin: canonicalOrigin,
      relyingPartyId,
      userVerified: true,
      verifiedAt: "2026-05-21T00:10:00.000Z",
    });
    const stored = await readCredential(credentialId);
    const principalCredentials = await getJson<{ credentials: StoredPasskeyCredential[] }>(
      `/credentials?principalId=${principalId}`,
    );
    const webauthnCredential = await getJson<{
      credential: { counter: number; id: string; publicKey: number[]; transports?: string[] };
    }>(`/webauthn-credential?id=${credentialId}`);

    expect(created).toEqual({
      ok: true,
      credential: {
        credentialId,
        principalId,
        publicKeyBase64Url,
        counter: 3,
        transports: ["internal", "hybrid"],
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        createdAt,
        updatedAt: createdAt,
      },
    });
    expect(duplicate).toEqual({
      ok: false,
      credential: created.ok ? created.credential : undefined,
      reason: "duplicate-credential-id",
    });
    expect(updated).toEqual({
      ok: true,
      credential: {
        ...(created.ok ? created.credential : undefined),
        counter: 9,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        userVerified: true,
        lastVerifiedAt: updatedAt,
        lastVerificationOrigin: canonicalOrigin,
        lastVerificationRelyingPartyId: relyingPartyId,
        updatedAt,
      },
    });
    expect(regression).toEqual({
      ok: false,
      credential: updated.ok ? updated.credential : undefined,
      reason: "counter-regression",
    });
    expect(stored.credential).toEqual(updated.ok ? updated.credential : undefined);
    expect(principalCredentials.credentials).toEqual([updated.ok ? updated.credential : undefined]);
    expect(webauthnCredential.credential).toEqual({
      id: credentialId,
      publicKey,
      counter: 9,
      transports: ["internal", "hybrid"],
    });
  });

  it("stores central auth sessions and host revocation versions as private auth state", async () => {
    const created = await createCentralSession();
    const duplicate = await createCentralSession({ principalId: "principal-2" });
    const revoked = await revokeCentralSession(centralSessionIdHash, updatedAt);
    const storedSession = await readCentralSession(centralSessionIdHash);
    const missingVersion = await readHostSessionRevocationVersion();
    const firstVersion = await bumpHostSessionRevocationVersion(createdAt);
    const secondVersion = await bumpHostSessionRevocationVersion(updatedAt);
    const storedVersion = await readHostSessionRevocationVersion();

    expect(created).toEqual({
      ok: true,
      session: {
        sessionIdHash: centralSessionIdHash,
        instanceId,
        principalId,
        issuedAt: createdAt,
        expiresAt,
      },
    });
    expect(duplicate).toEqual({
      ok: false,
      reason: "duplicate-session",
      session: created.ok ? created.session : undefined,
    });
    expect(revoked).toEqual({
      ok: true,
      session: {
        ...(created.ok ? created.session : undefined),
        revokedAt: updatedAt,
      },
    });
    expect(storedSession.session).toEqual(revoked.ok ? revoked.session : undefined);
    expect(missingVersion.version).toBeNull();
    expect(firstVersion).toEqual({
      instanceId,
      principalId,
      targetOrigin,
      routeId,
      targetProfile: "app",
      appInstallId,
      storageIdentity,
      sessionVersion: 1,
      updatedAt: createdAt,
    });
    expect(secondVersion).toEqual({
      ...firstVersion,
      sessionVersion: 2,
      updatedAt,
    });
    expect(storedVersion.version).toEqual(secondVersion);
  });

  it("stores one-time handoff grants with hashed secrets and consumed status", async () => {
    const created = await createHandoffGrant();
    const duplicateBySecret = await createHandoffGrant({
      grantId: duplicateGrantId,
      grantSecretHash,
    });
    const consumed = await consumeHandoffGrant(grantId, updatedAt);
    const replay = await consumeHandoffGrant(grantId, updatedAt);
    const stored = await readHandoffGrant(grantId);

    await createHandoffGrant({
      grantId: expiredGrantId,
      grantSecretHash: expiredGrantSecretHash,
      expiresAt: expiredAt,
    });

    const expired = await consumeHandoffGrant(expiredGrantId, updatedAt);
    const rejectedUnsafeReturn = await fetchInstanceAuth("/handoff-grant", {
      body: JSON.stringify({
        ...handoffGrantInput(),
        grantId: "dW5zYWZlLXJldHVybg",
        grantSecretHash: duplicateGrantSecretHash,
        returnTo: "https://example.com/settings",
      }),
      method: "POST",
    });

    expect(created).toEqual({
      ok: true,
      grant: {
        grantId,
        grantSecretHash,
        instanceId,
        principalId,
        targetOrigin,
        routeId,
        targetProfile: "app",
        appInstallId,
        storageIdentity,
        returnTo,
        nonceHash,
        state,
        createdAt,
        expiresAt,
      },
    });
    expect(duplicateBySecret).toEqual({
      ok: false,
      grant: created.ok ? created.grant : undefined,
      reason: "duplicate-grant-secret-hash",
    });
    expect(consumed).toEqual({
      ok: true,
      grant: {
        ...(created.ok ? created.grant : undefined),
        consumedAt: updatedAt,
      },
    });
    expect(replay).toEqual({
      ok: false,
      grant: consumed.ok ? consumed.grant : undefined,
      reason: "already-consumed",
    });
    expect(stored.grant).toEqual(consumed.ok ? consumed.grant : undefined);
    expect(expired).toEqual({
      ok: false,
      grant: {
        ...(created.ok ? created.grant : undefined),
        grantId: expiredGrantId,
        grantSecretHash: expiredGrantSecretHash,
        expiresAt: expiredAt,
      },
      reason: "expired-grant",
    });
    expect(rejectedUnsafeReturn.status).toBe(400);
    expect(await rejectedUnsafeReturn.json()).toEqual({
      error: "Handoff grant return target must be a safe path-only redirect target.",
    });
  });

  it("reports missing credentials before verification facts are updated", async () => {
    expect(
      await updateCredentialVerification({
        credentialId,
        counter: 1,
        credentialBackedUp: false,
        credentialDeviceType: "singleDevice",
        origin: canonicalOrigin,
        relyingPartyId,
        userVerified: false,
        verifiedAt: updatedAt,
      }),
    ).toEqual({
      ok: false,
      reason: "missing-credential",
    });
  });
});

function writeConfig(input: {
  canonicalOrigin: string;
  relyingPartyId: string;
  relyingPartyName: string;
  now: string;
}) {
  return postJson<StoredInstanceAuthConfig>("/config", input);
}

function createChallenge(input: unknown) {
  return postJson<CreatePasskeyChallengeResult>("/challenge", input);
}

function consumeChallenge(input: unknown) {
  return postJson<ConsumePasskeyChallengeResult>("/consume", input);
}

function readChallenge(challenge: string) {
  return getJson<{ challenge: StoredPasskeyChallenge | null }>(`/challenge?challenge=${challenge}`);
}

function createCredential(overrides: Partial<{ principalId: string }> = {}) {
  return postJson<CreatePasskeyCredentialResult>("/credential", {
    credentialId,
    principalId: overrides.principalId ?? principalId,
    publicKey,
    counter: 3,
    transports: ["internal", "hybrid"],
    credentialDeviceType: "singleDevice",
    credentialBackedUp: false,
    createdAt,
  });
}

function updateCredentialVerification(input: unknown) {
  return postJson<UpdatePasskeyCredentialVerificationResult>("/credential/verify", input);
}

function readCredential(id: string) {
  return getJson<{ credential: StoredPasskeyCredential | null }>(`/credential?id=${id}`);
}

function createCentralSession(overrides: Partial<{ principalId: string }> = {}) {
  return postJson<CreateCentralAuthSessionResult>("/central-session", {
    sessionIdHash: centralSessionIdHash,
    instanceId,
    principalId: overrides.principalId ?? principalId,
    issuedAt: createdAt,
    expiresAt,
  });
}

function readCentralSession(idHash: string) {
  return getJson<{ session: StoredCentralAuthSession | null }>(`/central-session?idHash=${idHash}`);
}

function revokeCentralSession(idHash: string, now: string) {
  return postJson<RevokeCentralAuthSessionResult>("/central-session/revoke", { idHash, now });
}

function readHostSessionRevocationVersion() {
  return getJson<{ version: StoredHostSessionRevocationVersion | null }>(
    `/host-session-version?${new URLSearchParams(hostSessionTarget()).toString()}`,
  );
}

function bumpHostSessionRevocationVersion(now: string) {
  return postJson<StoredHostSessionRevocationVersion>("/host-session-version/bump", {
    ...hostSessionTarget(),
    now,
  });
}

function createHandoffGrant(overrides: Partial<ReturnType<typeof handoffGrantInput>> = {}) {
  return postJson<CreateHandoffGrantResult>("/handoff-grant", {
    ...handoffGrantInput(),
    ...overrides,
  });
}

function readHandoffGrant(id: string) {
  return getJson<{ grant: StoredHandoffGrant | null }>(`/handoff-grant?id=${id}`);
}

function consumeHandoffGrant(id: string, now: string) {
  return postJson<ConsumeHandoffGrantResult>("/handoff-grant/consume", { grantId: id, now });
}

function handoffGrantInput() {
  return {
    grantId,
    grantSecretHash,
    instanceId,
    principalId,
    targetOrigin,
    routeId,
    targetProfile: "app",
    appInstallId,
    storageIdentity,
    returnTo,
    nonceHash,
    state,
    createdAt,
    expiresAt,
  };
}

function hostSessionTarget() {
  return {
    instanceId,
    principalId,
    targetOrigin,
    routeId,
    targetProfile: "app",
    appInstallId,
    storageIdentity,
  };
}

async function getJson<T>(path: string) {
  const response = await fetchInstanceAuth(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown) {
  const response = await fetchInstanceAuth(path, {
    body: JSON.stringify(body),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function fetchInstanceAuth(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, {
    ...init,
    headers: { "x-instance-auth-harness-name": instanceAuthHarnessName },
  });
}

async function writeInstanceAuthHarness() {
  instanceAuthHarnessDir = await mkdtemp(join(tmpdir(), "formless-instance-auth-harness-"));
  const tempDir = instanceAuthHarnessDir;
  const harnessPath = join(tempDir, "instance-auth-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        bumpHostSessionRevocationVersion,
        consumeHandoffGrant,
        consumePasskeyChallenge,
        createCentralAuthSession,
        createHandoffGrant,
        createPasskeyChallenge,
        createPasskeyCredential,
        deletePasskeyChallenge,
        ensureInstanceAuthTables,
        expirePasskeyChallenges,
        passkeyCredentialToWebAuthnCredential,
        readCentralAuthSession,
        readHandoffGrant,
        readHostSessionRevocationVersion,
        readInstanceAuthConfig,
        readPasskeyChallenge,
        readPasskeyCredential,
        readPasskeyCredentialsForPrincipal,
        revokeCentralAuthSession,
        updatePasskeyCredentialVerification,
        writeInstanceAuthConfig,
      } from "${process.cwd()}/src/worker/instance-auth-state.ts";

      export class InstanceAuthHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureInstanceAuthTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          try {
            if (request.method === "GET" && url.pathname === "/config") {
              return Response.json({ config: readInstanceAuthConfig(this.ctx.storage) ?? null });
            }

            if (request.method === "POST" && url.pathname === "/config") {
              return Response.json(writeInstanceAuthConfig(this.ctx.storage, await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/central-session") {
              return Response.json(createCentralAuthSession(this.ctx.storage, await request.json()));
            }

            if (request.method === "GET" && url.pathname === "/central-session") {
              return Response.json({
                session: readCentralAuthSession(this.ctx.storage, url.searchParams.get("idHash")) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/central-session/revoke") {
              const body = await request.json();

              return Response.json(
                revokeCentralAuthSession(this.ctx.storage, body.idHash, body.now),
              );
            }

            if (request.method === "GET" && url.pathname === "/host-session-version") {
              return Response.json({
                version: readHostSessionRevocationVersion(
                  this.ctx.storage,
                  targetBindingFromSearch(url),
                ) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/host-session-version/bump") {
              return Response.json(
                bumpHostSessionRevocationVersion(this.ctx.storage, await request.json()),
              );
            }

            if (request.method === "POST" && url.pathname === "/handoff-grant") {
              return Response.json(createHandoffGrant(this.ctx.storage, await request.json()));
            }

            if (request.method === "GET" && url.pathname === "/handoff-grant") {
              return Response.json({
                grant: readHandoffGrant(this.ctx.storage, url.searchParams.get("id")) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/handoff-grant/consume") {
              return Response.json(consumeHandoffGrant(this.ctx.storage, await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/challenge") {
              return Response.json(createPasskeyChallenge(this.ctx.storage, await request.json()));
            }

            if (request.method === "GET" && url.pathname === "/challenge") {
              return Response.json({
                challenge: readPasskeyChallenge(this.ctx.storage, url.searchParams.get("challenge")) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/consume") {
              return Response.json(consumePasskeyChallenge(this.ctx.storage, await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/expire") {
              const body = await request.json();

              return Response.json({ expired: expirePasskeyChallenges(this.ctx.storage, body.now) });
            }

            if (request.method === "POST" && url.pathname === "/delete-challenge") {
              const body = await request.json();

              return Response.json({
                deleted: deletePasskeyChallenge(this.ctx.storage, body.challenge),
              });
            }

            if (request.method === "POST" && url.pathname === "/credential") {
              const body = await request.json();

              return Response.json(
                createPasskeyCredential(this.ctx.storage, {
                  ...body,
                  publicKey: new Uint8Array(body.publicKey),
                }),
              );
            }

            if (request.method === "GET" && url.pathname === "/credential") {
              return Response.json({
                credential: readPasskeyCredential(this.ctx.storage, url.searchParams.get("id")) ?? null,
              });
            }

            if (request.method === "GET" && url.pathname === "/credentials") {
              return Response.json({
                credentials: readPasskeyCredentialsForPrincipal(
                  this.ctx.storage,
                  url.searchParams.get("principalId"),
                ),
              });
            }

            if (request.method === "POST" && url.pathname === "/credential/verify") {
              return Response.json(
                updatePasskeyCredentialVerification(this.ctx.storage, await request.json()),
              );
            }

            if (request.method === "GET" && url.pathname === "/webauthn-credential") {
              const credential = readPasskeyCredential(this.ctx.storage, url.searchParams.get("id"));

              if (!credential) {
                return Response.json({ credential: null });
              }

              const webauthnCredential = passkeyCredentialToWebAuthnCredential(credential);

              return Response.json({
                credential: {
                  id: webauthnCredential.id,
                  publicKey: Array.from(webauthnCredential.publicKey),
                  counter: webauthnCredential.counter,
                  ...(webauthnCredential.transports === undefined
                    ? {}
                    : { transports: webauthnCredential.transports }),
                },
              });
            }

            return Response.json({ error: "Not found." }, { status: 404 });
          } catch (error) {
            return Response.json(
              { error: error instanceof Error ? error.message : "Unknown error." },
              { status: 400 },
            );
          }
        }
      }

      function targetBindingFromSearch(url) {
        return {
          instanceId: url.searchParams.get("instanceId") ?? undefined,
          principalId: url.searchParams.get("principalId") ?? undefined,
          targetOrigin: url.searchParams.get("targetOrigin") ?? undefined,
          routeId: url.searchParams.get("routeId") ?? undefined,
          targetProfile: url.searchParams.get("targetProfile") ?? undefined,
          appInstallId: url.searchParams.get("appInstallId") ?? undefined,
          storageIdentity: url.searchParams.get("storageIdentity") ?? undefined,
        };
      }

      export default {
        fetch(request, env) {
          const id = env.INSTANCE_AUTH_HARNESS.idFromName(
            request.headers.get("x-instance-auth-harness-name") ?? "default",
          );

          return env.INSTANCE_AUTH_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
