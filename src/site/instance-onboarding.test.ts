import { describe, expect, it } from "vite-plus/test";
import type { DeployResourceGraph } from "@dpeek/formless-deploy";

import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import {
  checkFormlessInstanceDeployMetadata,
  createFormlessInstanceOwnerSetupCapability,
  deployFormlessInstanceWithAlchemy,
  destroyFormlessInstanceWithAlchemy,
  createFormlessInstanceState,
  DEFAULT_FORMLESS_INSTANCE_NAME,
  ensureFormlessInstanceLocalSecretEnv,
  FORMLESS_ALCHEMY_APP_NAME,
  FORMLESS_INSTANCE_LOCAL_ENV_FILE,
  FORMLESS_OWNER_SETUP_ROUTE_PATH,
  FORMLESS_WORKER_COMPATIBILITY_DATE,
  formatFormlessInstanceState,
  formatFormlessOwnerSetupUrl,
  listFormlessInstanceAccountsWithAlchemy,
  normalizeFormlessInstanceName,
  parseFormlessInstanceState,
  parseFormlessInstanceStateJson,
  planFormlessInstanceDeployment,
  runFormlessInstanceOnboarding,
  selectOnlyFormlessInstanceAccount,
  writeFormlessInstanceState,
  type AlchemyFormlessInstanceDeploymentAppOptions,
  type AlchemyFormlessInstanceDeploymentDependencies,
  type AlchemyFormlessInstanceDeploymentWorkerProps,
  type CheckFormlessInstanceDeployMetadataInput,
  type CreateFormlessInstanceOwnerSetupCapabilityInput,
  type DeployFormlessInstanceInput,
  type DestroyFormlessInstanceInput,
  type EnsureFormlessInstanceLocalSecretEnvDependencies,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
  type SelectFormlessInstanceAccountInput,
  type WriteFormlessInstanceStateInput,
} from "./instance-onboarding.ts";

