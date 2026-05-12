import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import rawSiteSourceSchema from "../schema/apps/site/schema.json";
import {
  buildSiteSeedRecordsFromSnapshot,
  formatSiteSeedRecords,
} from "../src/site/seed-promotion.ts";
import { parseAppSchema } from "../src/shared/schema.ts";

type CliOptions = {
  check: boolean;
  source: string | null;
};

const seedPath = "schema/apps/site/seed-records.json";
const devstateStatusPath = ".devstate/status.json";
const sourceSchema = parseAppSchema(rawSiteSourceSchema);

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options === "help") {
    printUsage();
    return;
  }

  const source = options.source ?? (await readDevstateSourceUrl());
  const snapshot = await fetchJson(siteSnapshotUrl(source));
  const records = buildSiteSeedRecordsFromSnapshot(snapshot, sourceSchema);
  const nextSeed = formatSiteSeedRecords(records);
  const absoluteSeedPath = path.resolve(process.cwd(), seedPath);

  if (options.check) {
    const currentSeed = await readFile(absoluteSeedPath, "utf8");

    if (currentSeed !== nextSeed) {
      throw new Error(`Site seed is stale. Run "bun run site:pull-seed" to update ${seedPath}.`);
    }

    console.log(`Site seed is current: ${records.length} records from ${source}.`);
    return;
  }

  await writeFile(absoluteSeedPath, nextSeed);
  console.log(`Wrote ${seedPath}: ${records.length} records from ${source}.`);
}

function parseArgs(args: string[]): CliOptions | "help" {
  const options: CliOptions = {
    check: false,
    source: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      return "help";
    }

    if (arg === "--check") {
      options.check = true;
      continue;
    }

    if (arg === "--source") {
      const value = args[index + 1];

      if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
        throw new Error("Missing value for --source.");
      }

      options.source = normalizeSourceUrl(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function readDevstateSourceUrl(): Promise<string> {
  let rawStatus: string;

  try {
    rawStatus = await readFile(path.resolve(process.cwd(), devstateStatusPath), "utf8");
  } catch {
    throw new Error(
      `Could not read ${devstateStatusPath}. Run "devstate start" or pass --source <url>.`,
    );
  }

  const status = JSON.parse(rawStatus) as {
    services?: {
      web?: {
        url?: unknown;
      };
    };
  };
  const url = status.services?.web?.url;

  if (typeof url !== "string" || url.trim() === "") {
    throw new Error(`Could not find services.web.url in ${devstateStatusPath}.`);
  }

  return normalizeSourceUrl(url);
}

function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Source URL is invalid: ${value}`);
  }
}

function siteSnapshotUrl(source: string): string {
  return new URL("/api/site/snapshot", `${source}/`).toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function printUsage() {
  console.log(
    [
      "Usage: bun run site:pull-seed [--check] [--source <url>]",
      "",
      "Fetches the local Site authority snapshot and writes schema/apps/site/seed-records.json.",
      "--check exits non-zero when the source seed file is stale.",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
