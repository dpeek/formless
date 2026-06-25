import { describe, expect, it } from "vite-plus/test";
import {
  WORKSPACE_OPERATION_STATE_FILE_KIND,
  WORKSPACE_OPERATION_STATE_FILE_VERSION,
  type WorkspaceOperationState,
} from "@dpeek/formless-workspace";

import { formatCliWorkspaceOperationOutput } from "./cli-workspace-operation-formatter.ts";

describe("CLI workspace operation formatter", () => {
  it("prints the exact no-op output for pull and push without a runtime rebuild report", () => {
    for (const operation of ["pull", "push"] as const) {
      expect(
        formatCliWorkspaceOperationOutput(
          workspaceOperationState({
            operation,
            result: {
              details: {
                syncPlan: { changedAreas: [], status: "same" },
              },
              summary: {
                fields: {},
                title: "Operation complete",
              },
            },
            summary: {
              fields: {
                mode: "apply",
                noop: true,
              },
              title: "Workspace unchanged",
            },
          }),
        ),
      ).toBe("Everything up to date.");
    }
  });

  it("renders operation summaries, details, arrays, null values, and nested display values", () => {
    expect(
      formatCliWorkspaceOperationOutput(
        workspaceOperationState({
          operation: "pull",
          result: {
            details: {
              emptyList: [],
              removed: ["stale-app", null, "orphan-media"],
              selectedTarget: null,
              syncPlan: {
                changedAreas: ["apps", "media"],
                source: "instance.primary",
                status: "changes",
                target: "workspace",
              },
            },
            summary: {
              fields: {},
              title: "Operation complete",
            },
          },
          summary: {
            fields: {
              mode: "apply",
              noop: false,
              target: "instance.primary",
            },
            title: "Workspace pulled",
          },
        }),
      ),
    ).toBe(
      [
        "Workspace operation: pull (succeeded).",
        "Workspace source: layout-only manifest, storage snapshots, media payloads.",
        "Summary: Workspace pulled.",
        "mode: apply.",
        "noop: false.",
        "target: instance.primary.",
        "Details:",
        "emptyList: none.",
        "removed: stale-app, none, orphan-media.",
        "selectedTarget: none.",
        'syncPlan: {"changedAreas":["apps","media"],"source":"instance.primary","status":"changes","target":"workspace"}.',
      ].join("\n"),
    );
  });

  it("renders deployment execution summaries separately from operation details", () => {
    expect(
      formatCliWorkspaceOperationOutput(
        workspaceOperationState({
          operation: "push",
          result: {
            deployment: {
              deploymentUrl: "https://personal.dpeek.workers.dev",
              provider: "cloudflare",
              resources: ["worker", "route"],
            },
            details: {
              target: "instance.primary",
            },
            summary: {
              fields: {},
              title: "Operation complete",
            },
          },
          summary: {
            fields: {
              mode: "dry-run",
              noop: false,
            },
            title: "Workspace pushed",
          },
        }),
      ),
    ).toBe(
      [
        "Workspace operation: push (succeeded).",
        "Workspace source: layout-only manifest, storage snapshots, media payloads.",
        "Summary: Workspace pushed.",
        "mode: dry-run.",
        "noop: false.",
        "Details:",
        "target: instance.primary.",
        "Deployment execution summary:",
        "deploymentUrl: https://personal.dpeek.workers.dev.",
        "provider: cloudflare.",
        "resources: worker, route.",
      ].join("\n"),
    );
  });

  it("formats workspace operation labels for non-command operation kinds", () => {
    expect(
      formatCliWorkspaceOperationOutput(
        workspaceOperationState({
          operation: "credentialSetup",
        }),
      ),
    ).toContain("Workspace operation: credential setup (succeeded).");
    expect(
      formatCliWorkspaceOperationOutput(
        workspaceOperationState({
          operation: "deploymentRefresh",
        }),
      ),
    ).toContain("Workspace operation: deployment refresh (succeeded).");
  });
});

function workspaceOperationState(
  overrides: Partial<WorkspaceOperationState> = {},
): WorkspaceOperationState {
  return {
    actor: "cli",
    createdAt: "2026-06-25T00:00:00.000Z",
    errors: [],
    events: [],
    id: "operation_1",
    input: {},
    kind: WORKSPACE_OPERATION_STATE_FILE_KIND,
    logs: [],
    operation: "pull",
    result: {
      summary: {
        fields: {},
        title: "Operation complete",
      },
    },
    status: "succeeded",
    summary: {
      fields: {},
      title: "Operation complete",
    },
    updatedAt: "2026-06-25T00:00:00.000Z",
    version: WORKSPACE_OPERATION_STATE_FILE_VERSION,
    workspace: {
      label: "Workspace",
    },
    ...overrides,
  };
}
