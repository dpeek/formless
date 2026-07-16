import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiContractReference,
  FormlessUiListContract,
  FormlessUiWorkspaceCollectionContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceSectionContract,
} from "../formless-ui-contract.ts";
import { formlessUiContractReferenceKey } from "../formless-ui-contract-host.ts";
import { AstryxWorkspaceCollectionRenderer } from "./formless-ui-workspace-collection-renderer.tsx";
import { AstryxWorkspaceScreenRenderer } from "./formless-ui-workspace-screen-renderer.tsx";
import {
  createFormlessGeneratedWorkspaceFixtures,
  type FormlessGeneratedWorkspaceFixtureId,
} from "./generated-workspace.fixtures.ts";
import {
  FormlessGeneratedWorkspaceLayout,
  createFormlessGeneratedWorkspaceFixtureHost,
  projectGeneratedWorkspaceFixturePublication,
  selectedGeneratedWorkspaceFixture,
} from "./generated-workspace.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

describe("canonical generated-workspace fixtures", () => {
  it("cover production workspace contract states with serializable data", () => {
    const fixtures = createFormlessGeneratedWorkspaceFixtures();
    const tasks = requiredWorkspace(fixtures, "tasks");
    const taskCollection = tasks.sections[0]!.collection;
    const taskPresentation = requiredOrdinary(taskCollection);
    const crm = requiredWorkspace(fixtures, "multi-section");
    const companyPresentation = requiredOrdinary(crm.sections[0]!.collection);
    const contactPresentation = requiredOrdinary(crm.sections[1]!.collection);
    const listDetail = requiredWorkspace(fixtures, "list-detail").sections[0]!.collection
      .presentation;
    const singleton = requiredOrdinary(
      requiredWorkspace(fixtures, "singleton-context").sections[0]!.collection,
    );
    const emptyContext = requiredOrdinary(
      requiredWorkspace(fixtures, "empty-context").sections[0]!.collection,
    ).context;
    const emptyCollection = requiredWorkspace(fixtures, "empty-collection").sections[0]!.collection;
    const unavailable = requiredWorkspace(fixtures, "unavailable").sections[0]!.collection;
    const serialized = JSON.stringify(fixtures);

    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(tasks.sections).toHaveLength(1);
    expect(taskPresentation.context).toBeUndefined();
    expect(taskPresentation.queryNavigation?.items.map((item) => item.label)).toEqual([
      "Active",
      "Completed",
    ]);
    expect(taskPresentation.summaries[0]).toMatchObject({
      displayValue: "18",
      label: "Estimate",
      suffix: "hours",
    });
    expect(tasks.sections[0]?.actions[0]?.kind).toBe("workspaceExternalAction");
    expect(taskPresentation.actions.primary[0]?.kind).toBe("createAction");
    expect(taskPresentation.actions.secondary[0]?.kind).toBe("operationAction");
    expect(taskPresentation.result.kind).toBe("list");
    expect(crm.sections).toHaveLength(2);
    expect(companyPresentation.context?.presentation).toBe("localTabs");
    expect(companyPresentation.contextDetail?.kind).toBe("recordResult");
    expect(companyPresentation.result.kind).toBe("table");
    expect(contactPresentation.result.kind).toBe("recordResult");
    expect(listDetail.kind).toBe("listDetail");
    expect(listDetail.kind === "listDetail" ? listDetail.selector.presentation : undefined).toBe(
      "localListDetail",
    );
    expect(singleton.context?.presentation).toBe("singletonDetail");
    expect(emptyContext?.availability.state).toBe("empty");
    expect(emptyContext?.options).toEqual([]);
    expect(emptyCollection.availability.state).toBe("empty");
    expect(unavailable.availability.state).toBe("unavailable");
    expect(serialized).not.toContain('"kind":"tree"');
    expect(serialized).not.toContain("className");
  });
});

