import type { AppSchema } from "./schema.ts";

export type EntityName = string;
export type RecordValues = Record<string, string>;

export type StoredRecord = {
  id: string;
  entity: EntityName;
  values: RecordValues;
  createdAt: string;
};

export type CreateMutation = {
  mutationId: string;
  entity: EntityName;
  op: "create";
  values: RecordValues;
};

export type ChangeRow = {
  seq: number;
  mutationId: string;
  op: "create";
  entity: EntityName;
  recordId: string;
  payload: StoredRecord;
  createdAt: string;
};

export type BootstrapResponse = {
  schema: AppSchema;
  schemaUpdatedAt: string;
  records: StoredRecord[];
  cursor: number;
};

export type SyncResponse = {
  changes: ChangeRow[];
  cursor: number;
  schema?: AppSchema;
  schemaUpdatedAt?: string;
};

export type MutationResponse = {
  record: StoredRecord;
  cursor: number;
  mutationId: string;
};

export type SchemaResponse = {
  schema: AppSchema;
  updatedAt: string;
};

export type SchemaUpdateResponse = {
  schema: AppSchema;
  updatedAt: string;
};
