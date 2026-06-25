import type { AppSchema, EntityOperationSchema, EntitySchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";
import { sourceLikeTaskSchema } from "../test/schema-builders.ts";
import { BadRequestError } from "./errors.ts";
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

  it("keeps storage-backed reference checks in the Worker adapter", () => {
    const operation = createTaskOperation({
      fields: {
        taskTitle: { field: "title", required: true },
        taskProject: { field: "project", required: true },
      },
    });
    const schema = schemaWithTaskProjectReference();

    expect(
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Referenced task",
            taskProject: "project-1",
          },
          schema,
          storage: storageWithRecords([projectRecord("project-1")]),
        }),
      ),
    ).toEqual({
      title: "Referenced task",
      project: "project-1",
    });

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Missing project task",
            taskProject: "missing-project",
          },
          schema,
          storage: storageWithRecords([]),
        }),
      ),
    ).toThrow('Field "project" references unknown project record "missing-project".');

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Wrong entity task",
            taskProject: "task-1",
          },
          schema,
          storage: storageWithRecords([taskRecord("task-1")]),
        }),
      ),
    ).toThrow('Field "project" must reference a project record.');

    expect(() =>
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation,
          rawInput: {
            taskTitle: "Tombstoned project task",
            taskProject: "project-2",
          },
          schema,
          storage: storageWithRecords([projectRecord("project-2", { deleted: true })]),
        }),
      ),
    ).toThrow('Field "project" cannot reference tombstoned record "project-2".');
  });

  it("wraps schema projection errors in runtime BadRequestError", () => {
    let thrown: unknown;

    try {
      validateOperationRecordWriteValues(
        operationInputRequest({
          operation: createTaskOperation({
            fields: {
              invalidMapping: { field: "missingEntityField", required: true },
            },
          }),
          rawInput: {
            invalidMapping: "value",
          },
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestError);
    expect(thrown).toMatchObject({
      message: 'Operation input field "invalidMapping" is invalid.',
    });
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
  storage?: DurableObjectStorage;
}): OperationInputValidationRequest {
  return {
    entityName: "task",
    operationName: input.operationName ?? "submit",
    operation: input.operation,
    rawInput: input.rawInput,
    schema: input.schema ?? sourceLikeTaskSchema(),
    storage: input.storage ?? storage,
  };
}

function schemaWithTaskProjectReference(): AppSchema {
  const schema = sourceLikeTaskSchema();
  const taskEntity = schema.entities.task;

  if (!taskEntity) {
    throw new Error("Expected task entity.");
  }

  schema.entities.task = {
    ...taskEntity,
    fields: {
      ...taskEntity.fields,
      project: {
        type: "reference",
        required: false,
        label: "Project",
        to: "project",
        displayField: "name",
      },
    },
  };
  schema.entities.project = {
    label: "Project",
    fields: {
      name: { type: "text", required: true, label: "Name" },
    },
  } satisfies EntitySchema;

  return schema;
}

function storageWithRecords(records: StoredRecord[]): DurableObjectStorage {
  return {
    sql: {
      exec<T = unknown>(_query: string, recordId: unknown) {
        const record = records.find((candidate) => candidate.id === recordId);

        return {
          next(): IteratorResult<T> {
            if (!record) {
              return { done: true, value: undefined as T };
            }

            return {
              done: false,
              value: {
                id: record.id,
                entity: record.entity,
                values_json: JSON.stringify(record.values),
                created_at: record.createdAt,
                updated_at: record.updatedAt,
                deleted_at: record.deletedAt ?? null,
              } as T,
            };
          },
        };
      },
    },
  } as unknown as DurableObjectStorage;
}

function projectRecord(id: string, options: { deleted?: boolean } = {}): StoredRecord {
  return {
    id,
    entity: "project",
    values: { name: "Reference project" },
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    deletedAt: options.deleted ? "2026-06-25T00:01:00.000Z" : undefined,
  };
}

function taskRecord(id: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title: "Wrong target", done: false },
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
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
