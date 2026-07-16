import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import packageJson from "../package.json";
import type {
  FormlessUiContractIntent,
  FormlessUiListContract,
  FormlessUiRecordResultContract,
  FormlessUiShellIntent,
  FormlessUiShellManifestContract,
  FormlessUiShellNavigationSectionContract,
  FormlessUiTableContract,
  FormlessUiWorkspaceIntent,
  FormlessUiWorkspaceManifestContract,
  FormlessUiWorkspaceSectionShellContract,
} from "./formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiListResultReference,
  formlessUiRecordResultReference,
  formlessUiShellManifestReference,
  formlessUiShellNavigationSectionReference,
  formlessUiTableResultReference,
  formlessUiWorkspaceManifestReference,
  formlessUiWorkspaceSectionShellReference,
  type FormlessUiContractHostNodeSet,
} from "./formless-ui-contract-host.ts";
import {
  FormlessUiContractHostProvider,
  useFormlessUiShellManifest,
  useFormlessUiWorkspaceManifest,
} from "./formless-ui-contract-host-react.tsx";

const workspaceReference = formlessUiWorkspaceManifestReference("workspace:tasks");
const taskSectionReference = formlessUiWorkspaceSectionShellReference(
  "workspace:tasks",
  "section:tasks",
);
const companySectionReference = formlessUiWorkspaceSectionShellReference(
  "workspace:tasks",
  "section:companies",
);
const taskResultReference = formlessUiListResultReference({
  resultId: "list:tasks",
  role: "mainResult",
  sectionId: "section:tasks",
  workspaceId: "workspace:tasks",
});
const companyResultReference = formlessUiListResultReference({
  resultId: "list:companies",
  role: "mainResult",
  sectionId: "section:companies",
  workspaceId: "workspace:tasks",
});
const tableResultReference = formlessUiTableResultReference({
  resultId: "table:tasks",
  role: "mainResult",
  sectionId: "section:table",
  workspaceId: "workspace:tasks",
});
const contextResultReference = formlessUiRecordResultReference({
  resultId: "record:task",
  role: "contextResult",
  sectionId: "section:tasks",
  workspaceId: "workspace:tasks",
});
const shellReference = formlessUiShellManifestReference("shell:tasks");
const appSectionReference = formlessUiShellNavigationSectionReference(
  "shell:tasks",
  "shell-section:app",
);
const settingsSectionReference = formlessUiShellNavigationSectionReference(
  "shell:tasks",
  "shell-section:settings",
);
const sessionSectionReference = formlessUiShellNavigationSectionReference(
  "shell:tasks",
  "shell-section:session",
);

