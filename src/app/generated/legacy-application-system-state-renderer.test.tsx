import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type { FormlessUiApplicationSystemStateIntent } from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiApplicationSystemStateReference,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import { projectApplicationSystemState } from "../routes/application-system-state-projection.ts";
import { LegacySubscribedApplicationSystemStateRenderer } from "./legacy-application-system-state-renderer.tsx";

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

describe("legacy application system-state renderer", () => {
  it("subscribes to all states, exposes accessible status, and dispatches canonical actions", async () => {
    const intents: FormlessUiApplicationSystemStateIntent[] = [];
    const snapshot = projectApplicationSystemState({
      actions: [{ id: "retry", label: "Retry", purpose: "retry" }],
      facts: [{ id: "route", label: "Route", value: "/apps/tasks" }],
      feedback: { id: "feedback:test", intent: "danger", title: "Request failed" },
      heading: "Application unavailable",
      id: "application-system-state:test",
      message: "Try again.",
      state: "failure",
    });
    const reference = formlessUiApplicationSystemStateReference(snapshot.id);
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        if (intent.type === "applicationSystemStateAction") intents.push(intent);
      },
      nodes: [{ reference, snapshot }],
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <FormlessUiContractHostProvider host={host}>
          <LegacySubscribedApplicationSystemStateRenderer systemStateReference={reference} />
        </FormlessUiContractHostProvider>,
      );
    });

    const mounted = required(renderer);
    expect(
      mounted.root.findByProps({
        "data-formless-application-system-state": snapshot.id,
      }).props.role,
    ).toBe("alert");
    expect(mounted.root.findByProps({ "aria-label": "Retry" })).toBeDefined();
    expect(mounted.root.findByType("dl")).toBeDefined();

    await act(async () => {
      mounted.root.findByType("button").props.onClick();
    });
    expect(intents).toEqual([snapshot.actions[0]!.intent]);

    await act(async () => mounted.unmount());
  });
});

function required<T>(value: T | undefined): T {
  if (!value) throw new Error("Expected renderer.");
  return value;
}
