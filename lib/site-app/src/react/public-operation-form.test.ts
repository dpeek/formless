import { describe, expect, it } from "vite-plus/test";
import {
  TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
  TEXT_PHONE_FORMAT_INVALID_MESSAGE,
} from "@dpeek/formless-schema";

import type { SitePublicOperationInputFieldNode } from "../types.ts";
import {
  executePublicOperationForm,
  initialPublicOperationFormDraftSessionState,
  nextPublicOperationFormDraftSessionState,
  normalizePublicOperationFormResponse,
  publicOperationFormDraftFromFormData,
  publicOperationFormDraftInput,
  publicOperationFormInputValuesFromFormData,
  publicOperationFormRequestBody,
  resolvePublicOperationFormDraftInput,
  selectPublicOperationFormDraftSession,
  submitPublicOperationForm,
  type PublicOperationFormDraftFieldInput,
  type PublicOperationFormDraftSessionState,
} from "./public-operation-form.ts";

const fields: SitePublicOperationInputFieldNode[] = [
  {
    name: "summary",
    label: "Summary",
    required: true,
    control: "text",
  },
  {
    name: "replyEmail",
    label: "Reply email",
    required: false,
    control: "text",
    format: "email",
  },
  {
    name: "phone",
    label: "Phone",
    required: false,
    control: "text",
    format: "phone",
  },
  {
    name: "inquiryType",
    label: "Inquiry type",
    required: false,
    control: "text",
    suggestions: ["Support", "Sales"],
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
  it("resolves controlled generated drafts to flat input keyed by declared operation input names", () => {
    const state = withPublicOperationFormDraftValues(
      initialPublicOperationFormDraftSessionState({ fields }),
      [
        ["summary", { kind: "input", value: "Send lab results" }],
        ["replyEmail", { kind: "input", value: "  name@example.com  " }],
        ["phone", { kind: "input", value: " +1 (555) 123-4567 " }],
        ["inquiryType", { kind: "input", value: "Custom" }],
        ["details", { kind: "input", value: "Include chain of custody." }],
        ["category", { kind: "input", value: "priority" }],
        ["confirmed", publicOperationFormDraftInput(false)],
        ["neededBy", { kind: "input", value: "2026-07-12" }],
        ["quantity", { kind: "input", value: "3.5" }],
        ["notes", { kind: "input", value: "" }],
      ],
    );
    const session = selectPublicOperationFormDraftSession({ fields, state });

    expect(session).toMatchObject({
      canSubmit: true,
      fieldErrors: {},
      input: {
        summary: "Send lab results",
        replyEmail: "name@example.com",
        phone: "+1 (555) 123-4567",
        inquiryType: "Custom",
        details: "Include chain of custody.",
        category: "priority",
        confirmed: false,
        neededBy: "2026-07-12",
        quantity: 3.5,
      },
    });
    expect(session.input).not.toHaveProperty("notes");
    expect(session).not.toHaveProperty("turnstileToken");
    expect(session).not.toHaveProperty("siteBlockId");
    expect(session).not.toHaveProperty("route");
    expect(session).not.toHaveProperty("idempotencyKey");
    expect(session).not.toHaveProperty("response");
  });

  it("surfaces generated field errors before submit while preserving invalid draft text", () => {
    const state = withPublicOperationFormDraftValues(
      initialPublicOperationFormDraftSessionState({ fields }),
      [
        ["summary", { kind: "input", value: "" }],
        ["replyEmail", { kind: "input", value: "not an email" }],
        ["phone", { kind: "input", value: "555-abc" }],
        ["category", { kind: "input", value: "private" }],
        ["neededBy", { kind: "input", value: "2026-02-31" }],
        ["quantity", { kind: "input", value: "many" }],
      ],
    );
    const resolution = resolvePublicOperationFormDraftInput({
      draft: state.draft,
      fields,
    });

    expect(resolution.input).toEqual({
      confirmed: false,
    });
    expect(resolution.fieldErrors).toMatchObject({
      summary: {
        fieldName: "summary",
        message: 'Field "summary" cannot be empty.',
      },
      replyEmail: {
        fieldName: "replyEmail",
        message: TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
      },
      phone: {
        fieldName: "phone",
        message: TEXT_PHONE_FORMAT_INVALID_MESSAGE,
      },
      category: {
        fieldName: "category",
        message: 'Field "category" must be a known enum value.',
      },
      neededBy: {
        fieldName: "neededBy",
        message: 'Field "neededBy" must be a YYYY-MM-DD date.',
      },
      quantity: {
        draftValue: { kind: "input", value: "many" },
        fieldName: "quantity",
        message: "Enter a finite number.",
      },
    });
  });

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

  it("adapts browser FormData to typed drafts before resolving operation input values", () => {
    const formData = new FormData();
    formData.set("summary", "Send lab results");
    formData.set("replyEmail", "  name@example.com  ");
    formData.set("phone", " +1 (555) 123-4567 ");
    formData.set("inquiryType", "Custom");
    formData.set("details", "Include chain of custody.");
    formData.set("category", "priority");
    formData.set("confirmed", "true");
    formData.set("neededBy", "2026-07-12");
    formData.set("quantity", "3.5");
    formData.set("notes", "");
    const draft = publicOperationFormDraftFromFormData(fields, formData);
    const resolution = resolvePublicOperationFormDraftInput({ draft, fields });

    expect(draft.values).toMatchObject({
      summary: { kind: "input", value: "Send lab results" },
      confirmed: { kind: "value", value: true },
      quantity: { kind: "input", value: "3.5" },
    });
    expect(resolution).toMatchObject({
      fieldErrors: {},
      input: {
        summary: "Send lab results",
        replyEmail: "name@example.com",
        phone: "+1 (555) 123-4567",
        inquiryType: "Custom",
        details: "Include chain of custody.",
        category: "priority",
        confirmed: true,
        neededBy: "2026-07-12",
        quantity: 3.5,
      },
    });
    expect(publicOperationFormInputValuesFromFormData(fields, formData)).toEqual({
      ok: true,
      input: resolution.input,
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
      error: 'Field "summary" is required.',
    });

    expect(
      publicOperationFormInputValuesFromFormData(
        [requiredField("quantity", "Quantity", "number")],
        formDataWith("quantity", "Infinity"),
      ),
    ).toEqual({
      ok: false,
      error: "Enter a finite number.",
    });

    expect(
      publicOperationFormInputValuesFromFormData(
        [requiredField("neededBy", "Needed by", "date")],
        formDataWith("neededBy", "2026-02-31"),
      ),
    ).toEqual({
      ok: false,
      error: 'Field "neededBy" must be a YYYY-MM-DD date.',
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
      error: 'Field "category" must be a known enum value.',
    });

    expect(
      publicOperationFormInputValuesFromFormData(
        [{ ...requiredField("replyEmail", "Reply email", "text"), format: "email" }],
        formDataWith("replyEmail", "not an email"),
      ),
    ).toEqual({
      ok: false,
      error: TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
    });

    expect(
      publicOperationFormInputValuesFromFormData(
        [{ ...requiredField("phone", "Phone", "text"), format: "phone" }],
        formDataWith("phone", "555-abc"),
      ),
    ).toEqual({
      ok: false,
      error: TEXT_PHONE_FORMAT_INVALID_MESSAGE,
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

  it("normalizes public form submission execution results", async () => {
    const committed = normalizePublicOperationFormResponse({
      invocationId: "operation-1",
      operation: {
        entityName: "intake-request",
        operationName: "submit",
        canonicalKey: "intake-request.submit",
        kind: "command",
      },
      output: {
        type: "command",
        affectedChangeIds: ["10", "11"],
        cursor: 12,
      },
      status: "committed",
    });

    expect(committed).toMatchObject({
      type: "committed",
      affectedCount: 2,
    });

    const failed = await executePublicOperationForm({
      fetcher: async () =>
        Response.json({ error: "Public operation input failed validation." }, { status: 400 }),
      idempotencyKey: "site-public-operation:block-1:key-1",
      input: {
        summary: "Send lab results",
      },
      route: "/api/intake/public/operations/intake-request/submit",
      siteBlockId: "block-1",
      turnstileToken: "bad-token",
    });

    expect(failed).toEqual({
      type: "failed",
      displayError: "Public operation input failed validation.",
    });
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

function withPublicOperationFormDraftValues(
  state: PublicOperationFormDraftSessionState,
  values: Array<[string, PublicOperationFormDraftFieldInput]>,
): PublicOperationFormDraftSessionState {
  return values.reduce(
    (nextState, [inputName, inputValue]) =>
      nextPublicOperationFormDraftSessionState({
        inputName,
        inputValue,
        state: nextState,
      }),
    state,
  );
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
