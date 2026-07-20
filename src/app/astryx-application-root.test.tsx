import { readFile } from "node:fs/promises";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type { FormlessUiContractHost } from "@dpeek/formless-astryx/contract-host";
import {
  useFormlessUiContractHost,
  useFormlessUiDocumentTheme,
} from "@dpeek/formless-astryx/contract-host/react";
import { AstryxApplicationRoot } from "./astryx-application-root.tsx";
import {
  applicationThemeReference,
  createApplicationThemeController,
  type ApplicationThemeBrowser,
} from "./application-theme-runtime.ts";
import { useApplicationRootThemeRuntime } from "./application-root-context.tsx";

vi.mock("@astryxdesign/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@astryxdesign/core")>()),
  Theme: ({ children, mode }: { children: ReactNode; mode: string }) =>
    createElement("section", { "data-astryx-root-theme": mode }, children),
}));

vi.mock("@astryxdesign/core/Toast", () => ({
  ToastViewport: ({ children }: { children: ReactNode }) =>
    createElement("aside", { "data-astryx-toast-viewport": true }, children),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("production Astryx application root", () => {
  it("keeps one provider, toast viewport, host, theme reference, and focusable route child continuous", async () => {
    const fixture = themeBrowserFixture("dark");
    const controller = createApplicationThemeController(fixture.browser);
    const navigationTarget = eventTargetFixture();
    let currentHost: FormlessUiContractHost | undefined;
    let currentThemeId: string | undefined;
    let currentRootReference = "";
    let renderer: ReactTestRenderer | undefined;

    function RuntimeProbe() {
      currentHost = useFormlessUiContractHost();
      currentThemeId = useFormlessUiDocumentTheme(applicationThemeReference)?.id;
      currentRootReference = useApplicationRootThemeRuntime()?.reference.themeId ?? "";
      return <button autoFocus>Route action</button>;
    }

    await act(async () => {
      renderer = create(
        <AstryxApplicationRoot
          currentHref={() => "https://formless.test/apps/tasks"}
          navigate={() => undefined}
          navigationTarget={navigationTarget}
          themeController={controller}
        >
          <RuntimeProbe />
        </AstryxApplicationRoot>,
      );
    });

    const mounted = required(renderer);
    const initialHost = required(currentHost);
    expect(mounted.root.findAllByProps({ "data-astryx-root-theme": "dark" })).toHaveLength(1);
    expect(mounted.root.findAllByProps({ "data-astryx-toast-viewport": true })).toHaveLength(1);
    expect(mounted.root.findByType("button").props.autoFocus).toBe(true);
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
    expect(mounted.root.findAllByProps({ "data-astryx-root-theme": "light" })).toHaveLength(1);
    expect(mounted.root.findAllByProps({ "data-astryx-root-theme": "dark" })).toHaveLength(0);
    expect(mounted.root.findByType("button").props.autoFocus).toBe(true);
    expect(fixture.persisted).toEqual(["light"]);

    await act(async () => mounted.unmount());
    expect(navigationTarget.listenerCount()).toBe(0);
    controller.destroy();
  });

  it("owns application CSS at the selected production entry", async () => {
    const [rootSource, mainSource, providerSource] = await Promise.all([
      readFile(new URL("./astryx-application-root.tsx", import.meta.url), "utf8"),
      readFile(new URL("../main.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../lib/astryx/src/application-provider.tsx", import.meta.url), "utf8"),
    ]);

    expect(rootSource).toContain("@dpeek/formless-astryx/application/global.css");
    expect(rootSource).toContain("AstryxApplicationProvider");
    expect(providerSource).toContain("ToastViewport");
    expect(mainSource).toContain("AstryxApplicationRoot");
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
