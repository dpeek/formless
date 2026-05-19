export type FormlessCliCommand =
  | {
      accountId: string | null;
      adminToken: string | null;
      createBucket: boolean;
      kind: "deploySetup";
      mediaBucket: string;
      projectPath: string;
      publishUrl: string;
      uploadSecret: boolean;
      workerName: string;
    }
  | { kind: "dev"; projectPath: string }
  | { kind: "help" }
  | { kind: "init"; targetDir: string }
  | { dryRun: boolean; kind: "publish"; projectPath: string; yes: boolean }
  | { check: boolean; kind: "save"; projectPath: string; source: string | null };

export function formlessCliUsage(): string {
  return [
    "Usage: formless <command>",
    "",
    "Commands:",
    "  init <dir>                         Create a Formless Site project",
    "  dev [--project <path>]             Run local public preview and /admin editor",
    "  save [--project <path>] [--check]   Save local Site edits back to project files",
    "       [--source <url>]",
    "  deploy setup [options]              Store deploy config and local admin token",
    "  publish [--project <path>]          Deploy code, media, and records",
    "       [--dry-run] [--yes]",
  ].join("\n");
}

export function parseFormlessCliArgs(args: string[]): FormlessCliCommand {
  const [command, ...rest] = args;

  if (!command || command === "-h" || command === "--help" || command === "help") {
    return { kind: "help" };
  }

  switch (command) {
    case "init":
      return parseInitArgs(rest);
    case "dev":
      return parseDevArgs(rest);
    case "save":
      return parseSaveArgs(rest);
    case "deploy":
      return parseDeployArgs(rest);
    case "publish":
      return parsePublishArgs(rest);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Source URL is invalid: ${value}`);
  }
}

function parseInitArgs(args: string[]): FormlessCliCommand {
  if (args.length !== 1 || args[0]?.startsWith("-")) {
    throw new Error("Usage: formless init <dir>");
  }

  return { kind: "init", targetDir: args[0] };
}

function parseDevArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless dev");

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for formless dev: ${options.rest[0]}`);
  }

  return { kind: "dev", projectPath: options.projectPath };
}

function parseSaveArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless save");
  let check = false;
  let source: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--check") {
      check = true;
      continue;
    }

    if (arg === "--source") {
      source = normalizeSourceUrl(readOptionValue(options.rest, index, "--source"));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless save: ${arg}`);
  }

  return { check, kind: "save", projectPath: options.projectPath, source };
}

function parseDeployArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  if (subcommand !== "setup") {
    throw new Error(
      "Usage: formless deploy setup [--project <path>] --worker <name> --publish-url <url> --media-bucket <bucket>",
    );
  }

  return parseDeploySetupArgs(rest);
}

function parseDeploySetupArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless deploy setup");
  let accountId: string | null = null;
  let adminToken: string | null = null;
  let createBucket = false;
  let mediaBucket: string | null = null;
  let publishUrl: string | null = null;
  let uploadSecret = true;
  let workerName: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--worker") {
      workerName = readOptionValue(options.rest, index, "--worker");
      index += 1;
      continue;
    }

    if (arg === "--publish-url") {
      publishUrl = normalizeSourceUrl(readOptionValue(options.rest, index, "--publish-url"));
      index += 1;
      continue;
    }

    if (arg === "--media-bucket") {
      mediaBucket = readOptionValue(options.rest, index, "--media-bucket");
      index += 1;
      continue;
    }

    if (arg === "--account-id") {
      accountId = readOptionValue(options.rest, index, "--account-id");
      index += 1;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    if (arg === "--generate-admin-token") {
      adminToken = null;
      continue;
    }

    if (arg === "--create-bucket") {
      createBucket = true;
      continue;
    }

    if (arg === "--skip-secret-upload") {
      uploadSecret = false;
      continue;
    }

    throw new Error(`Unknown option for formless deploy setup: ${arg}`);
  }

  if (!workerName) {
    throw new Error("Missing required option for formless deploy setup: --worker.");
  }

  if (!publishUrl) {
    throw new Error("Missing required option for formless deploy setup: --publish-url.");
  }

  if (!mediaBucket) {
    throw new Error("Missing required option for formless deploy setup: --media-bucket.");
  }

  return {
    accountId,
    adminToken,
    createBucket,
    kind: "deploySetup",
    mediaBucket,
    projectPath: options.projectPath,
    publishUrl,
    uploadSecret,
    workerName,
  };
}

function parsePublishArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless publish");
  let dryRun = false;
  let yes = false;

  for (const arg of options.rest) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      yes = true;
      continue;
    }

    throw new Error(`Unknown option for formless publish: ${arg}`);
  }

  return { dryRun, kind: "publish", projectPath: options.projectPath, yes };
}

function parseProjectOptions(
  args: string[],
  usage: string,
): { projectPath: string; rest: string[] } {
  let projectPath = ".";
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--project") {
      projectPath = readOptionValue(args, index, "--project");
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage} [--project <path>]`);
    }

    rest.push(arg);
  }

  return { projectPath, rest };
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}
