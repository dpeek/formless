import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  discoverClaimableOpenSpecChanges,
  ensureAgentStateDirs,
  ensureChangeBranch,
  findWorkerActiveLease,
  formatFormlessChangeCommitMessage,
  makeWorkerStatus,
  parseFormlessChangeCommitMessage,
  planChangeBranch,
  publishWorkerBranchToChangeBranch,
  queryLocalFormlessChangeBranches,
  readChangeLease,
  readWorkerStatus,
  releaseChangeLease,
  resolveAgentStatePaths,
  runAgentsCli,
  workerBranchName,
  worktreeDirForWorker,
  writeWorkerStatus,
  type ApplyInstructions,
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

function readyApplyInstructions(changeId = "add-thing"): ApplyInstructions {
  return {
    changeDir: `/repo/openspec/changes/${changeId}`,
    changeName: changeId,
    contextFiles: {
      design: [`/repo/openspec/changes/${changeId}/design.md`],
      proposal: [`/repo/openspec/changes/${changeId}/proposal.md`],
      specs: [`/repo/openspec/changes/${changeId}/specs/local-agent-workers/spec.md`],
      tasks: [`/repo/openspec/changes/${changeId}/tasks.md`],
    },
    instruction: "Read context files, work through pending tasks, mark complete as you go.",
    progress: {
      complete: 1,
      remaining: 2,
      total: 3,
    },
    schemaName: "spec-driven",
    state: "ready",
    tasks: [
      { description: "1.1 Finished task.", done: true, id: "1" },
      { description: "2.1 Select section before broad context reads.", done: false, id: "2" },
      { description: "2.2 Reuse devstate output evidence.", done: false, id: "3" },
    ],
  };
}

function validChangeCommitMessage(changeId = "add-thing"): string {
  return [
    `Implement ${changeId}`,
    "",
    "## Proposal",
    "",
    "Add the thing without changing storage shape.",
    "",
    "## Design",
    "",
    "Keep worker-owned state in the commit message.",
    "",
    "## Tasks",
    "",
    "### 1. Metadata",
    "",
    "- [ ] 1.1 Add parser.",
    "- [x] 1.2 Keep old sections.",
    "",
    "## Evidence",
    "",
    "- Initial proposal commit.",
    "",
    "## Blockers",
    "",
    "-",
    "",
    `Formless-Change-Id: ${changeId}`,
    "Formless-Change-Version: 1",
    "Formless-Change-State: ready",
    "Formless-Capabilities: local-agent-workers, spec-driven",
    "Formless-Last-Evidence-At: 2026-05-28T00:00:00.000Z",
    "",
  ].join("\n");
}

function writeImplementationEvidence(worktreeDir: string, changeId = "add-thing"): void {
  const changeDir = path.join(worktreeDir, "openspec", "changes", changeId);
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(
    path.join(changeDir, "tasks.md"),
    [
      "## 1. Work",
      "",
      "- [x] Run `devstate check` and record evidence.",
      "",
      "Evidence:",
      "- `devstate check` at 2026-05-28T00:00:00.000Z: checks ok.",
      "",
    ].join("\n"),
  );
}

function writeArchivedImplementationEvidence(worktreeDir: string, changeId = "add-thing"): void {
  const changeDir = path.join(
    worktreeDir,
    "openspec",
    "changes",
    "archive",
    `2026-05-28-${changeId}`,
  );
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(
    path.join(changeDir, "tasks.md"),
    [
      "## 1. Work",
      "",
      "- [x] Run `devstate check` and record evidence.",
      "",
      "Evidence:",
      "- `devstate check` at 2026-05-28T00:00:00.000Z: checks ok.",
      "",
    ].join("\n"),
  );
}

function writeDevstateStatus(worktreeDir: string): void {
  const statusDir = path.join(worktreeDir, ".devstate");
  mkdirSync(statusDir, { recursive: true });
  writeFileSync(
    path.join(statusDir, "status.md"),
    [
      "# Dev Tool State",
      "",
      "## Summary",
      "",
      "- checks: ok",
      "- services: running",
      "- updated: 2026-05-28T00:00:00.000Z",
      "",
    ].join("\n"),
  );
}

