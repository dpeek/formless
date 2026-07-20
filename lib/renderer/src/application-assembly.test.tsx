import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { FormlessApplicationRenderer } from "@dpeek/formless-renderer/application/assembly";
import { FormlessApplicationRendererProvider } from "@dpeek/formless-renderer/application/provider";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { createFormlessApplicationShellFixtures } from "./components/application-shell.fixtures.ts";
import { projectFormlessApplicationShellFixturePublication } from "./components/application-shell.tsx";
import { createFormlessApplicationSystemStateFixtures } from "./components/application-system-state.fixtures.ts";

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

    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Notifications"');
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
    const host = createMemoryPresentationHost({ nodes, serverNodes: nodes });

    const shellHtml = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <FormlessApplicationRenderer
          presentation={{
            children: <span data-route-child="selected">Route child</span>,
            kind: "shell",
            shellReference: shellPublication.shellReference,
          }}
        />
      </PresentationHostProvider>,
    );
    const stateHtml = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <FormlessApplicationRenderer
          presentation={{
            kind: "applicationSystemState",
            systemStateReference: systemState.reference,
          }}
        />
      </PresentationHostProvider>,
    );

    expect(shellHtml).toContain('data-route-child="selected"');
    expect(shellHtml).toContain("Route child");
    expect(stateHtml).toContain(systemState.snapshot.heading);
    expect(stateHtml).toContain(systemState.reference.stateId);
  });
});

function requiredFixture<Fixture extends { id: string }>(fixtures: readonly Fixture[], id: string) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} fixture.`);
  }
  return fixture;
}
