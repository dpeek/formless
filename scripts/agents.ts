#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CommandResult = {
  code: number;
  stderr: string;
  stdout: string;
};

export type CommandRunner = (cwd: string, command: string, args: string[]) => CommandResult;

export type AgentEvidence = {
  at: string;
  command?: string;
  message: string;
  path?: string;
};

export type WorkerState =
  | "blocked"
  | "claiming"
  | "dry-run"
  | "finalizing"
  | "idle"
  | "ready-for-review"
  | "released"
  | "working";

export type LeaseRecord = {
  branch: string;
  changeId: string;
  createdAt: string;
  heartbeatAt: string;
  latestEvidence?: AgentEvidence;
  owner: string;
  pid?: number;
  state: WorkerState;
  updatedAt: string;
};

export type WorkerStatus = {
  branch: string | null;
  currentChange: string | null;
  heartbeatAt: string;
  latestEvidence?: AgentEvidence;
  owner: string;
  state: WorkerState;
  updatedAt: string;
};

export type AgentStatePaths = {
  leases: string;
  logs: string;
  root: string;
  workers: string;
};

export type CommittedOpenSpecChange = {
  artifactPaths: string[];
  branch: string;
  changeId: string;
};

export type BranchPlan = {
  action: "create" | "resume";
  branch: string;
  worktreeDir: string;
};

type WatchOptions = {
  baseRef: string;
  command: "watch";
  dangerous: boolean;
  dryRun: boolean;
  intervalSeconds: number;
  once: boolean;
  workerName: string;
  worktreeDir: string | null;
};

type StatusOptions = {
  command: "status";
  workerName: string | null;
};

type ReleaseOptions = {
  changeId: string;
  command: "release";
  owner: string | null;
};

type AgentsOptions = ReleaseOptions | StatusOptions | WatchOptions;

type WorkerIo = {
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
};

type WorkerDeps = Partial<WorkerIo> & {
  cwd?: string;
  now?: () => Date;
  runCommand?: CommandRunner;
};

type ApplyInstructions = {
  progress?: {
    remaining?: number;
  };
  state?: string;
};

type WorkerSessionMode = "finalize" | "implement";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const promptDir = path.resolve(scriptDir, "..", "doc", "agents");
const leaseFileName = "lease.json";
const defaultBaseRef = "main";
const defaultIntervalSeconds = 60;

class UsageError extends Error {}

export const defaultCommandRunner: CommandRunner = (cwd, command, args) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const errorMessage = result.error instanceof Error ? result.error.message : "";

  return {
    code: typeof result.status === "number" ? result.status : 1,
    stderr:
      typeof result.stderr === "string" && result.stderr.length > 0 ? result.stderr : errorMessage,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
  };
};

function runOrThrow(
  cwd: string,
  command: string,
  args: string[],
  runCommand: CommandRunner,
): string {
  const result = runCommand(cwd, command, args);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  }

  return result.stdout;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function writeLine(stream: Pick<NodeJS.WriteStream, "write">, value: string): void {
  stream.write(`${value}\n`);
}

function validateSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new UsageError(
      `${label} must contain only letters, numbers, dots, underscores, and hyphens.`,
    );
  }

  return value;
}

export function validateChangeId(changeId: string): string {
  return validateSegment(changeId, "change id");
}

export function validateWorkerName(workerName: string): string {
  return validateSegment(workerName, "worker name");
}

export function branchNameForChange(changeId: string): string {
  return `changes/${validateChangeId(changeId)}`;
}

export function changeIdFromBranch(branch: string): string | null {
  const match = branch.match(/^changes\/(.+)$/);
  return match ? validateChangeId(match[1] ?? "") : null;
}

export function worktreeDirForWorker(repoRoot: string, workerName: string): string {
  return path.join(path.resolve(repoRoot), "tmp", "worktree", validateWorkerName(workerName));
}

export function agentStatePaths(gitCommonDir: string): AgentStatePaths {
  const root = path.join(path.resolve(gitCommonDir), "agent-state");
  return {
    leases: path.join(root, "leases"),
    logs: path.join(root, "logs"),
    root,
    workers: path.join(root, "workers"),
  };
}

export function ensureAgentStateDirs(paths: AgentStatePaths): void {
  mkdirSync(paths.leases, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });
  mkdirSync(paths.workers, { recursive: true });
}

export function resolveGitCommonDir(cwd: string, runCommand = defaultCommandRunner): string {
  return path.resolve(
    runOrThrow(
      cwd,
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      runCommand,
    ).trim(),
  );
}

