import type { StoredRecord } from "@dpeek/formless-storage";

import { getBootstrapRecords, getRecordWriteResponseById, getStoredRecord } from "./storage.ts";
import type { RecordWriteResponse } from "./storage-write-log.ts";

export type AuthorityRecordValidationReader = {
  readActiveRecords(): StoredRecord[];
  readStoredRecord(recordId: string): StoredRecord | undefined;
  readStoredReplay(writeId: string): RecordWriteResponse | undefined;
};

export function authorityStorageRecordValidationReader(
  storage: DurableObjectStorage,
): AuthorityRecordValidationReader {
  return {
    readActiveRecords: () => getBootstrapRecords(storage).filter((record) => !record.deletedAt),
    readStoredRecord: (recordId) => getStoredRecord(storage, recordId),
    readStoredReplay: (writeId) => getRecordWriteResponseById(storage, writeId),
  };
}
