import { describe, expect, it } from "vite-plus/test";

import {
  DEPLOY_CONTROL_PLANE_ACTOR_HEADER,
  deployControlPlaneActorHeaders,
  deployControlPlaneBootstrapPath,
  deployControlPlaneRecordsByEntity,
  deployDesiredStateVersionRef,
  type DeployControlPlaneRecord,
} from "./client.ts";

describe("Deploy control-plane client helpers", () => {
  it("builds actor-scoped control-plane bootstrap requests", () => {
    expect(deployControlPlaneBootstrapPath()).toBe("/api/formless/control-plane/bootstrap");
    expect(deployControlPlaneBootstrapPath("runner")).toBe(
      "/api/formless/control-plane/bootstrap?actorKind=runner",
    );
    expect(deployControlPlaneActorHeaders("cliDeployer")).toEqual({
      [DEPLOY_CONTROL_PLANE_ACTOR_HEADER]: "cliDeployer",
    });
  });

  it("filters active control-plane records by entity", () => {
    const records = [
      { entity: "appInstall", id: "site", values: {} },
      { entity: "appRoute", id: "site-admin", values: {} },
      { deletedAt: "2026-05-31T00:00:00.000Z", entity: "appRoute", id: "old", values: {} },
    ] satisfies DeployControlPlaneRecord[];

    expect(
      deployControlPlaneRecordsByEntity(records, "appRoute").map((record) => record.id),
    ).toEqual(["site-admin"]);
  });

  it("binds command inputs to an exact desired-state version reference", () => {
    expect(
      deployDesiredStateVersionRef({
        createdAt: "2026-06-01T00:00:00.000Z",
        hash: `sha256:${"a".repeat(64)}`,
        revision: 7,
        targetId: "instance.primary",
        versionId: "desired.instance.primary.7",
      }),
    ).toEqual({
      hash: `sha256:${"a".repeat(64)}`,
      revision: 7,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.7",
    });
  });
});
