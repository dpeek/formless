import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { FormlessSiteRendererProvider } from "./site-provider.tsx";

vi.mock("@astryxdesign/core/theme", () => ({
  Theme: ({ children, mode }: { children: ReactNode; mode: string }) =>
    createElement("section", { "data-astryx-theme-mode": mode }, children),
}));

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(sourceRoot, "..");

describe("Formless Site renderer provider", () => {
  it.each(["light", "dark"] as const)("applies the canonical %s mode", (mode) => {
    const html = renderToStaticMarkup(
      <FormlessSiteRendererProvider mode={mode}>
        <main>Selected Site renderer</main>
      </FormlessSiteRendererProvider>,
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
      <FormlessSiteRendererProvider
        mode="light"
        site={{
          accentColor: "#000000",
          backgroundColor: "#FFFFFF",
          id: "site:custom-theme",
          label: "Custom theme",
        }}
      >
        Candidate
      </FormlessSiteRendererProvider>,
    );

    expect(html).toContain("--formless-public-site-background:rgb(255 255 255)");
    expect(html).toContain("--formless-public-site-link:rgb(0 0 0)");
    expect(html).toContain("--formless-public-site-on-accent:rgb(255 255 255)");
  });

  it("falls back from invalid authored colors without leaking raw values", () => {
    const html = renderToStaticMarkup(
      <FormlessSiteRendererProvider
        mode="dark"
        site={{
          accentColor: "javascript:red",
          backgroundColor: "transparent",
          id: "site:invalid-theme",
          label: "Invalid theme",
        }}
      >
        Candidate
      </FormlessSiteRendererProvider>,
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

    expect(packageJson.exports["./site/renderer"]).toBe("./src/site-renderer.tsx");
    expect(packageJson.exports["./site/provider"]).toBe("./src/site-provider.tsx");
    expect(packageJson.exports["./site/global.css"]).toBe("./src/global.css");
    expect(css).toContain('@import "@astryxdesign/core/reset.css";');
    expect(css).toContain('@import "@astryxdesign/theme-neutral/theme.css";');
    expect(css).toContain("[data-astryx-public-site-provider]");
  });
});
