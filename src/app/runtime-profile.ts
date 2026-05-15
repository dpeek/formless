import {
  defaultSchemaKey,
  findSchemaAppDefinition,
  getSchemaAppDefinition,
  schemaApps,
  type SchemaAppDefinition,
  type SchemaKey,
} from "../shared/schema-apps.ts";

export type RuntimeProfileKind = "dev" | "app" | "siteAuthoring" | "publishedSite";

export type RuntimeShellKind = "dev" | "app" | "publishedSite";

export type RuntimeWorldMount = {
  app: SchemaAppDefinition;
  generatedRoutes: boolean;
  route: `/${string}`;
  schemaRoute?: `/${string}`;
};

export type RuntimeRedirect = {
  from: `/${string}`;
  to: `/${string}`;
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
  legacyRedirects: readonly RuntimeRedirect[];
  localPublish?: RuntimeLocalPublishBroker;
  publicSitePreview?: RuntimePublicSitePreview;
  publishedSite?: RuntimePublishedSiteRoutes;
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

export function createDevRuntimeProfile(): RuntimeProfile {
  return {
    kind: "dev",
    shell: "dev",
    worlds: schemaApps.map((app) => ({
      app,
      generatedRoutes: true,
      route: app.route,
      schemaRoute: app.schemaRoute,
    })),
    defaultRedirect: getSchemaAppDefinition(defaultSchemaKey).route,
    legacyRedirects: [
      { from: "/rates/schema", to: "/estii/schema" },
      { from: "/rates", to: "/estii" },
    ],
    publicSitePreview: {
      rootRoute: "/pages",
      routePattern: "/pages/*",
      homeRoute: "/pages/home",
      homeSlug: "home",
      linkMode: "preview",
    },
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
    legacyRedirects: [],
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
    legacyRedirects: [],
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
    legacyRedirects: [],
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
): RuntimeWorldMount | undefined {
  return profile.worlds
    .filter(hasGeneratedRoutes)
    .find((world) => world.schemaRoute === pathname || runtimeScreenPathFromRoute(world, pathname));
}

export function hasGeneratedRoutes(world: RuntimeWorldMount): boolean {
  return world.generatedRoutes;
}

export function isRuntimePublicSiteRoute(profile: RuntimeProfile, pathname: string): boolean {
  const preview = profile.publicSitePreview;

  if (!preview || findRuntimeWorldMountByRoute(profile, pathname)) {
    return false;
  }

  return Boolean(
    pathname === preview.rootRoute ||
    (preview.rootRoute === "/"
      ? pathname.startsWith("/")
      : pathname.startsWith(`${preview.rootRoute}/`)),
  );
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
