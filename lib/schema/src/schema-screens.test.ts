import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";

describe("schema screens", () => {
  it("parses optional owner and anonymous screen access", () => {
    const schema = parseAppSchema(screenAccessSchema());

    expect(schema.screens?.home.access).toBe("owner");
    expect(schema.screens?.public.access).toBe("anonymous");
    expect(schema.screens?.inherited.access).toBeUndefined();
  });

  it("rejects unsupported screen access", () => {
    expect(() =>
      parseAppSchema({
        ...screenAccessSchema(),
        screens: {
          home: {
            ...screenAccessSchema().screens!.home,
            access: "admin",
          },
        },
      }),
    ).toThrow('Screen "home" access must be "anonymous" or "owner".');
  });
});

function screenAccessSchema() {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true, label: "Title" },
        },
        operations: {
          create: {
            kind: "create",
            scope: "collection",
            effect: { type: "createRecord" },
          },
        },
      },
    },
    queries: {
      taskAll: { label: "Tasks", entity: "task", expression: { kind: "all" } },
    },
    itemViews: {
      taskItem: {
        entity: "task",
        fields: {
          title: { editor: "text", commit: "field-commit" },
        },
      },
    },
    tableViews: {},
    views: {
      taskList: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskItem" },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Home",
        access: "owner",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskList" }],
        },
      },
      public: {
        type: "workspace",
        label: "Public",
        access: "anonymous",
        navigation: { primary: false },
        layout: {
          type: "stack",
          sections: [{ id: "public-tasks", type: "collection", view: "taskList" }],
        },
      },
      inherited: {
        type: "workspace",
        label: "Inherited",
        navigation: { primary: false },
        layout: {
          type: "stack",
          sections: [{ id: "inherited-tasks", type: "collection", view: "taskList" }],
        },
      },
    },
  };
}
