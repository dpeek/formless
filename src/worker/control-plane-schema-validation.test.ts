import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type { ActionResponse, MutationResponse } from "../shared/protocol.ts";
import { instanceControlPlaneSchema } from "../shared/instance-control-plane.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
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
      'Unknown operation "create" for entity "deploy-attempt".',
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
    const deploymentConfig = await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-control-plane-deployment-config",
      entity: "deployment-config",
      op: "create",
      values: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "Primary Cloudflare",
        enabled: true,
        targetUrl: "https://personal.example.workers.dev",
        providerFamily: "cloudflare",
        createdAt: now,
        updatedAt: now,
      },
    });

    const hostedMount = await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-exact-host-provider-config",
      entity: "route",
      op: "create",
      values: mountRouteValues(siteInstall.record.id, {
        matchHost: "app.example.com",
        deploymentConfig: deploymentConfig.record.id,
      }),
    });

    expect(hostedMount.record.values).toMatchObject({
      kind: "mount",
      matchHost: "app.example.com",
      matchPath: "/apps/personal",
      deploymentConfig: deploymentConfig.record.id,
      targetProfile: "app",
    });

    const redirect = await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-redirect-to-url",
      entity: "route",
      op: "create",
      values: redirectRouteValues({
        matchHost: "docs.example.com",
        toHost: undefined,
        toUrl: "https://example.com/docs",
        statusCode: "301",
        preservePath: false,
        preserveQueryString: false,
      }),
    });

    expect(redirect.record.values).toMatchObject({
      kind: "redirect",
      matchHost: "docs.example.com",
      matchPath: "/",
      matchPrefix: "/",
      toUrl: "https://example.com/docs",
      statusCode: "301",
      preservePath: false,
      preserveQueryString: false,
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-host-normalized",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchHost: "WWW.Example.COM.",
        }),
      },
      'Field "matchHost" must be a normalized exact host.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-path-normalized",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchPath: "/api/site",
        }),
      },
      'Field "matchPath" must be a normalized absolute path.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-path-case-normalized",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchPath: "/Apps/personal",
        }),
      },
      'Field "matchPath" must be a normalized absolute path.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-prefix-normalized",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchPath: "/sites/personal",
          matchPrefix: "/sites/personal",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Field "matchPrefix" must be a normalized absolute path prefix.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-prefix-below-path",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchPath: "/sites/personal",
          matchPrefix: "/sites/",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Field "matchPrefix" must begin at or below field "matchPath".',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-hostless-deployment-config",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          deploymentConfig: deploymentConfig.record.id,
        }),
      },
      'Field "deploymentConfig" can only be set on exact-host route records.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-deployment-config-reference",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchHost: "missing-provider.example.com",
          deploymentConfig: "missing-provider",
        }),
      },
      'Field "deploymentConfig" references unknown deployment-config record "missing-provider".',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-access",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          access: "admin",
        }),
      },
      'Field "access" must be a known enum value.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-public-site-capability",
        entity: "route",
        op: "create",
        values: mountRouteValues(tasksInstall.record.id, {
          matchPath: "/sites/tasks",
          matchPrefix: "/sites/tasks/",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Package app "tasks" does not support public Site routes.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-host-required",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          matchHost: undefined,
        }),
      },
      'Field "matchHost" is required for redirect routes.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-target",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          toHost: undefined,
        }),
      },
      'Redirect routes must set exactly one of field "toHost" or field "toUrl".',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-app-target",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          appInstall: siteInstall.record.id,
        }),
      },
      'Field "appInstall" is incompatible with redirect routes.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-host-normalized",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          toHost: "WWW.Example.COM.",
        }),
      },
      'Field "toHost" must be a normalized exact host.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-url-normalized",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          toHost: undefined,
          toUrl: "http://example.com",
        }),
      },
      'Field "toUrl" must be a normalized absolute HTTPS URL without credentials or fragment.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-status-required",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          statusCode: undefined,
        }),
      },
      'Field "statusCode" is required for redirect routes.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-redirect-preserve-path-boolean",
        entity: "route",
        op: "create",
        values: redirectRouteValues({
          preservePath: "yes",
        }),
      },
      'Field "preservePath" must be a boolean.',
    );

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-host-public-site-root",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchHost: "www.example.com",
          matchPath: "/sites/personal",
          matchPrefix: "/sites/personal/",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Host-mounted public Site routes must set field "matchPath" to "/" and field "matchPrefix" to "/".',
    );

    await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-host-public-site",
      entity: "route",
      op: "create",
      values: mountRouteValues(siteInstall.record.id, {
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        targetProfile: "public-site",
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
          matchHost: "www.example.com",
          matchPath: "/apps/personal",
        }),
      },
      'Enabled route match "www.example.com/apps/personal" conflicts with enabled route',
    );

    await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-hostless-admin",
      entity: "route",
      op: "create",
      values: mountRouteValues(siteInstall.record.id, {
        matchPath: "/apps/personal",
      }),
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-route-hostless-admin-conflict",
        entity: "route",
        op: "create",
        values: mountRouteValues(siteInstall.record.id, {
          matchPath: "/apps/personal",
        }),
      },
      'Enabled route match "<hostless>/apps/personal" conflicts with enabled route',
    );

    await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-route-hostless-public-site",
      entity: "route",
      op: "create",
      values: mountRouteValues(siteInstall.record.id, {
        matchPath: "/sites/personal",
        matchPrefix: "/sites/personal/",
        targetProfile: "public-site",
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
          matchPath: "/sites/personal/blog",
          targetProfile: "public-site",
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
      "deployment-config": controlPlaneSchema.entities["deployment-config"],
    },
    runtime: {
      owner: "runtime",
      builder: { editable: false },
      controlPlane: {
        entities: {
          "app-install": controlPlaneSchema.runtime!.controlPlane!.entities["app-install"]!,
          route: controlPlaneSchema.runtime!.controlPlane!.entities.route!,
          "deployment-config":
            controlPlaneSchema.runtime!.controlPlane!.entities["deployment-config"]!,
        },
      },
    },
  };
}

function mountRouteValues(appInstall: string, overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    matchPath: "/apps/personal",
    kind: "mount",
    targetProfile: "app",
    appInstall,
    surface: "admin",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function redirectRouteValues(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    matchHost: "old.example.com",
    matchPath: "/",
    matchPrefix: "/",
    kind: "redirect",
    toHost: "example.com",
    statusCode: "308",
    preservePath: true,
    preserveQueryString: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function writeOperations(
  label: string,
  fields: AppSchema["entities"][string]["fields"],
): NonNullable<AppSchema["entities"][string]["operations"]> {
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
  };
}

function controlPlaneRuntimeSchema(): AppSchema {
  const task = taskSourceSchema.entities.task;
  const appInstallFields = {
    label: { type: "text", required: true, label: "Label" },
  } satisfies AppSchema["entities"][string]["fields"];
  const appRouteFields = {
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
  } satisfies AppSchema["entities"][string]["fields"];

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
        fields: appInstallFields,
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
        operations: writeOperations("App install", appInstallFields),
      },
      "app-route": {
        label: "App route",
        fields: appRouteFields,
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
        operations: writeOperations("App route", appRouteFields),
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