const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

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
      migrationPolicy: "new",
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
        FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
        FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "brothers-remote-instance",
        FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "brothers-remote-instance",
        FORMLESS_INSTANCE_AUTH_ORIGIN: "https://brothers-remote-instance.dpeek.workers.dev",
        FORMLESS_RUNTIME_PROFILE: "instance",
        VITE_FORMLESS_RUNTIME_PROFILE: "instance",
      },
      secretRequirements: [
        {
          envName: "ALCHEMY_PASSWORD",
          purpose: "encrypt-domain-provider-alchemy-state",
          storage: "cloudflare-worker-secret",
        },
        {
          envName: "CLOUDFLARE_API_TOKEN",
          purpose: "apply-cloudflare-domain-provider-resources",
          storage: "cloudflare-worker-secret",
        },
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
  it("discovers the Alchemy-resolved Cloudflare account and workers.dev subdomain", async () => {
    const requests: string[] = [];
    const accounts = await listFormlessInstanceAccountsWithAlchemy(
      { credentialProfile: "personal" },
      {
        createCloudflareApi: async (options) => {
          expect(options).toEqual({ profile: "personal" });

          return {
            accountId: "account-123",
            get: async (requestPath) => {
              requests.push(requestPath);

              if (requestPath === "/accounts/account-123/workers/subdomain") {
                return Response.json({
                  success: true,
                  result: {
                    subdomain: "dpeek",
                  },
                });
              }

              return Response.json({ success: false }, { status: 404 });
            },
          };
        },
      },
    );

    expect(requests).toEqual(["/accounts/account-123/workers/subdomain"]);
    expect(accounts).toEqual([
      {
        id: "account-123",
        workersDevSubdomain: "dpeek",
      },
    ]);
  });

  it("falls back to listing Cloudflare accounts when Alchemy has no resolved account id", async () => {
    const requests: string[] = [];
    const accounts = await listFormlessInstanceAccountsWithAlchemy(
      { credentialProfile: "personal" },
      {
        createCloudflareApi: async (options) => {
          expect(options).toEqual({ profile: "personal" });

          return {
            get: async (requestPath) => {
              requests.push(requestPath);

              if (requestPath === "/accounts") {
                return Response.json({
                  success: true,
                  result: [
                    {
                      id: "account-123",
                      name: "Personal",
                    },
                  ],
                });
              }

              if (requestPath === "/accounts/account-123/workers/subdomain") {
                return Response.json({
                  success: true,
                  result: {
                    subdomain: "dpeek",
                  },
                });
              }

              return Response.json({ success: false }, { status: 404 });
            },
          };
        },
      },
    );

    expect(requests).toEqual(["/accounts", "/accounts/account-123/workers/subdomain"]);
    expect(accounts).toEqual([
      {
        id: "account-123",
        name: "Personal",
        workersDevSubdomain: "dpeek",
      },
    ]);
  });

  it("explains Cloudflare authentication failures for the Alchemy-resolved account", async () => {
    await expect(
      listFormlessInstanceAccountsWithAlchemy(
        { credentialProfile: "personal" },
        {
          createCloudflareApi: async () => ({
            accountId: "account-123",
            get: async () =>
              Response.json(
                {
                  success: false,
                  errors: [{ message: "Authentication error" }],
                  result: null,
                },
                { status: 403 },
              ),
          }),
        },
      ),
    ).rejects.toThrow(
      "Re-run `alchemy login cloudflare -p personal` and `alchemy configure -p personal`",
    );
  });

  it("discovers an account, plans deployment, and calls the deployment adapter with secrets", async () => {
    const discoveryInputs: Array<{ credentialProfile: string | null }> = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const healthInputs: CheckFormlessInstanceDeployMetadataInput[] = [];
    const openedUrls: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
    const setupUrl = formatFormlessOwnerSetupUrl({
      deploymentUrl: "https://brothers-remote-instance.dpeek.workers.dev",
      setupToken,
    });

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
        healthCheck: {
          check: async (input) => {
            healthInputs.push(input);
            return fakeHealthyDeployment(input);
          },
        },
        localSecretEnv: fakeLocalSecretEnv(),
        openBrowser: async (url) => {
          openedUrls.push(url);
        },
        packageRoot: "/package",
        packageVersion: "0.1.8",
        randomToken: randomTokenSequence("generated-admin-token", setupToken),
        stateRoot: "/workspace",
        stateWriter: fakeStateWriter(stateWrites),
        setupCapability: fakeSetupCapability(setupInputs),
      },
    );

    expect(discoveryInputs).toEqual([{ credentialProfile: "personal" }]);
    expect(deployInputs).toEqual([
      {
        credentialProfile: "personal",
        packageRoot: "/package",
        plan: result.plan,
        secrets: {
          ALCHEMY_PASSWORD: "alchemy-password",
          FORMLESS_ADMIN_TOKEN: "generated-admin-token",
        },
        stateRoot: "/workspace/instances/brothers-remote-instance",
      },
    ]);
    expect(healthInputs).toEqual([
      {
        expectedVersion: "0.1.8",
        url: "https://brothers-remote-instance.dpeek.workers.dev",
      },
    ]);
    expect(setupInputs).toEqual([
      {
        adminToken: "generated-admin-token",
        deploymentUrl: "https://brothers-remote-instance.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(openedUrls).toEqual([setupUrl]);
    expect(stateWrites).toEqual([
      {
        root: "/workspace/instances/brothers-remote-instance",
        state: result.state,
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
      healthCheck: {
        version: "0.1.8",
      },
      instanceName: "brothers-remote-instance",
      mode: "deployed",
      open: true,
      ownerSetup: {
        url: setupUrl,
      },
      stateWrite: {
        path: "/workspace/instances/brothers-remote-instance/formless.instance.json",
      },
    });
    expect(result.ownerSetup.capability).toEqual({
      capabilityCreated: true,
      endpointUrl:
        "https://brothers-remote-instance.dpeek.workers.dev/api/formless/setup/capability",
      setupComplete: false,
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
    expect(JSON.stringify(stateWrites)).not.toContain("generated-admin-token");
    expect(JSON.stringify(stateWrites)).not.toContain(setupToken);
  });

  it("requires account selection before deployment mutation", async () => {
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
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
          healthCheck: {
            check: fakeHealthyDeployment,
          },
          localSecretEnv: fakeLocalSecretEnv(),
          openBrowser: async () => {},
          packageRoot: "/package",
          packageVersion: "0.1.8",
          randomToken: () => "generated-admin-token",
          stateRoot: "/workspace",
          stateWriter: fakeStateWriter(stateWrites),
          setupCapability: fakeSetupCapability(),
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
          healthCheck: {
            check: fakeHealthyDeployment,
          },
          localSecretEnv: fakeLocalSecretEnv(),
          openBrowser: async () => {},
          packageRoot: "/package",
          packageVersion: "0.1.8",
          randomToken: () => "generated-admin-token",
          stateRoot: "/workspace",
          stateWriter: fakeStateWriter(stateWrites),
          setupCapability: fakeSetupCapability(),
        },
      ),
    ).rejects.toThrow(
      "Multiple Cloudflare accounts were found; account selection is required before deployment.",
    );
    expect(deployInputs).toEqual([]);
    expect(stateWrites).toEqual([]);
  });

  it("writes state only after deploy metadata health check succeeds", async () => {
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
    const openedUrls: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];

    await expect(
      runFormlessInstanceOnboarding(
        {
          instanceName: "remote",
          open: true,
        },
        {
          accountDiscovery: {
            listAccounts: async () => [
              {
                id: "account-123",
                workersDevSubdomain: "dpeek",
              },
            ],
          },
          deploymentAdapter: {
            deploy: async (input) => ({ url: input.plan.expectedUrl.url }),
          },
          healthCheck: {
            check: async () => {
              throw new Error("deploy metadata stale");
            },
          },
          localSecretEnv: fakeLocalSecretEnv(),
          openBrowser: async (url) => {
            openedUrls.push(url);
          },
          packageRoot: "/package",
          packageVersion: "0.1.8",
          randomToken: randomTokenSequence("generated-admin-token", setupToken),
          stateRoot: "/workspace",
          stateWriter: fakeStateWriter(stateWrites),
          setupCapability: fakeSetupCapability(setupInputs),
        },
      ),
    ).rejects.toThrow("deploy metadata stale");

    expect(stateWrites).toEqual([]);
    expect(openedUrls).toEqual([]);
    expect(setupInputs).toEqual([]);
  });

  it("writes state only after owner setup capability creation succeeds", async () => {
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
    const openedUrls: string[] = [];

    await expect(
      runFormlessInstanceOnboarding(
        {
          instanceName: "remote",
          open: true,
        },
        {
          accountDiscovery: {
            listAccounts: async () => [
              {
                id: "account-123",
                workersDevSubdomain: "dpeek",
              },
            ],
          },
          deploymentAdapter: {
            deploy: async (input) => ({ url: input.plan.expectedUrl.url }),
          },
          healthCheck: {
            check: fakeHealthyDeployment,
          },
          localSecretEnv: fakeLocalSecretEnv(),
          openBrowser: async (url) => {
            openedUrls.push(url);
          },
          packageRoot: "/package",
          packageVersion: "0.1.8",
          randomToken: randomTokenSequence("generated-admin-token", setupToken),
          stateRoot: "/workspace",
          stateWriter: fakeStateWriter(stateWrites),
          setupCapability: {
            create: async () => {
              throw new Error("setup capability failed");
            },
          },
        },
      ),
    ).rejects.toThrow("setup capability failed");

    expect(stateWrites).toEqual([]);
    expect(openedUrls).toEqual([]);
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
        healthCheck: {
          check: fakeHealthyDeployment,
        },
        localSecretEnv: fakeLocalSecretEnv(),
        openBrowser: async () => {},
        packageRoot: "/package",
        packageVersion: "0.1.8",
        randomToken: randomTokenSequence("generated-admin-token", setupToken),
        selectAccount: (input) => {
          selectionInputs.push(input);
          return input.accounts[1] as (typeof input.accounts)[number];
        },
        stateRoot: "/workspace",
        stateWriter: fakeStateWriter(),
        setupCapability: fakeSetupCapability(),
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

describe("Formless instance owner setup capability", () => {
  it("creates a remote setup capability with the generated setup token and admin bearer", async () => {
    const requests: Array<{
      body: string;
      headers: Record<string, string>;
      method: string;
      url: string;
    }> = [];
    const result = await createFormlessInstanceOwnerSetupCapability(
      {
        adminToken: "admin-secret",
        deploymentUrl: "https://brother-instance.dpeek.workers.dev",
        setupToken,
      },
      {
        fetch: async (url, init) => {
          const body = typeof init?.body === "string" ? init.body : "";

          requests.push({
            body,
            headers: normalizeHeaders(init?.headers),
            method: init?.method ?? "GET",
            url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
          });

          return Response.json({
            capabilityCreated: true,
            expiresAt: "2026-05-21T05:00:00.000Z",
            setupComplete: false,
          });
        },
      },
    );

    expect(requests).toEqual([
      {
        body: JSON.stringify({ setupToken }),
        headers: {
          accept: "application/json",
          authorization: "Bearer admin-secret",
          "content-type": "application/json",
        },
        method: "POST",
        url: "https://brother-instance.dpeek.workers.dev/api/formless/setup/capability",
      },
    ]);
    expect(result).toEqual({
      capabilityCreated: true,
      endpointUrl: "https://brother-instance.dpeek.workers.dev/api/formless/setup/capability",
      expiresAt: "2026-05-21T05:00:00.000Z",
      setupComplete: false,
    });
    expect(
      formatFormlessOwnerSetupUrl({
        deploymentUrl: "https://brother-instance.dpeek.workers.dev",
        setupToken,
      }),
    ).toBe(
      `https://brother-instance.dpeek.workers.dev${FORMLESS_OWNER_SETUP_ROUTE_PATH}?token=${setupToken}`,
    );
  });

  it("rejects failed or malformed setup capability responses", async () => {
    await expect(
      createFormlessInstanceOwnerSetupCapability(
        {
          adminToken: "admin-secret",
          deploymentUrl: "https://brother-instance.dpeek.workers.dev",
          setupToken,
        },
        {
          fetch: async () => new Response("unauthorized", { status: 401 }),
        },
      ),
    ).rejects.toThrow("HTTP 401 unauthorized");

    await expect(
      createFormlessInstanceOwnerSetupCapability(
        {
          adminToken: "admin-secret",
          deploymentUrl: "https://brother-instance.dpeek.workers.dev",
          setupToken,
        },
        {
          fetch: async () => Response.json({ setupComplete: false }),
        },
      ),
    ).rejects.toThrow("response did not confirm setup capability creation");
  });
});

describe("Formless instance deploy metadata health check", () => {
  it("verifies no-store deploy metadata for the deployed package version", async () => {
    const requests: string[] = [];
    const result = await checkFormlessInstanceDeployMetadata(
      {
        expectedVersion: "0.1.8",
        url: "https://brother-instance.dpeek.workers.dev",
      },
      {
        fetch: async (url, init) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

          requests.push(`${init?.method ?? "GET"} ${requestUrl}`);
          return Response.json(
            { version: "0.1.8" },
            {
              headers: {
                "Cache-Control": "no-store",
              },
            },
          );
        },
      },
    );

    expect(requests).toEqual([
      "GET https://brother-instance.dpeek.workers.dev/api/formless/deploy",
    ]);
    expect(result).toEqual({
      cacheControl: "no-store",
      metadataUrl: "https://brother-instance.dpeek.workers.dev/api/formless/deploy",
      packageVersion: "0.1.8",
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      url: "https://brother-instance.dpeek.workers.dev",
      version: "0.1.8",
    });
  });

  it("rejects unreachable, stale, and cacheable deploy metadata", async () => {
    await expect(
      checkFormlessInstanceDeployMetadata(
        {
          expectedVersion: "0.1.8",
          url: "https://brother-instance.dpeek.workers.dev",
        },
        {
          fetch: async () => new Response("missing", { status: 404 }),
        },
      ),
    ).rejects.toThrow("HTTP 404 missing");

    await expect(
      checkFormlessInstanceDeployMetadata(
        {
          expectedVersion: "0.1.8",
          url: "https://brother-instance.dpeek.workers.dev",
        },
        {
          fetch: async () =>
            Response.json(
              { version: "0.1.7" },
              {
                headers: {
                  "Cache-Control": "no-store",
                },
              },
            ),
        },
      ),
    ).rejects.toThrow("expected deploy version 0.1.8, got 0.1.7");

    await expect(
      checkFormlessInstanceDeployMetadata(
        {
          expectedVersion: "0.1.8",
          url: "https://brother-instance.dpeek.workers.dev",
        },
        {
          fetch: async () => Response.json({ version: "0.1.8" }),
        },
      ),
    ).rejects.toThrow("deploy metadata must send Cache-Control: no-store");
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
          ALCHEMY_PASSWORD: "alchemy-password",
          FORMLESS_ADMIN_TOKEN: "admin-secret",
        },
        stateRoot: "/state",
      },
      dependencies,
    );

    expect(result).toEqual({ url: "https://brother-instance.dpeek.workers.dev" });
    expect(apps).toEqual([
      {
        name: "formless-instance",
        options: {
          phase: "up",
          password: "alchemy-password",
          profile: "personal",
          rootDir: "/state",
          stage: "brother-instance",
        },
      },
    ]);
    expect(buckets).toEqual([
      {
        id: "media",
        props: {
          adopt: false,
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
    expect(secrets).toEqual(["alchemy-password", "admin-secret"]);
    expect(workers).toEqual([
      {
        id: "worker",
        props: {
          adopt: false,
          accountId: "account-123",
          assets: {
            directory: "dist/client",
            not_found_handling: "single-page-application",
            run_worker_first: ["/*", "!/assets/*", "!/src/*", "!/@vite/*", "!/@react-refresh"],
          },
          bindings: {
            ALCHEMY_PASSWORD: adminSecret,
            FORMLESS_ADMIN_TOKEN: adminSecret,
            FORMLESS_AUTHORITY: authorityNamespace,
            FORMLESS_DEPLOY_VERSION: "0.1.8",
            FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
            FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "brother-instance",
            FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "brother-instance",
            FORMLESS_INSTANCE_AUTH_ORIGIN: "https://brother-instance.dpeek.workers.dev",
            FORMLESS_MEDIA: mediaBucket,
            FORMLESS_RUNTIME_PROFILE: "instance",
          },
          build: {
            command: "bun run build",
            env: {
              FORMLESS_DEPLOY_VERSION: "0.1.8",
              FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
              FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "brother-instance",
              FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "brother-instance",
              FORMLESS_INSTANCE_AUTH_ORIGIN: "https://brother-instance.dpeek.workers.dev",
              FORMLESS_RUNTIME_PROFILE: "instance",
              VITE_FORMLESS_RUNTIME_PROFILE: "instance",
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

  it("declares route-derived DNS, redirect, and custom-domain resources during deploy", async () => {
    const events: string[] = [];
    const routeResourceCalls: Array<{ id: string; kind: string; props: unknown }> = [];
    const secrets: string[] = [];
    let finalized = 0;
    const dependencies: AlchemyFormlessInstanceDeploymentDependencies = {
      createApp: async () => {
        events.push("app");

        return {
          finalize: async () => {
            events.push("finalize");
            finalized += 1;
          },
        };
      },
      createCustomDomain: async (id, props) => {
        events.push("custom-domain");
        routeResourceCalls.push({ id, kind: "CustomDomain", props });

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: "custom-domain-output",
          updatedAt: 2,
        } as Awaited<
          ReturnType<
            NonNullable<AlchemyFormlessInstanceDeploymentDependencies["createCustomDomain"]>
          >
        >;
      },
      createDurableObjectNamespace: () => {
        events.push("durable-object");

        return { type: "durable-object-namespace" };
      },
      createDnsRecords: async (id, props) => {
        events.push("dns-records");
        routeResourceCalls.push({ id, kind: "DnsRecords", props });

        return {
          records: props.records.map((record, index) => ({
            ...record,
            id: `dns-record-${index}`,
          })),
          zoneId: props.zoneId,
        } as Awaited<
          ReturnType<NonNullable<AlchemyFormlessInstanceDeploymentDependencies["createDnsRecords"]>>
        >;
      },
      createR2Bucket: async () => {
        events.push("r2");

        return { type: "r2-bucket" };
      },
      createRedirectRule: async (id, props) => {
        events.push("redirect-rule");
        routeResourceCalls.push({ id, kind: "RedirectRule", props });

        return {
          description: props.description ?? "redirect",
          enabled: true,
          lastUpdated: "2026-06-04T00:00:00.000Z",
          preserveQueryString: props.preserveQueryString ?? true,
          ruleId: "redirect-rule-output",
          rulesetId: "redirect-ruleset-output",
          statusCode: props.statusCode ?? 301,
          targetUrl: props.targetUrl,
          zoneId: typeof props.zone === "string" ? props.zone : props.zone.id,
        } as Awaited<
          ReturnType<
            NonNullable<AlchemyFormlessInstanceDeploymentDependencies["createRedirectRule"]>
          >
        >;
      },
      createSecret: (value) => {
        secrets.push(value);

        return { index: secrets.length, type: "secret" };
      },
      deployViteWorker: async () => {
        events.push("worker");

        return { url: "https://brother-instance.dpeek.workers.dev" };
      },
    };
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        workersDevSubdomain: "dpeek",
      },
      instanceName: "brother-instance",
      packageVersion: "0.1.8",
    });
    const deploymentResourceGraph: DeployResourceGraph = {
      targetId: "instance.brother-instance",
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
            zoneId: "zone-1",
          },
          kind: "cloudflare-dns-records",
          logicalId: "brother-instance-redirect-dns-old-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.brother-instance",
        },
        {
          dependencies: [{ logicalId: "brother-instance-redirect-dns-old-example-com" }],
          inputs: {
            fromHost: "old.example.com",
            requestUrl: "https://old.example.com/*",
            statusCode: 308,
            targetUrl: "https://app.example.com/${1}",
            zoneId: "zone-1",
          },
          kind: "cloudflare-redirect-rule",
          logicalId: "brother-instance-redirect-rule-old-example-com-app-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.brother-instance",
        },
        {
          dependencies: [],
          inputs: {
            host: "app.example.com",
            name: "app.example.com",
            workerName: plan.resources.worker.name,
            zoneId: "zone-1",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "brother-instance-custom-domain-app-example-com-instance",
          providerFamily: "cloudflare",
          targetId: "instance.brother-instance",
        },
      ],
    };

    const result = await deployFormlessInstanceWithAlchemy(
      {
        credentialProfile: "personal",
        deploymentResourceGraph,
        packageRoot: "/package",
        plan,
        secrets: {
          ALCHEMY_PASSWORD: "alchemy-password",
          CLOUDFLARE_API_TOKEN: "cf-token",
          FORMLESS_ADMIN_TOKEN: "admin-secret",
        },
        stateRoot: "/workspace/.formless/deploy/brother-instance",
      },
      dependencies,
    );

    expect(routeResourceCalls.map((call) => [call.kind, call.id])).toEqual([
      ["DnsRecords", "brother-instance-redirect-dns-old-example-com"],
      ["RedirectRule", "brother-instance-redirect-rule-old-example-com-app-example-com"],
      ["CustomDomain", "brother-instance-custom-domain-app-example-com-instance"],
    ]);
    expect(routeResourceCalls[0]?.props).toMatchObject({
      apiToken: { index: 4, type: "secret" },
      zoneId: "zone-1",
    });
    expect(routeResourceCalls[1]?.props).toMatchObject({
      apiToken: { index: 4, type: "secret" },
      statusCode: 308,
      zone: "zone-1",
    });
    expect(routeResourceCalls[2]?.props).toMatchObject({
      apiToken: { index: 4, type: "secret" },
      name: "app.example.com",
      workerName: "brother-instance",
      zoneId: "zone-1",
    });
    expect(result.resourceEvidence?.map((entry) => [entry.kind, entry.logicalId])).toEqual([
      ["cloudflare-dns-records", "brother-instance-redirect-dns-old-example-com"],
      [
        "cloudflare-redirect-rule",
        "brother-instance-redirect-rule-old-example-com-app-example-com",
      ],
      [
        "cloudflare-worker-custom-domain",
        "brother-instance-custom-domain-app-example-com-instance",
      ],
    ]);
    expect(result.resourceEvidence).toHaveLength(3);
    expect(JSON.stringify(routeResourceCalls)).not.toContain("cf-token");
    expect(events).toEqual([
      "app",
      "r2",
      "durable-object",
      "worker",
      "dns-records",
      "redirect-rule",
      "custom-domain",
      "finalize",
    ]);
    expect(finalized).toBe(1);
  });

  it("marks Worker and media resources for adoption when deploying an existing instance", async () => {
    const buckets: Array<{ props: unknown }> = [];
    const workers: Array<{ props: AlchemyFormlessInstanceDeploymentWorkerProps }> = [];
    const dependencies: AlchemyFormlessInstanceDeploymentDependencies = {
      createApp: async () => ({
        finalize: async () => {},
      }),
      createDurableObjectNamespace: () => ({}),
      createR2Bucket: async (_id, props) => {
        buckets.push({ props });
        return {};
      },
      createSecret: () => ({}),
      deployViteWorker: async (_id, props) => {
        workers.push({ props });
        return { url: props.name ? "https://brother-instance.dpeek.workers.dev" : null };
      },
    };
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        workersDevSubdomain: "dpeek",
      },
      instanceName: "brother-instance",
      mediaBucketName: "existing-media",
      migrationPolicy: "existing",
      packageVersion: "0.1.8",
    });

    await deployFormlessInstanceWithAlchemy(
      {
        credentialProfile: null,
        packageRoot: "/package",
        plan,
        secrets: {
          ALCHEMY_PASSWORD: "alchemy-password",
          FORMLESS_ADMIN_TOKEN: "admin-secret",
        },
        stateRoot: "/state",
      },
      dependencies,
    );

    expect(plan).toMatchObject({
      migrationPolicy: "existing",
      resources: {
        mediaBucket: {
          name: "existing-media",
        },
      },
      runtimeVars: {
        FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
        FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "brother-instance",
        FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "brother-instance",
        FORMLESS_INSTANCE_AUTH_ORIGIN: "https://brother-instance.dpeek.workers.dev",
        FORMLESS_RUNTIME_PROFILE: "instance",
        VITE_FORMLESS_RUNTIME_PROFILE: "instance",
      },
    });
    expect(buckets[0]?.props).toMatchObject({ adopt: true });
    expect(workers[0]?.props).toMatchObject({ adopt: true });
  });

  it("destroys the existing instance app and state root without exposing provider credentials in Worker props", async () => {
    const apps: Array<{
      name: typeof FORMLESS_ALCHEMY_APP_NAME;
      options: AlchemyFormlessInstanceDeploymentAppOptions;
    }> = [];
    const buckets: Array<{ props: unknown }> = [];
    const events: string[] = [];
    const namespaces: Array<{ props: unknown }> = [];
    const routeResourceCalls: Array<{ id: string; kind: string; props: unknown }> = [];
    const secrets: string[] = [];
    const workers: Array<{ props: AlchemyFormlessInstanceDeploymentWorkerProps }> = [];
    let finalized = 0;
    const dependencies: AlchemyFormlessInstanceDeploymentDependencies = {
      createApp: async (name, options) => {
        events.push("app");
        apps.push({ name, options });

        return {
          finalize: async () => {
            events.push("finalize");
            finalized += 1;
          },
        };
      },
      createCustomDomain: async (id, props) => {
        events.push("custom-domain");
        routeResourceCalls.push({ id, kind: "CustomDomain", props });

        return {
          ...props,
          createdAt: 1,
          environment: "production",
          id: "custom-domain-output",
          updatedAt: 2,
        } as Awaited<
          ReturnType<
            NonNullable<AlchemyFormlessInstanceDeploymentDependencies["createCustomDomain"]>
          >
        >;
      },
      createDurableObjectNamespace: (_id, props) => {
        events.push("durable-object");
        namespaces.push({ props });

        return { type: "durable-object-namespace" };
      },
      createDnsRecords: async (id, props) => {
        events.push("dns-records");
        routeResourceCalls.push({ id, kind: "DnsRecords", props });

        return {
          records: props.records.map((record, index) => ({
            ...record,
            id: `dns-record-${index}`,
          })),
          zoneId: props.zoneId,
        } as Awaited<
          ReturnType<NonNullable<AlchemyFormlessInstanceDeploymentDependencies["createDnsRecords"]>>
        >;
      },
      createR2Bucket: async (_id, props) => {
        events.push("r2");
        buckets.push({ props });

        return { type: "r2-bucket" };
      },
      createRedirectRule: async (id, props) => {
        events.push("redirect-rule");
        routeResourceCalls.push({ id, kind: "RedirectRule", props });

        return {
          description: props.description ?? "redirect",
          enabled: true,
          lastUpdated: "2026-06-04T00:00:00.000Z",
          preserveQueryString: props.preserveQueryString ?? true,
          ruleId: "redirect-rule-output",
          rulesetId: "redirect-ruleset-output",
          statusCode: props.statusCode ?? 301,
          targetUrl: props.targetUrl,
          zoneId: typeof props.zone === "string" ? props.zone : props.zone.id,
        } as Awaited<
          ReturnType<
            NonNullable<AlchemyFormlessInstanceDeploymentDependencies["createRedirectRule"]>
          >
        >;
      },
      createSecret: (value) => {
        secrets.push(value);

        return { type: "secret", index: secrets.length };
      },
      deployViteWorker: async (_id, props) => {
        events.push("worker");
        workers.push({ props });

        return { url: props.name ? "https://brother-instance.dpeek.workers.dev" : null };
      },
    };
    const plan = planFormlessInstanceDeployment({
      account: {
        id: "account-123",
        workersDevSubdomain: "dpeek",
      },
      instanceName: "brother-instance",
      packageVersion: "0.1.8",
    });
    const domainProviderResources: DeployResourceGraph = {
      targetId: "instance.brother-instance",
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
            zoneId: "zone-1",
          },
          kind: "cloudflare-dns-records",
          logicalId: "brother-instance-redirect-dns-old-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.brother-instance",
        },
        {
          dependencies: [{ logicalId: "brother-instance-redirect-dns-old-example-com" }],
          inputs: {
            fromHost: "old.example.com",
            requestUrl: "https://old.example.com/*",
            statusCode: 308,
            targetUrl: "https://app.example.com/${1}",
            zoneId: "zone-1",
          },
          kind: "cloudflare-redirect-rule",
          logicalId: "brother-instance-redirect-rule-old-example-com-app-example-com",
          providerFamily: "cloudflare",
          targetId: "instance.brother-instance",
        },
        {
          dependencies: [],
          inputs: {
            host: "app.example.com",
            name: "app.example.com",
            workerName: plan.resources.worker.name,
            zoneId: "zone-1",
          },
          kind: "cloudflare-worker-custom-domain",
          logicalId: "brother-instance-custom-domain-app-example-com-instance",
          providerFamily: "cloudflare",
          targetId: "instance.brother-instance",
        },
      ],
    };
    const input: DestroyFormlessInstanceInput = {
      credentialProfile: "personal",
      domainProviderPlan: planDomainProviderResources({
        instanceId: plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
        mappings: [
          {
            enabled: true,
            host: "app.example.com",
            profile: "instance",
          },
        ],
        redirectIntents: [
          {
            enabled: true,
            fromHost: "old.example.com",
            toHost: "app.example.com",
          },
        ],
        workerName: plan.resources.worker.name,
        zones: [{ id: "zone-1", name: "example.com" }],
      }),
      domainProviderResources,
      packageRoot: "/package",
      plan,
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-password",
        CLOUDFLARE_API_TOKEN: "cf-token",
      },
      stateRoot: "/workspace/.formless/deploy/brother-instance",
    };

    const result = await destroyFormlessInstanceWithAlchemy(input, dependencies);

    expect(result.resources).toEqual({
      alchemyState: "destroyed",
      customDomains: 1,
      dnsRecords: 1,
      durableObjectNamespace: "destroyed",
      mediaBucket: "destroyed",
      redirectRules: 1,
      worker: "destroyed",
      workerAssets: "destroyed",
      workerSecrets: "destroyed",
    });
    expect(apps).toEqual([
      {
        name: FORMLESS_ALCHEMY_APP_NAME,
        options: {
          phase: "destroy",
          password: "alchemy-password",
          profile: "personal",
          rootDir: "/workspace/.formless/deploy/brother-instance",
          stage: "brother-instance",
        },
      },
    ]);
    expect(buckets[0]?.props).toMatchObject({
      accountId: "account-123",
      name: "brother-instance-media",
      profile: "personal",
    });
    expect(namespaces[0]?.props).toEqual({
      className: "FormlessAuthority",
      sqlite: true,
    });
    expect(workers[0]?.props).toMatchObject({
      accountId: "account-123",
      cwd: "/package",
      name: "brother-instance",
      profile: "personal",
    });
    expect(workers[0]?.props.build.env).toEqual(plan.runtimeVars);
    expect(JSON.stringify(workers[0]?.props)).not.toContain("cf-token");
    expect(JSON.stringify(workers[0]?.props)).not.toContain("alchemy-password");
    expect(routeResourceCalls.map((call) => [call.kind, call.id])).toEqual([
      ["DnsRecords", "brother-instance-redirect-dns-old-example-com"],
      ["RedirectRule", "brother-instance-redirect-rule-old-example-com-app-example-com"],
      ["CustomDomain", "brother-instance-custom-domain-app-example-com-instance"],
    ]);
    expect(routeResourceCalls[0]?.props).toMatchObject({
      apiToken: { index: 2, type: "secret" },
      zoneId: "zone-1",
    });
    expect(routeResourceCalls[1]?.props).toMatchObject({
      apiToken: { index: 2, type: "secret" },
      zone: "zone-1",
    });
    expect(routeResourceCalls[2]?.props).toMatchObject({
      apiToken: { index: 2, type: "secret" },
      name: "app.example.com",
      workerName: "brother-instance",
      zoneId: "zone-1",
    });
    expect(JSON.stringify(routeResourceCalls)).not.toContain("cf-token");
    expect(events).toEqual([
      "app",
      "r2",
      "durable-object",
      "worker",
      "dns-records",
      "redirect-rule",
      "custom-domain",
      "finalize",
    ]);
    expect(secrets).toEqual(["alchemy-password", "cf-token", "destroy-placeholder"]);
    expect(finalized).toBe(1);
  });

  it("rejects missing package roots, admin tokens, or Alchemy passwords before mutation", async () => {
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
            ALCHEMY_PASSWORD: "alchemy-password",
            FORMLESS_ADMIN_TOKEN: "admin-secret",
          },
          stateRoot: "/state",
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
            ALCHEMY_PASSWORD: "alchemy-password",
            FORMLESS_ADMIN_TOKEN: " ",
          },
          stateRoot: "/state",
        },
        dependencies,
      ),
    ).rejects.toThrow("Formless admin token must be a non-empty string.");
    await expect(
      deployFormlessInstanceWithAlchemy(
        {
          credentialProfile: null,
          packageRoot: "/package",
          plan,
          secrets: {
            ALCHEMY_PASSWORD: " ",
            FORMLESS_ADMIN_TOKEN: "admin-secret",
          },
          stateRoot: "/state",
        },
        dependencies,
      ),
    ).rejects.toThrow("Alchemy encryption password must be a non-empty string.");
    expect(calls).toEqual([]);
  });
});

