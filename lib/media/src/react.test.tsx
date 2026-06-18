import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { MediaFieldControl } from "./react.tsx";

describe("Media React field control", () => {
  it("renders media asset picker, upload trigger, and resolved preview", () => {
    const html = renderMediaFieldControl({
      draft: "hero.webp",
      mediaAssetOptions: [{ href: "/media/hero.webp", id: "hero.webp", label: "Hero" }],
      mediaEditorMode: "asset",
      mediaPreviewHref: "/media/hero.webp",
    });

    expect(html).toContain('data-web-media-field-mode="asset"');
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
      mediaEditorMode: "asset",
      mediaPreviewHref: undefined,
    });

    expect(html).toContain('data-web-media-field-preview="broken"');
    expect(html).toContain("Missing image");
    expect(html).toContain("Current asset: missing.webp");
  });

  it("renders manual URL fallback without the asset picker", () => {
    const html = renderMediaFieldControl({
      draft: "/manual.webp",
      fieldKind: "image",
      mediaEditorMode: "url",
      uploadDisabled: true,
    });

    expect(html).toContain('data-web-image-field-preview="image"');
    expect(html).toContain('aria-label="Image URL"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("Current asset:");
  });

  it("keeps generic generated labels and validation placement outside the adapter output", () => {
    const html = renderMediaFieldControl({
      draft: "/manual.webp",
      fieldKind: "image",
      invalid: true,
      label: "Hero image",
      mediaEditorMode: "url",
    });

    expect(html).toContain('aria-label="Hero image URL"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('title="Upload Hero image"');
    expect(html).not.toContain('data-slot="label"');
    expect(html).not.toContain(">Hero image</label>");
  });
});

function renderMediaFieldControl(
  props: Partial<Parameters<typeof MediaFieldControl>[0]> & {
    draft: string;
    mediaEditorMode: "asset" | "url";
  },
) {
  return renderToStaticMarkup(
    <MediaFieldControl
      controlDisabled={props.controlDisabled ?? false}
      density={props.density ?? "default"}
      draft={props.draft}
      fieldKind={props.fieldKind ?? "media"}
      invalid={props.invalid ?? false}
      label={props.label ?? "Image"}
      mediaAssetOptions={props.mediaAssetOptions ?? []}
      mediaEditorMode={props.mediaEditorMode}
      mediaPreviewHref={props.mediaPreviewHref}
      onDraftChange={props.onDraftChange ?? noop}
      onFileSelect={props.onFileSelect ?? noopFile}
      onMediaAssetSelect={props.onMediaAssetSelect ?? noop}
      onUrlBlur={props.onUrlBlur ?? noop}
      onUrlEnter={props.onUrlEnter ?? noop}
      onUrlEscape={props.onUrlEscape ?? noopVoid}
      required={props.required ?? false}
      uploadDisabled={props.uploadDisabled ?? false}
    />,
  );
}

function noop(_value: string) {}

function noopFile(_file: File | undefined) {}

function noopVoid() {}
