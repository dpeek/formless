import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiContractReference,
  FormlessUiListContract,
  FormlessUiRecordResultContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntent,
  FormlessUiWorkspaceSectionShellContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiContractReferenceKey,
  formlessUiListResultReference,
  formlessUiRecordResultReference,
  formlessUiWorkspaceManifestReference,
  formlessUiWorkspaceSectionShellReference,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  AstryxSubscribedWorkspaceScreenRenderer,
  AstryxWorkspaceScreenRenderer,
} from "./formless-ui-workspace-screen-renderer.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

vi.mock("@astryxdesign/core/Button", () => ({
  Button: (props: ComponentProps<"button">) => createElement("button", props),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workspaceReference = formlessUiWorkspaceManifestReference("workspace:tasks");
const taskSectionReference = formlessUiWorkspaceSectionShellReference(
  workspaceReference.workspaceId,
  "section:tasks",
);
const companySectionReference = formlessUiWorkspaceSectionShellReference(
  workspaceReference.workspaceId,
  "section:companies",
);
const taskResultReference = formlessUiListResultReference({
  resultId: "list:tasks",
  role: "mainResult",
  sectionId: taskSectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});
const companyResultReference = formlessUiListResultReference({
  resultId: "list:companies",
  role: "mainResult",
  sectionId: companySectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});
const contextResultReference = formlessUiRecordResultReference({
  resultId: "record:task-context",
  role: "contextResult",
  sectionId: taskSectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});

describe("subscribed Astryx workspace renderer", () => {
  it("composes separate main and context results and preserves direct snapshot rendering", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: workspaceNodes() });
    const subscribedHtml = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <AstryxSubscribedWorkspaceScreenRenderer reference={workspaceReference} />
      </FormlessUiContractHostProvider>,
    );
    const directHtml = renderToStaticMarkup(
      <AstryxWorkspaceScreenRenderer onIntent={() => undefined} workspace={completeWorkspace()} />,
    );

    for (const html of [subscribedHtml, directHtml]) {
      expect(html).toContain('data-formless-astryx-workspace="workspace:tasks"');
      expect(html).toContain('data-formless-record-result="record:task-context"');
      expect(html).toContain('aria-label="Tasks result"');
      expect(html.indexOf("Tasks section")).toBeLessThan(html.indexOf("Companies section"));
    }
  });

  it("limits result, section, and structure updates to their subscribed boundaries", async () => {
    const tracked = createTrackedHost(workspaceNodes());
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <FormlessUiContractHostProvider host={tracked.host}>
          <AstryxSubscribedWorkspaceScreenRenderer reference={workspaceReference} />
        </FormlessUiContractHostProvider>,
      );
    });

    if (!renderer) {
      throw new Error("Expected subscribed renderer to mount.");
    }
    const mountedRenderer = renderer;

    const externalAction = mountedRenderer.root
      .findAllByProps({ "data-formless-astryx-workspace-external-action": "action:install" })
      .find((candidate) => typeof candidate.props.onClick === "function");
    await act(async () => {
      externalAction?.props.onClick();
    });

    expect(tracked.intents).toEqual([
      {
        actionId: "action:install",
        collectionId: "collection:tasks",
        controlId: "control:install",
        intent: { controlId: "control:install", invocationSource: "button" },
        screenId: workspaceReference.workspaceId,
        sectionId: taskSectionReference.sectionId,
        type: "workspaceExternalAction",
      },
    ]);

    tracked.resetReads();
    await act(async () => {
      tracked.host.publish(workspaceNodes({ taskResultLabel: "Updated tasks result" }));
    });

    expect(tracked.readCount(taskResultReference)).toBeGreaterThan(0);
    expect(tracked.readCount(companyResultReference)).toBe(0);
    expect(tracked.readCount(taskSectionReference)).toBe(0);
    expect(tracked.readCount(companySectionReference)).toBe(0);
    expect(tracked.readCount(workspaceReference)).toBe(0);

    tracked.resetReads();
    await act(async () => {
      tracked.host.publish(workspaceNodes({ taskSectionLabel: "Updated tasks section" }));
    });

    expect(tracked.readCount(taskSectionReference)).toBeGreaterThan(0);
    expect(tracked.readCount(companyResultReference)).toBe(0);
    expect(tracked.readCount(companySectionReference)).toBe(0);
    expect(tracked.readCount(workspaceReference)).toBe(0);

    tracked.resetReads();
    await act(async () => {
      tracked.host.publish(
        workspaceNodes({
          reverseSections: true,
          taskSectionLabel: "Updated tasks section",
        }),
      );
    });

    expect(tracked.readCount(workspaceReference)).toBeGreaterThan(0);
    const rendered = JSON.stringify(mountedRenderer.toJSON());
    expect(rendered.indexOf("section:companies")).toBeLessThan(rendered.indexOf("section:tasks"));

    await act(async () => {
      mountedRenderer.unmount();
    });
  });
});

