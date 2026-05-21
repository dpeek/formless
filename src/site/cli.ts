import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formlessCliUsage, parseFormlessCliArgs } from "./cli-command.ts";
import { packageRunScriptCommand } from "./package-commands.ts";
import { SITE_PROJECT_RECORDS_FILE } from "./project-config.ts";
import { initSiteProjectSource, type InitSiteProjectSourceResult } from "./project-files.ts";
import { runSiteProjectDev } from "./project-dev.ts";
import {
  isSiteProjectPublishConfigured,
  publishSiteProject as publishSiteProjectCommand,
  setupSiteProjectDeploy as setupSiteProjectDeployCommand,
  startSiteProjectLocalPublishBroker as startSiteProjectLocalPublishBrokerCommand,
  type PublishSiteProjectResult,
  type SetupSiteProjectDeployResult,
} from "./project-publish.ts";
import {
  saveSiteProject as saveSiteProjectCommand,
  type SaveSiteProjectResult,
} from "./project-save.ts";
import { type SiteProjectLocalPublishBroker } from "./local-publish-broker.ts";
import { SITE_PROJECT_GITIGNORE_ENTRY } from "./project-state.ts";

export {
  formlessCliUsage,
  normalizeSourceUrl,
  parseFormlessCliArgs,
  type FormlessCliCommand,
} from "./cli-command.ts";
export {
  readSiteProjectSource,
  resolveSiteProjectRoot,
  type SiteProjectSource,
} from "./project-files.ts";
export {
  readSiteProjectDevStateSource,
  siteProjectDevEnv,
  siteProjectStorageId,
  siteProjectWranglerPersistPath,
} from "./project-dev.ts";
export { type SiteProjectLocalPublishBroker } from "./local-publish-broker.ts";
export {
  isSiteProjectPublishConfigured,
  type LocalAdminPublishResult,
  type PublishSiteProjectResult,
  type SetupSiteProjectDeployResult,
} from "./project-publish.ts";
export { type SaveSiteProjectResult } from "./project-save.ts";

export type FormlessCliRunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type FormlessCliDependencies = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  log: (message: string) => void;
  now: () => string;
  packageRoot: string;
  randomToken: () => string;
  runCommand: (
    command: string,
    args: string[],
    options: FormlessCliRunCommandOptions,
  ) => Promise<void>;
  spawn: typeof nodeSpawn;
};

const projectStateGitignoreEntry = SITE_PROJECT_GITIGNORE_ENTRY;

export type InitSiteProjectResult = InitSiteProjectSourceResult;

export type OnboardFormlessInstanceResult = {
  credentialProfile: string | null;
  instanceName: string | null;
  mode: "noop";
  open: boolean;
};

