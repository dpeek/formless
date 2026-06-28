import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { RouterProvider } from "@dpeek/formless-ui/router-provider";
import { useLocation } from "wouter";
import { App } from "./app.tsx";
import "@dpeek/formless-ui/global.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

const appTree = (
  <StrictMode>
    <FormlessRouterProvider>
      <App />
    </FormlessRouterProvider>
  </StrictMode>
);

if (app.hasChildNodes()) {
  hydrateRoot(app, appTree);
} else {
  createRoot(app).render(appTree);
}

function FormlessRouterProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  return <RouterProvider navigate={(path) => navigate(String(path))}>{children}</RouterProvider>;
}
