import { describe, expect, it } from "vite-plus/test";

import { siteSubscribeFormRequestBody, submitSiteSubscribeForm } from "./subscribe-form.ts";

describe("public Site subscribe form submit helpers", () => {
  it("builds the public action body from email, source block id, idempotency key, and Turnstile token", () => {
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

  it("posts subscribe form submissions to the projected public action route", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: requestUrlString(url), init });

      return Response.json({
        actionId: "action-1",
        cursor: 12,
        status: "accepted",
      });
    };

    await expect(
      submitSiteSubscribeForm({
        email: "reader@example.com",
        fetcher,
        idempotencyKey: "site-subscribe:block-1:key-1",
        route: "/api/site/public/actions/subscribe",
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).resolves.toEqual({
      actionId: "action-1",
      cursor: 12,
      status: "accepted",
    });
    expect(requests).toEqual([
      {
        url: "/api/site/public/actions/subscribe",
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

  it("surfaces public-safe action errors", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ error: "Public action challenge failed." }, { status: 403 });

    await expect(
      submitSiteSubscribeForm({
        email: "reader@example.com",
        fetcher,
        idempotencyKey: "site-subscribe:block-1:key-1",
        route: "/api/site/public/actions/subscribe",
        siteBlockId: "block-1",
        turnstileToken: "bad-token",
      }),
    ).rejects.toThrow("Public action challenge failed.");
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
