import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const generatedRoot = fileURLToPath(new URL("./", import.meta.url));

const dormantNonLegacyPresentationModules = new Set([
  "color-field-control.tsx",
  "create-field-control.tsx",
  "field-control-primitives.tsx",
  "field-presentation.tsx",
  "generated-list-runtime.tsx",
  "generated-record-result-runtime.tsx",
  "operation-status.tsx",
  "readiness-warnings.tsx",
  "record-field-control.tsx",
  "record-field-display.tsx",
  "record-field-editor.tsx",
  "table-operation-controls.tsx",
  "table.tsx",
]);

const dormantNonLegacyPresentationTests = new Set([
  "color-field-control.test.tsx",
  "field-control-primitives.test.tsx",
  "field-presentation.test.ts",
  "operation-status.test.tsx",
  "record-field-control.test.tsx",
  "table.test.tsx",
]);

const liveRuntimeHelperEntries = [
  "formless-ui-intents.ts",
  "formless-ui-list-projection.ts",
  "formless-ui-operation-projection.ts",
  "formless-ui-projection.ts",
  "formless-ui-record-result-projection.ts",
  "formless-ui-shell-projection.ts",
  "formless-ui-table-projection.ts",
  "formless-ui-workspace-projection.ts",
  "generated-create-runtime.ts",
  "generated-list-foundation.ts",
  "generated-record-result-foundation.ts",
  "generated-table-foundation.tsx",
  "generated-tree-create-foundation.ts",
  "generated-tree-foundation.ts",
  "generated-workspace-foundation.ts",
  "generated-workspace-runtime.tsx",
  "home-operation-runtime.ts",
  "operation-control-runtime.ts",
  "record-delete-runtime.ts",
  "state-machine-operation-runtime.ts",
] as const;

const obsoleteFallbackEvidence = new Set(["collection.tsx", "screen.test.tsx", "screen.tsx"]);

describe("generated presentation import boundary", () => {
  it("classifies every non-legacy module coupled to dormant presentation", async () => {
    const graph = await generatedModuleGraph();
    const cleanup = cleanupModules(graph);
    const unclassified: string[] = [];

    for (const [fileName, node] of graph) {
      if (fileName.startsWith("legacy-") || fileName.includes(".test.")) {
        continue;
      }

      const coupled =
        importsLegacyPresentation(node.source) ||
        reachesCleanup(fileName, graph, cleanup, new Set());

      if (coupled && !dormantNonLegacyPresentationModules.has(fileName)) {
        unclassified.push(fileName);
      }
    }

    expect(unclassified.sort()).toEqual([]);
    expect([...dormantNonLegacyPresentationModules].filter((file) => !graph.has(file))).toEqual([]);
    expect([...dormantNonLegacyPresentationTests].filter((file) => !graph.has(file))).toEqual([]);
    expect([...obsoleteFallbackEvidence].filter((file) => graph.has(file))).toEqual([]);
  });

  it("keeps live runtime, contract, projection, selection, and operation helpers out of cleanup", async () => {
    const graph = await generatedModuleGraph();
    const cleanup = cleanupModules(graph);
    const failures: string[] = [];

    for (const entry of liveRuntimeHelperEntries) {
      const node = graph.get(entry);

      if (!node) {
        failures.push(entry + ": missing live helper entry");
        continue;
      }

      if (importsLegacyPresentation(node.source)) {
        failures.push(entry + ": directly imports legacy presentation");
      }

      const reached = reachableCleanup(entry, graph, cleanup);

      for (const cleanupFile of reached) {
        failures.push(entry + ": reaches cleanup module " + cleanupFile);
      }
    }

    expect(failures.sort()).toEqual([]);
  });
});

type ModuleNode = {
  imports: readonly string[];
  source: string;
};

async function generatedModuleGraph(): Promise<Map<string, ModuleNode>> {
  const entries = await readdir(generatedRoot, { withFileTypes: true });
  const sourceFiles = entries
    .filter(
      (entry) => entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")),
    )
    .map((entry) => entry.name)
    .sort();
  const knownFiles = new Set(sourceFiles);
  const graph = new Map<string, ModuleNode>();

  for (const fileName of sourceFiles) {
    const filePath = resolve(generatedRoot, fileName);
    const source = await readFile(filePath, "utf8");
    const imports = relativeImportSpecifiers(source)
      .map((specifier) => basename(resolve(dirname(filePath), specifier)))
      .filter((target) => knownFiles.has(target))
      .sort();

    graph.set(fileName, { imports, source });
  }

  return graph;
}

function cleanupModules(graph: ReadonlyMap<string, ModuleNode>): ReadonlySet<string> {
  return new Set(
    [...graph.keys()].filter(
      (fileName) =>
        fileName.startsWith("legacy-") ||
        dormantNonLegacyPresentationModules.has(fileName) ||
        dormantNonLegacyPresentationTests.has(fileName),
    ),
  );
}

function reachableCleanup(
  entry: string,
  graph: ReadonlyMap<string, ModuleNode>,
  cleanup: ReadonlySet<string>,
): string[] {
  const reached = new Set<string>();
  const queue = [entry];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const target of graph.get(current)?.imports ?? []) {
      if (cleanup.has(target)) {
        reached.add(target);
        continue;
      }

      queue.push(target);
    }
  }

  return [...reached].sort();
}

function reachesCleanup(
  fileName: string,
  graph: ReadonlyMap<string, ModuleNode>,
  cleanup: ReadonlySet<string>,
  visited: Set<string>,
): boolean {
  if (visited.has(fileName)) {
    return false;
  }

  visited.add(fileName);

  for (const target of graph.get(fileName)?.imports ?? []) {
    if (cleanup.has(target)) {
      return true;
    }

    if (reachesCleanup(target, graph, cleanup, visited)) {
      return true;
    }
  }

  return false;
}

function relativeImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["'](\.[^"']+)["']/g,
    /\bimport\s+["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];

      if (specifier) {
        specifiers.push(specifier.split("?")[0] ?? specifier);
      }
    }
  }

  return specifiers;
}

function importsLegacyPresentation(source: string): boolean {
  return (
    source.includes("@dpeek/formless-ui") ||
    source.includes("@dpeek/formless-media/react") ||
    /from\s+["']\.\/legacy-[^"']+["']/.test(source)
  );
}
