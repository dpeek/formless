import { readFile } from "node:fs/promises";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
  createFormlessUiMemoryContractHost,
  formlessUiApplicationSystemStateReference,
  formlessUiShellManifestReference,
  type FormlessUiContractHostNodeSet,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import { AstryxApplicationAssembly } from "@dpeek/formless-astryx/application/assembly";
import { ApplicationPresentation } from "./application-presentation.tsx";
import { projectApplicationSystemState } from "./routes/application-system-state-projection.ts";

const shellReference = formlessUiShellManifestReference("application-shell");
const systemStateReference = formlessUiApplicationSystemStateReference(
  "application-system-state:test",
);

describe("application presentation assembly selection", () => {
  it("selects the complete Astryx assembly at the production boundary", () => {
    expect(ApplicationPresentation).toBe(AstryxApplicationAssembly);
  });

  it("composes the selected Astryx assembly from stable references and a separate route child", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: presentationNodes("Not found") });
    const shellHtml = renderAssembly(
      host,
      <ApplicationPresentation
        presentation={{
          children: <span data-route-child="selected">Route child</span>,
          kind: "shell",
          shellReference,
        }}
      />,
    );
    const stateHtml = renderAssembly(
      host,
      <ApplicationPresentation
        presentation={{ kind: "applicationSystemState", systemStateReference }}
      />,
    );

    expect(shellHtml).toContain('data-route-child="selected"');
    expect(shellHtml).toContain("Route child");
    expect(stateHtml).toContain("Not found");
    expect(stateHtml).toContain(systemStateReference.stateId);
  });

  it("uses the cached server snapshot as Astryx hydration input", () => {
    const serverNodes = presentationNodes("Server loading");
    const host = createFormlessUiMemoryContractHost({ nodes: serverNodes, serverNodes });
    const serverSnapshot = host.getServerSnapshot(systemStateReference);

    host.publish(presentationNodes("Client ready"));

    expect(host.read(systemStateReference)?.heading).toBe("Client ready");
    expect(host.getServerSnapshot(systemStateReference)).toBe(serverSnapshot);
    expect(
      renderAssembly(
        host,
        <ApplicationPresentation
          presentation={{ kind: "applicationSystemState", systemStateReference }}
        />,
      ),
    ).toContain("Server loading");
  });

  it("keeps the runtime contract and selected Astryx assembly without a dual selector", async () => {
    const [contractSource, productionSource, astryxSource] = await Promise.all([
      readFile(new URL("./application-presentation-contract.ts", import.meta.url), "utf8"),
      readFile(new URL("./application-presentation.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../lib/astryx/src/application-assembly.tsx", import.meta.url), "utf8"),
    ]);

    expect(contractSource).toContain("export type ApplicationPresentationAssembly");
    expect(productionSource).toContain("AstryxApplicationAssembly as ApplicationPresentation");
    expect(productionSource).not.toMatch(/legacy|selected/i);
    expect(astryxSource).toContain("export function AstryxApplicationAssembly");
  });

  it("keeps renderer selection out of route, shell, workspace, and system-state runtimes", async () => {
    const runtimeSources = await Promise.all(
      [
        "./application-shell-runtime.tsx",
        "./generated/generated-workspace-runtime.tsx",
        "./routes/access.tsx",
        "./routes/application-system-state-runtime.tsx",
        "./routes/auth-account.tsx",
        "./routes/collaborator-invitation-acceptance.tsx",
        "./routes/instance-management-runtime.tsx",
        "./routes/owner-login.tsx",
        "./routes/owner-setup.tsx",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );

    for (const source of runtimeSources) {
      expect(source).toContain("application-presentation");
      expect(source).not.toMatch(/legacy-[^"']+-renderer/);
      expect(source).not.toContain("@dpeek/formless-astryx/application/assembly");
      expect(source).not.toMatch(/renderer:\s*Renderer|renderer\?:/);
    }
  });

  it("selects public Site browser and Worker built-ins explicitly through Astryx", async () => {
    const [applicationRoot, publicBrowserRoot, publicWorkerRoot] = await Promise.all([
      readFile(new URL("../app.tsx", import.meta.url), "utf8"),
      readFile(new URL("../public-site-main.tsx", import.meta.url), "utf8"),
      readFile(new URL("../worker/public-site-worker-runtime.ts", import.meta.url), "utf8"),
    ]);

    for (const source of [applicationRoot, publicBrowserRoot, publicWorkerRoot]) {
      expect(source).toContain("AstryxSitePageRenderer");
      expect(source).toContain("AstryxSitePublicSystemStateRenderer");
      expect(source).not.toMatch(/LegacySite(?:Page|PublicSystemState)Renderer/);
      expect(source).not.toContain("application-presentation");
    }
  });
});

function renderAssembly(
  host: ReturnType<typeof createFormlessUiMemoryContractHost>,
  children: ReactNode,
) {
  return renderToStaticMarkup(
    <FormlessUiContractHostProvider host={host}>{children}</FormlessUiContractHostProvider>,
  );
}

function presentationNodes(heading: string): FormlessUiContractHostNodeSet {
  return [
    {
      reference: shellReference,
      snapshot: {
        accessibilityLabel: "Application",
        activeDestination: null,
        id: shellReference.shellId,
        kind: "shellManifest",
        navigationSections: [],
        scope: "multiApp",
        title: "Formless",
      },
    },
    {
      reference: systemStateReference,
      snapshot: projectApplicationSystemState({
        heading,
        id: systemStateReference.stateId,
        message: `${heading} message`,
        state: heading === "Server loading" ? "loading" : "missing",
      }),
    },
  ];
}
