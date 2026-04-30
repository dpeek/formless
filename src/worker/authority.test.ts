import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { appSchema } from "../client/schema.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  MutationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
  SyncResponse,
} from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness("src/worker/index.ts", {
    FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
  });
});

afterEach(async () => {
  await harness.dispose();
});

describe("authority", () => {
  it("returns schema, records, and cursor from bootstrap", async () => {
    const body = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(body).toEqual({
      schema: appSchema,
      schemaUpdatedAt: expect.any(String),
      records: [],
      cursor: 0,
    });
  });

  it("returns the active schema and metadata from the schema route", async () => {
    const body = await getJson<SchemaResponse>("/api/schema");

    expect(body.schema).toEqual(appSchema);
    expect(body.updatedAt).toEqual(expect.any(String));
  });

  it("persists compatible schema updates and returns them from bootstrap", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            title: { type: "text", required: true },
            done: { type: "boolean", required: true, default: false },
            dueDate: { type: "date", required: false },
            notes: { type: "text", required: false },
          },
          mutations: defaultMutations(),
        },
      },
      views: defaultViews(),
    } satisfies AppSchema;

    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(update.schema).toEqual(nextSchema);
    expect(update.updatedAt).toEqual(expect.any(String));
    expect(schemaResponse.schema).toEqual(nextSchema);
    expect(schemaResponse.updatedAt).toBe(update.updatedAt);
    expect(bootstrap.schema).toEqual(nextSchema);
    expect(bootstrap.schemaUpdatedAt).toBe(update.updatedAt);
  });

  it("resets remote data to the seed schema and clears records", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            title: { type: "text", required: true },
            done: { type: "boolean", required: true, default: false },
            dueDate: { type: "date", required: false },
            notes: { type: "text", required: false },
          },
          mutations: defaultMutations(),
        },
      },
      views: defaultViews(),
    } satisfies AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    await postMutation("mutation-1", { title: "First", done: false });

    const reset = await postJson<BootstrapResponse>("/api/dev/reset", {});
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(reset).toEqual({
      schema: appSchema,
      schemaUpdatedAt: expect.any(String),
      records: [],
      cursor: 0,
    });
    expect(bootstrap).toEqual(reset);
  });

  it("uses the stored schema when validating mutations", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            title: { type: "text", required: true },
            done: { type: "boolean", required: true, default: false },
            dueDate: { type: "date", required: true },
          },
          mutations: defaultMutations(),
        },
      },
      views: defaultViews(),
    } satisfies AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "First" },
      },
      'Field "dueDate" is required.',
    );
  });

  it("rejects unsupported field types in schema updates", async () => {
    await expectError(
      "/api/schema",
      {
        schema: {
          version: 1,
          entities: {
            task: {
              label: "Task",
              fields: {
                title: { type: "number", required: true },
              },
            },
          },
        },
      },
      'Field "task.title" has unsupported type "number".',
    );
  });

  it("rejects incompatible schema changes", async () => {
    await postMutation("mutation-1", { title: "First", done: false });

    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Task",
          fields: {
            done: { type: "boolean", required: true, default: false },
          },
          mutations: defaultMutations(),
        },
      },
      views: {
        taskListItem: {
          type: "list",
          label: "All",
          entity: "task",
          query: { kind: "all" },
          fields: {
            done: { editor: "boolean", commit: "immediate" },
          },
        },
        taskCreate: {
          type: "create",
          entity: "task",
          fields: {
            done: { editor: "boolean" },
          },
        },
      },
    } satisfies AppSchema;

    await expectError(
      "/api/schema",
      { schema: nextSchema },
      'Cannot remove or rename field "task.title"',
    );
  });

  it("returns changes after a known sync cursor", async () => {
    await postMutation("mutation-1", { title: "First", done: false });
    const second = await postMutation("mutation-2", { title: "Second", done: true });

    const body = await getJson<SyncResponse>("/api/sync?after=1");

    expect(body.cursor).toBe(2);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      mutationId: "mutation-2",
      recordId: second.record.id,
      payload: second.record,
    });
  });

  it("omits schema from sync when the client schema timestamp is current", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const body = await getJson<SyncResponse>(
      `/api/sync?after=0&schemaUpdatedAt=${encodeURIComponent(schemaResponse.updatedAt)}`,
    );

    expect(body.schema).toBeUndefined();
    expect(body.schemaUpdatedAt).toBeUndefined();
  });

  it("returns schema from sync when the client schema timestamp is missing or stale", async () => {
    const missing = await getJson<SyncResponse>("/api/sync?after=0");
    const stale = await getJson<SyncResponse>(
      "/api/sync?after=0&schemaUpdatedAt=2026-04-27T00%3A00%3A00.000Z",
    );

    expect(missing.schema).toEqual(appSchema);
    expect(missing.schemaUpdatedAt).toEqual(expect.any(String));
    expect(stale.schema).toEqual(appSchema);
    expect(stale.schemaUpdatedAt).toBe(missing.schemaUpdatedAt);
  });

  it("rejects invalid sync cursors", async () => {
    await expectError("/api/sync?after=bad", undefined, "Sync cursor must be");
  });

  it("rejects unknown entity names", async () => {
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "missing",
        op: "create",
        values: { title: "First" },
      },
      'Unknown entity "missing".',
    );
  });

  it("rejects empty required text", async () => {
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "   ", done: false },
      },
      'Field "title" cannot be empty.',
    );
  });

  it("accepts task values and applies the boolean default", async () => {
    const response = await postMutation("mutation-1", {
      title: "Plan week",
      dueDate: "2026-05-01",
    });

    expect(response.record).toMatchObject({
      entity: "task",
      values: {
        title: "Plan week",
        done: false,
        dueDate: "2026-05-01",
      },
    });
  });

  it("rejects invalid boolean and date values", async () => {
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "First", done: "false" },
      },
      'Field "done" must be a boolean.',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-2",
        entity: "task",
        op: "create",
        values: { title: "First", done: false, dueDate: "05/01/2026" },
      },
      'Field "dueDate" must be a YYYY-MM-DD date.',
    );
  });

  it("patches an existing record and returns patch changes from sync", async () => {
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const patched = await postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { done: true, dueDate: "2026-05-01" },
    });
    const sync = await getJson<SyncResponse>("/api/sync?after=1");

    expect(patched.record.values).toEqual({
      title: "First",
      done: true,
      dueDate: "2026-05-01",
    });
    expect(sync.changes).toHaveLength(1);
    expect(sync.changes[0]).toMatchObject({
      mutationId: "mutation-2",
      op: "patch",
      recordId: created.record.id,
      payload: patched.record,
    });
  });

  it("rejects invalid patch mutations", async () => {
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const schemaWithProject = {
      version: 1,
      entities: {
        task: appSchema.entities.task,
        project: {
          label: "Project",
          fields: {
            name: { type: "text", required: true },
          },
          mutations: defaultMutations(),
        },
      },
      views: defaultViews(),
    } satisfies AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: schemaWithProject });

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-2",
        entity: "task",
        op: "patch",
        recordId: "missing",
        values: { title: "Second" },
      },
      'Unknown record "missing".',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-3",
        entity: "task",
        op: "patch",
        recordId: created.record.id,
        values: { missing: "Second" },
      },
      'Unknown field "missing".',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-4",
        entity: "project",
        op: "patch",
        recordId: created.record.id,
        values: { name: "Second" },
      },
      "Patch entity must match the stored record entity.",
    );
  });

  it("replays patch mutation IDs without duplicating changes", async () => {
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const body = {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { title: "Second" },
    };

    const first = await postJson<MutationResponse>("/api/mutations", body);
    const replay = await postJson<MutationResponse>("/api/mutations", body);
    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(replay).toEqual(first);
    expect(sync.changes).toHaveLength(2);
  });

  it("rejects undeclared or unknown actions", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", { schema: schemaWithViews() });

    await expectError(
      "/api/actions",
      {
        actionId: "action-1",
        entity: "task",
        action: "clearCompletedTasks",
      },
      'Unknown action "clearCompletedTasks" for entity "task".',
    );

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: appSchema });
    await expectError(
      "/api/actions",
      {
        actionId: "action-2",
        entity: "task",
        action: "missing",
      },
      'Unknown action "missing" for entity "task".',
    );
  });

  it("tombstones completed records through clearCompletedTasks", async () => {
    const completed = await postMutation("mutation-1", { title: "Done", done: true });
    const active = await postMutation("mutation-2", { title: "Open", done: false });

    const action = await postAction("action-1", "clearCompletedTasks");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>("/api/sync?after=2");

    expect(action.actionId).toBe("action-1");
    expect(action.cursor).toBe(3);
    expect(action.changes).toHaveLength(1);
    expect(action.changes[0]).toMatchObject({
      mutationId: "action-1",
      op: "action",
      recordId: completed.record.id,
      payload: {
        id: completed.record.id,
        deletedAt: expect.any(String),
      },
    });
    expect(bootstrap.records).toEqual([
      expect.objectContaining({ id: completed.record.id, deletedAt: expect.any(String) }),
      active.record,
    ]);
    expect(sync.changes).toEqual(action.changes);
  });

  it("replays clearCompletedTasks action IDs without duplicating changes", async () => {
    await postMutation("mutation-1", { title: "Done", done: true });

    const first = await postAction("action-1", "clearCompletedTasks");
    const replay = await postAction("action-1", "clearCompletedTasks");
    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(replay).toEqual(first);
    expect(sync.changes.filter((change) => change.op === "action")).toHaveLength(1);
  });

  it("replays action IDs without selecting newly matching records", async () => {
    const firstCompleted = await postMutation("mutation-1", { title: "Done", done: true });

    const first = await postAction("action-1", "clearCompletedTasks");
    const secondCompleted = await postMutation("mutation-2", { title: "Done later", done: true });
    const replay = await postAction("action-1", "clearCompletedTasks");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(replay).toEqual(first);
    expect(first.changes.map((change) => change.recordId)).toEqual([firstCompleted.record.id]);
    expect(bootstrap.records).toEqual([
      expect.objectContaining({ id: firstCompleted.record.id, deletedAt: expect.any(String) }),
      secondCompleted.record,
    ]);
  });

  it("records no-op action executions for idempotent replay", async () => {
    await postMutation("mutation-1", { title: "Open", done: false });

    const first = await postAction("action-1", "clearCompletedTasks");
    const replay = await postAction("action-1", "clearCompletedTasks");

    expect(first).toEqual({
      actionId: "action-1",
      changes: [],
      cursor: 1,
    });
    expect(replay).toEqual(first);
  });

  it("rejects action schemas with invalid target queries through the schema route", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithActions({
          clearCompletedTasks: {
            label: "Clear completed",
            kind: "clear-completed",
          },
        }),
      },
      "target must be an object",
    );

    await expectError(
      "/api/schema",
      {
        schema: schemaWithActions({
          clearCompletedTasks: {
            label: "Clear completed",
            kind: "clear-completed",
            target: {
              query: {
                kind: "where",
                ref: { kind: "value", name: "done" },
                op: "eq",
                value: false,
              },
            },
          },
        }),
      },
      "target must be value.done eq true",
    );
  });

  it("parses field labels and explicit mutation policy", () => {
    const explicit = parseAppSchema({
      version: 1,
      entities: {
        task: {
          label: "Task",
          fields: {
            title: { type: "text", required: true, label: "Task title" },
          },
          mutations: defaultMutations(),
        },
      },
      views: {
        taskListItem: {
          type: "list",
          label: "All",
          entity: "task",
          query: { kind: "all" },
          fields: {
            title: { editor: "text", commit: "field-commit" },
          },
        },
        taskCreate: {
          type: "create",
          entity: "task",
          fields: {
            title: { editor: "text" },
          },
        },
      },
    });

    expect(explicit.entities.task?.fields.title?.label).toBe("Task title");
    expect(explicit.entities.task?.mutations).toEqual(defaultMutations());
  });

  it("parses list and create views", () => {
    const withViews = parseAppSchema(schemaWithViews());

    expect(withViews.views?.taskListItem).toEqual({
      type: "list",
      label: "All",
      entity: "task",
      query: { kind: "all" },
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
      },
    });
    expect(withViews.views?.taskCreate).toEqual({
      type: "create",
      entity: "task",
      fields: {
        title: { editor: "text" },
        dueDate: { editor: "date" },
      },
    });
  });

  it("rejects schemas without explicit mutation policy or views", async () => {
    await expectError(
      "/api/schema",
      {
        schema: {
          version: 1,
          entities: {
            task: {
              label: "Task",
              fields: {
                title: { type: "text", required: true },
              },
            },
          },
          views: {
            taskListItem: {
              type: "list",
              label: "All",
              entity: "task",
              query: { kind: "all" },
              fields: {
                title: { editor: "text", commit: "field-commit" },
              },
            },
          },
        },
      },
      'Entity "task" mutations must be an object.',
    );
    await expectError(
      "/api/schema",
      {
        schema: {
          version: 1,
          entities: {
            task: {
              label: "Task",
              fields: {
                title: { type: "text", required: true },
              },
              mutations: defaultMutations(),
            },
          },
        },
      },
      "Schema views must be an object.",
    );
  });

  it("allows compatible schema updates that only change views", async () => {
    await postMutation("mutation-1", { title: "First", done: false });

    const nextSchema = schemaWithViews({
      taskListItem: {
        type: "list",
        label: "All",
        entity: "task",
        query: { kind: "all" },
        fields: {
          title: { editor: "text", commit: "field-commit" },
        },
      },
      taskCreate: {
        type: "create",
        entity: "task",
        fields: {
          title: { editor: "text" },
        },
      },
    });

    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });

    expect(update.schema).toEqual(nextSchema);
  });

  it("rejects malformed list views in schema updates", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          taskListItem: {
            type: "list",
            label: "All",
            entity: "task",
            query: { kind: "all" },
            fields: {
              missing: { editor: "text", commit: "field-commit" },
            },
          },
        }),
      },
      'references unknown field "task.missing"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          taskListItem: {
            type: "list",
            label: "All",
            entity: "task",
            query: { kind: "all" },
            fields: {
              done: { editor: "text", commit: "field-commit" },
            },
          },
        }),
      },
      'editor must match field type "boolean"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          taskListItem: {
            type: "list",
            label: "All",
            entity: "task",
            query: { kind: "all" },
            fields: {
              title: { editor: "text", commit: "immediate" },
            },
          },
        }),
      },
      "text fields must use field-commit",
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          taskListItem: {
            type: "list",
            label: "All",
            entity: "task",
            query: { kind: "all" },
            fields: {
              title: { editor: "text", commit: "field-commit", width: "wide" },
            },
          },
        }),
      },
      'has unsupported key "width"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          taskCreate: {
            type: "create",
            entity: "task",
            fields: {
              dueDate: { editor: "date" },
            },
          },
        }),
      },
      'must include required field "title"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          taskCreate: {
            type: "create",
            entity: "task",
            fields: {
              title: { editor: "text", commit: "field-commit" },
            },
          },
        }),
      },
      'has unsupported key "commit"',
    );
  });

  it("rejects malformed field labels in schema updates", async () => {
    await expectError(
      "/api/schema",
      {
        schema: {
          version: 1,
          entities: {
            task: {
              label: "Task",
              fields: {
                title: { type: "text", required: true, label: "" },
              },
            },
          },
        },
      },
      'Field "task.title" label must be a non-empty string.',
    );
  });

  it("rejects malformed mutation policy in schema updates", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithMutations({ create: { enabled: true }, delete: { enabled: false } }),
      },
      'mutations must include "patch"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithMutations({
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
          archive: { enabled: true },
        }),
      },
      'mutations has unsupported key "archive"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithMutations({
          create: { enabled: true },
          patch: { enabled: true, handler: "taskPatch" },
          delete: { enabled: false },
        }),
      },
      'patch mutation policy has unsupported key "handler"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithMutations({
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: true },
        }),
      },
      "delete.enabled must be false",
    );
  });

  it("rejects disabled create and patch mutations", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithMutations({
        create: { enabled: false },
        patch: { enabled: true },
        delete: { enabled: false },
      }),
    });
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "First", done: false },
      },
      'Create mutations are disabled for entity "task".',
    );

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: appSchema });
    const created = await postMutation("mutation-2", { title: "First", done: false });

    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithMutations({
        create: { enabled: true },
        patch: { enabled: false },
        delete: { enabled: false },
      }),
    });
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-3",
        entity: "task",
        op: "patch",
        recordId: created.record.id,
        values: { title: "Second" },
      },
      'Patch mutations are disabled for entity "task".',
    );
  });

  it("replays accepted mutations after policy is disabled", async () => {
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const patched = await postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { title: "Second" },
    });

    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithMutations({
        create: { enabled: false },
        patch: { enabled: false },
        delete: { enabled: false },
      }),
    });

    await expect(postMutation("mutation-1", { title: "First", done: false })).resolves.toEqual(
      created,
    );
    await expect(
      postJson<MutationResponse>("/api/mutations", {
        mutationId: "mutation-2",
        entity: "task",
        op: "patch",
        recordId: created.record.id,
        values: { title: "Second" },
      }),
    ).resolves.toEqual(patched);
  });

  it("rejects bad JSON request bodies", async () => {
    const response = await harness.fetch("/api/mutations", {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON." });
  });
});

