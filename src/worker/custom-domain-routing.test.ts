import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { computeSourceSchemaHash } from "@dpeek/formless-installed-apps";
import {
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
} from "@dpeek/formless-instance-control-plane";
import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
import type { AppSchema } from "@dpeek/formless-schema";

import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
} from "../app/runtime-profile.ts";
import { ownerLoginRedirectLocationForRoute } from "../shared/instance-auth.ts";
import { LOCAL_SESSION_BOOTSTRAP_API_PATH } from "@dpeek/formless-gateway";
import { PUBLIC_SITE_INDEXING_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH } from "./instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { INTERNAL_RESET_OWNER_SETUP_PATH } from "./owner-setup.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";
import {
  HOST_AUTH_NONCE_COOKIE_NAME,
  HOST_AUTH_SESSION_COOKIE_NAME,
  INSTANCE_AUTH_HANDOFF_CALLBACK_PATH,
  INSTANCE_AUTH_HANDOFF_START_PATH,
} from "./instance-auth-handoff.ts";
import { recordOperationRequest, operationWriteRequest } from "../test/authority-write.ts";
import { ensureTestIdentityOwner } from "../test/identity-owner.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";
import { workspaceAppPackageManifestFixture } from "../test/workspace-app-package.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type DispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

const adminToken = "test-admin-token";
const controlPlaneApi = "/api/formless/control-plane";
const createAppInstallOperation = `${controlPlaneApi}/operations/app-install/createAppInstall`;
const mappedHost = "www.example.com";
const mappedAppHost = "tasks.example.com";
const mappedInstanceHost = "admin.example.com";
const installId = "personal";
const privateSitePackageAppKey = "private-site";
const privateSiteInstallId = "private-site";
const taskInstallId = "task-workspace";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

