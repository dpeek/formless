import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  formatCliBrowserOpened,
  formatCliDestroyRouteProviderResources,
  formatCliDestroyedResources,
  formatCliInstanceOwnerSetupOutput,
  formatCliInstanceWorkspaceDestroyOutput,
  formatCliInstanceWorkspaceTokenAdoptOutput,
  formatCliInstanceWorkspaceTokenRotateOutput,
  formatCliOwnerSetupStatus,
} from "./cli-direct-workspace-command-formatter.ts";

describe("direct workspace command CLI formatter", () => {
  const cwd = path.resolve(path.sep, "repo");
  const workspaceRoot = path.join(cwd, "personal-sites");
  const selectedTarget = {
    alias: "instance.primary",
    url: "https://personal.dpeek.workers.dev",
  };

  it("renders token adopt and rotate output with relative paths and selected targets", () => {
    const secretPath = path.join(workspaceRoot, ".formless/instance.env");

    expect(
      formatCliInstanceWorkspaceTokenAdoptOutput(
        {
          secretPath,
          selectedTarget,
          workspaceRoot,
        },
        cwd,
      ),
    ).toBe(
      [
        "Instance workspace admin token adopted.",
        "Workspace: personal-sites.",
        "Secret state: personal-sites/.formless/instance.env.",
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
      ].join("\n"),
    );

    const rotated = formatCliInstanceWorkspaceTokenRotateOutput(
      {
        secretPath,
        selectedTarget,
        workerName: "personal",
        workspaceRoot,
      },
      cwd,
    );

    expect(rotated).toBe(
      [
        "Instance workspace admin token rotated.",
        "Workspace: personal-sites.",
        "Secret state: personal-sites/.formless/instance.env.",
        "Worker: personal.",
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
      ].join("\n"),
    );
    expect(rotated).not.toContain("local-secret");
  });

  it("renders a missing token target as none", () => {
    expect(
      formatCliInstanceWorkspaceTokenAdoptOutput(
        {
          secretPath: path.join(workspaceRoot, ".formless/instance.env"),
          workspaceRoot,
        },
        cwd,
      ),
    ).toContain("Target: <none>.");
  });

  it("renders owner setup status, setup URL, and browser-opened output", () => {
    const setupUrl = "https://personal.dpeek.workers.dev/formless/auth/setup?token=setup-token";
    const created = formatCliInstanceOwnerSetupOutput(
      {
        opened: true,
        selectedTarget,
        setupStatus: { setupComplete: false },
        setupUrl,
        workspaceRoot,
      },
      cwd,
    );

    expect(created).toBe(
      [
        "Instance owner setup URL created.",
        "Workspace: personal-sites.",
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
        "Owner setup: incomplete.",
        `Setup URL: ${setupUrl}.`,
        "Browser opened: yes.",
      ].join("\n"),
    );
    expect(formatCliBrowserOpened(false)).toBe("no");
    expect(formatCliOwnerSetupStatus({ setupComplete: true })).toBe("complete");
    expect(
      formatCliOwnerSetupStatus({
        owner: { email: "ada@example.com", name: "Ada Owner" },
        setupComplete: true,
      }),
    ).toBe("complete (Ada Owner <ada@example.com>)");
    expect(created).not.toContain("explicit-admin-token");
    expect(created).not.toContain("/setup/capability");
  });

  it("renders reported admin origin as the browser continuation URL", () => {
    const setupUrl = "https://auth.example.com/formless/auth/setup?token=setup-token";
    const created = formatCliInstanceOwnerSetupOutput(
      {
        opened: false,
        selectedTarget,
        setupStatus: {
          adminOrigin: "https://admin.example.com",
          setupComplete: false,
        },
        setupUrl,
        workspaceRoot,
      },
      cwd,
    );

    expect(created).toBe(
      [
        "Instance owner setup URL created.",
        "Workspace: personal-sites.",
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
        "Owner setup: incomplete.",
        "Admin URL: https://admin.example.com/.",
        `Setup URL: ${setupUrl}.`,
        "Browser opened: no.",
      ].join("\n"),
    );
  });

  it("omits setup URL and browser-opened output when owner setup is already complete", () => {
    const output = formatCliInstanceOwnerSetupOutput(
      {
        opened: false,
        selectedTarget,
        setupStatus: {
          owner: { name: "Ada Owner" },
          setupComplete: true,
        },
        workspaceRoot,
      },
      cwd,
    );

    expect(output).toBe(
      [
        "Instance owner setup already complete.",
        "Workspace: personal-sites.",
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
        "Owner setup: complete (Ada Owner).",
      ].join("\n"),
    );
    expect(output).not.toContain("Setup URL:");
    expect(output).not.toContain("Browser opened:");
  });

  it("renders route-provider and destroyed-resource summaries", () => {
    expect(
      formatCliDestroyRouteProviderResources({
        enabledHosts: [],
        resourceCount: 0,
        routeCount: 0,
        source: "instance:route",
      }),
    ).toBe("none");
    expect(
      formatCliDestroyRouteProviderResources({
        enabledHosts: [],
        resourceCount: 1,
        routeCount: 1,
        source: "instance:route",
      }),
    ).toBe("1 provider resource from 1 route (instance:route; no hosts)");
    expect(
      formatCliDestroyRouteProviderResources({
        enabledHosts: ["dpeek.com", "old.dpeek.com"],
        resourceCount: 2,
        routeCount: 2,
        source: "instance:route",
      }),
    ).toBe("2 provider resources from 2 routes (instance:route; dpeek.com, old.dpeek.com)");

    expect(
      formatCliDestroyedResources({
        alchemyState: "destroyed",
        customDomains: 2,
        dnsRecords: 0,
        durableObjectNamespace: "destroyed",
        mediaBucket: "destroyed",
        turnstileWidget: "destroyed",
        worker: "destroyed",
        workerAssets: "destroyed",
        workerSecrets: "destroyed",
      }),
    ).toBe(
      "Worker destroyed, Durable Object namespace destroyed, R2 media bucket destroyed, Turnstile widget destroyed, Worker assets destroyed, Worker secrets destroyed, custom domains 2, DNS records 0, Alchemy state destroyed",
    );
  });

  it("renders destroy output without exposing provider secrets", () => {
    const deploymentStateRoot = path.join(workspaceRoot, ".formless/deploy/personal");
    const output = formatCliInstanceWorkspaceDestroyOutput(
      {
        deploymentStatePath: path.join(deploymentStateRoot, "formless.instance.json"),
        deploymentStateRoot,
        destroy: {
          resources: {
            alchemyState: "destroyed",
            customDomains: 2,
            dnsRecords: 0,
            durableObjectNamespace: "destroyed",
            mediaBucket: "destroyed",
            turnstileWidget: "destroyed",
            worker: "destroyed",
            workerAssets: "destroyed",
            workerSecrets: "destroyed",
          },
        },
        localSecretPath: path.join(deploymentStateRoot, "deploy.env"),
        plan: {
          resources: {
            authority: { namespaceName: "personal-authority" },
            mediaBucket: { name: "personal-media" },
            worker: { name: "personal" },
          },
        },
        routeProviderResources: {
          enabledHosts: ["dpeek.com", "old.dpeek.com"],
          resourceCount: 2,
          routeCount: 2,
          source: "instance:route",
        },
        selectedTarget,
        workspaceRoot,
      },
      cwd,
    );

    expect(output).toBe(
      [
        "Instance workspace destroyed.",
        "Workspace: personal-sites.",
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
        "Worker: personal.",
        "Durable Object namespace: personal-authority.",
        "Media bucket: personal-media.",
        "Route provider resources: 2 provider resources from 2 routes (instance:route; dpeek.com, old.dpeek.com).",
        "Destroyed resources: Worker destroyed, Durable Object namespace destroyed, R2 media bucket destroyed, Turnstile widget destroyed, Worker assets destroyed, Worker secrets destroyed, custom domains 2, DNS records 0, Alchemy state destroyed.",
        "Ignored deploy state: personal-sites/.formless/deploy/personal.",
        "Deployment facts: personal-sites/.formless/deploy/personal/formless.instance.json.",
        "Local deploy secrets: personal-sites/.formless/deploy/personal/deploy.env.",
      ].join("\n"),
    );
    expect(output).not.toContain("state-cf-token");
    expect(output).not.toContain("alchemy-password");
    expect(output).not.toContain("FORMLESS_TURNSTILE_SECRET_KEY");
  });
});
