import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { createFormlessApplicationSystemStateFixtures } from "./application-system-state.fixtures.ts";
import { AstryxSubscribedApplicationSystemStateRenderer } from "./application-system-state-renderer.tsx";

describe("Astryx application system-state renderer", () => {
  it("renders every data-only memory-host fixture through the subscribed entrypoint", () => {
    const fixtures = createFormlessApplicationSystemStateFixtures();

    expect(fixtures.map(({ id }) => id)).toEqual([
      "loading",
      "empty",
      "missing",
      "unavailable",
      "blocked",
      "failure",
    ]);

    for (const fixture of fixtures) {
      const host = createMemoryPresentationHost({
        nodes: [{ reference: fixture.reference, snapshot: fixture.snapshot }],
      });
      const html = renderToStaticMarkup(
        <PresentationHostProvider host={host}>
          <AstryxSubscribedApplicationSystemStateRenderer
            systemStateReference={fixture.reference}
          />
        </PresentationHostProvider>,
      );

      expect(html).toContain(`data-formless-astryx-application-system-state-kind="${fixture.id}"`);
      expect(html).toContain(fixture.snapshot.heading);
      expect(html).toContain(fixture.snapshot.message);
      if (fixture.id === "loading") {
        expect(html).toContain('role="status"');
        expect(html).toContain('aria-busy="true"');
      }
      if (fixture.id === "failure") expect(html).toContain('role="alert"');
    }
  });
});
