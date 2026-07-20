import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";
import { taskSchema, taskScreen } from "./schema-test-fixtures.ts";

describe("schema screens", () => {
  it("parses static app-relative paths and rejects duplicate routes", () => {
    const schema = parseAppSchema({
      ...taskSchema(),
      screens: { home: taskScreen({ path: "/schema" }) },
    });

    expect(schema.screens?.home?.path).toBe("/schema");
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: {
          home: taskScreen({ path: "/tasks" }),
          duplicate: taskScreen({ label: "Duplicate", path: "/tasks" }),
        },
      }),
    ).toThrow('Screen path "/tasks" must be unique. Used by "home" and "duplicate".');

    for (const path of ["", "tasks", "/tasks/:taskId", "/*"]) {
      expect(() =>
        parseAppSchema({ ...taskSchema(), screens: { home: taskScreen({ path }) } }),
      ).toThrow('Screen "home" path must be a static app-relative path.');
    }
  });

  it("validates layout section identity and collection view references", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: {
          home: taskScreen({
            layout: {
              type: "stack",
              sections: [
                { id: "tasks", type: "collection", view: "taskHome" },
                { id: "tasks", type: "collection", view: "taskHome" },
              ],
            },
          }),
        },
      }),
    ).toThrow('Screen "home" layout section id "tasks" must be unique.');

    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: {
          home: taskScreen({
            layout: {
              type: "stack",
              sections: [{ id: "tasks", type: "collection", view: "taskCreate" }],
            },
          }),
        },
      }),
    ).toThrow('Screen "home" layout section 0 must reference a collection view.');
  });

  it("parses optional owner, authenticated, and anonymous screen access", () => {
    const schema = parseAppSchema(screenAccessSchema());

    expect(schema.screens?.home.access).toBe("owner");
    expect(schema.screens?.members.access).toBe("authenticated");
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
    ).toThrow('Screen "home" access must be "anonymous", "authenticated", or "owner".');
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
      members: {
        type: "workspace",
        label: "Members",
        access: "authenticated",
        navigation: { primary: false },
        layout: {
          type: "stack",
          sections: [{ id: "member-tasks", type: "collection", view: "taskList" }],
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
