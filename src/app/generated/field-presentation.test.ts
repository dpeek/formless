import { describe, expect, it } from "vite-plus/test";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import { resolveFieldPresentationIcon } from "./field-presentation.tsx";

describe("field presentation icons", () => {
  it("resolves schema presentation tokens through the central icon catalog", () => {
    expect(resolveFieldPresentationIcon("flag")).toEqual({
      kind: "svg",
      source: resolveIconCatalogSvg("priority-marker"),
    });
    expect(resolveFieldPresentationIcon("github")).toEqual({
      kind: "svg",
      source: resolveIconCatalogSvg("github"),
    });
  });

  it("leaves unknown schema presentation tokens unresolved for visible text fallback", () => {
    expect(resolveFieldPresentationIcon("missing")).toBeUndefined();
  });
});
