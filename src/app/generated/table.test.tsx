import { beforeEach, describe, expect, it } from "vite-plus/test";

import { resetClientStore } from "../../client/store.ts";
import type { ResultOrderingConfig, TableColumnConfig } from "../../client/views.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import { rateSeedRecords, rateSourceSchema, siteSourceSchema } from "../../test/schema-apps.ts";
import {
  renderRecordTableHtml,
  renderTableViewHtml,
  requiredTableModel,
} from "../../test/generated-table.tsx";
import { testSiteSeedRecords } from "../../test/site-records.ts";

describe("RecordTable", () => {
  beforeEach(() => {
    resetClientStore();
  });

  it("reserves wider cells for compact value/unit editors", () => {
    const html = renderTableViewHtml({
      records: rateSeedRecords,
      schema: rateSourceSchema,
      viewName: "rateHome",
    });

    expect(html).toContain('value="$825.00"');
    expect(html).toContain('role="grid"');
    expect(html).toContain('data-slot="table-column"');
    expect(html).not.toContain('data-slot="table-head"');
    expect(html).toContain("w-52 min-w-52 max-w-60");
  });

  it("renders aggregate footer slots as generated React Aria table rows", () => {
    const html = renderTableViewHtml({
      records: rateSeedRecords,
      schema: rateSourceSchema,
      viewName: "rateHome",
    });

    expect(html).toContain('data-formless-table-footer="true"');
    expect(html).toContain('aria-label="Average cost"');
    expect(html).toContain('aria-label="Average price"');
    expect(html).toContain('aria-label="Average margin"');
  });

  it("renders read-only enum icon and color presentation in table display cells", () => {
    const entity = presentationTaskSchema.entities.task;
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:priority",
        fieldName: "priority",
        field: entity.fields.priority,
        editor: "enum",
        commit: "immediate",
        label: "Priority",
        align: "start",
        width: "xs",
        display: "readOnly",
        format: "plain",
        presentation: { mode: "iconOnly" },
      },
    ];
    const html = renderRecordTableHtml({
      columns,
      entity,
      entityName: "task",
      records: [presentationTaskRecord("task-1", "high")],
      schema: presentationTaskSchema,
    });

    expect(html).toContain('aria-label="Priority: High"');
    expect(html).toContain('data-formless-field-presentation-mode="iconOnly"');
    expect(html).toContain('data-formless-field-presentation-color="danger"');
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain('d="M4 15s1-1 4-1');
  });

  it("renders system field table displays from record metadata without inline editors", () => {
    const schema = systemMetadataTableSchema();
    const table = requiredTableModel(schema, "taskHome");
    const record = {
      id: "task-1",
      entity: "task",
      values: { title: "Ship system metadata" },
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:30:00.000Z",
    } satisfies StoredRecord;

    const html = renderTableViewHtml({
      records: [record],
      schema,
      viewName: "taskHome",
    });

    expect(table.columns).toMatchObject([
      {
        type: "field",
        fieldName: "updatedAt",
        fieldRef: { kind: "system", name: "updatedAt" },
        display: "readOnly",
        writable: false,
      },
    ]);
    expect(html).toContain("2026-05-26T00:30:00.000Z");
    expect(html).not.toContain('name="updatedAt"');
    expect(html).not.toContain('value="2026-05-26T00:30:00.000Z"');
  });

  it("uses icon-sized utility columns for placement reordering and row operation controls", () => {
    const html = renderTableViewHtml({
      records: testSiteSeedRecords,
      schema: siteSourceSchema,
      viewName: "pageCompositionHome",
    });

    expect(html).toContain('aria-label="Reorder"');
    expect(html).toContain('aria-label="Actions"');
    expect(html.match(/w-6 min-w-6 max-w-6/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("renders operation menu labels, disabled reasons, destructive intent, and ordering moves", () => {
    const rateEntity = rateSourceSchema.entities.rate;
    const ordering: ResultOrderingConfig = {
      fieldName: "cost",
      field: { type: "number", required: true },
      scope: [],
      presentations: ["moveMenu"],
    };
    const columns: TableColumnConfig[] = [
      {
        type: "operationControl",
        key: "operationControl:inspectRate,blockedRate,deleteRate,ordering",
        label: "Rate operations",
        headerLabel: "Rate operations",
        controls: [
          {
            type: "static",
            bindingName: "inspectRate",
            label: "Inspect rate",
            variant: "default",
            disabled: false,
          },
          {
            type: "static",
            bindingName: "blockedRate",
            label: "Blocked rate",
            variant: "default",
            disabled: true,
            disabledReason: "No selected card",
          },
          {
            type: "static",
            bindingName: "deleteRate",
            label: "Delete rate",
            variant: "destructive",
            disabled: false,
          },
        ],
        presentation: "dropdown",
        includeOrdering: true,
        ordering,
        align: "end",
        width: "xs",
        display: "readOnly",
        format: "plain",
      },
    ];
    const html = renderRecordTableHtml({
      columns,
      entity: rateEntity,
      entityName: "rate",
      ordering,
      records: [rateRecord("rate-1", 100), rateRecord("rate-2", 200)],
      schema: rateSourceSchema,
    });

    expect(html).toContain('aria-label="Rate operations"');
    expect(html).toContain(
      'data-formless-table-operation-labels="Inspect rate|Blocked rate|Delete rate"',
    );
    expect(html).toContain(
      'data-formless-table-disabled-operation-labels="Blocked rate: No selected card"',
    );
    expect(html).toContain('data-formless-table-danger-operation-labels="Delete rate"');
    expect(html).toContain("Move up");
    expect(html).toContain("Move to bottom");
  });

  it("renders visible state-machine table fields as valid transition menus", () => {
    const schema = tableLifecycleSchema();
    const html = renderTableViewHtml({
      records: [taskLifecycleRecord("task-1", "todo")],
      schema,
      viewName: "taskTableHome",
    });

    expect(html).toContain('data-formless-state-transition-menu="task-1"');
    expect(html).toContain('aria-label="Status: Todo. Change state."');
    expect(html).toContain('data-formless-state-machine="statusFlow"');
    expect(html).toContain('data-formless-state-machine-field="status"');
    expect(html).toContain('data-formless-state-value="todo"');
    expect(html).toContain('data-formless-state-transition-operation-labels="Start"');
    expect(html).toContain('data-formless-state-transition-operations="startTask"');
    expect(html).toContain('data-formless-state-transition-target-states="doing"');
    expect(html).not.toContain("completeTask");
    expect(html).not.toContain('data-formless-transition-controls="task-1"');
  });

  it("keeps separate lifecycle transition controls when the state field is hidden or absent", () => {
    const schema = tableLifecycleSchema();
    const hiddenHtml = renderTableViewHtml({
      records: [taskLifecycleRecord("task-1", "todo")],
      schema,
      viewName: "taskHiddenStatusTableHome",
    });
    const absentHtml = renderTableViewHtml({
      records: [taskLifecycleRecord("task-1", "todo")],
      schema,
      viewName: "taskAbsentStatusTableHome",
    });

    expect(hiddenHtml).not.toContain('data-formless-state-transition-menu="task-1"');
    expect(hiddenHtml).toContain('data-formless-transition-controls="task-1"');
    expect(hiddenHtml).toContain('data-formless-transition-operation="startTask"');
    expect(hiddenHtml).toContain('data-formless-transition-operation="completeTask"');
    expect(absentHtml).not.toContain('data-formless-state-transition-menu="task-1"');
    expect(absentHtml).toContain('data-formless-transition-controls="task-1"');
  });
});

function rateRecord(id: string, cost: number): StoredRecord {
  return {
    id,
    entity: "rate",
    values: {
      card: "card-1",
      resource: "resource-1",
      cost,
      costUnit: "day",
      price: cost + 100,
    },
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  };
}

const presentationTaskSchema = {
  version: 1,
  entities: {
    task: {
      label: "Task",
      fields: {
        priority: {
          type: "enum",
          required: true,
          values: {
            low: { label: "Low", presentation: { color: "priority.low", icon: "priority-marker" } },
            normal: {
              label: "Normal",
              presentation: { color: "priority.normal", icon: "priority-marker" },
            },
            high: {
              label: "High",
              presentation: { color: "priority.high", icon: "priority-marker" },
            },
          },
        },
      },
    },
  },
  queries: {},
  itemViews: {},
  tableViews: {},
  views: {},
} satisfies AppSchema;

function systemMetadataTableSchema(): AppSchema {
  return parseAppSchema({
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
        },
        operations: {
          update: {
            label: "Update Task",
            kind: "update",
            scope: "record",
            input: { fields: { title: { field: "title" } } },
            effect: { type: "patchRecord" },
            output: { type: "update" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        },
      },
    },
    queries: {
      taskAll: { label: "All", entity: "task", expression: { kind: "all" } },
    },
    itemViews: {},
    tableViews: {
      taskTable: {
        entity: "task",
        columns: [{ type: "field", field: "updatedAt", display: "editor" }],
      },
    },
    views: {
      taskHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskTable" },
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

function presentationTaskRecord(id: string, priority: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { priority },
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
  };
}

function taskLifecycleRecord(id: string, status: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title: "Ship status menu", status },
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
  };
}

function tableLifecycleSchema(): AppSchema {
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
              todo: { label: "Todo", presentation: { color: "warning", icon: "priority-marker" } },
              doing: {
                label: "Doing",
                presentation: { color: "success", icon: "priority-marker" },
              },
              done: { label: "Done", presentation: { color: "success", icon: "confirm" } },
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
        operations: {
          startTask: {
            label: "Start",
            kind: "command",
            scope: "record",
            effect: {
              type: "operationHandler",
              handler: "transition-state",
              config: { machine: "statusFlow", transition: "start" },
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
              type: "operationHandler",
              handler: "transition-state",
              config: { machine: "statusFlow", transition: "complete" },
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
    itemViews: {},
    tableViews: {
      taskTable: {
        entity: "task",
        columns: [
          { type: "field", field: "title" },
          { type: "field", field: "status" },
        ],
      },
      taskHiddenStatusTable: {
        entity: "task",
        columns: [
          { type: "field", field: "title" },
          { type: "field", field: "status", display: "hidden" },
        ],
      },
      taskAbsentStatusTable: {
        entity: "task",
        columns: [{ type: "field", field: "title" }],
      },
    },
    views: {
      taskTableHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskTable" },
      },
      taskHiddenStatusTableHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskHiddenStatusTable" },
      },
      taskAbsentStatusTableHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskAbsentStatusTable" },
      },
    },
    screens: {
      taskHome: {
        type: "workspace",
        label: "Tasks",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskTableHome" }],
        },
      },
    },
  });
}
