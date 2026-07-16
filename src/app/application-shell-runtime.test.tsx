import { beforeEach, describe, expect, it } from "vite-plus/test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import type { FormlessUiShellNavigationSectionReference } from "@dpeek/formless-astryx/contract";
import type { FormlessUiContractHost } from "@dpeek/formless-astryx/contract-host";
import { formlessUiShellManifestReference } from "@dpeek/formless-astryx/contract-host";
import { useFormlessUiContractHost } from "@dpeek/formless-astryx/contract-host/react";
import type { StoredRecord } from "@dpeek/formless-storage";
import { applyBootstrapResponse, resetClientStore } from "../client/store.ts";
import { resetSyncStatus } from "../client/sync-status.ts";
import type { HomeScreenModel } from "../client/views.ts";
import { bootstrapResponse } from "../test/protocol-builders.ts";
import { taskSourceSchema } from "../test/schema-apps.ts";
import { ApplicationShellRuntimeBoundary } from "./application-shell-runtime.tsx";
import {
  selectHomeRouteSectionContextRecordId,
  useHomeRouteSelectionStore,
} from "./routes/home-selection.tsx";
import { createDevRuntimeProfile, findRuntimeWorldMountByRoute } from "./runtime-profile.ts";

beforeEach(() => {
  resetClientStore();
  resetSyncStatus();
});

