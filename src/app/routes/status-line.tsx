import { useCursor, useLastSyncedAt } from "../../client/store.ts";
import { useSyncStatus, type SyncStatus } from "../../client/sync-status.ts";

export function DeveloperStatusLine({
  schemaVersion,
  status,
}: {
  schemaVersion?: number;
  status?: SyncStatus;
}) {
  const globalStatus = useSyncStatus();
  const lastSyncedAt = useLastSyncedAt();
  const cursor = useCursor();
  const syncStatus = status ?? globalStatus;

  return (
    <p className="text-sm text-slate-600" role="status">
      <span>{schemaVersion ? `Schema v${schemaVersion}` : "Schema loading"}</span>
      <span aria-hidden="true"> · </span>
      <span>Cursor {cursor}</span>
      <span aria-hidden="true"> · </span>
      <span>{syncStatus.message}</span>
      {lastSyncedAt ? (
        <>
          <span aria-hidden="true"> · </span>
          <time dateTime={lastSyncedAt} title={lastSyncedAt}>
            Last sync {formatTimestamp(lastSyncedAt)}
          </time>
        </>
      ) : null}
    </p>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
