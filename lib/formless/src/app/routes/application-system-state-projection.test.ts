import { describe, expect, it } from "vite-plus/test";
import type { ApplicationSystemStateKind } from "@dpeek/formless-presentation/contract";
import {
  projectApplicationSystemState,
  resolveApplicationSystemStateIntent,
} from "./application-system-state-projection.ts";

describe("application system-state projection", () => {
  it.each([
    "blocked",
    "empty",
    "failure",
    "loading",
    "missing",
    "unavailable",
  ] as const satisfies readonly ApplicationSystemStateKind[])(
    "projects display-safe %s state without renderer or runtime values",
    (state) => {
      const snapshot = projectApplicationSystemState({
        facts: [
          {
            id: "route",
            label: "Route",
            value: "/Users/ada/project with API_TOKEN=secret-value",
          },
        ],
        feedback: {
          detail: "Bearer raw-session-token failed at /tmp/formless/error.log",
          id: "feedback:test",
          intent: state === "failure" ? "danger" : "info",
          title: "Runtime status",
        },
        heading: "Formless",
        id: `application-system-state:${state}`,
        message: "owner-setup-token secret-value is unavailable",
        state,
      });

      expect(snapshot).toMatchObject({
        actions: [],
        heading: "Formless",
        id: `application-system-state:${state}`,
        kind: "applicationSystemState",
        state,
      });
      expect(JSON.stringify(snapshot)).not.toContain("secret-value");
      expect(JSON.stringify(snapshot)).not.toContain("raw-session-token");
      expect(JSON.stringify(snapshot)).not.toContain("/Users/ada");
      expect(JSON.stringify(snapshot)).not.toContain("/tmp/formless");
      expect(JSON.stringify(snapshot)).toContain("[redacted]");
      expect(JSON.stringify(snapshot)).toContain("<path>");
    },
  );

  it("resolves only the current enabled semantic action intent", () => {
    const snapshot = projectApplicationSystemState({
      actions: [
        { id: "retry", label: "Retry", purpose: "retry" },
        { id: "home", label: "Go home", prominence: "secondary", purpose: "navigate" },
      ],
      heading: "Application unavailable",
      id: "application-system-state:test",
      message: "Try again.",
      state: "unavailable",
    });
    const retry = snapshot.actions[0]!;

    expect(resolveApplicationSystemStateIntent(snapshot, retry.intent)).toEqual({
      action: retry,
      kind: "action",
    });
    expect(
      resolveApplicationSystemStateIntent(snapshot, {
        ...retry.intent,
        actionId: "stale",
      }),
    ).toEqual({ kind: "ignored" });
    expect(
      resolveApplicationSystemStateIntent(snapshot, {
        ...retry.intent,
        stateId: "application-system-state:stale",
      }),
    ).toEqual({ kind: "ignored" });
  });
});
