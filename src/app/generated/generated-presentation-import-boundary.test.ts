import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const generatedRoot = fileURLToPath(new URL("./", import.meta.url));

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

describe("generated presentation import boundary", () => {
  it("keeps runtime, contract, projection, selection, mutation, and operation helpers renderer-neutral", async () => {
    const entries = await readdir(generatedRoot, { withFileTypes: true });
    const sourceFiles = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.includes(".test.") &&
          (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")),
      )
      .map((entry) => entry.name)
      .sort();
    const failures: string[] = [];

    for (const fileName of sourceFiles) {
      const source = await readFile(resolve(generatedRoot, fileName), "utf8");

      if (importsDormantPresentation(source)) {
        failures.push(fileName);
      }
    }

    expect(liveRuntimeHelperEntries.filter((fileName) => !sourceFiles.includes(fileName))).toEqual(
      [],
    );
    expect(failures).toEqual([]);
  });
});

function importsDormantPresentation(source: string): boolean {
  return (
    source.includes("@dpeek/formless-ui") ||
    source.includes("@dpeek/formless-media/react") ||
    /from\s+["']\.\/legacy-[^"']+["']/.test(source)
  );
}
