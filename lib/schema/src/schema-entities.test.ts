import { describe, expect, it } from "vite-plus/test";

import { formatQualifiedEntityName, parseAppSchema, parseQualifiedEntityName } from "./index.ts";
import { rateEntities, rateSchema, taskEntity, taskSchema } from "./schema-test-fixtures.ts";

describe("schema entities", () => {
  it("parses schema-local entity keys and qualified boundary names", () => {
    const schema = parseAppSchema(
      taskSchema({
        entities: {
          task: taskEntity(),
          "project-note": taskEntity({ label: "Project note" }),
          "app-install": taskEntity({ label: "App install" }),
        },
      }),
    );

    expect(Object.keys(schema.entities)).toEqual(
      expect.arrayContaining(["task", "project-note", "app-install"]),
    );
    expect(parseQualifiedEntityName("Archive entity", "instance:app-install")).toEqual({
      schemaKey: "instance",
      entityKey: "app-install",
    });
    expect(formatQualifiedEntityName({ schemaKey: "instance", entityKey: "app-install" })).toBe(
      "instance:app-install",
    );
  });

  it("rejects non-canonical local entity keys and qualified local references", () => {
    const invalidKeys = [
      "",
      "appInstall",
      "App",
      "app_install",
      "app.install",
      "app/install",
      "site:block",
      "1app",
      "-app",
      "app-",
      "app--install",
    ];

    for (const entityKey of invalidKeys) {
      expect(() =>
        parseAppSchema(
          taskSchema({
            entities: {
              task: taskEntity(),
              [entityKey]: taskEntity({ label: "Invalid" }),
            },
          }),
        ),
      ).toThrow(`Schema entity key "${entityKey}" must be a singular kebab-case entity key.`);
    }

    expect(() =>
      parseAppSchema(
        taskSchema({
          entities: {
            task: taskEntity({
              fields: {
                ...taskEntity().fields,
                parent: { type: "reference", required: false, to: "tasks:task" },
              },
            }),
          },
        }),
      ),
    ).toThrow('Use local entity key "task"');
  });

  it("parses unique constraints and rejects invalid constraint fields", () => {
    const schema = parseAppSchema(rateSchema({ relationships: undefined }));

    expect(schema.entities.rate?.constraints?.uniqueRatePair).toEqual({
      kind: "unique",
      fields: ["resource", "card"],
    });

    const invalidCases = [
      {
        constraints: {},
        message: 'Entity "rate" constraints must not be empty',
      },
      {
        constraints: {
          uniqueRatePair: { kind: "unique", fields: [] },
        },
        message: "fields must be a non-empty array",
      },
      {
        constraints: {
          uniqueRatePair: { kind: "unique", fields: ["resource", "missing"] },
        },
        message: 'references unknown field "missing"',
      },
      {
        constraints: {
          duplicateField: { kind: "unique", fields: ["resource", "resource"] },
        },
        message: "fields must be unique",
      },
      {
        constraints: {
          oneDefaultCard: { kind: "uniqueWhere", fields: ["card"] },
        },
        message: 'has unsupported kind "uniqueWhere"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(
          rateSchema({
            entities: rateEntities({ constraints: invalidCase.constraints }),
            relationships: undefined,
          }),
        ),
      ).toThrow(invalidCase.message);
    }
  });
});
