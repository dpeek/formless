import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { selectScreenModelByPath } from "../../client/views.ts";
import { instanceControlPlaneSchema } from "@dpeek/formless-instance-control-plane";
import { parseAppSchema } from "@dpeek/formless-schema";
import { HomeScreen } from "./screen.tsx";

describe("generated home screen", () => {
  it("renders injected section operation controls beside collection headings", () => {
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
        sectionOperationControls={{
          "app-installs": <button type="button">Install</button>,
        }}
        today="2026-06-01"
      />,
    );

    expect(html).toContain(">App installs<");
    expect(html).toContain('<button type="button">Install</button>');
  });
});
