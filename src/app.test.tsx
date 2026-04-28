import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vite-plus/test";
import { App } from "./app.tsx";

function renderRoute(path: string) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App />
    </Router>,
  );
}

describe("App smoke routes", () => {
  it('renders the "/" route', () => {
    const html = renderRoute("/");

    expect(html).toContain("Loading active schema...");
    expect(html).not.toContain("Create Note");
  });

  it('renders the "/schema" route', () => {
    const html = renderRoute("/schema");

    expect(html).toContain("Loading active schema.");
    expect(html).not.toContain("&quot;note&quot;");
    expect(html).toContain("Save schema");
  });
});
