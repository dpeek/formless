import { describe, expect, it } from "vite-plus/test";
import { runtimeProfileKinds } from "../shared/runtime-topology.ts";
import {
  applicationPresentationSurfaceOwnership,
  productionRoutePresentationMatrix,
  type ApplicationPresentationSurface,
} from "./application-presentation-conformance.ts";

const expectedSurfaces = [
  "accessManagement",
  "accountAuth",
  "applicationShell",
  "applicationSystemState",
  "collaboratorInvitationAuth",
  "create",
  "documentTheme",
  "field",
  "generatedWorkspace",
  "instanceManagement",
  "listResult",
  "operation",
  "ownerAuth",
  "publicSitePage",
  "publicSiteSystemState",
  "recordResult",
  "tableResult",
  "treeResult",
] as const satisfies readonly ApplicationPresentationSurface[];

describe("application presentation conformance matrix", () => {
  it("names every production profile and presentation surface", () => {
    expect(
      Array.from(new Set(productionRoutePresentationMatrix.flatMap((row) => row.profiles))).sort(),
    ).toEqual([...runtimeProfileKinds].sort());
    expect(applicationPresentationSurfaceOwnership.map(({ surface }) => surface).sort()).toEqual(
      [...expectedSurfaces].sort(),
    );
    expect(
      new Set(applicationPresentationSurfaceOwnership.map(({ surface }) => surface)).size,
    ).toBe(applicationPresentationSurfaceOwnership.length);
  });

  it("maps every routed surface to exactly one current host owner", () => {
    const ownership = new Map(
      applicationPresentationSurfaceOwnership.map((entry) => [entry.surface, entry]),
    );

    for (const row of productionRoutePresentationMatrix) {
      expect(row.profiles.length, row.id).toBeGreaterThan(0);
      expect(row.surfaces.length, row.id).toBeGreaterThan(0);
      for (const surface of row.surfaces) {
        expect(ownership.get(surface), `${row.id}:${surface}`).toBeDefined();
      }
    }

    expect(ownership.get("publicSitePage")?.hostOwner).toBe("publicSiteRuntime");
    expect(ownership.get("publicSiteSystemState")?.hostOwner).toBe("publicSiteRuntime");
    expect(ownership.get("applicationSystemState")?.hostOwner).toBe(
      "applicationSystemStateRuntime",
    );
  });

  it("keeps public Site routes isolated from the application contract host", () => {
    const publicRows = productionRoutePresentationMatrix.filter((row) =>
      row.surfaces.includes("publicSitePage"),
    );

    expect(publicRows.length).toBeGreaterThan(0);
    expect(publicRows.every((row) => row.shell === "none")).toBe(true);
    expect(
      publicRows.every((row) =>
        row.surfaces.every(
          (surface) =>
            applicationPresentationSurfaceOwnership.find((entry) => entry.surface === surface)
              ?.hostOwner === "publicSiteRuntime",
        ),
      ),
    ).toBe(true);
  });

  it("keeps the instance missing route outside the application shell", () => {
    expect(productionRoutePresentationMatrix.find(({ id }) => id === "instance-missing")).toEqual({
      id: "instance-missing",
      profiles: ["instance"],
      routeFamily: "unmatched instance paths",
      shell: "none",
      surfaces: ["applicationSystemState"],
    });
  });
});
