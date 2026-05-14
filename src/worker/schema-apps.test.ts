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
    expect(site.sourceSchema.entities.block?.mutations.delete.enabled).toBe(true);
    expect(site.sourceSchema.entities.blockPlacement?.mutations.delete.enabled).toBe(false);
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
    expect(site.seedRecords.length).toBeGreaterThan(0);
    expect(site.seedRecords.every((record) => record.entity in site.sourceSchema.entities)).toBe(
      true,
    );

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
    const removedPlacementFields = ["visible", "variant"];

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

  it("loads Site source seed examples for slotted media and feature blocks", () => {
    const site = getWorkerSchemaAppDefinition("site");
    const valuesFor = (id: string) => site.seedRecords.find((record) => record.id === id)?.values;

    expect(valuesFor("rec_site_place_post_agents_primary_image")).toMatchObject({
      parent: "rec_site_content_post_shipped_schema",
      block: "rec_site_media_post_agents_primary",
      slot: "primaryImage",
    });
    expect(valuesFor("rec_site_place_post_schema_primary_image")).toMatchObject({
      parent: "rec_site_content_post_draft_notes",
      block: "rec_site_media_post_schema_primary",
      slot: "primaryImage",
    });
    expect(valuesFor("rec_site_place_project_opensurf_primary_image")).toMatchObject({
      parent: "rec_site_content_project_opensurf",
      block: "rec_site_media_project_opensurf_primary",
      slot: "primaryImage",
    });
    expect(valuesFor("rec_site_block_home_feature_agents")).toMatchObject({
      type: "feature",
      label: "Welcome, Humans and Agents",
      alignment: "right",
    });
    expect(valuesFor("rec_site_place_feature_agents_media")).toMatchObject({
      parent: "rec_site_block_home_feature_agents",
      block: "rec_site_media_home_feature_agents",
      slot: "media",
    });
    expect(valuesFor("rec_site_place_feature_agents_action")).toMatchObject({
      parent: "rec_site_block_home_feature_agents",
      block: "rec_site_link_home_feature_notes",
      slot: "actions",
    });
  });

  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
