import { describe, expect, it } from "vite-plus/test";
import {
  findSchemaAppDefinition,
  findSchemaAppDefinitionByRoute,
  getSchemaAppDefinition,
  isSchemaKey,
  schemaApps,
} from "./schema-apps.ts";

describe("schema app definitions", () => {
  it("declares the first route-backed schema apps in order", () => {
    expect(schemaApps.map((app) => app.key)).toEqual(["tasks", "estii", "site"]);
    expect(schemaApps.map((app) => app.route)).toEqual(["/tasks", "/estii", "/site"]);
    expect(schemaApps.map((app) => app.schemaRoute)).toEqual([
      "/tasks/schema",
      "/estii/schema",
      "/site/schema",
    ]);
  });

  it("looks up app definitions by schema key and route", () => {
    expect(isSchemaKey("tasks")).toBe(true);
    expect(isSchemaKey("missing")).toBe(false);
    expect(getSchemaAppDefinition("tasks").label).toBe("Tasks");
    expect(findSchemaAppDefinition("estii")?.label).toBe("Estii");
    expect(findSchemaAppDefinition("rates")).toBeUndefined();
    expect(findSchemaAppDefinition("site")?.label).toBe("Site");
    expect(findSchemaAppDefinition("missing")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/site")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/estii/schema")?.key).toBe("estii");
    expect(findSchemaAppDefinitionByRoute("/rates/schema")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/site/schema")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/missing")).toBeUndefined();
  });
});
