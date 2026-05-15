import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_RUNTIME_PROFILE: "publishedSite",
      },
      compatibilityDate: "2026-04-28",
      serviceBindings: {
        ASSETS: packagePublicAssetResponse,
      },
    },
  );
});

afterAll(async () => {
  await harness.dispose();
});

describe("published Site launch assets", () => {
  it("serves favicon and touch icon assets from package public assets", async () => {
    const svg = await assetBytes("/favicon.svg");
    const ico = await assetBytes("/favicon.ico");
    const appleTouchIcon = await assetBytes("/apple-touch-icon.png");

    expect(svg.contentType).toContain("image/svg+xml");
    expect(svg.bytesAsText()).toContain("<svg");
    expect(ico.contentType).not.toContain("text/html");
    expect(ico.bytes.subarray(0, 4)).toEqual(new Uint8Array([0, 0, 1, 0]));
    expect(appleTouchIcon.contentType).toContain("image/png");
    expect(appleTouchIcon.bytes.subarray(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });
});

async function assetBytes(path: string) {
  const response = await harness.fetch(path, {
    headers: { Accept: "text/html" },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("Content-Type") ?? "";

  expect(response.status).toBe(200);
  expect(contentType).not.toContain("text/html");

  return {
    bytes,
    bytesAsText: () => new TextDecoder().decode(bytes),
    contentType,
  };
}

async function packagePublicAssetResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const bytes = await readFile(new URL(`../../public${url.pathname}`, import.meta.url));
  const contentType = contentTypeForPath(url.pathname);

  return new Response(bytes, {
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });
}

function contentTypeForPath(pathname: string): string | undefined {
  if (pathname.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (pathname.endsWith(".ico")) {
    return "image/x-icon";
  }

  if (pathname.endsWith(".png")) {
    return "image/png";
  }

  return undefined;
}
