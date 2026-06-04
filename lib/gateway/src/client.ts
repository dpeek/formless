import {
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  workspaceGatewayOperationApiPath,
  workspaceGatewayOperationsApiPath,
  workspaceGatewayReadOperationIntent,
  workspaceGatewayStartOperationIntent,
  workspaceGatewayStatusApiPath,
  type WorkspaceGatewayApiErrorBody,
  type WorkspaceGatewayOperationKind,
  type WorkspaceGatewayResponse,
  type WorkspaceGatewayStartInput,
} from "./index.ts";

export { WORKSPACE_GATEWAY_BOOTSTRAP_HEADER, WORKSPACE_GATEWAY_CSRF_HEADER } from "./index.ts";
export type {
  WorkspaceGatewayApiErrorBody,
  WorkspaceGatewayDisplayObject,
  WorkspaceGatewayDisplayValue,
  WorkspaceGatewayExternalAuthorizationEvent,
  WorkspaceGatewayOperation,
  WorkspaceGatewayOperationError,
  WorkspaceGatewayOperationEvent,
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayOperationLog,
  WorkspaceGatewayOperationResult,
  WorkspaceGatewayOperationStatus,
  WorkspaceGatewayOperationSummary,
  WorkspaceGatewayResponse,
  WorkspaceGatewayStartInput,
} from "./index.ts";

export type WorkspaceGatewayConfig = {
  apiBasePath: string;
  bootstrapToken?: string;
};

export class WorkspaceGatewayApiError extends Error {
  readonly body: WorkspaceGatewayApiErrorBody;
  readonly status: number;

  constructor(message: string, options: { body: WorkspaceGatewayApiErrorBody; status: number }) {
    super(message);
    this.name = "WorkspaceGatewayApiError";
    this.body = options.body;
    this.status = options.status;
  }
}

export function workspaceGatewayBrowserConfig(
  env: Record<string, unknown> = import.meta.env,
): WorkspaceGatewayConfig | undefined {
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

export async function fetchWorkspaceGatewayStatus({
  config = workspaceGatewayBrowserConfig(),
  fetcher = fetch,
  signal,
}: {
  config?: WorkspaceGatewayConfig;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<WorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  return gatewayRequestWithBootstrapRetry(
    () =>
      fetcher(workspaceGatewayStatusApiPath(config.apiBasePath), {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap: true }),
        signal,
      }),
    () =>
      fetcher(workspaceGatewayStatusApiPath(config.apiBasePath), {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap: false }),
        signal,
      }),
  );
}

export async function startWorkspaceGatewayOperation(
  input: WorkspaceGatewayStartInput,
  {
    config = workspaceGatewayBrowserConfig(),
    csrfToken,
    fetcher = fetch,
    signal,
  }: {
    config?: WorkspaceGatewayConfig;
    csrfToken?: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<WorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  const { bootstrapAllowed } = workspaceGatewayStartOperationIntent(input);

  return gatewayRequestWithBootstrapRetry(
    () =>
      fetcher(workspaceGatewayOperationsApiPath(config.apiBasePath), {
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
      fetcher(workspaceGatewayOperationsApiPath(config.apiBasePath), {
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

export async function fetchWorkspaceGatewayOperation(
  input: { operationId: string; operationKind?: WorkspaceGatewayOperationKind },
  {
    config = workspaceGatewayBrowserConfig(),
    fetcher = fetch,
    signal,
  }: {
    config?: WorkspaceGatewayConfig;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<WorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  const allowBootstrap = input.operationKind
    ? workspaceGatewayReadOperationIntent(input.operationKind).bootstrapAllowed
    : false;
  const operationPath = workspaceGatewayOperationApiPath(input.operationId, config.apiBasePath);

  return gatewayRequestWithBootstrapRetry(
    () =>
      fetcher(operationPath, {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap, operationKind: input.operationKind }),
        signal,
      }),
    () =>
      fetcher(operationPath, {
        credentials: "same-origin",
        headers: gatewayHeaders(config, {
          allowBootstrap: false,
          operationKind: input.operationKind,
        }),
        signal,
      }),
  );
}

async function gatewayRequestWithBootstrapRetry(
  request: () => Promise<Response>,
  retryWithoutBootstrap: () => Promise<Response>,
): Promise<WorkspaceGatewayResponse> {
  const first = await request();

  if (first.status !== 403) {
    return readJsonResponse(first);
  }

  const firstBody = await readResponseBody(first);

  if (!bootstrapExpired(firstBody)) {
    throw new WorkspaceGatewayApiError(firstBody.error, {
      body: firstBody,
      status: first.status,
    });
  }

  return readJsonResponse(await retryWithoutBootstrap());
}

function gatewayHeaders(
  config: WorkspaceGatewayConfig,
  options: {
    allowBootstrap: boolean;
    csrfToken?: string;
    includeJsonContentType?: boolean;
    operationKind?: WorkspaceGatewayOperationKind;
  },
): Headers {
  const headers = new Headers({ Accept: "application/json" });

  if (options.includeJsonContentType) {
    headers.set("Content-Type", "application/json");
  }

  if (options.allowBootstrap && config.bootstrapToken) {
    headers.set(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER, config.bootstrapToken);
  }

  if (options.csrfToken) {
    headers.set(WORKSPACE_GATEWAY_CSRF_HEADER, options.csrfToken);
  }

  if (options.operationKind) {
    headers.set(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER, options.operationKind);
  }

  return headers;
}

async function readJsonResponse(response: Response): Promise<WorkspaceGatewayResponse> {
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new WorkspaceGatewayApiError(body.error, {
      body,
      status: response.status,
    });
  }

  return body as unknown as WorkspaceGatewayResponse;
}

async function readResponseBody(response: Response): Promise<WorkspaceGatewayApiErrorBody> {
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
    } as WorkspaceGatewayApiErrorBody;
  }

  return { error: "Workspace gateway request failed." };
}

function bootstrapExpired(body: WorkspaceGatewayApiErrorBody): boolean {
  return body.error.toLowerCase().includes("bootstrap authorization has expired");
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
