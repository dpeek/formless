import { describe, expect, it } from "vite-plus/test";
import { computeSourceSchemaHash } from "@dpeek/formless-installed-apps";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import {
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_COLLABORATOR_INVITATIONS_API_PATH,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH,
  IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  formatIdentityControlPlaneBoundaryEntityName,
  identityControlPlaneEntityNames,
  identityControlPlaneRoleKeys,
  identityControlPlaneImmutableFields,
  identityControlPlaneRecordSourceEntityName,
  identityControlPlaneSchema,
  identityControlPlaneSchemaProvenance,
  identityControlPlaneSourceSchema,
  isIdentityControlPlaneEntityName,
  parseIdentityControlPlaneBoundaryEntityName,
  parseIdentityControlPlaneStorageSnapshot,
  resolveIdentityCollaboratorInvitationGrantAuthority,
  reviewableIdentityControlPlaneStorageSnapshot,
  validateIdentityCollaboratorInvitationGrants,
  validateIdentityControlPlaneRecords,
} from "./index.ts";

const privateAuthStateEntities = [
  "auth-session",
  "central-session",
  "challenge",
  "credential",
  "credential-material",
  "cross-domain-grant",
  "email-verification-challenge",
  "host-session",
  "invite-token",
  "invite-token-hash",
  "passkey-challenge",
  "passkey-credential",
  "provider-response",
  "recovery-secret",
  "revocation",
] as const;

