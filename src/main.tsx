import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "@dpeek/formless-ui/global.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

const appTree = (
  <StrictMode>
    <App />
  </StrictMode>
);

if (app.hasChildNodes()) {
  hydrateRoot(app, appTree);
} else {
  createRoot(app).render(appTree);
}
