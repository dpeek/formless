import { describe, expect, it } from "vite-plus/test";
import {
  findSchemaAppDefinition,
  findSchemaAppDefinitionByRoute,
  getSchemaAppDefinition,
  isSchemaKey,
  schemaAppScreenPathFromRoute,
  schemaAppScreenRoute,
  schemaApps,
} from "./schema-apps.ts";

describe("schema app definitions", () => {
  it("declares the first route-backed schema apps in order", () => {
    expect(schemaApps.map((app) => app.key)).toEqual(["tasks", "estii", "site", "crm"]);
    expect(schemaApps.map((app) => app.route)).toEqual(["/tasks", "/estii", "/site", "/crm"]);
    expect(schemaApps.map((app) => app.schemaRoute)).toEqual([
      "/tasks/schema",
      "/estii/schema",
      "/site/schema",
      "/crm/schema",
    ]);
  });

  it("looks up app definitions by schema key and route", () => {
    expect(isSchemaKey("tasks")).toBe(true);
    expect(isSchemaKey("missing")).toBe(false);
    expect(getSchemaAppDefinition("tasks").label).toBe("Tasks");
    expect(findSchemaAppDefinition("estii")?.label).toBe("Estii");
    expect(findSchemaAppDefinition("rates")).toBeUndefined();
    expect(findSchemaAppDefinition("site")?.label).toBe("Site");
    expect(findSchemaAppDefinition("crm")?.label).toBe("CRM");
    expect(findSchemaAppDefinition("missing")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/site")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/site/header")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/crm")?.key).toBe("crm");
    expect(findSchemaAppDefinitionByRoute("/crm/audiences")?.key).toBe("crm");
    expect(findSchemaAppDefinitionByRoute("/crm/schema")?.key).toBe("crm");
    expect(findSchemaAppDefinitionByRoute("/cleartrace")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/cleartrace/orders")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/cleartrace/schema")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/estii/setup")?.key).toBe("estii");
    expect(findSchemaAppDefinitionByRoute("/estii/schema")?.key).toBe("estii");
    expect(findSchemaAppDefinitionByRoute("/rates/schema")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/site/schema")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/missing")).toBeUndefined();
  });

  it("maps app-relative screen paths to browser routes", () => {
    const estii = getSchemaAppDefinition("estii");

    expect(schemaAppScreenRoute(estii, "/")).toBe("/estii");
    expect(schemaAppScreenRoute(estii, "/setup")).toBe("/estii/setup");
    expect(schemaAppScreenPathFromRoute(estii, "/estii")).toBe("/");
    expect(schemaAppScreenPathFromRoute(estii, "/estii/setup")).toBe("/setup");
    expect(schemaAppScreenPathFromRoute(estii, "/estii/schema")).toBeUndefined();
    expect(schemaAppScreenPathFromRoute(estii, "/tasks")).toBeUndefined();
  });
});
