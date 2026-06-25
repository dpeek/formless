import type { AppSchema, EntityOperationSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import { sourceLikeTaskSchema } from "../test/schema-builders.ts";
import {
  validateOperationCommandHandlerInputValues,
  validateOperationRecordPlanInputValues,
  validateOperationRecordWriteValues,
  type OperationInputValidationRequest,
} from "./operation-input-validation.ts";

const storage = {} as DurableObjectStorage;

describe("operation input validation", () => {
  it("rejects unknown and system fields outside the declared operation input contract", () => {
    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: {
              title: { field: "title", required: true },
            },
          }),
          rawInput: {
            title: "Declared title",
            admin: true,
          },
        }),
      ),
    ).toThrow('Operation input includes undeclared field "admin".');

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: {
              title: { field: "title", required: true },
            },
          }),
          rawInput: {
            title: "Declared title",
            updatedAt: "2026-06-25T00:00:00.000Z",
          },
        }),
      ),
    ).toThrow('Operation input must not include system field "updatedAt".');
  });

  it("requires declared operation input fields before materialization", () => {
    expect(() =>
      validateOperationRecordPlanInputValues(
        operationInputRequest({
          operation: recordPlanTaskOperation({
            fields: {
              title: { type: "text", required: true, label: "Title" },
            },
          }),
          rawInput: {},
        }),
      ),
    ).toThrow('Operation input field "title" is required.');

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: {
              taskTitle: { field: "title", required: true },
            },
          }),
          rawInput: {},
        }),
      ),
    ).toThrow('Operation input field "taskTitle" is required.');
  });

  it("validates inline scalar operation input fields", () => {
    const operation = recordPlanTaskOperation({
      fields: {
        note: { type: "text", required: true, label: "Note" },
        approved: { type: "boolean", required: true, label: "Approved" },
        dueDate: { type: "date", required: true, label: "Due date" },
        score: { type: "number", required: true, label: "Score" },
        priority: {
          type: "enum",
          required: true,
          label: "Priority",
          values: {
            low: { label: "Low" },
            normal: { label: "Normal" },
          },
        },
      },
    });

    expect(
      validateOperationRecordPlanInputValues(
        operationInputRequest({
          operation,
          rawInput: {
            note: "Needs review",
            approved: false,
            dueDate: "2026-06-25",
            score: 3,
            priority: "normal",
          },
        }),
      ),
    ).toEqual({
      note: "Needs review",
      approved: false,
      dueDate: "2026-06-25",
      score: 3,
      priority: "normal",
    });

    const invalidCases = [
      {
        rawInput: {
          note: "",
          approved: false,
          dueDate: "2026-06-25",
          score: 3,
          priority: "normal",
        },
        error: 'Operation input field "note" cannot be empty.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: "false",
          dueDate: "2026-06-25",
          score: 3,
          priority: "normal",
        },
        error: 'Operation input field "approved" must be a boolean.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: false,
          dueDate: "06/25/2026",
          score: 3,
          priority: "normal",
        },
        error: 'Operation input field "dueDate" must be a YYYY-MM-DD date.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: false,
          dueDate: "2026-06-25",
          score: "3",
          priority: "normal",
        },
        error: 'Operation input field "score" must be a finite number.',
      },
      {
        rawInput: {
          note: "Needs review",
          approved: false,
          dueDate: "2026-06-25",
          score: 3,
          priority: "urgent",
        },
        error: 'Operation input field "priority" must be a known enum value.',
      },
    ];

    for (const testCase of invalidCases) {
      expect(() =>
        validateOperationRecordPlanInputValues(
          operationInputRequest({
            operation,
            rawInput: testCase.rawInput,
          }),
        ),
      ).toThrow(testCase.error);
    }
  });

  it("validates entity-backed operation input fields through the entity field contract", () => {
    const operation = createTaskOperation({
      fields: {
        taskTitle: { field: "title", required: true },
        taskDone: { field: "done", required: true },
        taskPriority: { field: "priority", required: true },
      },
    });

    expect(
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Entity-backed title",
            taskDone: false,
            taskPriority: "normal",
          },
        }),
      ),
    ).toEqual({
      title: "Entity-backed title",
      done: false,
      priority: "normal",
    });

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Entity-backed title",
            taskDone: "false",
            taskPriority: "normal",
          },
        }),
      ),
    ).toThrow('Field "done" must be a boolean.');

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Entity-backed title",
            taskDone: false,
            taskPriority: "urgent",
          },
        }),
      ),
    ).toThrow('Field "priority" must be a known enum value.');
  });

  it("rejects record write and record-plan input values when no input contract exists", () => {
    const operation = noInputCommandTaskOperation();

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          operationName: "noInputWrite",
          rawInput: { title: "Unexpected" },
        }),
      ),
    ).toThrow('Operation "task.noInputWrite" does not declare input fields.');

    expect(() =>
      validateOperationRecordPlanInputValues(
        operationInputRequest({
          operation,
          operationName: "noInputPlan",
          rawInput: { title: "Unexpected" },
        }),
      ),
    ).toThrow('Operation "task.noInputPlan" does not declare input fields.');
  });

  it("keeps record-plan and handler values keyed by operation input name", () => {
    const operation = recordPlanTaskOperation({
      fields: {
        taskTitle: { field: "title", required: true },
        taskDone: { field: "done", required: true },
      },
    });
    const rawInput = {
      taskTitle: "Planned task",
      taskDone: false,
    };

    expect(
      validateOperationRecordPlanInputValues(
        operationInputRequest({
          operation,
          rawInput,
        }),
      ),
    ).toEqual(rawInput);
    expect(
      validateOperationCommandHandlerInputValues(
        operationInputRequest({
          operation,
          rawInput,
        }),
      ),
    ).toEqual(rawInput);
  });

  it("maps entity-backed create and update input to stored entity field names", () => {
    const createOperation = createTaskOperation({
      fields: {
        taskTitle: { field: "title", required: true },
        taskDone: { field: "done", required: true },
      },
    });
    const updateOperation = updateTaskOperation({
      fields: {
        taskTitle: { field: "title" },
        taskDone: { field: "done" },
      },
    });

    expect(
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation: createOperation,
          rawInput: {
            taskTitle: "Created task",
            taskDone: false,
          },
        }),
      ),
    ).toEqual({
      title: "Created task",
      done: false,
    });
    expect(
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation: updateOperation,
          operationName: "update",
          rawInput: {
            taskTitle: "",
            taskDone: true,
          },
        }),
      ),
    ).toEqual({
      title: "",
      done: true,
    });
  });
});

function operationInputRequest(input: {
  operation: EntityOperationSchema;
  operationName?: string;
  rawInput: unknown;
  schema?: AppSchema;
}): OperationInputValidationRequest {
  return {
    entityName: "task",
    operationName: input.operationName ?? "submit",
    operation: input.operation,
    rawInput: input.rawInput,
    schema: input.schema ?? sourceLikeTaskSchema(),
    storage,
  };
}

function createTaskOperation(input: NonNullable<EntityOperationSchema["input"]>) {
  return {
    kind: "create",
    scope: "collection",
    input,
    effect: { type: "createRecord" },
    output: { type: "create" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}

function updateTaskOperation(input: NonNullable<EntityOperationSchema["input"]>) {
  return {
    kind: "update",
    scope: "record",
    input,
    effect: { type: "patchRecord" },
    output: { type: "update" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}

function recordPlanTaskOperation(input: NonNullable<EntityOperationSchema["input"]>) {
  return {
    kind: "command",
    scope: "collection",
    input,
    effect: { type: "recordPlan", steps: [] },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}

function noInputCommandTaskOperation() {
  return {
    kind: "command",
    scope: "collection",
    effect: { type: "recordPlan", steps: [] },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  } satisfies EntityOperationSchema;
}
