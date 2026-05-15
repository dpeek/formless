import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  parseSitePublishArgs,
  runSitePublish,
  sitePublishUsage,
  type SitePublishDependencies,
} from "../src/site/publish.ts";
import { getWorkerSchemaAppDefinition } from "../src/worker/schema-apps.ts";

async function main() {
  const options = parseSitePublishArgs(process.argv.slice(2), process.env);

  if (options === "help") {
    console.log(sitePublishUsage());
    return;
  }

  const siteSource = getWorkerSchemaAppDefinition("site");

  await runSitePublish({
    adminToken: process.env.FORMLESS_ADMIN_TOKEN,
    cwd: process.cwd(),
    dependencies: nodePublishDependencies(),
    options,
    sourceSchema: siteSource.sourceSchema,
    sourceSeedRecords: siteSource.seedRecords,
  });
}

function nodePublishDependencies(): SitePublishDependencies {
  return {
    fetch: (url, init) => fetch(url, init),
    log: (message) => console.log(message),
    mkdir: async (directoryPath, options) => {
      await mkdir(directoryPath, options);
    },
    now: () => new Date().toISOString(),
    readFile,
    runCommand,
    writeFile,
  };
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} exited with signal ${signal}.`
            : `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
