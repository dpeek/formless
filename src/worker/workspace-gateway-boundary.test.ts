import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const workerSourceDir = fileURLToPath(new URL("./", import.meta.url));

describe("Worker workspace gateway dependency boundary", () => {
  it("keeps local gateway execution and Node filesystem APIs out of Worker source", async () => {
    const failures: string[] = [];

    for (const filePath of await productionWorkerSourceFiles(workerSourceDir)) {
      const source = await readFile(filePath, "utf8");
      const path = relative(workerSourceDir, filePath);

      for (const rule of forbiddenWorkerGatewayDependencyRules) {
        if (rule.pattern.test(source)) {
          failures.push(`${path}: ${rule.label}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

const forbiddenWorkerGatewayDependencyRules = [
  {
    label: "imports local workspace gateway or workspace filesystem sidecar modules",
    pattern:
      /\b(?:from\s+|import\s*\(\s*)["'][^"']*(?:local-workspace-gateway|instance-workspace(?:-[^"']*)?)\.ts["']/,
  },
  {
    label: "imports Node filesystem, path, or process APIs",
    pattern: /\b(?:from\s+|import\s*\(\s*)["'](?:node:)?(?:fs|fs\/promises|path|process)["']/,
  },
  {
    label: "uses process environment or current working directory APIs",
    pattern: /\bprocess\.(?:cwd|env)\b/,
  },
] as const;

async function productionWorkerSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await productionWorkerSourceFiles(entryPath)));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      entry.name !== "miniflare-test.ts"
    ) {
      files.push(entryPath);
    }
  }

  return files.sort();
}
