// @vitest-environment jsdom

import { act, fireEvent, render, waitFor, type RenderResult } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  SiteBlockNode,
  SitePageFrame,
  SitePlacementNode,
  SitePublicBlockType,
  SitePublicOperationInputFieldNode,
  SitePublicRendererProps,
} from "@dpeek/formless-site-app";

import {
  createSiteBlockFixture,
  createSiteMediaFixture,
  createSitePlacementFixture,
  createUnknownSiteBlockFixture,
  publicSiteRendererPropsFixture,
} from "../fixtures/public-site.ts";
import { publicSiteMultipleFormFixtureLayout } from "../fixtures/public-site-forms.ts";
import { AstryxSitePageFixtureRenderer } from "./site-fixture.tsx";
import { FormlessSitePageRenderer } from "./site.tsx";
import { FormlessSiteSystemStateRenderer } from "./site-system-state.tsx";

const viewport = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@dpeek/formless-site-app/public/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dpeek/formless-site-app/public/react")>();

  return {
    ...actual,
    SitePublicTurnstileChallenge: ({
      onTokenChange,
      resetSignal,
      siteKey,
    }: {
      onTokenChange: (token: string) => void;
      resetSignal: number;
      siteKey: string;
    }) =>
      createElement("input", {
        "data-component": "SitePublicTurnstileChallenge",
        "data-reset-signal": resetSignal,
        "data-sitekey": siteKey,
        onChange: (event: { currentTarget: { value: string } }) =>
          onTokenChange(event.currentTarget.value),
        type: "text",
      }),
  };
});

vi.mock("@astryxdesign/core/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@astryxdesign/core/hooks")>()),
  useMediaQuery: () => viewport.isMobile,
}));

vi.mock("./field-primitives.tsx", () => ({
  SourceIcon: ({ color, source }: { color?: string; source?: string }) =>
    createElement("span", {
      "data-color": color,
      "data-component": "SourceIcon",
      "data-source": source,
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Astryx public Site page shell", () => {
  it("renders ordered desktop primary and secondary navigation with route-aware active links", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(componentLabels(renderer, "TopNavItem")).toEqual(["Home", "Work", "Journal", "Contact"]);
    expect(componentByLabel(renderer, "TopNavItem", "Home").getAttribute("href")).toBe(
      "/sites/astryx",
    );
    expect(componentByLabel(renderer, "TopNavItem", "Home").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(componentByLabel(renderer, "TopNavItem", "Work").getAttribute("href")).toBe(
      "/sites/astryx/work",
    );
    expect(componentByLabel(renderer, "TopNavItem", "Contact").getAttribute("href")).toBe(
      "#contact",
    );
    expect(
      renderer.container.querySelector('a[href="/sites/astryx"]:not([data-public-href])'),
    ).not.toBeNull();
    expect(
      Array.from(renderer.container.querySelectorAll("[data-site-navigation-group]"), (node) =>
        node.getAttribute("data-site-navigation-group"),
      ),
    ).toEqual(["primary", "secondary"]);

    await unmount(renderer);
  });

  it("renders footer sections and social links with resolved external behavior", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(
      Array.from(renderer.container.querySelectorAll("[data-site-footer-group]"), (node) =>
        node.getAttribute("data-site-footer-group"),
      ),
    ).toEqual(["section", "social"]);
    const github = required(
      renderer.container.querySelector<HTMLAnchorElement>(
        '[data-public-href="https://github.com/dpeek"]',
      ),
    );
    expect(github.href).toBe("https://github.com/dpeek");
    expect(github.target).toBe("_blank");
    expect(new Set(github.rel.split(" "))).toEqual(new Set(["noreferrer", "noopener"]));
    expect(rendererText(renderer)).toContain(
      "Product design and engineering for teams building ambitious software.",
    );

    await unmount(renderer);
  });

  it("renders mobile primary and secondary groups and closes over external target rules", async () => {
    viewport.isMobile = true;
    const renderer = await renderPage(withExternalHeaderLink(shellRendererProps()));

    const topNav = required(renderer.container.querySelector('nav[aria-label="Header"]'));
    expect(topNav.querySelectorAll("[data-public-href]")).toHaveLength(0);
    const mobileNav = required(renderer.container.querySelector('dialog[aria-label="Header"]'));
    expect(groupLabels(mobileNav)).toEqual(["Primary navigation", "Secondary navigation"]);
    expect(componentLabels(renderer, "SideNavItem")).toEqual([
      "Home",
      "Work",
      "Journal",
      "Contact",
      "Documentation",
    ]);
    const documentation = componentByLabel(renderer, "SideNavItem", "Documentation");
    expect(documentation.getAttribute("href")).toBe("https://example.com/docs");
    expect(documentation.getAttribute("target")).toBe("_blank");
    expect(documentation.getAttribute("rel")).toBe("noreferrer");
    expect(componentByLabel(renderer, "SideNavItem", "Home").getAttribute("aria-current")).toBe(
      "page",
    );

    expect(mobileNav).toHaveProperty("open", false);
    fireEvent.click(required(renderer.container.querySelector('[aria-label="Open navigation"]')));
    expect(mobileNav).toHaveProperty("open", true);

    await unmount(renderer);
  });

  it("applies its local theme control without adding theme facts to renderer props", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(
      renderer.container.querySelector("[data-site-theme]")?.getAttribute("data-site-theme"),
    ).toBe("light");
    const toggle = required(
      renderer.container.querySelector<HTMLButtonElement>('[aria-label="Switch to dark mode"]'),
    );
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    expect(
      renderer.container.querySelector("[data-site-theme]")?.getAttribute("data-site-theme"),
    ).toBe("dark");
    expect(
      renderer.container
        .querySelector('[aria-label="Switch to light mode"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    await unmount(renderer);
  });

  it.each([
    ["header only", { header: publicSiteRendererPropsFixture.tree.frame.header }, true, false],
    ["footer only", { footer: publicSiteRendererPropsFixture.tree.frame.footer }, false, true],
    ["no frame roots", {}, false, false],
  ] as const)(
    "keeps page content available with %s",
    async (_name, frame, hasHeader, hasFooter) => {
      viewport.isMobile = false;
      const renderer = await renderPage(shellRendererProps(frame));

      expect(rendererText(renderer)).toContain("Clear digital products for ambitious teams.");
      expect(renderer.container.querySelector('nav[aria-label="Header"]') !== null).toBe(hasHeader);
      expect(renderer.container.querySelector("[data-site-footer-group]") !== null).toBe(hasFooter);

      await unmount(renderer);
    },
  );
});

describe("Astryx public Site structural blocks", () => {
  it("renders ordered nested page flow with a contiguous heading hierarchy", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "markdown-last",
          3000,
          block("markdown-last", "markdown", "Closing notes", {
            body: "# Closing detail",
          }),
        ),
        placement(
          "hero-first",
          1000,
          block("hero-first", "hero", "A clear opening", {
            body: "First paragraph.\n\nSecond paragraph.",
          }),
        ),
        placement(
          "group-middle",
          2000,
          block("group-middle", "group", "Stored group label", {
            body: "Group context.",
            placements: [
              placement(
                "section-nested",
                1000,
                block("section-nested", "section", "Nested section", {
                  body: "## Section detail",
                  placements: [
                    placement(
                      "metrics-second",
                      2000,
                      block("metrics-second", "metricGrid", "Outcomes", {
                        body: "Measured results.",
                        placements: [
                          placement(
                            "metric-second",
                            2000,
                            block("metric-second", "metric", "24h", {
                              body: "Response time",
                              color: "#0f766e",
                            }),
                          ),
                          placement(
                            "metric-first",
                            1000,
                            block("metric-first", "metric", "98%", {
                              color: "#0369a1",
                            }),
                          ),
                        ],
                      }),
                    ),
                    placement(
                      "cards-first",
                      1000,
                      block("cards-first", "cardGrid", "Capabilities", {
                        body: "A compact set.",
                        placements: [
                          placement("card-second", 2000, block("card-second", "card", "Delivery")),
                          placement(
                            "card-first",
                            1000,
                            block("card-first", "card", "Direction", {
                              body: "# Card detail",
                            }),
                          ),
                        ],
                      }),
                    ),
                  ],
                }),
              ),
            ],
          }),
          { label: "Placed group label" },
        ),
      ]),
    );

    expect(siteBlockTypes(renderer)).toEqual([
      "page",
      "hero",
      "group",
      "section",
      "cardGrid",
      "card",
      "card",
      "metricGrid",
      "metric",
      "metric",
      "markdown",
    ]);
    expect(headingOutline(renderer)).toEqual([
      [1, "Structural page"],
      [2, "A clear opening"],
      [2, "Placed group label"],
      [3, "Nested section"],
      [5, "Section detail"],
      [4, "Capabilities"],
      [5, "Direction"],
      [6, "Card detail"],
      [5, "Delivery"],
      [4, "Outcomes"],
      [2, "Closing notes"],
      [3, "Closing detail"],
    ]);
    expect(rendererText(renderer)).toContain("First paragraph.");
    expect(rendererText(renderer)).toContain("Second paragraph.");

    await unmount(renderer);
  });

  it("uses valid feature slots and ignores invalid or unknown blocks", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "feature",
          1000,
          block("feature", "feature", "Feature story", {
            alignment: "right",
            body: "# Feature detail",
            placements: [
              placement(
                "feature-default",
                5000,
                block("feature-default", "group", "Follow-up", {
                  placements: [],
                }),
              ),
              placement(
                "feature-media",
                3000,
                block("feature-image", "image", "Feature image", {
                  media: createSiteMediaFixture("feature-asset", "/media/feature.webp"),
                }),
                { slot: "media" },
              ),
              placement(
                "feature-action",
                2000,
                block("feature-action", "link", "Read more", {
                  href: "/pages/work",
                }),
                { slot: "actions" },
              ),
              placement(
                "feature-wrong-slot",
                1000,
                block("feature-wrong-slot", "link", "Wrong media type", {
                  href: "/pages/wrong",
                }),
                { slot: "media" },
              ),
              placement(
                "feature-unknown",
                4000,
                createUnknownSiteBlockFixture(
                  "block-feature-unknown",
                  "futureBlock",
                  "Internal projection warning",
                  { body: "Do not expose this fallback." },
                ),
              ),
            ],
          }),
        ),
      ]),
    );

    expect(renderer.container.querySelector('[src="/media/feature.webp"]')).not.toBeNull();
    expect(
      renderer.container.querySelector('[data-public-href="/sites/astryx/work"]'),
    ).not.toBeNull();
    expect(rendererText(renderer)).toContain("Follow-up");
    expect(rendererText(renderer)).not.toContain("Wrong media type");
    expect(rendererText(renderer)).not.toContain("Internal projection warning");
    expect(rendererText(renderer)).not.toContain("Do not expose this fallback.");

    await unmount(renderer);
  });
});

