import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(repoRoot, "scripts/formless-bin.ts");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
  bin: Record<string, string>;
  files: string[];
  scripts: Record<string, string>;
};

describe("Formless package executable", () => {
  it("publishes the Bun TypeScript entrypoint without a generated bundle", () => {
    expect(packageJson.bin).toEqual({ formless: "scripts/formless-bin.ts" });
    expect(packageJson.files).toContain("scripts");
    expect(packageJson.files).toContain("src");
    expect(packageJson.files).not.toContain("bin");
    expect(packageJson.scripts).not.toHaveProperty("prepack");
    expect(existsSync(path.join(repoRoot, "scripts/build-package.ts"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "bin/formless.js"))).toBe(false);

    const source = readFileSync(entrypoint, "utf8");
    expect(source.startsWith("#!/usr/bin/env bun\n")).toBe(true);

    if (process.platform !== "win32") {
      expect(statSync(entrypoint).mode & 0o111).not.toBe(0);
    }
  });

  it("runs CLI help directly from TypeScript with Bun", () => {
    const result = spawnSync("bun", [entrypoint, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: formless <command>");
  });
});
