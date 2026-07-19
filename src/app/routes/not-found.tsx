import { projectApplicationSystemState } from "./application-system-state-projection.ts";
import { ApplicationSystemStateRuntime } from "./application-system-state-runtime.tsx";

export function NotFoundRoute() {
  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        heading: "Not found",
        id: "application-system-state:not-found",
        message: "The requested application route does not exist.",
        state: "missing",
      })}
    />
  );
}
