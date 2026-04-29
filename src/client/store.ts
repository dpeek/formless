import { useSyncExternalStore } from "react";
import { listenForClientEvents } from "./broadcast.ts";
import { readLocalSnapshot, type LocalSnapshot } from "./db.ts";
import { selectHomeModel, type HomeViewModel } from "./views.ts";
import { nowIsoString } from "../shared/clock.ts";
import type { BootstrapResponse, ChangeRow, FieldValue, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

export type NormalizedClientState = {
  hydrated: boolean;
  schema: AppSchema | null;
  schemaUpdatedAt: string | null;
  recordsById: Record<string, StoredRecord>;
  recordIdsByEntity: Record<string, string[]>;
  cursor: number;
  lastSyncedAt: string | null;
};

export type ClientStoreState = NormalizedClientState & {
  homeViewModel: HomeViewModel | undefined;
};

type StoreListener = () => void;

const EMPTY_RECORD_IDS: string[] = [];
const listeners = new Set<StoreListener>();

let state: ClientStoreState = withDerivedState({
  hydrated: false,
  schema: null,
  schemaUpdatedAt: null,
  recordsById: {},
  recordIdsByEntity: {},
  cursor: 0,
  lastSyncedAt: null,
});

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
  selector: (snapshot: ClientStoreState) => T,
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
  setState(
    withDerivedState({
      hydrated: false,
      schema: null,
      schemaUpdatedAt: null,
      recordsById: {},
      recordIdsByEntity: {},
      cursor: 0,
      lastSyncedAt: null,
    }),
  );
}

export async function hydrateClientStore() {
  applyLocalSnapshot(await readLocalSnapshot());
}

export async function refreshClientStoreFromDb() {
  applyLocalSnapshot(await readLocalSnapshot());
}

export function applyBootstrapResponse(response: BootstrapResponse) {
  setState(
    withDerivedState({
      hydrated: true,
      schema: response.schema,
      schemaUpdatedAt: response.schemaUpdatedAt,
      recordsById: recordsById(sortRecords(response.records)),
      recordIdsByEntity: recordIdsByEntity(sortRecords(response.records)),
      cursor: response.cursor,
      lastSyncedAt: nowIsoString(),
    }),
  );
}

export function applySchemaSave(schema: AppSchema, schemaUpdatedAt: string) {
  updateState((current) =>
    withDerivedState(
      {
        ...current,
        schema,
        schemaUpdatedAt,
        lastSyncedAt: nowIsoString(),
      },
      current,
    ),
  );
}

export function applyChanges(changes: ChangeRow[], cursor: number) {
  applyRecordMerge(
    changes.map((change) => change.payload),
    cursor,
  );
}

export function applyRecordMerge(recordsToMerge: StoredRecord[], cursor?: number) {
  updateState((current) => {
    let recordsByIdChanged = false;
    let recordIdsByEntity = current.recordIdsByEntity;
    const nextRecordsById = { ...current.recordsById };

    for (const record of recordsToMerge) {
      const existing = current.recordsById[record.id];

      if (!storedRecordsEqual(existing, record)) {
        recordsByIdChanged = true;
        nextRecordsById[record.id] = record;
      }

      if (!existing) {
        recordIdsByEntity = appendRecordId(recordIdsByEntity, record.entity, record.id);
        continue;
      }

      if (existing.entity !== record.entity) {
        recordIdsByEntity = moveRecordId(
          recordIdsByEntity,
          existing.entity,
          record.entity,
          record.id,
        );
      }
    }

    const cursorChanged = cursor !== undefined && cursor !== current.cursor;
    const hasLastSyncedAtUpdate = recordsToMerge.length > 0 || cursor !== undefined;

    if (!recordsByIdChanged && !cursorChanged && !hasLastSyncedAtUpdate) {
      return current;
    }

    return withDerivedState(
      {
        ...current,
        recordsById: recordsByIdChanged ? nextRecordsById : current.recordsById,
        recordIdsByEntity,
        cursor: cursor ?? current.cursor,
        lastSyncedAt: hasLastSyncedAtUpdate ? nowIsoString() : current.lastSyncedAt,
      },
      current,
    );
  });
}

