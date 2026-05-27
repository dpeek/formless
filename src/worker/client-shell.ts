import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  runtimeTopologyRoutes,
} from "../shared/runtime-topology.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { MappedAppHost } from "./mapped-app-host.ts";
import {
  shouldServeMappedAppHostClientShell,
  type WorkerRuntimeRequestTopology,
} from "./routing.ts";

type ClientAssetEnv = {
  ASSETS?: Fetcher;
};

export async function handleClientAssetRequest(
  request: Request,
  env: ClientAssetEnv,
  options: { mappedAppHost?: MappedAppHost; runtimeTopology?: WorkerRuntimeRequestTopology } = {},
): Promise<Response | undefined> {
  if (!env.ASSETS) {
    return undefined;
  }

  if (options.mappedAppHost && shouldServeMappedAppHostShell(request, options.runtimeTopology)) {
    const shellResponse = await env.ASSETS.fetch(
      clientShellAssetRequest(getEquivalentRequestForHead(request)),
    );

    if (!isHtmlResponse(shellResponse)) {
      return responseWithoutBodyForHead(request, shellResponse);
    }

    const shellHtml = await shellResponse.text();
    const response = injectMappedAppHostDocumentHints(
      shellResponse,
      shellHtml,
      options.mappedAppHost,
    );

    return responseWithoutBodyForHead(request, response);
  }

  return env.ASSETS.fetch(request);
}

function shouldServeMappedAppHostShell(
  request: Request,
  runtimeTopology?: WorkerRuntimeRequestTopology,
): boolean {
  return shouldServeMappedAppHostClientShell(request, runtimeTopology);
}

function clientShellAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = runtimeTopologyRoutes.clientShellAssetPath;
  url.search = "";
  url.hash = "";

  return new Request(url, {
    headers: request.headers,
    method: "GET",
  });
}

function injectMappedAppHostDocumentHints(
  response: Response,
  html: string,
  mappedAppHost: MappedAppHost,
): Response {
  const headers = new Headers(response.headers);

  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.delete("Content-Length");

  return new Response(injectHeadHtml(html, mappedAppHostHints(mappedAppHost)), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function mappedAppHostHints(mappedAppHost: MappedAppHost): string {
  return `
    <meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="app" />
    <meta name="${FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME}" content="${escapeHtmlAttribute(mappedAppHost.installId)}" />
    <meta name="${FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME}" content="${escapeHtmlAttribute(mappedAppHost.target.packageAppKey)}" />`;
}

function injectHeadHtml(html: string, injectedHtml: string): string {
  return html.replace(/<head\b[^>]*>/i, (match) => `${match}${injectedHtml}`);
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get("Content-Type") ?? "").toLowerCase().includes("text/html");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