describe("Astryx public Site links, source icons, and media", () => {
  it("uses Site href and target rules for navigation, inline, action, footer, and social links", async () => {
    viewport.isMobile = false;
    const safeIcon = '<svg viewBox="0 0 24 24"><path d="M4 12h16" /></svg>';
    const pageProps = structuralRendererProps([
      placement(
        "inline-internal",
        1000,
        block("inline-internal", "link", "Stored link label", {
          href: "/pages/work#details",
          icon: safeIcon,
        }),
        { label: "Placed link label" },
      ),
      placement(
        "inline-external",
        2000,
        block("inline-external", "link", "External reference", {
          href: "https://example.com/reference",
        }),
      ),
      placement(
        "feature",
        3000,
        block("feature", "feature", "Act now", {
          placements: [
            placement(
              "feature-action",
              1000,
              block("feature-action", "link", "Stored action label", {
                href: "/pages/contact",
                icon: safeIcon,
              }),
              { label: "Start now", slot: "actions" },
            ),
          ],
        }),
      ),
    ]);
    const renderer = await renderPage({
      ...pageProps,
      tree: {
        ...pageProps.tree,
        frame: publicSiteRendererPropsFixture.tree.frame,
      },
    });

    expect(componentByLabel(renderer, "TopNavItem", "Work").getAttribute("href")).toBe(
      "/sites/astryx/work",
    );
    const inlineInternal = required(
      renderer.container.querySelector('[data-public-href="/sites/astryx/work#details"]'),
    );
    expect(rendererText(renderer)).toContain("Placed link label");
    expect(inlineInternal.getAttribute("target")).toBeNull();
    expect(inlineInternal.getAttribute("rel")).toBeNull();
    const inlineExternal = required(
      renderer.container.querySelector('[data-public-href="https://example.com/reference"]'),
    );
    expect(inlineExternal.getAttribute("target")).toBe("_blank");
    expect(new Set(inlineExternal.getAttribute("rel")?.split(" "))).toEqual(
      new Set(["noreferrer", "noopener"]),
    );

    const action = componentByLabel(renderer, "Button", "Start now");
    expect(action.getAttribute("href")).toBe("/sites/astryx/contact");
    expect(action.getAttribute("data-site-action-link")).toBe("true");
    expect(
      Array.from(action.querySelectorAll<HTMLElement>("[data-source]")).find(
        (node) => node.getAttribute("data-source") === safeIcon,
      ),
    ).toBeDefined();

    const social = required(
      renderer.container.querySelector<HTMLAnchorElement>(
        'a[data-public-href="https://github.com/dpeek"]',
      ),
    );
    expect(social.getAttribute("data-site-social-link")).toBe("true");
    expect(social.getAttribute("aria-label")).toBe("GitHub");
    expect(social.target).toBe("_blank");
    expect(new Set(social.rel.split(" "))).toEqual(new Set(["noreferrer", "noopener"]));
    expect(social.querySelector('[data-source="github"]')).not.toBeNull();

    await unmount(renderer);
  });

  it("renders projected media with dimensions, semantic slots, and missing states", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "delivered-image",
          1000,
          block("delivered-image", "image", "Delivered image", {
            height: 900,
            href: "https://example.com/manual-image.jpg",
            media: createSiteMediaFixture("asset-delivered", "/media/delivered.webp"),
            width: 1600,
          }),
        ),
        placement(
          "missing-image",
          2000,
          block("missing-image", "image", "Missing image", {
            href: "https://example.com/manual-missing.jpg",
          }),
        ),
        placement(
          "feature",
          3000,
          block("feature-media", "feature", "Feature media", {
            placements: [
              placement(
                "feature-image",
                1000,
                block("feature-image", "image", "Feature delivery", {
                  media: createSiteMediaFixture("asset-feature", "/media/feature.webp"),
                }),
                { slot: "media" },
              ),
            ],
          }),
        ),
        placement(
          "summary",
          4000,
          block("summary", "post", "Summary with missing primary image", {
            placements: [
              placement(
                "summary-primary",
                1000,
                block("summary-primary", "image", "Missing summary image"),
                { slot: "primaryImage" },
              ),
            ],
          }),
        ),
      ]),
    );

    const delivered = required(
      renderer.container.querySelector<HTMLImageElement>('img[src="/media/delivered.webp"]'),
    );
    expect(delivered.width).toBe(1600);
    expect(delivered.height).toBe(900);
    expect(
      renderer.container.querySelector('[src="https://example.com/manual-image.jpg"]'),
    ).toBeNull();
    expect(
      renderer.container.querySelector('[src="https://example.com/manual-missing.jpg"]'),
    ).toBeNull();
    expect(renderer.container.querySelector('[aria-label="Missing image"]')).not.toBeNull();
    expect(renderer.container.querySelector('[src="/media/feature.webp"]')).not.toBeNull();
    const summaryPrimary = required(
      renderer.container.querySelector('[data-site-primary-image="summary"]'),
    );
    expect(
      summaryPrimary.querySelector('[data-site-image-missing="true"]')?.getAttribute("aria-label"),
    ).toBe("Missing summary image");

    await unmount(renderer);
  });

  it("renders post-detail primary media once and excludes it from normal body flow", async () => {
    viewport.isMobile = false;
    const base = shellRendererProps({});
    const renderer = await renderPage({
      ...base,
      tree: {
        ...base.tree,
        frame: {},
        page: block("post-detail", "post", "A detailed post", {
          placements: [
            placement(
              "post-primary",
              1000,
              block("post-primary", "image", "Post cover", {
                height: 1200,
                media: createSiteMediaFixture("asset-post", "/media/post.webp"),
                width: 1800,
              }),
              { slot: "primaryImage" },
            ),
            placement(
              "post-body",
              2000,
              block("post-body", "markdown", "Body", { body: "Post body." }),
            ),
          ],
        }),
        route: { kind: "post", slug: "journal/detailed-post" },
      },
    });

    expect(
      renderer.container.querySelectorAll('[data-site-primary-image="post-detail"]'),
    ).toHaveLength(1);
    expect(renderer.container.querySelectorAll('[src="/media/post.webp"]')).toHaveLength(1);
    expect(renderer.container.querySelectorAll('[data-media-asset-id="asset-post"]')).toHaveLength(
      1,
    );
    expect(rendererText(renderer)).toContain("Post body.");

    await unmount(renderer);
  });
});

