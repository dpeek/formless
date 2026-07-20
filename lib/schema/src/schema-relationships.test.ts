import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";
import { rateEntities, rateRelationships, rateSchema } from "./schema-test-fixtures.ts";

describe("schema relationships", () => {
  it("parses optional to-one, to-many, and many-to-many relationships", () => {
    expect(parseAppSchema(rateSchema({ relationships: undefined })).relationships).toBeUndefined();

    const schema = parseAppSchema(rateSchema());

    expect(schema.relationships?.rateCard).toEqual(rateRelationships().rateCard);
    expect(schema.relationships?.cardRates).toEqual(rateRelationships().cardRates);
    expect(schema.relationships?.cardResources).toEqual(rateRelationships().cardResources);
  });

  it("rejects invalid relationship endpoints, through constraints, and inverse links", () => {
    const relationships = rateRelationships();
    const invalidCases = [
      {
        relationships: [],
        message: "Schema relationships must be an object",
      },
      {
        relationships: {
          ...relationships,
          rateCard: { ...relationships.rateCard, to: { entity: "resource" } },
        },
        message: 'from field "rate.card" must reference entity "resource"',
      },
      {
        relationships: {
          ...relationships,
          cardRates: { ...relationships.cardRates, to: { entity: "rate", field: "resource" } },
        },
        message: 'to field "rate.resource" must reference entity "card"',
      },
      {
        relationships: {
          ...relationships,
          cardResources: {
            ...relationships.cardResources,
            through: {
              ...relationships.cardResources.through,
              fromField: "cost",
            },
          },
        },
        message: 'through fromField field "rate.cost" must be a reference field',
      },
      {
        relationships: {
          ...relationships,
          cardResources: {
            ...relationships.cardResources,
            through: {
              ...relationships.cardResources.through,
              uniqueConstraint: "missing",
            },
          },
        },
        message: 'references unknown constraint "rate.missing"',
      },
      {
        relationships: {
          ...relationships,
          rateCard: { ...relationships.rateCard, inverse: "missing" },
        },
        message: 'inverse references unknown relationship "missing"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(rateSchema({ relationships: invalidCase.relationships })),
      ).toThrow(invalidCase.message);
    }

    expect(() =>
      parseAppSchema(
        rateSchema({
          entities: rateEntities({
            constraints: {
              uniqueRatePair: { kind: "unique", fields: ["card"] },
            },
          }),
        }),
      ),
    ).toThrow('must cover through fields "card" and "resource"');
  });
});
