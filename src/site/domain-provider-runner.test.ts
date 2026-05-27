import { describe, expect, it } from "vite-plus/test";

import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  nodeAlchemyDomainProviderRuntime,
  runFormlessInstanceDomainProviderApply,
  runFormlessInstanceDomainProviderDelete,
  type DomainProviderAlchemyRuntime,
} from "./domain-provider-runner.ts";

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
    expect(requests[1]?.body).toEqual({
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

    expect(requests[1]).toEqual({
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
    expect(requests[1]?.body).toEqual({
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
});
