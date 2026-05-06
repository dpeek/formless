import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

type LoopOptions = {
  allowDirtyStart: boolean;
  baseRef: string;
  branch: string | null;
  dangerous: boolean;
  dryRun: boolean;
  maxIterations: number | null;
  prdPath: string;
  worktree: boolean;
  worktreeDir: string | null;
};

type LoopSignal = "blocked" | "none" | "plan-done" | "task-done";

type Workspace = {
  prdPath: string;
  rootDir: string;
  sourcePrdPath: string;
};

function usage(): string {
  return [
    "Usage: bun ralph <prd-path> [options]",
    "",
    "Runs Codex CLI repeatedly, one PRD chunk per invocation, until the PRD is done or blocked.",
    "",
    "Options:",
    "  --max <n>              Maximum Codex iterations. Defaults to open chunks + 1.",
    "  --worktree            Create or reuse a sibling git worktree for the PRD loop.",
    "  --worktree-dir <dir>  Worktree directory. Default: ../formless-<prd-slug>.",
    "  --branch <name>       Worktree branch. Default: codex/<prd-slug>.",
    "  --base <ref>          New worktree base ref. Default: main.",
    "  --dangerous            Use Codex's no-approval, no-sandbox mode.",
    "  --allow-dirty-start    Skip clean-worktree guards.",
    "  --dry-run              Print the command and prompt without running Codex.",
    "  -h, --help             Show this help.",
    "",
    "Example:",
    "  bun ralph ./prd/08-entity-action-module.md --worktree --max 6",
  ].join("\n");
}

function parseArgs(args: string[]): LoopOptions | "help" {
  const options: LoopOptions = {
    allowDirtyStart: false,
    baseRef: "main",
    branch: null,
    dangerous: false,
    dryRun: false,
    maxIterations: null,
    prdPath: "",
    worktree: false,
    worktreeDir: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      return "help";
    }

    if (arg === "--allow-dirty-start") {
      options.allowDirtyStart = true;
      continue;
    }

    if (arg === "--dangerous") {
      options.dangerous = true;
      continue;
    }

    if (arg === "--worktree") {
      options.worktree = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--base") {
      options.baseRef = nextValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      options.branch = nextValue(args, index, arg);
      options.worktree = true;
      index += 1;
      continue;
    }

    if (arg === "--max") {
      options.maxIterations = parsePositiveInteger(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--worktree-dir") {
      options.worktreeDir = nextValue(args, index, arg);
      options.worktree = true;
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.prdPath.length > 0) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    options.prdPath = arg;
  }

  if (options.prdPath.length === 0) {
    throw new Error("Missing PRD path.");
  }

  return options;
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function resolvePrdPath(baseDir: string, prdPath: string): string {
  const absolutePath = path.resolve(baseDir, prdPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`PRD does not exist: ${prdPath}`);
  }

  return absolutePath;
}

function displayPath(filePath: string, baseDir = rootDir): string {
  const relativePath = path.relative(baseDir, filePath);
  return relativePath.startsWith("..") ? filePath : `./${relativePath}`;
}

function pathInsideRoot(filePath: string): string {
  const relativePath = path.relative(rootDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`PRD must be inside repo root for worktree mode: ${filePath}`);
  }

  return relativePath;
}

function slugFromPrdPath(prdPath: string): string {
  return path
    .basename(prdPath, ".md")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function defaultBranchName(prdPath: string): string {
  return `codex/${slugFromPrdPath(prdPath)}`;
}

function defaultWorktreeDir(prdPath: string): string {
  const repoName = path.basename(rootDir);
  return path.join(path.dirname(rootDir), `${repoName}-${slugFromPrdPath(prdPath)}`);
}

function defaultMaxIterations(prdPath: string): number {
  const openChunks = countOpenChunks(readFileSync(prdPath, "utf8"));
  return Math.max(1, openChunks + 1);
}

function countOpenChunks(prd: string): number {
  const lines = prd.split(/\r?\n/);
  const chunksIndex = lines.findIndex((line) => line.trim() === "## Chunks");
  if (chunksIndex === -1) {
    return 1;
  }

  let count = 0;
  for (const line of lines.slice(chunksIndex + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      break;
    }

    if (!trimmed.startsWith("|")) {
      continue;
    }

    const cells = trimmed.split("|").map((cell) => cell.trim());
    const id = cells[1] ?? "";
    const status = (cells[2] ?? "").toLowerCase();
    if (
      id.length === 0 ||
      id === "ID" ||
      id.startsWith("-") ||
      status === "status" ||
      status.startsWith("-")
    ) {
      continue;
    }

    if (!["closed", "complete", "done", "shipped"].includes(status)) {
      count += 1;
    }
  }

  return count;
}

function spawnSyncText(
  cwd: string,
  command: string,
  args: string[],
): { code: number; stderr: string; stdout: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    code: typeof result.status === "number" ? result.status : 1,
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    stdout: typeof result.stdout === "string" ? result.stdout : "",
  };
}

