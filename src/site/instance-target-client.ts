import {
  FORMLESS_DEPLOY_METADATA_PATH,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";
import type { AppInstallsResponse, OwnerSetupStatusResponse } from "../shared/protocol.ts";
import { normalizeFormlessInstanceWorkspaceTargetUrl } from "./instance-workspace-config.ts";

const OWNER_SETUP_STATUS_API_PATH = "/api/formless/setup";
const APP_INSTALLS_API_PATH = "/api/formless/app-installs";

export type FormlessInstanceTargetStatus = {
  appRegistry: AppInstallsResponse;
  deployMetadata: FormlessInstanceTargetDeployMetadata;
  ownerSetup: OwnerSetupStatusResponse;
  targetUrl: string;
};

export type FormlessInstanceTargetDeployMetadata = {
  cacheControl: string;
  metadataUrl: string;
  version: string | null;
};

export type FormlessInstanceTargetClientDependencies = {
  fetch: typeof fetch;
};

export async function readFormlessInstanceTargetStatus(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetStatus> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const [deployMetadata, ownerSetup, appRegistry] = await Promise.all([
    readFormlessInstanceDeployMetadata({ targetUrl }, dependencies),
    readFormlessInstanceOwnerSetupStatus({ targetUrl }, dependencies),
    readFormlessInstanceAppRegistry({ targetUrl }, dependencies),
  ]);

  return {
    appRegistry,
    deployMetadata,
    ownerSetup,
    targetUrl,
  };
}

export async function readFormlessInstanceDeployMetadata(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetDeployMetadata> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const metadataUrl = apiUrl(targetUrl, FORMLESS_DEPLOY_METADATA_PATH);
  const response = await dependencies.fetch(metadataUrl, {
    headers: { accept: "application/json" },
  });
  const metadata = parseDeployMetadata(
    await readJsonResponse(response, `GET ${metadataUrl}`),
    metadataUrl,
  );

  return {
    cacheControl: response.headers.get("Cache-Control") ?? "",
    metadataUrl,
    version: metadata.version,
  };
}

export async function readFormlessInstanceOwnerSetupStatus(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OwnerSetupStatusResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = apiUrl(targetUrl, OWNER_SETUP_STATUS_API_PATH);

  return parseOwnerSetupStatus(
    await fetchJson(dependencies.fetch, statusUrl, { headers: { accept: "application/json" } }),
    statusUrl,
  );
}

export async function readFormlessInstanceAppRegistry(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<AppInstallsResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const registryUrl = apiUrl(targetUrl, APP_INSTALLS_API_PATH);

  return parseAppRegistry(
    await fetchJson(dependencies.fetch, registryUrl, { headers: { accept: "application/json" } }),
    registryUrl,
  );
}

async function fetchJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init);

  return readJsonResponse(response, `GET ${url}`);
}

async function readJsonResponse(response: Response, context: string): Promise<unknown> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} failed: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} failed: response was not JSON.`);
  }
}

function parseDeployMetadata(value: unknown, context: string): FormlessDeployMetadata {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: deploy metadata must be an object.`);
  }

  if (value.version !== null && typeof value.version !== "string") {
    throw new Error(`${context} failed: deploy metadata version must be a string or null.`);
  }

  return {
    version: value.version,
  };
}

function parseOwnerSetupStatus(value: unknown, context: string): OwnerSetupStatusResponse {
  if (!isRecord(value) || typeof value.setupComplete !== "boolean") {
    throw new Error(`${context} failed: setup status must include setupComplete.`);
  }

  return {
    setupComplete: value.setupComplete,
    ...(isRecord(value.owner) ? { owner: value.owner as OwnerSetupStatusResponse["owner"] } : {}),
  };
}

function parseAppRegistry(value: unknown, context: string): AppInstallsResponse {
  if (!isRecord(value) || !Array.isArray(value.packages) || !Array.isArray(value.installs)) {
    throw new Error(`${context} failed: app registry must include packages and installs arrays.`);
  }

  return {
    installs: value.installs as AppInstallsResponse["installs"],
    packages: value.packages as AppInstallsResponse["packages"],
  };
}

function apiUrl(targetUrl: string, apiPath: string): string {
  return new URL(apiPath, `${targetUrl}/`).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
