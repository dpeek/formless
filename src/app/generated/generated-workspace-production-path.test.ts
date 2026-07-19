import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { createFormlessUiMemoryContractHost } from "@dpeek/formless-astryx/contract-host";
import { instanceControlPlaneSchema } from "@dpeek/formless-instance-control-plane";
import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { selectScreenModels } from "../../client/views.ts";
import {
  crmSourceSchema,
  rateSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../../test/schema-apps.ts";
import { projectGeneratedWorkspaceContractHostPublication } from "./generated-workspace-contract-host.ts";
import { selectGeneratedWorkspaceFoundation } from "./generated-workspace-foundation.ts";

describe("generated workspace production path", () => {
  it("keeps every shipped screen on a supported canonical result path", () => {
    const inventory = Object.fromEntries(
      Object.entries(productionSchemas).map(([schemaKey, schema]) => [
        schemaKey,
        selectScreenModels(schema).map((screen) => ({
          results: screen.layout.sections.map((section) => section.collection.result.type),
          screen: screen.screenName,
        })),
      ]),
    );

    expect(inventory).toEqual({
      crm: [
        { results: ["table", "table", "table"], screen: "contacts" },
        { results: ["table", "table"], screen: "audiences" },
        { results: ["table", "table"], screen: "campaigns" },
        { results: ["table", "table", "table"], screen: "broadcasts" },
      ],
      instance: [
        { results: ["table"], screen: "apps" },
        { results: ["table"], screen: "routes" },
        { results: ["table"], screen: "deployments" },
        { results: ["table", "table", "table"], screen: "settings" },
      ],
      rate: [
        { results: ["table"], screen: "rateHome" },
        { results: ["list", "list"], screen: "rateSetup" },
      ],
      site: [
        { results: ["record"], screen: "siteSettings" },
        { results: ["tree"], screen: "siteEditor" },
        { results: ["table", "table", "table"], screen: "siteSubscribers" },
      ],
      tasks: [{ results: ["list"], screen: "taskHome" }],
    });
  });

  it("publishes a selected route result through the scoped workspace host", () => {
    const screen = required(
      selectScreenModels(taskSourceSchema).find((candidate) => candidate.screenName === "taskHome"),
    );
    const foundation = required(
      selectGeneratedWorkspaceFoundation({
        screen,
        snapshot: projectionSnapshot(taskSeedRecords),
        today: "2026-07-19",
      }),
    );
    const publication = projectGeneratedWorkspaceContractHostPublication(foundation.workspace);
    const host = createFormlessUiMemoryContractHost({ nodes: publication.nodes });
    const workspace = required(host.read(publication.workspaceReference));
    const section = required(host.read(required(workspace.sections[0])));
    const result = required(host.read(section.collection.presentation.result));

    expect(workspace).toMatchObject({ id: "workspace:taskHome", kind: "workspaceManifest" });
    expect(section).toMatchObject({ kind: "workspaceSectionShell" });
    expect(result).toMatchObject({ kind: "list" });
  });

  it("routes production screens directly to the generated workspace runtime", () => {
    const routeSource = readFileSync(new URL("../routes/home.tsx", import.meta.url), "utf8");

    expect(routeSource).toContain('from "../generated/generated-workspace-runtime.tsx"');
    expect(routeSource).toContain("<GeneratedWorkspaceRuntime");
    expect(routeSource).not.toContain("generated/screen");
    expect(routeSource).not.toContain("generated/collection");
    expect(routeSource).not.toContain("generatedWorkspaceScreenIsEligible");
  });
});

const productionSchemas = {
  crm: crmSourceSchema,
  instance: instanceControlPlaneSchema,
  rate: rateSourceSchema,
  site: siteSourceSchema,
  tasks: taskSourceSchema,
} satisfies Record<string, AppSchema>;

function projectionSnapshot(records: readonly StoredRecord[]) {
  return {
    recordsById: Object.fromEntries(records.map((record) => [record.id, record])),
    recordIdsByEntity: records.reduce<Record<string, string[]>>((byEntity, record) => {
      (byEntity[record.entity] ??= []).push(record.id);
      return byEntity;
    }, {}),
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Missing required generated workspace fixture value.");
  }
  return value;
}
