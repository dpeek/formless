import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntent,
  FormlessUiDocumentThemeMode,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiDocumentThemeReference,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import {
  LegacyDocumentThemeRenderer,
  LegacySubscribedDocumentThemeRenderer,
} from "./legacy-document-theme-renderer.tsx";

vi.mock("@dpeek/formless-ui/button", () => ({
  Button: ({
    children,
    isDisabled,
    onPress,
    ...props
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => createElement("button", { ...props, disabled: isDisabled, onClick: onPress }, children),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const themeReference = formlessUiDocumentThemeReference("theme:application");

describe("legacy document theme renderer", () => {
  it.each(["light", "dark"] as const)(
    "applies fixed %s presentation without synthesizing a control",
    async (mode) => {
      let renderer: ReactTestRenderer | undefined;

      await act(async () => {
        renderer = create(
          <LegacyDocumentThemeRenderer onIntent={() => undefined} theme={fixedTheme(mode)}>
            <article>Workspace</article>
          </LegacyDocumentThemeRenderer>,
        );
      });

      const mountedRenderer = required(renderer);
      expect(
        mountedRenderer.root.findByProps({
          "data-formless-document-theme": themeReference.themeId,
        }).props["data-formless-document-theme-active-mode"],
      ).toBe(mode);
      expect(mountedRenderer.root.findAllByProps({ role: "group" })).toHaveLength(0);

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
    "presents and dispatches user %s selection with projected %s presentation",
    async (selectedMode, activeMode, selectedLabel) => {
      const intents: FormlessUiDocumentThemeIntent[] = [];
      let renderer: ReactTestRenderer | undefined;

      await act(async () => {
        renderer = create(
          <LegacyDocumentThemeRenderer
            onIntent={(intent) => {
              intents.push(intent);
            }}
            theme={userTheme(selectedMode, activeMode)}
          >
            <article>Workspace</article>
          </LegacyDocumentThemeRenderer>,
        );
      });

      const mountedRenderer = required(renderer);
      expect(
        mountedRenderer.root.findByProps({
          "data-formless-document-theme": themeReference.themeId,
        }).props["data-formless-document-theme-active-mode"],
      ).toBe(activeMode);
      expect(buttonByLabel(mountedRenderer, selectedLabel).props["aria-pressed"]).toBe(true);

      await act(async () => {
        buttonByLabel(mountedRenderer, selectedLabel).props.onClick();
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

  it("subscribes to the theme node and dispatches through the contract host", async () => {
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
          <LegacySubscribedDocumentThemeRenderer themeReference={themeReference}>
            <article>Subscribed workspace</article>
          </LegacySubscribedDocumentThemeRenderer>
        </FormlessUiContractHostProvider>,
      );
    });

    const mountedRenderer = required(renderer);
    await act(async () => {
      buttonByLabel(mountedRenderer, "Light").props.onClick();
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
    expect(
      mountedRenderer.root.findByProps({
        "data-formless-document-theme": themeReference.themeId,
      }).props["data-formless-document-theme-active-mode"],
    ).toBe("light");
    expect(mountedRenderer.root.findAllByProps({ role: "group" })).toHaveLength(0);

    await act(async () => {
      mountedRenderer.unmount();
    });
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

function buttonByLabel(renderer: ReactTestRenderer, label: string) {
  return required(
    renderer.root.findAllByType("button").find((button) => button.props["aria-label"] === label),
  );
}
