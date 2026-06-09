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
    const crm = getWorkerSchemaAppDefinition("crm");
    const cleartrace = getWorkerSchemaAppDefinition("cleartrace");

    expect(workerSchemaApps.map((app) => app.key)).toEqual([
      "tasks",
      "estii",
      "site",
      "crm",
      "cleartrace",
    ]);
    expect(tasks.sourceSchema.entities.task?.label).toBe("Task");
    expect(estii.sourceSchema.entities.rate?.label).toBe("Rate");
    expect(site.sourceSchema.entities.site?.label).toBe("Site");
    expect(crm.sourceSchema.entities.contact?.label).toBe("Contact");
    expect(crm.sourceSchema.entities.subscription?.label).toBe("Subscription");
    expect(cleartrace.sourceSchema.entities.order?.label).toBe("Order");
    expect(cleartrace.sourceSchema.entities.sample?.label).toBe("Sample");
    expect(cleartrace.sourceSchema.entities["verification-record"]?.label).toBe(
      "Verification record",
    );
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
    const estii = getWorkerSchemaAppDefinition("estii");
    const site = getWorkerSchemaAppDefinition("site");
    const crm = getWorkerSchemaAppDefinition("crm");
    const cleartrace = getWorkerSchemaAppDefinition("cleartrace");

    expect(tasks.seedRecords).toHaveLength(5);
    expect(tasks.seedRecords.every((record) => record.entity === "task")).toBe(true);
    expect(estii.seedRecords).toHaveLength(17);
    expect(new Set(estii.seedRecords.map((record) => record.entity))).toEqual(
      new Set(["card", "resource", "rate"]),
    );
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
    expect(cleartrace.seedRecords).toHaveLength(17);
    expect(new Set(cleartrace.seedRecords.map((record) => record.entity))).toEqual(
      new Set([
        "analyte",
        "app-config",
        "audit-event",
        "customer",
        "method",
        "order",
        "order-line",
        "package-item",
        "report",
        "report-version",
        "result",
        "sample",
        "service-catalog-item",
        "test-package",
        "test-request",
        "verification-record",
        "work-item",
      ]),
    );
    expect(
      cleartrace.seedRecords.every((record) => record.entity in cleartrace.sourceSchema.entities),
    ).toBe(true);
  });

  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
