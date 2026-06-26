import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { StorageSnapshot } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BootstrapResponse,
  type SyncResponse,
} from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type {
  AppSchema,
  EntitySchema,
  EntityOperationSchema,
  RecordPlanStepSchema,
} from "@dpeek/formless-schema";
import {
  selectAuthorityOperation,
  type AuthorityOperationKind,
  type AuthorityOperationMode,
} from "./authority-operations.ts";
import type { StoredOperationInvocation } from "./storage.ts";
import { BadRequestError } from "./errors.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";

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

  it("commits operation-only CRUD writes without source write policy", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithOperationOnlyTaskCrud(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const created = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-only-crud-create",
        input: {
          title: "Operation-only CRUD",
          done: false,
        },
      },
    });
    const createOutput = created.body.result.body.output;

    if (createOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const listed = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/activeList",
    });
    const listOutput = listed.body.result.body.output;

    if (listOutput.type !== "list") {
      throw new Error("Expected list operation output.");
    }

    const updated = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/update",
      body: {
        idempotencyKey: "operation-only-crud-update",
        recordId: createOutput.record.id,
        input: {
          title: "Operation-only CRUD updated",
          done: true,
        },
      },
    });
    const updateOutput = updated.body.result.body.output;

    if (updateOutput.type !== "update") {
      throw new Error("Expected update operation output.");
    }

    const read = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/read",
      search: `recordId=${encodeURIComponent(createOutput.record.id)}`,
    });
    const readOutput = read.body.result.body.output;

    if (readOutput.type !== "get") {
      throw new Error("Expected get operation output.");
    }

    const deleted = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/delete",
      body: {
        idempotencyKey: "operation-only-crud-delete",
        recordId: createOutput.record.id,
      },
    });
    const deleteReplay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/delete",
      body: {
        idempotencyKey: "operation-only-crud-delete",
        recordId: createOutput.record.id,
      },
    });
    const deleteOutput = deleted.body.result.body.output;

    if (deleteOutput.type !== "delete") {
      throw new Error("Expected delete operation output.");
    }

    expect(created.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(createOutput.record.createdAt).toBe(created.body.result.body.invocation.receivedAt);
    expect(createOutput.record.updatedAt).toBe(created.body.result.body.invocation.receivedAt);
    expect(createOutput.changes).toEqual([
      expect.objectContaining({
        createdAt: created.body.result.body.invocation.receivedAt,
        entity: "task",
        writeId: "operation:task.create:operation-only-crud-create",
        operationKind: "create",
        payload: createOutput.record,
        recordId: createOutput.record.id,
      }),
    ]);
    expect(createOutput.affectedChangeIds).toEqual(
      createOutput.changes.map((change) => String(change.seq)),
    );
    expect(listOutput.records).toContainEqual(createOutput.record);
    expect(updateOutput.record).toMatchObject({
      id: createOutput.record.id,
      createdAt: createOutput.record.createdAt,
      updatedAt: updated.body.result.body.invocation.receivedAt,
      values: {
        title: "Operation-only CRUD updated",
        done: true,
      },
    });
    expect(updateOutput.changes).toEqual([
      expect.objectContaining({
        createdAt: updated.body.result.body.invocation.receivedAt,
        entity: "task",
        writeId: "operation:task.update:operation-only-crud-update",
        operationKind: "update",
        payload: updateOutput.record,
        recordId: createOutput.record.id,
      }),
    ]);
    expect(readOutput.record).toEqual(updateOutput.record);
    expect(deleteOutput).toMatchObject({
      affectedChangeIds: deleteOutput.changes.map((change) => String(change.seq)),
      recordId: createOutput.record.id,
      type: "delete",
    });
    expect(deleteOutput.changes).toEqual([
      expect.objectContaining({
        createdAt: deleted.body.result.body.invocation.receivedAt,
        entity: "task",
        writeId: "operation:task.delete:operation-only-crud-delete",
        operationKind: "delete",
        payload: {
          ...updateOutput.record,
          deletedAt: deleted.body.result.body.invocation.receivedAt,
          updatedAt: deleted.body.result.body.invocation.receivedAt,
        },
        recordId: createOutput.record.id,
      }),
    ]);
    expect(deleteReplay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(deleteReplay.body.result.body).toMatchObject({
      output: deleteOutput,
      status: "replayed",
    });
  });

  it("enforces operation unique constraints before CRUD write-log append", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithOperationOnlyTaskCrud(bootstrap.body.result.body.schema);

    schema.entities.task = {
      ...schema.entities.task,
      constraints: {
        uniqueTitle: {
          kind: "unique",
          fields: ["title"],
        },
      },
    };

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-unique-first",
        input: {
          title: "Unique operation title",
          done: false,
        },
      },
    });
    const second = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-unique-second",
        input: {
          title: "Other operation title",
          done: false,
        },
      },
    });
    const duplicateCreate = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-unique-duplicate-create",
        input: {
          title: "Unique operation title",
          done: false,
        },
      },
    });
    const secondOutput = second.body.result.body.output;

    if (secondOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const duplicateUpdate = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/update",
      body: {
        idempotencyKey: "operation-unique-duplicate-update",
        recordId: secondOutput.record.id,
        input: {
          title: "Unique operation title",
        },
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(
        baseline.body.result.body.schemaUpdatedAt,
      )}`,
    });
    const rows = await readOperationInvocations();

    expect(first.response.status).toBe(200);
    expect(duplicateCreate.response.status).toBe(400);
    expect(duplicateCreate.body).toEqual({
      error: 'Unique constraint "task.uniqueTitle" would be violated.',
      writes: [],
    });
    expect(duplicateUpdate.response.status).toBe(400);
    expect(duplicateUpdate.body).toEqual({
      error: 'Unique constraint "task.uniqueTitle" would be violated.',
      writes: [],
    });
    expect(sync.body.result.body.changes.map((change) => change.writeId)).toEqual([
      "operation:task.create:operation-unique-first",
      "operation:task.create:operation-unique-second",
    ]);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          affectedChangeIds: [],
          errorMessage: 'Unique constraint "task.uniqueTitle" would be violated.',
          operationKey: "task.create",
          status: "failed",
        }),
        expect.objectContaining({
          affectedChangeIds: [],
          errorMessage: 'Unique constraint "task.uniqueTitle" would be violated.',
          operationKey: "task.update",
          status: "failed",
        }),
      ]),
    );
  });

  it("enforces operation reference validation and delete blockers before CRUD write-log append", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithOperationOnlyTaskProjectReference(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const project = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/project/create",
      body: {
        idempotencyKey: "operation-reference-project",
        input: {
          name: "Operation project",
        },
      },
    });
    const projectOutput = project.body.result.body.output;

    if (projectOutput.type !== "create") {
      throw new Error("Expected project create output.");
    }

    const missingReference = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-reference-missing",
        input: {
          title: "Missing reference task",
          done: false,
          project: "missing-project",
        },
      },
    });
    const task = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-reference-task",
        input: {
          title: "Referenced task",
          done: false,
          project: projectOutput.record.id,
        },
      },
    });
    const blockedDelete = await executeOperationFailure({
      method: "POST",
      path: "/operations/project/delete",
      body: {
        idempotencyKey: "operation-reference-delete-blocked",
        recordId: projectOutput.record.id,
      },
    });
    const projectRead = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/project/read",
      search: `recordId=${encodeURIComponent(projectOutput.record.id)}`,
    });
    const projectReadOutput = projectRead.body.result.body.output;

    if (projectReadOutput.type !== "get") {
      throw new Error("Expected project get output.");
    }

    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(
        baseline.body.result.body.schemaUpdatedAt,
      )}`,
    });

    expect(missingReference.response.status).toBe(400);
    expect(missingReference.body).toEqual({
      error: 'Field "project" references unknown project record "missing-project".',
      writes: [],
    });
    expect(task.response.status).toBe(200);
    expect(blockedDelete.response.status).toBe(400);
    expect(blockedDelete.body.error).toContain(
      `Cannot delete record "${projectOutput.record.id}" because active task record`,
    );
    expect(blockedDelete.body.writes).toEqual([]);
    expect(projectReadOutput.record).toMatchObject({
      id: projectOutput.record.id,
      values: {
        name: "Operation project",
      },
    });
    expect(projectReadOutput.record.deletedAt).toBeUndefined();
    expect(sync.body.result.body.changes.map((change) => change.writeId)).toEqual([
      "operation:project.create:operation-reference-project",
      "operation:task.create:operation-reference-task",
    ]);
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
    const snapshot = await executeOperation<StorageSnapshot>({
      method: "GET",
      path: "/snapshot",
    });
    const firstOutput = first.body.result.body.output;

    if (firstOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
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
    expect(firstRows[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
    ]);
    expect(firstRows[0]?.inputHash).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
    expect(replay.response.status).toBe(200);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
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
    expect(replayRows[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);
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
    expect(rows[0]?.statusHistory.map((entry) => entry.status)).toEqual(["accepted", "failed"]);
  });

  it("stores failed operation invocations when command handler execution fails after acceptance", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithPrivateSubscribeCommandOperation(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/privateSubscribe",
      body: {
        idempotencyKey: "operation-row-handler-failed",
      },
    });
    const rows = await readOperationInvocations();

    expect(failed.response.status).toBe(400);
    expect(failed.body).toEqual({
      error: 'Operation "task.privateSubscribe" is not available for private execution.',
      writes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      authDecision: "allowed",
      errorMessage: 'Operation "task.privateSubscribe" is not available for private execution.',
      operationKey: "task.privateSubscribe",
      operationKind: "command",
      status: "failed",
    });
    expect(rows[0]?.statusHistory.map((entry) => entry.status)).toEqual(["accepted", "failed"]);
    expect(rows[0]?.output).toBeUndefined();
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

  it("executes declared command operation effects through operation policy and replays command outcomes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithScopedClearCompletedCommand(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const created = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "command-effect-completed-task",
        input: {
          title: "Operation command completed",
          done: true,
        },
      },
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const body = { idempotencyKey: "command-effect-clear-completed" };
    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      body,
    });
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      body,
    });
    const output = committed.body.result.body.output;
    const rows = await readOperationInvocations();
    const commandRow = rows.find((row) => row.operationKey === "task.clearCompletedTasks");

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    expect(committed.response.status).toBe(200);
    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(output);
    expect(output.affectedChangeIds).toEqual(output.changes.map((change) => String(change.seq)));
    expect(output).not.toHaveProperty("actionId");
    expect(output).not.toHaveProperty("response");
    const committedWriteResponse = committed.body.writes[0]
      ?.response as OperationInvocationResponse;

    expect(committedWriteResponse.output).toEqual(output);
    expect(committedWriteResponse.output).not.toHaveProperty("response");
    const createdRecordChange = output.changes.find(
      (change) => change.recordId === createdOutput.record.id,
    );

    expect(createdRecordChange).toMatchObject({
      entity: "task",
      writeId: "operation:task.clearCompletedTasks:command-effect-clear-completed",
      operationKind: "command",
      payload: {
        id: createdOutput.record.id,
        deletedAt: committed.body.result.body.invocation.receivedAt,
        updatedAt: committed.body.result.body.invocation.receivedAt,
        values: {
          title: "Operation command completed",
        },
      },
      recordId: createdOutput.record.id,
    });
    expect(createdRecordChange?.payload.values).not.toHaveProperty("done");
    expect(commandRow).toMatchObject({
      affectedChangeIds: output.affectedChangeIds,
      operationKey: "task.clearCompletedTasks",
      operationKind: "command",
      output,
      status: "replayed",
    });
    expect(commandRow?.output).not.toHaveProperty("actionId");
    expect(commandRow?.output).not.toHaveProperty("response");
    expect(commandRow?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);
  });

  it("commits transition-state command operations through operation invocation", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionCommandOperation(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const created = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "transition-command-task",
        input: {
          title: "Transition command task",
          done: false,
        },
      },
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-command-start",
        recordId: createdOutput.record.id,
      },
    });
    const output = committed.body.result.body.output;
    const receivedAt = committed.body.result.body.invocation.receivedAt;
    const rows = await readOperationInvocations();
    const transitionRow = rows.find((row) => row.operationKey === "task.startTask");

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    expect(committed.response.status).toBe(200);
    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(output.affectedChangeIds).toEqual(output.changes.map((change) => String(change.seq)));
    expect(output.changes.map((change) => change.entity)).toEqual(["task", "task-event"]);
    expect(output.changes[0]).toMatchObject({
      entity: "task",
      operationKind: "command",
      payload: {
        id: createdOutput.record.id,
        updatedAt: receivedAt,
        values: {
          status: "doing",
        },
      },
    });
    expect(output.changes[1]).toMatchObject({
      entity: "task-event",
      operationKind: "command",
      payload: {
        createdAt: receivedAt,
        updatedAt: receivedAt,
        values: {
          actorMode: "owner",
          nextState: "doing",
          occurredAt: receivedAt.slice(0, 10),
          previousState: "todo",
          sourceEntity: "task",
          sourceRecordId: createdOutput.record.id,
          transitionKey: "start",
        },
      },
    });
    expect(transitionRow).toMatchObject({
      affectedChangeIds: output.affectedChangeIds,
      operationKey: "task.startTask",
      operationKind: "command",
      output,
      status: "committed",
    });
  });

  it("materializes record-plan command operations through operation writes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithRecordPlanOperation(
      bootstrap.body.result.body.schema,
      "submitPlan",
      successfulRecordPlanSteps(),
    );

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/submitPlan",
      body: {
        idempotencyKey: "record-plan-success",
        input: {
          title: "Record-plan task",
          note: "Created by plan",
        },
        source: {
          protocol: "generated-ui",
          path: "/intake",
        },
      },
    });
    const output = committed.body.result.body.output;
    const rows = await readOperationInvocations();

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    expect(committed.response.status).toBe(200);
    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(output.affectedChangeIds).toEqual(output.changes.map((change) => String(change.seq)));
    expect(output.changes.map((change) => change.entity)).toEqual(["task", "task-log", "task"]);
    expect(output).not.toHaveProperty("actionId");
    expect(output).not.toHaveProperty("response");
    expect(output).toMatchObject({
      recordPlan: {
        steps: [
          { name: "createTask", kind: "create", entity: "task" },
          { name: "createLog", kind: "create", entity: "task-log" },
          { name: "touchTask", kind: "patch", entity: "task" },
        ],
      },
    });

    const taskId = output.recordPlan?.steps[0]?.recordId;
    const log = output.changes[1]?.payload;
    const receivedAt = committed.body.result.body.invocation.receivedAt;

    expect(taskId).toMatch(/^task_/);
    expect(output.changes.map((change) => change.createdAt)).toEqual([
      receivedAt,
      receivedAt,
      receivedAt,
    ]);
    expect(output.recordPlan?.steps.map((step) => step.changeId)).toEqual(output.affectedChangeIds);
    expect(output.changes[0]?.payload).toMatchObject({
      id: taskId,
      entity: "task",
      createdAt: receivedAt,
      updatedAt: receivedAt,
      values: {
        title: "Record-plan task",
        done: false,
        priority: "normal",
      },
    });
    expect(log).toMatchObject({
      entity: "task-log",
      values: {
        task: taskId,
        label: "Created by plan",
        actorMode: "owner",
        occurredAt: receivedAt,
        sourcePath: "/intake",
      },
    });
    expect(output.changes[2]?.payload).toMatchObject({
      id: taskId,
      entity: "task",
      updatedAt: receivedAt,
      values: {
        title: "Record-plan task",
      },
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        affectedChangeIds: output.affectedChangeIds,
        operationKey: "task.submitPlan",
        operationKind: "command",
        output,
        status: "committed",
      }),
    );
  });

  it("rejects record-plan validation failures without partial writes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithRecordPlanOperation(
      bootstrap.body.result.body.schema,
      "submitBrokenPlan",
      brokenRecordPlanSteps(),
    );
    const beforeCursor = bootstrap.body.result.body.cursor;
    const schemaUpdatedAt = bootstrap.body.result.body.schemaUpdatedAt;

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/submitBrokenPlan",
      body: {
        idempotencyKey: "record-plan-broken",
        input: {
          title: "Should roll back",
          note: "Invalid reference",
        },
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${beforeCursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdatedAt)}`,
    });
    const snapshot = await executeOperation<StorageSnapshot>({
      method: "GET",
      path: "/snapshot",
    });
    const rows = await readOperationInvocations();

    expect(failed.response.status).toBe(400);
    expect(failed.body).toEqual({
      error: 'Field "task" references unknown task record "missing-task".',
      writes: [],
    });
    expect(sync.body.result.body.changes).toEqual([]);
    expect(snapshot.body.result.body.records).not.toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({ title: "Should roll back" }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      errorMessage: 'Field "task" references unknown task record "missing-task".',
      operationKey: "task.submitBrokenPlan",
      status: "failed",
    });
  });

  it("replays record-plan command operations without duplicate writes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithRecordPlanOperation(
      bootstrap.body.result.body.schema,
      "submitReplayPlan",
      successfulRecordPlanSteps(),
    );
    const beforeCursor = bootstrap.body.result.body.cursor;
    const schemaUpdatedAt = bootstrap.body.result.body.schemaUpdatedAt;
    const body = {
      idempotencyKey: "record-plan-replay",
      input: {
        title: "Replay record-plan task",
        note: "Replay note",
      },
    };

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/submitReplayPlan",
      body,
    });
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/submitReplayPlan",
      body,
    });
    const rows = await readOperationInvocations();
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${beforeCursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdatedAt)}`,
    });

    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(first.body.result.body.output);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);

    if (first.body.result.body.output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    expect(sync.body.result.body.changes).toEqual(first.body.result.body.output.changes);
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

function schemaWithScopedClearCompletedCommand(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const operation = taskEntity.operations?.clearCompletedTasks;

  if (!operation || operation.effect?.type !== "operationHandler") {
    throw new Error("Expected clearCompletedTasks operation.");
  }

  schema.entities.task = {
    ...taskEntity,
    operations: {
      ...taskEntity.operations,
      clearCompletedTasks: {
        ...operation,
        policy: {
          actors: ["owner"],
          responseFields: {
            owner: ["title"],
          },
        },
      },
    },
  };

  return schema;
}

function schemaWithTransitionCommandOperation(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const taskFields = {
    ...taskEntity.fields,
    status: {
      type: "enum",
      required: true,
      label: "Status",
      default: "todo",
      values: {
        todo: { label: "Todo" },
        doing: { label: "Doing" },
        done: { label: "Done" },
      },
    },
  } satisfies EntitySchema["fields"];

  schema.entities.task = {
    ...taskEntity,
    fields: taskFields,
    stateMachines: {
      statusFlow: {
        field: "status",
        initial: "todo",
        terminal: ["done"],
        transitions: {
          start: { label: "Start", from: ["todo"], to: "doing" },
          finish: { label: "Finish", from: ["doing"], to: "done" },
        },
        event: {
          entity: "task-event",
          fields: transitionEventFieldMappings(),
        },
      },
    },
    operations: {
      ...taskEntity.operations,
      ...recordCrudOperations("Task", taskFields),
      startTask: {
        label: "Start",
        kind: "command",
        scope: "record",
        effect: {
          type: "operationHandler",
          handler: "transition-state",
          config: {
            machine: "statusFlow",
            transition: "start",
          },
        },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
        policy: { actors: ["owner"] },
      },
    },
  };
  schema.entities["task-event"] = transitionEventEntity();

  return schema;
}

function schemaWithRecordPlanOperation(
  sourceSchema: AppSchema,
  operationName: string,
  steps: RecordPlanStepSchema[],
): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = schema.entities.task;

  if (!taskEntity) {
    throw new Error("Expected task entity.");
  }

  schema.entities["task-log"] = taskLogEntity();
  schema.entities.task = {
    ...taskEntity,
    operations: {
      ...taskEntity.operations,
      [operationName]: recordPlanOperation(steps),
    },
  };

  return schema;
}