describe("identity control-plane schema contracts", () => {
  it("publishes deterministic source provenance for the identity schema", async () => {
    const baseHash = await computeSourceSchemaHash(identityControlPlaneSourceSchema);
    const mutationCases: Array<[string, (schema: AppSchema) => void]> = [
      [
        "schema field metadata",
        (schema) => {
          schema.entities.principal.fields.displayName.label = "Name";
        },
      ],
      [
        "operation metadata",
        (schema) => {
          const create = schema.entities.principal.operations?.create;

          if (!create) {
            throw new Error("Expected principal create operation.");
          }

          create.label = "Create identity principal";
        },
      ],
      [
        "runtime metadata",
        (schema) => {
          const metadata = schema.runtime?.controlPlane?.entities.principal;

          if (!metadata) {
            throw new Error("Expected principal runtime metadata.");
          }

          metadata.immutableFields = ["kind", "status"];
        },
      ],
    ];

    expect(parseAppSchema(identityControlPlaneSourceSchema)).toEqual(identityControlPlaneSchema);
    expect(IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH).toBe(baseHash);
    expect(identityControlPlaneSchemaProvenance).toEqual({
      kind: "identity-control-plane",
      sourceSchemaHash: baseHash,
    });

    for (const [label, mutate] of mutationCases) {
      const changedSchema = structuredClone(
        identityControlPlaneSourceSchema,
      ) as unknown as AppSchema;
      mutate(changedSchema);

      expect(await computeSourceSchemaHash(changedSchema), label).not.toBe(baseHash);
    }
  });

  it("defines the runtime-owned flat identity entities and local references", () => {
    const schema = identityControlPlaneSchema;
    const referenceTargets = Object.values(schema.entities).flatMap((entity) =>
      Object.values(entity.fields).flatMap((field) =>
        field.type === "reference" ? [field.to] : [],
      ),
    );

    expect(Object.keys(schema.entities).sort()).toEqual(
      [...identityControlPlaneEntityNames].sort(),
    );
    expect(referenceTargets.filter((target) => target.includes(":"))).toEqual([]);
    expect(referenceTargets).toEqual(
      expect.arrayContaining(["principal", "group", "organization", "role"]),
    );
    expect(schema.runtime?.owner).toBe("runtime");
    expect(schema.runtime?.controlPlane?.entities).toEqual(
      Object.fromEntries(
        identityControlPlaneEntityNames.map((entityName) => [
          entityName,
          { immutableFields: [...identityControlPlaneImmutableFields[entityName]] },
        ]),
      ),
    );

    expect(schema.entities.principal.fields).toMatchObject({
      displayName: { type: "text", required: true },
      kind: {
        type: "enum",
        required: true,
        values: { human: { label: "Human" }, service: { label: "Service" } },
      },
      status: {
        type: "enum",
        required: true,
        values: {
          active: { label: "Active" },
          disabled: { label: "Disabled" },
          invited: { label: "Invited" },
        },
      },
    });
    expect(schema.entities["principal-email"].fields).toMatchObject({
      principal: { type: "reference", required: true, to: "principal" },
      displayEmail: { type: "text", required: true },
      normalizedEmail: { type: "text", required: true },
      verificationStatus: {
        type: "enum",
        required: true,
        values: { unverified: { label: "Unverified" }, verified: { label: "Verified" } },
      },
      primary: { type: "boolean", required: true, default: false },
      recovery: { type: "boolean", required: true, default: false },
      verifiedAt: { type: "text", required: false },
    });
    expect(schema.entities["principal-email"].constraints).toEqual({
      uniqueNormalizedEmail: { kind: "unique", fields: ["normalizedEmail"] },
    });
    expect(schema.entities.group.fields).toMatchObject({
      displayName: { type: "text", required: true },
      status: { type: "enum", required: true },
    });
    expect(schema.entities.organization.fields).toMatchObject({
      displayName: { type: "text", required: true },
      status: { type: "enum", required: true },
    });
    expect(schema.entities.membership.fields).toMatchObject({
      principal: { type: "reference", required: true, to: "principal" },
      targetKind: {
        type: "enum",
        required: true,
        values: { group: { label: "Group" }, organization: { label: "Organization" } },
      },
      targetGroup: { type: "reference", required: false, to: "group" },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      status: { type: "enum", required: true },
    });
    expect(schema.entities.membership.constraints ?? {}).toEqual({});
    expect(schema.entities.role.fields).toMatchObject({
      key: {
        type: "enum",
        required: true,
        values: {
          "app.admin": { label: "app.admin" },
          "app.editor": { label: "app.editor" },
          "app.user": { label: "app.user" },
          "app.viewer": { label: "app.viewer" },
          "instance.admin": { label: "instance.admin" },
          "instance.owner": { label: "instance.owner" },
        },
      },
      displayLabel: { type: "text", required: true },
      status: { type: "enum", required: true },
    });
    expect(schema.entities.role.constraints).toEqual({
      uniqueKey: { kind: "unique", fields: ["key"] },
    });
    expect(schema.entities["role-assignment"].fields).toMatchObject({
      role: { type: "reference", required: true, to: "role" },
      targetKind: {
        type: "enum",
        required: true,
        values: {
          group: { label: "Group" },
          organization: { label: "Organization" },
          principal: { label: "Principal" },
        },
      },
      targetPrincipal: { type: "reference", required: false, to: "principal" },
      targetGroup: { type: "reference", required: false, to: "group" },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      scopeKind: {
        type: "enum",
        required: true,
        values: {
          "app-install": { label: "App install" },
          instance: { label: "Instance" },
          organization: { label: "Organization" },
        },
      },
      appInstallId: { type: "text", required: false },
      scopeOrganization: { type: "reference", required: false, to: "organization" },
      status: { type: "enum", required: true },
    });
    expect(schema.entities["role-assignment"].constraints ?? {}).toEqual({});
    expect(schema.entities["app-registration"].fields).toMatchObject({
      appInstallId: { type: "text", required: true },
      targetKind: {
        type: "enum",
        required: true,
        values: {
          organization: { label: "Organization" },
          principal: { label: "Principal" },
        },
      },
      targetPrincipal: { type: "reference", required: false, to: "principal" },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      status: { type: "enum", required: true },
      selectedOrganization: { type: "reference", required: false, to: "organization" },
    });
    expect(schema.entities["app-registration"].constraints ?? {}).toEqual({});
    expect(schema.entities.invitation.fields).toMatchObject({
      targetEmail: { type: "text", required: true },
      targetSurface: {
        type: "enum",
        required: true,
        values: {
          "app-install": { label: "App install" },
          instance: { label: "Instance" },
          organization: { label: "Organization" },
        },
      },
      targetAppInstallId: { type: "text", required: false },
      targetOrganization: { type: "reference", required: false, to: "organization" },
      invitedPrincipal: { type: "reference", required: false, to: "principal" },
      inviterPrincipal: { type: "reference", required: false, to: "principal" },
      status: {
        type: "enum",
        required: true,
        values: {
          accepted: { label: "Accepted" },
          expired: { label: "Expired" },
          pending: { label: "Pending" },
          revoked: { label: "Revoked" },
        },
      },
      expiresAt: { type: "text", required: true },
      acceptedAt: { type: "text", required: false },
    });
    expect(schema.entities["account-policy"].fields).toMatchObject({
      displayName: { type: "text", required: true },
      policyKey: { type: "text", required: true },
      version: { type: "text", required: true },
      scopeKind: {
        type: "enum",
        required: true,
        values: {
          "app-install": { label: "App install" },
          instance: { label: "Instance" },
          organization: { label: "Organization" },
        },
      },
      appInstallId: { type: "text", required: false },
      scopeOrganization: { type: "reference", required: false, to: "organization" },
      status: {
        type: "enum",
        required: true,
        values: {
          active: { label: "Active" },
          retired: { label: "Retired" },
        },
      },
      publishedAt: { type: "text", required: false },
      policyDocumentUrl: { type: "text", required: false, format: "href" },
      policyContentRef: { type: "text", required: false },
    });
    expect(schema.entities["account-policy"].constraints ?? {}).toEqual({});
    expect(schema.entities["principal-policy-acceptance"].fields).toMatchObject({
      principal: { type: "reference", required: true, to: "principal" },
      accountPolicy: { type: "reference", required: true, to: "account-policy" },
      status: {
        type: "enum",
        required: true,
        values: {
          accepted: { label: "Accepted" },
          revoked: { label: "Revoked" },
        },
      },
      acceptedAt: { type: "text", required: true },
    });
    expect(schema.entities["principal-policy-acceptance"].constraints ?? {}).toEqual({});
  });

  it("declares local relationship shapes for fixed identity references", () => {
    const schema = identityControlPlaneSchema;

    expect(schema.relationships?.principalEmailPrincipal).toEqual({
      kind: "toOne",
      label: "Principal email principal",
      from: { entity: "principal-email", field: "principal" },
      to: { entity: "principal" },
      inverse: "principalEmails",
    });
    expect(schema.relationships?.principalEmails).toEqual({
      kind: "toMany",
      label: "Principal emails",
      from: { entity: "principal" },
      to: { entity: "principal-email", field: "principal" },
      inverse: "principalEmailPrincipal",
    });
    expect(schema.relationships?.membershipGroup).toMatchObject({
      kind: "toOne",
      from: { entity: "membership", field: "targetGroup" },
      to: { entity: "group" },
    });
    expect(schema.relationships?.membershipOrganization).toMatchObject({
      kind: "toOne",
      from: { entity: "membership", field: "targetOrganization" },
      to: { entity: "organization" },
    });
    expect(schema.relationships?.roleAssignmentRole).toMatchObject({
      kind: "toOne",
      from: { entity: "role-assignment", field: "role" },
      to: { entity: "role" },
    });
    expect(schema.relationships?.appRegistrationSelectedOrganization).toMatchObject({
      kind: "toOne",
      from: { entity: "app-registration", field: "selectedOrganization" },
      to: { entity: "organization" },
    });
    expect(schema.relationships?.invitationInvitedPrincipal).toMatchObject({
      kind: "toOne",
      from: { entity: "invitation", field: "invitedPrincipal" },
      to: { entity: "principal" },
    });
    expect(schema.relationships?.accountPolicyScopeOrganization).toMatchObject({
      kind: "toOne",
      from: { entity: "account-policy", field: "scopeOrganization" },
      to: { entity: "organization" },
    });
    expect(schema.relationships?.principalPolicyAcceptancePrincipal).toMatchObject({
      kind: "toOne",
      from: { entity: "principal-policy-acceptance", field: "principal" },
      to: { entity: "principal" },
    });
    expect(schema.relationships?.principalPolicyAcceptancePolicy).toMatchObject({
      kind: "toOne",
      from: { entity: "principal-policy-acceptance", field: "accountPolicy" },
      to: { entity: "account-policy" },
    });
  });

  it("declares generated write operations without private auth-state entities", () => {
    const schema = identityControlPlaneSchema;

    for (const entityName of identityControlPlaneEntityNames) {
      const operations = schema.entities[entityName].operations;

      expect(operations?.create).toMatchObject({
        kind: "create",
        scope: "collection",
        effect: { type: "createRecord" },
        output: { type: "create" },
      });
      expect(operations?.update).toMatchObject({
        kind: "update",
        scope: "record",
        effect: { type: "patchRecord" },
        output: { type: "update" },
      });
      expect(Object.keys(operations?.create.input?.fields ?? {})).toEqual(
        Object.keys(schema.entities[entityName].fields),
      );
    }

    expect(Object.keys(schema.entities.principal.operations?.update.input?.fields ?? {})).toEqual([
      "displayName",
      "status",
    ]);
    expect(
      Object.keys(schema.entities["principal-email"].operations?.update.input?.fields ?? {}),
    ).toEqual(["displayEmail", "verificationStatus", "primary", "recovery", "verifiedAt"]);
    expect(Object.keys(schema.entities.membership.operations?.update.input?.fields ?? {})).toEqual([
      "status",
    ]);
    expect(
      Object.keys(schema.entities["role-assignment"].operations?.update.input?.fields ?? {}),
    ).toEqual(["status"]);
    expect(schema.entities["role-assignment"].operations?.delete).toMatchObject({
      kind: "delete",
      scope: "record",
      effect: { type: "deleteRecord" },
      output: { type: "delete" },
    });
    expect(schema.entities.principal.operations?.delete).toBeUndefined();
    expect(
      Object.keys(schema.entities["app-registration"].operations?.update.input?.fields ?? {}),
    ).toEqual(["status", "selectedOrganization"]);
    expect(Object.keys(schema.entities.invitation.operations?.update.input?.fields ?? {})).toEqual([
      "status",
      "acceptedAt",
    ]);
    expect(
      Object.keys(schema.entities["account-policy"].operations?.update.input?.fields ?? {}),
    ).toEqual(["displayName", "status", "publishedAt"]);
    expect(
      Object.keys(
        schema.entities["principal-policy-acceptance"].operations?.update.input?.fields ?? {},
      ),
    ).toEqual(["status"]);

    for (const privateEntity of privateAuthStateEntities) {
      expect(schema.entities).not.toHaveProperty(privateEntity);
    }
  });

  it("formats, parses, and identifies identity boundary entity names", () => {
    expect(IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY).toBe("auth");
    expect(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX).toBe("/api/formless/identity");
    expect(IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH).toBe("/access-summary");
    expect(IDENTITY_COLLABORATOR_INVITATIONS_API_PATH).toBe("/collaborator-invitations");
    expect(IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH).toBe(
      "/collaborator-invitations/revoke",
    );
    expect(IDENTITY_CONTROL_PLANE_SCHEMA_KEY).toBe("identity-control-plane");
    expect(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY).toBe("instance:identity");
    expect(formatIdentityControlPlaneBoundaryEntityName("principal")).toBe("auth:principal");
    expect(formatIdentityControlPlaneBoundaryEntityName("organization")).toBe("auth:organization");
    expect(formatIdentityControlPlaneBoundaryEntityName("account-policy")).toBe(
      "auth:account-policy",
    );
    expect(parseIdentityControlPlaneBoundaryEntityName("Archive record entity", "auth:group")).toBe(
      "group",
    );
    expect(identityControlPlaneRecordSourceEntityName("auth:principal-email")).toBe(
      "principal-email",
    );
    expect(identityControlPlaneRecordSourceEntityName("auth:principal-policy-acceptance")).toBe(
      "principal-policy-acceptance",
    );
    expect(identityControlPlaneRecordSourceEntityName("role-assignment")).toBe("role-assignment");
    expect(isIdentityControlPlaneEntityName("app-registration")).toBe(true);
    expect(isIdentityControlPlaneEntityName("account-policy")).toBe(true);
    expect(isIdentityControlPlaneEntityName("auth-session")).toBe(false);
    expect(() =>
      parseIdentityControlPlaneBoundaryEntityName(
        "Archive record entity",
        "identity-control-plane:principal",
      ),
    ).toThrow('Archive record entity schema key must be "auth".');
    expect(() =>
      parseIdentityControlPlaneBoundaryEntityName("Archive record entity", "auth:auth-session"),
    ).toThrow("is not an identity control-plane entity");
  });

  it("validates display-safe identity storage snapshots and records", () => {
    const snapshot = identityStorageSnapshot();

    expect(parseIdentityControlPlaneStorageSnapshot("Identity archive", snapshot)).toEqual(
      snapshot,
    );
    expect(
      reviewableIdentityControlPlaneStorageSnapshot({
        ...snapshot,
        sourceCursor: 123,
        records: snapshot.records.map((record) => ({
          ...record,
          entity: formatIdentityControlPlaneBoundaryEntityName(
            record.entity as (typeof identityControlPlaneEntityNames)[number],
          ),
        })),
      }),
    ).toMatchObject({
      sourceCursor: snapshot.records.length,
      records: snapshot.records,
    });
    expect(() =>
      parseIdentityControlPlaneStorageSnapshot("Identity archive", {
        ...snapshot,
        storageIdentity: "instance:control-plane",
      }),
    ).toThrow('Storage snapshot storageIdentity must be "instance:identity".');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...identityRecords(),
        identityRecord("unknown", "unknown:1", {}),
      ]),
    ).toThrow('references unknown entity "unknown"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...identityRecords(),
        {
          ...identityRecords()[0],
          id: "principal:duplicate-id",
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...identityRecords(),
        {
          ...identityRecords()[0],
        },
      ]),
    ).toThrow('includes duplicate identity record id "principal:ada"');
  });

  it("validates identity record invariants that are outside field shape", () => {
    const records = identityRecords();

    expect(validateIdentityControlPlaneRecords("Identity records", records)).toBeUndefined();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        principalEmailRecord("principal-email:duplicate", {
          principal: "principal:grace",
          displayEmail: "duplicate@example.com",
          normalizedEmail: "ada@example.com",
        }),
      ]),
    ).toThrow('violates unique constraint "auth:principal-email.uniqueNormalizedEmail"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...principalEmailRecord("principal-email:tombstoned-duplicate", {
            principal: "principal:grace",
            displayEmail: "duplicate@example.com",
            normalizedEmail: "ada@example.com",
          }),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        roleRecord("role:owner-duplicate", {
          displayLabel: "Duplicate owner",
          key: "instance.owner",
        }),
      ]),
    ).toThrow('violates unique constraint "auth:role.uniqueKey"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...roleRecord("role:owner-tombstoned-duplicate", {
            displayLabel: "Duplicate owner",
            key: "instance.owner",
          }),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();

    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          membershipRecord("membership:ada-group", { targetGroup: undefined }),
        ),
      ),
    ).toThrow('requires field "auth:membership.targetGroup"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          membershipRecord("membership:ada-group", { targetOrganization: "organization:acme" }),
        ),
      ),
    ).toThrow('cannot set field "auth:membership.targetOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", {
            targetGroup: "group:operators",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:role-assignment.targetGroup"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", { appInstallId: "site" }),
        ),
      ),
    ).toThrow('cannot set field "auth:role-assignment.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", {
            appInstallId: undefined,
            scopeKind: "app-install",
          }),
        ),
      ),
    ).toThrow('requires field "auth:role-assignment.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          roleAssignmentRecord("role-assignment:ada-owner", {
            scopeKind: "organization",
            scopeOrganization: undefined,
          }),
        ),
      ),
    ).toThrow('requires field "auth:role-assignment.scopeOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          appRegistrationRecord("app-registration:site-ada", {
            targetKind: "organization",
            targetPrincipal: "principal:ada",
          }),
        ),
      ),
    ).toThrow('requires field "auth:app-registration.targetOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          appRegistrationRecord("app-registration:site-ada", {
            targetKind: "organization",
            targetOrganization: "organization:acme",
            targetPrincipal: "principal:ada",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:app-registration.targetPrincipal"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetAppInstallId: undefined,
          }),
        ),
      ),
    ).toThrow('requires field "auth:invitation.targetAppInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetOrganization: "organization:acme",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:invitation.targetOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetAppInstallId: "site",
            targetSurface: "instance",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:invitation.targetAppInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          accountPolicyRecord("account-policy:terms", {
            appInstallId: undefined,
            scopeKind: "app-install",
          }),
        ),
      ),
    ).toThrow('requires field "auth:account-policy.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          accountPolicyRecord("account-policy:terms", {
            appInstallId: "site",
          }),
        ),
      ),
    ).toThrow('cannot set field "auth:account-policy.appInstallId"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          accountPolicyRecord("account-policy:terms", {
            scopeKind: "organization",
            scopeOrganization: undefined,
          }),
        ),
      ),
    ).toThrow('requires field "auth:account-policy.scopeOrganization"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms", {
            accountPolicy: "account-policy:missing",
          }),
        ),
      ),
    ).toThrow('references unknown auth:account-policy record "account-policy:missing"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms", {
            status: "pending",
          }),
        ),
      ),
    ).toThrow('has invalid field "auth:principal-policy-acceptance.status"');
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", { inviteTokenHash: "sha256:private" }),
        ),
      ),
    ).toThrow("cannot store private auth state");
    expect(() =>
      validateIdentityControlPlaneRecords(
        "Identity records",
        replaceRecord(
          records,
          invitationRecord("invitation:ada", {
            targetEmail: JSON.stringify({ providerResponse: { id: "message-id" } }),
          }),
        ),
      ),
    ).toThrow("cannot store private auth state");
  });

  it("validates target-aware active identity uniqueness", () => {
    const records = identityRecords();
    const recordsWithAlternateTargets = [
      ...records,
      identityRecord("group", "group:reviewers", {
        displayName: "Reviewers",
        status: "active",
      }),
      identityRecord("organization", "organization:globex", {
        displayName: "Globex",
        status: "active",
      }),
      membershipRecord("membership:ada-reviewers", {
        targetGroup: "group:reviewers",
      }),
      membershipRecord("membership:ada-acme", {
        targetGroup: undefined,
        targetKind: "organization",
        targetOrganization: "organization:acme",
      }),
      membershipRecord("membership:ada-globex", {
        targetGroup: undefined,
        targetKind: "organization",
        targetOrganization: "organization:globex",
      }),
      roleAssignmentRecord("role-assignment:grace-owner", {
        targetPrincipal: "principal:grace",
      }),
      appRegistrationRecord("app-registration:site-grace", {
        targetPrincipal: "principal:grace",
      }),
    ];

    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", recordsWithAlternateTargets),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        membershipRecord("membership:ada-group-duplicate"),
      ]),
    ).toThrow('violates identity uniqueness "auth:membership.uniqueActiveMembership"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...membershipRecord("membership:ada-group-tombstoned-duplicate"),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        roleAssignmentRecord("role-assignment:ada-owner-duplicate"),
      ]),
    ).toThrow('violates identity uniqueness "auth:role-assignment.uniqueActiveAssignment"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...roleAssignmentRecord("role-assignment:ada-owner-tombstoned-duplicate"),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        appRegistrationRecord("app-registration:site-ada-duplicate"),
      ]),
    ).toThrow('violates identity uniqueness "auth:app-registration.uniqueActiveRegistration"');
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...appRegistrationRecord("app-registration:site-ada-tombstoned-duplicate"),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...recordsWithAlternateTargets,
        accountPolicyRecord("account-policy:app-terms", {
          appInstallId: "site",
          policyKey: "terms",
          scopeKind: "app-install",
          version: "2026-07",
        }),
        principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-app-terms", {
          accountPolicy: "account-policy:app-terms",
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms-duplicate"),
      ]),
    ).toThrow(
      'violates identity uniqueness "auth:principal-policy-acceptance.uniqueAcceptedPrincipalPolicy"',
    );
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms-revoked", {
          status: "revoked",
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      validateIdentityControlPlaneRecords("Identity records", [
        ...records,
        {
          ...principalPolicyAcceptanceRecord(
            "principal-policy-acceptance:ada-terms-tombstoned-duplicate",
          ),
          deletedAt: testNow,
        },
      ]),
    ).not.toThrow();
  });

  it("keeps account policy acceptance flat and outside authentication authority", () => {
    const records = [
      ...identityCollaboratorInvitationGrantPolicyRecords(),
      accountPolicyRecord("account-policy:terms", {
        policyDocumentUrl: "https://example.com/legal/terms",
      }),
      principalPolicyAcceptanceRecord("principal-policy-acceptance:ordinary-terms", {
        principal: "principal:ordinary",
      }),
    ];

    expect(validateIdentityControlPlaneRecords("Identity records", records)).toBeUndefined();
    expect(
      resolveIdentityCollaboratorInvitationGrantAuthority(records, "principal:ordinary"),
    ).toEqual({
      instanceAdmin: false,
      instanceOwner: false,
      principalId: "principal:ordinary",
    });
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:ordinary",
        records,
      }),
    ).toThrow("requires current instance owner or instance admin authority");

    const policy = records.find((record) => record.entity === "account-policy");
    const acceptance = records.find((record) => record.entity === "principal-policy-acceptance");

    expect(policy?.values).toEqual({
      displayName: "Terms of service",
      policyContentRef: "site:terms",
      policyDocumentUrl: "https://example.com/legal/terms",
      policyKey: "terms",
      publishedAt: testNow,
      scopeKind: "instance",
      status: "active",
      version: "2026-07",
    });
    expect(acceptance?.values).toEqual({
      acceptedAt: testNow,
      accountPolicy: "account-policy:terms",
      principal: "principal:ordinary",
      status: "accepted",
    });
  });

  it("resolves and accepts owner collaborator invitation grant authority", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();
    const grantRecords = [
      invitedPrincipalGrantRecord(),
      invitedPrincipalEmailGrantRecord(),
      membershipRecord("membership:invitee-acme", {
        principal: "principal:invitee",
        status: "invited",
        targetGroup: undefined,
        targetKind: "organization",
        targetOrganization: "organization:acme",
      }),
      roleAssignmentRecord("role-assignment:invitee-owner", {
        role: "role:instance.owner",
        targetPrincipal: "principal:invitee",
      }),
      roleAssignmentRecord("role-assignment:invitee-org-editor", {
        appInstallId: undefined,
        role: "role:app.editor",
        scopeKind: "organization",
        scopeOrganization: "organization:acme",
        targetPrincipal: "principal:invitee",
      }),
      appRegistrationRecord("app-registration:site-invitee", {
        selectedOrganization: undefined,
        targetPrincipal: "principal:invitee",
      }),
    ];

    expect(resolveIdentityCollaboratorInvitationGrantAuthority(records, "principal:owner")).toEqual(
      {
        instanceAdmin: false,
        instanceOwner: true,
        principalId: "principal:owner",
      },
    );
    expect(
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords,
        inviterPrincipalId: "principal:owner",
        records,
      }),
    ).toEqual({
      instanceAdmin: false,
      instanceOwner: true,
      principalId: "principal:owner",
    });
  });

  it("accepts instance-admin collaborator invitation grant authority for non-owner grants", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();
    const grantRecords = [
      invitedPrincipalGrantRecord(),
      invitedPrincipalEmailGrantRecord(),
      appRegistrationRecord("app-registration:site-invitee", {
        selectedOrganization: undefined,
        targetPrincipal: "principal:invitee",
      }),
      roleAssignmentRecord("role-assignment:invitee-admin", {
        role: "role:instance.admin",
        targetPrincipal: "principal:invitee",
      }),
      roleAssignmentRecord("role-assignment:invitee-app-editor", {
        role: "role:app.editor",
        scopeKind: "app-install",
        appInstallId: "site",
        targetPrincipal: "principal:invitee",
      }),
    ];

    expect(
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords,
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toEqual({
      instanceAdmin: true,
      instanceOwner: false,
      principalId: "principal:admin",
    });
  });

  it("rejects collaborator invitation grants from non-admin principals", () => {
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:ordinary",
        records: identityCollaboratorInvitationGrantPolicyRecords(),
      }),
    ).toThrow("requires current instance owner or instance admin authority");
  });

  it("rejects collaborator invitation grants from stale or disabled inviter principals", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();

    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:missing",
        records,
      }),
    ).toThrow("requires an active inviter principal");
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:disabled",
        records,
      }),
    ).toThrow("requires an active inviter principal");
  });

  it("rejects collaborator invitation grants after current role authority is removed", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords({
      removedAdminAuthority: true,
    });

    expect(resolveIdentityCollaboratorInvitationGrantAuthority(records, "principal:admin")).toEqual(
      {
        instanceAdmin: false,
        instanceOwner: false,
        principalId: "principal:admin",
      },
    );
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [invitedPrincipalGrantRecord()],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("requires current instance owner or instance admin authority");
  });

  it("rejects instance-admin collaborator invitation role and membership grants outside policy", () => {
    const records = identityCollaboratorInvitationGrantPolicyRecords();

    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [
          roleAssignmentRecord("role-assignment:invitee-owner", {
            role: "role:instance.owner",
            targetPrincipal: "principal:invitee",
          }),
        ],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("cannot grant instance.owner with instance admin authority");
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [
          roleAssignmentRecord("role-assignment:invitee-org-editor", {
            appInstallId: undefined,
            role: "role:app.editor",
            scopeKind: "organization",
            scopeOrganization: "organization:acme",
            targetPrincipal: "principal:invitee",
          }),
        ],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("cannot grant organization-scoped roles with instance admin authority");
    expect(() =>
      validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
        grantRecords: [
          membershipRecord("membership:invitee-acme", {
            principal: "principal:invitee",
            status: "invited",
            targetGroup: undefined,
            targetKind: "organization",
            targetOrganization: "organization:acme",
          }),
        ],
        inviterPrincipalId: "principal:admin",
        records,
      }),
    ).toThrow("cannot grant collaborator memberships with instance admin authority");
  });
});

