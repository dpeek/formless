import { readFile } from "node:fs/promises";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  AstryxApplicationAssembly,
  type AstryxApplicationPresentation,
} from "@dpeek/formless-astryx/application/assembly";
import { AstryxApplicationProvider } from "@dpeek/formless-astryx/application/provider";
import {
  createFormlessUiMemoryContractHost,
  type FormlessUiContractHost,
  type FormlessUiContractHostNodeSet,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import {
  createFormlessAccessFixtures,
  type FormlessAccessFixtureId,
} from "./components/access.fixtures.ts";
import { projectFormlessAccessFixturePublication } from "./components/access.tsx";
import { createFormlessApplicationShellFixtures } from "./components/application-shell.fixtures.ts";
import { projectFormlessApplicationShellFixturePublication } from "./components/application-shell.tsx";
import { createFormlessApplicationSystemStateFixtures } from "./components/application-system-state.fixtures.ts";
import {
  createFormlessAuthFixtures,
  type FormlessAuthFixture,
} from "./components/auth.fixtures.ts";
import { createFormlessAuthFixtureHost } from "./components/auth.tsx";
import {
  createFormlessGeneratedWorkspaceFixtures,
  type FormlessGeneratedWorkspaceFixtureId,
} from "./components/generated-workspace.fixtures.ts";
import { projectGeneratedWorkspaceFixturePublication } from "./components/generated-workspace.tsx";
import {
  createFormlessInstanceManagementFixtures,
  type FormlessInstanceManagementFixtureId,
} from "./components/instance-management.fixtures.ts";
import { projectFormlessInstanceManagementFixturePublication } from "./components/instance-management.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

vi.mock("@astryxdesign/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@astryxdesign/core")>()),
  Theme: ({ children, mode }: { children: ReactNode; mode: string }) =>
    createElement("div", { "data-astryx-application-theme": mode }, children),
}));

vi.mock("@astryxdesign/core/Toast", () => ({
  ToastViewport: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-astryx-toast-viewport": true }, children),
  useToast: () => () => undefined,
}));

const publicRouteIds = [
  "installed-site-public",
  "published-site",
  "site-authoring-public",
  "source-site-preview",
] as const;

type ApplicationMatrixSurface =
  | "accessManagement"
  | "accountAuth"
  | "applicationShell"
  | "applicationSystemState"
  | "collaboratorInvitationAuth"
  | "generatedWorkspace"
  | "instanceManagement"
  | "ownerAuth";

type RuntimeProfile = "app" | "dev" | "instance" | "publishedSite" | "siteAuthoring";

const allProfiles = [
  "app",
  "dev",
  "instance",
  "publishedSite",
  "siteAuthoring",
] as const satisfies readonly RuntimeProfile[];

const applicationRouteMatrix = [
  route("collaborator-invitation", allProfiles, ["collaboratorInvitationAuth"]),
  route("account-auth", allProfiles, ["accountAuth"]),
  route("owner-auth", ["dev", "instance", "publishedSite"], ["ownerAuth"]),
  route("instance-management", ["dev", "instance"], ["applicationShell", "instanceManagement"]),
  route("access-management", ["dev", "instance"], ["applicationShell", "accessManagement"]),
  route("local-session", ["dev", "instance"], ["applicationSystemState"]),
  route("source-app-admin", ["dev"], ["applicationShell", "generatedWorkspace"]),
  route("installed-app-admin", ["dev", "instance"], ["applicationShell", "generatedWorkspace"]),
  route("app-profile", ["app"], ["applicationShell", "generatedWorkspace"]),
  route("app-profile-registry", ["app"], ["applicationSystemState"]),
  route("site-authoring-admin", ["siteAuthoring"], ["applicationShell", "generatedWorkspace"]),
  route("application-missing", ["app", "dev"], ["applicationShell", "applicationSystemState"]),
  route("instance-missing", ["instance"], ["applicationSystemState"]),
  route("route-loading", allProfiles, ["applicationSystemState"]),
  route(
    "owner-check",
    ["app", "dev", "instance", "siteAuthoring"],
    ["applicationShell", "applicationSystemState"],
  ),
] as const;

