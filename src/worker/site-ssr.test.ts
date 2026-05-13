import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

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

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<div id="app"><article');
    expect(html).toContain('data-site-theme="light"');
    expect(html).toContain("Home");
    expect(html).toContain("Code is magic");
    expect(html).toContain("Greetings, Robot");
    expect(html).toContain("data-site-header");
    expect(html).toContain("data-site-footer");
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
