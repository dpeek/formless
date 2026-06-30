import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import viteConfig, {
  clientManualChunks,
  floatingUiReactImportInteropCode,
} from "../../vite.config.ts";

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
};

describe("Vite config", () => {
  it("scopes client-only HTML entries to the client environment", () => {
    const config = viteConfig as ViteConfigWithEnvironments;
    const clientBuild = config.environments?.client?.build;

    expect(config.build).toBeUndefined();
    expect(clientBuild?.manifest).toBe("assets/formless-client-manifest.json");
    expect(clientBuild?.rollupOptions?.input).toEqual({
      app: resolve(repoRoot, "index.html"),
      "public-site": resolve(repoRoot, "src/public-site-main.tsx"),
    });
    expect(clientBuild?.rollupOptions?.output?.manualChunks).toBe(clientManualChunks);
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
    expect(clientManualChunks("/repo/src/app/generated/create-field-control.tsx")).toBeUndefined();
  });

  it("adds missing Floating UI React bindings to readable production chunks", () => {
    expect(
      floatingUiReactImportInteropCode(`var require_react = () => ReactRuntime;
var require_react_dom = () => ReactDomRuntime;
require_react();
require_react_dom();
var SafeReact = { ...React };
var index = typeof document !== "undefined" ? useLayoutEffect : useEffect;`),
    ).toContain(`require_react();
require_react_dom();
var React = require_react();
var ReactDOM = require_react_dom();
var useLayoutEffect = React.useLayoutEffect;
var useEffect = React.useEffect;
var SafeReact = { ...React };`);
  });

  it("adds missing Floating UI React bindings to minified production chunks", () => {
    expect(
      floatingUiReactImportInteropCode(
        "n(),i();var fe=(e,t)=>{let n=le(e);return{name:n.name}},he={...React},ge=he.useInsertionEffect||(()=>{});var $=typeof document<`u`?useLayoutEffect:useEffect;",
      ),
    ).toBe(
      "n(),i();var React=n(),ReactDOM=i(),useLayoutEffect=React.useLayoutEffect,useEffect=React.useEffect;var fe=(e,t)=>{let n=le(e);return{name:n.name}},he={...React},ge=he.useInsertionEffect||(()=>{});var $=typeof document<`u`?useLayoutEffect:useEffect;",
    );
  });
});
