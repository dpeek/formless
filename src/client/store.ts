import { useMemo, useSyncExternalStore } from "react";
import { listenForClientEvents } from "./broadcast.ts";
import { readLocalSnapshot, type LocalSnapshot } from "./db.ts";
import { nowIsoString } from "../shared/clock.ts";
import type { BootstrapResponse, ChangeRow, FieldValue, StoredRecord } from "../shared/protocol.ts";
import {
  matchesQuery,
  type QueryEvaluationContext,
  type QueryExpression,
} from "../shared/query.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { AppSchema } from "../shared/schema.ts";

export type NormalizedClientState = {
  activeSchemaKey: SchemaKey | null;
  hydrated: boolean;
  schema: AppSchema | null;
  schemaUpdatedAt: string | null;
  recordsById: Record<string, StoredRecord>;
  recordIdsByEntity: Record<string, string[]>;
  cursor: number;
  lastSyncedAt: string | null;
};

export type ReferenceOption = {
  id: string;
  label: string;
};

type StoreListener = () => void;
type ReferenceOptionsSnapshot = Pick<NormalizedClientState, "recordsById" | "recordIdsByEntity">;
type QuerySelectorSnapshot = Pick<NormalizedClientState, "recordsById" | "recordIdsByEntity">;

const EMPTY_RECORD_IDS: string[] = [];
const EMPTY_REFERENCE_OPTIONS: ReferenceOption[] = [];
const listeners = new Set<StoreListener>();

let state: NormalizedClientState = emptyClientState(null);

export function getClientStoreSnapshot(): NormalizedClientState {
  return state;
}

