import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
} from "../app/runtime-profile.ts";
import { LOCAL_SESSION_BOOTSTRAP_API_PATH } from "@dpeek/formless-gateway";
import { PUBLIC_SITE_INDEXING_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH } from "./instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { INTERNAL_RESET_OWNER_SETUP_PATH } from "./owner-setup.ts";
import { operationWriteRequest } from "../test/authority-write.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type DispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

const adminToken = "test-admin-token";
const controlPlaneApi = "/api/formless/control-plane";
const mappedHost = "www.example.com";
const mappedAppHost = "tasks.example.com";
const installId = "personal";
const taskInstallId = "task-workspace";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

let harness: Harness;
let defaultHarness: Harness;
let assetRequests: string[];

beforeAll(async () => {
  defaultHarness = await createCustomDomainHarness("instance");
});

beforeEach(async () => {
  harness = defaultHarness;
  assetRequests = [];
  await resetWorkerState(harness);
});

afterAll(async () => {
  await defaultHarness.dispose();
});

describe("installed Site custom-domain Worker routing", () => {
  it("seeds canonical auth config for local dev and deployed instance origins", async () => {
    const localHarness = await createCustomDomainHarness();

    try {
      await expectAuthConfigRp(localHarness, "local.formless.local", "local.formless.local");
    } finally {
      await localHarness.dispose();
    }

    await expectAuthConfigRp(harness, "personal.dpeek.workers.dev", "personal.dpeek.workers.dev");
  }, 10_000);

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

  it("serves mapped host indexing, icons, and core media from the instance", async () => {
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
      "/api/formless/media/media/images/custom-domain.png",
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    );

    const robots = await fetchMappedHost("/robots.txt", {
      headers: { Accept: "text/html" },
    });
    const robotsText = await robots.text();

    const sitemap = await fetchMappedHost("/sitemap.xml", {
      headers: { Accept: "text/html" },
    });
    const sitemapText = await sitemap.text();

    const favicon = await fetchMappedHost("/favicon.svg", {
      headers: { Accept: "text/html" },
    });
    const faviconText = await favicon.text();

    const media = await fetchMappedHost("/api/formless/media/media/images/custom-domain.png");
    const mediaBytes = new Uint8Array(await media.arrayBuffer());

    expect(robots.status).toBe(200);
    expect(robots.headers.get("Cache-Control")).toBe(PUBLIC_SITE_INDEXING_CACHE_CONTROL);
    expect(robotsText).toContain(`Sitemap: http://${mappedHost}/sitemap.xml`);

    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(sitemapText).toContain(`<loc>http://${mappedHost}/custom-domain-sitemap-page</loc>`);

    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(faviconText).toContain("#16a34a");

    expect(media.status).toBe(200);
    expect(media.headers.get("Content-Type")).toBe("image/png");
    expect(mediaBytes).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
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
    const mappedSchemaKeyApi = await fetchMappedHost("/api/site/bootstrap");

    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toBe(`asset:/sites/${installId}`);
    expect(mappedAdmin.status).toBe(404);
    expect(mappedSetup.status).toBe(404);
    expect(mappedSchemaKeyApi.status).toBe(404);
    expect(assetRequests).toEqual([`/sites/${installId}`]);
  });

  it("keeps mapped public Site hosts outside owner auth routes", async () => {
    await setupMappedSite();

    const home = await fetchMappedHost("/", {
      headers: { Accept: "text/html" },
    });
    const login = await fetchMappedHost("/login", {
      headers: { Accept: "text/html" },
    });
    const passkeyOptions = await fetchMappedHost("/api/formless/passkeys/login/options", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const localSessionBootstrap = await fetchMappedHost(
      `${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=local-session-token`,
    );
    const session = await fetchMappedHost("/api/formless/session");
    const schemaKeyApi = await fetchMappedHost("/api/site/bootstrap");
    const homeHtml = await home.text();

    expect(home.status).toBe(200);
    expect(homeHtml).toContain(`<meta name="formless-runtime-profile" content="publishedSite" />`);
    expect(login.status).toBe(404);
    expect(passkeyOptions.status).toBe(404);
    expect(localSessionBootstrap.status).toBe(404);
    expect(session.status).toBe(404);
    expect(schemaKeyApi.status).toBe(404);
  });

  it("redirects an anonymous instance profile custom host instead of public Site SSR", async () => {
    await withHarness(await createCustomDomainHarness("publishedSite"), async () => {
      await postAdminJson("/api/formless/domain-mappings", {
        host: "admin.example.com",
        profile: "instance",
      });
      assetRequests = [];

      const home = await fetchHost("admin.example.com", "/", {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const publicSitePage = await fetchHost("admin.example.com", "/blog/starter-post", {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const instanceApi = await fetchHost("admin.example.com", "/api/formless/domain-mappings", {
        headers: adminHeaders(),
      });
      const schemaKeyApi = await fetchHost("admin.example.com", "/api/site/bootstrap");

      expect(home.status).toBe(302);
      expect(home.headers.get("Location")).toBe("/login?redirectTo=%2F");
      expect(publicSitePage.status).toBe(302);
      expect(publicSitePage.headers.get("Location")).toBe(
        "/login?redirectTo=%2Fblog%2Fstarter-post",
      );
      expect(instanceApi.status).toBe(200);
      expect(schemaKeyApi.status).toBe(404);
      expect(assetRequests).toEqual([]);
    });
  });

  it("serves an app profile custom host with installed app document hints", async () => {
    await setupMappedApp();
    assetRequests = [];

    const home = await fetchHost(mappedAppHost, "/", {
      headers: { Accept: "text/html" },
    });
    const schema = await fetchHost(mappedAppHost, "/schema", {
      headers: { Accept: "text/html" },
    });
    const login = await fetchHost(mappedAppHost, "/login", {
      headers: { Accept: "text/html" },
    });
    const passkeyOptions = await fetchHost(mappedAppHost, "/api/formless/passkeys/login/options", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const localSessionBootstrap = await fetchHost(
      mappedAppHost,
      `${LOCAL_SESSION_BOOTSTRAP_API_PATH}?token=local-session-token`,
    );
    const setupCapability = await fetchHost(mappedAppHost, "/api/formless/setup/capability", {
      body: JSON.stringify({ setupToken }),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    });
    const schemaKeyApi = await fetchHost(mappedAppHost, "/api/tasks/bootstrap");
    const installApi = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      { headers: adminHeaders() },
    );
    const homeHtml = await home.text();
    const schemaHtml = await schema.text();

    expect(home.status).toBe(200);
    expect(homeHtml).toContain(
      `<meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="app" />`,
    );
    expect(homeHtml).toContain(
      `<meta name="${FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME}" content="${taskInstallId}" />`,
    );
    expect(homeHtml).toContain(
      `<meta name="${FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME}" content="tasks" />`,
    );
    expect(homeHtml).not.toContain("Personal custom-domain home");
    expect(schema.status).toBe(200);
    expect(schemaHtml).toContain(
      `<meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="app" />`,
    );
    expect(login.status).toBe(404);
    expect(passkeyOptions.status).toBe(404);
    expect(localSessionBootstrap.status).toBe(404);
    expect(setupCapability.status).toBe(404);
    expect(schemaKeyApi.status).toBe(404);
    expect(installApi.status).toBe(200);
    expect(assetRequests).toEqual(["/index.html", "/index.html"]);
  });

  it("resolves exact-host public Site route records before ordinary host behavior", async () => {
    await setupMappedSiteRouteRecord();
    await postAdminJson(`/api/app-installs/site/${installId}/mutations`, {
      mutationId: "mutation-route-record-home-label",
      entity: "block",
      op: "patch",
      recordId: "rec_site_starter_page_home",
      values: {
        label: "Route record custom-domain home",
      },
    });

    const home = await fetchMappedHost("/", {
      headers: { Accept: "text/html" },
    });
    const homeHtml = await home.text();

    expect(home.status).toBe(200);
    expect(homeHtml).toContain("Route record custom-domain home");
    expect(homeHtml).toContain(`<meta name="formless-runtime-profile" content="publishedSite" />`);
  });

  it("resolves exact-host app route records with installed app document hints", async () => {
    await setupMappedAppRouteRecord();
    assetRequests = [];

    const home = await fetchHost(mappedAppHost, "/", {
      headers: { Accept: "text/html" },
    });
    const schemaKeyApi = await fetchHost(mappedAppHost, "/api/tasks/bootstrap");
    const homeHtml = await home.text();

    expect(home.status).toBe(200);
    expect(homeHtml).toContain(
      `<meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="app" />`,
    );
    expect(homeHtml).toContain(
      `<meta name="${FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME}" content="${taskInstallId}" />`,
    );
    expect(homeHtml).toContain(
      `<meta name="${FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME}" content="tasks" />`,
    );
    expect(schemaKeyApi.status).toBe(404);
    expect(assetRequests).toEqual(["/index.html"]);
  });

  it("resolves redirect route records with preserved path and query string", async () => {
    await createRouteRecord("route:redirect:old.example.com", {
      enabled: true,
      matchHost: "old.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "redirect",
      toHost: "new.example.com",
      statusCode: "308",
      preservePath: true,
      preserveQueryString: true,
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    });

    const redirected = await fetchHost("old.example.com", "/docs/start?ref=old", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });

    expect(redirected.status).toBe(308);
    expect(redirected.headers.get("Location")).toBe("https://new.example.com/docs/start?ref=old");
    expect(assetRequests).toEqual([]);
  });

  it("stops mapped public Site routing after desired mapping deletion", async () => {
    await setupMappedSite();
    await deleteAdminJson(`/api/formless/domain-mappings?host=${mappedHost}&profile=publicSite`);
    assetRequests = [];

    const home = await fetchMappedHost("/", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const nested = await fetchMappedHost("/blog/starter-post", {
      headers: { Accept: "text/html" },
    });

    expect(home.status).toBe(302);
    expect(home.headers.get("Location")).toBe("/login?redirectTo=%2F");
    expect(nested.status).toBe(404);
    expect(assetRequests).toEqual([]);
  });
});

async function expectAuthConfigRp(targetHarness: Harness, host: string, expectedRpId: string) {
  const origin = `https://${host}`;
  const capability = await targetHarness.mf.dispatchFetch(
    `${origin}/api/formless/setup/capability`,
    {
      body: JSON.stringify({ setupToken }),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    },
  );
  const options = await targetHarness.mf.dispatchFetch(
    `${origin}/api/formless/passkeys/register/options`,
    {
      body: JSON.stringify({ setupToken }),
      headers: { "Content-Type": "application/json", Origin: origin },
      method: "POST",
    },
  );
  const body = (await options.json()) as { options: { rp: { id: string; name: string } } };

  expect(capability.status).toBe(200);
  expect(options.status).toBe(200);
  expect(body.options.rp).toEqual({ id: expectedRpId, name: "Formless" });
}

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

async function setupMappedApp() {
  await postAdminJson("/api/formless/app-installs", {
    packageAppKey: "tasks",
    installId: taskInstallId,
    label: "Task Workspace",
  });
  await postAdminJson("/api/formless/domain-mappings", {
    host: mappedAppHost,
    profile: "app",
    targetInstallId: taskInstallId,
  });
}

async function setupMappedSiteRouteRecord() {
  await postAdminJson("/api/formless/app-installs", {
    packageAppKey: "site",
    installId,
    label: "Personal",
  });
  await createRouteRecord(`route:host:publicSite:${mappedHost}`, {
    enabled: true,
    matchHost: mappedHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "public-site",
    appInstall: installId,
    surface: "public-site",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  });
}

async function setupMappedAppRouteRecord() {
  await postAdminJson("/api/formless/app-installs", {
    packageAppKey: "tasks",
    installId: taskInstallId,
    label: "Task Workspace",
  });
  await createRouteRecord(`route:host:app:${mappedAppHost}`, {
    enabled: true,
    matchHost: mappedAppHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "app",
    appInstall: taskInstallId,
    surface: "admin",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  });
}

async function createRouteRecord(recordId: string, values: Record<string, unknown>) {
  await postAdminJson(`${controlPlaneApi}/mutations`, {
    mutationId: `mutation-${recordId}`,
    entity: "route",
    op: "create",
    recordId,
    values,
  });
}

function fetchMappedHost(path: string, init?: DispatchFetchInit) {
  return fetchHost(mappedHost, path, init);
}

function fetchHost(host: string, path: string, init?: DispatchFetchInit) {
  return fetchHarnessHost(harness, host, path, init);
}

function fetchHarnessHost(
  targetHarness: Harness,
  host: string,
  path: string,
  init?: DispatchFetchInit,
) {
  return targetHarness.mf.dispatchFetch(`http://${host}${path}`, init);
}

async function postAdminJson(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
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

async function deleteAdminJson(path: string) {
  const response = await harness.fetch(path, {
    headers: adminHeaders(),
    method: "DELETE",
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

async function resetWorkerState(target: Harness) {
  await Promise.all([
    postReset(target, `${controlPlaneApi}/reset/seed`),
    postReset(target, `/api/app-installs/site/${installId}/reset/seed`),
    postReset(target, `/api/app-installs/tasks/${taskInstallId}/reset/seed`),
    postInternalInstanceReset(target, INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH),
    postInternalInstanceReset(target, INTERNAL_RESET_OWNER_SETUP_PATH),
    clearMediaBucket(target),
  ]);
}

async function postReset(target: Harness, path: string) {
  const response = await target.fetch(path, {
    body: "{}",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function postInternalInstanceReset(target: Harness, path: string) {
  const response = await target.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    path,
    {
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function clearMediaBucket(target: Harness) {
  const bucket = await target.mf.getR2Bucket("FORMLESS_MEDIA");
  const objects = await bucket.list();

  if (objects.objects.length > 0) {
    await bucket.delete(objects.objects.map((object) => object.key));
  }
}

async function withHarness(target: Harness, run: () => Promise<void>) {
  const previousHarness = harness;

  harness = target;

  try {
    await run();
  } finally {
    harness = previousHarness;
    await target.dispose();
  }
}

function createCustomDomainHarness(runtimeProfile?: "instance" | "publishedSite") {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        ...(runtimeProfile === undefined ? {} : { FORMLESS_RUNTIME_PROFILE: runtimeProfile }),
      },
      compatibilityDate: "2026-04-28",
      r2Buckets: ["FORMLESS_MEDIA"],
      serviceBindings: {
        ASSETS: assetResponse,
      },
    },
  );
}
