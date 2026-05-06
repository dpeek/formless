import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess, SpawnOptionsWithoutStdio } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  createWriteStream,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const tmpDir = path.join(rootDir, "tmp");
const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

const paths = {
  checkLog: path.join(tmpDir, "check.txt"),
  devLog: path.join(tmpDir, "dev.txt"),
  installLog: path.join(tmpDir, "install.txt"),
  manifest: path.join(tmpDir, "agent-dev.json"),
  supervisorLog: path.join(tmpDir, "supervisor.txt"),
  testLog: path.join(tmpDir, "test.txt"),
};

const legacyPaths = {
  devPid: path.join(tmpDir, "dev.pid"),
  state: path.join(tmpDir, "state.txt"),
  supervisorPid: path.join(tmpDir, "supervisor.pid"),
  testPid: path.join(tmpDir, "test.pid"),
};

const logFiles = {
  check: "./tmp/check.txt",
  dev: "./tmp/dev.txt",
  install: "./tmp/install.txt",
  supervisor: "./tmp/supervisor.txt",
  test: "./tmp/test.txt",
} as const;

type CheckStatus = "idle" | "running" | "pass" | "fail";
type DevStatus = "starting" | "ready" | "fail" | "stopped";
type SupervisorStatus = "starting" | "running" | "stopping" | "stopped" | "fail";
type TestStatus = "pending" | "pass" | "fail" | "stopped";

type AgentLogFiles = typeof logFiles;

type AgentState = {
  checkStatus: CheckStatus;
  devPid: number | null;
  devStatus: DevStatus;
  host: string | null;
  logs: AgentLogFiles;
  startedAt: string;
  supervisorPid: number | null;
  supervisorStatus: SupervisorStatus;
  testPid: number | null;
  testStatus: TestStatus;
  updatedAt: string;
  url: string | null;
};

type Manifest = AgentState;

type KillTarget = {
  kind: "dev" | "supervisor" | "test";
  pid: number | null;
};

function ensureTmp(): void {
  mkdirSync(tmpDir, { recursive: true });
}

function atomicWriteFile(filePath: string, content: string): void {
  ensureTmp();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, filePath);
}

function removeFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Temp files are best-effort cleanup.
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function statusOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function hostFromUrl(url: string | null): string | null {
  if (url === null) {
    return null;
  }

  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function createAgentState(patch: Partial<AgentState> = {}): AgentState {
  const startedAt = patch.startedAt ?? new Date().toISOString();
  const logs = { ...logFiles, ...patch.logs };
  return {
    checkStatus: "idle",
    devPid: null,
    devStatus: "stopped",
    host: null,
    startedAt,
    supervisorPid: null,
    supervisorStatus: "stopped",
    testPid: null,
    testStatus: "stopped",
    updatedAt: new Date().toISOString(),
    url: null,
    ...patch,
    logs,
  };
}

function writeManifest(manifest: Manifest): void {
  atomicWriteFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readManifest(): Manifest | null {
  try {
    const parsed = JSON.parse(readFileSync(paths.manifest, "utf8")) as Record<string, unknown>;
    const url = stringOrNull(parsed.url);
    const host = stringOrNull(parsed.host) ?? hostFromUrl(url);
    const startedAt = stringOrNull(parsed.startedAt);
    const devPid = numberOrNull(parsed.devPid);
    const supervisorPid = numberOrNull(parsed.supervisorPid);
    const testPid = numberOrNull(parsed.testPid);

    if (startedAt === null && devPid === null && supervisorPid === null && testPid === null) {
      return null;
    }

    return createAgentState({
      checkStatus: statusOr(
        parsed.checkStatus,
        ["idle", "running", "pass", "fail"] as const,
        inferCheckStatus(readLog(paths.checkLog), "idle"),
      ),
      devPid,
      devStatus: statusOr(
        parsed.devStatus,
        ["starting", "ready", "fail", "stopped"] as const,
        inferDevStatus(readLog(paths.devLog), "starting"),
      ),
      host,
      startedAt: startedAt ?? new Date().toISOString(),
      supervisorPid,
      supervisorStatus: statusOr(
        parsed.supervisorStatus,
        ["starting", "running", "stopping", "stopped", "fail"] as const,
        supervisorPid === null ? "stopped" : "running",
      ),
      testPid,
      testStatus: statusOr(
        parsed.testStatus,
        ["pending", "pass", "fail", "stopped"] as const,
        inferTestStatus(readLog(paths.testLog), "pending"),
      ),
      updatedAt: stringOrNull(parsed.updatedAt) ?? new Date().toISOString(),
      url,
    });
  } catch {
    return null;
  }
}

function note(message: string): void {
  ensureTmp();
  appendFileSync(paths.supervisorLog, `[${new Date().toISOString()}] ${message}\n`);
}

function processCommand(pid: number): string | null {
  const result = spawnSyncText("ps", ["-p", String(pid), "-o", "command="]);
  if (result.code !== 0) {
    return null;
  }

  const command = result.stdout.trim();
  return command.length > 0 ? command : null;
}

function spawnSyncText(command: string, args: string[]): { code: number; stdout: string } {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "ignore"],
  });

  return {
    code: typeof result.status === "number" ? result.status : 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
  };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandMatches(kind: KillTarget["kind"], pid: number, manifest: Manifest | null): boolean {
  const command = processCommand(pid);
  if (command === null) {
    return false;
  }

  return commandTextMatches(kind, command, manifest);
}