describe("Astryx public Site lists, summaries, and post detail", () => {
  it("renders ordered query summaries, empty states, dates, media, and installed links", async () => {
    viewport.isMobile = false;
    const firstPost = block("first-post", "post", "First projected post", {
      body: "First post summary.",
      date: "2026-07-12",
      href: "/pages/blog/first-post",
      placements: [
        placement(
          "first-post-primary",
          1000,
          block("first-post-image", "image", "First post cover", {
            media: createSiteMediaFixture("asset-first-post", "/media/first-post.webp"),
          }),
          { slot: "primaryImage" },
        ),
      ],
    });
    const secondPost = block("second-post", "post", "Second projected post", {
      body: "Second post summary.",
      date: "2026-07-05",
      href: "/pages/blog/second-post",
    });
    const project = block("project", "project", "Projected project", {
      body: "Project body with a [nested reference](https://example.com/reference).",
      date: "2026-07-01",
      href: "/pages/projects/projected-project",
    });
    const renderer = await renderPage(
      structuralRendererProps([
        placement(
          "posts",
          1000,
          block("posts", "postList", "Latest posts", {
            query: { key: "postList", items: [firstPost, secondPost] },
          }),
        ),
        placement(
          "projects",
          2000,
          block("projects", "projectList", "Projects", {
            query: { key: "projectList", items: [project] },
          }),
        ),
        placement(
          "empty-posts",
          3000,
          block("empty-posts", "postList", "Post archive", {
            query: { key: "postList", items: [] },
          }),
        ),
        placement("empty-projects", 4000, block("empty-projects", "projectList", "Archive")),
      ]),
    );

    expect(
      Array.from(renderer.container.querySelectorAll("[data-site-summary-id]"), (node) =>
        node.getAttribute("data-site-summary-id"),
      ),
    ).toEqual([firstPost.id, secondPost.id, project.id]);
    expect(
      renderer.container.querySelector(
        'a[data-site-summary-link="post"][href="/sites/astryx/blog/first-post"]',
      ),
    ).not.toBeNull();
    expect(
      renderer.container.querySelector(
        'a[data-site-summary-link="project"][href="/sites/astryx/projects/projected-project"]',
      ),
    ).not.toBeNull();
    expect(
      Array.from(renderer.container.querySelectorAll("time"), (node) =>
        node.getAttribute("datetime"),
      ),
    ).toEqual(["2026-07-12", "2026-07-05"]);
    expect(renderer.container.querySelector('time[datetime="2026-07-01"]')).toBeNull();
    expect(renderer.container.querySelector('[data-site-primary-image="summary"]')).not.toBeNull();
    expect(renderer.container.querySelector('[src="/media/first-post.webp"]')).not.toBeNull();
    const projectCard = required(
      renderer.container.querySelector(`[data-site-summary-id="${project.id}"]`),
    );
    expect(
      Array.from(projectCard.querySelectorAll("a"), (node) => node.getAttribute("href")),
    ).toEqual(["/sites/astryx/projects/projected-project", "https://example.com/reference"]);
    const nestedReference = required(
      projectCard.querySelector<HTMLAnchorElement>('a[href="https://example.com/reference"]'),
    );
    expect(nestedReference.target).toBe("_blank");
    expect(new Set(nestedReference.rel.split(" "))).toEqual(new Set(["noreferrer", "noopener"]));
    expect(
      Array.from(renderer.container.querySelectorAll("p"), (node) => node.textContent),
    ).toEqual(expect.arrayContaining(["No published posts yet.", "No published projects yet."]));

    await unmount(renderer);
  });

  it("keeps summary copy out of post detail and renders ordered default body placements", async () => {
    viewport.isMobile = false;
    const base = shellRendererProps({});
    const renderer = await renderPage({
      ...base,
      tree: {
        ...base.tree,
        frame: {},
        page: block("post-detail-flow", "post", "Post detail flow", {
          body: "Summary-only copy must stay out of the detail body.",
          placements: [
            placement(
              "feature-last",
              3000,
              block("feature-last", "feature", "Author note", {
                body: "Author note body.",
              }),
            ),
            placement(
              "detail-first",
              1000,
              block("detail-first", "markdown", "Body", {
                body: "Detail body with a [nested link](https://example.com/detail).",
              }),
            ),
            placement(
              "post-primary",
              500,
              block("post-primary", "image", "Post cover", {
                media: createSiteMediaFixture("asset-detail-post", "/media/detail-post.webp"),
              }),
              { slot: "primaryImage" },
            ),
            placement("group-middle", 2000, block("group-middle", "group", "Middle section")),
            placement(
              "unused-slot",
              1500,
              block("unused-slot", "group", "Slotted summary content"),
              { slot: "summary" },
            ),
          ],
        }),
        route: { kind: "post", slug: "blog/post-detail-flow" },
      },
    });

    expect(siteBlockTypes(renderer)).toEqual(["post", "markdown", "group", "feature"]);
    expect(headingOutline(renderer)[0]).toEqual([1, "Post detail flow"]);
    expect(rendererText(renderer)).not.toContain("Summary-only copy must stay out");
    expect(rendererText(renderer)).not.toContain("Slotted summary content");
    expect(rendererText(renderer)).toContain("Detail body with a");
    expect(renderer.container.querySelector('[href="https://example.com/detail"]')).not.toBeNull();
    expect(
      renderer.container.querySelectorAll('[data-site-primary-image="post-detail"]'),
    ).toHaveLength(1);
    expect(renderer.container.querySelectorAll('[src="/media/detail-post.webp"]')).toHaveLength(1);

    await unmount(renderer);
  });
});

