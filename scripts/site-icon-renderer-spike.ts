import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { build } from "esbuild";
import { Miniflare } from "miniflare";

const execFileAsync = promisify(execFile);

const compatibilityDate = "2026-04-28";
const maxFreeWorkerUploadKiB = 3 * 1024;
const maxStartupBudgetMs = 1_000;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const workerSource = `import { Resvg, initResvg } from "@cf-wasm/resvg/workerd";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>';

export default {
  async fetch() {
    const startedAt = Date.now();
    await initResvg.ensure();
    const png = new Resvg(svg, {
      fitTo: { mode: "width", value: 16 },
      font: { loadSystemFonts: false },
    }).render().asPng();

    return Response.json({
      ready: initResvg.ready,
      renderMs: Date.now() - startedAt,
      pngBytes: png.length,
      signature: Array.from(png.slice(0, 8)),
    });
  },
};
`;

type WranglerMetafile = {
  outputs: Record<
    string,
    {
      bytes?: number;
      imports?: Array<{ path: string; external?: boolean }>;
    }
  >;
};

type ProbeResponse = {
  ready: boolean;
  renderMs: number;
  pngBytes: number;
  signature: number[];
};

await mkdir(resolve("tmp"), { recursive: true });
const tempRoot = await mkdtemp(resolve("tmp/ssi-05-resvg-spike-"));

try {
  const wranglerResult = await runWranglerProbe(tempRoot);
  const miniflareResult = await runMiniflareProbe(tempRoot);
  const packageFacts = await readPackageFacts();
  const result = {
    package: packageFacts,
    wrangler: wranglerResult,
    miniflare: miniflareResult,
  };

  assertProbe(result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function runWranglerProbe(tempRoot: string) {
  const wranglerRoot = join(tempRoot, "wrangler");
  const outDir = join(wranglerRoot, "out");
  const workerPath = join(wranglerRoot, "worker.ts");
  const configPath = join(wranglerRoot, "wrangler.jsonc");
  const metafilePath = join(outDir, "meta.json");

  await mkdir(outDir, { recursive: true });
  await writeFile(workerPath, workerSource);
  await writeFile(
    configPath,
    JSON.stringify(
      {
        name: "ssi-resvg-spike",
        main: "./worker.ts",
        compatibility_date: compatibilityDate,
      },
      null,
      2,
    ),
  );

  const { stdout } = await execFileAsync(process.execPath, [
    "x",
    "wrangler",
    "deploy",
    "--dry-run",
    "--config",
    configPath,
    "--outdir",
    outDir,
    "--metafile",
    metafilePath,
  ]);
  const upload = parseWranglerUpload(stdout);
  const metafile = JSON.parse(await readFile(metafilePath, "utf8")) as WranglerMetafile;
  const workerOutput = Object.entries(metafile.outputs).find(([path]) =>
    path.endsWith("/worker.js"),
  );
  const workerBytes = workerOutput?.[1].bytes ?? 0;
  const wasmImport = workerOutput?.[1].imports?.find((entry) => entry.path.endsWith(".wasm"));

  return {
    uploadKiB: upload.uploadKiB,
    gzipKiB: upload.gzipKiB,
    workerBytes,
    wasmImport: wasmImport?.path ?? null,
  };
}

async function runMiniflareProbe(tempRoot: string) {
  const runtimeRoot = join(tempRoot, "miniflare");
  const workerPath = join(runtimeRoot, "worker.mjs");

  await mkdir(runtimeRoot, { recursive: true });
  const buildStartedAt = performance.now();
  await build({
    bundle: true,
    stdin: {
      contents: workerSource,
      loader: "ts",
      resolveDir: process.cwd(),
      sourcefile: "worker.ts",
    },
    external: ["cloudflare:workers"],
    format: "esm",
    loader: { ".wasm": "copy" },
    outfile: workerPath,
    platform: "browser",
  });
  const buildMs = Math.round(performance.now() - buildStartedAt);
  const files = await fileSizes(runtimeRoot);

  const startedAt = performance.now();
  const mf = new Miniflare({
    compatibilityDate,
    modules: true,
    modulesRoot: runtimeRoot,
    modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
    scriptPath: workerPath,
  });
  const constructMs = Math.round(performance.now() - startedAt);

  const requestStartedAt = performance.now();
  const response = await mf.dispatchFetch("http://example.com/");
  const body = (await response.json()) as ProbeResponse;
  const firstRequestMs = Math.round(performance.now() - requestStartedAt);
  await mf.dispose();

  return {
    buildMs,
    constructMs,
    firstRequestMs,
    status: response.status,
    files,
    totalBytes: Object.values(files).reduce((sum, size) => sum + size, 0),
    response: body,
  };
}

async function readPackageFacts() {
  const packageJson = JSON.parse(
    await readFile(resolve("node_modules/@cf-wasm/resvg/package.json"), "utf8"),
  ) as { version: string; dependencies: Record<string, string> };
  const wasmPath = resolve("node_modules/@cf-wasm/resvg/dist/lib/resvg.wasm");

  return {
    name: "@cf-wasm/resvg",
    version: packageJson.version,
    resvgWasmDependency: packageJson.dependencies["@resvg/resvg-wasm"],
    workerdImport: "@cf-wasm/resvg/workerd",
    wasmBytes: (await stat(wasmPath)).size,
  };
}

async function fileSizes(dir: string) {
  const files = await readdir(dir);
  const sizes: Record<string, number> = {};

  for (const file of files) {
    sizes[file] = (await stat(join(dir, file))).size;
  }

  return sizes;
}

function parseWranglerUpload(stdout: string) {
  const match = stdout.match(/Total Upload:\s+([\d.]+) KiB \/ gzip:\s+([\d.]+) KiB/);

  if (!match) {
    throw new Error(`Could not parse Wrangler upload size from output:\n${stdout}`);
  }

  return {
    uploadKiB: Number(match[1]),
    gzipKiB: Number(match[2]),
  };
}

function assertProbe(result: {
  wrangler: Awaited<ReturnType<typeof runWranglerProbe>>;
  miniflare: Awaited<ReturnType<typeof runMiniflareProbe>>;
}) {
  if (result.wrangler.uploadKiB > maxFreeWorkerUploadKiB) {
    throw new Error(
      `Wrangler upload ${result.wrangler.uploadKiB} KiB exceeds ${maxFreeWorkerUploadKiB} KiB budget`,
    );
  }

  if (result.miniflare.firstRequestMs > maxStartupBudgetMs) {
    throw new Error(
      `First Miniflare request ${result.miniflare.firstRequestMs} ms exceeds ${maxStartupBudgetMs} ms budget`,
    );
  }

  if (result.miniflare.status !== 200 || !result.miniflare.response.ready) {
    throw new Error("Miniflare probe did not return a ready 200 response");
  }

  if (!sameBytes(result.miniflare.response.signature, pngSignature)) {
    throw new Error("Miniflare probe did not render a PNG response");
  }
}

function sameBytes(actual: number[], expected: number[]) {
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  );
}
