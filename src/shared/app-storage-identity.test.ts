import { describe, expect, it } from "vite-plus/test";
import {
  installedAppStorageIdentity,
  parseAuthorityApiRoute,
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
      siteMedia: {
        imageKeyPrefix: "site/images",
        imageUploadPath: "/api/site/media/images",
        routePrefix: "/api/site/media",
      },
      sourceSchemaKey: "site",
    });
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
      siteMedia: {
        imageKeyPrefix: "app-installs/personal/site/images",
        imageUploadPath: "/api/app-installs/site/personal/media/images",
        routePrefix: "/api/app-installs/site/personal/media",
      },
      sourceSchemaKey: "site",
    });
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
    expect(personal.siteMedia?.imageKeyPrefix).not.toBe(docs.siteMedia?.imageKeyPrefix);
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
