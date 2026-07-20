import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  PresentationReference,
  WorkspaceContract,
} from "@dpeek/formless-presentation/contract";
import { presentationReferenceKey } from "@dpeek/formless-presentation/host";
import {
  createFormlessInstanceManagementFixtures,
  type FormlessInstanceManagementFixture,
  type FormlessInstanceManagementFixtureId,
} from "./instance-management.fixtures.ts";
import {
  FormlessInstanceManagementFixtureView,
  createFormlessInstanceManagementFixtureHost,
  projectFormlessInstanceManagementFixturePublication,
} from "./instance-management.tsx";

describe("canonical instance-management fixtures", () => {
  it("covers every management, install, gateway, and Push state with serializable data", () => {
    const fixtures = createFormlessInstanceManagementFixtures();
    const serialized = JSON.stringify(fixtures);

    expect(fixtures.map(({ id }) => id)).toEqual([
      "loading",
      "failed",
      "empty",
      "installed",
      "gateway-unavailable",
      "push-authorization-required",
    ]);
    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(requiredFixture(fixtures, "loading").state.manifest.state).toBe("loading");
    expect(requiredFixture(fixtures, "failed").state.manifest.state).toBe("failed");
    expect(workspaceRows(requiredFixture(fixtures, "empty"), "apps")).toHaveLength(0);
    expect(workspaceRows(requiredFixture(fixtures, "empty"), "routes")).toHaveLength(0);
    expect(workspaceRows(requiredFixture(fixtures, "installed"), "apps")).toHaveLength(2);
    expect(workspaceRows(requiredFixture(fixtures, "installed"), "routes")).toHaveLength(2);
    expect(
      requiredInstallAction(requiredFixture(fixtures, "installed").state).action,
    ).toMatchObject({
      accessibilityLabel: "Install app",
      label: "Install App",
    });
    expect(
      requiredRouteCreateAction(requiredFixture(fixtures, "installed").state).surface,
    ).toMatchObject({
      dialog: { title: "Create Route" },
      trigger: { accessibilityLabel: "Create Route" },
    });
    expect(requiredRouteEditAction(requiredFixture(fixtures, "installed").state)).toMatchObject({
      dialog: { title: "Edit route" },
      trigger: { accessibilityLabel: "Edit route" },
    });
    expect(readyManifest(fixtures, "gateway-unavailable")).toMatchObject({
      workspaceFeedback: { intent: "warning", title: "Workspace Push unavailable" },
      workspaceOperation: undefined,
    });
    expect(
      readyManifest(fixtures, "push-authorization-required").workspaceOperation
        ?.authorizationPrompt,
    ).toMatchObject({ title: "Cloudflare authorization required" });
    expect(serialized).not.toMatch(
      /owner-secret|api[-_ ]?key|private[-_ ]?key|bearer\s|\/Users\/|className/i,
    );
  });

  it("reduces controlled install, route, and Push intents through the memory host", () => {
    const fixtures = createFormlessInstanceManagementFixtures();
    const managementHost = createFormlessInstanceManagementFixtureHost(
      requiredFixture(fixtures, "installed"),
    );
    const appsSection = requiredWorkspace(managementHost.getState(), "apps").sections[0];
    const installAction = requiredInstallAction(managementHost.getState());
    if (!appsSection) {
      throw new Error("Missing Apps fixture section.");
    }
    managementHost.host.dispatch({
      actionId: installAction.id,
      collectionId: appsSection.collection.id,
      controlId: installAction.action.id,
      intent: installAction.action.invoke,
      screenId: instanceManagementAppsWorkspaceId(managementHost.getState()),
      sectionId: appsSection.id,
      type: "workspaceExternalAction",
    });
    expect(requiredCurrentDialog(managementHost.getState()).open).toBe(true);

    const routesSection = requiredWorkspace(managementHost.getState(), "routes").sections[0];
    const createRoute = requiredRouteCreateAction(managementHost.getState());
    if (!routesSection) {
      throw new Error("Missing Routes fixture section.");
    }
    managementHost.host.dispatch({
      collectionId: routesSection.collection.id,
      intent: { open: true, surfaceId: createRoute.surface.id, type: "createOpenChange" },
      screenId: instanceManagementRoutesWorkspaceId(managementHost.getState()),
      sectionId: routesSection.id,
      surfaceId: createRoute.surface.id,
      type: "workspaceCreate",
    });
    expect(requiredRouteCreateAction(managementHost.getState()).surface.dialog.open).toBe(true);

    const editRoute = requiredRouteEditAction(managementHost.getState());
    const routesTable = requiredWorkspaceTable(managementHost.getState(), "routes");
    managementHost.host.dispatch({
      collectionId: routesSection.collection.id,
      intent: editRoute.openIntent,
      resultId: routesTable.id,
      screenId: instanceManagementRoutesWorkspaceId(managementHost.getState()),
      sectionId: routesSection.id,
      type: "workspaceTable",
    });
    expect(requiredRouteEditAction(managementHost.getState()).dialog.open).toBe(true);

    const installHost = managementHost;
    const initialDialog = requiredCurrentDialog(installHost.getState());
    const tasksOption = initialDialog.packageOptions.find(
      (option) => option.packageAppKey === "tasks",
    );
    if (!tasksOption) {
      throw new Error("Missing Tasks install option fixture.");
    }

    installHost.host.dispatch(tasksOption.selectionIntent);
    expect(requiredCurrentDialog(installHost.getState())).toMatchObject({
      fields: { package: { value: "tasks" } },
      selectedPackageOptionId: tasksOption.id,
      submit: { accessibilityLabel: "Install Tasks" },
    });

    const labelField = requiredCurrentDialog(installHost.getState()).fields.label;
    installHost.host.dispatch({
      dialogId: initialDialog.id,
      fieldId: labelField.fieldId,
      intent: {
        fieldName: labelField.fieldName,
        fieldValue: { kind: "input", value: "" },
        type: "createDraftChange",
      },
      managementId: initialDialog.managementId,
      type: "managementInstallField",
    });
    expect(requiredCurrentDialog(installHost.getState())).toMatchObject({
      submit: { disabled: true },
    });
    expect(requiredCurrentDialog(installHost.getState()).errors).not.toHaveLength(0);

    installHost.host.dispatch({
      dialogId: initialDialog.id,
      fieldId: labelField.fieldId,
      intent: {
        fieldName: labelField.fieldName,
        fieldValue: { kind: "input", value: "Project Tasks" },
        type: "createDraftChange",
      },
      managementId: initialDialog.managementId,
      type: "managementInstallField",
    });
    const validDialog = requiredCurrentDialog(installHost.getState());
    expect(validDialog.errors).toEqual([]);
    installHost.host.dispatch(validDialog.submitIntent);
    expect(requiredCurrentDialog(installHost.getState())).toMatchObject({
      feedback: { title: "Installing app" },
      pending: { isPending: true },
      submit: { pending: { isPending: true } },
    });

    const pushHost = createFormlessInstanceManagementFixtureHost(
      requiredFixture(fixtures, "installed"),
    );
    const idleOperation = requiredOperation(pushHost.getState());
    pushHost.host.dispatch({
      controlId: idleOperation.control.id,
      intent: idleOperation.control.trigger.intent,
      managementId: pushHost.getState().manifest.id,
      operationId: idleOperation.id,
      type: "managementWorkspaceOperation",
    });
    expect(requiredOperation(pushHost.getState()).control).toMatchObject({
      progress: { title: "Pushing workspace" },
      status: { status: "pending" },
      trigger: { pending: { isPending: true } },
    });

    const authorizationHost = createFormlessInstanceManagementFixtureHost(
      requiredFixture(fixtures, "push-authorization-required"),
    );
    const authorizationOperation = requiredOperation(authorizationHost.getState());
    const prompt = authorizationOperation.authorizationPrompt;
    if (!prompt) {
      throw new Error("Missing authorization fixture prompt.");
    }
    authorizationHost.host.dispatch(prompt.intent);
    expect(requiredOperation(authorizationHost.getState()).authorizationPrompt).toBeUndefined();
    expect(authorizationHost.getState().manifest).toMatchObject({
      workspaceFeedback: { title: "Authorization opened" },
    });
  });

  it("reduces nested workspace intents and notifies only changed host scopes", () => {
    const fixture = requiredFixture(createFormlessInstanceManagementFixtures(), "installed");
    const fixtureHost = createFormlessInstanceManagementFixtureHost(fixture);
    const publication = projectFormlessInstanceManagementFixturePublication(fixture.state);
    const notifications = new Set<string>();
    const unsubscribe = publication.nodes.map(({ reference }) =>
      fixtureHost.host.subscribe(reference, () => {
        notifications.add(presentationReferenceKey(reference));
      }),
    );
    const dialog = requiredCurrentDialog(fixtureHost.getState());

    fixtureHost.host.dispatch({ ...dialog.closeIntent, open: true });
    expect(notifications).toEqual(
      new Set([referenceKey(publication.nodes, "managementInstallDialogReference")]),
    );

    notifications.clear();
    const apps = requiredWorkspace(fixtureHost.getState(), "apps");
    const section = apps.sections[0];
    const activeQuery = section?.collection.presentation.queryNavigation?.items[1];
    if (!section || !activeQuery) {
      throw new Error("Missing nested Apps query fixture.");
    }
    fixtureHost.host.dispatch(activeQuery.selectionIntent);
    const updatedApps = requiredWorkspace(fixtureHost.getState(), "apps");
    expect(updatedApps.sections[0]?.collection.selectedQueryId).toBe(activeQuery.id);
    expect(
      updatedApps.sections[0]?.collection.presentation.queryNavigation?.items.find(
        (item) => item.selected,
      )?.label,
    ).toBe("Active");
    expect(notifications).toEqual(
      new Set([referenceKey(publication.nodes, "workspaceSectionShellReference", section.id)]),
    );

    for (const stopListening of unsubscribe) {
      stopListening();
    }
  });

  it("renders subscribed management without application-shell chrome", () => {
    const fixtureHost = createFormlessInstanceManagementFixtureHost(
      requiredFixture(createFormlessInstanceManagementFixtures(), "installed"),
    );
    const html = renderToStaticMarkup(
      <FormlessInstanceManagementFixtureView fixtureHost={fixtureHost} />,
    );

    expect(html).not.toContain("formless-astryx-application-shell");
    expect(html).toContain('data-formless-astryx-management="instance-management"');
    expect(html).toContain('data-formless-astryx-workspace="instance-management:apps"');
    expect(html).toContain('data-formless-astryx-workspace="instance-management:routes"');
  });

  it("keeps fixtures runtime-free, secret-free, and package-local", async () => {
    const fixtureSource = await readFile(
      new URL("./instance-management.fixtures.ts", import.meta.url),
      "utf8",
    );
    const hostSource = await readFile(
      new URL("./instance-management.tsx", import.meta.url),
      "utf8",
    );
    const rootSource = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
    const imports = [fixtureSource, hostSource].flatMap(importSpecifiers);

    expect(
      imports.filter((specifier) =>
        /(?:^|\/)(?:src\/app|src\/client|control-plane|gateway-client|storage|replica|routing|operation-controller)(?:\/|$)|\bwouter\b/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
    expect(`${fixtureSource}\n${hostSource}`).not.toMatch(
      /\blocalStorage\b|\bsessionStorage\b|\bdocument\.|\bwindow\.|\bfetch\(|className/,
    );
    expect(rootSource).toContain("FormlessInstanceManagementLayout");
  });
});

function requiredFixture(
  fixtures: readonly FormlessInstanceManagementFixture[],
  id: FormlessInstanceManagementFixtureId,
) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} instance-management fixture.`);
  }
  return fixture;
}

function readyManifest(
  fixtures: readonly FormlessInstanceManagementFixture[],
  id: FormlessInstanceManagementFixtureId,
) {
  const manifest = requiredFixture(fixtures, id).state.manifest;
  if (manifest.state !== "ready") {
    throw new Error(`Expected ready ${id} fixture.`);
  }
  return manifest;
}

function requiredCurrentDialog(state: FormlessInstanceManagementFixture["state"]) {
  if (!state.dialog) {
    throw new Error("Expected instance-management dialog fixture.");
  }
  return state.dialog;
}

function requiredOperation(state: FormlessInstanceManagementFixture["state"]) {
  const manifest = state.manifest;
  if (manifest.state !== "ready" || !manifest.workspaceOperation) {
    throw new Error("Expected fixture Push operation.");
  }
  return manifest.workspaceOperation;
}

function requiredWorkspace(
  state: FormlessInstanceManagementFixture["state"],
  role: "apps" | "routes",
): WorkspaceContract {
  const manifest = state.manifest;
  if (manifest.state !== "ready") {
    throw new Error("Expected ready instance-management fixture.");
  }
  const reference = manifest.workspaces.find((workspace) => workspace.role === role)?.reference;
  const workspace = state.workspaces.find((candidate) => candidate.id === reference?.workspaceId);
  if (!workspace) {
    throw new Error(`Missing ${role} workspace fixture.`);
  }
  return workspace;
}

function workspaceRows(fixture: FormlessInstanceManagementFixture, role: "apps" | "routes") {
  return requiredWorkspaceTable(fixture.state, role).rows;
}

function requiredWorkspaceTable(
  state: FormlessInstanceManagementFixture["state"],
  role: "apps" | "routes",
) {
  const workspace = requiredWorkspace(state, role);
  const result = workspace.sections[0]?.collection.presentation.result;
  if (result?.kind !== "table") {
    throw new Error(`Expected ${role} table fixture.`);
  }
  return result;
}

function requiredInstallAction(state: FormlessInstanceManagementFixture["state"]) {
  const action = requiredWorkspace(state, "apps").sections[0]?.actions[0];
  if (!action) {
    throw new Error("Missing Install app fixture action.");
  }
  return action;
}

function requiredRouteCreateAction(state: FormlessInstanceManagementFixture["state"]) {
  const action = requiredWorkspace(
    state,
    "routes",
  ).sections[0]?.collection.presentation.actions.primary.find(
    (candidate) => candidate.kind === "createAction",
  );
  if (!action || action.kind !== "createAction") {
    throw new Error("Missing Create Route fixture action.");
  }
  return action;
}

function requiredRouteEditAction(state: FormlessInstanceManagementFixture["state"]) {
  const table = requiredWorkspaceTable(state, "routes");
  const group = table.rows[0]?.cells
    .flatMap((cell) => cell.contents)
    .find((content) => content.kind === "actionGroup");
  const action = group
    ? [...group.primary, ...group.secondary].find((candidate) => candidate.kind === "editAction")
    : undefined;
  if (!action || action.kind !== "editAction") {
    throw new Error("Missing Edit route fixture action.");
  }
  return action;
}

function instanceManagementAppsWorkspaceId(state: FormlessInstanceManagementFixture["state"]) {
  return requiredWorkspace(state, "apps").id;
}

function instanceManagementRoutesWorkspaceId(state: FormlessInstanceManagementFixture["state"]) {
  return requiredWorkspace(state, "routes").id;
}

function referenceKey(
  nodes: readonly { reference: PresentationReference }[],
  kind: PresentationReference["kind"],
  localId?: string,
) {
  const reference = nodes.find(
    (node) =>
      node.reference.kind === kind &&
      (localId === undefined ||
        (node.reference.kind === "workspaceSectionShellReference" &&
          node.reference.sectionId === localId)),
  )?.reference;
  if (!reference) {
    throw new Error(`Missing ${kind} fixture reference.`);
  }
  return presentationReferenceKey(reference);
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}
