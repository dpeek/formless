export type SchemaKey = "tasks" | "estii" | "site";

export const defaultSchemaKey = "tasks" satisfies SchemaKey;

export type SchemaAppDefinition = {
  key: SchemaKey;
  label: string;
  route: `/${string}`;
  schemaRoute: `/${string}/schema`;
  seedChangeMutationPrefix: string;
};

export const schemaAppDefinitions = {
  tasks: {
    key: "tasks",
    label: "Tasks",
    route: "/tasks",
    schemaRoute: "/tasks/schema",
    seedChangeMutationPrefix: "seed-task",
  },
  estii: {
    key: "estii",
    label: "Estii",
    route: "/estii",
    schemaRoute: "/estii/schema",
    seedChangeMutationPrefix: "seed-rate-card",
  },
  site: {
    key: "site",
    label: "Site",
    route: "/site",
    schemaRoute: "/site/schema",
    seedChangeMutationPrefix: "seed-site",
  },
} as const satisfies Record<SchemaKey, SchemaAppDefinition>;

export const schemaApps = [
  schemaAppDefinitions.tasks,
  schemaAppDefinitions.estii,
  schemaAppDefinitions.site,
] as const satisfies readonly SchemaAppDefinition[];

export function isSchemaKey(value: string): value is SchemaKey {
  return Object.prototype.hasOwnProperty.call(schemaAppDefinitions, value);
}

export function getSchemaAppDefinition(key: SchemaKey): SchemaAppDefinition {
  return schemaAppDefinitions[key];
}

export function findSchemaAppDefinition(key: string): SchemaAppDefinition | undefined {
  return isSchemaKey(key) ? getSchemaAppDefinition(key) : undefined;
}

export function findSchemaAppDefinitionByRoute(pathname: string): SchemaAppDefinition | undefined {
  return schemaApps.find(
    (app) => app.schemaRoute === pathname || schemaAppScreenPathFromRoute(app, pathname),
  );
}

export function schemaAppScreenRoute(
  app: SchemaAppDefinition,
  screenPath: string,
): `/${string}` {
  return screenPath === "/" ? app.route : (`${app.route}${screenPath}` as `/${string}`);
}

export function schemaAppScreenPathFromRoute(
  app: SchemaAppDefinition,
  pathname: string,
): string | undefined {
  if (pathname === app.schemaRoute) {
    return undefined;
  }

  if (pathname === app.route) {
    return "/";
  }

  const routePrefix = `${app.route}/`;

  return pathname.startsWith(routePrefix) ? pathname.slice(app.route.length) : undefined;
}
