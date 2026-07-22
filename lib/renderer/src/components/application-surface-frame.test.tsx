import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
  AstryxApplicationSurfaceFrame,
  astryxApplicationSurfaceFramePolicy,
} from "./application-surface-frame.tsx";
import { AstryxTableRenderer } from "./table-renderer.tsx";
import { createTableFixtures } from "./tables.fixtures.ts";

describe("Astryx application surface frame", () => {
  it("owns the responsive token gutters and semantic width caps", () => {
    expect(astryxApplicationSurfaceFramePolicy).toEqual({
      gutters: [
        { minimumViewportWidth: 0, spacing: 4 },
        { minimumViewportWidth: 768, spacing: 6 },
        { minimumViewportWidth: 1024, spacing: 8 },
      ],
      widthCaps: {
        narrow: 760,
        standard: 1200,
        wide: 1600,
      },
    });

    for (const [width, cap] of Object.entries(astryxApplicationSurfaceFramePolicy.widthCaps)) {
      const html = renderToStaticMarkup(
        <AstryxApplicationSurfaceFrame
          width={width as keyof typeof astryxApplicationSurfaceFramePolicy.widthCaps}
        >
          <article>{width}</article>
        </AstryxApplicationSurfaceFrame>,
      );

      expect(html).toContain(`max-width:${cap}px`);
      expect(html).toContain(`<article>${width}</article>`);
    }
  });

  it("keeps a wide table's horizontal scroll boundary inside the framed content", () => {
    const table = createTableFixtures().find((fixture) => fixture.id === "active")?.table;
    if (!table) {
      throw new Error("Missing active table fixture.");
    }

    const html = renderToStaticMarkup(
      <AstryxApplicationSurfaceFrame width="wide">
        <AstryxTableRenderer
          onFieldIntent={() => undefined}
          onOperationIntent={() => undefined}
          onTableIntent={() => undefined}
          table={table}
        />
      </AstryxApplicationSurfaceFrame>,
    );

    expect(html).toContain("max-width:1600px");
    expect(html).toContain('aria-label="Table"');
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="0"');
  });
});
