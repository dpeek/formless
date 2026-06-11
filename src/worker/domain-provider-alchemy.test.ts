import { build } from "esbuild";
import { describe, expect, it } from "vite-plus/test";
import type { DeployResourceGraph } from "@dpeek/formless-deploy";

import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  type AlchemyDomainProviderFactories,
  type AlchemyDomainProviderRunner,
  runAlchemyDeployResourceGraph,
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

  it("converts deployment resource graphs through tracked Alchemy declarations and evidence", async () => {
    const calls: Array<{ id: string; kind: string; props: unknown }> = [];
    const runnerCalls: Array<{ appName: string; options: Record<string, unknown> }> = [];
    const runner: AlchemyDomainProviderRunner = async (appName, options, apply) => {
      runnerCalls.push({ appName, options: options as Record<string, unknown> });

      return apply();
    };
    const factories: AlchemyDomainProviderFactories = {
      CustomDomain: async (id, props) => {
        calls.push({ id, kind: "CustomDomain", props });

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: "custom-domain-output",
          updatedAt: 2,
          zoneId: props.zoneId ?? "zone-example",
        };
      },
      DnsRecords: async (id, props) => {
        calls.push({ id, kind: "DnsRecords", props });

        return {
          zoneId: props.zoneId,
          records: props.records.map((record, index) => ({
            ...record,
            id: `dns-output-${index}`,
          })),
        } as Awaited<ReturnType<AlchemyDomainProviderFactories["DnsRecords"]>>;
      },
      RedirectRule: async (id, props) => {
        calls.push({ id, kind: "RedirectRule", props });

        return {
          description: props.description ?? "redirect",
          enabled: true,
          lastUpdated: "2026-06-04T00:00:00.000Z",
          preserveQueryString: props.preserveQueryString ?? true,
          requestUrl: props.requestUrl,
          ruleId: "redirect-rule-output",
          rulesetId: "redirect-ruleset-output",
          statusCode: props.statusCode ?? 301,
          targetUrl: props.targetUrl,
          zoneId: typeof props.zone === "string" ? props.zone : props.zone.id,
        };
      },
    };
    const resourceGraph: DeployResourceGraph = {
      targetId: "instance.primary",
      resources: [
        {
          dependencies: [],
          inputs: {
            fromHost: "www.example.com",
            records: [
              {
                content: "100::",
                name: "www.example.com",
                proxied: true,
                ttl: 1,
                type: "AAAA",
              },
            ],
          },
          kind: "cloudflare-dns-records",
          logicalId: "primary-redirect-dns-www-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [{ logicalId: "primary-redirect-dns-www-example-com" }],
          inputs: {
            description: "Formless redirect www.example.com to example.com",
            fromHost: "www.example.com",
            preserveQueryString: true,
            requestUrl: "https://www.example.com/*",
            statusCode: 308,
            targetUrl: "https://example.com/${1}",
          },
          kind: "cloudflare-redirect-rule",
          logicalId: "primary-redirect-rule-www-example-com-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [],
          inputs: {
            adopt: false,
            host: "app.example.com",
            name: "app.example.com",
            overrideExistingOrigin: false,
            profile: "publicSite",
            targetInstallId: "site",
            workerName: "formless-prod",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-app-example-com-publicsite-site",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
      ],
    };

    const result = await runAlchemyDeployResourceGraph({
      adopt: true,
      factories,
      password: "alchemy-password",
      resolveZoneIdForHost: ({ host }) =>
        host.endsWith("example.com") ? "zone-example" : undefined,
      resourceGraph,
      rootDir: "/state",
      runner,
      stage: "personal",
    });

    expect(runnerCalls).toEqual([
      {
        appName: "formless-deployment-instance-primary",
        options: {
          adopt: true,
          password: "alchemy-password",
          phase: "up",
          quiet: true,
          rootDir: "/state",
          stage: "personal",
        },
      },
    ]);
    expect(runnerCalls[0]?.options).not.toHaveProperty("noTrack");
    expect(calls.map((call) => [call.kind, call.id])).toEqual([
      ["DnsRecords", "primary-redirect-dns-www-example-com"],
      ["RedirectRule", "primary-redirect-rule-www-example-com-example-com"],
      ["CustomDomain", "primary-custom-domain-app-example-com-publicsite-site"],
    ]);
    expect(calls[0]?.props).toMatchObject({ zoneId: "zone-example" });
    expect(calls[1]?.props).toMatchObject({ zone: "zone-example", statusCode: 308 });
    expect(calls[2]?.props).toMatchObject({
      adopt: true,
      name: "app.example.com",
      workerName: "formless-prod",
    });
    expect(result.evidence).toEqual([
      {
        action: "updated",
        alchemyResourceId: "primary-redirect-dns-www-example-com",
        displayName: "www.example.com",
        kind: "cloudflare-dns-records",
        logicalId: "primary-redirect-dns-www-example-com",
        providerFamily: "cloudflare",
        providerResourceIds: ["dns-output-0"],
        targetId: "instance.primary",
      },
      {
        action: "updated",
        alchemyResourceId: "primary-redirect-rule-www-example-com-example-com",
        displayName: "www.example.com",
        kind: "cloudflare-redirect-rule",
        logicalId: "primary-redirect-rule-www-example-com-example-com",
        providerFamily: "cloudflare",
        providerResourceIds: ["redirect-rule-output", "redirect-ruleset-output"],
        targetId: "instance.primary",
      },
      {
        action: "updated",
        alchemyResourceId: "primary-custom-domain-app-example-com-publicsite-site",
        displayName: "app.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-app-example-com-publicsite-site",
        providerFamily: "cloudflare",
        providerResourceIds: ["custom-domain-output"],
        targetId: "instance.primary",
      },
    ]);
  });

  it("omits removed route resources from the next tracked deploy run", async () => {
    const destroyed: Array<{ appName: string; logicalId: string; stage: string }> = [];
    const declaredByRun: string[][] = [];
    const trackedResourcesByScope = new Map<string, Set<string>>();
    let currentDeclarationIds: string[] = [];
    const declare = (id: string) => {
      currentDeclarationIds.push(id);
    };
    const runner: AlchemyDomainProviderRunner = async (appName, options, apply) => {
      currentDeclarationIds = [];
      const result = await apply();
      const stage = options.stage ?? "production";
      const scope = `${appName}:${stage}`;
      const previous = trackedResourcesByScope.get(scope) ?? new Set<string>();
      const next = new Set(currentDeclarationIds);

      for (const logicalId of previous) {
        if (!next.has(logicalId)) {
          destroyed.push({ appName, logicalId, stage });
        }
      }

      declaredByRun.push([...currentDeclarationIds]);
      trackedResourcesByScope.set(scope, next);

      return result;
    };
    const factories: AlchemyDomainProviderFactories = {
      CustomDomain: async (id, props) => {
        declare(id);

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: `${id}-provider-id`,
          updatedAt: 2,
        };
      },
      DnsRecords: async (id, props) => {
        declare(id);

        return {
          records: props.records.map((record, index) => ({
            ...record,
            id: `${id}-record-${index}`,
          })),
          zoneId: props.zoneId,
        } as Awaited<ReturnType<AlchemyDomainProviderFactories["DnsRecords"]>>;
      },
      RedirectRule: async (id, props) => {
        declare(id);

        return {
          description: props.description ?? "redirect",
          enabled: true,
          lastUpdated: "2026-06-04T00:00:00.000Z",
          preserveQueryString: props.preserveQueryString ?? true,
          ruleId: `${id}-rule`,
          rulesetId: `${id}-ruleset`,
          statusCode: props.statusCode ?? 301,
          targetUrl: props.targetUrl,
          zoneId: typeof props.zone === "string" ? props.zone : props.zone.id,
        };
      },
    };
    const routeResources: DeployResourceGraph = {
      targetId: "instance.primary",
      resources: [
        {
          dependencies: [],
          inputs: {
            fromHost: "old.example.com",
            records: [
              {
                content: "100::",
                name: "old.example.com",
                proxied: true,
                ttl: 1,
                type: "AAAA",
              },
            ],
            zoneId: "zone-example",
          },
          kind: "cloudflare-dns-records",
          logicalId: "primary-redirect-dns-old-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [{ logicalId: "primary-redirect-dns-old-example-com" }],
          inputs: {
            fromHost: "old.example.com",
            requestUrl: "https://old.example.com/*",
            statusCode: 308,
            targetUrl: "https://example.com/${1}",
            zoneId: "zone-example",
          },
          kind: "cloudflare-redirect-rule",
          logicalId: "primary-redirect-rule-old-example-com-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
        {
          dependencies: [],
          inputs: {
            host: "app.example.com",
            name: "app.example.com",
            workerName: "formless-prod",
            zoneId: "zone-example",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "primary-custom-domain-app-example-com-instance",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
        },
      ],
    };
    const afterRouteRemoval: DeployResourceGraph = {
      ...routeResources,
      resources: routeResources.resources.filter(
        (resource) => resource.kind === "cloudflare-worker-custom-domain",
      ),
    };

    await runAlchemyDeployResourceGraph({
      factories,
      resourceGraph: routeResources,
      runner,
      stage: "personal",
    });
    const result = await runAlchemyDeployResourceGraph({
      factories,
      resourceGraph: afterRouteRemoval,
      runner,
      stage: "personal",
    });

    expect(declaredByRun).toEqual([
      [
        "primary-redirect-dns-old-example-com",
        "primary-redirect-rule-old-example-com-example-com",
        "primary-custom-domain-app-example-com-instance",
      ],
      ["primary-custom-domain-app-example-com-instance"],
    ]);
    expect(destroyed).toEqual([
      {
        appName: "formless-deployment-instance-primary",
        logicalId: "primary-redirect-dns-old-example-com",
        stage: "personal",
      },
      {
        appName: "formless-deployment-instance-primary",
        logicalId: "primary-redirect-rule-old-example-com-example-com",
        stage: "personal",
      },
    ]);
    expect(result.evidence.map((entry) => entry.logicalId)).toEqual([
      "primary-custom-domain-app-example-com-instance",
    ]);
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
