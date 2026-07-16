import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import packageJson from "../package.json";
import type {
  FormlessUiListContract,
  FormlessUiRecordResultContract,
  FormlessUiTableContract,
  FormlessUiWorkspaceIntent,
  FormlessUiWorkspaceManifestContract,
  FormlessUiWorkspaceSectionShellContract,
} from "./formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiListResultReference,
  formlessUiRecordResultReference,
  formlessUiTableResultReference,
  formlessUiWorkspaceManifestReference,
  formlessUiWorkspaceSectionShellReference,
  type FormlessUiContractHostNodeSet,
} from "./formless-ui-contract-host.ts";
import {
  FormlessUiContractHostProvider,
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

describe("Formless UI memory contract host", () => {
  it("provides typed reads through stable scoped references", () => {
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        ...workspaceNodes(),
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

    expect(workspace?.label).toBe("Work");
    expect(list?.accessibilityLabel).toBe("Tasks");
    expect(table?.kind).toBe("table");
    expect(record?.kind).toBe("recordResult");
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

  it("dispatches the canonical workspace intent union", async () => {
    const calls: FormlessUiWorkspaceIntent[] = [];
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
