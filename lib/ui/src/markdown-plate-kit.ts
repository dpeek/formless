import {
  BaseBlockquotePlugin,
  BaseBoldPlugin,
  BaseCodePlugin,
  BaseHeadingPlugin,
  BaseHorizontalRulePlugin,
  BaseItalicPlugin,
  BaseStrikethroughPlugin,
} from "@platejs/basic-nodes";
import { BaseCodeBlockPlugin, BaseCodeLinePlugin, BaseCodeSyntaxPlugin } from "@platejs/code-block";
import { BaseLinkPlugin } from "@platejs/link";
import { BaseListPlugin } from "@platejs/list";
import { MarkdownPlugin, type MdRules } from "@platejs/markdown";
import {
  BaseTableCellHeaderPlugin,
  BaseTableCellPlugin,
  BaseTablePlugin,
  BaseTableRowPlugin,
} from "@platejs/table";
import { BaseParagraphPlugin, createSlateEditor, getPluginType, KEYS } from "platejs";
import remarkGfm from "remark-gfm";

import { lowlightLanguageForMarkdownCode } from "./markdown-code-info.js";
import { markdownPlateLowlight } from "./markdown-highlighting.js";

export function createMarkdownPlatePlugins() {
  return [
    BaseParagraphPlugin,
    BaseHeadingPlugin,
    BaseBlockquotePlugin,
    BaseHorizontalRulePlugin,
    BaseBoldPlugin,
    BaseItalicPlugin,
    BaseStrikethroughPlugin,
    BaseCodePlugin,
    BaseLinkPlugin,
    BaseListPlugin.extend({
      render: {
        belowNodes: () => undefined,
      },
    }),
    BaseTablePlugin,
    BaseTableRowPlugin,
    BaseTableCellPlugin,
    BaseTableCellHeaderPlugin,
    BaseCodeBlockPlugin.configure({
      options: {
        defaultLanguage: null,
        lowlight: markdownPlateLowlight,
      },
    }),
    BaseCodeLinePlugin,
    BaseCodeSyntaxPlugin,
    MarkdownPlugin.configure({
      options: {
        remarkPlugins: [remarkGfm],
        rules: markdownPlateRules,
      },
    }),
  ];
}

export function createMarkdownPlateEditor() {
  return createSlateEditor({
    plugins: createMarkdownPlatePlugins(),
  });
}

const markdownPlateRules = {
  code_block: {
    deserialize(mdastNode, _deco, options) {
      const markdownLanguage = cleanCodeInfo(mdastNode.lang);
      const markdownMeta = cleanCodeInfo(mdastNode.meta);
      const codeBlockType = options.editor
        ? getPluginType(options.editor, KEYS.codeBlock)
        : KEYS.codeBlock;
      const codeLineType = options.editor
        ? getPluginType(options.editor, KEYS.codeLine)
        : KEYS.codeLine;

      return {
        children: (mdastNode.value ?? "").split("\n").map((line) => ({
          children: [{ text: line }],
          type: codeLineType,
        })),
        lang: lowlightLanguageForMarkdownCode({
          language: markdownLanguage,
          meta: markdownMeta,
        }),
        markdownLanguage: markdownLanguage ?? undefined,
        markdownMeta: markdownMeta ?? undefined,
        type: codeBlockType,
      };
    },
    serialize(node) {
      const codeBlock = node as {
        children?: Array<{ children?: Array<{ text?: string }>; text?: string }>;
        lang?: string;
        markdownLanguage?: string;
        markdownMeta?: string;
      };

      return {
        lang:
          cleanCodeInfo(codeBlock.markdownLanguage) ?? cleanCodeInfo(codeBlock.lang) ?? undefined,
        meta: cleanCodeInfo(codeBlock.markdownMeta) ?? undefined,
        type: "code",
        value:
          codeBlock.children
            ?.map((child) =>
              child.children === undefined
                ? (child.text ?? "")
                : child.children.map((textNode) => textNode.text ?? "").join(""),
            )
            .join("\n") ?? "",
      };
    },
  },
} satisfies MdRules;

function cleanCodeInfo(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}
