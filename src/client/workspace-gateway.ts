import {
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER,
  localWorkspaceGatewayOperationApiPath,
  localWorkspaceGatewayOperationsApiPath,
  localWorkspaceGatewayReadOperationIntent,
  localWorkspaceGatewayStartOperationIntent,
  localWorkspaceGatewayStatusApiPath,
  type LocalWorkspaceGatewayApiErrorBody,
  type LocalWorkspaceGatewayOperationKind,
  type LocalWorkspaceGatewayResponse,
  type LocalWorkspaceGatewayStartInput,
} from "../shared/workspace-gateway-protocol.ts";

export {
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER,
} from "../shared/workspace-gateway-protocol.ts";
export type {
  LocalWorkspaceGatewayApiErrorBody,
  LocalWorkspaceGatewayDisplayObject,
  LocalWorkspaceGatewayDisplayValue,
  LocalWorkspaceGatewayExternalAuthorizationEvent,
  LocalWorkspaceGatewayOperation,
  LocalWorkspaceGatewayOperationError,
  LocalWorkspaceGatewayOperationEvent,
  LocalWorkspaceGatewayOperationKind,
  LocalWorkspaceGatewayOperationLog,
  LocalWorkspaceGatewayOperationResult,
  LocalWorkspaceGatewayOperationStatus,
  LocalWorkspaceGatewayOperationSummary,
  LocalWorkspaceGatewayResponse,
  LocalWorkspaceGatewayStartInput,
} from "../shared/workspace-gateway-protocol.ts";

export type LocalWorkspaceGatewayConfig = {
  apiBasePath: string;
  bootstrapToken?: string;
};

export class LocalWorkspaceGatewayApiError extends Error {
  readonly body: LocalWorkspaceGatewayApiErrorBody;
  readonly status: number;

  constructor(
    message: string,
    options: { body: LocalWorkspaceGatewayApiErrorBody; status: number },
  ) {
    super(message);
    this.name = "LocalWorkspaceGatewayApiError";
    this.body = options.body;
    this.status = options.status;
  }
}

export function localWorkspaceGatewayBrowserConfig(
  env: Record<string, unknown> = import.meta.env,
): LocalWorkspaceGatewayConfig | undefined {
  const apiBasePath = stringConfigValue(env.VITE_FORMLESS_WORKSPACE_GATEWAY_API);

  if (!apiBasePath) {
    return undefined;
  }

  const bootstrapToken = stringConfigValue(env.VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN);

  return {
    apiBasePath: apiBasePath.replace(/\/+$/, ""),
    ...(bootstrapToken === undefined ? {} : { bootstrapToken }),
  };
}

export async function fetchLocalWorkspaceGatewayStatus({
  config = localWorkspaceGatewayBrowserConfig(),
  fetcher = fetch,
  signal,
}: {
  config?: LocalWorkspaceGatewayConfig;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<LocalWorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  return gatewayRequestWithBootstrapRetry(
    () =>
      fetcher(localWorkspaceGatewayStatusApiPath(config.apiBasePath), {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap: true }),
        signal,
      }),
    () =>
      fetcher(localWorkspaceGatewayStatusApiPath(config.apiBasePath), {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap: false }),
        signal,
      }),
  );
}

export async function startLocalWorkspaceGatewayOperation(
  input: LocalWorkspaceGatewayStartInput,
  {
    config = localWorkspaceGatewayBrowserConfig(),
    csrfToken,
    fetcher = fetch,
    signal,
  }: {
    config?: LocalWorkspaceGatewayConfig;
    csrfToken?: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<LocalWorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  const { bootstrapAllowed } = localWorkspaceGatewayStartOperationIntent(input);

  return gatewayRequestWithBootstrapRetry(
    () =>
      fetcher(localWorkspaceGatewayOperationsApiPath(config.apiBasePath), {
        body: JSON.stringify(input),
        credentials: "same-origin",
        headers: gatewayHeaders(config, {
          allowBootstrap: bootstrapAllowed,
          csrfToken,
          includeJsonContentType: true,
        }),
        method: "POST",
        signal,
      }),
    () =>
      fetcher(localWorkspaceGatewayOperationsApiPath(config.apiBasePath), {
        body: JSON.stringify(input),
        credentials: "same-origin",
        headers: gatewayHeaders(config, {
          allowBootstrap: false,
          csrfToken,
          includeJsonContentType: true,
        }),
        method: "POST",
        signal,
      }),
  );
}

export async function fetchLocalWorkspaceGatewayOperation(
  input: { operationId: string; operationKind?: LocalWorkspaceGatewayOperationKind },
  {
    config = localWorkspaceGatewayBrowserConfig(),
    fetcher = fetch,
    signal,
  }: {
    config?: LocalWorkspaceGatewayConfig;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<LocalWorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  const allowBootstrap = input.operationKind
    ? localWorkspaceGatewayReadOperationIntent(input.operationKind).bootstrapAllowed
    : false;
  const operationPath = localWorkspaceGatewayOperationApiPath(
    input.operationId,
    config.apiBasePath,
  );

  return gatewayRequestWithBootstrapRetry(
    () =>
      fetcher(operationPath, {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap }),
        signal,
      }),
    () =>
      fetcher(operationPath, {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap: false }),
        signal,
      }),
  );
}

async function gatewayRequestWithBootstrapRetry(
  request: () => Promise<Response>,
  retryWithoutBootstrap: () => Promise<Response>,
): Promise<LocalWorkspaceGatewayResponse> {
  const first = await request();

  if (first.status !== 403) {
    return readJsonResponse(first);
  }

  const firstBody = await readResponseBody(first);

  if (!bootstrapExpired(firstBody)) {
    throw new LocalWorkspaceGatewayApiError(firstBody.error, {
      body: firstBody,
      status: first.status,
    });
  }

  return readJsonResponse(await retryWithoutBootstrap());
}

function gatewayHeaders(
  config: LocalWorkspaceGatewayConfig,
  options: {
    allowBootstrap: boolean;
    csrfToken?: string;
    includeJsonContentType?: boolean;
  },
): Headers {
  const headers = new Headers({ Accept: "application/json" });

  if (options.includeJsonContentType) {
    headers.set("Content-Type", "application/json");
  }

  if (options.allowBootstrap && config.bootstrapToken) {
    headers.set(LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER, config.bootstrapToken);
  }

  if (options.csrfToken) {
    headers.set(LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER, options.csrfToken);
  }

  return headers;
}

async function readJsonResponse(response: Response): Promise<LocalWorkspaceGatewayResponse> {
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new LocalWorkspaceGatewayApiError(body.error, {
      body,
      status: response.status,
    });
  }

  return body as unknown as LocalWorkspaceGatewayResponse;
}

async function readResponseBody(response: Response): Promise<LocalWorkspaceGatewayApiErrorBody> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (isRecord(body)) {
    return {
      ...body,
      error: typeof body.error === "string" ? body.error : "Workspace gateway request failed.",
    } as LocalWorkspaceGatewayApiErrorBody;
  }

  return { error: "Workspace gateway request failed." };
}

function bootstrapExpired(body: LocalWorkspaceGatewayApiErrorBody): boolean {
  return body.error.toLowerCase().includes("bootstrap authorization has expired");
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
