import path from "node:path";
import { fileURLToPath } from "node:url";

import { astryxStylex } from "@astryxdesign/build/vite";
import { cloudflare, type PluginConfig, type WorkerConfig } from "@cloudflare/vite-plugin";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { type Plugin, type PluginOption } from "vite-plus";
import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
} from "../shared/instance-auth.ts";
import {
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "../shared/turnstile-config.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import { FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME } from "../shared/workspace-runtime-packages.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "../shared/workspace-runtime-extensions.ts";
import {
  resolveWorkspaceSitePublicRendererEntrypointsFromEnv,
  sitePublicRendererVirtualModuleCode,
  type SitePublicRendererResolvedEntrypoints,
} from "../cli/runtime-extension-bundler.ts";

export {
  SITE_PUBLIC_RENDERER_BROWSER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_BROWSER_VIRTUAL_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_ENTRYPOINT_MODULE_ID,
  SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID,
} from "../shared/workspace-runtime-extensions.ts";

type RuntimeViteConfigInput = {
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  workspaceRoot?: string;
};

const defaultPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerConfigRelativePath = "src/worker/wrangler.jsonc";
const astryxWorkerSourcePackages = ["@astryxdesign/core", "@astryxdesign/theme-neutral"] as const;
const astryxWorkerOptimizedDependencies = ["react/jsx-runtime"] as const;

// vite-plus bundles its own Vite core, while third-party plugins type against public "vite".
const publicVitePlugins = (plugins: unknown[]): PluginOption[] => plugins as PluginOption[];

export function runtimeViteConfig(input: RuntimeViteConfigInput = {}) {
  const env = input.env ?? process.env;
  const packageRoot = input.packageRoot ?? defaultPackageRoot;
  const workspaceRoot = input.workspaceRoot ?? workspaceRootForPackageRoot(packageRoot);
  const isUnitTest = env.VITEST === "true" && env.NODE_ENV !== "production";
  const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);
  const siteProjectRoot = env[FORMLESS_SITE_PROJECT_ROOT_ENV_NAME];
  const workspaceAppPackages = env[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]?.trim();
  const serverFsAllow = [
    packageRoot,
    ...(workspaceRoot === packageRoot ? [] : [workspaceRoot]),
    ...(installedNodeModulesRoot ? [installedNodeModulesRoot] : []),
    ...(siteProjectRoot ? [siteProjectRoot] : []),
  ];
  const cloudflarePluginConfig = runtimeCloudflarePluginConfig({ env, packageRoot });
  const astryxStylexOptions = {
    dev: env.NODE_ENV !== "production",
    rootDir: workspaceRoot,
  };
  const astryxPlugins = astryxStylex(astryxStylexOptions)
    .filter((plugin) => plugin.name !== "astryx-config")
    .map((plugin) =>
      plugin.name === "@stylexjs/unplugin"
        ? serializePluginTransform(
            stylex.vite({
              ...astryxStylexOptions,
              enableInlinedConditionalMerge: true,
              runtimeInjection: false,
              treeshakeCompensation: true,
              unstable_moduleResolution: {
                rootDir: workspaceRoot,
                type: "commonJS",
              },
              useCSSLayers: true,
            }),
          )
        : plugin,
    );
  const activeAstryxPlugins = isUnitTest
    ? astryxPlugins.filter((plugin) => plugin.name === "astryx-config")
    : astryxPlugins;

  return {
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
      formlessWorkspaceRuntimeExtensionsPlugin({ env }),
      floatingUiReactImportNormalizePlugin(),
      floatingUiReactImportInteropPlugin(),
      ...publicVitePlugins(activeAstryxPlugins),
      ...publicVitePlugins(react()),
      ...(env.VITEST
        ? []
        : [
            ...publicVitePlugins(cloudflare(cloudflarePluginConfig)),
            astryxCloudflareWorkerSourceCompilationPlugin(),
          ]),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      ...(isUnitTest
        ? {
            alias: {
              "@stylexjs/stylex": path.resolve(packageRoot, "src/test/stylex.ts"),
            },
          }
        : {}),
    },
    server: {
      fs: {
        allow: serverFsAllow,
      },
    },
  };
}

