import { Button } from "@dpeek/formless-ui/button";
import { ControlCheckIcon, ControlCopyIcon } from "@dpeek/formless-ui/icons";
import { cn } from "@dpeek/formless-ui/utils";
import { lexer, type Token, type Tokens } from "marked";
import { createElement, useEffect, useState, type ReactNode } from "react";

import { parseMarkdownCodeInfo } from "./markdown-code-info.js";
import { highlightMarkdownCodeHtml } from "./markdown-highlighting.js";
import type { MarkdownHeadingLevel } from "./markdown-plate-value.js";

export type { MarkdownHeadingLevel } from "./markdown-plate-value.js";

export function MarkdownRenderer({
  className,
  content,
  minHeadingLevel,
}: {
  className?: string;
  content: string;
  minHeadingLevel?: MarkdownHeadingLevel;
}) {
  const headingSlugger = createHeadingSlugger();
  const tokens = lexer(content, { gfm: true });

  return (
    <div
      className={cn("graph-markdown prose max-w-none dark:prose-invert", className)}
      data-web-markdown-renderer="shared"
    >
      {renderTokens(tokens, {
        headingSlugger,
        keyPrefix: "block",
        minHeadingLevel,
      })}
    </div>
  );
}

function renderTokens(
  tokens: readonly Token[],
  context: {
    readonly headingSlugger: ReturnType<typeof createHeadingSlugger>;
    readonly keyPrefix: string;
    readonly minHeadingLevel?: MarkdownHeadingLevel;
  },
): ReactNode[] {
  return tokens.flatMap((token, index) =>
    renderToken(token, {
      ...context,
      key: `${context.keyPrefix}:${index}`,
    }),
  );
}

function renderInlineTokens(tokens: readonly Token[], keyPrefix: string): ReactNode[] {
  return tokens.flatMap((token, index) =>
    renderInlineToken(token, {
      key: `${keyPrefix}:${index}`,
      keyPrefix: `${keyPrefix}:${index}`,
    }),
  );
}

