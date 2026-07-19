import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { FormlessUiAuthSurfaceContract } from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiAccessManifestReference,
  formlessUiApplicationSystemStateReference,
  formlessUiAuthSurfaceReference,
  formlessUiDocumentThemeReference,
  formlessUiManagementManifestReference,
  formlessUiShellManifestReference,
  formlessUiWorkspaceManifestReference,
  type FormlessUiContractHost,
  type FormlessUiContractHostNodeSet,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import {
  productionRoutePresentationMatrix,
  type ApplicationPresentationSurface,
} from "./application-presentation-conformance.ts";
import type {
  ApplicationPresentation as ApplicationPresentationContract,
  ApplicationPresentationAssembly,
} from "./application-presentation-contract.ts";
import { ApplicationPresentation } from "./application-presentation.tsx";
import { projectApplicationSystemState } from "./routes/application-system-state-projection.ts";

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

const applicationRouteMatrix = productionRoutePresentationMatrix.filter(
  (row) =>
    !row.surfaces.includes("publicSitePage") && !row.surfaces.includes("publicSiteSystemState"),
);
const publicRouteMatrix = productionRoutePresentationMatrix.filter((row) =>
  row.surfaces.includes("publicSitePage"),
);
const productionApplicationAssembly = {
  id: "astryx",
  Renderer: ApplicationPresentation,
} as const satisfies ApplicationPresentationAssembly;

describe("production Astryx application presentation conformance", () => {
  it("exercises the selected assembly over the complete route/profile matrix and stable hosts", () => {
    const fixtures = applicationRouteFixtures();

    expect([...fixtures.keys()].sort()).toEqual(applicationRouteMatrix.map(({ id }) => id).sort());
    expect(publicRouteMatrix.map(({ id }) => id).sort()).toEqual([
      "installed-site-public",
      "published-site",
      "site-authoring-public",
      "source-site-preview",
    ]);

    for (const row of applicationRouteMatrix) {
      for (const profile of row.profiles) {
        const route = requiredMapValue(fixtures, row.id)();
        const html = renderRoute(route, productionApplicationAssembly);

        expect(html, `astryx:${row.id}:${profile}`).not.toBe("");
        expect(html, `astryx:${row.id}:${profile}:accessibility`).toContain("aria-");
        expect(html, `astryx:${row.id}:${profile}:secret-exclusion`).not.toMatch(
          /raw-invite-token|private-session-secret|admin-bearer-secret/,
        );
        for (const surface of row.surfaces) {
          expect(html, `astryx:${row.id}:${profile}:${surface}`).toContain(
            markerForSurface(surface),
          );
        }
      }
    }
  });
});

type CutoverRoute = {
  childPresentation?: ApplicationPresentationContract;
  host: FormlessUiContractHost;
  nodes: FormlessUiContractHostNodeSet;
  presentation: ApplicationPresentationContract;
};

function applicationRouteFixtures() {
  return new Map<string, () => CutoverRoute>([
    [
      "collaborator-invitation",
      () => authRoute("collaborator-invitation-acceptance", "Invitation acceptance"),
    ],
    ["account-auth", () => authRoute("account-gate", "Account")],
    ["owner-auth", () => authRoute("owner-sign-in", "Owner sign in")],
    ["instance-management", () => shelledRoute(managementRoute())],
    ["access-management", () => shelledRoute(accessRoute())],
    ["local-session", () => systemStateRoute("failure")],
    ["source-app-admin", () => shelledRoute(workspaceRoute("source-app-admin"))],
    ["installed-app-admin", () => shelledRoute(workspaceRoute("installed-app-admin"))],
    ["app-profile", () => shelledRoute(workspaceRoute("app-profile"))],
    ["app-profile-registry", () => systemStateRoute("unavailable")],
    ["site-authoring-admin", () => shelledRoute(workspaceRoute("site-authoring-admin"))],
    ["application-missing", () => shelledRoute(systemStateRoute("missing"))],
    ["instance-missing", () => systemStateRoute("missing")],
    ["route-loading", () => systemStateRoute("loading")],
    ["owner-check", () => shelledRoute(systemStateRoute("blocked"))],
  ]);
}

function authRoute(
  surfaceKind: FormlessUiAuthSurfaceContract["surfaceKind"],
  title: string,
): CutoverRoute {
  const snapshot = authSurface(surfaceKind, title);
  const reference = formlessUiAuthSurfaceReference({
    surfaceId: snapshot.id,
    surfaceKind: snapshot.surfaceKind,
  });
  const nodes = [{ reference, snapshot }] satisfies FormlessUiContractHostNodeSet;

  return route(nodes, { kind: "auth", reference });
}

function authSurface(
  surfaceKind: FormlessUiAuthSurfaceContract["surfaceKind"],
  title: string,
): FormlessUiAuthSurfaceContract {
  const base = {
    actions: [],
    facts: [],
    fields: [],
    frame: {
      accessibilityLabel: title,
      brand: { kind: "authBrand" as const, label: "Formless" },
      heading: { kind: "authHeading" as const, title },
      kind: "authFrame" as const,
    },
    id: `auth:${surfaceKind}:cutover`,
    kind: "authSurface" as const,
    message: {
      id: `auth:${surfaceKind}:loading`,
      kind: "authMessage" as const,
      severity: "info" as const,
      title: `Loading ${title}`,
    },
    pending: true,
    policies: [],
    state: "loading" as const,
  };

  switch (surfaceKind) {
    case "account-gate":
      return { ...base, surfaceKind };
    case "collaborator-invitation-acceptance":
      return { ...base, surfaceKind };
    case "owner-setup":
      return { ...base, surfaceKind };
    case "owner-sign-in":
      return { ...base, surfaceKind };
    case "signup":
      return { ...base, surfaceKind };
  }
}

