import { describe, expect, it } from "vite-plus/test";

import {
  deserializeMarkdownToPlateValue,
  emptyMarkdownPlateValue,
  normalizeMarkdownPlateValue,
  serializePlateValueToMarkdown,
} from "./markdown-plate-value.js";

type TestPlateNode = Record<string, unknown> & {
  children?: TestPlateNode[];
  text?: string;
  type?: string;
};

describe("markdown Plate value helpers", () => {
  it("normalizes empty markdown to one empty paragraph", () => {
    expect(emptyMarkdownPlateValue()).toEqual([{ children: [{ text: "" }], type: "p" }]);
    expect(deserializeMarkdownToPlateValue("")).toEqual(emptyMarkdownPlateValue());
    expect(deserializeMarkdownToPlateValue("  \n\t")).toEqual(emptyMarkdownPlateValue());
    expect(normalizeMarkdownPlateValue([])).toEqual(emptyMarkdownPlateValue());
    expect(normalizeMarkdownPlateValue(null)).toEqual(emptyMarkdownPlateValue());
  });

  it("deserializes headings, paragraphs, marks, links, and lists", () => {
    const value = deserializeMarkdownToPlateValue(
      [
        "# Heading",
        "",
        "Text with **bold**, *italic*, ~~strike~~, `code`, and [link](https://example.com).",
        "",
        "- bullet",
        "",
        "1. one",
      ].join("\n"),
    );

    expect(findNode(value, (node) => node.type === "h1" && nodeText(node) === "Heading")).toBe(
      true,
    );
    expect(findText(value, (node) => node.text === "bold" && node.bold === true)).toBe(true);
    expect(findText(value, (node) => node.text === "italic" && node.italic === true)).toBe(true);
    expect(findText(value, (node) => node.text === "strike" && node.strikethrough === true)).toBe(
      true,
    );
    expect(findText(value, (node) => node.text === "code" && node.code === true)).toBe(true);
    expect(
      findNode(
        value,
        (node) =>
          node.type === "a" && node.url === "https://example.com" && nodeText(node) === "link",
      ),
    ).toBe(true);
    expect(
      findNode(
        value,
        (node) => node.type === "p" && node.listStyleType === "disc" && nodeText(node) === "bullet",
      ),
    ).toBe(true);
    expect(
      findNode(
        value,
        (node) => node.type === "p" && node.listStyleType === "decimal" && nodeText(node) === "one",
      ),
    ).toBe(true);
  });

  it("demotes headings below the configured minimum level", () => {
    const value = deserializeMarkdownToPlateValue(["# Page title", "", "### Detail"].join("\n"), {
      minHeadingLevel: 2,
    });
    const markdown = serializePlateValueToMarkdown(value, { minHeadingLevel: 2 });

    expect(findNode(value, (node) => node.type === "h1")).toBe(false);
    expect(findNode(value, (node) => node.type === "h2" && nodeText(node) === "Page title")).toBe(
      true,
    );
    expect(findNode(value, (node) => node.type === "h3" && nodeText(node) === "Detail")).toBe(true);
    expect(markdown).toContain("## Page title");
    expect(markdown).toContain("### Detail");
  });

  it("deserializes GFM tables", () => {
    const value = deserializeMarkdownToPlateValue(
      ["| Name | Value |", "| --- | --- |", "| alpha | beta |"].join("\n"),
    );

    const table = firstNode(value, (node) => node.type === "table");

    expect(table).not.toBeNull();
    expect(table ? nodeText(table) : "").toContain("Name");
    expect(table ? nodeText(table) : "").toContain("beta");
  });

  it("deserializes GFM task lists with checked state", () => {
    const value = deserializeMarkdownToPlateValue(["- [x] shipped", "- [ ] pending"].join("\n"));

    expect(
      findNode(
        value,
        (node) =>
          node.type === "p" &&
          node.listStyleType === "todo" &&
          node.checked === true &&
          nodeText(node) === "shipped",
      ),
    ).toBe(true);
    expect(
      findNode(
        value,
        (node) =>
          node.type === "p" &&
          node.listStyleType === "todo" &&
          node.checked === false &&
          nodeText(node) === "pending",
      ),
    ).toBe(true);
  });

  it("deserializes fenced code blocks for later Plate rendering", () => {
    const value = deserializeMarkdownToPlateValue(["```ts", "const value = 1;", "```"].join("\n"));

    expect(
      findNode(
        value,
        (node) =>
          node.type === "code_block" &&
          node.lang === "typescript" &&
          node.markdownLanguage === "ts",
      ),
    ).toBe(true);
    expect(
      findNode(value, (node) => node.type === "code_line" && nodeText(node) === "const value = 1;"),
    ).toBe(true);
  });

  it("serializes supported Plate values back to markdown", () => {
    const value = deserializeMarkdownToPlateValue(
      [
        "# Heading",
        "",
        "Text with **bold**, *italic*, ~~strike~~, `code`, and [link](https://example.com).",
        "",
        "- [x] shipped",
        "",
        "| Name | Value |",
        "| --- | --- |",
        "| alpha | beta |",
      ].join("\n"),
    );
    const markdown = serializePlateValueToMarkdown(value);

    expect(markdown).toContain("# Heading");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("_italic_");
    expect(markdown).toContain("~~strike~~");
    expect(markdown).toContain("`code`");
    expect(markdown).toContain("[link](https://example.com)");
    expect(markdown).toContain("* [x] shipped");
    expect(markdown).toMatch(/\|\s*Name\s*\|\s*Value\s*\|/);
    expect(markdown).toContain("alpha");
    expect(markdown).toContain("beta");
  });

  it("treats raw HTML input as inert text", () => {
    const value = deserializeMarkdownToPlateValue(
      ["<script>alert(1)</script>", "", "<strong>raw</strong>"].join("\n"),
    );
    const serialized = serializePlateValueToMarkdown(value);

    expect(findNode(value, (node) => node.type === "html" || node.type === "script")).toBe(false);
    expect(documentText(value)).toContain("<script>alert(1)</script>");
    expect(documentText(value)).toContain("<strong>raw</strong>");
    expect(serialized).toContain("\\<script>alert(1)\\</script>");
    expect(serialized).toContain("\\<strong>raw\\</strong>");
  });
});

function findNode(value: unknown, predicate: (node: TestPlateNode) => boolean): boolean {
  return firstNode(value, predicate) !== null;
}

function firstNode(
  value: unknown,
  predicate: (node: TestPlateNode) => boolean,
): TestPlateNode | null {
  return collectNodes(value).find(predicate) ?? null;
}

function findText(value: unknown, predicate: (node: TestPlateNode) => boolean): boolean {
  return collectNodes(value).some((node) => typeof node.text === "string" && predicate(node));
}

function documentText(value: unknown): string {
  return collectNodes(value)
    .filter((node) => typeof node.text === "string")
    .map((node) => node.text)
    .join("");
}

function nodeText(node: TestPlateNode): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return node.children?.map(nodeText).join("") ?? "";
}

function collectNodes(value: unknown): TestPlateNode[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectNodes);
  }

  if (!isRecord(value)) {
    return [];
  }

  const node = value as TestPlateNode;

  return [node, ...(node.children?.flatMap(collectNodes) ?? [])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
