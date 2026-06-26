import type { AppSchema, FieldEditor, FieldSchema } from "@dpeek/formless-schema";
import {
  identityControlPlaneEntityNames,
  identityControlPlaneImmutableFields,
  identityControlPlaneRoleKeys,
  type IdentityAppRegistrationStatus,
  type IdentityAppRegistrationTargetKind,
  type IdentityContainerStatus,
  type IdentityControlPlaneEntityName,
  type IdentityInvitationStatus,
  type IdentityInvitationTargetSurface,
  type IdentityMembershipStatus,
  type IdentityMembershipTargetKind,
  type IdentityPrincipalEmailVerificationStatus,
  type IdentityPrincipalKind,
  type IdentityPrincipalStatus,
  type IdentityRoleAssignmentScopeKind,
  type IdentityRoleAssignmentStatus,
  type IdentityRoleAssignmentTargetKind,
  type IdentityRoleStatus,
} from "./types.ts";

type IdentityControlPlaneTableField =
  | string
  | {
      display?: "editor" | "hidden" | "readOnly";
      field: string;
    };

type IdentityControlPlaneViewField =
  | string
  | {
      field: string;
      visibleWhen?: { field: string; values: Array<string | boolean | number> };
    };

const principalKindLabels = {
  human: "Human",
  service: "Service",
} satisfies Record<IdentityPrincipalKind, string>;

const principalStatusLabels = {
  active: "Active",
  disabled: "Disabled",
  invited: "Invited",
} satisfies Record<IdentityPrincipalStatus, string>;

const emailVerificationStatusLabels = {
  unverified: "Unverified",
  verified: "Verified",
} satisfies Record<IdentityPrincipalEmailVerificationStatus, string>;

const containerStatusLabels = {
  active: "Active",
  disabled: "Disabled",
} satisfies Record<IdentityContainerStatus, string>;

const membershipTargetKindLabels = {
  group: "Group",
  organization: "Organization",
} satisfies Record<IdentityMembershipTargetKind, string>;

const membershipStatusLabels = {
  active: "Active",
  disabled: "Disabled",
  invited: "Invited",
} satisfies Record<IdentityMembershipStatus, string>;

const roleStatusLabels = {
  active: "Active",
  disabled: "Disabled",
} satisfies Record<IdentityRoleStatus, string>;

const roleAssignmentTargetKindLabels = {
  group: "Group",
  organization: "Organization",
  principal: "Principal",
} satisfies Record<IdentityRoleAssignmentTargetKind, string>;

const roleAssignmentScopeKindLabels = {
  "app-install": "App install",
  instance: "Instance",
  organization: "Organization",
} satisfies Record<IdentityRoleAssignmentScopeKind, string>;

const roleAssignmentStatusLabels = {
  active: "Active",
  disabled: "Disabled",
} satisfies Record<IdentityRoleAssignmentStatus, string>;

const appRegistrationTargetKindLabels = {
  organization: "Organization",
  principal: "Principal",
} satisfies Record<IdentityAppRegistrationTargetKind, string>;

const appRegistrationStatusLabels = {
  active: "Active",
  disabled: "Disabled",
  pending: "Pending",
} satisfies Record<IdentityAppRegistrationStatus, string>;

const invitationTargetSurfaceLabels = {
  "app-install": "App install",
  instance: "Instance",
  organization: "Organization",
} satisfies Record<IdentityInvitationTargetSurface, string>;

const invitationStatusLabels = {
  accepted: "Accepted",
  expired: "Expired",
  pending: "Pending",
  revoked: "Revoked",
} satisfies Record<IdentityInvitationStatus, string>;

const roleKeyLabels = Object.fromEntries(
  identityControlPlaneRoleKeys.map((roleKey) => [roleKey, roleKey]),
) as Record<(typeof identityControlPlaneRoleKeys)[number], string>;