function gitStatus(cwd: string): string {
  const result = spawnSyncText(cwd, "git", ["status", "--porcelain"]);
  if (result.code !== 0) {
    throw new Error(`git status failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function assertCleanWorktree(cwd: string, phase: string, allowDirtyStart: boolean): boolean {
  if (allowDirtyStart) {
    return true;
  }

  const status = gitStatus(cwd);
  if (status.length === 0) {
    return true;
  }

  process.stderr.write(
    [
      `Dirty worktree ${phase}; stopping ralph loop.`,
      `Worktree: ${cwd}`,
      "Commit or stash unrelated work first, or pass --allow-dirty-start if you accept that risk.",
      status.split(/\r?\n/).slice(0, 20).join("\n"),
      "",
    ].join("\n"),
  );
  return false;
}

function gitBranchExists(branch: string): boolean {
  const result = spawnSyncText(rootDir, "git", [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  return result.code === 0;
}

function gitCurrentBranch(cwd: string): string {
  const result = spawnSyncText(cwd, "git", ["branch", "--show-current"]);
  if (result.code !== 0) {
    throw new Error(`git branch failed in ${cwd}: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function gitTopLevel(cwd: string): string | null {
  const result = spawnSyncText(cwd, "git", ["rev-parse", "--show-toplevel"]);
  if (result.code !== 0) {
    return null;
  }

  return path.resolve(result.stdout.trim());
}

function isGitWorktree(worktreeDir: string): boolean {
  return gitTopLevel(worktreeDir) === path.resolve(worktreeDir);
}

function createWorktree(worktreeDir: string, branch: string, baseRef: string): void {
  const args = gitBranchExists(branch)
    ? ["worktree", "add", worktreeDir, branch]
    : ["worktree", "add", "-b", branch, worktreeDir, baseRef];
  const result = spawnSyncText(rootDir, "git", args);

  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
}

function prepareWorkspace(options: LoopOptions, sourcePrdPath: string): Workspace {
  if (!options.worktree) {
    return {
      prdPath: sourcePrdPath,
      rootDir,
      sourcePrdPath,
    };
  }

  const branch = options.branch ?? defaultBranchName(sourcePrdPath);
  const worktreeDir = path.resolve(
    rootDir,
    options.worktreeDir ?? defaultWorktreeDir(sourcePrdPath),
  );
  const relativePrdPath = pathInsideRoot(sourcePrdPath);

  if (options.dryRun) {
    return {
      prdPath: path.join(worktreeDir, relativePrdPath),
      rootDir: worktreeDir,
      sourcePrdPath,
    };
  }

  if (!assertCleanWorktree(rootDir, "before creating worktree", options.allowDirtyStart)) {
    throw new Error("Source checkout is dirty.");
  }

  if (existsSync(worktreeDir)) {
    if (!isGitWorktree(worktreeDir)) {
      throw new Error(`Worktree path exists but is not a git worktree: ${worktreeDir}`);
    }

    const currentBranch = gitCurrentBranch(worktreeDir);
    if (currentBranch !== branch) {
      throw new Error(
        `Worktree ${worktreeDir} is on ${currentBranch || "detached HEAD"}, expected ${branch}.`,
      );
    }
  } else {
    createWorktree(worktreeDir, branch, options.baseRef);
  }

  const prdPath = path.join(worktreeDir, relativePrdPath);
  if (!existsSync(prdPath)) {
    throw new Error(`PRD does not exist in worktree: ${prdPath}`);
  }

  return {
    prdPath,
    rootDir: worktreeDir,
    sourcePrdPath,
  };
}

function makeRunDir(prdPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = path.basename(prdPath, ".md");
  const runDir = path.join(rootDir, "tmp", "ralph-loop", `${timestamp}-${slug}`);
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

function buildPrompt(prdPath: string): string {
  return [
    `Implement the next chunk of ${prdPath}.`,
    "",
    "You are one PRD-chunk agent inside a ralph loop. Ship exactly one ready chunk, then stop.",
    "",
    "Workflow:",
    "0. Confirm the loop started you from a clean worktree. Stop with `<blocked/>` if it did not.",
    "1. Run `bun start` and read `./tmp/state.txt`, `./tmp/test.txt`, and `./tmp/check.txt`.",
    "2. Read `doc/overview.md`, `doc/current.md`, `doc/roadmap.md`, and the assigned PRD.",
    "3. Select the next ready chunk from the assigned PRD. Do not take chunks marked doing by another active agent.",
    "4. Implement only that chunk. Preserve user changes. Keep data model flat; compose in view/query layer.",
    "5. Update only the assigned PRD with status, decisions, blockers, evidence, and promote notes.",
    "6. Read `./tmp/state.txt`, `./tmp/test.txt`, and `./tmp/check.txt` again and fix issues. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually; `bun start` owns those outputs.",
    "7. If app behavior changed, smoke it with `bun browser ...` (`agent-browser`). Do not block on Codex IAB Browser Use in CLI loops.",
    "8. Rebase the current branch on local `main` before the final commit. Preserve your iteration changes with non-interactive git commands, and stop with `<blocked/>` on conflicts.",
    "9. Commit the chunk with a concise message. Do not amend existing commits.",
    "10. Final response must include changed files, checks, PRD status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.",
    "",
    "Loop contract:",
    "- Output `<task-done/>` when one chunk shipped and chunks remain.",
    "- Output `<plan-done/>` when the assigned PRD is complete.",
    "- Output `<blocked/>` when blocked; include the blocker evidence and likely next focus.",
  ].join("\n");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function codexArgs(
  options: LoopOptions,
  outputPath: string,
  prompt: string,
  workspaceRoot: string,
): string[] {
  const modeArgs = options.dangerous
    ? ["--dangerously-bypass-approvals-and-sandbox"]
    : ["--full-auto"];

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
      const message = `[ralph-loop] failed to run ${command}: ${error.message}\n`;
      process.stderr.write(message);
      log.write(message);
      settle(1);
    });
    child.on("close", (code) => {
      settle(code ?? 1);
    });
  });
}

function readFinalMessage(outputPath: string): string {
  try {
    return readFileSync(outputPath, "utf8");
  } catch {
    return "";
  }
}

function signalFromFinalMessage(message: string): LoopSignal {
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

async function runLoop(options: LoopOptions): Promise<number> {
  const sourcePrdPath = resolvePrdPath(rootDir, options.prdPath);
  const workspace = prepareWorkspace(options, sourcePrdPath);
  const prdPathForCount = existsSync(workspace.prdPath)
    ? workspace.prdPath
    : workspace.sourcePrdPath;
  const prdDisplayPath = displayPath(workspace.prdPath, workspace.rootDir);
  const maxIterations = options.maxIterations ?? defaultMaxIterations(prdPathForCount);
  const runDir = makeRunDir(sourcePrdPath);

  if (
    !options.dryRun &&
    !assertCleanWorktree(workspace.rootDir, "before start", options.allowDirtyStart)
  ) {
    return 1;
  }

  process.stdout.write(
    [
      `Ralph loop PRD ${prdDisplayPath}`,
      `Workspace ${workspace.rootDir}`,
      "Codex agent config from config.toml",
      `Max iterations ${maxIterations}`,
      `Logs ${displayPath(runDir)}`,
      "",
    ].join("\n"),
  );

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const padded = String(iteration).padStart(2, "0");
    const outputPath = path.join(runDir, `iteration-${padded}-final.md`);
    const logPath = path.join(runDir, `iteration-${padded}.log`);
    const promptPath = path.join(runDir, `iteration-${padded}-prompt.md`);
    const prompt = buildPrompt(prdDisplayPath);
    const args = codexArgs(options, outputPath, prompt, workspace.rootDir);
    writeFileSync(promptPath, `${prompt}\n`);

    process.stdout.write(`\n[ralph-loop] iteration ${iteration}/${maxIterations}\n`);
    if (options.dryRun) {
      process.stdout.write(`${["codex", ...args].map(shellQuote).join(" ")}\n`);
      process.stdout.write(`Prompt ${displayPath(promptPath)}\n`);
      return 0;
    }

    const code = await runWithTee("codex", args, logPath, workspace.rootDir);
    if (code !== 0) {
      process.stderr.write(
        `[ralph-loop] Codex exited with ${code}. Log: ${displayPath(logPath)}\n`,
      );
      return code;
    }

    const finalMessage = readFinalMessage(outputPath);
    const signal = signalFromFinalMessage(finalMessage);
    process.stdout.write(`[ralph-loop] signal ${signal}\n`);

    if (signal === "blocked") {
      process.stderr.write(`[ralph-loop] blocked. Final message: ${displayPath(outputPath)}\n`);
      return 1;
    }

    if (signal === "none") {
      process.stderr.write(
        `[ralph-loop] missing completion signal; stopping. Final message: ${displayPath(outputPath)}\n`,
      );
      return 1;
    }

    if (
      !assertCleanWorktree(
        workspace.rootDir,
        `after iteration ${iteration}`,
        options.allowDirtyStart,
      )
    ) {
      return 1;
    }

    if (signal === "plan-done") {
      process.stdout.write("[ralph-loop] PRD complete.\n");
      return 0;
    }
  }

  process.stderr.write(
    `[ralph-loop] reached max iterations (${maxIterations}) before plan done.\n`,
  );
  return 1;
}

async function main(): Promise<number> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options === "help") {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }

    return await runLoop(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${usage()}\n`);
    return 1;
  }
}

process.exitCode = await main();
