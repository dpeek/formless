"use client";

import { insertEmptyCodeBlock, toggleCodeBlock } from "@platejs/code-block";
import {
  flip,
  offset,
  shift,
  useFloatingToolbar,
  useFloatingToolbarState,
} from "@platejs/floating";
import { unwrapLink, upsertLink } from "@platejs/link";
import { toggleList } from "@platejs/list";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@dpeek/formless-ui/select";
import { Separator } from "@dpeek/formless-ui/separator";
import { TooltipContent } from "@dpeek/formless-ui/tooltip";
import { Toggle } from "@dpeek/formless-ui/toggle";
import { cn } from "@dpeek/formless-ui/utils";
import {
  BoldIcon,
  Code2Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  StrikethroughIcon,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { KEYS, type TElement } from "platejs";
import {
  type PlateEditor,
  useEditorId,
  useEditorRef,
  useEditorSelector,
  useEventPlateId,
} from "platejs/react";

type TextBlockType = typeof KEYS.p | typeof KEYS.h2 | typeof KEYS.h3;

const TEXT_BLOCK_OPTIONS = [
  { icon: PilcrowIcon, label: "Paragraph", value: KEYS.p },
  { icon: Heading2Icon, label: "Heading 2", value: KEYS.h2 },
  { icon: Heading3Icon, label: "Heading 3", value: KEYS.h3 },
] satisfies Array<{
  icon: typeof PilcrowIcon;
  label: string;
  value: TextBlockType;
}>;

const LIST_NODE_PROPS = [KEYS.listType, KEYS.listStart, KEYS.listChecked, KEYS.indent];

export function MarkdownFloatingToolbar() {
  const editorId = useEditorId();
  const focusedEditorId = useEventPlateId();
  const state = useFloatingToolbarState({
    editorId,
    floatingOptions: {
      middleware: [offset(8), flip(), shift({ padding: 8 })],
      placement: "top",
    },
    focusedEditorId,
  });
  const toolbar = useFloatingToolbar(state);

  if (toolbar.hidden) {
    return null;
  }

  return (
    <div
      {...toolbar.props}
      ref={toolbar.ref}
      className={cn(
        "ignore-click-outside/toolbar z-50 flex !w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-start gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
        toolbar.props.style?.display === "none" && "hidden",
      )}
      data-web-markdown-floating-toolbar="true"
      role="toolbar"
    >
      <MarkdownMarkButton label="Bold" mark={KEYS.bold}>
        <BoldIcon />
      </MarkdownMarkButton>
      <MarkdownMarkButton label="Italic" mark={KEYS.italic}>
        <ItalicIcon />
      </MarkdownMarkButton>
      <MarkdownMarkButton label="Strikethrough" mark={KEYS.strikethrough}>
        <StrikethroughIcon />
      </MarkdownMarkButton>
      <MarkdownMarkButton label="Inline code" mark={KEYS.code}>
        <Code2Icon />
      </MarkdownMarkButton>
      <MarkdownToolbarSeparator />
      <MarkdownLinkButton />
      <MarkdownTextBlockSelect />
      <MarkdownToolbarSeparator />
      <MarkdownListButton label="Bulleted list" listStyleType={KEYS.ul}>
        <ListIcon />
      </MarkdownListButton>
      <MarkdownListButton label="Numbered list" listStyleType={KEYS.ol}>
        <ListOrderedIcon />
      </MarkdownListButton>
      <MarkdownBlockButton label="Blockquote" type={KEYS.blockquote}>
        <QuoteIcon />
      </MarkdownBlockButton>
      <MarkdownCodeBlockButton />
    </div>
  );
}

function MarkdownMarkButton({
  children,
  label,
  mark,
}: {
  children: ReactNode;
  label: string;
  mark: string;
}) {
  const active = useEditorSelector((editor) => editor.api.hasMark(mark), [mark]);
  const editor = useEditorRef();

  return (
    <MarkdownToolbarToggle
      label={label}
      onPress={() => {
        editor.tf.focus();
        editor.tf.toggleMark(mark);
        editor.tf.focus();
      }}
      pressed={active}
    >
      {children}
    </MarkdownToolbarToggle>
  );
}

function MarkdownLinkButton() {
  const editor = useEditorRef();
  const active = useEditorSelector((editor) => editor.api.some({ match: { type: KEYS.a } }), []);

  return (
    <MarkdownToolbarToggle
      label="Link"
      onPress={() => {
        editor.tf.focus();
        updateLink(editor);
        editor.tf.focus();
      }}
      pressed={active}
    >
      <LinkIcon />
    </MarkdownToolbarToggle>
  );
}

function MarkdownTextBlockSelect() {
  const editor = useEditorRef();
  const activeBlockType = useEditorSelector((editor) => selectedTextBlockType(editor), []);

  return (
    <Select
      aria-label="Paragraph style"
      onSelectionChange={(nextValue) => {
        if (!nextValue) {
          return;
        }

        editor.tf.focus();
        setTextBlockType(editor, nextValue as TextBlockType);
        editor.tf.focus();
      }}
      selectedKey={activeBlockType}
    >
      <SelectTrigger className="h-6 w-32 rounded-md border-transparent bg-transparent px-1.5 py-0 text-xs" />
      <SelectContent popover={{ placement: "bottom start", className: "min-w-36" }}>
        {TEXT_BLOCK_OPTIONS.map((option) => (
          <SelectItem key={option.value} id={option.value}>
            <option.icon />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MarkdownListButton({
  children,
  label,
  listStyleType,
}: {
  children: ReactNode;
  label: string;
  listStyleType: string;
}) {
  const editor = useEditorRef();
  const active = useEditorSelector(
    (editor) => editor.api.some({ match: { listStyleType } }),
    [listStyleType],
  );

  return (
    <MarkdownToolbarToggle
      label={label}
      onPress={() => {
        editor.tf.focus();
        toggleList(editor, { listStyleType });
        editor.tf.focus();
      }}
      pressed={active}
    >
      {children}
    </MarkdownToolbarToggle>
  );
}

function MarkdownBlockButton({
  children,
  label,
  type,
}: {
  children: ReactNode;
  label: string;
  type: string;
}) {
  const editor = useEditorRef();
  const active = useEditorSelector((editor) => editor.api.some({ match: { type } }), [type]);

  return (
    <MarkdownToolbarToggle
      label={label}
      onPress={() => {
        editor.tf.focus();
        editor.tf.toggleBlock(type, { defaultType: KEYS.p });
        editor.tf.focus();
      }}
      pressed={active}
    >
      {children}
    </MarkdownToolbarToggle>
  );
}

function MarkdownCodeBlockButton() {
  const editor = useEditorRef();
  const active = useEditorSelector(
    (editor) =>
      editor.api.some({
        match: (node) => node.type === KEYS.codeBlock || node.type === KEYS.codeLine,
      }),
    [],
  );

  return (
    <MarkdownToolbarToggle
      label="Code block"
      onPress={() => {
        editor.tf.focus();

        if (active) {
          toggleCodeBlock(editor);
        } else {
          insertEmptyCodeBlock(editor);
        }

        editor.tf.focus();
      }}
      pressed={active}
    >
      <Code2Icon />
    </MarkdownToolbarToggle>
  );
}

function MarkdownToolbarToggle({
  children,
  label,
  onPress,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  pressed: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <>
      <Toggle
        aria-label={label}
        intent="plain"
        isSelected={pressed}
        onBlur={() => setTooltipOpen(false)}
        onChange={() => {
          onPress();
        }}
        onFocus={() => setTooltipOpen(true)}
        onHoverEnd={() => setTooltipOpen(false)}
        onHoverStart={() => setTooltipOpen(true)}
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        ref={triggerRef}
        size="sq-xs"
      >
        {children}
      </Toggle>
      <TooltipContent isOpen={tooltipOpen} offset={6} triggerRef={triggerRef}>
        {label}
      </TooltipContent>
    </>
  );
}

function MarkdownToolbarSeparator() {
  return <Separator className="mx-0.5 h-5" orientation="vertical" />;
}

function setTextBlockType(editor: PlateEditor, type: TextBlockType): void {
  editor.tf.withoutNormalizing(() => {
    editor.tf.unsetNodes(LIST_NODE_PROPS, {
      match: (node) => editor.api.isBlock(node),
    });
    editor.tf.setNodes(
      { type },
      {
        match: (node) =>
          editor.api.isBlock(node) && node.type !== KEYS.codeBlock && node.type !== KEYS.codeLine,
      },
    );
  });
}

function selectedTextBlockType(editor: PlateEditor): TextBlockType {
  const selectedBlock = editor.api.block<TElement>()?.[0];

  if (
    selectedBlock?.type === KEYS.h2 ||
    selectedBlock?.type === KEYS.h3 ||
    selectedBlock?.type === KEYS.p
  ) {
    return selectedBlock.type;
  }

  return KEYS.p;
}

function updateLink(editor: PlateEditor): void {
  if (typeof window === "undefined") {
    return;
  }

  const linkEntry = editor.api.above<TElement>({ match: { type: KEYS.a } });
  const previousUrl = linkEntry ? stringNodeProperty(linkEntry[0], "url") : null;
  const nextUrl = window.prompt("Link URL", previousUrl ?? "https://");

  if (nextUrl === null) {
    return;
  }

  const url = nextUrl.trim();

  if (!url) {
    unwrapLink(editor, { split: true });
    return;
  }

  upsertLink(editor, {
    skipValidation: true,
    text: editor.selection ? editor.api.string(editor.selection) || url : url,
    url,
  });
}

function stringNodeProperty(element: TElement, property: string): string | null {
  const value = element[property];

  return typeof value === "string" ? value : null;
}
