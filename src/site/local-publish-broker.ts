import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type SiteProjectLocalPublishBroker = {
  close: () => Promise<void>;
  endpoint: string;
  token: string;
};

export type SiteProjectLocalAdminPublishResult = {
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

export type SiteProjectLocalPublishBrokerDependencies = {
  randomToken: () => string;
  runPublish: (input: {
    projectPath: string;
    source: string;
  }) => Promise<SiteProjectLocalAdminPublishResult>;
};

export async function startSiteProjectLocalPublishBroker(
  input: { projectPath: string; source: () => string | null },
  dependencies: SiteProjectLocalPublishBrokerDependencies,
): Promise<SiteProjectLocalPublishBroker> {
  const token = dependencies.randomToken();
  let isPublishing = false;
  const server = createServer((request, response) => {
    void handleLocalPublishBrokerRequest({
      dependencies,
      input,
      isPublishing: () => isPublishing,
      request,
      response,
      setPublishing: (nextPublishing) => {
        isPublishing = nextPublishing;
      },
      token,
    });
  });
  const endpoint = await listenLocalPublishBroker(server);

  return {
    close: () => closeLocalPublishBroker(server),
    endpoint,
    token,
  };
}

async function handleLocalPublishBrokerRequest({
  dependencies,
  input,
  isPublishing,
  request,
  response,
  setPublishing,
  token,
}: {
  dependencies: SiteProjectLocalPublishBrokerDependencies;
  input: { projectPath: string; source: () => string | null };
  isPublishing: () => boolean;
  request: IncomingMessage;
  response: ServerResponse;
  setPublishing: (isPublishing: boolean) => void;
  token: string;
}) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization,content-type,accept");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Max-Age", "600");

  const pathname = localPublishBrokerPathname(request);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (pathname !== "/publish") {
    writeLocalPublishBrokerJson(response, 404, {
      error: "Local publish broker endpoint not found.",
      ok: false,
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST,OPTIONS");
    writeLocalPublishBrokerJson(response, 405, {
      error: "Local publish broker only accepts POST.",
      ok: false,
    });
    return;
  }

  if (request.headers.authorization !== `Bearer ${token}`) {
    writeLocalPublishBrokerJson(response, 401, {
      error: "Local publish broker token is invalid.",
      ok: false,
    });
    return;
  }

  if (isPublishing()) {
    writeLocalPublishBrokerJson(response, 409, {
      error: "A Site publish is already running.",
      ok: false,
    });
    return;
  }

  const source = input.source();

  if (!source) {
    writeLocalPublishBrokerJson(response, 503, {
      error: "Site project dev server is not ready.",
      ok: false,
    });
    return;
  }

  setPublishing(true);

  try {
    const result = await dependencies.runPublish({
      projectPath: input.projectPath,
      source,
    });

    writeLocalPublishBrokerJson(response, 200, {
      ok: true,
      result: localAdminPublishResponse(result),
    });
  } catch (error) {
    writeLocalPublishBrokerJson(response, 500, {
      error: errorMessage(error),
      ok: false,
    });
  } finally {
    setPublishing(false);
  }
}

function localPublishBrokerPathname(request: IncomingMessage): string {
  try {
    const host = request.headers.host ?? "127.0.0.1";

    return new URL(request.url ?? "/", `http://${host}`).pathname;
  } catch {
    return "/";
  }
}

function localAdminPublishResponse(result: SiteProjectLocalAdminPublishResult) {
  return {
    publish: {
      backupPath: result.publish.backupPath,
      mode: result.publish.mode,
      sourceRecordCount: result.publish.sourceRecordCount,
      target: result.publish.target,
    },
    save: {
      mediaCount: result.save.mediaCount,
      recordCount: result.save.recordCount,
      source: result.save.source,
    },
  };
}

function writeLocalPublishBrokerJson(
  response: ServerResponse,
  status: number,
  body:
    | { error: string; ok: false }
    | { ok: true; result: ReturnType<typeof localAdminPublishResponse> },
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function listenLocalPublishBroker(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const rejectOnError = (error: Error) => {
      reject(error);
    };

    server.once("error", rejectOnError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectOnError);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Local publish broker did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}/publish`;
}

async function closeLocalPublishBroker(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