describe("Astryx public Site subscribe and contact forms", () => {
  it("renders the multi-form fixture through canonical sessions without the live challenge adapter", async () => {
    const mounted = render(
      <AstryxSitePageFixtureRenderer fixture={publicSiteMultipleFormFixtureLayout} />,
    );

    expect(publicFormKinds(mounted)).toEqual([
      "subscribe",
      "contact",
      "publicOperation",
      "contact",
    ]);
    expect(
      mounted.container.querySelectorAll('[data-component="SitePublicTurnstileChallenge"]'),
    ).toHaveLength(0);
    expect(
      componentLabels(mounted, "Button").filter((label) => label === "Complete challenge"),
    ).toHaveLength(3);

    await unmount(mounted);
  });

  it("renders configured fixed fields as required controlled Astryx inputs", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      fixedFormRendererProps(
        block("contact-session", "contactForm", "Start a conversation", {
          body: "Tell us what you need.",
          buttonLabel: "Send enquiry",
          emailLabel: "Reply email",
          messageLabel: "Enquiry",
          nameLabel: "Your name",
          publicOperation: fixedPublicOperation("contact"),
        }),
      ),
    );

    expect(fixedFormSurface(renderer, "ready")).toBeDefined();
    expect(rendererText(renderer)).toContain("Start a conversation");
    expect(rendererText(renderer)).toContain("Tell us what you need.");
    expect(rendererText(renderer)).toContain("Your name");
    expect(rendererText(renderer)).toContain("Reply email");
    expect(rendererText(renderer)).toContain("Enquiry");

    const fields = fixedFields(renderer);
    expect(fields.map((field) => field.getAttribute("name"))).toEqual(["name", "email", "message"]);
    expect(fields.every((field) => field.getAttribute("aria-required") === "true")).toBe(true);
    expect(fields.map((field) => (field as HTMLInputElement).value)).toEqual(["", "", ""]);
    expect(componentByLabel(renderer, "Button", "Send enquiry").hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      renderer.container
        .querySelector('[data-public-form-challenge="turnstile"]')
        ?.getAttribute("data-public-form-challenge-ready"),
    ).toBe("false");

    await changeFixedField(renderer, "name", "Ada Lovelace");
    await changeFixedField(renderer, "email", "not-an-email");
    await changeFixedField(renderer, "message", "Please send the details.");

    expect(fixedField(renderer, "name").value).toBe("Ada Lovelace");
    expect(fixedField(renderer, "email").value).toBe("not-an-email");
    expect(fixedField(renderer, "email").getAttribute("aria-invalid")).toBe("true");
    expect(componentByLabel(renderer, "Button", "Send enquiry").hasAttribute("disabled")).toBe(
      true,
    );

    await changeFixedField(renderer, "email", "ada@example.com");
    await solveFixedFormChallenge(renderer, "public-challenge-token");

    expect(fixedField(renderer, "email").value).toBe("ada@example.com");
    expect(fixedField(renderer, "email").getAttribute("aria-invalid")).toBeNull();
    expect(
      renderer.container
        .querySelector('[data-public-form-challenge="turnstile"]')
        ?.getAttribute("data-public-form-challenge-ready"),
    ).toBe("true");
    expect(componentByLabel(renderer, "Button", "Send enquiry").hasAttribute("disabled")).toBe(
      false,
    );

    await unmount(renderer);
  });

  it("renders unavailable fixed forms without a challenge or submit action", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      fixedFormRendererProps(
        block("contact-unavailable", "contactForm", "Archived contact", {
          body: "This route is not available.",
        }),
      ),
    );

    expect(fixedFormSurface(renderer, "unavailable")).toBeDefined();
    expect(rendererText(renderer)).toContain("Contact form unavailable.");
    expect(renderer.container.querySelectorAll("form")).toHaveLength(0);
    expect(
      renderer.container.querySelectorAll('[data-component="SitePublicTurnstileChallenge"]'),
    ).toHaveLength(0);
    expect(componentLabels(renderer, "Button")).toHaveLength(0);

    await unmount(renderer);
  });

  it("dispatches submit and renders pending plus configured success state", async () => {
    viewport.isMobile = false;
    const response = deferred<Response>();
    const fetcher = vi.fn(
      (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => response.promise,
    );
    vi.stubGlobal("fetch", fetcher);
    const renderer = await renderPage(
      fixedFormRendererProps(
        block("subscribe-session", "subscribeForm", "Studio notes", {
          body: "Occasional product notes.",
          buttonLabel: "Join updates",
          publicOperation: fixedPublicOperation("subscribe"),
          successLabel: "You're on the list.",
        }),
      ),
    );

    await changeFixedField(renderer, "email", "reader@example.com");
    await solveFixedFormChallenge(renderer, "public-challenge-token");
    fireEvent.submit(required(renderer.container.querySelector("form")));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/site/public/operations/subscription/subscribe");
    expect(fixedFormSurface(renderer, "submitting")).toBeDefined();
    expect(fixedField(renderer, "email").disabled).toBe(true);
    expect(
      renderer.container
        .querySelector('[data-public-form-challenge="turnstile"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(componentByLabel(renderer, "Button", "Subscribing...").getAttribute("aria-busy")).toBe(
      "true",
    );

    response.resolve(Response.json(publicSubscribeCommandResponse()));
    await waitFor(() => expect(fixedFormSurface(renderer, "success")).toBeDefined());

    expect(fixedFormSurface(renderer, "success")).toBeDefined();
    expect(rendererText(renderer)).toContain("You're on the list.");
    expect(fixedField(renderer, "email").disabled).toBe(true);
    expect(componentLabels(renderer, "Button")).toHaveLength(0);

    await unmount(renderer);
  });

  it("shows only display-safe failure and dispatches retry intent", async () => {
    viewport.isMobile = false;
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: "Please try again later.", internal: "private-provider-failure" },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const renderer = await renderPage(
      fixedFormRendererProps(
        block("subscribe-retry", "subscribeForm", "Studio notes", {
          publicOperation: fixedPublicOperation("subscribe"),
        }),
      ),
    );

    await changeFixedField(renderer, "email", "reader@example.com");
    await solveFixedFormChallenge(renderer, "expired-challenge-token");
    fireEvent.submit(required(renderer.container.querySelector("form")));
    await waitFor(() => expect(fixedFormSurface(renderer, "failed")).toBeDefined());

    expect(fixedFormSurface(renderer, "failed")).toBeDefined();
    expect(rendererText(renderer)).toContain("Please try again later.");
    expect(rendererText(renderer)).not.toContain("private-provider-failure");
    expect(renderer.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(
      renderer.container
        .querySelector('[data-public-form-challenge="turnstile"]')
        ?.getAttribute("data-public-form-challenge-reset"),
    ).toBe("1");

    fireEvent.click(componentByLabel(renderer, "Button", "Try again"));

    expect(fixedFormSurface(renderer, "ready")).toBeDefined();
    expect(rendererText(renderer)).not.toContain("Please try again later.");
    expect(componentByLabel(renderer, "Button", "Subscribe").hasAttribute("disabled")).toBe(true);

    await unmount(renderer);
  });
});

