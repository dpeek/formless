import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const astryxRoot = resolve(repoRoot, "lib/astryx");
const applicationAssemblyEntry = resolve(astryxRoot, "src/application-assembly.tsx");
const applicationProviderEntry = resolve(astryxRoot, "src/application-provider.tsx");
const publicSiteEntry = resolve(astryxRoot, "src/site-renderer.tsx");

describe("Astryx application import boundary", () => {
  it("exports only complete application, contract-host, and public Site boundaries", async () => {
    const packageJson = JSON.parse(await readFile(resolve(astryxRoot, "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };

    expect(packageJson.exports).toEqual({
      "./application/assembly": "./src/application-assembly.tsx",
      "./application/global.css": "./src/application.css",
      "./application/provider": "./src/application-provider.tsx",
      "./contract": "./src/formless-ui-contract.ts",
      "./contract-host": "./src/formless-ui-contract-host.ts",
      "./contract-host/react": "./src/formless-ui-contract-host-react.tsx",
      "./site/global.css": "./src/global.css",
      "./site/provider": "./src/site-provider.tsx",
      "./site/renderer": "./src/site-renderer.tsx",
    });
  });

  it("keeps the complete application graph on presentation and stable host modules", async () => {
    const graph = await entryGraph(applicationAssemblyEntry);
    const astryxFiles = graph.files.filter((path) => path.startsWith("lib/astryx/src/"));

    expect(astryxFiles).toEqual(
      expect.arrayContaining([
        "lib/astryx/src/application-assembly.tsx",
        "lib/astryx/src/components/formless-ui-access-renderer.tsx",
        "lib/astryx/src/components/formless-ui-application-system-state-renderer.tsx",
        "lib/astryx/src/components/formless-ui-auth-renderer.tsx",
        "lib/astryx/src/components/formless-ui-create-renderer.tsx",
        "lib/astryx/src/components/formless-ui-list-renderer.tsx",
        "lib/astryx/src/components/formless-ui-management-renderer.tsx",
        "lib/astryx/src/components/formless-ui-record-result-renderer.tsx",
        "lib/astryx/src/components/formless-ui-table-renderer.tsx",
        "lib/astryx/src/components/formless-ui-tree-renderer.tsx",
        "lib/astryx/src/components/formless-ui-workspace-collection-renderer.tsx",
        "lib/astryx/src/components/formless-ui-workspace-screen-renderer.tsx",
        "lib/astryx/src/components/fields/renderer.tsx",
        "lib/astryx/src/components/operation-controls.tsx",
        "lib/astryx/src/components/shell.tsx",
        "lib/astryx/src/components/theme.tsx",
        "lib/astryx/src/formless-ui-contract-host-react.tsx",
      ]),
    );
    expect(graph.files.filter(forbiddenApplicationFile)).toEqual([]);
    expect(graph.externalSpecifiers.filter(forbiddenApplicationSpecifier)).toEqual([]);
  });

  it("keeps provider, application CSS, and public Site graphs independent", async () => {
    const [providerGraph, publicGraph, applicationCss, publicCss] = await Promise.all([
      entryGraph(applicationProviderEntry),
      entryGraph(publicSiteEntry),
      readFile(resolve(astryxRoot, "src/application.css"), "utf8"),
      readFile(resolve(astryxRoot, "src/global.css"), "utf8"),
    ]);

    expect(providerGraph.files).toEqual([
      "lib/astryx/src/application-provider.tsx",
      "lib/astryx/src/theme.tsx",
    ]);
    expect(publicGraph.files.filter(forbiddenPublicGraphFile)).toEqual([]);
    expect(applicationCss).toContain('@import "@astryxdesign/core/reset.css";');
    expect(applicationCss).toContain('@import "@astryxdesign/theme-neutral/theme.css";');
    expect(applicationCss).not.toContain("astryx-public-site");
    expect(publicCss).toContain("[data-astryx-public-site-provider]");
  });
});

async function entryGraph(entryPoint: string) {
  const result = await build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    jsx: "automatic",
    metafile: true,
    platform: "browser",
    plugins: [externalizeDependencies],
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
  name: "externalize-astryx-dependencies",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, ({ path }) => ({ external: true, path }));
  },
};

function forbiddenApplicationFile(path: string) {
  return (
    (path.startsWith("src/") && !path.startsWith("lib/astryx/src/")) ||
    path.includes(".fixtures.") ||
    path.startsWith("lib/astryx/src/fixtures/") ||
    applicationPrototypeFiles.has(path) ||
    path.startsWith("lib/astryx/src/components/site") ||
    path === "lib/astryx/src/site-provider.tsx" ||
    path === "lib/astryx/src/site-renderer.tsx"
  );
}

function forbiddenApplicationSpecifier(specifier: string) {
  return (
    specifier === "@dpeek/formless-astryx" ||
    specifier.startsWith("@dpeek/formless-ui") ||
    specifier.startsWith("@dpeek/formless-media") ||
    specifier.startsWith("@dpeek/formless-storage") ||
    specifier.startsWith("@dpeek/formless-installed-apps") ||
    specifier.startsWith("@dpeek/formless-gateway")
  );
}

function forbiddenPublicGraphFile(path: string) {
  return (
    path === "lib/astryx/src/application-assembly.tsx" ||
    path === "lib/astryx/src/application-provider.tsx" ||
    path.startsWith("lib/astryx/src/components/formless-ui-") ||
    path === "lib/astryx/src/components/shell.tsx" ||
    path === "lib/astryx/src/components/side-nav.tsx" ||
    path === "lib/astryx/src/theme.tsx"
  );
}

const applicationPrototypeFiles = new Set([
  "lib/astryx/src/main.tsx",
  "lib/astryx/src/root.tsx",
  "lib/astryx/src/components/access.tsx",
  "lib/astryx/src/components/application-shell.tsx",
  "lib/astryx/src/components/auth.tsx",
  "lib/astryx/src/components/create-surfaces.tsx",
  "lib/astryx/src/components/fields.tsx",
  "lib/astryx/src/components/fixture-layout.tsx",
  "lib/astryx/src/components/formless-ui-fields.tsx",
  "lib/astryx/src/components/generated-fields.tsx",
  "lib/astryx/src/components/generated-workspace.tsx",
  "lib/astryx/src/components/instance-management.tsx",
  "lib/astryx/src/components/lists.tsx",
  "lib/astryx/src/components/operations.tsx",
  "lib/astryx/src/components/record-results.tsx",
  "lib/astryx/src/components/tables.tsx",
  "lib/astryx/src/components/tree-results.tsx",
]);
