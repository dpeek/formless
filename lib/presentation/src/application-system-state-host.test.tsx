import { describe, expect, it } from "vite-plus/test";
import type { ApplicationSystemStateContract } from "./contract.ts";
import {
  createMemoryPresentationHost,
  applicationSystemStateReference,
  type ApplicationSystemStateNode,
} from "./host.ts";

const reference = applicationSystemStateReference("application-system-state:test");

describe("application system-state contract host", () => {
  it("reads system state through its typed reference", () => {
    const host = createMemoryPresentationHost({
      nodes: [node("loading", "Loading Formless")],
    });
    const state: ApplicationSystemStateContract | undefined = host.read({ ...reference });

    expect(state).toMatchObject({
      heading: "Loading Formless",
      id: reference.stateId,
      state: "loading",
    });
  });

  it("rejects mismatched action identity", () => {
    const actionNode = node("failure", "Formless unavailable", true);

    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...actionNode,
            snapshot: {
              ...actionNode.snapshot,
              actions: actionNode.snapshot.actions.map((action) => ({
                ...action,
                intent: { ...action.intent, stateId: "application-system-state:other" },
              })),
            },
          },
        ],
      }),
    ).toThrow("invalid action intent");
  });
});

function node(
  state: ApplicationSystemStateContract["state"],
  heading: string,
  withAction = false,
): ApplicationSystemStateNode {
  const controlId = "control:retry";
  return {
    reference,
    snapshot: {
      accessibilityLabel: heading,
      actions: withAction
        ? [
            {
              control: {
                accessibilityLabel: "Retry",
                content: { kind: "label", label: "Retry" },
                density: "default",
                id: controlId,
                kind: "button",
                prominence: "primary",
                type: "button",
              },
              id: "retry",
              intent: {
                actionId: "retry",
                controlId,
                stateId: reference.stateId,
                type: "applicationSystemStateAction",
              },
              kind: "applicationSystemStateAction",
              purpose: "retry",
            },
          ]
        : [],
      facts: [],
      heading,
      id: reference.stateId,
      kind: "applicationSystemState",
      message: "Current application status.",
      state,
    },
  };
}
