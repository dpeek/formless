import { describe, expect, it } from "vite-plus/test";

import {
  deployFormlessInstanceWithAlchemy,
  createFormlessInstanceState,
  DEFAULT_FORMLESS_INSTANCE_NAME,
  FORMLESS_ALCHEMY_APP_NAME,
  FORMLESS_WORKER_COMPATIBILITY_DATE,
  formatFormlessInstanceState,
  normalizeFormlessInstanceName,
  parseFormlessInstanceState,
  parseFormlessInstanceStateJson,
  planFormlessInstanceDeployment,
  runFormlessInstanceOnboarding,
  selectOnlyFormlessInstanceAccount,
  type AlchemyFormlessInstanceDeploymentAppOptions,
  type AlchemyFormlessInstanceDeploymentDependencies,
  type AlchemyFormlessInstanceDeploymentWorkerProps,
  type DeployFormlessInstanceInput,
  type SelectFormlessInstanceAccountInput,
} from "./instance-onboarding.ts";

describe("Formless instance onboarding planner", () => {
  it("plans deterministic workers.dev resources from a normalized instance name", () => {
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        name: "Personal",
        workersDevSubdomain: "dpeek",
      },
      instanceName: "Brother's Remote Instance!!",
      packageVersion: "0.1.8",
    });

    expect(plan).toEqual({
      account: {
        id: "account-123",
        name: "Personal",
        workersDevSubdomain: "dpeek",
      },
      deploymentTarget: "workers.dev",
      expectedUrl: {
        host: "brothers-remote-instance.dpeek.workers.dev",
        kind: "workers.dev",
        url: "https://brothers-remote-instance.dpeek.workers.dev",
      },
      instanceName: "brothers-remote-instance",
      packageVersion: "0.1.8",
      resources: {
        assets: {
          bindingName: "ASSETS",
        },
        authority: {
          bindingName: "FORMLESS_AUTHORITY",
          className: "FormlessAuthority",
          namespaceName: "brothers-remote-instance-authority",
        },
        mediaBucket: {
          bindingName: "FORMLESS_MEDIA",
          name: "brothers-remote-instance-media",
        },
        worker: {
          name: "brothers-remote-instance",
          workersDevEnabled: true,
        },
      },
      runtimeVars: {
        FORMLESS_DEPLOY_VERSION: "0.1.8",
        FORMLESS_RUNTIME_PROFILE: "dev",
        VITE_FORMLESS_RUNTIME_PROFILE: "dev",
      },
      secretRequirements: [
        {
          envName: "FORMLESS_ADMIN_TOKEN",
          purpose: "protect-authority-and-media-writes",
          storage: "cloudflare-worker-secret",
        },
      ],
    });
  });

  it("uses the default instance name and accepts workers.dev account facts", () => {
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        workersDevSubdomain: "DPEEK.workers.dev",
      },
      packageVersion: "0.1.8",
    });

    expect(DEFAULT_FORMLESS_INSTANCE_NAME).toBe("formless");
    expect(plan.instanceName).toBe("formless");
    expect(plan.resources.worker.name).toBe("formless");
    expect(plan.resources.mediaBucket.name).toBe("formless-media");
    expect(plan.expectedUrl.url).toBe("https://formless.dpeek.workers.dev");
  });

  it("rejects unusable deployment plan inputs before mutation", () => {
    expect(() => normalizeFormlessInstanceName(" !! ")).toThrow(
      "Formless instance name must include at least one letter or number.",
    );
    expect(() => normalizeFormlessInstanceName("a".repeat(54))).toThrow(
      "Formless instance name must produce a resource slug no longer than 53 characters.",
    );
    expect(() =>
      planFormlessInstanceDeployment({
        account: {
          id: "",
          workersDevSubdomain: "dpeek",
        },
        packageVersion: "0.1.8",
      }),
    ).toThrow("Cloudflare account id must be a non-empty string.");
    expect(() =>
      planFormlessInstanceDeployment({
        account: {
          id: "account-123",
          workersDevSubdomain: "bad.subdomain",
        },
        packageVersion: "0.1.8",
      }),
    ).toThrow("Cloudflare workers.dev subdomain must be one DNS label under workers.dev.");
    expect(() =>
      planFormlessInstanceDeployment({
        account: {
          id: "account-123",
          workersDevSubdomain: "dpeek",
        },
        packageVersion: " ",
      }),
    ).toThrow("Package version must be a non-empty string.");
  });
});

