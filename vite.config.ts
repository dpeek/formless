import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare, type PluginConfig, type WorkerConfig } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type PluginOption } from "vite-plus";
import { defaultExclude as defaultTestExclude } from "vite-plus/test/config";
import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
} from "./src/shared/instance-auth.ts";
import {
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "./src/shared/turnstile-config.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import { FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME } from "./src/shared/workspace-runtime-packages.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "./src/shared/workspace-runtime-extensions.ts";
import {
  resolveWorkspaceSitePublicRendererEntrypointsFromEnv,
  sitePublicRendererVirtualModuleCode,
  type SitePublicRendererResolvedEntrypoints,
} from "./src/cli/runtime-extension-bundler.ts";

export {
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "./src/shared/workspace-runtime-extensions.ts";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);
const siteProjectRoot = process.env[FORMLESS_SITE_PROJECT_ROOT_ENV_NAME];
const wranglerPersistPath = process.env.FORMLESS_WRANGLER_PERSIST;
const workspaceAppPackages = process.env[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]?.trim();
const workerRuntimeVars = runtimeWorkerVars(process.env);
const ignoredScratchGlobs = [".agents/**"];
const serverFsAllow = [
  packageRoot,
  ...(installedNodeModulesRoot ? [installedNodeModulesRoot] : []),
  ...(siteProjectRoot ? [siteProjectRoot] : []),
];
const cloudflarePluginConfig: PluginConfig | undefined =
  wranglerPersistPath || Object.keys(workerRuntimeVars).length > 0
    ? {
        ...(wranglerPersistPath ? { persistState: { path: wranglerPersistPath } } : {}),
        ...(Object.keys(workerRuntimeVars).length > 0
          ? {
              config: (config: WorkerConfig): Partial<WorkerConfig> => ({
                vars: {
                  ...config.vars,
                  ...workerRuntimeVars,
                },
              }),
            }
          : {}),
      }
    : undefined;

// vite-plus bundles its own Vite core, while third-party plugins type against public "vite".
const publicVitePlugins = (plugins: unknown[]): PluginOption[] => plugins as PluginOption[];

export default defineConfig({
  environments: {
    client: {
      build: {
        manifest: "assets/formless-client-manifest.json",
        rollupOptions: {
          input: {
            app: path.resolve(packageRoot, "index.html"),
            "public-site": path.resolve(packageRoot, "src/public-site-main.tsx"),
          },
          output: {
            manualChunks: clientManualChunks,
          },
        },
      },
    },
  },
  define: {
    __FORMLESS_WORKSPACE_APP_PACKAGES_JSON__: JSON.stringify(workspaceAppPackages ?? ""),
  },
  plugins: [
    formlessWorkspaceRuntimeExtensionsPlugin({ env: process.env }),
    floatingUiReactImportInteropPlugin(),
    ...publicVitePlugins(react()),
    ...publicVitePlugins(tailwindcss()),
    ...(process.env.VITEST ? [] : publicVitePlugins(cloudflare(cloudflarePluginConfig))),
  ],
  server: {
    fs: {
      allow: serverFsAllow,
    },
  },
  fmt: { ignorePatterns: ignoredScratchGlobs },
  lint: { ignorePatterns: ignoredScratchGlobs, options: { typeAware: true, typeCheck: true } },
  test: {
    exclude: [...defaultTestExclude, ...ignoredScratchGlobs],
    cache: false,
    reporters: ["minimal"],
    server: {
      deps: {
        inline: ["vite-plus"],
      },
    },
  },
  run: {
    cache: {
      scripts: true,
    },
  },
});

function packageInstallNodeModulesRoot(root: string): string | null {
  const scopeRoot = path.dirname(root);
  const nodeModulesRoot = path.dirname(scopeRoot);

  return path.basename(scopeRoot) === "@dpeek" && path.basename(nodeModulesRoot) === "node_modules"
    ? nodeModulesRoot
    : null;
}

function runtimeWorkerVars(env: NodeJS.ProcessEnv): Record<string, string> {
  return {
    ...optionalWorkerVar("FORMLESS_ADMIN_TOKEN", env.FORMLESS_ADMIN_TOKEN),
    ...optionalWorkerVar("FORMLESS_LAUNCH_FIXTURE", env.FORMLESS_LAUNCH_FIXTURE),
    ...optionalWorkerVar("FORMLESS_OWNER_SESSION_SECRET", env.FORMLESS_OWNER_SESSION_SECRET),
    ...optionalWorkerVar("FORMLESS_RUNTIME_PROFILE", env.FORMLESS_RUNTIME_PROFILE),
    ...optionalWorkerVar(LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV, env[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
      env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME],
    ),
    ...optionalWorkerVar(
      FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
      env[FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME],
    ),
    ...optionalWorkerVar(
      WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
      env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV],
    ),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_CSRF_TOKEN_ENV, env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_SIDECAR_URL_ENV, env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]),
    ...optionalWorkerVar(WORKSPACE_GATEWAY_PROXY_TOKEN_ENV, env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]),
  };
}