describe("Astryx application assembly", () => {
  it("renders every application-owned route/profile family through one memory-host assembly", async () => {
    const renderByRouteId = applicationRouteRenderers();
    const conformanceSource = await readFile(
      new URL("../../../src/app/application-presentation-conformance.ts", import.meta.url),
      "utf8",
    );

    expect([...renderByRouteId.keys()].sort()).toEqual(
      applicationRouteMatrix.map((row) => row.id).sort(),
    );
    for (const routeId of [...renderByRouteId.keys(), ...publicRouteIds]) {
      expect(conformanceSource).toMatch(new RegExp(`route\\(\\s*"${routeId}"`));
    }

    for (const row of applicationRouteMatrix) {
      for (const profile of row.profiles) {
        const render = requiredMapValue(renderByRouteId, row.id)();
        const html = renderApplication(render);

        expect(html, `${row.id}:${profile}`).not.toBe("");
        for (const surface of row.surfaces) {
          expect(html, `${row.id}:${profile}:${surface}`).toContain(markerForSurface(surface));
        }
      }
    }
  });

  it("exports an application-only root provider over the renderer-neutral theme contract", () => {
    const html = renderToStaticMarkup(
      <AstryxApplicationProvider
        theme={{
          activeMode: "dark",
          id: "theme:application",
          kind: "documentTheme",
          policy: { kind: "fixed", mode: "dark" },
        }}
      >
        <main>Application</main>
      </AstryxApplicationProvider>,
    );

    expect(html).toContain('data-astryx-application-theme="dark"');
    expect(html).toContain('data-astryx-toast-viewport="true"');
    expect(html).toContain("<main>Application</main>");
  });

  it("composes the Astryx assembly from stable root references and a separate React route child", () => {
    const systemState = requiredFixture(createFormlessApplicationSystemStateFixtures(), "missing");
    const shellFixture = requiredFixture(createFormlessApplicationShellFixtures(), "dev-workbench");
    if (!shellFixture.shell) {
      throw new Error("Missing dev-workbench shell fixture.");
    }
    const shellPublication = projectFormlessApplicationShellFixturePublication(
      shellFixture.shell,
      shellFixture.documentTheme,
    );
    if (!shellPublication.shellReference) {
      throw new Error("Missing dev-workbench shell reference.");
    }
    const nodes = [
      ...shellPublication.nodes,
      { reference: systemState.reference, snapshot: systemState.snapshot },
    ] as const;
    const host = createFormlessUiMemoryContractHost({ nodes, serverNodes: nodes });

    const shellHtml = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <AstryxApplicationAssembly
          presentation={{
            children: <span data-route-child="selected">Route child</span>,
            kind: "shell",
            shellReference: shellPublication.shellReference,
          }}
        />
      </FormlessUiContractHostProvider>,
    );
    const stateHtml = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <AstryxApplicationAssembly
          presentation={{
            kind: "applicationSystemState",
            systemStateReference: systemState.reference,
          }}
        />
      </FormlessUiContractHostProvider>,
    );

    expect(shellHtml).toContain('data-route-child="selected"');
    expect(shellHtml).toContain("Route child");
    expect(stateHtml).toContain(systemState.snapshot.heading);
    expect(stateHtml).toContain(systemState.reference.stateId);
  });

  it("uses the cached server snapshot as Astryx hydration input", () => {
    const systemState = requiredFixture(createFormlessApplicationSystemStateFixtures(), "loading");
    const serverNodes = [{ reference: systemState.reference, snapshot: systemState.snapshot }];
    const host = createFormlessUiMemoryContractHost({ nodes: serverNodes, serverNodes });
    const serverSnapshot = host.getServerSnapshot(systemState.reference);

    host.publish([
      {
        reference: systemState.reference,
        snapshot: { ...systemState.snapshot, heading: "Client ready", message: "Client ready." },
      },
    ]);

    expect(host.read(systemState.reference)?.heading).toBe("Client ready");
    expect(host.getServerSnapshot(systemState.reference)).toBe(serverSnapshot);

    const html = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <AstryxApplicationAssembly
          presentation={{
            kind: "applicationSystemState",
            systemStateReference: systemState.reference,
          }}
        />
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain(systemState.snapshot.heading);
    expect(html).not.toContain("Client ready");
  });
});

type ApplicationRouteRender = {
  host: FormlessUiContractHost;
  presentation: AstryxApplicationPresentation;
};

function applicationRouteRenderers() {
  return new Map<string, () => ApplicationRouteRender>([
    ["collaborator-invitation", () => authRoute("collaborator-invitation-acceptance", "eligible")],
    ["account-auth", () => authRoute("account-gate", "loading")],
    ["owner-auth", () => authRoute("owner-sign-in", "ready")],
    ["instance-management", () => managementRoute("installed")],
    ["access-management", () => accessRoute("populated-owner")],
    ["local-session", () => systemStateRoute("failure")],
    ["source-app-admin", () => workspaceRoute("dev-workbench", "tasks")],
    ["installed-app-admin", () => workspaceRoute("product-instance", "multi-section")],
    ["app-profile", () => workspaceRoute("app-only", "list-detail")],
    ["app-profile-registry", () => systemStateRoute("unavailable")],
    ["site-authoring-admin", () => workspaceRoute("site-authoring", "site-tree")],
    ["application-missing", () => shelledSystemStateRoute("dev-workbench", "missing")],
    ["instance-missing", () => systemStateRoute("missing")],
    ["route-loading", () => systemStateRoute("loading")],
    ["owner-check", () => shelledSystemStateRoute("product-instance", "blocked")],
  ]);
}

function authRoute(
  surfaceKind: FormlessAuthFixture["surface"]["surfaceKind"],
  state: FormlessAuthFixture["surface"]["state"],
): ApplicationRouteRender {
  const fixtures = createFormlessAuthFixtures();
  const fixture = fixtures.find(
    (candidate) =>
      candidate.surface.surfaceKind === surfaceKind && candidate.surface.state === state,
  );
  if (!fixture) {
    throw new Error(`Missing ${surfaceKind}:${state} auth fixture.`);
  }
  const fixtureHost = createFormlessAuthFixtureHost(fixtures);

  return {
    host: fixtureHost.host,
    presentation: { kind: "auth", reference: fixtureHost.referenceFor(fixture.id) },
  };
}

