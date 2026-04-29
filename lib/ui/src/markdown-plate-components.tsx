import { cn } from "@formless/ui/utils";
import { createElement, type ComponentPropsWithoutRef, type CSSProperties } from "react";
import type { NodeComponents } from "platejs";
import {
  PlateElement,
  PlateLeaf,
  type PlateElementProps,
  type PlateLeafProps,
} from "platejs/react";
import type { SlateElementProps, SlateLeafProps } from "platejs/static";

import {
  MarkdownCodeBlockElement,
  MarkdownCodeLineElement,
  MarkdownCodeSyntaxLeaf,
  MarkdownEditableCodeBlockElement,
  MarkdownEditableCodeLineElement,
  MarkdownEditableCodeSyntaxLeaf,
} from "./markdown-code-block-node.js";
import type { MarkdownPlateElementNode } from "./markdown-plate-value.js";

type MarkdownPlateElementProps = SlateElementProps<MarkdownPlateElementNode>;
type MarkdownPlateEditableElementProps = PlateElementProps<MarkdownPlateElementNode>;

const ORDERED_LIST_STYLES = new Set([
  "decimal",
  "lower-alpha",
  "lower-roman",
  "upper-alpha",
  "upper-roman",
]);

export const markdownPlateComponents = {
  a: LinkElement,
  blockquote: BlockquoteElement,
  bold: BoldLeaf,
  code: InlineCodeLeaf,
  code_block: MarkdownCodeBlockElement,
  code_line: MarkdownCodeLineElement,
  code_syntax: MarkdownCodeSyntaxLeaf,
  h1: H1Element,
  h2: H2Element,
  h3: H3Element,
  h4: H4Element,
  h5: H5Element,
  h6: H6Element,
  hr: HorizontalRuleElement,
  italic: ItalicLeaf,
  p: ParagraphElement,
  strikethrough: StrikethroughLeaf,
  table: TableElement,
  td: TableCellElement,
  th: TableHeaderCellElement,
  tr: TableRowElement,
} satisfies NodeComponents;

export const markdownPlateEditorComponents = {
  a: EditableLinkElement,
  blockquote: EditableBlockquoteElement,
  bold: EditableBoldLeaf,
  code: EditableInlineCodeLeaf,
  code_block: MarkdownEditableCodeBlockElement,
  code_line: MarkdownEditableCodeLineElement,
  code_syntax: MarkdownEditableCodeSyntaxLeaf,
  h1: EditableH1Element,
  h2: EditableH2Element,
  h3: EditableH3Element,
  h4: EditableH4Element,
  h5: EditableH5Element,
  h6: EditableH6Element,
  hr: EditableHorizontalRuleElement,
  italic: EditableItalicLeaf,
  p: EditableParagraphElement,
  strikethrough: EditableStrikethroughLeaf,
  table: EditableTableElement,
  td: EditableTableCellElement,
  th: EditableTableHeaderCellElement,
  tr: EditableTableRowElement,
} satisfies NodeComponents;

function ParagraphElement(props: MarkdownPlateElementProps) {
  const listStyleType = stringNodeProperty(props.element, "listStyleType");

  if (listStyleType === "todo") {
    return <TaskListItemElement {...props} />;
  }

  if (listStyleType) {
    return <ListItemElement {...props} listStyleType={listStyleType} />;
  }

  return <p {...elementAttributes<"p">(props.attributes)}>{props.children}</p>;
}

function ListItemElement({
  children,
  element,
  listStyleType,
  ...props
}: MarkdownPlateElementProps & { listStyleType: string }) {
  const attributes = elementAttributes<"li">(props.attributes);
  const listStart = numberNodeProperty(element, "listStart");
  const ordered = ORDERED_LIST_STYLES.has(listStyleType);
  const List = ordered ? "ol" : "ul";
  const listProps = ordered
    ? ({ start: listStart ?? undefined } satisfies ComponentPropsWithoutRef<"ol">)
    : ({} satisfies ComponentPropsWithoutRef<"ul">);

  return (
    <List
      className="graph-markdown-list"
      style={
        listStyleType === "disc" || listStyleType === "decimal" ? undefined : { listStyleType }
      }
      {...listProps}
    >
      <li
        {...attributes}
        className={cn(attributes.className, "graph-markdown-list-item")}
        style={listItemStyle(element, attributes.style)}
      >
        {children}
      </li>
    </List>
  );
}