function managementRoute(): CutoverRoute {
  const reference = formlessUiManagementManifestReference("management:cutover");
  const nodes = [
    {
      reference,
      snapshot: {
        accessibilityLabel: "Instance management",
        id: reference.managementId,
        kind: "managementManifest",
        message: "Loading instance management",
        state: "loading",
        title: "Instance",
      },
    },
  ] satisfies FormlessUiContractHostNodeSet;

  return route(nodes, { kind: "management", managementReference: reference });
}

function accessRoute(): CutoverRoute {
  const reference = formlessUiAccessManifestReference("access:cutover");
  const nodes = [
    {
      reference,
      snapshot: {
        accessibilityLabel: "Instance access",
        id: reference.accessId,
        kind: "accessManifest",
        message: "Loading access",
        state: "loading",
        title: "Access",
      },
    },
  ] satisfies FormlessUiContractHostNodeSet;

  return route(nodes, { accessReference: reference, kind: "access" });
}

function workspaceRoute(id: string): CutoverRoute {
  const reference = formlessUiWorkspaceManifestReference(`workspace:${id}`);
  const nodes = [
    {
      reference,
      snapshot: {
        accessibilityLabel: `${id} workspace`,
        actions: [
          {
            accessibilityLabel: "Open workspace help",
            href: "/help",
            id: `${id}:help`,
            kind: "workspaceLinkAction",
            label: "Help",
            prominence: "secondary",
            target: "sameTab",
          },
        ],
        id: reference.workspaceId,
        kind: "workspaceManifest",
        label: id,
        sections: [],
      },
    },
  ] satisfies FormlessUiContractHostNodeSet;

  return route(nodes, { kind: "workspace", reference });
}

function systemStateRoute(
  state: "blocked" | "failure" | "loading" | "missing" | "unavailable",
): CutoverRoute {
  const reference = formlessUiApplicationSystemStateReference(`system-state:${state}:cutover`);
  const nodes = [
    {
      reference,
      snapshot: projectApplicationSystemState({
        heading: `${state} state`,
        id: reference.stateId,
        message: `Display-safe ${state} state.`,
        state,
      }),
    },
  ] satisfies FormlessUiContractHostNodeSet;

  return route(nodes, { kind: "applicationSystemState", systemStateReference: reference });
}

function shelledRoute(child: CutoverRoute): CutoverRoute {
  const shellReference = formlessUiShellManifestReference("shell:cutover");
  const themeReference = formlessUiDocumentThemeReference("theme:cutover");
  const nodes = [
    {
      reference: shellReference,
      snapshot: {
        accessibilityLabel: "Formless application",
        activeDestination: null,
        id: shellReference.shellId,
        kind: "shellManifest",
        navigationSections: [],
        scope: "multiApp",
        title: "Formless",
      },
    },
    {
      reference: themeReference,
      snapshot: {
        activeMode: "dark",
        id: themeReference.themeId,
        kind: "documentTheme",
        policy: { kind: "fixed", mode: "dark" },
      },
    },
    ...child.nodes,
  ] satisfies FormlessUiContractHostNodeSet;

  return {
    childPresentation: child.presentation,
    host: createFormlessUiMemoryContractHost({ nodes, serverNodes: nodes }),
    nodes,
    presentation: {
      children: null,
      kind: "shell",
      shellReference,
      themeReference,
    },
  };
}

function route(
  nodes: FormlessUiContractHostNodeSet,
  presentation: ApplicationPresentationContract,
) {
  return {
    host: createFormlessUiMemoryContractHost({ nodes, serverNodes: nodes }),
    nodes,
    presentation,
  } satisfies CutoverRoute;
}

function renderRoute(route: CutoverRoute, assembly: ApplicationPresentationAssembly) {
  const Renderer = assembly.Renderer;
  const presentation =
    route.presentation.kind === "shell" && route.childPresentation
      ? {
          ...route.presentation,
          children: <Renderer presentation={route.childPresentation} />,
        }
      : route.presentation;

  return renderToStaticMarkup(
    <FormlessUiContractHostProvider host={route.host}>
      <Renderer presentation={presentation} />
    </FormlessUiContractHostProvider>,
  );
}

function markerForSurface(surface: ApplicationPresentationSurface) {
  const marker = astryxSurfaceMarkers[surface as keyof typeof astryxSurfaceMarkers];

  if (!marker) {
    throw new Error(`Unexpected Astryx matrix surface ${surface}.`);
  }

  return marker;
}

const astryxSurfaceMarkers = {
  accessManagement: "data-formless-astryx-access=",
  accountAuth: "data-formless-astryx-auth-surface=",
  applicationShell: "formless-astryx-application-shell:",
  applicationSystemState: "data-formless-astryx-application-system-state=",
  collaboratorInvitationAuth: "data-formless-astryx-auth-surface=",
  generatedWorkspace: "data-formless-astryx-workspace=",
  instanceManagement: "data-formless-astryx-management=",
  ownerAuth: "data-formless-astryx-auth-surface=",
} as const;

function requiredMapValue<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key): Value {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing ${String(key)} cutover fixture.`);
  }
  return value;
}
