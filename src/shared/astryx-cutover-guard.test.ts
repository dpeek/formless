import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const applicationAssemblyEntry = resolve(repoRoot, "lib/astryx/src/application-assembly.tsx");
const publicSiteRendererEntry = resolve(repoRoot, "lib/astryx/src/site-renderer.tsx");
const publicSiteWorkerEntry = resolve(repoRoot, "src/worker/public-site-worker-runtime.ts");

const documentedAstryxImports = new Set([
  "@dpeek/formless-astryx/application/assembly",
  "@dpeek/formless-astryx/application/global.css",
  "@dpeek/formless-astryx/application/provider",
  "@dpeek/formless-astryx/contract",
  "@dpeek/formless-astryx/contract-host",
  "@dpeek/formless-astryx/contract-host/react",
  "@dpeek/formless-astryx/site/global.css",
  "@dpeek/formless-astryx/site/provider",
  "@dpeek/formless-astryx/site/renderer",
]);

const presentationCounterparts = [
  counterpart(
    "src/app/legacy-application-presentation.tsx",
    "lib/astryx/src/application-assembly.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-access-renderer.tsx",
    "lib/astryx/src/components/formless-ui-access-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-application-shell-renderer.tsx",
    "lib/astryx/src/components/shell.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-application-system-state-renderer.tsx",
    "lib/astryx/src/components/formless-ui-application-system-state-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-create-surface.tsx",
    "lib/astryx/src/components/formless-ui-create-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-document-theme-renderer.tsx",
    "lib/astryx/src/components/theme.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-list-renderer.tsx",
    "lib/astryx/src/components/formless-ui-list-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-management-renderer.tsx",
    "lib/astryx/src/components/formless-ui-management-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-operation-controls.tsx",
    "lib/astryx/src/components/operation-controls.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-owner-auth-renderer.tsx",
    "lib/astryx/src/components/formless-ui-auth-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-record-field-adapter.tsx",
    "lib/astryx/src/components/fields/renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-record-result-renderer.tsx",
    "lib/astryx/src/components/formless-ui-record-result-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-table-renderer.tsx",
    "lib/astryx/src/components/formless-ui-table-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-tree-renderer.tsx",
    "lib/astryx/src/components/formless-ui-tree-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-workspace-collection-renderer.tsx",
    "lib/astryx/src/components/formless-ui-workspace-collection-renderer.tsx",
  ),
  counterpart(
    "src/app/generated/legacy-workspace-screen-renderer.tsx",
    "lib/astryx/src/components/formless-ui-workspace-screen-renderer.tsx",
  ),
  counterpart(
    "lib/site-app/src/react/legacy-page-renderer.tsx",
    "lib/astryx/src/components/site.tsx",
  ),
  counterpart(
    "lib/site-app/src/react/legacy-system-state.tsx",
    "lib/astryx/src/components/site-system-state.tsx",
  ),
] as const;

const dormantCleanupInventory = {
  dependencies: ["@dpeek/formless-ui", "@tailwindcss/vite", "tailwindcss"],
  generatedLegacySources: [
    "legacy-access-renderer.tsx",
    "legacy-application-shell-renderer.tsx",
    "legacy-application-system-state-renderer.tsx",
    "legacy-create-surface.tsx",
    "legacy-document-theme-renderer.tsx",
    "legacy-generated-create.tsx",
    "legacy-generated-table-runtime.tsx",
    "legacy-home-operations.tsx",
    "legacy-list-renderer.tsx",
    "legacy-management-renderer.tsx",
    "legacy-operation-controls.tsx",
    "legacy-owner-auth-renderer.tsx",
    "legacy-record-delete.tsx",
    "legacy-record-field-adapter.tsx",
    "legacy-record-result-renderer.tsx",
    "legacy-state-machine-ui.tsx",
    "legacy-table-renderer.tsx",
    "legacy-tree-renderer.tsx",
    "legacy-workspace-collection-renderer.tsx",
    "legacy-workspace-screen-renderer.tsx",
  ],
  generatedLegacyTests: [
    "legacy-access-renderer.test.tsx",
    "legacy-application-shell-renderer.test.tsx",
    "legacy-application-system-state-renderer.test.tsx",
    "legacy-document-theme-renderer.test.tsx",
    "legacy-list-renderer.test.tsx",
    "legacy-management-renderer.test.tsx",
    "legacy-record-result-renderer.test.tsx",
    "legacy-state-machine-ui.test.tsx",
    "legacy-tree-renderer.test.tsx",
    "legacy-workspace-screen-renderer.test.tsx",
  ],
  generatedNonLegacySources: [
    "color-field-control.tsx",
    "create-field-control.tsx",
    "field-control-primitives.tsx",
    "field-presentation.tsx",
    "generated-list-runtime.tsx",
    "generated-record-result-runtime.tsx",
    "operation-status.tsx",
    "readiness-warnings.tsx",
    "record-field-control.tsx",
    "record-field-display.tsx",
    "record-field-editor.tsx",
    "table-operation-controls.tsx",
    "table.tsx",
  ],
  generatedNonLegacyTests: [
    "color-field-control.test.tsx",
    "field-control-primitives.test.tsx",
    "field-presentation.test.ts",
    "operation-status.test.tsx",
    "record-field-control.test.tsx",
    "table.test.tsx",
  ],
  packagesAndAdapters: ["lib/ui", "lib/media/src/react.tsx", "lib/media/src/react.test.tsx"],
  publicSiteSources: ["legacy-page-renderer.tsx", "legacy-system-state.tsx"],
  publicSiteTests: ["legacy-public-form-session.test.tsx"],
  rootSources: ["src/app/legacy-application-presentation.tsx", "lib/ui/src/global.css"],
} as const;

