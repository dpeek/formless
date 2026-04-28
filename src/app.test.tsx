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

describe("App", () => {
  it('renders the "/" route', () => {
    expect(renderRoute("/")).toContain("Home route");
  });

  it('renders the "/schema" route', () => {
    expect(renderRoute("/schema")).toContain("Schema route");
  });
});