function serializePluginTransform(plugin: Plugin): Plugin {
  const transform = plugin.transform;

  if (typeof transform !== "function") {
    return plugin;
  }

  let pending = Promise.resolve();

  return {
    ...plugin,
    transform(...args: Parameters<typeof transform>) {
      const result = pending.then(() => transform.apply(this, args));

      pending = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
}

export function astryxCloudflareWorkerSourceCompilationPlugin(): Plugin {
  return {
    name: "formless-astryx-cloudflare-worker-source-compilation",
    configEnvironment(name) {
      if (name === "client") {
        return;
      }

      return {
        optimizeDeps: {
          exclude: [...astryxWorkerSourcePackages],
          include: [...astryxWorkerOptimizedDependencies],
        },
      };
    },
  };
}

export function packageInstallNodeModulesRoot(root: string): string | null {
  const scopeRoot = path.dirname(root);
  const nodeModulesRoot = path.dirname(scopeRoot);

  return path.basename(scopeRoot) === "@dpeek" && path.basename(nodeModulesRoot) === "node_modules"
    ? nodeModulesRoot
    : null;
}

export function workspaceRootForPackageRoot(packageRoot: string): string {
  const installedNodeModulesRoot = packageInstallNodeModulesRoot(packageRoot);

  if (installedNodeModulesRoot) {
    return path.dirname(installedNodeModulesRoot);
  }

  return path.basename(path.dirname(packageRoot)) === "lib"
    ? path.resolve(packageRoot, "../..")
    : packageRoot;
}

export function runtimeWorkerConfigPath(packageRoot = defaultPackageRoot): string {
  return path.resolve(packageRoot, workerConfigRelativePath);
}

export function runtimeCloudflarePluginConfig(input: RuntimeViteConfigInput = {}): PluginConfig {
  const env = input.env ?? process.env;
  const packageRoot = input.packageRoot ?? defaultPackageRoot;
  const wranglerPersistPath = env.FORMLESS_WRANGLER_PERSIST;
  const workerRuntimeVars = runtimeWorkerVars(env);

  return {
    configPath: runtimeWorkerConfigPath(packageRoot),
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
  };
}

export function runtimeWorkerVars(env: NodeJS.ProcessEnv): Record<string, string> {
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
  // Rolldown can orphan Floating UI's React namespace and DOM helper imports when its
  // React adapter is folded into generated field editor chunks. Keep that adapter
  // family together.
  return id.includes("@floating-ui/") ? "floating-ui" : undefined;
}

export function floatingUiReactImportNormalizePlugin(): Plugin {
  return {
    name: "formless-floating-ui-react-import-normalize",
    apply: "build",
    transform(code, id) {
      if (floatingUiReactPatchKind(id) !== "react") {
        return;
      }

      const nextCode = floatingUiReactImportNormalizeCode(code);
      return nextCode === code ? undefined : { code: nextCode, map: null };
    },
  };
}

export function floatingUiReactImportNormalizeCode(code: string): string {
  const reactDomImport =
    "import { getOverflowAncestors, useFloating as useFloating$1, offset, detectOverflow } from '@floating-ui/react-dom';";

  if (!code.includes(reactDomImport)) {
    return code;
  }

  return code
    .replace(
      reactDomImport,
      `import { computePosition, getOverflowAncestors, offset, detectOverflow } from '@floating-ui/react-dom';
${floatingUiReactDomUseFloatingShimCode()}`,
    )
    .replaceAll("useFloating$1", "floatingUiReactDomUseFloating");
}

function floatingUiReactDomUseFloatingShimCode(): string {
  return `const formlessFloatingNoop = () => {};
const formlessFloatingUseLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : formlessFloatingNoop;

function formlessFloatingDeepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a === "function" && a.toString() === b.toString()) {
    return true;
  }

  let length;
  let index;
  let keys;

  if (a && b && typeof a === "object") {
    if (Array.isArray(a)) {
      length = a.length;
      if (length !== b.length) {
        return false;
      }

      for (index = length; index-- !== 0;) {
        if (!formlessFloatingDeepEqual(a[index], b[index])) {
          return false;
        }
      }

      return true;
    }

    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) {
      return false;
    }

    for (index = length; index-- !== 0;) {
      if (!{}.hasOwnProperty.call(b, keys[index])) {
        return false;
      }
    }

    for (index = length; index-- !== 0;) {
      const key = keys[index];
      if (key === "_owner" && a["$" + "$typeof"]) {
        continue;
      }

      if (!formlessFloatingDeepEqual(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  return a !== a && b !== b;
}

function formlessFloatingGetDpr(element) {
  if (typeof window === "undefined") {
    return 1;
  }

  const win = element.ownerDocument.defaultView || window;
  return win.devicePixelRatio || 1;
}

function formlessFloatingRoundByDpr(element, value) {
  const dpr = formlessFloatingGetDpr(element);
  return Math.round(value * dpr) / dpr;
}

function formlessFloatingUseLatestRef(value) {
  const ref = React.useRef(value);
  formlessFloatingUseLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

function floatingUiReactDomUseFloating(options) {
  if (options === void 0) {
    options = {};
  }

  const {
    placement = "bottom",
    strategy = "absolute",
    middleware = [],
    platform,
    elements: { reference: externalReference, floating: externalFloating } = {},
    transform = true,
    whileElementsMounted,
    open,
  } = options;
  const [data, setData] = React.useState({
    x: 0,
    y: 0,
    strategy,
    placement,
    middlewareData: {},
    isPositioned: false,
  });
  const [latestMiddleware, setLatestMiddleware] = React.useState(middleware);

  if (!formlessFloatingDeepEqual(latestMiddleware, middleware)) {
    setLatestMiddleware(middleware);
  }

  const [_reference, _setReference] = React.useState(null);
  const [_floating, _setFloating] = React.useState(null);
  const referenceRef = React.useRef(null);
  const floatingRef = React.useRef(null);
  const dataRef = React.useRef(data);
  const setReference = React.useCallback((node) => {
    if (node !== referenceRef.current) {
      referenceRef.current = node;
      _setReference(node);
    }
  }, []);
  const setFloating = React.useCallback((node) => {
    if (node !== floatingRef.current) {
      floatingRef.current = node;
      _setFloating(node);
    }
  }, []);
  const referenceEl = externalReference || _reference;
  const floatingEl = externalFloating || _floating;
  const hasWhileElementsMounted = whileElementsMounted != null;
  const whileElementsMountedRef = formlessFloatingUseLatestRef(whileElementsMounted);
  const platformRef = formlessFloatingUseLatestRef(platform);
  const openRef = formlessFloatingUseLatestRef(open);
  const isMountedRef = React.useRef(false);
  const update = React.useCallback(() => {
    if (!referenceRef.current || !floatingRef.current) {
      return;
    }

    const config = {
      placement,
      strategy,
      middleware: latestMiddleware,
    };

    if (platformRef.current) {
      config.platform = platformRef.current;
    }

    computePosition(referenceRef.current, floatingRef.current, config).then((nextData) => {
      const fullData = {
        ...nextData,
        isPositioned: openRef.current !== false,
      };

      if (isMountedRef.current && !formlessFloatingDeepEqual(dataRef.current, fullData)) {
        dataRef.current = fullData;
        ReactDOM.flushSync(() => {
          setData(fullData);
        });
      }
    });
  }, [latestMiddleware, placement, strategy, platformRef, openRef]);

  formlessFloatingUseLayoutEffect(() => {
    if (open === false && dataRef.current.isPositioned) {
      dataRef.current.isPositioned = false;
      setData((currentData) => ({
        ...currentData,
        isPositioned: false,
      }));
    }
  }, [open]);

  formlessFloatingUseLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  formlessFloatingUseLayoutEffect(() => {
    if (referenceEl) {
      referenceRef.current = referenceEl;
    }

    if (floatingEl) {
      floatingRef.current = floatingEl;
    }

    if (referenceEl && floatingEl) {
      if (whileElementsMountedRef.current) {
        return whileElementsMountedRef.current(referenceEl, floatingEl, update);
      }

      update();
    }
  }, [referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted]);

  const refs = React.useMemo(() => ({
    reference: referenceRef,
    floating: floatingRef,
    setReference,
    setFloating,
  }), [setReference, setFloating]);
  const elements = React.useMemo(() => ({
    reference: referenceEl,
    floating: floatingEl,
  }), [referenceEl, floatingEl]);
  const floatingStyles = React.useMemo(() => {
    const initialStyles = {
      position: strategy,
      left: 0,
      top: 0,
    };

    if (!elements.floating) {
      return initialStyles;
    }

    const x = formlessFloatingRoundByDpr(elements.floating, data.x);
    const y = formlessFloatingRoundByDpr(elements.floating, data.y);

    if (transform) {
      return {
        ...initialStyles,
        transform: "translate(" + x + "px, " + y + "px)",
        ...(formlessFloatingGetDpr(elements.floating) >= 1.5 && {
          willChange: "transform",
        }),
      };
    }

    return {
      position: strategy,
      left: x,
      top: y,
    };
  }, [strategy, transform, elements.floating, data.x, data.y]);

  return React.useMemo(() => ({
    ...data,
    update,
    refs,
    elements,
    floatingStyles,
  }), [data, update, refs, elements, floatingStyles]);
}`;
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
  const extraBindings = floatingUiReactExtraInteropBindingsCode(code);
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
var useEffect = React.useEffect;${extraBindings}`,
    );
  }

  const minifiedBoundary =
    /([A-Za-z_$][\w$]*)\(\),([A-Za-z_$][\w$]*)\(\);(?=var [A-Za-z_$][\w$]*=\([^=]*?=>\{let [A-Za-z_$][\w$]*=)/;

  if (code.includes("{...React}") && minifiedBoundary.test(code)) {
    return code.replace(
      minifiedBoundary,
      (_, requireReact: string, requireReactDom: string) =>
        `${requireReact}(),${requireReactDom}();var React=${requireReact}(),ReactDOM=${requireReactDom}(),useLayoutEffect=React.useLayoutEffect,useEffect=React.useEffect;${extraBindings}`,
    );
  }

  return code;
}

function floatingUiReactExtraInteropBindingsCode(code: string): string {
  return floatingUiReactNeedsIsElementBinding(code)
    ? `\nvar isElement=formlessFloatingIsElement;function formlessFloatingIsElement(value){if(typeof window==="undefined"){return false;}const win=(value==null?void 0:value.ownerDocument)==null?window:value.ownerDocument.defaultView||window;return value instanceof Element||value instanceof win.Element;}`
    : "";
}

function floatingUiReactNeedsIsElementBinding(code: string): boolean {
  return (
    /\bisElement\s*\(/.test(code) &&
    !/\b(?:function|var|let|const)\s+isElement\b/.test(code) &&
    !/\bisElement\s*=/.test(code)
  );
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
