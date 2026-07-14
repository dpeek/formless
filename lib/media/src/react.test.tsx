import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { MediaFieldControl } from "./react.tsx";

describe("Media React field control", () => {
  it("renders media asset picker, upload trigger, and resolved preview", () => {
    const html = renderMediaFieldControl({
      draft: "hero.webp",
      mediaAssetOptions: [{ href: "/media/hero.webp", id: "hero.webp", label: "Hero" }],
      mediaPreviewHref: "/media/hero.webp",
    });

    expect(html).toContain('data-web-media-field-preview="image"');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/gif"');
    expect(html).toContain('aria-label="Image asset"');
    expect(html).toContain('value="hero.webp"');
    expect(html).toContain(">Hero</option>");
    expect(html).toContain('src="/media/hero.webp"');
  });

  it("renders broken asset state when an asset id has no preview href", () => {
    const html = renderMediaFieldControl({
      draft: "missing.webp",
      mediaAssetOptions: [],
      mediaPreviewHref: undefined,
    });

    expect(html).toContain('data-web-media-field-preview="broken"');
    expect(html).toContain("Missing image");
    expect(html).not.toContain("missing.webp</option>");
  });

  it("renders optional removal without a raw URL or asset-id input", () => {
    const html = renderMediaFieldControl({
      draft: "",
      mediaAssetOptions: [],
    });

    expect(html).toContain('<option value="" selected="">Unset</option>');
    expect(html).not.toContain('type="text"');
    expect(html).not.toContain("URL");
  });
});

function renderMediaFieldControl(
  props: Partial<Parameters<typeof MediaFieldControl>[0]> & { draft: string },
) {
  return renderToStaticMarkup(
    <MediaFieldControl
      controlDisabled={props.controlDisabled ?? false}
      density={props.density ?? "default"}
      draft={props.draft}
      invalid={props.invalid ?? false}
      label={props.label ?? "Image"}
      mediaAssetOptions={props.mediaAssetOptions ?? []}
      mediaPreviewHref={props.mediaPreviewHref}
      onFileSelect={props.onFileSelect ?? noopFile}
      onMediaAssetSelect={props.onMediaAssetSelect ?? noop}
      required={props.required ?? false}
      uploadDisabled={props.uploadDisabled ?? false}
    />,
  );
}

function noop(_value: string) {}

function noopFile(_file: File | undefined) {}
