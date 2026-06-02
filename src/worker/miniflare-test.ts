import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

type DispatchFetchInit = Parameters<Miniflare["dispatchFetch"]>[1];
type ServiceBindingHandler = (request: Request) => Promise<Response> | Response;

type DurableObjectBindings = Record<
  string,
  {
    className: string;
    useSQLite: true;
  }
>;

type WorkerHarnessOptions = {
  bindings?: Record<string, string>;
  compatibilityDate?: string;
  r2Buckets?: string[];
  serviceBindings?: Record<string, ServiceBindingHandler>;
};

export async function createWorkerHarness(
  entryPoint: string,
  durableObjects: DurableObjectBindings,
  options: WorkerHarnessOptions = {},
) {
  const tempDir = await mkdtemp(join(tmpdir(), "formless-worker-test-"));
  const scriptPath = join(tempDir, "worker.mjs");

  await build({
    bundle: true,
    entryPoints: [resolve(entryPoint)],
    external: ["cloudflare:workers"],
    format: "esm",
    loader: { ".wasm": "copy" },
    outfile: scriptPath,
    platform: "browser",
  });

  const mf = new Miniflare({
    bindings: options.bindings,
    compatibilityDate: options.compatibilityDate,
    durableObjects,
    durableObjectsPersist: false,
    modules: true,
    modulesRoot: tempDir,
    modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
    r2Buckets: options.r2Buckets,
    r2Persist: false,
    scriptPath,
    serviceBindings: options.serviceBindings,
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
