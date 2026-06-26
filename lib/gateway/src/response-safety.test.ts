import { describe, expect, it } from "vite-plus/test";

import {
  initialWorkspaceOperationState,
  nextWorkspaceOperationState,
} from "@dpeek/formless-workspace";
import { WORKSPACE_GATEWAY_CSRF_COOKIE_NAME } from "./types.ts";
import { workspaceGatewaySafeSidecarResponse } from "./response-safety.ts";

describe("workspace gateway response safety", () => {
  it("wraps Workspace-redacted operation state without owning semantic operation redaction", async () => {
    const workspaceRoot = "/tmp/personal-sites";
    const ownerSetupUrl = "https://personal.dpeek.workers.dev/setup?token=owner-setup-secret";
    const operation = nextWorkspaceOperationState(
      initialWorkspaceOperationState({
        actor: "browser",
        id: "op_push_00000001",
        input: {
          rawAdapterOutput: "TOKEN=secret",
          workspaceFile: `${workspaceRoot}/deploy/output.json`,
        },
        now: () => "2026-06-02T00:00:00.000Z",
        operation: "push",
        workspaceLabel: "personal-sites",
        workspaceRoot,
      }),
      {
        errors: [{ message: `Push failed at ${workspaceRoot} with TOKEN=secret` }],
        logs: [
          {
            at: "2026-06-02T00:00:01.000Z",
            level: "info",
            message: `Bearer secret-token CF_API_TOKEN=secret ${workspaceRoot}/logs/output.txt`,
          },
        ],
        result: {
          deployment: {
            leaseToken: "lease:local-gateway",
            ownerSetupUrl,
            rawAdapterOutput: "TOKEN=secret",
          },
          summary: {
            fields: {
              ownerSetupUrl,
              providerStatePayload: "raw",
            },
            title: "Workspace push applied",
          },
        },
        status: "failed",
        steps: [
          {
            detail: `${workspaceRoot}/deploy output`,
            error: "Health check failed with TOKEN=secret",
            fields: {
              rawAdapterOutput: "TOKEN=secret",
            },
            id: "health-check",
            label: "Health check",
            status: "failed",
          },
        ],
        summary: {
          fields: {
            credentialToken: "oauth-access-token",
            providerStatePayload: "raw",
            setupUrl: ownerSetupUrl,
          },
          title: "Workspace push failed",
        },
        workspaceRoot,
      },
    );
    const displaySafeOperationText = JSON.stringify(operation);

    expect(displaySafeOperationText).toContain("[redacted]");
    expect(displaySafeOperationText).toContain("<workspace>");
    expect(displaySafeOperationText).not.toContain(workspaceRoot);
    expect(displaySafeOperationText).not.toContain("oauth-access-token");
    expect(displaySafeOperationText).not.toContain("secret-token");

    const response = await workspaceGatewaySafeSidecarResponse({
      authorization: { actor: "browser", via: "owner-session" },
      env: { csrfToken: "csrf-token" },
      request: new Request("https://example.com/api/formless/workspace/operations"),
      response: new Response(JSON.stringify({ operation }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "sidecar-secret=value",
          "X-Secret": "hidden",
        },
      }),
    });
    const body = (await response.json()) as { csrfToken?: string; operation?: unknown };

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain(
      `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=csrf-token`,
    );
    expect(response.headers.get("Set-Cookie")).not.toContain("sidecar-secret");
    expect(response.headers.get("X-Secret")).toBeNull();
    expect(body.csrfToken).toBe("csrf-token");
    expect(body.operation).toEqual(operation);
    expect(JSON.stringify(body.operation)).not.toContain("oauth-access-token");
    expect(JSON.stringify(body.operation)).not.toContain("secret-token");
  });
});
