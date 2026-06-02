export const LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER = "x-formless-workspace-bootstrap";
export const LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER = "x-formless-csrf";

export type LocalWorkspaceGatewayOperationKind =
  | "check"
  | "credentialSetup"
  | "deployApply"
  | "deployPlan"
  | "init"
  | "pull"
  | "push"
  | "save"
  | "status";

export type LocalWorkspaceGatewayOperationStatus = "failed" | "queued" | "running" | "succeeded";

export type LocalWorkspaceGatewayDisplayValue =
  | boolean
  | null
  | number
  | string
  | LocalWorkspaceGatewayDisplayValue[]
  | { [key: string]: LocalWorkspaceGatewayDisplayValue };

export type LocalWorkspaceGatewayDisplayObject = {
  [key: string]: LocalWorkspaceGatewayDisplayValue;
};

export type LocalWorkspaceGatewayOperationSummary = {
  fields: LocalWorkspaceGatewayDisplayObject;
  title: string;
};

export type LocalWorkspaceGatewayOperationLog = {
  at: string;
  id: string;
  level: "error" | "info" | "warning";
  message: string;
};

export type LocalWorkspaceGatewayOperationError = {
  at: string;
  message: string;
};

export type LocalWorkspaceGatewayExternalAuthorizationEvent = {
  at: string;
  id: string;
  profileLabel: string;
  provider: "alchemy" | "cloudflare";
  status: "waiting";
  type: "externalAuthorizationUrl";
  url: string;
};

export type LocalWorkspaceGatewayOperationEvent = LocalWorkspaceGatewayExternalAuthorizationEvent;

export type LocalWorkspaceGatewayOperationResult = {
  deployment?: LocalWorkspaceGatewayDisplayObject;
  details?: LocalWorkspaceGatewayDisplayObject;
  summary: LocalWorkspaceGatewayOperationSummary;
};

export type LocalWorkspaceGatewayOperation = {
  actor: "automation" | "browser" | "cli" | "system";
  completedAt?: string;
  createdAt: string;
  errors: LocalWorkspaceGatewayOperationError[];
  events: LocalWorkspaceGatewayOperationEvent[];
  id: string;
  input: LocalWorkspaceGatewayDisplayObject;
  kind: "formless.workspaceOperation";
  logs: LocalWorkspaceGatewayOperationLog[];
  operation: LocalWorkspaceGatewayOperationKind;
  result?: LocalWorkspaceGatewayOperationResult;
  startedAt?: string;
  status: LocalWorkspaceGatewayOperationStatus;
  summary: LocalWorkspaceGatewayOperationSummary;
  updatedAt: string;
  version: 1;
  workspace: {
    label: string;
  };
};

export type LocalWorkspaceGatewayStartInput =
  | { check?: boolean; kind: "save" }
  | { includeDeploymentStatus?: boolean; kind: "status"; targetAlias?: string | null }
  | { kind: "check" | "pull"; targetAlias?: string | null }
  | {
      allowStale?: boolean;
      apply?: boolean;
      kind: "push";
      replace?: boolean;
      replaceInstallSet?: boolean;
      targetAlias?: string | null;
    }
  | {
      accountId?: string | null;
      kind: "credentialSetup";
      profileLabel?: string | null;
      provider: "cloudflare";
    }
  | {
      kind: "deployApply" | "deployPlan";
      migrationPolicy?: "existing" | "new" | null;
      targetAlias?: string | null;
    }
  | { kind: "init"; name?: string | null };

export type LocalWorkspaceGatewayResponse = {
  csrfToken?: string;
  operation: LocalWorkspaceGatewayOperation;
};

export type LocalWorkspaceGatewayConfig = {
  apiBasePath: string;
  bootstrapToken?: string;
};

export type LocalWorkspaceGatewayApiErrorBody = {
  error: string;
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
      fetcher(`${config.apiBasePath}/status`, {
        credentials: "same-origin",
        headers: gatewayHeaders(config, { allowBootstrap: true }),
        signal,
      }),
    () =>
      fetcher(`${config.apiBasePath}/status`, {
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

  const allowBootstrap = input.kind === "init" || input.kind === "status";

  return gatewayRequestWithBootstrapRetry(
    () =>
      fetcher(`${config.apiBasePath}/operations`, {
        body: JSON.stringify(input),
        credentials: "same-origin",
        headers: gatewayHeaders(config, {
          allowBootstrap,
          csrfToken,
          includeJsonContentType: true,
        }),
        method: "POST",
        signal,
      }),
    () =>
      fetcher(`${config.apiBasePath}/operations`, {
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

  const allowBootstrap = input.operationKind === "init" || input.operationKind === "status";
  const operationPath = `${config.apiBasePath}/operations/${encodeURIComponent(input.operationId)}`;

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
