import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";
import { rateEntities, rateSchema } from "./schema-test-fixtures.ts";

describe("schema relationship operation handlers", () => {
  it("parses missing and selected join-record handlers", () => {
    const operations = {
      regenerateMissingRates: commandOperation("create-missing-join-records", {
        join: {
          left: { field: "resource", query: "resourceAll" },
          right: { field: "card", query: "cardAll" },
        },
      }),
      addSelectedRate: commandOperation("create-selected-join-record", {
        relationship: "cardResources",
      }),
      removeSelectedRates: commandOperation("remove-selected-join-records", {
        relationship: "cardResources",
      }),
    };
    const schema = parseAppSchema(
      rateSchema({
        entities: rateEntities({ operations }),
      }),
    );

    expect(schema.entities.rate?.operations?.regenerateMissingRates.effect).toMatchObject({
      type: "operationHandler",
      handler: "create-missing-join-records",
    });
    expect(schema.entities.rate?.operations?.addSelectedRate.effect).toMatchObject({
      type: "operationHandler",
      handler: "create-selected-join-record",
      config: { relationship: "cardResources" },
    });
    expect(schema.entities.rate?.operations?.removeSelectedRates.effect).toMatchObject({
      type: "operationHandler",
      handler: "remove-selected-join-records",
      config: { relationship: "cardResources" },
    });
  });

  it("rejects join handlers with incompatible relationships or missing defaults", () => {
    const selectedJoinOperation = commandOperation("create-selected-join-record", {
      relationship: "cardResources",
    });
    const invalidCases = [
      {
        entities: rateEntities({
          operations: {
            addSelectedRate: commandOperation("create-selected-join-record", {
              relationship: "missing",
            }),
          },
        }),
        message: 'references unknown relationship "missing"',
      },
      {
        entities: rateEntities({
          operations: {
            addSelectedRate: commandOperation("create-selected-join-record", {
              relationship: "cardRates",
            }),
          },
        }),
        message: 'relationship "cardRates" must be manyToMany',
      },
      {
        entities: {
          ...rateEntities(),
          card: {
            ...rateEntities().card,
            operations: { addSelectedRate: selectedJoinOperation },
          },
        },
        message: 'relationship "cardResources" uses through entity "rate", not "card"',
      },
      {
        entities: rateEntities({
          fields: {
            ...rateEntities().rate.fields,
            cost: { type: "number", required: true, label: "Cost", min: 0 },
          },
          operations: {
            regenerateMissingRates: commandOperation("create-missing-join-records", {
              join: {
                left: { field: "resource", query: "resourceAll" },
                right: { field: "card", query: "cardAll" },
              },
            }),
          },
        }),
        message: 'requires field "cost" to have a default',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(rateSchema({ entities: invalidCase.entities }))).toThrow(
        invalidCase.message,
      );
    }
  });
});

function commandOperation(handler: string, config: Record<string, unknown>) {
  return {
    label: "Run handler",
    kind: "command",
    scope: "record",
    effect: { type: "operationHandler", handler, config },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}
