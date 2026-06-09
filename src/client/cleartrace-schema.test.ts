import { describe, expect, it } from "vite-plus/test";
import { cleartraceSourceSchema } from "../test/schema-apps.ts";
import { selectCollectionModels, selectPrimaryScreenModels } from "./views.ts";

describe("cleartrace source generated admin schema", () => {
  it("defines primary workflow screens instead of a raw schema-editing admin flow", () => {
    expect(
      selectPrimaryScreenModels(cleartraceSourceSchema).map((screen) => ({
        label: screen.label,
        path: screen.path,
        sections: screen.layout.sections.map((section) => section.viewName),
      })),
    ).toEqual([
      {
        label: "Orders",
        path: "/",
        sections: ["orderHome", "customerHome", "orderLineForOrderHome", "sampleForOrderHome"],
      },
      {
        label: "Sample intake",
        path: "/samples",
        sections: ["sampleHome", "testRequestForSampleHome"],
      },
      {
        label: "Lab queue",
        path: "/queue",
        sections: ["workItemHome", "methodHome"],
      },
      {
        label: "Results",
        path: "/results",
        sections: ["resultHome", "resultForSampleHome", "methodHome"],
      },
      {
        label: "Reports",
        path: "/reports",
        sections: ["reportHome", "reportVersionForReportHome", "verificationForReportHome"],
      },
      {
        label: "Catalog and pricing",
        path: "/catalog",
        sections: [
          "catalogItemHome",
          "testPackageHome",
          "packageItemForPackageHome",
          "analyteHome",
        ],
      },
      {
        label: "Settings",
        path: "/settings",
        sections: ["appConfigHome", "auditEventHome"],
      },
    ]);
  });

  it("uses related collection contexts and scoped create defaults for workflow detail tables", () => {
    const orderLines = requiredCollectionModel("orderLineForOrderHome");
    const orderSamples = requiredCollectionModel("sampleForOrderHome");
    const sampleRequests = requiredCollectionModel("testRequestForSampleHome");
    const reportVersions = requiredCollectionModel("reportVersionForReportHome");
    const packageItems = requiredCollectionModel("packageItemForPackageHome");

    expect(orderLines.collection.context).toMatchObject({
      name: "order",
      entityName: "order",
      relatedCollection: {
        relationshipName: "orderLines",
        entityName: "order-line",
        referenceFieldName: "order",
      },
      presentation: "listDetail",
      itemViewName: "orderItem",
    });
    expect(orderLines.collection.queries.defaultQueryName).toBe("orderLinesForSelectedOrder");
    expect(createActionDefaults(orderLines)).toEqual([
      ["order", { kind: "context", name: "order" }],
    ]);

    expect(orderSamples.collection.context?.relatedCollection?.relationshipName).toBe(
      "orderSamples",
    );
    expect(createActionDefaults(orderSamples)).toEqual([
      ["order", { kind: "context", name: "order" }],
    ]);

    expect(sampleRequests.collection.context).toMatchObject({
      name: "sample",
      relatedCollection: {
        relationshipName: "sampleRequests",
        entityName: "test-request",
        referenceFieldName: "sample",
      },
      itemViewName: "sampleItem",
    });
    expect(createActionDefaults(sampleRequests)).toEqual([
      ["sample", { kind: "context", name: "sample" }],
    ]);

    expect(reportVersions.collection.context?.relatedCollection?.relationshipName).toBe(
      "reportVersions",
    );
    expect(createActionDefaults(reportVersions)).toEqual([
      ["report", { kind: "context", name: "report" }],
    ]);

    expect(packageItems.collection.context?.relatedCollection?.relationshipName).toBe(
      "packageItems",
    );
    expect(createActionDefaults(packageItems)).toEqual([
      ["testPackage", { kind: "context", name: "testPackage" }],
    ]);
  });

  it("defines queue filters and report asset columns with existing generated table primitives", () => {
    const workItems = requiredCollectionModel("workItemHome");
    expect(workItems.collection.queries.tabs.map((tab) => [tab.queryName, tab.label])).toEqual([
      ["workItemOpen", "Open"],
      ["workItemUrgent", "Urgent"],
      ["workItemBlocked", "Blocked"],
      ["workItemOverdue", "Overdue"],
      ["workItemAssignedToIntake", "Lab intake"],
      ["workItemAll", "All"],
    ]);

    expect(cleartraceSourceSchema.tableViews.reportVersionTable?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "field", field: "assetId", editor: "media" }),
        expect.objectContaining({ type: "field", field: "generatedAt", editor: "date" }),
      ]),
    );
    expect(
      cleartraceSourceSchema.tableViews.reportVersionTable?.columns.map((column) =>
        column.type === "field" ? column.field : column.type,
      ),
    ).not.toContain("contentHash");
    expect(
      cleartraceSourceSchema.tableViews.appConfigTable?.columns.map((column) =>
        column.type === "field" ? column.field : column.type,
      ),
    ).toEqual(["label", "value", "status"]);
  });
});

function requiredCollectionModel(viewName: string) {
  const model = selectCollectionModels(cleartraceSourceSchema).find(
    (candidate) => candidate.viewName === viewName,
  );

  if (!model) {
    throw new Error(`Missing ClearTrace collection model "${viewName}".`);
  }

  return model;
}

function createActionDefaults(model: ReturnType<typeof requiredCollectionModel>) {
  const action = model.collection.actions[0];

  if (action?.type !== "create") {
    throw new Error(`Missing create action for "${model.viewName}".`);
  }

  return action.defaults.map((defaultValue) => [defaultValue.fieldName, defaultValue.value]);
}
