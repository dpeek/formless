import { describe, expect, it } from "vite-plus/test";

import {
  PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX,
  PublicOperationRouteError,
  buildPublicOperationRouteSuffix,
  buildPublicOperationTargetRoute,
  decodePublicOperationRouteSegment,
  encodePublicOperationRouteSegment,
  parsePublicOperationRouteSuffix,
  type PublicOperationRouteErrorCode,
} from "./index.ts";

describe("public operation route package", () => {
  it("declares the public operation suffix prefix", () => {
    expect(PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX).toBe("/public/operations");
  });

  it("builds and parses public operation route suffixes", () => {
    const route = buildPublicOperationRouteSuffix({
      entityKey: "contact-message",
      operationKey: "submit",
    });

    expect(route).toBe("/public/operations/contact-message/submit");
    expect(parsePublicOperationRouteSuffix(route)).toEqual({
      entityKey: "contact-message",
      operationKey: "submit",
    });
  });

  it("encodes and decodes route path segments", () => {
    const route = buildPublicOperationRouteSuffix({
      entityKey: "support/request",
      operationKey: "submit invite",
    });

    expect(route).toBe("/public/operations/support%2Frequest/submit%20invite");
    expect(parsePublicOperationRouteSuffix(route)).toEqual({
      entityKey: "support/request",
      operationKey: "submit invite",
    });
    expect(encodePublicOperationRouteSegment("a/b c")).toBe("a%2Fb%20c");
    expect(decodePublicOperationRouteSegment("a%2Fb%20c")).toBe("a/b c");
  });

  it("builds target routes from runtime-owned target API route prefixes", () => {
    expect(
      buildPublicOperationTargetRoute({
        targetApiRoutePrefix: "/api/site",
        entityKey: "subscription",
        operationKey: "subscribe",
      }),
    ).toBe("/api/site/public/operations/subscription/subscribe");

    expect(
      buildPublicOperationTargetRoute({
        targetApiRoutePrefix: "/api/app-installs/site/site",
        entityKey: "contact-message",
        operationKey: "submit",
      }),
    ).toBe("/api/app-installs/site/site/public/operations/contact-message/submit");
  });

  it("rejects invalid suffix shape and extra segments", () => {
    expectRouteError(() => parsePublicOperationRouteSuffix("/public/operations"), "invalid-shape");
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message/submit/extra"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/private/operations/contact-message/submit"),
      "invalid-shape",
    );
  });

  it("rejects empty route segments", () => {
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations//submit"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message/"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/%20/submit"),
      "empty-segment",
    );
    expectRouteError(
      () => buildPublicOperationRouteSuffix({ entityKey: "contact-message", operationKey: " " }),
      "empty-segment",
    );
  });

  it("rejects invalid path escapes", () => {
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/%E0%A4%A/submit"),
      "invalid-escape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message/%"),
      "invalid-escape",
    );
  });
});

function expectRouteError(call: () => unknown, code: PublicOperationRouteErrorCode): void {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(PublicOperationRouteError);
    expect((error as PublicOperationRouteError).code).toBe(code);
    return;
  }

  throw new Error(`Expected public operation route error ${code}.`);
}
