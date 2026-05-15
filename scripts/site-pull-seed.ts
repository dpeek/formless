import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import rawSiteSourceSchema from "../schema/apps/site/schema.json";
import {
  buildSiteSeedRecordsFromSnapshot,
  formatSiteSeedRecords,
} from "../src/site/seed-promotion.ts";
import {
  SITE_SOURCE_MEDIA_ROOT,
  siteSourceMediaAssetsFromRecords,
  type SiteSourceMediaAsset,
} from "../src/site/source-media.ts";
import { parseAppSchema } from "../src/shared/schema.ts";

type CliOptions = {
  check: boolean;
  source: string | null;
};

const seedPath = "schema/apps/site/seed-records.json";
const devstateStatusPath = ".devstate/status.json";
const sourceSchema = parseAppSchema(rawSiteSourceSchema);

type PulledSiteSourceMediaAsset = {
  asset: SiteSourceMediaAsset;
  bytes: Uint8Array;
};

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
  const mediaAssets = await fetchSiteSourceMediaAssets(source, records);
  const absoluteSeedPath = path.resolve(process.cwd(), seedPath);

  if (options.check) {
    const currentSeed = await readFile(absoluteSeedPath, "utf8");
    const staleMediaPaths = await staleSiteSourceMediaPaths(mediaAssets);

    if (currentSeed !== nextSeed || staleMediaPaths.length > 0) {
      const staleMedia =
        staleMediaPaths.length === 0 ? "" : ` Stale media: ${staleMediaPaths.join(", ")}.`;

      throw new Error(
        `Site source seed is stale. Run "bun run site:pull-seed" to update ${seedPath} and ${SITE_SOURCE_MEDIA_ROOT}.${staleMedia}`,
      );
    }

    console.log(
      `Site source seed is current: ${records.length} records and ${mediaAssets.length} media files from ${source}.`,
    );
    return;
  }

  await writeFile(absoluteSeedPath, nextSeed);
  await writeSiteSourceMediaAssets(mediaAssets);
  console.log(
    `Wrote ${seedPath}: ${records.length} records and ${mediaAssets.length} media files from ${source}.`,
  );
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

async function fetchSiteSourceMediaAssets(
  source: string,
  records: ReturnType<typeof buildSiteSeedRecordsFromSnapshot>,
): Promise<PulledSiteSourceMediaAsset[]> {
  const assets = siteSourceMediaAssetsFromRecords(records);

  return Promise.all(
    assets.map(async (asset) => {
      const url = new URL(asset.href, `${source}/`).toString();
      const response = await fetch(url, {
        headers: {
          accept: asset.contentType,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${await response.text()}`);
      }

      const responseContentType = normalizeContentType(response.headers.get("Content-Type"));

      if (responseContentType && responseContentType !== asset.contentType) {
        throw new Error(
          `Failed to fetch ${url}: expected ${asset.contentType}, received ${responseContentType}.`,
        );
      }

      return {
        asset,
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    }),
  );
}

async function staleSiteSourceMediaPaths(
  mediaAssets: PulledSiteSourceMediaAsset[],
): Promise<string[]> {
  const stalePaths: string[] = [];

  for (const mediaAsset of mediaAssets) {
    try {
      const current = await readFile(path.resolve(process.cwd(), mediaAsset.asset.sourcePath));

      if (!bytesEqual(current, mediaAsset.bytes)) {
        stalePaths.push(mediaAsset.asset.sourcePath);
      }
    } catch {
      stalePaths.push(mediaAsset.asset.sourcePath);
    }
  }

  return stalePaths;
}

async function writeSiteSourceMediaAssets(mediaAssets: PulledSiteSourceMediaAsset[]) {
  for (const mediaAsset of mediaAssets) {
    const mediaPath = path.resolve(process.cwd(), mediaAsset.asset.sourcePath);

    await mkdir(path.dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, mediaAsset.bytes);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function normalizeContentType(value: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function printUsage() {
  console.log(
    [
      "Usage: bun run site:pull-seed [--check] [--source <url>]",
      "",
      "Fetches the local Site authority snapshot and writes schema/apps/site/seed-records.json.",
      `Referenced Site media is written under ${SITE_SOURCE_MEDIA_ROOT}.`,
      "--check exits non-zero when the source seed file or source media files are stale.",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