export function resolveAgentStatePaths(
  cwd: string,
  runCommand = defaultCommandRunner,
): AgentStatePaths {
  return agentStatePaths(resolveGitCommonDir(cwd, runCommand));
}

function leaseDir(stateRoot: string, changeId: string): string {
  return path.join(stateRoot, "leases", validateChangeId(changeId));
}

function leasePath(stateRoot: string, changeId: string): string {
  return path.join(leaseDir(stateRoot, changeId), leaseFileName);
}

function workerStatusPath(stateRoot: string, workerName: string): string {
  return path.join(stateRoot, "workers", `${validateWorkerName(workerName)}.json`);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readChangeLease(stateRoot: string, changeId: string): LeaseRecord | null {
  return readJsonFile<LeaseRecord>(leasePath(stateRoot, changeId));
}

export function listChangeLeases(stateRoot: string): LeaseRecord[] {
  const leasesDir = path.join(stateRoot, "leases");
  if (!existsSync(leasesDir)) {
    return [];
  }

  return readdirSync(leasesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readChangeLease(stateRoot, entry.name))
    .filter((lease): lease is LeaseRecord => lease !== null)
    .sort((left, right) => left.changeId.localeCompare(right.changeId));
}

export function findWorkerActiveLease(stateRoot: string, workerName: string): LeaseRecord | null {
  const owner = validateWorkerName(workerName);
  return (
    listChangeLeases(stateRoot).find(
      (lease) =>
        lease.owner === owner &&
        (lease.state === "claiming" || lease.state === "working" || lease.state === "finalizing"),
    ) ?? null
  );
}

export function createChangeLease(
  stateRoot: string,
  input: {
    changeId: string;
    latestEvidence?: AgentEvidence;
    now?: () => Date;
    owner: string;
    state?: WorkerState;
  },
): { claimed: boolean; lease: LeaseRecord | null } {
  const changeId = validateChangeId(input.changeId);
  const owner = validateWorkerName(input.owner);
  const dir = leaseDir(stateRoot, changeId);

  try {
    mkdirSync(dir);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      return { claimed: false, lease: readChangeLease(stateRoot, changeId) };
    }

    throw error;
  }

  const at = nowIso(input.now ?? (() => new Date()));
  const lease: LeaseRecord = {
    branch: branchNameForChange(changeId),
    changeId,
    createdAt: at,
    heartbeatAt: at,
    latestEvidence: input.latestEvidence,
    owner,
    pid: typeof process.pid === "number" ? process.pid : undefined,
    state: input.state ?? "claiming",
    updatedAt: at,
  };

  try {
    writeJsonFile(leasePath(stateRoot, changeId), lease);
    return { claimed: true, lease };
  } catch (error) {
    rmSync(dir, { force: true, recursive: true });
    throw error;
  }
}

export function updateChangeLease(
  stateRoot: string,
  changeId: string,
  patch: Partial<Pick<LeaseRecord, "latestEvidence" | "state">>,
  now: () => Date = () => new Date(),
): LeaseRecord {
  const lease = readChangeLease(stateRoot, changeId);
  if (!lease) {
    throw new Error(`No lease exists for ${changeId}.`);
  }

  const updated: LeaseRecord = {
    ...lease,
    ...patch,
    heartbeatAt: nowIso(now),
    updatedAt: nowIso(now),
  };
  writeJsonFile(leasePath(stateRoot, changeId), updated);
  return updated;
}

export function releaseChangeLease(
  stateRoot: string,
  changeId: string,
  owner?: string | null,
): boolean {
  const lease = readChangeLease(stateRoot, changeId);
  if (!lease) {
    return false;
  }

  if (owner && lease.owner !== owner) {
    return false;
  }

  rmSync(leaseDir(stateRoot, changeId), { force: true, recursive: true });
  return true;
}

export function readWorkerStatus(stateRoot: string, workerName: string): WorkerStatus | null {
  return readJsonFile<WorkerStatus>(workerStatusPath(stateRoot, workerName));
}

export function writeWorkerStatus(stateRoot: string, status: WorkerStatus): WorkerStatus {
  validateWorkerName(status.owner);
  if (status.currentChange) {
    validateChangeId(status.currentChange);
  }

  writeJsonFile(workerStatusPath(stateRoot, status.owner), status);
  return status;
}

export function makeWorkerStatus(input: {
  branch?: string | null;
  currentChange?: string | null;
  latestEvidence?: AgentEvidence;
  now?: () => Date;
  owner: string;
  state: WorkerState;
}): WorkerStatus {
  const at = nowIso(input.now ?? (() => new Date()));
  return {
    branch: input.branch ?? null,
    currentChange: input.currentChange ?? null,
    heartbeatAt: at,
    latestEvidence: input.latestEvidence,
    owner: validateWorkerName(input.owner),
    state: input.state,
    updatedAt: at,
  };
}

