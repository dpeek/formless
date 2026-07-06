import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { GeneratedMarkdownFieldControl } from "./field-control-primitives.tsx";

describe("generated markdown field control", () => {
  it("renders source textarea markup instead of a contenteditable editor", () => {
    const markup = renderToStaticMarkup(
      <GeneratedMarkdownFieldControl label="Body" onChange={() => undefined} value="# Body" />,
    );

    expect(markup).toContain("<textarea");
    expect(markup).toContain('data-web-markdown-editor="textarea"');
    expect(markup).toContain('data-web-markdown-source="textarea"');
    expect(markup).not.toContain("contenteditable");
    expect(markup).not.toContain("contentEditable");
    expect(markup).not.toContain("data-slate-editor");
  });

  it("does not import Plate or Slate runtime modules for markdown editing", async () => {
    const graph = await collectSourceImportGraph([
      "src/app/generated/field-control-primitives.tsx",
    ]);
    const forbiddenFiles = [...graph.files].filter(forbiddenEditorFile);
    const forbiddenImports = graph.imports.filter(({ specifier }) =>
      forbiddenEditorSpecifier(specifier),
    );

    expect(forbiddenFiles).toEqual([]);
    expect(forbiddenImports).toEqual([]);
  });
});

type ImportEdge = {
  importer: string;
  specifier: string;
};

async function collectSourceImportGraph(entrypoints: string[]) {
  const files = new Set<string>();
  const imports: ImportEdge[] = [];
  const pending = [...entrypoints];

  while (pending.length > 0) {
    const file = normalizePath(pending.pop() ?? "");

    if (files.has(file)) {
      continue;
    }

    files.add(file);

    const source = await readFile(resolve(repoRoot, file), "utf8");

    for (const specifier of importSpecifiers(source)) {
      imports.push({ importer: file, specifier });

      const resolved = await resolveSourceSpecifier(file, specifier);
      if (resolved && !files.has(resolved)) {
        pending.push(resolved);
      }
    }
  }

  return { files, imports };
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticImportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(staticImportPattern)) {
    specifiers.push(match[1] ?? "");
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[1] ?? "");
  }

  return specifiers;
}

async function resolveSourceSpecifier(importer: string, specifier: string): Promise<string | null> {
  if (specifier === "@dpeek/formless-ui/markdown") {
    return "lib/ui/src/markdown.tsx";
  }

  if (!specifier.startsWith(".")) {
    return null;
  }

  const importerDirectory = dirname(importer);
  const rawPath = normalizePath(resolve(repoRoot, importerDirectory, specifier));
  const rawExtension = extname(rawPath);

  if (rawExtension === ".css") {
    return null;
  }

  if (rawExtension === ".js") {
    return firstExistingSource([rawPath.replace(/\.js$/, ".ts"), rawPath.replace(/\.js$/, ".tsx")]);
  }

  if (sourceExtensions.includes(rawExtension) && (await fileExists(rawPath))) {
    return rawPath;
  }

  return firstExistingSource(sourceExtensions.map((extension) => `${rawPath}${extension}`));
}

async function firstExistingSource(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await fileExists(path)) {
      return path;
    }
  }

  return null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const result = await stat(resolve(repoRoot, path));
    return result.isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function forbiddenEditorFile(path: string): boolean {
  return (
    path.startsWith("lib/ui/src/markdown-plate") ||
    path === "lib/ui/src/markdown-code-block-node.tsx" ||
    path === "lib/ui/src/markdown-floating-toolbar.tsx"
  );
}

function forbiddenEditorSpecifier(specifier: string): boolean {
  return (
    specifier === "platejs" ||
    specifier.startsWith("platejs/") ||
    specifier.startsWith("@platejs/") ||
    specifier === "slate" ||
    specifier.startsWith("slate-")
  );
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(`${repoRoot}/`, "");
}

const sourceExtensions = [".ts", ".tsx"];
const repoRoot = resolve(import.meta.dirname, "../../..");
