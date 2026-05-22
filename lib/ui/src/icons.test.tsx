import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  ControlCheckIcon,
  ControlCloseIcon,
  ControlCopyIcon,
  TableDragHandleIcon,
  TableSortIcon,
  TableTreeDisclosureIcon,
} from "@dpeek/formless-ui/icons";

describe("icon intents", () => {
  it("renders semantic control icons as SVG components with caller accessibility props", () => {
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

  it("exposes table icons through Lucide aliases", () => {
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
