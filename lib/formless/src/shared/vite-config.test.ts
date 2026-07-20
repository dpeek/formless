import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import {
  astryxCloudflareWorkerSourceCompilationPlugin,
  clientManualChunks,
  floatingUiReactImportInteropCode,
  floatingUiReactImportNormalizeCode,
  runtimeCloudflarePluginConfig,
  runtimeViteConfig,
  runtimeWorkerConfigPath,
} from "../runtime/vite-config.ts";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

type ViteConfigBuild = {
  manifest?: unknown;
  rollupOptions?: {
    input?: unknown;
    output?: {
      manualChunks?: unknown;
    };
  };
};

type ViteConfigWithEnvironments = {
  build?: unknown;
  environments?: {
    client?: {
      build?: ViteConfigBuild;
    };
  };
  plugins?: unknown[];
  resolve?: {
    alias?: Record<string, string>;
  };
};

type WorkerConfigCustomizer = (config: {
  vars?: Record<string, string>;
}) => { vars?: Record<string, string> } | void;

describe("Runtime Vite config", () => {
  it("scopes client-only HTML entries to the client environment", () => {
    const config = runtimeViteConfig() as ViteConfigWithEnvironments;
    const clientBuild = config.environments?.client?.build;

    expect(config.build).toBeUndefined();
    expect(clientBuild?.manifest).toBe("assets/formless-client-manifest.json");
    expect(clientBuild?.rollupOptions?.input).toEqual({
      app: resolve(repoRoot, "index.html"),
      "public-site": resolve(repoRoot, "src/public-site-main.tsx"),
    });
    expect(clientBuild?.rollupOptions?.output?.manualChunks).toBe(clientManualChunks);
  });

  it("orders the supported Astryx StyleX integration before React and Cloudflare", () => {
    const developmentConfig = runtimeViteConfig({
      env: { NODE_ENV: "development" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;
    const productionConfig = runtimeViteConfig({
      env: { NODE_ENV: "production" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;
    const developmentPlugins = namedPlugins(developmentConfig.plugins);
    const productionPlugins = namedPlugins(productionConfig.plugins);

    expect(developmentPlugins).toEqual(productionPlugins);
    expect(developmentPlugins).toEqual(
      expect.arrayContaining([
        "formless-workspace-runtime-extensions",
        "formless-floating-ui-react-import-normalize",
        "formless-floating-ui-react-import-interop",
        "astryx-css-layer-order",
        "@stylexjs/unplugin",
        "astryx-split-layers",
        "vite:react-babel",
        "vite:react-refresh",
        "vite-plugin-cloudflare",
        "formless-astryx-cloudflare-worker-source-compilation",
      ]),
    );
    expect(developmentPlugins.indexOf("@stylexjs/unplugin")).toBeLessThan(
      developmentPlugins.indexOf("vite:react-babel"),
    );
    expect(developmentPlugins.indexOf("@stylexjs/unplugin")).toBeLessThan(
      developmentPlugins.indexOf("vite-plugin-cloudflare"),
    );
    expect(developmentPlugins.indexOf("vite-plugin-cloudflare")).toBeLessThan(
      developmentPlugins.indexOf("formless-astryx-cloudflare-worker-source-compilation"),
    );
  });

  it("shims StyleX without starting its Vite server integration in unit tests", () => {
    const testConfig = runtimeViteConfig({
      env: { NODE_ENV: "test", VITEST: "true" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;
    const productionBuildTestConfig = runtimeViteConfig({
      env: { NODE_ENV: "production", VITEST: "true" },
      packageRoot: repoRoot,
    }) as ViteConfigWithEnvironments;

    expect(namedPlugins(testConfig.plugins)).not.toContain("astryx-config");
    expect(namedPlugins(testConfig.plugins)).not.toContain("@stylexjs/unplugin");
    expect(namedPlugins(testConfig.plugins)).not.toContain("astryx-split-layers");
    expect(testConfig.resolve?.alias).toEqual({
      "@stylexjs/stylex": resolve(repoRoot, "src/test/stylex.ts"),
    });
    expect(namedPlugins(productionBuildTestConfig.plugins)).toContain("@stylexjs/unplugin");
    expect(productionBuildTestConfig.resolve?.alias).toBeUndefined();
  });

  it("keeps Astryx source out of Cloudflare Worker dependency optimization", async () => {
    const plugin = astryxCloudflareWorkerSourceCompilationPlugin();
    const configEnvironment = plugin.configEnvironment;

    if (typeof configEnvironment !== "function") {
      throw new Error("Expected Astryx Cloudflare Worker environment config.");
    }

    expect(
      await configEnvironment.call(
        {} as never,
        "client",
        {},
        {
          command: "serve",
          isSsrTargetWebworker: false,
          mode: "development",
        },
      ),
    ).toBeUndefined();
    expect(
      await configEnvironment.call(
        {} as never,
        "formless",
        {},
        {
          command: "serve",
          isSsrTargetWebworker: true,
          mode: "development",
        },
      ),
    ).toEqual({
      optimizeDeps: {
        exclude: ["@astryxdesign/core", "@astryxdesign/theme-neutral"],
        include: ["react/jsx-runtime"],
      },
    });
  });

  it("uses the Worker-owned Wrangler config and preserves runtime Cloudflare overrides", () => {
    const persistPath = resolve(repoRoot, "tmp/wrangler-state");
    const pluginConfig = runtimeCloudflarePluginConfig({
      env: {
        FORMLESS_ADMIN_TOKEN: "secret",
        FORMLESS_RUNTIME_PROFILE: "instance",
        FORMLESS_WRANGLER_PERSIST: persistPath,
      },
      packageRoot: repoRoot,
    });

    expect(runtimeWorkerConfigPath(repoRoot)).toBe(resolve(repoRoot, "src/worker/wrangler.jsonc"));
    expect(pluginConfig.configPath).toBe(resolve(repoRoot, "src/worker/wrangler.jsonc"));
    expect(pluginConfig.persistState).toEqual({ path: persistPath });
    expect(typeof pluginConfig.config).toBe("function");

    const configCustomizer = pluginConfig.config;
    if (typeof configCustomizer !== "function") {
      throw new Error("Expected runtime Cloudflare config customizer.");
    }

    expect((configCustomizer as WorkerConfigCustomizer)({ vars: { EXISTING: "1" } })).toEqual({
      vars: {
        EXISTING: "1",
        FORMLESS_ADMIN_TOKEN: "secret",
        FORMLESS_RUNTIME_PROFILE: "instance",
      },
    });
  });

  it("keeps Floating UI React adapter modules in one shared chunk", () => {
    expect(
      clientManualChunks(
        "/repo/node_modules/.bun/@floating-ui+react@0.26.28/node_modules/@floating-ui/react/dist/floating-ui.react.mjs",
      ),
    ).toBe("floating-ui");
    expect(
      clientManualChunks(
        "/repo/node_modules/.bun/@floating-ui+react-dom@2.1.8/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs",
      ),
    ).toBe("floating-ui");
    expect(
      clientManualChunks("/repo/src/app/generated/generated-workspace-runtime.tsx"),
    ).toBeUndefined();
  });

  it("inlines the Floating UI React DOM positioning hook before production bundling", () => {
    const transformed = floatingUiReactImportNormalizeCode(`
import { getOverflowAncestors, useFloating as useFloating$1, offset, detectOverflow } from '@floating-ui/react-dom';
function useFloating(options) {
  return useFloating$1(options);
}
`);

    expect(transformed).toContain(
      "import { computePosition, getOverflowAncestors, offset, detectOverflow } from '@floating-ui/react-dom';",
    );
    expect(transformed).toContain("function floatingUiReactDomUseFloating(options)");
    expect(transformed).toContain('a["$" + "$typeof"]');
    expect(transformed).toContain("const floatingStyles = React.useMemo");
    expect(transformed).toContain("return floatingUiReactDomUseFloating(options);");
    expect(transformed).not.toContain("useFloating$1");
  });

  it("adds missing Floating UI React bindings to readable production chunks", () => {
    expect(
      floatingUiReactImportInteropCode(`var require_react = () => ReactRuntime;
var require_react_dom = () => ReactDomRuntime;
require_react();
require_react_dom();
var SafeReact = { ...React };
var index = typeof document !== "undefined" ? useLayoutEffect : useEffect;
function setReference(node) {
  if (isElement(node) || node === null) {}
}`),
    ).toContain(`require_react();
require_react_dom();
var React = require_react();
var ReactDOM = require_react_dom();
var useLayoutEffect = React.useLayoutEffect;
var useEffect = React.useEffect;
var isElement=formlessFloatingIsElement;function formlessFloatingIsElement(value){if(typeof window==="undefined"){return false;}const win=(value==null?void 0:value.ownerDocument)==null?window:value.ownerDocument.defaultView||window;return value instanceof Element||value instanceof win.Element;}
var SafeReact = { ...React };`);
  });

  it("adds missing Floating UI React bindings to minified production chunks", () => {
    expect(
      floatingUiReactImportInteropCode(
        "n(),i();var fe=(e,t)=>{let n=le(e);return{name:n.name}},he={...React},ge=he.useInsertionEffect||(()=>{});var $=typeof document<`u`?useLayoutEffect:useEffect;function Ve(e){return isElement(e)}",
      ),
    ).toBe(
      'n(),i();var React=n(),ReactDOM=i(),useLayoutEffect=React.useLayoutEffect,useEffect=React.useEffect;\nvar isElement=formlessFloatingIsElement;function formlessFloatingIsElement(value){if(typeof window==="undefined"){return false;}const win=(value==null?void 0:value.ownerDocument)==null?window:value.ownerDocument.defaultView||window;return value instanceof Element||value instanceof win.Element;}var fe=(e,t)=>{let n=le(e);return{name:n.name}},he={...React},ge=he.useInsertionEffect||(()=>{});var $=typeof document<`u`?useLayoutEffect:useEffect;function Ve(e){return isElement(e)}',
    );
  });
});

function namedPlugins(plugins: unknown[] | undefined): string[] {
  return (plugins ?? [])
    .flat(Infinity)
    .map((plugin) =>
      typeof plugin === "object" && plugin !== null && "name" in plugin ? plugin.name : undefined,
    )
    .filter((name): name is string => typeof name === "string");
}
