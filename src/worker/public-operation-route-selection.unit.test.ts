import { describe, expect, it } from "vite-plus/test";
import { BadRequestError } from "./errors.ts";
import { selectPublicOperationRoute } from "./public-operations.ts";

describe("public operation route selection", () => {
  it("selects valid public operation route suffixes", () => {
    expect(
      selectPublicOperationRoute({
        method: "POST",
        path: "/public/operations/contact-message/submit",
      }),
    ).toEqual({
      entityName: "contact-message",
      operationName: "submit",
      path: "/public/operations/contact-message/submit",
    });
    expect(
      selectPublicOperationRoute({
        method: "POST",
        path: "/public/operations/contact%2Fmessage/submit%20request",
      }),
    ).toEqual({
      entityName: "contact/message",
      operationName: "submit request",
      path: "/public/operations/contact%2Fmessage/submit%20request",
    });
  });

  it("ignores non-public-operation routes", () => {
    expect(
      selectPublicOperationRoute({
        method: "GET",
        path: "/public/operations/contact-message/submit",
      }),
    ).toBeUndefined();
    expect(
      selectPublicOperationRoute({ method: "POST", path: "/public/operations" }),
    ).toBeUndefined();
  });

  it("rejects invalid public operation route suffix shape", () => {
    const message = "Public operation route must use /public/operations/:entity/:operation.";
    expectBadPublicOperationRoute("/public/operations/contact-message", message);
    expectBadPublicOperationRoute("/public/operations/contact-message/submit/extra", message);
    expectBadPublicOperationRoute("/public/operations//submit", message);
    expectBadPublicOperationRoute("/public/operations/contact-message/", message);
  });

  it("rejects invalid public operation path encoding", () => {
    const message = "Public operation route segments must be valid URL path text.";
    expectBadPublicOperationRoute("/public/operations/contact-message/%", message);
    expectBadPublicOperationRoute("/public/operations/%E0%A4%A/submit", message);
  });

  it("rejects empty decoded public operation entity and operation segments", () => {
    const message = "Public operation entity and operation must be non-empty.";
    expectBadPublicOperationRoute("/public/operations/%20/submit", message);
    expectBadPublicOperationRoute("/public/operations/contact-message/%20", message);
  });
});

function expectBadPublicOperationRoute(path: string, message: string): void {
  try {
    selectPublicOperationRoute({ method: "POST", path });
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toBe(message);
    return;
  }
  throw new Error(`Expected bad public operation route for ${path}.`);
}