describe("Formless instance local secret env", () => {
  it("creates and reuses a local Alchemy encryption password", async () => {
    const preparedRoots: string[] = [];
    const writes: Array<{ contents: string; path: string }> = [];
    let contents: string | null = "# local deploy secrets\nFORMLESS_ADMIN_TOKEN=admin-secret\n";
    const dependencies: EnsureFormlessInstanceLocalSecretEnvDependencies = {
      prepareStateDirectory: async (root) => {
        preparedRoots.push(root);
      },
      readFile: async () => {
        if (contents === null) {
          const error = new Error("missing") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          throw error;
        }

        return contents;
      },
      statePath: (root, fileName) => `${root}/${fileName}`,
      writeFile: async (filePath, nextContents) => {
        writes.push({ contents: nextContents, path: filePath });
        contents = nextContents;
      },
    };

    const first = await ensureFormlessInstanceLocalSecretEnv(
      {
        createSecret: () => "generated-alchemy-password",
        root: "/workspace",
      },
      dependencies,
    );
    const second = await ensureFormlessInstanceLocalSecretEnv(
      {
        createSecret: () => {
          throw new Error("should not generate a second password");
        },
        root: "/workspace",
      },
      dependencies,
    );

    expect(first).toEqual({
      created: true,
      path: "/workspace/deploy.env",
      secrets: {
        ALCHEMY_PASSWORD: "generated-alchemy-password",
      },
    });
    expect(second).toEqual({
      created: false,
      path: "/workspace/deploy.env",
      secrets: {
        ALCHEMY_PASSWORD: "generated-alchemy-password",
      },
    });
    expect(preparedRoots).toEqual(["/workspace", "/workspace"]);
    expect(writes).toEqual([
      {
        path: "/workspace/deploy.env",
        contents:
          "# local deploy secrets\nFORMLESS_ADMIN_TOKEN=admin-secret\nALCHEMY_PASSWORD=generated-alchemy-password\n",
      },
    ]);
    expect(FORMLESS_INSTANCE_LOCAL_ENV_FILE).toBe("deploy.env");
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

  it("writes only validated non-secret deployment state to the instance state directory", async () => {
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
    const preparedRoots: string[] = [];
    const writes: Array<{ contents: string; path: string }> = [];

    const result = await writeFormlessInstanceState(
      {
        root: "/workspace",
        state,
      },
      {
        prepareStateDirectory: async (root) => {
          preparedRoots.push(root);
        },
        statePath: (root, fileName) => `${root}/${fileName}`,
        writeFile: async (filePath, contents) => {
          writes.push({ contents, path: filePath });
        },
      },
    );

    expect(result).toEqual({
      path: "/workspace/formless.instance.json",
      state,
    });
    expect(preparedRoots).toEqual(["/workspace"]);
    expect(writes).toEqual([
      {
        path: "/workspace/formless.instance.json",
        contents: formatFormlessInstanceState(state),
      },
    ]);
    expect(JSON.parse(writes[0]?.contents ?? "{}")).toEqual(state);
    expect(writes[0]?.contents).not.toContain("generated-admin-token");
    expect(writes[0]?.contents).not.toContain("FORMLESS_ADMIN_TOKEN");

    await expect(
      writeFormlessInstanceState(
        {
          root: "/workspace",
          state: {
            ...state,
            adminToken: "generated-admin-token",
          } as never,
        },
        {
          prepareStateDirectory: async (root) => {
            preparedRoots.push(root);
          },
          statePath: (root, fileName) => `${root}/${fileName}`,
          writeFile: async (filePath, contents) => {
            writes.push({ contents, path: filePath });
          },
        },
      ),
    ).rejects.toThrow(
      'formless.instance.json must not store secret field "formless.instance.json.adminToken".',
    );
    expect(preparedRoots).toEqual(["/workspace"]);
    expect(writes).toHaveLength(1);
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

function randomTokenSequence(...tokens: string[]): () => string {
  let index = 0;

  return () => tokens[index++ % tokens.length] ?? setupToken;
}

function fakeSetupCapability(
  inputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [],
): FormlessInstanceOwnerSetupCapabilityAdapter {
  return {
    create: async (input) => {
      inputs.push(input);

      return {
        capabilityCreated: true,
        endpointUrl: new URL(
          "/api/formless/setup/capability",
          `${input.deploymentUrl}/`,
        ).toString(),
        setupComplete: false,
      };
    },
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};

  new Headers(headers).forEach((value, key) => {
    normalized[key] = value;
  });

  return normalized;
}

function fakeHealthyDeployment(input: CheckFormlessInstanceDeployMetadataInput): Promise<{
  cacheControl: string;
  metadataUrl: string;
  packageVersion: string;
  runtimeProtocolVersion: number;
  storageMigrationSet: string;
  url: string;
  version: string;
}> {
  return Promise.resolve({
    cacheControl: "no-store",
    metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
    packageVersion: input.expectedVersion,
    runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
    storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
    url: input.url,
    version: input.expectedVersion,
  });
}

function fakeStateWriter(writes: WriteFormlessInstanceStateInput[] = []) {
  return {
    write: async (input: WriteFormlessInstanceStateInput) => {
      writes.push(input);

      return {
        path: `${input.root}/formless.instance.json`,
        state: input.state,
      };
    },
  };
}

function fakeLocalSecretEnv(password = "alchemy-password") {
  return {
    ensure: async (input: { root: string }) => ({
      created: false,
      path: `${input.root}/deploy.env`,
      secrets: {
        ALCHEMY_PASSWORD: password,
      },
    }),
  };
}
