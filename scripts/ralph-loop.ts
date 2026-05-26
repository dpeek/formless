import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = process.cwd();
const githubRepo = "dpeek/formless";
const ralphRunningLabel = "ralph-running";
const excludedPickLabels = new Set([
  "needs-triage",
  "needs-info",
  "ready-for-human",
  "wontfix",
  ralphRunningLabel,
]);

class UsageError extends Error {}

type LoopMode = "finalize" | "loop";

type LoopOptions = {
  allowDirtyStart: boolean;
  baseRef: string;
  branch: string | null;
  dangerous: boolean;
  dryRun: boolean;
  issueNumber: number | null;
  list: boolean;
  maxIterations: number | null;
  mode: LoopMode;
  pick: boolean;
  prdPath: string;
  worktree: boolean;
  worktreeDir: string | null;
};

type LoopSignal = "blocked" | "none" | "plan-done" | "task-done";

type Workspace = {
  branch: string | null;
  prdPath: string | null;
  rootDir: string;
  worktreeDir: string | null;
};

type GithubLabel = {
  name: string;
};

type GithubComment = {
  body?: string | null;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
  author?: {
    login?: string;
  } | null;
};

type GithubIssue = {
  body?: string | null;
  comments?: GithubComment[];
  createdAt?: string;
  labels?: GithubLabel[];
  number: number;
  state?: string;
  title: string;
  updatedAt?: string;
  url?: string;
};

type FilePrdSource = {
  defaultBranch: string;
  defaultWorktreeDir: string;
  displayName: string;
  identity: string;
  kind: "file";
  relativePrdPath: string;
  slug: string;
  sourcePrdPath: string;
  textForCounting: string;
  updateTarget: string;
};

type IssuePrdSource = {
  defaultBranch: string;
  defaultWorktreeDir: string;
  displayName: string;
  identity: string;
  issue: GithubIssue;
  kind: "issue";
  slug: string;
  textForCounting: string;
  updateTarget: string;
};

type PrdSource = FilePrdSource | IssuePrdSource;

export function usage(): string {
  return [
    "Usage: bun ralph <prd-path> [options]",
    "       bun ralph --issue <number> [options]",
    "       bun ralph --pick [options]",
    "       bun ralph --list",
    "       bun ralph finalize --issue <number> [options]",
    "       bun ralph finalise --issue <number> [options]",
    "",
    "Runs Codex CLI repeatedly, one PRD chunk per invocation, until implementation is ready for finalization or blocked.",
    "Use finalize/finalise after review to promote docs and create the closing PRD commit.",
    "",
    "Options:",
    "  --issue <number>      Use a GitHub PRD issue as the assigned PRD.",
    "  --pick                Pick the oldest open prd + ready-for-agent issue.",
    "  --list                List open PRD issues without starting Codex.",
    "  --max <n>              Maximum Codex iterations. Defaults to open chunks + 1.",
    "  --worktree            Create or reuse a sibling git worktree for the PRD loop.",
    "  --worktree-dir <dir>  Worktree directory. Default: ../formless-<branch-or-prd-slug>.",
    "  --branch <name>       Worktree branch. Default: PRD Branch name or codex/<prd-or-issue-slug>.",
    "  --base <ref>          New worktree base ref. Default: local main.",
    "  --dangerous            Use Codex's no-approval, no-sandbox mode.",
    "  --allow-dirty-start    Skip clean-worktree guards.",
    "  --dry-run              Print the command and prompt without running Codex.",
    "  -h, --help             Show this help.",
    "",
    "Example:",
    "  bun ralph ./prd/08-entity-action-module.md --worktree --max 6",
    "  bun ralph --issue 2 --worktree",
    "  bun ralph --pick --worktree",
    "  bun ralph finalize --issue 24 --worktree",
  ].join("\n");
}

