import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  resolveWorkspaceSitePublicRendererEntrypointsFromEnv,
  sitePublicRendererVirtualModuleCode,
} from "../../vite.config.ts";
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
    const browserEntrypoint = "src/site/public-renderer.browser.tsx";
    const workerEntrypoint = "src/site/public-renderer.worker.tsx";

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