describe("application shell runtime boundary", () => {
  it("keeps one host while resolving root selection and controlled create against current state", async () => {
    applyBootstrapResponse(
      bootstrapResponse(taskSourceSchema, [projectRecord("project-1"), projectRecord("project-2")]),
      "tasks",
    );
    const runtimeProfile = createDevRuntimeProfile();
    const routeWorld = required(findRuntimeWorldMountByRoute(runtimeProfile, "/tasks"));
    const screen = rootScreenFixture();
    let host: FormlessUiContractHost | undefined;
    let selectedRecordId: string | null = null;
    let createShouldFail = false;
    const submittedValues: unknown[] = [];
    const dependencies = {
      submitCreate: async (_surfaceId: string, values: unknown) => {
        submittedValues.push(values);
        if (createShouldFail) {
          throw new Error("alchemy-secret-create-error");
        }
        return { recordId: "project-created" };
      },
    };
    let renderer: ReactTestRenderer | undefined;

    function HostProbe({ children }: { children: ReactNode }) {
      host = useFormlessUiContractHost();
      return children;
    }

    function SelectionProbe() {
      const store = useHomeRouteSelectionStore();
      selectedRecordId = store
        ? selectHomeRouteSectionContextRecordId(
            store.selectionState,
            "projects-screen",
            "projects-section",
          )
        : null;
      return null;
    }

    await act(async () => {
      renderer = create(
        <ApplicationShellRuntimeBoundary
          activeScreenPath="/"
          currentPath="/tasks"
          dependencies={dependencies}
          ownerSession={{ authenticated: false, setupComplete: true }}
          renderer={HostProbe}
          routeWorld={routeWorld}
          runtimeProfile={runtimeProfile}
          screenModels={[screen]}
        >
          <SelectionProbe />
        </ApplicationShellRuntimeBoundary>,
      );
    });

    const initialHost = required(host);
    const rootSection = required(
      readSections(initialHost).find((section) => section.role === "rootRecords"),
    );
    const secondRoot = required(rootSection.destinations[1]);

    if (secondRoot.kind !== "shellRootRecordDestination") {
      throw new Error("Expected root record destination.");
    }

    await act(async () => {
      await initialHost.dispatch(secondRoot.selectionIntent);
    });
    expect(selectedRecordId).toBe("project-2");
    expect(host).toBe(initialHost);

    const createSection = required(
      readSections(initialHost).find((section) => section.createSurface !== undefined),
    );
    const createSurface = required(createSection.createSurface);

    await act(async () => {
      await initialHost.dispatch({
        intent: { open: true, surfaceId: createSurface.id, type: "createOpenChange" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    expect(required(readSection(initialHost, createSection.id).createSurface).dialog.open).toBe(
      true,
    );

    await act(async () => {
      await initialHost.dispatch({
        intent: {
          fieldName: "label",
          fieldValue: { kind: "input", value: "Created project" },
          type: "createDraftChange",
        },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    expect(
      required(readSection(initialHost, createSection.id).createSurface).dialog.form.fieldSet
        .fields[0],
    ).toMatchObject({ fieldName: "label", value: "Created project" });

    await act(async () => {
      await initialHost.dispatch({
        intent: { surfaceId: createSurface.id, type: "createSubmit" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    expect(submittedValues).toEqual([{ label: "Created project" }]);
    expect(selectedRecordId).toBe("project-created");
    expect(required(readSection(initialHost, createSection.id).createSurface).dialog.open).toBe(
      false,
    );
    expect(host).toBe(initialHost);

    createShouldFail = true;
    await act(async () => {
      await initialHost.dispatch({
        intent: { open: true, surfaceId: createSurface.id, type: "createOpenChange" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
      await initialHost.dispatch({
        intent: {
          fieldName: "label",
          fieldValue: { kind: "input", value: "Retry project" },
          type: "createDraftChange",
        },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    await act(async () => {
      await initialHost.dispatch({
        intent: { surfaceId: createSurface.id, type: "createSubmit" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    const failedCreate = required(readSection(initialHost, createSection.id).createSurface);
    expect(failedCreate.dialog.open).toBe(true);
    expect(failedCreate.dialog.form.errors).toEqual(["Create failed. Try again."]);
    expect(JSON.stringify(failedCreate)).not.toContain("alchemy-secret-create-error");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("executes reset and logout effects while projecting only display-safe status", async () => {
    applyBootstrapResponse(bootstrapResponse(taskSourceSchema, []), "tasks");
    const runtimeProfile = createDevRuntimeProfile();
    const routeWorld = required(findRuntimeWorldMountByRoute(runtimeProfile, "/tasks"));
    let host: FormlessUiContractHost | undefined;
    let resetCount = 0;
    let logoutCount = 0;
    const navigations: string[] = [];
    const dependencies = {
      logout: async () => {
        logoutCount += 1;
        return { authenticated: false as const, continueTo: "/formless/auth" as const };
      },
      navigate: (path: `/${string}`) => navigations.push(path),
      reset: async () => {
        resetCount += 1;
        return bootstrapResponse(taskSourceSchema, [], {
          schemaUpdatedAt: "2026-07-16T02:00:00.000Z",
        });
      },
    };
    let renderer: ReactTestRenderer | undefined;

    function HostProbe({ children }: { children: ReactNode }) {
      host = useFormlessUiContractHost();
      return children;
    }

    await act(async () => {
      renderer = create(
        <ApplicationShellRuntimeBoundary
          currentPath="/tasks"
          dependencies={dependencies}
          ownerSession={{
            authenticated: true,
            owner: {
              createdAt: "2026-07-16T00:00:00.000Z",
              email: "owner@example.com",
              id: "owner",
              name: "Owner",
            },
            session: { expiresAt: "private-session-value" },
            setupComplete: true,
          }}
          renderer={HostProbe}
          routeWorld={routeWorld}
          runtimeProfile={runtimeProfile}
        >
          <div>Workspace</div>
        </ApplicationShellRuntimeBoundary>,
      );
    });

    const currentHost = required(host);
    const settingsSection = required(
      readSections(currentHost).find((section) => section.settings?.reset !== undefined),
    );
    const reset = required(settingsSection.settings?.reset);

    await act(async () => {
      await currentHost.dispatch({
        controlId: reset.id,
        intent: { open: true, type: "resetOpenChange" },
        sectionId: settingsSection.id,
        shellId: "application-shell",
        type: "shellReset",
      });
    });
    expect(
      required(readSection(currentHost, settingsSection.id).settings?.reset).confirmation.open,
    ).toBe(true);

    await act(async () => {
      await currentHost.dispatch({
        controlId: reset.id,
        intent: { type: "resetConfirm" },
        sectionId: settingsSection.id,
        shellId: "application-shell",
        type: "shellReset",
      });
    });
    expect(resetCount).toBe(1);
    expect(required(readSection(currentHost, settingsSection.id).settings?.reset).status).toEqual({
      message: "Source schema and seed data reset at 2026-07-16T02:00:00.000Z.",
      state: "success",
    });

    const sessionSection = required(
      readSections(currentHost).find((section) => section.session?.state === "authenticated"),
    );
    const session = sessionSection.session;
    if (session?.state !== "authenticated") {
      throw new Error("Expected authenticated session.");
    }

    await act(async () => {
      await currentHost.dispatch({
        controlId: session.logout.id,
        sectionId: sessionSection.id,
        shellId: "application-shell",
        type: "shellLogout",
      });
    });
    expect(logoutCount).toBe(1);
    expect(navigations).toEqual(["/formless/auth"]);
    expect(
      readSections(currentHost).find((section) => section.role === "session")?.session,
    ).toMatchObject({ state: "anonymous" });
    expect(JSON.stringify(readSections(currentHost))).not.toContain("private-session-value");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

function readSections(host: FormlessUiContractHost) {
  const manifest = required(host.read(formlessUiShellManifestReference("application-shell")));

  return manifest.navigationSections.map((reference) => required(host.read(reference)));
}

function readSection(host: FormlessUiContractHost, sectionId: string) {
  const reference: FormlessUiShellNavigationSectionReference = {
    kind: "shellNavigationSectionReference",
    role: "shellNavigationSection",
    sectionId,
    shellId: "application-shell",
  };

  return required(host.read(reference));
}

function rootScreenFixture(): HomeScreenModel {
  const createOperation = {
    defaults: [],
    enabled: true,
    entity: {
      fields: { label: { required: true, type: "text" } },
      label: "Project",
    },
    entityName: "project",
    fields: [
      {
        editor: "text",
        field: { required: true, type: "text" },
        fieldName: "label",
      },
    ],
    label: "Create project",
    operation: {
      canonicalKey: "project.create",
      entityName: "project",
      label: "Create project",
      operation: {},
      operationName: "create",
    },
    operationName: "create",
    type: "create",
  };

  return {
    label: "Projects",
    layout: {
      sections: [
        {
          collection: {
            context: {
              entityName: "project",
              label: "Project",
              labelField: "label",
              navigation: {
                groups: [
                  {
                    createOperation,
                    label: "Projects",
                    query: { kind: "all" },
                    queryName: "all",
                  },
                ],
                placement: "sidebar",
              },
              query: { kind: "all" },
            },
          },
          id: "projects-section",
          label: "Projects",
          type: "collection",
          viewName: "projects",
        },
      ],
      type: "stack",
    },
    navigation: { primary: true },
    path: "/",
    screenName: "projects-screen",
    type: "workspace",
  } as unknown as HomeScreenModel;
}

function projectRecord(id: string): StoredRecord {
  return {
    createdAt: "2026-07-16T00:00:00.000Z",
    entity: "project",
    id,
    updatedAt: "2026-07-16T00:00:00.000Z",
    values: { label: id === "project-1" ? "Project one" : "Project two" },
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value;
}
