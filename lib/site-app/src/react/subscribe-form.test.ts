import { describe, expect, it } from "vite-plus/test";

import {
  TURNSTILE_RESPONSE_FIELD_NAME,
  siteSubscribeFormRequestBody,
  submitSiteSubscribeForm,
  turnstileResponseTokenFromFormData,
} from "./subscribe-form.ts";

describe("public Site subscribe form submit helpers", () => {
  it("extracts the first non-empty Turnstile response from duplicate response fields", () => {
    const formData = new FormData();

    formData.append(TURNSTILE_RESPONSE_FIELD_NAME, "");
    formData.append(TURNSTILE_RESPONSE_FIELD_NAME, "token-ok");

    expect(turnstileResponseTokenFromFormData(formData)).toBe("token-ok");
  });

  it("builds the public operation body from email, source block id, idempotency key, and Turnstile token", () => {
    expect(
      siteSubscribeFormRequestBody({
        email: "reader@example.com",
        idempotencyKey: "site-subscribe:block-1:key-1",
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).toEqual({
      input: {
        email: "reader@example.com",
      },
      proof: {
        turnstileToken: "token-ok",
      },
      source: {
        siteBlockId: "block-1",
      },
      idempotencyKey: "site-subscribe:block-1:key-1",
    });
  });

  it("posts subscribe form submissions to the projected public operation route", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: requestUrlString(url), init });

      return Response.json({
        invocationId: "operation-1",
        operation: {
          entityName: "subscription",
          operationName: "subscribe",
          canonicalKey: "subscription.subscribe",
          kind: "command",
        },
        output: {
          type: "command",
          affectedChangeIds: ["10"],
          cursor: 12,
        },
        status: "committed",
      });
    };

    await expect(
      submitSiteSubscribeForm({
        email: "reader@example.com",
        fetcher,
        idempotencyKey: "site-subscribe:block-1:key-1",
        route: "/api/site/public/operations/subscription/subscribe",
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).resolves.toEqual({
      invocationId: "operation-1",
      operation: {
        entityName: "subscription",
        operationName: "subscribe",
        canonicalKey: "subscription.subscribe",
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
        url: "/api/site/public/operations/subscription/subscribe",
        init: {
          body: JSON.stringify({
            input: {
              email: "reader@example.com",
            },
            proof: {
              turnstileToken: "token-ok",
            },
            source: {
              siteBlockId: "block-1",
            },
            idempotencyKey: "site-subscribe:block-1:key-1",
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
      submitSiteSubscribeForm({
        email: "reader@example.com",
        fetcher,
        idempotencyKey: "site-subscribe:block-1:key-1",
        route: "/api/site/public/operations/subscription/subscribe",
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
