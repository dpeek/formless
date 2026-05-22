import {
  findBundledAppPackage,
  validateAppInstallId,
  type AppInstallId,
  type PackageAppKey,
} from "./app-installs.ts";
import { findSchemaAppDefinition, getSchemaAppDefinition, type SchemaKey } from "./schema-apps.ts";

export type AppStorageIdentity = SchemaKeyStorageIdentity | InstalledAppStorageIdentity;

export type SchemaKeyStorageIdentity = {
  kind: "schemaKey";
  packageAppKey: PackageAppKey;
  sourceSchemaKey: SchemaKey;
  seedRecordsKey: SchemaKey;
  authorityName: SchemaKey;
  apiRoutePrefix: `/api/${SchemaKey}`;
  browserDatabaseName: string;
  broadcastChannelName: string;
  siteMedia?: SiteMediaStorageIdentity;
};

export type InstalledAppStorageIdentity = {
  kind: "appInstall";
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  sourceSchemaKey: SchemaKey;
  seedRecordsKey: SchemaKey;
  authorityName: `app:${AppInstallId}`;
  apiRoutePrefix: `/api/app-installs/${PackageAppKey}/${AppInstallId}`;
  browserDatabaseName: string;
  broadcastChannelName: string;
  siteMedia?: SiteMediaStorageIdentity;
};

export type SiteMediaStorageIdentity = {
  imageKeyPrefix: string;
  imageUploadPath: `/api/${string}/media/images`;
  routePrefix: `/api/${string}/media`;
};

export type AuthorityApiRoute = {
  identity: AppStorageIdentity;
  path: `/${string}`;
};

const browserStoragePrefix = "formless";
const installedAppAuthorityPrefix = "app";
const installedAppApiPrefix = "/api/app-installs";
const legacySiteImageKeyPrefix = "site/images";

export function schemaKeyStorageIdentity(
  schemaKey: SchemaKey,
  options: { projectId?: string } = {},
): SchemaKeyStorageIdentity {
  const app = getSchemaAppDefinition(schemaKey);
  const storageName = browserStorageName(schemaKey, options.projectId);

  return {
    kind: "schemaKey",
    packageAppKey: app.key,
    sourceSchemaKey: app.key,
    seedRecordsKey: app.key,
    authorityName: app.key,
    apiRoutePrefix: `/api/${app.key}`,
    browserDatabaseName: storageName,
    broadcastChannelName: storageName,
    ...(app.key === "site"
      ? {
          siteMedia: {
            imageKeyPrefix: legacySiteImageKeyPrefix,
            imageUploadPath: "/api/site/media/images",
            routePrefix: "/api/site/media",
          },
        }
      : {}),
  };
}

export function installedAppStorageIdentity(input: {
  installId: string;
  packageAppKey: string;
  projectId?: string;
}): InstalledAppStorageIdentity | undefined {
  const packageApp = findBundledAppPackage(input.packageAppKey);
  const installId = validateAppInstallId(input.installId);

  if (!packageApp || !installId.ok) {
    return undefined;
  }

  const storageName = browserStorageName(`app:${installId.installId}`, input.projectId);
  const apiRoutePrefix =
    `${installedAppApiPrefix}/${packageApp.packageAppKey}/${installId.installId}` as const;

  return {
    kind: "appInstall",
    installId: installId.installId,
    packageAppKey: packageApp.packageAppKey,
    sourceSchemaKey: packageApp.sourceSchemaKey,
    seedRecordsKey: packageApp.seedRecordsKey,
    authorityName: `${installedAppAuthorityPrefix}:${installId.installId}`,
    apiRoutePrefix,
    browserDatabaseName: storageName,
    broadcastChannelName: storageName,
    ...(packageApp.packageAppKey === "site"
      ? {
          siteMedia: {
            imageKeyPrefix: `app-installs/${installId.installId}/site/images`,
            imageUploadPath: `${apiRoutePrefix}/media/images`,
            routePrefix: `${apiRoutePrefix}/media`,
          },
        }
      : {}),
  };
}

export function parseAuthorityApiRoute(pathname: string): AuthorityApiRoute | undefined {
  return parseInstalledAppApiRoute(pathname) ?? parseSchemaKeyApiRoute(pathname);
}

function parseInstalledAppApiRoute(pathname: string): AuthorityApiRoute | undefined {
  const [apiSegment, appInstallsSegment, packageAppKey, installId, ...routeSegments] = pathname
    .split("/")
    .filter(Boolean);

  if (
    apiSegment !== "api" ||
    appInstallsSegment !== "app-installs" ||
    !packageAppKey ||
    !installId ||
    routeSegments.length === 0
  ) {
    return undefined;
  }

  const identity = installedAppStorageIdentity({ installId, packageAppKey });

  return identity ? { identity, path: `/${routeSegments.join("/")}` } : undefined;
}

function parseSchemaKeyApiRoute(pathname: string): AuthorityApiRoute | undefined {
  const [apiSegment, schemaKey, ...routeSegments] = pathname.split("/").filter(Boolean);

  if (apiSegment !== "api" || !schemaKey || routeSegments.length === 0) {
    return undefined;
  }

  const app = findSchemaAppDefinition(schemaKey);

  return app
    ? {
        identity: schemaKeyStorageIdentity(app.key),
        path: `/${routeSegments.join("/")}`,
      }
    : undefined;
}

function browserStorageName(identitySegment: string, projectId: string | undefined) {
  const normalizedProjectId = normalizeProjectStorageId(projectId);

  return normalizedProjectId
    ? `${browserStoragePrefix}:${normalizedProjectId}:${identitySegment}`
    : `${browserStoragePrefix}:${identitySegment}`;
}

function normalizeProjectStorageId(value: string | undefined): string | undefined {
  if (!value || !/^[A-Za-z0-9._-]+$/.test(value)) {
    return undefined;
  }

  return value;
}