describe("Astryx public Site generic operation form", () => {
  it("validates controlled scalar fields before enabling submission", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      genericFormRendererProps(
        block("generic-controls", "publicOperationForm", "Request a review", {
          body: "Share the request details.",
          buttonLabel: "Send request",
          publicOperation: genericPublicOperation(genericOperationFields()),
        }),
      ),
    );

    expect(publicOperationFormSurface(renderer, "ready")).toBeDefined();
    expect(publicOperationFields(renderer)).toHaveLength(9);
    expect(
      publicOperationControl(renderer, "name", "TextInput").getAttribute("aria-required"),
    ).toBe("true");
    expect(publicOperationControl(renderer, "details", "TextArea")).toBeDefined();
    expect(
      (publicOperationControl(renderer, "approved", "CheckboxInput") as HTMLInputElement).checked,
    ).toBe(false);
    expect(publicOperationControl(renderer, "requestedOn", "DateInput")).toBeDefined();
    expect(publicOperationControl(renderer, "quantity", "TextInput")).toBeDefined();
    expect(publicOperationControl(renderer, "tier", "Selector")).toBeDefined();
    expect(publicOperationControl(renderer, "email", "TextInput").getAttribute("type")).toBe(
      "email",
    );
    expect(publicOperationControl(renderer, "phone", "TextInput").getAttribute("inputmode")).toBe(
      "tel",
    );
    expect(publicOperationControl(renderer, "topic", "Typeahead")).toBeDefined();
    expect(componentByLabel(renderer, "Button", "Send request").hasAttribute("disabled")).toBe(
      true,
    );

    await changePublicOperationField(renderer, "name", "Ada Lovelace");
    await changePublicOperationField(renderer, "details", "Review the public page.");
    await changePublicOperationField(renderer, "approved", true);
    await changePublicOperationField(renderer, "requestedOn", "2026-07-31");
    await changePublicOperationField(renderer, "quantity", "many");
    await changePublicOperationField(renderer, "tier", "enterprise");
    await changePublicOperationField(renderer, "email", "not-an-email");
    await changePublicOperationField(renderer, "phone", "+61 400 000 000");
    await changePublicOperationField(renderer, "topic", "Custom research");
    await solvePublicOperationChallenge(renderer, "public-challenge-token");

    expect(
      (publicOperationControl(renderer, "quantity", "TextInput") as HTMLInputElement).value,
    ).toBe("many");
    expect(
      publicOperationControl(renderer, "quantity", "TextInput").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      publicOperationControl(renderer, "email", "TextInput").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(rendererText(renderer)).toContain("Enter a finite number.");
    expect(rendererText(renderer)).toContain("Enter an email address like name@example.com.");
    expect(
      publicOperationField(renderer, "topic").querySelector<HTMLInputElement>(
        'input[name="topic"][type="hidden"]',
      )?.value,
    ).toBe("Custom research");
    expect(componentByLabel(renderer, "Button", "Send request").hasAttribute("disabled")).toBe(
      true,
    );

    await changePublicOperationField(renderer, "quantity", "12.5");
    await changePublicOperationField(renderer, "email", "ada@example.com");

    expect(
      (publicOperationControl(renderer, "quantity", "TextInput") as HTMLInputElement).value,
    ).toBe("12.5");
    expect(
      publicOperationControl(renderer, "quantity", "TextInput").getAttribute("aria-invalid"),
    ).toBeNull();
    expect(componentByLabel(renderer, "Button", "Send request").hasAttribute("disabled")).toBe(
      false,
    );

    await unmount(renderer);
  });

  it("dispatches ready submission and renders pending plus configured success", async () => {
    viewport.isMobile = false;
    const response = deferred<Response>();
    const fetcher = vi.fn(
      (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => response.promise,
    );
    vi.stubGlobal("fetch", fetcher);
    const renderer = await renderPage(
      genericFormRendererProps(
        block("generic-success", "publicOperationForm", "Product request", {
          buttonLabel: "Submit request",
          publicOperation: genericPublicOperation([
            { name: "title", label: "Title", required: true, control: "text" },
          ]),
          successLabel: "Request received.",
        }),
      ),
    );

    await changePublicOperationField(renderer, "title", "Public launch review");
    await solvePublicOperationChallenge(renderer, "public-challenge-token");
    fireEvent.submit(required(renderer.container.querySelector("form")));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/site/public/operations/request/submit");
    expect(publicOperationFormSurface(renderer, "submitting")).toBeDefined();
    expect(publicOperationControl(renderer, "title", "TextInput").hasAttribute("disabled")).toBe(
      true,
    );
    expect(publicOperationControl(renderer, "title", "TextInput").getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(
      renderer.container
        .querySelector('[data-public-form-challenge="turnstile"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(componentByLabel(renderer, "Button", "Sending...").getAttribute("aria-busy")).toBe(
      "true",
    );

    response.resolve(Response.json(publicGenericCommandResponse()));
    await waitFor(() => expect(publicOperationFormSurface(renderer, "success")).toBeDefined());

    expect(publicOperationFormSurface(renderer, "success")).toBeDefined();
    expect(rendererText(renderer)).toContain("Request received.");
    expect(componentLabels(renderer, "Button")).toHaveLength(0);

    await unmount(renderer);
  });

  it("shows display-safe failure, resets challenge, and dispatches retry", async () => {
    viewport.isMobile = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Please try the request again.", internal: "private-operation-failure" },
          { status: 503 },
        ),
      ),
    );
    const renderer = await renderPage(
      genericFormRendererProps(
        block("generic-failure", "publicOperationForm", "Product request", {
          publicOperation: genericPublicOperation([
            { name: "title", label: "Title", required: true, control: "text" },
          ]),
        }),
      ),
    );

    await changePublicOperationField(renderer, "title", "Retry this request");
    await solvePublicOperationChallenge(renderer, "expired-challenge-token");
    fireEvent.submit(required(renderer.container.querySelector("form")));
    await waitFor(() => expect(publicOperationFormSurface(renderer, "failed")).toBeDefined());

    expect(publicOperationFormSurface(renderer, "failed")).toBeDefined();
    expect(rendererText(renderer)).toContain("Please try the request again.");
    expect(rendererText(renderer)).not.toContain("private-operation-failure");
    expect(renderer.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(
      renderer.container
        .querySelector('[data-public-form-challenge="turnstile"]')
        ?.getAttribute("data-public-form-challenge-reset"),
    ).toBe("1");

    fireEvent.click(componentByLabel(renderer, "Button", "Try again"));

    expect(publicOperationFormSurface(renderer, "ready")).toBeDefined();
    expect(rendererText(renderer)).not.toContain("Please try the request again.");
    expect(componentByLabel(renderer, "Button", "Submit").hasAttribute("disabled")).toBe(true);

    await unmount(renderer);
  });

  it("renders unavailable state without fields, challenge, or action", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(
      genericFormRendererProps(
        block("generic-unavailable", "publicOperationForm", "Archived request", {
          body: "This request is no longer available.",
        }),
      ),
    );

    expect(publicOperationFormSurface(renderer, "unavailable")).toBeDefined();
    expect(rendererText(renderer)).toContain("Public operation form unavailable.");
    expect(renderer.container.querySelectorAll("form")).toHaveLength(0);
    expect(renderer.container.querySelectorAll('[data-public-field-name="title"]')).toHaveLength(0);
    expect(
      renderer.container.querySelectorAll('[data-component="SitePublicTurnstileChallenge"]'),
    ).toHaveLength(0);
    expect(componentLabels(renderer, "Button")).toHaveLength(0);

    await unmount(renderer);
  });
});

