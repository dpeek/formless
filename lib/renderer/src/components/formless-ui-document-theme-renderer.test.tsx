import { readFile } from "node:fs/promises";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntent,
  FormlessUiDocumentThemeMode,
} from "@dpeek/formless-presentation/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiDocumentThemeReference,
} from "@dpeek/formless-presentation/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-presentation/contract-host/react";
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

const themeReference = formlessUiDocumentThemeReference("theme:application");

describe("Astryx document theme renderer", () => {
  it.each(["light", "dark"] as const)(
    "leaves fixed %s provider ownership at the application root without synthesizing a selector",
    async (mode) => {
      let renderer: ReactTestRenderer | undefined;

      await act(async () => {
        renderer = create(
          <AstryxDocumentThemeRenderer onIntent={() => undefined} theme={fixedTheme(mode)}>
            <article>Workspace</article>
          </AstryxDocumentThemeRenderer>,
        );
      });

      const mountedRenderer = required(renderer);
      expect(mountedRenderer.root.findAllByProps({ "data-component": "Theme" })).toHaveLength(0);
      expect(mountedRenderer.root.findAllByProps({ role: "radiogroup" })).toHaveLength(0);

      await act(async () => {
        mountedRenderer.unmount();
      });
    },
  );

  it.each([
    ["system", "dark", "System"],
    ["light", "light", "Light"],
    ["dark", "dark", "Dark"],
  ] as const)(
    "keeps user %s selection controlled while applying active %s presentation",
    async (selectedMode, activeMode, selectedLabel) => {
      const intents: FormlessUiDocumentThemeIntent[] = [];
      let renderer: ReactTestRenderer | undefined;

      await act(async () => {
        renderer = create(
          <AstryxDocumentThemeRenderer
            onIntent={(intent) => {
              intents.push(intent);
            }}
            theme={userTheme(selectedMode, activeMode)}
          >
            <article>Workspace</article>
          </AstryxDocumentThemeRenderer>,
        );
      });

      const mountedRenderer = required(renderer);
      expect(mountedRenderer.root.findAllByProps({ "data-component": "Theme" })).toHaveLength(0);
      expect(
        mountedRenderer.root.findByProps({ "aria-label": "Theme mode", role: "radiogroup" }),
      ).toBeDefined();
      expect(radioByLabel(mountedRenderer, selectedLabel).props["aria-checked"]).toBe(true);
      expect(
        mountedRenderer.root
          .findAllByProps({ role: "radio" })
          .map((node) => node.props["aria-label"]),
      ).toEqual(["System", "Light", "Dark"]);

      await act(async () => {
        radioByLabel(mountedRenderer, selectedLabel).props.onClick();
      });

      expect(intents).toEqual([
        {
          controlId: "control:theme-mode",
          mode: selectedMode,
          themeId: themeReference.themeId,
          type: "documentThemeModeSelection",
        },
      ]);

      await act(async () => {
        mountedRenderer.unmount();
      });
    },
  );

  it("subscribes to theme snapshots and dispatches through the memory host", async () => {
    const intents: FormlessUiDocumentThemeIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        if (intent.type === "documentThemeModeSelection") {
          intents.push(intent);
        }
      },
      nodes: [{ reference: themeReference, snapshot: userTheme("system", "dark") }],
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <FormlessUiContractHostProvider host={host}>
          <AstryxSubscribedDocumentThemeRenderer themeReference={themeReference}>
            <article>Subscribed workspace</article>
          </AstryxSubscribedDocumentThemeRenderer>
        </FormlessUiContractHostProvider>,
      );
    });

    const mountedRenderer = required(renderer);
    await act(async () => {
      radioByLabel(mountedRenderer, "Light").props.onClick();
    });
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
    expect(mountedRenderer.root.findAllByProps({ "data-component": "Theme" })).toHaveLength(0);
    expect(mountedRenderer.root.findAllByProps({ role: "radiogroup" })).toHaveLength(0);

    await act(async () => {
      mountedRenderer.unmount();
    });
  });

  it("keeps renderer imports free of runtime concerns", async () => {
    const providerSource = await readFile(new URL("../theme.tsx", import.meta.url), "utf8");
    const rendererSource = await readFile(new URL("./theme.tsx", import.meta.url), "utf8");
    const shellSource = await readFile(new URL("./shell.tsx", import.meta.url), "utf8");
    const fixtureSource = await readFile(
      new URL("./application-shell.fixtures.ts", import.meta.url),
      "utf8",
    );
    const sources = [providerSource, rendererSource, shellSource, fixtureSource];
    const imports = sources.flatMap(importSpecifiers);

    expect(
      imports.filter((specifier) =>
        /(?:^|\/)(?:src\/app|src\/client|storage|replica|routing|session-client)(?:\/|$)|formless-schema|\bwouter\b/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
    expect(sources.join("\n")).not.toMatch(
      /\blocalStorage\b|\bsessionStorage\b|\bdocument\.|\bwindow\.|\bcookie\b|useMediaQuery/,
    );
  });
});

function fixedTheme(mode: "light" | "dark"): FormlessUiDocumentThemeContract {
  return {
    activeMode: mode,
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "fixed", mode },
  };
}

function userTheme(
  selectedMode: FormlessUiDocumentThemeMode,
  activeMode: "light" | "dark",
): FormlessUiDocumentThemeContract {
  const controlId = "control:theme-mode";
  const option = (mode: FormlessUiDocumentThemeMode, label: string) => ({
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

function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value;
}

function radioByLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.findByProps({ "aria-label": label, role: "radio" });
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}
