import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BootstrapResponse,
  type MutationResponse,
} from "../shared/protocol.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import {
  selectAuthorityOperation,
  type AuthorityOperationKind,
  type AuthorityOperationMode,
} from "./authority-operations.ts";
import { BadRequestError } from "./errors.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "./site-cache.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type ExecuteOperationInput = {
  appKey?: SchemaKey;
  body?: unknown;
  headers?: Record<string, string>;
  method: string;
  path: string;
  search?: string;
};

type ExecuteOperationSuccess<TBody> = {
  result: {
    body: TBody;
    headers?: Record<string, string>;
    status?: number;
  };
  writes: Array<{
    kind: "committed" | "replay";
    response: unknown;
  }>;
};

type ExecuteOperationFailure = {
  code?: string;
  error: string;
  reloadRequired?: boolean;
  upgrade?: unknown;
  writes: Array<{
    kind: "committed" | "replay";
    response: unknown;
  }>;
};

let harness: Harness;
let operationHarnessDir: string | undefined;
let operationHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeAuthorityOperationHarness(), {
    AUTHORITY_OPERATION_HARNESS: { className: "AuthorityOperationHarness", useSQLite: true },
  });
});

beforeEach(() => {
  operationHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (operationHarnessDir) {
    await rm(operationHarnessDir, { recursive: true, force: true });
    operationHarnessDir = undefined;
  }
});

describe("authority operation selection", () => {
  it("selects read operation metadata from HTTP route facts", () => {
    const cases = [
      ["GET", "/bootstrap", "bootstrap"],
      ["GET", "/schema", "readSchema"],
      ["GET", "/snapshot", "exportSnapshot"],
      ["GET", "/tree/blog%2Fshipping-schema-backed-authoring", "siteTree"],
      ["GET", "/sync", "sync"],
    ] satisfies Array<[string, string, AuthorityOperationKind]>;

    for (const [method, path, kind] of cases) {
      expect(selectOperation(method, path)).toMatchObject({
        kind,
        metadata: {
          kind,
          method,
          mode: "read" satisfies AuthorityOperationMode,
          path,
        },
      });
    }
  });

  it("selects write operation metadata before request body parsing", () => {
    const cases = [
      ["POST", "/schema", "writeSchema"],
      ["POST", "/snapshot/restore", "restoreSnapshot"],
      ["POST", "/mutations", "mutation"],
      ["POST", "/actions", "action"],
      ["POST", "/reset/schema", "resetSchema"],
      ["POST", "/reset/seed", "resetSeed"],
    ] satisfies Array<[string, string, AuthorityOperationKind]>;

    for (const [method, path, kind] of cases) {
      expect(selectOperation(method, path)).toEqual({
        kind,
        metadata: {
          kind,
          method,
          mode: "write" satisfies AuthorityOperationMode,
          path,
        },
      });
    }
  });

  it("parses sync request facts during operation selection", () => {
    expect(
      selectOperation(
        "GET",
        "/sync",
        new URLSearchParams("after=12&schemaUpdatedAt=2026-05-12T01%3A02%3A03.000Z"),
      ),
    ).toEqual({
      after: 12,
      clientSchemaUpdatedAt: "2026-05-12T01:02:03.000Z",
      kind: "sync",
      metadata: {
        kind: "sync",
        method: "GET",
        mode: "read",
        path: "/sync",
      },
    });
  });

  it("rejects invalid sync cursors before operation execution", () => {
    expect(() => selectOperation("GET", "/sync", new URLSearchParams("after=bad"))).toThrow(
      BadRequestError,
    );
    expect(() => selectOperation("GET", "/sync", new URLSearchParams("after=-1"))).toThrow(
      BadRequestError,
    );
  });

  it("leaves WebSocket sync and unknown routes outside operation dispatch", () => {
    expect(selectOperation("GET", "/sync/ws")).toBeUndefined();
    expect(selectOperation("POST", "/sync/ws")).toBeUndefined();
    expect(selectOperation("DELETE", "/mutations")).toBeUndefined();
    expect(selectOperation("GET", "/missing")).toBeUndefined();
  });
});

