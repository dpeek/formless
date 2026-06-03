import { describe, expect, it } from "vite-plus/test";
import {
  AppInstallApiError,
  createInstanceAppInstall,
  fetchInstanceAppInstalls,
  INSTANCE_APP_INSTALLS_API_PATH,
} from "./app-installs.ts";

describe("client app install API helpers", () => {
  it("fetches installed app registry state", async () => {
    const response = await fetchInstanceAppInstalls({
      fetcher: jsonFetcher(INSTANCE_APP_INSTALLS_API_PATH, {
        packages: [],
        installs: [],
      }),
    });

    expect(response).toEqual({ packages: [], installs: [] });
  });

  it("creates an app install and surfaces API errors", async () => {
    const created = await createInstanceAppInstall(
      {
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      },
      {
        fetcher: jsonFetcher(
          INSTANCE_APP_INSTALLS_API_PATH,
          {
            initialization: {
              installId: "personal",
              packageAppKey: "site",
              seedRecordsKey: "site",
              sourceSchemaKey: "site",
            },
            install: { installId: "personal" },
            installs: [{ installId: "personal" }],
          },
          { expectedMethod: "POST", status: 201 },
        ),
      },
    );

    expect(created.install).toEqual({ installId: "personal" });

    await expect(
      createInstanceAppInstall(
        {
          packageAppKey: "site",
          installId: "personal",
          label: "Other Site",
        },
        {
          fetcher: jsonFetcher(
            INSTANCE_APP_INSTALLS_API_PATH,
            {
              code: "duplicate-install-id",
              error: 'Install id "personal" is already installed.',
              field: "installId",
            },
            { expectedMethod: "POST", status: 409 },
          ),
        },
      ),
    ).rejects.toMatchObject({
      body: {
        code: "duplicate-install-id",
        error: 'Install id "personal" is already installed.',
        field: "installId",
      },
      message: 'Install id "personal" is already installed.',
      name: "AppInstallApiError",
      status: 409,
    } satisfies Partial<AppInstallApiError>);
  });

  it("uses same-origin browser credentials without admin bearer headers", async () => {
    const calls: Array<{
      authorization: string | null;
      credentials: RequestCredentials | undefined;
      input: string;
      method: string;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        authorization: new Headers(init?.headers).get("Authorization"),
        credentials: init?.credentials,
        input: requestUrl(input),
        method: init?.method ?? "GET",
      });

      if (init?.method === "POST") {
        return Response.json(
          {
            initialization: {
              installId: "site",
              packageAppKey: "site",
              seedRecordsKey: "site",
              sourceSchemaKey: "site",
            },
            install: { installId: "site" },
            installs: [{ installId: "site" }],
          },
          { status: 201 },
        );
      }

      return Response.json({ packages: [], installs: [] });
    };

    await fetchInstanceAppInstalls({ fetcher });
    await createInstanceAppInstall(
      {
        packageAppKey: "site",
        installId: "site",
        label: "Site",
      },
      { fetcher },
    );

    expect(calls).toEqual([
      {
        authorization: null,
        credentials: "same-origin",
        input: INSTANCE_APP_INSTALLS_API_PATH,
        method: "GET",
      },
      {
        authorization: null,
        credentials: "same-origin",
        input: INSTANCE_APP_INSTALLS_API_PATH,
        method: "POST",
      },
    ]);
  });
});

function jsonFetcher(
  expectedPath: string,
  body: unknown,
  options: { expectedMethod?: string; status?: number } = {},
): typeof fetch {
  return async (input, init) => {
    expect(requestUrl(input)).toBe(expectedPath);
    expect(init?.method ?? "GET").toBe(options.expectedMethod ?? "GET");

    return Response.json(body, { status: options.status ?? 200 });
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}
