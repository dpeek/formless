import type { SchemaKey } from "../shared/schema-apps.ts";

export type BroadcastEventType =
  | "records-updated"
  | "cursor-updated"
  | "schema-updated"
  | "sync-requested";

export type BroadcastEvent = {
  type: BroadcastEventType;
};

const CHANNEL_NAME_PREFIX = "formless";

export function publishClientEvent(schemaKey: SchemaKey, type: BroadcastEventType) {
  const channel = createChannel(schemaKey);

  if (!channel) {
    return;
  }

  channel.postMessage({ type } satisfies BroadcastEvent);
  channel.close();
}

export function listenForClientEvents(
  schemaKey: SchemaKey,
  listener: (event: BroadcastEvent) => void,
) {
  const channel = createChannel(schemaKey);

  if (!channel) {
    return () => {};
  }

  channel.onmessage = (message) => {
    const event = message.data as unknown;

    if (isBroadcastEvent(event)) {
      listener(event);
    }
  };

  return () => channel.close();
}

function createChannel(schemaKey: SchemaKey) {
  if (typeof BroadcastChannel === "undefined") {
    return undefined;
  }

  return new BroadcastChannel(channelName(schemaKey));
}

export function channelName(
  schemaKey: SchemaKey,
  projectId: string | undefined = clientProjectStorageId(),
) {
  const normalizedProjectId = normalizeProjectStorageId(projectId);

  return normalizedProjectId
    ? `${CHANNEL_NAME_PREFIX}:${normalizedProjectId}:${schemaKey}`
    : `${CHANNEL_NAME_PREFIX}:${schemaKey}`;
}

function isBroadcastEvent(value: unknown): value is BroadcastEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    (value.type === "records-updated" ||
      value.type === "cursor-updated" ||
      value.type === "schema-updated" ||
      value.type === "sync-requested")
  );
}

function clientProjectStorageId(): string | undefined {
  return stringConfigValue(import.meta.env.VITE_FORMLESS_SITE_PROJECT_ID);
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeProjectStorageId(value: string | undefined): string | undefined {
  if (!value || !/^[A-Za-z0-9._-]+$/.test(value)) {
    return undefined;
  }

  return value;
}
