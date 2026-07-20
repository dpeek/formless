import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import {
  createMemoryPresentationHost,
  type PresentationHost,
} from "@dpeek/formless-presentation/host";
import {
  APPLICATION_THEME_DOCUMENT_ATTRIBUTE,
  APPLICATION_THEME_STORAGE_KEY,
  applicationThemePreferenceFromStoredValue,
  applicationThemeReference,
  applicationThemeRuntimePublication,
  bootstrapBrowserApplicationTheme,
  createApplicationThemeController,
  type ApplicationThemeContract,
  type ApplicationThemeBrowser,
} from "./application-theme-runtime.ts";

describe("application theme runtime", () => {
  it.each([
    [null, false, "system", "light"],
    ["unknown", true, "system", "dark"],
    ["system", true, "system", "dark"],
    ["light", true, "light", "light"],
    ["dark", false, "dark", "dark"],
  ] as const)(
    "resolves stored %s with system dark %s as %s/%s",
    (stored, systemPrefersDark, selectedMode, activeMode) => {
      const fixture = themeBrowserFixture({ stored, systemPrefersDark });
      const controller = createApplicationThemeController(fixture.browser);

      expect(controller.getSnapshot()).toMatchObject({
        activeMode,
        id: applicationThemeReference.themeId,
        policy: { kind: "userControlled" },
        selectionControl: { selectedMode },
      });
      expect(fixture.appliedModes).toEqual([activeMode]);
      expect(controller.getSnapshot().selectionControl.options.map(({ mode }) => mode)).toEqual([
        "system",
        "light",
        "dark",
      ]);

      controller.destroy();
    },
  );

  it("publishes one stable reference and keeps persistence, system changes, and document effects coherent", async () => {
    const fixture = themeBrowserFixture({ stored: null, systemPrefersDark: false });
    const controller = createApplicationThemeController(fixture.browser);
    const host = createThemeHost(controller);
    const reference = applicationThemeReference;

    expect(host.read(reference)?.activeMode).toBe("light");
    await host.dispatch(selectionIntent(host, "dark"));
    republish(host, controller);
    expect(fixture.persistedModes).toEqual(["dark"]);
    expect(fixture.appliedModes).toEqual(["light", "dark"]);
    expect(userControlledTheme(host).selectionControl.selectedMode).toBe("dark");

    await host.dispatch(selectionIntent(host, "system"));
    republish(host, controller);
    fixture.changeSystemPreference(true);
    republish(host, controller);
    expect(fixture.persistedModes).toEqual(["dark", "system"]);
    expect(host.read(reference)).toMatchObject({
      activeMode: "dark",
      selectionControl: { selectedMode: "system" },
    });

    fixture.changeStoredPreference("light");
    republish(host, controller);
    expect(host.read(reference)).toMatchObject({
      activeMode: "light",
      selectionControl: { selectedMode: "light" },
    });
    expect(fixture.appliedModes.at(-1)).toBe("light");

    controller.destroy();
    expect(fixture.subscriberCounts()).toEqual({ storage: 0, system: 0 });
  });

  it("bootstraps the resolved marker before the application entry", async () => {
    const fixture = themeBrowserFixture({ stored: "system", systemPrefersDark: true });
    const indexSource = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    const bootstrapPosition = indexSource.indexOf("/src/app/application-theme-bootstrap.ts");
    const applicationPosition = indexSource.indexOf("/src/main.tsx");

    expect(bootstrapBrowserApplicationTheme(fixture.browser)).toBe("dark");
    expect(fixture.appliedModes).toEqual(["dark"]);
    expect(bootstrapPosition).toBeGreaterThan(0);
    expect(applicationPosition).toBeGreaterThan(bootstrapPosition);
    expect(APPLICATION_THEME_DOCUMENT_ATTRIBUTE).toBe("data-formless-application-theme");
    expect(APPLICATION_THEME_STORAGE_KEY).not.toContain("public-site");
  });

  it("defaults malformed storage to system without sharing public Site theme state", () => {
    expect(applicationThemePreferenceFromStoredValue(undefined)).toBe("system");
    expect(applicationThemePreferenceFromStoredValue("sepia")).toBe("system");
    expect(APPLICATION_THEME_STORAGE_KEY).toBe("formless:application:theme");
  });
});

function createThemeHost(controller: ReturnType<typeof createApplicationThemeController>) {
  const publication = applicationThemeRuntimePublication(controller);
  return createMemoryPresentationHost({
    dispatch: publication.intentHandlers?.[0]?.dispatch,
    nodes: publication.nodes,
  });
}

function republish(
  host: PresentationHost & {
    publish(nodes: ReturnType<typeof applicationThemeRuntimePublication>["nodes"]): void;
  },
  controller: ReturnType<typeof createApplicationThemeController>,
) {
  host.publish(applicationThemeRuntimePublication(controller).nodes);
}

function selectionIntent(host: PresentationHost, mode: "system" | "light" | "dark") {
  const option = userControlledTheme(host).selectionControl.options.find(
    (candidate) => candidate.mode === mode,
  );
  if (!option) {
    throw new Error(`Missing ${mode} application theme option.`);
  }
  return option.selectionIntent;
}

function userControlledTheme(host: PresentationHost): ApplicationThemeContract {
  const theme = host.read(applicationThemeReference);
  if (!theme || theme.policy.kind !== "userControlled" || !theme.selectionControl) {
    throw new Error("Expected user-controlled application theme.");
  }
  return theme as ApplicationThemeContract;
}

function themeBrowserFixture({
  stored,
  systemPrefersDark,
}: {
  stored: string | null;
  systemPrefersDark: boolean;
}) {
  let currentStored = stored;
  let currentSystemPrefersDark = systemPrefersDark;
  const appliedModes: string[] = [];
  const persistedModes: string[] = [];
  const storageListeners = new Set<(value: string | null) => void>();
  const systemListeners = new Set<(value: boolean) => void>();
  const browser: ApplicationThemeBrowser = {
    applyResolvedMode: (mode) => appliedModes.push(mode),
    persistPreference: (preference) => {
      currentStored = preference;
      persistedModes.push(preference);
    },
    readPreference: () => currentStored,
    subscribePreference: (listener) => {
      storageListeners.add(listener);
      return () => storageListeners.delete(listener);
    },
    subscribeSystemPreference: (listener) => {
      systemListeners.add(listener);
      return () => systemListeners.delete(listener);
    },
    systemPrefersDark: () => currentSystemPrefersDark,
  };

  return {
    appliedModes,
    browser,
    changeStoredPreference: (value: string | null) => {
      currentStored = value;
      for (const listener of storageListeners) {
        listener(value);
      }
    },
    changeSystemPreference: (value: boolean) => {
      currentSystemPrefersDark = value;
      for (const listener of systemListeners) {
        listener(value);
      }
    },
    persistedModes,
    subscriberCounts: () => ({ storage: storageListeners.size, system: systemListeners.size }),
  };
}
