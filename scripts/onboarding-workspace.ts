#!/usr/bin/env bun
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(scriptPath), "..");
const onboardingWorkspaceRoot = path.join(packageRoot, "instances", "onboarding");

const generatedPaths = [
  ".alchemy",
  ".env",
  ".formless",
  "archives",
  "formless.json",
  "media",
  "records",
];

async function resetOnboardingWorkspace() {
  await mkdir(onboardingWorkspaceRoot, { recursive: true });
  await Promise.all(
    generatedPaths.map((relativePath) =>
      rm(path.join(onboardingWorkspaceRoot, relativePath), { force: true, recursive: true }),
    ),
  );
  console.log(`Onboarding workspace reset: ${path.relative(packageRoot, onboardingWorkspaceRoot)}`);
}

async function main() {
  const command = process.argv[2] ?? "reset";

  switch (command) {
    case "reset":
      await resetOnboardingWorkspace();
      break;
    default:
      throw new Error(`Unsupported onboarding workspace command "${command}". Use "reset".`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