describe("Generated Workspace prototype layout", () => {
  it("renders real Astryx workspace screen and nested collection renderers", () => {
    const layoutHtml = renderToStaticMarkup(<FormlessGeneratedWorkspaceLayout />);
    const listDetailHtml = renderWorkspace(requiredWorkspaceFixtures(), "list-detail");
    const multiSectionHtml = renderWorkspace(requiredWorkspaceFixtures(), "multi-section");

    expect(layoutHtml).toContain("Generated Workspace");
    expect(layoutHtml).toContain('data-formless-astryx-workspace="workspace:tasks"');
    expect(layoutHtml).toContain('aria-label="Task queries"');
    expect(layoutHtml).toContain("Prepare launch checklist");
    expect(layoutHtml).toContain("Estimate");
    expect(layoutHtml).toContain("Install app");
    expect(listDetailHtml).toContain('aria-label="Projects and tasks"');
    expect(listDetailHtml).toContain('role="combobox"');
    expect(listDetailHtml).toContain("Launch project");
    expect(listDetailHtml).toContain('<table aria-label="Tasks"');
    expect(multiSectionHtml).toMatch(/<h2[^>]*>Companies<\/h2>/);
    expect(multiSectionHtml).toMatch(/<h2[^>]*>Contact<\/h2>/);
    expect(multiSectionHtml.indexOf("Companies")).toBeLessThan(multiSectionHtml.indexOf("Contact"));
  });

  it("keeps query and context selection controlled by canonical intents", () => {
    const fixtures = requiredWorkspaceFixtures();
    const tasks = requiredWorkspace(fixtures, "tasks");
    const tasksHost = createFormlessGeneratedWorkspaceFixtureHost(tasks);
    const taskPresentation = requiredOrdinary(tasks.sections[0]!.collection);
    const completed = taskPresentation.queryNavigation?.items[1];
    if (!completed) {
      throw new Error("Missing completed query fixture.");
    }

    tasksHost.host.dispatch(completed.selectionIntent);
    const selectedTasks = tasksHost.getWorkspace();
    const selectedTaskCollection = selectedTasks.sections[0]!.collection;
    const selectedTaskPresentation = requiredOrdinary(selectedTaskCollection);
    expect(selectedTaskCollection.selectedQueryId).toBe(completed.id);
    expect(
      selectedTaskPresentation.queryNavigation?.items.find((item) => item.selected)?.label,
    ).toBe("Completed");

    const crm = requiredWorkspace(fixtures, "multi-section");
    const crmHost = createFormlessGeneratedWorkspaceFixtureHost(crm);
    const companyContext = requiredOrdinary(crm.sections[0]!.collection).context;
    const documentation = companyContext?.options[1];
    if (!companyContext || !documentation) {
      throw new Error("Missing ordinary context fixture.");
    }

    crmHost.host.dispatch(documentation.selectionIntent);
    const selectedCrm = crmHost.getWorkspace();
    const selectedContext = requiredOrdinary(selectedCrm.sections[0]!.collection).context;
    expect(selectedContext?.selectedOptionId).toBe(documentation.id);
    expect(selectedContext?.options.find((option) => option.selected)?.label).toBe("Documentation");
  });

  it("simulates field, create, operation, external action, and ordering through host dispatch", () => {
    const tasks = requiredWorkspace(requiredWorkspaceFixtures(), "tasks");
    const fixtureHost = createFormlessGeneratedWorkspaceFixtureHost(tasks);
    const section = tasks.sections[0]!;
    const presentation = requiredOrdinary(section.collection);
    const list = requiredList(presentation.result);
    const item = list.items[0]!;
    const title = item.fields.find((field) => field.fieldName === "title");
    const createAction = presentation.actions.primary.find(
      (action) => action.kind === "createAction",
    );
    const operationAction = presentation.actions.secondary.find(
      (action) => action.kind === "operationAction",
    );
    const externalAction = section.actions[0];
    const moveDown = item.ordering?.actions.find((action) => action.direction === "down");
    const createField = createAction?.surface.dialog.form.fieldSet.fields[0];
    if (
      !title ||
      !createAction ||
      !createField ||
      !operationAction ||
      !externalAction ||
      !moveDown
    ) {
      throw new Error("Missing interactive task workspace fixtures.");
    }

    fixtureHost.host.dispatch({
      ...scope(section),
      fieldId: title.fieldId,
      intent: { fieldName: "title", type: "recordEditorDraftChange", value: "Ship release" },
      recordId: item.id,
      resultId: list.id,
      type: "workspaceField",
    });
    const edited = fixtureHost.getWorkspace();
    const editedTitle = requiredList(
      requiredOrdinary(edited.sections[0]!.collection).result,
    ).items[0]!.fields.find((field) => field.fieldName === "title");
    expect(recordDraft(editedTitle)).toBe("Ship release");

    fixtureHost.host.dispatch({
      ...scope(section),
      intent: { open: true, surfaceId: createAction.surface.id, type: "createOpenChange" },
      surfaceId: createAction.surface.id,
      type: "workspaceCreate",
    });
    const opened = fixtureHost.getWorkspace();
    expect(requiredCreateSurface(opened).dialog.open).toBe(true);

    fixtureHost.host.dispatch({
      ...scope(section),
      fieldId: createField.fieldId,
      intent: {
        fieldName: createField.fieldName,
        fieldValue: { kind: "input", value: "Created task" },
        type: "createDraftChange",
      },
      surfaceId: createAction.surface.id,
      type: "workspaceField",
    });
    expect(
      requiredCreateSurface(fixtureHost.getWorkspace()).dialog.form.fieldSet.fields.find(
        (field) => field.fieldId === createField.fieldId,
      ),
    ).toMatchObject({ value: "Created task" });

    fixtureHost.host.dispatch({
      ...scope(section),
      controlId: operationAction.control.id,
      intent: {
        controlId: operationAction.control.id,
        invocationSource: "button",
        type: "operationInvoke",
      },
      type: "workspaceOperation",
    });
    const invoked = fixtureHost.getWorkspace();
    expect(requiredCollectionOperation(invoked).status.status).toBe("committed");

    fixtureHost.host.dispatch({
      ...scope(section),
      actionId: externalAction.id,
      controlId: externalAction.action.id,
      intent: externalAction.action.invoke,
      type: "workspaceExternalAction",
    });
    const external = fixtureHost.getWorkspace();
    expect(external.sections[0]?.actions[0]?.action.selected).toBe(true);

    fixtureHost.host.dispatch({
      ...scope(section),
      intent: moveDown.intent,
      resultId: list.id,
      type: "workspaceList",
    });
    const reordered = fixtureHost.getWorkspace();
    expect(
      requiredList(requiredOrdinary(reordered.sections[0]!.collection).result).items[0]?.id,
    ).toBe("task-2");
  });

  it("simulates nested record field and destructive confirmation intents", () => {
    const crm = requiredWorkspace(requiredWorkspaceFixtures(), "multi-section");
    const fixtureHost = createFormlessGeneratedWorkspaceFixtureHost(crm);
    const section = crm.sections[1]!;
    const result = requiredRecordResult(requiredOrdinary(section.collection).result);
    const title = result.fields.find((field) => field.fieldName === "title");
    const deletion = result.actions.secondary.find((action) => action.role === "delete");
    const recordId = result.selectedRecord?.id;
    if (!title || !deletion || !recordId) {
      throw new Error("Missing record-result intent fixtures.");
    }

    fixtureHost.host.dispatch({
      ...scope(section),
      intent: {
        fieldId: title.fieldId,
        intent: {
          fieldName: "title",
          type: "recordEditorDraftChange",
          value: "Sam Rivera updated",
        },
        recordId,
        resultId: result.id,
        type: "recordResultFieldIntent",
      },
      resultId: result.id,
      type: "workspaceRecordResult",
    });
    const edited = fixtureHost.getWorkspace();
    const editedResult = requiredRecordResult(
      requiredOrdinary(edited.sections[1]!.collection).result,
    );
    expect(recordDraft(editedResult.fields.find((field) => field.fieldId === title.fieldId))).toBe(
      "Sam Rivera updated",
    );

    fixtureHost.host.dispatch({
      ...scope(section),
      intent: {
        controlId: deletion.control.id,
        intent: deletion.control.trigger.intent,
        recordId,
        resultId: result.id,
        type: "recordResultOperationIntent",
      },
      resultId: result.id,
      type: "workspaceRecordResult",
    });
    const confirmation = fixtureHost.getWorkspace();
    const confirmedResult = requiredRecordResult(
      requiredOrdinary(confirmation.sections[1]!.collection).result,
    );
    expect(
      confirmedResult.actions.secondary.find((action) => action.role === "delete")?.control
        .confirmation?.open,
    ).toBe(true);
  });

  it("publishes only changed fixture references for result and section intents", () => {
    const crm = requiredWorkspace(requiredWorkspaceFixtures(), "multi-section");
    const fixtureHost = createFormlessGeneratedWorkspaceFixtureHost(crm);
    const publication = projectGeneratedWorkspaceFixturePublication(crm);
    const company = crm.sections[0]!;
    const companyPresentation = requiredOrdinary(company.collection);
    const contextResult = requiredRecordResult(companyPresentation.contextDetail!);
    const title = contextResult.fields.find((field) => field.fieldName === "title");
    const recordId = contextResult.selectedRecord?.id;
    const companySectionReference = requiredReference(
      publication.nodes.map(({ reference }) => reference),
      (reference) =>
        reference.kind === "workspaceSectionShellReference" && reference.sectionId === company.id,
    );
    const contextResultReference = requiredReference(
      publication.nodes.map(({ reference }) => reference),
      (reference) =>
        reference.kind === "recordResultReference" &&
        reference.role === "contextResult" &&
        reference.sectionId === company.id,
    );
    const notifications = new Map<string, number>();
    const unsubscribe = publication.nodes.map(({ reference }) =>
      fixtureHost.host.subscribe(reference, () => {
        const key = formlessUiContractReferenceKey(reference);
        notifications.set(key, (notifications.get(key) ?? 0) + 1);
      }),
    );

    if (!title || !recordId) {
      throw new Error("Missing context result field fixture.");
    }

    fixtureHost.host.dispatch({
      ...scope(company),
      intent: {
        fieldId: title.fieldId,
        intent: {
          fieldName: "title",
          type: "recordEditorDraftChange",
          value: "Acme Company updated",
        },
        recordId,
        resultId: contextResult.id,
        type: "recordResultFieldIntent",
      },
      resultId: contextResult.id,
      type: "workspaceRecordResult",
    });

    expect(Array.from(notifications.keys())).toEqual([
      formlessUiContractReferenceKey(contextResultReference),
    ]);

    notifications.clear();
    const documentation = companyPresentation.context?.options[1];
    if (!documentation) {
      throw new Error("Missing context selection fixture.");
    }

    fixtureHost.host.dispatch(documentation.selectionIntent);

    expect(Array.from(notifications.keys())).toEqual([
      formlessUiContractReferenceKey(companySectionReference),
    ]);

    for (const stopListening of unsubscribe) {
      stopListening();
    }
  });

  it("keeps fixture snapshots and their interactive host free of runtime dependencies", async () => {
    const fixtureSource = await readFile(
      new URL("./generated-workspace.fixtures.ts", import.meta.url),
      "utf8",
    );
    const hostSource = await readFile(
      new URL("./generated-workspace.tsx", import.meta.url),
      "utf8",
    );
    const imports = [fixtureSource, hostSource].flatMap(importSpecifiers);
    const forbiddenImports = imports.filter((specifier) =>
      /generated-workspace-runtime|operation-controller|(?:^|\/)(?:src\/app\/generated|src\/client|storage|replica|media|sync)(?:\/|$)/.test(
        specifier,
      ),
    );

    expect(hostSource).toContain("createFormlessUiMemoryContractHost");
    expect(hostSource).toContain("AstryxSubscribedWorkspaceScreenRenderer");
    expect(forbiddenImports).toEqual([]);
  });

  it("renders empty context, empty collection, and unavailable collection presentation", () => {
    const fixtures = requiredWorkspaceFixtures();
    const emptyContextHtml = renderWorkspace(fixtures, "empty-context");
    const emptyCollection = requiredWorkspace(fixtures, "empty-collection").sections[0]!;
    const unavailable = requiredWorkspace(fixtures, "unavailable").sections[0]!;
    const emptyHtml = renderCollection(emptyCollection);
    const unavailableHtml = renderCollection(unavailable);

    expect(emptyContextHtml).toContain("No projects yet");
    expect(emptyContextHtml).toContain("Create a project before adding tasks.");
    expect(emptyHtml).toContain("No records yet");
    expect(emptyHtml).toContain("Create the first record to begin.");
    expect(unavailableHtml).toContain("Records are temporarily unavailable.");
    expect(unavailableHtml).not.toContain("<table");
  });
});

