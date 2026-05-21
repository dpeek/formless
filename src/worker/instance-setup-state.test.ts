import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { OwnerSetupCompleteRequest } from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  CompleteFirstOwnerSetupResult,
  InstanceSetupState,
  WriteOwnerSetupCapabilityResult,
} from "./instance-setup-state.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const instanceId = "brothers-remote-instance.workers.dev";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const otherSetupToken = "xyzXYZ0123456789_-xyzXYZ0123456789_-";
const createdAt = "2026-05-21T00:00:00.000Z";
const completedAt = "2026-05-21T00:01:00.000Z";
const expiresAt = "2026-05-21T01:00:00.000Z";

let harness: Harness;
let instanceSetupHarnessDir: string | undefined;
let instanceSetupHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeInstanceSetupHarness(), {
    INSTANCE_SETUP_HARNESS: { className: "InstanceSetupHarness", useSQLite: true },
  });
});

beforeEach(() => {
  instanceSetupHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (instanceSetupHarnessDir) {
    await rm(instanceSetupHarnessDir, { recursive: true, force: true });
    instanceSetupHarnessDir = undefined;
  }
});

describe("instance setup state", () => {
  it("hashes setup tokens without preserving the raw URL capability", async () => {
    const first = await getJson<{ hash: string }>(`/hash?token=${setupToken}`);
    const second = await getJson<{ hash: string }>(`/hash?token=${setupToken}`);

    expect(first.hash).toBe(second.hash);
    expect(first.hash).not.toBe(setupToken);
    expect(first.hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("persists one setup capability before the first owner exists", async () => {
    const written = await writeCapability();
    const state = await getJson<InstanceSetupState>("/state");

    expect(written).toEqual({
      ok: true,
      capability: {
        tokenHash: expect.any(String),
        instanceId,
        createdAt,
        expiresAt,
      },
    });
    expect(written.ok && written.capability.tokenHash).not.toBe(setupToken);
    expect(state).toEqual({
      setupComplete: false,
      owner: null,
      capability: written.ok ? written.capability : null,
    });
  });

  it("creates the first owner atomically when token, instance, and expiry match", async () => {
    await writeCapability();

    const completed = await completeSetup();
    const state = await getJson<InstanceSetupState>("/state");

    expect(completed).toEqual({
      ok: true,
      owner: {
        id: "owner-1",
        name: "Ada Owner",
        email: "ada@example.com",
        createdAt: completedAt,
      },
      setupComplete: true,
    });
    expect(state).toEqual({
      setupComplete: true,
      owner: completed.ok ? completed.owner : null,
      capability: null,
    });
  });

  it("rejects invalid setup tokens without mutating owner state", async () => {
    await writeCapability();

    const rejected = await completeSetup({
      request: ownerSetupRequest({ setupToken: otherSetupToken }),
    });
    const state = await getJson<InstanceSetupState>("/state");

    expect(rejected).toEqual({ ok: false, reason: "invalid-token" });
    expect(state.setupComplete).toBe(false);
    expect(state.owner).toBeNull();
    expect(state.capability).toMatchObject({ instanceId });
  });

  it("rejects setup tokens created for another instance", async () => {
    await writeCapability();

    const rejected = await completeSetup({ instanceId: "other-instance.workers.dev" });
    const state = await getJson<InstanceSetupState>("/state");

    expect(rejected).toEqual({ ok: false, reason: "wrong-instance" });
    expect(state.setupComplete).toBe(false);
    expect(state.owner).toBeNull();
  });

  it("rejects expired setup capabilities without creating an owner", async () => {
    await writeCapability({ expiresAt: "2026-05-21T00:00:30.000Z" });

    const rejected = await completeSetup();
    const state = await getJson<InstanceSetupState>("/state");

    expect(rejected).toEqual({ ok: false, reason: "expired-token" });
    expect(state.setupComplete).toBe(false);
    expect(state.owner).toBeNull();
  });

  it("blocks replay and capability rotation after the first owner exists", async () => {
    await writeCapability();
    const completed = await completeSetup();

    const replay = await completeSetup({
      ownerId: "owner-2",
      request: ownerSetupRequest({ owner: { name: "Second Owner" } }),
    });
    const rotated = await writeCapability({ setupToken: otherSetupToken });
    const state = await getJson<InstanceSetupState>("/state");

    expect(replay).toEqual({
      ok: false,
      owner: completed.ok ? completed.owner : undefined,
      reason: "already-complete",
    });
    expect(rotated).toEqual({
      ok: false,
      owner: completed.ok ? completed.owner : undefined,
      reason: "already-complete",
    });
    expect(state).toEqual({
      setupComplete: true,
      owner: completed.ok ? completed.owner : null,
      capability: null,
    });
  });

  it("requires a stored setup capability before owner setup can complete", async () => {
    await expectSetupResult(completeSetup(), { ok: false, reason: "missing-capability" });
  });
});

async function writeCapability(
  overrides: Partial<{
    createdAt: string;
    expiresAt: string;
    instanceId: string;
    setupToken: string;
  }> = {},
) {
  return postJson<WriteOwnerSetupCapabilityResult>("/capability", {
    createdAt: overrides.createdAt ?? createdAt,
    expiresAt: overrides.expiresAt ?? expiresAt,
    instanceId: overrides.instanceId ?? instanceId,
    setupToken: overrides.setupToken ?? setupToken,
  });
}

function completeSetup(
  overrides: Partial<{
    instanceId: string;
    now: string;
    ownerId: string;
    request: OwnerSetupCompleteRequest;
  }> = {},
) {
  return postJson<CompleteFirstOwnerSetupResult>("/complete", {
    instanceId: overrides.instanceId ?? instanceId,
    now: overrides.now ?? completedAt,
    ownerId: overrides.ownerId ?? "owner-1",
    request: overrides.request ?? ownerSetupRequest(),
  });
}

function ownerSetupRequest(
  overrides: Partial<OwnerSetupCompleteRequest> = {},
): OwnerSetupCompleteRequest {
  return {
    setupToken,
    owner: {
      name: "Ada Owner",
      email: "ada@example.com",
    },
    ...overrides,
  };
}

async function expectSetupResult(
  actual: Promise<CompleteFirstOwnerSetupResult>,
  expected: CompleteFirstOwnerSetupResult,
) {
  expect(await actual).toEqual(expected);
}

async function getJson<T>(path: string) {
  const response = await fetchInstanceSetup(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown) {
  const response = await fetchInstanceSetup(path, {
    body: JSON.stringify(body),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function fetchInstanceSetup(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, {
    ...init,
    headers: { "x-instance-setup-harness-name": instanceSetupHarnessName },
  });
}

async function writeInstanceSetupHarness() {
  instanceSetupHarnessDir = await mkdtemp(resolve(".instance-setup-harness-"));
  const tempDir = instanceSetupHarnessDir;
  const harnessPath = join(tempDir, "instance-setup-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import { parseOwnerSetupCompleteRequest } from "${process.cwd()}/src/shared/protocol.ts";
      import {
        completeFirstOwnerSetup,
        ensureInstanceSetupTables,
        hashOwnerSetupToken,
        readInstanceSetupState,
        writeOwnerSetupCapability,
      } from "${process.cwd()}/src/worker/instance-setup-state.ts";

      export class InstanceSetupHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureInstanceSetupTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          try {
            if (request.method === "GET" && url.pathname === "/state") {
              return Response.json(readInstanceSetupState(this.ctx.storage));
            }

            if (request.method === "GET" && url.pathname === "/hash") {
              return Response.json({ hash: await hashOwnerSetupToken(url.searchParams.get("token")) });
            }

            if (request.method === "POST" && url.pathname === "/capability") {
              const body = await request.json();

              return Response.json(
                writeOwnerSetupCapability(this.ctx.storage, {
                  tokenHash: await hashOwnerSetupToken(body.setupToken),
                  instanceId: body.instanceId,
                  createdAt: body.createdAt,
                  expiresAt: body.expiresAt,
                }),
              );
            }

            if (request.method === "POST" && url.pathname === "/complete") {
              const body = await request.json();
              const setupRequest = parseOwnerSetupCompleteRequest(body.request);

              return Response.json(
                completeFirstOwnerSetup(this.ctx.storage, {
                  tokenHash: await hashOwnerSetupToken(setupRequest.setupToken),
                  instanceId: body.instanceId,
                  owner: setupRequest.owner,
                  now: body.now,
                  ownerId: body.ownerId,
                }),
              );
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
          const id = env.INSTANCE_SETUP_HARNESS.idFromName(
            request.headers.get("x-instance-setup-harness-name") ?? "default",
          );

          return env.INSTANCE_SETUP_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
