import { parseAppSchema, type AppSchema } from "./schema.ts";

export type EntityName = string;
export type FieldValue = string | boolean | number;
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

export type CreateSelectedJoinRecordActionInput = {
  fromRecordId: string;
  toRecordId: string;
};

export type RemoveSelectedJoinRecordsActionInput = {
  recordIds: string[];
};

export type ActionRequestInput =
  | CreateSelectedJoinRecordActionInput
  | RemoveSelectedJoinRecordsActionInput;

export type ActionRequest = {
  actionId: string;
  entity: EntityName;
  action: string;
  input?: ActionRequestInput;
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

export const STORE_SNAPSHOT_KIND = "formless.storeSnapshot";
export const STORE_SNAPSHOT_VERSION = 1;

export type StoreSnapshot = {
  kind: typeof STORE_SNAPSHOT_KIND;
  version: typeof STORE_SNAPSHOT_VERSION;
  schemaKey: string;
  exportedAt: string;
  schemaUpdatedAt: string;
  sourceCursor: number;
  schema: AppSchema;
  records: StoredRecord[];
};

export type SyncResponse = {
  changes: ChangeRow[];
  cursor: number;
  schema?: AppSchema;
  schemaUpdatedAt?: string;
};

export type SyncSocketClientMessage =
  | {
      type: "hello";
      cursor: number;
      schemaUpdatedAt: string | null;
    }
  | {
      type: "sync-requested";
      cursor: number;
      schemaUpdatedAt: string | null;
    };

export type SyncSocketServerMessage =
  | {
      type: "sync";
      payload: SyncResponse;
    }
  | {
      type: "error";
      message: string;
    };

export type SyncSocketAttachment = {
  cursor: number;
  schemaUpdatedAt: string | null;
};

export type MutationResponse = {
  record: StoredRecord;
  changes: ChangeRow[];
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

export type SitePageTreeProjection = {
  tree: SitePageTree | null;
  meta: SiteTreeMeta;
};

export type SitePageTreeResponse = SitePageTree;

export type SitePageTree = {
  page: SiteBlockNode;
  meta: SiteTreeMeta;
};

export type SiteTreeMeta = {
  slug: string;
  generatedAt: string;
  warnings: SiteTreeWarning[];
};

export type SiteBlockNode = {
  id: string;
  type: string;
  title: string;
  label?: string;
  subtitle?: string;
  body?: string;
  slug?: string;
  href?: string;
  icon?: string;
  color?: string;
  templateKey?: string;
  assetKey?: string;
  alt?: string;
  width?: number;
  height?: number;
  placements: SitePlacementNode[];
  query?: {
    key: string;
    items: SiteBlockNode[];
  };
};

export type SitePlacementNode = {
  id: string;
  slot?: string;
  order: number;
  visible: boolean;
  variant?: string;
  label?: string;
  block: SiteBlockNode;
};

export type SiteTreeWarning = {
  code: string;
  recordId: string;
  message: string;
};

export function isSyncSocketClientMessage(value: unknown): value is SyncSocketClientMessage {
  return (
    isRecord(value) &&
    (value.type === "hello" || value.type === "sync-requested") &&
    isCursor(value.cursor) &&
    isNullableString(value.schemaUpdatedAt)
  );
}

export function isSyncSocketServerMessage(value: unknown): value is SyncSocketServerMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === "error") {
    return typeof value.message === "string";
  }

  return value.type === "sync" && isSyncResponse(value.payload);
}

export function isSyncSocketAttachment(value: unknown): value is SyncSocketAttachment {
  return isRecord(value) && isCursor(value.cursor) && isNullableString(value.schemaUpdatedAt);
}

export function parseStoreSnapshot(value: unknown, expectedSchemaKey?: string): StoreSnapshot {
  if (!isRecord(value)) {
    throw new Error("Store snapshot must be an object.");
  }

  assertStoreSnapshotKeys(value);

  if (value.kind !== STORE_SNAPSHOT_KIND) {
    throw new Error(`Store snapshot kind must be "${STORE_SNAPSHOT_KIND}".`);
  }

  if (value.version !== STORE_SNAPSHOT_VERSION) {
    throw new Error(`Store snapshot version must be ${STORE_SNAPSHOT_VERSION}.`);
  }

  const schemaKey = parseNonEmptyString("Store snapshot schemaKey", value.schemaKey);
  if (expectedSchemaKey !== undefined && schemaKey !== expectedSchemaKey) {
    throw new Error(`Store snapshot schemaKey must be "${expectedSchemaKey}".`);
  }

  const records = parseStoreSnapshotRecords(value.records);

  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey,
    exportedAt: parseNonEmptyString("Store snapshot exportedAt", value.exportedAt),
    schemaUpdatedAt: parseNonEmptyString("Store snapshot schemaUpdatedAt", value.schemaUpdatedAt),
    sourceCursor: parseCursor("Store snapshot sourceCursor", value.sourceCursor),
    schema: parseAppSchema(value.schema),
    records,
  };
}

function isSyncResponse(value: unknown): value is SyncResponse {
  if (!isRecord(value) || !Array.isArray(value.changes) || !isCursor(value.cursor)) {
    return false;
  }

  if (!value.changes.every(isChangeRow)) {
    return false;
  }

  if ("schema" in value && !isRecord(value.schema)) {
    return false;
  }

  if ("schemaUpdatedAt" in value && typeof value.schemaUpdatedAt !== "string") {
    return false;
  }

  return true;
}

function isChangeRow(value: unknown): value is ChangeRow {
  return (
    isRecord(value) &&
    isCursor(value.seq) &&
    typeof value.mutationId === "string" &&
    (value.op === "create" || value.op === "patch" || value.op === "action") &&
    typeof value.entity === "string" &&
    typeof value.recordId === "string" &&
    isStoredRecord(value.payload) &&
    typeof value.createdAt === "string"
  );
}

function isStoredRecord(value: unknown): value is StoredRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.entity === "string" &&
    isRecordValues(value.values) &&
    typeof value.createdAt === "string" &&
    (!("deletedAt" in value) || typeof value.deletedAt === "string")
  );
}

function isRecordValues(value: unknown): value is RecordValues {
  return isRecord(value) && Object.values(value).every(isFieldValue);
}

function isFieldValue(value: unknown): value is FieldValue {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}

function isCursor(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStoreSnapshotKeys(value: Record<string, unknown>) {
  const requiredKeys = [
    "kind",
    "version",
    "schemaKey",
    "exportedAt",
    "schemaUpdatedAt",
    "sourceCursor",
    "schema",
    "records",
  ];
  const allowedKeys = new Set(requiredKeys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Store snapshot has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`Store snapshot must include "${key}".`);
    }
  }
}

function parseStoreSnapshotRecords(value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Store snapshot records must be an array.");
  }

  return value.map((record, index) => {
    if (!isStoredRecord(record)) {
      throw new Error(`Store snapshot records[${index}] must be a stored record.`);
    }

    return {
      id: record.id,
      entity: record.entity,
      values: { ...record.values },
      createdAt: record.createdAt,
      ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
    };
  });
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseCursor(context: string, value: unknown): number {
  if (!isCursor(value)) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}
