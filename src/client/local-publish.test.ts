import { describe, expect, it } from "vite-plus/test";

import { triggerLocalSitePublish } from "./local-publish.ts";

describe("local Site publish client", () => {
  it("posts to the CLI broker with only the local broker token", async () => {
    const requests: Array<{ headers: Record<string, string>; method: string; url: string }> = [];

    const result = await triggerLocalSitePublish(
      {
        endpoint: "http://127.0.0.1:43123/publish",
        token: "local-broker-token",
      },
      async (url, init) => {
        requests.push({
          headers: normalizeHeaders(init?.headers),
          method: init?.method ?? "GET",
          url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
        });

        return Response.json({
          ok: true,
          result: {
            publish: {
              backupPath: ".formless/backups/site.snapshot.json",
              mode: "apply",
              sourceRecordCount: 3,
              target: "https://live.example",
            },
            save: {
              mediaCount: 1,
              recordCount: 3,
              source: "http://localhost:5173",
            },
          },
        });
      },
    );

    expect(requests).toEqual([
      {
        headers: {
          accept: "application/json",
          authorization: "Bearer local-broker-token",
        },
        method: "POST",
        url: "http://127.0.0.1:43123/publish",
      },
    ]);
    expect(result.publish.target).toBe("https://live.example");
  });

  it("surfaces broker errors", async () => {
    await expect(
      triggerLocalSitePublish(
        {
          endpoint: "http://127.0.0.1:43123/publish",
          token: "local-broker-token",
        },
        async () =>
          Response.json({ error: "Deploy setup is missing.", ok: false }, { status: 500 }),
      ),
    ).rejects.toThrow("Deploy setup is missing.");
  });
});

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}
