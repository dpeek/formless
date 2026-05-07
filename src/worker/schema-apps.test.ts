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
    expect(site.sourceSchema.entities.blockPlacement?.label).toBe("Block placement");
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
    expect(site.seedRecords).toHaveLength(48);
    expect(new Set(site.seedRecords.map((record) => record.entity))).toEqual(
      new Set(["block", "blockPlacement"]),
    );
    expect(site.seedRecords.filter((record) => record.entity === "block")).toHaveLength(28);
    expect(site.seedRecords.filter((record) => record.entity === "blockPlacement")).toHaveLength(
      20,
    );
    expect(
      site.seedRecords
        .filter(
          (record) =>
            record.entity === "block" && ["image", "video"].includes(String(record.values.type)),
        )
        .map((record) => record.values.type),
    ).toEqual(["image", "video"]);
  });

  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
