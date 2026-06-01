import path from "node:path";

import packageJson from "../../package.json";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  parseStoreSnapshot,
  type BootstrapResponse,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import { readFormlessInstanceTargetStatus } from "./instance-target-client.ts";
import { buildSiteSourceSnapshot } from "./source-snapshot.ts";
import { siteSourceMediaAssetsFromRecords, type SiteSourceMediaAsset } from "./source-media.ts";
import {
  assertCliUpgradePlanningReady,
  buildCliUpgradePlanningReport,
  formatCliUpgradePlanningReport,
} from "./upgrade-plan.ts";

export type SitePublishOptions = {
  apply: boolean;
  backupDir: string;
  code: boolean;
  data: boolean;
  skipCheck: boolean;
  target: string | null;
};

export type SitePublishResult = {
  backupPath: string | null;
  mode: "apply" | "dry-run";
  sourceRecordCount: number;
  target: string | null;
};

export type SitePublishRunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type SitePublishHttpResponse = {
  headers: Headers;
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

export type SitePublishDependencies = {
  fetch: (url: string, init?: RequestInit) => Promise<SitePublishHttpResponse>;
  log: (message: string) => void;
  mkdir: (directoryPath: string, options: { recursive: true }) => Promise<void>;
  now: () => string;
  readFile: (filePath: string) => Promise<Uint8Array>;
  runCommand: (
    command: string,
    args: string[],
    options: SitePublishRunCommandOptions,
  ) => Promise<void>;
  writeFile: (filePath: string, contents: string) => Promise<void>;
};

export type SitePublishCommand = {
  args: string[];
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  label?: string;
};

export type SitePublishInput = {
  adminToken?: string;
  codeDeployCommands?: SitePublishCommand[];
  cwd: string;
  dependencies: SitePublishDependencies;
  missingSourceMediaMessage?: (asset: SiteSourceMediaAsset) => string;
  options: SitePublishOptions;
  smokePaths?: string[];
  sourceMediaAssets?: SiteSourceMediaAsset[];
  sourceSchema: AppSchema;
  sourceSeedRecords: StoredRecord[];
};

type SitePublishModeFlags = {
  codeOnly: boolean;
  dataOnly: boolean;
};

type SourceMediaFile = SiteSourceMediaAsset & {
  bytes: Uint8Array<ArrayBuffer>;
};

const defaultBackupDir = "tmp/site-publish-backups";
const defaultSmokePaths = ["/pages/home"];

export function parseSitePublishArgs(
  args: string[],
  env: Record<string, string | undefined> = {},
): SitePublishOptions | "help" {
  const modeFlags: SitePublishModeFlags = {
    codeOnly: false,
    dataOnly: false,
  };
  const options: Omit<SitePublishOptions, "code" | "data"> = {
    apply: false,
    backupDir: defaultBackupDir,
    skipCheck: false,
    target: env.FORMLESS_SITE_PUBLISH_TARGET
      ? normalizePublishUrl(env.FORMLESS_SITE_PUBLISH_TARGET)
      : null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      return "help";
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--skip-check") {
      options.skipCheck = true;
      continue;
    }

    if (arg === "--code-only") {
      modeFlags.codeOnly = true;
      continue;
    }

    if (arg === "--data-only") {
      modeFlags.dataOnly = true;
      continue;
    }

    if (arg === "--target") {
      options.target = normalizePublishUrl(readOptionValue(args, index, "--target"));
      index += 1;
      continue;
    }

    if (arg === "--backup-dir") {
      options.backupDir = readOptionValue(args, index, "--backup-dir");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (modeFlags.codeOnly && modeFlags.dataOnly) {
    throw new Error("--code-only and --data-only cannot be used together.");
  }

  return {
    ...options,
    code: !modeFlags.dataOnly,
    data: !modeFlags.codeOnly,
  };
}

export async function runSitePublish(input: SitePublishInput): Promise<SitePublishResult> {
  const plannedAt = input.dependencies.now();
  const sourceSnapshot = buildSiteSourceSnapshot(input.sourceSchema, input.sourceSeedRecords, {
    exportedAt: plannedAt,
  });
  const sourceMediaAssets =
    input.sourceMediaAssets ?? siteSourceMediaAssetsFromRecords(sourceSnapshot.records);

  if (input.options.apply && input.options.data && !input.options.target) {
    throw new Error(
      "Site publish target is required for --apply data publish. Pass --target <url> or set FORMLESS_SITE_PUBLISH_TARGET.",
    );
  }

  logPublishPlan(input, sourceSnapshot, sourceMediaAssets.length);

  if (!input.options.apply) {
    await logDryRunUpgradePlanning(input);

    return {
      backupPath: null,
      mode: "dry-run",
      sourceRecordCount: sourceSnapshot.records.length,
      target: input.options.target,
    };
  }

  const sourceMediaFiles = input.options.data
    ? await readSourceMediaFiles(input, sourceMediaAssets)
    : [];

  if (!input.options.skipCheck) {
    input.dependencies.log("Check: devstate check");
    await input.dependencies.runCommand("devstate", ["check"], { cwd: input.cwd });
  }

  if (input.options.code) {
    for (const command of codeDeployCommands(input)) {
      input.dependencies.log(`Code deploy: ${command.label ?? formatCommand(command)}`);
      await input.dependencies.runCommand(command.command, command.args, {
        cwd: command.cwd ?? input.cwd,
        env: command.env,
      });
    }
  }

  const backupPath = input.options.data
    ? await publishSiteData(input, sourceSnapshot, sourceMediaFiles, plannedAt)
    : null;

  input.dependencies.log("Site publish complete.");

  return {
    backupPath,
    mode: "apply",
    sourceRecordCount: sourceSnapshot.records.length,
    target: input.options.target,
  };
}

export function sitePublishUsage(): string {
  return [
    "Usage: bun run site:publish [--apply] [--target <url>] [--code-only | --data-only] [--skip-check] [--backup-dir <path>]",
    "",
    "Defaults to a dry run. Mutating publish requires --apply.",
    "Data publish backs up GET /api/site/snapshot, restores source Site seed data, and smokes /pages/home.",
  ].join("\n");
}

function logPublishPlan(
  input: SitePublishInput,
  sourceSnapshot: StoreSnapshot,
  sourceMediaAssetCount: number,
) {
  const mode = input.options.apply ? "APPLY" : "DRY RUN";
  const codeStep = input.options.code ? "enabled" : "skipped";
  const dataStep = input.options.data ? "enabled" : "skipped";
  const checkStep = input.options.skipCheck ? "skipped" : "devstate check";
  const target = input.options.target ?? "(not set)";

  input.dependencies.log(`${mode}: Site publish workflow.`);
  input.dependencies.log(`Source: ${sourceSnapshot.records.length} Site seed records validated.`);
  input.dependencies.log(`Source media: ${sourceMediaAssetCount} files referenced.`);
  input.dependencies.log(`Target: ${target}`);
  input.dependencies.log(`Steps: check=${checkStep}; code=${codeStep}; data=${dataStep}.`);

  if (!input.options.apply) {
    input.dependencies.log("Dry run only. Re-run with --apply to mutate code or live data.");
    return;
  }

  if (input.options.data) {
    input.dependencies.log(`Backup directory: ${input.options.backupDir}`);
  }
}

async function logDryRunUpgradePlanning(input: SitePublishInput): Promise<void> {
  const target = input.options.target;

  if (!target) {
    return;
  }

  const targetStatus = await readFormlessInstanceTargetStatus(
    {
      targetUrl: target,
    },
    {
      fetch: (url, init) => sitePublishFetchResponse(input, url, init),
    },
  );
  const deploymentTarget = targetStatus.upgradeStatus.deployment?.target;
  const report = buildCliUpgradePlanningReport({
    localPackageVersion: packageJson.version,
    status: targetStatus.upgradeStatus,
    target: {
      ...(deploymentTarget?.label === undefined ? {} : { label: deploymentTarget.label }),
      ...(deploymentTarget?.targetId === undefined ? {} : { targetId: deploymentTarget.targetId }),
      targetUrl: target,
    },
  });

  input.dependencies.log(formatCliUpgradePlanningReport(report).trimEnd());
  assertCliUpgradePlanningReady(report);
}

async function publishSiteData(
  input: SitePublishInput,
  sourceSnapshot: StoreSnapshot,
  sourceMediaFiles: SourceMediaFile[],
  plannedAt: string,
): Promise<string> {
  const target = input.options.target;

  if (!target) {
    throw new Error("Site publish target is required for data publish.");
  }

  input.dependencies.log("Data backup: GET /api/site/snapshot");
  const backup = parseStoreSnapshot(
    await fetchJson(input, sitePublishUrl(target, "/api/site/snapshot"), {
      headers: authHeaders(input.adminToken, { accept: "application/json" }),
    }),
    "site",
  );
  const backupPath = sitePublishBackupPath(input.cwd, input.options.backupDir, plannedAt);
  await input.dependencies.mkdir(path.dirname(backupPath), { recursive: true });
  await input.dependencies.writeFile(backupPath, formatJson(backup));
  input.dependencies.log(`Data backup written: ${backupPath}`);

  try {
    await restoreSourceMedia(input, target, sourceMediaFiles);

    input.dependencies.log("Data restore: POST /api/site/snapshot/restore");
    const restoreResponse = validateRestoreResponse(
      await fetchJson(input, sitePublishUrl(target, "/api/site/snapshot/restore"), {
        body: JSON.stringify(sourceSnapshot),
        headers: authHeaders(input.adminToken, {
          accept: "application/json",
          "content-type": "application/json",
        }),
        method: "POST",
      }),
      sourceSnapshot,
    );
    input.dependencies.log(
      `Data restore complete: cursor ${restoreResponse.cursor}, ${restoreResponse.records.length} records.`,
    );

    for (const smokePath of input.smokePaths ?? defaultSmokePaths) {
      input.dependencies.log(`Smoke: GET ${smokePath}`);
      await fetchOk(input, sitePublishUrl(target, smokePath), {
        headers: { accept: "text/html,application/json" },
      });
    }
  } catch (error) {
    throw new Error(`${errorMessage(error)} Backup kept at ${backupPath}.`);
  }

  return backupPath;
}

async function readSourceMediaFiles(
  input: SitePublishInput,
  sourceMediaAssets: SiteSourceMediaAsset[],
): Promise<SourceMediaFile[]> {
  const files: SourceMediaFile[] = [];

  for (const asset of sourceMediaAssets) {
    const filePath = path.resolve(input.cwd, asset.sourcePath);
    let bytes: Uint8Array;

    try {
      bytes = await input.dependencies.readFile(filePath);
    } catch {
      throw new Error(
        input.missingSourceMediaMessage?.(asset) ??
          `Missing Site source media file ${asset.sourcePath}. Run "bun run site:pull-seed" before publishing.`,
      );
    }

    files.push({
      ...asset,
      bytes: copyBytes(bytes),
    });
  }

  return files;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);

  return copy;
}

async function restoreSourceMedia(
  input: SitePublishInput,
  target: string,
  sourceMediaFiles: SourceMediaFile[],
) {
  if (sourceMediaFiles.length === 0) {
    return;
  }

  input.dependencies.log(`Core media restore: PUT ${sourceMediaFiles.length} source media files.`);

  for (const file of sourceMediaFiles) {
    validateMediaRestoreResponse(
      await fetchJson(input, sitePublishUrl(target, file.href), {
        body: file.bytes,
        headers: authHeaders(input.adminToken, {
          accept: "application/json",
          "content-type": file.contentType,
        }),
        method: "PUT",
      }),
      file,
    );
  }
}

function validateMediaRestoreResponse(value: unknown, file: SourceMediaFile) {
  if (!isRecord(value)) {
    throw new Error("Core media restore response must be an object.");
  }

  if (
    value.contentType !== file.contentType ||
    value.href !== file.href ||
    value.key !== file.key ||
    value.size !== file.bytes.byteLength
  ) {
    throw new Error(`Core media restore response did not match source media "${file.key}".`);
  }
}

function validateRestoreResponse(value: unknown, sourceSnapshot: StoreSnapshot): BootstrapResponse {
  if (!isRecord(value)) {
    throw new Error("Site restore response must be an object.");
  }

  const parsed = parseStoreSnapshot(
    {
      kind: STORE_SNAPSHOT_KIND,
      version: STORE_SNAPSHOT_VERSION,
      schemaKey: "site",
      exportedAt: sourceSnapshot.exportedAt,
      schemaUpdatedAt: value.schemaUpdatedAt,
      sourceCursor: value.cursor,
      schema: value.schema,
      records: value.records,
    },
    "site",
  );
  const response: BootstrapResponse = {
    cursor: parsed.sourceCursor,
    records: parsed.records,
    schema: parsed.schema,
    schemaUpdatedAt: parsed.schemaUpdatedAt,
  };
  const responseRecordsById = new Map(response.records.map((record) => [record.id, record]));

  for (const sourceRecord of sourceSnapshot.records) {
    const responseRecord = responseRecordsById.get(sourceRecord.id);

    if (JSON.stringify(responseRecord) !== JSON.stringify(sourceRecord)) {
      throw new Error(
        `Site restore response did not include restored record "${sourceRecord.id}".`,
      );
    }
  }

  return response;
}

function sitePublishBackupPath(cwd: string, backupDir: string, timestamp: string): string {
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");

  return path.resolve(cwd, backupDir, `site-${safeTimestamp}.snapshot.json`);
}

function codeDeployCommands(input: SitePublishInput): SitePublishCommand[] {
  return (
    input.codeDeployCommands ?? [
      {
        args: ["run", "deploy"],
        command: "bun",
      },
    ]
  );
}

function formatCommand(command: SitePublishCommand): string {
  return [command.command, ...command.args].join(" ");
}

async function fetchJson(
  input: SitePublishInput,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await input.dependencies.fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: response was not JSON.`);
  }
}

async function sitePublishFetchResponse(
  input: SitePublishInput,
  url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
  const response = await input.dependencies.fetch(requestUrl, init);

  return new Response(await response.text(), {
    headers: response.headers,
    status: response.status,
  });
}

async function fetchOk(input: SitePublishInput, url: string, init?: RequestInit): Promise<void> {
  const response = await input.dependencies.fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: HTTP ${response.status} ${text}`);
  }
}

function sitePublishUrl(target: string, pathname: string): string {
  return new URL(pathname, `${target}/`).toString();
}

function authHeaders(
  adminToken: string | undefined,
  headers: Record<string, string>,
): Record<string, string> {
  if (!adminToken) {
    return headers;
  }

  return {
    ...headers,
    authorization: `Bearer ${adminToken}`,
  };
}

function normalizePublishUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Publish target URL is invalid: ${value}`);
  }
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
