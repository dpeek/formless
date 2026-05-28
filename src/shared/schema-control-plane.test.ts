import { describe, expect, it } from "vite-plus/test";

import { taskSourceSchema } from "../test/schema-apps.ts";
import { isEntityActionExposedToActor, isEntityActionVisibleToBrowser } from "./schema-actions.ts";
import { parseAppSchema, type AppSchema } from "./schema.ts";
import {
  isRuntimeControlPlaneImmutableField,
  isRuntimeControlPlaneSecretReferenceField,
} from "./schema-runtime.ts";

describe("control-plane schema runtime metadata", () => {
  it("parses runtime-owned metadata, secret references, route validation, and action exposure", () => {
    const schema = parseAppSchema(controlPlaneTaskSchema());
    const action = schema.entities.task?.actions?.runnerApply;

    expect(schema.runtime).toEqual({
      owner: "runtime",
      builder: { editable: false },
      controlPlane: {
        entities: {
          route: {
            immutableFields: ["target"],
            routeValidation: {
              pathField: "path",
              prefixField: "prefix",
              enabledField: "enabled",
              routeKindField: "routeKind",
              packageCapabilityField: "packageCapability",
              reservedPaths: ["/api"],
              routeKindCapabilities: {
                admin: "generatedApp",
                publicSite: "publicSite",
              },
            },
          },
          task: {
            immutableFields: ["title"],
            secretReferenceFields: ["secretRef"],
          },
        },
      },
    });
    expect(isRuntimeControlPlaneImmutableField(schema, "task", "title")).toBe(true);
    expect(isRuntimeControlPlaneSecretReferenceField(schema, "task", "secretRef")).toBe(true);
    expect(action?.exposure).toEqual({
      actors: ["runner"],
      responseFields: { runner: ["done"] },
    });
    expect(action && isEntityActionExposedToActor(action, "runner")).toBe(true);
    expect(action && isEntityActionExposedToActor(action, "owner")).toBe(false);
    expect(action && isEntityActionVisibleToBrowser(action)).toBe(false);
  });

  it("rejects control-plane metadata that references unsupported fields", () => {
    expect(() =>
      parseAppSchema({
        ...controlPlaneTaskSchema(),
        runtime: {
          owner: "runtime",
          builder: { editable: false },
          controlPlane: {
            entities: {
              task: { immutableFields: ["missing"] },
            },
          },
        },
      }),
    ).toThrow('references unknown field "missing"');
  });
});

function controlPlaneTaskSchema(): AppSchema {
  const task = taskSourceSchema.entities.task;

  return {
    ...taskSourceSchema,
    entities: {
      ...taskSourceSchema.entities,
      task: {
        ...task,
        fields: {
          ...task.fields,
          secretRef: { type: "text", required: false, label: "Secret ref" },
        },
        actions: {
          ...task.actions,
          runnerApply: {
            label: "Runner apply",
            kind: "clear-completed",
            target: { query: "taskCompleted" },
            exposure: {
              actors: ["runner"],
              responseFields: { runner: ["done"] },
            },
          },
        },
      },
      route: {
        label: "Route",
        fields: {
          target: { type: "text", required: true },
          path: { type: "text", required: true },
          prefix: { type: "text", required: false },
          enabled: { type: "boolean", required: true, default: true },
          routeKind: {
            type: "enum",
            required: true,
            values: {
              admin: { label: "Admin" },
              publicSite: { label: "Public Site" },
            },
          },
          packageCapability: {
            type: "enum",
            required: true,
            values: {
              generatedApp: { label: "Generated app" },
              publicSite: { label: "Public Site" },
            },
          },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
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
            secretReferenceFields: ["secretRef"],
          },
          route: {
            immutableFields: ["target"],
            routeValidation: {
              pathField: "path",
              prefixField: "prefix",
              enabledField: "enabled",
              routeKindField: "routeKind",
              packageCapabilityField: "packageCapability",
              reservedPaths: ["/api"],
              routeKindCapabilities: {
                admin: "generatedApp",
                publicSite: "publicSite",
              },
            },
          },
        },
      },
    },
  };
}
