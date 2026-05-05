import { describe, expect, it } from "vite-plus/test";
import {
  findWorkerSchemaAppDefinition,
  getWorkerSchemaAppDefinition,
  workerSchemaApps,
} from "./schema-apps.ts";

describe("worker schema app definitions", () => {
  it("loads parsed source schemas for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const rates = getWorkerSchemaAppDefinition("rates");

    expect(workerSchemaApps.map((app) => app.key)).toEqual(["tasks", "rates"]);
    expect(tasks.sourceSchema.entities.task?.label).toBe("Task");
    expect(rates.sourceSchema.entities.rate?.label).toBe("Rate");
  });

  it("loads parsed seed records for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const rates = getWorkerSchemaAppDefinition("rates");

    expect(tasks.seedRecords).toHaveLength(5);
    expect(tasks.seedRecords.every((record) => record.entity === "task")).toBe(true);
    expect(rates.seedRecords).toHaveLength(17);
    expect(new Set(rates.seedRecords.map((record) => record.entity))).toEqual(
      new Set(["card", "resource", "rate"]),
    );
  });

  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
