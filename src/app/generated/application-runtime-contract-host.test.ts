import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiContractIntent,
  FormlessUiContractIntentHandler,
} from "@dpeek/formless-astryx/contract";
import {
  formlessUiShellManifestReference,
  formlessUiWorkspaceManifestReference,
  isFormlessUiShellIntent,
  isFormlessUiWorkspaceIntent,
} from "@dpeek/formless-astryx/contract-host";
import {
  createApplicationRuntimePublicationCoordinator,
  type ApplicationRuntimeContractPublication,
} from "./application-runtime-contract-host.tsx";

describe("application runtime contract publication coordinator", () => {
  it("composes shell and route-child nodes on one stable host with scoped identity reuse", () => {
    const shell = shellPublication("Formless");
    const workspace = workspacePublication("Apps");
    const coordinator = createApplicationRuntimePublicationCoordinator([["shell", shell]]);
    const host = coordinator.host;
    const shellReference = formlessUiShellManifestReference("application-shell");
    const workspaceReference = formlessUiWorkspaceManifestReference("workspace:apps");
    const initialShell = required(host.read(shellReference));
    const notifications = { shell: 0, workspace: 0 };

    host.subscribe(shellReference, () => notifications.shell++);
    host.subscribe(workspaceReference, () => notifications.workspace++);

    coordinator.publish("route-child", workspace);

    expect(coordinator.host).toBe(host);
    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(workspaceReference)).toMatchObject({ id: "workspace:apps", label: "Apps" });
    expect(notifications).toEqual({ shell: 0, workspace: 1 });

    const initialWorkspace = required(host.read(workspaceReference));
    coordinator.publish("route-child", workspacePublication("Installed Apps"));

    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(workspaceReference)).not.toBe(initialWorkspace);
    expect(host.read(workspaceReference)).toMatchObject({ label: "Installed Apps" });
    expect(notifications).toEqual({ shell: 0, workspace: 2 });

    coordinator.remove("route-child");

    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(workspaceReference)).toBeUndefined();
    expect(notifications).toEqual({ shell: 0, workspace: 3 });
  });

  it("dispatches through the latest matching handler and removes it with its contributor", async () => {
    const calls: string[] = [];
    const coordinator = createApplicationRuntimePublicationCoordinator([
      [
        "shell",
        shellPublication("Formless", () => {
          calls.push("shell");
        }),
      ],
      [
        "workspace",
        workspacePublication("Apps", () => {
          calls.push("workspace:initial");
        }),
      ],
    ]);
    const workspaceIntent = {
      collectionId: "workspace:apps:section:apps:collection:apps",
      queryId: "all",
      screenId: "workspace:apps",
      sectionId: "workspace:apps:section:apps",
      type: "workspaceQuerySelection",
    } as const;
    const shellIntent = {
      destinationId: "apps",
      recordId: "apps",
      sectionId: "instance",
      shellId: "application-shell",
      type: "shellRootRecordSelection",
    } as const;

    await coordinator.host.dispatch(workspaceIntent);
    coordinator.publish(
      "workspace",
      workspacePublication("Apps", () => {
        calls.push("workspace:current");
      }),
    );
    await coordinator.host.dispatch(workspaceIntent);
    await coordinator.host.dispatch(shellIntent);

    expect(calls).toEqual(["workspace:initial", "workspace:current", "shell"]);

    coordinator.remove("workspace");
    expect(() => coordinator.host.dispatch(workspaceIntent)).toThrow(
      "Application runtime has no current handler for workspaceQuerySelection.",
    );
  });

  it("rejects an invalid combined graph without changing the current publication", () => {
    const coordinator = createApplicationRuntimePublicationCoordinator([
      ["shell", shellPublication("Formless")],
      ["workspace", workspacePublication("Apps")],
    ]);
    const workspaceReference = formlessUiWorkspaceManifestReference("workspace:apps");
    const currentWorkspace = coordinator.host.read(workspaceReference);

    expect(() => coordinator.publish("duplicate", workspacePublication("Duplicate Apps"))).toThrow(
      "Duplicate Formless UI contract reference",
    );
    expect(coordinator.host.read(workspaceReference)).toBe(currentWorkspace);
  });
});

function shellPublication(
  title: string,
  dispatch: FormlessUiContractIntentHandler = () => undefined,
): ApplicationRuntimeContractPublication {
  const reference = formlessUiShellManifestReference("application-shell");

  return {
    intentHandlers: [
      {
        dispatch,
        matches: (intent: FormlessUiContractIntent) =>
          isFormlessUiShellIntent(intent) && intent.shellId === reference.shellId,
      },
    ],
    nodes: [
      {
        reference,
        snapshot: {
          accessibilityLabel: "Application",
          activeDestination: null,
          id: reference.shellId,
          kind: "shellManifest",
          navigationSections: [],
          scope: "multiApp",
          title,
        },
      },
    ],
  };
}

function workspacePublication(
  label: string,
  dispatch: FormlessUiContractIntentHandler = () => undefined,
): ApplicationRuntimeContractPublication {
  const reference = formlessUiWorkspaceManifestReference("workspace:apps");

  return {
    intentHandlers: [
      {
        dispatch,
        matches: (intent: FormlessUiContractIntent) =>
          isFormlessUiWorkspaceIntent(intent) && intent.screenId === reference.workspaceId,
      },
    ],
    nodes: [
      {
        reference,
        snapshot: {
          accessibilityLabel: "Apps workspace",
          actions: [],
          id: reference.workspaceId,
          kind: "workspaceManifest",
          label,
          sections: [],
        },
      },
    ],
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
