import { useSyncExternalStore } from "react";

export type SyncStatus = {
  state: "idle" | "syncing" | "error";
  message: string;
};

type SyncStatusListener = () => void;

const listeners = new Set<SyncStatusListener>();

let status: SyncStatus = {
  state: "idle",
  message: "Local cache ready.",
};

export function setSyncStatus(nextStatus: SyncStatus) {
  if (status.state === nextStatus.state && status.message === nextStatus.message) {
    return;
  }

  status = nextStatus;
  for (const listener of listeners) {
    listener();
  }
}

export function resetSyncStatus() {
  setSyncStatus({
    state: "idle",
    message: "Local cache ready.",
  });
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribeToSyncStatus, getSyncStatus, getSyncStatus);
}

function getSyncStatus() {
  return status;
}

function subscribeToSyncStatus(listener: SyncStatusListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
