import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  startSiteProjectLocalPublishBroker,
  type SiteProjectLocalAdminPublishResult,
  type SiteProjectLocalPublishBroker,
} from "./local-publish-broker.ts";

const brokers: SiteProjectLocalPublishBroker[] = [];

afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
});

describe("Site project local publish broker", () => {
  it("guards endpoint, method, token, and source readiness", async () => {
    let publishCalls = 0;
    const broker = await startBroker({
      source: () => null,
      runPublish: async () => {
        publishCalls += 1;
        throw new Error("Unexpected publish.");
      },
    });

    expect(broker.token).toBe("local-token");
    const endpoint = new URL(broker.endpoint);

    expect(endpoint.hostname).toBe("127.0.0.1");
    expect(endpoint.pathname).toBe("/publish");
    expect(endpoint.protocol).toBe("http:");

    const optionsResponse = await fetch(broker.endpoint, { method: "OPTIONS" });

    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(optionsResponse.headers.get("Access-Control-Allow-Methods")).toBe("POST,OPTIONS");

    const missingResponse = await fetch(brokerPath(broker, "/missing"), {
      headers: authHeaders(broker),
      method: "POST",
    });

    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({
      error: "Local publish broker endpoint not found.",
      ok: false,
    });

    const methodResponse = await fetch(broker.endpoint, {
      headers: authHeaders(broker),
      method: "GET",
    });

    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("Allow")).toBe("POST,OPTIONS");
    await expect(methodResponse.json()).resolves.toEqual({
      error: "Local publish broker only accepts POST.",
      ok: false,
    });

    const tokenResponse = await fetch(broker.endpoint, { method: "POST" });

    expect(tokenResponse.status).toBe(401);
    await expect(tokenResponse.json()).resolves.toEqual({
      error: "Local publish broker token is invalid.",
      ok: false,
    });

    const notReadyResponse = await fetch(broker.endpoint, {
      headers: authHeaders(broker),
      method: "POST",
    });

    expect(notReadyResponse.status).toBe(503);
    await expect(notReadyResponse.json()).resolves.toEqual({
      error: "Site project dev server is not ready.",
      ok: false,
    });
    expect(publishCalls).toBe(0);
  });

  it("runs one publish at a time and serializes the local admin result", async () => {
    const publishInputs: Array<{ projectPath: string; source: string }> = [];
    const firstPublish = deferred<SiteProjectLocalAdminPublishResult>();
    const broker = await startBroker({
      source: () => "http://localhost:5173",
      runPublish: async (input) => {
        publishInputs.push(input);
        return firstPublish.promise;
      },
    });

    const firstResponsePromise = fetch(broker.endpoint, {
      headers: authHeaders(broker),
      method: "POST",
    });

    await waitUntil(() => publishInputs.length === 1);

    const busyResponse = await fetch(broker.endpoint, {
      headers: authHeaders(broker),
      method: "POST",
    });

    expect(busyResponse.status).toBe(409);
    await expect(busyResponse.json()).resolves.toEqual({
      error: "A Site publish is already running.",
      ok: false,
    });

    firstPublish.resolve({
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
    });

    const firstResponse = await firstResponsePromise;

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toEqual({
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
    expect(publishInputs).toEqual([
      {
        projectPath: "/site",
        source: "http://localhost:5173",
      },
    ]);
  });

  it("surfaces publish failures as broker errors", async () => {
    const broker = await startBroker({
      source: () => "http://localhost:5173",
      runPublish: async () => {
        throw new Error("Deploy setup is missing.");
      },
    });

    const response = await fetch(broker.endpoint, {
      headers: authHeaders(broker),
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Deploy setup is missing.",
      ok: false,
    });
  });
});

function startBroker(input: {
  runPublish: (input: {
    projectPath: string;
    source: string;
  }) => Promise<SiteProjectLocalAdminPublishResult>;
  source: () => string | null;
}): Promise<SiteProjectLocalPublishBroker> {
  return startSiteProjectLocalPublishBroker(
    {
      projectPath: "/site",
      source: input.source,
    },
    {
      randomToken: () => "local-token",
      runPublish: input.runPublish,
    },
  ).then((broker) => {
    brokers.push(broker);
    return broker;
  });
}

function authHeaders(broker: SiteProjectLocalPublishBroker): Record<string, string> {
  return {
    Authorization: `Bearer ${broker.token}`,
  };
}

function brokerPath(broker: SiteProjectLocalPublishBroker, pathname: string): string {
  const url = new URL(broker.endpoint);

  url.pathname = pathname;
  return url.toString();
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

async function waitUntil(check: () => boolean) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 1_000) {
    if (check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for condition.");
}
