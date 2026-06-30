import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, stringifySchema } from "./index.ts";

describe("schema identity reference fields", () => {
  it("accepts supported identity reference targets and local unqualified references", () => {
    const schema = parseAppSchema(identityReferenceSourceSchema());

    expect(schema.entities.account?.fields.ownerPrincipal).toEqual({
      type: "reference",
      required: false,
      to: "auth:principal",
    });
    expect(schema.entities.account?.fields.organization).toMatchObject({
      type: "reference",
      to: "auth:organization",
    });
    expect(schema.entities.account?.fields.group).toMatchObject({
      type: "reference",
      to: "auth:group",
    });
    expect(schema.entities.account?.fields.profile).toEqual({
      type: "reference",
      required: false,
      to: "profile",
      displayField: "name",
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects qualified aliases of local entities before accepting identity targets", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        entities: {
          ...identityReferenceSourceSchema().entities,
          principal: textEntity("Principal"),
        },
      }),
    ).toThrow('Use local entity key "principal"');
  });

  it("does not treat identity reference targets as local relationship endpoints", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        relationships: {
          accountPrincipal: {
            kind: "toOne",
            from: { entity: "account", field: "ownerPrincipal" },
            to: { entity: "auth:principal" },
          },
        },
      }),
    ).toThrow('Relationship "accountPrincipal" to references unknown entity "auth:principal"');
  });

  it("does not treat identity reference targets as reference-field table traversal targets", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        tableViews: {
          accountTable: {
            entity: "account",
            columns: [
              { type: "field", field: "name" },
              { type: "referenceField", referenceField: "ownerPrincipal", field: "displayName" },
            ],
          },
        },
      }),
    ).toThrow(
      'Table view "accountTable" column 1 referenceField "account.ownerPrincipal" targets unknown entity "auth:principal"',
    );
  });
});

function identityReferenceSourceSchema() {
  return {
    version: 1,
    entities: {
      account: {
        label: "Account",
        fields: {
          name: { type: "text", required: true },
          ownerPrincipal: { type: "reference", required: false, to: "auth:principal" },
          organization: { type: "reference", required: false, to: "auth:organization" },
          group: { type: "reference", required: false, to: "auth:group" },
          profile: {
            type: "reference",
            required: false,
            to: "profile",
            displayField: "name",
          },
        },
      },
      profile: textEntity("Profile"),
    },
    queries: {
      accounts: {
        label: "Accounts",
        entity: "account",
        expression: { kind: "all" },
      },
    },
    itemViews: {},
    tableViews: {
      accountTable: {
        entity: "account",
        columns: [
          { type: "field", field: "name" },
          { type: "field", field: "ownerPrincipal" },
          { type: "field", field: "organization" },
          { type: "field", field: "group" },
          { type: "field", field: "profile" },
        ],
      },
    },
    views: {
      accountHome: {
        type: "collection",
        label: "Accounts",
        entity: "account",
        queries: [{ query: "accounts" }],
        defaultQuery: "accounts",
        result: { type: "table", tableView: "accountTable" },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Home",
        layout: {
          type: "stack",
          sections: [{ id: "accounts", type: "collection", view: "accountHome" }],
        },
      },
    },
  };
}

function textEntity(label: string) {
  return {
    label,
    fields: {
      name: { type: "text", required: true },
    },
  };
}
