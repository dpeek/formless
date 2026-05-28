#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

type SmokeOptions = {
  session: string;
  url?: string;
};

const defaultSession = "object-list-smoke";

function usage(): string {
  return [
    "Usage: bun run scripts/object-list-smoke.ts [--url <dev-url>] [--session <name>]",
    "",
    "Runs agent-browser smoke coverage for the migrated ObjectList surfaces.",
    "Defaults to the URL recorded in .devstate/status.md.",
  ].join("\n");
}

function parseArgs(args: string[]): SmokeOptions | "help" {
  const options: SmokeOptions = { session: defaultSession };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      return "help";
    }

    if (arg === "--url") {
      options.url = nextArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--session") {
      options.session = nextArg(args, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function nextArg(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options === "help") {
    console.log(usage());
    return;
  }

  const baseUrl = stripTrailingSlash(options.url ?? readDevstateUrl(process.cwd()));

  await runBrowser(["--session", options.session, "close"], { allowFailure: true });

  try {
    await runBrowser([
      "--session",
      options.session,
      "--ignore-https-errors",
      "open",
      `${baseUrl}/estii/schema`,
    ]);
    await runBrowser(["--session", options.session, "wait", '[aria-label="Entities"]']);
    await runBrowser(["--session", options.session, "eval", estiiSchemaDefaultAssertion]);
    await runBrowser([
      "--session",
      options.session,
      "click",
      '[data-slot="object-list-item"][data-key="card"]',
    ]);
    await runBrowser(["--session", options.session, "wait", '[aria-label="Rate card fields"]']);
    await runBrowser([
      "--session",
      options.session,
      "click",
      '[aria-label="Rate card fields"] [data-slot="object-list-item"][data-key="isDefault"]',
    ]);
    await runBrowser(["--session", options.session, "eval", estiiSchemaSelectionAssertion]);
    await runBrowser(["--session", options.session, "open", `${baseUrl}/tasks`]);
    await runBrowser(["--session", options.session, "wait", '[aria-label="Task records"]']);
    await runBrowser(["--session", options.session, "eval", taskRecordsAssertion]);

    console.log(`ObjectList smoke passed for ${baseUrl}.`);
  } finally {
    await runBrowser(["--session", options.session, "close"], { allowFailure: true });
  }
}

function readDevstateUrl(cwd: string): string {
  const status = readFileSync(`${cwd}/.devstate/status.md`, "utf8");
  const match = status.match(/^- url: (.+)$/m);

  if (!match) {
    throw new Error("Missing dev URL in .devstate/status.md. Run devstate start first.");
  }

  return match[1];
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function runBrowser(args: string[], options: { allowFailure?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["browser", ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0 || options.allowFailure) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `bun browser ${args.join(" ")} exited with signal ${signal}.`
            : `bun browser ${args.join(" ")} exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

const estiiSchemaDefaultAssertion = String.raw`
(() => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const lists = [...document.querySelectorAll('[data-slot="object-list"]')].map((list) => ({
    label: list.querySelector('[role="grid"]')?.getAttribute('aria-label'),
    keys: [...list.querySelectorAll('[data-slot="object-list-item"]')].map((item) => item.getAttribute('data-key')),
    selected: [...list.querySelectorAll('[aria-selected="true"]')].map((item) => item.getAttribute('data-key')),
  }));

  assert(location.pathname === '/estii/schema', 'Expected /estii/schema.');
  assert(lists.length === 2, 'Expected two object lists, found ' + lists.length + '.');
  assert(lists.some((list) => list.label === 'Entities' && list.keys.includes('resource') && list.selected.includes('resource')), 'Missing selected resource entity list.');
  assert(lists.some((list) => list.label === 'Resource fields' && list.keys.includes('name') && list.selected.includes('name')), 'Missing selected resource field list.');
  return 'estii schema object-list defaults ok';
})()
`;

const estiiSchemaSelectionAssertion = String.raw`
(() => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const selected = [...document.querySelectorAll('[aria-selected="true"]')].map((item) => item.getAttribute('data-key'));

  assert(document.querySelector('[aria-label="Rate card fields"]'), 'Expected Rate card fields grid.');
  assert(selected.includes('card'), 'Expected selected rate card entity.');
  assert(selected.includes('isDefault'), 'Expected selected default field.');
  assert(document.body.innerText.includes('card.isDefault saved'), 'Expected default field details.');
  return 'estii schema object-list selection ok';
})()
`;

const taskRecordsAssertion = String.raw`
(() => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const grid = document.querySelector('[aria-label="Task records"]');
  const list = grid?.closest('[data-slot="object-list"]');
  const rows = [...(list?.querySelectorAll('[data-slot="object-list-item"]') ?? [])];
  const editableCount = list?.querySelectorAll('input, textarea, button').length ?? 0;

  assert(location.pathname === '/tasks', 'Expected /tasks.');
  assert(grid?.getAttribute('role') === 'grid', 'Expected Task records grid role.');
  assert(rows.length > 0, 'Expected task record rows.');
  assert(rows.every((row) => row.getAttribute('data-key')), 'Expected record row keys.');
  assert(editableCount > 0, 'Expected editable controls inside task record list.');
  return 'task record object-list ok';
})()
`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