const entityViewConfig = {
  principal: {
    createFields: ["displayName", "kind", "status"],
    editFields: ["displayName", "status"],
    itemFields: ["displayName", "kind", "status"],
    label: "Principals",
    tableFields: ["displayName", "kind", "status"],
  },
  "principal-email": {
    createFields: [
      "principal",
      "displayEmail",
      "normalizedEmail",
      "verificationStatus",
      "primary",
      "recovery",
      "verifiedAt",
    ],
    editFields: ["displayEmail", "verificationStatus", "primary", "recovery", "verifiedAt"],
    itemFields: ["displayEmail", "normalizedEmail", "verificationStatus", "principal"],
    label: "Principal emails",
    tableFields: [
      "displayEmail",
      "normalizedEmail",
      "principal",
      "verificationStatus",
      "primary",
      "recovery",
      "verifiedAt",
    ],
  },
  group: {
    createFields: ["displayName", "status"],
    editFields: ["status"],
    itemFields: ["displayName", "status"],
    label: "Groups",
    tableFields: ["displayName", "status"],
  },
  organization: {
    createFields: ["displayName", "status"],
    editFields: ["status"],
    itemFields: ["displayName", "status"],
    label: "Organizations",
    tableFields: ["displayName", "status"],
  },
  membership: {
    createFields: [
      "principal",
      "targetKind",
      {
        field: "targetGroup",
        visibleWhen: { field: "targetKind", values: ["group"] },
      },
      {
        field: "targetOrganization",
        visibleWhen: { field: "targetKind", values: ["organization"] },
      },
      "status",
    ],
    editFields: ["status"],
    itemFields: ["principal", "targetKind", "targetGroup", "targetOrganization", "status"],
    label: "Memberships",
    tableFields: ["principal", "targetKind", "targetGroup", "targetOrganization", "status"],
  },
  role: {
    createFields: ["key", "displayLabel", "status"],
    editFields: ["displayLabel", "status"],
    itemFields: ["key", "displayLabel", "status"],
    label: "Roles",
    tableFields: ["key", "displayLabel", "status"],
  },
  "role-assignment": {
    createFields: [
      "role",
      "targetKind",
      {
        field: "targetPrincipal",
        visibleWhen: { field: "targetKind", values: ["principal"] },
      },
      {
        field: "targetGroup",
        visibleWhen: { field: "targetKind", values: ["group"] },
      },
      {
        field: "targetOrganization",
        visibleWhen: { field: "targetKind", values: ["organization"] },
      },
      "scopeKind",
      {
        field: "appInstallId",
        visibleWhen: { field: "scopeKind", values: ["app-install"] },
      },
      {
        field: "scopeOrganization",
        visibleWhen: { field: "scopeKind", values: ["organization"] },
      },
      "status",
    ],
    editFields: ["status"],
    itemFields: ["role", "targetKind", "scopeKind", "status"],
    label: "Role assignments",
    tableFields: [
      "role",
      "targetKind",
      "targetPrincipal",
      "targetGroup",
      "targetOrganization",
      "scopeKind",
      "appInstallId",
      "scopeOrganization",
      "status",
    ],
  },
  "app-registration": {
    createFields: [
      "appInstallId",
      "targetKind",
      {
        field: "targetPrincipal",
        visibleWhen: { field: "targetKind", values: ["principal"] },
      },
      {
        field: "targetOrganization",
        visibleWhen: { field: "targetKind", values: ["organization"] },
      },
      "status",
      "selectedOrganization",
    ],
    editFields: ["status", "selectedOrganization"],
    itemFields: ["appInstallId", "targetKind", "status", "selectedOrganization"],
    label: "App registrations",
    tableFields: [
      "appInstallId",
      "targetKind",
      "targetPrincipal",
      "targetOrganization",
      "status",
      "selectedOrganization",
    ],
  },
  invitation: {
    createFields: [
      "targetEmail",
      "targetSurface",
      {
        field: "targetAppInstallId",
        visibleWhen: { field: "targetSurface", values: ["app-install"] },
      },
      {
        field: "targetOrganization",
        visibleWhen: { field: "targetSurface", values: ["organization"] },
      },
      "invitedPrincipal",
      "inviterPrincipal",
      "status",
      "expiresAt",
      "acceptedAt",
    ],
    editFields: ["status", "acceptedAt"],
    itemFields: ["targetEmail", "targetSurface", "status", "expiresAt"],
    label: "Invitations",
    tableFields: [
      "targetEmail",
      "targetSurface",
      "targetAppInstallId",
      "targetOrganization",
      "invitedPrincipal",
      "inviterPrincipal",
      "status",
      "expiresAt",
      "acceptedAt",
    ],
  },
} as const satisfies Record<
  IdentityControlPlaneEntityName,
  {
    createFields: readonly IdentityControlPlaneViewField[];
    editFields: readonly IdentityControlPlaneViewField[];
    itemFields: readonly string[];
    label: string;
    tableFields: readonly IdentityControlPlaneTableField[];
  }
>;

