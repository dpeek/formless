import { afterEach, describe, expect, it } from "vite-plus/test";

import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseMarkdownCodeInfo } from "./markdown-code-info.js";
import { MARKDOWN_HIGHLIGHT_LANGUAGES } from "./markdown-highlight-contract.js";
import {
  highlightMarkdownCodeHtml,
  isMarkdownHighlightLanguageRegistered,
} from "./markdown-highlighting.js";
import { MarkdownEditor, MarkdownRenderer } from "./markdown.js";

type BunMarkdownApi = {
  react(content: string): React.ReactNode;
};

const bunRuntime = globalThis as typeof globalThis & {
  Bun?: {
    markdown?: BunMarkdownApi;
  };
};
const originalBunMarkdown = bunRuntime.Bun?.markdown;

function setBunMarkdown(markdown: BunMarkdownApi | undefined) {
  if (!bunRuntime.Bun) {
    Reflect.set(bunRuntime, "Bun", {});
  }

  if (markdown) {
    Reflect.set(bunRuntime.Bun as Record<string, unknown>, "markdown", markdown);
    return;
  }

  Reflect.deleteProperty(bunRuntime.Bun as Record<string, unknown>, "markdown");
}

afterEach(() => {
  setBunMarkdown(originalBunMarkdown);
});

describe("MarkdownRenderer", () => {
  it("uses the shared renderer even when Bun markdown is available", () => {
    setBunMarkdown({
      react(content: string) {
        return <article data-bun-rendered="true">{content.toUpperCase()}</article>;
      },
    } as unknown as BunMarkdownApi);

    const markup = renderToStaticMarkup(<MarkdownRenderer content="# Heading" />);

    expect(markup).toContain("graph-markdown");
    expect(markup).toContain("prose");
    expect(markup).toContain("max-w-none");
    expect(markup).toContain("dark:prose-invert");
    expect(markup).toContain('data-web-markdown-renderer="shared"');
    expect(markup).toContain("<h1");
    expect(markup).toContain('id="heading"');
    expect(markup).toContain("Heading");
    expect(markup).not.toContain("data-bun-rendered");
  });

  it("renders deterministic heading IDs with duplicate suffixes", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer
        content={["# Heading", "", "## Heading", "", "### Hello, world!"].join("\n")}
      />,
    );

    expect(markup).toContain('id="heading"');
    expect(markup).toContain('id="heading-1"');
    expect(markup).toContain('id="hello-world"');
  });

  it("can render markdown with headings constrained to h2+", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer
        content={["# Page title", "", "### Detail"].join("\n")}
        minHeadingLevel={2}
      />,
    );

    expect(markup).not.toContain("<h1");
    expect(markup).toContain("<h2");
    expect(markup).toContain('id="page-title"');
    expect(markup).toContain("Page title");
    expect(markup).toContain("<h3");
    expect(markup).toContain("Detail");
  });

  it("renders GFM tables, task lists, strikethrough, and literal autolinks", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          "www.example.com",
          "",
          "- [x] shipped",
          "",
          "~~removed~~",
          "",
          "| Name | Value |",
          "| --- | --- |",
          "| a | b |",
        ].join("\n")}
      />,
    );

    expect(markup).toContain('href="http://www.example.com/"');
    expect(markup).toContain("www.example.com");
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("checked");
    expect(markup).toContain("<del");
    expect(markup).toContain("removed");
    expect(markup).toContain("<table");
    expect(markup).toContain("<td");
    expect(markup).toContain("b");
  });

  it("keeps inline code as prose inline code", () => {
    const markup = renderToStaticMarkup(<MarkdownRenderer content="Use `value` inline." />);

    expect(markup).toContain("<code");
    expect(markup).toContain("value");
    expect(markup).not.toContain("graph-markdown-code-block");
    expect(markup).not.toContain('data-code-block="true"');
  });

  it("drops unsafe rendered link hrefs", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer content="[safe](https://example.com) [unsafe](javascript:alert(1))" />,
    );

    expect(markup).toContain('href="https://example.com/"');
    expect(markup).toContain("safe");
    expect(markup).toContain("unsafe");
    expect(markup).not.toContain("javascript:alert");
  });

  it("renders fenced code blocks with syntax highlighting", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          '```tsx filename="lib/graphle-web-ui/src/markdown.tsx"',
          "const value = 1;",
          "```",
        ].join("\n")}
      />,
    );

    expect(markup).toContain("graph-markdown-code-block");
    expect(markup).toContain('data-code-block="true"');
    expect(markup).toContain('data-highlight-language="tsx"');
    expect(markup).toContain('data-language="tsx"');
    expect(markup).toContain("lib/graphle-web-ui/src/markdown.tsx");
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).toContain("hljs-keyword");
    expect(markup).toContain("hljs-number");
    expect(markup).toContain("const");
    expect(markup).toContain("value");
  });

  it("falls back to plain code for unknown languages", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer content={["```mermaid", "graph TD;", "```"].join("\n")} />,
    );

    expect(markup).toContain("graph-markdown-code-block");
    expect(markup).toContain('data-language="mermaid"');
    expect(markup).not.toContain("data-highlight-language");
    expect(markup).not.toContain("hljs-");
    expect(markup).toContain("graph TD;");
  });

  it("disables highlighting for no-highlight aliases", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer content={["```txt", "literal <tag>", "```"].join("\n")} />,
    );

    expect(markup).toContain("graph-markdown-code-block");
    expect(markup).toContain('data-language="plaintext"');
    expect(markup).not.toContain("data-highlight-language");
    expect(markup).not.toContain("hljs-");
    expect(markup).toContain("literal");
    expect(markup).toContain("&lt;tag&gt;");
  });

  it("infers highlighting and labels from path-only fences", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer
        content={["```lib/graphle-web-ui/src/markdown.tsx", "const value = 1;", "```"].join("\n")}
      />,
    );

    expect(markup).toContain('data-highlight-language="tsx"');
    expect(markup).toContain('data-language="tsx"');
    expect(markup).toContain("lib/graphle-web-ui/src/markdown.tsx");
    expect(markup).toContain("hljs-keyword");
  });

  it("keeps caller class names for layout without replacing markdown styles", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer className="max-w-[48rem]" content="hello world" />,
    );

    expect(markup).toContain("graph-markdown");
    expect(markup).toContain("prose");
    expect(markup).toContain("max-w-[48rem]");
    expect(markup).not.toContain("max-w-none");
  });
});

