import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { selectScreenModelByPath } from "../../client/views.ts";
import { instanceControlPlaneSchema } from "@dpeek/formless-instance-control-plane";
import { parseAppSchema } from "@dpeek/formless-schema";
import { HomeScreen } from "./screen.tsx";

describe("generated home screen", () => {
  it("routes an eligible production screen through the legacy workspace seam", () => {
    const screen = selectScreenModelByPath(parseAppSchema(instanceControlPlaneSchema), "/");

    if (!screen) {
      throw new Error("Missing instance control-plane apps screen.");
    }

    const html = renderToStaticMarkup(
      <HomeScreen
        getSectionSelection={() => ({})}
        onSelectContext={() => {}}
        onSelectQuery={() => {}}
        screen={screen}
        sectionExternalActions={{
          "app-installs": [
            {
              action: {
                id: "install",
                icon: "add",
                invocationSource: "button",
                invoke: { controlId: "install", invocationSource: "button" },
                kind: "actionTrigger",
                label: "Install",
              },
              onIntent: () => {},
            },
          ],
        }}
        today="2026-06-01"
      />,
    );

    expect(html).toContain('data-formless-legacy-workspace="workspace:apps"');
    expect(html).toContain("data-formless-legacy-workspace-collection=");
    expect(html).toContain("Install");
    expect(html).toContain("data-formless-legacy-table=");
  });
});
