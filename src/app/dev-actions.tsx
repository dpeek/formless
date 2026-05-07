import { useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@formless/ui/alert-dialog";
import { Button } from "@formless/ui/button";
import { exportStoreSnapshot, resetSeedData, restoreStoreSnapshot } from "../client/sync.ts";
import type { BootstrapResponse, StoreSnapshot } from "../shared/protocol.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../shared/schema-apps.ts";

type DevActionStatus = {
  pending: boolean;
  error: string | null;
  message: string | null;
};

type SourceResetControlProps = {
  buttonLabel?: string;
  className?: string;
  onResetSourceData?: (response: BootstrapResponse) => void;
  schemaKey: SchemaKey;
};

type DevActionsProps = {
  schemaKey: SchemaKey;
  onResetSourceData?: (response: BootstrapResponse) => void;
  onRestoreSnapshot?: (response: BootstrapResponse) => void;
  showReset?: boolean;
  showSnapshots?: boolean;
};

export function SourceResetControl({
  buttonLabel = "Reset",
  className,
  onResetSourceData,
  schemaKey,
}: SourceResetControlProps) {
  const app = getSchemaAppDefinition(schemaKey);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<DevActionStatus>({
    pending: false,
    error: null,
    message: null,
  });

  async function resetSourceData() {
    if (resetStatus.pending) {
      return;
    }

    setResetDialogOpen(false);
    setResetStatus({ pending: true, error: null, message: null });

    try {
      const response = await resetSeedData(schemaKey);
      onResetSourceData?.(response);
      setResetStatus({
        pending: false,
        error: null,
        message: `Reset ${app.label} source schema and seed data at ${response.schemaUpdatedAt}.`,
      });
    } catch (error) {
      setResetStatus({
        pending: false,
        error: error instanceof Error ? error.message : "Source reset failed.",
        message: null,
      });
    }
  }

  return (
    <div className={className}>
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogTrigger
          render={<Button disabled={resetStatus.pending} type="button" variant="destructive" />}
        >
          {resetStatus.pending ? "Resetting..." : buttonLabel}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {app.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the source schema and source seed data for <code>{app.key}</code>.
              Existing records for this world are replaced by the source seed records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void resetSourceData()}
              type="button"
              variant="destructive"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DevActionMessage status={resetStatus} />
    </div>
  );
}

export function DevActions({
  schemaKey,
  onResetSourceData,
  onRestoreSnapshot,
  showReset = true,
  showSnapshots = true,
}: DevActionsProps) {
  const app = getSchemaAppDefinition(schemaKey);
  const restoreInputId = useId();
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);
  const [exportStatus, setExportStatus] = useState<DevActionStatus>({
    pending: false,
    error: null,
    message: null,
  });
  const [restoreStatus, setRestoreStatus] = useState<DevActionStatus>({
    pending: false,
    error: null,
    message: null,
  });

  async function exportSnapshot() {
    if (exportStatus.pending) {
      return;
    }

    setExportStatus({ pending: true, error: null, message: null });

    try {
      const snapshot = await exportStoreSnapshot(schemaKey);

      downloadStoreSnapshot(snapshot);
      setExportStatus({
        pending: false,
        error: null,
        message: `Exported ${app.label} snapshot from ${snapshot.exportedAt}.`,
      });
    } catch (error) {
      setExportStatus({
        pending: false,
        error: error instanceof Error ? error.message : "Snapshot export failed.",
        message: null,
      });
    }
  }

  async function restoreSnapshot() {
    const file = selectedRestoreFile;

    if (restoreStatus.pending || !file) {
      return;
    }

    setRestoreDialogOpen(false);
    setRestoreStatus({ pending: true, error: null, message: null });

    try {
      const snapshot = JSON.parse(await file.text()) as unknown;
      const response = await restoreStoreSnapshot(schemaKey, snapshot);

      onRestoreSnapshot?.(response);
      setSelectedRestoreFile(null);
      if (restoreInputRef.current) {
        restoreInputRef.current.value = "";
      }
      setRestoreStatus({
        pending: false,
        error: null,
        message: `Restored ${app.label} snapshot at ${response.schemaUpdatedAt}.`,
      });
    } catch (error) {
      setRestoreStatus({
        pending: false,
        error: error instanceof Error ? error.message : "Snapshot restore failed.",
        message: null,
      });
    }
  }

  return (
    <section
      aria-label={`${app.label} developer controls`}
      className="rounded border border-slate-200 p-3"
    >
      {showReset ? (
        <div
          aria-label={`${app.label} source reset controls`}
          className="flex flex-wrap items-center gap-3"
        >
          <SourceResetControl
            buttonLabel="Reset"
            onResetSourceData={onResetSourceData}
            schemaKey={schemaKey}
          />
        </div>
      ) : null}

      {showSnapshots ? (
        <div
          aria-label={`${app.label} store snapshot controls`}
          className={`${showReset ? "mt-3 " : ""}flex flex-wrap items-end gap-3`}
        >
          <Button
            disabled={exportStatus.pending}
            onClick={() => void exportSnapshot()}
            type="button"
            variant="outline"
          >
            {exportStatus.pending ? "Exporting..." : "Export store snapshot"}
          </Button>

          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-700" htmlFor={restoreInputId}>
              {app.label} snapshot file
            </label>
            <input
              ref={restoreInputRef}
              accept="application/json,.json"
              className="block w-72 max-w-full rounded border border-slate-300 px-2 py-1 text-sm"
              disabled={restoreStatus.pending}
              id={restoreInputId}
              onChange={(event) => {
                setSelectedRestoreFile(event.currentTarget.files?.[0] ?? null);
                setRestoreStatus({ pending: false, error: null, message: null });
              }}
              type="file"
            />
          </div>

          <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  disabled={restoreStatus.pending || !selectedRestoreFile}
                  type="button"
                  variant="destructive"
                />
              }
            >
              {restoreStatus.pending ? "Restoring..." : "Restore store snapshot"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore {app.label} store snapshot?</AlertDialogTitle>
                <AlertDialogDescription>
                  This replaces the authority store for <code>{app.key}</code> with the selected
                  snapshot JSON.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={restoreStatus.pending || !selectedRestoreFile}
                  onClick={() => void restoreSnapshot()}
                  type="button"
                  variant="destructive"
                >
                  Restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}

      {showSnapshots && selectedRestoreFile ? (
        <p className="mt-2 text-xs text-slate-600">Selected {selectedRestoreFile.name}</p>
      ) : null}
      <DevActionMessage status={exportStatus} />
      <DevActionMessage status={restoreStatus} />
    </section>
  );
}

function DevActionMessage({ status }: { status: DevActionStatus }) {
  if (status.error) {
    return <p className="mt-2 text-sm text-red-700">{status.error}</p>;
  }

  if (status.message) {
    return <p className="mt-2 text-sm text-slate-600">{status.message}</p>;
  }

  return null;
}

function downloadStoreSnapshot(snapshot: StoreSnapshot) {
  const snapshotJson = `${JSON.stringify(snapshot, null, 2)}\n`;
  const blob = new Blob([snapshotJson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = storeSnapshotFilename(snapshot);
  link.rel = "noopener";
  link.click();
  URL.revokeObjectURL(url);
}

function storeSnapshotFilename(snapshot: StoreSnapshot) {
  const exportedAt = snapshot.exportedAt.replace(/[:.]/g, "-");

  return `formless-${snapshot.schemaKey}-snapshot-${exportedAt}.json`;
}