function optionalWorkerVar(name: string, value: string | undefined): Record<string, string> {
  return value && value.length > 0 ? { [name]: value } : {};
}

export function clientManualChunks(id: string): string | undefined {
  // Rolldown can orphan Floating UI's React namespace imports when its React adapter is
  // folded into generated field editor chunks. Keep that adapter family together.
  return id.includes("@floating-ui/") ? "floating-ui" : undefined;
}

export function floatingUiReactImportInteropPlugin(): Plugin {
  return {
    name: "formless-floating-ui-react-import-interop",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (
          output.type !== "chunk" ||
          !Object.keys(output.modules).some((id) => floatingUiReactPatchKind(id) === "react")
        ) {
          continue;
        }

        output.code = floatingUiReactImportInteropCode(output.code);
      }
    },
  };
}

type FloatingUiReactPatchKind = "react" | "react-dom";

export function floatingUiReactPatchKind(id: string): FloatingUiReactPatchKind | undefined {
  if (
    id.includes("/@floating-ui/react/dist/floating-ui.react.mjs") ||
    id.includes("/@floating-ui/react/dist/floating-ui.react.esm.js")
  ) {
    return "react";
  }

  if (
    id.includes("/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs") ||
    id.includes("/@floating-ui/react-dom/dist/floating-ui.react-dom.esm.js")
  ) {
    return "react-dom";
  }

  return undefined;
}

export function floatingUiReactImportInteropCode(code: string): string {
  const unminifiedBoundary = "require_react();\nrequire_react_dom();";

  if (
    code.includes(unminifiedBoundary) &&
    code.includes("var SafeReact = { ...React };") &&
    !code.includes("var React = require_react();")
  ) {
    return code.replace(
      unminifiedBoundary,
      `${unminifiedBoundary}
var React = require_react();
var ReactDOM = require_react_dom();
var useLayoutEffect = React.useLayoutEffect;
var useEffect = React.useEffect;`,
    );
  }

  const minifiedBoundary =
    /([A-Za-z_$][\w$]*)\(\),([A-Za-z_$][\w$]*)\(\);(?=var [A-Za-z_$][\w$]*=\([^=]*?=>\{let [A-Za-z_$][\w$]*=)/;

  if (code.includes("{...React}") && minifiedBoundary.test(code)) {
    return code.replace(
      minifiedBoundary,
      (_, requireReact: string, requireReactDom: string) =>
        `${requireReact}(),${requireReactDom}();var React=${requireReact}(),ReactDOM=${requireReactDom}(),useLayoutEffect=React.useLayoutEffect,useEffect=React.useEffect;`,
    );
  }

  return code;
}

export function formlessWorkspaceRuntimeExtensionsPlugin(
  input: {
    env?: NodeJS.ProcessEnv;
    renderer?: SitePublicRendererResolvedEntrypoints;
  } = {},
): Plugin {
  const renderer =
    input.renderer ??
    resolveWorkspaceSitePublicRendererEntrypointsFromEnv(input.env ?? process.env);

  return {
    name: "formless-workspace-runtime-extensions",
    resolveId(id) {
      if (
        id === SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID ||
        id === SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID
      ) {
        return resolvedVirtualModuleId(id);
      }

      if (id === SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID) {
        return renderer?.browser;
      }

      if (id === SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID) {
        return renderer?.worker;
      }

      return undefined;
    },
    load(id) {
      if (id === resolvedVirtualModuleId(SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID)) {
        return sitePublicRendererVirtualModuleCode("browser", renderer !== undefined);
      }

      if (id === resolvedVirtualModuleId(SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID)) {
        return sitePublicRendererVirtualModuleCode("worker", renderer !== undefined);
      }

      return undefined;
    },
  };
}

function resolvedVirtualModuleId(id: string): string {
  return `\0${id}`;
}
