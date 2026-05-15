import { describe, expect, it } from "vite-plus/test";

import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { renderToStaticMarkup } from "react-dom/server";

describe("SvgIcon", () => {
  it("renders safe SVG source into the React tree", () => {
    const markup = renderToStaticMarkup(
      <SvgIcon
        source={
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12h16" stroke-width="2" stroke-linecap="round" /><circle cx="12" cy="12" r="3" /></svg>'
        }
      />,
    );

    expect(markup).toContain('data-web-svg-icon="svg"');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('<path d="M4 12h16" stroke-width="2" stroke-linecap="round"></path>');
    expect(markup).toContain('<circle cx="12" cy="12" r="3"></circle>');
  });

  it("renders an empty outline for missing source", () => {
    const markup = renderToStaticMarkup(<SvgIcon source="" />);

    expect(markup).toContain('data-web-svg-icon="empty"');
    expect(markup).toContain('data-web-svg-icon-empty="true"');
    expect(markup).toContain("<rect");
    expect(markup).not.toContain('data-web-svg-icon="svg"');
  });

  it("renders an empty outline for malformed SVG", () => {
    const markup = renderToStaticMarkup(<SvgIcon source="<svg><g></svg>" />);

    expect(markup).toContain('data-web-svg-icon="empty"');
    expect(markup).not.toContain("<g>");
  });

  it("strips event handler attributes from otherwise safe SVG", () => {
    const markup = renderToStaticMarkup(
      <SvgIcon
        source={
          '<svg viewBox="0 0 24 24" onload="alert(1)"><path onclick="alert(1)" d="M4 4h16v16H4z" /></svg>'
        }
      />,
    );

    expect(markup).toContain('data-web-svg-icon="svg"');
    expect(markup).toContain('<path d="M4 4h16v16H4z"></path>');
    expect(markup).not.toContain("onload");
    expect(markup).not.toContain("onclick");
  });

  it("rejects script elements", () => {
    const markup = renderToStaticMarkup(
      <SvgIcon source={'<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>'} />,
    );

    expect(markup).toContain('data-web-svg-icon="empty"');
    expect(markup).not.toContain("<script");
  });

  it("rejects foreignObject elements", () => {
    const markup = renderToStaticMarkup(
      <SvgIcon
        source={'<svg viewBox="0 0 24 24"><foreignObject><p>HTML</p></foreignObject></svg>'}
      />,
    );

    expect(markup).toContain('data-web-svg-icon="empty"');
    expect(markup).not.toContain("foreignObject");
  });

  it("rejects javascript URLs", () => {
    const markup = renderToStaticMarkup(
      <SvgIcon
        source={
          '<svg viewBox="0 0 24 24"><path href="javascript:alert(1)" d="M4 4h16v16H4z" /></svg>'
        }
      />,
    );

    expect(markup).toContain('data-web-svg-icon="empty"');
    expect(markup).not.toContain("javascript:");
  });

  it("rejects external asset references", () => {
    const markup = renderToStaticMarkup(
      <SvgIcon
        source={
          '<svg viewBox="0 0 24 24"><path fill="url(https://example.com/pattern.svg)" d="M4 4h16v16H4z" /></svg>'
        }
      />,
    );

    expect(markup).toContain('data-web-svg-icon="empty"');
    expect(markup).not.toContain("https://example.com");
  });
});
