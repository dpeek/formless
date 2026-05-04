import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import rawRateCardSchema from "../../schema/samples/rate-card.json";
import { appSchema } from "../client/schema.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  MutationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
  SyncResponse,
} from "../shared/protocol.ts";
import { matchesQuery } from "../shared/query.ts";
import { parseAppSchema, type AppSchema, type EntitySchema } from "../shared/schema.ts";
import { rateCardSeedRecords, taskSeedRecords } from "./fixtures.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
const rateCardSchema = parseAppSchema(rawRateCardSchema);

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

  it("returns query, item view, and collection definitions from bootstrap", async () => {
    const body = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(Object.keys(body.schema.queries)).toEqual([
      "taskAll",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(body.schema.queries.taskOverdue).toEqual(appSchema.queries.taskOverdue);
    expect(body.schema.itemViews.taskListItem).toEqual(appSchema.itemViews.taskListItem);
    expect(body.schema.views.taskHome).toEqual(appSchema.views.taskHome);
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
            ...appSchema.entities.task.fields,
            notes: { type: "text", required: false },
          },
          mutations: defaultMutations(),
        },
      },
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: {},
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

  it("accepts compatible schema updates that change query labels and expressions", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithQueries(defaultQueries()),
    });
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const nextSchema = schemaWithQueries({
      ...defaultQueries(),
      taskActive: {
        label: "Open",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
      },
    });
    const parsedNextSchema = parseAppSchema(nextSchema);

    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(update.schema).toEqual(parsedNextSchema);
    expect(bootstrap.schema).toEqual(parsedNextSchema);
    expect(bootstrap.records).toEqual([created.record]);
  });

  it("rejects query references that point at missing fields through the schema route", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithQueries({
          ...defaultQueries(),
          taskMissing: {
            label: "Missing",
            entity: "task",
            expression: {
              kind: "where",
              ref: { kind: "value", name: "missing" },
              op: "eq",
              value: "yes",
            },
          },
        }),
      },
      'references unknown field "value.missing"',
    );
  });

  it("rejects invalid collection action references through the schema route", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          ...defaultViews(),
          taskHome: {
            ...defaultCollectionView(),
            actions: [{ type: "entityAction", action: "missing" }],
          },
        }),
      },
      'references unknown action "missing"',
    );
  });

  it("rejects invalid table views through the schema route", async () => {
    await expectError(
      "/api/schema",
      {
        schema: {
          ...schemaWithViews({
            ...defaultViews(),
            taskHome: {
              ...defaultCollectionView(),
              result: { type: "table", tableView: "taskTable" },
            },
          }),
          tableViews: {
            taskTable: {
              entity: "task",
              columns: [{ type: "field", field: "missing" }],
            },
          },
        },
      },
      'references unknown field "task.missing"',
    );
  });

  it("accepts compatible schema updates that change query labels and selected scope", async () => {
    const initialSchema = schemaWithQueries({
      ...defaultQueries(),
      taskCompleted: {
        label: "Done",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    });
    const nextSchema = schemaWithQueries({
      ...defaultQueries(),
      taskCompleted: {
        label: "Open",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
      },
    });

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: initialSchema });
    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });

    expect(update.schema).toEqual(parseAppSchema(nextSchema));
  });

  it("keeps dev seed fixture IDs and references coherent", () => {
    expectUniqueIds(taskSeedRecords);
    expectUniqueIds(rateCardSeedRecords);

    const cardIds = new Set(
      rateCardSeedRecords.filter((record) => record.entity === "card").map((record) => record.id),
    );
    const resourceIds = new Set(
      rateCardSeedRecords
        .filter((record) => record.entity === "resource")
        .map((record) => record.id),
    );
    const rates = rateCardSeedRecords.filter((record) => record.entity === "rate");
    const pairs = new Set<string>();

    for (const rate of rates) {
      expect(resourceIds.has(String(rate.values.resource))).toBe(true);
      expect(cardIds.has(String(rate.values.card))).toBe(true);
      pairs.add(`${rate.values.resource}:${rate.values.card}`);
    }

    expect(cardIds).toEqual(new Set(["rec_card_default", "rec_card_premium"]));
    expect(pairs.size).toBe(rates.length);
    expect(rates).toHaveLength(cardIds.size * resourceIds.size);
  });

  it("resets remote data to the task seed schema and sample records", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            ...appSchema.entities.task.fields,
            notes: { type: "text", required: false },
          },
          mutations: defaultMutations(),
        },
      },
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: {},
      views: defaultViews(),
    } satisfies AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    await postMutation("mutation-1", { title: "First", done: false });

    const reset = await postJson<BootstrapResponse>("/api/dev/reset", {});
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const activeTasks = reset.records.filter((record) => record.values.done === false);
    const completedTasks = reset.records.filter((record) => record.values.done === true);
    const overdueTasks = reset.records.filter((record) =>
      matchesQuery(record, appSchema.queries.taskOverdue.expression, { today: "2026-05-02" }),
    );

    expect(reset).toEqual({
      schema: appSchema,
      schemaUpdatedAt: expect.any(String),
      records: taskSeedRecords,
      cursor: taskSeedRecords.length,
    });
    expect(activeTasks.map((record) => record.id)).toEqual([
      "rec_task_overdue",
      "rec_task_today",
      "rec_task_later",
      "rec_task_backlog",
    ]);
    expect(completedTasks.map((record) => record.id)).toEqual(["rec_task_completed"]);
    expect(overdueTasks.map((record) => record.id)).toEqual(["rec_task_overdue"]);
    expect(bootstrap).toEqual(reset);
  });

  it("resets remote data to the rate-card sample schema and seed records", async () => {
    await postMutation("mutation-1", { title: "First", done: false });

    const reset = await postJson<BootstrapResponse>("/api/dev/reset", { schema: "rate-card" });
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const recordsByEntity = countRecordsByEntity(reset.records);

    expect(reset).toEqual({
      schema: rateCardSchema,
      schemaUpdatedAt: expect.any(String),
      records: rateCardSeedRecords,
      cursor: rateCardSeedRecords.length,
    });
    expect(recordsByEntity).toEqual({
      card: 2,
      rate: 10,
      resource: 5,
    });
    expect(bootstrap).toEqual(reset);
  });

  it("returns seeded create changes from sync after reset", async () => {
    await postJson<BootstrapResponse>("/api/dev/reset", {});

    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(sync.cursor).toBe(taskSeedRecords.length);
    expect(sync.changes).toHaveLength(taskSeedRecords.length);
    expect(sync.changes.map((change) => change.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(sync.changes.map((change) => change.mutationId)).toEqual(
      taskSeedRecords.map((record) => `seed-task:${record.id}`),
    );
    expect(sync.changes.map((change) => change.op)).toEqual(taskSeedRecords.map(() => "create"));
    expect(sync.changes.map((change) => change.payload)).toEqual(taskSeedRecords);
  });

  it("clears records when switching reset targets", async () => {
    await postJson<BootstrapResponse>("/api/dev/reset", { schema: "rate-card" });

    const reset = await postJson<BootstrapResponse>("/api/dev/reset", {});
    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(reset.records).toEqual(taskSeedRecords);
    expect(reset.records.every((record) => record.entity === "task")).toBe(true);
    expect(sync.cursor).toBe(taskSeedRecords.length);
    expect(sync.changes.map((change) => change.payload)).toEqual(taskSeedRecords);
  });

  it("applies expanded rate-card defaults when creating sample records", async () => {
    await postJson<BootstrapResponse>("/api/dev/reset", { schema: "rate-card" });

    const resource = await postMutationForEntity("mutation-resource", "resource", {
      name: "Designer",
    });
    const card = await postMutationForEntity("mutation-card", "card", { name: "Default" });
    const rate = await postMutationForEntity("mutation-rate", "rate", {
      resource: resource.record.id,
      card: card.record.id,
      cost: 325,
      price: 475,
    });

    expect(resource.record.values).toEqual({
      name: "Designer",
      kind: "role",
      unit: "day",
    });
    expect(card.record.values).toEqual({
      name: "Default",
      isDefault: false,
      marginMin: 0.4,
      marginMed: 0.5,
      marginMax: 0.6,
    });
    expect(rate.record.values).toEqual({
      resource: resource.record.id,
      card: card.record.id,
      cost: 325,
      costUnit: "day",
      price: 475,
      priceSet: true,
      currency: "usd",
    });
  });

  it("creates missing rate join records through the rate-card action", async () => {
    await postJson<BootstrapResponse>("/api/dev/reset", { schema: "rate-card" });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: rateCardSchemaWithoutAfterCreateHooks(),
    });

    const card = await postMutationForEntity("mutation-card", "card", { name: "Enterprise" });
    const action = await postActionForEntity(
      "action-regenerate-rates",
      "rate",
      "regenerateMissingRates",
    );
    const replay = await postActionForEntity(
      "action-regenerate-rates",
      "rate",
      "regenerateMissingRates",
    );
    const noOp = await postActionForEntity(
      "action-regenerate-rates-noop",
      "rate",
      "regenerateMissingRates",
    );
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const createdRates = action.changes.map((change) => change.payload);

    expect(card.changes).toHaveLength(1);
    expect(action.changes).toHaveLength(5);
    expect(action.changes.every((change) => change.op === "action")).toBe(true);
    expect(createdRates.map((record) => record.values.card)).toEqual(
      Array.from({ length: 5 }, () => card.record.id),
    );
    expect(createdRates[0]?.values).toEqual({
      resource: "rec_resource_designer",
      card: card.record.id,
      cost: 0,
      costUnit: "day",
      price: 0,
      priceSet: true,
      currency: "usd",
    });
    expect(countRecordsByEntity(bootstrap.records)).toEqual({
      card: 3,
      rate: 15,
      resource: 5,
    });
    expect(replay).toEqual(action);
    expect(noOp).toEqual({
      actionId: "action-regenerate-rates-noop",
      changes: [],
      cursor: action.cursor,
    });
  });

  it("runs rate-card afterCreate hooks for card creates through mutation changes", async () => {
    await postJson<BootstrapResponse>("/api/dev/reset", { schema: "rate-card" });

    const body = {
      mutationId: "mutation-card-lifecycle",
      entity: "card",
      op: "create",
      values: { name: "Enterprise" },
    };
    const first = await postJson<MutationResponse>("/api/mutations", body);
    const replay = await postJson<MutationResponse>("/api/mutations", body);
    const sync = await getJson<SyncResponse>("/api/sync?after=0");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const createdRates = first.changes.slice(1).map((change) => change.payload);

    expect(first.record.entity).toBe("card");
    expect(first.record.id).toBe(first.changes[0]?.recordId);
    expect(first.changes).toHaveLength(6);
    expect(first.changes[0]?.op).toBe("create");
    expect(first.changes.slice(1).every((change) => change.op === "action")).toBe(true);
    expect(createdRates.map((record) => record.values.card)).toEqual(
      Array.from({ length: 5 }, () => first.record.id),
    );
    expect(sync.changes.filter((change) => change.mutationId === body.mutationId)).toHaveLength(6);
    expect(countRecordsByEntity(bootstrap.records)).toEqual({
      card: 3,
      rate: 15,
      resource: 5,
    });
    expect(replay).toEqual(first);
  });

  it("runs rate-card afterCreate hooks for resource creates through mutation changes", async () => {
    await postJson<BootstrapResponse>("/api/dev/reset", { schema: "rate-card" });

    const resource = await postMutationForEntity("mutation-resource-lifecycle", "resource", {
      name: "Producer",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const createdRates = resource.changes.slice(1).map((change) => change.payload);

    expect(resource.record.entity).toBe("resource");
    expect(resource.changes).toHaveLength(3);
    expect(resource.changes[0]?.op).toBe("create");
    expect(resource.changes.slice(1).every((change) => change.op === "action")).toBe(true);
    expect(createdRates.map((record) => record.values.resource)).toEqual(
      Array.from({ length: 2 }, () => resource.record.id),
    );
    expect(new Set(createdRates.map((record) => record.values.card))).toEqual(
      new Set(["rec_card_default", "rec_card_premium"]),
    );
    expect(countRecordsByEntity(bootstrap.records)).toEqual({
      card: 2,
      rate: 12,
      resource: 6,
    });
  });

  it("rejects unknown dev reset schemas", async () => {
    await expectError(
      "/api/dev/reset",
      {
        schema: "missing",
      },
      'Unknown reset schema "missing".',
    );
  });

  it("uses the stored schema when validating mutations", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            ...appSchema.entities.task.fields,
            dueDate: { type: "date", required: true },
          },
          mutations: defaultMutations(),
        },
      },
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: {},
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
                title: { type: "money", required: true },
              },
            },
          },
          queries: {},
          itemViews: {},
          tableViews: {},
          views: {},
        },
      },
      'Field "task.title" has unsupported type "money".',
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
      queries: {
        taskAll: {
          label: "All",
          entity: "task",
          expression: { kind: "all" },
        },
      },
      itemViews: {
        taskListItem: {
          entity: "task",
          fields: {
            done: { editor: "boolean", commit: "immediate" },
          },
        },
      },
      tableViews: {},
      views: {
        taskHome: {
          type: "collection",
          label: "Tasks",
          entity: "task",
          queries: [{ query: "taskAll" }],
          defaultQuery: "taskAll",
          result: { type: "list", itemView: "taskListItem" },
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

  it("accepts enum values, applies enum defaults, and rejects unknown options", async () => {
    const withDefault = await postMutation("mutation-1", { title: "First" });
    const explicit = await postMutation("mutation-2", { title: "Second", priority: "high" });

    expect(withDefault.record.values).toMatchObject({
      title: "First",
      done: false,
      priority: "normal",
    });
    expect(explicit.record.values).toMatchObject({
      title: "Second",
      done: false,
      priority: "high",
    });

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-3",
        entity: "task",
        op: "create",
        values: { title: "Third", priority: "missing" },
      },
      'Field "priority" must be a known enum value.',
    );
  });

  it("accepts finite number values and rejects invalid numeric input", async () => {
    const zero = await postMutation("mutation-1", { title: "Zero", estimate: 0 });
    const estimated = await postMutation("mutation-2", { title: "Estimated", estimate: 3 });

    expect(zero.record.values.estimate).toBe(0);
    expect(estimated.record.values.estimate).toBe(3);

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-3",
        entity: "task",
        op: "create",
        values: { title: "String estimate", estimate: "3" },
      },
      'Field "estimate" must be a finite number.',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-4",
        entity: "task",
        op: "create",
        values: { title: "Decimal estimate", estimate: 1.5 },
      },
      'Field "estimate" must be an integer.',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-5",
        entity: "task",
        op: "create",
        values: { title: "Negative estimate", estimate: -1 },
      },
      'Field "estimate" must be greater than or equal to 0.',
    );
  });

  it("clears optional number fields when patched to an empty value", async () => {
    const created = await postMutation("mutation-1", { title: "First", estimate: 4 });
    const cleared = await postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { estimate: "" },
    });
    const zero = await postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-3",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { estimate: 0 },
    });

    expect(cleared.record.values.estimate).toBeUndefined();
    expect(zero.record.values.estimate).toBe(0);
  });

  it("checks number constraints when applying schema updates", async () => {
    const created = await postMutation("mutation-1", { title: "Estimated", estimate: 3 });

    const relaxed = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithEstimateNumber({ max: 5 }),
    });

    expect(relaxed.schema.entities.task?.fields.estimate).toMatchObject({
      type: "number",
      max: 5,
    });

    await expectError(
      "/api/schema",
      {
        schema: schemaWithEstimateNumber({ max: 2 }),
      },
      'Cannot change number constraints for "task.estimate"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithRequiredScore(),
      },
      'Cannot require field "task.score"',
    );

    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    expect(bootstrap.records).toEqual([created.record]);
  });

  it("clears optional enum fields when patched to an empty value", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithPriorityEnum({ required: false }),
    });

    const created = await postMutation("mutation-1", { title: "First", priority: "high" });
    const patched = await postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { priority: "" },
    });

    expect(patched.record.values.priority).toBeUndefined();
  });

  it("validates reference create and patch values against active target records", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", { schema: schemaWithRateReferences() });

    const resource = await postMutationForEntity("mutation-resource", "resource", {
      name: "Designer",
    });
    const card = await postMutationForEntity("mutation-card", "card", { name: "Default" });
    const rate = await postMutationForEntity("mutation-rate", "rate", {
      resource: resource.record.id,
      card: card.record.id,
      backupResource: resource.record.id,
      price: 125,
    });
    const cleared = await postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-clear-reference",
      entity: "rate",
      op: "patch",
      recordId: rate.record.id,
      values: { backupResource: "" },
    });

    expect(rate.record.values).toMatchObject({
      resource: resource.record.id,
      card: card.record.id,
      backupResource: resource.record.id,
      price: 125,
    });
    expect(cleared.record.values.backupResource).toBeUndefined();

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-missing-reference",
        entity: "rate",
        op: "create",
        values: { resource: "missing", card: card.record.id },
      },
      'Field "resource" references unknown resource record "missing".',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-wrong-entity-reference",
        entity: "rate",
        op: "create",
        values: { resource: card.record.id, card: card.record.id },
      },
      'Field "resource" must reference a resource record.',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-empty-reference",
        entity: "rate",
        op: "create",
        values: { resource: "", card: card.record.id },
      },
      'Field "resource" cannot be empty.',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-non-string-reference",
        entity: "rate",
        op: "create",
        values: { resource: 1, card: card.record.id },
      },
      'Field "resource" must be a reference ID.',
    );
  });

  it("rejects tombstoned reference targets", async () => {
    const completed = await postMutation("mutation-task", { title: "Done", done: true });

    await postAction("action-clear", "clearCompletedTasks");
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithAssignmentReference(),
    });

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-assignment",
        entity: "assignment",
        op: "create",
        values: { task: completed.record.id },
      },
      `Field "task" cannot reference tombstoned record "${completed.record.id}".`,
    );
  });

  it("checks reference schema compatibility against existing records", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskProjectReference({ required: false }),
    });
    const project = await postMutationForEntity("mutation-project", "project", {
      name: "Buildout",
      code: "BLD",
    });
    await postMutation("mutation-task", { title: "Scoped", project: project.record.id });

    const required = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskProjectReference({ required: true }),
    });
    const displayChange = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskProjectReference({ required: true, displayField: "code" }),
    });

    expect(required.schema.entities.task?.fields.project).toMatchObject({
      type: "reference",
      required: true,
      to: "project",
    });
    expect(displayChange.schema.entities.task?.fields.project).toMatchObject({
      type: "reference",
      displayField: "code",
    });

    await expectError(
      "/api/schema",
      {
        schema: schemaWithTaskProjectReference({
          required: true,
          to: "milestone",
          includeMilestone: true,
        }),
      },
      'Cannot change reference target for "task.project".',
    );
  });

  it("rejects required reference additions when existing records are missing targets", async () => {
    await postMutation("mutation-task", { title: "Unscoped" });

    await expectError(
      "/api/schema",
      {
        schema: schemaWithTaskProjectReference({ required: true }),
      },
      'Cannot require field "task.project"',
    );
  });

  it("accepts enum option catalog changes without scanning existing records", async () => {
    const created = await postMutation("mutation-1", { title: "First", priority: "high" });

    const nextSchema = schemaWithPriorityEnum({
      default: "normal",
      values: {
        low: { label: "Low" },
        normal: { label: "Standard" },
      },
    });
    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(update.schema.entities.task?.fields.priority).toEqual(
      parseAppSchema(nextSchema).entities.task?.fields.priority,
    );
    expect(bootstrap.records).toEqual([created.record]);
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
      priority: "normal",
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
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: {},
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
              query: "taskActive",
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
      queries: {
        taskAll: {
          label: "All",
          entity: "task",
          expression: { kind: "all" },
        },
      },
      itemViews: {
        taskListItem: {
          entity: "task",
          fields: {
            title: { editor: "text", commit: "field-commit" },
          },
        },
      },
      tableViews: {},
      views: {
        taskHome: {
          type: "collection",
          label: "Tasks",
          entity: "task",
          queries: [{ query: "taskAll" }],
          defaultQuery: "taskAll",
          result: { type: "list", itemView: "taskListItem" },
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

  it("parses collection, item, and create views", () => {
    const withViews = parseAppSchema(schemaWithViews());

    expect(withViews.itemViews.taskListItem).toEqual({
      entity: "task",
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
        priority: { editor: "enum", commit: "immediate" },
      },
    });
    expect(withViews.views?.taskHome).toMatchObject({
      type: "collection",
      label: "All",
      entity: "task",
      queries: [{ query: "taskAll" }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskListItem" },
    });
    expect(withViews.views?.taskCreate).toEqual({
      type: "create",
      entity: "task",
      fields: {
        title: { editor: "text" },
        dueDate: { editor: "date" },
        priority: { editor: "enum" },
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
          queries: {
            taskAll: {
              label: "All",
              entity: "task",
              expression: { kind: "all" },
            },
          },
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                title: { editor: "text", commit: "field-commit" },
              },
            },
          },
          tableViews: {},
          views: {},
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
          queries: {
            taskAll: {
              label: "All",
              entity: "task",
              expression: { kind: "all" },
            },
          },
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                title: { editor: "text", commit: "field-commit" },
              },
            },
          },
          tableViews: {},
          views: {},
        },
      },
      "Schema must define at least one view.",
    );
  });

  it("allows compatible schema updates that only change views", async () => {
    await postMutation("mutation-1", { title: "First", done: false });

    const nextSchema = schemaWithViews({
      taskHome: {
        type: "collection",
        label: "Task planner",
        entity: "task",
        queries: [{ query: "taskAll", label: "Everything" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskListItem" },
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

  it("rejects malformed item and create views in schema updates", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithItemViews({
          taskListItem: {
            entity: "task",
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
        schema: schemaWithItemViews({
          taskListItem: {
            entity: "task",
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
        schema: schemaWithItemViews({
          taskListItem: {
            entity: "task",
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
        schema: schemaWithItemViews({
          taskListItem: {
            entity: "task",
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
          queries: {},
          itemViews: {},
          tableViews: {},
          views: {},
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

function rateCardSchemaWithoutAfterCreateHooks(): AppSchema {
  const resource = rateCardSchema.entities.resource;
  const card = rateCardSchema.entities.card;

  if (!resource || !card) {
    throw new Error("Rate-card schema must include resource and card entities.");
  }

  return {
    ...rateCardSchema,
    entities: {
      ...rateCardSchema.entities,
      resource: {
        ...resource,
        mutations: {
          ...resource.mutations,
          create: { enabled: resource.mutations.create.enabled },
        },
      },
      card: {
        ...card,
        mutations: {
          ...card.mutations,
          create: { enabled: card.mutations.create.enabled },
        },
      },
    },
  };
}

function expectUniqueIds(records: Array<{ id: string }>) {
  expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
}

function countRecordsByEntity(records: Array<{ entity: string }>) {
  return records.reduce<Record<string, number>>((counts, record) => {
    counts[record.entity] = (counts[record.entity] ?? 0) + 1;
    return counts;
  }, {});
}

function schemaWithPriorityEnum(
  enumOverrides: Partial<{
    required: boolean;
    default: string;
    values: Record<string, { label: string }>;
  }> = {},
) {
  const currentPriorityField = appSchema.entities.task.fields.priority;

  if (currentPriorityField?.type !== "enum") {
    throw new Error("Seed task priority field must be an enum.");
  }

  const priorityField = {
    ...currentPriorityField,
    ...enumOverrides,
  };

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          ...appSchema.entities.task.fields,
          priority: priorityField,
        },
        mutations: defaultMutations(),
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
  };
}

function schemaWithMutations(mutations: unknown) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: appSchema.entities.task.fields,
        mutations,
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
  };
}

function schemaWithEstimateNumber(numberOverrides: Record<string, unknown> = {}) {
  const currentEstimateField = appSchema.entities.task.fields.estimate;

  if (currentEstimateField?.type !== "number") {
    throw new Error("Seed task estimate field must be a number.");
  }

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          ...appSchema.entities.task.fields,
          estimate: {
            ...currentEstimateField,
            ...numberOverrides,
          },
        },
        mutations: defaultMutations(),
        actions: appSchema.entities.task.actions,
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
  };
}

function schemaWithRequiredScore() {
  const views = defaultViews();
  const taskCreate = views.taskCreate;

  if (taskCreate.type !== "create") {
    throw new Error("Expected taskCreate to be a create view.");
  }

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          ...appSchema.entities.task.fields,
          score: {
            type: "number",
            required: true,
            label: "Score",
          },
        },
        mutations: defaultMutations(),
        actions: appSchema.entities.task.actions,
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: {
      ...views,
      taskCreate: {
        ...taskCreate,
        fields: {
          ...taskCreate.fields,
          score: { editor: "number" },
        },
      },
    },
  };
}

function schemaWithRateReferences() {
  return {
    version: 1,
    entities: {
      task: appSchema.entities.task,
      resource: {
        label: "Resource",
        fields: {
          name: { type: "text", required: true, label: "Name" },
        },
        mutations: defaultMutations(),
      },
      card: {
        label: "Rate card",
        fields: {
          name: { type: "text", required: true, label: "Name" },
        },
        mutations: defaultMutations(),
      },
      rate: {
        label: "Rate",
        fields: {
          resource: {
            type: "reference",
            required: true,
            label: "Resource",
            to: "resource",
            displayField: "name",
          },
          card: {
            type: "reference",
            required: true,
            label: "Card",
            to: "card",
            displayField: "name",
          },
          backupResource: {
            type: "reference",
            required: false,
            label: "Backup resource",
            to: "resource",
            displayField: "name",
          },
          price: { type: "number", required: false, label: "Price", min: 0 },
        },
        mutations: defaultMutations(),
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
  } satisfies AppSchema;
}

function schemaWithAssignmentReference() {
  return {
    version: 1,
    entities: {
      task: appSchema.entities.task,
      assignment: {
        label: "Assignment",
        fields: {
          task: {
            type: "reference",
            required: true,
            label: "Task",
            to: "task",
            displayField: "title",
          },
        },
        mutations: defaultMutations(),
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
  } satisfies AppSchema;
}

function schemaWithTaskProjectReference({
  displayField = "name",
  includeMilestone = false,
  required,
  to = "project",
}: {
  displayField?: string;
  includeMilestone?: boolean;
  required: boolean;
  to?: string;
}) {
  const taskCreate = appSchema.views.taskCreate;

  if (taskCreate.type !== "create") {
    throw new Error("Expected taskCreate to be a create view.");
  }

  const entities: Record<string, EntitySchema> = {
    task: {
      label: "Task",
      fields: {
        ...appSchema.entities.task.fields,
        project: {
          type: "reference",
          required,
          label: "Project",
          to,
          displayField,
        },
      },
      mutations: defaultMutations(),
      actions: appSchema.entities.task.actions,
    },
    project: {
      label: "Project",
      fields: {
        name: { type: "text", required: true, label: "Name" },
        code: { type: "text", required: true, label: "Code" },
      },
      mutations: defaultMutations(),
    },
  };

  if (includeMilestone) {
    entities.milestone = {
      label: "Milestone",
      fields: {
        name: { type: "text", required: true, label: "Name" },
      },
      mutations: defaultMutations(),
    };
  }

  return {
    version: 1,
    entities,
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: {
      ...appSchema.views,
      taskCreate: {
        ...taskCreate,
        fields: {
          ...taskCreate.fields,
          project: { editor: "reference" },
        },
      },
    },
  } satisfies AppSchema;
}

function schemaWithViews(views: unknown = defaultViews()) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: appSchema.entities.task.fields,
        mutations: defaultMutations(),
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views,
  };
}

function schemaWithQueries(queries: unknown) {
  return {
    ...schemaWithViews(),
    queries,
  };
}

function schemaWithItemViews(itemViews: unknown) {
  return {
    ...schemaWithViews(),
    itemViews,
  };
}

function schemaWithActions(actions: unknown) {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: appSchema.entities.task.fields,
        mutations: defaultMutations(),
        actions,
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
  };
}

function defaultQueries(): AppSchema["queries"] {
  return {
    taskAll: {
      label: "All",
      entity: "task",
      expression: { kind: "all" },
    },
    taskActive: {
      label: "Active",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: false,
      },
    },
    taskCompleted: {
      label: "Completed",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
    },
  };
}

function defaultItemViews(): AppSchema["itemViews"] {
  return {
    taskListItem: {
      entity: "task",
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
        priority: { editor: "enum", commit: "immediate" },
      },
    },
  };
}

function defaultViews(): AppSchema["views"] {
  return {
    taskHome: defaultCollectionView(),
    taskCreate: {
      type: "create",
      entity: "task",
      fields: {
        title: { editor: "text" },
        dueDate: { editor: "date" },
        priority: { editor: "enum" },
      },
    },
  };
}

function defaultCollectionView(): Extract<AppSchema["views"][string], { type: "collection" }> {
  return {
    type: "collection",
    label: "All",
    entity: "task",
    queries: [{ query: "taskAll" }],
    defaultQuery: "taskAll",
    result: { type: "list", itemView: "taskListItem" },
  };
}

async function postMutation(mutationId: string, values: Record<string, unknown>) {
  return postMutationForEntity(mutationId, "task", values);
}

async function postMutationForEntity(
  mutationId: string,
  entity: string,
  values: Record<string, unknown>,
) {
  const response = await harness.fetch("/api/mutations", {
    body: JSON.stringify({
      mutationId,
      entity,
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
  return postActionForEntity(actionId, "task", action);
}

async function postActionForEntity(actionId: string, entity: string, action: string) {
  return postJson<ActionResponse>("/api/actions", {
    actionId,
    entity,
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