describe("Astryx mechanical cutover guard", () => {
  it("freezes the complete Astryx production selectors", async () => {
    const [applicationSelector, appRoot, publicBrowserRoot, publicWorkerRoot, siteCandidate] =
      await Promise.all([
        source("src/app/application-presentation.tsx"),
        source("src/app.tsx"),
        source("src/public-site-main.tsx"),
        source("src/worker/public-site-worker-runtime.ts"),
        source("lib/astryx/src/site-renderer.tsx"),
      ]);

    expect(applicationSelector.trim()).toBe(
      `export { AstryxApplicationAssembly as ApplicationPresentation } from "@dpeek/formless-astryx/application/assembly";`,
    );
    expect(await pathExists(resolve(repoRoot, "src/app/astryx-application-presentation.ts"))).toBe(
      false,
    );

    expect(count(appRoot, /builtInRenderer: AstryxSitePageRenderer/g)).toBe(2);
    expect(count(appRoot, /builtInSystemStateRenderer: AstryxSitePublicSystemStateRenderer/g)).toBe(
      2,
    );
    expect(count(publicBrowserRoot, /builtInRenderer=\{AstryxSitePageRenderer\}/g)).toBe(1);
    expect(
      count(
        publicBrowserRoot,
        /builtInSystemStateRenderer=\{AstryxSitePublicSystemStateRenderer\}/g,
      ),
    ).toBe(1);
    expect(count(publicWorkerRoot, /builtInRenderer: AstryxSitePageRenderer/g)).toBe(1);
    expect(
      count(publicWorkerRoot, /builtInSystemStateRenderer: AstryxSitePublicSystemStateRenderer/g),
    ).toBe(1);
    for (const productionRoot of [appRoot, publicBrowserRoot, publicWorkerRoot]) {
      expect(productionRoot).not.toMatch(/LegacySite(?:Page|PublicSystemState)Renderer/);
      expect(productionRoot).not.toMatch(/rendererFlag|rendererMode|useLegacy|useAstryx/);
    }
    expect(siteCandidate).toContain("export { AstryxSitePageRenderer }");
    expect(siteCandidate).toContain("export { AstryxSitePublicSystemStateRenderer }");

    for (const { astryx, legacy } of presentationCounterparts) {
      expect(await pathExists(resolve(repoRoot, legacy)), `${legacy}: legacy selection`).toBe(true);
      expect(await pathExists(resolve(repoRoot, astryx)), `${astryx}: Astryx counterpart`).toBe(
        true,
      );
    }
  });

  it("freezes the selected root providers, CSS boundaries, and shared StyleX build integration", async () => {
    const [
      mainRoot,
      applicationRoot,
      publicBrowserRoot,
      publicPage,
      publicSystemState,
      viteSource,
    ] = await Promise.all([
      source("src/main.tsx"),
      source("src/app/astryx-application-root.tsx"),
      source("src/public-site-main.tsx"),
      source("lib/astryx/src/components/site.tsx"),
      source("lib/astryx/src/components/site-system-state.tsx"),
      source("src/runtime/vite-config.ts"),
    ]);

    expect(mainRoot).toContain("<AstryxApplicationRoot");
    expect(mainRoot).not.toContain("@dpeek/formless-ui");
    expect(mainRoot).not.toContain("FormlessRouterProvider");

    expect(applicationRoot).toContain("@dpeek/formless-astryx/application/global.css");
    expect(applicationRoot).toContain("AstryxApplicationProvider");
    expect(applicationRoot).toContain("ApplicationRuntimeContractHostProvider");
    expect(applicationRoot).toContain("ApplicationNavigationBridge");
    expect(applicationRoot).toContain("ApplicationRootThemeRuntimeProvider");
    expect(applicationRoot).not.toContain("@dpeek/formless-ui");

    expect(publicBrowserRoot).toContain("@dpeek/formless-astryx/site/global.css");
    expect(publicBrowserRoot).not.toContain("@dpeek/formless-ui");
    expect(publicPage).toContain("<AstryxPublicSiteProvider");
    expect(publicSystemState).toContain('<AstryxPublicSiteProvider mode="light">');

    const stylexCall = viteSource.indexOf("astryxStylex({");
    const reactCall = viteSource.indexOf("...publicVitePlugins(react())", stylexCall);
    const tailwindCall = viteSource.indexOf("...publicVitePlugins(tailwindcss())", reactCall);
    const cloudflareCall = viteSource.indexOf("publicVitePlugins(cloudflare", tailwindCall);
    const workerSourceCompilationCall = viteSource.indexOf(
      "astryxCloudflareWorkerSourceCompilationPlugin()",
      cloudflareCall,
    );
    expect(stylexCall).toBeGreaterThan(-1);
    expect(reactCall).toBeGreaterThan(stylexCall);
    expect(tailwindCall).toBeGreaterThan(reactCall);
    expect(cloudflareCall).toBeGreaterThan(tailwindCall);
    expect(workerSourceCompilationCall).toBeGreaterThan(cloudflareCall);
    expect(viteSource).toContain('rootDir: path.resolve(packageRoot, "lib/astryx")');
    expect(viteSource).toContain('"@astryxdesign/theme-neutral"');
  });

  it("rejects mixed selected package graphs, legacy reachability, Tailwind markup, private imports, and public/admin contamination", async () => {
    const [applicationGraph, publicGraph] = await Promise.all([
      entryGraph(applicationAssemblyEntry),
      entryGraph(publicSiteRendererEntry),
    ]);
    const applicationFiles = applicationGraph.files.filter((path) =>
      path.startsWith("lib/astryx/src/"),
    );
    const publicFiles = publicGraph.files.filter((path) => path.startsWith("lib/astryx/src/"));

    expect(applicationFiles).toEqual(
      expect.arrayContaining(
        presentationCounterparts
          .map(({ astryx }) => astryx)
          .filter((path) => path.startsWith("lib/astryx/src/components/formless-ui-")),
      ),
    );
    expect(applicationFiles.some((path) => path.includes("/site"))).toBe(false);
    expect(publicFiles).toEqual(
      expect.arrayContaining([
        "lib/astryx/src/components/site-system-state.tsx",
        "lib/astryx/src/components/site.tsx",
        "lib/astryx/src/site-provider.tsx",
        "lib/astryx/src/site-renderer.tsx",
      ]),
    );
    expect(
      publicFiles.some(
        (path) =>
          path.includes("application-assembly") ||
          path.includes("application-provider") ||
          path.startsWith("lib/astryx/src/components/formless-ui-") ||
          path.includes("/shell.tsx"),
      ),
    ).toBe(false);

    for (const graph of [applicationGraph, publicGraph]) {
      expect(graph.externalSpecifiers.filter(forbiddenCandidateSpecifier)).toEqual([]);
      for (const filePath of graph.absoluteFiles) {
        const candidateSource = await readFile(filePath, "utf8");
        expect(candidateSource, relative(repoRoot, filePath)).not.toMatch(
          /@tailwind|@dpeek\/formless-ui|\bLegacy[A-Z]|legacy-[a-z]/,
        );
        expect(candidateSource, relative(repoRoot, filePath)).not.toMatch(
          /className\s*=\s*(?:["'`]|\{\s*["'`])/,
        );
      }
    }

    const privateImports: string[] = [];
    for (const filePath of await sourceFiles(resolve(repoRoot, "src"))) {
      const fileSource = await readFile(filePath, "utf8");
      for (const specifier of importSpecifiers(fileSource)) {
        if (
          specifier.startsWith("@dpeek/formless-astryx/") &&
          !documentedAstryxImports.has(specifier)
        ) {
          privateImports.push(`${relative(repoRoot, filePath)}: ${specifier}`);
        }
        if (specifier.includes("lib/astryx/src")) {
          privateImports.push(`${relative(repoRoot, filePath)}: ${specifier}`);
        }
      }
    }
    expect(privateImports).toEqual([]);
  });

  it("keeps the selected public Worker graph on Astryx and Site-owned presentation", async () => {
    const graph = await entryGraph(publicSiteWorkerEntry, externalizeWorkerDependencies);

    expect(graph.files).toEqual(
      expect.arrayContaining([
        "src/worker/public-site-worker-runtime.ts",
        "lib/astryx/src/components/site-system-state.tsx",
        "lib/astryx/src/components/site.tsx",
        "lib/astryx/src/site-provider.tsx",
        "lib/astryx/src/site-renderer.tsx",
      ]),
    );
    expect(graph.files.filter(forbiddenSelectedWorkerFile)).toEqual([]);
    expect(graph.externalSpecifiers.filter(forbiddenSelectedWorkerSpecifier)).toEqual([]);
  });

  it("keeps dormant cleanup source, tests, packages, CSS, and dependencies outside the activation transaction", async () => {
    const generatedEntries = (await readdir(resolve(repoRoot, "src/app/generated")))
      .filter((name) => name.startsWith("legacy-") && name.endsWith(".tsx"))
      .sort();
    const publicSiteEntries = (await readdir(resolve(repoRoot, "lib/site-app/src/react")))
      .filter((name) => name.startsWith("legacy-") && name.endsWith(".tsx"))
      .sort();
    const packageJson = JSON.parse(await source("package.json")) as {
      dependencies?: Record<string, string>;
    };

    expect(generatedEntries.filter((name) => !name.includes(".test."))).toEqual(
      dormantCleanupInventory.generatedLegacySources,
    );
    expect(generatedEntries.filter((name) => name.includes(".test."))).toEqual(
      dormantCleanupInventory.generatedLegacyTests,
    );
    expect(publicSiteEntries.filter((name) => !name.includes(".test."))).toEqual(
      dormantCleanupInventory.publicSiteSources,
    );
    expect(publicSiteEntries.filter((name) => name.includes(".test."))).toEqual(
      dormantCleanupInventory.publicSiteTests,
    );

    for (const path of [
      ...dormantCleanupInventory.generatedNonLegacySources.map(
        (name) => `src/app/generated/${name}`,
      ),
      ...dormantCleanupInventory.generatedNonLegacyTests.map((name) => `src/app/generated/${name}`),
      ...dormantCleanupInventory.packagesAndAdapters,
      ...dormantCleanupInventory.rootSources,
    ]) {
      expect(await pathExists(resolve(repoRoot, path)), `${path}: dormant cleanup inventory`).toBe(
        true,
      );
    }
    for (const dependency of dormantCleanupInventory.dependencies) {
      expect(packageJson.dependencies?.[dependency], dependency).toBeDefined();
    }
  });
});

function counterpart(legacy: string, astryx: string) {
  return { astryx, legacy };
}

async function source(path: string) {
  return readFile(resolve(repoRoot, path), "utf8");
}

function count(sourceText: string, pattern: RegExp) {
  return [...sourceText.matchAll(pattern)].length;
}

async function entryGraph(entryPoint: string, dependencyPlugin: Plugin = externalizeDependencies) {
  const result = await build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    jsx: "automatic",
    metafile: true,
    platform: "browser",
    plugins: [dependencyPlugin],
    write: false,
  });
  const absoluteFiles = [
    ...new Set(
      Object.keys(result.metafile.inputs)
        .map((filePath) => resolve(repoRoot, filePath))
        .filter((filePath) => filePath.startsWith(repoRoot)),
    ),
  ].sort();
  const files = absoluteFiles.map((filePath) => relative(repoRoot, filePath));
  const externalSpecifiers = [
    ...new Set(
      Object.values(result.metafile.outputs)
        .flatMap((output) => output.imports)
        .filter((entry) => entry.external)
        .map((entry) => entry.path),
    ),
  ].sort();

  return { absoluteFiles, externalSpecifiers, files };
}

