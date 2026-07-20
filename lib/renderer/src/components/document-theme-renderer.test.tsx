// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  DocumentThemeContract,
  DocumentThemeIntent,
  DocumentThemeMode,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  documentThemeReference,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { AstryxDocumentThemeRenderer, AstryxSubscribedDocumentThemeRenderer } from "./theme.tsx";

vi.mock("@astryxdesign/core", () => ({
  Theme: ({ children, mode }: { children: ReactNode; mode: string }) =>
    createElement("div", { "data-component": "Theme", "data-mode": mode }, children),
}));

vi.mock("@astryxdesign/core/SegmentedControl", () => ({
  SegmentedControl: ({
    children,
    label,
    onChange,
    value,
  }: {
    children: ReactNode;
    label: string;
    onChange: (value: string) => void;
    value: string;
  }) =>
    createElement(
      "div",
      { "aria-label": label, role: "radiogroup" },
      Children.map(children, (child) =>
        isValidElement<{ label: string; value: string }>(child)
          ? createElement(
              "button",
              {
                "aria-checked": child.props.value === value,
                "aria-label": child.props.label,
                onClick: () => onChange(child.props.value),
                role: "radio",
              },
              child.props.label,
            )
          : child,
      ),
    ),
  SegmentedControlItem: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const themeReference = documentThemeReference("theme:application");

describe("Astryx document theme renderer", () => {
  it.each(["light", "dark"] as const)(
    "leaves fixed %s provider ownership at the application root without synthesizing a selector",
    (mode) => {
      const { container, unmount } = render(
        <AstryxDocumentThemeRenderer onIntent={() => undefined} theme={fixedTheme(mode)}>
          <article>Workspace</article>
        </AstryxDocumentThemeRenderer>,
      );

      expect(container.querySelector('[data-component="Theme"]')).toBeNull();
      expect(container.querySelector('[role="radiogroup"]')).toBeNull();

      unmount();
    },
  );

  it.each([
    ["system", "dark", "System"],
    ["light", "light", "Light"],
    ["dark", "dark", "Dark"],
  ] as const)(
    "keeps user %s selection controlled while applying active %s presentation",
    (selectedMode, activeMode, selectedLabel) => {
      const intents: DocumentThemeIntent[] = [];
      const { container, unmount } = render(
        <AstryxDocumentThemeRenderer
          onIntent={(intent) => {
            intents.push(intent);
          }}
          theme={userTheme(selectedMode, activeMode)}
        >
          <article>Workspace</article>
        </AstryxDocumentThemeRenderer>,
      );

      expect(container.querySelector('[data-component="Theme"]')).toBeNull();
      expect(
        container.querySelector('[aria-label="Theme mode"][role="radiogroup"]'),
      ).not.toBeNull();
      expect(radioByLabel(container, selectedLabel).getAttribute("aria-checked")).toBe("true");
      expect(
        Array.from(container.querySelectorAll('[role="radio"]'), (node) =>
          node.getAttribute("aria-label"),
        ),
      ).toEqual(["System", "Light", "Dark"]);

      fireEvent.click(radioByLabel(container, selectedLabel));

      expect(intents).toEqual([
        {
          controlId: "control:theme-mode",
          mode: selectedMode,
          themeId: themeReference.themeId,
          type: "documentThemeModeSelection",
        },
      ]);

      unmount();
    },
  );

  it("subscribes to theme snapshots and dispatches through the memory host", async () => {
    const intents: DocumentThemeIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        if (intent.type === "documentThemeModeSelection") {
          intents.push(intent);
        }
      },
      nodes: [{ reference: themeReference, snapshot: userTheme("system", "dark") }],
    });
    const { container, unmount } = render(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedDocumentThemeRenderer themeReference={themeReference}>
          <article>Subscribed workspace</article>
        </AstryxSubscribedDocumentThemeRenderer>
      </PresentationHostProvider>,
    );

    fireEvent.click(radioByLabel(container, "Light"));
    expect(intents).toEqual([
      {
        controlId: "control:theme-mode",
        mode: "light",
        themeId: themeReference.themeId,
        type: "documentThemeModeSelection",
      },
    ]);

    await act(async () => {
      host.publish([{ reference: themeReference, snapshot: fixedTheme("light") }]);
    });
    expect(container.querySelector('[data-component="Theme"]')).toBeNull();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();

    unmount();
  });
});

function fixedTheme(mode: "light" | "dark"): DocumentThemeContract {
  return {
    activeMode: mode,
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "fixed", mode },
  };
}

function userTheme(
  selectedMode: DocumentThemeMode,
  activeMode: "light" | "dark",
): DocumentThemeContract {
  const controlId = "control:theme-mode";
  const option = (mode: DocumentThemeMode, label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId: themeReference.themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    activeMode,
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "userControlled" },
    selectionControl: {
      accessibilityLabel: "Theme mode",
      id: controlId,
      kind: "documentThemeSelectionControl",
      options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
      selectedMode,
    },
  };
}

function required<Value>(value: Value): NonNullable<Value> {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value as NonNullable<Value>;
}

function radioByLabel(container: HTMLElement, label: string): HTMLElement {
  return required(container.querySelector<HTMLElement>(`[aria-label="${label}"][role="radio"]`));
}
