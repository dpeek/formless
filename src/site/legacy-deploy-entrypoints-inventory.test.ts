import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

type RetiredTerm = {
  label: string;
  pattern: RegExp;
};

const scanRoots = ["AGENTS.md", "README.md", "package.json", "scripts", "src", "openspec/specs"];
const retiredTerms: RetiredTerm[] = retiredTermPieces().map((pieces, index) => {
  const term = pieces.join("");

  return {
    label: `entrypoint-${index + 1}`,
    pattern: new RegExp(escapeRegExp(term), "gi"),
  };
});

describe("deploy entrypoint inventory", () => {
  it("keeps removed deploy entrypoint strings out of current code, docs, and specs", () => {
    const hits = sourceFiles().flatMap((filePath) => retiredVocabularyHits(filePath));

    expect(hits).toEqual([]);
  });
});

function retiredTermPieces(): string[][] {
  return [
    ["site", ":", "publish"],
    ["site", "-", "publish"],
    ["site", "Publish"],
    ["Site", "Publish"],
    ["local", " ", "publish"],
    ["local", " ", "Site", " ", "publish"],
    ["local", "-", "publish"],
    ["local", "Publish"],
    ["Local", "Publish"],
    ["publish", " ", "broker"],
    ["publish", "Broker"],
    ["Publish", "Broker"],
    ["direct", " ", "Cloudflare", " ", "fallback"],
    ["run", "-", "apply"],
    ["run", "Apply"],
    ["Run", "Apply"],
    ["apply", "-", "job"],
    ["apply", "-", "jobs"],
    ["apply", "Job"],
    ["Apply", "Job"],
    ["apply", " ", "job"],
    ["apply", " ", "jobs"],
    ["domain", " ", "provider", " ", "apply"],
    ["Domain", " ", "provider", " ", "apply"],
    ["formless", " ", "onboard"],
  ];
}

function retiredVocabularyHits(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const relativePath = path.relative(process.cwd(), filePath);
  const hits: Array<{ label: string; line: number; path: string; text: string }> = [];
  const lines = source.split("\n");

  for (const { label, pattern } of retiredTerms) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const line = 1 + source.slice(0, match.index).split("\n").length - 1;
      const text = lines[line - 1]?.trim() ?? "";

      hits.push({ label, line, path: relativePath, text });
    }
  }

  return hits;
}

function sourceFiles(): string[] {
  return scanRoots.flatMap((root) => walkSourcePath(path.resolve(root)));
}

function walkSourcePath(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const stats = statSync(filePath);

  if (stats.isDirectory()) {
    return readdirSync(filePath)
      .filter((entry) => !entry.startsWith("."))
      .flatMap((entry) => walkSourcePath(path.join(filePath, entry)));
  }

  if (!stats.isFile() || !isScannableTextFile(filePath)) {
    return [];
  }

  return [filePath];
}

function isScannableTextFile(filePath: string): boolean {
  return ["", ".cjs", ".cts", ".json", ".md", ".mjs", ".mts", ".ts", ".tsx"].includes(
    path.extname(filePath),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