let harness: Harness;
let defaultHarness: Harness;
let assetRequests: string[];
const routeRecordIds = new Map<string, string>();

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
  it("seeds auth config from local dev origin or configured production identity", async () => {
    const localHarness = await createCustomDomainHarness();

    try {
      await expectAuthConfigRp(localHarness, "local.formless.local", "local.formless.local");
    } finally {
      await localHarness.dispose();
    }

    await expectAuthConfigMissing(harness, "personal.dpeek.workers.dev");
    await setupPrimaryProductionIdentity();
    await expectAuthConfigRp(harness, "personal.dpeek.workers.dev", "example.com");
  }, 10_000);

  it("renders mapped host documents from installed Site storage", async () => {
    await setupMappedSite();
    await postInstalledAppRecordOperation("site", installId, {
      idempotencyKey: "write-custom-domain-home-label",
      entity: "block",
      operationName: "update",
      recordId: "rec_site_starter_page_home",
      input: {
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
    await postInstalledAppRecordOperation("site", installId, {
      idempotencyKey: "write-custom-domain-sitemap-page",
      entity: "block",
      operationName: "create",
      input: {
        type: "page",
        label: "Custom domain sitemap page",
        href: "/custom-domain-sitemap-page",
      },
    });
    await postInstalledAppRecordOperation("site", installId, {
      idempotencyKey: "write-custom-domain-site-icon",
      entity: "site",
      operationName: "update",
      recordId: "rec_site_settings_primary",
      input: {
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
      await createRouteRecord("route:host:instance:admin.example.com", {
        enabled: true,
        matchHost: "admin.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "instance",
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
      const staleOwnerSession = await createOwnerSessionCookie({
        env: { FORMLESS_ADMIN_TOKEN: adminToken },
        maxAgeSeconds: 60,
        now: "2999-01-01T00:00:00.000Z",
        owner: {
          id: "stale-owner",
          name: "Stale Owner",
          createdAt: "2999-01-01T00:00:00.000Z",
        },
        request: new Request("http://admin.example.com/"),
      });
      const staleCookieHome = await fetchHost("admin.example.com", "/", {
        headers: {
          Accept: "text/html",
          Cookie: cookiePair(staleOwnerSession.cookie),
        },
        redirect: "manual",
      });
      const mappingLookup = await fetchHost(
        "admin.example.com",
        "/api/formless/domain-mappings/lookup?host=admin.example.com&profile=instance",
        { headers: adminHeaders() },
      );
      const schemaKeyApi = await fetchHost("admin.example.com", "/api/site/bootstrap");

      expect(home.status).toBe(302);
      expect(home.headers.get("Location")).toBe("/login?redirectTo=%2F");
      expect(publicSitePage.status).toBe(302);
      expect(publicSitePage.headers.get("Location")).toBe(
        "/login?redirectTo=%2Fblog%2Fstarter-post",
      );
      expect(staleCookieHome.status).toBe(302);
      expect(staleCookieHome.headers.get("Location")).toBe("/login?redirectTo=%2F");
      expect(mappingLookup.status).toBe(200);
      expect(schemaKeyApi.status).toBe(404);
      expect(assetRequests).toEqual([]);
    });
  });

  it("serves an anonymous app profile custom host with installed app document hints", async () => {
    await setupMappedApp({ access: "anonymous" });
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

  it("starts owner auth handoff for mapped app hosts", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp();
    assetRequests = [];

    const response = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const location = requiredHeader(response, "Location");
    const handoffUrl = new URL(location);
    const mappedAppRouteId = routeRecordIds.get(`route:host:app:${mappedAppHost}`);

    expect(response.status).toBe(302);
    expect(handoffUrl.origin).toBe("https://www.example.com");
    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(handoffUrl.searchParams.get("targetOrigin")).toBe(`https://${mappedAppHost}`);
    expect(handoffUrl.searchParams.get("routeId")).toBe(mappedAppRouteId);
    expect(handoffUrl.searchParams.get("targetProfile")).toBe("app");
    expect(handoffUrl.searchParams.get("appInstallId")).toBe(taskInstallId);
    expect(handoffUrl.searchParams.get("storageIdentity")).toBe(`app:${taskInstallId}`);
    expect(handoffUrl.searchParams.get("returnTo")).toBe("/schema?view=board");
    expect(handoffUrl.searchParams.get("nonceHash")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(handoffUrl.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(response.headers.get("Set-Cookie")).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=`);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
    expect(assetRequests).toEqual([]);
  });

  it("issues owner handoff grants on the auth origin after owner authority", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp();

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Owner Example",
    });
    const session = await createOwnerSessionCookie({
      env: { FORMLESS_ADMIN_TOKEN: adminToken },
      maxAgeSeconds: 60,
      now: "2999-01-01T00:00:00.000Z",
      owner,
      request: new Request("https://www.example.com/"),
    });
    const start = await fetchHost(mappedAppHost, "/", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const startLocation = requiredHeader(start, "Location");
    const unauthenticated = await harness.mf.dispatchFetch(startLocation, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const authenticated = await harness.mf.dispatchFetch(startLocation, {
      headers: {
        Accept: "text/html",
        Cookie: cookiePair(session.cookie),
      },
      redirect: "manual",
    });
    const callbackUrl = new URL(requiredHeader(authenticated, "Location"));
    const startUrl = new URL(startLocation);

    expect(unauthenticated.status).toBe(302);
    expect(unauthenticated.headers.get("Location")).toBe(
      ownerLoginRedirectLocationForRoute(`${INSTANCE_AUTH_HANDOFF_START_PATH}${startUrl.search}`),
    );

    expect(authenticated.status).toBe(302);
    expect(callbackUrl.origin).toBe(`https://${mappedAppHost}`);
    expect(callbackUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(callbackUrl.searchParams.get("grantId")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("grantSecret")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("state")).toBe(startUrl.searchParams.get("state"));
    expect(requiredHeader(authenticated, "Location")).not.toContain("nonceHash=");
  });

  it("consumes mapped app auth callbacks into host-local session cookies", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp();
    assetRequests = [];

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Callback Owner",
    });
    const session = await createOwnerSessionCookie({
      env: { FORMLESS_ADMIN_TOKEN: adminToken },
      maxAgeSeconds: 60,
      now: "2999-01-01T00:00:00.000Z",
      owner,
      request: new Request("https://www.example.com/"),
    });
    const start = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const nonceCookie = cookiePair(requiredHeader(start, "Set-Cookie"));
    const grant = await harness.mf.dispatchFetch(requiredHeader(start, "Location"), {
      headers: {
        Accept: "text/html",
        Cookie: cookiePair(session.cookie),
      },
      redirect: "manual",
    });
    const callbackLocation = requiredHeader(grant, "Location");
    const wrongHostUrl = new URL(callbackLocation);
    const wrongStateUrl = new URL(callbackLocation);
    const mappedAppRouteId = routeRecordIds.get(`route:host:app:${mappedAppHost}`);

    wrongHostUrl.hostname = "www.example.com";
    wrongStateUrl.searchParams.set("state", "d3Jvbmc");

    const wrongHost = await harness.mf.dispatchFetch(wrongHostUrl.toString(), {
      headers: { Cookie: nonceCookie },
      redirect: "manual",
    });
    const wrongState = await harness.mf.dispatchFetch(wrongStateUrl.toString(), {
      headers: { Cookie: nonceCookie },
      redirect: "manual",
    });
    const wrongNonce = await harness.mf.dispatchFetch(callbackLocation, {
      headers: { Cookie: `${HOST_AUTH_NONCE_COOKIE_NAME}=wrong` },
      redirect: "manual",
    });
    const callback = await harness.mf.dispatchFetch(callbackLocation, {
      headers: { Cookie: nonceCookie },
      redirect: "manual",
    });
    const replay = await harness.mf.dispatchFetch(callbackLocation, {
      headers: { Cookie: nonceCookie },
      redirect: "manual",
    });
    const setCookie = requiredHeader(callback, "Set-Cookie");
    const hostSessionPayload = signedCookiePayload(setCookie, HOST_AUTH_SESSION_COOKIE_NAME);

    expect(wrongHost.status).toBe(400);
    expect(wrongState.status).toBe(400);
    expect(wrongNonce.status).toBe(400);
    expect(wrongHost.headers.get("Set-Cookie") ?? "").not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(wrongState.headers.get("Set-Cookie") ?? "").not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(wrongNonce.headers.get("Set-Cookie") ?? "").not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/schema?view=board");
    expect(setCookie).toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=;`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
    expect(hostSessionPayload).toEqual(
      expect.objectContaining({
        appInstallId: taskInstallId,
        instanceId: "www.example.com",
        principalId: owner.id,
        purpose: "host-session",
        routeId: mappedAppRouteId,
        sessionVersion: 0,
        storageIdentity: `app:${taskInstallId}`,
        targetOrigin: `https://${mappedAppHost}`,
        targetProfile: "app",
        version: 1,
      }),
    );
    expect(Date.parse(hostSessionPayload.issuedAt as string)).toBeGreaterThan(0);
    expect(Date.parse(hostSessionPayload.expiresAt as string)).toBeGreaterThan(
      Date.parse(hostSessionPayload.issuedAt as string),
    );
    expect(replay.status).toBe(400);
    expect(replay.headers.get("Set-Cookie") ?? "").not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(assetRequests).toEqual([]);
  });

  it("accepts host-local sessions for matched mapped app owner routes and APIs", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp();

    const { cookie } = await createMappedAppHostSession("Authorized Host Owner");
    const writeRequest = recordOperationRequest({
      idempotencyKey: "host-session-write",
      entity: "task",
      operationName: "create",
      input: { title: "Host session write", done: false },
    });

    assetRequests = [];

    const shell = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: {
        Accept: "text/html",
        Cookie: cookie,
      },
      redirect: "manual",
    });
    const bootstrap = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: cookie },
      },
    );
    const write = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}${writeRequest.path.slice("/api".length)}`,
      {
        body: JSON.stringify(writeRequest.body),
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const writeBody = writeRequest.response(await write.json());

    expect(shell.status).toBe(200);
    expect(bootstrap.status).toBe(200);
    expect(write.status).toBe(200);
    expect(writeBody.record.values.title).toBe("Host session write");
    expect(assetRequests).toEqual(["/index.html"]);
  });

  it("issues authenticated handoff grants for active principals while preserving owner rechecks", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp({ access: "authenticated" });

    const principal = await createActivePrincipalSessionCookie("Authenticated Principal");
    const start = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const grant = await harness.mf.dispatchFetch(requiredHeader(start, "Location"), {
      headers: {
        Accept: "text/html",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const callbackUrl = new URL(requiredHeader(grant, "Location"));

    expect(start.status).toBe(302);
    expect(grant.status).toBe(302);
    expect(callbackUrl.origin).toBe(`https://${mappedAppHost}`);
    expect(callbackUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);

    await resetWorkerState(harness);
    await setupPrimaryProductionIdentity();
    await setupMappedApp();

    const ownerOnlyPrincipal = await createActivePrincipalSessionCookie(
      "Owner Route Non Owner Principal",
    );
    const ownerOnlyStart = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const ownerOnlyStartUrl = new URL(requiredHeader(ownerOnlyStart, "Location"));
    const ownerOnlyGrant = await harness.mf.dispatchFetch(ownerOnlyStartUrl.toString(), {
      headers: {
        Accept: "text/html",
        Cookie: ownerOnlyPrincipal.cookie,
      },
      redirect: "manual",
    });

    expect(ownerOnlyGrant.status).toBe(302);
    expect(ownerOnlyGrant.headers.get("Location")).toBe(
      ownerLoginRedirectLocationForRoute(
        `${INSTANCE_AUTH_HANDOFF_START_PATH}${ownerOnlyStartUrl.search}`,
      ),
    );
  });

  it("executes authenticated operations from matched host-local sessions", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp({ access: "authenticated" });

    const { cookie, principalId } =
      await createAuthenticatedMappedAppHostSession("Authenticated Operator");
    const unauthenticatedBootstrap = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
    );
    const bootstrap = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: cookie },
      },
    );
    const bootstrapBody = (await bootstrap.json()) as { schema: AppSchema };
    const taskEntity = bootstrapBody.schema.entities.task;
    const createOperation = taskEntity?.operations?.create;

    if (!taskEntity || !createOperation) {
      throw new Error("Expected task create operation.");
    }

    const schema: AppSchema = {
      ...bootstrapBody.schema,
      entities: {
        ...bootstrapBody.schema.entities,
        task: {
          ...taskEntity,
          operations: {
            ...taskEntity.operations,
            create: {
              ...createOperation,
              policy: { actors: ["authenticated"] },
            },
          },
        },
      },
    };
    const schemaWrite = await harness.fetch(`/api/app-installs/tasks/${taskInstallId}/schema`, {
      body: JSON.stringify({ schema }),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    });
    const writeRequest = recordOperationRequest({
      idempotencyKey: "authenticated-host-session-create",
      entity: "task",
      operationName: "create",
      input: { title: "Authenticated host operation", done: false },
    });
    const write = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}${writeRequest.path.slice("/api".length)}`,
      {
        body: JSON.stringify(writeRequest.body),
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const writeBody = (await write.json()) as OperationInvocationResponse;

    expect(unauthenticatedBootstrap.status).toBe(401);
    expect(bootstrap.status).toBe(200);
    expect(schemaWrite.status).toBe(200);
    expect(write.status).toBe(200);
    expect(writeBody.invocation.actor).toMatchObject({
      kind: "authenticated",
      principalId,
      sessionTarget: {
        appInstallId: taskInstallId,
        storageIdentity: `app:${taskInstallId}`,
        targetOrigin: `https://${mappedAppHost}`,
        targetProfile: "app",
      },
    });
    expect(operationRecord(writeBody).values.title).toBe("Authenticated host operation");
  });

  it("rejects stale, disabled, and target-mismatched authenticated host sessions", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp({ access: "authenticated" });

    const { cookie, principalId, setCookie } = await createAuthenticatedMappedAppHostSession(
      "Stale Authenticated Principal",
    );
    const staleVersionCookie = await hostSessionCookieWithPayload(setCookie, {
      sessionVersion: 1,
    });
    const mismatchedCookie = await hostSessionCookieWithPayload(setCookie, {
      storageIdentity: "app:wrong-install",
    });

    const staleVersionRead = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: staleVersionCookie },
      },
    );
    const mismatchedRead = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: mismatchedCookie },
      },
    );

    await postAdminJson(`${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/principal/update`, {
      idempotencyKey: "disable-authenticated-principal",
      recordId: principalId,
      input: { status: "disabled" },
    });

    const disabledRead = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: cookie },
      },
    );

    expect(staleVersionRead.status).toBe(401);
    expect(mismatchedRead.status).toBe(401);
    expect(disabledRead.status).toBe(401);
  });

  it("accepts host-local sessions for matched mapped instance control-plane APIs", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const { cookie, setCookie } = await createMappedInstanceHostSession("Mapped Instance Owner");
    const mismatchedCookie = await hostSessionCookieWithPayload(setCookie, {
      appInstallId: taskInstallId,
      storageIdentity: `app:${taskInstallId}`,
      targetProfile: "app",
    });

    const bootstrap = await fetchHost(mappedInstanceHost, `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: cookie },
    });
    const routeWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/route/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-instance-host-session-route-create",
          input: {
            enabled: true,
            matchPath: "/host-session-route",
            kind: "mount",
            targetProfile: "instance",
            surface: "admin",
            access: "owner",
          },
        }),
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const createInstall = await fetchHost(mappedInstanceHost, createAppInstallOperation, {
      body: JSON.stringify({
        idempotencyKey: "mapped-instance-host-session-create-install",
        input: {
          packageAppKey: "site",
          installId: "host-session-site",
          label: "Host Session Site",
        },
      }),
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const mismatchedBootstrap = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/bootstrap`,
      {
        headers: { Cookie: mismatchedCookie },
      },
    );
    const mismatchedWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/route/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-instance-mismatched-host-session-route-create",
          input: {
            enabled: true,
            matchPath: "/mismatched-host-session-route",
            kind: "mount",
            targetProfile: "instance",
            surface: "admin",
            access: "owner",
          },
        }),
        headers: {
          Cookie: mismatchedCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const bootstrapBody = (await bootstrap.json()) as { records?: unknown[] };
    const routeWriteBody = (await routeWrite.json()) as OperationInvocationResponse;
    const createInstallBody = (await createInstall.json()) as OperationInvocationResponse;

    expect(bootstrap.status).toBe(200);
    expect(Array.isArray(bootstrapBody.records)).toBe(true);
    expect([200, 201]).toContain(routeWrite.status);
    expect(operationRecord(routeWriteBody).values).toMatchObject({
      matchPath: "/host-session-route",
      targetProfile: "instance",
    });
    expect(createInstall.status).toBe(200);
    expect(createInstallBody.status).toBe("committed");
    expect(mismatchedBootstrap.status).toBe(401);
    expect(mismatchedWrite.status).toBe(401);
  });

  it("accepts mapped instance host-local sessions with current operational management authority", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const instanceAdmin = await createInstanceAdminPrincipalSessionCookie("Mapped Instance Admin");
    const removedAdmin = await createInstanceAdminPrincipalSessionCookie("Removed Instance Admin");
    const disabledAdmin =
      await createInstanceAdminPrincipalSessionCookie("Disabled Instance Admin");
    const ordinary = await createActivePrincipalSessionCookie("Mapped Instance Ordinary");
    const adminCookie = await mappedInstanceHostSessionCookieForPrincipal(
      instanceAdmin.principalId,
    );
    const removedAdminCookie = await mappedInstanceHostSessionCookieForPrincipal(
      removedAdmin.principalId,
    );
    const disabledAdminCookie = await mappedInstanceHostSessionCookieForPrincipal(
      disabledAdmin.principalId,
    );
    const ordinaryCookie = await mappedInstanceHostSessionCookieForPrincipal(ordinary.principalId);
    const owner = await createMappedInstanceHostSession("Mapped Instance Owner Still Works");

    await postAdminJson(
      `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/role-assignment/delete`,
      {
        idempotencyKey: "mapped-instance-remove-admin-role",
        recordId: removedAdmin.assignmentId,
      },
    );
    await postAdminJson(`${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/principal/update`, {
      idempotencyKey: "mapped-instance-disable-admin-principal",
      recordId: disabledAdmin.principalId,
      input: { status: "disabled" },
    });

    const adminRead = await fetchHost(mappedInstanceHost, `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: adminCookie },
    });
    const adminWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-instance-admin-email-domain",
          input: {
            enabled: true,
            providerFamily: "cloudflare",
            domain: "mapped-mail.example.com",
          },
        }),
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const ownerWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/route/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-instance-owner-route",
          input: {
            enabled: true,
            matchPath: "/owner-host-session-route",
            kind: "mount",
            targetProfile: "instance",
            surface: "admin",
            access: "owner",
          },
        }),
        headers: {
          Cookie: owner.cookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const ordinaryRead = await fetchHost(mappedInstanceHost, `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: ordinaryCookie },
    });
    const removedRead = await fetchHost(mappedInstanceHost, `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: removedAdminCookie },
    });
    const disabledWrite = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/operations/email-domain/create`,
      {
        body: JSON.stringify({
          idempotencyKey: "mapped-instance-disabled-admin-email-domain",
          input: {
            enabled: true,
            providerFamily: "cloudflare",
            domain: "disabled-mapped-mail.example.com",
          },
        }),
        headers: {
          Cookie: disabledAdminCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const adminReadBody = (await adminRead.json()) as { records?: unknown[] };
    const adminWriteBody = (await adminWrite.json()) as OperationInvocationResponse;
    const ownerWriteBody = (await ownerWrite.json()) as OperationInvocationResponse;

    expect(adminRead.status).toBe(200);
    expect(Array.isArray(adminReadBody.records)).toBe(true);
    expect(adminWrite.status).toBe(200);
    expect(operationRecord(adminWriteBody).values.domain).toBe("mapped-mail.example.com");
    expect(ownerWrite.status).toBe(200);
    expect(operationRecord(ownerWriteBody).values.matchPath).toBe("/owner-host-session-route");
    expect(ordinaryRead.status).toBe(401);
    expect(removedRead.status).toBe(401);
    expect(disabledWrite.status).toBe(401);
  });

  it("rejects host-local sessions after owner authority or session version changes", async () => {
    await setupPrimaryProductionIdentity();
    await setupMappedApp();

    const { cookie, setCookie } = await createMappedAppHostSession("Stale Host Owner");
    const staleVersionCookie = await hostSessionCookieWithPayload(setCookie, {
      sessionVersion: 1,
    });

    const staleVersionRead = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: staleVersionCookie },
      },
    );

    await postReset(harness, `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/reset/seed`);

    assetRequests = [];

    const staleOwnerShell = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: {
        Accept: "text/html",
        Cookie: cookie,
      },
      redirect: "manual",
    });
    const staleOwnerRead = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: cookie },
      },
    );
    const handoffUrl = new URL(requiredHeader(staleOwnerShell, "Location"));

    expect(staleVersionRead.status).toBe(401);
    expect(staleOwnerShell.status).toBe(302);
    expect(handoffUrl.origin).toBe("https://www.example.com");
    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(staleOwnerRead.status).toBe(401);
    expect(assetRequests).toEqual([]);
  });

  it("reserves auth callbacks on mapped public Site hosts", async () => {
    await setupPrimaryProductionIdentity();
    await postAdminJson("/api/formless/app-installs", {
      packageAppKey: "site",
      installId,
      label: "Personal",
    });
    await createRouteRecord("route:host:publicSite:site.example.com", {
      enabled: true,
      matchHost: "site.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "public-site",
      appInstall: installId,
      surface: "public-site",
    });
    assetRequests = [];

    const callback = await fetchHost("site.example.com", INSTANCE_AUTH_HANDOFF_CALLBACK_PATH, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const body = (await callback.json()) as { error: string };

    expect(callback.status).toBe(400);
    expect(body.error).toBe("Handoff callback is invalid.");
    expect(assetRequests).toEqual([]);
  });

  it("resolves exact-host public Site route records before ordinary host behavior", async () => {
    await setupMappedSiteRouteRecord();
    await postInstalledAppRecordOperation("site", installId, {
      idempotencyKey: "write-route-record-home-label",
      entity: "block",
      operationName: "update",
      recordId: "rec_site_starter_page_home",
      input: {
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

  it("rejects mapped public Site targets without a Worker adapter instead of using source Site", async () => {
    await withHarness(
      await createCustomDomainHarness("instance", {
        [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: await privatePublicSiteRuntimePackages(),
      }),
      async () => {
        await setupMappedPrivateSiteRouteRecord();

        const document = await fetchMappedHost("/", {
          headers: { Accept: "text/html" },
        });
        const robots = await fetchMappedHost("/robots.txt");
        const favicon = await fetchMappedHost("/favicon.svg");
        const documentBody = (await document.json()) as { error: string };
        const robotsBody = (await robots.json()) as { error: string };
        const faviconBody = (await favicon.json()) as { error: string };
        const expectedError =
          'Package app "private-site" declares public Site runtime support, but no public Site Worker adapter is registered.';

        expect(document.status).toBe(400);
        expect(robots.status).toBe(400);
        expect(favicon.status).toBe(400);
        expect(documentBody.error).toBe(expectedError);
        expect(robotsBody.error).toBe(expectedError);
        expect(faviconBody.error).toBe(expectedError);
      },
    );
  });

  it("resolves anonymous exact-host app route records with installed app document hints", async () => {
    await setupMappedAppRouteRecord({ access: "anonymous" });
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
    });
    await createRouteRecord("route:redirect:docs.example.com", {
      enabled: true,
      matchHost: "docs.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "redirect",
      toUrl: "https://new.example.com/archive?keep=target",
      statusCode: "302",
      preservePath: false,
      preserveQueryString: false,
    });

    const redirected = await fetchHost("old.example.com", "/docs/start?ref=old", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const targetUrlRedirected = await fetchHost("docs.example.com", "/docs/start?ref=old", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });

    expect(redirected.status).toBe(308);
    expect(redirected.headers.get("Location")).toBe("https://new.example.com/docs/start?ref=old");
    expect(targetUrlRedirected.status).toBe(302);
    expect(targetUrlRedirected.headers.get("Location")).toBe(
      "https://new.example.com/archive?keep=target",
    );
    expect(assetRequests).toEqual([]);
  });

  it("returns not found for unmatched paths on redirect-captured hosts", async () => {
    await createRouteRecord("route:redirect:old.example.com", {
      enabled: true,
      matchHost: "old.example.com",
      matchPath: "/old",
      kind: "redirect",
      toHost: "new.example.com",
      statusCode: "308",
      preservePath: true,
      preserveQueryString: true,
    });
    assetRequests = [];

    const hostlessMount = await fetchHost("old.example.com", "/apps/site", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });

    expect(hostlessMount.status).toBe(404);
    expect(assetRequests).toEqual([]);

    await withHarness(await createCustomDomainHarness("publishedSite"), async () => {
      await createRouteRecord("route:redirect:old.example.com", {
        enabled: true,
        matchHost: "old.example.com",
        matchPath: "/old",
        kind: "redirect",
        toHost: "new.example.com",
        statusCode: "308",
        preservePath: true,
        preserveQueryString: true,
      });
      assetRequests = [];

      const ordinaryProfile = await fetchHost("old.example.com", "/blog/starter-post", {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const matchedRedirect = await fetchHost("old.example.com", "/old?ref=legacy", {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });

      expect(ordinaryProfile.status).toBe(404);
      expect(matchedRedirect.status).toBe(308);
      expect(matchedRedirect.headers.get("Location")).toBe(
        "https://new.example.com/old?ref=legacy",
      );
      expect(assetRequests).toEqual([]);
    });
  });

  it("stops mapped public Site routing after desired route disablement with provider evidence", async () => {
    await setupMappedSite();
    await postAdminJson("/api/formless/domain-mappings/apply-evidence", {
      accountId: "account-123",
      action: "created",
      alchemyResourceId: "primary-custom-domain-www-example-com-publicsite-personal",
      host: mappedHost,
      profile: "publicSite",
      provider: "cloudflare-worker-custom-domain",
      targetInstallId: installId,
      workerDomainId: "custom-domain-123",
      workerName: "formless-primary",
      zoneId: "zone-1",
      zoneName: "example.com",
    });
    await patchRouteRecord(`route:host:publicSite:${mappedHost}`, {
      enabled: false,
    });
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

async function expectAuthConfigMissing(targetHarness: Harness, host: string) {
  const origin = `https://${host}`;
  const options = await targetHarness.mf.dispatchFetch(
    `${origin}/api/formless/passkeys/register/options`,
    {
      body: JSON.stringify({ setupToken }),
      headers: { "Content-Type": "application/json", Origin: origin },
      method: "POST",
    },
  );
  const body = (await options.json()) as { error: string };

  expect(options.status).toBe(400);
  expect(body.error).toBe("Instance auth configuration is missing.");
}

async function setupPrimaryProductionIdentity() {
  await createRouteRecord("route:primary-production", {
    enabled: true,
    matchHost: "www.example.com",
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "instance",
    surface: "admin",
    access: "owner",
  });

  const primaryRoute = routeRecordIds.get("route:primary-production");

  expect(primaryRoute).toBeDefined();

  await postAdminJson(`${controlPlaneApi}/operations/instance-settings/create`, {
    idempotencyKey: "instance-settings-primary-production",
    input: {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      primaryRoute,
      authRelyingPartyId: "example.com",
      productionIdentityStatus: "configured",
    },
  });
}

async function setupMappedSite() {
  await setupMappedSiteRouteRecord();
}

async function setupMappedApp(values: Record<string, unknown> = {}) {
  await setupMappedAppRouteRecord(values);
}

async function setupMappedInstance(values: Record<string, unknown> = {}) {
  await createRouteRecord(`route:host:instance:${mappedInstanceHost}`, {
    enabled: true,
    matchHost: mappedInstanceHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "instance",
    surface: "admin",
    access: "owner",
    ...values,
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
  });
}

async function setupMappedAppRouteRecord(values: Record<string, unknown> = {}) {
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
    ...values,
  });
}

async function setupMappedPrivateSiteRouteRecord() {
  await postAdminJson("/api/formless/app-installs", {
    packageAppKey: privateSitePackageAppKey,
    installId: privateSiteInstallId,
    label: "Private Site",
  });
  await createRouteRecord(`route:host:publicSite:${mappedHost}`, {
    enabled: true,
    matchHost: mappedHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: "public-site",
    appInstall: privateSiteInstallId,
    surface: "public-site",
  });
}

async function createRouteRecord(recordId: string, values: Record<string, unknown>) {
  const response = await harness.fetch(`${controlPlaneApi}/operations/route/create`, {
    body: JSON.stringify({
      idempotencyKey: `route-${recordId}`,
      input: withoutLifecycleValues(values),
    }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect([200, 201]).toContain(response.status);

  const body = (await response.json()) as OperationInvocationResponse;
  routeRecordIds.set(recordId, operationRecord(body).id);
}

async function patchRouteRecord(recordId: string, values: Record<string, unknown>) {
  const actualRecordId = routeRecordIds.get(recordId) ?? recordId;
  await postAdminJson(`${controlPlaneApi}/operations/route/update`, {
    idempotencyKey: `route-${actualRecordId}-patch`,
    recordId: actualRecordId,
    input: withoutLifecycleValues(values),
  });
}

function operationRecord(response: OperationInvocationResponse) {
  if (response.output.type !== "create" && response.output.type !== "update") {
    throw new Error(`Expected route write operation output, received "${response.output.type}".`);
  }

  return response.output.record;
}

function withoutLifecycleValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  );
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

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

async function createMappedAppHostSession(ownerName: string) {
  const owner = await ensureTestIdentityOwner(harness, adminToken, {
    name: ownerName,
  });
  const session = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner,
    request: new Request("https://www.example.com/"),
  });
  const hostSession = await createMappedAppHostSessionFromCentralCookie(cookiePair(session.cookie));

  return {
    ...hostSession,
    owner,
  };
}

async function createAuthenticatedMappedAppHostSession(displayName: string) {
  const principal = await createActivePrincipalSessionCookie(displayName);
  const hostSession = await createMappedAppHostSessionFromCentralCookie(principal.cookie);

  return {
    ...hostSession,
    principalId: principal.principalId,
  };
}

async function createMappedAppHostSessionFromCentralCookie(centralCookie: string) {
  const start = await fetchHost(mappedAppHost, "/schema?view=board", {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  const grant = await harness.mf.dispatchFetch(requiredHeader(start, "Location"), {
    headers: {
      Accept: "text/html",
      Cookie: centralCookie,
    },
    redirect: "manual",
  });
  const callback = await harness.mf.dispatchFetch(requiredHeader(grant, "Location"), {
    headers: { Cookie: cookiePair(requiredHeader(start, "Set-Cookie")) },
    redirect: "manual",
  });
  const setCookie = requiredHeader(callback, "Set-Cookie");

  expect(callback.status).toBe(302);

  return {
    cookie: cookiePair(setCookie),
    setCookie,
  };
}

async function createActivePrincipalSessionCookie(displayName: string) {
  const response = await postAdminJson(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/principal/create`,
    {
      idempotencyKey: `active-principal-${displayName.replace(/\W+/g, "-").toLowerCase()}`,
      input: {
        displayName,
        kind: "human",
        status: "active",
      },
    },
  );
  const principal = operationRecord((await response.json()) as OperationInvocationResponse);
  const session = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: {
      id: principal.id,
      name: displayName,
      createdAt: principal.createdAt,
    },
    request: new Request("https://www.example.com/"),
  });

  return {
    cookie: cookiePair(session.cookie),
    principalId: principal.id,
  };
}

async function createInstanceAdminPrincipalSessionCookie(displayName: string) {
  const principal = await createActivePrincipalSessionCookie(displayName);
  const assignment = await assignIdentityInstanceRole(principal.principalId, "instance.admin");

  return {
    ...principal,
    assignmentId: assignment.id,
  };
}

async function assignIdentityInstanceRole(
  principalId: string,
  roleKey: "instance.admin" | "instance.owner",
) {
  const response = await postAdminJson(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/role-assignment/create`,
    {
      idempotencyKey: [
        "custom-domain-assign",
        principalId.replace(/\W+/g, "-"),
        roleKey.replace(/\./g, "-"),
      ].join("-"),
      input: {
        role: `role:${roleKey}`,
        targetKind: "principal",
        targetPrincipal: principalId,
        scopeKind: "instance",
        status: "active",
      },
    },
  );

  return operationRecord((await response.json()) as OperationInvocationResponse);
}

async function mappedInstanceHostSessionCookieForPrincipal(principalId: string) {
  const routeId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);

  if (!routeId) {
    throw new Error("Mapped instance route must be created before host session cookies.");
  }

  return `${HOST_AUTH_SESSION_COOKIE_NAME}=${await signCookiePayload({
    expiresAt: "2999-01-01T12:00:00.000Z",
    instanceId: "www.example.com",
    issuedAt: "2999-01-01T00:00:00.000Z",
    principalId,
    purpose: "host-session",
    routeId,
    sessionVersion: 0,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    targetOrigin: `https://${mappedInstanceHost}`,
    targetProfile: "instance",
    version: 1,
  })}`;
}

async function createMappedInstanceHostSession(ownerName: string) {
  const owner = await ensureTestIdentityOwner(harness, adminToken, {
    name: ownerName,
  });
  const session = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner,
    request: new Request("https://www.example.com/"),
  });
  const start = await fetchHost(mappedInstanceHost, "/", {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  const grant = await harness.mf.dispatchFetch(requiredHeader(start, "Location"), {
    headers: {
      Accept: "text/html",
      Cookie: cookiePair(session.cookie),
    },
    redirect: "manual",
  });
  const callback = await harness.mf.dispatchFetch(requiredHeader(grant, "Location"), {
    headers: { Cookie: cookiePair(requiredHeader(start, "Set-Cookie")) },
    redirect: "manual",
  });
  const setCookie = requiredHeader(callback, "Set-Cookie");

  expect(callback.status).toBe(302);

  return {
    cookie: cookiePair(setCookie),
    owner,
    setCookie,
  };
}

function signedCookiePayload(setCookieHeader: string, cookieName: string): Record<string, unknown> {
  const value = setCookieValue(setCookieHeader, cookieName);
  const [payloadPart, signature] = value.split(".", 2);

  expect(payloadPart).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);

  return JSON.parse(base64UrlDecodeUtf8(payloadPart)) as Record<string, unknown>;
}

async function hostSessionCookieWithPayload(
  setCookieHeader: string,
  overrides: Record<string, unknown>,
) {
  const payload = {
    ...signedCookiePayload(setCookieHeader, HOST_AUTH_SESSION_COOKIE_NAME),
    ...overrides,
  };

  return `${HOST_AUTH_SESSION_COOKIE_NAME}=${await signCookiePayload(payload)}`;
}

async function signCookiePayload(payload: Record<string, unknown>) {
  const payloadPart = base64UrlEncodeUtf8(JSON.stringify(payload));
  const signature = await signString(payloadPart, adminToken);

  return `${payloadPart}.${signature}`;
}

function setCookieValue(setCookieHeader: string, cookieName: string): string {
  const marker = `${cookieName}=`;
  const start = setCookieHeader.indexOf(marker);

  if (start < 0) {
    throw new Error(`Missing ${cookieName} Set-Cookie value.`);
  }

  const value = setCookieHeader.slice(start + marker.length).split(";")[0];

  if (!value) {
    throw new Error(`Empty ${cookieName} Set-Cookie value.`);
  }

  return value;
}

function base64UrlDecodeUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function base64UrlEncodeUtf8(value: string) {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signString(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(signature));
}

function requiredHeader(
  response: { headers: { get(name: string): string | null } },
  name: string,
): string {
  const value = response.headers.get(name);

  if (!value) {
    throw new Error(`Missing ${name} header.`);
  }

  return value;
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

async function postInstalledAppRecordOperation(
  packageAppKey: string,
  appInstallId: string,
  body: Parameters<typeof recordOperationRequest>[0],
) {
  const request = recordOperationRequest(body);
  const response = await harness.fetch(
    `/api/app-installs/${packageAppKey}/${appInstallId}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    },
  );

  expect([200, 201]).toContain(response.status);

  return request.response(await response.json());
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

async function resetWorkerState(target: Harness) {
  routeRecordIds.clear();
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

function createCustomDomainHarness(
  runtimeProfile?: "instance" | "publishedSite",
  bindings: Record<string, string> = {},
) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        ...bindings,
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

async function privatePublicSiteRuntimePackages(): Promise<string> {
  const sourceSchemaHash = await computeSourceSchemaHash(siteSourceSchema);

  return formatRuntimeWorkspaceAppPackages([
    {
      manifest: workspaceAppPackageManifestFixture({
        packageAppKey: privateSitePackageAppKey,
        defaultInstallId: privateSiteInstallId,
        label: "Private Site",
        sourceSchemaHash,
        capabilities: [
          { kind: "generatedAdmin", routeBase: "/apps" },
          { kind: "publicSite", routeBase: "/sites" },
        ],
      }),
      sourceSchema: siteSourceSchema,
      seedRecords: siteSeedRecords,
    },
  ]);
}