describe("Astryx public Site system states", () => {
  it.each([
    ["loading", { kind: "loading", slug: "home" }, "Loading site page...", "Loading home."],
    [
      "not-found",
      { kind: "not-found", slug: "missing", homeHref: "/sites/astryx" },
      "Page not found",
      "No site page exists for missing.",
    ],
    [
      "failure",
      { kind: "failure", slug: "journal", message: "Tree unavailable" },
      "Site page failed to load",
      "journal: Tree unavailable",
    ],
  ] as const)("renders the browser %s state", async (kind, props, title, detail) => {
    const mounted = render(<FormlessSiteSystemStateRenderer {...props} />);

    expect(
      mounted.container.querySelector('[data-astryx-public-site-provider="true"]'),
    ).not.toBeNull();
    expect(mounted.container.querySelector(`[data-site-system-state="${kind}"]`)).not.toBeNull();
    expect(rendererText(mounted)).toContain(title);
    expect(rendererText(mounted)).toContain(detail);
    if (kind === "not-found") {
      expect(mounted.container.querySelector('[href="/sites/astryx"]')).not.toBeNull();
    }
    if (kind === "failure") {
      expect(mounted.container.querySelector('[role="alert"]')).not.toBeNull();
    }

    await unmount(mounted);
  });

  it.each([
    ["not-found", { kind: "not-found", slug: "worker-missing", homeHref: "/" }, "Page not found"],
    [
      "failure",
      { kind: "failure", slug: "worker-error", message: "Projection failed" },
      "Site page failed to load",
    ],
  ] as const)("renders the Worker %s body without owning its document", (_kind, props, title) => {
    const html = renderToStaticMarkup(<FormlessSiteSystemStateRenderer {...props} />);

    expect(html).toContain(title);
    expect(html).toContain("data-astryx-public-site-provider");
    expect(html).toContain(`data-site-system-state="${props.kind}"`);
    expect(html).not.toContain("<html");
  });
});