function managementRoute(id: FormlessInstanceManagementFixtureId): ApplicationRouteRender {
  const fixture = requiredFixture(createFormlessInstanceManagementFixtures(), id);
  const publication = projectFormlessInstanceManagementFixturePublication(fixture.state);

  return shelledRoute("product-instance", publication.nodes, {
    kind: "management",
    managementReference: publication.managementReference,
  });
}

function accessRoute(id: FormlessAccessFixtureId): ApplicationRouteRender {
  const fixture = requiredFixture(createFormlessAccessFixtures(), id);
  const publication = projectFormlessAccessFixturePublication(fixture.state);

  return shelledRoute("product-instance", publication.nodes, {
    accessReference: publication.accessReference,
    kind: "access",
  });
}

function workspaceRoute(
  shellFixtureId: "app-only" | "dev-workbench" | "product-instance" | "site-authoring",
  workspaceFixtureId: FormlessGeneratedWorkspaceFixtureId,
): ApplicationRouteRender {
  const fixture = requiredFixture(createFormlessGeneratedWorkspaceFixtures(), workspaceFixtureId);
  const publication = projectGeneratedWorkspaceFixturePublication(fixture.workspace);

  return shelledRoute(shellFixtureId, publication.nodes, {
    kind: "workspace",
    reference: publication.workspaceReference,
  });
}

function shelledSystemStateRoute(
  shellFixtureId: "dev-workbench" | "product-instance",
  state: "blocked" | "missing",
): ApplicationRouteRender {
  const fixture = requiredFixture(createFormlessApplicationSystemStateFixtures(), state);
  return shelledRoute(
    shellFixtureId,
    [{ reference: fixture.reference, snapshot: fixture.snapshot }],
    {
      kind: "applicationSystemState",
      systemStateReference: fixture.reference,
    },
  );
}

function systemStateRoute(
  state: "failure" | "loading" | "missing" | "unavailable",
): ApplicationRouteRender {
  const fixture = requiredFixture(createFormlessApplicationSystemStateFixtures(), state);
  const nodes = [{ reference: fixture.reference, snapshot: fixture.snapshot }] as const;

  return {
    host: createFormlessUiMemoryContractHost({ nodes, serverNodes: nodes }),
    presentation: {
      kind: "applicationSystemState",
      systemStateReference: fixture.reference,
    },
  };
}

function shelledRoute(
  shellFixtureId: "app-only" | "dev-workbench" | "product-instance" | "site-authoring",
  childNodes: FormlessUiContractHostNodeSet,
  childPresentation: AstryxApplicationPresentation,
): ApplicationRouteRender {
  const shellFixture = requiredFixture(createFormlessApplicationShellFixtures(), shellFixtureId);
  if (!shellFixture.shell) {
    throw new Error(`Missing ${shellFixtureId} shell fixture.`);
  }
  const shellPublication = projectFormlessApplicationShellFixturePublication(
    shellFixture.shell,
    shellFixture.documentTheme,
  );
  if (!shellPublication.shellReference) {
    throw new Error(`Missing ${shellFixtureId} shell reference.`);
  }
  const nodes = [...shellPublication.nodes, ...childNodes];

  return {
    host: createFormlessUiMemoryContractHost({ nodes, serverNodes: nodes }),
    presentation: {
      children: <AstryxApplicationAssembly presentation={childPresentation} />,
      kind: "shell",
      shellReference: shellPublication.shellReference,
      themeReference: shellPublication.themeReference ?? undefined,
    },
  };
}

function renderApplication({ host, presentation }: ApplicationRouteRender) {
  return renderToStaticMarkup(
    <FormlessUiContractHostProvider host={host}>
      <AstryxApplicationAssembly presentation={presentation} />
    </FormlessUiContractHostProvider>,
  );
}

function markerForSurface(surface: ApplicationMatrixSurface) {
  switch (surface) {
    case "accessManagement":
      return "data-formless-astryx-access=";
    case "accountAuth":
    case "collaboratorInvitationAuth":
    case "ownerAuth":
      return "data-formless-astryx-auth-surface=";
    case "applicationShell":
      return "formless-astryx-application-shell:";
    case "applicationSystemState":
      return "data-formless-astryx-application-system-state=";
    case "generatedWorkspace":
      return "data-formless-astryx-workspace=";
    case "instanceManagement":
      return "data-formless-astryx-management=";
  }
}

function route(
  id: string,
  profiles: readonly RuntimeProfile[],
  surfaces: readonly ApplicationMatrixSurface[],
) {
  return { id, profiles, surfaces };
}

function requiredFixture<Fixture extends { id: string }>(fixtures: readonly Fixture[], id: string) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} fixture.`);
  }
  return fixture;
}

function requiredMapValue<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key): Value {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing ${String(key)} route renderer.`);
  }
  return value;
}
