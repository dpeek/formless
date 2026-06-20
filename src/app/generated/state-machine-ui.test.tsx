import "fake-indexeddb/auto";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import { deleteClientDb, saveBootstrapResponse } from "../../client/db.ts";
import {
  resetClientStore,
  getClientStoreSnapshot,
  refreshClientStoreFromDb,
} from "../../client/store.ts";
import {
  selectStateMachineField,
  selectTransitionStateOperations,
} from "../../client/state-machine-model.ts";
import type { OperationInvocationResponse } from "../../shared/operation-invocation.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { ChangeRow } from "../../shared/protocol.ts";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import {
  RecordTransitionOperationControls,
  StateMachineStateBadge,
  submitTransitionStateOperation,
} from "./state-machine-ui.tsx";

beforeEach(async () => {
  await deleteClientDb("tasks");
  resetClientStore();
});

describe("generated state-machine UI", () => {
  it("renders enum state badges with presentation metadata and terminal state facts", () => {
    const schema = lifecycleSchema();
    const entity = schema.entities.task;
    const field = entity.fields.status;
    const stateMachine = selectStateMachineField(entity, "status");

    if (field.type !== "enum" || !stateMachine) {
      throw new Error("Missing lifecycle field.");
    }

    const html = renderToStaticMarkup(
      <StateMachineStateBadge
        field={field}
        label="Status"
        stateMachine={stateMachine}
        value="done"
      />,
    );

    expect(html).toContain('aria-label="Status: Done terminal"');
    expect(html).toContain('data-formless-state-machine="statusFlow"');
    expect(html).toContain('data-formless-state-terminal="true"');
    expect(html).toContain('data-formless-state-value="done"');
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain(">Done</span>");
  });

  it("renders valid and invalid transition controls with schema-derived reasons", () => {
    const schema = lifecycleSchema();
    const operations = selectTransitionStateOperations("task", schema.entities.task);
    const html = renderToStaticMarkup(
      <RecordTransitionOperationControls
        operations={operations}
        entityName="task"
        recordId="task-1"
        values={{ status: "todo", title: "First" }}
      />,
    );

    expect(operations[0]).toEqual(
      expect.not.objectContaining({
        action: expect.anything(),
      }),
    );
    expect(html).toContain('data-formless-transition-operation="startTask"');
    expect(html).toContain('data-formless-transition-state-valid="true"');
    expect(html).toContain('data-formless-transition-target-state="doing"');
    expect(html).toContain('data-formless-transition-operation="completeTask"');
    expect(html).toContain('data-formless-transition-state-valid="false"');
    expect(html).toContain('data-formless-transition-disabled-reason="Requires Doing."');
  });

  it("renders existing machine-owned fields as read-only badges", async () => {
    const schema = lifecycleSchema();
    const entity = schema.entities.task;
    const field = entity.fields.status;
    const stateMachine = selectStateMachineField(entity, "status");

    if (!stateMachine) {
      throw new Error("Missing lifecycle field.");
    }

    await saveBootstrapResponse("tasks", {
      schema,
      schemaUpdatedAt: "2026-06-09T00:00:00.000Z",
      records: [taskRecord("task-1", "todo")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    const html = renderToStaticMarkup(
      <RecordFieldEditor
        entityName="task"
        fieldConfig={{
          fieldName: "status",
          field,
          editor: "enum",
          commit: "immediate",
          label: "Status",
          stateMachine,
        }}
        recordId="task-1"
        showLabel={true}
      />,
    );

    expect(html).toContain('data-formless-state-machine-readonly="status"');
    expect(html).toContain('data-formless-state-machine="statusFlow"');
    expect(html).toContain(">Status</span>");
    expect(html).not.toContain("<select");
  });

  it("renders create machine-owned fields at the initial state", () => {
    const schema = lifecycleSchema();
    const entity = schema.entities.task;
    const field = entity.fields.status;
    const stateMachine = selectStateMachineField(entity, "status");

    if (!stateMachine) {
      throw new Error("Missing lifecycle field.");
    }

    const html = renderToStaticMarkup(
      <GeneratedCreateFieldControl
        fieldConfig={{
          fieldName: "status",
          field,
          editor: "enum",
          stateMachine,
        }}
      />,
    );

    expect(html).toContain('data-formless-state-machine-create="status"');
    expect(html).toContain('data-formless-state-value="todo"');
    expect(html).toContain('name="status"');
    expect(html).toContain('value="todo"');
    expect(html).not.toContain("<select");
  });

  it("submits transition operations through the generated operation endpoint with recordId input", async () => {
    const schema = lifecycleSchema();
    const changed = taskRecord("task-1", "doing");
    let submittedOperation: {
      idempotencyKey: string;
      recordId?: string;
      source?: { protocol?: string };
    };

    await saveBootstrapResponse("tasks", {
      schema,
      schemaUpdatedAt: "2026-06-09T00:00:00.000Z",
      records: [taskRecord("task-1", "todo")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    await submitTransitionStateOperation(
      "tasks",
      "task",
      "startTask",
      "task-1",
      async (input, init) => {
        submittedOperation = parseOperationRequestBody(init?.body);

        expect(input).toBe("/api/tasks/operations/task/startTask");
        expect(init?.method).toBe("POST");
        expect(submittedOperation).toMatchObject({
          idempotencyKey: expect.any(String),
          recordId: "task-1",
          source: { protocol: "generated-ui" },
        });
        const changes = [actionChange(2, changed, submittedOperation.idempotencyKey)];

        return Response.json({
          invocation: {} as OperationInvocationResponse["invocation"],
          output: {
            type: "command",
            affectedChangeIds: [submittedOperation.idempotencyKey],
            changes,
            cursor: 2,
          },
          status: "committed",
        } satisfies OperationInvocationResponse);
      },
    );

    expect(getClientStoreSnapshot().recordsById["task-1"]?.values.status).toBe("doing");
  });
});

function lifecycleSchema(): AppSchema {
  return parseAppSchema({
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          status: {
            type: "enum",
            required: true,
            default: "todo",
            values: {
              todo: { label: "Todo", presentation: { color: "warning", icon: "flag" } },
              doing: { label: "Doing", presentation: { color: "success", icon: "flag" } },
              done: { label: "Done", presentation: { color: "success", icon: "check" } },
            },
          },
        },
        stateMachines: {
          statusFlow: {
            field: "status",
            initial: "todo",
            terminal: ["done"],
            transitions: {
              start: { label: "Start", from: ["todo"], to: "doing" },
              complete: { label: "Complete", from: ["doing"], to: "done" },
            },
          },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
        operations: {
          create: {
            label: "Create Task",
            kind: "create",
            scope: "collection",
            input: { fields: { title: { field: "title" }, status: { field: "status" } } },
            effect: { type: "createRecord" },
            output: { type: "create" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
          update: {
            label: "Update Task",
            kind: "update",
            scope: "record",
            input: { fields: { title: { field: "title" }, status: { field: "status" } } },
            effect: { type: "patchRecord" },
            output: { type: "update" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
          startTask: {
            label: "Start",
            kind: "command",
            scope: "record",
            effect: {
              type: "registeredCommand",
              kind: "transition-state",
              machine: "statusFlow",
              transition: "start",
            },
            output: { type: "command" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
          completeTask: {
            label: "Complete",
            kind: "command",
            scope: "record",
            effect: {
              type: "registeredCommand",
              kind: "transition-state",
              machine: "statusFlow",
              transition: "complete",
            },
            output: { type: "command" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        },
      },
    },
    queries: {
      taskAll: { label: "All", entity: "task", expression: { kind: "all" } },
    },
    itemViews: {
      taskItem: {
        entity: "task",
        fields: {
          title: { editor: "text", commit: "field-commit" },
          status: { editor: "enum", commit: "immediate" },
        },
      },
    },
    tableViews: {},
    views: {
      taskHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskItem" },
      },
    },
    screens: {
      taskHome: {
        type: "workspace",
        label: "Tasks",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    },
  });
}

function taskRecord(id: string, status: "todo" | "doing" | "done"): StoredRecord {
  return {
    id,
    entity: "task",
    values: {
      title: "First",
      status,
    },
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
}

function actionChange(seq: number, payload: StoredRecord, actionId: string): ChangeRow {
  return {
    seq,
    mutationId: actionId,
    op: "action",
    entity: payload.entity,
    recordId: payload.id,
    payload,
    createdAt: "2026-06-09T00:00:01.000Z",
  };
}

function parseOperationRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  const parsed = JSON.parse(body) as unknown;

  expect(parsed).toEqual(
    expect.objectContaining({
      idempotencyKey: expect.any(String),
    }),
  );

  return parsed as {
    idempotencyKey: string;
    recordId?: string;
    source?: { protocol?: string };
  };
}
