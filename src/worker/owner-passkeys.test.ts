import { createHash, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import type {
  OwnerPasskeyLoginOptionsResponse,
  OwnerPasskeyLoginVerifyResponse,
  OwnerPasskeyRegistrationOptionsResponse,
  OwnerPasskeyRegistrationVerifyResponse,
} from "../shared/instance-auth.ts";
import { OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const otherSetupToken = "xyzXYZ0123456789_-xyzXYZ0123456789_-";
const canonicalOrigin = "https://example.com";
const relyingPartyId = "example.com";
const relyingPartyName = "Formless";
const futureExpiresAt = "2999-01-01T00:00:00.000Z";
const credentialId = "Y3JlZGVudGlhbC0x";

let harness: Harness;
let harnessDir: string | undefined;
let harnessPath: string;

beforeAll(async () => {
  harnessPath = await writeOwnerPasskeyHarness();
});

beforeEach(async () => {
  harness = await createWorkerHarness(
    harnessPath,
    {
      PASSKEY_API_HARNESS: { className: "OwnerPasskeyApiHarness", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

afterAll(async () => {
  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("owner passkey API routes", () => {
  it("creates registration options only after auth config and setup capability validation", async () => {
    await configureAuth();

    const missingCapability = await postJson("/api/formless/passkeys/register/options", {
      setupToken,
    });

    expect(missingCapability.response.status).toBe(404);
    expect(missingCapability.body).toEqual({
      error: "Owner setup link is missing or has already been used.",
      reason: "missing-capability",
      setupComplete: false,
    });

    await createSetupCapability();

    const wrongToken = await postJson("/api/formless/passkeys/register/options", {
      setupToken: otherSetupToken,
    });
    const accepted = await postJson<OwnerPasskeyRegistrationOptionsResponse>(
      "/api/formless/passkeys/register/options",
      { setupToken },
    );

    expect(wrongToken.response.status).toBe(401);
    expect(wrongToken.body).toEqual({
      error: "Owner setup link is invalid.",
      reason: "invalid-token",
      setupComplete: false,
    });
    expect(accepted.response.status).toBe(200);
    expect(accepted.response.headers.get("Cache-Control")).toBe("no-store");
    expect(accepted.body.options.rp).toEqual({ id: relyingPartyId, name: relyingPartyName });
    expect(accepted.body.options.challenge).toEqual(expect.any(String));
    expect(JSON.stringify(accepted.body)).not.toContain(setupToken);
  });

  it("verifies registration against challenge, origin, RP id, and setup capability", async () => {
    await configureAuth();
    await createSetupCapability();

    const authenticator = new VirtualPasskey(credentialId);
    const options = await registrationOptions();
    const wrongOrigin = await postJson("/api/formless/passkeys/register/verify", {
      setupToken,
      owner: { name: "Ada Owner" },
      response: authenticator.registrationResponse(options.body.options, {
        origin: "https://other.example.com",
        rpId: relyingPartyId,
      }),
    });
    const replayAfterFailedVerify = await postJson("/api/formless/passkeys/register/verify", {
      setupToken,
      owner: { name: "Ada Owner" },
      response: authenticator.registrationResponse(options.body.options, {
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    });

    expect(wrongOrigin.response.status).toBe(401);
    expect(wrongOrigin.body).toEqual({
      error: "Passkey registration verification failed.",
    });
    expect(replayAfterFailedVerify.response.status).toBe(401);
    expect(replayAfterFailedVerify.body).toEqual({
      error: "Passkey challenge is invalid.",
    });

    const freshOptions = await registrationOptions();
    const wrongRpId = await postJson("/api/formless/passkeys/register/verify", {
      setupToken,
      owner: { name: "Ada Owner" },
      response: authenticator.registrationResponse(freshOptions.body.options, {
        origin: canonicalOrigin,
        rpId: "login.example.com",
      }),
    });

    expect(wrongRpId.response.status).toBe(401);
    expect(wrongRpId.body).toEqual({
      error: "Passkey registration verification failed.",
    });

    const successfulOptions = await registrationOptions();
    const verified = await postJson<OwnerPasskeyRegistrationVerifyResponse>(
      "/api/formless/passkeys/register/verify",
      {
        setupToken,
        owner: { name: "Ada Owner", email: "ada@example.com" },
        response: authenticator.registrationResponse(successfulOptions.body.options, {
          origin: canonicalOrigin,
          rpId: relyingPartyId,
        }),
      },
    );

    expect(verified.response.status).toBe(200);
    expect(verified.body).toEqual({
      setupComplete: true,
      owner: {
        id: expect.any(String),
        name: "Ada Owner",
        email: "ada@example.com",
        createdAt: expect.any(String),
      },
    });
  });

  it("creates login options and verifies assertions against owner credential facts", async () => {
    const authenticator = new VirtualPasskey(credentialId);
    const registered = await registerOwnerPasskey(authenticator);

    const options = await loginOptions();

    expect(options.response.status).toBe(200);
    expect(options.body.options.rpId).toBe(relyingPartyId);
    expect(options.body.options.allowCredentials).toEqual([
      { id: credentialId, type: "public-key", transports: ["internal"] },
    ]);

    const accepted = await verifyLogin(
      authenticator.authenticationResponse(options.body.options, {
        counter: 1,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );
    const replay = await verifyLogin(
      authenticator.authenticationResponse(options.body.options, {
        counter: 2,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );

    expect(accepted.response.status).toBe(200);
    expect(accepted.response.headers.get("Set-Cookie")).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(accepted.body).toEqual({
      authenticated: true,
      owner: registered.body.owner,
      session: { expiresAt: expect.any(String) },
    });
    expect(replay.response.status).toBe(401);
    expect(replay.body).toEqual({ error: "Passkey challenge is invalid." });

    const wrongCredentialOptions = await loginOptions();
    const wrongCredential = await verifyLogin(
      new VirtualPasskey("Y3JlZGVudGlhbC0y").authenticationResponse(
        wrongCredentialOptions.body.options,
        {
          counter: 2,
          origin: canonicalOrigin,
          rpId: relyingPartyId,
        },
      ),
    );

    expect(wrongCredential.response.status).toBe(401);
    expect(wrongCredential.body).toEqual({
      authenticated: false,
      error: "Passkey credential is invalid.",
    });

    const wrongOriginOptions = await loginOptions();
    const wrongOrigin = await verifyLogin(
      authenticator.authenticationResponse(wrongOriginOptions.body.options, {
        counter: 2,
        origin: "https://other.example.com",
        rpId: relyingPartyId,
      }),
    );

    expect(wrongOrigin.response.status).toBe(401);
    expect(wrongOrigin.body).toEqual({
      authenticated: false,
      error: "Passkey login verification failed.",
    });

    const wrongRpOptions = await loginOptions();
    const wrongRp = await verifyLogin(
      authenticator.authenticationResponse(wrongRpOptions.body.options, {
        counter: 2,
        origin: canonicalOrigin,
        rpId: "login.example.com",
      }),
    );

    expect(wrongRp.response.status).toBe(401);
    expect(wrongRp.body).toEqual({
      authenticated: false,
      error: "Passkey login verification failed.",
    });

    const counterRegressionOptions = await loginOptions();
    const counterRegression = await verifyLogin(
      authenticator.authenticationResponse(counterRegressionOptions.body.options, {
        counter: 1,
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    );

    expect(counterRegression.response.status).toBe(401);
    expect(counterRegression.body).toEqual({
      authenticated: false,
      error: "Passkey login verification failed.",
    });
  });

  it("rejects login options before setup is complete", async () => {
    await configureAuth();

    const rejected = await postJson("/api/formless/passkeys/login/options", {});

    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toEqual({
      error: "Owner setup must be complete before passkey login.",
    });
  });
});

async function configureAuth() {
  const response = await postJson("/harness/config", {
    canonicalOrigin,
    relyingPartyId,
    relyingPartyName,
  });

  expect(response.response.status).toBe(200);
}

async function createSetupCapability() {
  const response = await postJson("/harness/setup/capability", {
    setupToken,
    expiresAt: futureExpiresAt,
  });

  expect(response.response.status).toBe(200);
}

async function registrationOptions() {
  const response = await postJson<OwnerPasskeyRegistrationOptionsResponse>(
    "/api/formless/passkeys/register/options",
    { setupToken },
  );

  expect(response.response.status).toBe(200);

  return response;
}

async function loginOptions() {
  const response = await postJson<OwnerPasskeyLoginOptionsResponse>(
    "/api/formless/passkeys/login/options",
    {},
  );

  expect(response.response.status).toBe(200);

  return response;
}

async function registerOwnerPasskey(authenticator: VirtualPasskey) {
  await configureAuth();
  await createSetupCapability();

  const options = await registrationOptions();
  const response = await postJson<OwnerPasskeyRegistrationVerifyResponse>(
    "/api/formless/passkeys/register/verify",
    {
      setupToken,
      owner: { name: "Ada Owner", email: "ada@example.com" },
      response: authenticator.registrationResponse(options.body.options, {
        origin: canonicalOrigin,
        rpId: relyingPartyId,
      }),
    },
  );

  expect(response.response.status).toBe(200);

  return response;
}

async function verifyLogin(response: AuthenticationResponseJSON) {
  return postJson<OwnerPasskeyLoginVerifyResponse | { authenticated?: false; error: string }>(
    "/api/formless/passkeys/login/verify",
    { response },
  );
}

async function postJson<T = unknown>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}

class VirtualPasskey {
  private readonly credentialId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(credentialIdValue: string) {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    this.credentialId = credentialIdValue;
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  registrationResponse(
    options: PublicKeyCredentialCreationOptionsJSON,
    input: { origin: string; rpId: string },
  ): RegistrationResponseJSON {
    const clientDataJSON = clientDataJson("webauthn.create", options.challenge, input.origin);
    const authData = registrationAuthenticatorData({
      credentialId: base64UrlDecode(this.credentialId),
      credentialPublicKey: this.credentialPublicKey(),
      counter: 0,
      rpId: input.rpId,
    });
    const attestationObject = cborMap([
      ["fmt", "none"],
      ["attStmt", []],
      ["authData", authData],
    ]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        attestationObject: base64UrlEncode(attestationObject),
        transports: ["internal"],
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  authenticationResponse(
    options: PublicKeyCredentialRequestOptionsJSON,
    input: { counter: number; origin: string; rpId: string },
  ): AuthenticationResponseJSON {
    const clientDataJSON = clientDataJson("webauthn.get", options.challenge, input.origin);
    const authenticatorData = authenticationAuthenticatorData({
      counter: input.counter,
      rpId: input.rpId,
    });
    const clientDataHash = sha256(clientDataJSON);
    const signatureBase = concatBytes([authenticatorData, clientDataHash]);
    const signature = createSign("SHA256").update(Buffer.from(signatureBase)).sign(this.privateKey);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        authenticatorData: base64UrlEncode(authenticatorData),
        signature: base64UrlEncode(signature),
        userHandle: base64UrlEncode(new TextEncoder().encode("owner")),
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  private credentialPublicKey(): Uint8Array {
    const jwk = this.publicKey.export({ format: "jwk" }) as JsonWebKey;

    if (!jwk.x || !jwk.y) {
      throw new Error("Virtual passkey public key export is missing coordinates.");
    }

    return cborMap([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, base64UrlDecode(jwk.x)],
      [-3, base64UrlDecode(jwk.y)],
    ]);
  }
}

function registrationAuthenticatorData(input: {
  counter: number;
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
  rpId: string;
}) {
  const credentialIdLength = new Uint8Array(2);
  const credentialIdLengthView = new DataView(credentialIdLength.buffer);

  credentialIdLengthView.setUint16(0, input.credentialId.byteLength, false);

  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([0x45]),
    uint32(input.counter),
    new Uint8Array(16),
    credentialIdLength,
    input.credentialId,
    input.credentialPublicKey,
  ]);
}

function authenticationAuthenticatorData(input: { counter: number; rpId: string }) {
  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([0x05]),
    uint32(input.counter),
  ]);
}

function clientDataJson(
  type: "webauthn.create" | "webauthn.get",
  challenge: string,
  origin: string,
) {
  return new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
}

type CborMapKey = number | string;
type CborMapEntry = readonly [CborMapKey, CborValue];
type CborValue = number | string | Uint8Array | readonly CborMapEntry[];

function cborMap(entries: readonly CborMapEntry[]): Uint8Array {
  return concatBytes([
    cborHeader(5, entries.length),
    ...entries.flatMap(([key, value]) => [cborEncode(key), cborEncode(value)]),
  ]);
}

function cborEncode(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }

  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);

    return concatBytes([cborHeader(3, bytes.byteLength), bytes]);
  }

  if (value instanceof Uint8Array) {
    return concatBytes([cborHeader(2, value.byteLength), value]);
  }

  return cborMap(value);
}

function cborHeader(major: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("CBOR value must be a non-negative integer.");
  }

  if (value < 24) {
    return new Uint8Array([(major << 5) | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([(major << 5) | 24, value]);
  }

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3);
    const view = new DataView(bytes.buffer);

    bytes[0] = (major << 5) | 25;
    view.setUint16(1, value, false);

    return bytes;
  }

  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);

  bytes[0] = (major << 5) | 26;
  view.setUint32(1, value, false);

  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, value, false);

  return bytes;
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function writeOwnerPasskeyHarness() {
  harnessDir = await mkdtemp(resolve("tmp", "test", ".owner-passkey-api-harness-"));
  const path = join(harnessDir, "owner-passkey-api-harness.ts");

  await writeFile(
    path,
    `
      import { DurableObject } from "cloudflare:workers";

      import { nowIsoString } from "${process.cwd()}/src/shared/clock.ts";
      import { handleOwnerPasskeyDurableObjectRequest } from "${process.cwd()}/src/worker/owner-passkeys.ts";
      import { hashOwnerSetupToken, writeOwnerSetupCapability } from "${process.cwd()}/src/worker/instance-setup-state.ts";
      import { writeInstanceAuthConfig } from "${process.cwd()}/src/worker/instance-auth-state.ts";

      export class OwnerPasskeyApiHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          this.bindings = env;
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "POST" && url.pathname === "/harness/config") {
            const config = writeInstanceAuthConfig(this.ctx.storage, await request.json());

            return Response.json({ config });
          }

          if (request.method === "POST" && url.pathname === "/harness/setup/capability") {
            const body = await request.json();
            const capability = writeOwnerSetupCapability(this.ctx.storage, {
              tokenHash: await hashOwnerSetupToken(body.setupToken),
              instanceId: url.hostname.toLowerCase(),
              createdAt: nowIsoString(),
              expiresAt: body.expiresAt,
            });

            return Response.json(capability);
          }

          const passkeyResponse = await handleOwnerPasskeyDurableObjectRequest(
            request,
            this.ctx.storage,
            this.bindings,
          );

          return passkeyResponse ?? Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      export default {
        fetch(request, env) {
          const id = env.PASSKEY_API_HARNESS.idFromName("default");

          return env.PASSKEY_API_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return path;
}
