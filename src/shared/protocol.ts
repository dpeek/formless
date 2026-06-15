import { parseAppSchema, type AppSchema, type SchemaActionActorKind } from "@dpeek/formless-schema";
import type {
  AppInstall,
  AppInstallInitializationPlan,
  InstallableAppPackage,
  PackageAppKey,
} from "./app-installs.ts";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

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

export type DeleteMutation = {
  mutationId: string;
  entity: EntityName;
  op: "delete";
  recordId: string;
};

export type Mutation = CreateMutation | PatchMutation | DeleteMutation;

export type CreateSelectedJoinRecordActionInput = {
  fromRecordId: string;
  toRecordId: string;
};

export type RemoveSelectedJoinRecordsActionInput = {
  recordIds: string[];
};

export type CreateTreeChildActionInput = {
  parentRecordId: string;
  childValues: RecordValues;
  placementValues?: RecordValues;
};

export type RemoveTreePlacementActionInput = {
  placementId: string;
};

export type TransitionStateActionInput = {
  recordId: string;
};

export type ActionRequestInput =
  | CreateSelectedJoinRecordActionInput
  | RemoveSelectedJoinRecordsActionInput
  | CreateTreeChildActionInput
  | RemoveTreePlacementActionInput
  | TransitionStateActionInput;

export type ActionRequest = {
  actionId: string;
  entity: EntityName;
  action: string;
  input?: ActionRequestInput;
  actorKind?: SchemaActionActorKind;
};

export type PublicActionProofInput = {
  turnstileToken: string;
};

export type PublicActionRequestSource = {
  siteBlockId?: string;
};

export type PublicActionActor = {
  mode: "anonymous";
};

export type PublicActionProof = {
  kind: "turnstile";
  token: string;
  verification?: PublicActionChallengeVerification;
};

export type PublicActionChallengeVerification = {
  kind: "turnstile";
  success: boolean;
  verifiedAt: string;
  challengeTs?: string;
  hostname?: string;
};

export type PublicActionStorageTarget =
  | {
      kind: "schemaKey";
      packageAppKey: string;
      sourceSchemaKey: string;
      apiRoutePrefix: string;
    }
  | {
      kind: "appInstall";
      installId: string;
      packageAppKey: string;
      sourceSchemaKey: string;
      apiRoutePrefix: string;
    };

export type PublicActionSource = {
  actionName: string;
  host: string;
  path: string;
  target: PublicActionStorageTarget;
  siteBlockId?: string;
};

export type PublicActionExecutionEnvelope = {
  actionId: string;
  actor: PublicActionActor;
  proof: PublicActionProof;
  source: PublicActionSource;
  input: RecordValues;
  idempotencyKey: string;
  receivedAt: string;
};

export type PublicActionEffects = {
  response: ActionResponse;
};

export type PublicActionAuditFacts = {
  actionId: string;
  accepted: boolean;
  receivedAt: string;
  rejectedAt?: string;
  rejectionReason?: string;
};

export type PublicActionExecutionResult = {
  envelope: PublicActionExecutionEnvelope;
  effects?: PublicActionEffects;
  audit: PublicActionAuditFacts;
};

export type PublicOperationRequest = {
  input: RecordValues;
  proof: PublicActionProofInput;
  source?: PublicActionRequestSource;
  idempotencyKey?: string;
};

export type PublicOperationResponse = {
  invocationId: string;
  operation: {
    entityName: string;
    operationName: string;
    canonicalKey: string;
    kind: "command" | "create";
  };
  output:
    | {
        type: "command";
        affectedChangeIds: string[];
        cursor: number;
        response: {
          actionId: string;
          cursor: number;
          recordPlan?: RecordPlanResponse;
        };
      }
    | {
        type: "create";
        affectedChangeIds: string[];
        changes: ChangeRow[];
        cursor: number;
        record: StoredRecord;
      };
  status: "committed" | "replayed";
};

