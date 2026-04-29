import { cn } from "@formless/ui/utils";
import { lexer, type Token, type Tokens } from "marked";
import { createElement, type ReactNode } from "react";

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
      data-web-markdown-renderer="server"
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
    case "code": {
      const code = token as Tokens.Code;
      return (
        <pre key={context.key}>
          <code className={code.lang ? `language-${code.lang}` : undefined}>{code.text}</code>
        </pre>
      );
    }
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
          className="graph-markdown-list"
          key={context.key}
          start={list.ordered && list.start ? list.start : undefined}
        >
          {list.items.map((item: Tokens.ListItem, index: number) => (
            <li className="graph-markdown-list-item" key={`${context.key}:li:${index}`}>
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
