export type QualifiedEntityName = {
  entityKey: string;
  schemaKey: string;
};

const schemaLocalEntityKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;

export function isSchemaLocalEntityKey(value: string): boolean {
  return schemaLocalEntityKeyPattern.test(value);
}

export function assertSchemaLocalEntityKey(context: string, value: string) {
  if (!isSchemaLocalEntityKey(value)) {
    throw new Error(`${context} must be a singular kebab-case entity key.`);
  }
}

export function parseQualifiedEntityName(context: string, value: unknown): QualifiedEntityName {
  if (typeof value !== "string" || !isQualifiedEntityName(value)) {
    throw new Error(
      `${context} must be a qualified entity name in "<schema-key>:<entity-key>" format with kebab-case schema and entity keys.`,
    );
  }

  const [schemaKey, entityKey] = value.split(":") as [string, string];
  return { schemaKey, entityKey };
}

export function formatQualifiedEntityName(name: QualifiedEntityName): string {
  assertQualifiedSchemaKey(`Qualified entity schema key "${name.schemaKey}"`, name.schemaKey);
  assertSchemaLocalEntityKey(`Qualified entity key "${name.entityKey}"`, name.entityKey);

  return `${name.schemaKey}:${name.entityKey}`;
}

function assertQualifiedSchemaKey(context: string, value: string) {
  if (!isSchemaLocalEntityKey(value)) {
    throw new Error(`${context} must be a kebab-case schema key.`);
  }
}

function isQualifiedEntityName(value: string): boolean {
  const parts = value.split(":");

  if (parts.length !== 2) {
    return false;
  }

  const [schemaKey, entityKey] = parts;
  return isSchemaLocalEntityKey(schemaKey) && isSchemaLocalEntityKey(entityKey);
}
