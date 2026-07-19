import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { SitePageRoute } from "@dpeek/formless-site-app/public/react";
import {
  AstryxSitePageRenderer,
  AstryxSitePublicSystemStateRenderer,
} from "@dpeek/formless-astryx/site/renderer";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/browser";
import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
} from "./shared/runtime-topology.ts";
import "@dpeek/formless-astryx/site/global.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

const appTree = (
  <StrictMode>
    <SitePageRoute
      apiRoutePrefix={publicSiteApiRoutePrefix()}
      builtInRenderer={AstryxSitePageRenderer}
      builtInSystemStateRenderer={AstryxSitePublicSystemStateRenderer}
      linkMode="published"
      slug={normalizeSiteRoutePath(window.location.pathname)}
      workspaceRenderer={workspaceSitePublicRenderer}
    />
  </StrictMode>
);

if (app.hasChildNodes()) {
  hydrateRoot(app, appTree);
} else {
  createRoot(app).render(appTree);
}

function publicSiteApiRoutePrefix(): `/${string}` {
  const installId = runtimeMetaContent(FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME);
  const packageAppKey = runtimeMetaContent(FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME);

  if (installId && packageAppKey) {
    return `/api/app-installs/${encodeURIComponent(packageAppKey)}/${encodeURIComponent(
      installId,
    )}` as `/${string}`;
  }

  return "/api/site";
}

function runtimeMetaContent(name: string): string | undefined {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? undefined;
}

function normalizeSiteRoutePath(slug: string): string {
  const trimmed = slug.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  return trimmed === "" ? "home" : trimmed;
}
