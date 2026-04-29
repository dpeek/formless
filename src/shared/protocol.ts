import type { AppSchema } from "./schema.ts";

export type EntityName = string;
export type FieldValue = string | boolean;
export type RecordValues = Record<string, FieldValue>;

export type StoredRecord = {
  id: string;
  entity: EntityName;
  values: RecordValues;
  createdAt: string;
  deletedAt?: string;
};

export type CreateMutation = {
  mutationId: string;
  entity: EntityName;
  op: "create";
  values: RecordValues;
};

export type PatchMutation = {
  mutationId: string;
  entity: EntityName;
  op: "patch";
  recordId: string;
  values: Partial<RecordValues>;
};

export type Mutation = CreateMutation | PatchMutation;

export type ActionRequest = {
  actionId: string;
  entity: EntityName;
  action: string;
};

export type ChangeRow = {
  seq: number;
  mutationId: string;
  op: "create" | "patch" | "action";
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

export type ActionResponse = {
  actionId: string;
  changes: ChangeRow[];
  cursor: number;
};

export type SchemaResponse = {
  schema: AppSchema;
  updatedAt: string;
};

export type SchemaUpdateResponse = {
  schema: AppSchema;
  updatedAt: string;
};
