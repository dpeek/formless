import { DurableObject } from "cloudflare:workers";
import { buildSitePageTree } from "../site/tree.ts";
import type { AppSchema } from "../shared/schema.ts";
import type {
  SitePageTreeResponse,
  SyncResponse,
  SyncSocketAttachment,
  SyncSocketServerMessage,
} from "../shared/protocol.ts";
import { isSyncSocketAttachment, isSyncSocketClientMessage } from "../shared/protocol.ts";
import {
  createStoredRecordOutcome,
  exportStorageSnapshot,
  mapWriteOutcome,
  ensureStorageTables,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  patchStoredRecordOutcome,
  resetStorageSchemaToSourceOutcome,
  resetStorageToSourceSeedOutcome,
  restoreStorageSnapshotOutcome,
  type StorageSource,
  type WriteOutcome,
  writeActiveSchemaOutcome,
} from "./storage.ts";
import {
  executeCreateAfterCreateHooks,
  executeEntityActionOutcome,
  validateEntityActionRequest,
} from "./actions.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import type { Env } from "./index.ts";
import { findWorkerSchemaAppDefinition, type WorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  validateMutationRequest,
  validateSchemaUpdateRequest,
  validateStoreSnapshotRestore,
  validateSourceSchemaReset,
} from "./authority-validation.ts";

