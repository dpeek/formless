import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { INITIAL_SITE_PAGE_TREE_SCRIPT_ID } from "../app/site-renderer/initial-tree.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
      compatibilityDate: "2026-04-28",
    },
  );
});

beforeEach(async () => {
  await resetSchemaApp("site");
});

afterAll(async () => {
  await harness.dispose();
});

describe("published Site Worker SSR", () => {
  it("returns server-rendered HTML for the published home route", async () => {
    const response = await getDocument("/");
    const html = await response.text();
    const payload = initialTreePayload(html);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<div id="app"><main class="min-h-dvh"><article');
    expect(html).toContain('data-site-theme="light"');
    expect(html).toContain("Home");
    expect(html).toContain("Code is magic");
    expect(html).toContain("Greetings, Robot");
    expect(html).toContain("data-site-header");
    expect(html).toContain("data-site-footer");
    expect(html).toContain(
      `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">`,
    );
    expect(payload.kind).toBe("formless.sitePageTree");
    expect(payload.version).toBe(1);
    expect(payload.tree.meta.slug).toBe("home");
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).not.toContain("Loading site page...");
  });

  it("returns server-rendered HTML for nested published Site slugs", async () => {
    const response = await getDocument("/blog/shipping-schema-backed-authoring");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Shipping schema-backed authoring");
    expect(html).toContain("data-site-header");
    expect(html).toContain("data-site-footer");
    expect(html).toContain('href="/blog"');
    expect(html).not.toContain('href="/pages/blog"');
    expect(html).not.toContain("Loading site page...");
  });

  it("uses the current public tree from the Site authority", async () => {
    await postAdminJson("/api/site/mutations", {
      mutationId: "mutation-site-ssr-extra-page",
      entity: "block",
      op: "create",
      values: {
        type: "page",
        label: "Server rendered extra page",
        href: "/extra-page",
      },
    });

    const response = await getDocument("/extra-page");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Server rendered extra page");
    expect(html).not.toContain("Loading site page...");
  });

  it("escapes embedded initial tree data for hostile Site content", async () => {
    const hostileLabel = 'Hostile </script><script type="module">alert(1)</script> & text';

    await postAdminJson("/api/site/mutations", {
      mutationId: "mutation-site-ssr-hostile-home-label",
      entity: "block",
      op: "patch",
      recordId: "rec_site_content_home",
      values: {
        label: hostileLabel,
      },
    });

    const response = await getDocument("/");
    const html = await response.text();
    const scriptText = initialTreeScriptText(html);

    expect(response.status).toBe(200);
    expect(scriptText).not.toContain("</script");
    expect(scriptText).not.toContain("<script");
    expect(scriptText).toContain("\\u003C/script\\u003E\\u003Cscript");
    expect(scriptText).toContain("\\u0026 text");
    expect(initialTreePayload(html).tree.page.label).toBe(hostileLabel);
  });
});

async function resetSchemaApp(schemaKey: SchemaKey) {
  const response = await harness.fetch(`/api/${schemaKey}/reset/seed`, {
    body: "{}",
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function getDocument(path: string) {
  return harness.fetch(path, {
    headers: {
      Accept: "text/html",
    },
  });
}

async function postAdminJson(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return response;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

function initialTreePayload(html: string) {
  return JSON.parse(initialTreeScriptText(html)) as {
    kind: string;
    version: number;
    tree: {
      meta: { slug: string };
      page: { label: string };
    };
  };
}

function initialTreeScriptText(html: string): string {
  const startMarker = `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">`;
  const start = html.indexOf(startMarker);

  expect(start).toBeGreaterThan(-1);

  const contentStart = start + startMarker.length;
  const end = html.indexOf("</script>", contentStart);

  expect(end).toBeGreaterThan(contentStart);

  return html.slice(contentStart, end);
}
