import { DurableObject } from "cloudflare:workers";
import type {
  BootstrapResponse,
  SyncResponse,
  SyncSocketAttachment,
  SyncSocketServerMessage,
} from "../shared/protocol.ts";
import { isSyncSocketAttachment, isSyncSocketClientMessage } from "../shared/protocol.ts";
import {
  installedAppStorageIdentity,
  parseAuthorityApiRoute,
  type AppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { handleInstanceArchiveDurableObjectRequest } from "./archive-api.ts";
import {
  ensureStorageTables,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  resetStorageToEmpty,
  ActiveSchemaRefreshBlockedError,
  type PackageAppSchemaProvenance,
  type StorageSource,
  type WriteOutcome,
} from "./storage.ts";
import { BadRequestError, ReloadRequiredError } from "./errors.ts";
import type { Env } from "./index.ts";
import { authorizeAuthorityOperation, authorizeInstanceWrite } from "./authority-admin-guard.ts";
import type { WorkerSchemaAppDefinition } from "./schema-apps.ts";
import { executeAuthorityOperation, selectAuthorityOperation } from "./authority-operations.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { handleInstanceAppInstallsDurableObjectRequest } from "./instance-app-installs.ts";
import { handleInstanceControlPlaneDurableObjectRequest } from "./instance-control-plane.ts";
import {
  LaunchFixtureConfigurationError,
  launchFixtureStorageSourceForAuthorityName,
  launchFixtureStorageSourceForIdentity,
} from "./launch-fixtures.ts";
import { handleOwnerSetupDurableObjectRequest } from "./owner-setup.ts";
import { handleOwnerPasskeyDurableObjectRequest } from "./owner-passkeys.ts";
import { handleInstanceDomainProviderDurableObjectRequest } from "./domain-provider-api.ts";
import { handleInstanceDomainMappingsDurableObjectRequest } from "./instance-domain-mappings.ts";
import { handleInstanceDeploymentRuntimeDurableObjectRequest } from "./deployment-runtime-api.ts";
import { handleInstanceEmailRuntimeDurableObjectRequest } from "./email-runtime.ts";
import { ensureRuntimeInstanceAuthConfig } from "./instance-auth-runtime.ts";
import { handleLocalSessionBootstrapDurableObjectRequest } from "./local-session-bootstrap.ts";
import {
  executePublicOperationRequest,
  PublicOperationError,
  selectPublicOperationRoute,
} from "./public-operations.ts";
import { scheduleSiteContactNotificationAfterPublicOperation } from "./site-contact-notifications.ts";
import { scheduleSiteOperationInputNotificationAfterPublicOperation } from "./site-operation-input-notifications.ts";
import { turnstileSiteKeyFromEnv } from "../shared/turnstile-config.ts";
import {
  handleAppStorageUpgradeStatusDurableObjectRequest,
  handleInstanceUpgradeStatusDurableObjectRequest,
} from "./upgrade-status-api.ts";
import {
  activeAppPackageResolver,
  activeWorkerSourceSchemas,
  findActiveWorkerSchemaAppDefinition,
  listActiveAppPackages,
} from "./runtime-app-packages.ts";

export const INTERNAL_RESET_APP_STORAGE_PATH = "/_internal/reset-app-storage";

export class FormlessAuthority extends DurableObject<Env> {
  private readonly bindings: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.bindings = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (this.ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
      try {
        await ensureRuntimeInstanceAuthConfig(this.ctx.storage, request, this.bindings);
      } catch (error) {
        const launchFixtureError = launchFixtureConfigurationErrorMessage(error);

        if (launchFixtureError !== undefined) {
          return jsonResponse({ error: launchFixtureError }, 400);
        }

        throw error;
      }
    }

    const localSessionBootstrapResponse = await handleLocalSessionBootstrapDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (localSessionBootstrapResponse) {
      return localSessionBootstrapResponse;
    }

    const ownerSetupResponse = await handleOwnerSetupDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (ownerSetupResponse) {
      return ownerSetupResponse;
    }

    const instanceUpgradeStatusResponse = await handleInstanceUpgradeStatusDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceUpgradeStatusResponse) {
      return instanceUpgradeStatusResponse;
    }

    const ownerPasskeyResponse = await handleOwnerPasskeyDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (ownerPasskeyResponse) {
      return ownerPasskeyResponse;
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

    const instanceEmailRuntimeResponse = await handleInstanceEmailRuntimeDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceEmailRuntimeResponse) {
      return instanceEmailRuntimeResponse;
    }

    const instanceAppInstallsResponse = await handleInstanceAppInstallsDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceAppInstallsResponse) {
      return instanceAppInstallsResponse;
    }

    const instanceControlPlaneResponse = await handleInstanceControlPlaneDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceControlPlaneResponse) {
      return instanceControlPlaneResponse;
    }

    const instanceArchiveResponse = await handleInstanceArchiveDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceArchiveResponse) {
      return instanceArchiveResponse;
    }

    if (url.pathname === INTERNAL_RESET_APP_STORAGE_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      resetStorageToEmpty(this.ctx.storage);

      return jsonResponse({ reset: true });
    }

    const route = parseAuthorityRoute(url.pathname, this.bindings);

    if (!route) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    try {
      if (isRetiredWriteRoute(request.method, route.path)) {
        const authorization = await authorizeInstanceWrite(request, this.bindings);

        if (!authorization.authorized) {
          return jsonResponse(
            { error: authorization.error },
            authorization.status,
            authorization.headers,
          );
        }

        return jsonResponse({ error: "Not found." }, 404);
      }

      if (route.path === "/sync/ws") {
        return this.handleSyncWebSocketRequest(request, route.app);
      }

      const source = storageSourceFromRoute(route, this.bindings);
      const writes = new AuthorityWriteModule(this.ctx.storage, source, () =>
        this.ctx.getWebSockets(),
      );

      const appStorageUpgradeStatusResponse =
        await handleAppStorageUpgradeStatusDurableObjectRequest({
          env: this.bindings,
          identity: route.identity,
          path: route.path,
          request,
          storage: this.ctx.storage,
        });

      if (appStorageUpgradeStatusResponse) {
        return appStorageUpgradeStatusResponse;
      }

      const operation = selectAuthorityOperation({
        method: request.method,
        path: route.path,
        searchParams: url.searchParams,
      });
      const publicOperationRoute = selectPublicOperationRoute({
        method: request.method,
        path: route.path,
      });

      if (publicOperationRoute) {
        const body = await readJson(request);
        ensureStorageTables(this.ctx.storage);
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const result = await executePublicOperationRequest({
          afterCommit: async (response) => {
            const operationInputNotificationRecords =
              await publicOperationInputNotificationSourceRecords({
                env: this.bindings,
                identity: route.identity,
                requestUrl: request.url,
                response,
              });

            await Promise.allSettled([
              scheduleSiteContactNotificationAfterPublicOperation({
                env: this.bindings,
                identity: route.identity,
                requestUrl: request.url,
                response,
              }),
              scheduleSiteOperationInputNotificationAfterPublicOperation({
                env: this.bindings,
                identity: route.identity,
                requestUrl: request.url,
                response,
                ...(operationInputNotificationRecords === undefined
                  ? {}
                  : { records: operationInputNotificationRecords }),
                schema,
                storage: this.ctx.storage,
              }),
            ]);
          },
          body,
          env: this.bindings,
          identity: route.identity,
          request,
          route: publicOperationRoute,
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
          packageResolver: activeAppPackageResolver(this.bindings),
          requestHeaders: request.headers,
          source,
          sourceSchemas: activeWorkerSourceSchemas(this.bindings),
          storage: this.ctx.storage,
          turnstileSiteKey: turnstileSiteKeyFromEnv(this.bindings),
          writes,
        });

        return jsonResponse(result.body, result.status, result.headers);
      }

      return jsonResponse({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof PublicOperationError) {
        return jsonResponse({ error: error.message }, error.status);
      }

      if (error instanceof BadRequestError) {
        return jsonResponse({ error: error.message }, 400);
      }

      if (error instanceof LaunchFixtureConfigurationError) {
        return jsonResponse({ error: error.message }, 400);
      }

      if (error instanceof ReloadRequiredError) {
        return jsonResponse(error.body, error.status);
      }

      if (error instanceof ActiveSchemaRefreshBlockedError) {
        return jsonResponse({ error: error.message, blocker: error.blocker }, 409);
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
    launchFixtureStorageSourceForIdentity(route.identity, env) ??
    storageSourceFromApp(route.app, {
      schemaProvenance: packageSchemaProvenanceForIdentity(route.identity, env),
      schemaKey: route.identity.sourceSchemaKey,
      storageIdentity: route.identity.authorityName,
    })
  );
}

function storageSourceFromApp(
  app: WorkerSchemaAppDefinition,
  options: {
    schemaKey?: string;
    schemaProvenance?: PackageAppSchemaProvenance;
    storageIdentity?: string;
  } = {},
): StorageSource {
  return {
    schema: app.sourceSchema,
    records: app.seedRecords,
    changeWritePrefix: app.seedChangeWritePrefix,
    ...(options.schemaKey === undefined ? {} : { schemaKey: options.schemaKey }),
    ...(options.schemaProvenance === undefined
      ? {}
      : { schemaProvenance: options.schemaProvenance }),
    ...(options.storageIdentity === undefined ? {} : { storageIdentity: options.storageIdentity }),
  };
}

function packageSchemaProvenanceForIdentity(
  identity: AppStorageIdentity,
  env: Env,
): PackageAppSchemaProvenance {
  const packageApp = activeAppPackageResolver(env).findPackage(identity.packageAppKey);

  if (!packageApp) {
    throw new Error(`Package app "${identity.packageAppKey}" is not installable.`);
  }

  return {
    kind: "package-app",
    packageAppKey: packageApp.packageAppKey,
    packageRevision: packageApp.packageRevision,
    sourceSchemaHash: packageApp.sourceSchemaHash,
  };
}

async function publicOperationInputNotificationSourceRecords(input: {
  env: Env;
  identity: AppStorageIdentity;
  requestUrl: string;
  response: { invocation: { source: { siteBlockId?: string } } };
}): Promise<readonly StoredRecord[] | undefined> {
  if (input.response.invocation.source.siteBlockId === undefined) {
    return undefined;
  }

  const defaultSiteIdentity = installedAppStorageIdentity(
    {
      installId: "site",
      packageAppKey: "site",
    },
    activeAppPackageResolver(input.env),
  );

  if (!defaultSiteIdentity) {
    return undefined;
  }

  if (
    (input.identity.kind === "schemaKey" && input.identity.sourceSchemaKey === "site") ||
    input.identity.authorityName === defaultSiteIdentity.authorityName
  ) {
    return undefined;
  }

  try {
    const id = input.env.FORMLESS_AUTHORITY.idFromName(defaultSiteIdentity.authorityName);
    const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
      new Request(new URL(`${defaultSiteIdentity.apiRoutePrefix}/bootstrap`, input.requestUrl), {
        headers: { Accept: "application/json" },
        method: "GET",
      }),
    );
    const body = (await response.json()) as Partial<BootstrapResponse> & { error?: string };

    return response.ok && Array.isArray(body.records) ? body.records : undefined;
  } catch {
    return undefined;
  }
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

  return storageSourceFromSchemaKey(ctx.getTags(socket)[0] ?? ctx.id.name, env, ctx.id.name);
}