function requiredWorkspaceFixtures() {
  return createFormlessGeneratedWorkspaceFixtures();
}

function requiredWorkspace(
  fixtures: ReturnType<typeof createFormlessGeneratedWorkspaceFixtures>,
  id: FormlessGeneratedWorkspaceFixtureId,
) {
  const fixture = selectedGeneratedWorkspaceFixture(fixtures, id);
  if (!fixture) {
    throw new Error(`Missing ${id} workspace fixture.`);
  }
  return fixture.workspace;
}

function requiredOrdinary(collection: FormlessUiWorkspaceCollectionContract) {
  if (collection.presentation.kind !== "ordinary") {
    throw new Error("Expected ordinary collection fixture.");
  }
  return collection.presentation;
}

function requiredList(result: FormlessUiWorkspaceCollectionContract["presentation"]["result"]) {
  if (result.kind !== "list") {
    throw new Error("Expected list fixture.");
  }
  return result;
}

function requiredRecordResult(
  result: FormlessUiWorkspaceCollectionContract["presentation"]["result"],
) {
  if (result.kind !== "recordResult") {
    throw new Error("Expected record-result fixture.");
  }
  return result;
}

function recordDraft(field: FormlessUiListContract["items"][number]["fields"][number] | undefined) {
  return field?.mode === "editor" && "drafts" in field ? field.drafts.draft : undefined;
}

