import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";

export type DomainProviderApiErrorBody = {
  code?: string;
  error: string;
  status?: string;
};

export class DomainProviderApiError extends Error {
  readonly body: DomainProviderApiErrorBody;
  readonly status: number;

  constructor(message: string, options: { body: DomainProviderApiErrorBody; status: number }) {
    super(message);
    this.name = "DomainProviderApiError";
    this.body = options.body;
    this.status = options.status;
  }
}

export async function fetchInstanceDomainProviderPlan({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<InstanceDomainProviderPlanResponse> {
  const response = await fetcher(INSTANCE_DOMAIN_PROVIDER_API_PATH, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  return readJsonResponse<InstanceDomainProviderPlanResponse>(response);
}

export async function applyInstanceDomainProviderPlan({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<InstanceDomainProviderApplyResponse> {
  const response = await fetcher(INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    method: "POST",
    signal,
  });

  return readJsonResponse<InstanceDomainProviderApplyResponse>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = domainProviderErrorBody(body);

    throw new DomainProviderApiError(errorBody.error, {
      body: errorBody,
      status: response.status,
    });
  }

  return body as T;
}

function domainProviderErrorBody(value: unknown): DomainProviderApiErrorBody {
  if (!isRecord(value)) {
    return { error: "Domain provider request failed." };
  }

  const error = typeof value.error === "string" ? value.error : "Domain provider request failed.";
  const code = typeof value.code === "string" ? value.code : undefined;
  const status = typeof value.status === "string" ? value.status : undefined;

  return {
    error,
    ...(code === undefined ? {} : { code }),
    ...(status === undefined ? {} : { status }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
