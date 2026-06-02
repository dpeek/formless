import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  agentStatePaths,
  branchNameForChange,
  buildLocalOpenSpecFinalizationPrompt,
  buildLocalOpenSpecImplementationPrompt,
  classifyChangeLease,
  createChangeLease,
  detachWorktreeAtBranchTip,
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
  worktreeDirForWorker,
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
        owner: "olga",
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
      expect(findWorkerActiveLease(paths.root, "olga")).toBeNull();
      expect(releaseChangeLease(paths.root, "add-thing", "olga")).toBe(false);
      expect(releaseChangeLease(paths.root, "add-thing", "igor")).toBe(true);
      expect(readChangeLease(paths.root, "add-thing")).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("classifies valid, stale, blocked, released, and review-ready leases", () => {
    const root = tempDir();
    const paths = agentStatePaths(root);
    ensureAgentStateDirs(paths);

    try {
      const fresh = createChangeLease(paths.root, {
        changeId: "fresh-thing",
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        owner: "igor",
        state: "working",
      }).lease;
      const stale = createChangeLease(paths.root, {
        changeId: "stale-thing",
        now: () => new Date("2026-05-27T00:00:00.000Z"),
        owner: "igor",
        state: "working",
      }).lease;
      const blocked = createChangeLease(paths.root, {
        changeId: "blocked-thing",
        owner: "igor",
        state: "blocked",
      }).lease;
      const reviewReady = createChangeLease(paths.root, {
        changeId: "review-thing",
        owner: "igor",
        state: "ready-for-review",
      }).lease;

      expect(
        classifyChangeLease(fresh, {
          isProcessAlive: () => true,
          now: () => new Date("2026-05-28T00:01:00.000Z"),
          staleHeartbeatMs: 60 * 60 * 1000,
        }).kind,
      ).toBe("valid-active");
      expect(
        classifyChangeLease(stale, {
          isProcessAlive: () => true,
          now: () => new Date("2026-05-28T00:00:00.000Z"),
          staleHeartbeatMs: 60 * 60 * 1000,
        }),
      ).toMatchObject({ kind: "stale-active" });
      expect(
        classifyChangeLease(
          fresh
            ? {
                ...fresh,
                heartbeatAt: "2026-05-28T00:00:00.000Z",
                pid: 12345,
              }
            : null,
          {
            isProcessAlive: () => false,
            now: () => new Date("2026-05-28T00:01:00.000Z"),
            staleHeartbeatMs: 60 * 60 * 1000,
          },
        ),
      ).toMatchObject({ kind: "stale-active", reason: "recorded pid 12345 is not alive" });
      expect(classifyChangeLease(blocked).kind).toBe("blocked");
      expect(classifyChangeLease(reviewReady).kind).toBe("ready-for-review");
      expect(classifyChangeLease(null)).toMatchObject({ kind: "released" });
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
      if (command === "git") {
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
      }

      if (
        command === "openspec" &&
        args.join(" ") === "instructions apply --change add-thing --json"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: JSON.stringify({ progress: { remaining: 1 }, state: "in_progress" }),
        };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
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

  it("recovers a stale active lease before claiming work", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const paths = agentStatePaths(gitCommonDir);
    ensureAgentStateDirs(paths);
    createChangeLease(paths.root, {
      changeId: "add-thing",
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      owner: "olga",
      state: "working",
    });
    let sessionCalls = 0;
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
        return { code: 0, stderr: "", stdout: readyChangeFiles("add-thing") };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "instructions apply --change add-thing --json"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: JSON.stringify({ progress: { remaining: 1 }, state: "in_progress" }),
        };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") ===
          `worktree add -b changes/add-thing ${path.join(root, "tmp", "worktree", "igor")} main`
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      const code = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        runCommand,
        runSession: async (input) => {
          sessionCalls += 1;
          expect(input.changeId).toBe("add-thing");
          expect(input.mode).toBe("implement");
          return "task-done";
        },
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });

      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(sessionCalls).toBe(1);
      expect(stdout).toContain("[agents] released add-thing: stale working lease recovered");
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        owner: "igor",
        state: "working",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps blocked leases visible and releasable", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const paths = agentStatePaths(gitCommonDir);
    ensureAgentStateDirs(paths);
    createChangeLease(paths.root, {
      changeId: "add-thing",
      latestEvidence: {
        at: "2026-05-28T00:00:00.000Z",
        message: "branch setup failed for add-thing",
      },
      owner: "olga",
      state: "blocked",
    });
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
        return { code: 0, stderr: "", stdout: readyChangeFiles("add-thing") };
      }

      if (
        command === "git" &&
        args.join(" ") === "for-each-ref --format=%(refname:short) refs/heads/changes"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };
    const streams = {
      stderr: {
        write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
      } as Pick<NodeJS.WriteStream, "write">,
      stdout: {
        write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
      } as Pick<NodeJS.WriteStream, "write">,
    };

    try {
      const watchCode = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:01:00.000Z"),
        runCommand,
        ...streams,
      });
      expect(watchCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("[agents] blocked add-thing: branch setup failed for add-thing");
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        latestEvidence: {
          message: "branch setup failed for add-thing",
        },
        state: "blocked",
      });

      const releaseCode = await runAgentsCli(["release", "add-thing", "--owner", "olga"], {
        cwd: root,
        runCommand,
        ...streams,
      });

      expect(releaseCode).toBe(0);
      expect(readChangeLease(paths.root, "add-thing")).toBeNull();
      expect(stdout).toContain("released add-thing");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("omits already-complete changes from claimable work even without a lease", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      if (
        command === "git" &&
        args.join(" ") === "ls-tree -r --name-only main -- openspec/changes"
      ) {
        return { code: 0, stderr: "", stdout: readyChangeFiles("add-thing") };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "instructions apply --change add-thing --json"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: JSON.stringify({ progress: { remaining: 0 }, state: "all_done" }),
        };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    expect(discoverClaimableOpenSpecChanges("/repo", { runCommand })).toEqual([]);
  });

  it("uses stable change branch names", () => {
    const missingBranch: CommandRunner = () => ({ code: 1, stderr: "", stdout: "" });
    const existingBranch: CommandRunner = () => ({ code: 0, stderr: "", stdout: "" });

    expect(branchNameForChange("add-thing")).toBe("changes/add-thing");
    expect(worktreeDirForWorker("/repo", "igor")).toBe("/repo/tmp/worktree/igor");
    expect(
      planChangeBranch("/repo", "add-thing", {
        runCommand: missingBranch,
        workerName: "igor",
      }),
    ).toMatchObject({
      action: "create",
      branch: "changes/add-thing",
      worktreeDir: "/repo/tmp/worktree/igor",
    });
    expect(
      planChangeBranch("/repo", "add-thing", {
        runCommand: existingBranch,
        workerName: "igor",
      }),
    ).toMatchObject({
      action: "resume",
      branch: "changes/add-thing",
      worktreeDir: "/repo/tmp/worktree/igor",
    });
  });
});

