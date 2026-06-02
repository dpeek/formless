import { describe, expect, it } from "vite-plus/test";

import {
  setupCloudflareCredentialsWithAlchemyProfile,
  type AlchemyCloudflareOAuthCredentials,
  type AlchemyCloudflareProfileStore,
} from "./instance-workspace-credential-setup.ts";
import type { FormlessInstanceDeploymentAccount } from "./instance-onboarding.ts";

const now = () => "2026-06-02T02:00:00.000Z";
const personalAccount = {
  id: "acct_personal",
  name: "Personal",
  workersDevSubdomain: "personal",
} satisfies FormlessInstanceDeploymentAccount;
const teamAccount = {
  id: "acct_team",
  name: "Team",
  workersDevSubdomain: "team",
} satisfies FormlessInstanceDeploymentAccount;
const oauthCredentials = {
  access: "oauth-access-token",
  expires: 4_102_444_800_000,
  refresh: "oauth-refresh-token",
  scopes: ["account:read", "workers:write", "offline_access"],
  type: "oauth",
} satisfies AlchemyCloudflareOAuthCredentials;

describe("Alchemy Cloudflare credential setup", () => {
  it("validates existing default or named Alchemy profile credentials", async () => {
    const result = await setupCloudflareCredentialsWithAlchemyProfile(
      { profileLabel: "personal", provider: "cloudflare", workspaceRoot: "/workspace" },
      {
        accountDiscovery: {
          listAccounts: async (input) => {
            expect(input.credentialProfile).toBe("personal");
            return [personalAccount];
          },
        },
        now,
        profileStore: fakeProfileStore(),
      },
    );

    expect(result).toMatchObject({
      result: {
        details: {
          account: {
            id: "acct_personal",
            name: "Personal",
            workersDevSubdomain: "personal",
          },
          profileRef: "alchemy-profile:personal",
          source: "existing-profile",
        },
        summary: {
          fields: {
            profile: "personal",
            provider: "cloudflare",
            selectedAccountId: "acct_personal",
            status: "validated",
          },
          title: "Cloudflare credentials ready",
        },
      },
      status: "succeeded",
    });
    expect(result.events).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("oauth-access-token");
    expect(JSON.stringify(result)).not.toContain("oauth-refresh-token");
  });

  it("starts OAuth profile creation with an authorization URL and stores credentials on continuation", async () => {
    const profileStore = fakeProfileStore({ listedAccounts: [personalAccount] });
    const result = await setupCloudflareCredentialsWithAlchemyProfile(
      { provider: "cloudflare", workspaceRoot: "/workspace" },
      {
        accountDiscovery: {
          listAccounts: async () => {
            throw new Error("No credentials found.");
          },
        },
        now,
        oauth: {
          authorize: (scopes) => {
            expect(scopes).toContain("workers:write");
            expect(scopes).toContain("offline_access");
            return {
              state: "oauth-state",
              url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
              verifier: "oauth-verifier",
            };
          },
          waitForCredentials: async (authorization) => {
            expect(authorization.state).toBe("oauth-state");
            return oauthCredentials;
          },
        },
        profileStore,
      },
    );

    expect(result).toMatchObject({
      events: [
        {
          profileLabel: "default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        },
      ],
      result: {
        summary: {
          fields: {
            profile: "default",
            provider: "cloudflare",
            status: "waiting-for-authorization",
          },
          title: "Cloudflare authorization required",
        },
      },
      status: "running",
    });
    expect(JSON.stringify(result)).not.toContain("oauth-access-token");

    const final = await result.continue?.();

    expect(profileStore.writtenCredentials).toEqual([
      { credentials: oauthCredentials, profile: "default" },
    ]);
    expect(profileStore.writtenProviders).toEqual([
      {
        account: personalAccount,
        profile: "default",
        scopes: expect.arrayContaining(["workers:write", "account:read"]),
      },
    ]);
    expect(final).toMatchObject({
      result: {
        summary: {
          fields: {
            profile: "default",
            selectedAccountId: "acct_personal",
            status: "validated",
          },
          title: "Cloudflare credentials ready",
        },
      },
      status: "succeeded",
    });
    expect(JSON.stringify(final)).not.toContain("oauth-access-token");
    expect(JSON.stringify(final)).not.toContain("oauth-refresh-token");
  });

  it("returns browser-visible account options and stores the selected account when supplied", async () => {
    const profileStore = fakeProfileStore({
      credentials: oauthCredentials,
      listedAccounts: [personalAccount, teamAccount],
    });
    const selection = await setupCloudflareCredentialsWithAlchemyProfile(
      { profileLabel: "personal", provider: "cloudflare", workspaceRoot: "/workspace" },
      {
        accountDiscovery: {
          listAccounts: async () => {
            throw new Error("Provider metadata missing.");
          },
        },
        now,
        profileStore,
      },
    );

    expect(selection).toMatchObject({
      result: {
        details: {
          accounts: [
            { id: "acct_personal", name: "Personal", workersDevSubdomain: "personal" },
            { id: "acct_team", name: "Team", workersDevSubdomain: "team" },
          ],
        },
        summary: {
          fields: {
            accountCount: 2,
            profile: "personal",
            provider: "cloudflare",
            status: "account-selection-required",
          },
          title: "Cloudflare account selection required",
        },
      },
      status: "succeeded",
    });
    expect(profileStore.writtenProviders).toEqual([]);

    const selected = await setupCloudflareCredentialsWithAlchemyProfile(
      {
        accountId: "acct_team",
        profileLabel: "personal",
        provider: "cloudflare",
        workspaceRoot: "/workspace",
      },
      {
        accountDiscovery: {
          listAccounts: async () => {
            throw new Error("Provider metadata missing.");
          },
        },
        now,
        profileStore,
      },
    );

    expect(profileStore.writtenProviders.at(-1)).toMatchObject({
      account: teamAccount,
      profile: "personal",
    });
    expect(selected.result?.summary.fields).toMatchObject({
      selectedAccountId: "acct_team",
      status: "validated",
    });
    expect(JSON.stringify(selected)).not.toContain("oauth-access-token");
  });
});

function fakeProfileStore(
  options: {
    credentials?: AlchemyCloudflareOAuthCredentials;
    listedAccounts?: FormlessInstanceDeploymentAccount[];
  } = {},
): AlchemyCloudflareProfileStore & {
  writtenCredentials: Array<{
    credentials: AlchemyCloudflareOAuthCredentials;
    profile: string;
  }>;
  writtenProviders: Array<{
    account: FormlessInstanceDeploymentAccount;
    profile: string;
    scopes: readonly string[];
  }>;
} {
  const writtenCredentials: Array<{
    credentials: AlchemyCloudflareOAuthCredentials;
    profile: string;
  }> = [];
  const writtenProviders: Array<{
    account: FormlessInstanceDeploymentAccount;
    profile: string;
    scopes: readonly string[];
  }> = [];

  return {
    listAccountsWithCredentials: async () => options.listedAccounts ?? [],
    readCredentials: async () => options.credentials,
    writeCredentials: async (profile, credentials) => {
      writtenCredentials.push({ credentials, profile });
    },
    writeProvider: async (input) => {
      writtenProviders.push(input);
    },
    writtenCredentials,
    writtenProviders,
  };
}
