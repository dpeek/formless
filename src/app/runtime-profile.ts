import {
  defaultSchemaKey,
  findSchemaAppDefinition,
  getSchemaAppDefinition,
  schemaApps,
  type SchemaAppDefinition,
  type SchemaKey,
} from "../shared/schema-apps.ts";
import {
  installedAppStorageIdentity,
  type AppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { AppInstall } from "../shared/app-installs.ts";

export type RuntimeProfileKind = "instance" | "dev" | "app" | "siteAuthoring" | "publishedSite";

export type RuntimeShellKind = "instance" | "dev" | "app" | "publishedSite";

export type RuntimeWorldMount = {
  app: SchemaAppDefinition;
  generatedRoutes: boolean;
  route: `/${string}`;
  schemaRoute?: `/${string}`;
  target?: AppStorageIdentity;
};

export type RuntimeInstalledAppRoutes = {
  appRouteBase: "/apps";
  schemaRoutes: boolean;
};

export type RuntimeInstalledSitePublicRoutes = {
  homeSlug: "home";
  packageAppKey: "site";
  siteRouteBase: "/sites";
};

export type RuntimeInstalledSitePublicSurface = {
  routeBase: `/sites/${string}`;
  slug: string;
  target: AppStorageIdentity;
};

export type RuntimeInstalledAppRouteContext = {
  appInstalls?: readonly AppInstall[] | undefined;
};

export type RuntimePublicSitePreviewLinkMode = "preview" | "authoring";

export type RuntimePublicSitePreview = {
  rootRoute: `/${string}`;
  routePattern: `/${string}`;
  homeRoute?: `/${string}`;
  homeSlug: string;
  linkMode: RuntimePublicSitePreviewLinkMode;
};

export type RuntimePublishedSiteRoutes = {
  rootRoute: "/";
  routePattern: "/*";
  homeSlug: "home";
};

export type RuntimeLocalPublishBroker = {
  endpoint: string;
  token: string;
};

export type RuntimeProfile = {
  kind: RuntimeProfileKind;
  shell: RuntimeShellKind;
  worlds: readonly RuntimeWorldMount[];
  defaultRedirect?: `/${string}`;
  instanceShell?: boolean;
  installedAppRoutes?: RuntimeInstalledAppRoutes;
  installedSitePublicRoutes?: RuntimeInstalledSitePublicRoutes;
  localPublish?: RuntimeLocalPublishBroker;
  publicSitePreview?: RuntimePublicSitePreview;
  publishedSite?: RuntimePublishedSiteRoutes;
};

export type RuntimeRoutePolicy = {
  installedAppBrowserRoutes: boolean;
  installedSitePublicRoutes: boolean;
  schemaKeyApiRoutes: boolean;
  schemaKeyBrowserRoutes: boolean;
};

export type RuntimeProfileResolverInput = {
  profile?: string | undefined;
  schemaKey?: string | undefined;
  hostname?: string | undefined;
};

export type SiteAuthoringRuntimeProfileOptions = {
  exposeSchemaRoute?: boolean;
  localPublish?: RuntimeLocalPublishBroker;
};

export const FORMLESS_RUNTIME_PROFILE_META_NAME = "formless-runtime-profile";

type RuntimeProfileHintDocument = {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
};

export function resolveRuntimeProfile(
  input: RuntimeProfileResolverInput = browserRuntimeProfileConfig(),
): RuntimeProfile {
  const profileKind =
    parseRuntimeProfileKind(input.profile) ?? runtimeProfileKindFromHost(input.hostname) ?? "dev";
  const schemaKey = parseSchemaKey(input.schemaKey) ?? defaultSchemaKey;

  switch (profileKind) {
    case "instance":
      return createInstanceRuntimeProfile();
    case "app":
      return createAppRuntimeProfile(schemaKey);
    case "siteAuthoring":
      return createSiteAuthoringRuntimeProfile({
        localPublish: browserLocalPublishBrokerConfig(),
      });
    case "publishedSite":
      return createPublishedSiteRuntimeProfile();
    case "dev":
      return createDevRuntimeProfile();
  }
}

export function createInstanceRuntimeProfile(): RuntimeProfile {
  return {
    kind: "instance",
    shell: "instance",
    worlds: [],
    instanceShell: true,
    installedAppRoutes: {
      appRouteBase: "/apps",
      schemaRoutes: false,
    },
    installedSitePublicRoutes: {
      homeSlug: "home",
      packageAppKey: "site",
      siteRouteBase: "/sites",
    },
  };
}

export function createDevRuntimeProfile(): RuntimeProfile {
  return createDevWorkbenchRuntimeProfile();
}

export function createDevWorkbenchRuntimeProfile(): RuntimeProfile {
  return {
    kind: "dev",
    shell: "dev",
    worlds: schemaApps.map((app) => ({
      app,
      generatedRoutes: true,
      route: app.route,
      schemaRoute: app.schemaRoute,
    })),
    instanceShell: true,
    installedAppRoutes: {
      appRouteBase: "/apps",
      schemaRoutes: true,
    },
    installedSitePublicRoutes: {
      homeSlug: "home",
      packageAppKey: "site",
      siteRouteBase: "/sites",
    },
    publicSitePreview: {
      rootRoute: "/pages",
      routePattern: "/pages/*",
      homeRoute: "/pages/home",
      homeSlug: "home",
      linkMode: "preview",
    },
  };
}

export function runtimeRoutePolicy(profile: RuntimeProfile): RuntimeRoutePolicy {
  return {
    installedAppBrowserRoutes: profile.installedAppRoutes !== undefined,
    installedSitePublicRoutes: profile.installedSitePublicRoutes !== undefined,
    schemaKeyApiRoutes: profile.kind !== "instance",
    schemaKeyBrowserRoutes: profile.kind === "dev",
  };
}

export function createAppRuntimeProfile(schemaKey: SchemaKey = defaultSchemaKey): RuntimeProfile {
  const app = getSchemaAppDefinition(schemaKey);

  return {
    kind: "app",
    shell: "app",
    worlds: [
      {
        app,
        generatedRoutes: true,
        route: "/",
        schemaRoute: "/schema",
      },
    ],
  };
}

export function createSiteAuthoringRuntimeProfile(
  options: SiteAuthoringRuntimeProfileOptions = {},
): RuntimeProfile {
  return {
    kind: "siteAuthoring",
    shell: "app",
    worlds: [
      {
        app: getSchemaAppDefinition("site"),
        generatedRoutes: true,
        route: "/admin",
        schemaRoute: options.exposeSchemaRoute ? "/admin/schema" : undefined,
      },
    ],
    localPublish: options.localPublish,
    publicSitePreview: {
      rootRoute: "/",
      routePattern: "/*",
      homeSlug: "home",
      linkMode: "authoring",
    },
  };
}

export function createPublishedSiteRuntimeProfile(): RuntimeProfile {
  return {
    kind: "publishedSite",
    shell: "publishedSite",
    worlds: [
      {
        app: getSchemaAppDefinition("site"),
        generatedRoutes: false,
        route: "/",
      },
    ],
    publishedSite: {
      rootRoute: "/",
      routePattern: "/*",
      homeSlug: "home",
    },
  };
}

export function findRuntimeWorldMountByRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeWorldMount | undefined {
  return (
    profile.worlds
      .filter(hasGeneratedRoutes)
      .find(
        (world) => world.schemaRoute === pathname || runtimeScreenPathFromRoute(world, pathname),
      ) ?? installedAppWorldMountFromRoute(profile, pathname, context)
  );
}

export function hasGeneratedRoutes(world: RuntimeWorldMount): boolean {
  return world.generatedRoutes;
}

export function isRuntimePublicSiteRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): boolean {
  if (installedSitePublicSurfaceFromRoute(profile, pathname, context)) {
    return true;
  }

  const preview = profile.publicSitePreview;

  if (!preview || findRuntimeWorldMountByRoute(profile, pathname, context)) {
    return false;
  }

  return Boolean(
    pathname === preview.rootRoute ||
    (preview.rootRoute === "/"
      ? pathname.startsWith("/")
      : pathname.startsWith(`${preview.rootRoute}/`)),
  );
}

export function installedSitePublicSurfaceFromRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeInstalledSitePublicSurface | undefined {
  const routes = profile.installedSitePublicRoutes;

  if (!routes) {
    return undefined;
  }

  const [firstSegment, installId, ...slugSegments] = pathname.split("/").filter(Boolean);

  if (`/${firstSegment}` !== routes.siteRouteBase || !installId) {
    return undefined;
  }

  const install = findInstalledAppByInstallId(context.appInstalls, installId);

  if (!install || install.packageAppKey !== routes.packageAppKey) {
    return undefined;
  }

  const target = installedAppStorageIdentity({
    installId: install.installId,
    packageAppKey: install.packageAppKey,
  });

  if (!target) {
    return undefined;
  }

  return {
    routeBase: `${routes.siteRouteBase}/${target.installId}` as `/sites/${string}`,
    slug: slugSegments.length === 0 ? routes.homeSlug : slugSegments.join("/"),
    target,
  };
}

export function runtimeScreenRoute(world: RuntimeWorldMount, screenPath: string): `/${string}` {
  if (screenPath === "/") {
    return world.route;
  }

  return world.route === "/"
    ? (screenPath as `/${string}`)
    : (`${world.route}${screenPath}` as const);
}

export function runtimeScreenPathFromRoute(
  world: RuntimeWorldMount,
  pathname: string,
): string | undefined {
  if (world.schemaRoute === pathname) {
    return undefined;
  }

  if (pathname === world.route) {
    return "/";
  }

  if (world.route === "/") {
    return pathname.startsWith("/") ? pathname : undefined;
  }

  const routePrefix = `${world.route}/`;

  return pathname.startsWith(routePrefix) ? pathname.slice(world.route.length) : undefined;
}