describe("local agent worker review branches", () => {
  it("detaches the worker worktree at the review-ready branch tip", () => {
    const calls: Array<{ args: string[]; command: string; cwd: string }> = [];
    const runCommand: CommandRunner = (cwd, command, args) => {
      calls.push({ args, command, cwd });
      if (command === "git" && args.join(" ") === "rev-parse --verify changes/add-thing") {
        return { code: 0, stderr: "", stdout: "abc123\n" };
      }
      if (command === "git" && args.join(" ") === "checkout --detach abc123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      return { code: 1, stderr: `unexpected command: ${command} ${args.join(" ")}`, stdout: "" };
    };

    expect(
      detachWorktreeAtBranchTip("/repo/tmp/worktree/igor", "changes/add-thing", runCommand),
    ).toBe("abc123");
    expect(calls).toEqual([
      {
        args: ["rev-parse", "--verify", "changes/add-thing"],
        command: "git",
        cwd: "/repo/tmp/worktree/igor",
      },
      {
        args: ["checkout", "--detach", "abc123"],
        command: "git",
        cwd: "/repo/tmp/worktree/igor",
      },
    ]);
  });

  it("keeps finalized changes leased so watch does not finalize them again", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const commandCalls: Array<{ args: string[]; command: string; cwd: string }> = [];
    let branchExists = false;
    let remainingWork = 1;
    let sessionCalls = 0;
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      commandCalls.push({ args, command, cwd });
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
        return { code: 0, stderr: "", stdout: readyChangeFiles("add-thing") };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
      ) {
        return { code: branchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args[0] === "worktree" &&
        args[1] === "add" &&
        args[2] === "-b" &&
        args[3] === "changes/add-thing"
      ) {
        branchExists = true;
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "instructions apply --change add-thing --json"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: JSON.stringify({
            progress: { remaining: remainingWork },
            state: remainingWork === 0 ? "all_done" : "in_progress",
          }),
        };
      }

      if (command === "git" && args.join(" ") === "rev-parse --verify changes/add-thing") {
        return { code: 0, stderr: "", stdout: "abc123\n" };
      }

      if (command === "git" && args.join(" ") === "checkout --detach abc123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "for-each-ref --format=%(refname:short) refs/heads/changes"
      ) {
        return { code: 0, stderr: "", stdout: "changes/add-thing\n" };
      }

      if (
        command === "git" &&
        args.join(" ") === "merge-base --is-ancestor main changes/add-thing"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "merge-base --is-ancestor changes/add-thing main"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };
    const streams = {
      stderr: {
        write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
      } as Pick<NodeJS.WriteStream, "write">,
      stdout: {
        write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
      } as Pick<NodeJS.WriteStream, "write">,
    };

    try {
      const firstCode = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        runCommand,
        runSession: async (input) => {
          sessionCalls += 1;
          expect(input.changeId).toBe("add-thing");
          if (sessionCalls === 1) {
            expect(input.mode).toBe("implement");
            remainingWork = 0;
            return "plan-done";
          }

          expect(input.mode).toBe("finalize");
          return "plan-done";
        },
        ...streams,
      });
      const paths = agentStatePaths(gitCommonDir);

      expect(firstCode).toBe(0);
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        changeId: "add-thing",
        owner: "igor",
        state: "ready-for-review",
      });
      expect(readWorkerStatus(paths.root, "igor")).toMatchObject({
        currentChange: "add-thing",
        state: "ready-for-review",
      });

      const secondCode = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:01:00.000Z"),
        runCommand,
        runSession: async () => {
          sessionCalls += 1;
          return "plan-done";
        },
        ...streams,
      });

      expect(secondCode).toBe(0);
      expect(sessionCalls).toBe(2);
      expect(stdout).toContain("[agents] idle: change branches are leased");
      expect(stderr).toBe("");
      expect(commandCalls).toContainEqual({
        args: ["checkout", "--detach", "abc123"],
        command: "git",
        cwd: path.join(root, "tmp", "worktree", "igor"),
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not reclaim an all_done change when the ready lease is missing", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    let sessionCalls = 0;
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
        return { code: 0, stderr: "", stdout: readyChangeFiles("add-thing") };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "instructions apply --change add-thing --json"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: JSON.stringify({ progress: { remaining: 0 }, state: "all_done" }),
        };
      }

      if (
        command === "git" &&
        args.join(" ") === "for-each-ref --format=%(refname:short) refs/heads/changes"
      ) {
        return { code: 0, stderr: "", stdout: "changes/add-thing\n" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      const code = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        runCommand,
        runSession: async () => {
          sessionCalls += 1;
          return "plan-done";
        },
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });

      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(sessionCalls).toBe(0);
      expect(stdout).toContain("[agents] idle: change branches are complete");
      expect(readChangeLease(agentStatePaths(gitCommonDir).root, "add-thing")).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("starts finalization maintenance when a review-ready branch is behind main", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const paths = agentStatePaths(gitCommonDir);
    ensureAgentStateDirs(paths);
    createChangeLease(paths.root, {
      changeId: "add-thing",
      now: () => new Date("2026-05-28T00:00:00.000Z"),
      owner: "olga",
      state: "ready-for-review",
    });
    let sessionCalls = 0;
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "merge-base --is-ancestor main changes/add-thing"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "merge-base --is-ancestor changes/add-thing main"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") ===
          `worktree add ${path.join(root, "tmp", "worktree", "igor")} changes/add-thing`
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "rev-parse --verify changes/add-thing") {
        return { code: 0, stderr: "", stdout: "def456\n" };
      }

      if (command === "git" && args.join(" ") === "checkout --detach def456") {
        return { code: 0, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command in ${cwd}: ${command} ${args.join(" ")}`);
    };

    try {
      const code = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:01:00.000Z"),
        runCommand,
        runSession: async (input) => {
          sessionCalls += 1;
          expect(input.mode).toBe("finalize");
          expect(input.changeId).toBe("add-thing");
          expect(input.worktreeDir).toBe(path.join(root, "tmp", "worktree", "igor"));
          return "plan-done";
        },
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });

      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(sessionCalls).toBe(1);
      expect(stdout).toContain("[agents] ready maintenance add-thing");
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        changeId: "add-thing",
        owner: "igor",
        state: "ready-for-review",
      });
      expect(readWorkerStatus(paths.root, "igor")).toMatchObject({
        currentChange: "add-thing",
        state: "ready-for-review",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("releases review-ready leases after branch deletion or merge", async () => {
    for (const scenario of [
      {
        branchExists: false,
        branchMerged: false,
        branchList: "",
        expectedNotice:
          "[agents] released add-thing: ready-for-review lease complete: branch changes/add-thing no longer exists",
      },
      {
        branchExists: true,
        branchMerged: true,
        branchList: "changes/add-thing\n",
        expectedNotice:
          "[agents] released add-thing: ready-for-review lease complete: branch changes/add-thing is merged into main",
      },
    ]) {
      const root = tempDir();
      const gitCommonDir = path.join(root, ".git");
      const paths = agentStatePaths(gitCommonDir);
      ensureAgentStateDirs(paths);
      createChangeLease(paths.root, {
        changeId: "add-thing",
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        owner: "olga",
        state: "ready-for-review",
      });
      let sessionCalls = 0;
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
          args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
        ) {
          return { code: scenario.branchExists ? 0 : 1, stderr: "", stdout: "" };
        }

        if (
          command === "git" &&
          args.join(" ") === "merge-base --is-ancestor changes/add-thing main"
        ) {
          return { code: scenario.branchMerged ? 0 : 1, stderr: "", stdout: "" };
        }

        if (
          command === "git" &&
          args.join(" ") === "ls-tree -r --name-only main -- openspec/changes"
        ) {
          return { code: 0, stderr: "", stdout: readyChangeFiles("add-thing") };
        }

        if (
          command === "openspec" &&
          args.join(" ") === "instructions apply --change add-thing --json"
        ) {
          return {
            code: 0,
            stderr: "",
            stdout: JSON.stringify({ progress: { remaining: 0 }, state: "all_done" }),
          };
        }

        if (
          command === "git" &&
          args.join(" ") === "for-each-ref --format=%(refname:short) refs/heads/changes"
        ) {
          return { code: 0, stderr: "", stdout: scenario.branchList };
        }

        throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
      };

      try {
        const code = await runAgentsCli(["watch", "igor", "--once"], {
          cwd: root,
          now: () => new Date("2026-05-28T00:01:00.000Z"),
          runCommand,
          runSession: async () => {
            sessionCalls += 1;
            return "plan-done";
          },
          stderr: {
            write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
          } as Pick<NodeJS.WriteStream, "write">,
          stdout: {
            write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
          } as Pick<NodeJS.WriteStream, "write">,
        });

        expect(code).toBe(0);
        expect(stderr).toBe("");
        expect(sessionCalls).toBe(0);
        expect(stdout).toContain(scenario.expectedNotice);
        expect(readChangeLease(paths.root, "add-thing")).toBeNull();
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    }
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

      if (
        command === "openspec" &&
        args.join(" ") === "instructions apply --change local-agent-pull-workers --json"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: JSON.stringify({ progress: { remaining: 1 }, state: "in_progress" }),
        };
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
      expect(stdout).toContain(`${root}/tmp/worktree/igor`);
      expect(stdout).toContain('"state":"dry-run"');
      expect(stdout).toContain("codex exec");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("local OpenSpec implementation prompt", () => {
  it("uses one tasks.md heading section as the implementation unit", () => {
    const prompt = buildLocalOpenSpecImplementationPrompt("add-thing", "igor");

    expect(prompt).toContain(
      "Implement one ready `##` task section from OpenSpec change `add-thing`.",
    );
    expect(prompt).toContain("Start with the `##` section containing the first unchecked task.");
    expect(prompt).toContain("until the next `##` heading or end of file.");
    expect(prompt).toContain("Do not cross into another `##` section.");
    expect(prompt).toContain("stop with `<blocked/>` and record split guidance");
    expect(prompt).toContain("Commit the `##` section with a concise message.");
    expect(prompt).not.toContain("Rebase current branch on local `main` before final commit.");
  });
});

describe("local OpenSpec finalization prompt", () => {
  it("keeps review-ready branches promoted but unarchived", () => {
    const prompt = buildLocalOpenSpecFinalizationPrompt("add-thing", "igor");

    expect(prompt).toContain("Finalize before marking the branch ready for review.");
    expect(prompt).toContain("reconcile implementation and promoted spec diffs");
    expect(prompt).toContain("Promote shipped facts into relevant `openspec/specs/*/spec.md`.");
    expect(prompt).toContain("Do not create an empty commit only for a clean rebase.");
    expect(prompt).toContain("Do not archive the OpenSpec change.");
    expect(prompt).toContain(
      "Detach the worker worktree at the final `changes/add-thing` branch tip before marking ready.",
    );
    expect(prompt).not.toContain("openspec archive");
  });
});
