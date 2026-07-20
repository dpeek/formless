import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build, type PluginOption } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";

import { clientManualChunks, runtimeViteConfig } from "../runtime/vite-config.ts";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const applicationEntry = resolve(repoRoot, "src/main.tsx");
const publicSiteEntry = resolve(repoRoot, "src/public-site-main.tsx");

type BuildAsset = {
  fileName: string;
  source: string | Uint8Array;
  type: "asset";
};

type BuildChunk = {
  facadeModuleId: string | null;
  fileName: string;
  imports: string[];
  isEntry: boolean;
  modules: Record<string, unknown>;
  type: "chunk";
};

type BuildOutput = {
  output: Array<BuildAsset | BuildChunk>;
};

type ManifestChunk = {
  css?: string[];
  file: string;
  imports?: string[];
  isEntry?: boolean;
};

describe("Formless Renderer Astryx StyleX root build integration", () => {
  it("ships the runtime build plugin and its compatible StyleX peer", async () => {
    const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["@astryxdesign/build"]).toBe("0.1.4");
    expect(packageJson.dependencies?.["@stylexjs/unplugin"]).toBe("0.18.3");
  });

  it("emits the selected production application and public entries with isolated Renderer graphs", async () => {
    const runtimeConfig = runtimeViteConfig({
      env: { NODE_ENV: "production", VITEST: "true" },
      packageRoot: repoRoot,
    }) as { plugins?: PluginOption[] };
    const result = await build({
      build: {
        cssCodeSplit: true,
        manifest: "assets/formless-client-manifest.json",
        minify: false,
        rollupOptions: {
          input: {
            application: applicationEntry,
            "public-site": publicSiteEntry,
          },
          output: {
            manualChunks: clientManualChunks,
          },
        },
        write: false,
      },
      configFile: false,
      plugins: runtimeConfig.plugins ?? [],
      root: repoRoot,
    });
    const outputs = buildOutputs(result);
    const items = outputs.flatMap(({ output }) => output);
    const chunks = items.filter((item): item is BuildChunk => item.type === "chunk");
    const assets = items.filter((item): item is BuildAsset => item.type === "asset");
    const applicationEntryChunk = requiredEntryChunk(chunks, applicationEntry);
    const publicSiteEntryChunk = requiredEntryChunk(chunks, publicSiteEntry);
    const applicationModules = reachableModules(applicationEntryChunk, chunks);
    const publicSiteModules = reachableModules(publicSiteEntryChunk, chunks);
    const manifest = emittedManifest(assets);
    const applicationManifestEntry = requiredManifestEntry(
      manifest,
      applicationEntryChunk.fileName,
    );
    const publicSiteManifestEntry = requiredManifestEntry(manifest, publicSiteEntryChunk.fileName);
    const applicationCss = manifestCss(applicationManifestEntry, manifest);
    const publicSiteCss = manifestCss(publicSiteManifestEntry, manifest);
    const applicationWorkspaceCss = workspaceCssModules(applicationModules);
    const publicSiteWorkspaceCss = workspaceCssModules(publicSiteModules);
    const emittedCss = assets
      .filter(({ fileName }) => fileName.endsWith(".css"))
      .map(assetText)
      .join("\n");

    expect(applicationModules).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/main.tsx"),
        expect.stringContaining("src/app/application-renderer-root.tsx"),
        expect.stringContaining("lib/renderer/src/application-assembly.tsx"),
        expect.stringContaining("lib/renderer/src/components/shell.tsx"),
      ]),
    );
    expect(applicationModules).not.toEqual(
      expect.arrayContaining([expect.stringContaining("src/public-site-main.tsx")]),
    );
    expect(publicSiteModules).toEqual(
      expect.arrayContaining([
        expect.stringContaining("lib/renderer/src/components/site.tsx"),
        expect.stringContaining("lib/renderer/src/site-provider.tsx"),
      ]),
    );
    expect(publicSiteModules).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("lib/renderer/src/application-assembly.tsx"),
        expect.stringContaining("src/app/"),
      ]),
    );
    expect(applicationWorkspaceCss).toEqual([
      "lib/renderer/src/application.css",
      "lib/renderer/src/global.css",
    ]);
    expect(publicSiteWorkspaceCss).toEqual(["lib/renderer/src/global.css"]);
    expect(applicationCss.length).toBeGreaterThan(0);
    expect(publicSiteCss.length).toBeGreaterThan(0);
    expect(emittedCss).toContain("@layer");
    expect(emittedCss).toMatch(/\.astryx[a-z0-9]+/);
    expect(emittedCss).toMatch(/\.x[a-z0-9]+/);
    expect(emittedCss).toMatch(/min-height:\s*260px/);
    expect(emittedCss).toMatch(/width:\s*min\(100%,\s*480px\)/);
    expect(emittedCss).not.toContain("stylex.create");
  }, 30_000);
});