export async function runFormlessCli(
  args: string[],
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
) {
  const command = parseFormlessCliArgs(args);

  switch (command.kind) {
    case "help":
      dependencies.log(formlessCliUsage());
      return;
    case "init": {
      const result = await initSiteProject(command, dependencies);
      dependencies.log(
        [
          `Created Formless Site project at ${result.projectRoot}.`,
          `Wrote ${path.basename(result.configPath)}, ${path.basename(result.recordsPath)}, and ${result.mediaCount} media files.`,
          "",
          "Next:",
          `  cd ${path.relative(dependencies.cwd, result.projectRoot) || "."}`,
          "  npx formless dev",
        ].join("\n"),
      );
      return;
    }
    case "onboard": {
      const result = await onboardFormlessInstance(command);
      dependencies.log(
        [
          "Formless instance onboarding is wired but not deployed yet.",
          "No remote resources were changed.",
          `Requested instance: ${result.instanceName ?? "<default>"}.`,
          `Credential profile: ${result.credentialProfile ?? "<default>"}.`,
          `Browser open: ${result.open ? "yes" : "no"}.`,
          "Owner setup and browser writes remain follow-up work.",
        ].join("\n"),
      );
      return;
    }
    case "dev":
      await runSiteProjectDev(command, dependencies, {
        devCommand: packageRunScriptCommand("dev", dependencies.env),
        isPublishConfigured: (project) => isSiteProjectPublishConfigured(project, dependencies),
        startLocalPublishBroker: (input) => startSiteProjectLocalPublishBroker(input, dependencies),
      });
      return;
    case "deploySetup": {
      const result = await setupSiteProjectDeploy(command, dependencies);
      dependencies.log(
        [
          `Configured Site deploy for ${result.projectRoot}.`,
          `Wrote ${path.relative(result.projectRoot, result.configPath)} and ${path.relative(result.projectRoot, result.envPath)}.`,
          `Ensured ${path.relative(result.projectRoot, result.gitignorePath)} ignores ${projectStateGitignoreEntry}.`,
          result.bucketCreated ? "Verified or created the configured R2 bucket." : null,
          result.secretUploaded ? "Uploaded the admin token as a Worker secret." : null,
          "",
          "Next:",
          "  npx formless publish --yes",
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
      );
      return;
    }
    case "publish": {
      const result = await publishSiteProject(command, dependencies);
      dependencies.log(
        result.mode === "dry-run"
          ? `Site project publish dry run: ${result.sourceRecordCount} records for ${result.target}.`
          : `Site project published: ${result.sourceRecordCount} records to ${result.target}. Backup: ${result.backupPath}.`,
      );
      return;
    }
    case "save": {
      const result = await saveSiteProject(command, dependencies);
      dependencies.log(
        result.mode === "check"
          ? `Site project source is current: ${result.recordCount} records and ${result.mediaCount} media files from ${result.source}.`
          : `Wrote ${SITE_PROJECT_RECORDS_FILE}: ${result.recordCount} records and ${result.mediaCount} media files from ${result.source}.`,
      );
      return;
    }
  }
}

export async function initSiteProject(
  input: { targetDir: string },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<InitSiteProjectResult> {
  const projectRoot = path.resolve(dependencies.cwd, input.targetDir);

  return initSiteProjectSource({ packageRoot: dependencies.packageRoot, projectRoot });
}

export async function onboardFormlessInstance(input: {
  credentialProfile?: string | null;
  instanceName?: string | null;
  open?: boolean;
}): Promise<OnboardFormlessInstanceResult> {
  return {
    credentialProfile: input.credentialProfile ?? null,
    instanceName: input.instanceName ?? null,
    mode: "noop",
    open: input.open ?? false,
  };
}

export async function saveSiteProject(
  input: { check?: boolean; projectPath?: string; source?: string | null },
  dependencies: Pick<FormlessCliDependencies, "cwd" | "fetch"> = nodeFormlessCliDependencies(),
): Promise<SaveSiteProjectResult> {
  return saveSiteProjectCommand(input, dependencies);
}

export async function setupSiteProjectDeploy(
  input: {
    accountId?: string | null;
    adminToken?: string | null;
    createBucket?: boolean;
    mediaBucket: string;
    projectPath?: string;
    publishUrl: string;
    uploadSecret?: boolean;
    workerName: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "randomToken" | "runCommand" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<SetupSiteProjectDeployResult> {
  return setupSiteProjectDeployCommand(input, dependencies);
}

export async function publishSiteProject(
  input: {
    code?: boolean | "if-stale";
    dryRun?: boolean;
    projectPath?: string;
    yes?: boolean;
  },
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
): Promise<PublishSiteProjectResult> {
  return publishSiteProjectCommand(input, dependencies);
}

export async function startSiteProjectLocalPublishBroker(
  input: { projectPath: string; source: () => string | null },
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
): Promise<SiteProjectLocalPublishBroker> {
  return startSiteProjectLocalPublishBrokerCommand(input, dependencies);
}

function runCommandWithSpawn(
  spawn: typeof nodeSpawn,
  command: string,
  args: string[],
  options: FormlessCliRunCommandOptions,
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

function nodeFormlessCliDependencies(): FormlessCliDependencies {
  const spawn = nodeSpawn;

  return {
    cwd: process.cwd(),
    env: process.env,
    fetch,
    log: (message) => console.log(message),
    now: () => new Date().toISOString(),
    packageRoot: resolvePackageRoot(path.dirname(fileURLToPath(import.meta.url))),
    randomToken: () => randomBytes(32).toString("base64url"),
    runCommand: (command, args, options) => runCommandWithSpawn(spawn, command, args, options),
    spawn,
  };
}

function resolvePackageRoot(startDirectory: string): string {
  let directory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(directory, "package.json"))) {
      return directory;
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(`Could not resolve Formless package root from ${startDirectory}.`);
    }

    directory = parent;
  }
}
