import type { SitePublicOperationInputFieldNode } from "../types.ts";
import {
  TURNSTILE_RESPONSE_FIELD_NAME,
  buildPublicOperationRequestBody,
  createPublicOperationIdempotencyKey,
  isPublicOperationResponse,
  submitPublicOperationJson,
  turnstileResponseTokenFromFormData,
  type PublicOperationInputValue,
  type PublicOperationInputValues,
  type PublicOperationRequestEnvelope,
  type PublicOperationResponse,
} from "@dpeek/formless-public-operations";

export { TURNSTILE_RESPONSE_FIELD_NAME, turnstileResponseTokenFromFormData };

export type PublicOperationFormInputValue = PublicOperationInputValue;
export type PublicOperationFormInputValues = PublicOperationInputValues;
export type PublicOperationFormRequest = PublicOperationRequestEnvelope;
export type PublicOperationFormResponse = PublicOperationResponse;

export type PublicOperationFormRequestInput = {
  idempotencyKey: string;
  input: PublicOperationFormInputValues;
  siteBlockId: string;
  turnstileToken: string;
};

export type SubmitPublicOperationFormInput = PublicOperationFormRequestInput & {
  fetcher?: typeof fetch;
  route: string;
};

export type PublicOperationFormInputCoercionResult =
  | {
      ok: true;
      input: PublicOperationFormInputValues;
    }
  | {
      ok: false;
      error: string;
    };

type CoercedFormFieldValue =
  | {
      present: true;
      value: PublicOperationFormInputValue;
    }
  | {
      present: false;
    };

export function publicOperationFormRequestBody(
  input: PublicOperationFormRequestInput,
): PublicOperationFormRequest {
  return buildPublicOperationRequestBody(input);
}

export async function submitPublicOperationForm(
  input: SubmitPublicOperationFormInput,
): Promise<PublicOperationFormResponse> {
  return submitPublicOperationJson({
    body: publicOperationFormRequestBody(input),
    fetcher: input.fetcher,
    invalidResponseMessage: "Public operation request returned an invalid response.",
    responseGuard: isPublicOperationResponse,
    route: input.route,
    submitErrorMessage: "Public operation request failed.",
  });
}

export function createPublicOperationFormIdempotencyKey(blockId: string): string {
  return createPublicOperationIdempotencyKey({
    purpose: "site-public-operation",
    siteBlockId: blockId,
  });
}

export function publicOperationFormInputValuesFromFormData(
  fields: readonly SitePublicOperationInputFieldNode[],
  formData: FormData,
): PublicOperationFormInputCoercionResult {
  const input: PublicOperationFormInputValues = {};

  for (const field of fields) {
    const result = publicOperationFormFieldValueFromFormData(field, formData);

    if ("error" in result) {
      return {
        ok: false,
        error: result.error,
      };
    }

    if (result.present) {
      input[field.name] = result.value;
    }
  }

  return {
    ok: true,
    input,
  };
}

function publicOperationFormFieldValueFromFormData(
  field: SitePublicOperationInputFieldNode,
  formData: FormData,
): CoercedFormFieldValue | { error: string } {
  if (field.control === "boolean") {
    return {
      present: true,
      value: formData.has(field.name),
    };
  }

  const rawValue = formData.get(field.name);

  if (rawValue === null || (typeof rawValue === "string" && rawValue.trim() === "")) {
    return field.required ? { error: `${field.label} is required.` } : { present: false };
  }

  if (typeof rawValue !== "string") {
    return { error: `${field.label} must be text.` };
  }

  switch (field.control) {
    case "text":
    case "longText":
      return {
        present: true,
        value: rawValue,
      };
    case "date":
      return isValidDateInputValue(rawValue)
        ? {
            present: true,
            value: rawValue,
          }
        : { error: `${field.label} must be a valid date.` };
    case "number": {
      const numberValue = Number(rawValue);

      return Number.isFinite(numberValue)
        ? {
            present: true,
            value: numberValue,
          }
        : { error: `${field.label} must be a finite number.` };
    }
    case "enum":
      return field.options?.some((option) => option.value === rawValue)
        ? {
            present: true,
            value: rawValue,
          }
        : { error: `${field.label} must match a declared option.` };
    default:
      return { error: `${field.label} is not supported by this form.` };
  }
}

function isValidDateInputValue(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
