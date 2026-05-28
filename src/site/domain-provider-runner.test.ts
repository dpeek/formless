import { describe, expect, it } from "vite-plus/test";

import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  nodeAlchemyDomainProviderRuntime,
  runFormlessInstanceDomainProviderApply,
  runFormlessInstanceDomainProviderDelete,
  type DomainProviderAlchemyRuntime,
} from "./domain-provider-runner.ts";

type CapturedRunnerRequest = { body: unknown; url: string };

describe("domain provider Alchemy runner", () => {
  it("requests a Worker apply job, runs CustomDomain resources, and posts evidence", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "admin.example.com",
          profile: "instance",
        },
      ],
      policy: "override",
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const requests: Array<{ body: unknown; url: string }> = [];
    const runnerCalls: Array<{ appName: string; options: unknown }> = [];
    const stateStore = () => {
      throw new Error("state store is passed to Alchemy, not called by this test");
    };
    const runtime: DomainProviderAlchemyRuntime = {
      factories: {
        CustomDomain: async (_id, props) => ({
          ...props,
          createdAt: 1,
          id: "custom-domain-123",
          updatedAt: 2,
        }),
        DnsRecords: async () => {
          throw new Error("DNS records are outside C3.");
        },
        RedirectRule: async () => {
          throw new Error("Redirect rules are outside C3.");
        },
      },
      password: "alchemy-password",
      runner: async (appName, options, apply) => {
        runnerCalls.push({ appName, options });

        return apply();
      },
      stateStore,
    };
    const result = await runFormlessInstanceDomainProviderApply(
      {
        adminToken: "admin-token",
        host: "admin.example.com",
        policy: "override",
        runnerId: "runner-1",
        targetUrl: "https://instance.example",
      },
      {
        createRunnerId: () => "unused-runner",
        env: {},
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

          requests.push({ body, url });

          if (url === "https://instance.example/api/formless/domain-provider/apply") {
            return Response.json(
              {
                code: "domain-provider-apply-job-ready",
                config: {
                  accountId: "account-123",
                  alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
                  applyReady: true,
                  cloudflareApiToken: {
                    configured: true,
                    envNames: ["CLOUDFLARE_API_TOKEN"],
                  },
                  instanceId: "primary",
                  issues: [],
                  planReady: true,
                  workerName: "formless-primary",
                  zones: [{ id: "zone-1", name: "example.com" }],
                },
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "job-1",
                  plan,
                  runnerId: "runner-1",
                  status: "ready",
                  updatedAt: "2026-05-27T00:00:00.000Z",
                },
                plan,
                status: "ready",
              },
              { status: 202 },
            );
          }

          if (
            url === "https://instance.example/api/formless/domain-provider/apply-jobs/job-1/result"
          ) {
            return Response.json({
              job: {
                createdAt: "2026-05-27T00:00:00.000Z",
                jobId: "job-1",
                plan,
                result: { evidenceCount: 1 },
                runnerId: "runner-1",
                status: "succeeded",
                updatedAt: "2026-05-27T00:00:01.000Z",
              },
            });
          }

          return Response.json({ error: "Unexpected request." }, { status: 404 });
        },
        runtime: async () => runtime,
      },
    );

    expect(result).toMatchObject({
      evidenceCount: 1,
      runnerId: "runner-1",
      targetUrl: "https://instance.example",
    });
    expect(requests[0]).toEqual({
      body: {
        host: "admin.example.com",
        policy: "override",
        runnerId: "runner-1",
      },
      url: "https://instance.example/api/formless/domain-provider/apply",
    });
    expect(runnerCalls).toEqual([
      {
        appName: "formless-domain-primary",
        options: {
          noTrack: true,
          password: "alchemy-password",
          phase: "up",
          quiet: true,
          stage: "production",
          stateStore,
        },
      },
    ]);
    expect(
      requestBodyForUrl(
        requests,
        "https://instance.example/api/formless/domain-provider/apply-jobs/job-1/result",
      ),
    ).toEqual({
      resources: [
        expect.objectContaining({
          accountId: "account-123",
          action: "overridden",
          alchemyResourceId: "primary-custom-domain-admin-example-com-instance",
          host: "admin.example.com",
          kind: "cloudflare-worker-custom-domain",
          workerDomainId: "custom-domain-123",
        }),
      ],
      runnerId: "runner-1",
      status: "succeeded",
    });
  });

  it("writes deployment plan facts and reports bridged apply attempts when supported", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "admin.example.com",
          profile: "instance",
        },
      ],
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const desiredState = {
      hash: `sha256:${"a".repeat(64)}`,
      revision: 3,
      targetId: "primary",
      versionId: "version.primary.3",
    };
    const attemptId = "attempt.11111111-1111-4111-8111-111111111111";
    const requests: CapturedRunnerRequest[] = [];
    const runtime: DomainProviderAlchemyRuntime = {
      factories: {
        CustomDomain: async (_id, props) => ({
          ...props,
          createdAt: 1,
          id: "custom-domain-123",
          updatedAt: 2,
        }),
        DnsRecords: async () => {
          throw new Error("DNS records are outside this test.");
        },
        RedirectRule: async () => {
          throw new Error("Redirect rules are outside this test.");
        },
      },
      password: "alchemy-password",
      runner: async (_appName, _options, apply) => apply(),
      stateStore: () => {
        throw new Error("state store is passed to Alchemy, not called by this test");
      },
    };
    const result = await runFormlessInstanceDomainProviderApply(
      {
        adminToken: "admin-token",
        runnerId: "runner-deploy",
        targetUrl: "https://instance.example",
      },
      {
        createRunnerId: () => "unused-runner",
        env: {},
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

          requests.push({ body, url });

          if (url === "https://instance.example/api/formless/domain-provider/apply") {
            return Response.json(
              {
                code: "domain-provider-apply-job-ready",
                config: {
                  accountId: "account-123",
                  alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
                  applyReady: true,
                  cloudflareApiToken: {
                    configured: true,
                    envNames: ["CLOUDFLARE_API_TOKEN"],
                  },
                  instanceId: "primary",
                  issues: [],
                  planReady: true,
                  workerName: "formless-primary",
                  zones: [{ id: "zone-1", name: "example.com" }],
                },
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "job-deployment",
                  plan,
                  runnerId: "runner-deploy",
                  status: "ready",
                  updatedAt: "2026-05-27T00:00:00.000Z",
                },
                plan,
                status: "ready",
              },
              { status: 202 },
            );
          }

          if (url === "https://instance.example/api/formless/deployments/desired-state") {
            return Response.json({
              desiredState: {
                ...desiredState,
                createdAt: "2026-05-27T00:00:00.000Z",
                display: {
                  resourceCount: 1,
                  resourcesByKind: {
                    "cloudflare-dns-records": 0,
                    "cloudflare-redirect-rule": 0,
                    "cloudflare-worker-custom-domain": 1,
                  },
                },
                resourceGraph: { resources: [], targetId: "primary" },
                schemaVersion: 1,
                source: { fingerprint: "source-1", intentRevision: 1 },
              },
              target: { kind: "instance", targetId: "primary" },
            });
          }

          if (url === "https://instance.example/api/formless/deployments/status") {
            return Response.json({
              status: {
                actor: {
                  actorId: "domain-provider.apply",
                  kind: "runner",
                  runnerId: "runner-deploy",
                },
                attemptId,
                checkedAt: "2026-05-27T00:00:00.000Z",
                desiredState,
                mode: "apply",
                startedAt: "2026-05-27T00:00:00.000Z",
                state: "in-progress",
                targetId: "primary",
              },
              target: { kind: "instance", targetId: "primary" },
            });
          }

          if (url === "https://instance.example/api/formless/deployments/attempts/plan") {
            return Response.json({
              attempt: {
                ...desiredState,
                actor: {
                  actorId: "domain-provider.apply",
                  kind: "runner",
                  runnerId: "runner-deploy",
                },
                attemptId,
                idempotencyKey: "domain-provider-apply:job-deployment",
                mode: "apply",
                startedAt: "2026-05-27T00:00:00.000Z",
                status: "started",
                updatedAt: "2026-05-27T00:00:00.000Z",
              },
              plan: {
                ...desiredState,
                attemptId,
                kind: "plan",
                recordedAt: "2026-05-27T00:00:00.000Z",
                summary: body?.summary,
              },
            });
          }

          if (
            url ===
            "https://instance.example/api/formless/domain-provider/apply-jobs/job-deployment/result"
          ) {
            return Response.json({
              job: {
                createdAt: "2026-05-27T00:00:00.000Z",
                jobId: "job-deployment",
                plan,
                result: { evidenceCount: 1 },
                runnerId: "runner-deploy",
                status: "succeeded",
                updatedAt: "2026-05-27T00:00:01.000Z",
              },
            });
          }

          return Response.json({ error: "Unexpected request." }, { status: 404 });
        },
        runtime: async () => runtime,
      },
    );

    expect(result.deployment).toMatchObject({
      attemptId,
      desiredState,
      resourceCount: 1,
      resourcesByKind: {
        "cloudflare-worker-custom-domain": 1,
      },
      source: "domain-provider-job",
      targetId: "primary",
      writebackStatus: "succeeded",
    });
    expect(
      requestBodyForUrl(
        requests,
        "https://instance.example/api/formless/deployments/attempts/plan",
      ),
    ).toMatchObject({
      attemptId,
      desiredState,
      runnerId: "runner-deploy",
      summary: {
        changes: { create: 1, delete: 0, noChange: 0, update: 0 },
      },
    });
  });

  it("posts missing runner secret failures to the apply job result", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "admin.example.com",
          profile: "instance",
        },
      ],
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const requests: Array<{ body: unknown; url: string }> = [];

    await expect(
      runFormlessInstanceDomainProviderApply(
        {
          adminToken: "admin-token",
          host: "admin.example.com",
          runnerId: "runner-missing-secrets",
          targetUrl: "https://instance.example",
        },
        {
          createRunnerId: () => "unused-runner",
          env: {},
          fetch: async (input, init) => {
            const url =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

            requests.push({ body, url });

            if (url === "https://instance.example/api/formless/domain-provider/apply") {
              return Response.json(
                {
                  code: "domain-provider-apply-job-ready",
                  config: {
                    accountId: "account-123",
                    alchemyPassword: { configured: false, envNames: ["ALCHEMY_PASSWORD"] },
                    applyReady: true,
                    cloudflareApiToken: {
                      configured: false,
                      envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
                    },
                    instanceId: "primary",
                    issues: [],
                    jobReady: true,
                    planReady: true,
                    runnerMutation: {
                      checkedBy: "node-runner",
                      requiredEnvNames: [
                        "CLOUDFLARE_API_TOKEN",
                        "CF_API_TOKEN",
                        "ALCHEMY_PASSWORD",
                        "ALCHEMY_STATE_TOKEN",
                      ],
                    },
                    workerName: "formless-primary",
                    zones: [{ id: "zone-1", name: "example.com" }],
                  },
                  job: {
                    createdAt: "2026-05-27T00:00:00.000Z",
                    jobId: "job-missing-secrets",
                    plan,
                    runnerId: "runner-missing-secrets",
                    status: "ready",
                    updatedAt: "2026-05-27T00:00:00.000Z",
                  },
                  plan,
                  status: "ready",
                },
                { status: 202 },
              );
            }

            if (
              url ===
              "https://instance.example/api/formless/domain-provider/apply-jobs/job-missing-secrets/result"
            ) {
              return Response.json({
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "job-missing-secrets",
                  plan,
                  result: {
                    error: "Domain provider runner requires ALCHEMY_PASSWORD.",
                    evidenceCount: 0,
                  },
                  runnerId: "runner-missing-secrets",
                  status: "failed",
                  updatedAt: "2026-05-27T00:00:01.000Z",
                },
              });
            }

            return Response.json({ error: "Unexpected request." }, { status: 404 });
          },
        },
      ),
    ).rejects.toThrow("Domain provider runner requires ALCHEMY_PASSWORD.");

    expect(
      requestForUrl(
        requests,
        "https://instance.example/api/formless/domain-provider/apply-jobs/job-missing-secrets/result",
      ),
    ).toEqual({
      body: {
        error: "Domain provider runner requires ALCHEMY_PASSWORD.",
        runnerId: "runner-missing-secrets",
        status: "failed",
      },
      url: "https://instance.example/api/formless/domain-provider/apply-jobs/job-missing-secrets/result",
    });
  });

  it("reports runner mutation secret requirements before Alchemy setup", async () => {
    await expect(
      nodeAlchemyDomainProviderRuntime({ accountId: "account-123", env: {} }),
    ).rejects.toThrow("Domain provider runner requires ALCHEMY_PASSWORD.");

    await expect(
      nodeAlchemyDomainProviderRuntime({
        accountId: "account-123",
        env: { ALCHEMY_PASSWORD: "alchemy-password" },
      }),
    ).rejects.toThrow("Domain provider runner requires ALCHEMY_STATE_TOKEN.");

    await expect(
      nodeAlchemyDomainProviderRuntime({
        accountId: "account-123",
        env: {
          ALCHEMY_PASSWORD: "alchemy-password",
          ALCHEMY_STATE_TOKEN: "state-token",
        },
      }),
    ).rejects.toThrow("Domain provider runner requires CLOUDFLARE_API_TOKEN or CF_API_TOKEN.");
  });

  it("runs redirect and placeholder DNS resources after preflight and posts evidence", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [],
      redirectIntents: [{ fromHost: "www.example.com", toHost: "example.com" }],
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const requests: Array<{ body: unknown; url: string }> = [];
    const preflightPlans: unknown[] = [];
    const runtime: DomainProviderAlchemyRuntime = {
      factories: {
        CustomDomain: async () => {
          throw new Error("CustomDomain is outside this test.");
        },
        DnsRecords: async (_id, props) => ({
          records: [
            {
              content: "100::",
              createdAt: 1,
              id: "dns-1",
              modifiedAt: 2,
              name: props.records[0]?.name ?? "www.example.com",
              proxied: true,
              ttl: 1,
              type: "AAAA",
              zoneId: props.zoneId,
            },
          ],
          zoneId: props.zoneId,
        }),
        RedirectRule: async (_id, props) => ({
          description: props.description ?? "redirect",
          enabled: true,
          lastUpdated: "2026-05-27T00:00:00.000Z",
          preserveQueryString: props.preserveQueryString ?? true,
          requestUrl: props.requestUrl,
          ruleId: "rule-1",
          rulesetId: "ruleset-1",
          statusCode: props.statusCode ?? 301,
          targetUrl: props.targetUrl,
          zoneId: typeof props.zone === "string" ? props.zone : props.zone.id,
        }),
      },
      password: "alchemy-password",
      preflight: async ({ plan: preflightPlan }) => {
        preflightPlans.push(preflightPlan);
      },
      runner: async (_appName, _options, apply) => apply(),
      stateStore: () => {
        throw new Error("state store is passed to Alchemy, not called by this test");
      },
    };
    const result = await runFormlessInstanceDomainProviderApply(
      {
        adminToken: "admin-token",
        policy: "create-only",
        runnerId: "runner-redirects",
        targetUrl: "https://instance.example",
      },
      {
        createRunnerId: () => "unused-runner",
        env: {},
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

          requests.push({ body, url });

          if (url === "https://instance.example/api/formless/domain-provider/apply") {
            return Response.json(
              {
                code: "domain-provider-apply-job-ready",
                config: {
                  accountId: "account-123",
                  alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
                  applyReady: true,
                  cloudflareApiToken: {
                    configured: true,
                    envNames: ["CLOUDFLARE_API_TOKEN"],
                  },
                  instanceId: "primary",
                  issues: [],
                  planReady: true,
                  workerName: "formless-primary",
                  zones: [{ id: "zone-1", name: "example.com" }],
                },
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "job-redirects",
                  plan,
                  runnerId: "runner-redirects",
                  status: "ready",
                  updatedAt: "2026-05-27T00:00:00.000Z",
                },
                plan,
                status: "ready",
              },
              { status: 202 },
            );
          }

          if (
            url ===
            "https://instance.example/api/formless/domain-provider/apply-jobs/job-redirects/result"
          ) {
            return Response.json({
              job: {
                createdAt: "2026-05-27T00:00:00.000Z",
                jobId: "job-redirects",
                plan,
                result: { evidenceCount: 2 },
                runnerId: "runner-redirects",
                status: "succeeded",
                updatedAt: "2026-05-27T00:00:01.000Z",
              },
            });
          }

          return Response.json({ error: "Unexpected request." }, { status: 404 });
        },
        runtime: async () => runtime,
      },
    );

    expect(result.evidenceCount).toBe(2);
    expect(preflightPlans).toEqual([plan]);
    expect(
      requestBodyForUrl(
        requests,
        "https://instance.example/api/formless/domain-provider/apply-jobs/job-redirects/result",
      ),
    ).toEqual({
      resources: [
        expect.objectContaining({
          dnsRecordIds: ["dns-1"],
          host: "www.example.com",
          kind: "cloudflare-dns-records",
        }),
        expect.objectContaining({
          host: "www.example.com",
          kind: "cloudflare-redirect-rule",
          redirectRuleId: "rule-1",
          redirectRulesetId: "ruleset-1",
          targetUrl: "https://example.com/${1}",
        }),
      ],
      runnerId: "runner-redirects",
      status: "succeeded",
    });
  });

  it("requests a Worker delete job, runs Alchemy destroy, and posts delete evidence", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "admin.example.com",
          profile: "instance",
        },
      ],
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const target = {
      accountId: "account-123",
      action: "created" as const,
      alchemyResourceId: "primary-custom-domain-admin-example-com-instance",
      host: "admin.example.com",
      kind: "cloudflare-worker-custom-domain" as const,
      logicalId: "primary-custom-domain-admin-example-com-instance",
      profile: "instance" as const,
      resourceId: "custom-domain-123",
      resourceJson: "{}",
      workerName: "formless-primary",
      zoneId: "zone-1",
      zoneName: "example.com",
    };
    const requests: Array<{ body: unknown; url: string }> = [];
    const runnerCalls: Array<{ appName: string; options: unknown }> = [];
    const runtime: DomainProviderAlchemyRuntime = {
      factories: {
        CustomDomain: async (_id, props) => ({
          ...props,
          createdAt: 1,
          id: "custom-domain-123",
          updatedAt: 2,
        }),
        DnsRecords: async () => {
          throw new Error("DNS records are outside this test.");
        },
        RedirectRule: async () => {
          throw new Error("Redirect rules are outside this test.");
        },
      },
      password: "alchemy-password",
      runner: async (appName, options, apply) => {
        runnerCalls.push({ appName, options });

        return apply();
      },
      stateStore: () => {
        throw new Error("state store is passed to Alchemy, not called by this test");
      },
    };
    const result = await runFormlessInstanceDomainProviderDelete(
      {
        adminToken: "admin-token",
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        runnerId: "runner-delete",
        targetUrl: "https://instance.example",
      },
      {
        createRunnerId: () => "unused-runner",
        env: {},
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

          requests.push({ body, url });

          if (url === "https://instance.example/api/formless/domain-provider/delete") {
            return Response.json(
              {
                code: "domain-provider-delete-job-ready",
                config: {
                  accountId: "account-123",
                  alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
                  applyReady: true,
                  cloudflareApiToken: {
                    configured: true,
                    envNames: ["CLOUDFLARE_API_TOKEN"],
                  },
                  instanceId: "primary",
                  issues: [],
                  planReady: true,
                  workerName: "formless-primary",
                  zones: [{ id: "zone-1", name: "example.com" }],
                },
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "delete-job-1",
                  plan,
                  runnerId: "runner-delete",
                  status: "ready",
                  targets: [target],
                  updatedAt: "2026-05-27T00:00:00.000Z",
                },
                plan,
                status: "ready",
                targets: [target],
              },
              { status: 202 },
            );
          }

          if (
            url ===
            "https://instance.example/api/formless/domain-provider/delete-jobs/delete-job-1/result"
          ) {
            return Response.json({
              job: {
                createdAt: "2026-05-27T00:00:00.000Z",
                jobId: "delete-job-1",
                plan,
                result: { evidenceCount: 1 },
                runnerId: "runner-delete",
                status: "succeeded",
                targets: [target],
                updatedAt: "2026-05-27T00:00:01.000Z",
              },
            });
          }

          return Response.json({ error: "Unexpected request." }, { status: 404 });
        },
        runtime: async () => runtime,
      },
    );

    expect(result.evidenceCount).toBe(1);
    expect(runnerCalls).toEqual([
      expect.objectContaining({
        options: expect.objectContaining({ phase: "destroy" }),
      }),
    ]);
    expect(requests[0]?.body).toEqual({
      host: "admin.example.com",
      kind: "cloudflare-worker-custom-domain",
      runnerId: "runner-delete",
    });
    expect(requests[1]?.body).toEqual({
      resources: [
        {
          action: "deleted",
          host: "admin.example.com",
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-admin-example-com-instance",
        },
      ],
      runnerId: "runner-delete",
      status: "succeeded",
    });
  });

  it("treats already-missing provider resources as successful delete evidence", async () => {
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "gone.example.com",
          profile: "instance",
        },
      ],
      workerName: "formless-primary",
      zones: [{ id: "zone-1", name: "example.com" }],
    });
    const target = {
      accountId: "account-123",
      action: "created" as const,
      alchemyResourceId: "primary-custom-domain-gone-example-com-instance",
      host: "gone.example.com",
      kind: "cloudflare-worker-custom-domain" as const,
      logicalId: "primary-custom-domain-gone-example-com-instance",
      profile: "instance" as const,
      resourceId: "custom-domain-gone",
      resourceJson: "{}",
      workerName: "formless-primary",
      zoneId: "zone-1",
      zoneName: "example.com",
    };
    const requests: Array<{ body: unknown; url: string }> = [];
    const runtime: DomainProviderAlchemyRuntime = {
      factories: {
        CustomDomain: async (id) => {
          throw new Error(`Cloudflare CustomDomain ${id} returned 404 not found.`);
        },
        DnsRecords: async () => {
          throw new Error("DNS records are outside this test.");
        },
        RedirectRule: async () => {
          throw new Error("Redirect rules are outside this test.");
        },
      },
      password: "alchemy-password",
      runner: async (_appName, _options, apply) => apply(),
      stateStore: () => {
        throw new Error("state store is passed to Alchemy, not called by this test");
      },
    };
    const result = await runFormlessInstanceDomainProviderDelete(
      {
        adminToken: "admin-token",
        host: "gone.example.com",
        kind: "cloudflare-worker-custom-domain",
        runnerId: "runner-delete",
        targetUrl: "https://instance.example",
      },
      {
        createRunnerId: () => "unused-runner",
        env: {},
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

          requests.push({ body, url });

          if (url === "https://instance.example/api/formless/domain-provider/delete") {
            return Response.json(
              {
                code: "domain-provider-delete-job-ready",
                config: {
                  accountId: "account-123",
                  alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
                  applyReady: true,
                  cloudflareApiToken: {
                    configured: true,
                    envNames: ["CLOUDFLARE_API_TOKEN"],
                  },
                  instanceId: "primary",
                  issues: [],
                  planReady: true,
                  workerName: "formless-primary",
                  zones: [{ id: "zone-1", name: "example.com" }],
                },
                job: {
                  createdAt: "2026-05-27T00:00:00.000Z",
                  jobId: "delete-job-missing",
                  plan,
                  runnerId: "runner-delete",
                  status: "ready",
                  targets: [target],
                  updatedAt: "2026-05-27T00:00:00.000Z",
                },
                plan,
                status: "ready",
                targets: [target],
              },
              { status: 202 },
            );
          }

          if (
            url ===
            "https://instance.example/api/formless/domain-provider/delete-jobs/delete-job-missing/result"
          ) {
            return Response.json({
              job: {
                createdAt: "2026-05-27T00:00:00.000Z",
                jobId: "delete-job-missing",
                plan,
                result: { evidenceCount: 1 },
                runnerId: "runner-delete",
                status: "succeeded",
                targets: [target],
                updatedAt: "2026-05-27T00:00:01.000Z",
              },
            });
          }

          return Response.json({ error: "Unexpected request." }, { status: 404 });
        },
        runtime: async () => runtime,
      },
    );

    expect(result.evidenceCount).toBe(1);
    expect(requests[1]?.body).toEqual({
      resources: [
        {
          action: "deleted",
          host: "gone.example.com",
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-gone-example-com-instance",
        },
      ],
      runnerId: "runner-delete",
      status: "succeeded",
    });
  });
});

function requestForUrl(
  requests: readonly CapturedRunnerRequest[],
  url: string,
): CapturedRunnerRequest {
  const request = requests.find((candidate) => candidate.url === url);

  if (!request) {
    throw new Error(`Expected request to ${url}.`);
  }

  return request;
}

function requestBodyForUrl(requests: readonly CapturedRunnerRequest[], url: string): unknown {
  return requestForUrl(requests, url).body;
}