export function parseArgs(args: string[]): LoopOptions | "help" {
  const mode: LoopMode = args[0] === "finalize" || args[0] === "finalise" ? "finalize" : "loop";
  const parsedArgs = mode === "finalize" ? args.slice(1) : args;
  const options: LoopOptions = {
    allowDirtyStart: false,
    baseRef: "main",
    branch: null,
    dangerous: false,
    dryRun: false,
    issueNumber: null,
    list: false,
    maxIterations: null,
    mode,
    pick: false,
    prdPath: "",
    worktree: false,
    worktreeDir: null,
  };

  for (let index = 0; index < parsedArgs.length; index += 1) {
    const arg = parsedArgs[index];

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

    if (arg === "--list") {
      options.list = true;
      continue;
    }

    if (arg === "--pick") {
      options.pick = true;
      continue;
    }

    if (arg === "--issue") {
      options.issueNumber = parseIssueNumber(nextValue(parsedArgs, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--base") {
      options.baseRef = nextValue(parsedArgs, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      options.branch = nextValue(parsedArgs, index, arg);
      options.worktree = true;
      index += 1;
      continue;
    }

    if (arg === "--max") {
      options.maxIterations = parsePositiveInteger(nextValue(parsedArgs, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--worktree-dir") {
      options.worktreeDir = nextValue(parsedArgs, index, arg);
      options.worktree = true;
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option: ${arg}`);
    }

    if (options.prdPath.length > 0) {
      throw new UsageError(`Unexpected extra argument: ${arg}`);
    }

    options.prdPath = arg;
  }

  const selectedSources = [
    options.prdPath.length > 0,
    options.issueNumber !== null,
    options.pick,
    options.list,
  ].filter(Boolean).length;

  if (selectedSources === 0) {
    throw new UsageError(
      mode === "finalize"
        ? "Missing PRD source. Pass <prd-path> or --issue <number>."
        : "Missing PRD source. Pass <prd-path>, --issue <number>, --pick, or --list.",
    );
  }

  if (selectedSources > 1) {
    throw new UsageError("Choose exactly one PRD source: <prd-path>, --issue, --pick, or --list.");
  }

  if (mode === "finalize") {
    if (options.list || options.pick) {
      throw new UsageError(
        "finalize requires <prd-path> or --issue <number>; --list and --pick are loop commands.",
      );
    }

    if (options.maxIterations !== null) {
      throw new UsageError("finalize runs one Codex pass; --max is not supported.");
    }
  }

  return options;
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
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

function parseIssueNumber(value: string, flag: string): number {
  return parsePositiveInteger(value.replace(/^#/, ""), flag);
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function slugFromPrdPath(prdPath: string): string {
  return slugify(path.basename(prdPath, ".md")) || "prd";
}

function slugFromIssue(issue: GithubIssue): string {
  const titleForSlug = issue.title.replace(/^prd\s*[:：-]\s*/i, "");
  const titleSlug = slugify(titleForSlug) || "prd";
  return `issue-${issue.number}-${titleSlug}`;
}

function defaultBranchName(slug: string): string {
  return `codex/${slug}`;
}

function defaultWorktreeDir(slug: string): string {
  const repoName = path.basename(rootDir);
  return path.join(path.dirname(rootDir), `${repoName}-${slug}`);
}

function slugFromBranchName(branchName: string): string {
  return slugify(branchName.split("/").at(-1) ?? branchName) || "prd";
}

function normalizeBranchName(value: string): string {
  const raw = value
    .trim()
    .replace(/^`([^`]+)`$/, "$1")
    .replace(/^["']([^"']+)["']$/, "$1")
    .trim();
  const lowerRaw = raw.toLowerCase();

  if (
    raw.length === 0 ||
    raw.includes("<") ||
    raw.includes(">") ||
    ["tbd", "todo", "none", "n/a", "na"].includes(lowerRaw)
  ) {
    throw new Error("PRD Branch name is empty or still a placeholder.");
  }

  const branchName = raw.includes("/") ? raw : defaultBranchName(slugify(raw));
  if (!/^[a-z0-9][a-z0-9/-]*[a-z0-9]$/.test(branchName) || branchName.includes("//")) {
    throw new Error(
      `Invalid PRD Branch name "${raw}". Use a short lower-case slug, for example "site-publish" or "codex/site-publish".`,
    );
  }

  return branchName;
}

function branchNameFromPrdText(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const normalizedLine = line.trim().replaceAll("**", "");
    const match = normalizedLine.match(/^(?:[-*]\s*)?(?:ralph\s+)?branch(?:\s+name)?\s*:\s*(.+)$/i);
    if (match) {
      return normalizeBranchName(match[1] ?? "");
    }
  }

  return null;
}

function makeFilePrdSource(prdPath: string): FilePrdSource {
  const sourcePrdPath = resolvePrdPath(rootDir, prdPath);
  const relativePrdPath = path.relative(rootDir, sourcePrdPath);
  const slug = slugFromPrdPath(sourcePrdPath);
  const textForCounting = readFileSync(sourcePrdPath, "utf8");
  const defaultBranch = branchNameFromPrdText(textForCounting) ?? defaultBranchName(slug);

  return {
    defaultBranch,
    defaultWorktreeDir: defaultWorktreeDir(slugFromBranchName(defaultBranch)),
    displayName: displayPath(sourcePrdPath),
    identity: displayPath(sourcePrdPath),
    kind: "file",
    relativePrdPath,
    slug,
    sourcePrdPath,
    textForCounting,
    updateTarget: "the assigned PRD file",
  };
}

function makeIssuePrdSource(issue: GithubIssue): IssuePrdSource {
  const slug = slugFromIssue(issue);
  const textForCounting = issue.body ?? "";
  const defaultBranch = branchNameFromPrdText(textForCounting) ?? defaultBranchName(slug);

  return {
    defaultBranch,
    defaultWorktreeDir: defaultWorktreeDir(slugFromBranchName(defaultBranch)),
    displayName: `GitHub issue #${issue.number}: ${issue.title}`,
    identity: `GitHub issue #${issue.number}`,
    issue,
    kind: "issue",
    slug,
    textForCounting,
    updateTarget: `GitHub issue #${issue.number} body`,
  };
}

function defaultMaxIterations(source: PrdSource): number {
  const openChunks = countOpenChunks(source.textForCounting);
  return Math.max(1, openChunks + 1);
}

export function countOpenChunks(prd: string): number {
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
  const errorMessage = result.error instanceof Error ? result.error.message : "";

  return {
    code: typeof result.status === "number" ? result.status : 1,
    stderr:
      typeof result.stderr === "string" && result.stderr.length > 0 ? result.stderr : errorMessage,
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

function parseGhJson<T>(stdout: string, context: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`gh returned invalid JSON for ${context}: ${detail}`);
  }
}

function ensureGhAccess(): void {
  const version = spawnSyncText(rootDir, "gh", ["--version"]);
  if (version.code !== 0) {
    throw new Error(
      `GitHub issue mode requires the gh CLI. Install gh and authenticate before running Ralph.\n${version.stderr}`,
    );
  }

  const auth = spawnSyncText(rootDir, "gh", ["auth", "status", "--hostname", "github.com"]);
  if (auth.code !== 0) {
    throw new Error(
      `GitHub issue mode requires an authenticated gh CLI session for github.com.\n${auth.stderr}`,
    );
  }
}

function ghJson<T>(args: string[], context: string): T {
  const result = spawnSyncText(rootDir, "gh", args);
  if (result.code !== 0) {
    throw new Error(`gh ${args.join(" ")} failed for ${context}:\n${result.stderr}`);
  }

  return parseGhJson<T>(result.stdout, context);
}

function fetchGithubIssue(issueNumber: number): GithubIssue {
  return ghJson<GithubIssue>(
    [
      "issue",
      "view",
      String(issueNumber),
      "--repo",
      githubRepo,
      "--comments",
      "--json",
      "number,title,body,labels,comments,state,url,createdAt,updatedAt",
    ],
    `issue #${issueNumber}`,
  );
}

function listOpenPrdIssues(): GithubIssue[] {
  return ghJson<GithubIssue[]>(
    [
      "issue",
      "list",
      "--repo",
      githubRepo,
      "--state",
      "open",
      "--label",
      "prd",
      "--limit",
      "200",
      "--json",
      "number,title,labels,createdAt,updatedAt,url",
    ],
    "open PRD issues",
  );
}

function ghIssueEdit(issueNumber: number, args: string[]): void {
  const result = spawnSyncText(rootDir, "gh", [
    "issue",
    "edit",
    String(issueNumber),
    "--repo",
    githubRepo,
    ...args,
  ]);
  if (result.code !== 0) {
    throw new Error(`gh issue edit #${issueNumber} failed:\n${result.stderr}`);
  }
}

function labelNames(issue: Pick<GithubIssue, "labels">): string[] {
  return (issue.labels ?? []).map((label) => label.name).filter((name) => name.length > 0);
}

function hasLabel(issue: Pick<GithubIssue, "labels">, labelName: string): boolean {
  return labelNames(issue).includes(labelName);
}

function hasAllLabels(issue: Pick<GithubIssue, "labels">, labels: string[]): boolean {
  const names = new Set(labelNames(issue));
  return labels.every((label) => names.has(label));
}

function isReadyPrdIssue(issue: GithubIssue): boolean {
  return hasAllLabels(issue, ["prd", "ready-for-agent"]);
}

function isPickableIssue(issue: GithubIssue): boolean {
  if (!isReadyPrdIssue(issue)) {
    return false;
  }

  return labelNames(issue).every((label) => !excludedPickLabels.has(label));
}

function sortIssuesForList(issues: GithubIssue[]): GithubIssue[] {
  return [...issues].sort((left, right) => {
    const leftReady = isReadyPrdIssue(left);
    const rightReady = isReadyPrdIssue(right);
    if (leftReady !== rightReady) {
      return leftReady ? -1 : 1;
    }

    return compareIssueAge(left, right);
  });
}

function compareIssueAge(left: GithubIssue, right: GithubIssue): number {
  const leftTime = Date.parse(left.createdAt ?? "");
  const rightTime = Date.parse(right.createdAt ?? "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.number - right.number;
}

function formatIssueLabels(issue: GithubIssue): string {
  const labels = labelNames(issue);
  return labels.length > 0 ? labels.join(", ") : "none";
}

function printIssueList(issues: GithubIssue[]): void {
  if (issues.length === 0) {
    process.stdout.write(`No open PRD issues found for ${githubRepo}.\n`);
    return;
  }

  process.stdout.write(`Open PRD issues for ${githubRepo}:\n`);
  for (const issue of sortIssuesForList(issues)) {
    process.stdout.write(`#${issue.number} ${issue.title} | labels: ${formatIssueLabels(issue)}\n`);
  }
}

function pickIssue(issues: GithubIssue[]): GithubIssue | null {
  return [...issues].filter(isPickableIssue).sort(compareIssueAge)[0] ?? null;
}

function ensureRalphRunningLabel(): void {
  const labels = ghJson<GithubLabel[]>(
    [
      "label",
      "list",
      "--repo",
      githubRepo,
      "--search",
      ralphRunningLabel,
      "--limit",
      "100",
      "--json",
      "name",
    ],
    `${ralphRunningLabel} label`,
  );

  if (labels.some((label) => label.name === ralphRunningLabel)) {
    return;
  }

  const result = spawnSyncText(rootDir, "gh", [
    "label",
    "create",
    ralphRunningLabel,
    "--repo",
    githubRepo,
    "--description",
    "Ralph loop lease; issue is currently being worked by an automated agent.",
    "--color",
    "C2E0C6",
  ]);
  if (result.code !== 0) {
    throw new Error(`Failed to create ${ralphRunningLabel} label:\n${result.stderr}`);
  }
}

function claimIssue(source: IssuePrdSource): void {
  ensureRalphRunningLabel();

  const currentIssue = fetchGithubIssue(source.issue.number);
  if (hasLabel(currentIssue, ralphRunningLabel)) {
    throw new Error(`GitHub issue #${source.issue.number} already has ${ralphRunningLabel}.`);
  }

  ghIssueEdit(source.issue.number, ["--add-label", ralphRunningLabel]);
  process.stdout.write(
    `[ralph-loop] claimed issue #${source.issue.number} with ${ralphRunningLabel}\n`,
  );
}

function releaseIssueClaim(source: IssuePrdSource): void {
  try {
    ghIssueEdit(source.issue.number, ["--remove-label", ralphRunningLabel]);
    process.stdout.write(
      `[ralph-loop] removed ${ralphRunningLabel} from issue #${source.issue.number}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[ralph-loop] could not remove ${ralphRunningLabel} from issue #${source.issue.number}: ${message}\n`,
    );
  }
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

function prepareWorkspace(options: LoopOptions, source: PrdSource): Workspace {
  if (!options.worktree) {
    return {
      branch: null,
      prdPath: source.kind === "file" ? source.sourcePrdPath : null,
      rootDir,
      worktreeDir: null,
    };
  }

  const branch = options.branch ?? source.defaultBranch;
  const worktreeDir = path.resolve(rootDir, options.worktreeDir ?? source.defaultWorktreeDir);
  const relativePrdPath = source.kind === "file" ? pathInsideRoot(source.sourcePrdPath) : null;

  if (options.dryRun) {
    return {
      branch,
      prdPath: relativePrdPath ? path.join(worktreeDir, relativePrdPath) : null,
      rootDir: worktreeDir,
      worktreeDir,
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

  const prdPath = relativePrdPath ? path.join(worktreeDir, relativePrdPath) : null;
  if (prdPath && !existsSync(prdPath)) {
    throw new Error(`PRD does not exist in worktree: ${prdPath}`);
  }

  return {
    branch,
    prdPath,
    rootDir: worktreeDir,
    worktreeDir,
  };
}

function selectPrdSource(options: LoopOptions): PrdSource | null {
  if (options.prdPath.length > 0) {
    return makeFilePrdSource(options.prdPath);
  }

  ensureGhAccess();

  if (options.list) {
    printIssueList(listOpenPrdIssues());
    return null;
  }

  if (options.pick) {
    const issue = pickIssue(listOpenPrdIssues());
    if (!issue) {
      throw new Error(
        [
          `No open ${githubRepo} PRD issue is ready for Ralph.`,
          "Pick mode requires labels: prd, ready-for-agent.",
          `Excluded labels: ${[...excludedPickLabels].join(", ")}.`,
        ].join("\n"),
      );
    }

    process.stdout.write(`#${issue.number} ${issue.title} selected for Ralph.\n`);
    return makeIssuePrdSource(fetchGithubIssue(issue.number));
  }

  if (options.issueNumber !== null) {
    return makeIssuePrdSource(fetchGithubIssue(options.issueNumber));
  }

  throw new Error("Missing PRD source.");
}

function makeRunDir(source: PrdSource, mode: LoopMode = "loop"): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = mode === "finalize" ? "ralph-finalize" : "ralph-loop";
  const runDir = path.join(rootDir, "tmp", runRoot, `${timestamp}-${source.slug}`);
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

function assignedPrdDisplay(source: PrdSource, workspace: Workspace): string {
  if (source.kind === "file") {
    return displayPath(workspace.prdPath ?? source.sourcePrdPath, workspace.rootDir);
  }

  return source.identity;
}

function workflowStartInstruction(action: "command" | "loop", allowDirtyStart: boolean): string {
  if (allowDirtyStart) {
    return "Dirty start was explicitly allowed by Ralph. Inspect `git status` before editing, preserve existing changes, and do not stop solely because the worktree started dirty.";
  }

  return `Confirm the ${action} started you from a clean worktree. Stop with \`<blocked/>\` if it did not.`;
}

export function buildPrompt(
  source: PrdSource,
  workspace: Workspace,
  allowDirtyStart: boolean,
): string {
  const assignedDisplay = assignedPrdDisplay(source, workspace);
  const assignment =
    source.kind === "issue"
      ? [
          `Assigned PRD: GitHub issue #${source.issue.number} for ${githubRepo}.`,
          `Issue title: ${source.issue.title}`,
          `Read the issue body and comments with \`gh issue view #${source.issue.number} --repo ${githubRepo} --comments\`.`,
          "Treat the issue body as the canonical PRD context. Use comments only for human discussion, review notes, or escalation.",
          `Update ${source.updateTarget} for status, decisions, blockers, evidence, and promotion notes.`,
          "Do not create or edit local PRD files for GitHub PRDs.",
        ]
      : [
          `Assigned PRD: local file \`${assignedDisplay}\`.`,
          "Read the assigned PRD file for chunk status and decisions.",
          `Update only ${source.updateTarget} with status, decisions, blockers, evidence, and promotion notes.`,
        ];

  return [
    `Implement the next chunk of ${assignedDisplay}.`,
    "",
    "You are one PRD-chunk agent inside a ralph loop. Ship exactly one ready chunk, then stop.",
    "",
    ...assignment,
    "",
    "Workflow:",
    `0. ${workflowStartInstruction("loop", allowDirtyStart)}`,
    "1. Run `devstate start`.",
    "2. Read `doc/README.md`, `CONTEXT.md`, `doc/current.md`, `doc/roadmap.md`, relevant `doc/topics/*.md`, and the assigned PRD context.",
    "3. Select the next ready chunk from the assigned PRD. Do not take chunks marked doing by another active agent.",
    "4. Implement only that chunk. Preserve user changes. Keep data model flat; compose in view/query layer.",
    `5. Update only ${source.updateTarget} with status, decisions, blockers, evidence, and promotion notes.`,
    "6. Run `devstate check`, read `./.devstate/status.md`, and fix issues. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually; devstate owns those outputs.",
    "7. If app behavior changed, smoke it with `bun browser ...` (`agent-browser`). Do not block on Codex IAB Browser Use in CLI loops.",
    "8. Rebase the current branch on local `main` before the final commit. Use `git rebase main`; do not use `origin/main` unless the user explicitly asks. Preserve your iteration changes with non-interactive git commands, and stop with `<blocked/>` on conflicts.",
    "9. Commit the chunk with a concise message. Do not amend existing commits. Do not include `Fixes #...`; PRD finalization creates the closing commit.",
    "10. Final response must include changed files, checks, PRD status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.",
    "",
    "Loop contract:",
    "- Output `<task-done/>` when one chunk shipped and chunks remain.",
    "- Output `<plan-done/>` when implementation chunks are complete and the PRD is ready for finalization.",
    "- Output `<blocked/>` when blocked; include the blocker evidence and likely next focus.",
  ].join("\n");
}

export function buildFinalizationPrompt(
  source: PrdSource,
  workspace: Workspace,
  allowDirtyStart: boolean,
): string {
  const assignedDisplay = assignedPrdDisplay(source, workspace);
  const assignment =
    source.kind === "issue"
      ? [
          `Assigned PRD: GitHub issue #${source.issue.number} for ${githubRepo}.`,
          `Issue title: ${source.issue.title}`,
          `Read the issue body and comments with \`gh issue view #${source.issue.number} --repo ${githubRepo} --comments\`.`,
          "Treat the issue body as the canonical PRD record.",
          `Update ${source.updateTarget} with finalization status, evidence, and any remaining promotion notes.`,
          `Create the final commit with \`Fixes #${source.issue.number}\` in the commit message.`,
          "Do not close the GitHub issue directly; let the fixing commit close it when merged.",
        ]
      : [
          `Assigned PRD: local file \`${assignedDisplay}\`.`,
          "Read the assigned PRD file for status, decisions, evidence, and promotion notes.",
          `Update only ${source.updateTarget} with finalization status, evidence, and any remaining promotion notes.`,
        ];

  return [
    `Finalize ${assignedDisplay}.`,
    "",
    "You are a PRD finalization agent inside Ralph. This is an after-review cleanup pass, not a normal implementation chunk.",
    "",
    ...assignment,
    "",
    "Workflow:",
    `0. ${workflowStartInstruction("command", allowDirtyStart)}`,
    "1. Run `devstate start`.",
    "2. Read `doc/README.md`, `CONTEXT.md`, `doc/current.md`, `doc/roadmap.md`, relevant `doc/topics/*.md`, and the assigned PRD context.",
    "3. Verify all required chunks are `shipped` or intentionally `closed`, and promotion notes are ready. Stop with `<blocked/>` if the PRD is not ready for finalization.",
    "4. Rebase the current branch on local `main` before the docs/final commit. Use `git rebase main`; do not use `origin/main` unless the user explicitly asks. Preserve reviewed work with non-interactive git commands. Resolve rebase conflicts when the resolution is clear; stop with `<blocked/>` only when unsure how to resolve them.",
    "5. Promote PRD promotion notes into `doc/current.md`, `doc/roadmap.md`, and relevant `doc/topics/*.md`. Keep topic docs short, concrete, and source-faithful.",
    `6. Update ${source.updateTarget} so status and finalization are complete, latest evidence is recorded, and consumed promotion notes are marked or removed.`,
    "7. Run `devstate check`, read `./.devstate/status.md`, and fix issues. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually; devstate owns those outputs.",
    "8. Run `devstate stop`.",
    "9. Commit the finalization changes with a concise message. Do not amend existing commits.",
    "10. Do not merge unless the user explicitly asked for a merge.",
    "11. Final response must include changed files, checks, PRD status, and exactly one signal: `<plan-done/>` or `<blocked/>`.",
    "",
    "Finalization contract:",
    "- Output `<plan-done/>` when PRD finalization is complete.",
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
  const source = selectPrdSource(options);
  if (source === null) {
    return 0;
  }

  const workspace = prepareWorkspace(options, source);
  const maxIterations = options.maxIterations ?? defaultMaxIterations(source);
  const runDir = makeRunDir(source);
  let issueClaimed = false;

  if (
    !options.dryRun &&
    !assertCleanWorktree(workspace.rootDir, "before start", options.allowDirtyStart)
  ) {
    return 1;
  }

  process.stdout.write(
    [
      `Ralph loop PRD ${source.displayName}`,
      `Workspace ${workspace.rootDir}`,
      ...(workspace.branch ? [`Branch ${workspace.branch}`] : []),
      "Codex agent config from config.toml",
      `Max iterations ${maxIterations}`,
      `Logs ${displayPath(runDir)}`,
      "",
    ].join("\n"),
  );

  try {
    if (source.kind === "issue") {
      if (options.dryRun) {
        process.stdout.write(
          `[ralph-loop] dry run: would claim issue #${source.issue.number} with ${ralphRunningLabel}\n`,
        );
      } else {
        claimIssue(source);
        issueClaimed = true;
      }
    }

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const padded = String(iteration).padStart(2, "0");
      const outputPath = path.join(runDir, `iteration-${padded}-final.md`);
      const logPath = path.join(runDir, `iteration-${padded}.log`);
      const promptPath = path.join(runDir, `iteration-${padded}-prompt.md`);
      const prompt = buildPrompt(source, workspace, options.allowDirtyStart);
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
        process.stdout.write("[ralph-loop] PRD implementation ready for finalization.\n");
        return 0;
      }
    }

    process.stderr.write(
      `[ralph-loop] reached max iterations (${maxIterations}) before plan done.\n`,
    );
    return 1;
  } finally {
    if (source.kind === "issue" && issueClaimed) {
      releaseIssueClaim(source);
    }
  }
}

async function runFinalization(options: LoopOptions): Promise<number> {
  const source = selectPrdSource(options);
  if (source === null) {
    return 0;
  }

  const workspace = prepareWorkspace(options, source);
  const runDir = makeRunDir(source, "finalize");
  let issueClaimed = false;

  if (
    !options.dryRun &&
    !assertCleanWorktree(workspace.rootDir, "before finalization", options.allowDirtyStart)
  ) {
    return 1;
  }

  process.stdout.write(
    [
      `Ralph finalization PRD ${source.displayName}`,
      `Workspace ${workspace.rootDir}`,
      ...(workspace.branch ? [`Branch ${workspace.branch}`] : []),
      "Codex agent config from config.toml",
      `Logs ${displayPath(runDir)}`,
      "",
    ].join("\n"),
  );

  try {
    if (source.kind === "issue") {
      if (options.dryRun) {
        process.stdout.write(
          `[ralph-loop] dry run: would claim issue #${source.issue.number} with ${ralphRunningLabel}\n`,
        );
      } else {
        claimIssue(source);
        issueClaimed = true;
      }
    }

    const outputPath = path.join(runDir, "finalization-final.md");
    const logPath = path.join(runDir, "finalization.log");
    const promptPath = path.join(runDir, "finalization-prompt.md");
    const prompt = buildFinalizationPrompt(source, workspace, options.allowDirtyStart);
    const args = codexArgs(options, outputPath, prompt, workspace.rootDir);
    writeFileSync(promptPath, `${prompt}\n`);

    process.stdout.write("\n[ralph-loop] finalization\n");
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

    if (signal !== "plan-done") {
      process.stderr.write(
        `[ralph-loop] finalization expected <plan-done/> or <blocked/>. Final message: ${displayPath(outputPath)}\n`,
      );
      return 1;
    }

    if (!assertCleanWorktree(workspace.rootDir, "after finalization", options.allowDirtyStart)) {
      return 1;
    }

    process.stdout.write("[ralph-loop] PRD finalization complete.\n");
    return 0;
  } finally {
    if (source.kind === "issue" && issueClaimed) {
      releaseIssueClaim(source);
    }
  }
}

async function main(): Promise<number> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options === "help") {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }

    return options.mode === "finalize" ? await runFinalization(options) : await runLoop(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      process.stderr.write(`${message}\n\n${usage()}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
