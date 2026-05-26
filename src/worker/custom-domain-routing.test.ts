import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { PUBLIC_SITE_INDEXING_CACHE_CONTROL } from "./site-cache.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type DispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

const adminToken = "test-admin-token";
const mappedHost = "www.example.com";
const installId = "personal";

let harness: Harness;
let assetRequests: string[];

beforeEach(async () => {
  assetRequests = [];
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_RUNTIME_PROFILE: "instance",
      },
      compatibilityDate: "2026-04-28",
      r2Buckets: ["FORMLESS_MEDIA"],
      serviceBindings: {
        ASSETS: assetResponse,
      },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("installed Site custom-domain Worker routing", () => {
  it("renders mapped host documents from installed Site storage", async () => {
    await setupMappedSite();
    await postAdminJson(`/api/app-installs/site/${installId}/mutations`, {
      mutationId: "mutation-custom-domain-home-label",
      entity: "block",
      op: "patch",
      recordId: "rec_site_starter_page_home",
      values: {
        label: "Personal custom-domain home",
      },
    });

    const home = await fetchMappedHost("/", {
      headers: { Accept: "text/html" },
    });
    const nested = await fetchMappedHost("/blog/starter-post", {
      headers: { Accept: "text/html" },
    });
    const homeHtml = await home.text();
    const nestedHtml = await nested.text();

    expect(home.status).toBe(200);
    expect(homeHtml).toContain("Personal custom-domain home");
    expect(homeHtml).toContain(`<meta name="formless-runtime-profile" content="publishedSite" />`);
    expect(homeHtml).toContain('href="/blog"');
    expect(homeHtml).not.toContain('href="/sites/personal/blog"');
    expect(homeHtml).not.toContain("Loading site page...");

    expect(nested.status).toBe(200);
    expect(nestedHtml).toContain("Starter post");
    expect(nestedHtml).toContain('<meta property="og:type" content="article" />');
    expect(nestedHtml).not.toContain("Loading site page...");
  });

  it("serves mapped host indexing, icons, and installed media from the mapped install", async () => {
    await setupMappedSite();
    await postAdminJson(`/api/app-installs/site/${installId}/mutations`, {
      mutationId: "mutation-custom-domain-sitemap-page",
      entity: "block",
      op: "create",
      values: {
        type: "page",
        label: "Custom domain sitemap page",
        href: "/custom-domain-sitemap-page",
      },
    });
    await postAdminJson(`/api/app-installs/site/${installId}/mutations`, {
      mutationId: "mutation-custom-domain-site-icon",
      entity: "site",
      op: "patch",
      recordId: "rec_site_settings_primary",
      values: {
        icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#16a34a"/></svg>',
      },
    });
    await putAdminBytes(
      `/api/app-installs/site/${installId}/media/app-installs/${installId}/site/images/custom-domain.png`,
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    );

    const robots = await fetchMappedHost("/robots.txt", {
      headers: { Accept: "text/html" },
    });
    const sitemap = await fetchMappedHost("/sitemap.xml", {
      headers: { Accept: "text/html" },
    });
    const favicon = await fetchMappedHost("/favicon.svg", {
      headers: { Accept: "text/html" },
    });
    const media = await fetchMappedHost(
      `/api/app-installs/site/${installId}/media/app-installs/${installId}/site/images/custom-domain.png`,
    );

    expect(robots.status).toBe(200);
    expect(robots.headers.get("Cache-Control")).toBe(PUBLIC_SITE_INDEXING_CACHE_CONTROL);
    expect(await robots.text()).toContain(`Sitemap: http://${mappedHost}/sitemap.xml`);

    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(await sitemap.text()).toContain(
      `<loc>http://${mappedHost}/custom-domain-sitemap-page</loc>`,
    );

    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(await favicon.text()).toContain("#16a34a");

    expect(media.status).toBe(200);
    expect(media.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });

  it("keeps path-based installed Site fallback off the mapped-host admin shell", async () => {
    await setupMappedSite();
    assetRequests = [];

    const fallback = await harness.fetch(`/sites/${installId}`, {
      headers: { Accept: "text/html" },
    });
    const mappedAdmin = await fetchMappedHost(`/apps/${installId}`, {
      headers: { Accept: "text/html" },
    });
    const mappedSetup = await fetchMappedHost("/setup", {
      headers: { Accept: "text/html" },
    });

    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toBe(`asset:/sites/${installId}`);
    expect(mappedAdmin.status).toBe(404);
    expect(mappedSetup.status).toBe(404);
    expect(assetRequests).toEqual([`/sites/${installId}`]);
  });
});

async function setupMappedSite() {
  await postAdminJson("/api/formless/app-installs", {
    packageAppKey: "site",
    installId,
    label: "Personal",
  });
  await postAdminJson("/api/formless/domain-mappings", {
    host: mappedHost,
    surface: "site",
    installId,
  });
}

function fetchMappedHost(path: string, init?: DispatchFetchInit) {
  return harness.mf.dispatchFetch(`http://${mappedHost}${path}`, init);
}

async function postAdminJson(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect([200, 201]).toContain(response.status);

  return response;
}

async function putAdminBytes(path: string, body: Uint8Array, contentType: string) {
  const response = await harness.fetch(path, {
    body,
    headers: adminHeaders({ "Content-Type": contentType }),
    method: "PUT",
  });

  expect(response.status).toBe(200);

  return response;
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

function assetResponse(request: Request): Response {
  const pathname = new URL(request.url).pathname;
  assetRequests.push(pathname);

  if (pathname === "/index.html") {
    return new Response("<!doctype html><html><head></head><body></body></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(`asset:${pathname}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