function shellRendererProps(
  frame: SitePageFrame = publicSiteRendererPropsFixture.tree.frame,
): SitePublicRendererProps {
  return {
    ...publicSiteRendererPropsFixture,
    tree: {
      ...publicSiteRendererPropsFixture.tree,
      frame,
      page: {
        ...publicSiteRendererPropsFixture.tree.page,
        body: undefined,
        placements: [],
      },
    },
  };
}

function structuralRendererProps(placements: SitePlacementNode[]): SitePublicRendererProps {
  return {
    ...shellRendererProps({}),
    tree: {
      ...publicSiteRendererPropsFixture.tree,
      frame: {},
      page: block("structural-page", "page", "Structural page", {
        body: "Page introduction.",
        placements,
      }),
    },
  };
}

function fixedFormRendererProps(formBlock: SiteBlockNode): SitePublicRendererProps {
  const props = shellRendererProps({});

  return {
    ...props,
    tree: {
      ...props.tree,
      page: block("fixed-form-page", "page", "Contact", {
        placements: [placement("fixed-form", 1000, formBlock)],
      }),
    },
  };
}

function genericFormRendererProps(formBlock: SiteBlockNode): SitePublicRendererProps {
  return fixedFormRendererProps(formBlock);
}

function genericOperationFields(): SitePublicOperationInputFieldNode[] {
  return [
    { name: "name", label: "Name", required: true, control: "text" },
    { name: "details", label: "Details", required: false, control: "longText" },
    { name: "approved", label: "Approved", required: false, control: "boolean" },
    { name: "requestedOn", label: "Requested on", required: true, control: "date" },
    { name: "quantity", label: "Quantity", required: true, control: "number" },
    {
      name: "tier",
      label: "Tier",
      required: true,
      control: "enum",
      options: [
        { value: "standard", label: "Standard" },
        { value: "enterprise", label: "Enterprise" },
      ],
    },
    { name: "email", label: "Email", required: true, control: "text", format: "email" },
    { name: "phone", label: "Phone", required: true, control: "text", format: "phone" },
    {
      name: "topic",
      label: "Topic",
      required: true,
      control: "text",
      suggestions: ["Research", "Delivery"],
    },
  ];
}

function genericPublicOperation(
  fields: SitePublicOperationInputFieldNode[],
): NonNullable<SiteBlockNode["publicOperation"]> {
  return {
    entityName: "request",
    operationName: "submit",
    canonicalKey: "request.submit",
    route: "/api/site/public/operations/request/submit",
    challenge: {
      kind: "turnstile",
      siteKey: "public-site-key",
    },
    fields,
  };
}

function fixedPublicOperation(
  kind: "contact" | "subscribe",
): NonNullable<SiteBlockNode["publicOperation"]> {
  const entityName = kind === "subscribe" ? "subscription" : "contactMessage";
  const operationName = kind === "subscribe" ? "subscribe" : "send";

  return {
    entityName,
    operationName,
    canonicalKey: `${entityName}.${operationName}`,
    route: `/api/site/public/operations/${entityName}/${operationName}`,
    challenge: {
      kind: "turnstile",
      siteKey: "public-site-key",
    },
  };
}

function publicSubscribeCommandResponse() {
  return {
    invocationId: "operation-1",
    operation: {
      entityName: "subscription",
      operationName: "subscribe",
      canonicalKey: "subscription.subscribe",
      kind: "command",
    },
    output: {
      type: "command",
      affectedChangeIds: ["change-1"],
      cursor: 12,
    },
    status: "committed",
  };
}

function publicGenericCommandResponse() {
  return {
    invocationId: "operation-generic-1",
    operation: {
      entityName: "request",
      operationName: "submit",
      canonicalKey: "request.submit",
      kind: "command",
    },
    output: {
      type: "command",
      affectedChangeIds: ["change-generic-1"],
      cursor: 24,
    },
    status: "committed",
  };
}

function fixedFormSurface(renderer: RenderResult, status: string): HTMLElement {
  return required(
    renderer.container.querySelector<HTMLElement>(
      `[data-public-form-state="${status}"][data-public-form-kind]`,
    ),
  );
}

function fixedFields(renderer: RenderResult): HTMLElement[] {
  return Array.from(
    renderer.container.querySelectorAll<HTMLElement>(
      "input[data-public-fixed-field], textarea[data-public-fixed-field]",
    ),
  );
}

function fixedField(renderer: RenderResult, name: string): HTMLInputElement | HTMLTextAreaElement {
  return required(
    renderer.container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `input[data-public-fixed-field="${name}"], textarea[data-public-fixed-field="${name}"]`,
    ),
  );
}

async function changeFixedField(renderer: RenderResult, name: string, value: string) {
  fireEvent.change(fixedField(renderer, name), { target: { value } });
}

async function solveFixedFormChallenge(renderer: RenderResult, token: string) {
  fireEvent.change(
    required(
      renderer.container.querySelector<HTMLInputElement>(
        '[data-component="SitePublicTurnstileChallenge"]',
      ),
    ),
    { target: { value: token } },
  );
}

