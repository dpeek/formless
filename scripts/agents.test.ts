import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  agentStatePaths,
  branchNameForChange,
  buildLocalOpenSpecFinalizationPrompt,
  buildLocalOpenSpecImplementationPrompt,
  cavemanWorkerNames,
  classifyChangeLease,
  codexArgs,
  createChangeLease,
  discoverClaimableOpenSpecChanges,
  ensureAgentStateDirs,
  ensureChangeBranch,
  findWorkerActiveLease,
  formatFormlessChangeCommitMessage,
  makeWorkerStatus,
  parseAgentsArgs,
  parseFormlessChangeCommitMessage,
  planChangeBranch,
  publishWorkerBranchToChangeBranch,
  queryLocalFormlessChangeBranches,
  readChangeLease,
  readWorkerStatus,
  releaseChangeLease,
  releaseWorkerName,
  reserveWorkerName,
  resolveAgentStatePaths,
  runAgentsCli,
  workerBranchName,
  worktreeDirForWorker,
  writeWorkerStatus,
  type CommandRunner,
} from "./agents.ts";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "formless-agents-"));
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

function validChangeMetadata(changeId = "add-thing") {
  const result = parseFormlessChangeCommitMessage(validChangeCommitMessage(changeId), {
    branch: `changes/${changeId}`,
  });
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
  return result.metadata;
}

function changeCommitMessageWithState(
  changeId: string,
  state: "blocked" | "draft" | "ready" | "ready-for-review" | "working",
): string {
  return validChangeCommitMessage(changeId).replace(
    "Formless-Change-State: ready\n",
    `Formless-Change-State: ${state}\n`,
  );
}

function completedChangeCommitMessage(
  changeId: string,
  state: "ready" | "working" = "working",
): string {
  return changeCommitMessageWithState(changeId, state)
    .replace("- [ ] 1.1 Add parser.", "- [x] 1.1 Add parser.")
    .replace(
      "- Initial proposal commit.",
      [
        "- Initial proposal commit.",
        "- `devstate check` at 2026-05-28T00:00:00.000Z: checks ok.",
      ].join("\n"),
    );
}

