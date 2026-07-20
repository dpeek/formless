#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

export type FormlessChangeState = "blocked" | "draft" | "ready" | "ready-for-review" | "working";

export type FormlessChangeTask = {
  description: string;
  done: boolean;
  id: string;
  line: number;
};

export type FormlessChangeTaskSection = {
  heading: string;
  line: number;
  tasks: FormlessChangeTask[];
};

export type FormlessChangeTrailers = {
  capabilities: string[];
  changeId: string;
  lastEvidenceAt: string | null;
  state: FormlessChangeState;
  version: string;
};

export type FormlessChangeCommitMetadata = {
  blockers: string;
  design: string;
  evidence: string;
  proposal: string;
  raw: string;
  taskSections: FormlessChangeTaskSection[];
  tasks: FormlessChangeTask[];
  title: string;
  trailers: FormlessChangeTrailers;
};

export type FormlessChangeMetadataParseResult =
  | {
      errors: [];
      metadata: FormlessChangeCommitMetadata;
      ok: true;
    }
  | {
      errors: string[];
      metadata: null;
      ok: false;
    };

export type FormlessChangeTaskStateUpdate = {
  description?: string;
  done: boolean;
  id: string;
};

export type FormlessChangeCommitMessageUpdate = {
  appendEvidence?: string | string[];
  blockers?: string;
  evidence?: string;
  taskStates?: FormlessChangeTaskStateUpdate[];
  trailers?: Partial<{
    capabilities: string[];
    changeId: string;
    lastEvidenceAt: string | null;
    state: FormlessChangeState;
    version: string;
  }>;
};

export type FormlessChangeQueryEntry = {
  blockerSummary: string | null;
  branch: string;
  capabilities: string[];
  changeId: string;
  latestEvidenceAt: string | null;
  remainingTasks: number;
  state: FormlessChangeState;
  valid: true;
};

export type InvalidFormlessChangeQueryEntry = {
  branch: string;
  errors: string[];
  valid: false;
};

export type FormlessChangeQueryResult = {
  changes: FormlessChangeQueryEntry[];
  invalid: InvalidFormlessChangeQueryEntry[];
};

export type AgentStatePaths = {
  leases: string;
  logs: string;
  root: string;
  workers: string;
};

export type CommittedOpenSpecChange = {
  applyInstructions?: ApplyInstructions;
  branch: string;
  changeId: string;
  metadata?: FormlessChangeCommitMetadata;
};

export type BranchPlan = {
  action: "create" | "resume";
  branch: string;
  workerBranch: string;
  worktreeDir: string;
};

type WatchOptions = {
  automaticWorkerName: boolean;
  baseRef: string;
  command: "watch";
  dangerous: boolean;
  dryRun: boolean;
  intervalSeconds: number;
  once: boolean;
  targetChangeId: string | null;
  workerName: string;
  worktreeDir: string | null;
};

type StatusOptions = {
  command: "status";
  workerName: string | null;
};

type ChangesOptions = {
  command: "changes";
  json: boolean;
};

type ChangeOptions = {
  changeId: string;
  command: "change";
  json: boolean;
};

type ReleaseOptions = {
  changeId: string;
  command: "release";
  owner: string | null;
};

type AgentsOptions = ChangeOptions | ChangesOptions | ReleaseOptions | StatusOptions | WatchOptions;

type WorkerIo = {
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
};

type WorkerDeps = Partial<WorkerIo> & {
  cwd?: string;
  now?: () => Date;
  runCommand?: CommandRunner;
  runSession?: CodexSessionRunner;
};

export type ApplyInstructionsTask = {
  description?: string;
  done?: boolean;
  id?: string;
};

export type ApplyInstructions = {
  changeDir?: string;
  changeName?: string;
  contextFiles?: Record<string, string[]>;
  instruction?: string;
  progress?: {
    complete?: number;
    remaining?: number;
    total?: number;
  };
  schemaName?: string;
  state?: string;
  tasks?: ApplyInstructionsTask[];
};

type PromptRenderOptions = {
  applyInstructions?: ApplyInstructions | null;
  baseRef?: string;
  branchDiff?: string | null;
  changeMetadata?: FormlessChangeCommitMetadata | null;
};

type GitBackedImplementationPromptSummary = {
  branchDiff: string;
  helperCommands: string;
  metadata: string;
  selectedTaskSection: string;
  taskState: string;
};

type WorkerSessionMode = "finalize" | "implement";

type CodexSessionRunner = (input: {
  applyInstructions?: ApplyInstructions | null;
  baseRef: string;
  branchDiff?: string | null;
  changeMetadata?: FormlessChangeCommitMetadata | null;
  changeId: string;
  dangerous: boolean;
  mode: WorkerSessionMode;
  paths: AgentStatePaths;
  runCommand: CommandRunner;
  selectedTaskSection?: FormlessChangeTaskSection | null;
  workerName: string;
  worktreeDir: string;
  now: () => Date;
  stdout: Pick<NodeJS.WriteStream, "write">;
}) => Promise<"blocked" | "none" | "plan-done" | "task-done">;

type FinalizationOutcome =
  | {
      evidence: AgentEvidence;
      signal: "blocked";
    }
  | {
      evidence: AgentEvidence;
      signal: "plan-done";
    };

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gitBackedPromptTemplatePaths = {
  finalize: path.resolve(
    scriptDir,
    "..",
    ".agents",
    "skills",
    "change-finalize",
    "templates",
    "local-finalize.md",
  ),
  implement: path.resolve(
    scriptDir,
    "..",
    ".agents",
    "skills",
    "change-apply",
    "templates",
    "local-implement.md",
  ),
} as const;
const leaseFileName = "lease.json";
const watcherReservationFileSuffix = ".watch.json";
const defaultBaseRef = "main";
const defaultIntervalSeconds = 10;
const workerCodexModel = "gpt-5.6-sol";
const workerCodexPermissionProfile = "formless-worker";
export const cavemanWorkerNames = ["grug", "thag", "ooga", "barg"] as const;
export const defaultStaleLeaseHeartbeatMs = 6 * 60 * 60 * 1000;

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

function commandResultSummary(result: CommandResult): string {
  return result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

const activeLeaseStates = new Set<WorkerState>(["claiming", "working", "finalizing"]);

export type ChangeLeaseClassification =
  | {
      kind: "blocked";
      lease: LeaseRecord;
    }
  | {
      kind: "ready-for-review";
      lease: LeaseRecord;
    }
  | {
      kind: "released";
      lease?: LeaseRecord;
      reason: string;
    }
  | {
      kind: "stale-active";
      lease: LeaseRecord;
      reason: string;
    }
  | {
      kind: "valid-active";
      lease: LeaseRecord;
    };

function isActiveLeaseState(state: WorkerState): boolean {
  return activeLeaseStates.has(state);
}

function defaultIsProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}

function staleHeartbeatReason(
  lease: LeaseRecord,
  now: Date,
  staleHeartbeatMs: number,
): string | null {
  const heartbeatMs = Date.parse(lease.heartbeatAt);
  if (!Number.isFinite(heartbeatMs)) {
    return `heartbeat ${lease.heartbeatAt} is invalid`;
  }

  const ageMs = now.getTime() - heartbeatMs;
  if (ageMs > staleHeartbeatMs) {
    return `heartbeat ${lease.heartbeatAt} is older than ${Math.round(staleHeartbeatMs / 1000)}s`;
  }

  return null;
}

export function classifyChangeLease(
  lease: LeaseRecord | null,
  options: {
    isProcessAlive?: (pid: number) => boolean;
    now?: () => Date;
    staleHeartbeatMs?: number;
  } = {},
): ChangeLeaseClassification {
  if (!lease) {
    return { kind: "released", reason: "lease does not exist" };
  }

  if (lease.state === "released") {
    return { kind: "released", lease, reason: "lease state is released" };
  }

  if (lease.state === "blocked") {
    return { kind: "blocked", lease };
  }

  if (lease.state === "ready-for-review") {
    return { kind: "ready-for-review", lease };
  }

  if (!isActiveLeaseState(lease.state)) {
    return {
      kind: "released",
      lease,
      reason: `lease state ${lease.state} does not block claims`,
    };
  }

  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const staleHeartbeatMs = options.staleHeartbeatMs ?? defaultStaleLeaseHeartbeatMs;
  const now = (options.now ?? (() => new Date()))();
  const reasons: string[] = [];

  if (typeof lease.pid === "number" && !isProcessAlive(lease.pid)) {
    reasons.push(`recorded pid ${lease.pid} is not alive`);
  }

  const heartbeatReason = staleHeartbeatReason(lease, now, staleHeartbeatMs);
  if (heartbeatReason) {
    reasons.push(heartbeatReason);
  }

  if (reasons.length > 0) {
    return { kind: "stale-active", lease, reason: reasons.join("; ") };
  }

  return { kind: "valid-active", lease };
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

export function workerBranchName(workerName: string): string {
  return `agents/${validateWorkerName(workerName)}`;
}

export function changeIdFromBranch(branch: string): string | null {
  const match = branch.match(/^changes\/(.+)$/);
  return match ? validateChangeId(match[1] ?? "") : null;
}

const formlessChangeTrailerNames = {
  capabilities: "Formless-Capabilities",
  changeId: "Formless-Change-Id",
  lastEvidenceAt: "Formless-Last-Evidence-At",
  state: "Formless-Change-State",
  version: "Formless-Change-Version",
} as const;

const requiredFormlessChangeTrailers = [
  formlessChangeTrailerNames.changeId,
  formlessChangeTrailerNames.version,
  formlessChangeTrailerNames.state,
  formlessChangeTrailerNames.capabilities,
  formlessChangeTrailerNames.lastEvidenceAt,
] as const;

const formlessChangeStates = new Set<FormlessChangeState>([
  "blocked",
  "draft",
  "ready",
  "ready-for-review",
  "working",
]);

type CommitMessageParts = {
  bodyLines: string[];
  trailerLines: string[];
};

type IndexedCommitSection = {
  content: string;
  contentEnd: number;
  contentStart: number;
  heading: string;
  key: string;
  line: number;
};

function normalizeCommitMessage(message: string): string {
  return message.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trailerLineParts(line: string): { key: string; value: string } | null {
  const match = line.match(/^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/);
  return match ? { key: match[1] ?? "", value: match[2] ?? "" } : null;
}

function splitCommitMessageParts(message: string): CommitMessageParts {
  const lines = normalizeCommitMessage(message).replace(/\n+$/, "").split("\n");
  let end = lines.length - 1;
  while (end >= 0 && lines[end]?.trim() === "") {
    end -= 1;
  }

  let start = end;
  while (start >= 0 && trailerLineParts(lines[start] ?? "") !== null) {
    start -= 1;
  }

  const trailerStart = start + 1;
  const hasTrailerSeparator =
    trailerStart <= end && (trailerStart === 0 || lines[start]?.trim() === "");
  if (!hasTrailerSeparator) {
    return { bodyLines: lines, trailerLines: [] };
  }

  return {
    bodyLines: lines.slice(0, Math.max(start, 0)),
    trailerLines: lines.slice(trailerStart, end + 1),
  };
}

function normalizedSectionKey(heading: string): string | null {
  const normalized = heading.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized === "proposal") {
    return "proposal";
  }
  if (normalized === "design") {
    return "design";
  }
  if (normalized === "tasks") {
    return "tasks";
  }
  if (normalized === "evidence") {
    return "evidence";
  }
  if (normalized === "blocker" || normalized === "blockers") {
    return "blockers";
  }
  return null;
}

function trimSectionContent(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1]?.trim() === "") {
    end -= 1;
  }
  return lines.slice(start, end).join("\n");
}