function commandTextMatches(
  kind: KillTarget["kind"],
  command: string,
  manifest: Manifest | null,
): boolean {
  if (kind === "dev") {
    return (
      command.includes("portless run") ||
      command.includes("vp dev") ||
      (manifest?.host !== null && manifest?.host !== undefined && command.includes(manifest.host))
    );
  }

  if (kind === "test") {
    return command.includes("vp test") || command.includes("vite-plus");
  }

  return command.includes("agent-dev.ts") && command.includes("supervise");
}

function processCwd(pid: number): string | null {
  const result = spawnSyncText("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  if (result.code !== 0) {
    return null;
  }

  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith("n")) {
      return line.slice(1);
    }
  }

  return null;
}

function orphanKind(command: string): KillTarget["kind"] | null {
  if (command.includes("agent-dev.ts") && command.includes("supervise")) {
    return "supervisor";
  }

  if (command.includes("portless run") && command.includes("vp dev")) {
    return "dev";
  }

  if (
    command.includes("vp test") &&
    command.includes("--watch") &&
    command.includes("--reporter=agent")
  ) {
    return "test";
  }

  return null;
}

function findOrphanTargets(seenPids: Set<number>, manifest: Manifest | null): KillTarget[] {
  const result = spawnSyncText("ps", ["-axo", "pid=,command="]);
  if (result.code !== 0) {
    return [];
  }

  const targets: KillTarget[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (match === null) {
      continue;
    }

    const pid = Number(match[1]);
    const command = match[2];
    const kind = orphanKind(command);
    if (
      !Number.isInteger(pid) ||
      pid <= 0 ||
      pid === process.pid ||
      seenPids.has(pid) ||
      kind === null ||
      !commandTextMatches(kind, command, manifest)
    ) {
      continue;
    }

    const cwd = processCwd(pid);
    if (cwd !== rootDir) {
      continue;
    }

    targets.push({ kind, pid });
  }

  return targets;
}

async function killProcessGroup(pid: number): Promise<void> {
  if (pid === process.pid || !isAlive(pid)) {
    return;
  }

  signalProcess(pid, "SIGTERM");
  await sleep(1200);
  if (isAlive(pid)) {
    signalProcess(pid, "SIGKILL");
    await sleep(300);
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The process may not own a group, or it may already be gone.
  }

  try {
    process.kill(pid, signal);
  } catch {
    // Best-effort shutdown.
  }
}

function cleanupLegacyTrackingFiles(): void {
  removeFile(legacyPaths.devPid);
  removeFile(legacyPaths.state);
  removeFile(legacyPaths.supervisorPid);
  removeFile(legacyPaths.testPid);
}

function trackedTargets(manifest: Manifest | null): KillTarget[] {
  return [
    { kind: "dev", pid: manifest?.devPid ?? null },
    { kind: "test", pid: manifest?.testPid ?? null },
    { kind: "supervisor", pid: manifest?.supervisorPid ?? null },
  ];
}