const externalizeDependencies: Plugin = {
  name: "externalize-astryx-cutover-dependencies",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, ({ path }) => ({ external: true, path }));
  },
};

const externalizeWorkerDependencies: Plugin = {
  name: "externalize-astryx-cutover-worker-dependencies",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, ({ path }) =>
      path === "@dpeek/formless-site-app" ||
      path.startsWith("@dpeek/formless-site-app/") ||
      path.startsWith("@dpeek/formless-astryx/")
        ? undefined
        : { external: true, path },
    );
  },
};

function forbiddenCandidateSpecifier(specifier: string) {
  return (
    specifier === "@dpeek/formless-astryx" ||
    specifier.startsWith("@dpeek/formless-ui") ||
    specifier.startsWith("@tailwindcss/") ||
    specifier === "tailwindcss"
  );
}

function forbiddenSelectedWorkerFile(path: string): boolean {
  return (
    path.startsWith("lib/site-app/src/react/legacy-") ||
    path.startsWith("lib/ui/") ||
    path.includes("/legacy-") ||
    path.includes("src/app/") ||
    path.includes("lib/astryx/src/application-") ||
    path.includes("lib/astryx/src/components/formless-ui-") ||
    path.includes("lib/astryx/src/components/shell.tsx")
  );
}

function forbiddenSelectedWorkerSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("@dpeek/formless-ui") ||
    specifier.startsWith("@tailwindcss/") ||
    specifier === "tailwindcss"
  );
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
    } else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files.sort();
}

function importSpecifiers(sourceText: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      if (match[1]) {
        specifiers.push(match[1]);
      }
    }
  }

  return specifiers;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