function requiredCreateSurface(workspace: FormlessUiWorkspaceContract) {
  const action = requiredOrdinary(workspace.sections[0]!.collection).actions.primary.find(
    (candidate) => candidate.kind === "createAction",
  );
  if (action?.kind !== "createAction") {
    throw new Error("Missing create action fixture.");
  }
  return action.surface;
}

function requiredCollectionOperation(workspace: FormlessUiWorkspaceContract) {
  const action = requiredOrdinary(workspace.sections[0]!.collection).actions.secondary.find(
    (candidate) => candidate.kind === "operationAction",
  );
  if (action?.kind !== "operationAction") {
    throw new Error("Missing collection operation fixture.");
  }
  return action.control;
}

function scope(section: FormlessUiWorkspaceSectionContract) {
  return {
    collectionId: section.collection.id,
    screenId: section.id.slice(0, section.id.indexOf(":section:")),
    sectionId: section.id,
  };
}

function renderWorkspace(
  fixtures: ReturnType<typeof createFormlessGeneratedWorkspaceFixtures>,
  id: FormlessGeneratedWorkspaceFixtureId,
) {
  return renderToStaticMarkup(
    <AstryxWorkspaceScreenRenderer
      onIntent={() => undefined}
      workspace={requiredWorkspace(fixtures, id)}
    />,
  );
}

function renderCollection(section: FormlessUiWorkspaceSectionContract) {
  return renderToStaticMarkup(
    <AstryxWorkspaceCollectionRenderer
      collection={section.collection}
      onIntent={() => undefined}
      scope={scope(section)}
    />,
  );
}

function requiredReference(
  references: readonly FormlessUiContractReference[],
  matches: (reference: FormlessUiContractReference) => boolean,
) {
  const reference = references.find(matches);
  if (!reference) {
    throw new Error("Missing fixture contract reference.");
  }
  return reference;
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}
