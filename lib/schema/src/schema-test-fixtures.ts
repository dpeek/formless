export function taskSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: {
      task: taskEntity(),
    },
    queries: {
      taskAll: {
        label: "All tasks",
        entity: "task",
        expression: { kind: "all" },
      },
    },
    itemViews: {
      taskItem: {
        entity: "task",
        fields: {
          title: { editor: "text", commit: "field-commit" },
          done: { editor: "boolean", commit: "immediate" },
        },
      },
    },
    tableViews: {},
    views: {
      taskHome: taskCollectionView(),
      taskCreate: {
        type: "create",
        entity: "task",
        fields: {
          title: { editor: "text" },
        },
      },
    },
    screens: {
      home: taskScreen(),
    },
    ...overrides,
  };
}

export function taskEntity(overrides: Record<string, unknown> = {}) {
  return {
    label: "Task",
    fields: {
      title: { type: "text", required: true, label: "Title" },
      details: { type: "text", required: false, label: "Details", format: "markdown" },
      done: { type: "boolean", required: true, label: "Done", default: false },
      dueDate: { type: "date", required: false, label: "Due date" },
      estimate: { type: "number", required: false, label: "Estimate", min: 0 },
      priority: {
        type: "enum",
        required: true,
        label: "Priority",
        default: "normal",
        values: {
          normal: { label: "Normal" },
          high: { label: "High" },
        },
      },
    },
    operations: {
      create: {
        label: "Create task",
        kind: "create",
        scope: "collection",
        input: {
          fields: {
            title: { field: "title" },
            details: { field: "details" },
            done: { field: "done" },
            dueDate: { field: "dueDate" },
            estimate: { field: "estimate" },
            priority: { field: "priority" },
          },
        },
        effect: { type: "createRecord" },
        output: { type: "create" },
        idempotency: { required: true },
        audit: { input: "summary" },
      },
      update: {
        label: "Update task",
        kind: "update",
        scope: "record",
        effect: { type: "patchRecord" },
        output: { type: "update" },
        idempotency: { required: true },
        audit: { input: "summary" },
      },
    },
    ...overrides,
  };
}

export function taskCollectionView(overrides: Record<string, unknown> = {}) {
  return {
    type: "collection",
    label: "Tasks",
    entity: "task",
    queries: [{ query: "taskAll", count: { type: "count" } }],
    defaultQuery: "taskAll",
    result: { type: "list", itemView: "taskItem" },
    operations: [{ operation: "task.create", createView: "taskCreate" }],
    ...overrides,
  };
}

export function taskScreen(overrides: Record<string, unknown> = {}) {
  return {
    type: "workspace",
    label: "Tasks",
    navigation: { primary: true },
    layout: {
      type: "stack",
      sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
    },
    ...overrides,
  };
}

export function rateSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: rateEntities(),
    relationships: rateRelationships(),
    queries: {
      resourceAll: {
        label: "All resources",
        entity: "resource",
        expression: { kind: "all" },
      },
      cardAll: {
        label: "All cards",
        entity: "card",
        expression: { kind: "all" },
      },
      rateAll: {
        label: "All rates",
        entity: "rate",
        expression: { kind: "all" },
      },
    },
    itemViews: {
      rateItem: {
        entity: "rate",
        fields: {
          resource: { editor: "reference", commit: "immediate" },
          card: { editor: "reference", commit: "immediate" },
          cost: { editor: "number", commit: "field-commit" },
        },
      },
    },
    tableViews: {},
    views: {
      rateHome: {
        type: "collection",
        label: "Rates",
        entity: "rate",
        queries: [{ query: "rateAll" }],
        defaultQuery: "rateAll",
        result: { type: "list", itemView: "rateItem" },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Rates",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "rates", type: "collection", view: "rateHome" }],
        },
      },
    },
    ...overrides,
  };
}

export function rateEntities(rateOverrides: Record<string, unknown> = {}) {
  return {
    resource: {
      label: "Resource",
      fields: {
        name: { type: "text", required: true, label: "Name" },
      },
    },
    card: {
      label: "Rate card",
      fields: {
        name: { type: "text", required: true, label: "Name" },
      },
    },
    rate: {
      label: "Rate",
      fields: {
        resource: {
          type: "reference",
          required: true,
          label: "Resource",
          to: "resource",
          displayField: "name",
        },
        card: {
          type: "reference",
          required: true,
          label: "Rate card",
          to: "card",
          displayField: "name",
        },
        cost: { type: "number", required: true, label: "Cost", default: 0, min: 0 },
      },
      constraints: {
        uniqueRatePair: {
          kind: "unique",
          fields: ["resource", "card"],
        },
      },
      ...rateOverrides,
    },
  };
}

export function rateRelationships() {
  return {
    rateCard: {
      kind: "toOne",
      label: "Rate card",
      from: { entity: "rate", field: "card" },
      to: { entity: "card" },
      inverse: "cardRates",
    },
    cardRates: {
      kind: "toMany",
      label: "Rates",
      from: { entity: "card" },
      to: { entity: "rate", field: "card" },
      inverse: "rateCard",
    },
    cardResources: {
      kind: "manyToMany",
      label: "Resources",
      from: { entity: "card" },
      to: { entity: "resource" },
      through: {
        entity: "rate",
        fromField: "card",
        toField: "resource",
        uniqueConstraint: "uniqueRatePair",
      },
      inverse: "resourceCards",
    },
    resourceCards: {
      kind: "manyToMany",
      label: "Rate cards",
      from: { entity: "resource" },
      to: { entity: "card" },
      through: {
        entity: "rate",
        fromField: "resource",
        toField: "card",
        uniqueConstraint: "uniqueRatePair",
      },
      inverse: "cardResources",
    },
  };
}
