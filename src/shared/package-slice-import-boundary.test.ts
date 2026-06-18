import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("package slice import boundaries", () => {
  it("keeps schema consumers on the public package root", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenSchemaPackageImport(specifier)) {
          failures.push(`${path}: deep-imports schema package ${specifier}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps archive consumers on public package subpaths", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenArchivePackageImport(specifier)) {
          failures.push(`${path}: deep-imports archive package ${specifier}`);
        }

        if (forbiddenArchivePackageInternalImport(filePath, specifier)) {
          failures.push(`${path}: imports archive package internal ${specifier}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

const allowedArchivePackageImports = new Set([
  "@dpeek/formless-archive",
  "@dpeek/formless-archive/node",
]);

async function boundarySourceFiles(): Promise<string[]> {
  const nestedFiles = await Promise.all([
    sourceFiles(resolve(repoRoot, "src")),
    sourceFiles(resolve(repoRoot, "lib")),
    sourceFiles(resolve(repoRoot, "scripts")),
  ]);

  return [...nestedFiles.flat(), resolve(repoRoot, "vite.config.ts")].sort();
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        files.push(...(await sourceFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && sourceFileExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
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

function forbiddenSchemaPackageImport(specifier: string): boolean {
  return specifier.startsWith("@dpeek/formless-schema/");
}

function forbiddenArchivePackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-archive" || specifier.startsWith("@dpeek/formless-archive/")) &&
    !allowedArchivePackageImports.has(specifier)
  );
}

function forbiddenArchivePackageInternalImport(importerPath: string, specifier: string): boolean {
  const importerRelativePath = relative(repoRoot, importerPath);

  if (importerRelativePath.startsWith("lib/archive/")) {
    return false;
  }

  if (specifier.includes("lib/archive/src/")) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedSpecifier = resolve(dirname(importerPath), specifier);
  const resolvedRelativePath = relative(repoRoot, resolvedSpecifier);

  return resolvedRelativePath.startsWith("lib/archive/src/");
}

const sourceFileExtensions = new Set([".ts", ".tsx"]);
