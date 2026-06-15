import { describe, expect, it } from "vite-plus/test";
import {
  findWorkerSchemaAppDefinition,
  getWorkerSchemaAppDefinition,
  workerSchemaApps,
} from "./schema-apps.ts";

describe("worker schema app definitions", () => {
  it("loads parsed source schemas for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const site = getWorkerSchemaAppDefinition("site");
    const crm = getWorkerSchemaAppDefinition("crm");

    expect(workerSchemaApps.map((app) => app.key)).toEqual(["tasks", "site", "crm"]);
    expect(tasks.sourceSchema.entities.task?.label).toBe("Task");
    expect(site.sourceSchema.entities.site?.label).toBe("Site");
    expect(crm.sourceSchema.entities.contact?.label).toBe("Contact");
    expect(crm.sourceSchema.entities.subscription?.label).toBe("Subscription");
    expect(site.sourceSchema.entities.block?.label).toBe("Block");
    expect(site.sourceSchema.entities["block-placement"]?.label).toBe("Placement");
    expect(site.sourceSchema.entities.site?.mutations.create.enabled).toBe(false);
    expect(site.sourceSchema.entities.site?.mutations.patch.enabled).toBe(true);
    expect(site.sourceSchema.entities.site?.mutations.delete.enabled).toBe(false);
    expect(site.sourceSchema.entities.block?.mutations.delete.enabled).toBe(true);
    expect(site.sourceSchema.entities["block-placement"]?.mutations.delete.enabled).toBe(false);
  });

  it("loads parsed seed records for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const site = getWorkerSchemaAppDefinition("site");
    const crm = getWorkerSchemaAppDefinition("crm");

    expect(tasks.seedRecords).toHaveLength(5);
    expect(tasks.seedRecords.every((record) => record.entity === "task")).toBe(true);
    expect(site.seedRecords.filter((record) => record.entity === "site")).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          key: "primary",
        }),
      }),
    ]);
    expect(site.seedRecords.length).toBeGreaterThan(0);
    expect(site.seedRecords.every((record) => record.entity in site.sourceSchema.entities)).toBe(
      true,
    );
    expect(crm.seedRecords).toHaveLength(21);
    expect(new Set(crm.seedRecords.map((record) => record.entity))).toEqual(
      new Set([
        "audience",
        "broadcast",
        "broadcast-recipient",
        "campaign",
        "campaign-message",
        "company",
        "contact",
        "delivery-event",
        "email-address",
        "subscription",
      ]),
    );
    expect(crm.seedRecords.every((record) => record.entity in crm.sourceSchema.entities)).toBe(
      true,
    );
  });

  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
