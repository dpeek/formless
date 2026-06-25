import {
  buildPublicOperationRequestBody,
  createPublicOperationIdempotencyKey,
  isPublicOperationCreateResponse,
  submitPublicOperationJson,
  type PublicOperationCreateResponse,
  type PublicOperationRequestEnvelope,
} from "@dpeek/formless-public-operations";

export type PublicOperationRequest = PublicOperationRequestEnvelope;
export type PublicCreateOperationResponse = PublicOperationCreateResponse;

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
  return buildPublicOperationRequestBody({
    input: {
      name: input.name,
      email: input.email,
      message: input.message,
    },
    idempotencyKey: input.idempotencyKey,
    siteBlockId: input.siteBlockId,
    turnstileToken: input.turnstileToken,
  });
}

export async function submitSiteContactForm(
  input: SubmitSiteContactFormInput,
): Promise<PublicCreateOperationResponse> {
  return submitPublicOperationJson({
    body: siteContactFormRequestBody(input),
    fetcher: input.fetcher,
    invalidResponseMessage: "Contact request returned an invalid response.",
    responseGuard: isPublicOperationCreateResponse,
    route: input.route,
    submitErrorMessage: "Contact request failed.",
  });
}

export function createSiteContactIdempotencyKey(blockId: string): string {
  return createPublicOperationIdempotencyKey({
    purpose: "site-contact",
    siteBlockId: blockId,
  });
}
