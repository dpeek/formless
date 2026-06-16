import { describe, expect, it } from "vite-plus/test";

import {
  cloudflareRedirectRuleExpressionForRequestUrl,
  cloudflareRedirectRuleTargetExpressionForTargetUrl,
} from "./cloudflare-redirect-rules.ts";

describe("Cloudflare redirect rule helpers", () => {
  it("builds dynamic redirect expressions for path-preserving host redirects", () => {
    expect(cloudflareRedirectRuleExpressionForRequestUrl("https://www.dpeek.com/*")).toBe(
      'http.host == "www.dpeek.com" and ssl',
    );
    expect(cloudflareRedirectRuleTargetExpressionForTargetUrl("https://dpeek.com/${1}")).toBe(
      'concat("https://dpeek.com", http.request.uri.path)',
    );
  });
});
