import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PUBLIC_SITE_THEME_STORAGE_KEY, PUBLIC_SITE_THEME_SYSTEM_QUERY } from "../public-theme.ts";
import { usePublicSiteTheme } from "./theme.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public Site browser theme controller", () => {
  it("keeps server and initial hydration output on the deterministic light mode", () => {
    installBrowserThemeEnvironment({ storedValue: "dark", systemPrefersDark: true });

    expect(renderToStaticMarkup(<ThemeHarness />)).toBe(
      '<button data-theme-mode="light" type="button">light</button>',
    );
  });

  it("applies stored mode after mount and persists explicit toggles", async () => {
    const environment = installBrowserThemeEnvironment({
      storedValue: "dark",
      systemPrefersDark: false,
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(<ThemeHarness />);
    });

    const button = renderer!.root.findByType("button");
    expect(button.props["data-theme-mode"]).toBe("dark");
    expect(environment.documentTheme()).toEqual({
      classes: ["dark"],
      colorScheme: "dark",
      dataTheme: "dark",
    });

    await act(async () => {
      button.props.onClick();
    });

    expect(renderer!.root.findByType("button").props["data-theme-mode"]).toBe("light");
    expect(environment.writes).toEqual([[PUBLIC_SITE_THEME_STORAGE_KEY, "light"]]);
    expect(environment.documentTheme()).toEqual({
      classes: ["light"],
      colorScheme: "light",
      dataTheme: "light",
    });

    await act(async () => renderer!.unmount());
  });

  it("uses system mode and keeps toggles in memory when storage is unavailable", async () => {
    const environment = installBrowserThemeEnvironment({
      storageUnavailable: true,
      systemPrefersDark: true,
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(<ThemeHarness />);
    });

    expect(renderer!.root.findByType("button").props["data-theme-mode"]).toBe("dark");

    await act(async () => {
      renderer!.root.findByType("button").props.onClick();
    });

    expect(renderer!.root.findByType("button").props["data-theme-mode"]).toBe("light");
    expect(environment.writes).toEqual([]);
    expect(environment.documentTheme().dataTheme).toBe("light");

    await act(async () => renderer!.unmount());
  });
});

function ThemeHarness() {
  const theme = usePublicSiteTheme();

  return createElement(
    "button",
    {
      "data-theme-mode": theme.mode,
      onClick: theme.toggleMode,
      type: "button",
    },
    theme.mode,
  );
}

function installBrowserThemeEnvironment(input: {
  storageUnavailable?: boolean;
  storedValue?: string | null;
  systemPrefersDark: boolean;
}) {
  const classes = new Set<string>();
  const dataset: Record<string, string> = {};
  const styles = new Map<string, string>();
  const writes: [string, string][] = [];
  const localStorage = {
    getItem: (key: string) => {
      expect(key).toBe(PUBLIC_SITE_THEME_STORAGE_KEY);
      if (input.storageUnavailable) {
        throw new Error("Storage unavailable.");
      }
      return input.storedValue ?? null;
    },
    setItem: (key: string, value: string) => {
      if (input.storageUnavailable) {
        throw new Error("Storage unavailable.");
      }
      writes.push([key, value]);
    },
  };

  vi.stubGlobal("window", {
    localStorage,
    matchMedia: (query: string) => {
      expect(query).toBe(PUBLIC_SITE_THEME_SYSTEM_QUERY);
      return { matches: input.systemPrefersDark };
    },
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        toggle: (name: string, force: boolean) => {
          if (force) {
            classes.add(name);
          } else {
            classes.delete(name);
          }
        },
      },
      dataset,
      style: {
        setProperty: (name: string, value: string) => styles.set(name, value),
      },
    },
  });

  return {
    documentTheme: () => ({
      classes: [...classes].sort(),
      colorScheme: styles.get("color-scheme"),
      dataTheme: dataset.siteTheme,
    }),
    writes,
  };
}
