import type { BootstrapResponse, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";

export const TEST_SCHEMA_UPDATED_AT = "2026-05-06T00:00:00.000Z";

export function bootstrapResponse(
  schema: AppSchema,
  records: StoredRecord[],
  {
    cursor = records.length,
    schemaUpdatedAt = TEST_SCHEMA_UPDATED_AT,
  }: { cursor?: number; schemaUpdatedAt?: string } = {},
): BootstrapResponse {
  return {
    schema,
    schemaUpdatedAt,
    records,
    cursor,
  };
}