export function installedAppWorldMountFromInstallId(
  profile: RuntimeProfile,
  installId: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeWorldMount | undefined {
  const install = findInstalledAppByInstallId(context.appInstalls, installId);

  return install ? installedAppWorldMountFromInstall(profile, install) : undefined;
}

export function installedAppWorldMountFromInstall(
  profile: RuntimeProfile,
  install: AppInstall,
): RuntimeWorldMount | undefined {
  const routes = profile.installedAppRoutes;

  if (!routes) {
    return undefined;
  }

  const target = installedAppStorageIdentity({
    installId: install.installId,
    packageAppKey: install.packageAppKey,
  });

  if (!target) {
    return undefined;
  }

  const route = `${routes.appRouteBase}/${target.installId}` as const;
  const app = findSchemaAppDefinition(target.sourceSchemaKey);

  if (!app) {
    return undefined;
  }

  return {
    app,
    generatedRoutes: true,
    route,
    ...(routes.schemaRoutes ? { schemaRoute: `${route}/schema` as const } : {}),
    target,
  };
}

function installedAppWorldMountFromRoute(
  profile: RuntimeProfile,
  pathname: string,
  context: RuntimeInstalledAppRouteContext = {},
): RuntimeWorldMount | undefined {
  const routes = profile.installedAppRoutes;

  if (!routes) {
    return undefined;
  }

  const [firstSegment, installId] = pathname.split("/").filter(Boolean);

  if (`/${firstSegment}` !== routes.appRouteBase || !installId) {
    return undefined;
  }

  const world = installedAppWorldMountFromInstallId(profile, installId, context);

  if (!world || (!world.schemaRoute && pathname === `${world.route}/schema`)) {
    return undefined;
  }

  return world;
}

export function isInstalledAppRoutePath(profile: RuntimeProfile, pathname: string): boolean {
  const routes = profile.installedAppRoutes;
  const [firstSegment, installId] = pathname.split("/").filter(Boolean);

  return Boolean(routes && `/${firstSegment}` === routes.appRouteBase && installId);
}

export function isInstalledSitePublicRoutePath(profile: RuntimeProfile, pathname: string): boolean {
  const routes = profile.installedSitePublicRoutes;
  const [firstSegment, installId] = pathname.split("/").filter(Boolean);

  return Boolean(routes && `/${firstSegment}` === routes.siteRouteBase && installId);
}

function findInstalledAppByInstallId(
  appInstalls: readonly AppInstall[] | undefined,
  installId: string,
): AppInstall | undefined {
  return appInstalls?.find((install) => install.installId === installId);
}

function browserRuntimeProfileConfig(): RuntimeProfileResolverInput {
  return {
    profile:
      stringConfigValue(import.meta.env.VITE_FORMLESS_RUNTIME_PROFILE) ??
      readRuntimeProfileDocumentHint(),
    schemaKey: stringConfigValue(import.meta.env.VITE_FORMLESS_SCHEMA_KEY),
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
  };
}

function browserLocalPublishBrokerConfig(): RuntimeLocalPublishBroker | undefined {
  const endpoint = stringConfigValue(import.meta.env.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL);
  const token = stringConfigValue(import.meta.env.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN);

  if (!endpoint || !token) {
    return undefined;
  }

  try {
    new URL(endpoint);
  } catch {
    return undefined;
  }

  return { endpoint, token };
}

export function readRuntimeProfileDocumentHint(
  doc: RuntimeProfileHintDocument | undefined = browserDocument(),
): string | undefined {
  const profile = doc
    ?.querySelector(`meta[name="${FORMLESS_RUNTIME_PROFILE_META_NAME}"]`)
    ?.getAttribute("content");

  return stringConfigValue(profile);
}

function parseRuntimeProfileKind(value: string | undefined): RuntimeProfileKind | undefined {
  switch (value) {
    case "instance":
    case "dev":
    case "app":
    case "siteAuthoring":
    case "publishedSite":
      return value;
    default:
      return undefined;
  }
}

function runtimeProfileKindFromHost(hostname: string | undefined): RuntimeProfileKind | undefined {
  if (!hostname) {
    return undefined;
  }

  const normalized = hostname.toLowerCase();

  if (normalized.startsWith("published-site.")) {
    return "publishedSite";
  }

  if (normalized.startsWith("instance.")) {
    return "instance";
  }

  if (normalized.startsWith("app.")) {
    return "app";
  }

  if (normalized.startsWith("site-authoring.")) {
    return "siteAuthoring";
  }

  if (isWorkersDevHost(normalized)) {
    return "publishedSite";
  }

  return undefined;
}

function parseSchemaKey(value: string | undefined): SchemaKey | undefined {
  return value ? findSchemaAppDefinition(value)?.key : undefined;
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function browserDocument(): RuntimeProfileHintDocument | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function isWorkersDevHost(hostname: string): boolean {
  return hostname === "workers.dev" || hostname.endsWith(".workers.dev");
}
