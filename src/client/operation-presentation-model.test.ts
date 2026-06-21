import { describe, expect, it } from "vite-plus/test";
import type { EntitySchema } from "@dpeek/formless-schema";
import { rateSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";
import {
  selectCommandOperationByHandlerCapability,
  selectCommandOperationsByHandlerCapability,
} from "./operation-presentation-model.ts";

describe("operation presentation model", () => {
  it("selects command operations from operation handler capabilities", () => {
    const clearCompleted = selectCommandOperationByHandlerCapability(
      "task",
      taskSourceSchema.entities.task,
      "clearCompletedTargetCount",
      "collection",
    );
    const regenerateMissingRates = selectCommandOperationByHandlerCapability(
      "rate",
      rateSourceSchema.entities.rate,
      "createMissingJoinRecords",
      "collection",
    );

    expect(clearCompleted).toMatchObject({
      canonicalKey: "task.clearCompletedTasks",
      operationName: "clearCompletedTasks",
      operation: {
        kind: "command",
        effect: {
          type: "operationHandler",
          handler: "clear-completed",
          config: { query: "taskCompleted" },
        },
      },
    });
    expect(regenerateMissingRates).toMatchObject({
      canonicalKey: "rate.regenerateMissingRates",
      operationName: "regenerateMissingRates",
      operation: {
        kind: "command",
        effect: {
          type: "operationHandler",
          handler: "create-missing-join-records",
        },
      },
    });
  });

  it("returns no command capabilities without source operations", () => {
    const entityWithoutOperations = {
      ...taskSourceSchema.entities.task,
      operations: undefined,
    } as unknown as EntitySchema;

    expect(
      selectCommandOperationsByHandlerCapability(
        "task",
        entityWithoutOperations,
        "clearCompletedTargetCount",
        "collection",
      ),
    ).toEqual([]);
  });
});
