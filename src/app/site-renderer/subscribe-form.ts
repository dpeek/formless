import type { PublicOperationRequest, PublicOperationResponse } from "../../shared/protocol.ts";

export const TURNSTILE_RESPONSE_FIELD_NAME = "cf-turnstile-response";

export type SiteSubscribeFormRequestInput = {
  email: string;
  idempotencyKey: string;
  siteBlockId: string;
  turnstileToken: string;
};

export type SubmitSiteSubscribeFormInput = SiteSubscribeFormRequestInput & {
  fetcher?: typeof fetch;
  route: string;
};

export function siteSubscribeFormRequestBody(
  input: SiteSubscribeFormRequestInput,
): PublicOperationRequest {
  return {
    input: {
      email: input.email,
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

export async function submitSiteSubscribeForm(
  input: SubmitSiteSubscribeFormInput,
): Promise<PublicOperationResponse> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(input.route, {
    body: JSON.stringify(siteSubscribeFormRequestBody(input)),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(publicOperationErrorMessage(body) ?? "Subscribe request failed.");
  }

  if (!isPublicOperationResponse(body)) {
    throw new Error("Subscribe request returned an invalid response.");
  }

  return body;
}

export function createSiteSubscribeIdempotencyKey(blockId: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `site-subscribe:${blockId}:${randomId}`;
}

function publicOperationErrorMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value.error === "string" ? value.error : undefined;
}

function isPublicOperationResponse(value: unknown): value is PublicOperationResponse {
  return (
    isRecord(value) &&
    typeof value.invocationId === "string" &&
    (value.status === "committed" || value.status === "replayed") &&
    isRecord(value.operation) &&
    value.operation.kind === "command" &&
    isRecord(value.output) &&
    value.output.type === "command" &&
    typeof value.output.cursor === "number" &&
    isRecord(value.output.response) &&
    typeof value.output.response.actionId === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
