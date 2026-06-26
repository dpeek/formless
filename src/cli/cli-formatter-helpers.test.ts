import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  formatCliDisplayFields,
  formatCliDisplayValue,
  formatCliOutputLines,
  formatCliRelativePath,
  formatCliSelectedTarget,
  formatCliWorkspaceOperationLabel,
} from "./cli-formatter-helpers.ts";

describe("CLI formatter helpers", () => {
  it("renders relative paths inside the current workspace", () => {
    const cwd = path.resolve(path.sep, "repo", "workspace");

    expect(formatCliRelativePath(cwd, cwd)).toBe(".");
    expect(formatCliRelativePath(cwd, path.join(cwd, "formless.json"))).toBe("formless.json");
    expect(formatCliRelativePath(cwd, path.join(cwd, "schema", "apps"))).toBe(
      path.join("schema", "apps"),
    );
  });

  it("keeps paths outside the current workspace absolute", () => {
    const cwd = path.resolve(path.sep, "repo", "workspace");
    const outsidePath = path.resolve(path.sep, "repo", "secrets.env");

    expect(formatCliRelativePath(cwd, outsidePath)).toBe(outsidePath);
  });

  it("renders selected targets and missing targets", () => {
    expect(
      formatCliSelectedTarget({
        alias: "production",
        url: "https://example.com",
      }),
    ).toBe("production (https://example.com)");
    expect(formatCliSelectedTarget(undefined)).toBe("<none>");
  });

  it("omits optional output lines", () => {
    expect(formatCliOutputLines(["one", null, undefined, false, "two"])).toBe("one\ntwo");
  });

  it("renders display-safe scalar, list, and object values", () => {
    expect(formatCliDisplayValue(null)).toBe("none");
    expect(formatCliDisplayValue(true)).toBe("true");
    expect(formatCliDisplayValue(3)).toBe("3");
    expect(formatCliDisplayValue("instance.primary")).toBe("instance.primary");
    expect(formatCliDisplayValue([])).toBe("none");
    expect(formatCliDisplayValue(["worker", null, "route"])).toBe("worker, none, route");
    expect(formatCliDisplayValue({ changedAreas: ["apps", "media"], status: "changes" })).toBe(
      '{"changedAreas":["apps","media"],"status":"changes"}',
    );
  });

  it("renders sorted display-safe field lines", () => {
    expect(
      formatCliDisplayFields({
        target: "instance.primary",
        mode: "dry-run",
        noop: false,
      }),
    ).toEqual(["mode: dry-run.", "noop: false.", "target: instance.primary."]);
  });

  it("renders workspace operation labels for command and non-command operation kinds", () => {
    expect(formatCliWorkspaceOperationLabel("pull")).toBe("pull");
    expect(formatCliWorkspaceOperationLabel("push")).toBe("push");
    expect(formatCliWorkspaceOperationLabel("credentialSetup")).toBe("credential setup");
    expect(formatCliWorkspaceOperationLabel("deploymentRefresh")).toBe("deployment refresh");
  });
});