function workspaceCssModules(modules: readonly string[]): string[] {
  return modules
    .map((moduleId) => moduleId.split("?", 1)[0])
    .filter((moduleId): moduleId is string => moduleId !== undefined && moduleId.endsWith(".css"))
    .map((moduleId) => relative(repoRoot, moduleId))
    .filter((moduleId) => !moduleId.startsWith("..") && !moduleId.startsWith("node_modules/"))
    .sort();
}

function buildOutputs(value: unknown): BuildOutput[] {
  const outputs = Array.isArray(value) ? value : [value];

  if (
    outputs.some(
      (output) =>
        typeof output !== "object" ||
        output === null ||
        !("output" in output) ||
        !Array.isArray(output.output),
    )
  ) {
    throw new Error("Expected completed Vite build outputs.");
  }

  return outputs as BuildOutput[];
}

function requiredEntryChunk(chunks: readonly BuildChunk[], facadeModuleId: string): BuildChunk {
  const chunk = chunks.find((candidate) => candidate.facadeModuleId === facadeModuleId);

  if (!chunk) {
    throw new Error(`Missing build entry ${facadeModuleId}.`);
  }

  return chunk;
}

function reachableModules(entry: BuildChunk, chunks: readonly BuildChunk[]): string[] {
  const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const modules = new Set<string>();
  const queue = [entry];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const chunk = queue.shift();

    if (!chunk || seen.has(chunk.fileName)) {
      continue;
    }

    seen.add(chunk.fileName);
    Object.keys(chunk.modules).forEach((moduleId) => modules.add(moduleId));
    chunk.imports.forEach((fileName) => {
      const importedChunk = chunksByFileName.get(fileName);

      if (importedChunk) {
        queue.push(importedChunk);
      }
    });
  }

  return [...modules].sort();
}

function emittedManifest(assets: readonly BuildAsset[]): Record<string, ManifestChunk> {
  const asset = assets.find(({ fileName }) => fileName === "assets/formless-client-manifest.json");

  if (!asset) {
    throw new Error("Missing emitted client manifest.");
  }

  return JSON.parse(assetText(asset)) as Record<string, ManifestChunk>;
}

function requiredManifestEntry(
  manifest: Record<string, ManifestChunk>,
  entryFileName: string,
): ManifestChunk {
  const entry = Object.values(manifest).find(
    (chunk) => chunk.isEntry && chunk.file === entryFileName,
  );

  if (!entry) {
    throw new Error(`Missing manifest entry for ${entryFileName}.`);
  }

  return entry;
}

function manifestCss(
  entry: ManifestChunk,
  manifest: Record<string, ManifestChunk>,
  seen: Set<string> = new Set(),
): string[] {
  const css = new Set(entry.css ?? []);

  for (const key of entry.imports ?? []) {
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const imported = manifest[key];

    if (imported) {
      manifestCss(imported, manifest, seen).forEach((fileName) => css.add(fileName));
    }
  }

  return [...css].sort();
}

function assetText(asset: BuildAsset): string {
  return typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source);
}
