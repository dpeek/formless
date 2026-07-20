// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PUBLIC_SITE_THEME_STORAGE_KEY, PUBLIC_SITE_THEME_SYSTEM_QUERY } from "../public-theme.ts";
import { usePublicSiteTheme } from "./theme.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark", "light");
  delete document.documentElement.dataset.siteTheme;
  document.documentElement.style.removeProperty("color-scheme");
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
    const { container, unmount } = render(<ThemeHarness />);

    const button = required(container.querySelector("button"));
    expect(button.dataset.themeMode).toBe("dark");
    expect(environment.documentTheme()).toEqual({
      classes: ["dark"],
      colorScheme: "dark",
      dataTheme: "dark",
    });

    fireEvent.click(button);

    expect(button.dataset.themeMode).toBe("light");
    expect(environment.writes).toEqual([[PUBLIC_SITE_THEME_STORAGE_KEY, "light"]]);
    expect(environment.documentTheme()).toEqual({
      classes: ["light"],
      colorScheme: "light",
      dataTheme: "light",
    });

    unmount();
  });

  it("uses system mode and keeps toggles in memory when storage is unavailable", async () => {
    const environment = installBrowserThemeEnvironment({
      storageUnavailable: true,
      systemPrefersDark: true,
    });
    const { container, unmount } = render(<ThemeHarness />);
    const button = required(container.querySelector("button"));

    expect(button.dataset.themeMode).toBe("dark");

    fireEvent.click(button);

    expect(button.dataset.themeMode).toBe("light");
    expect(environment.writes).toEqual([]);
    expect(environment.documentTheme().dataTheme).toBe("light");

    unmount();
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
  const writes: [string, string][] = [];
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
    expect(key).toBe(PUBLIC_SITE_THEME_STORAGE_KEY);
    if (input.storageUnavailable) {
      throw new Error("Storage unavailable.");
    }
    return input.storedValue ?? null;
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
    if (input.storageUnavailable) {
      throw new Error("Storage unavailable.");
    }
    writes.push([key, value]);
  });

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      expect(query).toBe(PUBLIC_SITE_THEME_SYSTEM_QUERY);
      return { matches: input.systemPrefersDark } as MediaQueryList;
    }),
  );

  return {
    documentTheme: () => ({
      classes: [...document.documentElement.classList].sort(),
      colorScheme: document.documentElement.style.getPropertyValue("color-scheme"),
      dataTheme: document.documentElement.dataset.siteTheme,
    }),
    writes,
  };
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
