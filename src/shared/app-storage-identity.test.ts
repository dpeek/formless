import { describe, expect, it } from "vite-plus/test";
import {
  instanceControlPlaneStorageIdentity,
  installedAppStorageIdentity,
  parseAuthorityApiRoute,
  parseInstanceControlPlaneApiRoute,
  schemaKeyStorageIdentity,
} from "./app-storage-identity.ts";

describe("app storage identity", () => {
  it("preserves legacy schema-key storage and route names", () => {
    expect(schemaKeyStorageIdentity("tasks")).toMatchObject({
      apiRoutePrefix: "/api/tasks",
      authorityName: "tasks",
      broadcastChannelName: "formless:tasks",
      browserDatabaseName: "formless:tasks",
      kind: "schemaKey",
      packageAppKey: "tasks",
      seedRecordsKey: "tasks",
      sourceSchemaKey: "tasks",
    });
    expect(schemaKeyStorageIdentity("site")).toMatchObject({
      apiRoutePrefix: "/api/site",
      authorityName: "site",
      broadcastChannelName: "formless:site",
      browserDatabaseName: "formless:site",
      kind: "schemaKey",
      packageAppKey: "site",
      seedRecordsKey: "site",
      sourceSchemaKey: "site",
    });
    expect(schemaKeyStorageIdentity("site")).not.toHaveProperty("siteMedia");
    expect(schemaKeyStorageIdentity("site", { projectId: "project-123" })).toMatchObject({
      broadcastChannelName: "formless:project-123:site",
      browserDatabaseName: "formless:project-123:site",
    });
    expect(schemaKeyStorageIdentity("site", { projectId: "../project" })).toMatchObject({
      broadcastChannelName: "formless:site",
      browserDatabaseName: "formless:site",
    });
  });

  it("maps an installed Site to install-scoped storage names and API paths", () => {
    expect(
      installedAppStorageIdentity({
        installId: "personal",
        packageAppKey: "site",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/site/personal",
      authorityName: "app:personal",
      broadcastChannelName: "formless:app:personal",
      browserDatabaseName: "formless:app:personal",
      installId: "personal",
      kind: "appInstall",
      packageAppKey: "site",
      seedRecordsKey: "site",
      sourceSchemaKey: "site",
    });
    expect(
      installedAppStorageIdentity({
        installId: "personal",
        packageAppKey: "site",
      }),
    ).not.toHaveProperty("siteMedia");
    expect(
      installedAppStorageIdentity({
        installId: "personal",
        packageAppKey: "site",
        projectId: "instance-123",
      }),
    ).toMatchObject({
      broadcastChannelName: "formless:instance-123:app:personal",
      browserDatabaseName: "formless:instance-123:app:personal",
    });
  });

  it("maps installed non-Site apps without Site media facts", () => {
    expect(
      installedAppStorageIdentity({
        installId: "tasks",
        packageAppKey: "tasks",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/tasks/tasks",
      authorityName: "app:tasks",
      broadcastChannelName: "formless:app:tasks",
      browserDatabaseName: "formless:app:tasks",
      installId: "tasks",
      kind: "appInstall",
      packageAppKey: "tasks",
      seedRecordsKey: "tasks",
      sourceSchemaKey: "tasks",
    });
    expect(
      installedAppStorageIdentity({
        installId: "estii",
        packageAppKey: "estii",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/estii/estii",
      authorityName: "app:estii",
      broadcastChannelName: "formless:app:estii",
      browserDatabaseName: "formless:app:estii",
      installId: "estii",
      kind: "appInstall",
      packageAppKey: "estii",
      seedRecordsKey: "estii",
      sourceSchemaKey: "estii",
    });
    expect(
      installedAppStorageIdentity({
        installId: "crm",
        packageAppKey: "crm",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/crm/crm",
      authorityName: "app:crm",
      broadcastChannelName: "formless:app:crm",
      browserDatabaseName: "formless:app:crm",
      installId: "crm",
      kind: "appInstall",
      packageAppKey: "crm",
      seedRecordsKey: "crm",
      sourceSchemaKey: "crm",
    });
    expect(
      installedAppStorageIdentity({
        installId: "cleartrace",
        packageAppKey: "cleartrace",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/cleartrace/cleartrace",
      authorityName: "app:cleartrace",
      broadcastChannelName: "formless:app:cleartrace",
      browserDatabaseName: "formless:app:cleartrace",
      installId: "cleartrace",
      kind: "appInstall",
      packageAppKey: "cleartrace",
      seedRecordsKey: "cleartrace",
      sourceSchemaKey: "cleartrace",
    });
  });

  it("accepts default Site install identity and rejects invalid identities", () => {
    expect(installedAppStorageIdentity({ installId: "site", packageAppKey: "site" })).toMatchObject(
      {
        apiRoutePrefix: "/api/app-installs/site/site",
        authorityName: "app:site",
        browserDatabaseName: "formless:app:site",
        installId: "site",
        kind: "appInstall",
      },
    );
    expect(installedAppStorageIdentity({ installId: "Docs", packageAppKey: "site" })).toBe(
      undefined,
    );
    expect(installedAppStorageIdentity({ installId: "estii", packageAppKey: "missing" })).toBe(
      undefined,
    );
  });

  it("keeps installed app identity separate from legacy schema identity", () => {
    const legacySite = schemaKeyStorageIdentity("site");
    const personal = installedAppStorageIdentity({
      installId: "personal",
      packageAppKey: "site",
    });
    const docs = installedAppStorageIdentity({ installId: "docs", packageAppKey: "site" });

    expect(personal).toBeDefined();
    expect(docs).toBeDefined();

    if (!personal || !docs) {
      throw new Error("Expected installed Site identities.");
    }

    expect(personal.authorityName).not.toBe(legacySite.authorityName);
    expect(personal.authorityName).not.toBe(docs.authorityName);
    expect(personal.browserDatabaseName).not.toBe(docs.browserDatabaseName);
    expect(personal.broadcastChannelName).not.toBe(docs.broadcastChannelName);
  });

  it("maps the runtime-owned instance control-plane storage identity", () => {
    expect(instanceControlPlaneStorageIdentity()).toEqual({
      apiRoutePrefix: "/api/formless/control-plane",
      authorityName: "instance:control-plane",
      broadcastChannelName: "formless:instance:control-plane",
      browserDatabaseName: "formless:instance:control-plane",
      kind: "instanceControlPlane",
      schemaKey: "instance-control-plane",
    });
    expect(instanceControlPlaneStorageIdentity({ projectId: "instance-123" })).toMatchObject({
      broadcastChannelName: "formless:instance-123:instance:control-plane",
      browserDatabaseName: "formless:instance-123:instance:control-plane",
    });
  });

  it("exposes no Site-owned media scope on storage identities", () => {
    const schemaSite = schemaKeyStorageIdentity("site");
    const personal = installedAppStorageIdentity({
      installId: "personal",
      packageAppKey: "site",
    });
    const tasks = installedAppStorageIdentity({ installId: "tasks", packageAppKey: "tasks" });

    expect(schemaSite).not.toHaveProperty("imageKeyPrefix");
    expect(schemaSite).not.toHaveProperty("imageUploadPath");
    expect(schemaSite).not.toHaveProperty("routePrefix");
    expect(personal).not.toHaveProperty("imageKeyPrefix");
    expect(personal).not.toHaveProperty("imageUploadPath");
    expect(personal).not.toHaveProperty("routePrefix");
    expect(tasks).not.toHaveProperty("imageKeyPrefix");
    expect(tasks).not.toHaveProperty("imageUploadPath");
    expect(tasks).not.toHaveProperty("routePrefix");
    expect(JSON.stringify([schemaSite, personal, tasks])).not.toContain("site/images");
    expect(JSON.stringify([schemaSite, personal, tasks])).not.toContain("/media");
  });

  it("parses legacy and installed app API route identities", () => {
    expect(parseAuthorityApiRoute("/api/site/bootstrap")).toMatchObject({
      identity: {
        authorityName: "site",
        kind: "schemaKey",
        packageAppKey: "site",
      },
      path: "/bootstrap",
    });
    expect(
      parseAuthorityApiRoute("/api/app-installs/site/personal/tree/blog%2Fpost"),
    ).toMatchObject({
      identity: {
        authorityName: "app:personal",
        installId: "personal",
        kind: "appInstall",
        packageAppKey: "site",
      },
      path: "/tree/blog%2Fpost",
    });
    expect(parseAuthorityApiRoute("/api/app-installs/site/site/bootstrap")).toMatchObject({
      identity: {
        authorityName: "app:site",
        installId: "site",
        kind: "appInstall",
        packageAppKey: "site",
      },
      path: "/bootstrap",
    });
    expect(parseAuthorityApiRoute("/api/app-installs/tasks/tasks/bootstrap")).toMatchObject({
      identity: {
        authorityName: "app:tasks",
        installId: "tasks",
        kind: "appInstall",
        packageAppKey: "tasks",
      },
      path: "/bootstrap",
    });
    expect(parseAuthorityApiRoute("/api/app-installs/estii/estii/bootstrap")).toMatchObject({
      identity: {
        authorityName: "app:estii",
        installId: "estii",
        kind: "appInstall",
        packageAppKey: "estii",
      },
      path: "/bootstrap",
    });
    expect(
      parseAuthorityApiRoute("/api/app-installs/cleartrace/cleartrace/bootstrap"),
    ).toMatchObject({
      identity: {
        authorityName: "app:cleartrace",
        installId: "cleartrace",
        kind: "appInstall",
        packageAppKey: "cleartrace",
      },
      path: "/bootstrap",
    });
  });

  it("parses instance control-plane API route identities separately from app storage routes", () => {
    expect(parseInstanceControlPlaneApiRoute("/api/formless/control-plane/bootstrap")).toEqual({
      identity: instanceControlPlaneStorageIdentity(),
      path: "/bootstrap",
    });
    expect(
      parseInstanceControlPlaneApiRoute("/api/formless/control-plane/actions/createAppInstall"),
    ).toEqual({
      identity: instanceControlPlaneStorageIdentity(),
      path: "/actions/createAppInstall",
    });
    expect(parseAuthorityApiRoute("/api/formless/control-plane/bootstrap")).toBeUndefined();
  });

  it("leaves unknown or incomplete API routes unclaimed", () => {
    for (const pathname of [
      "/api",
      "/api/site",
      "/api/missing/bootstrap",
      "/api/app-installs/site/personal",
      "/api/app-installs/missing/estii/bootstrap",
    ]) {
      expect(parseAuthorityApiRoute(pathname)).toBeUndefined();
    }
  });
});
