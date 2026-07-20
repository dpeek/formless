import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SourceIcon } from "./field-primitives.tsx";

describe("Astryx source SVG icon", () => {
  it("renders safe source during server rendering and strips event handlers", () => {
    const source =
      '<svg viewBox="0 0 24 24" onload="alert(1)"><path onclick="alert(1)" d="M4 12h16" /></svg>';
    const markup = renderToStaticMarkup(<SourceIcon source={source} aria-hidden />);

    expect(markup).toContain('<path d="M4 12h16"></path>');
    expect(markup).not.toContain("onload");
    expect(markup).not.toContain("onclick");
  });

  it.each([
    ["missing", undefined],
    ["malformed", "<svg><g></svg>"],
    ["script", '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M4 12h16" /></svg>'],
    ["foreign object", '<svg viewBox="0 0 24 24"><foreignObject><p>HTML</p></foreignObject></svg>'],
    [
      "javascript URL",
      '<svg viewBox="0 0 24 24"><path href="java&#x73;cript:alert(1)" d="M4 12h16" /></svg>',
    ],
    [
      "external asset",
      '<svg viewBox="0 0 24 24"><path fill="url(https://example.com/pattern.svg)" d="M4 12h16" /></svg>',
    ],
  ] as const)("renders an empty outline for %s source", (_name, source) => {
    const markup = renderToStaticMarkup(<SourceIcon source={source} aria-hidden />);

    expect(markup).toContain("<rect");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("foreignObject");
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("https://example.com");
  });
});