describe("Formless change metadata", () => {
  it("parses valid proposal, design, tasks, evidence, blockers, and trailers", () => {
    const result = parseFormlessChangeCommitMessage(validChangeCommitMessage(), {
      branch: "changes/add-thing",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.errors.join("\n"));
    }

    expect(result.metadata.trailers).toEqual({
      capabilities: ["local-agent-workers", "spec-driven"],
      changeId: "add-thing",
      lastEvidenceAt: "2026-05-28T00:00:00.000Z",
      state: "ready",
      version: "1",
    });
    expect(result.metadata.proposal).toBe("Add the thing without changing storage shape.");
    expect(result.metadata.design).toBe("Keep worker-owned state in the commit message.");
    expect(result.metadata.evidence).toBe("- Initial proposal commit.");
    expect(result.metadata.blockers).toBe("-");
    expect(result.metadata.taskSections).toEqual([
      {
        heading: "1. Metadata",
        line: 1,
        tasks: [
          { description: "Add parser.", done: false, id: "1.1", line: 3 },
          { description: "Keep old sections.", done: true, id: "1.2", line: 4 },
        ],
      },
    ]);
  });

  it("formats task state, evidence, blockers, and trailers while preserving unchanged sections", () => {
    const message = validChangeCommitMessage();
    const formatted = formatFormlessChangeCommitMessage(message, {
      appendEvidence: "- `devstate check`: checks ok.",
      blockers: "-",
      taskStates: [{ done: true, id: "1.1" }],
      trailers: {
        lastEvidenceAt: "2026-05-28T00:05:00.000Z",
        state: "working",
      },
    });

    expect(formatted).toContain("## Proposal\n\nAdd the thing without changing storage shape.");
    expect(formatted).toContain("## Design\n\nKeep worker-owned state in the commit message.");
    expect(formatted).toContain("- [x] 1.1 Add parser.");
    expect(formatted).toContain("- Initial proposal commit.\n- `devstate check`: checks ok.");
    expect(formatted).toContain("Formless-Change-State: working");
    expect(formatted).toContain("Formless-Last-Evidence-At: 2026-05-28T00:05:00.000Z");

    const parsed = parseFormlessChangeCommitMessage(formatted, { branch: "changes/add-thing" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.errors.join("\n"));
    }
    expect(parsed.metadata.tasks.filter((task) => !task.done)).toHaveLength(0);
  });

  it("reports missing required trailers", () => {
    const result = parseFormlessChangeCommitMessage(
      validChangeCommitMessage().replace("Formless-Change-State: ready\n", ""),
      { branch: "changes/add-thing" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected metadata to be invalid.");
    }
    expect(result.errors).toContain(
      "Missing required change metadata trailer: Formless-Change-State",
    );
  });

  it("reports branch and change id mismatches", () => {
    const result = parseFormlessChangeCommitMessage(validChangeCommitMessage("add-thing"), {
      branch: "changes/other-thing",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected metadata to be invalid.");
    }
    expect(result.errors).toContain(
      "Change metadata id add-thing does not match branch changes/other-thing.",
    );
  });

  it("reports malformed task sections", () => {
    const result = parseFormlessChangeCommitMessage(
      validChangeCommitMessage().replace("- [ ] 1.1 Add parser.", "- [maybe] 1.1 Add parser."),
      { branch: "changes/add-thing" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected metadata to be invalid.");
    }
    expect(result.errors).toContain(
      "Malformed task checkbox at Tasks line 3: - [maybe] 1.1 Add parser.",
    );
  });

  it("queries branch metadata from commit messages and ignores notes or untracked files", () => {
    const commands: string[] = [];
    const runCommand: CommandRunner = (_cwd, command, args) => {
      commands.push([command, ...args].join(" "));
      if (command === "git" && args[0] === "for-each-ref") {
        return {
          code: 0,
          stderr: "",
          stdout: "changes/add-thing\nchanges/bad-thing\nfeature/ignored\n",
        };
      }
      if (
        command === "git" &&
        args.join(" ") === "log --no-notes -1 --format=%B changes/add-thing"
      ) {
        return { code: 0, stderr: "", stdout: validChangeCommitMessage("add-thing") };
      }
      if (
        command === "git" &&
        args.join(" ") === "log --no-notes -1 --format=%B changes/bad-thing"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: validChangeCommitMessage("bad-thing").replace(
            "Formless-Change-Id: bad-thing\n",
            "",
          ),
        };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const result = queryLocalFormlessChangeBranches("/repo", runCommand);

    expect(result.changes).toEqual([
      {
        blockerSummary: null,
        branch: "changes/add-thing",
        capabilities: ["local-agent-workers", "spec-driven"],
        changeId: "add-thing",
        latestEvidenceAt: "2026-05-28T00:00:00.000Z",
        remainingTasks: 1,
        state: "ready",
        valid: true,
      },
    ]);
    expect(result.invalid).toEqual([
      {
        branch: "changes/bad-thing",
        errors: ["Missing required change metadata trailer: Formless-Change-Id"],
        valid: false,
      },
    ]);
    expect(commands.some((command) => command.startsWith("git notes"))).toBe(false);
    expect(commands.some((command) => command.startsWith("git status"))).toBe(false);
  });

  it("prints JSON change query command output with invalid metadata errors", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runCommand: CommandRunner = (_cwd, command, args) => {
      if (command === "git" && args[0] === "for-each-ref") {
        return { code: 0, stderr: "", stdout: "changes/add-thing\nchanges/bad-thing\n" };
      }
      if (
        command === "git" &&
        args.join(" ") === "log --no-notes -1 --format=%B changes/add-thing"
      ) {
        return { code: 0, stderr: "", stdout: validChangeCommitMessage("add-thing") };
      }
      if (
        command === "git" &&
        args.join(" ") === "log --no-notes -1 --format=%B changes/bad-thing"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: validChangeCommitMessage("bad-thing").replace("Formless-Change-Version: 1\n", ""),
        };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const code = await runAgentsCli(["changes", "--json"], {
      cwd: "/repo",
      runCommand,
      stderr: {
        write: (value) => {
          stderr.push(String(value));
          return true;
        },
      },
      stdout: {
        write: (value) => {
          stdout.push(String(value));
          return true;
        },
      },
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(""))).toEqual({
      changes: [
        {
          blockerSummary: null,
          branch: "changes/add-thing",
          capabilities: ["local-agent-workers", "spec-driven"],
          changeId: "add-thing",
          latestEvidenceAt: "2026-05-28T00:00:00.000Z",
          remainingTasks: 1,
          state: "ready",
          valid: true,
        },
      ],
      invalid: [
        {
          branch: "changes/bad-thing",
          errors: [
            "Missing required change metadata trailer: Formless-Change-Version",
            "Formless-Change-Version must be a positive integer.",
          ],
          valid: false,
        },
      ],
    });
  });
});

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
          stdout: JSON.stringify(readyApplyInstructions()),
        };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    expect(discoverClaimableOpenSpecChanges("/repo", { runCommand })).toEqual([
      {
        artifactPaths: readyChangeFiles("add-thing").split("\n").sort(),
        applyInstructions: readyApplyInstructions(),
        branch: "changes/add-thing",
        changeId: "add-thing",
      },
    ]);
  });

  it("orders claimable changes by existing unmerged review branch before change id", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      if (
        command === "git" &&
        args.join(" ") === "ls-tree -r --name-only main -- openspec/changes"
      ) {
        return {
          code: 0,
          stderr: "",
          stdout: [readyChangeFiles("alpha-new"), readyChangeFiles("zeta-started")].join("\n"),
        };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/alpha-new"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/zeta-started"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "merge-base --is-ancestor changes/alpha-new main"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "merge-base --is-ancestor changes/zeta-started main"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      if (command === "openspec" && args[0] === "instructions" && args[1] === "apply") {
        const changeId = args[3];
        if (changeId === "alpha-new") {
          return {
            code: 0,
            stderr: "",
            stdout: JSON.stringify(readyApplyInstructions(changeId)),
          };
        }

        if (changeId === "zeta-started") {
          return {
            code: 0,
            stderr: "",
            stdout: JSON.stringify(readyApplyInstructions(changeId)),
          };
        }
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    expect(
      discoverClaimableOpenSpecChanges("/repo", { runCommand }).map((change) => change.changeId),
    ).toEqual(["zeta-started", "alpha-new"]);
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
    let reviewBranchExists = false;
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
          stdout: JSON.stringify(readyApplyInstructions()),
        };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
      ) {
        return { code: reviewBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "branch changes/add-thing main") {
        reviewBranchExists = true;
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/agents/igor"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") ===
          `worktree add -b agents/igor ${path.join(root, "tmp", "worktree", "igor")} changes/add-thing`
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: "abc123\n" };
      }

      if (command === "git" && args.join(" ") === "branch -f changes/add-thing abc123") {
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
          expect(input.applyInstructions?.state).toBe("ready");
          expect(input.applyInstructions?.tasks?.find((task) => !task.done)?.description).toBe(
            "2.1 Select section before broad context reads.",
          );
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

  it("uses stable review branch and worker branch names", () => {
    const missingBranch: CommandRunner = () => ({ code: 1, stderr: "", stdout: "" });
    const existingBranch: CommandRunner = () => ({ code: 0, stderr: "", stdout: "" });

    expect(branchNameForChange("add-thing")).toBe("changes/add-thing");
    expect(workerBranchName("igor")).toBe("agents/igor");
    expect(worktreeDirForWorker("/repo", "igor")).toBe("/repo/tmp/worktree/igor");
    expect(
      planChangeBranch("/repo", "add-thing", {
        runCommand: missingBranch,
        workerName: "igor",
      }),
    ).toMatchObject({
      action: "create",
      branch: "changes/add-thing",
      workerBranch: "agents/igor",
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
      workerBranch: "agents/igor",
      worktreeDir: "/repo/tmp/worktree/igor",
    });
  });

  it("does not reset the worker branch when resuming an active lease", () => {
    const root = tempDir();
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    mkdirSync(worktreeDir, { recursive: true });
    const calls: Array<{ args: string[]; command: string; cwd: string }> = [];
    const runCommand: CommandRunner = (cwd, command, args) => {
      calls.push({ args, command, cwd });
      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return { code: 0, stderr: "", stdout: `${worktreeDir}\n` };
      }

      if (command === "git" && args.join(" ") === "branch --show-current") {
        return { code: 0, stderr: "", stdout: "agents/igor\n" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      expect(
        ensureChangeBranch(root, "add-thing", {
          resetWorkerBranch: false,
          runCommand,
          workerName: "igor",
          worktreeDir,
        }),
      ).toMatchObject({
        branch: "changes/add-thing",
        workerBranch: "agents/igor",
        worktreeDir,
      });
      expect(calls).not.toContainEqual({
        args: ["reset", "--keep", "changes/add-thing"],
        command: "git",
        cwd: worktreeDir,
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("local agent worker review branches", () => {
  it("publishes the worker branch tip to the review branch", () => {
    const calls: Array<{ args: string[]; command: string; cwd: string }> = [];
    const runCommand: CommandRunner = (cwd, command, args) => {
      calls.push({ args, command, cwd });
      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: "abc123\n" };
      }
      if (command === "git" && args.join(" ") === "branch -f changes/add-thing abc123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      return { code: 1, stderr: `unexpected command: ${command} ${args.join(" ")}`, stdout: "" };
    };

    expect(
      publishWorkerBranchToChangeBranch(
        {
          action: "resume",
          branch: "changes/add-thing",
          workerBranch: "agents/igor",
          worktreeDir: "/repo/tmp/worktree/igor",
        },
        runCommand,
      ),
    ).toBe("abc123");
    expect(calls).toEqual([
      {
        args: ["rev-parse", "--verify", "HEAD"],
        command: "git",
        cwd: "/repo/tmp/worktree/igor",
      },
      {
        args: ["branch", "-f", "changes/add-thing", "abc123"],
        command: "git",
        cwd: "/repo/tmp/worktree/igor",
      },
    ]);
  });

  it("validates, archives, commits, and keeps finalized changes leased", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    const commandCalls: Array<{ args: string[]; command: string; cwd: string }> = [];
    let reviewBranchExists = false;
    let workerBranchExists = false;
    let remainingWork = 1;
    let sessionCalls = 0;
    const headReads = ["impl123\n", "before123\n", "after123\n", "final123\n"];
    let committed = false;
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
        return { code: reviewBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "branch changes/add-thing main") {
        reviewBranchExists = true;
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/agents/igor"
      ) {
        return { code: workerBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args[0] === "worktree" &&
        args[1] === "add" &&
        args[2] === "-b" &&
        args[3] === "agents/igor"
      ) {
        workerBranchExists = true;
        writeImplementationEvidence(worktreeDir);
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
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

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "final123\n" };
      }

      if (command === "git" && args.join(" ") === "rebase main") {
        return { code: 0, stderr: "", stdout: "Current branch agents/igor is up to date.\n" };
      }

      if (command === "git" && args.join(" ") === "diff --name-only before123 after123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "validate add-thing --strict --no-interactive"
      ) {
        return { code: 0, stderr: "", stdout: "Change 'add-thing' is valid\n" };
      }

      if (command === "openspec" && args.join(" ") === "archive add-thing --yes") {
        return { code: 0, stderr: "", stdout: "Archived add-thing\n" };
      }

      if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
        return {
          code: 0,
          stderr: "",
          stdout: committed
            ? ""
            : [
                " M openspec/specs/local-agent-workers/spec.md",
                " D openspec/changes/add-thing/tasks.md",
                "?? openspec/changes/archive/2026-05-28-add-thing/tasks.md",
              ].join("\n"),
        };
      }

      if (command === "git" && args.join(" ") === "add -A") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "commit -m Finalize add-thing") {
        committed = true;
        return { code: 0, stderr: "", stdout: "[agents/igor abc123] Finalize add-thing\n" };
      }

      if (
        command === "git" &&
        (args.join(" ") === "branch -f changes/add-thing impl123" ||
          args.join(" ") === "branch -f changes/add-thing final123")
      ) {
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
          expect(input.mode).toBe("implement");
          remainingWork = 0;
          return "plan-done";
        },
        ...streams,
      });
      const paths = agentStatePaths(gitCommonDir);

      expect(firstCode).toBe(0);
      const readyLease = readChangeLease(paths.root, "add-thing");
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        changeId: "add-thing",
        owner: "igor",
        state: "ready-for-review",
      });
      expect(readyLease?.latestEvidence?.command).toBe(
        "git rebase main; openspec validate add-thing --strict --no-interactive; openspec archive add-thing --yes",
      );
      expect(readyLease?.latestEvidence?.message).toContain("reused implementation check evidence");
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
      expect(sessionCalls).toBe(1);
      expect(stdout).toContain("[agents] idle: change branches are leased");
      expect(stdout).toContain("[agents] reused implementation check for add-thing");
      expect(stderr).toBe("");
      expect(commandCalls).toContainEqual({
        args: ["rebase", "main"],
        command: "git",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["validate", "add-thing", "--strict", "--no-interactive"],
        command: "openspec",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["archive", "add-thing", "--yes"],
        command: "openspec",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["commit", "-m", "Finalize add-thing"],
        command: "git",
        cwd: worktreeDir,
      });
      expect(commandCalls).not.toContainEqual({
        args: ["check"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["branch", "-f", "changes/add-thing", "final123"],
        command: "git",
        cwd: worktreeDir,
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reruns devstate check when finalization rebase changes code", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    const commandCalls: Array<{ args: string[]; command: string; cwd: string }> = [];
    let reviewBranchExists = false;
    let workerBranchExists = false;
    let remainingWork = 1;
    let sessionCalls = 0;
    const headReads = ["impl123\n", "before123\n", "after123\n", "final123\n"];
    let committed = false;
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
        return { code: reviewBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "branch changes/add-thing main") {
        reviewBranchExists = true;
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/agents/igor"
      ) {
        return { code: workerBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args[0] === "worktree" &&
        args[1] === "add" &&
        args[2] === "-b" &&
        args[3] === "agents/igor"
      ) {
        workerBranchExists = true;
        writeImplementationEvidence(worktreeDir);
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
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

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "final123\n" };
      }

      if (command === "git" && args.join(" ") === "rebase main") {
        return { code: 0, stderr: "", stdout: "Successfully rebased\n" };
      }

      if (command === "git" && args.join(" ") === "diff --name-only before123 after123") {
        return { code: 0, stderr: "", stdout: "scripts/agents.ts\n" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "validate add-thing --strict --no-interactive"
      ) {
        return { code: 0, stderr: "", stdout: "Change 'add-thing' is valid\n" };
      }

      if (command === "openspec" && args.join(" ") === "archive add-thing --yes") {
        return { code: 0, stderr: "", stdout: "Archived add-thing\n" };
      }

      if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
        return {
          code: 0,
          stderr: "",
          stdout: committed ? "" : " M openspec/specs/local-agent-workers/spec.md\n",
        };
      }

      if (command === "devstate" && args.join(" ") === "check") {
        writeDevstateStatus(worktreeDir);
        return { code: 0, stderr: "", stdout: "# Dev Tool State\n\n## Summary\n\n- checks: ok\n" };
      }

      if (command === "git" && args.join(" ") === "add -A") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "commit -m Finalize add-thing") {
        committed = true;
        return { code: 0, stderr: "", stdout: "[agents/igor abc123] Finalize add-thing\n" };
      }

      if (
        command === "git" &&
        (args.join(" ") === "branch -f changes/add-thing impl123" ||
          args.join(" ") === "branch -f changes/add-thing final123")
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
          expect(input.mode).toBe("implement");
          remainingWork = 0;
          return "plan-done";
        },
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });
      const paths = agentStatePaths(gitCommonDir);

      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(sessionCalls).toBe(1);
      expect(stdout).toContain(
        "[agents] finalization check add-thing: finalization rebase changed code: scripts/agents.ts",
      );
      expect(stdout).toContain("[agents] finalization check ok add-thing: - checks: ok");
      expect(commandCalls).toContainEqual({
        args: ["check"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(readChangeLease(paths.root, "add-thing")?.latestEvidence?.message).toContain(
        "ran devstate check because finalization rebase changed code: scripts/agents.ts",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("blocks with command evidence when archive fails", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    let reviewBranchExists = false;
    let workerBranchExists = false;
    let remainingWork = 1;
    let sessionCalls = 0;
    const headReads = ["impl123\n", "before123\n", "after123\n"];
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
        args.join(" ") === "ls-tree -r --name-only main -- openspec/changes"
      ) {
        return { code: 0, stderr: "", stdout: readyChangeFiles("add-thing") };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
      ) {
        return { code: reviewBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "branch changes/add-thing main") {
        reviewBranchExists = true;
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/agents/igor"
      ) {
        return { code: workerBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args[0] === "worktree" &&
        args[1] === "add" &&
        args[2] === "-b" &&
        args[3] === "agents/igor"
      ) {
        workerBranchExists = true;
        writeImplementationEvidence(worktreeDir);
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
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

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "after123\n" };
      }

      if (command === "git" && args.join(" ") === "rebase main") {
        return { code: 0, stderr: "", stdout: "Current branch agents/igor is up to date.\n" };
      }

      if (command === "git" && args.join(" ") === "diff --name-only before123 after123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "validate add-thing --strict --no-interactive"
      ) {
        return { code: 0, stderr: "", stdout: "Change 'add-thing' is valid\n" };
      }

      if (command === "openspec" && args.join(" ") === "archive add-thing --yes") {
        return { code: 1, stderr: "archive failed\n", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "branch -f changes/add-thing impl123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command in ${cwd}: ${command} ${args.join(" ")}`);
    };

    try {
      const code = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        runCommand,
        runSession: async (input) => {
          sessionCalls += 1;
          expect(input.mode).toBe("implement");
          remainingWork = 0;
          return "plan-done";
        },
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });
      const paths = agentStatePaths(gitCommonDir);

      expect(code).toBe(1);
      expect(stderr).toBe("");
      expect(sessionCalls).toBe(1);
      expect(stdout).toContain("[agents] finalize add-thing");
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        latestEvidence: {
          command: "openspec archive add-thing --yes",
          message: "openspec archive failed for add-thing: archive failed",
        },
        state: "blocked",
      });
      expect(readWorkerStatus(paths.root, "igor")).toMatchObject({
        currentChange: "add-thing",
        state: "blocked",
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

  it("skips merged review branches whose OpenSpec changes are already archived", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    const commandCalls: Array<{ args: string[]; command: string; cwd: string }> = [];
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
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "for-each-ref --format=%(refname:short) refs/heads/changes"
      ) {
        return { code: 0, stderr: "", stdout: "changes/archived-thing\n" };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/archived-thing"
      ) {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/agents/igor"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === `worktree add -b agents/igor ${worktreeDir} changes/archived-thing`
      ) {
        writeArchivedImplementationEvidence(worktreeDir, "archived-thing");
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/archived-thing") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "instructions apply --change archived-thing --json"
      ) {
        return {
          code: 1,
          stderr: "Error: Change 'archived-thing' not found. No changes exist.",
          stdout: "",
        };
      }

      if (
        command === "git" &&
        args.join(" ") === "merge-base --is-ancestor changes/archived-thing main"
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
      expect(commandCalls).not.toContainEqual({
        args: ["reset", "--keep", "changes/archived-thing"],
        command: "git",
        cwd: worktreeDir,
      });
      expect(commandCalls).not.toContainEqual({
        args: ["instructions", "apply", "--change", "archived-thing", "--json"],
        command: "openspec",
        cwd: worktreeDir,
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("starts finalization maintenance when a review-ready branch is behind main", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    const paths = agentStatePaths(gitCommonDir);
    ensureAgentStateDirs(paths);
    createChangeLease(paths.root, {
      changeId: "add-thing",
      now: () => new Date("2026-05-28T00:00:00.000Z"),
      owner: "olga",
      state: "ready-for-review",
    });
    let sessionCalls = 0;
    let workerBranchExists = false;
    const headReads = ["before456\n", "after456\n", "final456\n"];
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
        args.join(" ") === "show-ref --verify --quiet refs/heads/agents/igor"
      ) {
        return { code: workerBranchExists ? 0 : 1, stderr: "", stdout: "" };
      }

      if (
        command === "git" &&
        args.join(" ") === `worktree add -b agents/igor ${worktreeDir} changes/add-thing`
      ) {
        workerBranchExists = true;
        writeArchivedImplementationEvidence(worktreeDir);
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "final456\n" };
      }

      if (command === "git" && args.join(" ") === "rebase main") {
        return { code: 0, stderr: "", stdout: "Successfully rebased\n" };
      }

      if (command === "git" && args.join(" ") === "diff --name-only before456 after456") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "branch -f changes/add-thing final456") {
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
          expect(input.mode).toBe("implement");
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
      expect(stdout).toContain("[agents] ready maintenance add-thing");
      expect(stdout).toContain("[agents] add-thing already archived; skipping archive");
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
          stdout: JSON.stringify(readyApplyInstructions("local-agent-pull-workers")),
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
      expect(stdout).toContain("Apply state: ready");
      expect(stdout).toContain("2.1 Select section before broad context reads.");
      expect(stdout).not.toContain("openspec-apply-change");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("local OpenSpec implementation prompt", () => {
  it("renders a concrete section-first prompt with known OpenSpec state", () => {
    const prompt = buildLocalOpenSpecImplementationPrompt("add-thing", "igor", {
      applyInstructions: readyApplyInstructions(),
    });

    expect(prompt).toContain(
      "Implement one ready `##` task section from OpenSpec change `add-thing`.",
    );
    expect(prompt).toContain(
      'Apply command: openspec instructions apply --change "add-thing" --json',
    );
    expect(prompt).toContain('Status command: openspec status --change "add-thing" --json');
    expect(prompt).toContain("Apply state: ready");
    expect(prompt).toContain("Review branch: `changes/add-thing`.");
    expect(prompt).toContain("Worker branch: `agents/igor`.");
    expect(prompt).toContain("Progress: 1/3 complete, 2 remaining");
    expect(prompt).toContain(
      "First unchecked task: 2: 2.1 Select section before broad context reads.",
    );
    expect(prompt).toContain("/repo/openspec/changes/add-thing/tasks.md");
    expect(prompt).toContain("- [ ] 2: 2.1 Select section before broad context reads.");
    expect(prompt).toContain("select the next ready `##` section before broad context reads");
    expect(prompt).toContain("Start with the `##` section containing the first unchecked task.");
    expect(prompt).toContain("until the next `##` heading or end of file.");
    expect(prompt).toContain("Do not cross into another `##` section.");
    expect(prompt).toContain("stop with `<blocked/>` and record split guidance");
    expect(prompt).toContain("Commit the `##` section with a concise message.");
    expect(prompt).toContain("This rendered prompt is self-contained for this session.");
    expect(prompt).toContain(
      "Do not perform automatic finalization, archive, spec promotion, or ready-for-review work in this implementation session.",
    );
    expect(prompt).toContain("Current green `devstate start` output can satisfy setup evidence");
    expect(prompt).toContain("Current green `devstate check` output can satisfy check evidence");
    expect(prompt).toContain(
      "read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs",
    );
    expect(prompt).not.toContain("openspec-apply-change");
    expect(prompt).not.toContain("doc/agents/local-openspec-implement.md");
    expect(prompt).not.toContain("doc/agents/local-openspec-finalize.md");
    expect(prompt).not.toContain("doc/agents/local-agent-workers.md");
    expect(prompt).not.toContain("Rebase current branch on local `main` before final commit.");
  });
});

describe("local OpenSpec finalization prompt", () => {
  it("renders concrete CLI-owned finalization instructions", () => {
    const prompt = buildLocalOpenSpecFinalizationPrompt("add-thing", "igor", {
      applyInstructions: {
        ...readyApplyInstructions(),
        progress: { complete: 3, remaining: 0, total: 3 },
        state: "all_done",
        tasks: readyApplyInstructions().tasks?.map((task) => ({ ...task, done: true })),
      },
    });

    expect(prompt).toContain("Finalize before marking the branch ready for review.");
    expect(prompt).toContain("This rendered prompt is self-contained for this session.");
    expect(prompt).toContain("Apply state: all_done");
    expect(prompt).toContain("Progress: 3/3 complete, 0 remaining");
    expect(prompt).toContain("git rebase main");
    expect(prompt).toContain(
      "Strict validation before archive: `openspec validate add-thing --strict --no-interactive`.",
    );
    expect(prompt).toContain("openspec validate add-thing --strict --no-interactive");
    expect(prompt).toContain("openspec archive add-thing --yes");
    expect(prompt).toContain("Treat OpenSpec archive output as the spec promotion path.");
    expect(prompt).toContain(
      "Do not manually promote shipped facts into `openspec/specs/*/spec.md` when OpenSpec archive can apply the change deltas.",
    );
    expect(prompt).toContain("Reuse latest implementation `devstate check` evidence");
    expect(prompt).toContain("Current green `devstate check` output can satisfy check evidence");
    expect(prompt).toContain("Do not create an empty commit only for a clean rebase.");
    expect(prompt).toContain(
      "Leave `changes/add-thing` as the review branch and do not check it out in the worker worktree.",
    );
    expect(prompt).not.toContain("openspec-apply-change");
    expect(prompt).not.toContain("doc/agents/local-openspec-implement.md");
    expect(prompt).not.toContain("doc/agents/local-openspec-finalize.md");
    expect(prompt).not.toContain("doc/agents/local-agent-workers.md");
    expect(prompt).not.toContain("Do not archive the OpenSpec change.");
  });
});

describe("local agent worker instruction docs", () => {
  it("keeps root agent instructions layered around rendered prompts", () => {
    const agents = readFileSync("AGENTS.md", "utf8");

    expect(agents).toContain(
      "Task loop: rendered prompt injected by `bun agents`; source prompt docs are reference, not required per-session reads.",
    );
    expect(agents).toContain("OpenSpec archive output plus canonical specs on the review branch.");
    expect(agents).toContain(
      "Reuse latest implementation `devstate check` evidence unless rebase, conflict resolution, code changes, generated output edits, or unclear coverage invalidate it.",
    );
    expect(agents).toContain(
      "Use current devstate output or `./.devstate/status.md` as check evidence.",
    );
    expect(agents).toContain(
      "Keep the worker worktree on `agents/<worker-name>` and leave `changes/<change-id>` free for review after marking ready.",
    );
    expect(agents).not.toContain("promote shipped facts");
    expect(agents).not.toContain("Do not archive the OpenSpec change");
    expect(agents).not.toContain("Archiving is a separate process after review and merge");
  });

  it("documents CLI-owned finalization and context-efficient worker prompts", () => {
    const workerDoc = readFileSync("doc/agents/local-agent-workers.md", "utf8");

    expect(workerDoc).toContain(
      "Rendered implementation prompts include known OpenSpec state, concrete commands, task state, and relevant file paths.",
    );
    expect(workerDoc).toContain(
      "Implementation prompts select the active `##` section before broad context reads",
    );
    expect(workerDoc).toContain(
      "runs `openspec validate <change-id> --strict --no-interactive`, runs `openspec archive <change-id> --yes`",
    );
    expect(workerDoc).toContain("Checked-out worker branch: `agents/<worker-name>`.");
    expect(workerDoc).toContain("publishes the worker branch tip back to `changes/<change-id>`");
    expect(workerDoc).toContain(
      "Finalization reuses latest implementation `devstate check` evidence",
    );
    expect(workerDoc).toContain("Finalization reruns `devstate check` when rebase changes code");
    expect(workerDoc).toContain(
      "code changes, completed task evidence, canonical specs, and archived change files",
    );
    expect(workerDoc).toContain(
      "Review-ready branches retain their lease until branch merge, branch deletion, or explicit release.",
    );
    expect(workerDoc).not.toContain("promotes shipped facts");
    expect(workerDoc).not.toContain("promoted specs");
    expect(workerDoc).not.toContain("Workers do not archive OpenSpec changes");
    expect(workerDoc).not.toContain("Archiving is a separate process after review and merge");
  });
});
