import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  agentStatePaths,
  branchNameForChange,
  createChangeLease,
  discoverClaimableOpenSpecChanges,
  ensureAgentStateDirs,
  findWorkerActiveLease,
  makeWorkerStatus,
  planChangeBranch,
  readChangeLease,
  readWorkerStatus,
  releaseChangeLease,
  resolveAgentStatePaths,
  runAgentsCli,
  writeWorkerStatus,
  type CommandRunner,
} from "./agents.ts";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "formless-agents-"));
}

function readyChangeFiles(changeId = "add-thing"): string {
  return [
    `openspec/changes/${changeId}/proposal.md`,
    `openspec/changes/${changeId}/design.md`,
    `openspec/changes/${changeId}/tasks.md`,
    `openspec/changes/${changeId}/specs/local-agent-workers/spec.md`,
  ].join("\n");
}

describe("local agent worker state", () => {
  it("resolves shared state under git common dir", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      expect(command).toBe("git");
      expect(args).toEqual(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      return { code: 0, stderr: "", stdout: "/repo/.git\n" };
    };

    expect(resolveAgentStatePaths("/repo-worktree", runCommand)).toMatchObject({
      root: "/repo/.git/agent-state",
      leases: "/repo/.git/agent-state/leases",
      workers: "/repo/.git/agent-state/workers",
    });
  });

  it("uses an atomic lease directory for one active owner", () => {
    const root = tempDir();
    const paths = agentStatePaths(root);
    ensureAgentStateDirs(paths);

    try {
      const first = createChangeLease(paths.root, {
        changeId: "add-thing",
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        owner: "igor",
      });
      const second = createChangeLease(paths.root, {
        changeId: "add-thing",
        now: () => new Date("2026-05-28T00:01:00.000Z"),
        owner: "ralph",
      });

      expect(first.claimed).toBe(true);
      expect(first.lease).toMatchObject({
        branch: "changes/add-thing",
        changeId: "add-thing",
        owner: "igor",
        state: "claiming",
      });
      expect(second.claimed).toBe(false);
      expect(second.lease?.owner).toBe("igor");
      expect(readChangeLease(paths.root, "add-thing")?.owner).toBe("igor");
      expect(findWorkerActiveLease(paths.root, "igor")?.changeId).toBe("add-thing");
      expect(findWorkerActiveLease(paths.root, "ralph")).toBeNull();
      expect(releaseChangeLease(paths.root, "add-thing", "ralph")).toBe(false);
      expect(releaseChangeLease(paths.root, "add-thing", "igor")).toBe(true);
      expect(readChangeLease(paths.root, "add-thing")).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reads and writes worker status metadata", () => {
    const root = tempDir();
    const paths = agentStatePaths(root);
    ensureAgentStateDirs(paths);

    try {
      const status = makeWorkerStatus({
        branch: "changes/add-thing",
        currentChange: "add-thing",
        latestEvidence: {
          at: "2026-05-28T00:00:00.000Z",
          message: "claimed add-thing",
        },
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        owner: "igor",
        state: "working",
      });

      writeWorkerStatus(paths.root, status);

      expect(readWorkerStatus(paths.root, "igor")).toMatchObject({
        branch: "changes/add-thing",
        currentChange: "add-thing",
        owner: "igor",
        state: "working",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("local agent worker discovery", () => {
  it("discovers claimable changes from committed main files only", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      expect(command).toBe("git");
      expect(args).toEqual(["ls-tree", "-r", "--name-only", "main", "--", "openspec/changes"]);
      return {
        code: 0,
        stderr: "",
        stdout: [
          readyChangeFiles("add-thing"),
          "openspec/changes/incomplete/proposal.md",
          "openspec/changes/incomplete/tasks.md",
        ].join("\n"),
      };
    };

    expect(discoverClaimableOpenSpecChanges("/repo", { runCommand })).toEqual([
      {
        artifactPaths: readyChangeFiles("add-thing").split("\n").sort(),
        branch: "changes/add-thing",
        changeId: "add-thing",
      },
    ]);
  });

  it("omits leased changes from claimable work", () => {
    const root = tempDir();
    const paths = agentStatePaths(root);
    ensureAgentStateDirs(paths);
    const runCommand: CommandRunner = () => ({
      code: 0,
      stderr: "",
      stdout: readyChangeFiles("add-thing"),
    });

    try {
      createChangeLease(paths.root, { changeId: "add-thing", owner: "igor" });

      expect(
        discoverClaimableOpenSpecChanges("/repo", {
          runCommand,
          stateRoot: paths.root,
        }),
      ).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("uses stable change branch names", () => {
    const missingBranch: CommandRunner = () => ({ code: 1, stderr: "", stdout: "" });
    const existingBranch: CommandRunner = () => ({ code: 0, stderr: "", stdout: "" });

    expect(branchNameForChange("add-thing")).toBe("changes/add-thing");
    expect(planChangeBranch("/repo", "add-thing", { runCommand: missingBranch })).toMatchObject({
      action: "create",
      branch: "changes/add-thing",
    });
    expect(planChangeBranch("/repo", "add-thing", { runCommand: existingBranch })).toMatchObject({
      action: "resume",
      branch: "changes/add-thing",
    });
  });
});

describe("local agent worker dry-run", () => {
  it("shows igor claim, branch selection, status, and command output", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (_cwd, command, args) => {
      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      if (
        command === "git" &&
        args.join(" ") === "ls-tree -r --name-only main -- openspec/changes"
      ) {
        return { code: 0, stderr: "", stdout: readyChangeFiles("local-agent-pull-workers") };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/local-agent-pull-workers"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      const code = await runAgentsCli(["watch", "igor", "--once", "--dry-run"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        runCommand,
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });

      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("[agents] worker igor");
      expect(stdout).toContain("[agents] would claim local-agent-pull-workers");
      expect(stdout).toContain("changes/local-agent-pull-workers create");
      expect(stdout).toContain('"state":"dry-run"');
      expect(stdout).toContain("codex exec");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
