import { describe, expect, it } from "vite-plus/test";
import { profileAwareSiteHref, siteHrefMatchesRoute, sitePagePathForSlug } from "./links.ts";

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

  it("renders authoring links at top-level paths", () => {
    expect(sitePagePathForSlug("home", "authoring")).toBe("/");
    expect(profileAwareSiteHref("/", "authoring")).toBe("/");
    expect(profileAwareSiteHref("/blog", "authoring")).toBe("/blog");
    expect(profileAwareSiteHref("/pages/blog", "authoring")).toBe("/blog");
  });

  it("renders installed Site links under the selected install route", () => {
    expect(sitePagePathForSlug("home", "installed", "/sites/personal")).toBe("/sites/personal");
    expect(sitePagePathForSlug("blog/post", "installed", "/sites/personal")).toBe(
      "/sites/personal/blog/post",
    );
    expect(profileAwareSiteHref("/", "installed", "/sites/personal")).toBe("/sites/personal");
    expect(profileAwareSiteHref("/blog", "installed", "/sites/personal")).toBe(
      "/sites/personal/blog",
    );
    expect(profileAwareSiteHref("/pages/blog", "installed", "/sites/personal")).toBe(
      "/sites/personal/blog",
    );
  });

  it("leaves external links unchanged", () => {
    expect(profileAwareSiteHref("https://example.com/page", "preview")).toBe(
      "https://example.com/page",
    );
    expect(profileAwareSiteHref("https://example.com/page", "authoring")).toBe(
      "https://example.com/page",
    );
    expect(profileAwareSiteHref("https://example.com/page", "published")).toBe(
      "https://example.com/page",
    );
    expect(profileAwareSiteHref("https://example.com/page", "installed", "/sites/personal")).toBe(
      "https://example.com/page",
    );
  });

  it("matches public route state for header navigation active links", () => {
    expect(siteHrefMatchesRoute("/pages/home", "home")).toBe(true);
    expect(siteHrefMatchesRoute("/", "blog")).toBe(false);
    expect(siteHrefMatchesRoute("/pages/blog", "blog/shipping-schema-backed-authoring")).toBe(true);
    expect(siteHrefMatchesRoute("/projects", "projects/future-detail")).toBe(true);
    expect(siteHrefMatchesRoute("/sites/personal/blog", "blog/post", "/sites/personal")).toBe(true);
    expect(siteHrefMatchesRoute("/sites/docs/blog", "blog/post", "/sites/personal")).toBe(false);
    expect(siteHrefMatchesRoute("https://example.com/page", "home")).toBe(false);
  });
});
