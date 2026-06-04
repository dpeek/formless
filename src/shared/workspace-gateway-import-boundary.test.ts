import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("workspace gateway import boundary", () => {
  it("keeps gateway consumers on public package subpaths", async () => {
    const failures: string[] = [];

    for (const path of forbiddenLegacyGatewayFiles) {
      if (await fileExists(resolve(repoRoot, path))) {
        failures.push(`${path}: legacy gateway module still exists`);
      }
    }

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenLegacyGatewayImport(specifier)) {
          failures.push(`${path}: imports legacy gateway module ${specifier}`);
        }

        if (forbiddenGatewayPackageImport(specifier)) {
          failures.push(`${path}: deep-imports gateway package ${specifier}`);
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

const forbiddenLegacyGatewayFiles = [
  "src/shared/workspace-gateway-protocol.ts",
  "src/shared/workspace-gateway-protocol.test.ts",
  "src/client/workspace-gateway.ts",
  "src/client/workspace-gateway.test.ts",
  "src/worker/workspace-gateway-proxy.ts",
  "src/worker/workspace-gateway-proxy.test.ts",
  "src/site/local-workspace-gateway.ts",
  "src/site/local-workspace-gateway.test.ts",
];

const legacyGatewayImportPatterns = [
  /(^|\/)workspace-gateway-protocol(\.ts)?$/,
  /(^|\/)workspace-gateway(\.test)?(\.ts)?$/,
  /(^|\/)workspace-gateway-proxy(\.test)?(\.ts)?$/,
  /(^|\/)local-workspace-gateway(\.test)?(\.ts)?$/,
];

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

function forbiddenLegacyGatewayImport(specifier: string): boolean {
  return legacyGatewayImportPatterns.some((pattern) => pattern.test(specifier));
}

function forbiddenGatewayPackageImport(specifier: string): boolean {
  return (
    specifier.startsWith("@dpeek/formless-gateway") && !allowedGatewayPackageImports.has(specifier)
  );
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
