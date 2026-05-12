import { describe, expect, it } from "vite-plus/test";
import {
  findWorkerSchemaAppDefinition,
  getWorkerSchemaAppDefinition,
  workerSchemaApps,
} from "./schema-apps.ts";

describe("worker schema app definitions", () => {
  it("loads parsed source schemas for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const estii = getWorkerSchemaAppDefinition("estii");
    const site = getWorkerSchemaAppDefinition("site");

    expect(workerSchemaApps.map((app) => app.key)).toEqual(["tasks", "estii", "site"]);
    expect(tasks.sourceSchema.entities.task?.label).toBe("Task");
    expect(estii.sourceSchema.entities.rate?.label).toBe("Rate");
    expect(site.sourceSchema.entities.block?.label).toBe("Block");
    expect(site.sourceSchema.entities.blockPlacement?.label).toBe("Placement");
  });

  it("loads parsed seed records for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const estii = getWorkerSchemaAppDefinition("estii");
    const site = getWorkerSchemaAppDefinition("site");

    expect(tasks.seedRecords).toHaveLength(5);
    expect(tasks.seedRecords.every((record) => record.entity === "task")).toBe(true);
    expect(estii.seedRecords).toHaveLength(17);
    expect(new Set(estii.seedRecords.map((record) => record.entity))).toEqual(
      new Set(["card", "resource", "rate"]),
    );
    expect(site.seedRecords).toHaveLength(61);
    expect(new Set(site.seedRecords.map((record) => record.entity))).toEqual(
      new Set(["block", "blockPlacement"]),
    );
    expect(site.seedRecords.filter((record) => record.entity === "block")).toHaveLength(34);
    expect(site.seedRecords.filter((record) => record.entity === "blockPlacement")).toHaveLength(
      27,
    );
    expect(
      site.seedRecords
        .filter((record) => record.entity === "block" && record.values.type === "image")
        .map((record) => record.values.type),
    ).toContain("image");
    const siteBlockTypes = site.seedRecords
      .filter((record) => record.entity === "block")
      .map((record) => record.values.type);
    for (const removedType of ["contentList", "contentGrid", "video", "file", "cta", "subscribe"]) {
      expect(siteBlockTypes).not.toContain(removedType);
    }
  });

  it("keeps site source seed records on the first-release block fields", () => {
    const site = getWorkerSchemaAppDefinition("site");
    const removedBlockFields = [
      "title",
      "subtitle",
      "alt",
      "slug",
      "status",
      "publishedAt",
      "assetKey",
      "limit",
    ];
    const removedPlacementFields = ["slot", "visible", "variant"];

    for (const record of site.seedRecords) {
      const removedFields =
        record.entity === "block"
          ? removedBlockFields
          : record.entity === "blockPlacement"
            ? removedPlacementFields
            : [];

      for (const field of removedFields) {
        expect(record.values).not.toHaveProperty(field);
      }
    }
  });

  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
