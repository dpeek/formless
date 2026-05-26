import { describe, expect, it } from "vite-plus/test";
import {
  createInstanceDomainMapping,
  deleteInstanceDomainMapping,
  DomainMappingApiError,
  fetchInstanceDomainMappings,
  INSTANCE_DOMAIN_MAPPINGS_API_PATH,
} from "./domain-mappings.ts";

describe("client domain mapping API helpers", () => {
  it("fetches desired domain mapping state", async () => {
    const response = await fetchInstanceDomainMappings({
      fetcher: jsonFetcher(INSTANCE_DOMAIN_MAPPINGS_API_PATH, {
        appliedStates: [],
        auditEvents: [],
        mappings: [],
      }),
    });

    expect(response).toEqual({ appliedStates: [], auditEvents: [], mappings: [] });
  });

  it("creates a desired domain mapping and surfaces API errors", async () => {
    const created = await createInstanceDomainMapping(
      {
        enabled: true,
        host: "www.example.com",
        profile: "publicSite",
        targetInstallId: "site",
      },
      {
        fetcher: jsonFetcher(
          INSTANCE_DOMAIN_MAPPINGS_API_PATH,
          {
            mapping: { host: "www.example.com", installId: "site" },
            mappings: [{ host: "www.example.com", installId: "site" }],
          },
          { expectedMethod: "POST", status: 201 },
        ),
      },
    );

    expect(created.mapping).toEqual({ host: "www.example.com", installId: "site" });

    await expect(
      createInstanceDomainMapping(
        {
          host: "www.example.com",
          profile: "publicSite",
          targetInstallId: "site",
        },
        {
          fetcher: jsonFetcher(
            INSTANCE_DOMAIN_MAPPINGS_API_PATH,
            {
              code: "duplicate-domain-mapping",
              error: 'Domain mapping for host "www.example.com" and surface "site" already exists.',
              field: "host",
            },
            { expectedMethod: "POST", status: 409 },
          ),
        },
      ),
    ).rejects.toMatchObject({
      body: {
        code: "duplicate-domain-mapping",
        error: 'Domain mapping for host "www.example.com" and surface "site" already exists.',
        field: "host",
      },
      message: 'Domain mapping for host "www.example.com" and surface "site" already exists.',
      name: "DomainMappingApiError",
      status: 409,
    } satisfies Partial<DomainMappingApiError>);
  });

  it("deletes a desired domain mapping and surfaces API errors", async () => {
    const deleted = await deleteInstanceDomainMapping(
      {
        host: "www.example.com",
        profile: "publicSite",
      },
      {
        fetcher: jsonFetcher(
          `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}?host=www.example.com&profile=publicSite`,
          {
            mapping: { enabled: false, host: "www.example.com", profile: "publicSite" },
            mappings: [{ enabled: false, host: "www.example.com", profile: "publicSite" }],
          },
          { expectedMethod: "DELETE" },
        ),
      },
    );

    expect(deleted.mapping).toEqual({
      enabled: false,
      host: "www.example.com",
      profile: "publicSite",
    });

    await expect(
      deleteInstanceDomainMapping(
        {
          host: "missing.example.com",
          profile: "publicSite",
        },
        {
          fetcher: jsonFetcher(
            `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}?host=missing.example.com&profile=publicSite`,
            {
              code: "domain-mapping-not-found",
              error:
                'Domain mapping for host "missing.example.com" and profile "publicSite" does not exist.',
              field: "host",
            },
            { expectedMethod: "DELETE", status: 404 },
          ),
        },
      ),
    ).rejects.toMatchObject({
      body: {
        code: "domain-mapping-not-found",
        error:
          'Domain mapping for host "missing.example.com" and profile "publicSite" does not exist.',
        field: "host",
      },
      status: 404,
    } satisfies Partial<DomainMappingApiError>);
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
