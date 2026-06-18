import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("workspace package import boundaries", () => {
  it("keeps Gateway and Workspace consumers on public package subpaths", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenGatewayPackageImport(specifier)) {
          failures.push(`${path}: deep-imports gateway package ${specifier}`);
        }

        if (forbiddenWorkspacePackageImport(specifier)) {
          failures.push(`${path}: deep-imports workspace package ${specifier}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

const allowedGatewayPackageImports = new Set([
  "@dpeek/formless-gateway",
  "@dpeek/formless-gateway/client",
  "@dpeek/formless-gateway/sidecar",
  "@dpeek/formless-gateway/worker",
]);

const allowedWorkspacePackageImports = new Set([
  "@dpeek/formless-workspace",
  "@dpeek/formless-workspace/node",
]);

async function boundarySourceFiles(): Promise<string[]> {
  const nestedFiles = await Promise.all([
    sourceFiles(resolve(repoRoot, "src")),
    sourceFiles(resolve(repoRoot, "lib")),
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

function forbiddenGatewayPackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-gateway" || specifier.startsWith("@dpeek/formless-gateway/")) &&
    !allowedGatewayPackageImports.has(specifier)
  );
}

function forbiddenWorkspacePackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-workspace" ||
      specifier.startsWith("@dpeek/formless-workspace/")) &&
    !allowedWorkspacePackageImports.has(specifier)
  );
}

const sourceFileExtensions = new Set([".ts", ".tsx"]);