describe("MarkdownEditor", () => {
  it("renders editable textarea markup with the shared markdown skin", () => {
    const markup = renderToStaticMarkup(
      <MarkdownEditor onChange={() => undefined} placeholder="Write notes" value="# Probe notes" />,
    );

    expect(markup).toContain("graph-markdown");
    expect(markup).toContain("graph-markdown-editor");
    expect(markup).toContain("font-mono");
    expect(markup).toContain("<textarea");
    expect(markup).toContain('data-web-markdown-editor="textarea"');
    expect(markup).toContain('data-web-markdown-source="textarea"');
    expect(markup).toContain('spellCheck="false"');
    expect(markup).toContain('placeholder="Write notes"');
    expect(markup).toContain("# Probe notes");
    expect(markup).not.toContain('data-slate-editor="true"');
    expect(markup).not.toContain("contentEditable");
    expect(markup).not.toContain("<h1");
  });

  it("passes invalid state to the markdown source textarea", () => {
    const markup = renderToStaticMarkup(
      <MarkdownEditor aria-invalid onChange={() => undefined} placeholder="Write notes" value="" />,
    );

    expect(markup).toContain('data-web-markdown-editor="textarea"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('data-web-markdown-source="textarea"');
  });

  it("can render an accessible read-only editor surface", () => {
    const markup = renderToStaticMarkup(
      <MarkdownEditor
        aria-label="Notes"
        onChange={() => undefined}
        readOnly
        value="Read-only notes"
      />,
    );

    expect(markup).toContain('aria-label="Notes"');
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).toContain("readOnly");
    expect(markup).not.toContain("contentEditable");
  });

  it("keeps markdown source text unchanged when heading constraints are passed", () => {
    const markup = renderToStaticMarkup(
      <MarkdownEditor
        minHeadingLevel={2}
        onChange={() => undefined}
        placeholder="Write notes"
        value="# Probe notes"
      />,
    );

    expect(markup).not.toContain("<h1");
    expect(markup).not.toContain("<h2");
    expect(markup).toContain("# Probe notes");
  });

  it("keeps fenced code blocks as editable source text", () => {
    const markup = renderToStaticMarkup(
      <MarkdownEditor
        onChange={() => undefined}
        placeholder="Write notes"
        value={['```tsx filename="schema.tsx"', "const value = 1;", "```"].join("\n")}
      />,
    );

    expect(markup).toContain("```tsx filename=&quot;schema.tsx&quot;");
    expect(markup).toContain("schema.tsx");
    expect(markup).not.toContain("graph-markdown-code-block");
    expect(markup).not.toContain("graph-markdown-code-syntax");
    expect(markup).not.toContain("hljs-keyword");
  });
});

describe("markdown highlighting dependency decision", () => {
  it("keeps declared highlighted languages registered with Lowlight", () => {
    for (const language of MARKDOWN_HIGHLIGHT_LANGUAGES) {
      expect(isMarkdownHighlightLanguageRegistered(language)).toBe(true);
    }

    expect(isMarkdownHighlightLanguageRegistered("mermaid")).toBe(false);
  });

  it("escapes highlighted code while preserving syntax classes", () => {
    const html = highlightMarkdownCodeHtml('const tag = "<script>";', "typescript");

    expect(html).toContain("hljs-keyword");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("parseMarkdownCodeInfo", () => {
  it("reads explicit filename metadata and normalizes language aliases", () => {
    expect(parseMarkdownCodeInfo({ language: "ts", meta: 'filename="schema.ts"' })).toEqual({
      filename: "schema.ts",
      highlightLanguage: "typescript",
      label: "schema.ts",
      language: "typescript",
    });
  });

  it("infers language from path-like first tokens", () => {
    expect(parseMarkdownCodeInfo({ language: "lib/graphle-web-ui/src/markdown.tsx" })).toEqual({
      filename: "lib/graphle-web-ui/src/markdown.tsx",
      highlightLanguage: "tsx",
      label: "lib/graphle-web-ui/src/markdown.tsx",
      language: "tsx",
    });
  });

  it("renders unknown languages as plain code while preserving the visible label", () => {
    expect(parseMarkdownCodeInfo({ language: "mermaid" })).toEqual({
      filename: null,
      highlightLanguage: null,
      label: "mermaid",
      language: "mermaid",
    });
  });

  it("skips highlighting for plain-text aliases", () => {
    expect(parseMarkdownCodeInfo({ language: "nohighlight" })).toEqual({
      filename: null,
      highlightLanguage: null,
      label: "Text",
      language: "plaintext",
    });
  });

  it("keeps JSONC and MDX plain because Highlight.js does not support them cleanly", () => {
    expect(parseMarkdownCodeInfo({ language: "jsonc" })).toEqual({
      filename: null,
      highlightLanguage: null,
      label: "JSONC",
      language: "jsonc",
    });
    expect(parseMarkdownCodeInfo({ language: "mdx" })).toEqual({
      filename: null,
      highlightLanguage: null,
      label: "MDX",
      language: "mdx",
    });
  });
});
