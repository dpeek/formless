import type { StoredRecord } from "../shared/protocol.ts";
import {
  matchesQuery,
  type QueryEvaluationContext,
  type QueryExpression,
} from "../shared/query.ts";

export type BrowserReplicaProjectionSnapshot = {
  recordsById: Record<string, StoredRecord>;
  recordIdsByEntity: Record<string, string[]>;
};

export type ReferenceOption = {
  id: string;
  label: string;
};

export const EMPTY_RECORD_IDS: string[] = [];

const EMPTY_REFERENCE_OPTIONS: ReferenceOption[] = [];

export function createEntityRecordIdsMatchingQuerySelector(
  entityName: string,
  query: QueryExpression,
  context?: QueryEvaluationContext,
) {
  let previousRecordIds: string[] | undefined;
  let previousRecordsById: Record<string, StoredRecord> | undefined;
  let previousContextKey: string | undefined;
  let previousResult = EMPTY_RECORD_IDS;

  return (snapshot: BrowserReplicaProjectionSnapshot) => {
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

  return (snapshot: BrowserReplicaProjectionSnapshot) => {
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
  return (snapshot: BrowserReplicaProjectionSnapshot) => {
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

export function createEntityRecordCountReferencingFieldSelector(
  entityName: string,
  fieldName: string,
  referencedRecordId: string,
) {
  return (snapshot: BrowserReplicaProjectionSnapshot) => {
    const recordIds = snapshot.recordIdsByEntity[entityName] ?? EMPTY_RECORD_IDS;
    let count = 0;

    for (const recordId of recordIds) {
      const record = snapshot.recordsById[recordId];

      if (record?.values[fieldName] === referencedRecordId) {
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

  return (snapshot: BrowserReplicaProjectionSnapshot) => {
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

export function queryEvaluationContextCacheKey(context: QueryEvaluationContext | undefined) {
  if (!context) {
    return "";
  }

  const values = Object.entries(context.values ?? {})
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|");

  return `${context.today};${values}`;
}

function referenceOptionLabel(record: StoredRecord, displayField?: string) {
  if (!displayField) {
    return record.id;
  }

  const value = record.values[displayField];

  return typeof value === "string" && value.trim() !== "" ? value : record.id;
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
