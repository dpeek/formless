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
  devPid: path.join(tmpDir, "dev.pid"),
  installLog: path.join(tmpDir, "install.txt"),
  manifest: path.join(tmpDir, "agent-dev.json"),
  state: path.join(tmpDir, "state.txt"),
  supervisorLog: path.join(tmpDir, "supervisor.txt"),
  supervisorPid: path.join(tmpDir, "supervisor.pid"),
  testLog: path.join(tmpDir, "test.txt"),
  testPid: path.join(tmpDir, "test.pid"),
};

const sessionWords = [
  "amber",
  "anchor",
  "apex",
  "atlas",
  "autumn",
  "baker",
  "basil",
  "beacon",
  "birch",
  "bloom",
  "bolt",
  "breeze",
  "brick",
  "cable",
  "canyon",
  "cedar",
  "cherry",
  "cinder",
  "civic",
  "cloud",
  "cobalt",
  "comet",
  "copper",
  "cotton",
  "crystal",
  "delta",
  "denim",
  "dune",
  "echo",
  "ember",
  "fable",
  "field",
  "flint",
  "forest",
  "forge",
  "frost",
  "garden",
  "ginger",
  "glade",
  "granite",
  "harbor",
  "hazel",
  "helium",
  "hollow",
  "indigo",
  "island",
  "jade",
  "jasmine",
  "kernel",
  "lagoon",
  "lantern",
  "laurel",
  "linen",
  "lotus",
  "magnet",
  "maple",
  "marble",
  "meadow",
  "meteor",
  "mint",
  "mirror",
  "mist",
  "nectar",
  "nickel",
  "nova",
  "olive",
  "onyx",
  "orbit",
  "orchid",
  "paper",
  "pearl",
  "pepper",
  "pilot",
  "pixel",
  "plaza",
  "quartz",
  "ribbon",
  "river",
  "rocket",
  "saffron",
  "shadow",
  "signal",
  "silver",
  "slate",
  "solar",
  "spruce",
  "stone",
  "summit",
  "sunset",
  "tempo",
  "timber",
  "topaz",
  "tundra",
  "velvet",
  "violet",
  "voyage",
  "willow",
  "window",
  "winter",
  "zephyr",
];

type CheckStatus = "idle" | "running" | "pass" | "fail";
type DevStatus = "starting" | "ready" | "fail" | "stopped";
type SupervisorStatus = "starting" | "running" | "stopping" | "stopped" | "fail";
type TestStatus = "pending" | "pass" | "fail" | "stopped";

type AgentState = {
  checkStatus: CheckStatus;
  devStatus: DevStatus;
  host: string;
  session: string;
  supervisorStatus: SupervisorStatus;
  testStatus: TestStatus;
  url: string;
};

type Manifest = {
  devPid: number | null;
  host: string;
  session: string;
  startedAt: string;
  supervisorPid: number;
  testPid: number | null;
  url: string;
};

type KillTarget = {
  kind: "dev" | "supervisor" | "test";
  pid: number | null;
};

function ensureTmp(): void {
  mkdirSync(tmpDir, { recursive: true });
}

function sessionUrl(session: string): { host: string; url: string } {
  const host = `${session}.formless.local`;
  return { host, url: `https://${host}` };
}

function pickSessionName(): string {
  if (sessionWords.length !== 100) {
    throw new Error(`Expected 100 session words, found ${sessionWords.length}`);
  }

  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return sessionWords[values[0] % sessionWords.length];
}

function atomicWriteFile(filePath: string, content: string): void {
  ensureTmp();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, filePath);
}

function writePid(filePath: string, pid: number | null): void {
  if (pid === null) {
    removeFile(filePath);
    return;
  }

  atomicWriteFile(filePath, `${pid}\n`);
}

