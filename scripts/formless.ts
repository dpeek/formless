#!/usr/bin/env bun
import { pathToFileURL } from "node:url";

import { runFormlessCli } from "../src/site/cli.ts";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFormlessCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
