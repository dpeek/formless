import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { useLocation } from "wouter";
import { App } from "./app.tsx";
import { AstryxApplicationRoot } from "./app/astryx-application-root.tsx";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

const appTree = (
  <StrictMode>
    <ApplicationRoot>
      <App />
    </ApplicationRoot>
  </StrictMode>
);

if (app.hasChildNodes()) {
  hydrateRoot(app, appTree);
} else {
  createRoot(app).render(appTree);
}

function ApplicationRoot({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  return (
    <AstryxApplicationRoot navigate={(path) => navigate(path)}>{children}</AstryxApplicationRoot>
  );
}