async function killTrackedProcesses(): Promise<void> {
  const manifest = readManifest();
  const seenPids = new Set<number>();

  for (const target of trackedTargets(manifest)) {
    if (target.pid === null || target.pid === process.pid || !isAlive(target.pid)) {
      continue;
    }
    seenPids.add(target.pid);

    if (!commandMatches(target.kind, target.pid, manifest)) {
      note(`Skipped ${target.kind} pid ${target.pid}: command did not match tracked process`);
      continue;
    }

    note(`Stopping ${target.kind} pid ${target.pid}`);
    await killProcessGroup(target.pid);
  }

  for (const target of findOrphanTargets(seenPids, manifest)) {
    if (target.pid === null || !isAlive(target.pid)) {
      continue;
    }

    note(`Stopping orphan ${target.kind} pid ${target.pid}`);
    await killProcessGroup(target.pid);
  }

  cleanupLegacyTrackingFiles();
}

function stripAnsi(input: string): string {
  return input.replace(ansiPattern, "");
}

function portlessUrlFromOutput(output: string): { host: string; url: string } | null {
  const clean = stripAnsi(output);
  const urlMatches = [
    ...clean.matchAll(/\bhttps?:\/\/(?:[a-z0-9-]+\.)*formless\.local(?::\d+)?(?:\/[^\s)]*)?/gi),
  ];
  const rawUrl = urlMatches.at(-1)?.[0]?.replace(/[),.]+$/, "");
  if (rawUrl !== undefined) {
    try {
      const parsed = new URL(rawUrl);
      return { host: parsed.host, url: parsed.origin };
    } catch {
      // Fall through to bare-host parsing.
    }
  }

  const hostMatches = [...clean.matchAll(/\b((?:[a-z0-9-]+\.)*formless\.local)\b/gi)];
  const host = hostMatches.at(-1)?.[1];
  return host === undefined ? null : { host, url: `https://${host}` };
}

function limitBuffer(input: string): string {
  return input.length > 200_000 ? input.slice(-200_000) : input;
}

function inferDevStatus(log: string, current: DevStatus): DevStatus {
  const clean = stripAnsi(log).toLowerCase();
  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of [...lines].reverse()) {
    if (
      line.includes("address already in use") ||
      line.includes("eaddrinuse") ||
      line.includes("failed") ||
      line.includes("error:")
    ) {
      return "fail";
    }

    if (line.includes("ready in") || line.includes("local:") || line.includes("network:")) {
      return "ready";
    }
  }

  return current;
}

function inferTestStatus(log: string, current: TestStatus): TestStatus {
  const lines = stripAnsi(log)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of [...lines].reverse()) {
    const lower = line.toLowerCase();
    if (line.startsWith("Test Files") || line.startsWith("Tests")) {
      if (lower.includes("failed")) {
        return "fail";
      }

      if (lower.includes("passed")) {
        return "pass";
      }
    }

    if (line.startsWith("FAIL")) {
      return "fail";
    }

    if (line.startsWith("PASS") && lower.includes("waiting for file changes")) {
      return "pass";
    }
  }

  return current;
}

function inferCheckStatus(log: string, current: CheckStatus): CheckStatus {
  const clean = stripAnsi(log).toLowerCase();

  if (
    (clean.includes("correctly formatted") || clean.includes("formatting completed")) &&
    clean.includes("found no warnings")
  ) {
    return "pass";
  }

  if (
    clean.includes("fail:") ||
    clean.includes("error:") ||
    /found [1-9][0-9]* .*(warning|lint error|type error)/.test(clean)
  ) {
    return "fail";
  }

  return current;
}

