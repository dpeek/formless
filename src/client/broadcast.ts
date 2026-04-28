export type BroadcastEventType = "records-updated" | "cursor-updated" | "sync-requested";

export type BroadcastEvent = {
  type: BroadcastEventType;
};

const CHANNEL_NAME = "formless";

export function publishClientEvent(type: BroadcastEventType) {
  const channel = createChannel();

  if (!channel) {
    return;
  }

  channel.postMessage({ type } satisfies BroadcastEvent);
  channel.close();
}

export function listenForClientEvents(listener: (event: BroadcastEvent) => void) {
  const channel = createChannel();

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

function createChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return undefined;
  }

  return new BroadcastChannel(CHANNEL_NAME);
}

function isBroadcastEvent(value: unknown): value is BroadcastEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    (value.type === "records-updated" ||
      value.type === "cursor-updated" ||
      value.type === "sync-requested")
  );
}
