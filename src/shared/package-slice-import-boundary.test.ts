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

  it("keeps Formless Astryx consumers on documented package exports", async () => {
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

  it("keeps Astryx Site imports on exact documented package exports", async () => {
    const failures: string[] = [];
    const astryxRoot = resolve(repoRoot, "lib/astryx");
    const siteSourceRoot = resolve(repoRoot, "lib/site-app/src");
    const packageJson = JSON.parse(await readFile(resolve(astryxRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    for (const filePath of await sourceFiles(astryxRoot)) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (
          (specifier === "@dpeek/formless-site-app" ||
            specifier.startsWith("@dpeek/formless-site-app/")) &&
          !allowedAstryxSitePackageImport(filePath, specifier)
        ) {
          failures.push(`${path}: imports Site through undocumented export ${specifier}`);
        }

        if (relativeImportResolvesInside(filePath, specifier, siteSourceRoot)) {
          failures.push(`${path}: imports private Site source ${specifier}`);
        }
      }
    }

    expect(packageJson.dependencies?.["@dpeek/formless-site-app"]).toBe("^0.1.0");
    expect(failures).toEqual([]);
  });

  it("keeps the Site package independent from Astryx and its application contract host", async () => {
    const failures: string[] = [];
    const siteRoot = resolve(repoRoot, "lib/site-app");
    const astryxSourceRoot = resolve(repoRoot, "lib/astryx/src");
    const packageJson = JSON.parse(
      await readFile(resolve(siteRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;

    for (const filePath of await sourceFiles(siteRoot)) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (
          specifier === "@dpeek/formless-astryx" ||
          specifier.startsWith("@dpeek/formless-astryx/") ||
          relativeImportResolvesInside(filePath, specifier, astryxSourceRoot)
        ) {
          failures.push(`${path}: imports Astryx through ${specifier}`);
        }
      }
    }

    for (const dependencyGroup of ["dependencies", "devDependencies", "peerDependencies"]) {
      const dependencies = packageJson[dependencyGroup];

      if (
        typeof dependencies === "object" &&
        dependencies !== null &&
        "@dpeek/formless-astryx" in dependencies
      ) {
        failures.push(`lib/site-app/package.json: declares ${dependencyGroup} on Astryx`);
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
  "@dpeek/formless-site-app/public/react",
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

const allowedFormlessAstryxPackageImports = new Set([
  "@dpeek/formless-astryx/contract",
  "@dpeek/formless-astryx/contract-host",
  "@dpeek/formless-astryx/contract-host/react",
  "@dpeek/formless-astryx/site/renderer",
]);

const allowedAstryxSitePackageImports = new Set([
  "@dpeek/formless-site-app",
  "@dpeek/formless-site-app/public/react",
]);

const allowedAstryxSiteTestPackageImports = new Set([
  "@dpeek/formless-site-app/react",
  "@dpeek/formless-site-app/worker",
]);

function allowedAstryxSitePackageImport(filePath: string, specifier: string): boolean {
  return (
    allowedAstryxSitePackageImports.has(specifier) ||
    (filePath.includes(".test.") && allowedAstryxSiteTestPackageImports.has(specifier))
  );
}

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
  if (allowedFormlessAstryxPackageImports.has(specifier)) {
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

function relativeImportResolvesInside(
  importerPath: string,
  specifier: string,
  parent: string,
): boolean {
  if (!specifier.startsWith(".")) {
    return false;
  }

  return pathInside(resolve(dirname(importerPath), specifier), parent);
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
