import { useId, useRef, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import {
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { exportStoreSnapshot, resetSeedData, restoreStoreSnapshot } from "../client/sync.ts";
import { setSyncStatus } from "../client/sync-status.ts";
import type { ClientAppTarget } from "../client/app-target.ts";
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
  target?: ClientAppTarget;
};

type SnapshotControlProps = {
  buttonClassName?: string;
  buttonLabel?: string;
  className?: string;
  messageClassName?: string;
  schemaKey: SchemaKey;
  target?: ClientAppTarget;
};

type SnapshotRestoreControlProps = SnapshotControlProps & {
  onRestoreSnapshot?: (response: BootstrapResponse) => void;
};

export function SourceResetControl({
  buttonLabel = "Reset",
  className,
  onResetSourceData,
  schemaKey,
  target = schemaKey,
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
      const response = await resetSeedData(target);
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
      <Button
        isDisabled={resetStatus.pending}
        onPress={() => setResetDialogOpen(true)}
        type="button"
        intent="danger"
      >
        {resetStatus.pending ? "Resetting..." : buttonLabel}
      </Button>
      <ModalContent
        closeButton={false}
        isOpen={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        role="alertdialog"
      >
        <ModalHeader>
          <ModalTitle>Reset {app.label}?</ModalTitle>
          <ModalDescription>
            This restores the source schema and source seed data for <code>{app.key}</code>.
            Existing records for this world are replaced by the source seed records.
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <ModalClose intent="outline">Cancel</ModalClose>
          <Button onPress={() => void resetSourceData()} type="button" intent="danger">
            Reset
          </Button>
        </ModalFooter>
      </ModalContent>
      <DevActionMessage status={resetStatus} />
    </div>
  );
}

export function SnapshotExportControl({
  buttonClassName,
  buttonLabel = "Export",
  className,
  messageClassName,
  schemaKey,
  target = schemaKey,
}: SnapshotControlProps) {
  const app = getSchemaAppDefinition(schemaKey);
  const [exportStatus, setExportStatus] = useState<DevActionStatus>({
    pending: false,
    error: null,
    message: null,
  });

  async function exportSnapshot() {
    if (exportStatus.pending) {
      return;
    }

    setExportStatus({ pending: true, error: null, message: null });
    setSyncStatus({ state: "syncing", message: `Exporting ${app.label} store snapshot...` });

    try {
      const snapshot = await exportStoreSnapshot(target);
      const message = `Exported ${app.label} snapshot from ${snapshot.exportedAt}.`;

      downloadStoreSnapshot(snapshot);
      setExportStatus({
        pending: false,
        error: null,
        message,
      });
      setSyncStatus({ state: "idle", message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot export failed.";

      setExportStatus({
        pending: false,
        error: message,
        message: null,
      });
      setSyncStatus({ state: "error", message });
    }
  }

  return (
    <div className={className}>
      <Button
        className={buttonClassName}
        isDisabled={exportStatus.pending}
        onPress={() => void exportSnapshot()}
        type="button"
        intent="outline"
      >
        {exportStatus.pending ? "Exporting..." : buttonLabel}
      </Button>
      <DevActionMessage className={messageClassName} status={exportStatus} />
    </div>
  );
}

export function SnapshotRestoreControl({
  buttonClassName,
  buttonLabel = "Restore",
  className,
  messageClassName,
  onRestoreSnapshot,
  schemaKey,
  target = schemaKey,
}: SnapshotRestoreControlProps) {
  const app = getSchemaAppDefinition(schemaKey);
  const restoreInputId = useId();
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<DevActionStatus>({
    pending: false,
    error: null,
    message: null,
  });

  async function restoreSnapshot(file: File) {
    if (restoreStatus.pending) {
      return;
    }

    if (!file) {
      return;
    }

    setRestoreStatus({ pending: true, error: null, message: null });
    setSyncStatus({ state: "syncing", message: `Restoring ${app.label} store snapshot...` });

    try {
      const snapshot = JSON.parse(await file.text()) as unknown;
      const response = await restoreStoreSnapshot(target, snapshot);
      const message = `Restored ${app.label} snapshot at ${response.schemaUpdatedAt}.`;

      onRestoreSnapshot?.(response);
      setRestoreStatus({
        pending: false,
        error: null,
        message,
      });
      setSyncStatus({ state: "idle", message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot restore failed.";

      setRestoreStatus({
        pending: false,
        error: message,
        message: null,
      });
      setSyncStatus({ state: "error", message });
    } finally {
      if (restoreInputRef.current) {
        restoreInputRef.current.value = "";
      }
    }
  }

  return (
    <div className={className}>
      <label
        aria-disabled={restoreStatus.pending}
        className={buttonClassName}
        htmlFor={restoreInputId}
      >
        {restoreStatus.pending ? "Restoring..." : buttonLabel}
        <input
          ref={restoreInputRef}
          accept="application/json,.json"
          aria-label={`Restore snapshot for ${app.label}`}
          className="sr-only"
          disabled={restoreStatus.pending}
          id={restoreInputId}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];

            if (file) {
              void restoreSnapshot(file);
            }
          }}
          type="file"
        />
      </label>
      <DevActionMessage className={messageClassName} status={restoreStatus} />
    </div>
  );
}

function DevActionMessage({ className, status }: { className?: string; status: DevActionStatus }) {
  if (status.error) {
    return <p className={className ?? "mt-2 text-sm text-red-700"}>{status.error}</p>;
  }

  if (status.message) {
    return <p className={className ?? "mt-2 text-sm text-slate-600"}>{status.message}</p>;
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
