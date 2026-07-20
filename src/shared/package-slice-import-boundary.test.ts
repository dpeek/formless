import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("package slice import boundaries", () => {
  it("keeps schema consumers on the public package root", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenSchemaPackageImport(specifier)) {
          failures.push(`${path}: deep-imports schema package ${specifier}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps archive consumers on public package subpaths", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenArchivePackageImport(specifier)) {
          failures.push(`${path}: deep-imports archive package ${specifier}`);
        }

        if (forbiddenArchivePackageInternalImport(filePath, specifier)) {
          failures.push(`${path}: imports archive package internal ${specifier}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps Site source consumers on package public exports", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenSitePackageImport(specifier)) {
          failures.push(`${path}: deep-imports Site app package ${specifier}`);
        }

        if (forbiddenRootSiteSourceImport(specifier)) {
          failures.push(`${path}: imports removed root Site source path ${specifier}`);
        }
      }
    }

    expect(await pathExists(resolve(repoRoot, "schema/apps/site"))).toBe(false);
    expect(failures).toEqual([]);
  });

  it("keeps CRM source consumers on package public exports", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenCrmPackageImport(specifier)) {
          failures.push(`${path}: deep-imports CRM app package ${specifier}`);
        }

        if (forbiddenRootCrmSourceImport(specifier)) {
          failures.push(`${path}: imports removed root CRM source path ${specifier}`);
        }
      }
    }

    expect(await pathExists(resolve(repoRoot, "schema/apps/crm"))).toBe(false);
    expect(failures).toEqual([]);
  });

  it("keeps Tasks source consumers on package public exports", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenTasksPackageImport(specifier)) {
          failures.push(`${path}: deep-imports Tasks app package ${specifier}`);
        }

        if (forbiddenRootTasksSourceImport(specifier)) {
          failures.push(`${path}: imports removed root Tasks source path ${specifier}`);
        }
      }
    }

    expect(await pathExists(resolve(repoRoot, "schema/apps/tasks"))).toBe(false);
    expect(failures).toEqual([]);
  });

  it("keeps Formless Renderer consumers on documented package exports", async () => {
    const failures: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      if (pathInside(filePath, resolve(repoRoot, "lib/renderer"))) {
        continue;
      }

      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenFormlessRendererImport(filePath, specifier)) {
          failures.push(`${path}: imports Formless Renderer through ${specifier}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps Presentation consumers on documented package exports", async () => {
    const failures: string[] = [];
    const presentationRoot = resolve(repoRoot, "lib/presentation");

    for (const filePath of await boundarySourceFiles()) {
      if (pathInside(filePath, presentationRoot)) {
        continue;
      }

      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (forbiddenFormlessPresentationImport(filePath, specifier)) {
          failures.push(`${path}: imports Presentation through ${specifier}`);
        }
      }
    }

    const rootPackage = await readPackageJson(resolve(repoRoot, "package.json"));
    const presentationPackage = await readPackageJson(resolve(presentationRoot, "package.json"));
    const rendererPackage = await readPackageJson(resolve(repoRoot, "lib/renderer/package.json"));

    expect(rootPackage.dependencies?.["@dpeek/formless-renderer"]).toBe("workspace:*");
    expect(rootPackage.dependencies?.["@dpeek/formless-presentation"]).toBe("workspace:*");
    expect(rendererPackage.name).toBe("@dpeek/formless-renderer");
    expect(rendererPackage.dependencies?.["@dpeek/formless-presentation"]).toBe("workspace:*");
    expect(presentationPackage.dependencies).toEqual({
      "@dpeek/formless-schema": "^0.1.0",
      react: "19.2.6",
    });
    expect(failures).toEqual([]);
  });

  it("keeps Renderer Site imports on exact documented package exports", async () => {
    const failures: string[] = [];
    const rendererRoot = resolve(repoRoot, "lib/renderer");
    const siteSourceRoot = resolve(repoRoot, "lib/site-app/src");
    const packageJson = JSON.parse(
      await readFile(resolve(rendererRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };

    for (const filePath of await sourceFiles(rendererRoot)) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (
          (specifier === "@dpeek/formless-site-app" ||
            specifier.startsWith("@dpeek/formless-site-app/")) &&
          !allowedRendererSitePackageImport(filePath, specifier)
        ) {
          failures.push(`${path}: imports Site through undocumented export ${specifier}`);
        }

        if (relativeImportResolvesInside(filePath, specifier, siteSourceRoot)) {
          failures.push(`${path}: imports private Site source ${specifier}`);
        }
      }
    }

    expect(packageJson.dependencies?.["@dpeek/formless-site-app"]).toBe("^0.1.0");
    expect(failures).toEqual([]);
  });

  it("keeps the Site package independent from Renderer and the Presentation host", async () => {
    const failures: string[] = [];
    const siteRoot = resolve(repoRoot, "lib/site-app");
    const rendererSourceRoot = resolve(repoRoot, "lib/renderer/src");
    const presentationSourceRoot = resolve(repoRoot, "lib/presentation/src");
    const packageJson = JSON.parse(
      await readFile(resolve(siteRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;

    for (const filePath of await sourceFiles(siteRoot)) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (
          specifier === "@dpeek/formless-renderer" ||
          specifier.startsWith("@dpeek/formless-renderer/") ||
          specifier === "@dpeek/formless-presentation" ||
          specifier.startsWith("@dpeek/formless-presentation/") ||
          relativeImportResolvesInside(filePath, specifier, rendererSourceRoot) ||
          relativeImportResolvesInside(filePath, specifier, presentationSourceRoot)
        ) {
          failures.push(`${path}: imports renderer presentation through ${specifier}`);
        }
      }
    }

    for (const dependencyGroup of ["dependencies", "devDependencies", "peerDependencies"]) {
      const dependencies = packageJson[dependencyGroup];

      if (
        typeof dependencies === "object" &&
        dependencies !== null &&
        ("@dpeek/formless-renderer" in dependencies ||
          "@dpeek/formless-presentation" in dependencies)
      ) {
        failures.push(
          `lib/site-app/package.json: declares ${dependencyGroup} on renderer presentation`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps Media contracts and adapters renderer-independent across generated and Renderer flows", async () => {
    const rendererRoot = resolve(repoRoot, "lib/renderer");
    const mediaRoot = resolve(repoRoot, "lib/media");
    const mediaSourceFailures: string[] = [];

    for (const filePath of await sourceFiles(resolve(mediaRoot, "src"))) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (
          specifier === "react" ||
          specifier.startsWith("react/") ||
          specifier.startsWith("react-dom/")
        ) {
          mediaSourceFailures.push(`${path}: imports renderer dependency ${specifier}`);
        }
      }
    }

    const unsupportedMediaImports: string[] = [];

    for (const filePath of await boundarySourceFiles()) {
      const source = await readFile(filePath, "utf8");
      const path = relative(repoRoot, filePath);

      for (const specifier of importSpecifiers(source)) {
        if (
          (specifier === "@dpeek/formless-media" ||
            specifier.startsWith("@dpeek/formless-media/")) &&
          !allowedMediaPackageImports.has(specifier)
        ) {
          unsupportedMediaImports.push(`${path}: imports unsupported Media subpath ${specifier}`);
        }
      }
    }

    const generatedProjectionImports = importSpecifiers(
      await readFile(resolve(repoRoot, "src/app/generated/formless-ui-projection.ts"), "utf8"),
    );
    const generatedRuntimeImports = importSpecifiers(
      await readFile(
        resolve(repoRoot, "src/app/generated/generated-workspace-runtime.tsx"),
        "utf8",
      ),
    );
    const rendererMediaFieldImports = importSpecifiers(
      await readFile(resolve(rendererRoot, "src/components/fields/media-field.tsx"), "utf8"),
    );
    const workerRuntimeImports = importSpecifiers(
      await readFile(resolve(repoRoot, "src/worker/index.ts"), "utf8"),
    );

    expect(mediaSourceFailures).toEqual([]);
    expect(unsupportedMediaImports).toEqual([]);
    expect(generatedProjectionImports).toEqual(
      expect.arrayContaining([
        "@dpeek/formless-presentation/contract",
        "@dpeek/formless-media",
        "@dpeek/formless-media/client",
      ]),
    );
    expect(generatedRuntimeImports).toEqual(
      expect.arrayContaining([
        "@dpeek/formless-presentation/contract",
        "@dpeek/formless-presentation/contract-host/react",
        "@dpeek/formless-media/client",
      ]),
    );
    expect(rendererMediaFieldImports).toEqual(
      expect.arrayContaining(["@dpeek/formless-presentation/contract", "../media-input.tsx"]),
    );
    expect(
      rendererMediaFieldImports.some((specifier) => specifier.startsWith("@dpeek/formless-media")),
    ).toBe(false);
    expect(workerRuntimeImports).toContain("@dpeek/formless-media/worker");
  });

  it("keeps source SVG consumers on the shared package", async () => {
    const rendererRoot = resolve(repoRoot, "lib/renderer");
    const rootPackage = await readPackageJson(resolve(repoRoot, "package.json"));
    const rendererPackage = await readPackageJson(resolve(rendererRoot, "package.json"));
    const sitePackage = await readPackageJson(resolve(repoRoot, "lib/site-app/package.json"));
    const sourceSvgPackage = await readPackageJson(
      resolve(repoRoot, "lib/source-svg/package.json"),
    );
    const iconCatalogValidationSource = await readFile(
      resolve(repoRoot, "src/shared/icon-catalog.test.ts"),
      "utf8",
    );
    const rendererSourceIconSource = await readFile(
      resolve(rendererRoot, "src/components/field-primitives.tsx"),
      "utf8",
    );
    const siteIconSource = await readFile(
      resolve(repoRoot, "lib/site-app/src/site-icon-source.ts"),
      "utf8",
    );

    expect(importSpecifiers(iconCatalogValidationSource)).toContain("@dpeek/formless-source-svg");
    expect(importSpecifiers(rendererSourceIconSource)).toContain("@dpeek/formless-source-svg");
    expect(importSpecifiers(siteIconSource)).toContain("@dpeek/formless-source-svg");
    expect(rootPackage.dependencies?.["@dpeek/formless-source-svg"]).toBe("^0.1.0");
    expect(rendererPackage.dependencies?.["@dpeek/formless-source-svg"]).toBe("^0.1.0");
    expect(sitePackage.dependencies?.["@dpeek/formless-source-svg"]).toBe("^0.1.0");
    expect(sourceSvgPackage.dependencies).toBeUndefined();
    expect(sourceSvgPackage.peerDependencies).toBeUndefined();
  });
});

const allowedArchivePackageImports = new Set([
  "@dpeek/formless-archive",
  "@dpeek/formless-archive/node",
]);

const allowedSitePackageImports = new Set([
  "@dpeek/formless-site-app",
  "@dpeek/formless-site-app/formless.app.json",
  "@dpeek/formless-site-app/node",
  "@dpeek/formless-site-app/public/react",
  "@dpeek/formless-site-app/react",
  "@dpeek/formless-site-app/schema.json",
  "@dpeek/formless-site-app/seed-records.json",
  "@dpeek/formless-site-app/worker",
]);

const allowedCrmPackageImports = new Set([
  "@dpeek/formless-crm-app",
  "@dpeek/formless-crm-app/formless.app.json",
  "@dpeek/formless-crm-app/schema.json",
  "@dpeek/formless-crm-app/seed-records.json",
]);

const allowedTasksPackageImports = new Set([
  "@dpeek/formless-tasks-app",
  "@dpeek/formless-tasks-app/formless.app.json",
  "@dpeek/formless-tasks-app/schema.json",
  "@dpeek/formless-tasks-app/seed-records.json",
]);

const allowedMediaPackageImports = new Set([
  "@dpeek/formless-media",
  "@dpeek/formless-media/client",
  "@dpeek/formless-media/worker",
]);

const allowedFormlessRendererPackageImports = new Set([
  "@dpeek/formless-renderer/application/assembly",
  "@dpeek/formless-renderer/application/global.css",
  "@dpeek/formless-renderer/application/provider",
  "@dpeek/formless-renderer/site/global.css",
  "@dpeek/formless-renderer/site/provider",
  "@dpeek/formless-renderer/site/renderer",
]);

const allowedFormlessPresentationPackageImports = new Set([
  "@dpeek/formless-presentation/contract",
  "@dpeek/formless-presentation/contract-host",
  "@dpeek/formless-presentation/contract-host/react",
]);

const allowedRendererSitePackageImports = new Set([
  "@dpeek/formless-site-app",
  "@dpeek/formless-site-app/public/react",
]);

const allowedRendererSiteTestPackageImports = new Set([
  "@dpeek/formless-site-app/react",
  "@dpeek/formless-site-app/worker",
]);

function allowedRendererSitePackageImport(filePath: string, specifier: string): boolean {
  return (
    allowedRendererSitePackageImports.has(specifier) ||
    (filePath.includes(".test.") && allowedRendererSiteTestPackageImports.has(specifier))
  );
}

async function readPackageJson(path: string): Promise<{
  dependencies?: Record<string, string>;
  name?: string;
  peerDependencies?: Record<string, string>;
}> {
  return JSON.parse(await readFile(path, "utf8")) as {
    dependencies?: Record<string, string>;
    name?: string;
    peerDependencies?: Record<string, string>;
  };
}

async function boundarySourceFiles(): Promise<string[]> {
  const nestedFiles = await Promise.all([
    sourceFiles(resolve(repoRoot, "src")),
    sourceFiles(resolve(repoRoot, "lib")),
    sourceFiles(resolve(repoRoot, "scripts")),
  ]);

  return [...nestedFiles.flat(), resolve(repoRoot, "vite.config.ts")].sort();
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        files.push(...(await sourceFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && sourceFileExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];

      if (specifier) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

function forbiddenSchemaPackageImport(specifier: string): boolean {
  return specifier.startsWith("@dpeek/formless-schema/");
}

function forbiddenArchivePackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-archive" || specifier.startsWith("@dpeek/formless-archive/")) &&
    !allowedArchivePackageImports.has(specifier)
  );
}

function forbiddenArchivePackageInternalImport(importerPath: string, specifier: string): boolean {
  const importerRelativePath = relative(repoRoot, importerPath);

  if (importerRelativePath.startsWith("lib/archive/")) {
    return false;
  }

  if (specifier.includes("lib/archive/src/")) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedSpecifier = resolve(dirname(importerPath), specifier);
  const resolvedRelativePath = relative(repoRoot, resolvedSpecifier);

  return resolvedRelativePath.startsWith("lib/archive/src/");
}

function forbiddenSitePackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-site-app" ||
      specifier.startsWith("@dpeek/formless-site-app/")) &&
    !allowedSitePackageImports.has(specifier)
  );
}

function forbiddenRootSiteSourceImport(specifier: string): boolean {
  return specifier.includes("schema/apps/site/");
}

function forbiddenCrmPackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-crm-app" || specifier.startsWith("@dpeek/formless-crm-app/")) &&
    !allowedCrmPackageImports.has(specifier)
  );
}

function forbiddenRootCrmSourceImport(specifier: string): boolean {
  return specifier.includes("schema/apps/crm/");
}

function forbiddenTasksPackageImport(specifier: string): boolean {
  return (
    (specifier === "@dpeek/formless-tasks-app" ||
      specifier.startsWith("@dpeek/formless-tasks-app/")) &&
    !allowedTasksPackageImports.has(specifier)
  );
}

function forbiddenRootTasksSourceImport(specifier: string): boolean {
  return specifier.includes("schema/apps/tasks/");
}

function forbiddenFormlessRendererImport(importerPath: string, specifier: string): boolean {
  if (allowedFormlessRendererPackageImports.has(specifier)) {
    return false;
  }

  if (
    specifier === "@dpeek/formless-renderer" ||
    specifier.startsWith("@dpeek/formless-renderer/")
  ) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedSpecifier = resolve(dirname(importerPath), specifier);

  return pathInside(resolvedSpecifier, resolve(repoRoot, "lib/renderer/src"));
}

function forbiddenFormlessPresentationImport(importerPath: string, specifier: string): boolean {
  if (allowedFormlessPresentationPackageImports.has(specifier)) {
    return false;
  }

  if (
    specifier === "@dpeek/formless-presentation" ||
    specifier.startsWith("@dpeek/formless-presentation/")
  ) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedSpecifier = resolve(dirname(importerPath), specifier);

  return pathInside(resolvedSpecifier, resolve(repoRoot, "lib/presentation/src"));
}

function relativeImportResolvesInside(
  importerPath: string,
  specifier: string,
  parent: string,
): boolean {
  if (!specifier.startsWith(".")) {
    return false;
  }

  return pathInside(resolve(dirname(importerPath), specifier), parent);
}

function pathInside(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);

  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/"));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

const sourceFileExtensions = new Set([".ts", ".tsx"]);
