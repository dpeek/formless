import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const outfile = path.resolve("bin/formless.js");

await mkdir(path.dirname(outfile), { recursive: true });

await build({
  bundle: true,
  entryPoints: ["scripts/formless.ts"],
  format: "esm",
  outfile,
  platform: "node",
  target: "node20",
});

const output = await readFile(outfile, "utf8");
await writeFile(outfile, output.replace(/^#!\/usr\/bin\/env bun\n/, "#!/usr/bin/env node\n"));
await chmod(outfile, 0o755);