function publicOperationFormSurface(renderer: RenderResult, status: string): HTMLElement {
  return required(
    renderer.container.querySelector<HTMLElement>(
      `[data-public-form-kind="publicOperation"][data-public-form-state="${status}"]`,
    ),
  );
}

function publicOperationFields(renderer: RenderResult): HTMLElement[] {
  return Array.from(renderer.container.querySelectorAll<HTMLElement>("[data-public-field-name]"));
}

function publicOperationField(renderer: RenderResult, name: string): HTMLElement {
  return required(
    renderer.container.querySelector<HTMLElement>(`[data-public-field-name="${name}"]`),
  );
}

function publicOperationControl(
  renderer: RenderResult,
  name: string,
  component: string,
): HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement {
  const selectors: Record<string, string> = {
    CheckboxInput: 'input[type="checkbox"]',
    DateInput: 'input[role="combobox"]',
    Selector: 'button[role="combobox"]',
    TextArea: "textarea",
    TextInput: 'input:not([type="hidden"])',
    Typeahead: 'input[role="combobox"]',
  };

  return required(
    publicOperationField(renderer, name).querySelector<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
    >(required(selectors[component])),
  );
}

async function changePublicOperationField(
  renderer: RenderResult,
  name: string,
  value: string | boolean,
) {
  const field = publicOperationField(renderer, name);
  const controlKind = field.getAttribute("data-public-field-control");

  if (controlKind === "boolean") {
    const control = required(field.querySelector<HTMLInputElement>('input[type="checkbox"]'));
    if (control.checked !== value) {
      fireEvent.click(control);
    }
    return;
  }

  if (controlKind === "enum") {
    fireEvent.click(required(field.querySelector<HTMLButtonElement>('button[role="combobox"]')));
    const option = Array.from(field.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (candidate) => candidate.textContent?.trim().toLowerCase() === String(value).toLowerCase(),
    );
    fireEvent.click(required(option));
    return;
  }

  const control = required(
    field.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'textarea, input[role="combobox"], input:not([type="hidden"])',
    ),
  );

  fireEvent.change(control, {
    target: { value },
  });

  if (controlKind === "date") {
    fireEvent.blur(control);
  }

  if (control.getAttribute("role") === "combobox" && controlKind === "text") {
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
  }
}

async function solvePublicOperationChallenge(renderer: RenderResult, token: string) {
  await solveFixedFormChallenge(renderer, token);
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function block(
  id: string,
  type: SitePublicBlockType,
  label: string,
  options: Parameters<typeof createSiteBlockFixture>[3] = {},
): SiteBlockNode {
  return createSiteBlockFixture(`block-${id}`, type, label, options);
}

function placement(
  id: string,
  order: number,
  child: SiteBlockNode,
  options: Parameters<typeof createSitePlacementFixture>[3] = {},
): SitePlacementNode {
  return createSitePlacementFixture(`placement-${id}`, order, child, options);
}

function withExternalHeaderLink(props: SitePublicRendererProps): SitePublicRendererProps {
  const header = props.tree.frame.header;
  if (!header) {
    throw new Error("Expected header fixture");
  }
  const secondaryIndex = header.placements.findIndex(
    (placement) => placement.block.type === "headerSecondary",
  );
  const secondary = header.placements[secondaryIndex];
  if (!secondary) {
    throw new Error("Expected secondary header group fixture");
  }

  const externalPlacement = {
    id: "placement-header-documentation",
    order: 2000,
    block: {
      id: "block-link-documentation",
      type: "link",
      label: "Documentation",
      href: "https://example.com/docs",
      placements: [],
    },
  };
  const headerPlacements = [...header.placements];
  headerPlacements[secondaryIndex] = {
    ...secondary,
    block: {
      ...secondary.block,
      placements: [...secondary.block.placements, externalPlacement],
    },
  };

  return {
    ...props,
    tree: {
      ...props.tree,
      frame: {
        ...props.tree.frame,
        header: { ...header, placements: headerPlacements },
      },
    },
  };
}

async function renderPage(props: SitePublicRendererProps) {
  return render(<FormlessSitePageRenderer {...props} />);
}

function componentLabels(renderer: RenderResult, component: string): string[] {
  return componentElements(renderer, component).map(accessibleLabel);
}

function publicFormKinds(renderer: RenderResult): string[] {
  return Array.from(renderer.container.querySelectorAll<HTMLElement>("[data-public-form-kind]"))
    .map((node) => node.getAttribute("data-public-form-kind"))
    .filter((kind): kind is string => kind !== null);
}

function componentByLabel(renderer: RenderResult, component: string, label: string): HTMLElement {
  return required(
    componentElements(renderer, component).find((node) => accessibleLabel(node) === label),
  );
}

function componentElements(renderer: RenderResult, component: string): HTMLElement[] {
  const selector =
    component === "TopNavItem"
      ? "[data-site-navigation-group] a"
      : component === "SideNavItem"
        ? "dialog a"
        : "button, a[data-site-action-link]";

  return Array.from(renderer.container.querySelectorAll<HTMLElement>(selector));
}

function accessibleLabel(node: HTMLElement): string {
  return node.getAttribute("aria-label") ?? node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function groupLabels(root: Element): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="group"][aria-labelledby]')).map(
    (group) => {
      const id = group.getAttribute("aria-labelledby");
      return id ? (root.ownerDocument.getElementById(id)?.textContent ?? "") : "";
    },
  );
}

function rendererText(renderer: RenderResult) {
  return renderer.container.textContent ?? "";
}

function siteBlockTypes(renderer: RenderResult): string[] {
  return Array.from(renderer.container.querySelectorAll<HTMLElement>("[data-site-block-type]"))
    .map((node) => node.getAttribute("data-site-block-type"))
    .filter((type): type is string => type !== null);
}

function headingOutline(renderer: RenderResult): Array<[number, string]> {
  return Array.from(
    renderer.container.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6"),
  ).map((node) => {
    const type = node.tagName.toLowerCase();
    const text = node.textContent ?? "";

    return [Number(type.slice(1)), text] as [number, string];
  });
}

async function unmount(renderer: RenderResult) {
  renderer.unmount();
}

function required<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Expected rendered value");
  }
  return value as NonNullable<T>;
}
