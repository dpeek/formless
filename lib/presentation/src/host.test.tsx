import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import packageJson from "../package.json";
import type {
  PresentationIntent,
  DocumentThemeContract,
  DocumentThemeIntent,
  ListContract,
  RecordResultContract,
  ShellIntent,
  ShellManifestContract,
  ShellNavigationSectionContract,
  TableContract,
  WorkspaceIntent,
  WorkspaceManifestContract,
  WorkspaceSectionShellContract,
} from "./contract.ts";
import {
  createMemoryPresentationHost,
  documentThemeReference,
  listResultReference,
  recordResultReference,
  shellManifestReference,
  shellNavigationSectionReference,
  tableResultReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  type PresentationNodeSet,
  type DocumentThemeNode,
} from "./host.ts";
import {
  PresentationHostProvider,
  useDocumentTheme,
  useShellManifest,
  useWorkspaceManifest,
} from "./host-react.tsx";

const workspaceReference = workspaceManifestReference("workspace:tasks");
const taskSectionReference = workspaceSectionShellReference("workspace:tasks", "section:tasks");
const companySectionReference = workspaceSectionShellReference(
  "workspace:tasks",
  "section:companies",
);
const taskResultReference = listResultReference({
  resultId: "list:tasks",
  role: "mainResult",
  sectionId: "section:tasks",
  workspaceId: "workspace:tasks",
});
const companyResultReference = listResultReference({
  resultId: "list:companies",
  role: "mainResult",
  sectionId: "section:companies",
  workspaceId: "workspace:tasks",
});
const taskTableResultReference = tableResultReference({
  resultId: "table:tasks",
  role: "mainResult",
  sectionId: "section:table",
  workspaceId: "workspace:tasks",
});
const contextResultReference = recordResultReference({
  resultId: "record:task",
  role: "contextResult",
  sectionId: "section:tasks",
  workspaceId: "workspace:tasks",
});
const shellReference = shellManifestReference("shell:tasks");
const themeReference = documentThemeReference("theme:application");
const appSectionReference = shellNavigationSectionReference("shell:tasks", "shell-section:app");
const settingsSectionReference = shellNavigationSectionReference(
  "shell:tasks",
  "shell-section:settings",
);
const sessionSectionReference = shellNavigationSectionReference(
  "shell:tasks",
  "shell-section:session",
);

