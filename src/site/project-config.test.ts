import { describe, expect, it } from "vite-plus/test";

import {
  defaultSiteProjectConfig,
  formatSiteProjectConfig,
  parseSiteProjectConfig,
  parseSiteProjectConfigJson,
} from "./project-config.ts";

describe("Site project config", () => {
  it("parses and formats deterministic Site project config", () => {
    const config = parseSiteProjectConfig({
      version: 1,
      kind: "site",
      recordsPath: "site.records.json",
      mediaRoot: "media",
      deploy: {
        mediaBucket: "formless-site-media",
        publishUrl: "https://example.com/?draft=1#top",
        accountId: "account-123",
        workerName: "brother-site",
      },
    });

    expect(config).toEqual({
      version: 1,
      kind: "site",
      recordsPath: "site.records.json",
      mediaRoot: "media",
      deploy: {
        workerName: "brother-site",
        accountId: "account-123",
        publishUrl: "https://example.com",
        mediaBucket: "formless-site-media",
      },
    });
    expect(formatSiteProjectConfig(config)).toBe(`${JSON.stringify(config, null, 2)}\n`);
    expect(parseSiteProjectConfigJson(formatSiteProjectConfig(config))).toEqual(config);
  });

  it("creates the minimal first-version Site project config", () => {
    expect(defaultSiteProjectConfig()).toEqual({
      version: 1,
      kind: "site",
      recordsPath: "site.records.json",
      mediaRoot: "media",
    });
  });

  it("rejects future versions and non-Site configs clearly", () => {
    expect(() =>
      parseSiteProjectConfig({
        version: 2,
        kind: "site",
        recordsPath: "site.records.json",
        mediaRoot: "media",
      }),
    ).toThrow("formless.config.json version must be 1.");

    expect(() =>
      parseSiteProjectConfig({
        version: 1,
        kind: "tasks",
        recordsPath: "site.records.json",
        mediaRoot: "media",
      }),
    ).toThrow('formless.config.json kind must be "site".');
  });

  it("keeps the first project source paths fixed", () => {
    expect(() =>
      parseSiteProjectConfig({
        version: 1,
        kind: "site",
        recordsPath: "records.json",
        mediaRoot: "media",
      }),
    ).toThrow('formless.config.json recordsPath must be "site.records.json".');

    expect(() =>
      parseSiteProjectConfig({
        version: 1,
        kind: "site",
        recordsPath: "site.records.json",
        mediaRoot: "../media",
      }),
    ).toThrow('formless.config.json mediaRoot must be "media".');
  });

  it("rejects secret fields in checked-in project config", () => {
    expect(() =>
      parseSiteProjectConfig({
        version: 1,
        kind: "site",
        recordsPath: "site.records.json",
        mediaRoot: "media",
        deploy: {
          adminToken: "secret",
        },
      }),
    ).toThrow(
      'formless.config.json must not store secret field "formless.config.json.deploy.adminToken".',
    );

    expect(() =>
      parseSiteProjectConfig({
        version: 1,
        kind: "site",
        recordsPath: "site.records.json",
        mediaRoot: "media",
        deploy: {
          CLOUDFLARE_API_TOKEN: "secret",
        },
      }),
    ).toThrow(
      'formless.config.json must not store secret field "formless.config.json.deploy.CLOUDFLARE_API_TOKEN".',
    );
  });
});
