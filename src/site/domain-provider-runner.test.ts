import { describe, expect, it } from "vite-plus/test";

import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  runFormlessInstanceDomainProviderApply,
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
});
