import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type { ActionResponse, MutationResponse } from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import { taskSourceSchema } from "../test/schema-apps.ts";
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
        entity: "deployAttempt",
        op: "create",
        values: {
          label: "Attempt",
        },
      },
      'Entity "deployAttempt" history records must be created through schema actions.',
    );

    const install = await authority.postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-control-plane-install",
      entity: "appInstall",
      op: "create",
      values: {
        label: "Site",
      },
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-route-reserved",
        entity: "appRoute",
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
        entity: "appRoute",
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
      entity: "appRoute",
      op: "create",
      values: routeValues(install.record.id, {
        path: "/apps/site",
      }),
    });

    await authority.expectError(
      "/api/mutations",
      {
        mutationId: "mutation-control-plane-route-duplicate",
        entity: "appRoute",
        op: "create",
        values: routeValues(install.record.id, {
          path: "/apps/site",
        }),
      },
      'Enabled route path "/apps/site" is already in use.',
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
      appInstall: {
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
      appRoute: {
        label: "App route",
        fields: {
          appInstall: {
            type: "reference",
            required: true,
            label: "App install",
            to: "appInstall",
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
      deployAttempt: {
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
          appRoute: {
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
          deployAttempt: {
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
