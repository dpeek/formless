import { describe, expect, it } from "vite-plus/test";

import { channelName } from "./broadcast.ts";

describe("client broadcast channels", () => {
  it("can scope channel names by Site project identity", () => {
    expect(channelName("site", "project-123")).toBe("formless:project-123:site");
    expect(channelName("site", "../project")).toBe("formless:site");
  });
});