const testNow = "2026-06-26T00:00:00.000Z";

function identityCollaboratorInvitationGrantPolicyRecords(
  options: { removedAdminAuthority?: boolean } = {},
): StoredRecord[] {
  return [
    identityRecord("principal", "principal:owner", {
      displayName: "Owner",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:admin", {
      displayName: "Admin",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:ordinary", {
      displayName: "Ordinary",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:disabled", {
      displayName: "Disabled",
      kind: "human",
      status: "disabled",
    }),
    identityRecord("organization", "organization:acme", {
      displayName: "Acme",
      status: "active",
    }),
    identityRecord("group", "group:operators", {
      displayName: "Operators",
      status: "active",
    }),
    ...builtInRoleRecords(),
    roleAssignmentRecord("role-assignment:owner-owner", {
      role: "role:instance.owner",
      targetPrincipal: "principal:owner",
    }),
    {
      ...roleAssignmentRecord("role-assignment:admin-admin", {
        role: "role:instance.admin",
        targetPrincipal: "principal:admin",
      }),
      ...(options.removedAdminAuthority === true ? { deletedAt: testNow } : {}),
    },
    roleAssignmentRecord("role-assignment:disabled-owner", {
      role: "role:instance.owner",
      targetPrincipal: "principal:disabled",
    }),
  ];
}