function committedFileSuffix(filePath: string, changeId: string): string | null {
  const prefix = `openspec/changes/${changeId}/`;
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : null;
}

export function discoverCommittedOpenSpecChanges(
  cwd: string,
  baseRef = defaultBaseRef,
  runCommand = defaultCommandRunner,
): CommittedOpenSpecChange[] {
  const stdout = runOrThrow(
    cwd,
    "git",
    ["ls-tree", "-r", "--name-only", baseRef, "--", "openspec/changes"],
    runCommand,
  );
  const byChange = new Map<string, string[]>();

  for (const filePath of stdout.split(/\r?\n/)) {
    const match = filePath.match(/^openspec\/changes\/([^/]+)\//);
    if (!match) {
      continue;
    }

    const changeId = validateChangeId(match[1] ?? "");
    const paths = byChange.get(changeId) ?? [];
    paths.push(filePath);
    byChange.set(changeId, paths);
  }

  return [...byChange.entries()]
    .map(([changeId, artifactPaths]) => ({
      artifactPaths: artifactPaths.sort(),
      branch: branchNameForChange(changeId),
      changeId,
    }))
    .sort((left, right) => left.changeId.localeCompare(right.changeId));
}

export function hasRequiredApplyArtifacts(change: CommittedOpenSpecChange): boolean {
  const suffixes = new Set(
    change.artifactPaths
      .map((filePath) => committedFileSuffix(filePath, change.changeId))
      .filter((suffix): suffix is string => suffix !== null),
  );

  return (
    suffixes.has("proposal.md") &&
    suffixes.has("design.md") &&
    suffixes.has("tasks.md") &&
    [...suffixes].some((suffix) => /^specs\/.+\.md$/.test(suffix))
  );
}

export function discoverClaimableOpenSpecChanges(
  cwd: string,
  options: {
    baseRef?: string;
    runCommand?: CommandRunner;
    stateRoot?: string | null;
  } = {},
): CommittedOpenSpecChange[] {
  const changes = discoverCommittedOpenSpecChanges(
    cwd,
    options.baseRef ?? defaultBaseRef,
    options.runCommand ?? defaultCommandRunner,
  ).filter(hasRequiredApplyArtifacts);

  if (!options.stateRoot) {
    return changes;
  }

  return changes.filter((change) => !readChangeLease(options.stateRoot ?? "", change.changeId));
}

export function branchExists(
  cwd: string,
  branch: string,
  runCommand = defaultCommandRunner,
): boolean {
  return (
    runCommand(cwd, "git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).code === 0
  );
}

export function planChangeBranch(
  cwd: string,
  changeId: string,
  options: {
    runCommand?: CommandRunner;
    workerName: string;
    worktreeDir?: string | null;
  },
): BranchPlan {
  const branch = branchNameForChange(changeId);
  const exists = branchExists(cwd, branch, options.runCommand ?? defaultCommandRunner);
  return {
    action: exists ? "resume" : "create",
    branch,
    worktreeDir: path.resolve(options.worktreeDir ?? worktreeDirForWorker(cwd, options.workerName)),
  };
}

function gitTopLevel(cwd: string, runCommand: CommandRunner): string | null {
  const result = runCommand(cwd, "git", ["rev-parse", "--show-toplevel"]);
  return result.code === 0 ? path.resolve(result.stdout.trim()) : null;
}

function gitCurrentBranch(cwd: string, runCommand: CommandRunner): string {
  return runOrThrow(cwd, "git", ["branch", "--show-current"], runCommand).trim();
}

export function ensureChangeBranch(
  cwd: string,
  changeId: string,
  options: {
    baseRef?: string;
    runCommand?: CommandRunner;
    workerName: string;
    worktreeDir?: string | null;
  },
): BranchPlan {
  const runCommand = options.runCommand ?? defaultCommandRunner;
  const plan = planChangeBranch(cwd, changeId, {
    runCommand,
    workerName: options.workerName,
    worktreeDir: options.worktreeDir,
  });

  if (existsSync(plan.worktreeDir)) {
    if (gitTopLevel(plan.worktreeDir, runCommand) !== path.resolve(plan.worktreeDir)) {
      throw new Error(`Worktree path exists but is not a git worktree: ${plan.worktreeDir}`);
    }

    const currentBranch = gitCurrentBranch(plan.worktreeDir, runCommand);
    if (currentBranch === plan.branch) {
      return plan;
    }

    if (!branchExists(cwd, plan.branch, runCommand)) {
      runOrThrow(
        cwd,
        "git",
        ["branch", plan.branch, options.baseRef ?? defaultBaseRef],
        runCommand,
      );
    }
    runOrThrow(plan.worktreeDir, "git", ["checkout", plan.branch], runCommand);
    return plan;
  }

  mkdirSync(path.dirname(plan.worktreeDir), { recursive: true });
  const args =
    plan.action === "create"
      ? ["worktree", "add", "-b", plan.branch, plan.worktreeDir, options.baseRef ?? defaultBaseRef]
      : ["worktree", "add", plan.worktreeDir, plan.branch];
  runOrThrow(cwd, "git", args, runCommand);
  return plan;
}

export function listLocalChangeBranches(cwd: string, runCommand = defaultCommandRunner): string[] {
  const result = runCommand(cwd, "git", [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/changes",
  ]);
  if (result.code !== 0) {
    throw new Error(`git for-each-ref failed:\n${result.stderr}`);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((branch) => branch.trim())
    .filter((branch) => changeIdFromBranch(branch) !== null)
    .sort();
}

function readPromptTemplate(name: "local-openspec-finalize" | "local-openspec-implement"): string {
  return readFileSync(path.join(promptDir, `${name}.md`), "utf8").trim();
}

function renderPrompt(
  template: string,
  values: Record<"change_id" | "worker_name", string>,
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered;
}

export function buildLocalOpenSpecImplementationPrompt(
  changeId: string,
  workerName: string,
): string {
  return renderPrompt(readPromptTemplate("local-openspec-implement"), {
    change_id: validateChangeId(changeId),
    worker_name: validateWorkerName(workerName),
  });
}

export function buildLocalOpenSpecFinalizationPrompt(changeId: string, workerName: string): string {
  return renderPrompt(readPromptTemplate("local-openspec-finalize"), {
    change_id: validateChangeId(changeId),
    worker_name: validateWorkerName(workerName),
  });
}

function parseJson<T>(stdout: string, context: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from ${context}: ${message}`);
  }
}

function readApplyInstructions(
  cwd: string,
  changeId: string,
  runCommand: CommandRunner,
): ApplyInstructions {
  const stdout = runOrThrow(
    cwd,
    "openspec",
    ["instructions", "apply", "--change", validateChangeId(changeId), "--json"],
    runCommand,
  );
  return parseJson<ApplyInstructions>(stdout, `openspec instructions apply ${changeId}`);
}

function changeNeedsFinalization(
  cwd: string,
  changeId: string,
  runCommand: CommandRunner,
): boolean {
  const instructions = readApplyInstructions(cwd, changeId, runCommand);
  return instructions.state === "all_done" || instructions.progress?.remaining === 0;
}

function signalFromFinalMessage(message: string): "blocked" | "none" | "plan-done" | "task-done" {
  if (message.includes("<blocked/>")) {
    return "blocked";
  }

  if (message.includes("<plan-done/>")) {
    return "plan-done";
  }

  if (message.includes("<task-done/>")) {
    return "task-done";
  }

  return "none";
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function codexArgs(
  dangerous: boolean,
  outputPath: string,
  prompt: string,
  workspaceRoot: string,
): string[] {
  const modeArgs = dangerous ? ["--dangerously-bypass-approvals-and-sandbox"] : ["--full-auto"];

  return ["exec", "-C", workspaceRoot, "--color", "never", "-o", outputPath, ...modeArgs, prompt];
}

async function runWithTee(
  command: string,
  args: string[],
  logPath: string,
  cwd: string,
): Promise<number> {
  const log = createWriteStream(logPath, { flags: "w" });
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let settled = false;

  return new Promise((resolve) => {
    const settle = (code: number): void => {
      if (settled) {
        return;
      }

      settled = true;
      log.end();
      resolve(code);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      log.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      log.write(chunk);
    });
    child.on("error", (error) => {
      const message = `[agents] failed to run ${command}: ${error.message}\n`;
      process.stderr.write(message);
      log.write(message);
      settle(1);
    });
    child.on("close", (code) => {
      settle(code ?? 1);
    });
  });
}

function makeRunDir(
  paths: AgentStatePaths,
  workerName: string,
  changeId: string,
  now: () => Date,
): string {
  const timestamp = nowIso(now).replace(/[:.]/g, "-");
  const runDir = path.join(
    paths.logs,
    `${timestamp}-${validateWorkerName(workerName)}-${validateChangeId(changeId)}`,
  );
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

async function runCodexSession(input: {
  changeId: string;
  dangerous: boolean;
  mode: WorkerSessionMode;
  paths: AgentStatePaths;
  workerName: string;
  worktreeDir: string;
  now: () => Date;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<"blocked" | "none" | "plan-done" | "task-done"> {
  const prompt =
    input.mode === "finalize"
      ? buildLocalOpenSpecFinalizationPrompt(input.changeId, input.workerName)
      : buildLocalOpenSpecImplementationPrompt(input.changeId, input.workerName);
  const runDir = makeRunDir(input.paths, input.workerName, input.changeId, input.now);
  const outputPath = path.join(runDir, `${input.mode}-final.md`);
  const logPath = path.join(runDir, `${input.mode}.log`);
  const promptPath = path.join(runDir, `${input.mode}-prompt.md`);
  writeFileSync(promptPath, `${prompt}\n`);

  const args = codexArgs(input.dangerous, outputPath, prompt, input.worktreeDir);
  writeLine(input.stdout, `[agents] ${input.mode} ${input.changeId}`);
  writeLine(input.stdout, `[agents] prompt ${promptPath}`);

  const code = await runWithTee("codex", args, logPath, input.worktreeDir);
  if (code !== 0) {
    throw new Error(`codex exited with ${code}. Log: ${logPath}`);
  }

  const finalMessage = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  return signalFromFinalMessage(finalMessage);
}

function usage(): string {
  return [
    "Usage: bun agents watch <worker-name> [options]",
    "       bun agents status [worker-name]",
    "       bun agents release <change-id> [--owner <worker-name>]",
    "",
    "Runs a local OpenSpec pull worker.",
    "",
    "Options:",
    "  --once                 Run one supervisor pass.",
    "  --dry-run              Print claim, branch, status, and Codex command without mutating.",
    "  --base <ref>           Queue and branch base ref. Default: local main.",
    "  --worktree-dir <dir>   Override claimed change worktree path.",
    "  --interval <seconds>   Watch interval. Default: 60.",
    "  --dangerous            Use Codex's no-approval, no-sandbox mode.",
    "  -h, --help             Show this help.",
  ].join("\n");
}

export function parseAgentsArgs(args: string[]): AgentsOptions | "help" {
  if (args.includes("-h") || args.includes("--help")) {
    return "help";
  }

  const command = args[0];
  if (command === "watch") {
    const workerName = args[1];
    if (!workerName || workerName.startsWith("-")) {
      throw new UsageError("watch requires <worker-name>.");
    }

    const options: WatchOptions = {
      baseRef: defaultBaseRef,
      command: "watch",
      dangerous: false,
      dryRun: false,
      intervalSeconds: defaultIntervalSeconds,
      once: false,
      workerName: validateWorkerName(workerName),
      worktreeDir: null,
    };

    for (let index = 2; index < args.length; index += 1) {
      const arg = args[index];

      if (arg === "--once") {
        options.once = true;
        continue;
      }

      if (arg === "--dry-run") {
        options.dryRun = true;
        options.once = true;
        continue;
      }

      if (arg === "--dangerous") {
        options.dangerous = true;
        continue;
      }

      if (arg === "--base") {
        options.baseRef = nextValue(args, index, arg);
        index += 1;
        continue;
      }

      if (arg === "--worktree-dir") {
        options.worktreeDir = nextValue(args, index, arg);
        index += 1;
        continue;
      }

      if (arg === "--interval") {
        options.intervalSeconds = parsePositiveInteger(nextValue(args, index, arg), arg);
        index += 1;
        continue;
      }

      throw new UsageError(`Unknown option: ${arg}`);
    }

    return options;
  }

  if (command === "status") {
    const workerName = args[1] ? validateWorkerName(args[1]) : null;
    if (args.length > (workerName ? 2 : 1)) {
      throw new UsageError("status accepts at most one worker name.");
    }

    return { command: "status", workerName };
  }

  if (command === "release") {
    const changeId = args[1];
    if (!changeId || changeId.startsWith("-")) {
      throw new UsageError("release requires <change-id>.");
    }

    let owner: string | null = null;
    for (let index = 2; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--owner") {
        owner = validateWorkerName(nextValue(args, index, arg));
        index += 1;
        continue;
      }

      throw new UsageError(`Unknown option: ${arg}`);
    }

    return { changeId: validateChangeId(changeId), command: "release", owner };
  }

  throw new UsageError("Missing command.");
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new UsageError(`Missing value for ${flag}.`);
  }

  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UsageError(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function dryRunCodexCommand(input: {
  changeId: string;
  dangerous: boolean;
  mode: WorkerSessionMode;
  workerName: string;
  worktreeDir: string;
}): string {
  const prompt =
    input.mode === "finalize"
      ? buildLocalOpenSpecFinalizationPrompt(input.changeId, input.workerName)
      : buildLocalOpenSpecImplementationPrompt(input.changeId, input.workerName);
  return ["codex", ...codexArgs(input.dangerous, "<output>", prompt, input.worktreeDir)]
    .map(shellQuote)
    .join(" ");
}

function showDryRunClaim(input: {
  branchPlan: BranchPlan;
  change: CommittedOpenSpecChange;
  now: () => Date;
  options: WatchOptions;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): void {
  const evidence: AgentEvidence = {
    at: nowIso(input.now),
    message: `dry-run would claim ${input.change.changeId}`,
  };
  const status = makeWorkerStatus({
    branch: input.branchPlan.branch,
    currentChange: input.change.changeId,
    latestEvidence: evidence,
    now: input.now,
    owner: input.options.workerName,
    state: "dry-run",
  });
  writeLine(input.stdout, `[agents] worker ${input.options.workerName}`);
  writeLine(input.stdout, `[agents] would claim ${input.change.changeId}`);
  writeLine(
    input.stdout,
    `[agents] branch ${input.branchPlan.branch} ${input.branchPlan.action} ${input.branchPlan.worktreeDir}`,
  );
  writeLine(input.stdout, `[agents] status ${JSON.stringify(status)}`);
  writeLine(
    input.stdout,
    `[agents] command ${dryRunCodexCommand({
      changeId: input.change.changeId,
      dangerous: input.options.dangerous,
      mode: "implement",
      workerName: input.options.workerName,
      worktreeDir: input.branchPlan.worktreeDir,
    })}`,
  );
}

async function runClaimedChange(input: {
  branchPlan: BranchPlan;
  change: CommittedOpenSpecChange;
  now: () => Date;
  options: WatchOptions;
  paths: AgentStatePaths;
  runCommand: CommandRunner;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number> {
  const mode = changeNeedsFinalization(
    input.branchPlan.worktreeDir,
    input.change.changeId,
    input.runCommand,
  )
    ? "finalize"
    : "implement";
  const state: WorkerState = mode === "finalize" ? "finalizing" : "working";
  const evidence: AgentEvidence = {
    at: nowIso(input.now),
    message: `${state} ${input.change.changeId}`,
  };

  writeWorkerStatus(
    input.paths.root,
    makeWorkerStatus({
      branch: input.branchPlan.branch,
      currentChange: input.change.changeId,
      latestEvidence: evidence,
      now: input.now,
      owner: input.options.workerName,
      state,
    }),
  );
  updateChangeLease(
    input.paths.root,
    input.change.changeId,
    { latestEvidence: evidence, state },
    input.now,
  );

  const signal = await runCodexSession({
    changeId: input.change.changeId,
    dangerous: input.options.dangerous,
    mode,
    now: input.now,
    paths: input.paths,
    workerName: input.options.workerName,
    worktreeDir: input.branchPlan.worktreeDir,
    stdout: input.stdout,
  });

  if (signal === "blocked" || signal === "none") {
    const blockedEvidence: AgentEvidence = {
      at: nowIso(input.now),
      message: `worker stopped with ${signal}`,
    };
    writeWorkerStatus(
      input.paths.root,
      makeWorkerStatus({
        branch: input.branchPlan.branch,
        currentChange: input.change.changeId,
        latestEvidence: blockedEvidence,
        now: input.now,
        owner: input.options.workerName,
        state: "blocked",
      }),
    );
    updateChangeLease(
      input.paths.root,
      input.change.changeId,
      { latestEvidence: blockedEvidence, state: "blocked" },
      input.now,
    );
    return 1;
  }

  if (mode === "implement" && signal === "plan-done") {
    writeLine(input.stdout, `[agents] ${input.change.changeId} starting automatic finalization`);
    return runClaimedChange(input);
  }

  if (mode === "finalize" && signal === "plan-done") {
    const readyEvidence: AgentEvidence = {
      at: nowIso(input.now),
      message: `branch ${input.branchPlan.branch} ready for review`,
    };
    writeWorkerStatus(
      input.paths.root,
      makeWorkerStatus({
        branch: input.branchPlan.branch,
        currentChange: input.change.changeId,
        latestEvidence: readyEvidence,
        now: input.now,
        owner: input.options.workerName,
        state: "ready-for-review",
      }),
    );
    updateChangeLease(
      input.paths.root,
      input.change.changeId,
      { latestEvidence: readyEvidence, state: "ready-for-review" },
      input.now,
    );
    releaseChangeLease(input.paths.root, input.change.changeId, input.options.workerName);
  }

  return 0;
}

async function runIdleMaintenance(input: {
  cwd: string;
  now: () => Date;
  options: WatchOptions;
  paths: AgentStatePaths;
  runCommand: CommandRunner;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number> {
  const branches = listLocalChangeBranches(input.cwd, input.runCommand);
  if (branches.length === 0) {
    const evidence: AgentEvidence = {
      at: nowIso(input.now),
      message: "no claimable OpenSpec changes or change branches",
    };
    writeWorkerStatus(
      input.paths.root,
      makeWorkerStatus({
        latestEvidence: evidence,
        now: input.now,
        owner: input.options.workerName,
        state: "idle",
      }),
    );
    writeLine(input.stdout, "[agents] idle: no claimable work");
    return 0;
  }

  for (const branch of branches) {
    const changeId = changeIdFromBranch(branch);
    if (!changeId || readChangeLease(input.paths.root, changeId)) {
      continue;
    }

    const branchPlan = ensureChangeBranch(input.cwd, changeId, {
      baseRef: input.options.baseRef,
      runCommand: input.runCommand,
      workerName: input.options.workerName,
      worktreeDir: input.options.worktreeDir,
    });
    const result = input.runCommand(branchPlan.worktreeDir, "git", [
      "rebase",
      input.options.baseRef,
    ]);
    if (result.code === 0) {
      const evidence: AgentEvidence = {
        at: nowIso(input.now),
        command: `git rebase ${input.options.baseRef}`,
        message: `rebased ${branch}`,
      };
      writeWorkerStatus(
        input.paths.root,
        makeWorkerStatus({
          branch,
          currentChange: changeId,
          latestEvidence: evidence,
          now: input.now,
          owner: input.options.workerName,
          state: "idle",
        }),
      );
      writeLine(input.stdout, `[agents] idle rebase ok ${branch}`);
      return 0;
    }

    input.runCommand(branchPlan.worktreeDir, "git", ["rebase", "--abort"]);
    const evidence: AgentEvidence = {
      at: nowIso(input.now),
      command: `git rebase ${input.options.baseRef}`,
      message: `idle rebase conflict on ${branch}: ${result.stderr.trim()}`,
    };
    writeWorkerStatus(
      input.paths.root,
      makeWorkerStatus({
        branch,
        currentChange: changeId,
        latestEvidence: evidence,
        now: input.now,
        owner: input.options.workerName,
        state: "blocked",
      }),
    );
    writeLine(input.stdout, `[agents] idle rebase blocked ${branch}`);
    return 1;
  }

  writeLine(input.stdout, "[agents] idle: change branches are leased");
  return 0;
}

async function runWatchOnce(input: {
  cwd: string;
  now: () => Date;
  options: WatchOptions;
  runCommand: CommandRunner;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number> {
  const paths = resolveAgentStatePaths(input.cwd, input.runCommand);
  if (!input.options.dryRun) {
    ensureAgentStateDirs(paths);
    const ownedLease = findWorkerActiveLease(paths.root, input.options.workerName);
    if (ownedLease) {
      const branchPlan = ensureChangeBranch(input.cwd, ownedLease.changeId, {
        baseRef: input.options.baseRef,
        runCommand: input.runCommand,
        workerName: input.options.workerName,
        worktreeDir: input.options.worktreeDir,
      });
      writeLine(input.stdout, `[agents] resume ${ownedLease.changeId}`);
      return runClaimedChange({
        branchPlan,
        change: {
          artifactPaths: [],
          branch: ownedLease.branch,
          changeId: ownedLease.changeId,
        },
        now: input.now,
        options: input.options,
        paths,
        runCommand: input.runCommand,
        stdout: input.stdout,
      });
    }
  }

  const changes = discoverClaimableOpenSpecChanges(input.cwd, {
    baseRef: input.options.baseRef,
    runCommand: input.runCommand,
    stateRoot: input.options.dryRun ? null : paths.root,
  });
  const change = changes[0];

  if (!change) {
    if (input.options.dryRun) {
      writeLine(input.stdout, `[agents] worker ${input.options.workerName}`);
      writeLine(input.stdout, "[agents] dry-run idle: no claimable OpenSpec changes");
      return 0;
    }

    return runIdleMaintenance({
      cwd: input.cwd,
      now: input.now,
      options: input.options,
      paths,
      runCommand: input.runCommand,
      stdout: input.stdout,
    });
  }

  if (input.options.dryRun) {
    const branchPlan = planChangeBranch(input.cwd, change.changeId, {
      runCommand: input.runCommand,
      workerName: input.options.workerName,
      worktreeDir: input.options.worktreeDir,
    });
    showDryRunClaim({
      branchPlan,
      change,
      now: input.now,
      options: input.options,
      stdout: input.stdout,
    });
    return 0;
  }

  const claim = createChangeLease(paths.root, {
    changeId: change.changeId,
    latestEvidence: {
      at: nowIso(input.now),
      message: `claimed ${change.changeId}`,
    },
    now: input.now,
    owner: input.options.workerName,
  });

  if (!claim.claimed) {
    writeLine(input.stderr, `[agents] ${change.changeId} already leased`);
    return 1;
  }

  writeWorkerStatus(
    paths.root,
    makeWorkerStatus({
      branch: branchNameForChange(change.changeId),
      currentChange: change.changeId,
      latestEvidence: claim.lease?.latestEvidence,
      now: input.now,
      owner: input.options.workerName,
      state: "claiming",
    }),
  );

  let branchPlan: BranchPlan;
  try {
    branchPlan = ensureChangeBranch(input.cwd, change.changeId, {
      baseRef: input.options.baseRef,
      runCommand: input.runCommand,
      workerName: input.options.workerName,
      worktreeDir: input.options.worktreeDir,
    });
  } catch (error) {
    const evidence: AgentEvidence = {
      at: nowIso(input.now),
      message: `branch setup failed for ${change.changeId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
    writeWorkerStatus(
      paths.root,
      makeWorkerStatus({
        branch: branchNameForChange(change.changeId),
        currentChange: change.changeId,
        latestEvidence: evidence,
        now: input.now,
        owner: input.options.workerName,
        state: "blocked",
      }),
    );
    updateChangeLease(
      paths.root,
      change.changeId,
      { latestEvidence: evidence, state: "blocked" },
      input.now,
    );
    throw error;
  }

  return runClaimedChange({
    branchPlan,
    change,
    now: input.now,
    options: input.options,
    paths,
    runCommand: input.runCommand,
    stdout: input.stdout,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWatch(options: WatchOptions, deps: Required<WorkerDeps>): Promise<number> {
  for (;;) {
    const code = await runWatchOnce({
      cwd: deps.cwd,
      now: deps.now,
      options,
      runCommand: deps.runCommand,
      stderr: deps.stderr,
      stdout: deps.stdout,
    });
    if (options.once || code !== 0) {
      return code;
    }

    await sleep(options.intervalSeconds * 1000);
  }
}

function runStatus(
  options: StatusOptions,
  input: {
    cwd: string;
    runCommand: CommandRunner;
    stdout: Pick<NodeJS.WriteStream, "write">;
  },
): number {
  const paths = resolveAgentStatePaths(input.cwd, input.runCommand);
  if (options.workerName) {
    const status = readWorkerStatus(paths.root, options.workerName);
    writeLine(input.stdout, JSON.stringify(status, null, 2));
    return 0;
  }

  writeLine(input.stdout, paths.root);
  return 0;
}

function runRelease(
  options: ReleaseOptions,
  input: {
    cwd: string;
    runCommand: CommandRunner;
    stdout: Pick<NodeJS.WriteStream, "write">;
  },
): number {
  const paths = resolveAgentStatePaths(input.cwd, input.runCommand);
  const released = releaseChangeLease(paths.root, options.changeId, options.owner);
  writeLine(
    input.stdout,
    released ? `released ${options.changeId}` : `no matching lease ${options.changeId}`,
  );
  return released ? 0 : 1;
}

export async function runAgentsCli(args: string[], deps: WorkerDeps = {}): Promise<number> {
  const resolvedDeps: Required<WorkerDeps> = {
    cwd: deps.cwd ?? process.cwd(),
    now: deps.now ?? (() => new Date()),
    runCommand: deps.runCommand ?? defaultCommandRunner,
    stderr: deps.stderr ?? process.stderr,
    stdout: deps.stdout ?? process.stdout,
  };

  try {
    const options = parseAgentsArgs(args);
    if (options === "help") {
      writeLine(resolvedDeps.stdout, usage());
      return 0;
    }

    if (options.command === "watch") {
      return await runWatch(options, resolvedDeps);
    }

    if (options.command === "status") {
      return runStatus(options, resolvedDeps);
    }

    return runRelease(options, resolvedDeps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      writeLine(resolvedDeps.stderr, `${message}\n\n${usage()}`);
    } else {
      writeLine(resolvedDeps.stderr, message);
    }
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runAgentsCli(process.argv.slice(2));
}
