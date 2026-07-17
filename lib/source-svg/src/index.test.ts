import { describe, expect, it } from "vite-plus/test";

import { parseSourceSvg } from "./index.ts";

describe("parseSourceSvg", () => {
  it("parses the safe shared SVG subset", () => {
    expect(
      parseSourceSvg(
        '<svg viewBox="0 0 24 24"><title>Arrow</title><path d="M4 12h16" stroke-width="2" /></svg>',
      ),
    ).toMatchObject({
      attributes: { viewBox: "0 0 24 24" },
      children: [
        { children: ["Arrow"], tagName: "title" },
        { attributes: { d: "M4 12h16", strokeWidth: "2" }, tagName: "path" },
      ],
      tagName: "svg",
    });
  });

  it.each([
    "<svg><script>alert(1)</script></svg>",
    "<svg><foreignObject><p>HTML</p></foreignObject></svg>",
    '<svg><path href="javascript:alert(1)" /></svg>',
    '<svg><path fill="url(https://example.com/pattern.svg)" /></svg>',
  ])("rejects unsafe source: %s", (source) => {
    expect(parseSourceSvg(source)).toBeNull();
  });

  it("drops event handlers without rejecting otherwise safe source", () => {
    expect(
      parseSourceSvg('<svg onload="alert(1)"><path onclick="alert(1)" d="M0 0" /></svg>'),
    ).toMatchObject({ children: [{ attributes: { d: "M0 0" } }], attributes: {} });
  });
});