describe("Formless instance onboarding adapters", () => {
  it("discovers an account, plans deployment, and calls the deployment adapter with secrets", async () => {
    const discoveryInputs: Array<{ credentialProfile: string | null }> = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];

    const result = await runFormlessInstanceOnboarding(
      {
        credentialProfile: "personal",
        instanceName: "Brother's Remote Instance",
        open: true,
      },
      {
        accountDiscovery: {
          listAccounts: async (input) => {
            discoveryInputs.push(input);
            return [
              {
                id: "account-123",
                name: "Personal",
                workersDevSubdomain: "dpeek",
              },
            ];
          },
        },
        deploymentAdapter: {
          deploy: async (input) => {
            deployInputs.push(input);
            return { url: input.plan.expectedUrl.url };
          },
        },
        packageRoot: "/package",
        packageVersion: "0.1.8",
        randomToken: () => "generated-admin-token",
      },
    );

    expect(discoveryInputs).toEqual([{ credentialProfile: "personal" }]);
    expect(deployInputs).toEqual([
      {
        credentialProfile: "personal",
        packageRoot: "/package",
        plan: result.plan,
        secrets: {
          FORMLESS_ADMIN_TOKEN: "generated-admin-token",
        },
      },
    ]);
    expect(result).toMatchObject({
      account: {
        id: "account-123",
        name: "Personal",
        workersDevSubdomain: "dpeek",
      },
      credentialProfile: "personal",
      deployment: {
        url: "https://brothers-remote-instance.dpeek.workers.dev",
      },
      instanceName: "brothers-remote-instance",
      mode: "deployed",
      open: true,
    });
    expect(result.state).toEqual({
      version: 1,
      kind: "formless-instance",
      instanceName: "brothers-remote-instance",
      accountId: "account-123",
      accountName: "Personal",
      credentialProfile: "personal",
      workerName: "brothers-remote-instance",
      workersDevUrl: "https://brothers-remote-instance.dpeek.workers.dev",
      mediaBucketName: "brothers-remote-instance-media",
      authorityNamespaceName: "brothers-remote-instance-authority",
      deploymentTarget: "workers.dev",
      deployedPackageVersion: "0.1.8",
    });
  });

  it("requires account selection before deployment mutation", async () => {
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const deploy = async (input: DeployFormlessInstanceInput) => {
      deployInputs.push(input);
      return { url: input.plan.expectedUrl.url };
    };

    await expect(
      runFormlessInstanceOnboarding(
        {},
        {
          accountDiscovery: {
            listAccounts: async () => [],
          },
          deploymentAdapter: { deploy },
          packageRoot: "/package",
          packageVersion: "0.1.8",
          randomToken: () => "generated-admin-token",
        },
      ),
    ).rejects.toThrow("No Cloudflare accounts were found for the selected credentials.");
    expect(deployInputs).toEqual([]);

    await expect(
      runFormlessInstanceOnboarding(
        {},
        {
          accountDiscovery: {
            listAccounts: async () => [
              {
                id: "account-a",
                workersDevSubdomain: "alpha",
              },
              {
                id: "account-b",
                workersDevSubdomain: "beta",
              },
            ],
          },
          deploymentAdapter: { deploy },
          packageRoot: "/package",
          packageVersion: "0.1.8",
          randomToken: () => "generated-admin-token",
        },
      ),
    ).rejects.toThrow(
      "Multiple Cloudflare accounts were found; account selection is required before deployment.",
    );
    expect(deployInputs).toEqual([]);
  });

  it("allows a fake account selector to choose among discovered accounts", async () => {
    const selectionInputs: SelectFormlessInstanceAccountInput[] = [];
    const result = await runFormlessInstanceOnboarding(
      { instanceName: "remote" },
      {
        accountDiscovery: {
          listAccounts: async () => [
            {
              id: "account-a",
              name: "Alpha",
              workersDevSubdomain: "alpha",
            },
            {
              id: "account-b",
              name: "Beta",
              workersDevSubdomain: "beta",
            },
          ],
        },
        deploymentAdapter: {
          deploy: async (input) => ({ url: input.plan.expectedUrl.url }),
        },
        packageRoot: "/package",
        packageVersion: "0.1.8",
        randomToken: () => "generated-admin-token",
        selectAccount: (input) => {
          selectionInputs.push(input);
          return input.accounts[1] as (typeof input.accounts)[number];
        },
      },
    );

    expect(selectionInputs).toEqual([
      {
        accounts: [
          {
            id: "account-a",
            name: "Alpha",
            workersDevSubdomain: "alpha",
          },
          {
            id: "account-b",
            name: "Beta",
            workersDevSubdomain: "beta",
          },
        ],
        credentialProfile: null,
      },
    ]);
    expect(result.account).toEqual({
      id: "account-b",
      name: "Beta",
      workersDevSubdomain: "beta",
    });
    expect(result.deployment.url).toBe("https://remote.beta.workers.dev");
    expect(
      selectOnlyFormlessInstanceAccount({ accounts: [result.account], credentialProfile: null }),
    ).toEqual(result.account);
  });
});

