import { describe, expect, it } from "vite-plus/test";

import {
  EmptyPreview,
  SourceEditor,
  SourcePreviewFieldEditor,
  sourcePreviewEditorFrameClassName,
  sourcePreviewPanelClassName,
  sourcePreviewTextareaClassName,
} from "@dpeek/formless-ui/source-preview";
import { renderToStaticMarkup } from "react-dom/server";

describe("SourcePreviewFieldEditor", () => {
  it("renders a textarea-backed source editor with stable source attributes", () => {
    const markup = renderToStaticMarkup(
      <SourceEditor
        aria-invalid
        onChange={() => undefined}
        placeholder="Paste SVG"
        sourceKind="svg"
        value={'<svg viewBox="0 0 24 24" />'}
      />,
    );

    expect(markup).toContain('data-web-svg-source="textarea"');
    expect(markup).toContain('data-web-field-kind="textarea"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('placeholder="Paste SVG"');
    expect(markup).toContain("&lt;svg viewBox=&quot;0 0 24 24&quot; /&gt;</textarea>");
  });

  it("supports non-graph source kinds", () => {
    const markup = renderToStaticMarkup(
      <SourceEditor onChange={() => undefined} sourceKind="script" value="console.log('ok');" />,
    );

    expect(markup).toContain('data-web-script-source="textarea"');
  });

  it("renders source mode by default", () => {
    const markup = renderToStaticMarkup(
      <SourcePreviewFieldEditor
        kind="json"
        preview={<div data-preview="ready">Preview</div>}
        source={<div data-source="ready">Source</div>}
      />,
    );

    expect(markup).toContain('data-web-source-preview-mode="source"');
    expect(markup).toContain('data-web-source-preview-panel="source"');
    expect(markup).toContain('data-web-source-preview-toggle-state="inactive"');
    expect(markup).toContain('aria-label="Show preview"');
    expect(markup).toContain('data-source="ready"');
    expect(markup).not.toContain('data-preview="ready"');
  });

  it("renders preview mode when requested", () => {
    const markup = renderToStaticMarkup(
      <SourcePreviewFieldEditor
        defaultMode="preview"
        kind="svg"
        preview={<div data-preview="ready">Preview</div>}
        source={<div data-source="ready">Source</div>}
      />,
    );

    expect(markup).toContain('data-web-source-preview-mode="preview"');
    expect(markup).toContain('data-web-source-preview-panel="preview"');
    expect(markup).toContain('data-web-source-preview-toggle-state="active"');
    expect(markup).toContain('aria-label="Hide preview"');
    expect(markup).toContain('data-preview="ready"');
    expect(markup).not.toContain('data-source="ready"');
  });

  it("keeps the shared panel styles available to browser editors", () => {
    const emptyMarkup = renderToStaticMarkup(
      <EmptyPreview attribute="source">Add source text to preview rendered output.</EmptyPreview>,
    );

    expect(sourcePreviewPanelClassName).toContain("min-h-[22rem]");
    expect(sourcePreviewEditorFrameClassName).toContain("overflow-hidden");
    expect(sourcePreviewTextareaClassName).toContain("min-h-[22rem]");
    expect(emptyMarkup).toContain('data-web-source-preview-empty="source"');
    expect(emptyMarkup).toContain("border-dashed");
  });
});
