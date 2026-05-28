import { describe, expect, it } from "vite-plus/test";

import {
  canonicalizeDeploymentResourceGraph,
  computeDeploymentDesiredStateHash,
  deploymentDesiredStateHashInputCanonicalJson,
  deploymentDesiredStateVersionRefsEqual,
  isDeploymentDesiredStateVersionRefCurrent,
  parseDeploymentAttemptMode,
  parseDeploymentDesiredStateHash,
  parseDeploymentDesiredStateVersionRef,
  parseDeploymentTargetId,
  validateDeploymentActorId,
  validateDeploymentAttemptStatus,
  validateDeploymentDesiredStateVersionRef,
  validateDeploymentIdempotencyKey,
  validateDeploymentLeaseToken,
  type DeploymentDesiredStateHashInput,
  type DeploymentDesiredStateVersionRef,
  type DeploymentResourceGraph,
} from "./deployment-runtime.ts";

describe("deployment runtime", () => {
  it("builds stable canonical hash input and hashes equivalent graphs the same way", async () => {
    const first = hashInputWithGraph(
      graphWithResources([
        customDomainResource({
          dependencies: [{ logicalId: "zone:example" }],
          inputs: {
            workerName: "formless-prod",
            zoneId: "zone-example",
            host: "app.example.com",
          },
          logicalId: "custom-domain:app.example.com",
        }),
        redirectRuleResource({
          dependencies: [
            { reason: "host placeholder", logicalId: "dns:www.example.com" },
            { logicalId: "zone:example", reason: "zone lookup" },
          ],
          inputs: {
            zoneId: "zone-example",
            statusCode: 301,
            targetUrl: "https://example.com/${1}",
          },
          logicalId: "redirect:www.example.com",
        }),
      ]),
    );
    const second = hashInputWithGraph(
      graphWithResources([
        redirectRuleResource({
          dependencies: [
            { reason: "zone lookup", logicalId: "zone:example" },
            { logicalId: "dns:www.example.com", reason: "host placeholder" },
          ],
          inputs: {
            targetUrl: "https://example.com/${1}",
            statusCode: 301,
            zoneId: "zone-example",
          },
          logicalId: "redirect:www.example.com",
        }),
        customDomainResource({
          dependencies: [{ logicalId: "zone:example" }],
          inputs: {
            host: "app.example.com",
            zoneId: "zone-example",
            workerName: "formless-prod",
          },
          logicalId: "custom-domain:app.example.com",
        }),
      ]),
    );

    expect(deploymentDesiredStateHashInputCanonicalJson(first)).toBe(
      deploymentDesiredStateHashInputCanonicalJson(second),
    );
    expect(await computeDeploymentDesiredStateHash(first)).toBe(
      await computeDeploymentDesiredStateHash(second),
    );
  });

  it("canonicalizes resource and dependency ordering deterministically", () => {
    const graph = graphWithResources([
      redirectRuleResource({
        dependencies: [
          { reason: "zone lookup", logicalId: "zone:example" },
          { logicalId: "dns:www.example.com", reason: "host placeholder" },
        ],
        inputs: { zoneId: "zone-example" },
        logicalId: "redirect:www.example.com",
      }),
      dnsRecordsResource({
        dependencies: [],
        inputs: { zoneId: "zone-example" },
        logicalId: "dns:www.example.com",
      }),
      customDomainResource({
        dependencies: [],
        inputs: { zoneId: "zone-example" },
        logicalId: "custom-domain:app.example.com",
      }),
    ]);

    expect(
      canonicalizeDeploymentResourceGraph(graph).resources.map((resource) => ({
        dependencies: resource.dependencies,
        kind: resource.kind,
        logicalId: resource.logicalId,
      })),
    ).toEqual([
      {
        dependencies: [],
        kind: "cloudflare-worker-custom-domain",
        logicalId: "custom-domain:app.example.com",
      },
      {
        dependencies: [],
        kind: "cloudflare-dns-records",
        logicalId: "dns:www.example.com",
      },
      {
        dependencies: [
          { logicalId: "dns:www.example.com", reason: "host placeholder" },
          { logicalId: "zone:example", reason: "zone lookup" },
        ],
        kind: "cloudflare-redirect-rule",
        logicalId: "redirect:www.example.com",
      },
    ]);
  });

  it("excludes secret-like input keys from canonical graph JSON and hashes", async () => {
    const withoutSecrets = hashInputWithGraph(
      graphWithResources([
        customDomainResource({
          inputs: {
            headers: {
              publicHeader: "cache",
            },
            publicSetting: "kept",
            zoneId: "zone-example",
          },
          logicalId: "custom-domain:example.com",
        }),
      ]),
    );
    const withSecrets = hashInputWithGraph(
      graphWithResources([
        customDomainResource({
          inputs: {
            apiToken: "token-a",
            headers: {
              authorizationHeader: "Bearer token-b",
              publicHeader: "cache",
            },
            password: "secret-password",
            publicSetting: "kept",
            state_token: "state-token",
            zoneId: "zone-example",
          },
          logicalId: "custom-domain:example.com",
        }),
      ]),
    );

    expect(deploymentDesiredStateHashInputCanonicalJson(withSecrets)).toBe(
      deploymentDesiredStateHashInputCanonicalJson(withoutSecrets),
    );
    expect(deploymentDesiredStateHashInputCanonicalJson(withSecrets)).not.toContain("token-a");
    expect(deploymentDesiredStateHashInputCanonicalJson(withSecrets)).not.toContain("token-b");
    expect(await computeDeploymentDesiredStateHash(withSecrets)).toBe(
      await computeDeploymentDesiredStateHash(withoutSecrets),
    );
  });

  it("treats desired-state version references as current only on exact matches", () => {
    const latest = desiredStateRef();

    expect(isDeploymentDesiredStateVersionRefCurrent(latest, desiredStateRef())).toBe(true);
    expect(
      deploymentDesiredStateVersionRefsEqual(latest, {
        ...latest,
        revision: 8,
      }),
    ).toBe(false);
    expect(
      isDeploymentDesiredStateVersionRefCurrent(latest, {
        ...latest,
        hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      }),
    ).toBe(false);
    expect(
      isDeploymentDesiredStateVersionRefCurrent(latest, {
        ...latest,
        versionId: "desired.instance.8",
      }),
    ).toBe(false);
  });

  it("returns structured validation errors and throws parse failures", () => {
    expect(validateDeploymentActorId("Bad Actor")).toEqual({
      error: expect.objectContaining({ code: "invalid-actor-id", field: "actorId" }),
      ok: false,
    });
    expect(validateDeploymentAttemptStatus("running")).toEqual({
      error: expect.objectContaining({ code: "invalid-attempt-status", field: "status" }),
      ok: false,
    });
    expect(validateDeploymentIdempotencyKey("bad key")).toEqual({
      error: expect.objectContaining({ code: "invalid-idempotency-key", field: "idempotencyKey" }),
      ok: false,
    });
    expect(validateDeploymentLeaseToken("")).toEqual({
      error: expect.objectContaining({ code: "invalid-lease-token", field: "leaseToken" }),
      ok: false,
    });
    expect(validateDeploymentDesiredStateVersionRef({ ...desiredStateRef(), extra: true })).toEqual(
      {
        error: expect.objectContaining({ code: "invalid-desired-state-version-ref" }),
        ok: false,
      },
    );

    expect(() => parseDeploymentTargetId("Target", "Instance")).toThrow(
      /must start with a lowercase letter/,
    );
    expect(() => parseDeploymentAttemptMode("Mode", "preview")).toThrow(
      /must be "apply", "destroy", or "plan"/,
    );
    expect(() => parseDeploymentDesiredStateHash("Hash", "SHA256:abc")).toThrow(
      /must use "sha256:"/,
    );
    expect(() =>
      parseDeploymentDesiredStateVersionRef("Version ref", {
        ...desiredStateRef(),
        revision: -1,
      }),
    ).toThrow(/must be a non-negative safe integer/);
  });
});