export function useHydrated() {
  return useClientStoreSelector((snapshot) => snapshot.hydrated);
}

export function useSchema() {
  return useClientStoreSelector((snapshot) => snapshot.schema);
}

export function useHomeViewModel() {
  return useClientStoreSelector((snapshot) => snapshot.homeViewModel);
}

export function useEntityRecordIds(entityName: string) {
  return useClientStoreSelector((snapshot) => {
    return snapshot.recordIdsByEntity[entityName] ?? EMPTY_RECORD_IDS;
  });
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

export function connectBroadcastToClientStore() {
  return listenForClientEvents((event) => {
    if (
      event.type === "records-updated" ||
      event.type === "cursor-updated" ||
      event.type === "schema-updated"
    ) {
      void refreshClientStoreFromDb();
    }
  });
}

function useClientStoreSelector<T>(selector: (snapshot: ClientStoreState) => T) {
  return useSyncExternalStore(
    (listener) => subscribeToClientStoreSelector(selector, listener),
    () => selector(state),
    () => selector(state),
  );
}

function applyLocalSnapshot(snapshot: LocalSnapshot) {
  updateState((current) =>
    withDerivedState(
      {
        hydrated: true,
        schema: reuseSchema(current.schema, snapshot.schema),
        schemaUpdatedAt: snapshot.schemaUpdatedAt,
        recordsById: reconcileRecordsById(current.recordsById, snapshot.records),
        recordIdsByEntity: reconcileRecordIdsByEntity(current.recordIdsByEntity, snapshot.records),
        cursor: snapshot.cursor,
        lastSyncedAt: snapshot.lastSyncedAt,
      },
      current,
    ),
  );
}

function updateState(getNextState: (current: ClientStoreState) => ClientStoreState) {
  setState(getNextState(state));
}

function setState(nextState: ClientStoreState) {
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

function withDerivedState(
  state: NormalizedClientState,
  previousState?: ClientStoreState,
): ClientStoreState {
  return {
    ...state,
    homeViewModel:
      previousState?.schema === state.schema
        ? previousState.homeViewModel
        : state.schema
          ? selectHomeModel(state.schema)
          : undefined,
  };
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

function appendRecordId(
  idsByEntity: Record<string, string[]>,
  entityName: string,
  recordId: string,
) {
  const existingIds = idsByEntity[entityName] ?? EMPTY_RECORD_IDS;

  if (existingIds.includes(recordId)) {
    return idsByEntity;
  }

  return {
    ...idsByEntity,
    [entityName]: [...existingIds, recordId],
  };
}

function moveRecordId(
  idsByEntity: Record<string, string[]>,
  previousEntity: string,
  nextEntity: string,
  recordId: string,
) {
  const previousIds = idsByEntity[previousEntity] ?? EMPTY_RECORD_IDS;
  const nextIds = idsByEntity[nextEntity] ?? EMPTY_RECORD_IDS;

  return {
    ...idsByEntity,
    [previousEntity]: previousIds.filter((id) => id !== recordId),
    [nextEntity]: nextIds.includes(recordId) ? nextIds : [...nextIds, recordId],
  };
}

function normalizedStatesEqual(left: ClientStoreState, right: ClientStoreState) {
  return (
    left.hydrated === right.hydrated &&
    left.schema === right.schema &&
    left.schemaUpdatedAt === right.schemaUpdatedAt &&
    left.recordsById === right.recordsById &&
    left.recordIdsByEntity === right.recordIdsByEntity &&
    left.cursor === right.cursor &&
    left.lastSyncedAt === right.lastSyncedAt &&
    left.homeViewModel === right.homeViewModel
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

function storedRecordsEqual(left: StoredRecord | undefined, right: StoredRecord) {
  if (!left) {
    return false;
  }

  return (
    left.id === right.id &&
    left.entity === right.entity &&
    left.createdAt === right.createdAt &&
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
