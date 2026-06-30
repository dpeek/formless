import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FormlessRoot } from "./root.tsx";
import "./global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <FormlessRoot />
  </StrictMode>,
);
