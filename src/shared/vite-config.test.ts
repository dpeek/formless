import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import viteConfig from "../../vite.config.ts";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

type ViteConfigBuild = {
  manifest?: unknown;
  rollupOptions?: {
    input?: unknown;
  };
};

type ViteConfigWithEnvironments = {
  build?: unknown;
  environments?: {
    client?: {
      build?: ViteConfigBuild;
    };
  };
};

describe("Vite config", () => {
  it("scopes client-only HTML entries to the client environment", () => {
    const config = viteConfig as ViteConfigWithEnvironments;
    const clientBuild = config.environments?.client?.build;

    expect(config.build).toBeUndefined();
    expect(clientBuild?.manifest).toBe("assets/formless-client-manifest.json");
    expect(clientBuild?.rollupOptions?.input).toEqual({
      app: resolve(repoRoot, "index.html"),
      "public-site": resolve(repoRoot, "src/public-site-main.tsx"),
    });
  });
});
