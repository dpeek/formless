import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import * as rootExports from "@dpeek/formless-ui";
import * as objectListExports from "@dpeek/formless-ui/object-list";
import packageJson from "../package.json";
import { ObjectList } from "./object-list.js";

interface TestObject {
  id: string;
  label: string;
  detail: string;
}

const objects: TestObject[] = [
  { id: "alpha", label: "Alpha", detail: "First object" },
  { id: "bravo", label: "Bravo", detail: "Second object" },
];

describe("ObjectList", () => {
  it("exposes the canonical object-list surface from root and subpath exports", () => {
    expect(rootExports.ObjectList).toBe(objectListExports.ObjectList);
    expect(packageJson.exports["./object-list"]).toBe("./src/object-list.tsx");
  });

  it("renders selected items with grid-list semantics, text values, and row content", () => {
    const markup = renderToStaticMarkup(
      <ObjectList
        label="Objects"
        description="Pick one object"
        items={objects}
        selectedKey="bravo"
        getKey={(item) => item.id}
        getTextValue={(item) => item.label}
        renderItem={({ textValue, isSelected, item }) => (
          <div>
            <strong>{textValue}</strong>
            <span>{item.detail}</span>
            {isSelected && <span>Selected</span>}
          </div>
        )}
      />,
    );

    expect(markup).toContain('data-slot="object-list"');
    expect(markup).toContain('data-slot="object-list-grid"');
    expect(markup).toContain('role="grid"');
    expect(markup).toContain('aria-label="Objects"');
    expect(markup).toContain('id="Objects-description"');
    expect(markup).toContain("Pick one object");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-slot="object-list-item"');
    expect(markup).toContain('data-key="bravo"');
    expect(markup).toContain("Alpha");
    expect(markup).toContain("Second object");
    expect(markup).toContain("Selected");
  });

  it("renders default and custom empty states with optional add affordance", () => {
    const defaultMarkup = renderToStaticMarkup(
      <ObjectList
        label="Empty objects"
        items={[]}
        getKey={(item: TestObject) => item.id}
        getTextValue={(item) => item.label}
        renderItem={({ textValue }) => textValue}
      />,
    );
    const customMarkup = renderToStaticMarkup(
      <ObjectList
        label="Empty objects"
        items={[]}
        listActions={[{ id: "add", label: "Add object" }]}
        emptyState="Create the first object."
        getKey={(item: TestObject) => item.id}
        getTextValue={(item) => item.label}
        renderItem={({ textValue }) => textValue}
      />,
    );

    expect(defaultMarkup).toContain('data-slot="object-list-empty"');
    expect(defaultMarkup).toContain("No items are currently available.");
    expect(customMarkup).toContain("Create the first object.");
    expect(customMarkup).toContain('data-slot="object-list-empty-action"');
    expect(customMarkup).toContain("Add object");
  });

  it("renders list actions, item actions, disabled reasons, destructive intent, and modal content", () => {
    const markup = renderToStaticMarkup(
      <ObjectList
        label="Objects"
        items={objects}
        listActions={[
          { id: "create", label: "Create" },
          { id: "import", label: "Import" },
          {
            id: "blocked",
            label: "Blocked",
            disabled: true,
            disabledReason: "Requires permission",
          },
        ]}
        getKey={(item) => item.id}
        getTextValue={(item) => item.label}
        getItemActions={(item) => [
          {
            id: "edit",
            label: `Edit ${item.label}`,
            description: "Open editor",
            renderModal: () => <div>Edit modal</div>,
          },
          {
            id: "delete",
            label: `Delete ${item.label}`,
            intent: "danger",
          },
          {
            id: "disabled",
            label: `Disabled ${item.label}`,
            disabled: true,
            disabledReason: "Not ready",
          },
        ]}
        renderItem={({ textValue }) => <span>{textValue}</span>}
      />,
    );

    expect(markup).toContain('aria-label="List actions"');
    expect(markup).toContain('aria-label="Item actions"');
    expect(markup).toContain('data-object-list-action-labels="Create|Import|Blocked"');
    expect(markup).toContain(
      'data-object-list-disabled-action-labels="Blocked: Requires permission"',
    );
    expect(markup).toContain(
      'data-object-list-action-labels="Edit Alpha|Delete Alpha|Disabled Alpha"',
    );
    expect(markup).toContain('data-object-list-modal-action-labels="Edit Alpha"');
    expect(markup).toContain('data-object-list-danger-action-labels="Delete Alpha"');
    expect(markup).toContain("Not ready");
  });

  it("renders reorder handles and exposes disabled reorder reasons at the primitive boundary", () => {
    const markup = renderToStaticMarkup(
      <ObjectList
        label="Ordered objects"
        items={objects}
        reorder={{
          label: "Move object",
          disabled: true,
          disabledReason: "Move already pending",
          dragHandleDataAttributes: { "data-test-drag-handle": "true" },
          onReorder: () => {},
        }}
        getKey={(item) => item.id}
        getTextValue={(item) => item.label}
        renderItem={({ textValue }) => <span>{textValue}</span>}
      />,
    );

    expect(markup).toContain('data-slot="object-list-drag-handle"');
    expect(markup).toContain('data-test-drag-handle="true"');
    expect(markup).toContain('slot="drag"');
    expect(markup).toContain('aria-label="Move object"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("Move already pending");
    expect(markup).toContain("lucide-grip-vertical");
  });
});
