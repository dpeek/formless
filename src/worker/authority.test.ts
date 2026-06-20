import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { WebSocketEventMap } from "miniflare";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BootstrapResponse,
  type SchemaResponse,
  type SchemaUpdateResponse,
  type SyncResponse,
  type SyncSocketServerMessage,
} from "../shared/protocol.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import { packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageResolver,
  type AppPackageManifest,
} from "../shared/app-packages.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { computeSourceSchemaHash, type SourceSchemaHash } from "../shared/upgrade-migrations.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import {
  parseAppSchema,
  type AppSchema,
  type EntitySchema,
  type RegisteredCommandEntityOperationEffectSchema,
} from "@dpeek/formless-schema";
import {
  crmSeedRecords,
  crmSourceSchema,
  rateSeedRecords as rateCardSeedRecords,
  siteSeedRecords,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema as appSchema,
} from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";
import {
  commandOperationRequest,
  createAuthorityWriteHelpers,
  recordOperationRequest,
  operationWriteRequest,
  type AuthorityWriteHelpers,
  type AuthorityTestCommandOperationRequest,
  type AuthorityTestRecordOperationRequest,
} from "../test/authority-write.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
let authority: AuthorityWriteHelpers;

function taskSchemaProvenance() {
  const packageFacts = packageAppFactsForKey("tasks", bundledAppPackageResolver);

  if (!packageFacts) {
    throw new Error("Expected bundled Tasks package facts.");
  }

  return {
    kind: "package-app" as const,
    packageAppKey: "tasks",
    packageRevision: packageFacts.packageRevision,
    sourceSchemaHash: packageFacts.sourceSchemaHash,
  };
}

beforeAll(async () => {
  harness = await createWorkerHarness("src/worker/index.ts", {
    FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
  });
  authority = createAuthorityWriteHelpers(harness);
});

beforeEach(async () => {
  await resetSchemaApp("tasks");
  await resetSchemaApp("site");
  await resetSchemaApp("crm");
  useSchemaApp("tasks");
});

afterAll(async () => {
  await harness.dispose();
});

