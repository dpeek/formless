export type SchemaKey = "tasks" | "rates" | "site";

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
  rates: {
    key: "rates",
    label: "Rates",
    route: "/rates",
    schemaRoute: "/rates/schema",
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
  schemaAppDefinitions.rates,
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
  return schemaApps.find((app) => app.route === pathname || app.schemaRoute === pathname);
}