export function subscribeToClientStore(listener: StoreListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function subscribeToClientStoreSelector<T>(
  selector: (snapshot: NormalizedClientState) => T,
  listener: (selectedValue: T) => void,
) {
  let selectedValue = selector(state);

  return subscribeToClientStore(() => {
    const nextSelectedValue = selector(state);

    if (Object.is(selectedValue, nextSelectedValue)) {
      return;
    }

    selectedValue = nextSelectedValue;
    listener(nextSelectedValue);
  });
}

export function resetClientStore() {
  setState(emptyClientState(null));
}

export function selectClientStoreSchemaKey(schemaKey: SchemaKey) {
  if (state.activeSchemaKey === schemaKey) {
    return;
  }

  setState(emptyClientState(schemaKey));
}

export async function hydrateClientStore(schemaKey: SchemaKey) {
  applyLocalSnapshot(schemaKey, await readLocalSnapshot(schemaKey));
}

export async function refreshClientStoreFromDb(schemaKey: SchemaKey) {
  applyLocalSnapshot(schemaKey, await readLocalSnapshot(schemaKey));
}

export function applyBootstrapResponse(response: BootstrapResponse, schemaKey?: SchemaKey) {
  if (!shouldApplySchemaKey(schemaKey)) {
    return;
  }

  setState({
    activeSchemaKey: schemaKey ?? state.activeSchemaKey,
    hydrated: true,
    schema: response.schema,
    schemaUpdatedAt: response.schemaUpdatedAt,
    recordsById: recordsById(sortRecords(response.records)),
    recordIdsByEntity: recordIdsByEntity(sortRecords(response.records)),
    cursor: response.cursor,
    lastSyncedAt: nowIsoString(),
  });
}

export function applySchemaSave(schema: AppSchema, schemaUpdatedAt: string, schemaKey?: SchemaKey) {
  if (!shouldApplySchemaKey(schemaKey)) {
    return;
  }

  updateState((current) => ({
    ...current,
    activeSchemaKey: schemaKey ?? current.activeSchemaKey,
    schema,
    schemaUpdatedAt,
    lastSyncedAt: nowIsoString(),
  }));
}

export function applyChanges(changes: ChangeRow[], cursor: number, schemaKey?: SchemaKey) {
  applyRecordMerge(
    changes.map((change) => change.payload),
    cursor,
    schemaKey,
  );
}

export function applyRecordMerge(
  recordsToMerge: StoredRecord[],
  cursor?: number,
  schemaKey?: SchemaKey,
) {
  if (!shouldApplySchemaKey(schemaKey)) {
    return;
  }

  updateState((current) => {
    let recordsByIdChanged = false;
    const nextRecordsById = { ...current.recordsById };

    for (const record of recordsToMerge) {
      const existing = current.recordsById[record.id];

      if (!storedRecordsEqual(existing, record)) {
        recordsByIdChanged = true;
        nextRecordsById[record.id] = record;
      }
    }

    const recordIdsByEntity = recordsByIdChanged
      ? reconcileRecordIdsByEntity(
          current.recordIdsByEntity,
          sortRecords(Object.values(nextRecordsById)),
        )
      : current.recordIdsByEntity;
    const cursorChanged = cursor !== undefined && cursor !== current.cursor;
    const hasLastSyncedAtUpdate = recordsToMerge.length > 0 || cursor !== undefined;

    if (!recordsByIdChanged && !cursorChanged && !hasLastSyncedAtUpdate) {
      return current;
    }

    return {
      ...current,
      activeSchemaKey: schemaKey ?? current.activeSchemaKey,
      recordsById: recordsByIdChanged ? nextRecordsById : current.recordsById,
      recordIdsByEntity,
      cursor: cursor ?? current.cursor,
      lastSyncedAt: hasLastSyncedAtUpdate ? nowIsoString() : current.lastSyncedAt,
    };
  });
}

export function useHydrated() {
  return useClientStoreSelector((snapshot) => snapshot.hydrated);
}

export function useActiveSchemaKey() {
  return useClientStoreSelector((snapshot) => snapshot.activeSchemaKey);
}

export function useSchema() {
  return useClientStoreSelector((snapshot) => snapshot.schema);
}

export function useEntityRecordIds(entityName: string) {
  return useClientStoreSelector((snapshot) => {
    return snapshot.recordIdsByEntity[entityName] ?? EMPTY_RECORD_IDS;
  });
}

export function useReferenceOptions(entityName: string, displayField?: string) {
  const selector = useMemo(
    () => createReferenceOptionsSelector(entityName, displayField),
    [entityName, displayField],
  );

  return useClientStoreSelector(selector);
}

export function useEntityRecordIdsMatchingQuery(
  entityName: string,
  query: QueryExpression,
  context?: QueryEvaluationContext,
) {
  const contextKey = queryEvaluationContextCacheKey(context);
  const selector = useMemo(
    () => createEntityRecordIdsMatchingQuerySelector(entityName, query, context),
    [entityName, query, contextKey],
  );

  return useClientStoreSelector(selector);
}

export function useEntityRecordOptionsMatchingQuery(
  entityName: string,
  query: QueryExpression,
  labelField: string,
  context?: QueryEvaluationContext,
) {
  const contextKey = queryEvaluationContextCacheKey(context);
  const selector = useMemo(
    () => createEntityRecordOptionsMatchingQuerySelector(entityName, query, labelField, context),
    [entityName, query, labelField, contextKey],
  );

  return useClientStoreSelector(selector);
}

export function useEntityRecordCountMatchingQuery(
  entityName: string,
  query: QueryExpression,
  context?: QueryEvaluationContext,
) {
  const contextKey = queryEvaluationContextCacheKey(context);
  const selector = useMemo(
    () => createEntityRecordCountMatchingQuerySelector(entityName, query, context),
    [entityName, query, contextKey],
  );

  return useClientStoreSelector(selector);
}

export function useRecord(recordId: string) {
  return useClientStoreSelector((snapshot) => snapshot.recordsById[recordId]);
}

export function useRecordCreatedAt(recordId: string) {
  return useClientStoreSelector((snapshot) => snapshot.recordsById[recordId]?.createdAt);
}

export function useRecordField(recordId: string, fieldName: string) {
  return useClientStoreSelector((snapshot) => {
    return snapshot.recordsById[recordId]?.values[fieldName];
  });
}

export function useCursor() {
  return useClientStoreSelector((snapshot) => snapshot.cursor);
}

export function useLastSyncedAt() {
  return useClientStoreSelector((snapshot) => snapshot.lastSyncedAt);
}

export function connectBroadcastToClientStore(schemaKey: SchemaKey) {
  return listenForClientEvents(schemaKey, (event) => {
    if (
      event.type === "records-updated" ||
      event.type === "cursor-updated" ||
      event.type === "schema-updated"
    ) {
      void refreshClientStoreFromDb(schemaKey);
    }
  });
}

function useClientStoreSelector<T>(selector: (snapshot: NormalizedClientState) => T) {
  return useSyncExternalStore(
    (listener) => subscribeToClientStoreSelector(selector, listener),
    () => selector(state),
    () => selector(state),
  );
}

function applyLocalSnapshot(schemaKey: SchemaKey, snapshot: LocalSnapshot) {
  if (!shouldApplySchemaKey(schemaKey)) {
    return;
  }

  updateState((current) => ({
    activeSchemaKey: schemaKey,
    hydrated: true,
    schema: reuseSchema(current.schema, snapshot.schema),
    schemaUpdatedAt: snapshot.schemaUpdatedAt,
    recordsById: reconcileRecordsById(current.recordsById, snapshot.records),
    recordIdsByEntity: reconcileRecordIdsByEntity(current.recordIdsByEntity, snapshot.records),
    cursor: snapshot.cursor,
    lastSyncedAt: snapshot.lastSyncedAt,
  }));
}

function emptyClientState(activeSchemaKey: SchemaKey | null): NormalizedClientState {
  return {
    activeSchemaKey,
    hydrated: false,
    schema: null,
    schemaUpdatedAt: null,
    recordsById: {},
    recordIdsByEntity: {},
    cursor: 0,
    lastSyncedAt: null,
  };
}

function shouldApplySchemaKey(schemaKey: SchemaKey | undefined) {
  return (
    schemaKey === undefined || state.activeSchemaKey === null || state.activeSchemaKey === schemaKey
  );
}

function updateState(getNextState: (current: NormalizedClientState) => NormalizedClientState) {
  setState(getNextState(state));
}

function setState(nextState: NormalizedClientState) {
  if (nextState === state || normalizedStatesEqual(state, nextState)) {
    return;
  }

  state = nextState;
  emit();
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function createEntityRecordIdsMatchingQuerySelector(
  entityName: string,
  query: QueryExpression,
  context?: QueryEvaluationContext,
) {
  let previousRecordIds: string[] | undefined;
  let previousRecordsById: Record<string, StoredRecord> | undefined;
  let previousContextKey: string | undefined;
  let previousResult = EMPTY_RECORD_IDS;

  return (snapshot: QuerySelectorSnapshot) => {
    const recordIds = snapshot.recordIdsByEntity[entityName] ?? EMPTY_RECORD_IDS;
    const contextKey = queryEvaluationContextCacheKey(context);

    if (query.kind === "all") {
      return recordIds;
    }

    if (
      recordIds === previousRecordIds &&
      snapshot.recordsById === previousRecordsById &&
      contextKey === previousContextKey
    ) {
      return previousResult;
    }

    const matchingRecordIds = recordIds.filter((recordId) => {
      const record = snapshot.recordsById[recordId];

      return record ? matchesQuery(record, query, context) : false;
    });

    previousRecordIds = recordIds;
    previousRecordsById = snapshot.recordsById;
    previousContextKey = contextKey;
    previousResult = reuseStringArray(previousResult, matchingRecordIds);

    return previousResult;
  };
}

export function createEntityRecordOptionsMatchingQuerySelector(
  entityName: string,
  query: QueryExpression,
  labelField: string,
  context?: QueryEvaluationContext,
) {
  let previousRecordIds: string[] | undefined;
  let previousRecordsById: Record<string, StoredRecord> | undefined;
  let previousContextKey: string | undefined;
  let previousResult = EMPTY_REFERENCE_OPTIONS;

  return (snapshot: QuerySelectorSnapshot) => {
    const recordIds = snapshot.recordIdsByEntity[entityName] ?? EMPTY_RECORD_IDS;
    const contextKey = queryEvaluationContextCacheKey(context);

    if (
      recordIds === previousRecordIds &&
      snapshot.recordsById === previousRecordsById &&
      contextKey === previousContextKey
    ) {
      return previousResult;
    }

    const options = recordIds.flatMap((recordId) => {
      const record = snapshot.recordsById[recordId];

      if (!record || !matchesQuery(record, query, context)) {
        return [];
      }

      return [{ id: recordId, label: referenceOptionLabel(record, labelField) }];
    });

    previousRecordIds = recordIds;
    previousRecordsById = snapshot.recordsById;
    previousContextKey = contextKey;
    previousResult = reuseReferenceOptions(previousResult, options);

    return previousResult;
  };
}

export function createEntityRecordCountMatchingQuerySelector(
  entityName: string,
  query: QueryExpression,
  context?: QueryEvaluationContext,
) {
  return (snapshot: QuerySelectorSnapshot) => {
    const recordIds = snapshot.recordIdsByEntity[entityName] ?? EMPTY_RECORD_IDS;

    if (query.kind === "all") {
      return recordIds.length;
    }

    let count = 0;

    for (const recordId of recordIds) {
      const record = snapshot.recordsById[recordId];

      if (record && matchesQuery(record, query, context)) {
        count += 1;
      }
    }

    return count;
  };
}

export function createReferenceOptionsSelector(entityName: string, displayField?: string) {
  let previousRecordIds: string[] | undefined;
  let previousRecordsById: Record<string, StoredRecord> | undefined;
  let previousResult = EMPTY_REFERENCE_OPTIONS;

  return (snapshot: ReferenceOptionsSnapshot) => {
    const recordIds = snapshot.recordIdsByEntity[entityName] ?? EMPTY_RECORD_IDS;

    if (recordIds === previousRecordIds && snapshot.recordsById === previousRecordsById) {
      return previousResult;
    }

    const options = recordIds.map((recordId) => {
      const record = snapshot.recordsById[recordId];

      return {
        id: recordId,
        label: record ? referenceOptionLabel(record, displayField) : recordId,
      };
    });

    previousRecordIds = recordIds;
    previousRecordsById = snapshot.recordsById;
    previousResult = reuseReferenceOptions(previousResult, options);

    return previousResult;
  };
}

function referenceOptionLabel(record: StoredRecord, displayField?: string) {
  if (!displayField) {
    return record.id;
  }

  const value = record.values[displayField];

  return typeof value === "string" && value.trim() !== "" ? value : record.id;
}

function queryEvaluationContextCacheKey(context: QueryEvaluationContext | undefined) {
  if (!context) {
    return "";
  }

  const values = Object.entries(context.values ?? {})
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|");

  return `${context.today};${values}`;
}

function reuseStringArray(existing: string[], next: string[]) {
  if (arraysEqual(existing, next)) {
    return existing;
  }

  return next.length === 0 ? EMPTY_RECORD_IDS : next;
}

function reuseReferenceOptions(existing: ReferenceOption[], next: ReferenceOption[]) {
  if (referenceOptionsEqual(existing, next)) {
    return existing;
  }

  return next.length === 0 ? EMPTY_REFERENCE_OPTIONS : next;
}

function recordsById(records: StoredRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function reconcileRecordsById(
  existingRecordsById: Record<string, StoredRecord>,
  records: StoredRecord[],
) {
  let changed = Object.keys(existingRecordsById).length !== records.length;
  const nextRecordsById: Record<string, StoredRecord> = {};

  for (const record of records) {
    const existing = existingRecordsById[record.id];
    const nextRecord = storedRecordsEqual(existing, record) ? existing : record;

    nextRecordsById[record.id] = nextRecord;

    if (nextRecord !== existing) {
      changed = true;
    }
  }

  return changed ? nextRecordsById : existingRecordsById;
}

function recordIdsByEntity(records: StoredRecord[]) {
  const idsByEntity: Record<string, string[]> = {};

  for (const record of records) {
    if (record.deletedAt) {
      continue;
    }

    idsByEntity[record.entity] = [...(idsByEntity[record.entity] ?? []), record.id];
  }

  return idsByEntity;
}

function reconcileRecordIdsByEntity(
  existingIdsByEntity: Record<string, string[]>,
  records: StoredRecord[],
) {
  const nextIdsByEntity = recordIdsByEntity(records);
  let changed = !sameKeys(existingIdsByEntity, nextIdsByEntity);
  const reconciledIdsByEntity: Record<string, string[]> = {};

  for (const [entityName, nextIds] of Object.entries(nextIdsByEntity)) {
    const existingIds = existingIdsByEntity[entityName];
    const reconciledIds = arraysEqual(existingIds, nextIds) ? existingIds : nextIds;

    reconciledIdsByEntity[entityName] = reconciledIds;

    if (reconciledIds !== existingIds) {
      changed = true;
    }
  }

  return changed ? reconciledIdsByEntity : existingIdsByEntity;
}

function normalizedStatesEqual(left: NormalizedClientState, right: NormalizedClientState) {
  return (
    left.activeSchemaKey === right.activeSchemaKey &&
    left.hydrated === right.hydrated &&
    left.schema === right.schema &&
    left.schemaUpdatedAt === right.schemaUpdatedAt &&
    left.recordsById === right.recordsById &&
    left.recordIdsByEntity === right.recordIdsByEntity &&
    left.cursor === right.cursor &&
    left.lastSyncedAt === right.lastSyncedAt
  );
}

function reuseSchema(existingSchema: AppSchema | null, nextSchema: AppSchema | null) {
  if (existingSchema === nextSchema) {
    return existingSchema;
  }

  if (!existingSchema || !nextSchema) {
    return nextSchema;
  }

  return JSON.stringify(existingSchema) === JSON.stringify(nextSchema)
    ? existingSchema
    : nextSchema;
}

function sameKeys(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return leftKeys.length === rightKeys.length && leftKeys.every((key) => key in right);
}

function arraysEqual<T>(left: T[] | undefined, right: T[]) {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function referenceOptionsEqual(left: ReferenceOption[] | undefined, right: ReferenceOption[]) {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every(
      (value, index) => value.id === right[index]?.id && value.label === right[index].label,
    )
  );
}

function storedRecordsEqual(left: StoredRecord | undefined, right: StoredRecord) {
  if (!left) {
    return false;
  }

  return (
    left.id === right.id &&
    left.entity === right.entity &&
    left.createdAt === right.createdAt &&
    left.deletedAt === right.deletedAt &&
    recordValuesEqual(left.values, right.values)
  );
}

function recordValuesEqual(left: Record<string, FieldValue>, right: Record<string, FieldValue>) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
}

function sortRecords(records: StoredRecord[]) {
  return records.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}