function TaskListItemElement({ children, element, ...props }: MarkdownPlateElementProps) {
  const attributes = elementAttributes<"li">(props.attributes);
  const checked = booleanNodeProperty(element, "checked");

  return (
    <ul className="graph-markdown-task-list">
      <li
        {...attributes}
        className={cn(attributes.className, "graph-markdown-task-list-item")}
        style={listItemStyle(element, attributes.style)}
      >
        <input checked={checked} disabled readOnly type="checkbox" />
        <span>{children}</span>
      </li>
    </ul>
  );
}

function BlockquoteElement(props: MarkdownPlateElementProps) {
  return (
    <blockquote {...elementAttributes<"blockquote">(props.attributes)}>{props.children}</blockquote>
  );
}

function H1Element(props: MarkdownPlateElementProps) {
  return renderHeadingElement("h1", props);
}

function H2Element(props: MarkdownPlateElementProps) {
  return renderHeadingElement("h2", props);
}

function H3Element(props: MarkdownPlateElementProps) {
  return renderHeadingElement("h3", props);
}

function H4Element(props: MarkdownPlateElementProps) {
  return renderHeadingElement("h4", props);
}

function H5Element(props: MarkdownPlateElementProps) {
  return renderHeadingElement("h5", props);
}

function H6Element(props: MarkdownPlateElementProps) {
  return renderHeadingElement("h6", props);
}

function renderHeadingElement(
  tagName: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
  props: MarkdownPlateElementProps,
) {
  return createElement(
    tagName,
    {
      ...elementAttributes<typeof tagName>(props.attributes),
      id: stringNodeProperty(props.element, "headingId") ?? undefined,
    },
    props.children,
  );
}

function HorizontalRuleElement(props: MarkdownPlateElementProps) {
  return <hr {...elementAttributes<"hr">(props.attributes)} />;
}

function LinkElement(props: MarkdownPlateElementProps) {
  const attributes = elementAttributes<"a">(props.attributes);
  const href = safeMarkdownHref(stringNodeProperty(props.element, "url"));

  return (
    <a
      {...attributes}
      data-slate-url={href ? stringNodeProperty(props.element, "url") : undefined}
      href={href}
    >
      {props.children}
    </a>
  );
}

function TableElement(props: MarkdownPlateElementProps) {
  return (
    <table {...elementAttributes<"table">(props.attributes)}>
      <tbody>{props.children}</tbody>
    </table>
  );
}

function TableRowElement(props: MarkdownPlateElementProps) {
  return <tr {...elementAttributes<"tr">(props.attributes)}>{props.children}</tr>;
}

function TableCellElement(props: MarkdownPlateElementProps) {
  return <td {...elementAttributes<"td">(props.attributes)}>{props.children}</td>;
}

function TableHeaderCellElement(props: MarkdownPlateElementProps) {
  return <th {...elementAttributes<"th">(props.attributes)}>{props.children}</th>;
}

function BoldLeaf(props: SlateLeafProps) {
  return <strong {...elementAttributes<"strong">(props.attributes)}>{props.children}</strong>;
}

function ItalicLeaf(props: SlateLeafProps) {
  return <em {...elementAttributes<"em">(props.attributes)}>{props.children}</em>;
}

function StrikethroughLeaf(props: SlateLeafProps) {
  return <del {...elementAttributes<"del">(props.attributes)}>{props.children}</del>;
}

function InlineCodeLeaf(props: SlateLeafProps) {
  return <code {...elementAttributes<"code">(props.attributes)}>{props.children}</code>;
}

function EditableParagraphElement(props: MarkdownPlateEditableElementProps) {
  const listStyleType = stringNodeProperty(props.element, "listStyleType");

  if (listStyleType === "todo") {
    return <EditableTaskListItemElement {...props} />;
  }

  if (listStyleType) {
    return <EditableListItemElement {...props} listStyleType={listStyleType} />;
  }

  return (
    <PlateElement {...props} as="p">
      {props.children}
    </PlateElement>
  );
}

function EditableListItemElement({
  children,
  element,
  listStyleType,
  ...props
}: MarkdownPlateEditableElementProps & { listStyleType: string }) {
  const listStart = numberNodeProperty(element, "listStart");
  const ordered = ORDERED_LIST_STYLES.has(listStyleType);
  const List = ordered ? "ol" : "ul";
  const listProps = ordered
    ? ({ start: listStart ?? undefined } satisfies ComponentPropsWithoutRef<"ol">)
    : ({} satisfies ComponentPropsWithoutRef<"ul">);

  return (
    <List
      className="graph-markdown-list"
      style={
        listStyleType === "disc" || listStyleType === "decimal" ? undefined : { listStyleType }
      }
      {...listProps}
    >
      <PlateElement
        {...props}
        as="li"
        className="graph-markdown-list-item"
        element={element}
        style={listItemStyle(element, undefined)}
      >
        {children}
      </PlateElement>
    </List>
  );
}