function invitedPrincipalGrantRecord(): StoredRecord {
  return identityRecord("principal", "principal:invitee", {
    displayName: "Invitee",
    kind: "human",
    status: "invited",
  });
}

function invitedPrincipalEmailGrantRecord(): StoredRecord {
  return principalEmailRecord("principal-email:invitee", {
    principal: "principal:invitee",
    displayEmail: "invitee@example.com",
    normalizedEmail: "invitee@example.com",
  });
}

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) =>
    identityRecord("role", `role:${roleKey}`, {
      displayLabel: roleKey,
      key: roleKey,
      status: "active",
    }),
  );
}

function identityStorageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  const records = identityRecords();

  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
    exportedAt: testNow,
    schemaUpdatedAt: testNow,
    sourceCursor: records.length,
    schema: identityControlPlaneSchema,
    records,
    ...overrides,
  };
}

function identityRecords(): StoredRecord[] {
  return [
    identityRecord("principal", "principal:ada", {
      displayName: "Ada Lovelace",
      kind: "human",
      status: "active",
    }),
    identityRecord("principal", "principal:grace", {
      displayName: "Grace Hopper",
      kind: "human",
      status: "active",
    }),
    principalEmailRecord("principal-email:ada", {
      principal: "principal:ada",
      displayEmail: "Ada@example.com",
      normalizedEmail: "ada@example.com",
    }),
    identityRecord("group", "group:operators", {
      displayName: "Operators",
      status: "active",
    }),
    identityRecord("organization", "organization:acme", {
      displayName: "Acme",
      status: "active",
    }),
    membershipRecord("membership:ada-group"),
    roleRecord("role:owner", {
      displayLabel: "Owner",
      key: "instance.owner",
    }),
    roleAssignmentRecord("role-assignment:ada-owner"),
    appRegistrationRecord("app-registration:site-ada"),
    invitationRecord("invitation:ada"),
    accountPolicyRecord("account-policy:terms"),
    principalPolicyAcceptanceRecord("principal-policy-acceptance:ada-terms"),
  ];
}

