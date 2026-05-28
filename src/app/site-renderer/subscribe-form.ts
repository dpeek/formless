import type { PublicActionRequest, PublicActionResponse } from "../../shared/protocol.ts";

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
): PublicActionRequest {
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
): Promise<PublicActionResponse> {
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
    throw new Error(publicActionErrorMessage(body) ?? "Subscribe request failed.");
  }

  if (!isPublicActionResponse(body)) {
    throw new Error("Subscribe request returned an invalid response.");
  }

  return body;
}

export function createSiteSubscribeIdempotencyKey(blockId: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `site-subscribe:${blockId}:${randomId}`;
}

function publicActionErrorMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value.error === "string" ? value.error : undefined;
}

function isPublicActionResponse(value: unknown): value is PublicActionResponse {
  return (
    isRecord(value) &&
    typeof value.actionId === "string" &&
    typeof value.cursor === "number" &&
    value.status === "accepted"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