function EditableTaskListItemElement({
  children,
  element,
  ...props
}: MarkdownPlateEditableElementProps) {
  const checked = booleanNodeProperty(element, "checked");

  return (
    <ul className="graph-markdown-task-list">
      <PlateElement
        {...props}
        as="li"
        className="graph-markdown-task-list-item"
        element={element}
        style={listItemStyle(element, undefined)}
      >
        <input checked={checked} contentEditable={false} disabled readOnly type="checkbox" />
        <span>{children}</span>
      </PlateElement>
    </ul>
  );
}

function EditableBlockquoteElement(props: MarkdownPlateEditableElementProps) {
  return (
    <PlateElement {...props} as="blockquote">
      {props.children}
    </PlateElement>
  );
}

function EditableH1Element(props: MarkdownPlateEditableElementProps) {
  return renderEditableHeadingElement("h1", props);
}

function EditableH2Element(props: MarkdownPlateEditableElementProps) {
  return renderEditableHeadingElement("h2", props);
}

function EditableH3Element(props: MarkdownPlateEditableElementProps) {
  return renderEditableHeadingElement("h3", props);
}

function EditableH4Element(props: MarkdownPlateEditableElementProps) {
  return renderEditableHeadingElement("h4", props);
}

function EditableH5Element(props: MarkdownPlateEditableElementProps) {
  return renderEditableHeadingElement("h5", props);
}

function EditableH6Element(props: MarkdownPlateEditableElementProps) {
  return renderEditableHeadingElement("h6", props);
}

function renderEditableHeadingElement(
  tagName: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
  props: MarkdownPlateEditableElementProps,
) {
  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        id: stringNodeProperty(props.element, "headingId") ?? undefined,
      }}
      as={tagName}
    >
      {props.children}
    </PlateElement>
  );
}

function EditableHorizontalRuleElement(props: MarkdownPlateEditableElementProps) {
  return <PlateElement {...props} as="hr" />;
}

function EditableLinkElement(props: MarkdownPlateEditableElementProps) {
  const href = safeMarkdownHref(stringNodeProperty(props.element, "url"));

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        "data-slate-url": href ? stringNodeProperty(props.element, "url") : undefined,
        href,
      }}
      as="a"
    >
      {props.children}
    </PlateElement>
  );
}

function EditableTableElement(props: MarkdownPlateEditableElementProps) {
  return (
    <PlateElement {...props} as="table">
      <tbody>{props.children}</tbody>
    </PlateElement>
  );
}

function EditableTableRowElement(props: MarkdownPlateEditableElementProps) {
  return (
    <PlateElement {...props} as="tr">
      {props.children}
    </PlateElement>
  );
}

function EditableTableCellElement(props: MarkdownPlateEditableElementProps) {
  return (
    <PlateElement {...props} as="td">
      {props.children}
    </PlateElement>
  );
}

function EditableTableHeaderCellElement(props: MarkdownPlateEditableElementProps) {
  return (
    <PlateElement {...props} as="th">
      {props.children}
    </PlateElement>
  );
}

function EditableBoldLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="strong">
      {props.children}
    </PlateLeaf>
  );
}

function EditableItalicLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="em">
      {props.children}
    </PlateLeaf>
  );
}

function EditableStrikethroughLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="del">
      {props.children}
    </PlateLeaf>
  );
}

function EditableInlineCodeLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="code">
      {props.children}
    </PlateLeaf>
  );
}

function listItemStyle(
  element: MarkdownPlateElementNode,
  attributeStyle: CSSProperties | undefined,
): CSSProperties | undefined {
  const indent = numberNodeProperty(element, "indent");

  if (!indent || indent <= 1) {
    return attributeStyle;
  }

  return {
    ...attributeStyle,
    marginInlineStart: `${(indent - 1) * 1.5}rem`,
  };
}

function elementAttributes<TagName extends keyof React.JSX.IntrinsicElements>(
  attributes: unknown,
): ComponentPropsWithoutRef<TagName> {
  return attributes as ComponentPropsWithoutRef<TagName>;
}

function stringNodeProperty(element: MarkdownPlateElementNode, property: string): string | null {
  const value = element[property];

  return typeof value === "string" ? value : null;
}

function safeMarkdownHref(value: string | null): string | undefined {
  if (!value) return undefined;
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

function numberNodeProperty(element: MarkdownPlateElementNode, property: string): number | null {
  const value = element[property];

  return typeof value === "number" ? value : null;
}

function booleanNodeProperty(element: MarkdownPlateElementNode, property: string): boolean {
  return element[property] === true;
}
