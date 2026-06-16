import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const libRoot = resolve(repoRoot, "lib");
const rootSourceDir = resolve(repoRoot, "src");
const rootTestSourceDir = resolve(rootSourceDir, "test");
const packageSourceExtensions = new Set([".ts", ".tsx"]);
const importResolveExtensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".css"] as const;

type WorkspacePackageInfo = {
  name: string;
  publicSubpaths: Set<string>;
  root: string;
  sourceRoot: string;
};

describe("package internal import boundaries", () => {
  it("keeps lib package source on package-local files and public package exports", async () => {
    const packages = await workspacePackages();
    const packageList = [...packages.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    const failures: string[] = [];

    for (const packageInfo of packageList) {
      for (const filePath of await sourceFiles(packageInfo.sourceRoot)) {
        const source = await readFile(filePath, "utf8");

        for (const specifier of importSpecifiers(source)) {
          failures.push(
            ...(await boundaryFailuresForImport(filePath, specifier, packageInfo, packageList)),
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

async function boundaryFailuresForImport(
  filePath: string,
  specifier: string,
  importerPackage: WorkspacePackageInfo,
  packages: readonly WorkspacePackageInfo[],
): Promise<string[]> {
  const workspacePackage = workspacePackageForSpecifier(specifier, packages);
  const fileLabel = relative(repoRoot, filePath);

  if (workspacePackage) {
    const subpath = packageSubpath(specifier, workspacePackage.name);

    if (!workspacePackage.publicSubpaths.has(subpath)) {
      return [
        `${fileLabel}: imports undocumented workspace package subpath "${specifier}" instead of a public export`,
      ];
    }

    return [];
  }

  if (!isRelativeSpecifier(specifier)) {
    return [];
  }

  const resolvedImport = await resolveRelativeImport(filePath, specifier);

  if (!resolvedImport) {
    return [`${fileLabel}: cannot resolve relative import "${specifier}"`];
  }

  const resolvedLabel = relative(repoRoot, resolvedImport);

  if (isInside(rootTestSourceDir, resolvedImport)) {
    return [
      `${fileLabel}: relative import "${specifier}" resolves into repo-root src/test at ${resolvedLabel}`,
    ];
  }

  if (isInside(rootSourceDir, resolvedImport)) {
    return [
      `${fileLabel}: relative import "${specifier}" resolves into repo-root src at ${resolvedLabel}`,
    ];
  }

  const targetPackage = packageForPath(resolvedImport, packages);

  if (!targetPackage) {
    if (!isInside(importerPackage.root, resolvedImport)) {
      return [
        `${fileLabel}: relative import "${specifier}" leaves package root at ${resolvedLabel}`,
      ];
    }

    return [];
  }

  if (targetPackage.name !== importerPackage.name) {
    return [
      `${fileLabel}: relative import "${specifier}" enters ${targetPackage.name} at ${resolvedLabel}; use its public package export`,
    ];
  }

  return [];
}

async function workspacePackages(): Promise<Map<string, WorkspacePackageInfo>> {
  const entries = await readdir(libRoot, { withFileTypes: true });
  const packages = new Map<string, WorkspacePackageInfo>();

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

    packages.set(packageJson.name, {
      name: packageJson.name,
      publicSubpaths: publicSubpathsForExports(packageJson.exports),
      root,
      sourceRoot: resolve(root, "src"),
    });
  }

  return packages;
}

async function sourceFiles(dir: string): Promise<string[]> {
  if (!(await fileExists(dir))) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && packageSourceExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
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

async function resolveRelativeImport(
  importerPath: string,
  specifier: string,
): Promise<string | null> {
  const withoutQuery = specifier.split("?")[0] ?? specifier;
  const basePath = resolve(dirname(importerPath), withoutQuery);

  return resolveImportTarget(basePath);
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

function workspacePackageForSpecifier(
  specifier: string,
  packages: readonly WorkspacePackageInfo[],
): WorkspacePackageInfo | undefined {
  return packages.find(
    (packageInfo) => specifier === packageInfo.name || specifier.startsWith(`${packageInfo.name}/`),
  );
}

function packageSubpath(specifier: string, packageName: string): string {
  if (specifier === packageName) {
    return ".";
  }

  return `.${specifier.slice(packageName.length)}`;
}

function packageForPath(
  filePath: string,
  packages: readonly WorkspacePackageInfo[],
): WorkspacePackageInfo | undefined {
  return packages.find((packageInfo) => isInside(packageInfo.root, filePath));
}

function publicSubpathsForExports(exportsField: unknown): Set<string> {
  if (typeof exportsField === "string") {
    return new Set(["."]);
  }

  if (!isRecord(exportsField)) {
    return new Set();
  }

  return new Set(Object.keys(exportsField).filter((key) => key.startsWith(".")));
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function isInside(root: string, target: string): boolean {
  const relativePath = relative(root, target);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