function hashInputWithGraph(
  resourceGraph: DeploymentResourceGraph,
): DeploymentDesiredStateHashInput {
  return {
    resourceGraph,
    schemaVersion: 1,
    targetId: "instance.primary",
  };
}

function graphWithResources(
  resources: DeploymentResourceGraph["resources"],
): DeploymentResourceGraph {
  return {
    resources,
    targetId: "instance.primary",
  };
}

type TestDeploymentResourceOptions = Pick<
  DeploymentResourceGraph["resources"][number],
  "logicalId"
> &
  Partial<Pick<DeploymentResourceGraph["resources"][number], "dependencies" | "inputs">>;

function customDomainResource({
  dependencies = [],
  inputs = {},
  logicalId,
}: TestDeploymentResourceOptions): DeploymentResourceGraph["resources"][number] {
  return {
    dependencies,
    inputs,
    kind: "cloudflare-worker-custom-domain",
    logicalId,
    providerFamily: "cloudflare",
    targetId: "instance.primary",
  };
}

function redirectRuleResource({
  dependencies = [],
  inputs = {},
  logicalId,
}: TestDeploymentResourceOptions): DeploymentResourceGraph["resources"][number] {
  return {
    dependencies,
    inputs,
    kind: "cloudflare-redirect-rule",
    logicalId,
    providerFamily: "cloudflare",
    targetId: "instance.primary",
  };
}

function dnsRecordsResource({
  dependencies = [],
  inputs = {},
  logicalId,
}: TestDeploymentResourceOptions): DeploymentResourceGraph["resources"][number] {
  return {
    dependencies,
    inputs,
    kind: "cloudflare-dns-records",
    logicalId,
    providerFamily: "cloudflare",
    targetId: "instance.primary",
  };
}

function desiredStateRef(): DeploymentDesiredStateVersionRef {
  return {
    hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    revision: 7,
    targetId: "instance.primary",
    versionId: "desired.instance.7",
  };
}
