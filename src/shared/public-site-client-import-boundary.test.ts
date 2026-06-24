import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const libRoot = resolve(repoRoot, "lib");
const publicSiteClientEntry = resolve(repoRoot, "src/public-site-main.tsx");
const sourceFileExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const importResolveExtensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".css"] as const;

type WorkspacePackageInfo = {
  exports: Map<string, string>;
  name: string;
  root: string;
};

describe("public Site client import boundary", () => {
  it("keeps the public Site entrypoint on public renderer, read-only markdown, and form modules", async () => {
    const graph = await publicSiteClientImportGraph();
    const fileLabels = [...graph.files].map((filePath) => relative(repoRoot, filePath)).sort();
    const forbiddenFiles = fileLabels.filter(forbiddenPublicSiteClientFile);
    const forbiddenSpecifiers = [...graph.externalSpecifiers]
      .filter(forbiddenPublicSiteClientSpecifier)
      .sort();

    expect(fileLabels).toEqual(
      expect.arrayContaining([
        "src/public-site-main.tsx",
        "lib/site-app/src/react.tsx",
        "lib/site-app/src/react/route.tsx",
        "lib/site-app/src/react/renderer.tsx",
        "lib/site-app/src/react/blocks.tsx",
        "lib/site-app/src/react/contact-form.ts",
        "lib/site-app/src/react/subscribe-form.ts",
        "lib/site-app/src/react/turnstile.tsx",
        "lib/ui/src/markdown-renderer.tsx",
      ]),
    );
    expect(forbiddenFiles).toEqual([]);
    expect(forbiddenSpecifiers).toEqual([]);
  });
});

async function publicSiteClientImportGraph() {
  const packages = await workspacePackages();
  const files = new Set<string>();
  const externalSpecifiers = new Set<string>();
  const queue = [publicSiteClientEntry];

  while (queue.length > 0) {
    const filePath = queue.shift();

    if (!filePath || files.has(filePath)) {
      continue;
    }

    files.add(filePath);

    if (!sourceFileExtensions.has(extname(filePath))) {
      continue;
    }

    const source = await readFile(filePath, "utf8");

    for (const specifier of runtimeImportSpecifiers(source)) {
      const resolved = await resolveImportSpecifier(filePath, specifier, packages);

      if (!resolved) {
        externalSpecifiers.add(specifier);
        continue;
      }

      queue.push(resolved);
    }
  }

  return { externalSpecifiers, files };
}

async function resolveImportSpecifier(
  importerPath: string,
  specifier: string,
  packages: readonly WorkspacePackageInfo[],
): Promise<string | null> {
  if (specifier.startsWith(".")) {
    return resolveImportTarget(
      resolve(dirname(importerPath), specifier.split("?")[0] ?? specifier),
    );
  }

  const workspacePackage = packages.find(
    (packageInfo) => specifier === packageInfo.name || specifier.startsWith(`${packageInfo.name}/`),
  );

  if (!workspacePackage) {
    return null;
  }

  const subpath =
    specifier === workspacePackage.name
      ? "."
      : (`.${specifier.slice(workspacePackage.name.length)}` as const);
  const exportTarget = workspacePackage.exports.get(subpath);

  return exportTarget ? resolveImportTarget(resolve(workspacePackage.root, exportTarget)) : null;
}

async function workspacePackages(): Promise<WorkspacePackageInfo[]> {
  const entries = await readdir(libRoot, { withFileTypes: true });
  const packages: WorkspacePackageInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const root = resolve(libRoot, entry.name);
    const packageJsonPath = resolve(root, "package.json");

    if (!(await fileExists(packageJsonPath))) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      exports?: unknown;
      name?: unknown;
    };

    if (typeof packageJson.name !== "string") {
      continue;
    }

    packages.push({
      exports: packageExports(packageJson.exports),
      name: packageJson.name,
      root,
    });
  }

  return packages.sort((left, right) => right.name.length - left.name.length);
}

function packageExports(exportsValue: unknown): Map<string, string> {
  const exports = new Map<string, string>();

  if (typeof exportsValue === "string") {
    exports.set(".", exportsValue);
    return exports;
  }

  if (!isRecord(exportsValue)) {
    return exports;
  }

  for (const [subpath, value] of Object.entries(exportsValue)) {
    const target = packageExportTarget(value);

    if (target) {
      exports.set(subpath, target);
    }
  }

  return exports;
}

function packageExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ["browser", "import", "default"]) {
    const target = value[key];

    if (typeof target === "string") {
      return target;
    }
  }

  return undefined;
}

function runtimeImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+(?!type\b)["']([^"']+)["']/g,
    /\bimport\s+(?!type\b)[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /\bexport\s+(?!type\b)(?:\*|{[\s\S]*?})\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];

      if (specifier) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

async function resolveImportTarget(basePath: string): Promise<string | null> {
  const direct = await statOrNull(basePath);

  if (direct?.isFile()) {
    return basePath;
  }

  if (direct?.isDirectory()) {
    return resolveImportTarget(resolve(basePath, "index"));
  }

  const sourceMappedPath = await resolveSourceMappedJavaScriptImport(basePath);

  if (sourceMappedPath) {
    return sourceMappedPath;
  }

  for (const extension of importResolveExtensions) {
    const candidate = `${basePath}${extension}`;
    const candidateStat = await statOrNull(candidate);

    if (candidateStat?.isFile()) {
      return candidate;
    }
  }

  return null;
}

async function resolveSourceMappedJavaScriptImport(basePath: string): Promise<string | null> {
  const extension = extname(basePath);

  if (extension !== ".js" && extension !== ".jsx") {
    return null;
  }

  const pathWithoutExtension = basePath.slice(0, -extension.length);
  const sourceExtensions = extension === ".jsx" ? [".tsx", ".ts"] : [".ts", ".tsx"];

  for (const sourceExtension of sourceExtensions) {
    const candidate = `${pathWithoutExtension}${sourceExtension}`;
    const candidateStat = await statOrNull(candidate);

    if (candidateStat?.isFile()) {
      return candidate;
    }
  }

  return null;
}

async function fileExists(path: string): Promise<boolean> {
  return (await statOrNull(path)) !== null;
}

async function statOrNull(path: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function forbiddenPublicSiteClientFile(path: string): boolean {
  return (
    forbiddenPublicSiteClientFilePaths.has(path) ||
    path.startsWith("lib/ui/src/markdown-plate") ||
    path.startsWith("src/app/generated/") ||
    path.startsWith("src/client/")
  );
}

function forbiddenPublicSiteClientSpecifier(specifier: string): boolean {
  return (
    specifier === "@dpeek/formless-gateway/client" ||
    specifier === "@dpeek/formless-ui/markdown" ||
    specifier === "@dpeek/formless-ui/source-preview" ||
    specifier === "platejs" ||
    specifier.startsWith("platejs/") ||
    specifier.startsWith("@platejs/")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const forbiddenPublicSiteClientFilePaths = new Set([
  "src/app/app-surface.tsx",
  "src/app/generated-app-frame.tsx",
  "src/app/routes/home.tsx",
  "src/app/routes/instance-shell.tsx",
  "src/app/routes/local-session.tsx",
  "src/app/routes/owner-login.tsx",
  "src/app/routes/owner-setup.tsx",
  "lib/ui/src/markdown.tsx",
]);