function indexedCommitSections(bodyLines: string[]): IndexedCommitSection[] {
  const headingIndexes: Array<{ heading: string; index: number; key: string }> = [];
  for (let index = 0; index < bodyLines.length; index += 1) {
    const match = bodyLines[index]?.match(/^##[ \t]+(.+?)\s*$/);
    if (!match) {
      continue;
    }

    const key = normalizedSectionKey(match[1] ?? "");
    if (key) {
      headingIndexes.push({ heading: match[1] ?? "", index, key });
    }
  }

  return headingIndexes.map((section, index) => {
    const contentStart = section.index + 1;
    const contentEnd = headingIndexes[index + 1]?.index ?? bodyLines.length;
    return {
      content: trimSectionContent(bodyLines.slice(contentStart, contentEnd)),
      contentEnd,
      contentStart,
      heading: section.heading,
      key: section.key,
      line: section.index + 1,
    };
  });
}

function parseCapabilities(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((capability) => capability.trim())
    .filter((capability) => capability.length > 0);
}

function parseFormlessChangeTrailers(trailerLines: string[]): {
  errors: string[];
  trailers: FormlessChangeTrailers | null;
} {
  const errors: string[] = [];
  const trailers = new Map<string, string>();

  for (const line of trailerLines) {
    const parts = trailerLineParts(line);
    if (!parts) {
      errors.push(`Malformed change metadata trailer: ${line}`);
      continue;
    }

    if (trailers.has(parts.key)) {
      errors.push(`Duplicate change metadata trailer: ${parts.key}`);
      continue;
    }
    trailers.set(parts.key, parts.value.trim());
  }

  for (const key of requiredFormlessChangeTrailers) {
    if (!trailers.has(key)) {
      errors.push(`Missing required change metadata trailer: ${key}`);
    }
  }

  const changeId = trailers.get(formlessChangeTrailerNames.changeId) ?? "";
  if (changeId.length > 0) {
    try {
      validateChangeId(changeId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const version = trailers.get(formlessChangeTrailerNames.version) ?? "";
  if (!/^[1-9][0-9]*$/.test(version)) {
    errors.push(`${formlessChangeTrailerNames.version} must be a positive integer.`);
  }

  const state = trailers.get(formlessChangeTrailerNames.state) ?? "";
  if (!formlessChangeStates.has(state as FormlessChangeState)) {
    errors.push(
      `${formlessChangeTrailerNames.state} must be one of ${[...formlessChangeStates].join(", ")}.`,
    );
  }

  const lastEvidenceAt = trailers.get(formlessChangeTrailerNames.lastEvidenceAt) ?? "";
  if (lastEvidenceAt.length > 0 && Number.isNaN(Date.parse(lastEvidenceAt))) {
    errors.push(`${formlessChangeTrailerNames.lastEvidenceAt} must be an ISO timestamp or empty.`);
  }

  if (errors.length > 0) {
    return { errors, trailers: null };
  }

  return {
    errors,
    trailers: {
      capabilities: parseCapabilities(trailers.get(formlessChangeTrailerNames.capabilities) ?? ""),
      changeId,
      lastEvidenceAt: lastEvidenceAt.length > 0 ? lastEvidenceAt : null,
      state: state as FormlessChangeState,
      version,
    },
  };
}

function parseFormlessTasks(tasksContent: string): {
  errors: string[];
  sections: FormlessChangeTaskSection[];
  tasks: FormlessChangeTask[];
} {
  const errors: string[] = [];
  const lines = normalizeCommitMessage(tasksContent).split("\n");
  const sections: FormlessChangeTaskSection[] = [];
  let currentSection: FormlessChangeTaskSection = {
    heading: "Tasks",
    line: 1,
    tasks: [],
  };
  sections.push(currentSection);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = line.match(/^#{3,6}[ \t]+(.+?)\s*$/);
    if (heading) {
      currentSection = {
        heading: heading[1] ?? "",
        line: index + 1,
        tasks: [],
      };
      sections.push(currentSection);
      continue;
    }

    const task = line.match(/^[ \t]*-[ \t]+\[([ xX])\][ \t]+(\S+)[ \t]+(.+?)\s*$/);
    if (task) {
      currentSection.tasks.push({
        description: task[3] ?? "",
        done: (task[1] ?? "") !== " ",
        id: task[2] ?? "",
        line: index + 1,
      });
      continue;
    }

    if (/^[ \t]*-[ \t]+\[[^\]]*\]/.test(line)) {
      errors.push(`Malformed task checkbox at Tasks line ${index + 1}: ${line.trim()}`);
    }
  }

  const tasks = sections.flatMap((section) => section.tasks);
  if (tasks.length === 0) {
    errors.push("Tasks section must contain at least one task checkbox.");
  }

  return {
    errors,
    sections: sections.filter((section) => section.tasks.length > 0),
    tasks,
  };
}

export function parseFormlessChangeCommitMessage(
  message: string,
  options: { branch?: string | null } = {},
): FormlessChangeMetadataParseResult {
  const errors: string[] = [];
  const normalized = normalizeCommitMessage(message);
  const parts = splitCommitMessageParts(normalized);
  const { trailers, errors: trailerErrors } = parseFormlessChangeTrailers(parts.trailerLines);
  errors.push(...trailerErrors);

  if (options.branch) {
    const branchChangeId = changeIdFromBranch(options.branch);
    if (!branchChangeId) {
      errors.push(`Change metadata branch must use changes/<change-id>: ${options.branch}`);
    } else if (trailers && trailers.changeId !== branchChangeId) {
      errors.push(
        `Change metadata id ${trailers.changeId} does not match branch ${options.branch}.`,
      );
    }
  }

  const sections = indexedCommitSections(parts.bodyLines);
  const byKey = new Map<string, IndexedCommitSection>();
  for (const section of sections) {
    if (byKey.has(section.key)) {
      errors.push(`Duplicate change metadata section: ${section.heading}`);
      continue;
    }
    byKey.set(section.key, section);
  }

  for (const key of ["proposal", "design", "tasks", "evidence", "blockers"]) {
    if (!byKey.has(key)) {
      errors.push(`Missing required change metadata section: ${key}`);
    }
  }

  const parsedTasks = parseFormlessTasks(byKey.get("tasks")?.content ?? "");
  errors.push(...parsedTasks.errors);

  if (!trailers || errors.length > 0) {
    return { errors, metadata: null, ok: false };
  }

  const firstSectionLine = sections[0]?.line ?? 1;
  const title = trimSectionContent(parts.bodyLines.slice(0, firstSectionLine - 1))
    .split("\n")[0]
    ?.trim();

  return {
    errors: [],
    metadata: {
      blockers: byKey.get("blockers")?.content ?? "",
      design: byKey.get("design")?.content ?? "",
      evidence: byKey.get("evidence")?.content ?? "",
      proposal: byKey.get("proposal")?.content ?? "",
      raw: normalized,
      taskSections: parsedTasks.sections,
      tasks: parsedTasks.tasks,
      title: title && title.length > 0 ? title : trailers.changeId,
      trailers,
    },
    ok: true,
  };
}

function findRequiredSection(sections: IndexedCommitSection[], key: string): IndexedCommitSection {
  const section = sections.find((candidate) => candidate.key === key);
  if (!section) {
    throw new Error(`Cannot update missing change metadata section: ${key}`);
  }
  return section;
}

function normalizedReplacementLines(content: string): string[] {
  const normalized = normalizeCommitMessage(content).replace(/\n+$/, "");
  return normalized.length > 0 ? normalized.split("\n") : [];
}

function updateTaskStateContent(content: string, updates: FormlessChangeTaskStateUpdate[]): string {
  const pending = new Map(updates.map((update) => [update.id, update]));
  const lines = normalizeCommitMessage(content).split("\n");
  const taskLine = /^([ \t]*-[ \t]+\[)([ xX])(\][ \t]+)(\S+)([ \t]+)(.+?)(\s*)$/;

  const updatedLines = lines.map((line) => {
    const match = line.match(taskLine);
    if (!match) {
      return line;
    }

    const id = match[4] ?? "";
    const update = pending.get(id);
    if (!update) {
      return line;
    }

    pending.delete(id);
    return [
      match[1] ?? "",
      update.done ? "x" : " ",
      match[3] ?? "",
      id,
      match[5] ?? " ",
      update.description ?? match[6] ?? "",
      match[7] ?? "",
    ].join("");
  });

  if (pending.size > 0) {
    throw new Error(
      `Cannot update missing change metadata tasks: ${[...pending.keys()].join(", ")}`,
    );
  }

  return updatedLines.join("\n");
}

function updatedSectionContent(
  section: IndexedCommitSection,
  update: FormlessChangeCommitMessageUpdate,
): string | null {
  if (section.key === "tasks" && update.taskStates && update.taskStates.length > 0) {
    return updateTaskStateContent(section.content, update.taskStates);
  }

  if (section.key === "evidence") {
    if (typeof update.evidence === "string") {
      return update.evidence;
    }
    if (update.appendEvidence !== undefined) {
      const additions = Array.isArray(update.appendEvidence)
        ? update.appendEvidence
        : [update.appendEvidence];
      const existing = section.content.trimEnd();
      return [existing, ...additions].filter((line) => line.length > 0).join("\n");
    }
  }

  if (section.key === "blockers" && typeof update.blockers === "string") {
    return update.blockers;
  }

  return null;
}

function applySectionUpdates(
  bodyLines: string[],
  update: FormlessChangeCommitMessageUpdate,
): string[] {
  const sections = indexedCommitSections(bodyLines);
  if (update.taskStates && update.taskStates.length > 0) {
    findRequiredSection(sections, "tasks");
  }
  if (typeof update.evidence === "string" || update.appendEvidence !== undefined) {
    findRequiredSection(sections, "evidence");
  }
  if (typeof update.blockers === "string") {
    findRequiredSection(sections, "blockers");
  }

  const byLine = new Map(sections.map((section) => [section.line - 1, section]));
  const output: string[] = [];
  for (let index = 0; index < bodyLines.length; index += 1) {
    const section = byLine.get(index);
    if (!section) {
      output.push(bodyLines[index] ?? "");
      continue;
    }

    output.push(bodyLines[index] ?? "");
    const replacement = updatedSectionContent(section, update);
    if (replacement === null) {
      output.push(...bodyLines.slice(section.contentStart, section.contentEnd));
    } else {
      const replacementLines = normalizedReplacementLines(replacement);
      if (replacementLines.length > 0) {
        output.push("", ...replacementLines, "");
      } else {
        output.push("");
      }
    }
    index = section.contentEnd - 1;
  }

  return output;
}

function trailerUpdateEntries(
  trailers: NonNullable<FormlessChangeCommitMessageUpdate["trailers"]>,
): Map<string, string> {
  const entries = new Map<string, string>();
  if (trailers.changeId !== undefined) {
    entries.set(formlessChangeTrailerNames.changeId, trailers.changeId);
  }
  if (trailers.version !== undefined) {
    entries.set(formlessChangeTrailerNames.version, trailers.version);
  }
  if (trailers.state !== undefined) {
    entries.set(formlessChangeTrailerNames.state, trailers.state);
  }
  if (trailers.capabilities !== undefined) {
    entries.set(formlessChangeTrailerNames.capabilities, trailers.capabilities.join(", "));
  }
  if (trailers.lastEvidenceAt !== undefined) {
    entries.set(formlessChangeTrailerNames.lastEvidenceAt, trailers.lastEvidenceAt ?? "");
  }
  return entries;
}

function applyTrailerUpdates(
  trailerLines: string[],
  update: FormlessChangeCommitMessageUpdate,
): string[] {
  const updates = update.trailers
    ? trailerUpdateEntries(update.trailers)
    : new Map<string, string>();
  if (updates.size === 0) {
    return trailerLines;
  }

  const seen = new Set<string>();
  const output = trailerLines.map((line) => {
    const parts = trailerLineParts(line);
    if (!parts || !updates.has(parts.key)) {
      return line;
    }

    seen.add(parts.key);
    return `${parts.key}: ${updates.get(parts.key) ?? ""}`;
  });

  for (const key of requiredFormlessChangeTrailers) {
    if (updates.has(key) && !seen.has(key)) {
      output.push(`${key}: ${updates.get(key) ?? ""}`);
    }
  }

  return output;
}

export function formatFormlessChangeCommitMessage(
  message: string,
  update: FormlessChangeCommitMessageUpdate,
): string {
  const parts = splitCommitMessageParts(message);
  const bodyLines = applySectionUpdates(parts.bodyLines, update);
  const trailerLines = applyTrailerUpdates(parts.trailerLines, update);
  const body = bodyLines.join("\n").replace(/\n+$/, "");
  const trailers = trailerLines.join("\n").replace(/\n+$/, "");
  return trailers.length > 0 ? `${body}\n\n${trailers}\n` : `${body}\n`;
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

export type WorkerNameReservation = {
  owner: string;
  path: string;
  pid: number;
  reservationId: string;
};

type StoredWorkerNameReservation = Omit<WorkerNameReservation, "path"> & {
  startedAt: string;
};

function watcherReservationPath(stateRoot: string, workerName: string): string {
  return path.join(
    stateRoot,
    "workers",
    `${validateWorkerName(workerName)}${watcherReservationFileSuffix}`,
  );
}

function readWatcherReservation(filePath: string): StoredWorkerNameReservation | null {
  try {
    const reservation = readJsonFile<StoredWorkerNameReservation>(filePath);
    if (
      !reservation ||
      typeof reservation.owner !== "string" ||
      typeof reservation.pid !== "number" ||
      typeof reservation.reservationId !== "string"
    ) {
      return null;
    }
    return reservation;
  } catch {
    return null;
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function isFileMissingError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function availableCavemanWorkerName(
  stateRoot: string,
  isProcessAlive: (pid: number) => boolean = defaultIsProcessAlive,
): string {
  for (const workerName of cavemanWorkerNames) {
    const reservation = readWatcherReservation(watcherReservationPath(stateRoot, workerName));
    if (!reservation || !isProcessAlive(reservation.pid)) {
      return workerName;
    }
  }

  throw new UsageError(`all caveman worker names are running: ${cavemanWorkerNames.join(", ")}`);
}

export function reserveWorkerName(
  stateRoot: string,
  requestedWorkerName: string | null,
  options: {
    isProcessAlive?: (pid: number) => boolean;
    now?: () => Date;
    pid?: number;
  } = {},
): WorkerNameReservation {
  const candidates = requestedWorkerName
    ? [validateWorkerName(requestedWorkerName)]
    : [...cavemanWorkerNames];
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const now = options.now ?? (() => new Date());
  const pid = options.pid ?? process.pid;

  for (const workerName of candidates) {
    const filePath = watcherReservationPath(stateRoot, workerName);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const startedAt = nowIso(now);
      const reservationId = `${pid}:${startedAt}:${workerName}`;
      const stored: StoredWorkerNameReservation = {
        owner: workerName,
        pid,
        reservationId,
        startedAt,
      };

      try {
        writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx",
        });
        return { owner: workerName, path: filePath, pid, reservationId };
      } catch (error) {
        if (!isFileExistsError(error)) {
          throw error;
        }
      }

      const existing = readWatcherReservation(filePath);
      if (existing && isProcessAlive(existing.pid)) {
        break;
      }

      const stalePath = `${filePath}.stale-${pid}-${attempt}`;
      try {
        renameSync(filePath, stalePath);
        rmSync(stalePath, { force: true });
      } catch (error) {
        if (!isFileMissingError(error)) {
          throw error;
        }
      }
    }
  }

  const label = requestedWorkerName
    ? `worker ${requestedWorkerName} is already running`
    : `all caveman worker names are running: ${cavemanWorkerNames.join(", ")}`;
  throw new UsageError(label);
}

export function releaseWorkerName(reservation: WorkerNameReservation): boolean {
  const existing = readWatcherReservation(reservation.path);
  if (!existing || existing.reservationId !== reservation.reservationId) {
    return false;
  }

  rmSync(reservation.path, { force: true });
  return true;
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
  patch: Partial<Pick<LeaseRecord, "latestEvidence" | "owner" | "state">>,
  now: () => Date = () => new Date(),
): LeaseRecord {
  const lease = readChangeLease(stateRoot, changeId);
  if (!lease) {
    throw new Error(`No lease exists for ${changeId}.`);
  }

  const updated: LeaseRecord = {
    ...lease,
    ...patch,
    owner: patch.owner ? validateWorkerName(patch.owner) : lease.owner,
    heartbeatAt: nowIso(now),
    pid: isActiveLeaseState(patch.state ?? lease.state) ? process.pid : lease.pid,
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

export function discoverLocalFormlessChangeBranches(
  cwd: string,
  runCommand = defaultCommandRunner,
): CommittedOpenSpecChange[] {
  return listLocalChangeBranches(cwd, runCommand)
    .flatMap((branch) => {
      const result = readFormlessChangeBranchMetadata(cwd, branch, runCommand);
      return result.ok
        ? [
            {
              branch,
              changeId: result.metadata.trailers.changeId,
              metadata: result.metadata,
            },
          ]
        : [];
    })
    .sort((left, right) => left.changeId.localeCompare(right.changeId));
}

export function discoverClaimableOpenSpecChanges(
  cwd: string,
  options: {
    baseRef?: string;
    targetChangeId?: string | null;
    now?: () => Date;
    runCommand?: CommandRunner;
    stateRoot?: string | null;
  } = {},
): CommittedOpenSpecChange[] {
  const baseRef = options.baseRef ?? defaultBaseRef;
  const targetChangeId = options.targetChangeId ? validateChangeId(options.targetChangeId) : null;
  const now = options.now ?? (() => new Date());
  const runCommand = options.runCommand ?? defaultCommandRunner;
  const changes = discoverLocalFormlessChangeBranches(cwd, runCommand).filter(
    (change) => !targetChangeId || change.changeId === targetChangeId,
  );

  const claimableChanges = changes.flatMap((change) => {
    if (!change.metadata || !formlessChangeMetadataAllowsClaim(change.metadata)) {
      return [];
    }

    if (options.stateRoot) {
      const classification = classifyChangeLease(
        readChangeLease(options.stateRoot, change.changeId),
        {
          now,
        },
      );
      if (
        classification.kind === "blocked" ||
        classification.kind === "ready-for-review" ||
        classification.kind === "valid-active"
      ) {
        return [];
      }
    }

    return [
      {
        ...change,
        applyInstructions: applyInstructionsFromFormlessChangeMetadata(
          change.changeId,
          change.metadata,
        ),
      },
    ];
  });

  if (claimableChanges.length < 2) {
    return claimableChanges;
  }

  const branchPriorityByChange = new Map<string, number>();
  const branchPriority = (change: CommittedOpenSpecChange): number => {
    const existing = branchPriorityByChange.get(change.changeId);
    if (typeof existing === "number") {
      return existing;
    }

    const priority = branchMergedIntoBase(cwd, change.branch, baseRef, runCommand) ? 1 : 2;
    branchPriorityByChange.set(change.changeId, priority);
    return priority;
  };

  return claimableChanges.sort(
    (left, right) =>
      branchPriority(right) - branchPriority(left) || left.changeId.localeCompare(right.changeId),
  );
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
    workerBranch: workerBranchName(options.workerName),
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
    resetWorkerBranch?: boolean;
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
  const resetWorkerBranch = options.resetWorkerBranch ?? true;

  if (!branchExists(cwd, plan.branch, runCommand)) {
    runOrThrow(cwd, "git", ["branch", plan.branch, options.baseRef ?? defaultBaseRef], runCommand);
  }

  if (existsSync(plan.worktreeDir)) {
    if (gitTopLevel(plan.worktreeDir, runCommand) !== path.resolve(plan.worktreeDir)) {
      throw new Error(`Worktree path exists but is not a git worktree: ${plan.worktreeDir}`);
    }

    const currentBranch = gitCurrentBranch(plan.worktreeDir, runCommand);
    if (currentBranch !== plan.workerBranch) {
      if (branchExists(cwd, plan.workerBranch, runCommand)) {
        runOrThrow(plan.worktreeDir, "git", ["checkout", plan.workerBranch], runCommand);
      } else {
        runOrThrow(
          plan.worktreeDir,
          "git",
          ["checkout", "-b", plan.workerBranch, plan.branch],
          runCommand,
        );
      }
    }

    if (resetWorkerBranch) {
      runOrThrow(plan.worktreeDir, "git", ["reset", "--keep", plan.branch], runCommand);
    }
    return plan;
  }

  mkdirSync(path.dirname(plan.worktreeDir), { recursive: true });
  const workerBranchExists = branchExists(cwd, plan.workerBranch, runCommand);
  const args = workerBranchExists
    ? ["worktree", "add", plan.worktreeDir, plan.workerBranch]
    : ["worktree", "add", "-b", plan.workerBranch, plan.worktreeDir, plan.branch];
  runOrThrow(cwd, "git", args, runCommand);
  if (resetWorkerBranch) {
    runOrThrow(plan.worktreeDir, "git", ["reset", "--keep", plan.branch], runCommand);
  }
  return plan;
}

export function publishWorkerBranchToChangeBranch(
  branchPlan: BranchPlan,
  runCommand = defaultCommandRunner,
): string {
  const commit = runOrThrow(
    branchPlan.worktreeDir,
    "git",
    ["rev-parse", "--verify", "HEAD"],
    runCommand,
  ).trim();
  runOrThrow(
    branchPlan.worktreeDir,
    "git",
    ["branch", "-f", branchPlan.branch, commit],
    runCommand,
  );
  return commit;
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

export function readFormlessChangeBranchCommitMessage(
  cwd: string,
  branch: string,
  runCommand = defaultCommandRunner,
): string {
  return runOrThrow(cwd, "git", ["log", "--no-notes", "-1", "--format=%B", branch], runCommand);
}

function blockerSummary(blockers: string): string | null {
  const summary = blockers
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "-");
  return summary ?? null;
}

function metadataQueryEntry(
  branch: string,
  metadata: FormlessChangeCommitMetadata,
): FormlessChangeQueryEntry {
  const remainingTasks = remainingFormlessChangeTasks(metadata);
  return {
    blockerSummary: blockerSummary(metadata.blockers),
    branch,
    capabilities: metadata.trailers.capabilities,
    changeId: metadata.trailers.changeId,
    latestEvidenceAt: metadata.trailers.lastEvidenceAt,
    remainingTasks,
    state: metadata.trailers.state,
    valid: true,
  };
}

function remainingFormlessChangeTasks(metadata: FormlessChangeCommitMetadata): number {
  return metadata.tasks.filter((task) => !task.done).length;
}

function formlessChangeStateAllowsClaim(state: FormlessChangeState): boolean {
  return state === "ready" || state === "working";
}

function formlessChangeMetadataAllowsClaim(metadata: FormlessChangeCommitMetadata): boolean {
  return formlessChangeStateAllowsClaim(metadata.trailers.state);
}

function applyInstructionsFromFormlessChangeMetadata(
  changeId: string,
  metadata: FormlessChangeCommitMetadata,
): ApplyInstructions {
  const complete = metadata.tasks.filter((task) => task.done).length;
  const remaining = metadata.tasks.length - complete;
  return {
    changeName: changeId,
    instruction:
      remaining === 0
        ? "All change metadata tasks are complete; run finalization."
        : "Read parsed change metadata, select the next ready task section, and ship one section.",
    progress: {
      complete,
      remaining,
      total: metadata.tasks.length,
    },
    schemaName: "git-backed",
    state: remaining === 0 ? "all_done" : metadata.trailers.state,
    tasks: metadata.tasks.map((task) => ({
      description: task.description,
      done: task.done,
      id: task.id,
    })),
  };
}

export function readFormlessChangeBranchMetadata(
  cwd: string,
  branch: string,
  runCommand = defaultCommandRunner,
): FormlessChangeMetadataParseResult {
  return parseFormlessChangeCommitMessage(
    readFormlessChangeBranchCommitMessage(cwd, branch, runCommand),
    { branch },
  );
}

export function queryLocalFormlessChangeBranches(
  cwd: string,
  runCommand = defaultCommandRunner,
): FormlessChangeQueryResult {
  const changes: FormlessChangeQueryEntry[] = [];
  const invalid: InvalidFormlessChangeQueryEntry[] = [];

  for (const branch of listLocalChangeBranches(cwd, runCommand)) {
    const result = readFormlessChangeBranchMetadata(cwd, branch, runCommand);
    if (result.ok) {
      changes.push(metadataQueryEntry(branch, result.metadata));
    } else {
      invalid.push({
        branch,
        errors: result.errors,
        valid: false,
      });
    }
  }

  return {
    changes: changes.sort((left, right) => left.changeId.localeCompare(right.changeId)),
    invalid: invalid.sort((left, right) => left.branch.localeCompare(right.branch)),
  };
}

function branchIncludesBase(
  cwd: string,
  branch: string,
  baseRef: string,
  runCommand: CommandRunner,
): boolean {
  const result = runCommand(cwd, "git", ["merge-base", "--is-ancestor", baseRef, branch]);
  if (result.code === 0) {
    return true;
  }

  if (result.code === 1) {
    return false;
  }

  throw new Error(`git merge-base --is-ancestor ${baseRef} ${branch} failed:\n${result.stderr}`);
}

function branchMergedIntoBase(
  cwd: string,
  branch: string,
  baseRef: string,
  runCommand: CommandRunner,
): boolean {
  const result = runCommand(cwd, "git", ["merge-base", "--is-ancestor", branch, baseRef]);
  if (result.code === 0) {
    return true;
  }

  if (result.code === 1) {
    return false;
  }

  throw new Error(`git merge-base --is-ancestor ${branch} ${baseRef} failed:\n${result.stderr}`);
}

function readyForReviewReleaseReason(input: {
  baseRef: string;
  cwd: string;
  lease: LeaseRecord;
  runCommand: CommandRunner;
}): string | null {
  if (!branchExists(input.cwd, input.lease.branch, input.runCommand)) {
    return `branch ${input.lease.branch} no longer exists`;
  }

  if (branchMergedIntoBase(input.cwd, input.lease.branch, input.baseRef, input.runCommand)) {
    return `branch ${input.lease.branch} is merged into ${input.baseRef}`;
  }

  return null;
}

function releaseLeaseWithNotice(input: {
  changeId: string;
  reason: string;
  stateRoot: string;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): void {
  if (releaseChangeLease(input.stateRoot, input.changeId, null)) {
    writeLine(input.stdout, `[agents] released ${input.changeId}: ${input.reason}`);
  }
}

function cleanupRecoverableChangeLeases(input: {
  baseRef: string;
  cwd: string;
  now: () => Date;
  runCommand: CommandRunner;
  stateRoot: string;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): void {
  for (const lease of listChangeLeases(input.stateRoot)) {
    const classification = classifyChangeLease(lease, { now: input.now });

    if (classification.kind === "stale-active") {
      releaseLeaseWithNotice({
        changeId: lease.changeId,
        reason: `stale ${lease.state} lease recovered: ${classification.reason}`,
        stateRoot: input.stateRoot,
        stdout: input.stdout,
      });
      continue;
    }

    if (classification.kind === "released") {
      releaseLeaseWithNotice({
        changeId: lease.changeId,
        reason: classification.reason,
        stateRoot: input.stateRoot,
        stdout: input.stdout,
      });
      continue;
    }

    if (classification.kind !== "ready-for-review") {
      continue;
    }

    const reason = readyForReviewReleaseReason({
      baseRef: input.baseRef,
      cwd: input.cwd,
      lease,
      runCommand: input.runCommand,
    });
    if (reason) {
      releaseLeaseWithNotice({
        changeId: lease.changeId,
        reason: `ready-for-review lease complete: ${reason}`,
        stateRoot: input.stateRoot,
        stdout: input.stdout,
      });
    }
  }
}

function writeBlockedLeaseNotices(input: {
  now: () => Date;
  stateRoot: string;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): void {
  for (const lease of listChangeLeases(input.stateRoot)) {
    const classification = classifyChangeLease(lease, { now: input.now });
    if (classification.kind !== "blocked") {
      continue;
    }

    writeLine(
      input.stdout,
      `[agents] blocked ${lease.changeId}: ${
        lease.latestEvidence?.message ?? "blocked without recorded evidence"
      }`,
    );
  }
}

function findReadyForReviewLeaseNeedingRebase(input: {
  baseRef: string;
  cwd: string;
  runCommand: CommandRunner;
  stateRoot: string;
  targetChangeId?: string | null;
}): LeaseRecord | null {
  const targetChangeId = input.targetChangeId ? validateChangeId(input.targetChangeId) : null;
  return (
    listChangeLeases(input.stateRoot).find(
      (lease) =>
        (!targetChangeId || lease.changeId === targetChangeId) &&
        lease.state === "ready-for-review" &&
        branchExists(input.cwd, lease.branch, input.runCommand) &&
        !branchIncludesBase(input.cwd, lease.branch, input.baseRef, input.runCommand),
    ) ?? null
  );
}

function readGitBackedPromptTemplate(name: keyof typeof gitBackedPromptTemplatePaths): string {
  return readFileSync(gitBackedPromptTemplatePaths[name], "utf8").trim();
}

function renderPrompt(template: string, values: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered;
}

function formlessTaskLabel(task: FormlessChangeTask): string {
  return task.id ? `${task.id}: ${task.description}` : task.description;
}

function selectedFormlessTaskSection(
  metadata: FormlessChangeCommitMetadata | null | undefined,
): FormlessChangeTaskSection | null {
  return metadata?.taskSections.find((section) => section.tasks.some((task) => !task.done)) ?? null;
}

function firstUncheckedFormlessTask(
  metadata: FormlessChangeCommitMetadata | null | undefined,
): string {
  const task = metadata?.tasks.find((candidate) => !candidate.done);
  return task ? formlessTaskLabel(task) : "none reported";
}

function formatFormlessTaskProgress(
  metadata: FormlessChangeCommitMetadata | null | undefined,
): string {
  if (!metadata) {
    return "not supplied by supervisor";
  }

  const complete = metadata.tasks.filter((task) => task.done).length;
  const total = metadata.tasks.length;
  const remaining = total - complete;
  return `${complete}/${total} complete, ${remaining} remaining`;
}

function formatFormlessTaskState(
  metadata: FormlessChangeCommitMetadata | null | undefined,
): string {
  if (!metadata || metadata.tasks.length === 0) {
    return "- Task metadata not supplied by supervisor.";
  }

  return metadata.tasks
    .map((task) => `- [${task.done ? "x" : " "}] ${formlessTaskLabel(task)}`)
    .join("\n");
}

function formatSelectedFormlessTaskSection(
  metadata: FormlessChangeCommitMetadata | null | undefined,
): string {
  const section = selectedFormlessTaskSection(metadata);
  if (!section) {
    return "No unchecked task section reported by supervisor.";
  }

  return [
    `### ${section.heading}`,
    "",
    ...section.tasks.map((task) => `- [${task.done ? "x" : " "}] ${formlessTaskLabel(task)}`),
  ].join("\n");
}

function compactMultiline(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "-";
}

function formatKnownFormlessChangeMetadata(
  changeId: string,
  metadata: FormlessChangeCommitMetadata | null | undefined,
): string {
  if (!metadata) {
    return [
      `- Change: ${changeId}`,
      "- Schema: git-backed",
      "- Metadata: not supplied by supervisor; inspect the branch tip before continuing.",
      `- First unchecked task: ${firstUncheckedFormlessTask(metadata)}`,
    ].join("\n");
  }

  return [
    `- Change: ${metadata.trailers.changeId}`,
    "- Schema: git-backed",
    `- State: ${metadata.trailers.state}`,
    `- Metadata version: ${metadata.trailers.version}`,
    `- Capabilities: ${
      metadata.trailers.capabilities.length > 0 ? metadata.trailers.capabilities.join(", ") : "none"
    }`,
    `- Latest evidence at: ${metadata.trailers.lastEvidenceAt ?? "not recorded"}`,
    `- Progress: ${formatFormlessTaskProgress(metadata)}`,
    `- First unchecked task: ${firstUncheckedFormlessTask(metadata)}`,
    "",
    "### Proposal",
    "",
    compactMultiline(metadata.proposal),
    "",
    "### Design",
    "",
    compactMultiline(metadata.design),
    "",
    "### Existing Evidence",
    "",
    compactMultiline(metadata.evidence),
    "",
    "### Blockers",
    "",
    compactMultiline(metadata.blockers),
  ].join("\n");
}

function formatBranchDiffSummary(branchDiff: string | null | undefined, baseRef: string): string {
  const trimmed = branchDiff?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }

  return [
    "Branch diff was not supplied by supervisor.",
    `Inspect it with: git diff --stat --find-renames ${baseRef}..HEAD`,
    `Then inspect changed paths with: git diff --name-status --find-renames ${baseRef}..HEAD`,
  ].join("\n");
}

function formatGitBackedHelperCommands(changeId: string, baseRef: string): string {
  return [
    `- Query parsed metadata: \`bun agents change ${changeId} --json\`.`,
    "- Read authoritative commit metadata: `git log --no-notes -1 --format=%B HEAD`.",
    `- Inspect branch diff: \`git diff --stat --find-renames ${baseRef}..HEAD\`.`,
    `- Inspect changed paths: \`git diff --name-status --find-renames ${baseRef}..HEAD\`.`,
    "- Update task state, evidence, blockers, and trailers in the commit message.",
    "- Update the branch tip after code and metadata changes: `git add -A` then `git commit --amend --cleanup=verbatim`.",
  ].join("\n");
}

function summarizeGitBackedImplementationPrompt(
  changeId: string,
  options: PromptRenderOptions,
): GitBackedImplementationPromptSummary {
  const baseRef = options.baseRef ?? defaultBaseRef;
  return {
    branchDiff: formatBranchDiffSummary(options.branchDiff, baseRef),
    helperCommands: formatGitBackedHelperCommands(changeId, baseRef),
    metadata: formatKnownFormlessChangeMetadata(changeId, options.changeMetadata),
    selectedTaskSection: formatSelectedFormlessTaskSection(options.changeMetadata),
    taskState: formatFormlessTaskState(options.changeMetadata),
  };
}

export function buildLocalOpenSpecImplementationPrompt(
  changeId: string,
  workerName: string,
  options: PromptRenderOptions = {},
): string {
  const safeChangeId = validateChangeId(changeId);
  const summary = summarizeGitBackedImplementationPrompt(safeChangeId, options);

  return renderPrompt(readGitBackedPromptTemplate("implement"), {
    change_id: safeChangeId,
    git_backed_helper_commands: summary.helperCommands,
    known_branch_diff: summary.branchDiff,
    known_change_metadata: summary.metadata,
    known_task_state: summary.taskState,
    selected_task_section: summary.selectedTaskSection,
    worker_name: validateWorkerName(workerName),
  });
}

export function buildLocalOpenSpecFinalizationPrompt(
  changeId: string,
  workerName: string,
  options: PromptRenderOptions = {},
): string {
  const safeChangeId = validateChangeId(changeId);
  const summary = summarizeGitBackedImplementationPrompt(safeChangeId, options);

  return renderPrompt(readGitBackedPromptTemplate("finalize"), {
    change_id: safeChangeId,
    git_backed_helper_commands: summary.helperCommands,
    known_branch_diff: summary.branchDiff,
    known_change_metadata: summary.metadata,
    known_task_state: summary.taskState,
    worker_name: validateWorkerName(workerName),
  });
}

function readCurrentBranchDiffSummary(
  cwd: string,
  baseRef: string,
  runCommand: CommandRunner,
): string {
  const statCommand = ["diff", "--stat", "--find-renames", `${baseRef}..HEAD`];
  const statusCommand = ["diff", "--name-status", "--find-renames", `${baseRef}..HEAD`];

  try {
    const stat = runCommand(cwd, "git", statCommand);
    const status = runCommand(cwd, "git", statusCommand);
    const output: string[] = [
      `$ git ${statCommand.join(" ")}`,
      stat.code === 0 ? stat.stdout.trim() || "(no diff stat)" : stat.stderr.trim(),
      "",
      `$ git ${statusCommand.join(" ")}`,
      status.code === 0 ? status.stdout.trim() || "(no changed paths)" : status.stderr.trim(),
    ];
    return output.join("\n").trim();
  } catch (error) {
    return `Branch diff unavailable from supervisor: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function readClaimedChangeMetadata(
  cwd: string,
  branch: string,
  runCommand: CommandRunner,
): FormlessChangeMetadataParseResult {
  return readFormlessChangeBranchMetadata(cwd, branch, runCommand);
}

function commandText(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function statusPathFromLine(line: string): string {
  const rawPath = line.slice(3).trim();
  const renameIndex = rawPath.lastIndexOf(" -> ");
  return renameIndex === -1 ? rawPath : rawPath.slice(renameIndex + 4);
}

function parseGitStatusPaths(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(statusPathFromLine);
}

function changedFilesInWorktree(cwd: string, runCommand: CommandRunner): string[] | null {
  const result = runCommand(cwd, "git", ["status", "--short", "--untracked-files=all"]);
  if (result.code !== 0) {
    return null;
  }

  return parseGitStatusPaths(result.stdout);
}

function finalizationBlockedEvidence(input: {
  at: string;
  command?: string;
  message: string;
}): FinalizationOutcome {
  const evidence: AgentEvidence = {
    at: input.at,
    message: input.message,
  };
  if (input.command) {
    evidence.command = input.command;
  }

  return {
    evidence,
    signal: "blocked",
  };
}

function runFinalizationCommand(input: {
  at: string;
  command: string;
  args: string[];
  cwd: string;
  failurePrefix: string;
  runCommand: CommandRunner;
}): CommandResult | FinalizationOutcome {
  const result = input.runCommand(input.cwd, input.command, input.args);
  if (result.code === 0) {
    return result;
  }

  return finalizationBlockedEvidence({
    at: input.at,
    command: commandText(input.command, input.args),
    message: `${input.failurePrefix}: ${commandResultSummary(result)}`,
  });
}

function archivedChangeStatusPaths(paths: string[]): string[] {
  return paths.filter((filePath) =>
    filePath.replaceAll("\\", "/").startsWith("openspec/changes/archive/"),
  );
}

function finalizationReadyEvidenceLine(input: { at: string; message: string }): string {
  return `- Finalization at ${input.at}: ${input.message}.`;
}

function amendFinalizationMetadata(input: {
  at: string;
  changeId: string;
  cwd: string;
  evidenceMessage: string;
  metadata: FormlessChangeCommitMetadata;
  runCommand: CommandRunner;
}): FinalizationOutcome | null {
  const formattedMessage = formatFormlessChangeCommitMessage(input.metadata.raw, {
    appendEvidence: finalizationReadyEvidenceLine({
      at: input.at,
      message: input.evidenceMessage,
    }),
    trailers: {
      lastEvidenceAt: input.at,
      state: "ready-for-review",
    },
  });
  const parsed = parseFormlessChangeCommitMessage(formattedMessage, {
    branch: branchNameForChange(input.changeId),
  });
  if (!parsed.ok) {
    return finalizationBlockedEvidence({
      at: input.at,
      message: `finalization metadata update would make ${input.changeId} invalid: ${parsed.errors.join(
        "; ",
      )}`,
    });
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "formless-change-message-"));
  const messagePath = path.join(tempDir, "message.txt");
  writeFileSync(messagePath, formattedMessage);

  try {
    const amendResult = runFinalizationCommand({
      at: input.at,
      args: ["commit", "--amend", "--cleanup=verbatim", "-F", messagePath],
      command: "git",
      cwd: input.cwd,
      failurePrefix: "failed to amend finalization metadata",
      runCommand: input.runCommand,
    });
    return "signal" in amendResult ? amendResult : null;
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function runAutomaticFinalization(input: {
  branchPlan: BranchPlan;
  change: CommittedOpenSpecChange;
  now: () => Date;
  options: WatchOptions;
  runCommand: CommandRunner;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): FinalizationOutcome {
  const at = nowIso(input.now);
  const cwd = input.branchPlan.worktreeDir;
  const changeId = input.change.changeId;
  writeLine(input.stdout, `[agents] finalize ${changeId}`);

  const finalizationCommands = [`git rebase ${input.options.baseRef}`];

  const rebaseResult = runFinalizationCommand({
    at,
    args: ["rebase", input.options.baseRef],
    command: "git",
    cwd,
    failurePrefix: `finalization rebase failed for ${input.branchPlan.workerBranch}`,
    runCommand: input.runCommand,
  });
  if ("signal" in rebaseResult) {
    input.runCommand(cwd, "git", ["rebase", "--abort"]);
    return rebaseResult;
  }

  const metadataCommand = ["log", "--no-notes", "-1", "--format=%B", "HEAD"];
  finalizationCommands.push(`git ${metadataCommand.join(" ")}`);
  const metadataResult = runFinalizationCommand({
    at,
    args: metadataCommand,
    command: "git",
    cwd,
    failurePrefix: `failed to read change metadata for ${changeId}`,
    runCommand: input.runCommand,
  });
  if ("signal" in metadataResult) {
    return metadataResult;
  }
  const metadataParse = parseFormlessChangeCommitMessage(metadataResult.stdout, {
    branch: input.branchPlan.branch,
  });
  if (!metadataParse.ok) {
    return finalizationBlockedEvidence({
      at,
      command: `git ${metadataCommand.join(" ")}`,
      message: `invalid change metadata for ${changeId}: ${metadataParse.errors.join("; ")}`,
    });
  }
  if (remainingFormlessChangeTasks(metadataParse.metadata) > 0) {
    return finalizationBlockedEvidence({
      at,
      command: `git ${metadataCommand.join(" ")}`,
      message: `cannot finalize ${changeId}: change metadata still has unfinished tasks`,
    });
  }

  finalizationCommands.push("bun check:ready");
  writeLine(input.stdout, `[agents] finalization check ${changeId}: bun check:ready`);
  const checkResult = runFinalizationCommand({
    at,
    args: ["check:ready"],
    command: "bun",
    cwd,
    failurePrefix: `bun check:ready failed during finalization for ${changeId}`,
    runCommand: input.runCommand,
  });
  if ("signal" in checkResult) {
    return checkResult;
  }
  writeLine(
    input.stdout,
    `[agents] finalization check ok ${changeId}: ${checkResult.stdout.trim() || "passed"}`,
  );

  const changedFiles = changedFilesInWorktree(cwd, input.runCommand);
  if (changedFiles === null) {
    return finalizationBlockedEvidence({
      at,
      command: "git status --short --untracked-files=all",
      message: "failed to inspect finalization changes before commit",
    });
  }
  const archivedPaths = archivedChangeStatusPaths(changedFiles);
  if (archivedPaths.length > 0) {
    return finalizationBlockedEvidence({
      at,
      command: "git status --short --untracked-files=all",
      message: `finalization produced archived change files for ${changeId}: ${archivedPaths.join(
        ", ",
      )}`,
    });
  }
  if (changedFiles.length > 0) {
    return finalizationBlockedEvidence({
      at,
      command: "git status --short --untracked-files=all",
      message: `unexpected uncommitted finalization changes for ${changeId}: ${changedFiles.join(
        ", ",
      )}`,
    });
  }

  const evidenceMessage = `finalized ${changeId}; ran bun check:ready`;
  finalizationCommands.push("git commit --amend --cleanup=verbatim -F <metadata-message>");
  const metadataFailure = amendFinalizationMetadata({
    at,
    changeId,
    cwd,
    evidenceMessage,
    metadata: metadataParse.metadata,
    runCommand: input.runCommand,
  });
  if (metadataFailure) {
    return metadataFailure;
  }

  return {
    evidence: {
      at,
      command: finalizationCommands.join("; "),
      message: evidenceMessage,
    },
    signal: "plan-done",
  };
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

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function codexArgs(
  dangerous: boolean,
  outputPath: string,
  prompt: string,
  workspaceRoot: string,
  gitCommonDir: string,
): string[] {
  const approvalArgs = dangerous ? [] : ["--ask-for-approval", "never"];
  const modelArgs = [
    "--model",
    workerCodexModel,
    "--config",
    'model_reasoning_effort="xhigh"',
    "--config",
    'service_tier="fast"',
    "--config",
    "features.fast_mode=true",
  ];
  const modeArgs = dangerous
    ? ["--dangerously-bypass-approvals-and-sandbox"]
    : [
        "--config",
        `default_permissions=${tomlString(workerCodexPermissionProfile)}`,
        "--config",
        `permissions.${workerCodexPermissionProfile}.filesystem={ ":minimal" = "read", ":tmpdir" = "write", ":slash_tmp" = "write", ${tomlString(
          path.dirname(path.resolve(gitCommonDir)),
        )} = "read", ${tomlString(path.resolve(workspaceRoot))} = "write", ${tomlString(
          path.resolve(gitCommonDir),
        )} = "write" }`,
        "--config",
        `permissions.${workerCodexPermissionProfile}.network={ enabled = false }`,
      ];

  return [
    ...approvalArgs,
    "exec",
    "-C",
    workspaceRoot,
    "--color",
    "never",
    "-o",
    outputPath,
    ...modelArgs,
    ...modeArgs,
    prompt,
  ];
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
  applyInstructions?: ApplyInstructions | null;
  baseRef: string;
  branchDiff?: string | null;
  changeMetadata?: FormlessChangeCommitMetadata | null;
  changeId: string;
  dangerous: boolean;
  mode: WorkerSessionMode;
  paths: AgentStatePaths;
  runCommand: CommandRunner;
  selectedTaskSection?: FormlessChangeTaskSection | null;
  workerName: string;
  worktreeDir: string;
  now: () => Date;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<"blocked" | "none" | "plan-done" | "task-done"> {
  const branchDiff =
    input.branchDiff ??
    readCurrentBranchDiffSummary(input.worktreeDir, input.baseRef, input.runCommand);
  const prompt =
    input.mode === "finalize"
      ? buildLocalOpenSpecFinalizationPrompt(input.changeId, input.workerName, {
          baseRef: input.baseRef,
          branchDiff,
          changeMetadata: input.changeMetadata,
        })
      : buildLocalOpenSpecImplementationPrompt(input.changeId, input.workerName, {
          baseRef: input.baseRef,
          branchDiff,
          changeMetadata: input.changeMetadata,
        });
  const runDir = makeRunDir(input.paths, input.workerName, input.changeId, input.now);
  const outputPath = path.join(runDir, `${input.mode}-final.md`);
  const logPath = path.join(runDir, `${input.mode}.log`);
  const promptPath = path.join(runDir, `${input.mode}-prompt.md`);
  writeFileSync(promptPath, `${prompt}\n`);

  const args = codexArgs(
    input.dangerous,
    outputPath,
    prompt,
    input.worktreeDir,
    path.dirname(input.paths.root),
  );
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
    "Usage: bun agents watch [worker-name] [options]",
    "       bun agents changes [--json]",
    "       bun agents change <change-id> [--json]",
    "       bun agents status [worker-name]",
    "       bun agents release <change-id> [--owner <worker-name>]",
    "",
    "Runs a local Git-backed Formless pull worker.",
    "",
    "Options:",
    "  --once                 Run one supervisor pass.",
    "  --dry-run              Print claim, branch, status, and Codex command without mutating.",
    "  --base <ref>           Queue and branch base ref. Default: local main.",
    "  --change <change-id>   Restrict watch to one changes/<change-id> branch.",
    "  --worktree-dir <dir>   Override claimed change worktree path.",
    "  --interval <seconds>   Watch interval. Default: 10.",
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
    const workerNameArgument = args[1] && !args[1]?.startsWith("-") ? args[1] : null;
    const optionStartIndex = workerNameArgument ? 2 : 1;

    const options: WatchOptions = {
      automaticWorkerName: workerNameArgument === null,
      baseRef: defaultBaseRef,
      command: "watch",
      dangerous: false,
      dryRun: false,
      intervalSeconds: defaultIntervalSeconds,
      once: false,
      targetChangeId: null,
      workerName: workerNameArgument
        ? validateWorkerName(workerNameArgument)
        : cavemanWorkerNames[0],
      worktreeDir: null,
    };

    for (let index = optionStartIndex; index < args.length; index += 1) {
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

      if (arg === "--change") {
        options.targetChangeId = validateChangeId(nextValue(args, index, arg));
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

  if (command === "changes") {
    let json = false;
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--json") {
        json = true;
        continue;
      }

      throw new UsageError(`Unknown option: ${arg}`);
    }

    return { command: "changes", json };
  }

  if (command === "change") {
    const changeId = args[1];
    if (!changeId || changeId.startsWith("-")) {
      throw new UsageError("change requires <change-id>.");
    }

    let json = false;
    for (let index = 2; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--json") {
        json = true;
        continue;
      }

      throw new UsageError(`Unknown option: ${arg}`);
    }

    return { changeId: validateChangeId(changeId), command: "change", json };
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
  applyInstructions?: ApplyInstructions | null;
  baseRef: string;
  changeMetadata?: FormlessChangeCommitMetadata | null;
  changeId: string;
  dangerous: boolean;
  gitCommonDir: string;
  mode: WorkerSessionMode;
  workerName: string;
  worktreeDir: string;
}): string {
  const prompt =
    input.mode === "finalize"
      ? buildLocalOpenSpecFinalizationPrompt(input.changeId, input.workerName, {
          baseRef: input.baseRef,
          changeMetadata: input.changeMetadata,
        })
      : buildLocalOpenSpecImplementationPrompt(input.changeId, input.workerName, {
          baseRef: input.baseRef,
          changeMetadata: input.changeMetadata,
        });
  return [
    "codex",
    ...codexArgs(input.dangerous, "<output>", prompt, input.worktreeDir, input.gitCommonDir),
  ]
    .map(shellQuote)
    .join(" ");
}

function showDryRunClaim(input: {
  branchPlan: BranchPlan;
  change: CommittedOpenSpecChange;
  now: () => Date;
  options: WatchOptions;
  paths: AgentStatePaths;
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
    `[agents] branch ${input.branchPlan.branch} ${input.branchPlan.action} via ${input.branchPlan.workerBranch} ${input.branchPlan.worktreeDir}`,
  );
  writeLine(input.stdout, `[agents] status ${JSON.stringify(status)}`);
  writeLine(
    input.stdout,
    `[agents] command ${dryRunCodexCommand({
      applyInstructions: input.change.applyInstructions,
      baseRef: input.options.baseRef,
      changeMetadata: input.change.metadata,
      changeId: input.change.changeId,
      dangerous: input.options.dangerous,
      gitCommonDir: path.dirname(input.paths.root),
      mode:
        input.change.metadata && remainingFormlessChangeTasks(input.change.metadata) === 0
          ? "finalize"
          : "implement",
      workerName: input.options.workerName,
      worktreeDir: input.branchPlan.worktreeDir,
    })}`,
  );
}

function runSupervisorSetup(input: {
  changeId: string;
  runCommand: CommandRunner;
  stdout: Pick<NodeJS.WriteStream, "write">;
  worktreeDir: string;
}): CommandResult {
  writeLine(input.stdout, `[agents] setup ${input.changeId}: bun check:setup`);
  try {
    return input.runCommand(input.worktreeDir, "bun", ["check:setup"]);
  } catch (error) {
    return {
      code: 1,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: "",
    };
  }
}

function markClaimedChangeBlocked(input: {
  branchPlan: BranchPlan;
  changeId: string;
  evidence: AgentEvidence;
  now: () => Date;
  options: WatchOptions;
  paths: AgentStatePaths;
}): void {
  writeWorkerStatus(
    input.paths.root,
    makeWorkerStatus({
      branch: input.branchPlan.branch,
      currentChange: input.changeId,
      latestEvidence: input.evidence,
      now: input.now,
      owner: input.options.workerName,
      state: "blocked",
    }),
  );
  updateChangeLease(
    input.paths.root,
    input.changeId,
    { latestEvidence: input.evidence, state: "blocked" },
    input.now,
  );
}

async function runClaimedChange(input: {
  branchPlan: BranchPlan;
  change: CommittedOpenSpecChange;
  modeOverride?: WorkerSessionMode;
  now: () => Date;
  options: WatchOptions;
  paths: AgentStatePaths;
  runCommand: CommandRunner;
  runSession: CodexSessionRunner;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number> {
  const setupResult = runSupervisorSetup({
    changeId: input.change.changeId,
    runCommand: input.runCommand,
    stdout: input.stdout,
    worktreeDir: input.branchPlan.worktreeDir,
  });
  if (setupResult.code !== 0) {
    const evidence: AgentEvidence = {
      at: nowIso(input.now),
      command: "bun check:setup",
      message: `bun check:setup failed for ${input.change.changeId}: ${commandResultSummary(
        setupResult,
      )}`,
    };
    markClaimedChangeBlocked({
      branchPlan: input.branchPlan,
      changeId: input.change.changeId,
      evidence,
      now: input.now,
      options: input.options,
      paths: input.paths,
    });
    return 1;
  }

  {
    let changeMetadata = input.change.metadata ?? null;
    if (!changeMetadata && input.modeOverride !== "finalize") {
      const metadataResult = readClaimedChangeMetadata(
        input.branchPlan.worktreeDir,
        input.change.branch,
        input.runCommand,
      );
      if (!metadataResult.ok) {
        const blockedEvidence: AgentEvidence = {
          at: nowIso(input.now),
          message: `invalid change metadata for ${input.change.changeId}: ${metadataResult.errors.join(
            "; ",
          )}`,
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
      changeMetadata = metadataResult.metadata;
    }

    const mode =
      input.modeOverride ??
      (changeMetadata && remainingFormlessChangeTasks(changeMetadata) === 0
        ? "finalize"
        : "implement");
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

    let outcomeEvidence: AgentEvidence | null = null;
    const signal =
      mode === "finalize"
        ? (() => {
            const outcome = runAutomaticFinalization({
              branchPlan: input.branchPlan,
              change: input.change,
              now: input.now,
              options: input.options,
              runCommand: input.runCommand,
              stdout: input.stdout,
            });
            outcomeEvidence = outcome.evidence;
            return outcome.signal;
          })()
        : await input.runSession({
            applyInstructions: null,
            baseRef: input.options.baseRef,
            branchDiff: readCurrentBranchDiffSummary(
              input.branchPlan.worktreeDir,
              input.options.baseRef,
              input.runCommand,
            ),
            changeMetadata,
            changeId: input.change.changeId,
            dangerous: input.options.dangerous,
            mode,
            now: input.now,
            paths: input.paths,
            runCommand: input.runCommand,
            selectedTaskSection: selectedFormlessTaskSection(changeMetadata),
            workerName: input.options.workerName,
            worktreeDir: input.branchPlan.worktreeDir,
            stdout: input.stdout,
          });

    if (signal === "blocked" || signal === "none") {
      const blockedEvidence: AgentEvidence = outcomeEvidence ?? {
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

    let publishedCommit: string;
    try {
      publishedCommit = publishWorkerBranchToChangeBranch(input.branchPlan, input.runCommand);
    } catch (error) {
      const blockedEvidence: AgentEvidence = {
        at: nowIso(input.now),
        message: `failed to publish ${input.branchPlan.workerBranch} to ${
          input.branchPlan.branch
        }: ${error instanceof Error ? error.message : String(error)}`,
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

    if (mode === "implement") {
      const implementationEvidence: AgentEvidence = {
        at: nowIso(input.now),
        message:
          signal === "plan-done"
            ? `implemented ${input.change.changeId}; branch ${input.branchPlan.branch} updated at ${publishedCommit}; ready for finalization pass`
            : `implemented ${input.change.changeId}; branch ${input.branchPlan.branch} updated at ${publishedCommit}`,
      };
      writeWorkerStatus(
        input.paths.root,
        makeWorkerStatus({
          branch: input.branchPlan.branch,
          currentChange: input.change.changeId,
          latestEvidence: implementationEvidence,
          now: input.now,
          owner: input.options.workerName,
          state: "working",
        }),
      );
      updateChangeLease(
        input.paths.root,
        input.change.changeId,
        { latestEvidence: implementationEvidence, state: "working" },
        input.now,
      );
      writeLine(input.stdout, `[agents] published ${input.change.changeId} at ${publishedCommit}`);
    }

    if (mode === "finalize" && signal === "plan-done") {
      const readyEvidence: AgentEvidence = {
        at: nowIso(input.now),
        message: `${
          outcomeEvidence?.message ?? `finalized ${input.change.changeId}`
        }; branch ${input.branchPlan.branch} ready for review at ${publishedCommit}; worker branch ${input.branchPlan.workerBranch} remains checked out`,
      };
      if (outcomeEvidence?.command) {
        readyEvidence.command = outcomeEvidence.command;
      }
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
    }

    return 0;
  }
}

async function runReadyForReviewMaintenance(input: {
  cwd: string;
  now: () => Date;
  options: WatchOptions;
  paths: AgentStatePaths;
  runCommand: CommandRunner;
  runSession: CodexSessionRunner;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number | null> {
  const lease = findReadyForReviewLeaseNeedingRebase({
    baseRef: input.options.baseRef,
    cwd: input.cwd,
    runCommand: input.runCommand,
    stateRoot: input.paths.root,
    targetChangeId: input.options.targetChangeId,
  });
  if (!lease) {
    return null;
  }

  const evidence: AgentEvidence = {
    at: nowIso(input.now),
    command: `git merge-base --is-ancestor ${input.options.baseRef} ${lease.branch}`,
    message: `ready-for-review branch ${lease.branch} is behind ${input.options.baseRef}; starting finalization maintenance`,
  };
  updateChangeLease(
    input.paths.root,
    lease.changeId,
    {
      latestEvidence: evidence,
      owner: input.options.workerName,
      state: "finalizing",
    },
    input.now,
  );
  writeLine(input.stdout, `[agents] ready maintenance ${lease.changeId}`);

  let branchPlan: BranchPlan;
  try {
    branchPlan = ensureChangeBranch(input.cwd, lease.changeId, {
      baseRef: input.options.baseRef,
      runCommand: input.runCommand,
      workerName: input.options.workerName,
      worktreeDir: input.options.worktreeDir,
    });
  } catch (error) {
    const blockedEvidence: AgentEvidence = {
      at: nowIso(input.now),
      message: `branch setup failed for ready maintenance ${lease.changeId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
    writeWorkerStatus(
      input.paths.root,
      makeWorkerStatus({
        branch: lease.branch,
        currentChange: lease.changeId,
        latestEvidence: blockedEvidence,
        now: input.now,
        owner: input.options.workerName,
        state: "blocked",
      }),
    );
    updateChangeLease(
      input.paths.root,
      lease.changeId,
      { latestEvidence: blockedEvidence, owner: input.options.workerName, state: "blocked" },
      input.now,
    );
    return 1;
  }

  return runClaimedChange({
    branchPlan,
    change: {
      branch: lease.branch,
      changeId: lease.changeId,
    },
    modeOverride: "finalize",
    now: input.now,
    options: input.options,
    paths: input.paths,
    runCommand: input.runCommand,
    runSession: input.runSession,
    stdout: input.stdout,
  });
}

async function runIdleMaintenance(input: {
  cwd: string;
  now: () => Date;
  options: WatchOptions;
  paths: AgentStatePaths;
  runCommand: CommandRunner;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number> {
  if (input.options.targetChangeId) {
    const evidence: AgentEvidence = {
      at: nowIso(input.now),
      message: `no claimable Git-backed change branch for ${input.options.targetChangeId}`,
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
    writeBlockedLeaseNotices({
      now: input.now,
      stateRoot: input.paths.root,
      stdout: input.stdout,
    });
    writeLine(input.stdout, `[agents] idle: no claimable work for ${input.options.targetChangeId}`);
    return 0;
  }

  const branches = listLocalChangeBranches(input.cwd, input.runCommand);
  if (branches.length === 0) {
    const evidence: AgentEvidence = {
      at: nowIso(input.now),
      message: "no claimable Git-backed change branches",
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
    writeBlockedLeaseNotices({
      now: input.now,
      stateRoot: input.paths.root,
      stdout: input.stdout,
    });
    writeLine(input.stdout, "[agents] idle: no claimable work");
    return 0;
  }

  let completeBranchCount = 0;
  let invalidBranchCount = 0;
  let leasedBranchCount = 0;
  for (const branch of branches) {
    const changeId = changeIdFromBranch(branch);
    if (!changeId) {
      continue;
    }

    if (readChangeLease(input.paths.root, changeId)) {
      leasedBranchCount += 1;
      continue;
    }

    const metadataResult = readFormlessChangeBranchMetadata(input.cwd, branch, input.runCommand);
    if (!metadataResult.ok) {
      invalidBranchCount += 1;
      continue;
    }

    if (
      metadataResult.metadata.trailers.state === "ready-for-review" ||
      remainingFormlessChangeTasks(metadataResult.metadata) === 0
    ) {
      completeBranchCount += 1;
      continue;
    }

    if (!formlessChangeMetadataAllowsClaim(metadataResult.metadata)) {
      continue;
    }
  }

  if (completeBranchCount > 0) {
    writeLine(input.stdout, "[agents] idle: change branches are complete");
    return 0;
  }

  writeBlockedLeaseNotices({
    now: input.now,
    stateRoot: input.paths.root,
    stdout: input.stdout,
  });
  if (leasedBranchCount > 0) {
    writeLine(input.stdout, "[agents] idle: change branches are leased");
  } else if (invalidBranchCount > 0) {
    writeLine(input.stdout, "[agents] idle: change branches have invalid metadata");
  } else {
    writeLine(input.stdout, "[agents] idle: no claimable work");
  }
  return 0;
}

async function runWatchOnce(input: {
  cwd: string;
  now: () => Date;
  options: WatchOptions;
  runCommand: CommandRunner;
  runSession: CodexSessionRunner;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number> {
  const paths = resolveAgentStatePaths(input.cwd, input.runCommand);
  if (!input.options.dryRun) {
    ensureAgentStateDirs(paths);
    cleanupRecoverableChangeLeases({
      baseRef: input.options.baseRef,
      cwd: input.cwd,
      now: input.now,
      runCommand: input.runCommand,
      stateRoot: paths.root,
      stdout: input.stdout,
    });

    const ownedLease = findWorkerActiveLease(paths.root, input.options.workerName);
    if (ownedLease) {
      if (input.options.targetChangeId && ownedLease.changeId !== input.options.targetChangeId) {
        writeLine(
          input.stderr,
          `[agents] worker ${input.options.workerName} already owns ${ownedLease.changeId}; release it before targeting ${input.options.targetChangeId}`,
        );
        return 1;
      }

      const branchPlan = ensureChangeBranch(input.cwd, ownedLease.changeId, {
        baseRef: input.options.baseRef,
        resetWorkerBranch: false,
        runCommand: input.runCommand,
        workerName: input.options.workerName,
        worktreeDir: input.options.worktreeDir,
      });
      writeLine(input.stdout, `[agents] resume ${ownedLease.changeId}`);
      return runClaimedChange({
        branchPlan,
        change: {
          branch: ownedLease.branch,
          changeId: ownedLease.changeId,
        },
        now: input.now,
        options: input.options,
        paths,
        runCommand: input.runCommand,
        runSession: input.runSession,
        stdout: input.stdout,
      });
    }

    const readyMaintenanceCode = await runReadyForReviewMaintenance({
      cwd: input.cwd,
      now: input.now,
      options: input.options,
      paths,
      runCommand: input.runCommand,
      runSession: input.runSession,
      stdout: input.stdout,
    });
    if (readyMaintenanceCode !== null) {
      return readyMaintenanceCode;
    }
  }

  const changes = discoverClaimableOpenSpecChanges(input.cwd, {
    baseRef: input.options.baseRef,
    now: input.now,
    runCommand: input.runCommand,
    stateRoot: input.options.dryRun ? null : paths.root,
    targetChangeId: input.options.targetChangeId,
  });
  const change = changes[0];

  if (!change) {
    if (input.options.dryRun) {
      writeLine(input.stdout, `[agents] worker ${input.options.workerName}`);
      const targetSuffix = input.options.targetChangeId
        ? ` for ${input.options.targetChangeId}`
        : "es";
      writeLine(
        input.stdout,
        `[agents] dry-run idle: no claimable Git-backed change branch${targetSuffix}`,
      );
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
      paths,
      stdout: input.stdout,
    });
    return 0;
  }

  let claim = createChangeLease(paths.root, {
    changeId: change.changeId,
    latestEvidence: {
      at: nowIso(input.now),
      message: `claimed ${change.changeId}`,
    },
    now: input.now,
    owner: input.options.workerName,
  });

  if (!claim.claimed) {
    const classification = classifyChangeLease(claim.lease, { now: input.now });
    if (classification.kind === "stale-active" || classification.kind === "released") {
      releaseLeaseWithNotice({
        changeId: change.changeId,
        reason:
          classification.kind === "stale-active"
            ? `stale ${classification.lease.state} lease recovered: ${classification.reason}`
            : classification.reason,
        stateRoot: paths.root,
        stdout: input.stdout,
      });
      claim = createChangeLease(paths.root, {
        changeId: change.changeId,
        latestEvidence: {
          at: nowIso(input.now),
          message: `claimed ${change.changeId}`,
        },
        now: input.now,
        owner: input.options.workerName,
      });
    }
  }

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
    runSession: input.runSession,
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
      runSession: deps.runSession,
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

function runChanges(
  options: ChangesOptions,
  input: {
    cwd: string;
    runCommand: CommandRunner;
    stdout: Pick<NodeJS.WriteStream, "write">;
  },
): number {
  const result = queryLocalFormlessChangeBranches(input.cwd, input.runCommand);
  if (options.json) {
    writeLine(input.stdout, JSON.stringify(result, null, 2));
    return 0;
  }

  for (const change of result.changes) {
    writeLine(
      input.stdout,
      `${change.changeId} ${change.state} remaining=${change.remainingTasks} branch=${change.branch}`,
    );
  }
  for (const invalid of result.invalid) {
    writeLine(input.stdout, `${invalid.branch} invalid: ${invalid.errors.join("; ")}`);
  }
  return 0;
}

function runChange(
  options: ChangeOptions,
  input: {
    cwd: string;
    runCommand: CommandRunner;
    stderr: Pick<NodeJS.WriteStream, "write">;
    stdout: Pick<NodeJS.WriteStream, "write">;
  },
): number {
  const branch = branchNameForChange(options.changeId);
  const result = readFormlessChangeBranchMetadata(input.cwd, branch, input.runCommand);
  if (!result.ok) {
    const invalid = { branch, errors: result.errors, valid: false };
    if (options.json) {
      writeLine(input.stdout, JSON.stringify(invalid, null, 2));
    } else {
      writeLine(input.stderr, `${branch} invalid: ${result.errors.join("; ")}`);
    }
    return 1;
  }

  const entry = metadataQueryEntry(branch, result.metadata);
  if (options.json) {
    writeLine(input.stdout, JSON.stringify(entry, null, 2));
  } else {
    writeLine(
      input.stdout,
      `${entry.changeId} ${entry.state} remaining=${entry.remainingTasks} branch=${entry.branch}`,
    );
  }
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
    runSession: deps.runSession ?? runCodexSession,
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
      const paths = resolveAgentStatePaths(resolvedDeps.cwd, resolvedDeps.runCommand);
      if (options.dryRun) {
        const workerName = options.automaticWorkerName
          ? availableCavemanWorkerName(paths.root)
          : options.workerName;
        if (options.automaticWorkerName) {
          writeLine(resolvedDeps.stdout, `[agents] assigned worker ${workerName}`);
        }
        return await runWatch({ ...options, automaticWorkerName: false, workerName }, resolvedDeps);
      }

      ensureAgentStateDirs(paths);
      const reservation = reserveWorkerName(
        paths.root,
        options.automaticWorkerName ? null : options.workerName,
        { now: resolvedDeps.now },
      );
      if (options.automaticWorkerName) {
        writeLine(resolvedDeps.stdout, `[agents] assigned worker ${reservation.owner}`);
      }
      try {
        return await runWatch(
          { ...options, automaticWorkerName: false, workerName: reservation.owner },
          resolvedDeps,
        );
      } finally {
        releaseWorkerName(reservation);
      }
    }

    if (options.command === "changes") {
      return runChanges(options, resolvedDeps);
    }

    if (options.command === "change") {
      return runChange(options, resolvedDeps);
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