describe("authority", () => {
  it("returns schema, records, and cursor from bootstrap", async () => {
    const body = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(body).toEqual({
      schema: appSchema,
      schemaProvenance: taskSchemaProvenance(),
      schemaUpdatedAt: expect.any(String),
      records: taskSeedRecords,
      cursor: taskSeedRecords.length,
    });
  });

  it("returns browser replica upgrade facts on compatible bootstrap and sync reads", async () => {
    const bootstrap = await harness.fetch(apiPath("/api/bootstrap"));
    const bootstrapBody = (await bootstrap.json()) as BootstrapResponse;
    const sync = await harness.fetch(
      apiPath(
        `/api/sync?after=${bootstrapBody.cursor}&schemaUpdatedAt=${encodeURIComponent(
          "2026-01-01T00:00:00.000Z",
        )}`,
      ),
    );
    const syncBody = (await sync.json()) as SyncResponse;
    const packageFacts = packageAppFactsForKey("tasks", bundledAppPackageResolver);

    expect(bootstrap.status).toBe(200);
    expect(sync.status).toBe(200);
    expect(bootstrap.headers.get(FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER)).toBe(
      String(FORMLESS_RUNTIME_PROTOCOL_VERSION),
    );
    expect(sync.headers.get(FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER)).toBe(
      bootstrapBody.schemaUpdatedAt,
    );
    expect(sync.headers.get(FORMLESS_CLIENT_PACKAGE_REVISION_HEADER)).toBe(
      String(packageFacts?.packageRevision),
    );
    expect(sync.headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(
      packageFacts?.sourceSchemaHash,
    );
    expect(bootstrapBody.schemaProvenance).toEqual({
      kind: "package-app",
      packageAppKey: "tasks",
      packageRevision: packageFacts?.packageRevision,
      sourceSchemaHash: packageFacts?.sourceSchemaHash,
    });
    expect(syncBody).toMatchObject({
      changes: [],
      cursor: bootstrapBody.cursor,
      schema: appSchema,
      schemaProvenance: bootstrapBody.schemaProvenance,
      schemaUpdatedAt: bootstrapBody.schemaUpdatedAt,
    });
  });

  it("returns the site source schema from the site bootstrap path", async () => {
    useSchemaApp("site");

    const body = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(body.schema).toEqual(siteSourceSchema);
    expect(body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(body.cursor).toBe(siteSeedRecords.length);
    expectRecordsIgnoringOrder(body.records, siteSeedRecords);
    expect(new Set(body.records.map((record) => record.entity))).toEqual(
      new Set(["site", "block", "block-placement"]),
    );
  });

  it("rejects stale browser writes before commit or push notification", async () => {
    const before = await getJson<BootstrapResponse>("/api/bootstrap");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, before.cursor, before.schemaUpdatedAt);
      const capture = captureSyncSocketMessages(socket);
      const response = await harness.fetch(apiPath("/api/operations/task/create"), {
        body: JSON.stringify({
          idempotencyKey: "operation-stale-client-rejected",
          input: {
            title: "Stale client write",
            done: false,
          },
        }),
        headers: {
          "Content-Type": "application/json",
          [FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER]: "2026-01-01T00:00:00.000Z",
        },
        method: "POST",
      });
      const body = (await response.json()) as {
        code: string;
        reloadRequired: boolean;
        upgrade: { schemaUpdatedAt: string | null };
      };
      const after = await getJson<BootstrapResponse>("/api/bootstrap");

      expect(response.status).toBe(409);
      expect(body).toMatchObject({
        code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
        reloadRequired: true,
        upgrade: {
          schemaUpdatedAt: before.schemaUpdatedAt,
        },
      });
      expect(after.cursor).toBe(before.cursor);
      expect(after.records).toEqual(before.records);
      await expectNoCapturedMessages(capture);
      capture.stop();
    } finally {
      socket.close();
    }
  });

  it("bootstraps installed Site API routes from the bundled Site source", async () => {
    await resetInstalledApp("site", "starter");

    const body = await getInstalledAppJson<BootstrapResponse>("site", "starter", "/bootstrap");

    expect(body.schema).toEqual(siteSourceSchema);
    expect(body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(body.cursor).toBe(siteSeedRecords.length);
    expectRecordsIgnoringOrder(body.records, siteSeedRecords);
  });

  it("isolates installed Site storage by install id while preserving legacy Site storage", async () => {
    await resetInstalledApp("site", "personal");
    await resetInstalledApp("site", "docs");

    const created = await postInstalledAppRecordOperation("site", "personal", {
      idempotencyKey: "mutation-installed-site-page",
      entity: "block",
      operationName: "create",
      input: {
        type: "page",
        label: "Personal only",
        href: "/personal-only",
      },
    });

    const personal = await getInstalledAppJson<BootstrapResponse>("site", "personal", "/bootstrap");
    const docs = await getInstalledAppJson<BootstrapResponse>("site", "docs", "/bootstrap");
    useSchemaApp("site");
    const legacySite = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(personal.records).toContainEqual(created.record);
    expect(docs.records).not.toContainEqual(created.record);
    expect(legacySite.records).not.toContainEqual(created.record);
    expect(docs.schema).toEqual(siteSourceSchema);
    expect(legacySite.schema).toEqual(siteSourceSchema);
  });

  it("isolates installed Tasks storage, sync, reset, snapshot, and actions by install id", async () => {
    await resetInstalledApp("tasks", "work");
    await resetInstalledApp("tasks", "team");

    const initialSync = await getInstalledAppJson<SyncResponse>("tasks", "work", "/sync?after=0");
    const created = await postInstalledAppRecordOperation("tasks", "work", {
      idempotencyKey: "mutation-installed-tasks-work",
      entity: "task",
      operationName: "create",
      input: {
        title: "Installed work only",
        done: true,
      },
    });
    const workSnapshot = await getInstalledAppJson<StorageSnapshot>("tasks", "work", "/snapshot");
    const restoredRecord = taskSnapshotRecord("snapshot-installed-task", "Restored installed task");
    const restored = await postInstalledAppJson<BootstrapResponse>(
      "tasks",
      "work",
      "/snapshot/restore",
      storageSnapshot({
        storageIdentity: "app:work",
        sourceCursor: workSnapshot.sourceCursor,
        schemaUpdatedAt: workSnapshot.schemaUpdatedAt,
        records: [restoredRecord],
      }),
    );
    const cleared = await postInstalledAppRecordOperation("tasks", "work", {
      idempotencyKey: "mutation-installed-tasks-completed",
      entity: "task",
      operationName: "create",
      input: {
        title: "Completed installed task",
        done: true,
      },
    });
    const action = await postInstalledAppCommandOperation("tasks", "work", {
      idempotencyKey: "action-installed-tasks-clear-completed",
      entity: "task",
      operationName: "clearCompletedTasks",
    });
    const reset = await postInstalledAppJson<BootstrapResponse>("tasks", "work", "/reset/seed", {});
    const work = await getInstalledAppJson<BootstrapResponse>("tasks", "work", "/bootstrap");
    const team = await getInstalledAppJson<BootstrapResponse>("tasks", "team", "/bootstrap");
    const legacy = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(initialSync.cursor).toBe(taskSeedRecords.length);
    expect(initialSync.changes.map((change) => change.payload)).toEqual(taskSeedRecords);
    expect(workSnapshot).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      storageIdentity: "app:work",
      schemaKey: "tasks",
      schema: appSchema,
      sourceCursor: created.cursor,
    });
    expect(workSnapshot.records).toEqual([...taskSeedRecords, created.record]);
    expect(restored.records).toContainEqual(restoredRecord);
    expect(action.changes.map((change) => change.payload)).toContainEqual(
      expect.objectContaining({
        id: cleared.record.id,
        deletedAt: expect.any(String),
      }),
    );
    expect(reset.records).toEqual(taskSeedRecords);
    expect(work.records).toEqual(taskSeedRecords);
    expect(team.records).toEqual(taskSeedRecords);
    expect(legacy.records).toEqual(taskSeedRecords);
    expect(team.records).not.toContainEqual(created.record);
    expect(legacy.records).not.toContainEqual(created.record);
  });

  it("projects installed Site tree media asset ids through core delivery with manual href fallback", async () => {
    await postInstalledAppJson<BootstrapResponse>(
      "site",
      "personal",
      "/snapshot/restore",
      siteStorageSnapshot({
        storageIdentity: "app:personal",
        records: [
          ...testSiteSeedRecords,
          {
            id: "rec_installed_site_image",
            entity: "block",
            values: {
              type: "image",
              label: "Installed image",
              mediaAssetId: "installed.webp",
              href: "https://cdn.example.com/installed-manual.webp",
            },
            createdAt: "2026-05-22T00:00:00.000Z",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
          {
            id: "rec_installed_site_image_place",
            entity: "block-placement",
            values: {
              parent: "rec_site_content_home",
              block: "rec_installed_site_image",
              order: 9000,
            },
            createdAt: "2026-05-22T00:00:01.000Z",
            updatedAt: "2026-05-22T00:00:01.000Z",
          },
        ],
      }),
    );

    const body = await getInstalledAppJson<SitePageTreeResponse>("site", "personal", "/tree/home");

    expect(JSON.stringify(body)).toContain("/api/formless/media/media/images/installed.webp");
    expect(JSON.stringify(body)).toContain("https://cdn.example.com/installed-manual.webp");
    expect(JSON.stringify(body)).not.toContain("/api/site/media/site/images/installed.webp");
    expect(JSON.stringify(body)).not.toContain("/api/app-installs/site/personal/media/");
  });

  it("renders duplicate installed Site public slugs from the selected install storage", async () => {
    await postInstalledAppJson<BootstrapResponse>(
      "site",
      "personal",
      "/snapshot/restore",
      siteStorageSnapshot({
        storageIdentity: "app:personal",
        records: siteRecordsWithHomeLabel("Personal Home"),
      }),
    );
    await postInstalledAppJson<BootstrapResponse>(
      "site",
      "docs",
      "/snapshot/restore",
      siteStorageSnapshot({
        storageIdentity: "app:docs",
        records: siteRecordsWithHomeLabel("Docs Home"),
      }),
    );

    const personal = await getInstalledAppJson<SitePageTreeResponse>(
      "site",
      "personal",
      "/tree/home",
    );
    const docs = await getInstalledAppJson<SitePageTreeResponse>("site", "docs", "/tree/home");

    expect(personal.page.label).toBe("Personal Home");
    expect(docs.page.label).toBe("Docs Home");
    expect(personal.meta.slug).toBe("home");
    expect(docs.meta.slug).toBe("home");
  });

  it("returns a public page tree for a published site page", async () => {
    useSchemaApp("site");
    await postJson<BootstrapResponse>("/api/snapshot/restore", siteStorageSnapshot());

    const response = await harness.fetch(apiPath("/api/tree/home"));
    const body = (await response.json()) as SitePageTreeResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_SITE_TREE_CACHE_CONTROL);
    expect(body.page).toMatchObject({
      id: "rec_site_content_home",
      type: "page",
      label: "Home",
      href: "/",
    });
    expect(body.site).toMatchObject({
      id: "rec_site_settings_primary",
      label: "Example Site",
      description: "A public test site.",
      icon: expect.stringContaining("<svg"),
    });
    expect(body.page.placements.length).toBeGreaterThan(0);
    expect(body.meta).toEqual({
      slug: "home",
      generatedAt: expect.any(String),
      warnings: [],
    });
    expect(body.page.placements.length).toBeGreaterThan(0);
    expect(body.frame.header?.id).toBe("rec_site_content_group_header");
    expect(body.frame.footer?.id).toBe("rec_site_content_group_footer");
    expect(body).not.toHaveProperty("schema");
    expect(body).not.toHaveProperty("records");
  });

  it("returns a public page tree for any live site page href", async () => {
    useSchemaApp("site");
    await postCreateOperationForEntity("mutation-site-extra-page", "block", {
      type: "page",
      label: "Extra page",
      href: "/extra-page",
    });

    const body = await getJson<SitePageTreeResponse>("/api/tree/extra-page");

    expect(body.page).toMatchObject({
      type: "page",
      label: "Extra page",
      href: "/extra-page",
    });
  });

  it("returns regular blog and dated post route trees for the site app", async () => {
    useSchemaApp("site");
    await postJson<BootstrapResponse>("/api/snapshot/restore", siteStorageSnapshot());

    const blog = await getJson<SitePageTreeResponse>("/api/tree/blog");
    const post = await getJson<SitePageTreeResponse>(
      "/api/tree/blog%2Fshipping-schema-backed-authoring",
    );

    expect(blog.route).toEqual({
      kind: "page",
      slug: "blog",
    });
    expect(blog.page).toMatchObject({
      id: "rec_site_content_blog",
      type: "page",
    });
    expect(post.route).toEqual({
      kind: "post",
      slug: "blog/shipping-schema-backed-authoring",
    });
    expect(post.page).toMatchObject({
      id: "rec_site_content_post_shipped_schema",
      type: "post",
    });
  });

  it("returns 404 for a missing site page href", async () => {
    useSchemaApp("site");

    const response = await harness.fetch(apiPath("/api/tree/missing-page"));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_SITE_TREE_CACHE_CONTROL);
    expect((await response.json()) as { error: string }).toEqual({
      error: "Site page not found.",
    });
  });

  it("rejects page tree requests for non-site schema keys", async () => {
    const response = await harness.fetch(apiPath("/api/tree/home"));

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: 'Package app "tasks" does not declare public Site runtime support.',
    });
  });

  it("rejects public tree reads for public Site packages without a Worker adapter", async () => {
    const sourceSchemaHash = await computeSourceSchemaHash(siteSourceSchema);
    const privateHarness = await createWorkerHarness(
      "src/worker/index.ts",
      {
        FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
      },
      {
        bindings: {
          FORMLESS_ADMIN_TOKEN: "test-admin-token",
          [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
            {
              manifest: privatePublicSitePackageManifest(sourceSchemaHash),
              sourceSchema: siteSourceSchema,
              seedRecords: siteSeedRecords,
            },
          ]),
        },
      },
    );

    try {
      const created = await privateHarness.fetch("/api/formless/app-installs", {
        body: JSON.stringify({
          packageAppKey: "private-site",
          installId: "private-site",
          label: "Private Site",
        }),
        headers: {
          Authorization: "Bearer test-admin-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const response = await privateHarness.fetch(
        "/api/app-installs/private-site/private-site/tree/home",
      );

      expect(created.status).toBe(201);
      expect(response.status).toBe(400);
      expect((await response.json()) as { error: string }).toEqual({
        error:
          'Package app "private-site" declares public Site runtime support, but no public Site Worker adapter is registered.',
      });
    } finally {
      await privateHarness.dispose();
    }
  });

  it("returns source seed changes when sync initializes fresh storage", async () => {
    const body = await getJson<SyncResponse>("/api/sync?after=0");

    expect(body.cursor).toBe(taskSeedRecords.length);
    expect(body.changes.map((change) => change.mutationId)).toEqual(
      taskSeedRecords.map((record) => `seed-task:${record.id}`),
    );
    expect(body.changes.map((change) => change.payload)).toEqual(taskSeedRecords);
  });

  it("rejects unknown schema keys and old unkeyed API paths", async () => {
    await expectNotFound("/api/missing/bootstrap");
    await expectNotFound("/api/rates/bootstrap");
    await expectNotFound("/api/bootstrap");
    await expectNotFound("/api/schema");
    await expectNotFound("/api/dev/reset");
  });

  it("isolates records and mutation replay by schema key", async () => {
    const task = await postCreateOperation("mutation-shared", { title: "First", done: false });

    useSchemaApp("crm");
    const contact = await postCreateOperationForEntity("mutation-shared", "contact", {
      label: "Designer",
    });
    const crmBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    useSchemaApp("tasks");
    const tasksBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(task.writeIdentity).toBe(operationWriteId("task", "create", "mutation-shared"));
    expect(contact.writeIdentity).toBe(operationWriteId("contact", "create", "mutation-shared"));
    expect(tasksBootstrap.schema).toEqual(appSchema);
    expect(tasksBootstrap.records).toEqual([...taskSeedRecords, task.record]);
    expect(crmBootstrap.schema).toEqual(crmSourceSchema);
    expect(crmBootstrap.records).toContainEqual(contact.record);
    expect(crmBootstrap.records.every((record) => record.entity !== "task")).toBe(true);
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
      ...appSchema,
      entities: {
        ...appSchema.entities,
        task: {
          ...appSchema.entities.task,
          label: "Planner task",
          fields: {
            ...appSchema.entities.task.fields,
            notes: { type: "text", required: false },
          },
        },
      },
    } as unknown as AppSchema;

    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(update.schema).toEqual(nextSchema);
    expect(update.updatedAt).toEqual(expect.any(String));
    expect(schemaResponse.schema).toEqual(nextSchema);
    expect(schemaResponse.updatedAt).toBe(update.updatedAt);
    expect(bootstrap.schema).toEqual(nextSchema);
    expect(bootstrap.schemaUpdatedAt).toBe(update.updatedAt);
    expect(update.schema.screens).toEqual(appSchema.screens);
  });

  it("accepts compatible schema updates that change query labels and expressions", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithQueries(defaultQueries()),
    });
    const created = await postCreateOperation("mutation-1", { title: "First", done: false });
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
    expect(bootstrap.records).toEqual([...taskSeedRecords, created.record]);
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

  it("rejects invalid collection operation references through the schema route", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithViews({
          ...defaultViews(),
          taskHome: {
            ...defaultCollectionView(),
            operations: [{ operation: "task.missing" }],
          },
        }),
      },
      'references unknown operation "task.missing"',
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

  it("resets only the schema to the source schema while preserving records and cursor", async () => {
    const created = await postCreateOperation("mutation-reset-schema-record", {
      title: "Keep me",
      done: false,
    });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskLabel("Planner task"),
    });
    const beforeReset = await getJson<BootstrapResponse>("/api/bootstrap");

    const reset = await postJson<BootstrapResponse>("/api/reset/schema", {});

    expect(beforeReset.schema.entities.task?.label).toBe("Planner task");
    expect(reset.schema).toEqual(appSchema);
    expect(reset.schema.screens).toEqual(appSchema.screens);
    expect(reset.records).toEqual([...taskSeedRecords, created.record]);
    expect(reset.cursor).toBe(beforeReset.cursor);
  });

  it("resets source schema after a source field removal and prunes stored values", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskNotesField(),
    });
    const created = await postCreateOperation("mutation-task-with-retired-field", {
      title: "Has retired field",
      notes: "Remove this when the source schema resets.",
    });

    const reset = await postJson<BootstrapResponse>("/api/reset/schema", {});
    const resetRecord = reset.records.find((record) => record.id === created.record.id);
    const sync = await getJson<SyncResponse>(`/api/sync?after=${created.cursor}`);

    expect(reset.schema).toEqual(appSchema);
    expect(reset.schema.entities.task.fields).not.toHaveProperty("notes");
    expect(resetRecord?.values).toEqual({
      title: "Has retired field",
      done: false,
      priority: "normal",
    });
    expect(reset.cursor).toBe(created.cursor + 1);
    expect(sync.changes).toEqual([
      expect.objectContaining({
        op: "patch",
        entity: "task",
        recordId: created.record.id,
        payload: expect.objectContaining({
          values: resetRecord?.values,
        }),
      }),
    ]);
  });

  it("removes retired estimate values when resetting source schema", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithEstimateNumber({ min: -10 }),
    });
    const created = await postCreateOperation("mutation-negative-estimate", {
      title: "Negative",
      estimate: -1,
    });

    const reset = await postJson<BootstrapResponse>("/api/reset/schema", {});
    const resetRecord = reset.records.find((record) => record.id === created.record.id);

    expect(reset.schema).toEqual(appSchema);
    expect(reset.schema.entities.task.fields).not.toHaveProperty("estimate");
    expect(resetRecord?.values).toEqual({
      title: "Negative",
      done: false,
      priority: "normal",
    });
  });

  it("resets seed data to source schema, records, and seeded changes", async () => {
    await postCreateOperation("mutation-before-seed-reset", { title: "Temporary", done: false });

    const reset = await postJson<BootstrapResponse>("/api/reset/seed", {});
    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(reset).toEqual({
      schema: appSchema,
      schemaProvenance: taskSchemaProvenance(),
      schemaUpdatedAt: expect.any(String),
      records: taskSeedRecords,
      cursor: taskSeedRecords.length,
    });
    expect(sync.cursor).toBe(taskSeedRecords.length);
    expect(sync.changes).toHaveLength(taskSeedRecords.length);
    expect(sync.changes.map((change) => change.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(sync.changes.map((change) => change.mutationId)).toEqual(
      taskSeedRecords.map((record) => `seed-task:${record.id}`),
    );
    expect(sync.changes.map((change) => change.op)).toEqual(taskSeedRecords.map(() => "create"));
    expect(sync.changes.map((change) => change.payload)).toEqual(taskSeedRecords);
  });

  it("resets seed data for one schema key without touching another", async () => {
    const task = await postCreateOperation("mutation-task-before-rate-reset", {
      title: "Route local",
      done: false,
    });

    useSchemaApp("crm");
    await postCreateOperationForEntity("mutation-crm-local-contact", "contact", {
      label: "Temporary contact",
    });
    const crmReset = await postJson<BootstrapResponse>("/api/reset/seed", {});

    useSchemaApp("tasks");
    const tasksBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(crmReset.records).toEqual(crmSeedRecords);
    expect(crmReset.cursor).toBe(crmSeedRecords.length);
    expect(tasksBootstrap.records).toEqual([...taskSeedRecords, task.record]);
  });

  it("exports authority storage snapshots by storage identity and schema key", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const created = await postCreateOperation("mutation-snapshot-export-task", {
      title: "Snapshot export",
      done: false,
    });

    const snapshot = await getJson<StorageSnapshot>("/api/snapshot");

    expect(snapshot).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "tasks",
      schemaKey: "tasks",
      exportedAt: expect.any(String),
      schemaUpdatedAt: schemaResponse.updatedAt,
      sourceCursor: created.cursor,
      schema: appSchema,
    });
    expect(snapshot.records).toEqual([...taskSeedRecords, created.record]);

    useSchemaApp("crm");
    const crmSnapshot = await getJson<StorageSnapshot>("/api/snapshot");

    expect(crmSnapshot.storageIdentity).toBe("crm");
    expect(crmSnapshot.schemaKey).toBe("crm");
    expect(crmSnapshot.schema).toEqual(crmSourceSchema);
    expect(crmSnapshot.records).toEqual(crmSeedRecords);
    expect(crmSnapshot.records.some((record) => record.id === created.record.id)).toBe(false);
  });

  it("keeps manual Site snapshots separate from source seed reset", async () => {
    useSchemaApp("site");
    const created = await postCreateOperationForEntity("mutation-site-manual-snapshot", "block", {
      type: "page",
      label: "Temporary preview page",
      href: "/temporary-preview-page",
    });

    const snapshot = await getJson<StorageSnapshot>("/api/snapshot");

    expect(snapshot.storageIdentity).toBe("site");
    expect(snapshot.schemaKey).toBe("site");
    expect(snapshot.schema).toEqual(siteSourceSchema);
    expectRecordsIgnoringOrder(snapshot.records, [...siteSeedRecords, created.record]);
    expect(siteSeedRecords.some((record) => record.id === created.record.id)).toBe(false);

    const reset = await postJson<BootstrapResponse>("/api/reset/seed", {});

    expectRecordsIgnoringOrder(reset.records, siteSeedRecords);
    expect(reset.cursor).toBe(siteSeedRecords.length);
    expect(reset.records.some((record) => record.id === created.record.id)).toBe(false);
  });

  it("restores snapshots and broadcasts committed restore writes", async () => {
    const before = await getJson<BootstrapResponse>("/api/bootstrap");
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const restoredRecord = taskSnapshotRecord("snapshot-task-restored", "Restored task");
    const taskSocket = await openSyncSocket("/api/sync/ws", "tasks");
    const crmSocket = await openSyncSocket("/api/sync/ws", "crm");
    let crmCapture: ReturnType<typeof captureSyncSocketMessages> | undefined;

    try {
      await primeSyncSocket(taskSocket, before.cursor, schemaResponse.updatedAt);

      useSchemaApp("crm");
      const crmSchema = await getJson<SchemaResponse>("/api/schema");
      await primeSyncSocket(crmSocket, crmSeedRecords.length, crmSchema.updatedAt);
      crmCapture = captureSyncSocketMessages(crmSocket);

      useSchemaApp("tasks");
      const message = readSyncSocketMessage(taskSocket);
      const restored = await postJson<BootstrapResponse>(
        "/api/snapshot/restore",
        storageSnapshot({
          schemaUpdatedAt: schemaResponse.updatedAt,
          sourceCursor: before.cursor,
          records: [...before.records, restoredRecord],
        }),
      );

      expect(restored.records).toEqual([...before.records, restoredRecord]);
      expect(restored.cursor).toBe(before.cursor + 1);
      expect(restored.schemaUpdatedAt).not.toBe(schemaResponse.updatedAt);
      await expect(message).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [
            expect.objectContaining({
              mutationId: `snapshot-restore:${restored.schemaUpdatedAt}`,
              op: "action",
              entity: "task",
              recordId: restoredRecord.id,
              payload: restoredRecord,
              createdAt: restored.schemaUpdatedAt,
            }),
          ],
          cursor: restored.cursor,
          schema: restored.schema,
          schemaProvenance: restored.schemaProvenance,
          schemaUpdatedAt: restored.schemaUpdatedAt,
        },
      });
      await expectNoCapturedMessages(crmCapture);
    } finally {
      crmCapture?.stop();
      taskSocket.close();
      crmSocket.close();
    }
  });

  it("rejects invalid restore snapshots without committing or broadcasting", async () => {
    const before = await getJson<BootstrapResponse>("/api/bootstrap");
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, before.cursor, schemaResponse.updatedAt);

      const capture = captureSyncSocketMessages(socket);
      await expectError(
        "/api/snapshot/restore",
        storageSnapshot({ storageIdentity: "app:work" }),
        'Storage snapshot storageIdentity must be "tasks".',
      );
      await expectError(
        "/api/snapshot/restore",
        storageSnapshot({ schemaKey: "crm" }),
        'Storage snapshot schemaKey must be "tasks".',
      );
      await expectNoCapturedMessages(capture);
      capture.stop();
    } finally {
      socket.close();
    }

    await expect(getJson<BootstrapResponse>("/api/bootstrap")).resolves.toEqual(before);
  });

  it("validates restore snapshot records before commit", async () => {
    await expectError(
      "/api/snapshot/restore",
      storageSnapshot({
        records: [
          {
            ...taskSnapshotRecord("snapshot-task-invalid-field", "Invalid field"),
            values: { title: "Invalid field", done: false, missing: "nope" },
          },
        ],
      }),
      'Storage snapshot record "snapshot-task-invalid-field" includes unknown field "task.missing".',
    );

    await expectError(
      "/api/snapshot/restore",
      storageSnapshot({
        schema: schemaWithTaskProjectReference({ required: true }),
        records: [
          {
            ...taskSnapshotRecord("snapshot-task-missing-project", "Missing project"),
            values: { title: "Missing project", done: false, project: "missing-project" },
          },
        ],
      }),
      'Storage snapshot record "snapshot-task-missing-project" has invalid field "task.project".',
    );

    await expectError(
      "/api/snapshot/restore",
      storageSnapshot({
        schema: schemaWithTaskConstraints({
          uniqueTitle: { kind: "unique", fields: ["title"] },
        }),
        records: [
          taskSnapshotRecord("snapshot-task-duplicate-title-a", "Duplicate"),
          taskSnapshotRecord("snapshot-task-duplicate-title-b", "Duplicate"),
        ],
      }),
      'Cannot add unique constraint "task.uniqueTitle" because existing records violate it.',
    );
  });

  it("rejects create and patch mutations that violate unique constraints", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithRateReferences({
        constraints: uniqueRatePairConstraints(),
      }),
    });

    const resource = await postCreateOperationForEntity("mutation-resource", "resource", {
      name: "Designer",
    });
    const card = await postCreateOperationForEntity("mutation-card-default", "card", {
      name: "Default",
    });
    const premiumCard = await postCreateOperationForEntity("mutation-card-premium", "card", {
      name: "Premium",
    });
    const defaultRate = await postCreateOperationForEntity("mutation-rate-default", "rate", {
      resource: resource.record.id,
      card: card.record.id,
      price: 125,
    });
    const premiumRate = await postCreateOperationForEntity("mutation-rate-premium", "rate", {
      resource: resource.record.id,
      card: premiumCard.record.id,
      price: 150,
    });
    const pricePatch = await postRecordOperationRequest({
      idempotencyKey: "mutation-rate-price",
      entity: "rate",
      operationName: "update",
      recordId: defaultRate.record.id,
      input: { price: 130 },
    });

    expect(pricePatch.record.values.price).toBe(130);

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-rate-duplicate",
        entity: "rate",
        operationName: "create",
        input: {
          resource: resource.record.id,
          card: card.record.id,
          price: 175,
        },
      },
      'Unique constraint "rate.uniqueRatePair" would be violated.',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-rate-move",
        entity: "rate",
        operationName: "update",
        recordId: premiumRate.record.id,
        input: { card: card.record.id },
      },
      'Unique constraint "rate.uniqueRatePair" would be violated.',
    );
  });

  it("ignores tombstoned records when checking unique constraints", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskConstraints({
        uniqueTitle: { kind: "unique", fields: ["title"] },
      }),
    });

    const completed = await postCreateOperation("mutation-completed", {
      title: "Reusable",
      done: true,
    });

    await postCommandOperation("action-clear", "clearCompletedTasks");
    const recreated = await postCreateOperation("mutation-recreated", {
      title: "Reusable",
      done: false,
    });

    expect(recreated.record.values.title).toBe(completed.record.values.title);
  });

  it("creates Site tree child blocks with placement edges and removes only the placement", async () => {
    useSchemaApp("site");
    const parent = await postCreateOperationForEntity("mutation-site-tree-test-parent", "block", {
      type: "page",
      label: "Tree test parent",
      href: "/tree-test-parent",
    });

    const input = {
      input: {
        parentRecordId: parent.record.id,
        childValues: {
          type: "image",
          label: "Primary image",
          href: "https://cdn.example.com/primary.webp",
        },
        placementValues: {
          slot: "primaryImage",
        },
      },
    };
    const added = await postCommandOperationForEntity(
      "action-site-tree-add-child",
      "block-placement",
      "addTreeChild",
      input,
    );
    const replay = await postCommandOperationForEntity(
      "action-site-tree-add-child",
      "block-placement",
      "addTreeChild",
      input,
    );
    const child = added.changes.find((change) => change.payload.entity === "block")?.payload;
    const placement = added.changes.find(
      (change) => change.payload.entity === "block-placement",
    )?.payload;

    if (!child || !placement) {
      throw new Error("Site tree child action did not create both records.");
    }

    expect(added.changes).toHaveLength(2);
    expect(added.changes.every((change) => change.op === "action")).toBe(true);
    expect(child.values).toEqual({
      type: "image",
      label: "Primary image",
      href: "https://cdn.example.com/primary.webp",
    });
    expect(placement.values).toEqual({
      parent: parent.record.id,
      block: child.id,
      order: 1000,
      slot: "primaryImage",
    });
    expect(replay).toEqual(added);

    const removed = await postCommandOperationForEntity(
      "action-site-tree-remove-placement",
      "block-placement",
      "removeTreePlacement",
      { input: { placementId: placement.id } },
    );
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const storedChild = bootstrap.records.find((record) => record.id === child.id);
    const storedPlacement = bootstrap.records.find((record) => record.id === placement.id);

    expect(removed.changes).toHaveLength(1);
    expect(removed.changes[0]?.payload).toMatchObject({
      id: placement.id,
      entity: "block-placement",
      deletedAt: expect.any(String),
    });
    expect(storedChild).toMatchObject({
      id: child.id,
      entity: "block",
      values: child.values,
    });
    expect(storedChild).not.toHaveProperty("deletedAt");
    expect(storedPlacement).toMatchObject({
      id: placement.id,
      entity: "block-placement",
      deletedAt: expect.any(String),
    });
  });

  it("uses declared create operations when writing", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithViews(),
    });

    const created = await postRecordOperationRequest({
      idempotencyKey: "mutation-1",
      entity: "task",
      operationName: "create",
      input: { title: "First" },
    });

    expect(created.record.values.title).toBe("First");
  });

  it("rejects caller-provided system fields in generic mutation values", async () => {
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-system-created",
        entity: "task",
        operationName: "create",
        input: { title: "System field", updatedAt: "2026-05-28T00:00:00.000Z" },
      },
      'Operation input must not include system field "updatedAt".',
    );

    const created = await postCreateOperation("mutation-system-patch-source", {
      title: "Patch source",
      done: false,
    });

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-system-patch",
        entity: "task",
        operationName: "update",
        recordId: created.record.id,
        input: { updatedAt: "2026-05-28T00:00:01.000Z" },
      },
      'Operation input must not include system field "updatedAt".',
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
    await postCreateOperation("mutation-1", { title: "First", done: false });

    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Task",
          fields: {
            done: { type: "boolean", required: true, default: false },
          },
          operations: taskOperations("Task", {
            done: { type: "boolean", required: true, default: false },
          }),
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
      screens: defaultScreens(),
    } as unknown as AppSchema;

    await expectError(
      "/api/schema",
      { schema: nextSchema },
      'Cannot remove or rename field "task.title"',
    );
  });

  it("returns changes after a known sync cursor", async () => {
    await postCreateOperation("mutation-1", { title: "First", done: false });
    const second = await postCreateOperation("mutation-2", { title: "Second", done: true });

    const body = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length + 1}`);

    expect(body.cursor).toBe(taskSeedRecords.length + 2);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      mutationId: second.writeIdentity,
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

  it("accepts keyed hibernatable sync WebSocket upgrades", async () => {
    const tasksSocket = await openSyncSocket("/api/sync/ws", "tasks");
    const ratesSocket = await openSyncSocket("/api/sync/ws", "crm");

    tasksSocket.close();
    ratesSocket.close();
  });

  it("rejects missing schema keys, non-upgrade requests, and non-GET sync WebSocket requests", async () => {
    await expectNotFound("/api/missing/sync/ws");

    const missingUpgrade = await harness.fetch(apiPath("/api/sync/ws"));
    const wrongMethod = await harness.fetch(apiPath("/api/sync/ws"), {
      method: "POST",
    });

    expect(missingUpgrade.status).toBe(426);
    expect(wrongMethod.status).toBe(405);
  });

  it("sends the same stale cursor changes over the sync WebSocket as HTTP sync", async () => {
    await postCreateOperation("mutation-1", { title: "First", done: false });
    await postCreateOperation("mutation-2", { title: "Second", done: true });
    const cursor = taskSeedRecords.length + 1;
    const httpSync = await getJson<SyncResponse>(`/api/sync?after=${cursor}`);
    const socket = await openSyncSocket();

    socket.send(
      JSON.stringify({
        type: "hello",
        cursor,
        schemaUpdatedAt: null,
      }),
    );
    const message = await readSyncSocketMessage(socket);

    expect(message).toEqual({
      type: "sync",
      payload: httpSync,
    });

    socket.close();
  });

  it("returns delete catch-up rows over HTTP and WebSocket while omitting current schema", async () => {
    const schemaUpdate = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskDeleteOperation(),
    });
    const created = await postCreateOperation("mutation-sync-delete-catchup-source", {
      title: "Delete catch-up source",
      done: false,
    });
    const deleted = await postRecordOperationRequest({
      idempotencyKey: "mutation-sync-delete-catchup",
      entity: "task",
      operationName: "delete",
      recordId: created.record.id,
    });
    const httpSync = await getJson<SyncResponse>(
      `/api/sync?after=${created.cursor}&schemaUpdatedAt=${encodeURIComponent(
        schemaUpdate.updatedAt,
      )}`,
    );
    const socket = await openSyncSocket();

    try {
      expect(httpSync).toEqual({
        changes: deleted.changes,
        cursor: deleted.cursor,
      });
      expect(httpSync.changes).toEqual([
        {
          seq: deleted.cursor,
          mutationId: deleted.writeIdentity,
          op: "delete",
          entity: "task",
          recordId: created.record.id,
          payload: {
            ...created.record,
            deletedAt: expect.any(String),
            updatedAt: deleted.record.deletedAt,
          },
          createdAt: expect.any(String),
        },
      ]);

      socket.send(
        JSON.stringify({
          type: "hello",
          cursor: created.cursor,
          schemaUpdatedAt: schemaUpdate.updatedAt,
        }),
      );

      await expect(readSyncSocketMessage(socket)).resolves.toEqual({
        type: "sync",
        payload: httpSync,
      });
    } finally {
      socket.close();
    }
  });

  it("omits schema from sync WebSocket messages when the client schema timestamp is current", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    socket.send(
      JSON.stringify({
        type: "hello",
        cursor: 0,
        schemaUpdatedAt: schemaResponse.updatedAt,
      }),
    );
    const message = await readSyncSocketMessage(socket);

    expect(message.type).toBe("sync");
    if (message.type === "sync") {
      expect(message.payload.schema).toBeUndefined();
      expect(message.payload.schemaUpdatedAt).toBeUndefined();
      expect(message.payload.changes.map((change) => change.payload)).toEqual(taskSeedRecords);
    }

    socket.close();
  });

  it("sends an error and closes malformed sync WebSocket clients", async () => {
    const socket = await openSyncSocket();

    socket.send("not-json");
    const message = await readSyncSocketMessage(socket);

    expect(message).toEqual({
      type: "error",
      message: "Malformed sync socket message.",
    });
  });

  it("does not broadcast read-only HTTP operations to sync WebSocket clients", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const taskSocket = await openSyncSocket("/api/sync/ws", "tasks");

    try {
      await primeSyncSocket(taskSocket, taskSeedRecords.length, schemaResponse.updatedAt);

      const capture = captureSyncSocketMessages(taskSocket);
      try {
        await getJson<BootstrapResponse>("/api/bootstrap");
        await getJson<SchemaResponse>("/api/schema");
        await getJson<StorageSnapshot>("/api/snapshot");
        await getJson<SyncResponse>(
          `/api/sync?after=${taskSeedRecords.length}&schemaUpdatedAt=${encodeURIComponent(
            schemaResponse.updatedAt,
          )}`,
        );

        await expectNoCapturedMessages(capture);
      } finally {
        capture.stop();
      }
    } finally {
      taskSocket.close();
    }

    useSchemaApp("site");
    const siteBootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const siteSocket = await openSyncSocket("/api/sync/ws", "site");

    try {
      await primeSyncSocket(siteSocket, siteBootstrap.cursor, siteBootstrap.schemaUpdatedAt);

      const capture = captureSyncSocketMessages(siteSocket);
      try {
        await getJson<SitePageTreeResponse>("/api/tree/home");

        await expectNoCapturedMessages(capture);
      } finally {
        capture.stop();
      }
    } finally {
      siteSocket.close();
    }
  });

  it("keeps write responses protocol-shaped and no-store while outcome kind drives broadcasts", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, taskSeedRecords.length, schemaResponse.updatedAt);

      const mutation = {
        idempotencyKey: "mutation-authority-outcome-policy",
        entity: "task",
        operationName: "create",
        input: {
          title: "Authority outcome policy",
          done: false,
        },
      };
      const committedMessage = readSyncSocketMessage(socket);
      const committedRequest = recordOperationRequest(mutation);
      const committedResponse = await harness.fetch(apiPath(committedRequest.path), {
        body: JSON.stringify(committedRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const committed = committedRequest.response(await committedResponse.json());

      expect(committedResponse.status).toBe(200);
      expect(committedResponse.headers.get("Cache-Control")).toBe("no-store");
      expect(committed).not.toHaveProperty("kind");
      expect(committed).not.toHaveProperty("response");
      await expect(committedMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: committed.changes,
          cursor: committed.cursor,
        },
      });

      const replayCapture = captureSyncSocketMessages(socket);
      const replayRequest = recordOperationRequest(mutation);
      const replayResponse = await harness.fetch(apiPath(replayRequest.path), {
        body: JSON.stringify(replayRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(replayResponse.status).toBe(200);
      expect(replayResponse.headers.get("Cache-Control")).toBe("no-store");
      expect(replayRequest.response(await replayResponse.json())).toEqual(committed);
      await expectNoCapturedMessages(replayCapture);
      replayCapture.stop();

      const invalidCapture = captureSyncSocketMessages(socket);
      const invalidRequest = recordOperationRequest({
        idempotencyKey: "mutation-authority-invalid-no-broadcast",
        entity: "missing",
        operationName: "create",
        input: {},
      });
      const invalidResponse = await harness.fetch(apiPath(invalidRequest.path), {
        body: JSON.stringify(invalidRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(invalidResponse.status).toBe(400);
      expect(invalidResponse.headers.get("Cache-Control")).toBe("no-store");
      expect((await invalidResponse.json()) as { error: string }).toEqual({
        error: 'Unknown entity "missing".',
      });
      await expectNoCapturedMessages(invalidCapture);
      invalidCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("broadcasts committed task creates to same-schema sync WebSockets only", async () => {
    const taskSocketA = await openSyncSocket("/api/sync/ws", "tasks");
    const taskSocketB = await openSyncSocket("/api/sync/ws", "tasks");
    const crmSocket = await openSyncSocket("/api/sync/ws", "crm");
    let crmCapture: ReturnType<typeof captureSyncSocketMessages> | undefined;

    try {
      const taskSchema = await getJson<SchemaResponse>("/api/schema");
      await primeSyncSocket(taskSocketA, taskSeedRecords.length, taskSchema.updatedAt);
      await primeSyncSocket(taskSocketB, taskSeedRecords.length, taskSchema.updatedAt);

      useSchemaApp("crm");
      const crmSchema = await getJson<SchemaResponse>("/api/schema");
      await primeSyncSocket(crmSocket, crmSeedRecords.length, crmSchema.updatedAt);
      crmCapture = captureSyncSocketMessages(crmSocket);

      useSchemaApp("tasks");
      const messageA = readSyncSocketMessage(taskSocketA);
      const messageB = readSyncSocketMessage(taskSocketB);
      const created = await postCreateOperation("mutation-broadcast-create", {
        title: "Broadcast create",
        done: false,
      });

      await expect(messageA).resolves.toEqual({
        type: "sync",
        payload: {
          changes: created.changes,
          cursor: created.cursor,
        },
      });
      await expect(messageB).resolves.toEqual({
        type: "sync",
        payload: {
          changes: created.changes,
          cursor: created.cursor,
        },
      });
      await expectNoCapturedMessages(crmCapture);
    } finally {
      crmCapture?.stop();
      taskSocketA.close();
      taskSocketB.close();
      crmSocket.close();
    }
  });

  it("broadcasts committed patch mutations, delete mutations, and actions", async () => {
    const created = await postCreateOperation("mutation-broadcast-patch-source", {
      title: "Broadcast patch",
      done: false,
    });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskAndProjectDeleteEnabled(),
    });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, created.cursor, schemaResponse.updatedAt);

      const patchMessage = readSyncSocketMessage(socket);
      const patched = await postRecordOperationRequest({
        idempotencyKey: "mutation-broadcast-patch",
        entity: "task",
        operationName: "update",
        recordId: created.record.id,
        input: { done: true },
      });

      await expect(patchMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: patched.changes,
          cursor: patched.cursor,
        },
      });

      const deleteMessage = readSyncSocketMessage(socket);
      const deleted = await postRecordOperationRequest({
        idempotencyKey: "mutation-broadcast-delete",
        entity: "task",
        operationName: "delete",
        recordId: created.record.id,
      });

      await expect(deleteMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: deleted.changes,
          cursor: deleted.cursor,
        },
      });

      const actionMessage = readSyncSocketMessage(socket);
      const action = await postCommandOperation("action-broadcast-clear", "clearCompletedTasks");

      await expect(actionMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: action.changes,
          cursor: action.cursor,
        },
      });

      const noOpActionMessage = readSyncSocketMessage(socket);
      const noOpAction = await postCommandOperation(
        "action-broadcast-no-op-clear",
        "clearCompletedTasks",
      );

      await expect(noOpActionMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: noOpAction.changes,
          cursor: noOpAction.cursor,
        },
      });
    } finally {
      socket.close();
    }
  });

  it("broadcasts schema-only sync messages after schema writes", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, taskSeedRecords.length, schemaResponse.updatedAt);

      const schemaMessage = readSyncSocketMessage(socket);
      const update = await postJson<SchemaUpdateResponse>("/api/schema", {
        schema: schemaWithTaskLabel("Planner task"),
      });

      await expect(schemaMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [],
          cursor: taskSeedRecords.length,
          schema: update.schema,
          schemaUpdatedAt: update.updatedAt,
        },
      });
    } finally {
      socket.close();
    }
  });

  it("broadcasts reset schema and reset seed after committed reset writes", async () => {
    const schemaUpdate = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskLabel("Planner task"),
    });
    const schemaSocket = await openSyncSocket();

    try {
      await primeSyncSocket(schemaSocket, taskSeedRecords.length, schemaUpdate.updatedAt);

      const schemaMessage = readSyncSocketMessage(schemaSocket);
      const schemaReset = await postJson<BootstrapResponse>("/api/reset/schema", {});

      await expect(schemaMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [],
          cursor: schemaReset.cursor,
          schema: schemaReset.schema,
          schemaProvenance: schemaReset.schemaProvenance,
          schemaUpdatedAt: schemaReset.schemaUpdatedAt,
        },
      });
    } finally {
      schemaSocket.close();
    }

    const created = await postCreateOperation("mutation-before-broadcast-seed-reset", {
      title: "Temporary",
      done: false,
    });
    const seedSchema = await getJson<SchemaResponse>("/api/schema");
    const seedSocket = await openSyncSocket();

    try {
      await primeSyncSocket(seedSocket, created.cursor, seedSchema.updatedAt);

      const seedMessage = readSyncSocketMessage(seedSocket);
      const seedReset = await postJson<BootstrapResponse>("/api/reset/seed", {});

      await expect(seedMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: [],
          cursor: seedReset.cursor,
          schema: seedReset.schema,
          schemaProvenance: seedReset.schemaProvenance,
          schemaUpdatedAt: seedReset.schemaUpdatedAt,
        },
      });
    } finally {
      seedSocket.close();
    }
  });

  it("does not broadcast failed mutation validation, constraint failures, or mutation replay", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskConstraints({
        uniqueTitle: { kind: "unique", fields: ["title"] },
      }),
    });
    const existing = await postCreateOperation("mutation-constraint-source", {
      title: "Constraint source",
      done: false,
    });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, existing.cursor, schemaResponse.updatedAt);

      const invalidCapture = captureSyncSocketMessages(socket);
      const invalidRequest = recordOperationRequest({
        idempotencyKey: "mutation-invalid-no-broadcast",
        entity: "task",
        operationName: "create",
        input: { title: "   " },
      });
      const invalid = await harness.fetch(apiPath(invalidRequest.path), {
        body: JSON.stringify(invalidRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(invalid.status).toBe(400);
      await expectNoCapturedMessages(invalidCapture);
      invalidCapture.stop();

      const constraintCapture = captureSyncSocketMessages(socket);
      const constraintRequest = recordOperationRequest({
        idempotencyKey: "mutation-constraint-no-broadcast",
        entity: "task",
        operationName: "create",
        input: { title: "Constraint source", done: false },
      });
      const constraintFailure = await harness.fetch(apiPath(constraintRequest.path), {
        body: JSON.stringify(constraintRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(constraintFailure.status).toBe(400);
      expect((await constraintFailure.json()) as { error: string }).toEqual({
        error: 'Unique constraint "task.uniqueTitle" would be violated.',
      });
      await expectNoCapturedMessages(constraintCapture);
      constraintCapture.stop();

      const createMessage = readSyncSocketMessage(socket);
      const mutation = {
        idempotencyKey: "mutation-replay-no-broadcast",
        entity: "task",
        operationName: "create",
        input: { title: "Replay check", done: false },
      };
      const created = await postRecordOperationRequest(mutation);

      await expect(createMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: created.changes,
          cursor: created.cursor,
        },
      });

      const replayCapture = captureSyncSocketMessages(socket);
      const replay = await postRecordOperationRequest(mutation);
      const sync = await getJson<SyncResponse>(`/api/sync?after=${existing.cursor}`);

      expect(replay).toEqual(created);
      expect(
        sync.changes.filter((change) => change.mutationId === created.writeIdentity),
      ).toHaveLength(1);
      await expectNoCapturedMessages(replayCapture);
      replayCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("does not broadcast action replay", async () => {
    const completed = await postCreateOperation("mutation-action-replay-source", {
      title: "Action replay source",
      done: true,
    });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, completed.cursor, schemaResponse.updatedAt);

      const actionMessage = readSyncSocketMessage(socket);
      const action = await postCommandOperation(
        "action-replay-no-broadcast",
        "clearCompletedTasks",
      );

      await expect(actionMessage).resolves.toEqual({
        type: "sync",
        payload: {
          changes: action.changes,
          cursor: action.cursor,
        },
      });

      const replayCapture = captureSyncSocketMessages(socket);
      const replay = await postCommandOperation(
        "action-replay-no-broadcast",
        "clearCompletedTasks",
      );
      const sync = await getJson<SyncResponse>(`/api/sync?after=${completed.cursor}`);

      expect(replay).toEqual(action);
      expect(sync.changes.filter((change) => change.mutationId === action.writeIdentity)).toEqual(
        action.changes,
      );
      await expectNoCapturedMessages(replayCapture);
      replayCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("does not broadcast failed schema or action validation", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const socket = await openSyncSocket();

    try {
      await primeSyncSocket(socket, taskSeedRecords.length, schemaResponse.updatedAt);

      const schemaCapture = captureSyncSocketMessages(socket);
      const invalidSchema = await harness.fetch(apiPath("/api/schema"), {
        body: JSON.stringify({
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
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(invalidSchema.status).toBe(400);
      await expectNoCapturedMessages(schemaCapture);
      schemaCapture.stop();

      const actionCapture = captureSyncSocketMessages(socket);
      const invalidActionRequest = commandOperationRequest({
        idempotencyKey: "action-invalid-no-broadcast",
        entity: "task",
        operationName: "missing",
      });
      const invalidAction = await harness.fetch(apiPath(invalidActionRequest.path), {
        body: JSON.stringify(invalidActionRequest.body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(invalidAction.status).toBe(400);
      await expectNoCapturedMessages(actionCapture);
      actionCapture.stop();
    } finally {
      socket.close();
    }
  });

  it("rejects invalid sync cursors", async () => {
    await expectError("/api/sync?after=bad", undefined, "Sync cursor must be");
  });

  it("rejects unknown entity names", async () => {
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-1",
        entity: "missing",
        operationName: "create",
        input: { title: "First" },
      },
      'Unknown entity "missing".',
    );
  });

  it("rejects empty required text", async () => {
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-1",
        entity: "task",
        operationName: "create",
        input: { title: "   ", done: false },
      },
      'Field "title" cannot be empty.',
    );
  });

  it("accepts task values and applies the boolean default", async () => {
    const response = await postCreateOperation("mutation-1", {
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
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-1",
        entity: "task",
        operationName: "create",
        input: { title: "First", done: "false" },
      },
      'Field "done" must be a boolean.',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-2",
        entity: "task",
        operationName: "create",
        input: { title: "First", done: false, dueDate: "05/01/2026" },
      },
      'Field "dueDate" must be a YYYY-MM-DD date.',
    );
  });

  it("accepts enum values, applies enum defaults, and rejects unknown options", async () => {
    const withDefault = await postCreateOperation("mutation-1", { title: "First" });
    const explicit = await postCreateOperation("mutation-2", { title: "Second", priority: "high" });

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

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-3",
        entity: "task",
        operationName: "create",
        input: { title: "Third", priority: "missing" },
      },
      'Field "priority" must be a known enum value.',
    );
  });

  it("accepts finite number values and rejects invalid numeric input", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithEstimateNumber(),
    });

    const zero = await postCreateOperation("mutation-1", { title: "Zero", estimate: 0 });
    const estimated = await postCreateOperation("mutation-2", { title: "Estimated", estimate: 3 });

    expect(zero.record.values.estimate).toBe(0);
    expect(estimated.record.values.estimate).toBe(3);

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-3",
        entity: "task",
        operationName: "create",
        input: { title: "String estimate", estimate: "3" },
      },
      'Field "estimate" must be a finite number.',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-4",
        entity: "task",
        operationName: "create",
        input: { title: "Decimal estimate", estimate: 1.5 },
      },
      'Field "estimate" must be an integer.',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-5",
        entity: "task",
        operationName: "create",
        input: { title: "Negative estimate", estimate: -1 },
      },
      'Field "estimate" must be greater than or equal to 0.',
    );
  });

  it("clears optional number fields when patched to an empty value", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithEstimateNumber(),
    });

    const created = await postCreateOperation("mutation-1", { title: "First", estimate: 4 });
    const cleared = await postRecordOperationRequest({
      idempotencyKey: "mutation-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { estimate: "" },
    });
    const zero = await postRecordOperationRequest({
      idempotencyKey: "mutation-3",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { estimate: 0 },
    });

    expect(cleared.record.values.estimate).toBeUndefined();
    expect(zero.record.values.estimate).toBe(0);
  });

  it("checks number constraints when applying schema updates", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithEstimateNumber(),
    });

    const created = await postCreateOperation("mutation-1", { title: "Estimated", estimate: 3 });

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
    expect(bootstrap.records).toEqual([...taskSeedRecords, created.record]);
  });

  it("clears optional enum fields when patched to an empty value", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithPriorityEnum({ required: false }),
    });

    const created = await postCreateOperation("mutation-1", { title: "First", priority: "high" });
    const patched = await postRecordOperationRequest({
      idempotencyKey: "mutation-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { priority: "" },
    });

    expect(patched.record.values.priority).toBeUndefined();
  });

  it("validates reference create and patch values against active target records", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", { schema: schemaWithRateReferences() });

    const resource = await postCreateOperationForEntity("mutation-resource", "resource", {
      name: "Designer",
    });
    const card = await postCreateOperationForEntity("mutation-card", "card", { name: "Default" });
    const rate = await postCreateOperationForEntity("mutation-rate", "rate", {
      resource: resource.record.id,
      card: card.record.id,
      backupResource: resource.record.id,
      price: 125,
    });
    const cleared = await postRecordOperationRequest({
      idempotencyKey: "mutation-clear-reference",
      entity: "rate",
      operationName: "update",
      recordId: rate.record.id,
      input: { backupResource: "" },
    });

    expect(rate.record.values).toMatchObject({
      resource: resource.record.id,
      card: card.record.id,
      backupResource: resource.record.id,
      price: 125,
    });
    expect(cleared.record.values.backupResource).toBeUndefined();

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-missing-reference",
        entity: "rate",
        operationName: "create",
        input: { resource: "missing", card: card.record.id },
      },
      'Field "resource" references unknown resource record "missing".',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-wrong-entity-reference",
        entity: "rate",
        operationName: "create",
        input: { resource: card.record.id, card: card.record.id },
      },
      'Field "resource" must reference a resource record.',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-empty-reference",
        entity: "rate",
        operationName: "create",
        input: { resource: "", card: card.record.id },
      },
      'Field "resource" is required.',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-non-string-reference",
        entity: "rate",
        operationName: "create",
        input: { resource: 1, card: card.record.id },
      },
      'Field "resource" must be a reference ID.',
    );
  });

  it("rejects tombstoned reference targets", async () => {
    const completed = await postCreateOperation("mutation-task", { title: "Done", done: true });

    await postCommandOperation("action-clear", "clearCompletedTasks");
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithAssignmentReference(),
    });

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-assignment",
        entity: "assignment",
        operationName: "create",
        input: { task: completed.record.id },
      },
      `Field "task" cannot reference tombstoned record "${completed.record.id}".`,
    );
  });

  it("checks reference schema compatibility against existing records", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskProjectReference({ required: false }),
    });
    const project = await postCreateOperationForEntity("mutation-project", "project", {
      name: "Buildout",
      code: "BLD",
    });
    await postCreateOperation("mutation-task", { title: "Scoped", project: project.record.id });

    const displayChange = await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskProjectReference({ required: false, displayField: "code" }),
    });

    expect(displayChange.schema.entities.task?.fields.project).toMatchObject({
      type: "reference",
      displayField: "code",
    });

    await expectError(
      "/api/schema",
      {
        schema: schemaWithTaskProjectReference({
          required: false,
          to: "milestone",
          includeMilestone: true,
        }),
      },
      'Cannot change reference target for "task.project".',
    );
  });

  it("rejects required reference additions when existing records are missing targets", async () => {
    await postCreateOperation("mutation-task", { title: "Unscoped" });

    await expectError(
      "/api/schema",
      {
        schema: schemaWithTaskProjectReference({ required: true }),
      },
      'Cannot require field "task.project"',
    );
  });

  it("rejects schema updates that add violated unique constraints", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithRateReferences(),
    });

    const resource = await postCreateOperationForEntity("mutation-resource", "resource", {
      name: "Designer",
    });
    const card = await postCreateOperationForEntity("mutation-card", "card", {
      name: "Default",
    });

    await postCreateOperationForEntity("mutation-rate-1", "rate", {
      resource: resource.record.id,
      card: card.record.id,
      price: 125,
    });
    await postCreateOperationForEntity("mutation-rate-2", "rate", {
      resource: resource.record.id,
      card: card.record.id,
      price: 150,
    });

    await expectError(
      "/api/schema",
      {
        schema: schemaWithRateReferences({
          constraints: uniqueRatePairConstraints(),
        }),
      },
      'Cannot add unique constraint "rate.uniqueRatePair" because existing records violate it.',
    );
  });

  it("accepts enum option catalog changes without scanning existing records", async () => {
    const created = await postCreateOperation("mutation-1", { title: "First", priority: "high" });

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
    expect(bootstrap.records).toEqual([...taskSeedRecords, created.record]);
  });

  it("patches an existing record and returns patch changes from sync", async () => {
    const created = await postCreateOperation("mutation-1", { title: "First", done: false });
    const patched = await postRecordOperationRequest({
      idempotencyKey: "mutation-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { done: true, dueDate: "2026-05-01" },
    });
    const sync = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length + 1}`);

    expect(patched.record.values).toEqual({
      title: "First",
      done: true,
      dueDate: "2026-05-01",
      priority: "normal",
    });
    expect(sync.changes).toHaveLength(1);
    expect(sync.changes[0]).toMatchObject({
      mutationId: patched.writeIdentity,
      op: "patch",
      recordId: created.record.id,
      payload: patched.record,
    });
  });

  it("rejects generic delete mutation requests when policy is disabled", async () => {
    const created = await postCreateOperation("mutation-1", { title: "First", done: false });

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-delete-disabled",
        entity: "task",
        operationName: "delete",
        recordId: created.record.id,
      },
      'Unknown operation "delete" for entity "task".',
    );

    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length + 1}`);

    expect(bootstrap.records).toContainEqual(created.record);
    expect(bootstrap.records.find((record) => record.id === created.record.id)).not.toHaveProperty(
      "deletedAt",
    );
    expect(sync.changes).toEqual([]);
  });

  it("commits enabled generic delete mutations as tombstone changes", async () => {
    const created = await postCreateOperation("mutation-1", { title: "First", done: false });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskDeleteOperation(),
    });

    const deleted = await postRecordOperationRequest({
      idempotencyKey: "mutation-delete-ready",
      entity: "task",
      operationName: "delete",
      recordId: created.record.id,
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>(`/api/sync?after=${created.cursor}`);

    expect(deleted).toMatchObject({
      record: {
        ...created.record,
        deletedAt: expect.any(String),
        updatedAt: deleted.record.deletedAt,
      },
      changes: [
        {
          mutationId: deleted.writeIdentity,
          op: "delete",
          entity: "task",
          recordId: created.record.id,
          payload: {
            ...created.record,
            deletedAt: expect.any(String),
            updatedAt: deleted.record.deletedAt,
          },
          createdAt: expect.any(String),
        },
      ],
      cursor: created.cursor + 1,
      writeIdentity: deleted.writeIdentity,
    });
    expect(bootstrap.records.find((record) => record.id === created.record.id)).toEqual(
      deleted.record,
    );
    expect(sync.changes).toEqual(deleted.changes);
  });

  it("blocks generic delete while active records reference the target", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskProjectReferenceDeleteEnabled(),
    });
    const project = await postCreateOperationForEntity("mutation-referenced-project", "project", {
      name: "Buildout",
      code: "BLD",
    });
    const task = await postCreateOperation("mutation-referencing-task", {
      title: "Scoped",
      project: project.record.id,
    });

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-delete-referenced-project",
        entity: "project",
        operationName: "delete",
        recordId: project.record.id,
      },
      `Cannot delete record "${project.record.id}" because active task record "${task.record.id}" references it through field "task.project".`,
    );

    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>(`/api/sync?after=${task.cursor}`);

    expect(bootstrap.records.find((record) => record.id === project.record.id)).not.toHaveProperty(
      "deletedAt",
    );
    expect(sync.changes).toEqual([]);
  });

  it("allows generic delete when only tombstoned records reference the target", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskProjectReferenceDeleteEnabled(),
    });
    const project = await postCreateOperationForEntity(
      "mutation-tombstone-reference-project",
      "project",
      {
        name: "Archive",
        code: "ARC",
      },
    );
    const task = await postCreateOperation("mutation-tombstoned-referencing-task", {
      title: "Done",
      done: true,
      project: project.record.id,
    });
    await postCommandOperation("action-tombstone-referencing-task", "clearCompletedTasks");

    const deleted = await postRecordOperationRequest({
      idempotencyKey: "mutation-delete-tombstone-referenced-project",
      entity: "project",
      operationName: "delete",
      recordId: project.record.id,
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(bootstrap.records.find((record) => record.id === task.record.id)).toHaveProperty(
      "deletedAt",
    );
    expect(deleted.record).toEqual({
      ...project.record,
      deletedAt: expect.any(String),
      updatedAt: deleted.record.deletedAt,
    });
    expect(bootstrap.records.find((record) => record.id === project.record.id)).toEqual(
      deleted.record,
    );
  });

  it("rejects invalid generic delete mutations after policy enables delete", async () => {
    const active = await postCreateOperation("mutation-active", { title: "First", done: false });
    const completed = await postCreateOperation("mutation-completed", {
      title: "Done",
      done: true,
    });
    await postCommandOperation("action-tombstone-completed", "clearCompletedTasks");
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskDeleteOperation(),
    });

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-delete-values",
        entity: "task",
        operationName: "delete",
        recordId: active.record.id,
        input: { title: "Ignored" },
      },
      'Operation "delete" request must not include input fields.',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-delete-missing",
        entity: "task",
        operationName: "delete",
        recordId: "missing",
      },
      'Unknown record "missing".',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-delete-tombstoned",
        entity: "task",
        operationName: "delete",
        recordId: completed.record.id,
      },
      `Cannot delete tombstoned record "${completed.record.id}".`,
    );

    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskAndProjectDeleteEnabled(),
    });
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-delete-wrong-entity",
        entity: "project",
        operationName: "delete",
        recordId: active.record.id,
      },
      "Delete entity must match the stored record entity.",
    );
  });

  it("replays delete mutation IDs without duplicating changes", async () => {
    const created = await postCreateOperation("mutation-delete-replay-source", {
      title: "First",
      done: false,
    });
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskDeleteOperation(),
    });

    const first = await postRecordOperationRequest({
      idempotencyKey: "mutation-replay-delete",
      entity: "task",
      operationName: "delete",
      recordId: created.record.id,
    });
    const replay = await postRecordOperationRequest({
      idempotencyKey: "mutation-replay-delete",
      entity: "task",
      operationName: "delete",
      recordId: "missing",
    });

    const sync = await getJson<SyncResponse>(`/api/sync?after=${created.cursor}`);

    expect(replay).toEqual(first);
    expect(sync.changes).toEqual(first.changes);
  });

  it("rejects invalid patch mutations", async () => {
    const created = await postCreateOperation("mutation-1", { title: "First", done: false });
    const schemaWithProject = {
      version: 1,
      entities: {
        task: appSchema.entities.task,
        project: {
          label: "Project",
          fields: {
            name: { type: "text", required: true },
          },
          operations: taskOperations("Project", {
            name: { type: "text", required: true },
          }),
        },
      },
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: {},
      views: defaultViews(),
      screens: defaultScreens(),
    } as unknown as AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: schemaWithProject });

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-2",
        entity: "task",
        operationName: "update",
        recordId: "missing",
        input: { title: "Second" },
      },
      'Unknown record "missing".',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-3",
        entity: "task",
        operationName: "update",
        recordId: created.record.id,
        input: { missing: "Second" },
      },
      'Operation input includes undeclared field "missing".',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-4",
        entity: "project",
        operationName: "update",
        recordId: created.record.id,
        input: { name: "Second" },
      },
      "Patch entity must match the stored record entity.",
    );
  });

  it("replays patch mutation IDs without duplicating changes", async () => {
    const created = await postCreateOperation("mutation-1", { title: "First", done: false });
    const body = {
      idempotencyKey: "mutation-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { title: "Second" },
    };

    const first = await postRecordOperationRequest(body);
    const replay = await postRecordOperationRequest(body);
    const sync = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length}`);

    expect(replay).toEqual(first);
    expect(sync.changes).toHaveLength(2);
  });

  it("rejects undeclared or unknown actions", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", { schema: schemaWithViews() });

    await expectCommandOperationError(
      {
        idempotencyKey: "action-1",
        entity: "task",
        operationName: "clearCompletedTasks",
      },
      'Unknown operation "clearCompletedTasks" for entity "task".',
    );

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: appSchema });
    await expectCommandOperationError(
      {
        idempotencyKey: "action-2",
        entity: "task",
        operationName: "missing",
      },
      'Unknown operation "missing" for entity "task".',
    );
  });

  it("tombstones completed records through clearCompletedTasks", async () => {
    const seedCompleted = getSeedCompletedTask();
    const completed = await postCreateOperation("mutation-1", { title: "Done", done: true });
    const active = await postCreateOperation("mutation-2", { title: "Open", done: false });

    const action = await postCommandOperation("action-1", "clearCompletedTasks");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>(`/api/sync?after=${taskSeedRecords.length + 2}`);

    expect(action.writeIdentity).toBe(operationWriteId("task", "clearCompletedTasks", "action-1"));
    expect(action.cursor).toBe(taskSeedRecords.length + 4);
    expect(action.changes).toHaveLength(2);
    expect(action.changes.map((change) => change.recordId).sort()).toEqual(
      [seedCompleted.id, completed.record.id].sort(),
    );
    expect(action.changes.every((change) => change.mutationId === action.writeIdentity)).toBe(true);
    expect(action.changes.every((change) => change.op === "action")).toBe(true);
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({ id: seedCompleted.id, deletedAt: expect.any(String) }),
    );
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({ id: completed.record.id, deletedAt: expect.any(String) }),
    );
    expect(bootstrap.records).toContainEqual(active.record);
    expect(sync.changes).toEqual(action.changes);
  });

  it("replays clearCompletedTasks action IDs without duplicating changes", async () => {
    const seedCompleted = getSeedCompletedTask();
    const completed = await postCreateOperation("mutation-1", { title: "Done", done: true });

    const first = await postCommandOperation("action-1", "clearCompletedTasks");
    const replay = await postCommandOperation("action-1", "clearCompletedTasks");
    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(replay).toEqual(first);
    expect(first.changes.map((change) => change.recordId).sort()).toEqual(
      [seedCompleted.id, completed.record.id].sort(),
    );
    expect(sync.changes.filter((change) => change.op === "action")).toHaveLength(2);
  });

  it("replays action IDs without selecting newly matching records", async () => {
    const seedCompleted = getSeedCompletedTask();
    const firstCompleted = await postCreateOperation("mutation-1", { title: "Done", done: true });

    const first = await postCommandOperation("action-1", "clearCompletedTasks");
    const secondCompleted = await postCreateOperation("mutation-2", {
      title: "Done later",
      done: true,
    });
    const replay = await postCommandOperation("action-1", "clearCompletedTasks");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(replay).toEqual(first);
    expect(first.changes.map((change) => change.recordId).sort()).toEqual(
      [seedCompleted.id, firstCompleted.record.id].sort(),
    );
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({ id: seedCompleted.id, deletedAt: expect.any(String) }),
    );
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({ id: firstCompleted.record.id, deletedAt: expect.any(String) }),
    );
    expect(bootstrap.records).toContainEqual(secondCompleted.record);
  });

  it("records no-op command executions for idempotent replay", async () => {
    await postCommandOperation("setup-clear-completed", "clearCompletedTasks");
    await postCreateOperation("mutation-1", { title: "Open", done: false });
    const beforeNoOp = await getJson<BootstrapResponse>("/api/bootstrap");

    const first = await postCommandOperation("action-1", "clearCompletedTasks");
    const replay = await postCommandOperation("action-1", "clearCompletedTasks");

    expect(first).toEqual({
      changes: [],
      cursor: beforeNoOp.cursor,
      writeIdentity: operationWriteId("task", "clearCompletedTasks", "action-1"),
    });
    expect(replay).toEqual(first);
  });

  it("transitions one active target record and emits event records idempotently", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithPriorityStateMachine({ emitEvent: true, removePriorityDefault: true }),
    });
    const created = await postCreateOperation("mutation-transition-source", {
      title: "Transition me",
      done: false,
    });

    const first = await postCommandOperationForEntity(
      "action-transition-priority",
      "task",
      "raisePriority",
      {
        input: { recordId: created.record.id },
      },
    );
    const replay = await postCommandOperationForEntity(
      "action-transition-priority",
      "task",
      "raisePriority",
      {
        input: { recordId: created.record.id },
      },
    );
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");
    const sync = await getJson<SyncResponse>("/api/sync?after=0");
    const taskChange = first.changes.find((change) => change.entity === "task");
    const eventChange = first.changes.find((change) => change.entity === "priority-event");

    expect(created.record.values.priority).toBe("normal");
    expect(first.changes).toHaveLength(2);
    expect(first.changes.every((change) => change.mutationId === first.writeIdentity)).toBe(true);
    expect(first.changes.every((change) => change.op === "action")).toBe(true);
    expect(taskChange?.payload).toMatchObject({
      id: created.record.id,
      values: { priority: "high" },
    });
    expect(eventChange?.payload.values).toMatchObject({
      sourceEntity: "task",
      sourceRecordId: created.record.id,
      transitionKey: "raise",
      previousState: "normal",
      nextState: "high",
      actorMode: "owner",
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(replay).toEqual(first);
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({
        id: created.record.id,
        values: expect.objectContaining({ priority: "high" }),
      }),
    );
    expect(bootstrap.records.filter((record) => record.entity === "priority-event")).toHaveLength(
      1,
    );
    expect(sync.changes.filter((change) => change.mutationId === first.writeIdentity)).toHaveLength(
      2,
    );
  });

  it("rejects transition actions for incompatible and tombstoned target records", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithPriorityStateMachine({ deleteEnabled: true }),
    });
    const lowPriority = getSeedLowPriorityTask();

    await expectCommandOperationError(
      {
        idempotencyKey: "action-invalid-transition",
        entity: "task",
        operationName: "raisePriority",
        input: { recordId: lowPriority.id },
      },
      `cannot transition record "${lowPriority.id}" from state "low"`,
    );

    const normalPriority = await postCreateOperation("mutation-normal-priority", {
      title: "Normal priority",
      done: false,
      priority: "normal",
    });
    const reusedActionId = await postCommandOperationForEntity(
      "action-invalid-transition",
      "task",
      "raisePriority",
      {
        input: { recordId: normalPriority.record.id },
      },
    );
    await postRecordOperationRequest({
      idempotencyKey: "mutation-delete-transition-target",
      entity: "task",
      operationName: "delete",
      recordId: normalPriority.record.id,
    });
    const beforeTombstonedAction = await getJson<BootstrapResponse>("/api/bootstrap");

    await expectCommandOperationError(
      {
        idempotencyKey: "action-tombstoned-transition",
        entity: "task",
        operationName: "raisePriority",
        input: { recordId: normalPriority.record.id },
      },
      `cannot transition tombstoned task record "${normalPriority.record.id}"`,
    );

    expect(reusedActionId.changes).toHaveLength(1);
    expect(reusedActionId.changes[0]?.payload.values.priority).toBe("high");
    await expect(getJson<BootstrapResponse>("/api/bootstrap")).resolves.toEqual(
      beforeTombstonedAction,
    );
  });

  it("rejects generic mutations that bypass machine-owned fields", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithPriorityStateMachine(),
    });
    const created = await postCreateOperation("mutation-machine-initial", {
      title: "Initial",
      done: false,
    });

    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-create-progressed-state",
        entity: "task",
        operationName: "create",
        input: {
          title: "Progressed",
          done: false,
          priority: "high",
        },
      },
      'new records must start at initial state "normal"',
    );
    await expectRecordOperationError(
      {
        idempotencyKey: "mutation-direct-state-patch",
        entity: "task",
        operationName: "update",
        recordId: created.record.id,
        input: { priority: "high" },
      },
      "must change through transition actions",
    );

    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(created.record.values.priority).toBe("normal");
    expect(bootstrap.records).toContainEqual(
      expect.objectContaining({
        id: created.record.id,
        values: expect.objectContaining({ priority: "normal" }),
      }),
    );
  });

  it("rejects unsupported action schemas through the schema route", async () => {
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
      'Entity "task" has unsupported key "actions"',
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
      'Entity "task" has unsupported key "actions"',
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
          operations: taskOperations("Task", {
            title: { type: "text", required: true, label: "Task title" },
          }),
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
      screens: {
        taskHome: {
          type: "workspace",
          label: "Tasks",
          navigation: { primary: true },
          layout: {
            type: "stack",
            sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
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

  it("rejects schemas without views", async () => {
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
              operations: taskOperations("Task", {
                title: { type: "text", required: true },
              }),
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
    await postCreateOperation("mutation-1", { title: "First", done: false });

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
    const parsedNextSchema = parseAppSchema(nextSchema);

    expect(update.schema).toEqual(parsedNextSchema);
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

  it("rejects unsupported mutation policy in schema updates", async () => {
    await expectError(
      "/api/schema",
      {
        schema: schemaWithMutations({ create: { enabled: true }, delete: { enabled: false } }),
      },
      'Entity "task" has unsupported key "mutations"',
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
      'Entity "task" has unsupported key "mutations"',
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
      'Entity "task" has unsupported key "mutations"',
    );
    await expectError(
      "/api/schema",
      {
        schema: schemaWithMutations({
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: "yes" },
        }),
      },
      'Entity "task" has unsupported key "mutations"',
    );
  });

  it("keeps create and update behavior on declared operations", async () => {
    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithViews(),
    });
    const created = await postRecordOperationRequest({
      idempotencyKey: "mutation-1",
      entity: "task",
      operationName: "create",
      input: { title: "First", done: false },
    });

    const patched = await postRecordOperationRequest({
      idempotencyKey: "mutation-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { title: "Second" },
    });

    expect(created.record.values.title).toBe("First");
    expect(patched.record.values.title).toBe("Second");
  });

  it("replays accepted operations after a compatible schema update", async () => {
    const created = await postCreateOperation("mutation-1", { title: "First", done: false });
    const patched = await postRecordOperationRequest({
      idempotencyKey: "mutation-2",
      entity: "task",
      operationName: "update",
      recordId: created.record.id,
      input: { title: "Second" },
    });

    await postJson<SchemaUpdateResponse>("/api/schema", {
      schema: schemaWithTaskLabel("Task backlog"),
    });

    await expect(
      postCreateOperation("mutation-1", { title: "First", done: false }),
    ).resolves.toEqual(created);
    await expect(
      postRecordOperationRequest({
        idempotencyKey: "mutation-2",
        entity: "task",
        operationName: "update",
        recordId: created.record.id,
        input: { title: "Second" },
      }),
    ).resolves.toEqual(patched);
  });

  it("rejects bad JSON request bodies", async () => {
    const response = await harness.fetch(apiPath("/api/operations/task/create"), {
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

function expectUniqueIds(records: Array<{ id: string }>) {
  expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
}

function operationWriteId(entity: string, operation: string, idempotencyKey: string) {
  return `operation:${entity}.${operation}:${idempotencyKey}`;
}

function getSeedCompletedTask() {
  const completed = taskSeedRecords.find((record) => record.values.done === true);

  if (!completed) {
    throw new Error("Task seed records must include a completed task.");
  }

  return completed;
}

function getSeedLowPriorityTask() {
  const lowPriority = taskSeedRecords.find((record) => record.values.priority === "low");

  if (!lowPriority) {
    throw new Error("Task seed records must include a low-priority task.");
  }

  return lowPriority;
}

function storageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "tasks",
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:00:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: taskSeedRecords.length,
    schema: appSchema,
    records: taskSeedRecords,
    ...overrides,
  };
}

function siteStorageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return storageSnapshot({
    storageIdentity: "site",
    schemaKey: "site",
    sourceCursor: testSiteSeedRecords.length,
    schema: siteSourceSchema,
    records: testSiteSeedRecords,
    ...overrides,
  });
}

function siteRecordsWithHomeLabel(label: string): StoredRecord[] {
  return testSiteSeedRecords.map((record) =>
    record.id === "rec_site_content_home"
      ? {
          ...record,
          values: {
            ...record.values,
            label,
          },
        }
      : record,
  );
}

function taskSnapshotRecord(id: string, title: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done: false },
    createdAt: "2026-05-07T00:10:00.000Z",
    updatedAt: "2026-05-07T00:10:00.000Z",
  };
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
  const fields = {
    ...appSchema.entities.task.fields,
    priority: priorityField,
  };

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields,
        operations: taskOperations("Task", fields),
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
    screens: defaultScreens(),
  };
}

function schemaWithPriorityStateMachine({
  deleteEnabled = false,
  emitEvent = false,
  removePriorityDefault = false,
}: {
  deleteEnabled?: boolean;
  emitEvent?: boolean;
  removePriorityDefault?: boolean;
} = {}): AppSchema {
  const task = appSchema.entities.task;
  const priorityField = task.fields.priority;

  if (priorityField?.type !== "enum") {
    throw new Error("Seed task priority field must be an enum.");
  }

  const priorityFieldForMachine = removePriorityDefault
    ? {
        type: "enum" as const,
        required: priorityField.required,
        ...(priorityField.label === undefined ? {} : { label: priorityField.label }),
        values: priorityField.values,
      }
    : priorityField;
  const taskEntity = {
    ...task,
    fields: {
      ...task.fields,
      priority: priorityFieldForMachine,
    },
    stateMachines: {
      priorityFlow: {
        field: "priority",
        initial: "normal",
        terminal: ["high"],
        transitions: {
          raise: {
            label: "Raise",
            from: ["normal"],
            to: "high",
          },
        },
        ...(emitEvent
          ? {
              event: {
                entity: "priority-event",
                fields: {
                  sourceEntity: "sourceEntity",
                  sourceRecordId: "sourceRecordId",
                  transitionKey: "transitionKey",
                  previousState: "previousState",
                  nextState: "nextState",
                  actorMode: "actorMode",
                  occurredAt: "occurredAt",
                },
              },
            }
          : {}),
      },
    },
    operations: taskOperations(
      "Task",
      {
        ...task.fields,
        priority: priorityFieldForMachine,
      },
      {
        ...task.actions,
        raisePriority: {
          label: "Raise priority",
          kind: "transition-state",
          machine: "priorityFlow",
          transition: "raise",
        },
      },
      { delete: deleteEnabled },
    ),
  };

  return {
    version: 1,
    entities: {
      task: taskEntity,
      ...(emitEvent
        ? {
            "priority-event": {
              label: "Priority event",
              fields: {
                sourceEntity: { type: "text", required: true, label: "Source entity" },
                sourceRecordId: { type: "text", required: true, label: "Source record" },
                transitionKey: { type: "text", required: true, label: "Transition" },
                previousState: { type: "text", required: true, label: "Previous state" },
                nextState: { type: "text", required: true, label: "Next state" },
                actorMode: { type: "text", required: true, label: "Actor mode" },
                occurredAt: { type: "date", required: true, label: "Occurred" },
              },
            },
          }
        : {}),
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
    screens: defaultScreens(),
  } as unknown as AppSchema;
}

function schemaWithTaskLabel(label: string) {
  return {
    ...appSchema,
    entities: {
      ...appSchema.entities,
      task: {
        ...appSchema.entities.task,
        label,
      },
    },
  } as unknown as AppSchema;
}

function schemaWithTaskNotesField(): AppSchema {
  return {
    ...appSchema,
    entities: {
      ...appSchema.entities,
      task: {
        ...appSchema.entities.task,
        fields: {
          ...appSchema.entities.task.fields,
          notes: { type: "text", required: false, label: "Notes" },
        },
        operations: taskOperations(
          "Task",
          {
            ...appSchema.entities.task.fields,
            notes: { type: "text", required: false, label: "Notes" },
          },
          appSchema.entities.task.actions,
        ),
      },
    },
  };
}

function schemaWithMutations(mutations: unknown) {
  const fields = appSchema.entities.task.fields;

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields,
        mutations,
        operations: taskOperations("Task", fields),
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
    screens: defaultScreens(),
  };
}

function taskOperations(
  label: string,
  fields: Record<string, unknown>,
  actions?: EntitySchema["actions"],
  options: { delete?: boolean } = {},
): NonNullable<AppSchema["entities"][string]["operations"]> {
  const input = {
    fields: Object.fromEntries(Object.keys(fields).map((field) => [field, { field }])),
  };
  const commandOperations = Object.fromEntries(
    Object.entries(actions ?? {}).map(([actionName, action]) => [
      actionName,
      {
        label: action.label ?? actionName,
        kind: "command",
        scope: "collection",
        effect: registeredCommandEffectForAction(action),
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
      },
    ]),
  );

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
    ...(options.delete
      ? {
          delete: {
            label: `Delete ${label}`,
            kind: "delete",
            scope: "record",
            effect: { type: "tombstoneRecord" },
            output: { type: "delete" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        }
      : {}),
    ...commandOperations,
  };
}

function registeredCommandEffectForAction(
  action: NonNullable<EntitySchema["actions"]>[string],
): RegisteredCommandEntityOperationEffectSchema {
  if (action.kind === "clear-completed") {
    return { type: "registeredCommand", kind: action.kind, query: action.target.query };
  }

  if (action.kind === "create-missing-join-records") {
    return { type: "registeredCommand", kind: action.kind, join: action.join };
  }

  if (
    action.kind === "create-selected-join-record" ||
    action.kind === "remove-selected-join-records" ||
    action.kind === "remove-tree-placement"
  ) {
    return { type: "registeredCommand", kind: action.kind, relationship: action.relationship };
  }

  if (action.kind === "create-tree-child") {
    return {
      type: "registeredCommand",
      kind: action.kind,
      relationship: action.relationship,
      childField: action.childField,
      ...(action.orderField === undefined ? {} : { orderField: action.orderField }),
    };
  }

  if (action.kind === "transition-state") {
    return {
      type: "registeredCommand",
      kind: action.kind,
      machine: action.machine,
      transition: action.transition,
    };
  }

  return { type: "registeredCommand", kind: action.kind };
}

function schemaWithTaskAndProjectDeleteEnabled(): AppSchema {
  return {
    ...appSchema,
    entities: {
      task: {
        ...appSchema.entities.task,
        operations: taskOperations(
          "Task",
          appSchema.entities.task.fields,
          appSchema.entities.task.actions,
          { delete: true },
        ),
      },
      project: {
        label: "Project",
        fields: {
          name: { type: "text", required: true },
        },
        operations: taskOperations(
          "Project",
          {
            name: { type: "text", required: true },
          },
          undefined,
          { delete: true },
        ),
      },
    },
  } as unknown as AppSchema;
}

function schemaWithTaskDeleteOperation(): AppSchema {
  return {
    ...appSchema,
    entities: {
      ...appSchema.entities,
      task: {
        ...appSchema.entities.task,
        operations: taskOperations(
          "Task",
          appSchema.entities.task.fields,
          appSchema.entities.task.actions,
          { delete: true },
        ),
      },
    },
  } as unknown as AppSchema;
}

function schemaWithTaskProjectReferenceDeleteEnabled(): AppSchema {
  const schema = schemaWithTaskProjectReference({ required: false });
  const project = schema.entities.project;

  if (!project) {
    throw new Error("Expected task project reference schema to include project entity.");
  }

  return {
    ...schema,
    entities: {
      ...schema.entities,
      project: {
        ...project,
        operations: taskOperations("Project", project.fields, undefined, { delete: true }),
      },
    },
  };
}

function schemaWithEstimateNumber(numberOverrides: Record<string, unknown> = {}) {
  const fields = {
    ...appSchema.entities.task.fields,
    estimate: {
      type: "number",
      required: false,
      label: "Estimate",
      min: 0,
      integer: true,
      ...numberOverrides,
    },
  };

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields,
        operations: taskOperations("Task", fields, appSchema.entities.task.actions),
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
    screens: appSchema.screens,
  };
}

function schemaWithRequiredScore() {
  const schema = schemaWithEstimateNumber();
  const views = defaultViews();
  const taskCreate = views.taskCreate;

  if (taskCreate.type !== "create") {
    throw new Error("Expected taskCreate to be a create view.");
  }
  const fields = {
    ...schema.entities.task.fields,
    score: {
      type: "number",
      required: true,
      label: "Score",
    },
  };

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields,
        operations: taskOperations("Task", fields, appSchema.entities.task.actions),
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
    screens: defaultScreens(),
  };
}

function schemaWithRateReferences({
  constraints,
}: {
  constraints?: EntitySchema["constraints"];
} = {}) {
  return {
    version: 1,
    entities: {
      task: appSchema.entities.task,
      resource: {
        label: "Resource",
        fields: {
          name: { type: "text", required: true, label: "Name" },
        },
        operations: taskOperations("Resource", {
          name: { type: "text", required: true, label: "Name" },
        }),
      },
      card: {
        label: "Rate card",
        fields: {
          name: { type: "text", required: true, label: "Name" },
        },
        operations: taskOperations("Rate card", {
          name: { type: "text", required: true, label: "Name" },
        }),
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
        operations: taskOperations("Rate", {
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
        }),
        ...(constraints === undefined ? {} : { constraints }),
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
    screens: appSchema.screens,
  } as unknown as AppSchema;
}

function schemaWithTaskConstraints(constraints: EntitySchema["constraints"]) {
  const fields = appSchema.entities.task.fields;

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields,
        constraints,
        operations: taskOperations("Task", fields, appSchema.entities.task.actions),
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
    screens: defaultScreens(),
  } as unknown as AppSchema;
}

function uniqueRatePairConstraints(): NonNullable<EntitySchema["constraints"]> {
  return {
    uniqueRatePair: {
      kind: "unique",
      fields: ["resource", "card"],
    },
  };
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
        operations: taskOperations("Assignment", {
          task: {
            type: "reference",
            required: true,
            label: "Task",
            to: "task",
            displayField: "title",
          },
        }),
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
    screens: appSchema.screens,
  } as unknown as AppSchema;
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
  const taskFields = {
    ...appSchema.entities.task.fields,
    project: {
      type: "reference" as const,
      required,
      label: "Project",
      to,
      displayField,
    },
  };

  const entities: Record<string, unknown> = {
    task: {
      label: "Task",
      fields: taskFields,
      operations: taskOperations("Task", taskFields, appSchema.entities.task.actions),
    },
    project: {
      label: "Project",
      fields: {
        name: { type: "text", required: true, label: "Name" },
        code: { type: "text", required: true, label: "Code" },
      },
      operations: taskOperations("Project", {
        name: { type: "text", required: true, label: "Name" },
        code: { type: "text", required: true, label: "Code" },
      }),
    },
  };

  if (includeMilestone) {
    entities.milestone = {
      label: "Milestone",
      fields: {
        name: { type: "text", required: true, label: "Name" },
      },
      operations: taskOperations("Milestone", {
        name: { type: "text", required: true, label: "Name" },
      }),
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
    screens: appSchema.screens,
  } as unknown as AppSchema;
}

function schemaWithViews(views: unknown = defaultViews()) {
  const fields = appSchema.entities.task.fields;

  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields,
        operations: taskOperations("Task", fields),
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views,
    screens: defaultScreens(),
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
        actions,
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
    screens: defaultScreens(),
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

function defaultScreens(): NonNullable<AppSchema["screens"]> {
  return {
    taskHome: {
      type: "workspace",
      label: "Tasks",
      navigation: { primary: true },
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
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

async function resetSchemaApp(schemaKey: SchemaKey) {
  await authority.resetSchemaApp(schemaKey);
}

function useSchemaApp(schemaKey: SchemaKey) {
  authority.useSchemaApp(schemaKey);
}

function apiPath(path: string, schemaKey?: SchemaKey) {
  return authority.apiPath(path, schemaKey);
}

async function getInstalledAppJson<T>(packageAppKey: string, installId: string, path: string) {
  const response = await harness.fetch(installedAppApiPath(packageAppKey, installId, path));

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postInstalledAppJson<T>(
  packageAppKey: string,
  installId: string,
  path: string,
  body: unknown,
) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(
    installedAppApiPath(packageAppKey, installId, request.path),
    {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json()) as T;
}

async function postInstalledAppRecordOperation(
  packageAppKey: string,
  installId: string,
  body: AuthorityTestRecordOperationRequest,
) {
  const request = recordOperationRequest(body);
  const response = await harness.fetch(
    installedAppApiPath(packageAppKey, installId, request.path.slice("/api".length)),
    {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json());
}

async function postInstalledAppCommandOperation(
  packageAppKey: string,
  installId: string,
  body: AuthorityTestCommandOperationRequest,
) {
  const request = commandOperationRequest(body);
  const response = await harness.fetch(
    installedAppApiPath(packageAppKey, installId, request.path.slice("/api".length)),
    {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json());
}

async function resetInstalledApp(packageAppKey: string, installId: string) {
  await postInstalledAppJson<BootstrapResponse>(packageAppKey, installId, "/reset/seed", {});
}

function installedAppApiPath(packageAppKey: string, installId: string, path: string) {
  if (!path.startsWith("/")) {
    throw new Error(`Expected installed app API operation path, received "${path}".`);
  }

  return `/api/app-installs/${packageAppKey}/${installId}${path}`;
}

async function postCreateOperation(idempotencyKey: string, values: Record<string, unknown>) {
  return authority.postCreateOperation(idempotencyKey, values);
}

async function postCreateOperationForEntity(
  idempotencyKey: string,
  entity: string,
  values: Record<string, unknown>,
) {
  return authority.postCreateOperationForEntity(idempotencyKey, entity, values);
}

async function postRecordOperationRequest(body: AuthorityTestRecordOperationRequest) {
  return authority.postRecordOperationRequest(body);
}

async function expectRecordOperationError(
  body: AuthorityTestRecordOperationRequest,
  message: string,
) {
  await authority.expectRecordOperationError(body, message);
}

async function postCommandOperation(idempotencyKey: string, operationName: string) {
  return authority.postCommandOperation(idempotencyKey, operationName);
}

async function postCommandOperationForEntity(
  idempotencyKey: string,
  entity: string,
  operationName: string,
  extra: Record<string, unknown> = {},
) {
  return authority.postCommandOperationForEntity(idempotencyKey, entity, operationName, extra);
}

async function expectCommandOperationError(
  body: AuthorityTestCommandOperationRequest,
  message: string,
) {
  await authority.expectCommandOperationError(body, message);
}

async function openSyncSocket(path = "/api/sync/ws", schemaKey?: SchemaKey) {
  const response = await harness.fetch(apiPath(path, schemaKey), {
    headers: { Upgrade: "websocket" },
  });

  expect(response.status).toBe(101);
  expect(response.webSocket).toBeTruthy();

  const socket = response.webSocket;

  if (!socket) {
    throw new Error("WebSocket upgrade response did not include a client socket.");
  }

  socket.accept();

  return socket;
}

function readSyncSocketMessage(socket: Awaited<ReturnType<typeof openSyncSocket>>) {
  return new Promise<SyncSocketServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for sync WebSocket message."));
    }, 1000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };
    const onMessage = (event: WebSocketEventMap["message"]) => {
      cleanup();
      if (typeof event.data !== "string") {
        reject(new Error("Sync WebSocket message was not text."));
        return;
      }

      resolve(JSON.parse(event.data) as SyncSocketServerMessage);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Sync WebSocket emitted an error."));
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

async function primeSyncSocket(
  socket: Awaited<ReturnType<typeof openSyncSocket>>,
  cursor: number,
  schemaUpdatedAt: string | null,
) {
  socket.send(
    JSON.stringify({
      type: "hello",
      cursor,
      schemaUpdatedAt,
    }),
  );

  await expect(readSyncSocketMessage(socket)).resolves.toEqual({
    type: "sync",
    payload: {
      changes: [],
      cursor,
    },
  });
}

function captureSyncSocketMessages(socket: Awaited<ReturnType<typeof openSyncSocket>>) {
  const messages: SyncSocketServerMessage[] = [];
  const onMessage = (event: WebSocketEventMap["message"]) => {
    if (typeof event.data === "string") {
      messages.push(JSON.parse(event.data) as SyncSocketServerMessage);
    }
  };

  socket.addEventListener("message", onMessage);

  return {
    messages,
    stop: () => {
      socket.removeEventListener("message", onMessage);
    },
  };
}

async function expectNoCapturedMessages(capture: ReturnType<typeof captureSyncSocketMessages>) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(capture.messages).toEqual([]);
}

async function getJson<T>(path: string) {
  return authority.getJson<T>(path);
}

async function postJson<T>(path: string, body: unknown) {
  return authority.postJson<T>(path, body);
}

async function expectError(path: string, body: unknown, message: string) {
  await authority.expectError(path, body, message);
}

async function expectNotFound(path: string) {
  await authority.expectNotFound(path);
}

function expectRecordsIgnoringOrder(actual: StoredRecord[], expected: StoredRecord[]) {
  expect(recordsById(actual)).toEqual(recordsById(expected));
}

function recordsById(records: StoredRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function privatePublicSitePackageManifest(sourceSchemaHash: SourceSchemaHash): AppPackageManifest {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-site",
    label: "Private Site",
    description: "Private workspace Site package.",
    defaultInstallId: "private-site",
    supportsMultipleInstalls: true,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-site",
      path: "packages/private-site/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-site",
      path: "packages/private-site/seed-records.json",
    },
    sourceSchemaHash,
    capabilities: [
      { kind: "generatedAdmin", routeBase: "/apps" },
      { kind: "publicSite", routeBase: "/sites" },
    ],
  };
}