function defaultMutations(): AppSchema["entities"][string]["mutations"] {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
}

function schemaWithMutations(mutations: unknown) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
          dueDate: { type: "date", required: false },
        },
        mutations,
      },
    },
    views: defaultViews(),
  };
}

function schemaWithViews(views: unknown = defaultViews()) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
          dueDate: { type: "date", required: false },
        },
        mutations: defaultMutations(),
      },
    },
    views,
  };
}

function schemaWithActions(actions: unknown) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
          dueDate: { type: "date", required: false },
        },
        mutations: defaultMutations(),
        actions,
      },
    },
    views: defaultViews(),
  };
}

function defaultViews(): AppSchema["views"] {
  return {
    taskListItem: {
      type: "list",
      label: "All",
      entity: "task",
      query: { kind: "all" },
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
      },
    },
    taskCreate: {
      type: "create",
      entity: "task",
      fields: {
        title: { editor: "text" },
        dueDate: { editor: "date" },
      },
    },
  };
}

async function postMutation(mutationId: string, values: Record<string, unknown>) {
  const response = await harness.fetch("/api/mutations", {
    body: JSON.stringify({
      mutationId,
      entity: "task",
      op: "create",
      values,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as MutationResponse;
}

async function postAction(actionId: string, action: string) {
  return postJson<ActionResponse>("/api/actions", {
    actionId,
    entity: "task",
    action,
  });
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function expectError(path: string, body: unknown, message: string) {
  const response = await harness.fetch(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method: body === undefined ? "GET" : "POST",
  });

  expect(response.status).toBe(400);
  expect((await response.json()) as { error: string }).toEqual({
    error: expect.stringContaining(message),
  });
}
