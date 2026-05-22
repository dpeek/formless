import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";
import { Menu as ReactAriaMenu } from "react-aria-components/Menu";

import * as rootMenuExports from "@dpeek/formless-ui";
import * as menuExports from "@dpeek/formless-ui/menu";
import packageJson from "../package.json";
import {
  Menu,
  MenuContent,
  MenuDescription,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuShortcut,
  MenuSubMenu,
  MenuTrigger,
  menuContentStyles,
} from "./menu.js";

describe("menu primitive", () => {
  it("exposes the canonical menu surface from root and subpath exports", () => {
    const menuExportNames = [
      "Menu",
      "MenuContent",
      "MenuDescription",
      "MenuHeader",
      "MenuItem",
      "MenuLabel",
      "MenuSection",
      "MenuSeparator",
      "MenuShortcut",
      "MenuSubMenu",
      "MenuTrigger",
    ] as const;

    for (const exportName of menuExportNames) {
      expect(rootMenuExports[exportName]).toBe(menuExports[exportName]);
    }

    expect(packageJson.exports["./menu"]).toBe("./src/menu.tsx");
    expect("./dropdown-menu" in packageJson.exports).toBe(false);
  });

  it("renders trigger, content, selected, submenu, disabled, and intent states", () => {
    const triggerMarkup = renderToStaticMarkup(
      <Menu isOpen>
        <MenuTrigger aria-label="Open actions">Actions</MenuTrigger>
      </Menu>,
    );
    const contentMarkup = renderToStaticMarkup(
      <ReactAriaMenu
        data-slot="menu-content"
        className={menuContentStyles()}
        selectionMode="single"
        selectedKeys={["active"]}
      >
        <MenuItem id="active">
          <MenuLabel>Active action</MenuLabel>
          <MenuDescription>Current choice</MenuDescription>
          <MenuShortcut>Cmd+K</MenuShortcut>
        </MenuItem>
        <MenuSubMenu>
          <MenuItem id="more">
            <MenuLabel>More actions</MenuLabel>
          </MenuItem>
          <MenuContent>
            <MenuItem id="nested">
              <MenuLabel>Nested action</MenuLabel>
            </MenuItem>
          </MenuContent>
        </MenuSubMenu>
        <MenuSeparator />
        <MenuItem id="disabled" isDisabled>
          <MenuLabel>Disabled action</MenuLabel>
        </MenuItem>
        <MenuItem id="danger" intent="danger">
          <MenuLabel>Delete action</MenuLabel>
        </MenuItem>
        <MenuItem id="warning" intent="warning">
          <MenuLabel>Warn action</MenuLabel>
        </MenuItem>
      </ReactAriaMenu>,
    );
    const markup = `${triggerMarkup}${contentMarkup}`;

    expect(markup).toContain('data-slot="menu-trigger"');
    expect(markup).toContain('data-slot="menu-content"');
    expect(markup).toContain("Active action");
    expect(markup).toContain("Current choice");
    expect(markup).toContain("Disabled action");
    expect(markup).toContain("Delete action");
    expect(markup).toContain("Warn action");
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("lucide-check");
    expect(markup).toContain("lucide-chevron-right");
    expect(markup).toContain("danger");
    expect(markup).toContain("warning");
  });
});
