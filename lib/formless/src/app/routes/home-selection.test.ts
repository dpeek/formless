import { describe, expect, it } from "vite-plus/test";
import {
  createHomeRouteSelectionState,
  homeRouteSectionSelectionKey,
  selectHomeRouteSectionContextRecordId,
  selectHomeRouteSectionQueryName,
  withHomeRouteSelectedScreenName,
  withHomeRouteSelectedSectionContextRecordId,
  withHomeRouteSelectedSectionQueryName,
} from "./home-selection.tsx";

describe("home route selection", () => {
  it("keeps query and context selection in the current screen section", () => {
    const state = withHomeRouteSelectedSectionContextRecordId(
      withHomeRouteSelectedSectionQueryName(
        withHomeRouteSelectedScreenName(createHomeRouteSelectionState(), "taskHome"),
        "taskHome",
        "tasks",
        "taskCompleted",
      ),
      "taskHome",
      "tasks",
      "record-1",
    );
    const sectionKey = homeRouteSectionSelectionKey("taskHome", "tasks");

    expect(state).toEqual({
      selectedScreenName: "taskHome",
      selectedQueryNamesBySection: { [sectionKey]: "taskCompleted" },
      selectedContextIdsBySection: { [sectionKey]: "record-1" },
    });
    expect(createHomeRouteSelectionState()).toEqual({
      selectedScreenName: null,
      selectedQueryNamesBySection: {},
      selectedContextIdsBySection: {},
    });
  });

  it("keeps the same section id independent across screens", () => {
    const state = withHomeRouteSelectedSectionContextRecordId(
      withHomeRouteSelectedSectionContextRecordId(
        createHomeRouteSelectionState(),
        "rateHome",
        "rates",
        "card-1",
      ),
      "rateSetup",
      "rates",
      "card-2",
    );

    expect(selectHomeRouteSectionContextRecordId(state, "rateHome", "rates")).toBe("card-1");
    expect(selectHomeRouteSectionContextRecordId(state, "rateSetup", "rates")).toBe("card-2");
    expect(selectHomeRouteSectionContextRecordId(state, "rateSetup", "resources")).toBeNull();
    expect(selectHomeRouteSectionQueryName(state, "rateHome", "rates")).toBeNull();
  });
});
