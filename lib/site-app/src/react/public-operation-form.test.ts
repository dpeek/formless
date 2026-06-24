import { describe, expect, it } from "vite-plus/test";

import type { SitePublicOperationInputFieldNode } from "../types.ts";
import {
  publicOperationFormInputValuesFromFormData,
  publicOperationFormRequestBody,
  submitPublicOperationForm,
} from "./public-operation-form.ts";

const fields: SitePublicOperationInputFieldNode[] = [
  {
    name: "summary",
    label: "Summary",
    required: true,
    control: "text",
  },
  {
    name: "details",
    label: "Details",
    required: false,
    control: "longText",
  },
  {
    name: "category",
    label: "Category",
    required: true,
    control: "enum",
    options: [
      { value: "general", label: "General" },
      { value: "priority", label: "Priority" },
    ],
  },
  {
    name: "confirmed",
    label: "Confirmed",
    required: false,
    control: "boolean",
  },
  {
    name: "neededBy",
    label: "Needed by",
    required: true,
    control: "date",
  },
  {
    name: "quantity",
    label: "Quantity",
    required: true,
    control: "number",
  },
  {
    name: "notes",
    label: "Notes",
    required: false,
    control: "text",
  },
];

describe("generic public operation form submit helpers", () => {
  it("builds the public operation body from typed input, source block id, idempotency key, and Turnstile token", () => {
    expect(
      publicOperationFormRequestBody({
        idempotencyKey: "site-public-operation:block-1:key-1",
        input: {
          summary: "Test request",
          confirmed: true,
          neededBy: "2026-07-12",
          quantity: 3,
        },
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).toEqual({
      input: {
        summary: "Test request",
        confirmed: true,
        neededBy: "2026-07-12",
        quantity: 3,
      },
      proof: {
        turnstileToken: "token-ok",
      },
      source: {
        siteBlockId: "block-1",
      },
      idempotencyKey: "site-public-operation:block-1:key-1",
    });
  });

  it("coerces browser form values to declared public operation input values", () => {
    const formData = new FormData();
    formData.set("summary", "Send lab results");
    formData.set("details", "Include chain of custody.");
    formData.set("category", "priority");
    formData.set("confirmed", "true");
    formData.set("neededBy", "2026-07-12");
    formData.set("quantity", "3.5");
    formData.set("notes", "");

    expect(publicOperationFormInputValuesFromFormData(fields, formData)).toEqual({
      ok: true,
      input: {
        summary: "Send lab results",
        details: "Include chain of custody.",
        category: "priority",
        confirmed: true,
        neededBy: "2026-07-12",
        quantity: 3.5,
      },
    });
  });

  it("preserves unchecked booleans as false", () => {
    const formData = new FormData();
    formData.set("summary", "Send lab results");
    formData.set("category", "general");
    formData.set("neededBy", "2026-07-12");
    formData.set("quantity", "2");

    expect(publicOperationFormInputValuesFromFormData(fields, formData)).toEqual({
      ok: true,
      input: {
        summary: "Send lab results",
        category: "general",
        confirmed: false,
        neededBy: "2026-07-12",
        quantity: 2,
      },
    });
  });

  it("rejects missing required, non-finite number, invalid date, and undeclared enum values", () => {
    expect(publicOperationFormInputValuesFromFormData(fields, new FormData())).toEqual({
      ok: false,
      error: "Summary is required.",
    });

    expect(
      publicOperationFormInputValuesFromFormData(
        [requiredField("quantity", "Quantity", "number")],
        formDataWith("quantity", "Infinity"),
      ),
    ).toEqual({
      ok: false,
      error: "Quantity must be a finite number.",
    });

    expect(
      publicOperationFormInputValuesFromFormData(
        [requiredField("neededBy", "Needed by", "date")],
        formDataWith("neededBy", "2026-02-31"),
      ),
    ).toEqual({
      ok: false,
      error: "Needed by must be a valid date.",
    });

    expect(
      publicOperationFormInputValuesFromFormData(
        [
          {
            name: "category",
            label: "Category",
            required: true,
            control: "enum",
            options: [{ value: "general", label: "General" }],
          },
        ],
        formDataWith("category", "private"),
      ),
    ).toEqual({
      ok: false,
      error: "Category must match a declared option.",
    });
  });

  it("posts generic form submissions to the projected public operation route", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: requestUrlString(url), init });

      return Response.json({
        invocationId: "operation-1",
        operation: {
          entityName: "intake-request",
          operationName: "submit",
          canonicalKey: "intake-request.submit",
          kind: "command",
        },
        output: {
          type: "command",
          affectedChangeIds: ["10"],
          cursor: 12,
          recordPlan: {
            steps: [
              {
                name: "request",
                kind: "create",
                entity: "intake-request",
                recordId: "request-1",
                changeId: "10",
              },
            ],
          },
        },
        status: "committed",
      });
    };

    await expect(
      submitPublicOperationForm({
        fetcher,
        idempotencyKey: "site-public-operation:block-1:key-1",
        input: {
          summary: "Send lab results",
          quantity: 2,
          confirmed: false,
        },
        route: "/api/intake/public/operations/intake-request/submit",
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).resolves.toMatchObject({
      invocationId: "operation-1",
      operation: {
        entityName: "intake-request",
        operationName: "submit",
        canonicalKey: "intake-request.submit",
        kind: "command",
      },
      output: {
        type: "command",
        affectedChangeIds: ["10"],
        cursor: 12,
      },
      status: "committed",
    });
    expect(requests).toEqual([
      {
        url: "/api/intake/public/operations/intake-request/submit",
        init: {
          body: JSON.stringify({
            input: {
              summary: "Send lab results",
              quantity: 2,
              confirmed: false,
            },
            proof: {
              turnstileToken: "token-ok",
            },
            source: {
              siteBlockId: "block-1",
            },
            idempotencyKey: "site-public-operation:block-1:key-1",
          }),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      },
    ]);
  });

  it("surfaces public-safe operation errors", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ error: "Public operation input failed validation." }, { status: 400 });

    await expect(
      submitPublicOperationForm({
        fetcher,
        idempotencyKey: "site-public-operation:block-1:key-1",
        input: {
          summary: "Send lab results",
        },
        route: "/api/intake/public/operations/intake-request/submit",
        siteBlockId: "block-1",
        turnstileToken: "bad-token",
      }),
    ).rejects.toThrow("Public operation input failed validation.");
  });
});

function requiredField(
  name: string,
  label: string,
  control: SitePublicOperationInputFieldNode["control"],
): SitePublicOperationInputFieldNode {
  return {
    name,
    label,
    required: true,
    control,
  };
}

function formDataWith(name: string, value: string): FormData {
  const formData = new FormData();
  formData.set(name, value);
  return formData;
}

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
