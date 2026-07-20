import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { FormlessApplicationRenderer } from "@dpeek/formless-renderer/application/assembly";
import { FormlessApplicationRendererProvider } from "@dpeek/formless-renderer/application/provider";
import { createFormlessUiMemoryContractHost } from "@dpeek/formless-presentation/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-presentation/contract-host/react";
import { createFormlessApplicationShellFixtures } from "./components/application-shell.fixtures.ts";
import { projectFormlessApplicationShellFixturePublication } from "./components/application-shell.tsx";
import { createFormlessApplicationSystemStateFixtures } from "./components/application-system-state.fixtures.ts";

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

describe("Formless application renderer", () => {
  it("exports an application-only root provider over the renderer-neutral theme contract", () => {
    const html = renderToStaticMarkup(
      <FormlessApplicationRendererProvider
        theme={{
          activeMode: "dark",
          id: "theme:application",
          kind: "documentTheme",
          policy: { kind: "fixed", mode: "dark" },
        }}
      >
        <main>Application</main>
      </FormlessApplicationRendererProvider>,
    );

    expect(html).toContain('data-astryx-application-theme="dark"');
    expect(html).toContain('data-astryx-toast-viewport="true"');
    expect(html).toContain("<main>Application</main>");
  });

  it("composes the renderer from stable root references and a separate React route child", () => {
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
        <FormlessApplicationRenderer
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
        <FormlessApplicationRenderer
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

  it("uses the cached server snapshot as renderer hydration input", () => {
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
        <FormlessApplicationRenderer
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

function requiredFixture<Fixture extends { id: string }>(fixtures: readonly Fixture[], id: string) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} fixture.`);
  }
  return fixture;
}