function schemaWithPrivateSubscribeCommandOperation(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");

  schema.entities.task = {
    ...taskEntity,
    operations: {
      ...taskEntity.operations,
      privateSubscribe: {
        label: "Private subscribe",
        kind: "command",
        scope: "collection",
        effect: { type: "operationHandler", handler: "subscribe", config: {} },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
        policy: { actors: ["owner"] },
      },
    },
  };

  return schema;
}

function taskLogEntity(): AppSchema["entities"][string] {
  return {
    label: "Task log",
    fields: {
      task: {
        type: "reference",
        required: true,
        label: "Task",
        to: "task",
        displayField: "title",
      },
      label: { type: "text", required: true, label: "Label" },
      actorMode: { type: "text", required: true, label: "Actor mode" },
      sourcePath: { type: "text", required: false, label: "Source path" },
      occurredAt: { type: "text", required: true, label: "Occurred at" },
    },
  } as unknown as AppSchema["entities"][string];
}

function transitionEventEntity(): AppSchema["entities"][string] {
  return {
    label: "Task event",
    fields: {
      sourceEntity: { type: "text", required: true, label: "Source entity" },
      sourceRecordId: { type: "text", required: true, label: "Source record id" },
      transitionKey: { type: "text", required: true, label: "Transition" },
      previousState: { type: "text", required: true, label: "Previous state" },
      nextState: { type: "text", required: true, label: "Next state" },
      actorMode: { type: "text", required: true, label: "Actor mode" },
      occurredAt: { type: "date", required: true, label: "Occurred at" },
    },
  } as unknown as AppSchema["entities"][string];
}

