import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "@dpeek/formless-gateway";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "test-proxy-token",
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1",
      },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("Worker workspace gateway proxy routes", () => {
  it("advertises workspace operation capabilities before proxying", async () => {
    const response = await harness.fetch(WORKSPACE_GATEWAY_STATUS_API_PATH, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Workspace gateway sidecar is unavailable.",
    });
  });
});
