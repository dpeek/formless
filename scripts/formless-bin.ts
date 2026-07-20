#!/usr/bin/env bun
import { runFormlessCli } from "../src/cli/cli.ts";

runFormlessCli(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
