import { build } from "esbuild";
import { describe, expect, it } from "vite-plus/test";

import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  type AlchemyDomainProviderFactories,
  type AlchemyDomainProviderRunner,
  runAlchemyDomainProviderPlan,
} from "./domain-provider-alchemy.ts";

describe("Alchemy domain provider adapter", () => {
  it("runs planned resources through injected Alchemy factories and state store", async () => {
    const calls: Array<{ id: string; kind: string; props: unknown }> = [];
    const runnerCalls: Array<{ appName: string; options: unknown }> = [];
    const stateStore = () => {
      throw new Error("The fake state store is only passed through.");
    };
    const runner: AlchemyDomainProviderRunner = async (appName, options, apply) => {
      runnerCalls.push({ appName, options });

      return apply();
    };
    const factories: AlchemyDomainProviderFactories = {
      CustomDomain: async (id, props) => {
        calls.push({ id, kind: "CustomDomain", props });

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: "domain-output",
          updatedAt: 2,
        };
      },
      DnsRecords: async (id, props) => {
        calls.push({ id, kind: "DnsRecords", props });

        return { ...props, records: [] };
      },
      RedirectRule: async (id, props) => {
        calls.push({ id, kind: "RedirectRule", props });

        return {
          ...props,
          description: props.description ?? "redirect",
          enabled: true,
          lastUpdated: "2026-05-26T00:00:00.000Z",
          preserveQueryString: props.preserveQueryString ?? true,
          ruleId: "rule-output",
          rulesetId: "ruleset-output",
          statusCode: props.statusCode ?? 301,
          zoneId: typeof props.zone === "string" ? props.zone : JSON.stringify(props.zone),
        };
      },
    };
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "example.com",
          profile: "instance",
        },
      ],
      redirectIntents: [{ fromHost: "www.example.com", toHost: "example.com" }],
      workerName: "formless-prod",
      zones: [{ id: "zone-example", name: "example.com" }],
    });

    const result = await runAlchemyDomainProviderPlan({
      factories,
      plan,
      runner,
      stateStore,
    });

    expect(runnerCalls).toEqual([
      {
        appName: "formless-domain-primary",
        options: {
          noTrack: true,
          phase: "up",
          quiet: true,
          stage: "production",
          stateStore,
        },
      },
    ]);
    expect(calls.map((call) => [call.kind, call.id])).toEqual([
      ["DnsRecords", "primary-redirect-dns-www-example-com"],
      ["RedirectRule", "primary-redirect-rule-www-example-com-example-com"],
      ["CustomDomain", "primary-custom-domain-example-com-instance"],
    ]);
    expect(result.resources.map((resource) => resource.kind)).toEqual([
      "cloudflare-dns-records",
      "cloudflare-redirect-rule",
      "cloudflare-worker-custom-domain",
    ]);
  });

  it("does not call Alchemy factories for blocked plans", async () => {
    const runner: AlchemyDomainProviderRunner = async (_appName, _options, apply) => apply();
    const factories = throwingFactories();
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "unknown.invalid",
          profile: "instance",
        },
      ],
      workerName: "formless-prod",
      zones: [],
    });

    await expect(
      runAlchemyDomainProviderPlan({
        factories,
        plan,
        runner,
      }),
    ).rejects.toThrow("Domain provider plan has blockers: missing-zone.");
  });

  it("bundles the injected adapter path for a Worker target", async () => {
    await expect(
      build({
        bundle: true,
        format: "esm",
        platform: "browser",
        stdin: {
          contents: `
            import { runAlchemyDomainProviderPlan } from "./src/worker/domain-provider-alchemy.ts";

            export default {
              async fetch() {
                return new Response(typeof runAlchemyDomainProviderPlan);
              },
            };
          `,
          loader: "ts",
          resolveDir: process.cwd(),
          sourcefile: "domain-provider-worker-proof.ts",
        },
        target: "es2023",
        write: false,
      }),
    ).resolves.toMatchObject({
      outputFiles: expect.any(Array),
    });
  });
});

function throwingFactories(): AlchemyDomainProviderFactories {
  return {
    CustomDomain: async () => {
      throw new Error("CustomDomain should not be called.");
    },
    DnsRecords: async () => {
      throw new Error("DnsRecords should not be called.");
    },
    RedirectRule: async () => {
      throw new Error("RedirectRule should not be called.");
    },
  };
}
