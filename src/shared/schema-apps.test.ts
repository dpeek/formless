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
    expect(schemaApps.map((app) => app.key)).toEqual(["tasks", "rates"]);
    expect(schemaApps.map((app) => app.route)).toEqual(["/tasks", "/rates"]);
    expect(schemaApps.map((app) => app.schemaRoute)).toEqual(["/tasks/schema", "/rates/schema"]);
  });

  it("looks up app definitions by schema key and route", () => {
    expect(isSchemaKey("tasks")).toBe(true);
    expect(isSchemaKey("missing")).toBe(false);
    expect(getSchemaAppDefinition("tasks").label).toBe("Tasks");
    expect(findSchemaAppDefinition("rates")?.label).toBe("Rates");
    expect(findSchemaAppDefinition("missing")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/rates/schema")?.key).toBe("rates");
    expect(findSchemaAppDefinitionByRoute("/missing")).toBeUndefined();
  });
});
