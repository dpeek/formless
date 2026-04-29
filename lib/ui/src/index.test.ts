import { describe, expect, it } from "vite-plus/test";

import { Button, cn, MarkdownRenderer } from "@formless/ui";

describe("web ui root export", () => {
  it("re-exports browser primitives used by shell packages", () => {
    expect(typeof Button).toBe("function");
    expect(typeof MarkdownRenderer).toBe("function");
    expect(cn("a", false, "b")).toBe("a b");
  });
});