function readLog(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function stateFromCurrentLogs(manifest: Manifest | null, checkStatus: CheckStatus): Manifest {
  return createAgentState({
    checkStatus,
    devStatus: inferDevStatus(readLog(paths.devLog), manifest === null ? "stopped" : "starting"),
    devPid: manifest?.devPid ?? null,
    host: manifest?.host ?? null,
    startedAt: manifest?.startedAt ?? new Date().toISOString(),
    supervisorPid: manifest?.supervisorPid ?? null,
    supervisorStatus: manifest === null ? "stopped" : "running",
    testPid: manifest?.testPid ?? null,
    testStatus: inferTestStatus(readLog(paths.testLog), manifest === null ? "stopped" : "pending"),
    url: manifest?.url ?? null,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function spawnDetached(
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio = {},
): ChildProcess {
  return spawn(command, args, {
    cwd: rootDir,
    detached: true,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

async function runWithTee(command: string, args: string[], logFile: string): Promise<number> {
  ensureTmp();
  const log = createWriteStream(logFile, { flags: "w" });
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
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
      const message = `[agent-dev] failed to run ${command}: ${error.message}\n`;
      process.stderr.write(message);
      log.write(message);
      settle(1);
    });
    child.on("close", (code) => {
      settle(code ?? 1);
    });
  });
}

async function waitForSupervisor(supervisorPid: number): Promise<Manifest | null> {
  let latest: Manifest | null = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const manifest = readManifest();
    if (manifest?.supervisorPid === supervisorPid) {
      latest = manifest;
      if (
        (manifest.url !== null && manifest.devStatus === "ready") ||
        manifest.devStatus === "fail"
      ) {
        return manifest;
      }
    }

    if (!isAlive(supervisorPid)) {
      return latest;
    }

    await sleep(100);
  }

  return latest;
}

async function start(): Promise<number> {
  ensureTmp();
  await killTrackedProcesses();
  cleanupLegacyTrackingFiles();

  const startedAt = new Date().toISOString();
  writeManifest(
    createAgentState({
      checkStatus: "idle",
      devStatus: "starting",
      startedAt,
      supervisorStatus: "starting",
      testStatus: "pending",
    }),
  );

  const installCode = await runWithTee(process.execPath, ["install"], paths.installLog);
  if (installCode !== 0) {
    writeManifest(
      createAgentState({
        checkStatus: "idle",
        devStatus: "fail",
        startedAt,
        supervisorStatus: "fail",
        testStatus: "fail",
      }),
    );
    return installCode;
  }

  writeManifest(
    createAgentState({
      checkStatus: "running",
      devStatus: "starting",
      startedAt,
      supervisorStatus: "starting",
      testStatus: "pending",
    }),
  );
  const checkCode = await runWithTee("vp", ["check", "--fix"], paths.checkLog);
  if (checkCode !== 0) {
    writeManifest(
      createAgentState({
        checkStatus: "fail",
        devStatus: "fail",
        startedAt,
        supervisorStatus: "fail",
        testStatus: "fail",
      }),
    );
    return checkCode;
  }

  const supervisorLog = openSync(paths.supervisorLog, "a");
  const supervisor = spawn(process.execPath, [scriptPath, "supervise", startedAt], {
    cwd: rootDir,
    detached: true,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", supervisorLog, supervisorLog],
  });
  closeSync(supervisorLog);

  if (typeof supervisor.pid !== "number") {
    writeManifest(
      createAgentState({
        checkStatus: "pass",
        devStatus: "fail",
        startedAt,
        supervisorStatus: "fail",
        testStatus: "fail",
      }),
    );
    return 1;
  }

  writeManifest(
    createAgentState({
      checkStatus: "pass",
      devStatus: "starting",
      startedAt,
      supervisorPid: supervisor.pid,
      supervisorStatus: "starting",
      testStatus: "pending",
    }),
  );
  supervisor.unref();

  const ready = await waitForSupervisor(supervisor.pid);
  if (ready === null || ready.url === null || ready.devStatus === "fail") {
    writeManifest(
      createAgentState({
        checkStatus: "pass",
        devStatus: "fail",
        devPid: ready?.devPid ?? null,
        host: ready?.host ?? null,
        startedAt,
        supervisorPid: ready?.supervisorPid ?? supervisor.pid,
        supervisorStatus: "fail",
        testPid: ready?.testPid ?? null,
        testStatus: ready?.testStatus ?? "pending",
        url: ready?.url ?? null,
      }),
    );
    return 1;
  }

  process.stdout.write(`Server ${ready.url}\nState ./tmp/agent-dev.json\n`);
  return 0;
}

async function stop(): Promise<number> {
  ensureTmp();
  const manifest = readManifest();
  writeManifest(stateFromCurrentLogs(manifest, "running"));

  const checkCode = await runWithTee("vp", ["check"], paths.checkLog);
  if (checkCode !== 0) {
    writeManifest(stateFromCurrentLogs(manifest, "fail"));
    return checkCode;
  }

  await killTrackedProcesses();
  writeManifest(
    createAgentState({
      checkStatus: "pass",
      devPid: null,
      devStatus: "stopped",
      host: manifest?.host ?? null,
      startedAt: manifest?.startedAt ?? new Date().toISOString(),
      supervisorPid: null,
      supervisorStatus: "stopped",
      testPid: null,
      testStatus: "stopped",
      url: manifest?.url ?? null,
    }),
  );
  process.stdout.write("Stopped agent dev processes.\n");
  return 0;
}

function appendProcessOutput(
  child: ChildProcess,
  logFile: string,
  onOutput: (text: string) => void,
): void {
  const log = createWriteStream(logFile, { flags: "w" });
  const writeChunk = (chunk: Buffer): void => {
    log.write(chunk);
    onOutput(chunk.toString());
  };

  child.stdout?.on("data", writeChunk);
  child.stderr?.on("data", writeChunk);
  child.on("error", (error) => {
    const message = `[agent-dev] process error: ${error.message}\n`;
    log.write(message);
    onOutput(message);
  });
  child.on("close", (code, signal) => {
    log.write(`[agent-dev] process exited code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    log.end();
  });
}

async function supervise(startedAt = new Date().toISOString()): Promise<number> {
  ensureTmp();
  let devLogBuffer = "";
  let testLogBuffer = "";
  let state: AgentState = {
    checkStatus: inferCheckStatus(readLog(paths.checkLog), "idle"),
    devPid: null,
    devStatus: "starting",
    host: null,
    logs: logFiles,
    startedAt,
    supervisorPid: process.pid,
    supervisorStatus: "running",
    testPid: null,
    testStatus: "pending",
    updatedAt: new Date().toISOString(),
    url: null,
  };

  const updateState = (patch: Partial<AgentState> = {}): void => {
    state = {
      ...state,
      ...patch,
      logs: { ...logFiles, ...patch.logs },
      updatedAt: new Date().toISOString(),
    };
    writeManifest(state);
  };

  note("Supervisor starting");
  updateState();

  const dev = spawnDetached("portless", ["run", "vp", "dev"]);
  const test = spawnDetached("vp", ["test", "--watch", "--reporter=agent"]);
  const manifest = createAgentState({
    checkStatus: state.checkStatus,
    devPid: typeof dev.pid === "number" ? dev.pid : null,
    devStatus: "starting",
    startedAt,
    supervisorPid: process.pid,
    supervisorStatus: "running",
    testPid: typeof test.pid === "number" ? test.pid : null,
    testStatus: "pending",
  });

  state = manifest;
  writeManifest(state);
  cleanupLegacyTrackingFiles();

  appendProcessOutput(dev, paths.devLog, (text) => {
    devLogBuffer = limitBuffer(devLogBuffer + text);
    const portlessUrl = portlessUrlFromOutput(devLogBuffer);
    updateState({
      ...portlessUrl,
      devStatus: inferDevStatus(devLogBuffer, state.devStatus),
    });
  });
  appendProcessOutput(test, paths.testLog, (text) => {
    testLogBuffer = limitBuffer(testLogBuffer + text);
    updateState({ testStatus: inferTestStatus(testLogBuffer, state.testStatus) });
  });

  dev.on("exit", (code) => {
    updateState({ devStatus: code === 0 ? "stopped" : "fail" });
  });
  test.on("exit", (code) => {
    updateState({ testStatus: code === 0 ? state.testStatus : "fail" });
  });

  const heartbeat = setInterval(() => {
    updateState();
  }, 2000);

  let shuttingDown = false;
  const shutdown = async (exitCode: number): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    clearInterval(heartbeat);
    updateState({ supervisorStatus: "stopping" });
    if (typeof dev.pid === "number") {
      await killProcessGroup(dev.pid);
    }
    if (typeof test.pid === "number") {
      await killProcessGroup(test.pid);
    }
    cleanupLegacyTrackingFiles();
    updateState({
      devPid: null,
      devStatus: "stopped",
      supervisorPid: null,
      supervisorStatus: "stopped",
      testPid: null,
      testStatus: "stopped",
    });
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdown(0);
  });
  process.on("SIGTERM", () => {
    void shutdown(0);
  });
  process.on("SIGHUP", () => {
    void shutdown(0);
  });
  process.on("uncaughtException", (error) => {
    note(`Uncaught exception: ${error.stack ?? error.message}`);
    updateState({ supervisorStatus: "fail" });
    void shutdown(1);
  });

  await new Promise(() => {
    // The supervisor is intentionally long-lived.
  });
  return 0;
}

async function main(): Promise<number> {
  const command = process.argv[2];

  if (command === "start") {
    return start();
  }

  if (command === "stop") {
    return stop();
  }

  if (command === "supervise") {
    return supervise(process.argv[3]);
  }

  process.stderr.write("Usage: bun start | bun stop\n");
  return 1;
}

process.exitCode = await main();
