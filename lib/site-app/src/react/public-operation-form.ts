import type { SitePublicOperationInputFieldNode } from "../types.ts";
import { TURNSTILE_RESPONSE_FIELD_NAME } from "./subscribe-form.ts";

export { TURNSTILE_RESPONSE_FIELD_NAME };

export type PublicOperationFormInputValue = string | boolean | number;
export type PublicOperationFormInputValues = Record<string, PublicOperationFormInputValue>;

export type PublicOperationFormRequest = {
  input: PublicOperationFormInputValues;
  proof: {
    turnstileToken: string;
  };
  source?: {
    siteBlockId: string;
  };
  idempotencyKey?: string;
};

export type PublicOperationFormResponse = {
  invocationId: string;
  operation: {
    entityName: string;
    operationName: string;
    canonicalKey: string;
    kind: "command" | "create";
  };
  output:
    | {
        type: "command";
        affectedChangeIds: string[];
        cursor: number;
        recordPlan?: unknown;
      }
    | {
        type: "create";
        affectedChangeIds: string[];
        cursor: number;
        record: unknown;
      };
  status: "committed" | "replayed";
};

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
  return {
    input: input.input,
    proof: {
      turnstileToken: input.turnstileToken,
    },
    source: {
      siteBlockId: input.siteBlockId,
    },
    idempotencyKey: input.idempotencyKey,
  };
}

export async function submitPublicOperationForm(
  input: SubmitPublicOperationFormInput,
): Promise<PublicOperationFormResponse> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(input.route, {
    body: JSON.stringify(publicOperationFormRequestBody(input)),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(publicOperationErrorMessage(body) ?? "Public operation request failed.");
  }

  if (!isPublicOperationFormResponse(body)) {
    throw new Error("Public operation request returned an invalid response.");
  }

  return body;
}

export function createPublicOperationFormIdempotencyKey(blockId: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `site-public-operation:${blockId}:${randomId}`;
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

function publicOperationErrorMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value.error === "string" ? value.error : undefined;
}

function isPublicOperationFormResponse(value: unknown): value is PublicOperationFormResponse {
  if (
    !isRecord(value) ||
    typeof value.invocationId !== "string" ||
    (value.status !== "committed" && value.status !== "replayed") ||
    !isRecord(value.operation) ||
    typeof value.operation.entityName !== "string" ||
    typeof value.operation.operationName !== "string" ||
    typeof value.operation.canonicalKey !== "string" ||
    (value.operation.kind !== "command" && value.operation.kind !== "create") ||
    !isRecord(value.output)
  ) {
    return false;
  }

  return (
    hasPublicOperationOutputBasics(value.output) &&
    (value.output.type === "command" ||
      (value.output.type === "create" && "record" in value.output))
  );
}

function hasPublicOperationOutputBasics(output: Record<string, unknown>): output is Record<
  string,
  unknown
> & {
  affectedChangeIds: string[];
  cursor: number;
  type: "command" | "create";
} {
  return (
    (output.type === "command" || output.type === "create") &&
    typeof output.cursor === "number" &&
    Array.isArray(output.affectedChangeIds) &&
    output.affectedChangeIds.every((changeId) => typeof changeId === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
