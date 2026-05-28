import { DurableObject } from "cloudflare:workers";
import type {
  SyncResponse,
  SyncSocketAttachment,
  SyncSocketServerMessage,
} from "../shared/protocol.ts";
import { isSyncSocketAttachment, isSyncSocketClientMessage } from "../shared/protocol.ts";
import { parseAuthorityApiRoute, type AppStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  handleArchiveAppDataRestoreDurableObjectRequest,
  handleInstanceArchiveDurableObjectRequest,
} from "./archive-api.ts";
import {
  ensureStorageTables,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  type StorageSource,
  type WriteOutcome,
} from "./storage.ts";
import { BadRequestError } from "./errors.ts";
import type { Env } from "./index.ts";
import { authorizeAuthorityOperation } from "./authority-admin-guard.ts";
import { findWorkerSchemaAppDefinition, type WorkerSchemaAppDefinition } from "./schema-apps.ts";
import { executeAuthorityOperation, selectAuthorityOperation } from "./authority-operations.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { handleInstanceAppInstallsDurableObjectRequest } from "./instance-app-installs.ts";
import {
  initializeInstanceAppInstallsFromConfiguredLaunchFixture,
  launchFixtureStorageSourceForAuthorityName,
  launchFixtureStorageSourceForIdentity,
} from "./launch-fixtures.ts";
import { handleOwnerSetupDurableObjectRequest } from "./owner-setup.ts";
import { handleInstanceDomainProviderDurableObjectRequest } from "./domain-provider-api.ts";
import { handleInstanceDomainMappingsDurableObjectRequest } from "./instance-domain-mappings.ts";
import { handleInstanceDeploymentRuntimeDurableObjectRequest } from "./deployment-runtime-api.ts";
import {
  executePublicActionRequest,
  PublicActionError,
  selectPublicActionRoute,
} from "./public-actions.ts";

export class FormlessAuthority extends DurableObject<Env> {
  private readonly bindings: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.bindings = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (this.ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
      initializeInstanceAppInstallsFromConfiguredLaunchFixture(this.ctx.storage, this.bindings);
    }

    const ownerSetupResponse = await handleOwnerSetupDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (ownerSetupResponse) {
      return ownerSetupResponse;
    }

    const instanceDomainMappingsResponse = await handleInstanceDomainMappingsDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceDomainMappingsResponse) {
      return instanceDomainMappingsResponse;
    }

    const instanceDomainProviderResponse = await handleInstanceDomainProviderDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceDomainProviderResponse) {
      return instanceDomainProviderResponse;
    }

    const instanceDeploymentRuntimeResponse =
      await handleInstanceDeploymentRuntimeDurableObjectRequest(
        request,
        this.ctx.storage,
        this.bindings,
      );

    if (instanceDeploymentRuntimeResponse) {
      return instanceDeploymentRuntimeResponse;
    }

    const instanceAppInstallsResponse = await handleInstanceAppInstallsDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceAppInstallsResponse) {
      return instanceAppInstallsResponse;
    }

    const instanceArchiveResponse = await handleInstanceArchiveDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceArchiveResponse) {
      return instanceArchiveResponse;
    }

    const route = parseAuthorityRoute(url.pathname);

    if (!route) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    try {
      if (route.path === "/sync/ws") {
        return this.handleSyncWebSocketRequest(request, route.app);
      }

      const source = storageSourceFromRoute(route, this.bindings);
      const writes = new AuthorityWriteModule(this.ctx.storage, source, () =>
        this.ctx.getWebSockets(),
      );
      const archiveAppDataRestoreResponse = await handleArchiveAppDataRestoreDurableObjectRequest(
        request,
        {
          env: this.bindings,
          identity: route.identity,
          path: route.path,
          storage: this.ctx.storage,
          writes,
        },
      );

      if (archiveAppDataRestoreResponse) {
        return archiveAppDataRestoreResponse;
      }

      const operation = selectAuthorityOperation({
        method: request.method,
        path: route.path,
        searchParams: url.searchParams,
      });
      const publicActionRoute = selectPublicActionRoute({
        method: request.method,
        path: route.path,
      });

      if (publicActionRoute) {
        const body = await readJson(request);
        ensureStorageTables(this.ctx.storage);
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const result = await executePublicActionRequest({
          body,
          env: this.bindings,
          identity: route.identity,
          request,
          route: publicActionRoute,
          schema,
          storage: this.ctx.storage,
          writes,
        });

        return jsonResponse(result.body, result.status, result.headers);
      }

      if (operation) {
        const authorization = await authorizeAuthorityOperation(request, operation, this.bindings);

        if (!authorization.authorized) {
          return jsonResponse(
            { error: authorization.error },
            authorization.status,
            authorization.headers,
          );
        }

        const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;
        ensureStorageTables(this.ctx.storage);
        const result = executeAuthorityOperation({
          app: route.app,
          body,
          identity: route.identity,
          operation,
          source,
          storage: this.ctx.storage,
          writes,
        });

        return jsonResponse(result.body, result.status, result.headers);
      }

      return jsonResponse({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof PublicActionError) {
        return jsonResponse({ error: error.message }, error.status);
      }

      if (error instanceof BadRequestError) {
        return jsonResponse({ error: error.message }, 400);
      }

      throw error;
    }
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    ensureStorageTables(this.ctx.storage);

    const parsedMessage = parseSyncSocketMessage(message);

    if (!parsedMessage) {
      closeMalformedSyncSocket(socket);
      return;
    }

    const source = storageSourceFromSyncSocket(this.ctx, socket, this.bindings);
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

  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T> {
    const outcome = write();

    if (outcome.kind === "committed") {
      this.notifyCommittedWrite();
    }

    return outcome;
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

function storageSourceFromRoute(
  route: { app: WorkerSchemaAppDefinition; identity: AppStorageIdentity },
  env: Env,
): StorageSource {
  return (
    launchFixtureStorageSourceForIdentity(route.identity, env) ?? storageSourceFromApp(route.app)
  );
}

function storageSourceFromApp(app: WorkerSchemaAppDefinition): StorageSource {
  return {
    schema: app.sourceSchema,
    records: app.seedRecords,
    changeMutationPrefix: app.seedChangeMutationPrefix,
  };
}

function storageSourceFromSyncSocket(
  ctx: DurableObjectState,
  socket: WebSocket,
  env: Env,
): StorageSource {
  const launchFixtureSource = launchFixtureStorageSourceForAuthorityName(ctx.id.name, env);

  if (launchFixtureSource) {
    return launchFixtureSource;
  }

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

function parseAuthorityRoute(
  pathname: string,
): { app: WorkerSchemaAppDefinition; identity: AppStorageIdentity; path: string } | undefined {
  const route = parseAuthorityApiRoute(pathname);

  if (!route) {
    return undefined;
  }

  const app = findWorkerSchemaAppDefinition(route.identity.sourceSchemaKey);

  if (!app) {
    return undefined;
  }

  return { app, identity: route.identity, path: route.path };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}