describe("Formless UI memory contract host", () => {
  it("provides typed reads through stable scoped references", () => {
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        ...workspaceNodes(),
        ...shellNodes(),
        { reference: tableResultReference, snapshot: tableResult("table:tasks") },
        { reference: contextResultReference, snapshot: recordResult("record:task") },
      ],
    });

    const workspace: FormlessUiWorkspaceManifestContract | undefined = host.read({
      ...workspaceReference,
    });
    const list: FormlessUiListContract | undefined = host.read({ ...taskResultReference });
    const table: FormlessUiTableContract | undefined = host.read({ ...tableResultReference });
    const record: FormlessUiRecordResultContract | undefined = host.read({
      ...contextResultReference,
    });
    const shell: FormlessUiShellManifestContract | undefined = host.read({
      ...shellReference,
    });
    const shellSection: FormlessUiShellNavigationSectionContract | undefined = host.read({
      ...appSectionReference,
    });

    expect(workspace?.label).toBe("Work");
    expect(list?.accessibilityLabel).toBe("Tasks");
    expect(table?.kind).toBe("table");
    expect(record?.kind).toBe("recordResult");
    expect(shell?.scope).toBe("multiApp");
    expect(shellSection?.destinations[0]?.label).toBe("Tasks");
  });

  it("validates parent scopes, shell references, and active destinations", () => {
    const crossShellSectionReference = formlessUiShellNavigationSectionReference(
      "shell:crm",
      "shell-section:app",
    );
    const invalidScopeNodes: FormlessUiContractHostNodeSet = [
      {
        reference: shellReference,
        snapshot: {
          accessibilityLabel: "Tasks application shell",
          activeDestination: null,
          id: shellReference.shellId,
          kind: "shellManifest",
          navigationSections: [crossShellSectionReference],
          scope: "multiApp",
          title: "Tasks",
        },
      },
      {
        reference: crossShellSectionReference,
        snapshot: shellSection({
          id: crossShellSectionReference.sectionId,
          shellId: crossShellSectionReference.shellId,
        }),
      },
    ];

    expect(() => createFormlessUiMemoryContractHost({ nodes: invalidScopeNodes })).toThrow(
      "invalid parent scope",
    );

    const invalidDestinationNodes = shellNodes().map((node) =>
      node.reference.kind === "shellManifestReference"
        ? {
            ...node,
            snapshot: {
              ...node.snapshot,
              activeDestination: {
                destinationId: "destination:missing",
                sectionId: appSectionReference.sectionId,
              },
            },
          }
        : node,
    ) as FormlessUiContractHostNodeSet;

    expect(() => createFormlessUiMemoryContractHost({ nodes: invalidDestinationNodes })).toThrow(
      "active destination",
    );
    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: shellNodes().filter(
          ({ reference }) => reference.kind !== "shellNavigationSectionReference",
        ),
      }),
    ).toThrow("has no snapshot");
  });

  it("publishes complete node sets transactionally and notifies only changed scopes", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: workspaceNodes() });
    const initialWorkspace = host.read(workspaceReference);
    const initialTaskSection = host.read(taskSectionReference);
    const initialCompanyResult = host.read(companyResultReference);
    const calls: string[] = [];
    let companyLabelSeenFromTaskNotification: string | undefined;

    host.subscribe(workspaceReference, () => calls.push("workspace"));
    host.subscribe(taskSectionReference, () => calls.push("task-section"));
    host.subscribe(taskResultReference, () => {
      calls.push("task-result");
      companyLabelSeenFromTaskNotification = host.read(companyResultReference)?.accessibilityLabel;
    });
    host.subscribe(companyResultReference, () => calls.push("company-result"));

    host.publish(workspaceNodes());

    expect(calls).toEqual([]);
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(taskSectionReference)).toBe(initialTaskSection);
    expect(host.read(companyResultReference)).toBe(initialCompanyResult);

    host.publish(
      workspaceNodes({
        companyResultLabel: "Companies updated",
        taskResultLabel: "Tasks updated",
      }),
    );

    expect(calls).toEqual(["task-result", "company-result"]);
    expect(companyLabelSeenFromTaskNotification).toBe("Companies updated");
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(taskSectionReference)).toBe(initialTaskSection);
  });

  it("publishes shell and workspace nodes atomically with identity reuse and scoped notification", () => {
    const host = createFormlessUiMemoryContractHost({
      nodes: [...workspaceNodes(), ...shellNodes()],
    });
    const initialShell = host.read(shellReference);
    const initialAppSection = host.read(appSectionReference);
    const initialSettingsSection = host.read(settingsSectionReference);
    const initialWorkspace = host.read(workspaceReference);
    const calls: string[] = [];
    let syncMessageSeenFromAppNotification: string | undefined;

    host.subscribe(shellReference, () => calls.push("shell"));
    host.subscribe(appSectionReference, () => {
      calls.push("app-section");
      syncMessageSeenFromAppNotification =
        host.read(settingsSectionReference)?.settings?.sync?.message;
    });
    host.subscribe(settingsSectionReference, () => calls.push("settings-section"));
    host.subscribe(workspaceReference, () => calls.push("workspace"));

    host.publish([...workspaceNodes(), ...shellNodes()]);

    expect(calls).toEqual([]);
    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(appSectionReference)).toBe(initialAppSection);
    expect(host.read(settingsSectionReference)).toBe(initialSettingsSection);
    expect(host.read(workspaceReference)).toBe(initialWorkspace);

    host.publish([
      ...workspaceNodes(),
      ...shellNodes({ appLabel: "Tasks updated", syncMessage: "Sync caught up." }),
    ]);

    expect(calls).toEqual(["app-section", "settings-section"]);
    expect(syncMessageSeenFromAppNotification).toBe("Sync caught up.");
    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
  });

  it("removes references atomically with their parent references", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: workspaceNodes() });
    const calls: string[] = [];
    let removedResultVisibleFromWorkspaceNotification = true;

    host.subscribe(workspaceReference, () => {
      calls.push("workspace");
      removedResultVisibleFromWorkspaceNotification =
        host.read(companyResultReference) !== undefined;
    });
    host.subscribe(companySectionReference, () => calls.push("company-section"));
    host.subscribe(companyResultReference, () => calls.push("company-result"));

    host.publish(workspaceNodes({ includeCompanies: false }));

    expect(calls).toEqual(["workspace", "company-section", "company-result"]);
    expect(removedResultVisibleFromWorkspaceNotification).toBe(false);
    expect(host.read(companySectionReference)).toBeUndefined();
    expect(host.read(companyResultReference)).toBeUndefined();
  });

  it("removes a shell section in the same publication as its manifest reference", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: shellNodes() });
    const calls: string[] = [];
    let removedSectionVisibleFromManifestNotification = true;

    host.subscribe(shellReference, () => {
      calls.push("shell");
      removedSectionVisibleFromManifestNotification =
        host.read(settingsSectionReference) !== undefined;
    });
    host.subscribe(settingsSectionReference, () => calls.push("settings-section"));

    host.publish(shellNodes({ includeSettings: false }));

    expect(calls).toEqual(["shell", "settings-section"]);
    expect(removedSectionVisibleFromManifestNotification).toBe(false);
    expect(host.read(settingsSectionReference)).toBeUndefined();
  });

  it("rejects an incomplete next node set before replacing current reads", () => {
    const initialNodes = workspaceNodes();
    const host = createFormlessUiMemoryContractHost({ nodes: initialNodes });
    const initialWorkspace = host.read(workspaceReference);

    expect(() => host.publish(initialNodes.slice(0, -1))).toThrow("has no snapshot");
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(companyResultReference)).toBeDefined();
  });

  it("caches server snapshots for server rendering and hydration", () => {
    const serverNodes = workspaceNodes();
    const host = createFormlessUiMemoryContractHost({
      nodes: workspaceNodes(),
      serverNodes,
    });
    const serverSnapshot = host.getServerSnapshot(workspaceReference);

    expect(host.read(workspaceReference)).toBe(serverSnapshot);
    expect(host.getServerSnapshot(workspaceReference)).toBe(serverSnapshot);

    host.publish(workspaceNodes({ workspaceLabel: "Client work" }));

    expect(host.read(workspaceReference)?.label).toBe("Client work");
    expect(host.getServerSnapshot(workspaceReference)).toBe(serverSnapshot);
    expect(
      renderToStaticMarkup(
        <FormlessUiContractHostProvider host={host}>
          <WorkspaceLabel />
        </FormlessUiContractHostProvider>,
      ),
    ).toContain("Work");
  });

  it("caches shell server snapshots for server rendering and hydration", () => {
    const serverNodes = shellNodes();
    const host = createFormlessUiMemoryContractHost({
      nodes: shellNodes(),
      serverNodes,
    });
    const serverSnapshot = host.getServerSnapshot(shellReference);

    expect(host.read(shellReference)).toBe(serverSnapshot);

    host.publish(shellNodes({ title: "Client tasks" }));

    expect(host.read(shellReference)?.title).toBe("Client tasks");
    expect(host.getServerSnapshot(shellReference)).toBe(serverSnapshot);
    expect(
      renderToStaticMarkup(
        <FormlessUiContractHostProvider host={host}>
          <ShellTitle />
        </FormlessUiContractHostProvider>,
      ),
    ).toContain("Tasks");
  });

  it("dispatches the canonical workspace intent union", async () => {
    const calls: FormlessUiContractIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: workspaceNodes(),
    });
    const intent: FormlessUiWorkspaceIntent = {
      collectionId: "collection:tasks",
      queryId: "query:active",
      screenId: "workspace:tasks",
      sectionId: "section:tasks",
      type: "workspaceQuerySelection",
    };

    await host.dispatch(intent);

    expect(calls).toEqual([intent]);
  });

  it("dispatches the canonical shell intent union", async () => {
    const calls: FormlessUiContractIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: shellNodes(),
    });
    const intent: FormlessUiShellIntent = {
      controlId: "control:logout",
      sectionId: sessionSectionReference.sectionId,
      shellId: shellReference.shellId,
      type: "shellLogout",
    };

    await host.dispatch(intent);

    expect(calls).toEqual([intent]);
  });
});

