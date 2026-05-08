import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "@formless/ui/global.css";
import "./style.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

createRoot(app).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
