import { describe, expect, it } from "vite-plus/test";

import {
  Button,
  cn,
  FormattedNumberInput,
  MarkdownRenderer,
  SvgIcon,
  ValueUnitInput,
} from "@dpeek/formless-ui";

describe("web ui root export", () => {
  it("re-exports browser primitives used by shell packages", () => {
    expect(typeof Button).toBe("function");
    expect(typeof FormattedNumberInput).toBe("function");
    expect(typeof MarkdownRenderer).toBe("function");
    expect(typeof SvgIcon).toBe("function");
    expect(typeof ValueUnitInput).toBe("function");
    expect(cn("a", false, "b")).toBe("a b");
  });
});
