import { describe, expect, it } from "vite-plus/test";

import { siteContactFormRequestBody, submitSiteContactForm } from "./contact-form.ts";

describe("public Site contact form submit helpers", () => {
  it("builds the public operation body from contact fields, source block id, idempotency key, and Turnstile token", () => {
    expect(
      siteContactFormRequestBody({
        email: "ada@example.com",
        idempotencyKey: "site-contact:block-1:key-1",
        message: "Please send details.",
        name: "Ada Lovelace",
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).toEqual({
      input: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        message: "Please send details.",
      },
      proof: {
        turnstileToken: "token-ok",
      },
      source: {
        siteBlockId: "block-1",
      },
      idempotencyKey: "site-contact:block-1:key-1",
    });
  });

  it("posts contact form submissions to the projected public operation route", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: requestUrlString(url), init });

      return Response.json({
        invocationId: "operation-1",
        operation: {
          entityName: "contact-message",
          operationName: "submit",
          canonicalKey: "contact-message.submit",
          kind: "create",
        },
        output: {
          type: "create",
          affectedChangeIds: ["10"],
          cursor: 12,
          record: {
            id: "message-1",
            entity: "contact-message",
            values: {
              name: "Ada Lovelace",
              email: "ada@example.com",
              message: "Please send details.",
            },
          },
        },
        status: "committed",
      });
    };

    await expect(
      submitSiteContactForm({
        email: "ada@example.com",
        fetcher,
        idempotencyKey: "site-contact:block-1:key-1",
        message: "Please send details.",
        name: "Ada Lovelace",
        route: "/api/site/public/operations/contact-message/submit",
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).resolves.toMatchObject({
      invocationId: "operation-1",
      operation: {
        entityName: "contact-message",
        operationName: "submit",
        canonicalKey: "contact-message.submit",
        kind: "create",
      },
      output: {
        type: "create",
        affectedChangeIds: ["10"],
        cursor: 12,
      },
      status: "committed",
    });
    expect(requests).toEqual([
      {
        url: "/api/site/public/operations/contact-message/submit",
        init: {
          body: JSON.stringify({
            input: {
              name: "Ada Lovelace",
              email: "ada@example.com",
              message: "Please send details.",
            },
            proof: {
              turnstileToken: "token-ok",
            },
            source: {
              siteBlockId: "block-1",
            },
            idempotencyKey: "site-contact:block-1:key-1",
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
      Response.json({ error: "Public operation challenge failed." }, { status: 403 });

    await expect(
      submitSiteContactForm({
        email: "ada@example.com",
        fetcher,
        idempotencyKey: "site-contact:block-1:key-1",
        message: "Please send details.",
        name: "Ada Lovelace",
        route: "/api/site/public/operations/contact-message/submit",
        siteBlockId: "block-1",
        turnstileToken: "bad-token",
      }),
    ).rejects.toThrow("Public operation challenge failed.");
  });
});

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
