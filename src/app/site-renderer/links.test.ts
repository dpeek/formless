import { describe, expect, it } from "vite-plus/test";
import { profileAwareSiteHref, sitePagePathForSlug } from "./links.ts";

describe("site renderer links", () => {
  it("renders preview links through the public preview route", () => {
    expect(profileAwareSiteHref("/", "preview")).toBe("/pages/home");
    expect(profileAwareSiteHref("/blog", "preview")).toBe("/pages/blog");
    expect(profileAwareSiteHref("/blog/post?draft=1#top", "preview")).toBe(
      "/pages/blog/post?draft=1#top",
    );
  });

  it("renders published links at top-level paths", () => {
    expect(sitePagePathForSlug("home", "published")).toBe("/");
    expect(profileAwareSiteHref("/", "published")).toBe("/");
    expect(profileAwareSiteHref("/blog", "published")).toBe("/blog");
    expect(profileAwareSiteHref("/pages/blog", "published")).toBe("/blog");
  });

  it("leaves external links unchanged", () => {
    expect(profileAwareSiteHref("https://example.com/page", "preview")).toBe(
      "https://example.com/page",
    );
    expect(profileAwareSiteHref("https://example.com/page", "published")).toBe(
      "https://example.com/page",
    );
  });
});