describe("Formless UI contract host package boundary", () => {
  it("exports renderer-neutral host and React subscription subpaths", async () => {
    expect(packageJson.exports).toMatchObject({
      "./contract": "./src/formless-ui-contract.ts",
      "./contract-host": "./src/formless-ui-contract-host.ts",
      "./contract-host/react": "./src/formless-ui-contract-host-react.tsx",
    });

    const hostSource = await readFile(
      new URL("./formless-ui-contract-host.ts", import.meta.url),
      "utf8",
    );
    const reactSource = await readFile(
      new URL("./formless-ui-contract-host-react.tsx", import.meta.url),
      "utf8",
    );
    const importSpecifiers = [
      ...`${hostSource}\n${reactSource}`.matchAll(/from\s+["']([^"']+)["']/g),
    ]
      .map((match) => match[1])
      .sort();

    expect(importSpecifiers).toEqual([
      "./formless-ui-contract-host.ts",
      "./formless-ui-contract.ts",
      "./formless-ui-contract.ts",
      "react",
    ]);
  });
});

function WorkspaceLabel() {
  const workspace = useFormlessUiWorkspaceManifest(workspaceReference);
  return <span>{workspace?.label}</span>;
}

function ShellTitle() {
  const shell = useFormlessUiShellManifest(shellReference);
  return <span>{shell?.title}</span>;
}