function transitionEventFieldMappings() {
  return {
    sourceEntity: "sourceEntity",
    sourceRecordId: "sourceRecordId",
    transitionKey: "transitionKey",
    previousState: "previousState",
    nextState: "nextState",
    actorMode: "actorMode",
    occurredAt: "occurredAt",
  } as const;
}

function recordPlanOperation(steps: RecordPlanStepSchema[]): EntityOperationSchema {
  return {
    label: "Submit plan",
    kind: "command",
    scope: "collection",
    input: {
      fields: {
        title: { type: "text", required: true, label: "Title" },
        note: { type: "text", required: true, label: "Note" },
      },
    },
    effect: {
      type: "recordPlan",
      steps,
    },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function successfulRecordPlanSteps(): RecordPlanStepSchema[] {
  return [
    createTaskRecordPlanStep(),
    {
      name: "createLog",
      kind: "create",
      entity: "task-log",
      values: {
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "stepOutput", step: "createTask", output: "id" },
        },
        label: { kind: "input", field: "note" },
        actorMode: { kind: "actor", field: "mode" },
        sourcePath: { kind: "source", field: "path" },
        occurredAt: { kind: "generatedTimestamp" },
      },
    },
    {
      name: "touchTask",
      kind: "patch",
      entity: "task",
      recordId: { kind: "stepOutput", step: "createTask", output: "id" },
      values: {
        title: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
      },
    },
  ];
}

