import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("package slice import boundaries", () => {
  it("keeps schema consumers on the public package root", async () => {
    const failures: string[] = [];

    for (const path of forbiddenLegacySchemaFiles) {
      if (await fileExists(resolve(repoRoot, path))) {
        failures.push(`${path}: legacy schema module still exists`);
      }
    }

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenLegacySchemaImport(path, specifier)) {
          failures.push(`${path}: imports legacy schema module ${specifier}`);
        }

        if (forbiddenSchemaPackageImport(specifier)) {
          failures.push(`${path}: deep-imports schema package ${specifier}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps archive consumers on public package subpaths", async () => {
    const failures: string[] = [];

    for (const path of forbiddenLegacyArchiveFiles) {
      if (await fileExists(resolve(repoRoot, path))) {
        failures.push(`${path}: legacy archive module still exists`);
      }
    }

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenLegacyArchiveImport(specifier)) {
          failures.push(`${path}: imports legacy archive module ${specifier}`);
        }

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

const allowedSchemaPackageImports = new Set(["@dpeek/formless-schema"]);

const allowedArchivePackageImports = new Set([
  "@dpeek/formless-archive",
  "@dpeek/formless-archive/node",
]);

const forbiddenLegacySchemaFiles = [
  "src/shared/create-defaults.ts",
  "src/shared/create-defaults.test.ts",
  "src/shared/field-types.ts",
  "src/shared/field-types.test.ts",
  "src/shared/fields.ts",
  "src/shared/query.ts",
  "src/shared/query.test.ts",
  "src/shared/read-model.ts",
  "src/shared/read-model.test.ts",
  "src/shared/schema.ts",
  "src/shared/schema.test.ts",
  "src/shared/schema-actions.ts",
  "src/shared/schema-collection-contexts.ts",
  "src/shared/schema-collection-results.ts",
  "src/shared/schema-control-plane.test.ts",
  "src/shared/schema-count-display.ts",
  "src/shared/schema-entity-names.ts",
  "src/shared/schema-fields.ts",
  "src/shared/schema-mutations.ts",
  "src/shared/schema-ordering.ts",
  "src/shared/schema-parse-helpers.ts",
  "src/shared/schema-read-models.ts",
  "src/shared/schema-relationships.ts",
  "src/shared/schema-runtime.ts",
  "src/shared/schema-screens.ts",
  "src/shared/schema-table-views.ts",
  "src/shared/schema-table-views.test.ts",
  "src/shared/schema-types.ts",
  "src/shared/schema-union-presentations.ts",
  "src/shared/schema-unions.ts",
  "src/shared/schema-view-field-parser.ts",
  "src/shared/schema-view-fields.ts",
  "src/shared/schema-views.ts",
];

const forbiddenLegacyArchiveFiles = [
  "src/shared/archive.ts",
  "src/shared/archive.test.ts",
  "src/shared/archive-normalizers.ts",
  "src/shared/archive-normalizers.test.ts",
  "src/shared/archive-restore-plan.ts",
  "src/shared/archive-restore-plan.test.ts",
];

const legacySchemaImportPatterns = [
  /(^|\/)create-defaults(\.test)?(\.ts)?$/,
  /(^|\/)field-types(\.test)?(\.ts)?$/,
  /(^|\/)fields(\.ts)?$/,
  /(^|\/)query(\.test)?(\.ts)?$/,
  /(^|\/)read-model(\.test)?(\.ts)?$/,
  /(^|\/)schema(\.test)?(\.ts)?$/,
  /(^|\/)schema-actions(\.ts)?$/,
  /(^|\/)schema-collection-contexts(\.ts)?$/,
  /(^|\/)schema-collection-results(\.ts)?$/,
  /(^|\/)schema-control-plane(\.test)?(\.ts)?$/,
  /(^|\/)schema-count-display(\.ts)?$/,
  /(^|\/)schema-entity-names(\.ts)?$/,
  /(^|\/)schema-fields(\.ts)?$/,
  /(^|\/)schema-mutations(\.ts)?$/,
  /(^|\/)schema-ordering(\.ts)?$/,
  /(^|\/)schema-parse-helpers(\.ts)?$/,
  /(^|\/)schema-read-models(\.ts)?$/,
  /(^|\/)schema-relationships(\.ts)?$/,
  /(^|\/)schema-runtime(\.ts)?$/,
  /(^|\/)schema-screens(\.ts)?$/,
  /(^|\/)schema-table-views(\.test)?(\.ts)?$/,
  /(^|\/)schema-types(\.ts)?$/,
  /(^|\/)schema-union-presentations(\.ts)?$/,
  /(^|\/)schema-unions(\.ts)?$/,
  /(^|\/)schema-view-field-parser(\.ts)?$/,
  /(^|\/)schema-view-fields(\.ts)?$/,
  /(^|\/)schema-views(\.ts)?$/,
];

const legacyArchiveImportPatterns = [
  /(^|\/)archive(\.test)?(\.ts)?$/,
  /(^|\/)archive-normalizers(\.test)?(\.ts)?$/,
  /(^|\/)archive-restore-plan(\.test)?(\.ts)?$/,
];

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

function forbiddenLegacySchemaImport(importerPath: string, specifier: string): boolean {
  if (
    importerPath.startsWith("lib/schema/src/") &&
    specifier.startsWith(".") &&
    !specifier.includes("src/shared/") &&
    !specifier.includes("/shared/")
  ) {
    return false;
  }

  return legacySchemaImportPatterns.some((pattern) => pattern.test(specifier));
}

function forbiddenSchemaPackageImport(specifier: string): boolean {
  return (
    specifier.startsWith("@dpeek/formless-schema/") && !allowedSchemaPackageImports.has(specifier)
  );
}

function forbiddenLegacyArchiveImport(specifier: string): boolean {
  return legacyArchiveImportPatterns.some((pattern) => pattern.test(specifier));
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

async function fileExists(path: string): Promise<boolean> {
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
