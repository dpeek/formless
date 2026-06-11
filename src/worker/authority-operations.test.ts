import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BootstrapResponse,
  type StoreSnapshot,
  type SyncResponse,
} from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { AppSchema } from "@dpeek/formless-schema";
import {
  selectAuthorityOperation,
  type AuthorityOperationKind,
  type AuthorityOperationMode,
} from "./authority-operations.ts";
import type { StoredOperationInvocation } from "./storage.ts";
import { BadRequestError } from "./errors.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "./site-cache.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type ExecuteOperationInput = {
  actorKind?: "admin" | "cliDeployer" | "owner" | "runner";
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

  it("selects entity operation routes with route facts", () => {
    expect(selectOperation("GET", "/operations/task/activeList")).toEqual({
      entityName: "task",
      kind: "entityOperation",
      metadata: {
        kind: "entityOperation",
        method: "GET",
        mode: "read",
        path: "/operations/task/activeList",
      },
      operationName: "activeList",
    });
    expect(selectOperation("POST", "/operations/task/create")).toEqual({
      entityName: "task",
      kind: "entityOperation",
      metadata: {
        kind: "entityOperation",
        method: "POST",
        mode: "write",
        path: "/operations/task/create",
      },
      operationName: "create",
    });
    expect(
      selectOperation("GET", "/operations/task/read", new URLSearchParams("recordId=record_1")),
    ).toEqual({
      entityName: "task",
      kind: "entityOperation",
      metadata: {
        kind: "entityOperation",
        method: "GET",
        mode: "read",
        path: "/operations/task/read",
      },
      operationName: "read",
      recordId: "record_1",
    });
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
    expect(selectOperation("POST", "/mutations")).toBeUndefined();
    expect(selectOperation("POST", "/actions")).toBeUndefined();
    expect(selectOperation("GET", "/missing")).toBeUndefined();
  });
});

