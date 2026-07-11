import { readdir, readFile, stat } from "node:fs/promises";
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

  it("keeps Site source consumers on package public exports", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenSitePackageImport(specifier)) {
          failures.push(`${path}: deep-imports Site app package ${specifier}`);
        }

        if (forbiddenRootSiteSourceImport(specifier)) {
          failures.push(`${path}: imports removed root Site source path ${specifier}`);
        }
      }
    }

    expect(await pathExists(resolve(repoRoot, "schema/apps/site"))).toBe(false);
    expect(failures).toEqual([]);
  });

  it("keeps CRM source consumers on package public exports", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenCrmPackageImport(specifier)) {
          failures.push(`${path}: deep-imports CRM app package ${specifier}`);
        }

        if (forbiddenRootCrmSourceImport(specifier)) {
          failures.push(`${path}: imports removed root CRM source path ${specifier}`);
        }
      }
    }

    expect(await pathExists(resolve(repoRoot, "schema/apps/crm"))).toBe(false);
    expect(failures).toEqual([]);
  });

  it("keeps Tasks source consumers on package public exports", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenTasksPackageImport(specifier)) {
          failures.push(`${path}: deep-imports Tasks app package ${specifier}`);
        }

        if (forbiddenRootTasksSourceImport(specifier)) {
          failures.push(`${path}: imports removed root Tasks source path ${specifier}`);
        }
      }
    }

    expect(await pathExists(resolve(repoRoot, "schema/apps/tasks"))).toBe(false);
    expect(failures).toEqual([]);
  });

  it("keeps Formless UI contract consumers on the public contract subpath", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      if (pathInside(filePath, resolve(repoRoot, "lib/astryx"))) {
        continue;
      }

      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenFormlessAstryxImport(filePath, specifier)) {
          failures.push(`${path}: imports Formless Astryx through ${specifier}`);
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

const allowedSitePackageImports = new Set([
  "@dpeek/formless-site-app",
  "@dpeek/formless-site-app/formless.app.json",
  "@dpeek/formless-site-app/node",
  "@dpeek/formless-site-app/react",
  "@dpeek/formless-site-app/schema.json",
  "@dpeek/formless-site-app/seed-records.json",
  "@dpeek/formless-site-app/worker",
]);

const allowedCrmPackageImports = new Set([
  "@dpeek/formless-crm-app",
  "@dpeek/formless-crm-app/formless.app.json",
  "@dpeek/formless-crm-app/schema.json",
  "@dpeek/formless-crm-app/seed-records.json",
]);

const allowedTasksPackageImports = new Set([
  "@dpeek/formless-tasks-app",
  "@dpeek/formless-tasks-app/formless.app.json",
  "@dpeek/formless-tasks-app/schema.json",
  "@dpeek/formless-tasks-app/seed-records.json",
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

function forbiddenSitePackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-site-app" ||
      specifier.startsWith("@dpeek/formless-site-app/")) &&
    !allowedSitePackageImports.has(specifier)
  );
}

function forbiddenRootSiteSourceImport(specifier: string): boolean {
  return specifier.includes("schema/apps/site/");
}

function forbiddenCrmPackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-crm-app" || specifier.startsWith("@dpeek/formless-crm-app/")) &&
    !allowedCrmPackageImports.has(specifier)
  );
}

function forbiddenRootCrmSourceImport(specifier: string): boolean {
  return specifier.includes("schema/apps/crm/");
}

function forbiddenTasksPackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-tasks-app" ||
      specifier.startsWith("@dpeek/formless-tasks-app/")) &&
    !allowedTasksPackageImports.has(specifier)
  );
}

function forbiddenRootTasksSourceImport(specifier: string): boolean {
  return specifier.includes("schema/apps/tasks/");
}

function forbiddenFormlessAstryxImport(importerPath: string, specifier: string): boolean {
  if (specifier === "@dpeek/formless-astryx/contract") {
    return false;
  }

  if (specifier === "@dpeek/formless-astryx" || specifier.startsWith("@dpeek/formless-astryx/")) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedSpecifier = resolve(dirname(importerPath), specifier);

  return pathInside(resolvedSpecifier, resolve(repoRoot, "lib/astryx/src"));
}

function pathInside(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);

  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/"));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

const sourceFileExtensions = new Set([".ts", ".tsx"]);