function readPid(filePath: string): number | null {
  try {
    const parsed = Number(readFileSync(filePath, "utf8").trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeManifest(manifest: Manifest): void {
  atomicWriteFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readManifest(): Manifest | null {
  try {
    const parsed = JSON.parse(readFileSync(paths.manifest, "utf8")) as Partial<Manifest>;
    if (
      typeof parsed.session === "string" &&
      typeof parsed.host === "string" &&
      typeof parsed.url === "string" &&
      typeof parsed.startedAt === "string" &&
      typeof parsed.supervisorPid === "number"
    ) {
      return {
        devPid: typeof parsed.devPid === "number" ? parsed.devPid : null,
        host: parsed.host,
        session: parsed.session,
        startedAt: parsed.startedAt,
        supervisorPid: parsed.supervisorPid,
        testPid: typeof parsed.testPid === "number" ? parsed.testPid : null,
        url: parsed.url,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function removeFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Temp files are best-effort cleanup.
  }
}

function writeState(state: AgentState): void {
  atomicWriteFile(
    paths.state,
    [
      `Server ${state.url}`,
      `Dev ${state.devStatus} ./tmp/dev.txt`,
      `Tests ${state.testStatus} ./tmp/test.txt`,
      `Check ${state.checkStatus} ./tmp/check.txt`,
      `Updated ${new Date().toISOString()}`,
      `Session ${state.session}`,
      `Supervisor ${state.supervisorStatus} ./tmp/supervisor.txt`,
      "",
    ].join("\n"),
  );
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
      (manifest !== null && command.includes(manifest.host))
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

  if (command.includes("portless run") && command.includes(".formless.local")) {
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

function cleanupTrackingFiles(): void {
  removeFile(paths.devPid);
  removeFile(paths.manifest);
  removeFile(paths.supervisorPid);
  removeFile(paths.testPid);
}

function trackedTargets(manifest: Manifest | null): KillTarget[] {
  return [
    { kind: "dev", pid: manifest?.devPid ?? readPid(paths.devPid) },
    { kind: "test", pid: manifest?.testPid ?? readPid(paths.testPid) },
    { kind: "supervisor", pid: manifest?.supervisorPid ?? readPid(paths.supervisorPid) },
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

  cleanupTrackingFiles();
}

function stripAnsi(input: string): string {
  return input.replace(ansiPattern, "");
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

    if (
      line.includes(".formless.local") ||
      line.includes("ready in") ||
      line.includes("local:") ||
      line.includes("network:")
    ) {
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

  if (clean.includes("correctly formatted") && clean.includes("found no warnings")) {
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

function stateFromCurrentLogs(manifest: Manifest | null, checkStatus: CheckStatus): AgentState {
  const fallbackSession = manifest?.session ?? "none";
  const fallbackUrl = manifest?.url ?? "stopped";
  const fallbackHost = manifest?.host ?? "none";
  return {
    checkStatus,
    devStatus: inferDevStatus(readLog(paths.devLog), manifest === null ? "stopped" : "starting"),
    host: fallbackHost,
    session: fallbackSession,
    supervisorStatus: manifest === null ? "stopped" : "running",
    testStatus: inferTestStatus(readLog(paths.testLog), manifest === null ? "stopped" : "pending"),
    url: fallbackUrl,
  };
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

async function waitForSupervisor(session: string, supervisorPid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const manifest = readManifest();
    if (manifest?.session === session && manifest.supervisorPid === supervisorPid) {
      return true;
    }

    if (!isAlive(supervisorPid)) {
      return false;
    }

    await sleep(100);
  }

  return false;
}

async function start(): Promise<number> {
  ensureTmp();
  await killTrackedProcesses();

  const session = pickSessionName();
  const { host, url } = sessionUrl(session);
  writeState({
    checkStatus: "idle",
    devStatus: "starting",
    host,
    session,
    supervisorStatus: "starting",
    testStatus: "pending",
    url,
  });

  const installCode = await runWithTee(process.execPath, ["install"], paths.installLog);
  if (installCode !== 0) {
    writeState({
      checkStatus: "idle",
      devStatus: "fail",
      host,
      session,
      supervisorStatus: "fail",
      testStatus: "fail",
      url,
    });
    return installCode;
  }

  writeState({
    checkStatus: "running",
    devStatus: "starting",
    host,
    session,
    supervisorStatus: "starting",
    testStatus: "pending",
    url,
  });
  const checkCode = await runWithTee("vp", ["check"], paths.checkLog);
  if (checkCode !== 0) {
    writeState({
      checkStatus: "fail",
      devStatus: "fail",
      host,
      session,
      supervisorStatus: "fail",
      testStatus: "fail",
      url,
    });
    return checkCode;
  }

  const supervisorLog = openSync(paths.supervisorLog, "a");
  const supervisor = spawn(process.execPath, [scriptPath, "supervise", session], {
    cwd: rootDir,
    detached: true,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", supervisorLog, supervisorLog],
  });
  closeSync(supervisorLog);

  if (typeof supervisor.pid !== "number") {
    writeState({
      checkStatus: "idle",
      devStatus: "fail",
      host,
      session,
      supervisorStatus: "fail",
      testStatus: "fail",
      url,
    });
    return 1;
  }

  writePid(paths.supervisorPid, supervisor.pid);
  supervisor.unref();

  const ready = await waitForSupervisor(session, supervisor.pid);
  if (!ready) {
    writeState({
      checkStatus: "idle",
      devStatus: "fail",
      host,
      session,
      supervisorStatus: "fail",
      testStatus: "fail",
      url,
    });
    return 1;
  }

  process.stdout.write(`Server ${url}\nState ./tmp/state.txt\n`);
  return 0;
}

async function stop(): Promise<number> {
  ensureTmp();
  const manifest = readManifest();
  writeState(stateFromCurrentLogs(manifest, "running"));

  const checkCode = await runWithTee("vp", ["check"], paths.checkLog);
  if (checkCode !== 0) {
    writeState(stateFromCurrentLogs(manifest, "fail"));
    return checkCode;
  }

  await killTrackedProcesses();
  writeState({
    checkStatus: "pass",
    devStatus: "stopped",
    host: manifest?.host ?? "none",
    session: manifest?.session ?? "none",
    supervisorStatus: "stopped",
    testStatus: "stopped",
    url: manifest?.url ?? "stopped",
  });
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

async function supervise(session: string): Promise<number> {
  ensureTmp();
  const { host, url } = sessionUrl(session);
  let devLogBuffer = "";
  let testLogBuffer = "";
  let state: AgentState = {
    checkStatus: inferCheckStatus(readLog(paths.checkLog), "idle"),
    devStatus: "starting",
    host,
    session,
    supervisorStatus: "running",
    testStatus: "pending",
    url,
  };

  const updateState = (patch: Partial<AgentState> = {}): void => {
    state = { ...state, ...patch };
    writeState(state);
  };

  note(`Supervisor starting for ${url}`);
  updateState();

  const dev = spawnDetached("portless", ["run", "--name", host, "vp", "dev"]);
  const test = spawnDetached("vp", ["test", "--watch", "--reporter=agent"]);
  const manifest: Manifest = {
    devPid: typeof dev.pid === "number" ? dev.pid : null,
    host,
    session,
    startedAt: new Date().toISOString(),
    supervisorPid: process.pid,
    testPid: typeof test.pid === "number" ? test.pid : null,
    url,
  };

  writeManifest(manifest);
  writePid(paths.devPid, manifest.devPid);
  writePid(paths.supervisorPid, process.pid);
  writePid(paths.testPid, manifest.testPid);

  appendProcessOutput(dev, paths.devLog, (text) => {
    devLogBuffer = limitBuffer(devLogBuffer + text);
    updateState({ devStatus: inferDevStatus(devLogBuffer, state.devStatus) });
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
    cleanupTrackingFiles();
    updateState({ devStatus: "stopped", supervisorStatus: "stopped", testStatus: "stopped" });
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
    const session = process.argv[3];
    if (typeof session !== "string" || session.length === 0) {
      process.stderr.write("Usage: bun run scripts/agent-dev.ts supervise <session>\n");
      return 1;
    }

    return supervise(session);
  }

  process.stderr.write("Usage: bun start | bun stop\n");
  return 1;
}

process.exitCode = await main();
