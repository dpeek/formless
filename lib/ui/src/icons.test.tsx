import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  CloseIcon,
  ConfirmIcon,
  ControlCheckIcon,
  ControlCloseIcon,
  ControlCopyIcon,
  CopyIcon,
  DragHandleIcon,
  TableDragHandleIcon,
  TableSortIcon,
  TableTreeDisclosureIcon,
} from "@dpeek/formless-ui/icons";

describe("icon intents", () => {
  it("renders purpose-first icons as SVG components with caller accessibility props", () => {
    const markup = renderToStaticMarkup(
      <div>
        <ConfirmIcon aria-hidden="true" data-icon="confirm" />
        <CopyIcon aria-label="Copy code" data-icon="copy" />
        <CloseIcon aria-hidden="true" data-icon="close" />
        <DragHandleIcon aria-hidden="true" data-icon="drag-handle" />
      </div>,
    );

    expect(markup).toContain('data-icon="confirm"');
    expect(markup).toContain('data-icon="copy"');
    expect(markup).toContain('data-icon="close"');
    expect(markup).toContain('data-icon="drag-handle"');
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup.match(/<svg/g)?.length).toBe(4);
  });

  it("keeps compatibility control icon aliases", () => {
    const markup = renderToStaticMarkup(
      <div>
        <ControlCheckIcon aria-hidden="true" data-icon="check" />
        <ControlCopyIcon aria-label="Copy code" data-icon="copy" />
        <ControlCloseIcon aria-hidden="true" data-icon="close" />
      </div>,
    );

    expect(markup).toContain('data-icon="check"');
    expect(markup).toContain('data-icon="copy"');
    expect(markup).toContain('data-icon="close"');
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup.match(/<svg/g)?.length).toBe(3);
  });

  it("keeps compatibility table icon aliases", () => {
    const markup = renderToStaticMarkup(
      <div>
        <TableSortIcon aria-hidden="true" data-icon="table-sort" />
        <TableTreeDisclosureIcon aria-hidden="true" data-icon="table-tree-disclosure" />
        <TableDragHandleIcon aria-hidden="true" data-icon="table-drag-handle" />
      </div>,
    );

    expect(markup).toContain('data-icon="table-sort"');
    expect(markup).toContain('data-icon="table-tree-disclosure"');
    expect(markup).toContain('data-icon="table-drag-handle"');
    expect(markup.match(/<svg/g)?.length).toBe(3);
  });
});
