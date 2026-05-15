export type LocalSitePublishBrokerConfig = {
  endpoint: string;
  token: string;
};

export type LocalSitePublishResult = {
  publish: {
    backupPath: string | null;
    mode: "apply" | "dry-run";
    sourceRecordCount: number;
    target: string | null;
  };
  save: {
    mediaCount: number;
    recordCount: number;
    source: string;
  };
};

type LocalSitePublishBrokerResponse =
  | { ok: true; result: LocalSitePublishResult }
  | { error: string; ok: false };

export async function triggerLocalSitePublish(
  config: LocalSitePublishBrokerConfig,
  fetcher: typeof fetch = fetch,
): Promise<LocalSitePublishResult> {
  const response = await fetcher(config.endpoint, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.token}`,
    },
    method: "POST",
  });
  const body = await parseBrokerResponse(response);

  if (!response.ok) {
    throw new Error(body.ok ? `Publish failed with HTTP ${response.status}.` : body.error);
  }

  if (!body.ok) {
    throw new Error(body.error);
  }

  return body.result;
}

async function parseBrokerResponse(response: Response): Promise<LocalSitePublishBrokerResponse> {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as unknown;

    if (isBrokerResponse(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to the generic error below.
  }

  return {
    error: text || `Publish failed with HTTP ${response.status}.`,
    ok: false,
  };
}

function isBrokerResponse(value: unknown): value is LocalSitePublishBrokerResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return isRecord(value.result);
  }

  return typeof value.error === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