export const identityControlPlaneSourceSchema = {
  version: 1,
  entities: {
    principal: {
      label: "Principal",
      fields: {
        displayName: textField("Display name"),
        kind: enumField("Kind", principalKindLabels),
        status: enumField("Status", principalStatusLabels, "active"),
      },
      operations: writeOperations("principal", ["displayName", "kind", "status"], {
        updateFields: ["displayName", "status"],
      }),
    },
    "principal-email": {
      label: "Principal email",
      fields: {
        principal: referenceField("Principal", "principal", "displayName"),
        displayEmail: textField("Display email"),
        normalizedEmail: textField("Normalized email"),
        verificationStatus: enumField(
          "Verification status",
          emailVerificationStatusLabels,
          "unverified",
        ),
        primary: booleanField("Primary", false),
        recovery: booleanField("Recovery", false),
        verifiedAt: optionalTextField("Verified at"),
      },
      operations: writeOperations(
        "principal email",
        [
          "principal",
          "displayEmail",
          "normalizedEmail",
          "verificationStatus",
          "primary",
          "recovery",
          "verifiedAt",
        ],
        {
          updateFields: ["displayEmail", "verificationStatus", "primary", "recovery", "verifiedAt"],
        },
      ),
      constraints: {
        uniqueNormalizedEmail: { kind: "unique", fields: ["normalizedEmail"] },
      },
    },
    group: {
      label: "Group",
      fields: {
        displayName: textField("Display name"),
        status: enumField("Status", containerStatusLabels, "active"),
      },
      operations: writeOperations("group", ["displayName", "status"], {
        updateFields: ["status"],
      }),
    },
    organization: {
      label: "Organization",
      fields: {
        displayName: textField("Display name"),
        status: enumField("Status", containerStatusLabels, "active"),
      },
      operations: writeOperations("organization", ["displayName", "status"], {
        updateFields: ["status"],
      }),
    },
    membership: {
      label: "Membership",
      fields: {
        principal: referenceField("Principal", "principal", "displayName"),
        targetKind: enumField("Target kind", membershipTargetKindLabels),
        targetGroup: optionalReferenceField("Target group", "group", "displayName"),
        targetOrganization: optionalReferenceField(
          "Target organization",
          "organization",
          "displayName",
        ),
        status: enumField("Status", membershipStatusLabels, "active"),
      },
      operations: writeOperations(
        "membership",
        ["principal", "targetKind", "targetGroup", "targetOrganization", "status"],
        {
          updateFields: ["status"],
        },
      ),
    },
    role: {
      label: "Role",
      fields: {
        key: enumField("Key", roleKeyLabels),
        displayLabel: textField("Display label"),
        status: enumField("Status", roleStatusLabels, "active"),
      },
      operations: writeOperations("role", ["key", "displayLabel", "status"], {
        updateFields: ["displayLabel", "status"],
      }),
      constraints: {
        uniqueKey: { kind: "unique", fields: ["key"] },
      },
    },
    "role-assignment": {
      label: "Role assignment",
      fields: {
        role: referenceField("Role", "role", "displayLabel"),
        targetKind: enumField("Target kind", roleAssignmentTargetKindLabels),
        targetPrincipal: optionalReferenceField("Target principal", "principal", "displayName"),
        targetGroup: optionalReferenceField("Target group", "group", "displayName"),
        targetOrganization: optionalReferenceField(
          "Target organization",
          "organization",
          "displayName",
        ),
        scopeKind: enumField("Scope kind", roleAssignmentScopeKindLabels),
        appInstallId: optionalTextField("App install id"),
        scopeOrganization: optionalReferenceField(
          "Scope organization",
          "organization",
          "displayName",
        ),
        status: enumField("Status", roleAssignmentStatusLabels, "active"),
      },
      operations: writeOperations(
        "role assignment",
        [
          "role",
          "targetKind",
          "targetPrincipal",
          "targetGroup",
          "targetOrganization",
          "scopeKind",
          "appInstallId",
          "scopeOrganization",
          "status",
        ],
        {
          updateFields: ["status"],
        },
      ),
    },
    "app-registration": {
      label: "App registration",
      fields: {
        appInstallId: textField("App install id"),
        targetKind: enumField("Target kind", appRegistrationTargetKindLabels),
        targetPrincipal: optionalReferenceField("Target principal", "principal", "displayName"),
        targetOrganization: optionalReferenceField(
          "Target organization",
          "organization",
          "displayName",
        ),
        status: enumField("Status", appRegistrationStatusLabels, "pending"),
        selectedOrganization: optionalReferenceField(
          "Selected organization",
          "organization",
          "displayName",
        ),
      },
      operations: writeOperations(
        "app registration",
        [
          "appInstallId",
          "targetKind",
          "targetPrincipal",
          "targetOrganization",
          "status",
          "selectedOrganization",
        ],
        {
          updateFields: ["status", "selectedOrganization"],
        },
      ),
    },
    invitation: {
      label: "Invitation",
      fields: {
        targetEmail: textField("Target email"),
        targetSurface: enumField("Target surface", invitationTargetSurfaceLabels),
        targetAppInstallId: optionalTextField("Target app install id"),
        targetOrganization: optionalReferenceField(
          "Target organization",
          "organization",
          "displayName",
        ),
        invitedPrincipal: optionalReferenceField("Invited principal", "principal", "displayName"),
        inviterPrincipal: optionalReferenceField("Inviter principal", "principal", "displayName"),
        status: enumField("Status", invitationStatusLabels, "pending"),
        expiresAt: textField("Expires at"),
        acceptedAt: optionalTextField("Accepted at"),
      },
      operations: writeOperations(
        "invitation",
        [
          "targetEmail",
          "targetSurface",
          "targetAppInstallId",
          "targetOrganization",
          "invitedPrincipal",
          "inviterPrincipal",
          "status",
          "expiresAt",
          "acceptedAt",
        ],
        {
          updateFields: ["status", "acceptedAt"],
        },
      ),
    },
  },
  relationships: {
    principalEmailPrincipal: toOne(
      "Principal email principal",
      "principal-email",
      "principal",
      "principal",
      "principalEmails",
    ),
    principalEmails: toMany(
      "Principal emails",
      "principal",
      "principal-email",
      "principal",
      "principalEmailPrincipal",
    ),
    membershipPrincipal: toOne(
      "Membership principal",
      "membership",
      "principal",
      "principal",
      "principalMemberships",
    ),
    principalMemberships: toMany(
      "Principal memberships",
      "principal",
      "membership",
      "principal",
      "membershipPrincipal",
    ),
    membershipGroup: toOne(
      "Membership group",
      "membership",
      "targetGroup",
      "group",
      "groupMemberships",
    ),
    groupMemberships: toMany(
      "Group memberships",
      "group",
      "membership",
      "targetGroup",
      "membershipGroup",
    ),
    membershipOrganization: toOne(
      "Membership organization",
      "membership",
      "targetOrganization",
      "organization",
      "organizationMemberships",
    ),
    organizationMemberships: toMany(
      "Organization memberships",
      "organization",
      "membership",
      "targetOrganization",
      "membershipOrganization",
    ),
    roleAssignmentRole: toOne(
      "Role assignment role",
      "role-assignment",
      "role",
      "role",
      "roleAssignments",
    ),
    roleAssignments: toMany(
      "Role assignments",
      "role",
      "role-assignment",
      "role",
      "roleAssignmentRole",
    ),
    roleAssignmentTargetPrincipal: toOne(
      "Role assignment principal target",
      "role-assignment",
      "targetPrincipal",
      "principal",
    ),
    roleAssignmentTargetGroup: toOne(
      "Role assignment group target",
      "role-assignment",
      "targetGroup",
      "group",
    ),
    roleAssignmentTargetOrganization: toOne(
      "Role assignment organization target",
      "role-assignment",
      "targetOrganization",
      "organization",
    ),
    roleAssignmentScopeOrganization: toOne(
      "Role assignment scope organization",
      "role-assignment",
      "scopeOrganization",
      "organization",
    ),
    appRegistrationTargetPrincipal: toOne(
      "App registration principal target",
      "app-registration",
      "targetPrincipal",
      "principal",
    ),
    appRegistrationTargetOrganization: toOne(
      "App registration organization target",
      "app-registration",
      "targetOrganization",
      "organization",
    ),
    appRegistrationSelectedOrganization: toOne(
      "App registration selected organization",
      "app-registration",
      "selectedOrganization",
      "organization",
    ),
    invitationTargetOrganization: toOne(
      "Invitation target organization",
      "invitation",
      "targetOrganization",
      "organization",
    ),
    invitationInvitedPrincipal: toOne(
      "Invitation invited principal",
      "invitation",
      "invitedPrincipal",
      "principal",
    ),
    invitationInviterPrincipal: toOne(
      "Invitation inviter principal",
      "invitation",
      "inviterPrincipal",
      "principal",
    ),
  },
  queries: Object.fromEntries(
    identityControlPlaneEntityNames.map((entityName) => [
      `${camelEntityName(entityName)}All`,
      allQuery(entityViewConfig[entityName].label, entityName),
    ]),
  ),
  itemViews: Object.fromEntries(
    identityControlPlaneEntityNames.map((entityName) => [
      `${camelEntityName(entityName)}Item`,
      itemView(entityName, entityViewConfig[entityName].itemFields),
    ]),
  ),
  tableViews: Object.fromEntries(
    identityControlPlaneEntityNames.map((entityName) => [
      `${camelEntityName(entityName)}Table`,
      tableView(entityName, entityViewConfig[entityName].tableFields, {
        editView: `${camelEntityName(entityName)}Edit`,
        operationLabel: `${entityLabel(entityName)} operations`,
      }),
    ]),
  ),
  views: Object.fromEntries(
    identityControlPlaneEntityNames.flatMap((entityName) => {
      const viewName = camelEntityName(entityName);

      return [
        [`${viewName}Create`, createView(entityName, entityViewConfig[entityName].createFields)],
        [`${viewName}Edit`, editView(entityName, entityViewConfig[entityName].editFields)],
        [
          `${viewName}List`,
          collectionView(
            entityViewConfig[entityName].label,
            entityName,
            `${viewName}All`,
            `${viewName}Table`,
            `${viewName}Create`,
          ),
        ],
      ];
    }),
  ),
  screens: {
    principals: screen("Principals", "/", [
      ["principals", "principalList"],
      ["principal-emails", "principalEmailList"],
    ]),
    organizations: screen("Organizations", "/organizations", [
      ["organizations", "organizationList"],
      ["groups", "groupList"],
      ["memberships", "membershipList"],
    ]),
    access: screen("Access", "/access", [
      ["roles", "roleList"],
      ["role-assignments", "roleAssignmentList"],
    ]),
    apps: screen("Apps", "/apps", [["app-registrations", "appRegistrationList"]]),
    invitations: screen("Invitations", "/invitations", [["invitations", "invitationList"]]),
  },
  runtime: {
    owner: "runtime",
    controlPlane: {
      entities: Object.fromEntries(
        identityControlPlaneEntityNames.map((entityName) => [
          entityName,
          { immutableFields: [...identityControlPlaneImmutableFields[entityName]] },
        ]),
      ),
    },
  },
} satisfies AppSchema;

