import { TURNSTILE_RESPONSE_FIELD_NAME } from "./subscribe-form.ts";

export { TURNSTILE_RESPONSE_FIELD_NAME };

export type PublicOperationRequest = {
  input: Record<string, string | boolean | number>;
  proof: {
    turnstileToken: string;
  };
  source?: {
    siteBlockId: string;
  };
  idempotencyKey?: string;
};

export type PublicCreateOperationResponse = {
  invocationId: string;
  operation: {
    entityName: string;
    operationName: string;
    kind: "create";
  };
  output: {
    type: "create";
    cursor: number;
    affectedChangeIds: string[];
    record: unknown;
  };
  status: "committed" | "replayed";
};

export type SiteContactFormRequestInput = {
  email: string;
  idempotencyKey: string;
  message: string;
  name: string;
  siteBlockId: string;
  turnstileToken: string;
};

export type SubmitSiteContactFormInput = SiteContactFormRequestInput & {
  fetcher?: typeof fetch;
  route: string;
};

export function siteContactFormRequestBody(
  input: SiteContactFormRequestInput,
): PublicOperationRequest {
  return {
    input: {
      name: input.name,
      email: input.email,
      message: input.message,
    },
    proof: {
      turnstileToken: input.turnstileToken,
    },
    source: {
      siteBlockId: input.siteBlockId,
    },
    idempotencyKey: input.idempotencyKey,
  };
}

export async function submitSiteContactForm(
  input: SubmitSiteContactFormInput,
): Promise<PublicCreateOperationResponse> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(input.route, {
    body: JSON.stringify(siteContactFormRequestBody(input)),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(publicOperationErrorMessage(body) ?? "Contact request failed.");
  }

  if (!isPublicCreateOperationResponse(body)) {
    throw new Error("Contact request returned an invalid response.");
  }

  return body;
}

export function createSiteContactIdempotencyKey(blockId: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `site-contact:${blockId}:${randomId}`;
}

function publicOperationErrorMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value.error === "string" ? value.error : undefined;
}

function isPublicCreateOperationResponse(value: unknown): value is PublicCreateOperationResponse {
  return (
    isRecord(value) &&
    typeof value.invocationId === "string" &&
    (value.status === "committed" || value.status === "replayed") &&
    isRecord(value.operation) &&
    value.operation.kind === "create" &&
    isRecord(value.output) &&
    value.output.type === "create" &&
    typeof value.output.cursor === "number" &&
    Array.isArray(value.output.affectedChangeIds) &&
    value.output.affectedChangeIds.every((changeId) => typeof changeId === "string") &&
    "record" in value.output
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
