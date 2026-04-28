import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

type DispatchFetchInit = Parameters<Miniflare["dispatchFetch"]>[1];

type DurableObjectBindings = Record<
  string,
  {
    className: string;
    useSQLite: true;
  }
>;

export async function createWorkerHarness(
  entryPoint: string,
  durableObjects: DurableObjectBindings,
) {
  const tempDir = await mkdtemp(resolve(".worker-test-"));
  const scriptPath = join(tempDir, "worker.mjs");

  await build({
    bundle: true,
    entryPoints: [resolve(entryPoint)],
    external: ["cloudflare:workers"],
    format: "esm",
    outfile: scriptPath,
    platform: "browser",
  });

  const mf = new Miniflare({
    durableObjects,
    durableObjectsPersist: false,
    modules: true,
    modulesRoot: process.cwd(),
    scriptPath,
  });

  return {
    mf,
    fetch: (path: string, init?: DispatchFetchInit) =>
      mf.dispatchFetch(`http://example.com${path}`, init),
    async dispose() {
      await mf.dispose();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