function changeBranchMetadataCommand(
  command: string,
  args: string[],
  changeIds: string[],
  messages: Record<string, string> = {},
): ReturnType<CommandRunner> | null {
  if (
    command === "git" &&
    args.join(" ") === "for-each-ref --format=%(refname:short) refs/heads/changes"
  ) {
    return {
      code: 0,
      stderr: "",
      stdout: changeIds.map((changeId) => `changes/${changeId}`).join("\n"),
    };
  }

  if (command === "git" && args[0] === "log" && args[1] === "--no-notes") {
    const branch = args[args.length - 1] ?? "";
    const changeId = branch.replace(/^changes\//, "");
    if (changeIds.includes(changeId)) {
      return {
        code: 0,
        stderr: "",
        stdout: messages[changeId] ?? validChangeCommitMessage(changeId),
      };
    }
  }

  return null;
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

function successfulDevstateCommand(
  cwd: string,
  command: string,
  args: string[],
): ReturnType<CommandRunner> | null {
  if (command !== "devstate") {
    return null;
  }

  if (args.join(" ") === "start" || args.join(" ") === "stop") {
    return { code: 0, stderr: "", stdout: "" };
  }

  if (args.join(" ") === "check") {
    writeDevstateStatus(cwd);
    return { code: 0, stderr: "", stdout: "# Dev Tool State\n\n## Summary\n\n- checks: ok\n" };
  }

  return null;
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

  it("reserves the first available caveman name and skips live watchers", () => {
    const root = tempDir();
    const paths = agentStatePaths(root);
    ensureAgentStateDirs(paths);

    try {
      const grug = reserveWorkerName(paths.root, null, {
        isProcessAlive: () => true,
        now: () => new Date("2026-07-15T00:00:00.000Z"),
        pid: 101,
      });
      const thag = reserveWorkerName(paths.root, null, {
        isProcessAlive: (pid) => pid === 101 || pid === 202,
        now: () => new Date("2026-07-15T00:00:01.000Z"),
        pid: 202,
      });

      expect(cavemanWorkerNames).toEqual(["grug", "thag", "ooga", "barg"]);
      expect(grug.owner).toBe("grug");
      expect(thag.owner).toBe("thag");
      expect(() =>
        reserveWorkerName(paths.root, "grug", {
          isProcessAlive: () => true,
          pid: 303,
        }),
      ).toThrow("worker grug is already running");
      expect(releaseWorkerName(grug)).toBe(true);
      expect(releaseWorkerName(thag)).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("recovers a caveman name reserved by a dead watcher", () => {
    const root = tempDir();
    const paths = agentStatePaths(root);
    ensureAgentStateDirs(paths);

    try {
      const stale = reserveWorkerName(paths.root, "grug", {
        now: () => new Date("2026-07-15T00:00:00.000Z"),
        pid: 101,
      });
      const recovered = reserveWorkerName(paths.root, null, {
        isProcessAlive: (pid) => pid === 202,
        now: () => new Date("2026-07-15T00:01:00.000Z"),
        pid: 202,
      });

      expect(recovered.owner).toBe("grug");
      expect(releaseWorkerName(stale)).toBe(false);
      expect(releaseWorkerName(recovered)).toBe(true);
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

  it("prints worker status with Git-backed change branch metadata", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const paths = agentStatePaths(gitCommonDir);
    ensureAgentStateDirs(paths);
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (_cwd, command, args) => {
      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      writeWorkerStatus(
        paths.root,
        makeWorkerStatus({
          branch: "changes/add-thing",
          currentChange: "add-thing",
          latestEvidence: {
            at: "2026-05-28T00:00:00.000Z",
            message: "working add-thing",
          },
          now: () => new Date("2026-05-28T00:00:00.000Z"),
          owner: "igor",
          state: "working",
        }),
      );

      const code = await runAgentsCli(["status", "igor"], {
        cwd: root,
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
      expect(JSON.parse(stdout)).toMatchObject({
        branch: "changes/add-thing",
        currentChange: "add-thing",
        latestEvidence: {
          message: "working add-thing",
        },
        owner: "igor",
        state: "working",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("local agent worker discovery", () => {
  it("discovers claimable changes from valid local change branch metadata", () => {
    const commands: string[] = [];
    const runCommand: CommandRunner = (_cwd, command, args) => {
      commands.push([command, ...args].join(" "));
      const metadataResult = changeBranchMetadataCommand(
        command,
        args,
        ["add-thing", "bad-thing"],
        {
          "bad-thing": validChangeCommitMessage("bad-thing").replace(
            "Formless-Change-State: ready\n",
            "",
          ),
        },
      );
      if (metadataResult) {
        return metadataResult;
      }

      if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor") {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const changes = discoverClaimableOpenSpecChanges("/repo", { runCommand });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      branch: "changes/add-thing",
      changeId: "add-thing",
      metadata: {
        trailers: {
          changeId: "add-thing",
          state: "ready",
        },
      },
    });
    expect(changes[0]?.applyInstructions).toMatchObject({
      progress: {
        complete: 1,
        remaining: 1,
        total: 2,
      },
      schemaName: "git-backed",
      state: "ready",
      tasks: [
        { description: "Add parser.", done: false, id: "1.1" },
        { description: "Keep old sections.", done: true, id: "1.2" },
      ],
    });
    expect(commands).not.toContain("git ls-tree -r --name-only main -- openspec/changes");
    expect(commands.some((command) => command.startsWith("openspec "))).toBe(false);
  });

  it("orders claimable changes by existing unmerged review branch before change id", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      const metadataResult = changeBranchMetadataCommand(command, args, [
        "alpha-new",
        "zeta-started",
      ]);
      if (metadataResult) {
        return metadataResult;
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

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    expect(
      discoverClaimableOpenSpecChanges("/repo", { runCommand }).map((change) => change.changeId),
    ).toEqual(["zeta-started", "alpha-new"]);
  });

  it("filters claimable changes to an explicit target change id", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      const metadataResult = changeBranchMetadataCommand(command, args, [
        "alpha-new",
        "zeta-started",
      ]);
      if (metadataResult) {
        return metadataResult;
      }

      if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor") {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    expect(
      discoverClaimableOpenSpecChanges("/repo", {
        runCommand,
        targetChangeId: "alpha-new",
      }).map((change) => change.changeId),
    ).toEqual(["alpha-new"]);
  });

  it("claims completed metadata branches for finalization", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      const metadataResult = changeBranchMetadataCommand(command, args, ["done-thing"], {
        "done-thing": completedChangeCommitMessage("done-thing"),
      });
      if (metadataResult) {
        return metadataResult;
      }

      if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor") {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const changes = discoverClaimableOpenSpecChanges("/repo", { runCommand });

    expect(changes.map((change) => change.changeId)).toEqual(["done-thing"]);
    expect(changes[0]?.applyInstructions).toMatchObject({
      progress: {
        complete: 2,
        remaining: 0,
        total: 2,
      },
      state: "all_done",
    });
  });

  it("omits draft, blocked, review-ready, and invalid metadata from claimable work", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      const metadataResult = changeBranchMetadataCommand(
        command,
        args,
        ["blocked-thing", "draft-thing", "invalid-thing", "review-thing"],
        {
          "blocked-thing": changeCommitMessageWithState("blocked-thing", "blocked"),
          "draft-thing": changeCommitMessageWithState("draft-thing", "draft"),
          "invalid-thing": validChangeCommitMessage("invalid-thing").replace(
            "Formless-Change-State: ready\n",
            "",
          ),
          "review-thing": completedChangeCommitMessage("review-thing").replace(
            "Formless-Change-State: working\n",
            "Formless-Change-State: ready-for-review\n",
          ),
        },
      );
      if (metadataResult) {
        return metadataResult;
      }

      if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor") {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    expect(discoverClaimableOpenSpecChanges("/repo", { runCommand })).toEqual([]);
  });

  it("omits blocked, active, and review-ready leases from claimable work", () => {
    const root = tempDir();
    const paths = agentStatePaths(root);
    ensureAgentStateDirs(paths);
    const runCommand: CommandRunner = (_cwd, command, args) => {
      const metadataResult = changeBranchMetadataCommand(command, args, [
        "active-thing",
        "blocked-thing",
        "ready-thing",
        "released-thing",
        "stale-thing",
      ]);
      if (metadataResult) {
        return metadataResult;
      }

      if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor") {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      createChangeLease(paths.root, { changeId: "active-thing", owner: "igor" });
      createChangeLease(paths.root, {
        changeId: "blocked-thing",
        owner: "igor",
        state: "blocked",
      });
      createChangeLease(paths.root, {
        changeId: "ready-thing",
        owner: "igor",
        state: "ready-for-review",
      });
      createChangeLease(paths.root, {
        changeId: "released-thing",
        owner: "igor",
        state: "released",
      });
      createChangeLease(paths.root, {
        changeId: "stale-thing",
        now: () => new Date("2026-05-27T00:00:00.000Z"),
        owner: "igor",
        state: "working",
      });

      expect(
        discoverClaimableOpenSpecChanges("/repo", {
          now: () => new Date("2026-05-28T00:00:00.000Z"),
          runCommand,
          stateRoot: paths.root,
        }).map((change) => change.changeId),
      ).toEqual(["released-thing", "stale-thing"]);
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
    const runCommand: CommandRunner = (cwd, command, args) => {
      const devstateResult = successfulDevstateCommand(cwd, command, args);
      if (devstateResult) {
        return devstateResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      const metadataResult = changeBranchMetadataCommand(command, args, ["add-thing"]);
      if (metadataResult) {
        return metadataResult;
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
          expect(input.applyInstructions).toBeNull();
          expect(input.changeMetadata?.trailers.state).toBe("ready");
          expect(input.selectedTaskSection?.heading).toBe("1. Metadata");
          expect(input.selectedTaskSection?.tasks.find((task) => !task.done)?.description).toBe(
            "Add parser.",
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

  it("does not retarget a worker with an active lease for another change", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const paths = agentStatePaths(gitCommonDir);
    ensureAgentStateDirs(paths);
    createChangeLease(paths.root, {
      changeId: "add-thing",
      owner: "igor",
      state: "working",
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

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      const code = await runAgentsCli(["watch", "igor", "--once", "--change", "other-thing"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        runCommand,
        runSession: async () => {
          throw new Error("worker session should not start");
        },
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });

      expect(code).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain(
        "[agents] worker igor already owns add-thing; release it before targeting other-thing",
      );
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        owner: "igor",
        state: "working",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("claims already-complete changes for finalization when no lease blocks them", () => {
    const runCommand: CommandRunner = (_cwd, command, args) => {
      const metadataResult = changeBranchMetadataCommand(command, args, ["add-thing"], {
        "add-thing": completedChangeCommitMessage("add-thing"),
      });
      if (metadataResult) {
        return metadataResult;
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    expect(
      discoverClaimableOpenSpecChanges("/repo", { runCommand }).map((change) => ({
        changeId: change.changeId,
        state: change.applyInstructions?.state,
      })),
    ).toEqual([{ changeId: "add-thing", state: "all_done" }]);
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

  it("publishes a completed implementation without same-pass finalization", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    const commandCalls: Array<{ args: string[]; command: string; cwd: string }> = [];
    let reviewBranchExists = false;
    let workerBranchExists = false;
    let sessionCalls = 0;
    const headReads = ["impl123\n"];
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      commandCalls.push({ args, command, cwd });
      const devstateResult = successfulDevstateCommand(cwd, command, args);
      if (devstateResult) {
        return devstateResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      const metadataResult = changeBranchMetadataCommand(command, args, ["add-thing"]);
      if (metadataResult) {
        return metadataResult;
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

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "impl123\n" };
      }

      if (command === "git" && args.join(" ") === "branch -f changes/add-thing impl123") {
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
      const firstCode = await runAgentsCli(["watch", "igor", "--once"], {
        cwd: root,
        now: () => new Date("2026-05-28T00:00:00.000Z"),
        runCommand,
        runSession: async (input) => {
          sessionCalls += 1;
          expect(input.changeId).toBe("add-thing");
          expect(input.mode).toBe("implement");
          expect(input.applyInstructions).toBeNull();
          expect(input.changeMetadata?.trailers.changeId).toBe("add-thing");
          expect(input.selectedTaskSection?.heading).toBe("1. Metadata");
          return "plan-done";
        },
        ...streams,
      });
      const paths = agentStatePaths(gitCommonDir);

      expect(firstCode).toBe(0);
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        changeId: "add-thing",
        owner: "igor",
        latestEvidence: {
          message:
            "implemented add-thing; branch changes/add-thing updated at impl123; ready for finalization pass",
        },
        state: "working",
      });
      expect(readWorkerStatus(paths.root, "igor")).toMatchObject({
        currentChange: "add-thing",
        state: "working",
      });
      expect(sessionCalls).toBe(1);
      expect(stdout).toContain("[agents] published add-thing at impl123");
      expect(stderr).toBe("");
      expect(commandCalls).toContainEqual({
        args: ["branch", "-f", "changes/add-thing", "impl123"],
        command: "git",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["start"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["stop"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(
        commandCalls.findIndex(
          (call) => call.command === "devstate" && call.args.join(" ") === "start",
        ),
      ).toBeLessThan(
        commandCalls.findIndex(
          (call) =>
            call.command === "git" && call.args.join(" ") === "branch -f changes/add-thing impl123",
        ),
      );
      expect(
        commandCalls.findIndex(
          (call) => call.command === "devstate" && call.args.join(" ") === "stop",
        ),
      ).toBeGreaterThan(
        commandCalls.findIndex(
          (call) =>
            call.command === "git" && call.args.join(" ") === "branch -f changes/add-thing impl123",
        ),
      );
      expect(commandCalls.some((call) => call.command === "openspec")).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("stops devstate when an implementation session errors", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    const commandCalls: Array<{ args: string[]; command: string; cwd: string }> = [];
    let reviewBranchExists = false;
    let workerBranchExists = false;
    let sessionCalls = 0;
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      commandCalls.push({ args, command, cwd });
      const devstateResult = successfulDevstateCommand(cwd, command, args);
      if (devstateResult) {
        return devstateResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      const metadataResult = changeBranchMetadataCommand(command, args, ["add-thing"]);
      if (metadataResult) {
        return metadataResult;
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
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
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
          throw new Error("session exploded");
        },
        stderr: {
          write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
        stdout: {
          write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
        } as Pick<NodeJS.WriteStream, "write">,
      });

      expect(code).toBe(1);
      expect(sessionCalls).toBe(1);
      expect(stdout).toContain("[agents] devstate start add-thing");
      expect(stdout).toContain("[agents] devstate stop add-thing");
      expect(stderr).toContain("session exploded");
      expect(commandCalls).toContainEqual({
        args: ["start"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["stop"],
        command: "devstate",
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
    let sessionCalls = 0;
    const headReads = ["before123\n", "after123\n", "final123\n"];
    let committed = false;
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      commandCalls.push({ args, command, cwd });
      const devstateResult = successfulDevstateCommand(cwd, command, args);
      if (devstateResult) {
        return devstateResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      const metadataResult = changeBranchMetadataCommand(command, args, ["add-thing"], {
        "add-thing": completedChangeCommitMessage("add-thing"),
      });
      if (metadataResult) {
        return metadataResult;
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

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "final123\n" };
      }

      if (command === "git" && args.join(" ") === "log --no-notes -1 --format=%B HEAD") {
        return { code: 0, stderr: "", stdout: completedChangeCommitMessage("add-thing") };
      }

      if (command === "git" && args.join(" ") === "rebase main") {
        return { code: 0, stderr: "", stdout: "Successfully rebased\n" };
      }

      if (command === "git" && args.join(" ") === "diff --name-only before123 after123") {
        return { code: 0, stderr: "", stdout: "scripts/agents.ts\n" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "validate --specs --strict --no-interactive"
      ) {
        return { code: 0, stderr: "", stdout: "Specs are valid\n" };
      }

      if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
        return {
          code: 0,
          stderr: "",
          stdout: "",
        };
      }

      if (command === "git" && args[0] === "commit" && args[1] === "--amend") {
        expect(args[2]).toBe("--cleanup=verbatim");
        const messagePath = args[4];
        const message = messagePath ? readFileSync(messagePath, "utf8") : "";
        expect(message).toContain("- [x] 1.1 Add parser.");
        expect(message).toContain("`devstate check` at 2026-05-28T00:00:00.000Z: checks ok.");
        expect(message).toContain(
          "Finalization at 2026-05-28T00:00:00.000Z: finalized add-thing; ran devstate check because finalization rebase changed code: scripts/agents.ts.",
        );
        expect(message).toContain("Formless-Change-State: ready-for-review");
        expect(message).toContain("Formless-Last-Evidence-At: 2026-05-28T00:00:00.000Z");
        committed = true;
        return { code: 0, stderr: "", stdout: "[agents/igor abc123] Implement add-thing\n" };
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
          expect(input.mode).toBe("finalize");
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
      expect(sessionCalls).toBe(0);
      expect(stdout).toContain(
        "[agents] finalization check add-thing: finalization rebase changed code: scripts/agents.ts",
      );
      expect(stdout).toContain("[agents] finalization check ok add-thing: - checks: ok");
      expect(commandCalls).toContainEqual({
        args: ["check"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["start"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["stop"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["validate", "--specs", "--strict", "--no-interactive"],
        command: "openspec",
        cwd: worktreeDir,
      });
      expect(
        commandCalls.some((call) => call.command === "openspec" && call.args[0] === "archive"),
      ).toBe(false);
      expect(committed).toBe(true);
      expect(readChangeLease(paths.root, "add-thing")?.latestEvidence?.message).toContain(
        "ran devstate check because finalization rebase changed code: scripts/agents.ts",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("blocks with command evidence when canonical spec validation fails", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    let reviewBranchExists = false;
    let workerBranchExists = false;
    let sessionCalls = 0;
    const headReads = ["before123\n", "after123\n"];
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      const devstateResult = successfulDevstateCommand(cwd, command, args);
      if (devstateResult) {
        return devstateResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      const metadataResult = changeBranchMetadataCommand(command, args, ["add-thing"], {
        "add-thing": completedChangeCommitMessage("add-thing"),
      });
      if (metadataResult) {
        return metadataResult;
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

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "after123\n" };
      }

      if (command === "git" && args.join(" ") === "log --no-notes -1 --format=%B HEAD") {
        return { code: 0, stderr: "", stdout: completedChangeCommitMessage("add-thing") };
      }

      if (command === "git" && args.join(" ") === "rebase main") {
        return { code: 0, stderr: "", stdout: "Current branch agents/igor is up to date.\n" };
      }

      if (command === "git" && args.join(" ") === "diff --name-only before123 after123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "validate --specs --strict --no-interactive"
      ) {
        return { code: 1, stderr: "spec validation failed\n", stdout: "" };
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
          expect(input.mode).toBe("finalize");
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
      expect(sessionCalls).toBe(0);
      expect(stdout).toContain("[agents] finalize add-thing");
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        latestEvidence: {
          command: "openspec validate --specs --strict --no-interactive",
          message: "openspec validate --specs failed for add-thing: spec validation failed",
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

  it("finalizes completed metadata when the ready lease is missing", async () => {
    const root = tempDir();
    const gitCommonDir = path.join(root, ".git");
    const worktreeDir = path.join(root, "tmp", "worktree", "igor");
    const commandCalls: Array<{ args: string[]; command: string; cwd: string }> = [];
    const headReads = ["before123\n", "after123\n", "final123\n"];
    let committed = false;
    let sessionCalls = 0;
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      commandCalls.push({ args, command, cwd });
      const devstateResult = successfulDevstateCommand(cwd, command, args);
      if (devstateResult) {
        return devstateResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "rev-parse --path-format=absolute --git-common-dir"
      ) {
        return { code: 0, stderr: "", stdout: `${gitCommonDir}\n` };
      }

      const metadataResult = changeBranchMetadataCommand(command, args, ["add-thing"], {
        "add-thing": completedChangeCommitMessage("add-thing"),
      });
      if (metadataResult) {
        return metadataResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/add-thing"
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
        args.join(" ") === `worktree add -b agents/igor ${worktreeDir} changes/add-thing`
      ) {
        writeImplementationEvidence(worktreeDir);
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "final123\n" };
      }

      if (command === "git" && args.join(" ") === "log --no-notes -1 --format=%B HEAD") {
        return { code: 0, stderr: "", stdout: completedChangeCommitMessage("add-thing") };
      }

      if (command === "git" && args.join(" ") === "rebase main") {
        return { code: 0, stderr: "", stdout: "Current branch agents/igor is up to date.\n" };
      }

      if (command === "git" && args.join(" ") === "diff --name-only before123 after123") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (
        command === "openspec" &&
        args.join(" ") === "validate --specs --strict --no-interactive"
      ) {
        return { code: 0, stderr: "", stdout: "Specs are valid\n" };
      }

      if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args[0] === "commit" && args[1] === "--amend") {
        expect(args[2]).toBe("--cleanup=verbatim");
        const messagePath = args[4];
        const message = messagePath ? readFileSync(messagePath, "utf8") : "";
        expect(message).toContain("- [x] 1.1 Add parser.");
        expect(message).toContain("`devstate check` at 2026-05-28T00:00:00.000Z: checks ok.");
        expect(message).toContain(
          "Finalization at 2026-05-28T00:00:00.000Z: finalized add-thing; ran devstate check because completion requires fresh check.",
        );
        expect(message).toContain("Formless-Change-State: ready-for-review");
        expect(message).toContain("Formless-Last-Evidence-At: 2026-05-28T00:00:00.000Z");
        committed = true;
        return { code: 0, stderr: "", stdout: "[agents/igor abc123] Implement add-thing\n" };
      }

      if (command === "git" && args.join(" ") === "branch -f changes/add-thing final123") {
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
      expect(stdout).toContain("[agents] finalize add-thing");
      expect(readChangeLease(agentStatePaths(gitCommonDir).root, "add-thing")).toMatchObject({
        changeId: "add-thing",
        owner: "igor",
        state: "ready-for-review",
      });
      expect(commandCalls).not.toContainEqual({
        args: ["instructions", "apply", "--change", "add-thing", "--json"],
        command: "openspec",
        cwd: root,
      });
      expect(commandCalls).toContainEqual({
        args: ["validate", "--specs", "--strict", "--no-interactive"],
        command: "openspec",
        cwd: worktreeDir,
      });
      expect(commandCalls).toContainEqual({
        args: ["check"],
        command: "devstate",
        cwd: worktreeDir,
      });
      expect(
        commandCalls.some((call) => call.command === "openspec" && call.args[0] === "archive"),
      ).toBe(false);
      expect(committed).toBe(true);
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

      const metadataResult = changeBranchMetadataCommand(command, args, ["archived-thing"], {
        "archived-thing": completedChangeCommitMessage("archived-thing").replace(
          "Formless-Change-State: working\n",
          "Formless-Change-State: ready-for-review\n",
        ),
      });
      if (metadataResult) {
        return metadataResult;
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
    let committed = false;
    let stdout = "";
    let stderr = "";
    const runCommand: CommandRunner = (cwd, command, args) => {
      const devstateResult = successfulDevstateCommand(cwd, command, args);
      if (devstateResult) {
        return devstateResult;
      }

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
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "reset --keep changes/add-thing") {
        return { code: 0, stderr: "", stdout: "" };
      }

      if (command === "git" && args.join(" ") === "rev-parse --verify HEAD") {
        return { code: 0, stderr: "", stdout: headReads.shift() ?? "final456\n" };
      }

      if (command === "git" && args.join(" ") === "log --no-notes -1 --format=%B HEAD") {
        return {
          code: 0,
          stderr: "",
          stdout: completedChangeCommitMessage("add-thing").replace(
            "Formless-Change-State: working\n",
            "Formless-Change-State: ready-for-review\n",
          ),
        };
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

      if (
        command === "openspec" &&
        args.join(" ") === "validate --specs --strict --no-interactive"
      ) {
        return { code: 0, stderr: "", stdout: "Specs are valid\n" };
      }

      if (command === "git" && args[0] === "commit" && args[1] === "--amend") {
        expect(args[2]).toBe("--cleanup=verbatim");
        const messagePath = args[4];
        const message = messagePath ? readFileSync(messagePath, "utf8") : "";
        expect(message).toContain("- [x] 1.1 Add parser.");
        expect(message).toContain("`devstate check` at 2026-05-28T00:00:00.000Z: checks ok.");
        expect(message).toContain(
          "Finalization at 2026-05-28T00:01:00.000Z: finalized add-thing; ran devstate check because completion requires fresh check.",
        );
        expect(message).toContain("Formless-Change-State: ready-for-review");
        expect(message).toContain("Formless-Last-Evidence-At: 2026-05-28T00:01:00.000Z");
        committed = true;
        return { code: 0, stderr: "", stdout: "[agents/igor abc123] Implement add-thing\n" };
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
      expect(stdout).toContain(
        "[agents] finalization check add-thing: completion requires fresh check",
      );
      expect(readChangeLease(paths.root, "add-thing")).toMatchObject({
        changeId: "add-thing",
        owner: "igor",
        state: "ready-for-review",
      });
      expect(readWorkerStatus(paths.root, "igor")).toMatchObject({
        currentChange: "add-thing",
        state: "ready-for-review",
      });
      expect(committed).toBe(true);
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
          args.join(" ") === "log --no-notes -1 --format=%B changes/add-thing"
        ) {
          return {
            code: 0,
            stderr: "",
            stdout: completedChangeCommitMessage("add-thing").replace(
              "Formless-Change-State: working\n",
              "Formless-Change-State: ready-for-review\n",
            ),
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

describe("local agent worker launch defaults", () => {
  it("accepts an omitted worker name and defaults to a 10-second cycle", () => {
    expect(parseAgentsArgs(["watch", "--once"])).toMatchObject({
      automaticWorkerName: true,
      intervalSeconds: 10,
      once: true,
      workerName: "grug",
    });
    expect(parseAgentsArgs(["watch", "thag", "--interval", "25"])).toMatchObject({
      automaticWorkerName: false,
      intervalSeconds: 25,
      workerName: "thag",
    });
  });

  it("pins Sol extra-high Fast mode with scoped worker permissions", () => {
    const args = codexArgs(
      false,
      "/tmp/final.md",
      "do work",
      "/repo/tmp/worktree/grug",
      "/repo/.git",
    );

    expect(args).toContain("gpt-5.6-sol");
    expect(args).toContain('model_reasoning_effort="xhigh"');
    expect(args).toContain('service_tier="fast"');
    expect(args).toContain("features.fast_mode=true");
    expect(args.slice(0, 3)).toEqual(["--ask-for-approval", "never", "exec"]);
    expect(args).toContain('default_permissions="formless-worker"');
    expect(args.join(" ")).toContain('"/repo" = "read"');
    expect(args.join(" ")).toContain('"/repo/tmp/worktree/grug" = "write"');
    expect(args.join(" ")).toContain('"/repo/.git" = "write"');
    expect(args.join(" ")).toContain("network={ enabled = false }");
    expect(args).not.toContain("--full-auto");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("keeps dangerous mode explicit while preserving pinned model settings", () => {
    const args = codexArgs(
      true,
      "/tmp/final.md",
      "do work",
      "/repo/tmp/worktree/grug",
      "/repo/.git",
    );

    expect(args).toContain("gpt-5.6-sol");
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args.join(" ")).not.toContain("default_permissions");
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

      const metadataResult = changeBranchMetadataCommand(command, args, [
        "local-agent-pull-workers",
      ]);
      if (metadataResult) {
        return metadataResult;
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
      expect(stdout).toContain(`${root}/tmp/worktree/igor`);
      expect(stdout).toContain('"state":"dry-run"');
      expect(stdout).toContain("codex --ask-for-approval never exec");
      expect(stdout).toContain("State: ready");
      expect(stdout).toContain("1.1: Add parser.");
      expect(stdout).toContain("bun agents change local-agent-pull-workers --json");
      expect(stdout).toContain("git diff --stat --find-renames main..HEAD");
      expect(stdout).not.toContain("openspec-apply-change");
      expect(stdout).not.toContain("openspec instructions apply");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("restricts dry-run claims to the requested change id", async () => {
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

      const metadataResult = changeBranchMetadataCommand(command, args, [
        "alpha-new",
        "zeta-started",
      ]);
      if (metadataResult) {
        return metadataResult;
      }

      if (
        command === "git" &&
        args.join(" ") === "show-ref --verify --quiet refs/heads/changes/alpha-new"
      ) {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    try {
      const code = await runAgentsCli(
        ["watch", "igor", "--once", "--dry-run", "--change", "alpha-new"],
        {
          cwd: root,
          now: () => new Date("2026-05-28T00:00:00.000Z"),
          runCommand,
          stderr: {
            write: (chunk: string | Uint8Array) => ((stderr += String(chunk)), true),
          } as Pick<NodeJS.WriteStream, "write">,
          stdout: {
            write: (chunk: string | Uint8Array) => ((stdout += String(chunk)), true),
          } as Pick<NodeJS.WriteStream, "write">,
        },
      );

      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("[agents] would claim alpha-new");
      expect(stdout).toContain("changes/alpha-new create");
      expect(stdout).not.toContain("zeta-started");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("local OpenSpec implementation prompt", () => {
  it("renders a concrete section-first prompt with known Git-backed metadata", () => {
    const prompt = buildLocalOpenSpecImplementationPrompt("add-thing", "igor", {
      branchDiff: "$ git diff --stat --find-renames main..HEAD\n scripts/agents.ts | 12 ++++++",
      changeMetadata: validChangeMetadata(),
    });

    expect(prompt).toContain(
      "Implement one ready task section from Git-backed Formless change `add-thing`.",
    );
    expect(prompt).toContain("Known Parsed Change Metadata");
    expect(prompt).toContain("State: ready");
    expect(prompt).toContain("Schema: git-backed");
    expect(prompt).toContain("Review branch: `changes/add-thing`.");
    expect(prompt).toContain("Worker branch: `agents/igor`.");
    expect(prompt).toContain("Queue source: local `changes/add-thing` branch tip commit metadata.");
    expect(prompt).toContain("Progress: 1/2 complete, 1 remaining");
    expect(prompt).toContain("First unchecked task: 1.1: Add parser.");
    expect(prompt).toContain("### 1. Metadata");
    expect(prompt).toContain("- [ ] 1.1: Add parser.");
    expect(prompt).toContain("- [x] 1.2: Keep old sections.");
    expect(prompt).toContain("$ git diff --stat --find-renames main..HEAD");
    expect(prompt).toContain("scripts/agents.ts | 12 ++++++");
    expect(prompt).toContain("bun agents change add-thing --json");
    expect(prompt).toContain("git log --no-notes -1 --format=%B HEAD");
    expect(prompt).toContain("git commit --amend --cleanup=verbatim");
    expect(prompt).toContain("Use the selected task section above before broad context reads");
    expect(prompt).toContain("Do not cross into another task section.");
    expect(prompt).toContain("record blocker evidence plus split guidance in commit metadata");
    expect(prompt).toContain("This rendered prompt is self-contained for this session.");
    expect(prompt).toContain(
      "Skill-owned instruction source: `.agents/skills/change-apply/templates/local-implement.md`.",
    );
    expect(prompt).toContain(
      "Do not perform automatic finalization, archive, spec promotion, or ready-for-review work in this implementation session.",
    );
    expect(prompt).toContain("Current clean `devstate check` output is required");
    expect(prompt).toContain(
      "read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs",
    );
    expect(prompt).not.toContain("devstate start");
    expect(prompt).not.toContain("devstate stop");
    expect(prompt).not.toContain("openspec-apply-change");
    expect(prompt).not.toContain("openspec instructions apply");
    expect(prompt).not.toContain("openspec status");
    expect(prompt).not.toContain("proposal.md");
    expect(prompt).not.toContain("design.md");
    expect(prompt).not.toContain("tasks.md");
    expect(prompt).not.toContain("doc/agents/local-openspec-implement.md");
    expect(prompt).not.toContain("doc/agents/local-openspec-finalize.md");
    expect(prompt).not.toContain("doc/agents/local-agent-workers.md");
    expect(prompt).not.toContain("Rebase current branch on local `main` before final commit.");
  });
});

describe("local OpenSpec finalization prompt", () => {
  it("renders concrete Git-backed finalization instructions", () => {
    const prompt = buildLocalOpenSpecFinalizationPrompt("add-thing", "igor", {
      branchDiff: "$ git diff --stat --find-renames main..HEAD\n scripts/agents.ts | 12 ++++++",
      changeMetadata: validChangeMetadata(),
    });

    expect(prompt).toContain("Finalize Git-backed Formless change `add-thing`.");
    expect(prompt).toContain("Finalize before marking the branch ready for review.");
    expect(prompt).toContain("This rendered prompt is self-contained for this session.");
    expect(prompt).toContain("Known Parsed Change Metadata");
    expect(prompt).toContain("State: ready");
    expect(prompt).toContain("Schema: git-backed");
    expect(prompt).toContain("Progress: 1/2 complete, 1 remaining");
    expect(prompt).toContain("$ git diff --stat --find-renames main..HEAD");
    expect(prompt).toContain("scripts/agents.ts | 12 ++++++");
    expect(prompt).toContain("git rebase main");
    expect(prompt).toContain("git log --no-notes -1 --format=%B HEAD");
    expect(prompt).toContain("openspec validate --specs --strict --no-interactive");
    expect(prompt).toContain("Do not run `openspec archive`");
    expect(prompt).toContain("Formless-Change-State: ready-for-review");
    expect(prompt).toContain("Run `devstate check`.");
    expect(prompt).toContain("Current green `devstate check` output can satisfy check evidence");
    expect(prompt).toContain(
      "Skill-owned instruction source: `.agents/skills/change-finalize/templates/local-finalize.md`.",
    );
    expect(prompt).toContain(
      "Leave `changes/add-thing` as the review branch and do not check it out in the worker worktree.",
    );
    expect(prompt).not.toContain("openspec-apply-change");
    expect(prompt).not.toContain("openspec validate add-thing --strict --no-interactive");
    expect(prompt).not.toContain("openspec archive add-thing --yes");
    expect(prompt).not.toContain("Apply state:");
    expect(prompt).not.toContain("proposal.md");
    expect(prompt).not.toContain("design.md");
    expect(prompt).not.toContain("tasks.md");
    expect(prompt).not.toContain("doc/agents/local-openspec-implement.md");
    expect(prompt).not.toContain("doc/agents/local-openspec-finalize.md");
    expect(prompt).not.toContain("doc/agents/local-agent-workers.md");
    expect(prompt).not.toContain("devstate start");
    expect(prompt).not.toContain("devstate stop");
  });
});