export type ChangeRow = {
  seq: number;
  mutationId: string;
  op: "create" | "patch" | "delete" | "action";
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

export const FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER = "x-formless-runtime-protocol-version";
export const FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER = "x-formless-schema-updated-at";
export const FORMLESS_CLIENT_PACKAGE_REVISION_HEADER = "x-formless-package-app-revision";
export const FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER = "x-formless-source-schema-hash";
export const FORMLESS_RELOAD_REQUIRED_ERROR_CODE = "reload-required";

export type BrowserReplicaUpgradeFacts = {
  runtimeProtocolVersion: number;
  schemaUpdatedAt: string | null;
  packageApp: {
    packageAppKey: PackageAppKey;
    packageRevision: PackageAppRevision;
    sourceSchemaHash: SourceSchemaHash;
  } | null;
};

export type ReloadRequiredErrorResponse = {
  error: string;
  code: typeof FORMLESS_RELOAD_REQUIRED_ERROR_CODE;
  reloadRequired: true;
  upgrade: BrowserReplicaUpgradeFacts;
};

export const OWNER_SETUP_TOKEN_MIN_LENGTH = 32;
export const OWNER_SETUP_TOKEN_MAX_LENGTH = 512;

export type OwnerIdentityInput = {
  name: string;
  email?: string;
};

export type OwnerIdentity = {
  id: string;
  name: string;
  email?: string;
  createdAt: string;
};

export type OwnerSetupStatusResponse = {
  setupComplete: boolean;
  owner?: OwnerIdentity;
};

export type OwnerSetupCompleteRequest = {
  setupToken: string;
  owner: OwnerIdentityInput;
};

export type OwnerSetupCompleteResponse = {
  setupComplete: true;
  owner: OwnerIdentity;
};

export type AppInstallsResponse = {
  packages: InstallableAppPackage[];
  installs: AppInstall[];
};

export type CreateAppInstallRequest = {
  packageAppKey: string;
  installId: string;
  label: string;
};

export type CreateAppInstallResponse = {
  initialization: AppInstallInitializationPlan;
  install: AppInstall;
  installs: AppInstall[];
};

export type MutationResponse = {
  record: StoredRecord;
  changes: ChangeRow[];
  cursor: number;
  mutationId: string;
};

export type RecordPlanStepResponse = {
  name: string;
  kind: "create" | "patch" | "delete" | "tombstone";
  entity: EntityName;
  recordId: string;
  changeId: string;
};

export type RecordPlanResponse = {
  steps: RecordPlanStepResponse[];
};

export type ActionResponse = {
  actionId: string;
  changes: ChangeRow[];
  cursor: number;
  recordPlan?: RecordPlanResponse;
};

export type SchemaResponse = {
  schema: AppSchema;
  updatedAt: string;
};

export type SchemaUpdateResponse = {
  schema: AppSchema;
  updatedAt: string;
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

export function parseOwnerSetupToken(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Owner setup token must be a string.");
  }

  const token = value.trim();

  if (token.length < OWNER_SETUP_TOKEN_MIN_LENGTH) {
    throw new Error(
      `Owner setup token must be at least ${OWNER_SETUP_TOKEN_MIN_LENGTH} characters.`,
    );
  }

  if (token.length > OWNER_SETUP_TOKEN_MAX_LENGTH) {
    throw new Error(
      `Owner setup token must be at most ${OWNER_SETUP_TOKEN_MAX_LENGTH} characters.`,
    );
  }

  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Owner setup token must be URL-safe.");
  }

  return token;
}

export function parseOwnerSetupCompleteRequest(value: unknown): OwnerSetupCompleteRequest {
  if (!isRecord(value)) {
    throw new Error("Owner setup request must be an object.");
  }

  assertOwnerSetupRequestKeys(value);

  return {
    setupToken: parseOwnerSetupToken(value.setupToken),
    owner: parseOwnerIdentityInput(value.owner),
  };
}

export function parseCreateAppInstallRequest(value: unknown): CreateAppInstallRequest {
  if (!isRecord(value)) {
    throw new Error("App install request must be an object.");
  }

  assertCreateAppInstallRequestKeys(value);

  return {
    packageAppKey: parseTrimmedNonEmptyString("App install package app key", value.packageAppKey),
    installId: parseTrimmedNonEmptyString("App install id", value.installId),
    label: parseTrimmedNonEmptyString("App install label", value.label),
  };
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
    (value.op === "create" ||
      value.op === "patch" ||
      value.op === "delete" ||
      value.op === "action") &&
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

function assertOwnerSetupRequestKeys(value: Record<string, unknown>) {
  const requiredKeys = ["setupToken", "owner"];
  const allowedKeys = new Set(requiredKeys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Owner setup request has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`Owner setup request must include "${key}".`);
    }
  }
}

function assertCreateAppInstallRequestKeys(value: Record<string, unknown>) {
  const requiredKeys = ["packageAppKey", "installId", "label"];
  const allowedKeys = new Set(requiredKeys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`App install request has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`App install request must include "${key}".`);
    }
  }
}

function parseOwnerIdentityInput(value: unknown): OwnerIdentityInput {
  if (!isRecord(value)) {
    throw new Error("Owner setup owner must be an object.");
  }

  const allowedKeys = new Set(["name", "email"]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Owner setup owner has unsupported key "${key}".`);
    }
  }

  const name = parseTrimmedNonEmptyString("Owner setup owner name", value.name);
  const email =
    value.email === undefined
      ? undefined
      : parseTrimmedNonEmptyString("Owner setup owner email", value.email);

  return {
    name,
    ...(email === undefined ? {} : { email }),
  };
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

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  return parseNonEmptyString(context, value).trim();
}

function parseCursor(context: string, value: unknown): number {
  if (!isCursor(value)) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}