describe("Alchemy Formless instance deployment", () => {
  it("declares one workers.dev Worker with assets, R2, Durable Object storage, vars, and secret binding", async () => {
    const apps: Array<{
      name: typeof FORMLESS_ALCHEMY_APP_NAME;
      options: AlchemyFormlessInstanceDeploymentAppOptions;
    }> = [];
    const buckets: Array<{
      id: string;
      props: unknown;
    }> = [];
    const namespaces: Array<{
      id: string;
      props: unknown;
    }> = [];
    const secrets: string[] = [];
    const workers: Array<{
      id: string;
      props: AlchemyFormlessInstanceDeploymentWorkerProps;
    }> = [];
    const mediaBucket = { type: "r2_bucket", name: "brother-instance-media" };
    const authorityNamespace = { className: "FormlessAuthority", type: "durable_object_namespace" };
    const adminSecret = { name: "FORMLESS_ADMIN_TOKEN", type: "secret" };
    let finalized = 0;
    const dependencies: AlchemyFormlessInstanceDeploymentDependencies = {
      createApp: async (name, options) => {
        apps.push({ name, options });
        return {
          finalize: async () => {
            finalized += 1;
          },
        };
      },
      createDurableObjectNamespace: (id, props) => {
        namespaces.push({ id, props });
        return authorityNamespace;
      },
      createR2Bucket: async (id, props) => {
        buckets.push({ id, props });
        return mediaBucket;
      },
      createSecret: (value) => {
        secrets.push(value);
        return adminSecret;
      },
      deployViteWorker: async (id, props) => {
        workers.push({ id, props });
        return { url: props.name ? "https://brother-instance.dpeek.workers.dev" : null };
      },
    };
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        name: "Personal",
        workersDevSubdomain: "dpeek",
      },
      instanceName: "Brother Instance",
      packageVersion: "0.1.8",
    });

    const result = await deployFormlessInstanceWithAlchemy(
      {
        credentialProfile: "personal",
        packageRoot: "/package",
        plan,
        secrets: {
          FORMLESS_ADMIN_TOKEN: "admin-secret",
        },
      },
      dependencies,
    );

    expect(result).toEqual({ url: "https://brother-instance.dpeek.workers.dev" });
    expect(apps).toEqual([
      {
        name: "formless-instance",
        options: {
          phase: "up",
          profile: "personal",
          rootDir: "/package",
          stage: "brother-instance",
        },
      },
    ]);
    expect(buckets).toEqual([
      {
        id: "media",
        props: {
          accountId: "account-123",
          name: "brother-instance-media",
          profile: "personal",
        },
      },
    ]);
    expect(namespaces).toEqual([
      {
        id: "authority",
        props: {
          className: "FormlessAuthority",
          sqlite: true,
        },
      },
    ]);
    expect(secrets).toEqual(["admin-secret"]);
    expect(workers).toEqual([
      {
        id: "worker",
        props: {
          accountId: "account-123",
          assets: {
            directory: "dist/client",
            not_found_handling: "single-page-application",
            run_worker_first: [
              "/*",
              "!/pages",
              "!/pages/*",
              "!/tasks",
              "!/tasks/*",
              "!/estii",
              "!/estii/*",
              "!/site",
              "!/site/*",
              "!/schema",
              "!/assets/*",
              "!/src/*",
              "!/@vite/*",
              "!/@react-refresh",
            ],
          },
          bindings: {
            FORMLESS_ADMIN_TOKEN: adminSecret,
            FORMLESS_AUTHORITY: authorityNamespace,
            FORMLESS_DEPLOY_VERSION: "0.1.8",
            FORMLESS_MEDIA: mediaBucket,
            FORMLESS_RUNTIME_PROFILE: "dev",
          },
          build: {
            command: "bun run build",
            env: {
              FORMLESS_DEPLOY_VERSION: "0.1.8",
              FORMLESS_RUNTIME_PROFILE: "dev",
              VITE_FORMLESS_RUNTIME_PROFILE: "dev",
            },
          },
          compatibilityDate: FORMLESS_WORKER_COMPATIBILITY_DATE,
          cwd: "/package",
          entrypoint: "src/worker/index.ts",
          name: "brother-instance",
          previewSubdomains: false,
          profile: "personal",
          url: true,
        },
      },
    ]);
    expect(finalized).toBe(1);
  });

  it("rejects missing package roots or admin tokens before Alchemy mutation", async () => {
    const calls: string[] = [];
    const dependencies: AlchemyFormlessInstanceDeploymentDependencies = {
      createApp: async () => {
        calls.push("createApp");
        return {
          finalize: async () => {
            calls.push("finalize");
          },
        };
      },
      createDurableObjectNamespace: () => {
        calls.push("createDurableObjectNamespace");
        return {};
      },
      createR2Bucket: async () => {
        calls.push("createR2Bucket");
        return {};
      },
      createSecret: () => {
        calls.push("createSecret");
        return {};
      },
      deployViteWorker: async () => {
        calls.push("deployViteWorker");
        return {};
      },
    };
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        workersDevSubdomain: "dpeek",
      },
      packageVersion: "0.1.8",
    });

    await expect(
      deployFormlessInstanceWithAlchemy(
        {
          credentialProfile: null,
          packageRoot: " ",
          plan,
          secrets: {
            FORMLESS_ADMIN_TOKEN: "admin-secret",
          },
        },
        dependencies,
      ),
    ).rejects.toThrow("Formless package root must be a non-empty string.");
    await expect(
      deployFormlessInstanceWithAlchemy(
        {
          credentialProfile: null,
          packageRoot: "/package",
          plan,
          secrets: {
            FORMLESS_ADMIN_TOKEN: " ",
          },
        },
        dependencies,
      ),
    ).rejects.toThrow("Formless admin token must be a non-empty string.");
    expect(calls).toEqual([]);
  });
});

