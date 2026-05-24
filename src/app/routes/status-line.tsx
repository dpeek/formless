import {
  appStorageIdentityForClientTarget,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import {
  useActiveClientStorageName,
  useCursor,
  useLastSyncedAt,
  useSchema,
} from "../../client/store.ts";
import { useSyncStatus, type SyncStatus } from "../../client/sync-status.ts";

type SyncStatusTone = "default" | "dark";

export function SyncStatusControl({
  target,
  tone = "default",
}: {
  target: ClientAppTarget;
  tone?: SyncStatusTone;
}) {
  const activeClientStorageName = useActiveClientStorageName();
  const schema = useSchema();
  const lastSyncedAt = useLastSyncedAt();
  const cursor = useCursor();
  const syncStatus = useSyncStatus();
  const identity = appStorageIdentityForClientTarget(target);
  const storeMatchesWorld =
    activeClientStorageName === null || activeClientStorageName === identity.browserDatabaseName;
  const displaySchema = storeMatchesWorld ? schema : null;
  const displayCursor = storeMatchesWorld ? cursor : 0;
  const displayLastSyncedAt = storeMatchesWorld ? lastSyncedAt : null;
  const worldKey = identity.authorityName;
  const summary = syncStatusSummary(syncStatus);

  return (
    <details className="group relative" data-sync-status-control>
      <summary
        aria-label={`Sync status: ${syncStatus.message}`}
        className={syncStatusSummaryClassName(syncStatus, tone)}
      >
        <span className={syncStatusDotClassName(syncStatus)} aria-hidden="true" />
        <span>{summary}</span>
        <span className="sr-only" aria-live="polite" role="status">
          {syncStatus.message}
        </span>
      </summary>
      <div
        aria-label={worldKey ? `Sync status details for ${worldKey}` : "Sync status details"}
        className="absolute right-0 z-40 mt-2 w-72 rounded border border-border bg-overlay p-3 text-overlay-fg shadow-md"
        data-sync-status-details
      >
        <div className="space-y-1 border-b border-border pb-3">
          <p className="text-xs font-medium">Sync details</p>
          <p className="text-xs text-slate-600">{syncStatus.message}</p>
        </div>

        <dl className="mt-3 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <dt className="text-slate-500">World</dt>
          <dd className="min-w-0 truncate">
            <code>{worldKey ?? "none"}</code>
          </dd>

          <dt className="text-slate-500">Schema</dt>
          <dd>{displaySchema ? `v${displaySchema.version}` : "Loading"}</dd>

          <dt className="text-slate-500">Cursor</dt>
          <dd>{displayCursor}</dd>

          <dt className="text-slate-500">Push sync</dt>
          <dd>
            <span className="capitalize">{syncStatus.state}</span>
            <span aria-hidden="true"> · </span>
            <span>{syncStatus.message}</span>
          </dd>

          <dt className="text-slate-500">Last sync</dt>
          <dd>
            {displayLastSyncedAt ? (
              <time dateTime={displayLastSyncedAt} title={displayLastSyncedAt}>
                {formatTimestamp(displayLastSyncedAt)}
              </time>
            ) : (
              "None yet"
            )}
          </dd>
        </dl>
      </div>
    </details>
  );
}

function syncStatusSummary(status: SyncStatus) {
  switch (status.state) {
    case "error":
      return "Sync issue";
    case "syncing":
      return "Syncing";
    case "idle":
      return "Synced";
  }
}

function syncStatusSummaryClassName(status: SyncStatus, tone: SyncStatusTone) {
  const base =
    "flex h-7 cursor-pointer list-none items-center gap-1.5 rounded border px-2 text-xs font-medium transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden";

  if (tone === "dark") {
    switch (status.state) {
      case "error":
        return `${base} border-red-500/60 bg-red-950/60 text-red-200 hover:bg-red-950`;
      case "syncing":
        return `${base} border-amber-500/60 bg-amber-950/60 text-amber-100 hover:bg-amber-950`;
      case "idle":
        return `${base} border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800`;
    }
  }

  switch (status.state) {
    case "error":
      return `${base} border-red-300 bg-red-50 text-red-700`;
    case "syncing":
      return `${base} border-amber-300 bg-amber-50 text-amber-800`;
    case "idle":
      return `${base} border-border text-slate-600`;
  }
}

function syncStatusDotClassName(status: SyncStatus) {
  const base = "size-1.5 rounded-full";

  switch (status.state) {
    case "error":
      return `${base} bg-red-500`;
    case "syncing":
      return `${base} bg-amber-500`;
    case "idle":
      return `${base} bg-emerald-500`;
  }
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
