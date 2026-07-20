import type { AppSchema } from "@dpeek/formless-schema";
import { rateSourceSchema, siteSourceSchema, taskSourceSchema } from "./schema-apps.ts";

export function cloneTestValue<T>(value: T): T {
  return structuredClone(value);
}

export function sourceLikeTaskSchema(overrides: Partial<AppSchema> = {}): AppSchema {
  return sourceLikeSchema(taskSourceSchema, overrides);
}

export function sourceLikeRateSchema(overrides: Partial<AppSchema> = {}): AppSchema {
  return sourceLikeSchema(rateSourceSchema, overrides);
}

export function sourceLikeSiteSchema(overrides: Partial<AppSchema> = {}): AppSchema {
  return sourceLikeSchema(siteSourceSchema, overrides);
}

export function sourceLikeSchemas(): AppSchema[] {
  return [sourceLikeTaskSchema(), sourceLikeRateSchema(), sourceLikeSiteSchema()];
}

export function invalidSchemaFrom<T extends object>(
  schema: T,
  mutate: (draft: T) => void,
): unknown {
  const draft = cloneTestValue(schema);
  mutate(draft);
  return draft;
}

function sourceLikeSchema(base: AppSchema, overrides: Partial<AppSchema>): AppSchema {
  const schema = cloneTestValue(base);
  Object.assign(schema, overrides);
  return schema;
}
