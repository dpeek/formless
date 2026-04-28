import { listenForClientEvents } from "./broadcast.ts";
import { readLocalSnapshot, type LocalSnapshot } from "./db.ts";

export type ClientState = LocalSnapshot & {
  hydrated: boolean;
};

export type ClientStateListener = (state: ClientState) => void;

const listeners = new Set<ClientStateListener>();

let state: ClientState = {
  schema: null,
  schemaUpdatedAt: null,
  records: [],
  cursor: 0,
  lastSyncedAt: null,
  hydrated: false,
};

export function getClientState() {
  return state;
}

export function subscribeToClientState(listener: ClientStateListener) {
  listeners.add(listener);
  listener(state);

  return () => {
    listeners.delete(listener);
  };
}

export async function hydrateClientState() {
  await refreshClientStateFromDb();
}

export async function refreshClientStateFromDb() {
  state = {
    ...(await readLocalSnapshot()),
    hydrated: true,
  };

  emitState();
}

export function connectBroadcastToState() {
  return listenForClientEvents((event) => {
    if (
      event.type === "records-updated" ||
      event.type === "cursor-updated" ||
      event.type === "schema-updated"
    ) {
      void refreshClientStateFromDb();
    }
  });
}

function emitState() {
  for (const listener of listeners) {
    listener(state);
  }
}