describe("memory Presentation Host", () => {
  it("provides typed reads through stable scoped references", () => {
    const host = createMemoryPresentationHost({
      nodes: [
        ...workspaceNodes(),
        ...shellNodes(),
        { reference: taskTableResultReference, snapshot: tableResult("table:tasks") },
        { reference: contextResultReference, snapshot: recordResult("record:task") },
      ],
    });

    const workspace: WorkspaceManifestContract | undefined = host.read({
      ...workspaceReference,
    });
    const list: ListContract | undefined = host.read({ ...taskResultReference });
    const table: TableContract | undefined = host.read({ ...taskTableResultReference });
    const record: RecordResultContract | undefined = host.read({
      ...contextResultReference,
    });
    const shell: ShellManifestContract | undefined = host.read({
      ...shellReference,
    });
    const shellSection: ShellNavigationSectionContract | undefined = host.read({
      ...appSectionReference,
    });

    expect(workspace?.label).toBe("Work");
    expect(list?.accessibilityLabel).toBe("Tasks");
    expect(table?.kind).toBe("table");
    expect(record?.kind).toBe("recordResult");
    expect(shell?.scope).toBe("multiApp");
    expect(shellSection?.destinations[0]?.label).toBe("Tasks");
  });

  it("hosts fixed and user-controlled theme snapshots beside shell nodes", () => {
    const host = createMemoryPresentationHost({
      nodes: [...shellNodes(), fixedThemeNodes("dark")],
    });
    const fixedTheme: DocumentThemeContract | undefined = host.read({
      ...themeReference,
    });

    expect(fixedTheme).toEqual({
      activeMode: "dark",
      id: themeReference.themeId,
      kind: "documentTheme",
      policy: { kind: "fixed", mode: "dark" },
    });
    expect(host.read(shellReference)?.title).toBe("Tasks");

    host.publish([...shellNodes(), userThemeNodes("system", "light")]);

    expect(host.read(themeReference)).toMatchObject({
      activeMode: "light",
      policy: { kind: "userControlled" },
      selectionControl: {
        selectedMode: "system",
      },
    });
  });

  it("reuses theme identity, scopes notifications, and removes themes independently", () => {
    const host = createMemoryPresentationHost({
      nodes: [...shellNodes(), userThemeNodes("system", "light")],
    });
    const initialTheme = host.read(themeReference);
    const initialShell = host.read(shellReference);
    const calls: string[] = [];

    host.subscribe(themeReference, () => calls.push("theme"));
    host.subscribe(shellReference, () => calls.push("shell"));

    host.publish([...shellNodes(), userThemeNodes("system", "light")]);

    expect(calls).toEqual([]);
    expect(host.read(themeReference)).toBe(initialTheme);
    expect(host.read(shellReference)).toBe(initialShell);

    host.publish([...shellNodes(), userThemeNodes("dark", "dark")]);

    expect(calls).toEqual(["theme"]);
    expect(host.read(shellReference)).toBe(initialShell);

    host.publish(shellNodes());

    expect(calls).toEqual(["theme", "theme"]);
    expect(host.read(themeReference)).toBeUndefined();
    expect(host.read(shellReference)).toBe(initialShell);
  });

  it("validates document-theme identity, fixed policy, and selection intents", () => {
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            reference: themeReference,
            snapshot: {
              ...fixedThemeNodes("light").snapshot,
              id: "theme:other",
            },
          } as DocumentThemeNode,
        ],
      }),
    ).toThrow("does not match reference");

    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            reference: themeReference,
            snapshot: {
              ...fixedThemeNodes("light").snapshot,
              activeMode: "dark",
            },
          },
        ],
      }),
    ).toThrow("must use its policy mode");

    const userTheme = userThemeNodes("system", "light");
    const userSnapshot = userTheme.snapshot;
    const selectionControl = userSnapshot.selectionControl;
    if (userSnapshot.policy.kind !== "userControlled" || !selectionControl) {
      throw new Error("Expected user-controlled document-theme selection control.");
    }
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...userTheme,
            snapshot: {
              ...userSnapshot,
              selectionControl: {
                ...selectionControl,
                options: selectionControl.options.map((option) => ({
                  ...option,
                  selectionIntent: { ...option.selectionIntent, themeId: "theme:other" },
                })),
              },
            },
          },
        ],
      }),
    ).toThrow("invalid mode-selection intent");
  });

  it("validates parent scopes, shell references, and active destinations", () => {
    const crossShellSectionReference = shellNavigationSectionReference(
      "shell:crm",
      "shell-section:app",
    );
    const invalidScopeNodes: PresentationNodeSet = [
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

    expect(() => createMemoryPresentationHost({ nodes: invalidScopeNodes })).toThrow(
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
    ) as PresentationNodeSet;

    expect(() => createMemoryPresentationHost({ nodes: invalidDestinationNodes })).toThrow(
      "active destination",
    );
    expect(() =>
      createMemoryPresentationHost({
        nodes: shellNodes().filter(
          ({ reference }) => reference.kind !== "shellNavigationSectionReference",
        ),
      }),
    ).toThrow("has no snapshot");
  });

  it("publishes complete node sets transactionally and notifies only changed scopes", () => {
    const host = createMemoryPresentationHost({ nodes: workspaceNodes() });
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
    const host = createMemoryPresentationHost({
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
    const host = createMemoryPresentationHost({ nodes: workspaceNodes() });
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
    const host = createMemoryPresentationHost({ nodes: shellNodes() });
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
    const host = createMemoryPresentationHost({ nodes: initialNodes });
    const initialWorkspace = host.read(workspaceReference);

    expect(() => host.publish(initialNodes.slice(0, -1))).toThrow("has no snapshot");
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(companyResultReference)).toBeDefined();
  });

  it("caches server snapshots for server rendering and hydration", () => {
    const serverNodes = workspaceNodes();
    const host = createMemoryPresentationHost({
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
        <PresentationHostProvider host={host}>
          <WorkspaceLabel />
        </PresentationHostProvider>,
      ),
    ).toContain("Work");
  });

  it("caches shell server snapshots for server rendering and hydration", () => {
    const serverNodes = shellNodes();
    const host = createMemoryPresentationHost({
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
        <PresentationHostProvider host={host}>
          <ShellTitle />
        </PresentationHostProvider>,
      ),
    ).toContain("Tasks");
  });

  it("caches document-theme server snapshots for server rendering and hydration", () => {
    const serverNodes = [fixedThemeNodes("light")];
    const host = createMemoryPresentationHost({
      nodes: serverNodes,
      serverNodes,
    });
    const serverSnapshot = host.getServerSnapshot(themeReference);

    expect(host.read(themeReference)).toBe(serverSnapshot);

    host.publish([userThemeNodes("dark", "dark")]);

    expect(host.read(themeReference)?.activeMode).toBe("dark");
    expect(host.getServerSnapshot(themeReference)).toBe(serverSnapshot);
    expect(
      renderToStaticMarkup(
        <PresentationHostProvider host={host}>
          <ThemeActiveMode />
        </PresentationHostProvider>,
      ),
    ).toContain("light");
  });

  it("dispatches the canonical workspace intent union", async () => {
    const calls: PresentationIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: workspaceNodes(),
    });
    const intent: WorkspaceIntent = {
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
    const calls: PresentationIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: shellNodes(),
    });
    const intent: ShellIntent = {
      controlId: "control:logout",
      sectionId: sessionSectionReference.sectionId,
      shellId: shellReference.shellId,
      type: "shellLogout",
    };

    await host.dispatch(intent);

    expect(calls).toEqual([intent]);
  });

  it("dispatches the canonical document-theme intent union", async () => {
    const calls: PresentationIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: [userThemeNodes("system", "light")],
    });
    const intent: DocumentThemeIntent = {
      controlId: "control:theme-mode",
      mode: "dark",
      themeId: themeReference.themeId,
      type: "documentThemeModeSelection",
    };

    await host.dispatch(intent);

    expect(calls).toEqual([intent]);
  });
});