function shellNodes({
  appLabel = "Tasks",
  includeSettings = true,
  syncMessage = "Local cache ready.",
  title = "Tasks",
}: {
  appLabel?: string;
  includeSettings?: boolean;
  syncMessage?: string;
  title?: string;
} = {}): FormlessUiContractHostNodeSet {
  const navigationSections = includeSettings
    ? [appSectionReference, settingsSectionReference, sessionSectionReference]
    : [appSectionReference, sessionSectionReference];
  const nodes: FormlessUiContractHostNodeSet = [
    {
      reference: shellReference,
      snapshot: {
        accessibilityLabel: "Tasks application shell",
        activeDestination: {
          destinationId: "destination:tasks",
          sectionId: appSectionReference.sectionId,
        },
        id: shellReference.shellId,
        kind: "shellManifest",
        navigationSections,
        scope: "multiApp",
        title,
      },
    },
    {
      reference: appSectionReference,
      snapshot: shellSection({
        destinations: [
          {
            accessibilityLabel: `${appLabel} app`,
            availability: { available: true },
            href: "/apps/tasks",
            id: "destination:tasks",
            kind: "shellLinkDestination",
            label: appLabel,
            selected: true,
          },
        ],
        id: appSectionReference.sectionId,
        shellId: shellReference.shellId,
      }),
    },
    {
      reference: sessionSectionReference,
      snapshot: shellSection({
        id: sessionSectionReference.sectionId,
        role: "session",
        session: {
          id: "session:owner",
          identity: { displayName: "Ada Owner", secondaryLabel: "Owner" },
          kind: "shellSession",
          logout: shellButton("control:logout", "Log out"),
          state: "authenticated",
        },
        shellId: shellReference.shellId,
      }),
    },
  ];

  return includeSettings
    ? [
        ...nodes.slice(0, 2),
        {
          reference: settingsSectionReference,
          snapshot: shellSection({
            id: settingsSectionReference.sectionId,
            role: "appSettings",
            settings: {
              id: "settings:tasks",
              kind: "shellSettings",
              reset: {
                confirmation: {
                  cancel: shellButton("control:reset-cancel", "Cancel"),
                  confirm: shellButton("control:reset-confirm", "Reset", "primary"),
                  description: "Replace current records with source seed records.",
                  id: "confirmation:reset",
                  kind: "shellResetConfirmation",
                  open: false,
                  title: "Reset Tasks source seed data?",
                },
                id: "reset:tasks",
                kind: "shellReset",
                status: { state: "idle" },
                trigger: shellButton("control:reset-open", "Reset source seed data"),
              },
              sync: {
                id: "sync:tasks",
                kind: "shellSyncStatus",
                label: "Synced",
                message: syncMessage,
                state: "idle",
              },
              workspaceSave: {
                id: "workspace-save:tasks",
                kind: "shellWorkspaceSaveStatus",
                label: "Saved",
                message: "Workspace source is saved.",
                state: "saved",
              },
            },
            shellId: shellReference.shellId,
          }),
        },
        nodes[2]!,
      ]
    : nodes;
}