describe("authority operation execution", () => {
  it("returns protocol mutation bodies from committed and replayed write outcomes", async () => {
    const mutation = {
      mutationId: "mutation-operation-outcome-body",
      entity: "task",
      op: "create",
      values: {
        title: "Operation outcome body",
        done: false,
      },
    };

    const first = await executeOperation<MutationResponse>({
      method: "POST",
      path: "/mutations",
      body: mutation,
    });
    const replay = await executeOperation<MutationResponse>({
      method: "POST",
      path: "/mutations",
      body: mutation,
    });

    expect(first.response.status).toBe(200);
    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(first.body.result.body).toEqual(first.body.writes[0]?.response);
    expect(first.body.result.body).not.toHaveProperty("kind");
    expect(first.body.result.body).not.toHaveProperty("response");
    expect(replay.response.status).toBe(200);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body).toEqual(first.body.result.body);
    expect(replay.body.result.body).toEqual(replay.body.writes[0]?.response);
  });

  it("does not enter write notification when validation fails before execution", async () => {
    const invalid = await executeOperationFailure({
      method: "POST",
      path: "/mutations",
      body: {
        mutationId: "mutation-operation-invalid",
        entity: "missing",
        op: "create",
        values: {},
      },
    });

    expect(invalid.response.status).toBe(400);
    expect(invalid.body).toEqual({
      error: 'Unknown entity "missing".',
      writes: [],
    });
  });

  it("rejects stale browser mutation and action writes before write notification", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const staleHeaders = {
      [FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER]: "2026-01-01T00:00:00.000Z",
    };
    const staleMutation = await executeOperationFailure({
      method: "POST",
      path: "/mutations",
      headers: staleHeaders,
      body: {
        mutationId: "mutation-operation-stale-client",
        entity: "task",
        op: "create",
        values: { title: "Stale client", done: false },
      },
    });
    const staleAction = await executeOperationFailure({
      method: "POST",
      path: "/actions",
      headers: staleHeaders,
      body: {
        actionId: "action-operation-stale-client",
        entity: "task",
        action: "clearCompletedTasks",
      },
    });

    expect(bootstrap.body.result.body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(staleMutation.response.status).toBe(409);
    expect(staleMutation.body).toMatchObject({
      code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
      reloadRequired: true,
      writes: [],
    });
    expect(staleAction.response.status).toBe(409);
    expect(staleAction.body).toMatchObject({
      code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
      reloadRequired: true,
      writes: [],
    });
  });

  it("preserves operation-level cache headers and statuses", async () => {
    const missingSiteTree = await executeOperation<{ error: string }>({
      appKey: "site",
      method: "GET",
      path: "/tree/missing-page",
    });

    expect(missingSiteTree.response.status).toBe(200);
    expect(missingSiteTree.body.result).toEqual({
      body: { error: "Site page not found." },
      headers: { "Cache-Control": PUBLIC_SITE_TREE_CACHE_CONTROL },
      status: 404,
    });
    expect(missingSiteTree.body.writes).toEqual([]);
  });
});

function selectOperation(method: string, path: string, searchParams = new URLSearchParams()) {
  return selectAuthorityOperation({ method, path, searchParams });
}

async function executeOperation<TBody>(input: ExecuteOperationInput) {
  const response = await fetchOperationHarness(input);
  const body = (await response.json()) as ExecuteOperationSuccess<TBody>;

  return { response, body };
}

async function executeOperationFailure(input: ExecuteOperationInput) {
  const response = await fetchOperationHarness(input);
  const body = (await response.json()) as ExecuteOperationFailure;

  return { response, body };
}

async function fetchOperationHarness(input: ExecuteOperationInput) {
  return harness.fetch("/execute", {
    body: JSON.stringify(input),
    headers: {
      "Content-Type": "application/json",
      "x-operation-harness-name": operationHarnessName,
    },
    method: "POST",
  });
}

async function writeAuthorityOperationHarness() {
  const tempRoot = resolve("tmp", "test");
  await mkdir(tempRoot, { recursive: true });
  operationHarnessDir = await mkdtemp(join(tempRoot, ".authority-operation-harness-"));
  const harnessPath = join(operationHarnessDir, "authority-operation-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import { schemaKeyStorageIdentity } from "${process.cwd()}/src/shared/app-storage-identity.ts";
      import {
        executeAuthorityOperation,
        selectAuthorityOperation,
      } from "${process.cwd()}/src/worker/authority-operations.ts";
      import {
        BadRequestError,
        ReloadRequiredError,
      } from "${process.cwd()}/src/worker/errors.ts";
      import { workerSchemaAppDefinitions } from "${process.cwd()}/src/worker/schema-apps.ts";
      import { ensureStorageTables } from "${process.cwd()}/src/worker/storage.ts";

      export class AuthorityOperationHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureStorageTables(ctx.storage);
        }

        async fetch(request) {
          const input = await request.json();
          const appKey = input.appKey ?? "tasks";
          const app = workerSchemaAppDefinitions[appKey];
          const operation = selectAuthorityOperation({
            method: input.method,
            path: input.path,
            searchParams: new URLSearchParams(input.search ?? ""),
          });

          if (!app || !operation) {
            return Response.json({ error: "Unsupported operation.", writes: [] }, { status: 404 });
          }

          const writes = [];
          const writeNotifier = {
            apply(write) {
              const outcome = write();
              writes.push({ kind: outcome.kind, response: outcome.response });
              return outcome;
            },
          };

          try {
            const result = executeAuthorityOperation({
              app,
              body: input.body,
              identity: schemaKeyStorageIdentity(appKey),
              operation,
              requestHeaders: new Headers(input.headers ?? {}),
              source: {
                schema: app.sourceSchema,
                records: app.seedRecords,
                changeMutationPrefix: app.seedChangeMutationPrefix,
              },
              storage: this.ctx.storage,
              writes: writeNotifier,
            });

            return Response.json({ result, writes });
          } catch (error) {
            const status =
              error instanceof ReloadRequiredError ? error.status :
              error instanceof BadRequestError ? 400 : 500;
            const message = error instanceof Error ? error.message : "Unknown error.";
            const body =
              error instanceof ReloadRequiredError
                ? { ...error.body, writes }
                : { error: message, writes };

            return Response.json(body, { status });
          }
        }
      }

      export default {
        fetch(request, env) {
          const id = env.AUTHORITY_OPERATION_HARNESS.idFromName(
            request.headers.get("x-operation-harness-name") ?? "default",
          );

          return env.AUTHORITY_OPERATION_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
