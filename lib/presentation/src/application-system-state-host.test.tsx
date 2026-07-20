import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { ApplicationSystemStateContract, ApplicationSystemStateIntent } from "./contract.ts";
import {
  createMemoryPresentationHost,
  applicationSystemStateReference,
  type ApplicationSystemStateNode,
} from "./host.ts";
import { PresentationHostProvider, useApplicationSystemState } from "./host-react.tsx";

const reference = applicationSystemStateReference("application-system-state:test");

describe("application system-state contract host", () => {
  it("reads, publishes, subscribes, and caches server state through the typed reference", () => {
    const serverNode = node("loading", "Loading Formless");
    const host = createMemoryPresentationHost({
      nodes: [serverNode],
      serverNodes: [serverNode],
    });
    const calls: string[] = [];
    const initial = host.read(reference);

    host.subscribe(reference, () => calls.push("system-state"));
    host.publish([node("loading", "Loading Formless")]);
    expect(host.read(reference)).toBe(initial);
    expect(calls).toEqual([]);

    host.publish([node("failure", "Formless unavailable")]);
    expect(host.read(reference)?.state).toBe("failure");
    expect(host.getServerSnapshot(reference)).toBe(initial);
    expect(calls).toEqual(["system-state"]);
    expect(
      renderToStaticMarkup(
        <PresentationHostProvider host={host}>
          <SystemStateHeading />
        </PresentationHostProvider>,
      ),
    ).toContain("Loading Formless");
  });

  it("dispatches canonical system-state intents and rejects mismatched action identity", async () => {
    const intents: ApplicationSystemStateIntent[] = [];
    const actionNode = node("failure", "Formless unavailable", true);
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        if (intent.type === "applicationSystemStateAction") intents.push(intent);
      },
      nodes: [actionNode],
    });
    const intent = actionNode.snapshot.actions[0]!.intent;

    await host.dispatch(intent);
    expect(intents).toEqual([intent]);

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

function SystemStateHeading() {
  const state = useApplicationSystemState(reference);
  return <span>{state?.heading}</span>;
}

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
