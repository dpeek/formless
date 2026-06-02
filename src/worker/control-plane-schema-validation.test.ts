import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type { ActionResponse, MutationResponse } from "../shared/protocol.ts";
import { instanceControlPlaneSchema } from "../shared/instance-control-plane.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import { taskSourceSchema } from "../test/schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import {
  createAuthorityWriteHelpers,
  type AuthorityWriteHelpers,
} from "../test/authority-write.ts";
import { filterEntityActionResponseForActor, validateEntityActionRequest } from "./actions.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
let authority: AuthorityWriteHelpers;

beforeAll(async () => {
  harness = await createWorkerHarness("src/worker/index.ts", {
    FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
  });
  authority = createAuthorityWriteHelpers(harness);
});

beforeEach(async () => {
  authority.useSchemaApp("tasks");
  await authority.resetSchemaApp("tasks");
});

afterAll(async () => {
  await harness.dispose();
});

describe("control-plane schema runtime validation", () => {
  it("enforces immutable fields, route validation, enabled uniqueness, and action-created history", async () => {
    await authority.postJson("/api/schema", { schema: controlPlaneRuntimeSchema() });

    const task = await authority.postMutation("mutation-control-plane-task", {
      title: "Immutable title",
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-task-patch-immutable",
        entity: "task",
        op: "patch",
        recordId: task.record.id,
        values: { title: "Renamed" },
      },
      'Field "task.title" is immutable.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-history-create",
        entity: "deploy-attempt",
        op: "create",
        values: {
          label: "Attempt",
        },
      },
      'Entity "deploy-attempt" history records must be created through schema actions.',
    );

    const install = await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-control-plane-install",
      entity: "app-install",
      op: "create",
      values: {
        label: "Site",
      },
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-route-missing-target",
        entity: "app-route",
        op: "create",
        values: routeValues("missing-install", {
          path: "/apps/missing",
        }),
      },
      'Field "appInstall" references unknown app-install record "missing-install".',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-route-reserved",
        entity: "app-route",
        op: "create",
        values: routeValues(install.record.id, {
          path: "/api/jobs",
        }),
      },
      'Field "path" must be a route-safe path.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-route-capability",
        entity: "app-route",
        op: "create",
        values: routeValues(install.record.id, {
          packageCapability: "publicSite",
          path: "/apps/site",
          routeKind: "admin",
        }),
      },
      'Field "packageCapability" is incompatible with route kind "admin".',
    );

    await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-control-plane-route",
      entity: "app-route",
      op: "create",
      values: routeValues(install.record.id, {
        path: "/apps/site",
      }),
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-route-duplicate",
        entity: "app-route",
        op: "create",
        values: routeValues(install.record.id, {
          path: "/apps/site",
        }),
      },
      'Enabled route path "/apps/site" is already in use.',
    );
  });

  it("validates unified instance route records before they become active", async () => {
    await authority.postJson("/api/schema", { schema: instanceRouteRuntimeSchema() });

    const siteInstall = await createControlPlaneAppInstall("site", "Personal Site");
    const tasksInstall = await createControlPlaneAppInstall("tasks", "Team Tasks");
    const providerConfig = await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-control-plane-provider-config",
      entity: "provider-config-ref",
      op: "create",
      values: {
        providerFamily: "cloudflare",
        configRef: "primary",
        label: "Primary Cloudflare",
        createdAt: now,
        updatedAt: now,
      },
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-host-normalized",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "match-host": "WWW.Example.COM.",
        }),
      },
      'Field "match-host" must be a normalized exact host.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-path-normalized",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "match-path": "/api/site",
        }),
      },
      'Field "match-path" must be a normalized absolute path.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-prefix-below-path",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "match-path": "/sites/personal",
          "match-prefix": "/sites/",
          "target-profile": "public-site",
          surface: "public-site",
        }),
      },
      'Field "match-prefix" must begin at or below field "match-path".',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-hostless-provider-config",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "provider-config": providerConfig.record.id,
        }),
      },
      'Field "provider-config" can only be set on exact-host route records.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-public-site-capability",
        entity: "route",
        op: "create",
        values: mountRouteValues(tasksInstall.record.id, {
          "match-path": "/sites/tasks",
          "match-prefix": "/sites/tasks/",
          "target-profile": "public-site",
          surface: "public-site",
        }),
      },
      'Field "app-install" references app-install record',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-target",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          "to-host": undefined,
        }),
      },
      'Redirect routes must set exactly one of field "to-host" or field "to-url".',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-app-target",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          "app-install": siteInstall.record.id,
        }),
      },
      'Field "app-install" is incompatible with redirect routes.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-url-normalized",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          "to-host": undefined,
          "to-url": "http://example.com",
        }),
      },
      'Field "to-url" must be a normalized absolute HTTPS URL without credentials or fragment.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-host-public-site-root",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "match-host": "www.example.com",
          "match-path": "/sites/personal",
          "match-prefix": "/sites/personal/",
          "target-profile": "public-site",
          surface: "public-site",
        }),
      },
      'Host-mounted public Site routes must set field "match-path" to "/" and field "match-prefix" to "/".',
    );

    await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-host-public-site",
      entity: "route",
      op: "create",
      values: mountRouteValues(siteInstall.record.id, {
        "match-host": "www.example.com",
        "match-path": "/",
        "match-prefix": "/",
        "target-profile": "public-site",
        surface: "public-site",
      }),
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-host-public-site-conflict",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "match-host": "www.example.com",
          "match-path": "/apps/personal",
        }),
      },
      'Enabled route match "www.example.com/apps/personal" conflicts with enabled route',
    );

    await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-hostless-admin",
      entity: "route",
      op: "create",
      values: mountRouteValues(siteInstall.record.id, {
        "match-path": "/apps/personal",
      }),
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-hostless-admin-conflict",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "match-path": "/apps/personal",
        }),
      },
      'Enabled route match "<hostless>/apps/personal" conflicts with enabled route',
    );

    await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-hostless-public-site",
      entity: "route",
      op: "create",
      values: mountRouteValues(siteInstall.record.id, {
        "match-path": "/sites/personal",
        "match-prefix": "/sites/personal/",
        "target-profile": "public-site",
        surface: "public-site",
      }),
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-hostless-public-site-prefix-conflict",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          "match-path": "/sites/personal/blog",
          "target-profile": "public-site",
          surface: "public-site",
        }),
      },
      'Enabled route match "<hostless>/sites/personal/blog" conflicts with enabled route',
    );
  });

  it("authorizes actor-scoped actions and filters response fields for the actor", () => {
    const schema = parseAppSchema(controlPlaneRuntimeSchema());
    const request = validateEntityActionRequest(
      {
        actionId: "action-runner-clear",
        entity: "task",
        action: "runnerClear",
      },
      schema,
      { actorKind: "runner" },
    );

    expect(() =>
      validateEntityActionRequest(
        {
          actionId: "action-owner-clear",
          entity: "task",
          action: "runnerClear",
        },
        schema,
        { actorKind: "owner" },
      ),
    ).toThrow('Action "runnerClear" is not exposed to actor "owner".');

    const filtered = filterEntityActionResponseForActor(
      {
        actionId: request.actionId,
        changes: [
          {
            seq: 1,
            mutationId: request.actionId,
            op: "action",
            entity: "task",
            recordId: "task-1",
            createdAt: "2026-05-28T00:00:00.000Z",
            payload: {
              id: "task-1",
              entity: "task",
              createdAt: "2026-05-28T00:00:00.000Z",
              values: {
                title: "Hidden",
                done: true,
              },
            },
          },
        ],
        cursor: 1,
      } satisfies ActionResponse,
      schema,
      request,
      "runner",
    );

    expect(filtered.changes[0]?.payload.values).toEqual({ done: true });
  });
});