function storageSourceFromSchemaKey(
  schemaKey: string | undefined,
  env: Env,
  storageIdentity?: string,
): StorageSource {
  if (!schemaKey) {
    throw new Error("Authority Durable Object is missing a valid schema key.");
  }

  const app = findActiveWorkerSchemaAppDefinition(schemaKey, env);

  if (!app) {
    throw new Error("Authority Durable Object is missing a valid schema key.");
  }

  return storageSourceFromApp(app, {
    schemaKey,
    schemaProvenance: packageSchemaProvenanceForSchemaKey(schemaKey, env),
    storageIdentity,
  });
}

function packageSchemaProvenanceForSchemaKey(
  schemaKey: string,
  env: Env,
): PackageAppSchemaProvenance | undefined {
  const packageApp = listActiveAppPackages(env).find(
    (candidate) => candidate.sourceSchemaKey === schemaKey,
  );

  return packageApp
    ? {
        kind: "package-app",
        packageAppKey: packageApp.packageAppKey,
        packageRevision: packageApp.packageRevision,
        sourceSchemaHash: packageApp.sourceSchemaHash,
      }
    : undefined;
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
  const storedSchema = initializeStorageFromSource(storage, source);
  const schemaFields =
    attachment.schemaUpdatedAt === storedSchema.updatedAt
      ? {}
      : {
          schema: storedSchema.schema,
          ...(storedSchema.schemaProvenance === undefined
            ? {}
            : { schemaProvenance: storedSchema.schemaProvenance }),
          schemaUpdatedAt: storedSchema.updatedAt,
        };

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
  env: Env,
): { app: WorkerSchemaAppDefinition; identity: AppStorageIdentity; path: string } | undefined {
  const route = parseAuthorityApiRoute(pathname, activeAppPackageResolver(env));

  if (!route) {
    return undefined;
  }

  const app = findActiveWorkerSchemaAppDefinition(route.identity.sourceSchemaKey, env);

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

function isRetiredWriteRoute(method: string, path: string) {
  if (method !== "POST" || !path.startsWith("/")) {
    return false;
  }

  const retiredWriteRouteNames = new Set(["mutations", "actions"]);

  return retiredWriteRouteNames.has(path.slice(1));
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

function launchFixtureConfigurationErrorMessage(error: unknown): string | undefined {
  if (error instanceof LaunchFixtureConfigurationError) {
    return error.message;
  }

  if (!(error instanceof Error)) {
    return undefined;
  }

  return error.message.startsWith('Launch fixture "') ||
    error.message.startsWith("Unknown launch fixture ")
    ? error.message
    : undefined;
}