function textField(label: string): FieldSchema {
  return { type: "text", required: true, label };
}

function optionalTextField(label: string): FieldSchema {
  return { type: "text", required: false, label };
}

function booleanField(label: string, defaultValue: boolean): FieldSchema {
  return { type: "boolean", required: true, label, default: defaultValue };
}

function enumField(
  label: string,
  values: Record<string, string>,
  defaultValue?: string,
): FieldSchema {
  return {
    type: "enum",
    required: true,
    label,
    values: Object.fromEntries(
      Object.entries(values).map(([value, valueLabel]) => [value, { label: valueLabel }]),
    ),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function optionalReferenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: false, label, to, displayField };
}

function referenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: true, label, to, displayField };
}

function toOne(
  label: string,
  fromEntity: string,
  fromField: string,
  toEntity: string,
  inverse?: string,
): NonNullable<AppSchema["relationships"]>[string] {
  return {
    kind: "toOne",
    label,
    from: { entity: fromEntity, field: fromField },
    to: { entity: toEntity },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function toMany(
  label: string,
  fromEntity: string,
  toEntity: string,
  toField: string,
  inverse?: string,
): NonNullable<AppSchema["relationships"]>[string] {
  return {
    kind: "toMany",
    label,
    from: { entity: fromEntity },
    to: { entity: toEntity, field: toField },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function allQuery(label: string, entity: IdentityControlPlaneEntityName) {
  return {
    label,
    entity,
    expression: { kind: "all" },
  } satisfies AppSchema["queries"][string];
}

function itemView(entity: IdentityControlPlaneEntityName, fields: readonly string[]) {
  return {
    entity,
    fields: Object.fromEntries(fields.map((field) => [field, viewField(editorForField(field))])),
  } satisfies AppSchema["itemViews"][string];
}

function tableView(
  entity: IdentityControlPlaneEntityName,
  fields: readonly IdentityControlPlaneTableField[],
  options: {
    editView: string;
    operationLabel: string;
  },
) {
  return {
    entity,
    operations: [
      {
        operation: `${entity}.update`,
        label: `Edit ${entityLabel(entity)}`,
        target: { kind: "row" },
        editView: options.editView,
      },
    ],
    columns: [
      ...fields.map(tableFieldColumn),
      {
        type: "operationControl",
        label: options.operationLabel,
        operations: [`${entity}.update`],
        align: "end",
        width: "xs",
        presentation: "dropdown",
      },
    ],
  } satisfies AppSchema["tableViews"][string];
}

function tableFieldColumn(fieldInput: IdentityControlPlaneTableField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  const display = typeof fieldInput === "string" ? "readOnly" : (fieldInput.display ?? "readOnly");

  return {
    type: "field",
    field,
    display,
  } satisfies AppSchema["tableViews"][string]["columns"][number];
}

function createView(
  entity: IdentityControlPlaneEntityName,
  fields: readonly IdentityControlPlaneViewField[],
) {
  return {
    type: "create",
    entity,
    fields: Object.fromEntries(fields.map(createFieldEntry)),
  } satisfies AppSchema["views"][string];
}

function editView(
  entity: IdentityControlPlaneEntityName,
  fields: readonly IdentityControlPlaneViewField[],
) {
  return {
    type: "edit",
    entity,
    fields: Object.fromEntries(fields.map(viewFieldEntry)),
  } satisfies AppSchema["views"][string];
}

function collectionView(
  label: string,
  entity: IdentityControlPlaneEntityName,
  defaultQuery: string,
  tableViewName: string,
  createViewName: string,
) {
  return {
    type: "collection",
    label,
    entity,
    queries: [{ query: defaultQuery, count: { type: "count" } }],
    defaultQuery,
    result: {
      type: "table",
      tableView: tableViewName,
    },
    operations: [{ operation: `${entity}.create`, createView: createViewName }],
  } satisfies AppSchema["views"][string];
}

function screen(
  label: string,
  path: `/${string}`,
  sections: ReadonlyArray<[id: string, view: string]>,
) {
  return {
    type: "workspace",
    label,
    path,
    navigation: { primary: true },
    layout: {
      type: "stack",
      sections: sections.map(([id, view]) => ({ id, type: "collection", view })),
    },
  } satisfies NonNullable<AppSchema["screens"]>[string];
}

function writeOperations(
  label: string,
  fields: readonly string[],
  options: { updateFields?: readonly string[] } = {},
) {
  const input = {
    fields: Object.fromEntries(fields.map((field) => [field, { field }])),
  };
  const updateInput = {
    fields: Object.fromEntries((options.updateFields ?? fields).map((field) => [field, { field }])),
  };

  return {
    create: {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    update: {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input: updateInput,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
  } satisfies NonNullable<AppSchema["entities"][string]["operations"]>;
}

function viewField(editor: FieldEditor) {
  return {
    editor,
    commit:
      editor === "boolean" || editor === "enum" || editor === "reference"
        ? "immediate"
        : "field-commit",
  } satisfies AppSchema["itemViews"][string]["fields"][string];
}

function createField(editor: FieldEditor) {
  return { editor } satisfies NonNullable<
    Extract<AppSchema["views"][string], { type: "create" }>["fields"]
  >[string];
}

function createFieldEntry(fieldInput: IdentityControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;

  return [
    field,
    {
      ...createField(editorForField(field)),
      ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
        ? {}
        : { visibleWhen: fieldInput.visibleWhen }),
    },
  ] as const;
}

function viewFieldEntry(fieldInput: IdentityControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;

  return [
    field,
    {
      ...viewField(editorForField(field)),
      ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
        ? {}
        : { visibleWhen: fieldInput.visibleWhen }),
    },
  ] as const;
}

function editorForField(field: string): FieldEditor {
  if (field === "primary" || field === "recovery") {
    return "boolean";
  }

  if (
    field === "kind" ||
    field === "status" ||
    field === "key" ||
    field === "verificationStatus" ||
    field === "targetKind" ||
    field === "scopeKind" ||
    field === "targetSurface"
  ) {
    return "enum";
  }

  if (
    field === "principal" ||
    field === "role" ||
    field === "targetPrincipal" ||
    field === "targetGroup" ||
    field === "targetOrganization" ||
    field === "scopeOrganization" ||
    field === "selectedOrganization" ||
    field === "invitedPrincipal" ||
    field === "inviterPrincipal"
  ) {
    return "reference";
  }

  return "text";
}

function camelEntityName(entityName: IdentityControlPlaneEntityName): string {
  return entityName.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function entityLabel(entityName: IdentityControlPlaneEntityName): string {
  return entityName.replace(/-/g, " ");
}
