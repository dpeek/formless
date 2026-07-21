import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import {
  ownerLoginRedirectLocationForRoute,
  type AccountCompletionGateTarget,
  type OwnerPasskeyRegistrationOptionsResponse,
  type OwnerPasskeyRegistrationVerifyResponse,
} from "../shared/instance-auth.ts";
import type { EmailDeliveryRenderedMessage } from "../shared/email-runtime.ts";
import { PUBLIC_SITE_INDEXING_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH } from "./instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { INTERNAL_RESET_OWNER_SETUP_PATH } from "./owner-setup.ts";
import { createOwnerSessionCookie, OWNER_SESSION_COOKIE_NAME } from "./owner-session.ts";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
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
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { StoredRecord } from "@dpeek/formless-storage";

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
let harnessDir: string;
let harnessPath: string;
let assetRequests: string[];
const routeRecordIds = new Map<string, string>();

beforeAll(async () => {
  harnessPath = await writeCustomDomainHarness();
  defaultHarness = await createCustomDomainHarness("instance");
});

beforeEach(() => {
  harness = defaultHarness;
  assetRequests = [];
  routeRecordIds.clear();
});

afterAll(async () => {
  await defaultHarness.dispose();
  await rm(harnessDir, { force: true, recursive: true });
});

describe("installed Site custom-domain Worker routing", () => {
  it("seeds passkey auth config from the configured production origin", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await expectOwnerPasskeyRouteNotFound(harness, "personal.dpeek.workers.dev");
    await expectAuthConfigRp(harness, "www.example.com", "example.com");
  });

  it("renders mapped host documents from installed Site storage", async () => {
    await resetWorkerState(harness, ["controlPlane", "siteStorage"]);
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
    await resetWorkerState(harness, ["controlPlane", "siteStorage", "media"]);
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
    await resetWorkerState(harness, ["controlPlane", "siteStorage"]);
    await setupMappedSite();
    assetRequests = [];

    const fallback = await harness.fetch(`/sites/${installId}`, {
      headers: { Accept: "text/html" },
    });
    const mappedAdmin = await fetchMappedHost(`/apps/${installId}`, {
      headers: { Accept: "text/html" },
    });
    const mappedSchemaKeyApi = await fetchMappedHost("/api/site/bootstrap");

    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toBe(`asset:/sites/${installId}`);
    expect(mappedAdmin.status).toBe(404);
    expect(mappedSchemaKeyApi.status).toBe(404);
    expect(assetRequests).toEqual([`/sites/${installId}`]);
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
      expect(home.headers.get("Location")).toBe(ownerLoginRedirectLocationForRoute("/"));
      expect(publicSitePage.status).toBe(302);
      expect(publicSitePage.headers.get("Location")).toBe(
        ownerLoginRedirectLocationForRoute("/blog/starter-post"),
      );
      expect(staleCookieHome.status).toBe(302);
      expect(staleCookieHome.headers.get("Location")).toBe(ownerLoginRedirectLocationForRoute("/"));
      expect(mappingLookup.status).toBe(200);
      expect(schemaKeyApi.status).toBe(404);
      expect(assetRequests).toEqual([]);
    });
  });

  it("serves an anonymous app profile custom host with installed app document hints", async () => {
    await resetWorkerState(harness, ["controlPlane", "taskStorage"]);
    await setupMappedApp({ access: "anonymous" });
    assetRequests = [];

    const home = await fetchHost(mappedAppHost, "/", {
      headers: { Accept: "text/html" },
    });
    const schema = await fetchHost(mappedAppHost, "/schema", {
      headers: { Accept: "text/html" },
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
    expect(schemaKeyApi.status).toBe(404);
    expect(installApi.status).toBe(200);
    expect(assetRequests).toEqual(["/index.html", "/index.html"]);
  });

  it("starts owner auth account handoff for mapped app hosts", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
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
    expect(handoffUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
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
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedApp();

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Owner Example",
    });
    const sessionCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const start = await fetchHost(mappedAppHost, "/", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const startLocation = requiredHeader(start, "Location");
    const unauthenticated = await harness.mf.dispatchFetch(startLocation, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const missingHandoffSessionUrl = new URL(
      `${INSTANCE_AUTH_HANDOFF_START_PATH}${new URL(startLocation).search}`,
      startLocation,
    );
    const missingHandoffSession = await harness.mf.dispatchFetch(
      missingHandoffSessionUrl.toString(),
      {
        headers: { Accept: "application/json" },
        redirect: "manual",
      },
    );
    const missingHandoffSessionBody = (await missingHandoffSession.json()) as { error?: string };
    const {
      account: authenticated,
      grant,
      handoffUrl,
    } = await issueHandoffGrantFromAuthAccount(startLocation, sessionCookie);
    const callbackUrl = new URL(requiredHeader(grant, "Location"), startLocation);
    const startUrl = new URL(startLocation);

    expect(unauthenticated.status).toBe(302);
    expect(unauthenticated.headers.get("Location")).toBe(
      ownerLoginRedirectLocationForRoute(
        `${runtimeTopologyRoutes.authAccountRoute}${startUrl.search}`,
      ),
    );
    expect(missingHandoffSession.status).toBe(401);
    expect(missingHandoffSession.headers.get("Location")).toBeNull();
    expect(missingHandoffSessionBody.error).toBe("Authenticated account session is required.");

    expect(authenticated.status).toBe(302);
    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(handoffUrl.search).toBe(startUrl.search);
    expect(grant.status).toBe(302);
    expect(callbackUrl.origin).toBe(`https://${mappedAppHost}`);
    expect(callbackUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(callbackUrl.searchParams.get("grantId")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("grantSecret")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("state")).toBe(startUrl.searchParams.get("state"));
    expect(requiredHeader(grant, "Location")).not.toContain("nonceHash=");
  });

  it("continues same-origin Workers.dev instance targets without exact-host routes", async () => {
    await withWorkersDevAuthHarness(async (deploymentOrigin) => {
      await resetWorkerState(harness, ["controlPlane", "auth"]);

      await configureHarnessAuth(deploymentOrigin);

      const capability = await harness.mf.dispatchFetch(
        `${deploymentOrigin}/api/formless/setup/capability`,
        {
          body: JSON.stringify({ setupToken, expiresAt: "2999-01-01T00:00:00.000Z" }),
          headers: adminHeaders({ "Content-Type": "application/json" }),
          method: "POST",
        },
      );
      const optionsResponse = await harness.mf.dispatchFetch(
        `${deploymentOrigin}/api/formless/passkeys/register/options`,
        {
          body: JSON.stringify({ setupToken }),
          headers: { "Content-Type": "application/json", Origin: deploymentOrigin },
          method: "POST",
        },
      );
      const options = (await optionsResponse.json()) as OwnerPasskeyRegistrationOptionsResponse;
      const authenticator = new VirtualPasskey("d29ya2Vycy1kZXYtb3duZXI");
      const setupResponse = await harness.mf.dispatchFetch(
        `${deploymentOrigin}/api/formless/passkeys/register/verify`,
        {
          body: JSON.stringify({
            setupToken,
            owner: { name: "Workers Dev Owner", email: "owner@example.com" },
            response: authenticator.registrationResponse(options.options, {
              origin: deploymentOrigin,
              rpId: "personal.dpeek.workers.dev",
            }),
          }),
          headers: { "Content-Type": "application/json", Origin: deploymentOrigin },
          method: "POST",
        },
      );
      const setup = (await setupResponse.json()) as OwnerPasskeyRegistrationVerifyResponse;
      const centralCookie = cookiePair(requiredHeader(setupResponse, "Set-Cookie"));
      const accountPath = setup.continueTo;

      expect(accountPath).toBe(`${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2F`);

      if (accountPath === undefined) {
        throw new Error("Expected owner passkey setup continuation.");
      }

      const unauthenticated = await harness.mf.dispatchFetch(`${deploymentOrigin}${accountPath}`, {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const authenticated = await harness.mf.dispatchFetch(`${deploymentOrigin}${accountPath}`, {
        headers: { Accept: "text/html", Cookie: centralCookie },
        redirect: "manual",
      });

      expect(capability.status).toBe(200);
      expect(optionsResponse.status).toBe(200);
      expect(setupResponse.status).toBe(200);
      expect(unauthenticated.status).toBe(302);
      expect(unauthenticated.headers.get("Location")).toBe(
        ownerLoginRedirectLocationForRoute(accountPath),
      );
      expect(authenticated.status).toBe(302);
      expect(authenticated.headers.get("Location")).toBe("/");
    });
  });

  it("continues owner-protected hostless installed apps on the instance profile", async () => {
    await withWorkersDevAuthHarness(async (deploymentOrigin) => {
      await resetWorkerState(harness, ["controlPlane", "auth", "taskStorage"]);

      await configureHarnessAuth(deploymentOrigin);
      await setupTaskAppInstall();

      const returnTo = `/apps/${taskInstallId}`;
      const accountPath = `${runtimeTopologyRoutes.authAccountRoute}?returnTo=${encodeURIComponent(returnTo)}`;
      const owner = await ensureTestIdentityOwner(harness, adminToken, {
        name: "Hostless App Owner",
      });
      const centralCookie = await createCentralAuthSessionCookieForPrincipal(
        owner.id,
        deploymentOrigin,
      );
      const unauthenticated = await harness.mf.dispatchFetch(`${deploymentOrigin}${accountPath}`, {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const authenticated = await harness.mf.dispatchFetch(`${deploymentOrigin}${accountPath}`, {
        headers: { Accept: "text/html", Cookie: centralCookie },
        redirect: "manual",
      });

      expect(unauthenticated.status).toBe(302);
      expect(unauthenticated.headers.get("Location")).toBe(
        ownerLoginRedirectLocationForRoute(accountPath),
      );
      expect(authenticated.status).toBe(302);
      expect(authenticated.headers.get("Location")).toBe(returnTo);
    });
  });

  it("reports, revokes, and clears central auth-origin sessions", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Central Session Owner",
    });
    const centralCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const deployedOwnerSession = await createOwnerSessionCookie({
      env: { FORMLESS_ADMIN_TOKEN: adminToken },
      maxAgeSeconds: 60,
      now: "2999-01-01T00:00:00.000Z",
      owner,
      request: new Request("https://www.example.com/"),
    });
    const centralStatus = await fetchHost("www.example.com", "/api/formless/session", {
      headers: { Cookie: centralCookie },
    });
    const centralStatusBody = (await centralStatus.json()) as {
      authenticated?: boolean;
      owner?: { id?: string };
      session?: { expiresAt?: string };
      setupComplete?: boolean;
    };
    const deployedOwnerStatus = await fetchHost("www.example.com", "/api/formless/session", {
      headers: { Cookie: cookiePair(deployedOwnerSession.cookie) },
    });
    const deployedOwnerStatusBody = (await deployedOwnerStatus.json()) as {
      authenticated?: boolean;
      owner?: { id?: string };
      setupComplete?: boolean;
    };
    const logout = await fetchHost("www.example.com", "/api/formless/session/logout", {
      headers: { Cookie: centralCookie },
      method: "POST",
    });
    const logoutBody = (await logout.json()) as { authenticated?: boolean };
    const afterLogout = await fetchHost("www.example.com", "/api/formless/session", {
      headers: { Cookie: centralCookie },
    });
    const afterLogoutBody = (await afterLogout.json()) as {
      authenticated?: boolean;
      owner?: { id?: string };
      setupComplete?: boolean;
    };
    const logoutSetCookie = requiredHeader(logout, "Set-Cookie");

    expect(centralStatus.status).toBe(200);
    expect(centralStatusBody).toMatchObject({
      authenticated: true,
      owner: { id: owner.id },
      setupComplete: true,
    });
    expect(Date.parse(centralStatusBody.session?.expiresAt ?? "")).toBeGreaterThan(0);
    expect(deployedOwnerStatus.status).toBe(200);
    expect(deployedOwnerStatusBody).toMatchObject({
      authenticated: false,
      owner: { id: owner.id },
      setupComplete: true,
    });
    expect(logout.status).toBe(200);
    expect(logoutBody.authenticated).toBe(false);
    expect(logoutSetCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=;`);
    expect(logoutSetCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(afterLogout.status).toBe(200);
    expect(afterLogoutBody).toMatchObject({
      authenticated: false,
      owner: { id: owner.id },
      setupComplete: true,
    });
  });

  it("accepts central auth-origin instance-admin sessions for management APIs", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();

    const instanceAdmin = await createInstanceAdminPrincipalSessionCookie("Central Instance Admin");
    const ordinary = await createActivePrincipalSessionCookie("Central Ordinary Principal");
    const adminRead = await fetchHost("www.example.com", `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: instanceAdmin.cookie },
    });
    const ordinaryRead = await fetchHost("www.example.com", `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: ordinary.cookie },
    });
    const adminReadBody = (await adminRead.json()) as { records?: unknown[] };
    const ordinaryReadBody = (await ordinaryRead.json()) as { error?: string };

    expect(adminRead.status).toBe(200);
    expect(Array.isArray(adminReadBody.records)).toBe(true);
    expect(ordinaryRead.status).toBe(401);
    expect(ordinaryReadBody.error).toBe(
      "Owner session, instance-admin session, or admin authorization is required for this read endpoint.",
    );
  });

  it("consumes mapped app auth callbacks into host-local session cookies", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedApp();
    assetRequests = [];

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Callback Owner",
    });
    const sessionCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const start = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const nonceCookie = cookiePair(requiredHeader(start, "Set-Cookie"));
    const { grant } = await issueHandoffGrantFromAuthAccount(
      requiredHeader(start, "Location"),
      sessionCookie,
    );
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
    await resetWorkerState(harness, ["controlPlane", "taskStorage", "auth"]);
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
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedApp({ access: "authenticated" });

    const principal = await createCompletionReadyPrincipalSessionCookie("Authenticated Principal");
    const start = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const startLocation = requiredHeader(start, "Location");
    const { account, grant, handoffUrl } = await issueHandoffGrantFromAuthAccount(
      startLocation,
      principal.cookie,
    );
    const callbackUrl = new URL(requiredHeader(grant, "Location"), startLocation);

    expect(start.status).toBe(302);
    expect(account.status).toBe(302);
    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(grant.status).toBe(302);
    expect(callbackUrl.origin).toBe(`https://${mappedAppHost}`);
    expect(callbackUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);

    await resetWorkerState(harness, ["controlPlane", "auth"]);
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
        `${runtimeTopologyRoutes.authAccountRoute}${ownerOnlyStartUrl.search}`,
      ),
    );
  });

  it("blocks authenticated handoff grants until target account gates are satisfied", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedApp({ access: "authenticated" });

    const principal = await createActivePrincipalSessionCookie("Blocked Authenticated Principal");
    const start = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const startLocation = requiredHeader(start, "Location");
    const missingEmail = await harness.mf.dispatchFetch(startLocation, {
      headers: {
        Accept: "application/json",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const missingEmailHtml = await harness.mf.dispatchFetch(startLocation, {
      headers: {
        Accept: "text/html",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const accountSurfaceUrl = new URL(startLocation);
    const directHandoffStartUrl = new URL(
      `${INSTANCE_AUTH_HANDOFF_START_PATH}${accountSurfaceUrl.search}`,
      accountSurfaceUrl,
    );
    const missingEmailHandoff = await harness.mf.dispatchFetch(directHandoffStartUrl.toString(), {
      headers: {
        Accept: "application/json",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const accountSurface = await harness.mf.dispatchFetch(accountSurfaceUrl.toString(), {
      headers: {
        Accept: "text/html",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const accountStatus = await harness.mf.dispatchFetch(accountSurfaceUrl.toString(), {
      headers: {
        Accept: "application/json",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const missingEmailBody = (await missingEmail.json()) as {
      gate?: { kind?: string };
      status?: string;
      target?: { returnTo?: string };
    };
    const missingEmailHandoffBody = (await missingEmailHandoff.json()) as {
      gate?: { kind?: string };
      status?: string;
      target?: { returnTo?: string };
    };
    const accountStatusBody = (await accountStatus.json()) as {
      gate?: { kind?: string };
      status?: string;
      target?: { returnTo?: string };
    };

    await createVerifiedPrimaryEmail(principal.principalId, "blocked-authenticated@example.com");
    await createPrivateCredentialForPrincipal(principal.principalId, "blocked-authenticated");

    const missingRegistration = await harness.mf.dispatchFetch(startLocation, {
      headers: {
        Accept: "application/json",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const missingRegistrationBody = (await missingRegistration.json()) as {
      gate?: { appInstallId?: string; kind?: string; registrationPolicy?: string };
      status?: string;
    };

    await createAppRegistration(principal.principalId, taskInstallId);

    const completeStatus = await harness.mf.dispatchFetch(accountSurfaceUrl.toString(), {
      headers: {
        Accept: "application/json",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const completeStatusBody = (await completeStatus.json()) as {
      continueTo?: string;
      status?: string;
      target?: { returnTo?: string; targetOrigin?: string };
    };
    const accountContinue = await harness.mf.dispatchFetch(startLocation, {
      headers: {
        Accept: "text/html",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const handoffStartUrl = new URL(requiredHeader(accountContinue, "Location"), startLocation);
    const granted = await harness.mf.dispatchFetch(handoffStartUrl.toString(), {
      headers: {
        Accept: "text/html",
        Cookie: principal.cookie,
      },
      redirect: "manual",
    });
    const callbackUrl = new URL(requiredHeader(granted, "Location"));

    expect(missingEmail.status).toBe(409);
    expect(missingEmail.headers.get("Location")).toBeNull();
    expect(missingEmailBody).toMatchObject({
      gate: { kind: "email-verification" },
      status: "blocked",
      target: { returnTo: "/schema?view=board" },
    });
    expect(JSON.stringify(missingEmailBody)).not.toContain("session");
    expect(JSON.stringify(missingEmailBody)).not.toContain("grantSecret");
    expect(missingEmailHtml.status).toBe(200);
    expect(missingEmailHtml.headers.get("Location")).toBeNull();
    expect(accountSurfaceUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(accountSurfaceUrl.search).toBe(new URL(startLocation).search);
    expect(missingEmailHtml.headers.get("Set-Cookie") ?? "").not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(accountSurface.status).toBe(200);
    expect(accountSurface.headers.get("Content-Type")).toContain("text/html");

    expect(missingEmailHandoff.status).toBe(409);
    expect(missingEmailHandoff.headers.get("Location")).toBeNull();
    expect(missingEmailHandoffBody).toMatchObject({
      gate: { kind: "email-verification" },
      status: "blocked",
      target: { returnTo: "/schema?view=board" },
    });
    expect(JSON.stringify(missingEmailHandoffBody)).not.toContain("grantSecret");

    expect(accountStatus.status).toBe(409);
    expect(accountStatus.headers.get("Location")).toBeNull();
    expect(accountStatus.headers.get("Set-Cookie")).toBeNull();
    expect(accountStatusBody).toMatchObject({
      gate: { kind: "email-verification" },
      status: "blocked",
      target: { returnTo: "/schema?view=board" },
    });
    expect(JSON.stringify(accountStatusBody)).not.toContain("session");
    expect(JSON.stringify(accountStatusBody)).not.toContain("grantSecret");
    expect(JSON.stringify(accountStatusBody)).not.toContain("credential");
    expect(JSON.stringify(accountStatusBody)).not.toContain("tokenHash");

    expect(missingRegistration.status).toBe(409);
    expect(missingRegistration.headers.get("Location")).toBeNull();
    expect(missingRegistrationBody).toMatchObject({
      gate: { appInstallId: taskInstallId, kind: "app-registration", registrationPolicy: "closed" },
      status: "blocked",
    });

    expect(completeStatus.status).toBe(200);
    expect(completeStatus.headers.get("Location")).toBeNull();
    expect(completeStatus.headers.get("Set-Cookie")).toBeNull();
    expect(completeStatusBody).toMatchObject({
      continueTo: `${INSTANCE_AUTH_HANDOFF_START_PATH}${accountSurfaceUrl.search}`,
      status: "complete",
      target: {
        returnTo: "/schema?view=board",
        targetOrigin: `https://${mappedAppHost}`,
      },
    });
    expect(JSON.stringify(completeStatusBody)).not.toContain("grantSecret");
    expect(JSON.stringify(completeStatusBody)).not.toContain("hostSessionCookie");

    expect(accountContinue.status).toBe(302);
    expect(handoffStartUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(granted.status).toBe(302);
    expect(callbackUrl.origin).toBe(`https://${mappedAppHost}`);
    expect(callbackUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(callbackUrl.searchParams.get("grantSecret")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("signs up mapped app users through auth-origin continuation, handoff, callback, and original path return", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await configureAuthEmail({ settingsMode: "update", testKey: "mapped-signup" });
    await setupMappedAppRouteRecord(
      { access: "authenticated" },
      { registrationPolicy: "email-verified" },
    );
    assetRequests = [];

    const entry = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const nonceCookie = cookiePair(requiredHeader(entry, "Set-Cookie"));
    const accountUrl = new URL(requiredHeader(entry, "Location"));
    const target = signupTargetFromAccountUrl(accountUrl);
    const signup = await completeEmailVerifiedSignup({
      accountSearch: accountUrl.search,
      credentialId: "Y3JlZGVudGlhbC1tYXBwZWQtaG9zdC0x",
      displayName: "Mapped Signup",
      email: "Mapped.Signup@example.com",
      rpId: "example.com",
      target,
    });
    const centralCookie = cookiePair(requiredHeader(signup.response, "Set-Cookie"));
    const handoffUrl = new URL(signup.body.continueTo ?? "/", "https://www.example.com");
    const grant = await harness.mf.dispatchFetch(handoffUrl.toString(), {
      headers: {
        Accept: "text/html",
        Cookie: centralCookie,
      },
      redirect: "manual",
    });
    const callbackLocation = requiredHeader(grant, "Location");
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
    const continued = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: {
        Accept: "text/html",
        Cookie: cookiePair(setCookie),
      },
      redirect: "manual",
    });

    expect(entry.status).toBe(302);
    expect(accountUrl.origin).toBe("https://www.example.com");
    expect(accountUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(target).toMatchObject({
      appInstallId: taskInstallId,
      returnTo: "/schema?view=board",
      storageIdentity: `app:${taskInstallId}`,
      targetOrigin: `https://${mappedAppHost}`,
      targetProfile: "app",
    });

    expect(signup.response.status).toBe(200);
    expect(requiredHeader(signup.response, "Set-Cookie")).not.toContain(
      `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    );
    expect(signup.body).toMatchObject({
      accountCompletion: { status: "complete" },
      continueTo: expect.stringContaining(INSTANCE_AUTH_HANDOFF_START_PATH),
      handoff: { returnTo: "/schema?view=board", targetOrigin: `https://${mappedAppHost}` },
      principal: { displayName: "Mapped Signup" },
      verified: true,
    });

    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(handoffUrl.searchParams.get("targetOrigin")).toBe(`https://${mappedAppHost}`);
    expect(grant.status).toBe(302);
    expect(new URL(callbackLocation).origin).toBe(`https://${mappedAppHost}`);
    expect(new URL(callbackLocation).pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);

    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/schema?view=board");
    expect(setCookie).toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=;`);
    expect(hostSessionPayload).toEqual(
      expect.objectContaining({
        appInstallId: taskInstallId,
        principalId: signup.body.principal.principalId,
        purpose: "host-session",
        routeId: routeRecordIds.get(`route:host:app:${mappedAppHost}`),
        storageIdentity: `app:${taskInstallId}`,
        targetOrigin: `https://${mappedAppHost}`,
        targetProfile: "app",
        version: 1,
      }),
    );
    expect(replay.status).toBe(400);
    expect(continued.status).toBe(200);
    expect(assetRequests).toEqual(["/index.html"]);
  }, 10_000);

  it("executes authenticated operations from matched host-local sessions", async () => {
    await resetWorkerState(harness, ["controlPlane", "taskStorage", "auth"]);
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

  it("blocks authenticated host-local sessions when target gates become current blockers", async () => {
    await resetWorkerState(harness, ["controlPlane", "taskStorage", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedApp({ access: "authenticated" });

    const { cookie, principalId } = await createAuthenticatedMappedAppHostSession(
      "Policy Gated Host Session",
    );
    const policy = await createAccountPolicy({
      appInstallId: taskInstallId,
      displayName: "Task workspace terms",
      policyKey: "task-workspace-terms",
    });

    const blocked = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: cookie },
      },
    );
    const blockedShell = await fetchHost(mappedAppHost, "/schema?view=board", {
      headers: {
        Accept: "text/html",
        Cookie: cookie,
      },
      redirect: "manual",
    });
    const blockedShellLocation = new URL(requiredHeader(blockedShell, "Location"));
    const blockedBody = (await blocked.json()) as {
      gate?: { kind?: string; policies?: Array<{ accountPolicyId?: string }> };
      status?: string;
    };

    await acceptPolicy(principalId, policy.id);

    const continued = await fetchHost(
      mappedAppHost,
      `/api/app-installs/tasks/${taskInstallId}/bootstrap`,
      {
        headers: { Cookie: cookie },
      },
    );

    expect(blocked.status).toBe(409);
    expect(blockedShell.status).toBe(302);
    expect(blockedShellLocation.origin).toBe("https://www.example.com");
    expect(blockedShellLocation.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(blockedShellLocation.searchParams.get("targetOrigin")).toBe(`https://${mappedAppHost}`);
    expect(blockedShellLocation.searchParams.get("returnTo")).toBe("/schema?view=board");
    expect(blockedShell.headers.get("Set-Cookie")).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=`);
    expect(blockedBody).toMatchObject({
      gate: {
        kind: "terms-acceptance",
        policies: [{ accountPolicyId: policy.id }],
      },
      status: "blocked",
    });
    expect(JSON.stringify(blockedBody)).not.toContain("credentialId");
    expect(JSON.stringify(blockedBody)).not.toContain("session");
    expect(continued.status).toBe(200);
  });

  it("starts mapped instance handoff and redirects its sign-in gate to the auth origin", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();
    assetRequests = [];

    const mappedInstanceRouteId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);
    const protectedRoute = await fetchHost(mappedInstanceHost, "/deployments", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const signIn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountSignInRoute}?redirectTo=%2Fdeployments`,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const protectedRouteUrl = new URL(requiredHeader(protectedRoute, "Location"));
    const protectedRouteSetCookie = requiredHeader(protectedRoute, "Set-Cookie");

    expect(protectedRoute.status).toBe(302);
    expect(protectedRouteUrl.origin).toBe("https://www.example.com");
    expect(protectedRouteUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(protectedRouteUrl.searchParams.get("targetOrigin")).toBe(
      `https://${mappedInstanceHost}`,
    );
    expect(protectedRouteUrl.searchParams.get("routeId")).toBe(mappedInstanceRouteId);
    expect(protectedRouteUrl.searchParams.get("targetProfile")).toBe("instance");
    expect(protectedRouteUrl.searchParams.get("storageIdentity")).toBe(
      INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    );
    expect(protectedRouteUrl.searchParams.get("returnTo")).toBe("/deployments");
    expect(protectedRouteUrl.searchParams.get("nonceHash")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(protectedRouteUrl.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(protectedRouteSetCookie).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=`);
    expect(protectedRouteSetCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(protectedRouteSetCookie).not.toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);

    expect(signIn.status).toBe(302);
    expect(signIn.headers.get("Location")).toBe(
      `https://www.example.com${runtimeTopologyRoutes.authAccountSignInRoute}?redirectTo=%2Fdeployments`,
    );
    expect(signIn.headers.get("Set-Cookie")).toBeNull();
    expect(assetRequests).toEqual([]);
  });

  it("returns auth-origin admin handoff callbacks to host-local instance sessions", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Mapped Admin Callback Owner",
    });
    await createVerifiedPrimaryEmail(owner.id, "mapped-admin-callback-owner@example.com");
    await createPrivateCredentialForPrincipal(owner.id, "Mapped Admin Callback Owner");

    const sessionCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
    const start = await fetchHost(mappedInstanceHost, "/deployments", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const nonceCookie = cookiePair(requiredHeader(start, "Set-Cookie"));
    const startLocation = requiredHeader(start, "Location");
    const startUrl = new URL(startLocation);
    const mappedInstanceRouteId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);
    const {
      account: accountContinuation,
      grant,
      handoffUrl,
    } = await issueHandoffGrantFromAuthAccount(startLocation, sessionCookie);
    const callbackUrl = new URL(requiredHeader(grant, "Location"));
    const callback = await harness.mf.dispatchFetch(callbackUrl.toString(), {
      headers: { Cookie: nonceCookie },
      redirect: "manual",
    });

    expect(start.status).toBe(302);
    expect(startUrl.origin).toBe("https://www.example.com");
    expect(startUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(startUrl.searchParams.get("targetOrigin")).toBe(`https://${mappedInstanceHost}`);
    expect(startUrl.searchParams.get("routeId")).toBe(mappedInstanceRouteId);
    expect(startUrl.searchParams.get("targetProfile")).toBe("instance");
    expect(startUrl.searchParams.get("storageIdentity")).toBe(
      INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    );
    expect(startUrl.searchParams.get("appInstallId")).toBeNull();
    expect(startUrl.searchParams.get("returnTo")).toBe("/deployments");

    expect(accountContinuation.status).toBe(302);
    expect(handoffUrl.origin).toBe("https://www.example.com");
    expect(handoffUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_START_PATH);
    expect(handoffUrl.searchParams.get("targetOrigin")).toBe(`https://${mappedInstanceHost}`);
    expect(handoffUrl.searchParams.get("routeId")).toBe(mappedInstanceRouteId);
    expect(handoffUrl.searchParams.get("targetProfile")).toBe("instance");
    expect(handoffUrl.searchParams.get("storageIdentity")).toBe(
      INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    );
    expect(handoffUrl.searchParams.get("appInstallId")).toBeNull();
    expect(handoffUrl.searchParams.get("returnTo")).toBe("/deployments");

    expect(grant.status).toBe(302);
    expect(callbackUrl.origin).toBe(`https://${mappedInstanceHost}`);
    expect(callbackUrl.pathname).toBe(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH);
    expect(callbackUrl.searchParams.get("grantId")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("grantSecret")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(callbackUrl.searchParams.get("state")).toBe(handoffUrl.searchParams.get("state"));
    expect(requiredHeader(grant, "Location")).not.toContain("nonceHash=");

    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/deployments");
    const setCookie = requiredHeader(callback, "Set-Cookie");
    const hostSessionPayload = signedCookiePayload(setCookie, HOST_AUTH_SESSION_COOKIE_NAME);
    const hostSessionCookie = cookiePair(setCookie);
    const sessionStatus = await fetchHost(mappedInstanceHost, "/api/formless/session", {
      headers: { Cookie: hostSessionCookie },
    });
    const sessionStatusBody = (await sessionStatus.json()) as {
      authenticated?: boolean;
      owner?: { id?: string };
      session?: { expiresAt?: string };
      setupComplete?: boolean;
    };
    const logout = await fetchHost(mappedInstanceHost, "/api/formless/session/logout", {
      headers: { Cookie: hostSessionCookie },
      method: "POST",
    });
    const logoutBody = (await logout.json()) as { authenticated?: boolean };
    const logoutSetCookie = requiredHeader(logout, "Set-Cookie");

    expect(setCookie).toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${HOST_AUTH_NONCE_COOKIE_NAME}=;`);
    expect(setCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(hostSessionPayload).toEqual(
      expect.objectContaining({
        instanceId: "www.example.com",
        principalId: owner.id,
        purpose: "host-session",
        routeId: mappedInstanceRouteId,
        sessionVersion: 0,
        storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
        targetOrigin: `https://${mappedInstanceHost}`,
        targetProfile: "instance",
        version: 1,
      }),
    );
    expect(hostSessionPayload).not.toHaveProperty("appInstallId");

    expect(sessionStatus.status).toBe(200);
    expect(sessionStatusBody).toMatchObject({
      authenticated: true,
      owner: { id: owner.id },
      setupComplete: true,
    });
    expect(Date.parse(sessionStatusBody.session?.expiresAt ?? "")).toBeGreaterThan(0);

    expect(logout.status).toBe(200);
    expect(logoutBody.authenticated).toBe(false);
    expect(logoutSetCookie).toContain(`${HOST_AUTH_SESSION_COOKIE_NAME}=;`);
    expect(logoutSetCookie).not.toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
  });

  it("serves owner auth routes on mapped instance admin hosts that are also the auth origin", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupMappedInstance();

    const mappedInstanceRouteId = routeRecordIds.get(`route:host:instance:${mappedInstanceHost}`);

    expect(mappedInstanceRouteId).toBeDefined();

    await postAdminJson(`${controlPlaneApi}/operations/instance-settings/create`, {
      idempotencyKey: "instance-settings-mapped-instance-auth-origin",
      input: {
        settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
        primaryRoute: mappedInstanceRouteId,
        authOrigin: `https://${mappedInstanceHost}`,
        productionIdentityStatus: "configured",
      },
    });
    assetRequests = [];

    const legacyLogin = await fetchHost(mappedInstanceHost, "/login", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const signIn = await fetchHost(
      mappedInstanceHost,
      runtimeTopologyRoutes.authAccountSignInRoute,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const setup = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountSetupRoute}?token=${setupToken}`,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const account = await fetchHost(mappedInstanceHost, runtimeTopologyRoutes.authAccountRoute, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    const accountReturn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fdeployments`,
      {
        headers: { Accept: "text/html" },
        redirect: "manual",
      },
    );
    const unsafeAccountReturn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountRoute}?returnTo=${encodeURIComponent("https://evil.example.com/deployments")}`,
      {
        headers: { Accept: "application/json" },
        redirect: "manual",
      },
    );
    const unsafeAccountReturnBody = (await unsafeAccountReturn.json()) as { error?: string };
    const setupCapability = await fetchHost(mappedInstanceHost, "/api/formless/setup/capability", {
      body: JSON.stringify({ setupToken }),
      headers: adminHeaders({ "Content-Type": "application/json" }),
      method: "POST",
    });
    const registerOptions = await fetchHost(
      mappedInstanceHost,
      "/api/formless/passkeys/register/options",
      {
        body: JSON.stringify({ setupToken }),
        headers: { "Content-Type": "application/json", Origin: `https://${mappedInstanceHost}` },
        method: "POST",
      },
    );
    const registerOptionsBody = (await registerOptions.json()) as {
      options: { rp: { id: string; name: string } };
    };
    const sessionStatus = await fetchHost(mappedInstanceHost, "/api/formless/session");
    const owner = await ensureTestIdentityOwner(harness, adminToken, {
      name: "Mapped Auth Origin Owner",
    });
    const ownerSessionCookie = await createCentralAuthSessionCookieForPrincipal(
      owner.id,
      `https://${mappedInstanceHost}`,
    );
    const authenticatedAccountReturn = await fetchHost(
      mappedInstanceHost,
      `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fdeployments`,
      {
        headers: {
          Accept: "text/html",
          Cookie: ownerSessionCookie,
        },
        redirect: "manual",
      },
    );

    expect(legacyLogin.status).toBe(404);
    expect(signIn.status).toBe(200);
    expect(setup.status).toBe(200);
    expect(account.status).toBe(200);
    expect(accountReturn.status).toBe(302);
    expect(accountReturn.headers.get("Location")).toBe(
      ownerLoginRedirectLocationForRoute(
        `${runtimeTopologyRoutes.authAccountRoute}?returnTo=%2Fdeployments`,
      ),
    );
    expect(unsafeAccountReturn.status).toBe(400);
    expect(unsafeAccountReturnBody.error).toBe("Account return target must be path-only.");
    expect(authenticatedAccountReturn.status).toBe(302);
    expect(authenticatedAccountReturn.headers.get("Location")).toBe("/deployments");
    expect(setupCapability.status).toBe(200);
    expect(registerOptions.status).toBe(200);
    expect(registerOptionsBody.options.rp).toEqual({
      id: mappedInstanceHost,
      name: "Formless",
    });
    expect(sessionStatus.status).toBe(200);
    expect(assetRequests).toEqual(["/index.html", "/index.html", "/index.html"]);
  });

  it("accepts host-local sessions for matched mapped instance control-plane APIs", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const { cookie, setCookie } = await createMappedInstanceHostSession("Mapped Instance Owner");
    const staleVersionCookie = await hostSessionCookieWithPayload(setCookie, {
      sessionVersion: 1,
    });
    assetRequests = [];

    const shell = await fetchHost(mappedInstanceHost, "/", {
      headers: {
        Accept: "text/html",
        Cookie: cookie,
      },
    });
    const bootstrap = await fetchHost(mappedInstanceHost, `${controlPlaneApi}/bootstrap`, {
      headers: { Cookie: cookie },
    });
    const bootstrapBody = (await bootstrap.json()) as { records?: unknown[] };
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
    const routeWriteBody = (await routeWrite.json()) as OperationInvocationResponse;
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
    const createInstallBody = (await createInstall.json()) as OperationInvocationResponse;
    const appInstalls = await fetchHost(mappedInstanceHost, "/api/formless/app-installs", {
      headers: { Cookie: cookie },
    });
    const appInstallsBody = (await appInstalls.json()) as {
      installs?: Array<{ installId?: string }>;
    };
    const installedAppBootstrap = await fetchHost(
      mappedInstanceHost,
      "/api/app-installs/site/host-session-site/bootstrap",
      {
        headers: { Cookie: cookie },
      },
    );
    const installedAppBootstrapBody = (await installedAppBootstrap.json()) as {
      schema?: AppSchema;
    };
    const staleVersionBootstrap = await fetchHost(
      mappedInstanceHost,
      `${controlPlaneApi}/bootstrap`,
      {
        headers: { Cookie: staleVersionCookie },
      },
    );
    expect(shell.status).toBe(200);
    expect(bootstrap.status).toBe(200);
    expect(Array.isArray(bootstrapBody.records)).toBe(true);
    expect([200, 201]).toContain(routeWrite.status);
    expect(operationRecord(routeWriteBody).values).toMatchObject({
      matchPath: "/host-session-route",
      targetProfile: "instance",
    });
    expect(createInstall.status).toBe(200);
    expect(createInstallBody.status).toBe("committed");
    expect(appInstalls.status).toBe(200);
    expect(
      appInstallsBody.installs?.some((install) => install.installId === "host-session-site"),
    ).toBe(true);
    expect(installedAppBootstrap.status).toBe(200);
    expect(installedAppBootstrapBody.schema).toEqual(siteSourceSchema);
    expect(staleVersionBootstrap.status).toBe(401);
    expect(assetRequests).toEqual(["/"]);
  });

  it("accepts mapped instance host-local sessions with current operational management authority", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
    await setupPrimaryProductionIdentity();
    await setupMappedInstance();

    const instanceAdmin = await createInstanceAdminPrincipalSessionCookie("Mapped Instance Admin");
    const adminCookie = await mappedInstanceHostSessionCookieForPrincipal(
      instanceAdmin.principalId,
    );
    const owner = await createMappedInstanceHostSession("Mapped Instance Owner Still Works");

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
    const adminReadBody = (await adminRead.json()) as { records?: unknown[] };
    const adminWriteBody = (await adminWrite.json()) as OperationInvocationResponse;
    const ownerWriteBody = (await ownerWrite.json()) as OperationInvocationResponse;

    expect(adminRead.status).toBe(200);
    expect(Array.isArray(adminReadBody.records)).toBe(true);
    expect(adminWrite.status).toBe(200);
    expect(operationRecord(adminWriteBody).values.domain).toBe("mapped-mail.example.com");
    expect(ownerWrite.status).toBe(200);
    expect(operationRecord(ownerWriteBody).values.matchPath).toBe("/owner-host-session-route");
  });

  it("rejects host-local sessions after owner authority or session version changes", async () => {
    await resetWorkerState(harness, ["controlPlane", "taskStorage", "auth"]);
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
    expect(handoffUrl.pathname).toBe(runtimeTopologyRoutes.authAccountRoute);
    expect(staleOwnerRead.status).toBe(401);
    expect(assetRequests).toEqual([]);
  });

  it("reserves auth callbacks on mapped public Site hosts", async () => {
    await resetWorkerState(harness, ["controlPlane", "auth"]);
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

  it("resolves redirect route records with preserved path and query string", async () => {
    await resetWorkerState(harness, ["controlPlane"]);
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
    const redirected = await fetchHost("old.example.com", "/docs/start?ref=old", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });

    expect(redirected.status).toBe(308);
    expect(redirected.headers.get("Location")).toBe("https://new.example.com/docs/start?ref=old");
    expect(assetRequests).toEqual([]);
  });

  it("returns not found for unmatched paths on redirect-captured hosts", async () => {
    await resetWorkerState(harness, ["controlPlane"]);
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
    const matchedRedirect = await fetchHost("old.example.com", "/old?ref=legacy", {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });

    expect(hostlessMount.status).toBe(404);
    expect(matchedRedirect.status).toBe(308);
    expect(matchedRedirect.headers.get("Location")).toBe("https://new.example.com/old?ref=legacy");
    expect(assetRequests).toEqual([]);
  });

  it("stops mapped public Site routing after desired route disablement with provider evidence", async () => {
    await resetWorkerState(harness, ["controlPlane", "siteStorage", "domainMappings"]);
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
    expect(home.headers.get("Location")).toBe(ownerLoginRedirectLocationForRoute("/"));
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

async function expectOwnerPasskeyRouteNotFound(targetHarness: Harness, host: string) {
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

  expect(options.status).toBe(404);
  expect(body.error).toBe("Not found.");
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

async function configureAuthEmail(input: { settingsMode: "create" | "update"; testKey: string }) {
  const emailDomain = await postAdminJson(`${controlPlaneApi}/operations/email-domain/create`, {
    idempotencyKey: `${input.testKey}-auth-email-domain`,
    input: {
      enabled: true,
      providerFamily: "cloudflare",
      domain: `${input.testKey}.mail.example.com`,
    },
  });
  const emailSender = await postAdminJson(`${controlPlaneApi}/operations/email-sender/create`, {
    idempotencyKey: `${input.testKey}-auth-email-sender`,
    input: {
      enabled: true,
      address: `auth@${input.testKey}.mail.example.com`,
      displayName: "Auth",
      purpose: "auth",
      emailDomain: operationRecord((await emailDomain.json()) as OperationInvocationResponse).id,
    },
  });
  const sender = operationRecord((await emailSender.json()) as OperationInvocationResponse);
  const domain = sender.values.emailDomain;

  if (typeof domain !== "string") {
    throw new Error("Expected auth email sender to reference an email domain.");
  }

  if (input.settingsMode === "create") {
    await postAdminJson(`${controlPlaneApi}/operations/instance-settings/create`, {
      idempotencyKey: `${input.testKey}-settings-auth-email`,
      input: {
        settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
        defaultEmailDomain: domain,
        defaultAuthSender: sender.id,
        productionIdentityStatus: "unconfigured",
      },
    });
    return;
  }

  await postAdminJson(`${controlPlaneApi}/operations/instance-settings/update`, {
    idempotencyKey: `${input.testKey}-settings-auth-email`,
    recordId: await instanceSettingsRecordId(),
    input: {
      defaultEmailDomain: domain,
      defaultAuthSender: sender.id,
    },
  });
}

async function instanceSettingsRecordId(): Promise<string> {
  const response = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
    headers: adminHeaders(),
  });

  expect(response.status).toBe(200);

  const body = (await response.json()) as { records?: StoredRecord[] };
  const settings = body.records?.find(
    (record) =>
      record.entity === "instance-settings" &&
      !record.deletedAt &&
      record.values.settingsId === INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  );

  if (!settings) {
    throw new Error("Expected active instance-settings record.");
  }

  return settings.id;
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

async function setupMappedAppRouteRecord(
  values: Record<string, unknown> = {},
  installValues: Record<string, unknown> = {},
) {
  await setupTaskAppInstall(installValues);
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

async function setupTaskAppInstall(values: Record<string, unknown> = {}) {
  await postAdminJson("/api/formless/app-installs", {
    packageAppKey: "tasks",
    installId: taskInstallId,
    label: "Task Workspace",
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

function signupTargetFromAccountUrl(url: URL): AccountCompletionGateTarget {
  return {
    appInstallId: requiredSearchParam(url, "appInstallId"),
    returnTo: requiredSearchParam(url, "returnTo") as `/${string}`,
    routeId: requiredSearchParam(url, "routeId"),
    storageIdentity: requiredSearchParam(url, "storageIdentity"),
    targetOrigin: requiredSearchParam(url, "targetOrigin"),
    targetProfile: requiredSearchParam(
      url,
      "targetProfile",
    ) as AccountCompletionGateTarget["targetProfile"],
  };
}

async function completeEmailVerifiedSignup(input: {
  accountSearch: string;
  credentialId: string;
  displayName: string;
  email: string;
  rpId: string;
  target: AccountCompletionGateTarget;
}) {
  const started = await postAuthJson<SignupStartResponse>("/formless/auth/signup/start", {
    email: input.email,
    target: input.target,
  });
  const message = await readRenderedEmailMessage(started.delivery.deliveryId);
  const token = verificationTokenFromMessage(message.message);

  await postAuthJson<SignupEmailVerifyResponse>("/formless/auth/signup/email/verify", {
    challengeId: started.signup.challengeId,
    email: started.signup.displayEmail,
    target: started.signup.target,
    token,
  });

  const options = await postAuthJson<SignupPasskeyOptionsResponse>(
    "/formless/auth/signup/passkeys/register/options",
    {
      challengeId: started.signup.challengeId,
      displayName: input.displayName,
      email: started.signup.displayEmail,
      target: started.signup.target,
    },
  );
  const passkey = new VirtualPasskey(input.credentialId);
  const response = await fetchAuth(
    `/formless/auth/signup/passkeys/register/verify${input.accountSearch}`,
    {
      body: JSON.stringify({
        challengeId: started.signup.challengeId,
        displayName: input.displayName,
        email: started.signup.displayEmail,
        response: passkey.registrationResponse(options.options, {
          origin: "https://www.example.com",
          rpId: input.rpId,
        }),
        target: started.signup.target,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = (await response.json()) as SignupPasskeyVerifyResponse;

  expect(response.status).toBe(200);

  return { body, response, started, token };
}

function fetchAuth(path: string, init?: DispatchFetchInit) {
  return harness.mf.dispatchFetch(`https://www.example.com${path}`, init);
}

async function postAuthJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (response.status !== 200) {
    throw new Error(
      `Expected auth POST ${path} to return 200, got ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

async function readRenderedEmailMessage(deliveryId: string) {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    `/harness/internal-message/${encodeURIComponent(deliveryId)}`,
  );

  expect(response.status).toBe(200);

  return (await response.json()) as { message?: EmailDeliveryRenderedMessage };
}

function verificationTokenFromMessage(message: EmailDeliveryRenderedMessage | undefined): string {
  const match = message?.text.match(/[?&]token=([A-Za-z0-9_-]+)/);

  if (!match?.[1]) {
    throw new Error("Verification token was not rendered.");
  }

  return match[1];
}

function requiredSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);

  if (!value) {
    throw new Error(`Missing ${name} search param.`);
  }

  return value;
}

async function issueHandoffGrantFromAuthAccount(startLocation: string, centralCookie: string) {
  const account = await harness.mf.dispatchFetch(startLocation, {
    headers: {
      Accept: "text/html",
      Cookie: centralCookie,
    },
    redirect: "manual",
  });
  const handoffUrl = new URL(requiredHeader(account, "Location"), startLocation);
  const grant = await harness.mf.dispatchFetch(handoffUrl.toString(), {
    headers: {
      Accept: "text/html",
      Cookie: centralCookie,
    },
    redirect: "manual",
  });

  return { account, grant, handoffUrl };
}

async function createMappedAppHostSession(ownerName: string) {
  const owner = await ensureTestIdentityOwner(harness, adminToken, {
    name: ownerName,
  });
  const centralCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
  const hostSession = await createMappedAppHostSessionFromCentralCookie(centralCookie);

  return {
    ...hostSession,
    owner,
  };
}

async function createAuthenticatedMappedAppHostSession(displayName: string) {
  const principal = await createCompletionReadyPrincipalSessionCookie(displayName);
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
  const { grant } = await issueHandoffGrantFromAuthAccount(
    requiredHeader(start, "Location"),
    centralCookie,
  );
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

async function createActivePrincipalSessionCookie(
  displayName: string,
  origin = "https://www.example.com",
) {
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
  const centralCookie = await createCentralAuthSessionCookieForPrincipal(principal.id, origin);

  return {
    cookie: centralCookie,
    principalId: principal.id,
  };
}

async function createCompletionReadyPrincipalSessionCookie(displayName: string) {
  const principal = await createActivePrincipalSessionCookie(displayName);

  await createVerifiedPrimaryEmail(
    principal.principalId,
    `${displayName.replace(/\W+/g, "-").toLowerCase()}@example.com`,
  );
  await createPrivateCredentialForPrincipal(principal.principalId, displayName);
  await createAppRegistration(principal.principalId, taskInstallId);

  return principal;
}

async function createVerifiedPrimaryEmail(principalId: string, email: string) {
  await postAdminJson(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/principal-email/create`,
    {
      idempotencyKey: `verified-email-${principalId.replace(/\W+/g, "-")}`,
      input: {
        displayEmail: email,
        normalizedEmail: email.toLowerCase(),
        primary: true,
        principal: principalId,
        recovery: false,
        verificationStatus: "verified",
        verifiedAt: "2026-07-06T00:00:00.000Z",
      },
    },
  );
}

async function createAppRegistration(principalId: string, appInstallId: string) {
  await postAdminJson(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/app-registration/create`,
    {
      idempotencyKey: [
        "app-registration",
        principalId.replace(/\W+/g, "-"),
        appInstallId.replace(/\W+/g, "-"),
      ].join("-"),
      input: {
        appInstallId,
        status: "active",
        targetKind: "principal",
        targetPrincipal: principalId,
      },
    },
  );
}

async function createAccountPolicy(input: {
  appInstallId: string;
  displayName: string;
  policyKey: string;
}) {
  const response = await postAdminJson(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/account-policy/create`,
    {
      idempotencyKey: `account-policy-${input.policyKey}`,
      input: {
        appInstallId: input.appInstallId,
        displayName: input.displayName,
        policyKey: input.policyKey,
        scopeKind: "app-install",
        status: "active",
        version: "2026-07-06",
      },
    },
  );

  return operationRecord((await response.json()) as OperationInvocationResponse);
}

async function acceptPolicy(principalId: string, accountPolicy: string) {
  await postAdminJson(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/operations/principal-policy-acceptance/create`,
    {
      idempotencyKey: [
        "policy-acceptance",
        principalId.replace(/\W+/g, "-"),
        accountPolicy.replace(/\W+/g, "-"),
      ].join("-"),
      input: {
        acceptedAt: "2026-07-06T00:00:00.000Z",
        accountPolicy,
        principal: principalId,
        status: "accepted",
      },
    },
  );
}

async function createPrivateCredentialForPrincipal(principalId: string, label: string) {
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/credential",
    {
      body: JSON.stringify({
        credentialId: Buffer.from(`credential:${principalId}:${label}`).toString("base64url"),
        principalId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
}

async function createCentralAuthSessionCookieForPrincipal(
  principalId: string,
  origin = "https://www.example.com",
) {
  const url = new URL(origin);
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/central-session",
    {
      body: JSON.stringify({ principalId }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-host": url.host,
        "x-forwarded-proto": url.protocol.replace(/:$/, ""),
      },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  const setCookie = requiredHeader(response, "Set-Cookie");

  expect(setCookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);

  return cookiePair(setCookie);
}

async function configureHarnessAuth(origin: string) {
  const url = new URL(origin);
  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/config",
    {
      body: JSON.stringify({
        canonicalOrigin: url.origin,
        relyingPartyId: url.hostname,
        relyingPartyName: "Formless",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);
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
  const centralCookie = await createCentralAuthSessionCookieForPrincipal(owner.id);
  const start = await fetchHost(mappedInstanceHost, "/", {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  const { grant } = await issueHandoffGrantFromAuthAccount(
    requiredHeader(start, "Location"),
    centralCookie,
  );
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

type SignupStartResponse = {
  delivery: {
    deliveryId: string;
    queued: boolean;
    replayed: boolean;
    status: "scheduled";
  };
  signup: {
    challengeId: string;
    displayEmail: string;
    expiresAt: string;
    target: AccountCompletionGateTarget;
  };
};

type SignupEmailVerifyResponse = {
  signup: SignupStartResponse["signup"];
  verified: true;
};

type SignupPasskeyOptionsResponse = {
  options: PublicKeyCredentialCreationOptionsJSON;
};

type SignupPasskeyVerifyResponse = {
  accountCompletion: {
    continueTo?: `/${string}`;
    gate?: Record<string, unknown>;
    status: "blocked" | "complete";
    target: AccountCompletionGateTarget;
  };
  continueTo?: `/${string}`;
  handoff?: { returnTo: `/${string}`; targetOrigin: string };
  principal: {
    displayName: string;
    principalId: string;
  };
  session: {
    expiresAt: string;
  };
  verified: true;
};

class VirtualPasskey {
  private readonly credentialId: string;
  private readonly publicKey: KeyObject;

  constructor(credentialIdValue: string) {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    this.credentialId = credentialIdValue;
    this.publicKey = pair.publicKey;
  }

  registrationResponse(
    options: PublicKeyCredentialCreationOptionsJSON,
    input: { origin: string; rpId: string },
  ): RegistrationResponseJSON {
    const clientDataJSON = clientDataJson("webauthn.create", options.challenge, input.origin);
    const authData = registrationAuthenticatorData({
      credentialId: base64UrlDecodeBytes(this.credentialId),
      credentialPublicKey: this.credentialPublicKey(),
      counter: 0,
      rpId: input.rpId,
    });
    const attestationObject = cborMap([
      ["fmt", "none"],
      ["attStmt", []],
      ["authData", authData],
    ]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        attestationObject: base64UrlEncode(attestationObject),
        transports: ["internal"],
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  private credentialPublicKey(): Uint8Array {
    const jwk = this.publicKey.export({ format: "jwk" }) as JsonWebKey;

    if (!jwk.x || !jwk.y) {
      throw new Error("Virtual passkey public key export is missing coordinates.");
    }

    return cborMap([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, base64UrlDecodeBytes(jwk.x)],
      [-3, base64UrlDecodeBytes(jwk.y)],
    ]);
  }
}

function registrationAuthenticatorData(input: {
  counter: number;
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
  rpId: string;
}) {
  const credentialIdLength = new Uint8Array(2);
  const credentialIdLengthView = new DataView(credentialIdLength.buffer);

  credentialIdLengthView.setUint16(0, input.credentialId.byteLength, false);

  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([0x45]),
    uint32(input.counter),
    new Uint8Array(16),
    credentialIdLength,
    input.credentialId,
    input.credentialPublicKey,
  ]);
}

function clientDataJson(type: "webauthn.create", challenge: string, origin: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
}

type CborMapKey = number | string;
type CborMapEntry = readonly [CborMapKey, CborValue];
type CborValue = number | string | Uint8Array | readonly CborMapEntry[];

function cborMap(entries: readonly CborMapEntry[]): Uint8Array {
  return concatBytes([
    cborHeader(5, entries.length),
    ...entries.flatMap(([key, value]) => [cborEncode(key), cborEncode(value)]),
  ]);
}

function cborEncode(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }

  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);

    return concatBytes([cborHeader(3, bytes.byteLength), bytes]);
  }

  if (value instanceof Uint8Array) {
    return concatBytes([cborHeader(2, value.byteLength), value]);
  }

  return cborMap(value);
}

function cborHeader(major: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("CBOR value must be a non-negative integer.");
  }

  if (value < 24) {
    return new Uint8Array([(major << 5) | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([(major << 5) | 24, value]);
  }

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3);
    const view = new DataView(bytes.buffer);

    bytes[0] = (major << 5) | 25;
    view.setUint16(1, value, false);

    return bytes;
  }

  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);

  bytes[0] = (major << 5) | 26;
  view.setUint32(1, value, false);

  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, value, false);

  return bytes;
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
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

  if (![200, 201].includes(response.status)) {
    throw new Error(
      `Expected admin POST ${request.path} to return 200/201, got ${response.status}: ${await response.text()}`,
    );
  }

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

type WorkerStateResource =
  | "auth"
  | "controlPlane"
  | "domainMappings"
  | "media"
  | "siteStorage"
  | "taskStorage";

async function resetWorkerState(target: Harness, resources: readonly WorkerStateResource[]) {
  if (resources.includes("controlPlane")) {
    routeRecordIds.clear();
  }

  const resetters: Record<WorkerStateResource, () => Promise<void>> = {
    auth: () => postInternalInstanceReset(target, INTERNAL_RESET_OWNER_SETUP_PATH),
    controlPlane: () => postReset(target, `${controlPlaneApi}/reset/seed`),
    domainMappings: () =>
      postInternalInstanceReset(target, INTERNAL_RESET_INSTANCE_DOMAIN_MAPPINGS_PATH),
    media: () => clearMediaBucket(target),
    siteStorage: () => postReset(target, `/api/app-installs/site/${installId}/reset/seed`),
    taskStorage: () => postReset(target, `/api/app-installs/tasks/${taskInstallId}/reset/seed`),
  };

  await Promise.all(resources.map((resource) => resetters[resource]()));
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

async function withWorkersDevAuthHarness(run: (deploymentOrigin: string) => Promise<void>) {
  const deploymentOrigin = "https://personal.dpeek.workers.dev";

  await withHarness(
    await createCustomDomainHarness("instance", {
      FORMLESS_INSTANCE_AUTH_ORIGIN: deploymentOrigin,
    }),
    () => run(deploymentOrigin),
  );
}

function createCustomDomainHarness(
  runtimeProfile?: "instance" | "publishedSite",
  bindings: Record<string, string> = {},
) {
  return createWorkerHarness(
    harnessPath,
    {
      FORMLESS_AUTHORITY: { className: "CustomDomainHarnessAuthority", useSQLite: true },
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

async function writeCustomDomainHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-custom-domain-harness-"));
  const path = join(harnessDir, "custom-domain-harness.ts");

  await writeFile(
    path,
    `
      import worker, { FormlessAuthority } from "${process.cwd()}/src/worker/index.ts";
      import { createPasskeyCredential, writeInstanceAuthConfig } from "${process.cwd()}/src/worker/instance-auth-state.ts";
      import { createCentralAuthSessionCookie } from "${process.cwd()}/src/worker/central-auth-session.ts";
      import {
        ensureEmailDeliveryTables,
        readEmailDeliveryRenderedMessageById,
      } from "${process.cwd()}/src/worker/email-runtime-state.ts";
      import {
        handleInstanceAuthSignupDurableObjectRequest,
      } from "${process.cwd()}/src/worker/instance-auth-signup.ts";
      import { ensureRuntimeInstanceAuthConfig } from "${process.cwd()}/src/worker/instance-auth-runtime.ts";

      export class CustomDomainHarnessAuthority extends FormlessAuthority {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname.startsWith("/formless/auth/signup/")) {
            await ensureRuntimeInstanceAuthConfig(this.ctx.storage, request, this.env);

            const signupResponse = await handleInstanceAuthSignupDurableObjectRequest(
              request,
              this.ctx.storage,
              customDomainHarnessEnv(this.env, this.ctx.storage),
            );

            if (signupResponse) {
              return signupResponse;
            }
          }

          if (url.pathname === "/harness/auth/config" && request.method === "POST") {
            return Response.json({
              config: writeInstanceAuthConfig(this.ctx.storage, await request.json()),
            });
          }

          if (url.pathname === "/harness/auth/credential" && request.method === "POST") {
            const body = await request.json();

            return Response.json(createPasskeyCredential(this.ctx.storage, {
              credentialBackedUp: false,
              credentialDeviceType: "singleDevice",
              credentialId: body.credentialId,
              counter: 0,
              createdAt: "2026-07-06T00:00:00.000Z",
              principalId: body.principalId,
              publicKey: new Uint8Array([1, 2, 3, 4]),
              transports: [],
              updatedAt: "2026-07-06T00:00:00.000Z",
            }));
          }

          if (url.pathname === "/harness/auth/central-session" && request.method === "POST") {
            const body = await request.json();

            await ensureRuntimeInstanceAuthConfig(this.ctx.storage, request, this.env);

            const created = await createCentralAuthSessionCookie(this.ctx.storage, {
              env: this.env,
              maxAgeSeconds: 60,
              now: "2999-01-01T00:00:00.000Z",
              principalId: body.principalId,
              request,
            });

            return Response.json(
              { session: created.session },
              { headers: { "Set-Cookie": created.cookie } },
            );
          }

          if (url.pathname.startsWith("/harness/internal-message/") && request.method === "GET") {
            const deliveryId = decodeURIComponent(url.pathname.slice("/harness/internal-message/".length));

            return Response.json({
              message: readEmailDeliveryRenderedMessageById(this.ctx.storage, deliveryId),
            });
          }

          return super.fetch(request);
        }
      }

      function customDomainHarnessEnv(env, storage) {
        return {
          ...env,
          FORMLESS_EMAIL_DELIVERY_QUEUE: emailDeliveryQueueBinding(storage),
        };
      }

      function emailDeliveryQueueBinding(storage) {
        return {
          async send(job) {
            ensureEmailDeliveryTables(storage);
            ensureQueueTable(storage);
            storage.sql.exec(
              "INSERT INTO fake_email_delivery_queue_jobs (message_json) VALUES (?)",
              JSON.stringify(job),
            );

            return {};
          },
        };
      }

      function ensureQueueTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_delivery_queue_jobs (
            send_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_json TEXT NOT NULL
          )
        \`);
      }

      export default worker;
    `,
  );

  return path;
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