describe("Formless instance state", () => {
  it("creates, parses, and formats non-secret deployment state from a plan", () => {
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        name: "Personal",
        workersDevSubdomain: "dpeek",
      },
      instanceName: "brother-instance",
      packageVersion: "0.1.8",
    });
    const state = createFormlessInstanceState({
      credentialProfile: "personal",
      plan,
    });

    expect(state).toEqual({
      version: 1,
      kind: "formless-instance",
      instanceName: "brother-instance",
      accountId: "account-123",
      accountName: "Personal",
      credentialProfile: "personal",
      workerName: "brother-instance",
      workersDevUrl: "https://brother-instance.dpeek.workers.dev",
      mediaBucketName: "brother-instance-media",
      authorityNamespaceName: "brother-instance-authority",
      deploymentTarget: "workers.dev",
      deployedPackageVersion: "0.1.8",
    });
    expect(formatFormlessInstanceState(state)).toBe(
      [
        "{",
        '  "version": 1,',
        '  "kind": "formless-instance",',
        '  "instanceName": "brother-instance",',
        '  "accountId": "account-123",',
        '  "accountName": "Personal",',
        '  "credentialProfile": "personal",',
        '  "workerName": "brother-instance",',
        '  "workersDevUrl": "https://brother-instance.dpeek.workers.dev",',
        '  "mediaBucketName": "brother-instance-media",',
        '  "authorityNamespaceName": "brother-instance-authority",',
        '  "deploymentTarget": "workers.dev",',
        '  "deployedPackageVersion": "0.1.8"',
        "}",
        "",
      ].join("\n"),
    );
    expect(parseFormlessInstanceStateJson(formatFormlessInstanceState(state))).toEqual(state);
  });

  it("rejects secret fields and non-workers.dev state", () => {
    expect(() =>
      parseFormlessInstanceState({
        version: 1,
        kind: "formless-instance",
        instanceName: "brother-instance",
        accountId: "account-123",
        adminToken: "secret",
        workerName: "brother-instance",
        workersDevUrl: "https://brother-instance.dpeek.workers.dev",
        mediaBucketName: "brother-instance-media",
        authorityNamespaceName: "brother-instance-authority",
        deploymentTarget: "workers.dev",
      }),
    ).toThrow(
      'formless.instance.json must not store secret field "formless.instance.json.adminToken".',
    );
    expect(() =>
      parseFormlessInstanceState({
        version: 1,
        kind: "formless-instance",
        instanceName: "brother-instance",
        accountId: "account-123",
        workerName: "brother-instance",
        workersDevUrl: "https://brother-instance.example.com",
        mediaBucketName: "brother-instance-media",
        authorityNamespaceName: "brother-instance-authority",
        deploymentTarget: "workers.dev",
      }),
    ).toThrow("formless.instance.json workersDevUrl must be a workers.dev origin URL.");
  });
});
