import { describe, expect, it } from "vite-plus/test";

import { channelName } from "./broadcast.ts";
import { instanceControlPlaneClientTarget } from "./app-target.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";

describe("client broadcast channels", () => {
  it("can scope channel names by Site project identity", () => {
    expect(channelName("site", "project-123")).toBe("formless:project-123:site");
    expect(channelName("site", "../project")).toBe("formless:site");
  });

  it("can scope channel names by installed app identity", () => {
    expect(channelName(installedSiteIdentity("personal"))).toBe("formless:app:personal");
    expect(channelName(installedSiteIdentity("docs"))).toBe("formless:app:docs");
  });

  it("can scope channel names by instance control-plane identity", () => {
    expect(channelName(instanceControlPlaneClientTarget())).toBe("formless:instance:control-plane");
  });
});

function installedSiteIdentity(installId: string) {
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "site" });

  if (!identity) {
    throw new Error(`Expected installed Site identity for ${installId}.`);
  }

  return identity;
}
