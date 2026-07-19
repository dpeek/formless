import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AstryxPublicSiteProvider } from "./site-provider.tsx";

vi.mock("@astryxdesign/core/theme", () => ({
  Theme: ({ children, mode }: { children: ReactNode; mode: string }) =>
    createElement("section", { "data-astryx-theme-mode": mode }, children),
}));

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(sourceRoot, "..");
const repoRoot = resolve(packageRoot, "../..");

describe("Astryx public Site provider", () => {
  it.each(["light", "dark"] as const)("applies the canonical %s mode", (mode) => {
    const html = renderToStaticMarkup(
      <AstryxPublicSiteProvider mode={mode}>
        <main>Selected Site renderer</main>
      </AstryxPublicSiteProvider>,
    );

    expect(html).toContain(`data-astryx-theme-mode="${mode}"`);
    expect(html).toContain(`data-site-theme="${mode}"`);
    expect(html).toContain("data-formless-native-navigation");
    expect(html).toContain("data-astryx-public-site-provider");
    expect(html).toContain(`color-scheme:${mode}`);
    expect(html).toContain("--formless-public-site-background:");
    expect(html).toContain("--formless-public-site-link:");
    expect(html).toContain("<main>Selected Site renderer</main>");
  });

  it("maps valid authored colors through the Site-owned palette", () => {
    const html = renderToStaticMarkup(
      <AstryxPublicSiteProvider
        mode="light"
        site={{
          accentColor: "#000000",
          backgroundColor: "#FFFFFF",
          id: "site:custom-theme",
          label: "Custom theme",
        }}
      >
        Candidate
      </AstryxPublicSiteProvider>,
    );

    expect(html).toContain("--formless-public-site-background:rgb(255 255 255)");
    expect(html).toContain("--formless-public-site-link:rgb(0 0 0)");
    expect(html).toContain("--formless-public-site-on-accent:rgb(255 255 255)");
  });

  it("falls back from invalid authored colors without leaking raw values", () => {
    const html = renderToStaticMarkup(
      <AstryxPublicSiteProvider
        mode="dark"
        site={{
          accentColor: "javascript:red",
          backgroundColor: "transparent",
          id: "site:invalid-theme",
          label: "Invalid theme",
        }}
      >
        Candidate
      </AstryxPublicSiteProvider>,
    );

    expect(html).not.toContain("javascript:red");
    expect(html).not.toContain("transparent");
    expect(html).toContain("--formless-public-site-background:rgb(9 9 11)");
  });

  it("exports production provider and CSS package boundaries", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(packageRoot, "package.json"), "utf8"),
    ) as {
      exports: Record<string, string>;
    };
    const css = await readFile(resolve(sourceRoot, "global.css"), "utf8");
    const providerSource = await readFile(resolve(sourceRoot, "site-provider.tsx"), "utf8");

    expect(packageJson.exports["./site/renderer"]).toBe("./src/site-renderer.tsx");
    expect(packageJson.exports["./site/provider"]).toBe("./src/site-provider.tsx");
    expect(packageJson.exports["./site/global.css"]).toBe("./src/global.css");
    expect(css).toContain('@import "@astryxdesign/core/reset.css";');
    expect(css).toContain('@import "@astryxdesign/theme-neutral/theme.css";');
    expect(css).toContain("[data-astryx-public-site-provider]");
    expect(providerSource).toContain('from "@astryxdesign/core/theme"');
    expect(providerSource).not.toContain('from "@astryxdesign/core"');
    expect(providerSource).not.toMatch(/localStorage|sessionStorage|document\.|window\.|useEffect/);
  });

  it("owns production public browser and Worker presentation assembly", async () => {
    const [browserSource, workerSource] = await Promise.all([
      readFile(resolve(repoRoot, "src/public-site-main.tsx"), "utf8"),
      readFile(resolve(repoRoot, "src/worker/public-site-worker-runtime.ts"), "utf8"),
    ]);

    expect(browserSource).toContain("AstryxSitePageRenderer");
    expect(browserSource).toContain("AstryxSitePublicSystemStateRenderer");
    expect(browserSource).toContain("@dpeek/formless-astryx/site/global.css");
    expect(browserSource).not.toContain("@dpeek/formless-ui");
    expect(workerSource).toContain("AstryxSitePageRenderer");
    expect(workerSource).toContain("AstryxSitePublicSystemStateRenderer");
    expect(workerSource).toContain("@dpeek/formless-astryx/site/renderer");
    for (const source of [browserSource, workerSource]) {
      expect(source).not.toMatch(/LegacySite(?:Page|PublicSystemState)Renderer/);
    }
  });
});
