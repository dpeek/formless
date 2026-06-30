import { describe, expect, it } from "vite-plus/test";

import {
  createIdentityAccessManagementInvitation,
  IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE,
  fetchIdentityAccessManagementSummary,
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE,
} from "./identity-access-management.ts";

describe("identity access management client", () => {
  it("fetches the display-safe access summary contract", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const summary = {
      appRegistrations: [],
      groups: [],
      invitationGrantOptions: {
        authority: { instanceAdmin: false, instanceOwner: true },
        memberships: [],
        roles: [],
      },
      invitations: [],
      memberships: [],
      organizations: [],
      people: [],
      roles: [],
    };

    const result = await fetchIdentityAccessManagementSummary({
      fetcher: async (input, init) => {
        requests.push({ input, init });

        return Response.json(summary);
      },
    });

    expect(IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE).toBe(
      "/api/formless/identity/access-summary",
    );
    expect(result).toEqual(summary);
    expect(requests).toEqual([
      {
        input: IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE,
        init: {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: undefined,
        },
      },
    ]);
  });

  it("raises response status and safe error text for rejected summary reads", async () => {
    await expect(
      fetchIdentityAccessManagementSummary({
        fetcher: async () =>
          Response.json({ error: "Current principal lacks access authority." }, { status: 403 }),
      }),
    ).rejects.toMatchObject({
      body: { error: "Current principal lacks access authority." },
      message: "Current principal lacks access authority.",
      name: "IdentityAccessManagementApiError",
      status: 403,
    });
  });

  it("creates collaborator invitations through the access management route", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const body = {
      delivery: { status: "skipped", reason: "missing-auth-email-configuration" },
      invitation: {
        id: "invitation:ada",
        entity: "invitation",
        values: {
          targetEmail: "ada@example.com",
          targetSurface: "app-install",
          targetAppInstallId: "site",
          status: "pending",
        },
      },
      records: [],
      status: "committed",
    };

    const result = await createIdentityAccessManagementInvitation(
      {
        appRegistrations: [{ appInstallId: "site" }],
        expiresAt: "2999-02-01T00:00:00.000Z",
        idempotencyKey: "access-invite-ada",
        invitedPrincipal: { displayName: "Ada Collaborator" },
        principalEmail: { primary: true, recovery: false },
        roleAssignments: [
          {
            appInstallId: "site",
            roleKey: "app.viewer",
            scopeKind: "app-install",
          },
        ],
        targetAppInstallId: "site",
        targetEmail: "ada@example.com",
        targetSurface: "app-install",
      },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });

          return Response.json(body);
        },
      },
    );

    expect(IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE).toBe(
      "/api/formless/identity/collaborator-invitations",
    );
    expect(result).toEqual(body);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe(IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE);
    expect(requests[0]?.init).toMatchObject({
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: undefined,
    });
    expect(typeof requests[0]?.init?.body).toBe("string");
    expect(JSON.parse(requests[0]?.init?.body as string)).toEqual({
      appRegistrations: [{ appInstallId: "site" }],
      expiresAt: "2999-02-01T00:00:00.000Z",
      idempotencyKey: "access-invite-ada",
      invitedPrincipal: { displayName: "Ada Collaborator" },
      memberships: [],
      principalEmail: { primary: true, recovery: false },
      roleAssignments: [
        {
          appInstallId: "site",
          roleKey: "app.viewer",
          scopeKind: "app-install",
        },
      ],
      targetAppInstallId: "site",
      targetEmail: "ada@example.com",
      targetSurface: "app-install",
    });
    expect(JSON.stringify(result)).not.toContain("raw");
    expect(JSON.stringify(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toContain("session");
  });
});