describe("authority operation execution", () => {
  it("builds operation envelopes and returns operation-shaped committed and replayed output", async () => {
    const body = {
      idempotencyKey: "operation-create-task",
      input: {
        title: "Operation-created task",
        done: false,
      },
      source: {
        protocol: "generated-ui",
        surface: "taskHome",
      },
    };
    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const firstOutput = first.body.result.body.output;

    if (firstOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    expect(first.response.status).toBe(200);
    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(first.body.result.body).toMatchObject({
      invocation: {
        actor: { kind: "owner" },
        idempotency: {
          key: "operation-create-task",
          required: true,
          source: "caller",
          writeIdentity: "operation:task.create:operation-create-task",
        },
        input: {
          type: "create",
          values: {
            title: "Operation-created task",
            done: false,
          },
        },
        operation: {
          canonicalKey: "task.create",
          entityName: "task",
          kind: "create",
          operationName: "create",
        },
        source: {
          protocol: "generated-ui",
          route: "/operations/task/create",
          surface: "taskHome",
        },
      },
      output: {
        affectedChangeIds: [String(firstOutput.changes[0]?.seq)],
        record: {
          entity: "task",
          values: {
            title: "Operation-created task",
            done: false,
            priority: "normal",
          },
        },
        type: "create",
      },
      status: "committed",
    });
    expect(replay.response.status).toBe(200);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(first.body.result.body.output);
  });

  it("stores committed and replayed operation invocation rows outside sync and snapshots", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schemaUpdatedAt = bootstrap.body.result.body.schemaUpdatedAt;
    const beforeCursor = bootstrap.body.result.body.cursor;
    const body = {
      idempotencyKey: "operation-row-create-task",
      input: {
        title: "Operation row task",
        done: false,
      },
      source: {
        protocol: "generated-ui",
        surface: "taskHome",
      },
    };
    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const firstRows = await readOperationInvocations();
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const replayRows = await readOperationInvocations();
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${beforeCursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdatedAt)}`,
    });
    const snapshot = await executeOperation<StoreSnapshot>({
      method: "GET",
      path: "/snapshot",
    });
    const firstOutput = first.body.result.body.output;

    if (firstOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    expect(firstRows).toHaveLength(1);
    expect(firstRows[0]).toMatchObject({
      affectedChangeIds: [String(firstOutput.changes[0]?.seq)],
      auditInput: {
        kind: "summary",
        summary: {
          fieldNames: ["done", "title"],
          type: "create",
          valuesType: "object",
        },
      },
      authDecision: "allowed",
      idempotency: {
        key: "operation-row-create-task",
        required: true,
        source: "caller",
        writeIdentity: "operation:task.create:operation-row-create-task",
      },
      operationKey: "task.create",
      operationKind: "create",
      output: firstOutput,
      status: "committed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "committed" }),
      ],
    });
    expect(firstRows[0]?.inputHash).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
    expect(replay.response.status).toBe(200);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(first.body.result.body.output);
    expect(replayRows).toHaveLength(1);
    expect(replayRows[0]).toMatchObject({
      output: firstOutput,
      status: "replayed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "committed" }),
        expect.objectContaining({ status: "replayed" }),
      ],
    });
    expect(sync.body.result.body.changes).toEqual(firstOutput.changes);
    expect(snapshot.body.result.body.records).toContainEqual(firstOutput.record);
    expect(sync.body.result.body).not.toHaveProperty("operationInvocations");
    expect(snapshot.body.result.body).not.toHaveProperty("operationInvocations");
    expect(JSON.stringify(snapshot.body.result.body)).not.toContain("operation-row-create-task");
  });

  it("stores rejected operation invocations without materializing records", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.task;

    if (!taskEntity) {
      throw new Error("Expected task entity.");
    }

    schema.entities.task = {
      ...taskEntity,
      operations: {
        ...taskEntity.operations,
        create: {
          ...taskEntity.operations?.create,
          kind: "create",
          scope: "collection",
          input: { fields: { title: { field: "title" } } },
          effect: { type: "createRecord" },
          output: { type: "create" },
          idempotency: { required: true },
          audit: { input: "summary" },
          policy: { actors: ["runner"] },
        },
      },
    };

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-row-policy-reject",
        input: "invalid-values",
      },
    });
    const rows = await readOperationInvocations();

    expect(rejected.response.status).toBe(400);
    expect(rejected.body.writes).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      auditInput: {
        kind: "summary",
        summary: {
          type: "create",
          valuesType: "string",
        },
      },
      authDecision: "denied",
      errorMessage: 'Operation "task.create" is not exposed to actor "owner".',
      operationKey: "task.create",
      status: "rejected",
    });
    expect(rows[0]?.output).toBeUndefined();
    expect(JSON.stringify(rows[0])).not.toContain("invalid-values");
  });

  it("stores failed operation invocations when validation rejects after acceptance", async () => {
    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-row-validation-failed",
        input: {
          done: false,
        },
      },
    });
    const rows = await readOperationInvocations();

    expect(failed.response.status).toBe(400);
    expect(failed.body).toEqual({
      error: 'Field "title" is required.',
      writes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      authDecision: "allowed",
      errorMessage: 'Field "title" is required.',
      operationKey: "task.create",
      status: "failed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "failed" }),
      ],
    });
  });

  it("redacts explicitly snapshotted audit input for command operations", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.task;

    if (!taskEntity?.operations?.clearCompletedTasks) {
      throw new Error("Expected clearCompletedTasks operation.");
    }

    schema.entities.task = {
      ...taskEntity,
      operations: {
        ...taskEntity.operations,
        clearCompletedTasks: {
          ...taskEntity.operations.clearCompletedTasks,
          audit: { input: "snapshot" },
        },
      },
    };

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-row-redaction-completed-task",
        input: {
          title: "Completed for audit redaction",
          done: true,
        },
      },
    });

    const command = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      body: {
        idempotencyKey: "operation-row-redaction-command",
        input: {
          safeNote: "visible",
          turnstileToken: "secret-turnstile-token",
          nested: {
            password: "secret-password",
          },
          proof: {
            challenge: "secret-challenge",
          },
        },
      },
    });
    const rows = await readOperationInvocations();
    const commandRow = rows.find((row) => row.operationKey === "task.clearCompletedTasks");

    expect(command.response.status).toBe(200);
    expect(command.body.result.body.output).toMatchObject({
      type: "command",
    });
    expect(commandRow).toMatchObject({
      auditInput: {
        kind: "snapshot",
        snapshot: {
          type: "command",
          input: {
            safeNote: "visible",
            turnstileToken: "[redacted]",
            nested: {
              password: "[redacted]",
            },
            proof: "[redacted]",
          },
        },
      },
      operationKey: "task.clearCompletedTasks",
      operationKind: "command",
      status: "committed",
    });
    expect(JSON.stringify(commandRow?.auditInput)).not.toContain("secret-turnstile-token");
    expect(JSON.stringify(commandRow?.auditInput)).not.toContain("secret-password");
    expect(JSON.stringify(commandRow?.auditInput)).not.toContain("secret-challenge");
  });

  it("preserves list and get operation reads without idempotency", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.task;
    const firstTask = bootstrap.body.result.body.records.find((record) => record.entity === "task");

    if (!taskEntity || !firstTask) {
      throw new Error("Expected tasks seed records.");
    }

    schema.entities.task = {
      ...taskEntity,
      operations: {
        ...taskEntity.operations,
        activeList: {
          kind: "list",
          scope: "collection",
          target: { query: "taskActive" },
          output: { type: "list", query: "taskActive" },
          idempotency: { required: false },
          audit: { input: "summary" },
        },
        read: {
          kind: "get",
          scope: "record",
          output: { type: "get" },
          idempotency: { required: false },
          audit: { input: "summary" },
        },
      },
    };

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const list = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/activeList",
    });
    const get = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/read",
      search: `recordId=${encodeURIComponent(firstTask.id)}`,
    });
    const listOutput = list.body.result.body.output;

    if (listOutput.type !== "list") {
      throw new Error("Expected list operation output.");
    }

    expect(list.body.writes).toEqual([]);
    expect(list.body.result.body).toMatchObject({
      invocation: {
        idempotency: { required: false },
        operation: {
          canonicalKey: "task.activeList",
          kind: "list",
        },
      },
      output: {
        type: "list",
      },
      status: "accepted",
    });
    expect(listOutput.records.every((record) => record.values.done === false)).toBe(true);
    expect(get.body.writes).toEqual([]);
    expect(get.body.result.body).toMatchObject({
      invocation: {
        input: {
          recordId: firstTask.id,
          type: "get",
        },
        operation: {
          canonicalKey: "task.read",
          kind: "get",
        },
      },
      output: {
        record: firstTask,
        type: "get",
      },
      status: "accepted",
    });
  });

  it("rejects operation policy before field validation or write notification", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.task;

    if (!taskEntity) {
      throw new Error("Expected task entity.");
    }

    schema.entities.task = {
      ...taskEntity,
      operations: {
        ...taskEntity.operations,
        create: {
          ...taskEntity.operations?.create,
          kind: "create",
          scope: "collection",
          input: { fields: { title: { field: "title" } } },
          effect: { type: "createRecord" },
          output: { type: "create" },
          idempotency: { required: true },
          audit: { input: "summary" },
          policy: { actors: ["runner"] },
        },
      },
    };

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "policy-reject-before-validation",
        input: "invalid-values",
      },
    });

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Operation "task.create" is not exposed to actor "owner".',
      writes: [],
    });
  });

  it("requires idempotency keys for write operations before materialization", async () => {
    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        input: {
          title: "Missing operation idempotency",
          done: false,
        },
      },
    });

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Operation "create" requires an idempotency key for write execution.',
      writes: [],
    });
  });

  it("rejects undeclared generated operation input fields before materialization", async () => {
    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-input-undeclared",
        input: {
          title: "Declared title",
          done: false,
          admin: true,
        },
      },
    });
    const rows = await readOperationInvocations();

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Operation input includes undeclared field "admin".',
      writes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      errorMessage: 'Operation input includes undeclared field "admin".',
      operationKey: "task.create",
      status: "failed",
    });
  });

  it("returns not found for legacy generic write routes", async () => {
    const mutation = await executeOperationFailure({
      method: "POST",
      path: "/mutations",
      body: {},
    });
    const action = await executeOperationFailure({
      method: "POST",
      path: "/actions",
      body: {},
    });

    expect(mutation.response.status).toBe(404);
    expect(mutation.body).toEqual({ error: "Unsupported operation.", writes: [] });
    expect(action.response.status).toBe(404);
    expect(action.body).toEqual({ error: "Unsupported operation.", writes: [] });
  });

  it("rejects stale browser operation writes before write notification", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const staleHeaders = {
      [FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER]: "2026-01-01T00:00:00.000Z",
    };
    const staleMutation = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      headers: staleHeaders,
      body: {
        idempotencyKey: "operation-stale-client-create",
        input: { title: "Stale client", done: false },
      },
    });
    const staleAction = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      headers: staleHeaders,
      body: {
        idempotencyKey: "operation-stale-client-command",
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

function cloneSchema(schema: AppSchema): AppSchema {
  return JSON.parse(JSON.stringify(schema)) as AppSchema;
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

async function readOperationInvocations() {
  const response = await harness.fetch("/operation-invocations", {
    headers: {
      "x-operation-harness-name": operationHarnessName,
    },
  });

  expect(response.status).toBe(200);

  return (await response.json()) as StoredOperationInvocation[];
}

async function writeAuthorityOperationHarness() {
  operationHarnessDir = await mkdtemp(join(tmpdir(), "formless-authority-operation-harness-"));
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
      import {
        ensureStorageTables,
        readOperationInvocations,
      } from "${process.cwd()}/src/worker/storage.ts";

      export class AuthorityOperationHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureStorageTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "GET" && url.pathname === "/operation-invocations") {
            return Response.json(readOperationInvocations(this.ctx.storage));
          }

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
              actorKind: input.actorKind,
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