const now = "2026-06-02T00:00:00.000Z";

async function createControlPlaneAppInstall(packageAppKey: "site" | "tasks", label: string) {
  const installId = packageAppKey === "site" ? "personal" : "tasks";

  return authority.postJson<MutationResponse>("/api/mutations", {
    mutationId: `mutation-control-plane-install-${installId}`,
    entity: "app-install",
    op: "create",
    values: {
      installId,
      packageAppKey,
      packageRevision: 1,
      sourceSchemaHash: bundledSourceSchemaHashFixtures[packageAppKey],
      label,
      status: "installed",
      storageIdentity: `app:${installId}`,
      createdAt: now,
      updatedAt: now,
    },
  });
}

function instanceRouteRuntimeSchema(): AppSchema {
  const controlPlaneSchema: AppSchema = instanceControlPlaneSchema;

  return {
    ...taskSourceSchema,
    entities: {
      ...taskSourceSchema.entities,
      "app-install": controlPlaneSchema.entities["app-install"],
      route: controlPlaneSchema.entities.route,
      "provider-config-ref": controlPlaneSchema.entities["provider-config-ref"],
    },
    runtime: {
      owner: "runtime",
      builder: { editable: false },
      controlPlane: {
        entities: {
          "app-install": controlPlaneSchema.runtime!.controlPlane!.entities["app-install"]!,
          route: controlPlaneSchema.runtime!.controlPlane!.entities.route!,
          "provider-config-ref":
            controlPlaneSchema.runtime!.controlPlane!.entities["provider-config-ref"]!,
        },
      },
    },
  };
}

