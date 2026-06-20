import { describe, expect, it } from "vite-plus/test";

import {
  isEntityOperationVisibleToBrowser,
  isRuntimeControlPlaneImmutableField,
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
  parseAppSchema,
} from "./index.ts";

describe("control-plane schema runtime metadata", () => {
  it("parses runtime-owned metadata, secret references, route validation, and operation policy", () => {
    const schema = parseAppSchema(controlPlaneTaskSchema());
    const operation = schema.entities.task?.operations?.runnerApply;

    expect(schema.runtime).toEqual({
      owner: "runtime",
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
            observedFields: ["done"],
            secretReferenceFields: ["secretRef"],
          },
        },
      },
    });
    expect(isRuntimeControlPlaneImmutableField(schema, "task", "title")).toBe(true);
    expect(isRuntimeControlPlaneObservedField(schema, "task", "done")).toBe(true);
    expect(isRuntimeControlPlaneObservedField(schema, "task", "title")).toBe(false);
    expect(isRuntimeControlPlaneSecretReferenceField(schema, "task", "secretRef")).toBe(true);
    expect(operation?.policy).toEqual({
      actors: ["runner"],
      responseFields: { runner: ["done"] },
    });
    expect(operation?.policy?.actors.includes("runner")).toBe(true);
    expect(operation?.policy?.actors.includes("owner")).toBe(false);
    expect(operation && isEntityOperationVisibleToBrowser(operation)).toBe(false);
  });

  it("rejects control-plane metadata that references unsupported fields", () => {
    expect(() =>
      parseAppSchema({
        ...controlPlaneTaskSchema(),
        runtime: {
          owner: "runtime",
          controlPlane: {
            entities: {
              task: { immutableFields: ["missing"] },
            },
          },
        },
      }),
    ).toThrow('references unknown field "missing"');
  });

  it("rejects observed field metadata that references unknown fields", () => {
    expect(() =>
      parseAppSchema({
        ...controlPlaneTaskSchema(),
        runtime: {
          owner: "runtime",
          controlPlane: {
            entities: {
              task: { observedFields: ["missing"] },
            },
          },
        },
      }),
    ).toThrow('references unknown field "missing"');
  });

  it("parses runtime control-plane history declarations", () => {
    const source = controlPlaneTaskSchema();
    const actionCreatedSchema = parseAppSchema({
      ...source,
      runtime: {
        owner: "runtime",
        controlPlane: {
          entities: {
            task: {
              history: { kind: "actionCreated" },
            },
          },
        },
      },
    });
    const appendOnlySchema = parseAppSchema({
      ...source,
      entities: {
        ...source.entities,
        task: {
          ...source.entities.task,
          operations: undefined,
        },
      },
      runtime: {
        owner: "runtime",
        controlPlane: {
          entities: {
            task: {
              history: { kind: "appendOnly" },
            },
          },
        },
      },
    });

    expect(actionCreatedSchema.runtime?.controlPlane?.entities.task?.history?.kind).toBe(
      "actionCreated",
    );
    expect(appendOnlySchema.runtime?.controlPlane?.entities.task?.history?.kind).toBe("appendOnly");
  });
});

function controlPlaneTaskSchema() {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true, label: "Title" },
          done: { type: "boolean", required: true, label: "Done", default: false },
          secretRef: { type: "text", required: false, label: "Secret ref" },
        },
        operations: {
          runnerApply: {
            label: "Runner apply",
            kind: "command",
            scope: "collection",
            target: { query: "taskCompleted" },
            effect: {
              type: "operationHandler",
              handler: "clear-completed",
              config: { query: "taskCompleted" },
            },
            policy: {
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
      },
    },
    queries: {
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
    },
    itemViews: {
      taskItem: {
        entity: "task",
        fields: {
          title: { editor: "text", commit: "field-commit" },
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
        queries: [{ query: "taskCompleted" }],
        defaultQuery: "taskCompleted",
        result: { type: "list", itemView: "taskItem" },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Home",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    },
    runtime: {
      owner: "runtime",
      controlPlane: {
        entities: {
          task: {
            immutableFields: ["title"],
            observedFields: ["done"],
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
