import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  ConsumePasskeyChallengeResult,
  CreatePasskeyChallengeResult,
  CreatePasskeyCredentialResult,
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
const ownerId = "owner-1";
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
      ownerId,
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
        ownerId,
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
      ownerId,
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
    const duplicate = await createCredential({ ownerId: "owner-2" });
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
    const ownerCredentials = await getJson<{ credentials: StoredPasskeyCredential[] }>(
      `/credentials?ownerId=${ownerId}`,
    );
    const webauthnCredential = await getJson<{
      credential: { counter: number; id: string; publicKey: number[]; transports?: string[] };
    }>(`/webauthn-credential?id=${credentialId}`);

    expect(created).toEqual({
      ok: true,
      credential: {
        credentialId,
        ownerId,
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
    expect(ownerCredentials.credentials).toEqual([updated.ok ? updated.credential : undefined]);
    expect(webauthnCredential.credential).toEqual({
      id: credentialId,
      publicKey,
      counter: 9,
      transports: ["internal", "hybrid"],
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

function createCredential(overrides: Partial<{ ownerId: string }> = {}) {
  return postJson<CreatePasskeyCredentialResult>("/credential", {
    credentialId,
    ownerId: overrides.ownerId ?? ownerId,
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
        consumePasskeyChallenge,
        createPasskeyChallenge,
        createPasskeyCredential,
        deletePasskeyChallenge,
        ensureInstanceAuthTables,
        expirePasskeyChallenges,
        passkeyCredentialToWebAuthnCredential,
        readInstanceAuthConfig,
        readPasskeyChallenge,
        readPasskeyCredential,
        readPasskeyCredentialsForOwner,
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
                credentials: readPasskeyCredentialsForOwner(
                  this.ctx.storage,
                  url.searchParams.get("ownerId"),
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