function renderToken(
  token: Token,
  context: {
    readonly headingSlugger: ReturnType<typeof createHeadingSlugger>;
    readonly key: string;
    readonly keyPrefix: string;
    readonly minHeadingLevel?: MarkdownHeadingLevel;
  },
): ReactNode {
  switch (token.type) {
    case "blockquote": {
      const blockquote = token as Tokens.Blockquote;
      return (
        <blockquote key={context.key}>
          {renderTokens(blockquote.tokens, {
            headingSlugger: context.headingSlugger,
            keyPrefix: `${context.key}:blockquote`,
            minHeadingLevel: context.minHeadingLevel,
          })}
        </blockquote>
      );
    }
    case "br":
      return <br key={context.key} />;
    case "code":
      return <MarkdownCodeBlock code={token as Tokens.Code} key={context.key} />;
    case "heading": {
      const heading = token as Tokens.Heading;
      const level = normalizeHeadingLevel(heading.depth, context.minHeadingLevel);
      const Heading = `h${level}` as const;
      const children = renderInlineTokens(heading.tokens, `${context.key}:heading`);
      return createElement(
        Heading,
        {
          id: context.headingSlugger.slug(textFromInlineTokens(heading.tokens)),
          key: context.key,
        },
        children,
      );
    }
    case "hr":
      return <hr key={context.key} />;
    case "html": {
      const html = token as Tokens.HTML;
      return html.text ? <p key={context.key}>{html.text}</p> : null;
    }
    case "list": {
      const list = token as Tokens.List;
      const List = list.ordered ? "ol" : "ul";
      return (
        <List
          className={
            list.items.some((item) => item.task)
              ? "graph-markdown-task-list"
              : "graph-markdown-list"
          }
          key={context.key}
          start={list.ordered && list.start ? list.start : undefined}
        >
          {list.items.map((item: Tokens.ListItem, index: number) => (
            <li
              className={item.task ? "graph-markdown-task-list-item" : "graph-markdown-list-item"}
              key={`${context.key}:li:${index}`}
            >
              {item.task ? (
                <input checked={item.checked ?? false} disabled readOnly type="checkbox" />
              ) : null}
              {renderTokens(item.tokens, {
                headingSlugger: context.headingSlugger,
                keyPrefix: `${context.key}:li:${index}`,
                minHeadingLevel: context.minHeadingLevel,
              })}
            </li>
          ))}
        </List>
      );
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      return <p key={context.key}>{renderInlineTokens(paragraph.tokens, `${context.key}:p`)}</p>;
    }
    case "space":
      return null;
    case "table": {
      const table = token as Tokens.Table;
      return (
        <table key={context.key}>
          <thead>
            <tr>
              {table.header.map((cell: Tokens.TableCell, index: number) => (
                <th key={`${context.key}:th:${index}`}>{renderTableCell(cell, context.key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row: Tokens.TableCell[], rowIndex: number) => (
              <tr key={`${context.key}:tr:${rowIndex}`}>
                {row.map((cell: Tokens.TableCell, cellIndex: number) => (
                  <td key={`${context.key}:td:${rowIndex}:${cellIndex}`}>
                    {renderTableCell(cell, context.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "text": {
      const text = token as Tokens.Text;
      return <p key={context.key}>{renderInlineTextToken(text, `${context.key}:text`)}</p>;
    }
    default:
      return null;
  }
}

function renderInlineToken(
  token: Token,
  context: {
    readonly key: string;
    readonly keyPrefix: string;
  },
): ReactNode {
  switch (token.type) {
    case "br":
      return <br key={context.key} />;
    case "codespan": {
      const codespan = token as Tokens.Codespan;
      return <code key={context.key}>{codespan.text}</code>;
    }
    case "del": {
      const del = token as Tokens.Del;
      return <del key={context.key}>{renderInlineTokens(del.tokens, context.keyPrefix)}</del>;
    }
    case "em": {
      const em = token as Tokens.Em;
      return <em key={context.key}>{renderInlineTokens(em.tokens, context.keyPrefix)}</em>;
    }
    case "escape": {
      const escape = token as Tokens.Escape;
      return escape.text;
    }
    case "html": {
      const html = token as Tokens.HTML;
      return html.text;
    }
    case "image": {
      const image = token as Tokens.Image;
      return image.text;
    }
    case "link": {
      const link = token as Tokens.Link;
      const href = safeMarkdownHref(link.href);
      return href ? (
        <a href={href} key={context.key} title={link.title ?? undefined}>
          {renderInlineTokens(link.tokens, context.keyPrefix)}
        </a>
      ) : (
        renderInlineTokens(link.tokens, context.keyPrefix)
      );
    }
    case "strong": {
      const strong = token as Tokens.Strong;
      return (
        <strong key={context.key}>{renderInlineTokens(strong.tokens, context.keyPrefix)}</strong>
      );
    }
    case "text": {
      const text = token as Tokens.Text;
      return renderInlineTextToken(text, context.keyPrefix);
    }
    default:
      return null;
  }
}

function MarkdownCodeBlock({ code }: { code: Tokens.Code }) {
  const codeInfo = parseMarkdownCodeInfo(splitCodeInfo(code.lang));
  const highlightedHtml = codeInfo.highlightLanguage
    ? highlightMarkdownCodeHtml(code.text, codeInfo.highlightLanguage)
    : null;

  return (
    <div
      className="not-prose graph-markdown-code-block"
      data-code-block="true"
      data-highlight-language={codeInfo.highlightLanguage ?? undefined}
      data-language={codeInfo.language ?? undefined}
    >
      <div className="graph-markdown-code-block-header">
        {codeInfo.label ? (
          <span className="graph-markdown-code-block-label">{codeInfo.label}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <MarkdownCodeCopyButton code={code.text} />
      </div>
      <div className="graph-markdown-code-block-body">
        <pre className="graph-markdown-code-block-pre">
          {highlightedHtml ? (
            <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          ) : (
            <code>{code.text}</code>
          )}
        </pre>
      </div>
    </div>
  );
}

function MarkdownCodeCopyButton({ code }: { code: string }) {
  const [copyState, setCopyState] = useState<"copied" | "failed" | "idle">("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyState]);

  const label =
    copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy code";

  async function copyCode(): Promise<void> {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <Button
      aria-label={label}
      className="graph-markdown-code-block-copy-button"
      onPress={() => void copyCode()}
      size="sq-xs"
      type="button"
      intent="plain"
    >
      {copyState === "copied" ? <ControlCheckIcon /> : <ControlCopyIcon />}
    </Button>
  );
}

function splitCodeInfo(info: string | undefined): {
  language?: string | null;
  meta?: string | null;
} {
  const trimmed = info?.trim();

  if (!trimmed) {
    return {};
  }

  const [language = "", ...metaParts] = trimmed.split(/\s+/);
  return {
    language,
    meta: metaParts.length > 0 ? metaParts.join(" ") : null,
  };
}

function renderInlineTextToken(token: Tokens.Text, keyPrefix: string): ReactNode {
  return token.tokens ? renderInlineTokens(token.tokens, keyPrefix) : token.text;
}

function renderTableCell(cell: Tokens.TableCell, keyPrefix: string): ReactNode {
  return renderInlineTokens(cell.tokens, `${keyPrefix}:table-cell`);
}

function textFromInlineTokens(tokens: readonly Token[]): string {
  return tokens.map(textFromInlineToken).join("");
}

function textFromInlineToken(token: Token): string {
  switch (token.type) {
    case "codespan":
    case "escape":
    case "html":
    case "text":
      return (token as Tokens.Codespan | Tokens.Escape | Tokens.HTML | Tokens.Text).text;
    case "del":
      return textFromInlineTokens((token as Tokens.Del).tokens);
    case "em":
      return textFromInlineTokens((token as Tokens.Em).tokens);
    case "link":
      return textFromInlineTokens((token as Tokens.Link).tokens);
    case "strong":
      return textFromInlineTokens((token as Tokens.Strong).tokens);
    case "image":
      return (token as Tokens.Image).text;
    default:
      return "";
  }
}

function normalizeHeadingLevel(
  depth: number,
  minHeadingLevel: MarkdownHeadingLevel | undefined,
): MarkdownHeadingLevel {
  const normalized = Math.min(Math.max(depth, minHeadingLevel ?? 1), 6);
  return normalized as MarkdownHeadingLevel;
}

function safeMarkdownHref(value: string): string | undefined {
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function createHeadingSlugger() {
  const occurrences = new Map<string, number>();

  return {
    slug(value: string): string {
      const baseSlug = githubStyleSlug(value);
      const previousOccurrences = occurrences.get(baseSlug);

      if (previousOccurrences === undefined) {
        occurrences.set(baseSlug, 0);
        return baseSlug;
      }

      const nextOccurrences = previousOccurrences + 1;
      occurrences.set(baseSlug, nextOccurrences);

      return `${baseSlug}-${nextOccurrences}`;
    },
  };
}

function githubStyleSlug(value: string): string {
  return Array.from(value.toLowerCase())
    .filter((character) => {
      const code = character.charCodeAt(0);

      return !(
        code <= 0x1f ||
        (code >= 0x21 && code <= 0x2f) ||
        (code >= 0x3a && code <= 0x40) ||
        (code >= 0x5b && code <= 0x5e) ||
        code === 0x60 ||
        (code >= 0x7b && code <= 0x7e)
      );
    })
    .join("")
    .replaceAll(" ", "-");
}
