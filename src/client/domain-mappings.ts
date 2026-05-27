import type {
  CreateInstanceDomainMappingRequest,
  CreateInstanceDomainMappingResponse,
  DeleteInstanceDomainMappingRequest,
  DeleteInstanceDomainMappingResponse,
  ForgetInstanceDomainMappingResponse,
  InstanceDomainMappingsResponse,
} from "../shared/instance-domain-mappings.ts";

export const INSTANCE_DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
export const INSTANCE_DOMAIN_MAPPINGS_FORGET_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/forget`;

export type DomainMappingApiErrorBody = {
  code?: string;
  error: string;
  field?: string;
};

export class DomainMappingApiError extends Error {
  readonly body: DomainMappingApiErrorBody;
  readonly status: number;

  constructor(message: string, options: { body: DomainMappingApiErrorBody; status: number }) {
    super(message);
    this.name = "DomainMappingApiError";
    this.body = options.body;
    this.status = options.status;
  }
}

export async function fetchInstanceDomainMappings({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<InstanceDomainMappingsResponse> {
  const response = await fetcher(INSTANCE_DOMAIN_MAPPINGS_API_PATH, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  return readJsonResponse<InstanceDomainMappingsResponse>(response);
}

export async function createInstanceDomainMapping(
  input: CreateInstanceDomainMappingRequest,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<CreateInstanceDomainMappingResponse> {
  const response = await fetcher(INSTANCE_DOMAIN_MAPPINGS_API_PATH, {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  return readJsonResponse<CreateInstanceDomainMappingResponse>(response);
}

export async function deleteInstanceDomainMapping(
  input: DeleteInstanceDomainMappingRequest,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<DeleteInstanceDomainMappingResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("host", input.host);

  if (input.profile !== undefined) {
    searchParams.set("profile", input.profile);
  }

  if (input.surface !== undefined) {
    searchParams.set("surface", input.surface);
  }

  const response = await fetcher(`${INSTANCE_DOMAIN_MAPPINGS_API_PATH}?${searchParams}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    method: "DELETE",
    signal,
  });

  return readJsonResponse<DeleteInstanceDomainMappingResponse>(response);
}

export async function forgetInstanceDomainMapping(
  input: DeleteInstanceDomainMappingRequest,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<ForgetInstanceDomainMappingResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("host", input.host);

  if (input.profile !== undefined) {
    searchParams.set("profile", input.profile);
  }

  if (input.surface !== undefined) {
    searchParams.set("surface", input.surface);
  }

  const response = await fetcher(`${INSTANCE_DOMAIN_MAPPINGS_FORGET_API_PATH}?${searchParams}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    method: "DELETE",
    signal,
  });

  return readJsonResponse<ForgetInstanceDomainMappingResponse>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = domainMappingErrorBody(body);

    throw new DomainMappingApiError(errorBody.error, {
      body: errorBody,
      status: response.status,
    });
  }

  return body as T;
}

function domainMappingErrorBody(value: unknown): DomainMappingApiErrorBody {
  if (!isRecord(value)) {
    return { error: "Domain mapping request failed." };
  }

  const error = typeof value.error === "string" ? value.error : "Domain mapping request failed.";
  const code = typeof value.code === "string" ? value.code : undefined;
  const field = typeof value.field === "string" ? value.field : undefined;

  return {
    error,
    ...(code === undefined ? {} : { code }),
    ...(field === undefined ? {} : { field }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