function createTaskRecordPlanStep(): RecordPlanStepSchema {
  return {
    name: "createTask",
    kind: "create",
    entity: "task",
    recordId: { kind: "generatedId", prefix: "task" },
    values: {
      title: { kind: "input", field: "title" },
      done: { kind: "literal", value: false },
    },
  };
}

function brokenRecordPlanSteps(): RecordPlanStepSchema[] {
  return [
    createTaskRecordPlanStep(),
    {
      name: "createBrokenLog",
      kind: "create",
      entity: "task-log",
      values: {
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "literal", value: "missing-task" },
        },
        label: { kind: "input", field: "note" },
        actorMode: { kind: "actor", field: "mode" },
        occurredAt: { kind: "generatedTimestamp" },
      },
    },
  ];
}

function schemaWithOperationOnlyTaskCrud(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");

  schema.entities.task = {
    ...taskEntity,
    operations: {
      ...taskEntity.operations,
      ...recordCrudOperations("Task", taskEntity.fields),
      activeList: listOperation("taskActive"),
    },
  };

  return schema;
}

function schemaWithOperationOnlyTaskProjectReference(sourceSchema: AppSchema): AppSchema {
  const schema = schemaWithOperationOnlyTaskCrud(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const taskFields = {
    ...taskEntity.fields,
    project: {
      type: "reference",
      required: false,
      label: "Project",
      to: "project",
      displayField: "name",
    },
  } satisfies EntitySchema["fields"];
  const projectFields = {
    name: {
      type: "text",
      required: true,
      label: "Name",
    },
  } satisfies EntitySchema["fields"];

  schema.entities.task = {
    ...taskEntity,
    fields: taskFields,
    operations: {
      ...taskEntity.operations,
      ...recordCrudOperations("Task", taskFields),
      activeList: listOperation("taskActive"),
    },
  };
  schema.entities.project = {
    label: "Project",
    fields: projectFields,
    operations: recordCrudOperations("Project", projectFields),
  } as unknown as EntitySchema;

  return schema;
}

function requireEntity(schema: AppSchema, entityName: string): EntitySchema {
  const entity = schema.entities[entityName];

  if (!entity) {
    throw new Error(`Expected ${entityName} entity.`);
  }

  return entity;
}

function recordCrudOperations(
  label: string,
  fields: EntitySchema["fields"],
): NonNullable<EntitySchema["operations"]> {
  const input = {
    fields: Object.fromEntries(Object.keys(fields).map((field) => [field, { field }])),
  };

  return {
    create: {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    update: {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    delete: {
      label: `Delete ${label}`,
      kind: "delete",
      scope: "record",
      effect: { type: "tombstoneRecord" },
      output: { type: "delete" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    read: {
      label: `Read ${label}`,
      kind: "get",
      scope: "record",
      output: { type: "get" },
      idempotency: { required: false },
      audit: { input: "summary" },
    },
  };
}

function listOperation(query: string): EntityOperationSchema {
  return {
    kind: "list",
    scope: "collection",
    target: { query },
    output: { type: "list", query },
    idempotency: { required: false },
    audit: { input: "summary" },
  };
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
                changeWritePrefix: app.seedChangeWritePrefix,
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
