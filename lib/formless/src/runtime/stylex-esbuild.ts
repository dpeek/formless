import { createRequire } from "node:module";

import type { Plugin } from "esbuild";
import stylexEsbuild from "@stylexjs/unplugin/esbuild";

const require = createRequire(import.meta.url);

export function astryxStylexWorkerBundlePlugin(rendererRoot: string): Plugin {
  const stylexOptions = {
    dev: false,
    runtimeInjection: false,
    treeshakeCompensation: true,
    unstable_moduleResolution: {
      rootDir: rendererRoot,
      type: "commonJS",
    },
  } as const;

  return stylexEsbuild({
    ...stylexOptions,
    useCSSLayers: true,
    babelConfig: {
      plugins: [
        [
          require.resolve("@astryxdesign/build/babel"),
          {
            ...stylexOptions,
            babelConfig: undefined,
            libraryPrefix: "astryx",
          },
        ],
      ],
    },
  } as never) as Plugin;
}
