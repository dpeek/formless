// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { PresentationHost } from "@dpeek/formless-presentation/host";
import { usePresentationHost, useDocumentTheme } from "@dpeek/formless-presentation/host/react";
import { ApplicationRendererRoot } from "./application-renderer-root.tsx";
import {
  applicationThemeReference,
  createApplicationThemeController,
  type ApplicationThemeBrowser,
} from "./application-theme-runtime.ts";
import { useApplicationRootThemeRuntime } from "./application-root-context.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("application root runtime", () => {
  it("keeps one host while publishing theme changes and managing navigation lifecycle", async () => {
    const fixture = themeBrowserFixture("dark");
    const controller = createApplicationThemeController(fixture.browser);
    const navigationTarget = eventTargetFixture();
    let currentHost: PresentationHost | undefined;
    let currentThemeId: string | undefined;
    let currentRootReference = "";

    function RuntimeProbe() {
      currentHost = usePresentationHost();
      currentThemeId = useDocumentTheme(applicationThemeReference)?.id;
      currentRootReference = useApplicationRootThemeRuntime()?.reference.themeId ?? "";
      return null;
    }

    const mounted = render(
      <ApplicationRendererRoot
        currentHref={() => "https://formless.test/apps/tasks"}
        navigate={() => undefined}
        navigationTarget={navigationTarget}
        themeController={controller}
      >
        <RuntimeProbe />
      </ApplicationRendererRoot>,
    );

    const initialHost = required(currentHost);
    expect(currentThemeId).toBe(applicationThemeReference.themeId);
    expect(currentRootReference).toBe(applicationThemeReference.themeId);
    expect(navigationTarget.listenerCount()).toBe(1);

    await act(async () => {
      const currentTheme = initialHost.read(applicationThemeReference);
      if (
        !currentTheme ||
        currentTheme.policy.kind !== "userControlled" ||
        !currentTheme.selectionControl
      ) {
        throw new Error("Expected user-controlled application theme.");
      }
      await initialHost.dispatch(
        required(currentTheme.selectionControl.options[1]).selectionIntent,
      );
    });

    expect(currentHost).toBe(initialHost);
    expect(currentThemeId).toBe(applicationThemeReference.themeId);
    expect(currentRootReference).toBe(applicationThemeReference.themeId);
    expect(initialHost.read(applicationThemeReference)?.activeMode).toBe("light");
    expect(fixture.persisted).toEqual(["light"]);

    mounted.unmount();
    expect(navigationTarget.listenerCount()).toBe(0);
    controller.destroy();
  });
});

function themeBrowserFixture(stored: "system" | "light" | "dark") {
  const persisted: string[] = [];
  const browser: ApplicationThemeBrowser = {
    applyResolvedMode: () => undefined,
    persistPreference: (preference) => persisted.push(preference),
    readPreference: () => stored,
    subscribePreference: () => () => undefined,
    subscribeSystemPreference: () => () => undefined,
    systemPrefersDark: () => false,
  };
  return { browser, persisted };
}

function eventTargetFixture() {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  return {
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    },
    listenerCount: () => listeners.size,
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener);
    },
  } as Pick<Document, "addEventListener" | "removeEventListener"> & {
    listenerCount(): number;
  };
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
