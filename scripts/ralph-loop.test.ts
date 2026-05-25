import { describe, expect, it } from "vite-plus/test";

import { countOpenChunks, parseArgs, usage } from "./ralph-loop.ts";

describe("Ralph CLI", () => {
  it("documents the finalization command", () => {
    expect(usage()).toContain("bun ralph finalize --issue <number> [options]");
    expect(usage()).toContain("bun ralph finalise --issue <number> [options]");
    expect(usage()).toContain("promote docs and create the closing PRD commit");
    expect(usage()).toContain("New worktree base ref. Default: local main.");
  });

  it("parses finalization aliases as one-pass issue work", () => {
    const finalizeOptions = parseArgs(["finalize", "--issue", "#24", "--worktree"]);
    const finaliseOptions = parseArgs(["finalise", "--issue", "25", "--branch", "prd-final"]);

    expect(finalizeOptions).not.toBe("help");
    expect(finaliseOptions).not.toBe("help");

    if (finalizeOptions === "help" || finaliseOptions === "help") {
      throw new Error("Expected parsed Ralph options.");
    }

    expect(finalizeOptions).toMatchObject({
      issueNumber: 24,
      mode: "finalize",
      worktree: true,
    });
    expect(finaliseOptions).toMatchObject({
      branch: "prd-final",
      issueNumber: 25,
      mode: "finalize",
      worktree: true,
    });
  });

  it("keeps finalization out of the max-iteration loop", () => {
    expect(() => parseArgs(["finalize", "--issue", "24", "--max", "2"])).toThrow(
      "finalize runs one Codex pass; --max is not supported.",
    );
    expect(() => parseArgs(["finalize", "--pick"])).toThrow(
      "finalize requires <prd-path> or --issue <number>; --list and --pick are loop commands.",
    );
  });

  it("counts unfinished chunk rows for loop max-iteration defaults", () => {
    const prd = [
      "## Chunks",
      "",
      "| ID | Status | Scope |",
      "| --- | --- | --- |",
      "| C1 | shipped | Done. |",
      "| C2 | closed | Skipped. |",
      "| C3 | ready | Next. |",
      "| C4 | doing | Active. |",
      "| C5 | blocked | Needs dependency. |",
      "",
      "## Evidence",
    ].join("\n");

    expect(countOpenChunks(prd)).toBe(3);
  });
});