function shellSection({
  destinations = [],
  id,
  role = "appSwitcher",
  session,
  settings,
  shellId,
}: {
  destinations?: FormlessUiShellNavigationSectionContract["destinations"];
  id: string;
  role?: FormlessUiShellNavigationSectionContract["role"];
  session?: FormlessUiShellNavigationSectionContract["session"];
  settings?: FormlessUiShellNavigationSectionContract["settings"];
  shellId: string;
}): FormlessUiShellNavigationSectionContract {
  return {
    accessibilityLabel: `${id} navigation`,
    destinations,
    id,
    kind: "shellNavigationSection",
    role,
    ...(session === undefined ? {} : { session }),
    ...(settings === undefined ? {} : { settings }),
    shellId,
  };
}

function shellButton(
  id: string,
  label: string,
  prominence: "primary" | "secondary" | "quiet" = "secondary",
) {
  return {
    accessibilityLabel: label,
    content: { kind: "label" as const, label },
    density: "default" as const,
    id,
    kind: "button" as const,
    prominence,
    type: "button" as const,
  };
}

function workspaceNodes({
  companyResultLabel = "Companies",
  includeCompanies = true,
  taskResultLabel = "Tasks",
  workspaceLabel = "Work",
}: {
  companyResultLabel?: string;
  includeCompanies?: boolean;
  taskResultLabel?: string;
  workspaceLabel?: string;
} = {}): FormlessUiContractHostNodeSet {
  const sections = includeCompanies
    ? [taskSectionReference, companySectionReference]
    : [taskSectionReference];
  const nodes: FormlessUiContractHostNodeSet = [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Work workspace",
        actions: [],
        id: "workspace:tasks",
        kind: "workspaceManifest",
        label: workspaceLabel,
        sections,
      },
    },
    {
      reference: taskSectionReference,
      snapshot: sectionShell("section:tasks", "Tasks", "collection:tasks", taskResultReference),
    },
    {
      reference: taskResultReference,
      snapshot: listResult("list:tasks", taskResultLabel),
    },
  ];

  return includeCompanies
    ? [
        ...nodes,
        {
          reference: companySectionReference,
          snapshot: sectionShell(
            "section:companies",
            "Companies",
            "collection:companies",
            companyResultReference,
          ),
        },
        {
          reference: companyResultReference,
          snapshot: listResult("list:companies", companyResultLabel),
        },
      ]
    : nodes;
}

function sectionShell(
  id: string,
  label: string,
  collectionId: string,
  result: typeof taskResultReference,
): FormlessUiWorkspaceSectionShellContract {
  return {
    accessibilityLabel: `${label} section`,
    actions: [],
    collection: {
      accessibilityLabel: `${label} collection`,
      availability: { state: "ready" },
      id: collectionId,
      kind: "workspaceCollection",
      label,
      presentation: {
        actions: {
          id: `${collectionId}:actions`,
          kind: "workspaceCollectionActions",
          primary: [],
          secondary: [],
          secondaryAccessibilityLabel: `${label} secondary actions`,
        },
        kind: "ordinary",
        result,
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id,
    kind: "workspaceSectionShell",
    label,
  };
}

function listResult(id: string, accessibilityLabel: string): FormlessUiListContract {
  return {
    accessibilityLabel,
    density: "default",
    editing: { enabled: true },
    id,
    items: [],
    kind: "list",
  };
}

function tableResult(id: string): FormlessUiTableContract {
  return {
    accessibilityLabel: "Tasks table",
    columns: [],
    density: "default",
    editing: { enabled: true },
    id,
    kind: "table",
    rows: [],
  };
}

function recordResult(id: string): FormlessUiRecordResultContract {
  return {
    accessibilityLabel: "Task detail",
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More task actions",
    },
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    fields: [],
    id,
    kind: "recordResult",
    warnings: [],
  };
}
