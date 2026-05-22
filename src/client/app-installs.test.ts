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
