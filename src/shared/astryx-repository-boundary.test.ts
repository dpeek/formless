import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const astryxRoot = resolve(repoRoot, "lib/astryx");
const astryxSourceRoot = resolve(astryxRoot, "src");
const applicationAssemblyEntry = resolve(astryxSourceRoot, "application-assembly.tsx");
const publicSiteRendererEntry = resolve(astryxSourceRoot, "site-renderer.tsx");
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

const forbiddenPresentationDependencies = new Set([
  "@dpeek/formless-ui",
  "@tailwindcss/vite",
  "tailwindcss",
]);

describe("Astryx repository boundary", () => {
  it("keeps Astryx as the only production application and built-in Site selection", async () => {
    const [applicationSelector, appRoot, publicBrowserRoot, publicWorkerRoot, siteRenderer] =
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
    expect(await pathExists(applicationAssemblyEntry)).toBe(true);
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
      expect(productionRoot).not.toMatch(/rendererFlag|rendererMode|useLegacy|useAstryx/);
    }
    expect(siteRenderer).toContain("export { AstryxSitePageRenderer }");
    expect(siteRenderer).toContain("export { AstryxSitePublicSystemStateRenderer }");
  });

  it("keeps repository presentation imports on documented Astryx exports and package-owned styling", async () => {
    const failures: string[] = [];
    const sourcePaths = [
      ...(await sourceFiles(resolve(repoRoot, "src"))),
      ...(await sourceFiles(resolve(repoRoot, "lib"))),
    ];

    for (const filePath of sourcePaths) {
      const fileSource = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(fileSource)) {
        if (forbiddenPresentationSpecifier(specifier)) {
          failures.push(`${path}: imports unsupported presentation dependency ${specifier}`);
        }

        if (
          !filePath.startsWith(astryxSourceRoot) &&
          specifier.startsWith("@dpeek/formless-astryx") &&
          !documentedAstryxImports.has(specifier)
        ) {
          failures.push(`${path}: imports undocumented Astryx export ${specifier}`);
        }

        if (
          !filePath.startsWith(astryxSourceRoot) &&
          relativeImportResolvesInside(filePath, specifier, astryxSourceRoot)
        ) {
          failures.push(`${path}: imports private Astryx source ${specifier}`);
        }
      }

      if (!path.includes(".test.") && isPresentationSource(path)) {
        if (/(?:^|\/)legacy-[^/]+\.(?:js|jsx|ts|tsx)$/.test(path)) {
          failures.push(`${path}: retains a legacy presentation module`);
        }
        if (/className\s*=\s*(?:["'`]|\{\s*["'`])/.test(fileSource)) {
          failures.push(`${path}: contains static utility-class markup`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps manifests, exports, declarations, and the lockfile on current package boundaries", async () => {
    const manifestFailures: string[] = [];

    for (const manifestPath of await workspacePackageManifests()) {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      const path = relative(repoRoot, manifestPath);

      for (const dependencyGroup of ["dependencies", "devDependencies", "peerDependencies"]) {
        const dependencies = manifest[dependencyGroup];
        if (typeof dependencies !== "object" || dependencies === null) {
          continue;
        }

        for (const dependency of Object.keys(dependencies)) {
          if (forbiddenPresentationDependencies.has(dependency)) {
            manifestFailures.push(`${path}: declares ${dependencyGroup} on ${dependency}`);
          }
        }
      }
    }

    const astryxPackage = JSON.parse(await source("lib/astryx/package.json")) as {
      exports?: Record<string, string>;
    };
    const mediaPackage = JSON.parse(await source("lib/media/package.json")) as {
      exports?: Record<string, string>;
    };
    const documentedAstryxExportKeys = [...documentedAstryxImports]
      .map((specifier) => `.${specifier.slice("@dpeek/formless-astryx".length)}`)
      .sort();
    const declarations = await source("src/formless-virtual-modules.d.ts");
    const lockfile = await source("bun.lock");

    expect(manifestFailures).toEqual([]);
    expect(Object.keys(astryxPackage.exports ?? {}).sort()).toEqual(documentedAstryxExportKeys);
    expect(mediaPackage.exports).toEqual({
      ".": "./src/index.ts",
      "./client": "./src/client.ts",
      "./worker": "./src/worker.ts",
    });
    expect(await pathExists(resolve(repoRoot, "lib/media/src/react.tsx"))).toBe(false);
    expect(await pathExists(resolve(repoRoot, "lib/media/src/react.test.tsx"))).toBe(false);
    expect(await pathExists(resolve(repoRoot, "lib/ui"))).toBe(false);
    expect(declarations).not.toContain('declare module "*.css"');
    expect(lockfile).not.toContain("@dpeek/formless-ui");
    expect(lockfile).not.toContain('"lib/ui"');
    expect(lockfile).not.toContain('"@tailwindcss/vite"');
    expect(lockfile).not.toContain('"tailwindcss"');
  });

  it("keeps selected Astryx application, public browser, and public Worker graphs isolated", async () => {
    const [applicationGraph, publicGraph, workerGraph] = await Promise.all([
      entryGraph(applicationAssemblyEntry),
      entryGraph(publicSiteRendererEntry),
      entryGraph(publicSiteWorkerEntry, externalizeWorkerDependencies),
    ]);

    expect(applicationGraph.files).toEqual(
      expect.arrayContaining([
        "lib/astryx/src/application-assembly.tsx",
        "lib/astryx/src/components/formless-ui-workspace-screen-renderer.tsx",
        "lib/astryx/src/components/shell.tsx",
      ]),
    );
    expect(applicationGraph.files.filter(forbiddenApplicationFile)).toEqual([]);
    expect(applicationGraph.externalSpecifiers.filter(forbiddenPresentationSpecifier)).toEqual([]);

    expect(publicGraph.files).toEqual(
      expect.arrayContaining([
        "lib/astryx/src/components/site-system-state.tsx",
        "lib/astryx/src/components/site.tsx",
        "lib/astryx/src/site-provider.tsx",
        "lib/astryx/src/site-renderer.tsx",
      ]),
    );
    expect(publicGraph.files.filter(forbiddenPublicFile)).toEqual([]);
    expect(publicGraph.externalSpecifiers.filter(forbiddenPresentationSpecifier)).toEqual([]);

    expect(workerGraph.files).toEqual(
      expect.arrayContaining([
        "src/worker/public-site-worker-runtime.ts",
        "lib/astryx/src/components/site-system-state.tsx",
        "lib/astryx/src/components/site.tsx",
        "lib/astryx/src/site-provider.tsx",
        "lib/astryx/src/site-renderer.tsx",
      ]),
    );
    expect(workerGraph.files.filter(forbiddenWorkerFile)).toEqual([]);
    expect(workerGraph.externalSpecifiers.filter(forbiddenPresentationSpecifier)).toEqual([]);
  });
});

async function source(path: string) {
  return readFile(resolve(repoRoot, path), "utf8");
}

function count(sourceText: string, pattern: RegExp) {
  return [...sourceText.matchAll(pattern)].length;
}

function forbiddenPresentationSpecifier(specifier: string) {
  return (
    specifier === "@dpeek/formless-astryx" ||
    specifier.startsWith("@dpeek/formless-ui") ||
    specifier === "@dpeek/formless-media/react" ||
    specifier.startsWith("@tailwindcss/") ||
    specifier === "tailwindcss"
  );
}

function isPresentationSource(path: string) {
  return (
    path.startsWith("src/app/") ||
    path.startsWith("lib/astryx/src/") ||
    path.startsWith("lib/site-app/src/react/") ||
    path.startsWith("lib/site-app/src/worker/")
  );
}

function relativeImportResolvesInside(filePath: string, specifier: string, root: string) {
  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedSpecifier = resolve(dirname(filePath), specifier);
  return resolvedSpecifier === root || resolvedSpecifier.startsWith(`${root}/`);
}

function forbiddenApplicationFile(path: string) {
  return (
    path.startsWith("src/") ||
    path.startsWith("lib/site-app/") ||
    path.startsWith("lib/astryx/src/components/site") ||
    path === "lib/astryx/src/site-provider.tsx" ||
    path === "lib/astryx/src/site-renderer.tsx"
  );
}

function forbiddenPublicFile(path: string) {
  return (
    path.startsWith("src/") ||
    path.includes("lib/astryx/src/application-") ||
    path.includes("lib/astryx/src/components/formless-ui-") ||
    path.includes("lib/astryx/src/components/shell.tsx")
  );
}

function forbiddenWorkerFile(path: string) {
  return (
    path.startsWith("src/app/") ||
    path.includes("lib/astryx/src/application-") ||
    path.includes("lib/astryx/src/components/formless-ui-") ||
    path.includes("lib/astryx/src/components/shell.tsx")
  );
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
  const files = [
    ...new Set(
      Object.keys(result.metafile.inputs).map((filePath) =>
        relative(repoRoot, resolve(repoRoot, filePath)),
      ),
    ),
  ].sort();
  const externalSpecifiers = [
    ...new Set(
      Object.values(result.metafile.outputs)
        .flatMap((output) => output.imports)
        .filter((entry) => entry.external)
        .map((entry) => entry.path),
    ),
  ].sort();

  return { externalSpecifiers, files };
}

const externalizeDependencies: Plugin = {
  name: "externalize-astryx-repository-dependencies",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, ({ path }) => ({ external: true, path }));
  },
};

const externalizeWorkerDependencies: Plugin = {
  name: "externalize-astryx-repository-worker-dependencies",
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

async function workspacePackageManifests() {
  const manifests = [resolve(repoRoot, "package.json")];

  for (const entry of await readdir(resolve(repoRoot, "lib"), { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = resolve(repoRoot, "lib", entry.name, "package.json");
    if (await pathExists(manifestPath)) {
      manifests.push(manifestPath);
    }
  }

  return manifests.sort();
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