function mountRouteValues(appInstall: string, overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    "match-path": "/apps/personal",
    kind: "mount",
    "target-profile": "app",
    "app-install": appInstall,
    surface: "admin",
    "created-at": now,
    "updated-at": now,
    ...overrides,
  };
}

function redirectRouteValues(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    "match-host": "old.example.com",
    "match-path": "/",
    "match-prefix": "/",
    kind: "redirect",
    "to-host": "example.com",
    "status-code": "308",
    "preserve-path": true,
    "preserve-query-string": true,
    "created-at": now,
    "updated-at": now,
    ...overrides,
  };
}

function controlPlaneRuntimeSchema(): AppSchema {
  const task = taskSourceSchema.entities.task;

  return {
    ...taskSourceSchema,
    entities: {
      ...taskSourceSchema.entities,
      task: {
        ...task,
        actions: {
          ...task.actions,
          runnerClear: {
            label: "Runner clear",
            kind: "clear-completed",
            target: { query: "taskCompleted" },
            exposure: {
              actors: ["runner"],
              responseFields: { runner: ["done"] },
            },
          },
        },
      },
      "app-install": {
        label: "App install",
        fields: {
          label: { type: "text", required: true, label: "Label" },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
      },
      "app-route": {
        label: "App route",
        fields: {
          appInstall: {
            type: "reference",
            required: true,
            label: "App install",
            to: "app-install",
            displayField: "label",
          },
          routeKind: {
            type: "enum",
            required: true,
            values: {
              admin: { label: "Admin" },
              publicSite: { label: "Public Site" },
            },
          },
          path: { type: "text", required: true, label: "Path" },
          prefix: { type: "text", required: false, label: "Prefix" },
          packageCapability: {
            type: "enum",
            required: true,
            values: {
              generatedApp: { label: "Generated app" },
              publicSite: { label: "Public Site" },
            },
          },
          enabled: { type: "boolean", required: true, default: true },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
      },
      "deploy-attempt": {
        label: "Deploy attempt",
        fields: {
          label: { type: "text", required: true, label: "Label" },
        },
        mutations: {
          create: { enabled: false },
          patch: { enabled: false },
          delete: { enabled: false },
        },
      },
    },
    runtime: {
      owner: "runtime",
      builder: { editable: false },
      controlPlane: {
        entities: {
          task: {
            immutableFields: ["title"],
          },
          "app-route": {
            routeValidation: {
              pathField: "path",
              prefixField: "prefix",
              enabledField: "enabled",
              routeKindField: "routeKind",
              packageCapabilityField: "packageCapability",
              appInstallField: "appInstall",
              reservedPaths: ["/api", "/setup"],
              routeKindCapabilities: {
                admin: "generatedApp",
                publicSite: "publicSite",
              },
            },
          },
          "deploy-attempt": {
            history: { kind: "actionCreated" },
          },
        },
      },
    },
  };
}

function routeValues(
  appInstall: string,
  overrides: Partial<{
    enabled: boolean;
    packageCapability: "generatedApp" | "publicSite";
    path: string;
    prefix: string;
    routeKind: "admin" | "publicSite";
  }>,
) {
  return {
    appInstall,
    routeKind: overrides.routeKind ?? "admin",
    path: overrides.path ?? "/apps/site",
    ...(overrides.prefix === undefined ? {} : { prefix: overrides.prefix }),
    packageCapability: overrides.packageCapability ?? "generatedApp",
    enabled: overrides.enabled ?? true,
  };
}
