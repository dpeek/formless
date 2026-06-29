import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  resolveWorkspaceSitePublicRendererEntrypointsFromEnv,
  sitePublicRendererWorkerVirtualModulesPlugin,
  sitePublicRendererVirtualModuleCode,
} from "./runtime-extension-bundler.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
  SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY,
} from "../shared/workspace-runtime-extensions.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("workspace Site public renderer bundler resolution", () => {
  it("resolves browser and Worker renderer entrypoints from workspace-relative custom renderer config", async () => {
    const workspaceRoot = await makeTempDir();
    const browserEntrypoint = "renderers/site-public.browser.tsx";
    const workerEntrypoint = "renderers/site-public.worker.tsx";

    await writeCustomRendererFixture(workspaceRoot, browserEntrypoint, workerEntrypoint);

    const resolved = resolveWorkspaceSitePublicRendererEntrypointsFromEnv({
      [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]: workspaceRoot,
      [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]: JSON.stringify({
        [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
          browser: browserEntrypoint,
          worker: workerEntrypoint,
        },
      }),
    });

    expect(resolved).toEqual({
      browser: path.join(workspaceRoot, browserEntrypoint),
      worker: path.join(workspaceRoot, workerEntrypoint),
    });
  });

  it("keeps browser and Worker virtual modules on separate custom renderer entrypoints", () => {
    const browserModule = sitePublicRendererVirtualModuleCode("browser", true);
    const workerModule = sitePublicRendererVirtualModuleCode("worker", true);

    expect(browserModule).toContain(SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID);
    expect(browserModule).not.toContain(SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID);
    expect(workerModule).toContain(SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID);
    expect(workerModule).not.toContain(SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID);
  });

  it("falls back to the bundled renderer when no custom renderer is configured", () => {
    expect(resolveWorkspaceSitePublicRendererEntrypointsFromEnv({})).toBeUndefined();
    expect(sitePublicRendererVirtualModuleCode("browser", false)).toBe(
      "export const sitePublicRenderer = undefined;\n",
    );
    expect(sitePublicRendererVirtualModuleCode("worker", false)).toBe(
      "export const sitePublicRenderer = undefined;\n",
    );
  });

  it("resolves the Worker virtual module to the default renderer for esbuild bundles", async () => {
    const result = await build({
      bundle: true,
      format: "esm",
      logLevel: "silent",
      plugins: [sitePublicRendererWorkerVirtualModulesPlugin({ env: {} })],
      stdin: {
        contents: `import { sitePublicRenderer } from ${JSON.stringify(SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID)};
export const fallbackRenderer = sitePublicRenderer;
`,
        sourcefile: "entry.js",
      },
      write: false,
    });
    const output = result.outputFiles[0]?.text ?? "";

    expect(result.warnings).toHaveLength(0);
    expect(output).toContain("sitePublicRenderer = void 0");
    expect(output).toContain("fallbackRenderer");
  });

  it("resolves the Worker virtual module to the configured Worker entrypoint for esbuild bundles", async () => {
    const workspaceRoot = await makeTempDir();
    const browserEntrypoint = "renderers/site-public.browser.tsx";
    const workerEntrypoint = "renderers/site-public.worker.tsx";
    const env: NodeJS.ProcessEnv = {
      [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]: workspaceRoot,
      [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]: JSON.stringify({
        [SITE_PUBLIC_RENDERER_RUNTIME_EXTENSION_KEY]: {
          browser: browserEntrypoint,
          worker: workerEntrypoint,
        },
      }),
    };

    await writeCustomRendererFixture(workspaceRoot, browserEntrypoint, workerEntrypoint);

    const result = await build({
      bundle: true,
      format: "esm",
      logLevel: "silent",
      plugins: [sitePublicRendererWorkerVirtualModulesPlugin({ env })],
      stdin: {
        contents: `import { sitePublicRenderer } from ${JSON.stringify(SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID)};
export const rendered = sitePublicRenderer();
`,
        sourcefile: "entry.js",
      },
      write: false,
    });
    const output = result.outputFiles[0]?.text ?? "";

    expect(result.warnings).toHaveLength(0);
    expect(output).toContain("worker renderer");
    expect(output).toContain("rendered");
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-renderer-bundler-"));

  tempDirs.push(tempDir);

  return tempDir;
}

async function writeCustomRendererFixture(
  workspaceRoot: string,
  browserEntrypoint: string,
  workerEntrypoint: string,
) {
  await writeRendererModule(
    path.join(workspaceRoot, browserEntrypoint),
    'export default function SitePublicRenderer() { return "browser renderer"; }\n',
  );
  await writeRendererModule(
    path.join(workspaceRoot, workerEntrypoint),
    'export default function SitePublicRenderer() { return "worker renderer"; }\n',
  );
}

async function writeRendererModule(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