describe("Presentation Host package boundary", () => {
  it("exports renderer-neutral host and React subscription subpaths", async () => {
    expect(packageJson.exports).toMatchObject({
      "./contract": "./src/contract.ts",
      "./host": "./src/host.ts",
      "./host/react": "./src/host-react.tsx",
    });

    const hostSource = await readFile(new URL("./host.ts", import.meta.url), "utf8");
    const reactSource = await readFile(new URL("./host-react.tsx", import.meta.url), "utf8");
    const importSpecifiers = [
      ...`${hostSource}\n${reactSource}`.matchAll(/from\s+["']([^"']+)["']/g),
    ]
      .map((match) => match[1])
      .sort();

    expect(importSpecifiers).toEqual(["./contract.ts", "./contract.ts", "./host.ts", "react"]);
  });
});

function WorkspaceLabel() {
  const workspace = useWorkspaceManifest(workspaceReference);
  return <span>{workspace?.label}</span>;
}

function ShellTitle() {
  const shell = useShellManifest(shellReference);
  return <span>{shell?.title}</span>;
}

function ThemeActiveMode() {
  const theme = useDocumentTheme(themeReference);
  return <span>{theme?.activeMode}</span>;
}

function fixedThemeNodes(mode: "light" | "dark"): DocumentThemeNode {
  return {
    reference: themeReference,
    snapshot: {
      activeMode: mode,
      id: themeReference.themeId,
      kind: "documentTheme",
      policy: { kind: "fixed", mode },
    },
  };
}

function userThemeNodes(
  selectedMode: "system" | "light" | "dark",
  activeMode: "light" | "dark",
): DocumentThemeNode {
  const controlId = "control:theme-mode";
  const option = (mode: "system" | "light" | "dark", label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId: themeReference.themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    reference: themeReference,
    snapshot: {
      activeMode,
      id: themeReference.themeId,
      kind: "documentTheme",
      policy: { kind: "userControlled" },
      selectionControl: {
        accessibilityLabel: "Theme mode",
        id: controlId,
        kind: "documentThemeSelectionControl",
        options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
        selectedMode,
      },
    },
  };
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
} = {}): PresentationNodeSet {
  const navigationSections = includeSettings
    ? [appSectionReference, settingsSectionReference, sessionSectionReference]
    : [appSectionReference, sessionSectionReference];
  const nodes: PresentationNodeSet = [
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
  destinations?: ShellNavigationSectionContract["destinations"];
  id: string;
  role?: ShellNavigationSectionContract["role"];
  session?: ShellNavigationSectionContract["session"];
  settings?: ShellNavigationSectionContract["settings"];
  shellId: string;
}): ShellNavigationSectionContract {
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
} = {}): PresentationNodeSet {
  const sections = includeCompanies
    ? [taskSectionReference, companySectionReference]
    : [taskSectionReference];
  const nodes: PresentationNodeSet = [
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
): WorkspaceSectionShellContract {
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

function listResult(id: string, accessibilityLabel: string): ListContract {
  return {
    accessibilityLabel,
    density: "default",
    editing: { enabled: true },
    id,
    items: [],
    kind: "list",
  };
}

function tableResult(id: string): TableContract {
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

function recordResult(id: string): RecordResultContract {
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