function principalEmailRecord(
  id: string,
  values: {
    displayEmail: string;
    normalizedEmail: string;
    principal: string;
  },
): StoredRecord {
  return identityRecord("principal-email", id, {
    displayEmail: values.displayEmail,
    normalizedEmail: values.normalizedEmail,
    principal: values.principal,
    primary: false,
    recovery: false,
    verificationStatus: "verified",
    verifiedAt: testNow,
  });
}

function membershipRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "membership",
    id,
    omitUndefined({
      principal: "principal:ada",
      targetGroup: "group:operators",
      targetKind: "group",
      status: "active",
      ...overrides,
    }),
  );
}

function roleRecord(
  id: string,
  values: {
    displayLabel: string;
    key: string;
  },
): StoredRecord {
  return identityRecord("role", id, {
    displayLabel: values.displayLabel,
    key: values.key,
    status: "active",
  });
}

function roleAssignmentRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "role-assignment",
    id,
    omitUndefined({
      role: "role:owner",
      targetKind: "principal",
      targetPrincipal: "principal:ada",
      scopeKind: "instance",
      status: "active",
      ...overrides,
    }),
  );
}

function appRegistrationRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "app-registration",
    id,
    omitUndefined({
      appInstallId: "site",
      targetKind: "principal",
      targetPrincipal: "principal:ada",
      selectedOrganization: "organization:acme",
      status: "active",
      ...overrides,
    }),
  );
}

function invitationRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "invitation",
    id,
    omitUndefined({
      acceptedAt: undefined,
      expiresAt: "2026-07-26T00:00:00.000Z",
      invitedPrincipal: "principal:ada",
      inviterPrincipal: "principal:grace",
      status: "pending",
      targetAppInstallId: "site",
      targetEmail: "ada@example.com",
      targetSurface: "app-install",
      ...overrides,
    }),
  );
}

function accountPolicyRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "account-policy",
    id,
    omitUndefined({
      appInstallId: undefined,
      displayName: "Terms of service",
      policyContentRef: "site:terms",
      policyDocumentUrl: undefined,
      policyKey: "terms",
      publishedAt: testNow,
      scopeKind: "instance",
      scopeOrganization: undefined,
      status: "active",
      version: "2026-07",
      ...overrides,
    }),
  );
}

function principalPolicyAcceptanceRecord(
  id: string,
  overrides: Record<string, string | undefined> = {},
): StoredRecord {
  return identityRecord(
    "principal-policy-acceptance",
    id,
    omitUndefined({
      acceptedAt: testNow,
      accountPolicy: "account-policy:terms",
      principal: "principal:ada",
      status: "accepted",
      ...overrides,
    }),
  );
}

function identityRecord(
  entity: string,
  id: string,
  values: Record<string, boolean | number | string>,
): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: testNow,
    updatedAt: testNow,
  };
}

function replaceRecord(records: StoredRecord[], replacement: StoredRecord): StoredRecord[] {
  return records.map((record) => (record.id === replacement.id ? replacement : record));
}

function omitUndefined<T extends Record<string, string | undefined>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
