import type { AppSchema } from "@dpeek/formless-schema";

export type EntityName = string;
export type FieldValue = string | boolean | number;
export type RecordValues = Record<string, FieldValue>;

export type StoredRecord = {
  id: string;
  entity: EntityName;
  values: RecordValues;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export const STORAGE_SNAPSHOT_KIND = "formless.storageSnapshot";
export const STORAGE_SNAPSHOT_VERSION = 1;

export type StorageSnapshot = {
  kind: typeof STORAGE_SNAPSHOT_KIND;
  version: typeof STORAGE_SNAPSHOT_VERSION;
  storageIdentity: string;
  schemaKey: string;
  exportedAt: string;
  schemaUpdatedAt: string;
  sourceCursor: number;
  schema: AppSchema;
  records: StoredRecord[];
};

export type StorageSnapshotExpected = {
  schemaKey?: string;
  storageIdentity?: string;
};
