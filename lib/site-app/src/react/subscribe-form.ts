import {
  TURNSTILE_RESPONSE_FIELD_NAME,
  buildPublicOperationRequestBody,
  createPublicOperationIdempotencyKey,
  isPublicOperationCommandResponse,
  submitPublicOperationJson,
  turnstileResponseTokenFromFormData,
  type PublicOperationCommandResponse,
  type PublicOperationRequestEnvelope,
} from "@dpeek/formless-public-operations";

export { TURNSTILE_RESPONSE_FIELD_NAME, turnstileResponseTokenFromFormData };

export type PublicOperationRequest = PublicOperationRequestEnvelope;
export type PublicOperationResponse = PublicOperationCommandResponse;

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
  return buildPublicOperationRequestBody({
    input: {
      email: input.email,
    },
    idempotencyKey: input.idempotencyKey,
    siteBlockId: input.siteBlockId,
    turnstileToken: input.turnstileToken,
  });
}

export async function submitSiteSubscribeForm(
  input: SubmitSiteSubscribeFormInput,
): Promise<PublicOperationResponse> {
  return submitPublicOperationJson({
    body: siteSubscribeFormRequestBody(input),
    fetcher: input.fetcher,
    invalidResponseMessage: "Subscribe request returned an invalid response.",
    responseGuard: isPublicOperationCommandResponse,
    route: input.route,
    submitErrorMessage: "Subscribe request failed.",
  });
}

export function createSiteSubscribeIdempotencyKey(blockId: string): string {
  return createPublicOperationIdempotencyKey({
    purpose: "site-subscribe",
    siteBlockId: blockId,
  });
}