export class FormlessAuthority extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ensureStorageTables(this.ctx.storage);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const route = parseAuthorityRoute(url.pathname);

    if (!route) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    const source = storageSourceFromApp(route.app);
    const writes = new AuthorityWriteModule(this.ctx.storage, source, () =>
      this.ctx.getWebSockets(),
    );

    try {
      if (request.method === "GET" && route.path === "/bootstrap") {
        const { schema, updatedAt } = initializeStorageFromSource(this.ctx.storage, source);

        return jsonResponse({
          schema,
          schemaUpdatedAt: updatedAt,
          records: getBootstrapRecords(this.ctx.storage),
          cursor: getCurrentCursor(this.ctx.storage),
        });
      }

      if (request.method === "GET" && route.path === "/schema") {
        const { schema, updatedAt } = initializeStorageFromSource(this.ctx.storage, source);

        return jsonResponse({ schema, updatedAt });
      }

      if (request.method === "GET" && route.path === "/snapshot") {
        initializeStorageFromSource(this.ctx.storage, source);

        return jsonResponse(exportStorageSnapshot(this.ctx.storage, route.app.key));
      }

      if (request.method === "GET" && isSiteTreePath(route.path)) {
        if (route.app.key !== "site") {
          throw new BadRequestError("Site page trees are only available for the site schema.");
        }

        const slug = parseSiteTreeSlug(route.path);
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const projection = buildSitePageTree(schema, getBootstrapRecords(this.ctx.storage), slug);

        if (!projection.tree) {
          return jsonResponse({ error: "Site page not found." }, 404);
        }

        const response: SitePageTreeResponse = projection.tree;

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/schema") {
        const currentSchema = initializeStorageFromSource(this.ctx.storage, source).schema;
        const records = getBootstrapRecords(this.ctx.storage);
        const nextSchema = validateSchemaUpdateRequest(
          await readJson(request),
          currentSchema,
          records,
        );
        const response = writes.apply(() => writeActiveSchemaOutcome(this.ctx.storage, nextSchema));

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/snapshot/restore") {
        const snapshot = validateStoreSnapshotRestore(await readJson(request), route.app.key);
        const response = writes.apply(() =>
          restoreStorageSnapshotOutcome(this.ctx.storage, snapshot),
        );

        return jsonResponse(response);
      }

      if (request.method === "GET" && route.path === "/sync") {
        const after = parseCursor(url.searchParams.get("after"));
        const { schema, updatedAt } = initializeStorageFromSource(this.ctx.storage, source);
        const changes = getChangesAfter(this.ctx.storage, after);
        const clientSchemaUpdatedAt = url.searchParams.get("schemaUpdatedAt");
        const schemaFields =
          clientSchemaUpdatedAt === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

        return jsonResponse({
          changes,
          cursor: getCurrentCursor(this.ctx.storage),
          ...schemaFields,
        });
      }

      if (route.path === "/sync/ws") {
        return this.handleSyncWebSocketRequest(request, route.app);
      }

      if (request.method === "POST" && route.path === "/mutations") {
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const validatedMutation = validateMutationRequest(
          await readJson(request),
          schema,
          this.ctx.storage,
        );

        if ("outcome" in validatedMutation) {
          return jsonResponse(writes.apply(() => validatedMutation.outcome));
        }

        const mutation = validatedMutation.mutation;

        if (mutation.op === "create") {
          const response = writes.apply(() =>
            createStoredRecordOutcome(
              this.ctx.storage,
              mutation,
              (context) => {
                executeCreateAfterCreateHooks(
                  context.storage,
                  context.mutation,
                  schema,
                  context.createRecords,
                );
              },
              (entity, values, options) => {
                assertUniqueConstraints(this.ctx.storage, schema, entity, values, options);
              },
            ),
          );

          return jsonResponse(response);
        }

        const response = writes.apply(() =>
          patchStoredRecordOutcome(
            this.ctx.storage,
            mutation,
            "recordValues" in mutation ? mutation.recordValues : undefined,
            (entity, values, options) => {
              assertUniqueConstraints(this.ctx.storage, schema, entity, values, options);
            },
          ),
        );

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/actions") {
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const action = validateEntityActionRequest(await readJson(request), schema);
        const response = writes.apply(() =>
          executeEntityActionOutcome(this.ctx.storage, action, schema),
        );

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/reset/schema") {
        const response = writes.apply(() =>
          mapWriteOutcome(
            resetStorageSchemaToSourceOutcome(this.ctx.storage, source, validateSourceSchemaReset),
            ({ schema, updatedAt }) => bootstrapResponse(this.ctx.storage, schema, updatedAt),
          ),
        );

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/reset/seed") {
        const response = writes.apply(() =>
          mapWriteOutcome(
            resetStorageToSourceSeedOutcome(this.ctx.storage, source),
            ({ schema, updatedAt }) => bootstrapResponse(this.ctx.storage, schema, updatedAt),
          ),
        );

        return jsonResponse(response);
      }

      return jsonResponse({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof BadRequestError) {
        return jsonResponse({ error: error.message }, 400);
      }

      throw error;
    }
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const parsedMessage = parseSyncSocketMessage(message);

    if (!parsedMessage) {
      closeMalformedSyncSocket(socket);
      return;
    }

    const source = storageSourceFromSyncSocket(this.ctx, socket);
    const attachment = {
      cursor: parsedMessage.cursor,
      schemaUpdatedAt: parsedMessage.schemaUpdatedAt,
    } satisfies SyncSocketAttachment;

    sendSyncToSocket(this.ctx.storage, source, socket, attachment);
  }

  private handleSyncWebSocketRequest(request: Request, app: WorkerSchemaAppDefinition) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "WebSocket sync requires GET." }, 405, { Allow: "GET" });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "Expected Upgrade: websocket." }, 426, {
        Upgrade: "websocket",
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment(initialSyncSocketAttachment());
    this.ctx.acceptWebSocket(server, [app.key]);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

class AuthorityWriteModule {
  private readonly storage: DurableObjectStorage;
  private readonly source: StorageSource;
  private readonly webSockets: () => Iterable<WebSocket>;

  constructor(
    storage: DurableObjectStorage,
    source: StorageSource,
    webSockets: () => Iterable<WebSocket>,
  ) {
    this.storage = storage;
    this.source = source;
    this.webSockets = webSockets;
  }

  apply<T>(write: () => WriteOutcome<T>): T {
    const outcome = write();

    if (outcome.kind === "committed") {
      this.notifyCommittedWrite();
    }

    return outcome.response;
  }

  private notifyCommittedWrite() {
    for (const socket of this.webSockets()) {
      try {
        sendSyncToSocket(this.storage, this.source, socket, syncSocketAttachment(socket));
      } catch {
        // A stale socket should not block other replicas from receiving committed state.
      }
    }
  }
}

function storageSourceFromApp(app: WorkerSchemaAppDefinition): StorageSource {
  return {
    schema: app.sourceSchema,
    records: app.seedRecords,
    changeMutationPrefix: app.seedChangeMutationPrefix,
  };
}

function storageSourceFromSyncSocket(ctx: DurableObjectState, socket: WebSocket): StorageSource {
  return storageSourceFromSchemaKey(ctx.getTags(socket)[0] ?? ctx.id.name);
}

function storageSourceFromSchemaKey(schemaKey: string | undefined): StorageSource {
  const app = schemaKey ? findWorkerSchemaAppDefinition(schemaKey) : undefined;

  if (!app) {
    throw new Error("Authority Durable Object is missing a valid schema key.");
  }

  return storageSourceFromApp(app);
}

function initialSyncSocketAttachment(): SyncSocketAttachment {
  return { cursor: 0, schemaUpdatedAt: null };
}

function syncSocketAttachment(socket: WebSocket): SyncSocketAttachment {
  const attachment = socket.deserializeAttachment();

  return isSyncSocketAttachment(attachment) ? attachment : initialSyncSocketAttachment();
}

function parseSyncSocketMessage(message: string | ArrayBuffer) {
  if (typeof message !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(message) as unknown;

    return isSyncSocketClientMessage(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sendSyncToSocket(
  storage: DurableObjectStorage,
  source: StorageSource,
  socket: WebSocket,
  attachment: SyncSocketAttachment,
) {
  const response = syncResponseForAttachment(storage, source, attachment);
  const message = {
    type: "sync",
    payload: response,
  } satisfies SyncSocketServerMessage;

  socket.send(JSON.stringify(message));
  socket.serializeAttachment({
    cursor: response.cursor,
    schemaUpdatedAt: response.schemaUpdatedAt ?? attachment.schemaUpdatedAt,
  } satisfies SyncSocketAttachment);
}

function syncResponseForAttachment(
  storage: DurableObjectStorage,
  source: StorageSource,
  attachment: SyncSocketAttachment,
): SyncResponse {
  const { schema, updatedAt } = initializeStorageFromSource(storage, source);
  const schemaFields =
    attachment.schemaUpdatedAt === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

  return {
    changes: getChangesAfter(storage, attachment.cursor),
    cursor: getCurrentCursor(storage),
    ...schemaFields,
  };
}

function closeMalformedSyncSocket(socket: WebSocket) {
  sendSyncSocketError(socket, "Malformed sync socket message.");
  socket.close(1003, "Malformed sync message.");
}

function sendSyncSocketError(socket: WebSocket, message: string) {
  const response = {
    type: "error",
    message,
  } satisfies SyncSocketServerMessage;

  try {
    socket.send(JSON.stringify(response));
  } catch {
    // The socket is already closing or closed.
  }
}

function bootstrapResponse(
  storage: DurableObjectStorage,
  schema: AppSchema,
  schemaUpdatedAt: string,
) {
  return {
    schema,
    schemaUpdatedAt,
    records: getBootstrapRecords(storage),
    cursor: getCurrentCursor(storage),
  };
}

function parseAuthorityRoute(
  pathname: string,
): { app: WorkerSchemaAppDefinition; path: string } | undefined {
  const [apiSegment, schemaKey, ...routeSegments] = pathname.split("/").filter(Boolean);

  if (apiSegment !== "api" || !schemaKey || routeSegments.length === 0) {
    return undefined;
  }

  const app = findWorkerSchemaAppDefinition(schemaKey);

  if (!app) {
    return undefined;
  }

  return { app, path: `/${routeSegments.join("/")}` };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}

function parseCursor(value: string | null) {
  if (value === null) {
    return 0;
  }

  const cursor = Number(value);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new BadRequestError("Sync cursor must be a non-negative integer.");
  }

  return cursor;
}

function isSiteTreePath(path: string): boolean {
  return path === "/tree" || path.startsWith("/tree/");
}

function parseSiteTreeSlug(path: string): string {
  if (!path.startsWith("/tree/")) {
    throw new BadRequestError("Site tree slug must be non-empty.");
  }

  try {
    const slug = decodeURIComponent(path.slice("/tree/".length)).trim();

    if (slug === "") {
      throw new BadRequestError("Site tree slug must be non-empty.");
    }

    return slug;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError("Site tree slug must be valid URL path text.");
  }
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}
