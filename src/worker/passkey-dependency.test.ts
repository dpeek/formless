import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
let harnessDir: string | undefined;

beforeAll(async () => {
  harness = await createWorkerHarness(await writePasskeyDependencyHarness(), {});
});

afterAll(async () => {
  await harness.dispose();

  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("passkey dependency boundary", () => {
  it("bundles SimpleWebAuthn server primitives in the Worker test runtime", async () => {
    const response = await harness.fetch("/");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authentication: {
        challenge: "Ykc5bmFXNHRZMmhoYkd4bGJtZGw",
        rpId: "example.com",
      },
      registration: {
        challenge: "Y21WbmFYTjBjbUYwYVc5dUxXTm9ZV3hzWlc1blpR",
        rp: { id: "example.com", name: "Formless" },
      },
      verify: {
        authentication: "function",
        registration: "function",
      },
    });
  });
});

async function writePasskeyDependencyHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-passkey-dependency-harness-"));
  const harnessPath = join(harnessDir, "passkey-dependency-harness.ts");

  await writeFile(
    harnessPath,
    `
      import {
        generateAuthenticationOptions,
        generateRegistrationOptions,
        verifyAuthenticationResponse,
        verifyRegistrationResponse,
      } from "@simplewebauthn/server";

      export default {
        async fetch() {
          const registration = await generateRegistrationOptions({
            rpID: "example.com",
            rpName: "Formless",
            userID: new Uint8Array([1, 2, 3, 4]),
            userName: "ada@example.com",
            userDisplayName: "Ada Owner",
            challenge: "cmVnaXN0cmF0aW9uLWNoYWxsZW5nZQ",
          });
          const authentication = await generateAuthenticationOptions({
            rpID: "example.com",
            allowCredentials: [{ id: "Y3JlZGVudGlhbC0x", transports: ["internal"] }],
            challenge: "bG9naW4tY2hhbGxlbmdl",
          });

          return Response.json({
            authentication: {
              challenge: authentication.challenge,
              rpId: authentication.rpId,
            },
            registration: {
              challenge: registration.challenge,
              rp: registration.rp,
            },
            verify: {
              authentication: typeof verifyAuthenticationResponse,
              registration: typeof verifyRegistrationResponse,
            },
          });
        },
      };
    `,
  );

  return harnessPath;
}