function workspaceNodes({
  reverseSections = false,
  taskResultLabel = "Tasks result",
  taskSectionLabel = "Tasks section",
}: {
  reverseSections?: boolean;
  taskResultLabel?: string;
  taskSectionLabel?: string;
} = {}): FormlessUiContractHostNodeSet {
  const sectionReferences = reverseSections
    ? [companySectionReference, taskSectionReference]
    : [taskSectionReference, companySectionReference];

  return [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Tasks workspace",
        id: workspaceReference.workspaceId,
        kind: "workspaceManifest",
        label: "Tasks",
        sections: sectionReferences,
      },
    },
    {
      reference: taskSectionReference,
      snapshot: taskSection(taskSectionLabel),
    },
    {
      reference: taskResultReference,
      snapshot: listResult(taskResultReference.resultId, taskResultLabel),
    },
    {
      reference: contextResultReference,
      snapshot: recordResult(contextResultReference.resultId),
    },
    {
      reference: companySectionReference,
      snapshot: companySection(),
    },
    {
      reference: companyResultReference,
      snapshot: listResult(companyResultReference.resultId, "Companies result"),
    },
  ];
}

function taskSection(label: string): FormlessUiWorkspaceSectionShellContract {
  return {
    accessibilityLabel: label,
    actions: [
      {
        action: {
          accessibilityLabel: "Install app",
          id: "control:install",
          intent: "primary",
          invocationSource: "button",
          invoke: { controlId: "control:install", invocationSource: "button" },
          kind: "actionTrigger",
          label: "Install app",
        },
        id: "action:install",
        kind: "workspaceExternalAction",
      },
    ],
    collection: {
      accessibilityLabel: "Tasks collection",
      availability: { state: "ready" },
      id: "collection:tasks",
      kind: "workspaceCollection",
      label: "Tasks",
      presentation: {
        actions: emptyActions("collection:tasks"),
        context: {
          accessibilityLabel: "Project context",
          availability: { state: "ready" },
          id: "context:projects",
          kind: "workspaceContext",
          label: "Project",
          options: [],
          presentation: "singletonDetail",
        },
        contextDetail: contextResultReference,
        kind: "ordinary",
        result: taskResultReference,
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id: taskSectionReference.sectionId,
    kind: "workspaceSectionShell",
    label,
  };
}

function companySection(): FormlessUiWorkspaceSectionShellContract {
  return {
    accessibilityLabel: "Companies section",
    actions: [],
    collection: {
      accessibilityLabel: "Companies collection",
      availability: { state: "ready" },
      id: "collection:companies",
      kind: "workspaceCollection",
      label: "Companies",
      presentation: {
        actions: emptyActions("collection:companies"),
        kind: "ordinary",
        result: companyResultReference,
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id: companySectionReference.sectionId,
    kind: "workspaceSectionShell",
    label: "Companies section",
  };
}

function emptyActions(id: string) {
  return {
    id: `${id}:actions`,
    kind: "workspaceCollectionActions" as const,
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: `${id} secondary actions`,
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

function recordResult(id: string): FormlessUiRecordResultContract {
  return {
    accessibilityLabel: "Selected task context",
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More context actions",
    },
    availability: { state: "ready" },
    density: "compact",
    editing: { enabled: true },
    fields: [],
    id,
    kind: "recordResult",
    warnings: [],
  };
}

function completeWorkspace(): FormlessUiWorkspaceContract {
  const task = taskSection("Tasks section");
  const company = companySection();

  if (
    task.collection.presentation.kind !== "ordinary" ||
    company.collection.presentation.kind !== "ordinary"
  ) {
    throw new Error("Expected ordinary workspace test sections.");
  }

  return {
    accessibilityLabel: "Tasks workspace",
    id: workspaceReference.workspaceId,
    kind: "workspace",
    label: "Tasks",
    sections: [
      {
        ...task,
        collection: {
          ...task.collection,
          presentation: {
            actions: task.collection.presentation.actions,
            context: task.collection.presentation.context,
            contextDetail: recordResult(contextResultReference.resultId),
            kind: "ordinary",
            queryNavigation: task.collection.presentation.queryNavigation,
            result: listResult(taskResultReference.resultId, "Tasks result"),
            summaries: task.collection.presentation.summaries,
          },
        },
        kind: "workspaceSection",
      },
      {
        ...company,
        collection: {
          ...company.collection,
          presentation: {
            actions: company.collection.presentation.actions,
            context: company.collection.presentation.context,
            kind: "ordinary",
            queryNavigation: company.collection.presentation.queryNavigation,
            result: listResult(companyResultReference.resultId, "Companies result"),
            summaries: company.collection.presentation.summaries,
          },
        },
        kind: "workspaceSection",
      },
    ],
  };
}

function createTrackedHost(nodes: FormlessUiContractHostNodeSet) {
  const intents: FormlessUiWorkspaceIntent[] = [];
  const memoryHost = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      intents.push(intent);
    },
    nodes,
  });
  const reads = new Map<string, number>();
  const host = {
    ...memoryHost,
    read(reference: FormlessUiContractReference) {
      const key = formlessUiContractReferenceKey(reference);
      reads.set(key, (reads.get(key) ?? 0) + 1);
      return memoryHost.read(reference);
    },
  } as FormlessUiMutableContractHost;

  return {
    host,
    intents,
    readCount(reference: FormlessUiContractReference) {
      return reads.get(formlessUiContractReferenceKey(reference)) ?? 0;
    },
    resetReads() {
      reads.clear();
    },
  };
}
