import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { SiteBlockNode, SitePageFrame, SitePageTree, SitePlacementNode } from "../types.ts";
import { PUBLIC_SITE_THEME_STORAGE_KEY, SitePageRenderer } from "./renderer.tsx";

const githubIconSvg =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3 19c.5.1.7-.2.7-.5v-2c-3 .7-3.6-1.2-3.6-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3 .8.1-.7.4-1.1.7-1.4-2.4-.3-5-1.2-5-5.3 0-1.2.4-2.1 1.1-2.9-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1A10 10 0 0 1 12 5.3c.9 0 1.8.1 2.6.4 2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.7 1.1 2.9 0 4.1-2.5 5-5 5.3.4.3.8 1 .8 2v2.8c0 .3.2.6.8.5A10 10 0 0 0 12 2Z"/></svg>';

describe("public Site renderer characterization", () => {
  it("characterizes the page shell, frame chrome, route flow, active links, and theme contract", () => {
    const html = renderSite(
      pageNode("home", [
        placement("page-body", markdownNode("body", "Welcome block", "Page body copy.")),
        placement("page-local-header", blockNode("local-header", "header", "Hidden page header")),
        placement("page-local-footer", blockNode("local-footer", "footer", "Hidden page footer")),
      ]),
    );
    const main = mainHtml(html);

    expect(PUBLIC_SITE_THEME_STORAGE_KEY).toBe("formless:public-site:theme");
    expect(html).toContain('data-site-theme="light"');
    expect(html).toContain("background-color:var(--site-bg)");
    expect(html).toContain("--site-bg:rgb(248 248 248)");
    expect(html).not.toContain("--site-footer-bg");
    expect(html).toContain("--site-link:rgb(137 94 31)");
    expect(html).toContain("flex min-h-dvh flex-col");
    expect(html).toContain("data-site-body");
    const bodyCrease = elementHtml(html, "data-site-body-crease");

    expect(html).toContain("data-site-theme-toggle");
    expect(html).toContain('data-site-theme-icon="light"');
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain("data-site-header");
    expect(html).toContain("fixed inset-x-0 top-0");
    expect(html).toContain('data-site-header-scrolled="false"');
    expect(html).toContain("data-site-header-crease");
    expect(html).toContain("top-full h-2.5");
    expect(html).toContain("data-site-footer");
    expect(bodyCrease).toContain("absolute inset-x-0 -bottom-2.5");
    expect(bodyCrease).toContain("bg-[color:var(--site-bg)]");
    expect(bodyCrease).toContain('data-site-footer-revealed="false"');
    expect(bodyCrease).toContain("background-image:radial-gradient");
    expect(html).toContain("bg-[color:var(--site-bg)]");
    expect(html).toContain("sticky bottom-0");
    expect(html).toContain('aria-label="Header primary"');
    expect(html).toContain('aria-label="Header secondary"');
    expect(html).toContain("data-site-header-mobile-primary");
    expect(html).toContain("data-site-header-mobile-menu");
    expect(linkHtml(html, "/pages/home")).toContain('data-site-nav-active="true"');
    expect(linkHtml(html, "/pages/home")).toContain("text-[color:var(--site-link)]");
    expect(linkHtml(html, "/pages/home")).not.toContain("decoration-dashed");
    expect(linkHtml(html, "/pages/blog")).not.toContain('data-site-nav-active="true"');
    expect(linkHtml(html, "https://github.com/dpeek")).toContain('target="_blank"');
    expect(linkHtml(html, "https://github.com/dpeek")).toContain('rel="noreferrer"');
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(main).toContain("Welcome block");
    expect(main).toContain("Page body copy.");
    expect(main).not.toContain("Hidden page header");
    expect(main).not.toContain("Hidden page footer");
  });

  it("characterizes content block dispatch, placement slots, markdown, media, and action links", () => {
    const feature = blockNode("feature", "feature", "Ship composable blocks", {
      alignment: "right",
      body: "Use **slotted media** with [clear CTAs](https://example.com/feature).",
      placements: [
        placement(
          "feature-media",
          imageNode(
            "feature-image",
            "Feature media",
            {
              assetId: "feature.webp",
              href: "/api/formless/media/media/images/feature.webp",
              kind: "image",
            },
            { href: "https://cdn.example.com/stale.webp" },
          ),
          { slot: "media" },
        ),
        placement(
          "feature-action",
          linkNode("feature-action-link", "Read the guide", "https://example.com/guide"),
          {
            slot: "actions",
          },
        ),
        placement(
          "feature-default",
          markdownNode("feature-default-copy", "Follow-up", "Default child copy."),
        ),
        placement(
          "feature-ignored",
          markdownNode("feature-ignored-copy", "Ignored", "Ignored slot copy."),
          {
            slot: "aside",
          },
        ),
      ],
    });
    const html = renderSite(
      pageNode("home", [
        placement(
          "hero-placement",
          blockNode("hero", "hero", "Hero headline", {
            body: "Hero plain text.",
            placements: [
              placement(
                "hero-media",
                imageNode("hero-image", "Hero media", undefined, {
                  href: "data:image/png;base64,aGVybw==",
                }),
              ),
            ],
          }),
        ),
        placement("feature-placement", feature),
        placement("unuploaded-image", imageNode("pending-image", "Pending upload")),
        placement("unknown-placement", blockNode("unknown", "unsupported", "Unsupported block")),
      ]),
    );
    const actionHtml = linkHtml(html, "https://example.com/guide");

    expect(html).toContain("Hero headline");
    expect(html).toContain("Hero plain text.");
    expect(html).not.toContain('src="data:image/png;base64,aGVybw=="');
    expect(html).toContain('aria-label="Hero media"');
    expect(html).toContain(">Hero media</span>");
    expect(html).toContain('data-block-type="feature"');
    expect(html).toContain('data-site-feature-alignment="right"');
    expect(html).toContain("md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(html).toContain("data-site-feature-media");
    expect(html).toContain("data-site-feature-actions");
    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).toContain("[&amp;_a]:text-[color:var(--site-link)]");
    expect(html).toContain("<strong");
    expect(html).not.toContain("**slotted media**");
    expect(html).toContain('href="https://example.com/feature"');
    expect(actionHtml).toContain("Read the guide");
    expect(actionHtml).toContain("text-[color:var(--site-link)]");
    expect(actionHtml).toContain('target="_blank"');
    expect(actionHtml).toContain('rel="noreferrer"');
    expect(html).toContain('src="/api/formless/media/media/images/feature.webp"');
    expect(html).not.toContain('src="https://cdn.example.com/stale.webp"');
    expect(html).toContain("Default child copy.");
    expect(html).not.toContain("Ignored slot copy.");
    expect(html).toContain('aria-label="Pending upload"');
    expect(html).toContain(">Pending upload</span>");
    expect(html).not.toContain("Unsupported block");
  });

  it("renders subscribe forms with public operation route and Turnstile widget facts", () => {
    const html = renderSite(
      pageNode("home", [
        placement(
          "subscribe-placement",
          blockNode("subscribe-block", "subscribeForm", "Join the list", {
            body: "Get **product notes**.",
            buttonLabel: "Join",
            publicOperation: {
              entityName: "subscription",
              operationName: "subscribe",
              canonicalKey: "subscription.subscribe",
              route: "/api/site/public/operations/subscription/subscribe",
              challenge: {
                kind: "turnstile",
                siteKey: "public-site-key",
              },
            },
          }),
        ),
      ]),
    );

    expect(html).toContain('data-block-type="subscribeForm"');
    expect(html).toContain('data-site-subscribe-form="subscribe-block"');
    expect(html).toContain(
      'data-site-subscribe-route="/api/site/public/operations/subscription/subscribe"',
    );
    expect(html).toContain('action="/api/site/public/operations/subscription/subscribe"');
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain("Join");
    expect(countOccurrences(html, 'class="cf-turnstile"')).toBe(0);
    expect(html).toContain('data-site-turnstile="true"');
    expect(html).toContain('data-sitekey="public-site-key"');
    expect(html).toContain('name="cf-turnstile-response"');
    expect(html).toContain('data-site-turnstile-token="true"');
    expect(html).not.toContain("turnstile/v0/api.js");
    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).not.toContain("server-secret-value");
    expect(html).not.toContain("reader@example.com");
  });

  it("does not render a working subscribe form without projected public operation facts", () => {
    const html = renderSite(
      pageNode("home", [
        placement(
          "subscribe-placement",
          blockNode("subscribe-block", "subscribeForm", "Join the list", {
            operationName: "missingSubscribeAction",
          }),
        ),
      ]),
    );

    expect(html).toContain("Join the list");
    expect(html).toContain("Subscribe form unavailable.");
    expect(html).not.toContain('data-site-subscribe-form="subscribe-block"');
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("turnstile/v0/api.js");
  });

  it("renders contact forms with public operation route and Turnstile widget facts", () => {
    const html = renderSite(
      pageNode("home", [
        placement(
          "contact-placement",
          blockNode("contact-block", "contactForm", "Contact us", {
            body: "Send **details**.",
            buttonLabel: "Send",
            successLabel: "Message received.",
            nameLabel: "Your name",
            emailLabel: "Your email",
            messageLabel: "How can we help?",
            publicOperation: {
              entityName: "contact-message",
              operationName: "submit",
              canonicalKey: "contact-message.submit",
              route: "/api/site/public/operations/contact-message/submit",
              challenge: {
                kind: "turnstile",
                siteKey: "public-site-key",
              },
            },
          }),
        ),
      ]),
    );

    expect(html).toContain('data-block-type="contactForm"');
    expect(html).toContain('data-site-contact-form="contact-block"');
    expect(html).toContain(
      'data-site-contact-route="/api/site/public/operations/contact-message/submit"',
    );
    expect(html).toContain('action="/api/site/public/operations/contact-message/submit"');
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="message"');
    expect(html).toContain('type="email"');
    expect(html).toContain("Your name");
    expect(html).toContain("Your email");
    expect(html).toContain("How can we help?");
    expect(html).toContain("Send");
    expect(countOccurrences(html, 'class="cf-turnstile"')).toBe(0);
    expect(html).toContain('data-site-turnstile="true"');
    expect(html).toContain('data-sitekey="public-site-key"');
    expect(html).toContain('name="cf-turnstile-response"');
    expect(html).toContain('data-site-turnstile-token="true"');
    expect(html).not.toContain("turnstile/v0/api.js");
    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).not.toContain("owner@example.com");
    expect(html).not.toContain("providerMessageId");
  });

  it("keeps Turnstile script and implicit widget markup out of SSR when multiple public forms render", () => {
    const publicSiteKey = "public-site-key";
    const html = renderSite(
      pageNode("home", [
        placement(
          "contact-placement",
          blockNode("contact-block", "contactForm", "Contact us", {
            publicOperation: {
              entityName: "contact-message",
              operationName: "submit",
              canonicalKey: "contact-message.submit",
              route: "/api/site/public/operations/contact-message/submit",
              challenge: { kind: "turnstile", siteKey: publicSiteKey },
            },
          }),
        ),
        placement(
          "subscribe-placement",
          blockNode("subscribe-block", "subscribeForm", "Join", {
            publicOperation: {
              entityName: "subscription",
              operationName: "subscribe",
              canonicalKey: "subscription.subscribe",
              route: "/api/site/public/operations/subscription/subscribe",
              challenge: { kind: "turnstile", siteKey: publicSiteKey },
            },
          }),
        ),
      ]),
    );

    expect(html).not.toContain("turnstile/v0/api.js");
    expect(countOccurrences(html, 'class="cf-turnstile"')).toBe(0);
    expect(countOccurrences(html, 'data-site-turnstile="true"')).toBe(2);
    expect(countOccurrences(html, 'name="cf-turnstile-response"')).toBe(2);
  });

  it("renders public operation forms with projected scalar controls and Turnstile widget facts", () => {
    const html = renderSite(
      pageNode("home", [
        placement(
          "operation-placement",
          blockNode("operation-block", "publicOperationForm", "Request a test", {
            body: "Send **sample details**.",
            buttonLabel: "Submit request",
            successLabel: "Request received.",
            publicOperation: {
              entityName: "intake-request",
              operationName: "submit",
              canonicalKey: "intake-request.submit",
              route: "/api/intake/public/operations/intake-request/submit",
              challenge: {
                kind: "turnstile",
                siteKey: "public-site-key",
              },
              fields: [
                {
                  name: "summary",
                  label: "Summary",
                  required: true,
                  control: "text",
                },
                {
                  name: "replyEmail",
                  label: "Reply email",
                  required: true,
                  control: "text",
                  format: "email",
                  suggestions: ["hello@example.com"],
                },
                {
                  name: "phone",
                  label: "Phone",
                  required: false,
                  control: "text",
                  format: "phone",
                  suggestions: ["+1 555 123 4567"],
                },
                {
                  name: "inquiryType",
                  label: "Inquiry type",
                  required: false,
                  control: "text",
                  suggestions: ["Support", "Sales"],
                },
                {
                  name: "details",
                  label: "Details",
                  required: false,
                  control: "longText",
                },
                {
                  name: "category",
                  label: "Category",
                  required: true,
                  control: "enum",
                  options: [
                    { value: "chemistry", label: "Chemistry" },
                    { value: "materials", label: "Materials" },
                  ],
                },
                {
                  name: "rush",
                  label: "Rush request",
                  required: false,
                  control: "boolean",
                },
                {
                  name: "neededBy",
                  label: "Needed by",
                  required: true,
                  control: "date",
                },
                {
                  name: "sampleCount",
                  label: "Sample count",
                  required: true,
                  control: "number",
                },
              ],
            },
          }),
        ),
      ]),
    );

    expect(html).toContain('data-block-type="publicOperationForm"');
    expect(html).toContain('data-site-public-operation-form="operation-block"');
    expect(html).toContain('data-site-public-operation-key="intake-request.submit"');
    expect(html).toContain(
      'data-site-public-operation-route="/api/intake/public/operations/intake-request/submit"',
    );
    expect(html).toContain('action="/api/intake/public/operations/intake-request/submit"');
    expect(html).toContain('data-site-public-operation-field="summary"');
    expect(html).toContain('name="summary"');
    expect(html).toContain('type="text"');
    expect(html).toContain('data-site-public-operation-field="replyEmail"');
    expect(html).toContain('name="replyEmail"');
    expect(html).toContain('type="email"');
    expect(html).toContain('value="hello@example.com"');
    expect(html).toContain('data-site-public-operation-field="phone"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('type="tel"');
    expect(html).toContain('value="+1 555 123 4567"');
    expect(html).toContain('data-site-public-operation-field="inquiryType"');
    expect(html).toContain('name="inquiryType"');
    expect(html).toContain('value="Support"');
    expect(html).toContain('value="Sales"');
    expect(countOccurrences(html, "<datalist")).toBe(3);
    expect(html).toContain('data-site-public-operation-field="details"');
    expect(html).toContain("<textarea");
    expect(html).toContain('name="details"');
    expect(html).toContain('data-site-public-operation-field="category"');
    expect(html).toContain("<select");
    expect(html).toContain('name="category"');
    expect(html).toContain('value="chemistry"');
    expect(html).toContain("Chemistry");
    expect(html).toContain('data-site-public-operation-field="rush"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="rush"');
    expect(html).toContain('data-site-public-operation-field="neededBy"');
    expect(html).toContain('type="date"');
    expect(html).toContain('name="neededBy"');
    expect(html).toContain('data-site-public-operation-field="sampleCount"');
    expect(html).toContain('data-site-public-operation-control="number"');
    expect(html).toContain('name="sampleCount"');
    expect(html).not.toContain('required=""');
    expect(html).not.toContain(" required");
    expect(html).toContain("Submit request");
    expect(countOccurrences(html, 'class="cf-turnstile"')).toBe(0);
    expect(html).toContain('data-site-turnstile="true"');
    expect(html).toContain('data-sitekey="public-site-key"');
    expect(html).toContain('name="cf-turnstile-response"');
    expect(html).not.toContain("turnstile/v0/api.js");
    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).not.toContain("providerMessageId");
    expect(html).not.toContain("owner@example.com");
  });

  it("does not render a working public operation form without projected public operation facts", () => {
    const html = renderSite(
      pageNode("home", [
        placement(
          "operation-placement",
          blockNode("operation-block", "publicOperationForm", "Request a test", {
            operationKey: "missing.submit",
          }),
        ),
      ]),
    );

    expect(html).toContain("Request a test");
    expect(html).toContain("Public operation form unavailable.");
    expect(html).not.toContain('data-site-public-operation-form="operation-block"');
    expect(html).not.toContain('name="summary"');
    expect(html).not.toContain("turnstile/v0/api.js");
  });

  it("does not render a working contact form without projected public operation facts", () => {
    const html = renderSite(
      pageNode("home", [
        placement(
          "contact-placement",
          blockNode("contact-block", "contactForm", "Contact us", {
            operationName: "missingContactSubmit",
          }),
        ),
      ]),
    );

    expect(html).toContain("Contact us");
    expect(html).toContain("Contact form unavailable.");
    expect(html).not.toContain('data-site-contact-form="contact-block"');
    expect(html).not.toContain('name="message"');
    expect(html).not.toContain("turnstile/v0/api.js");
  });

  it("keeps public Site link icons stored-SVG backed outside header navigation", () => {
    const icon = requiredIconCatalogSvg("github");
    const headerLink = linkNode("header-icon-link", "Header GitHub", "https://example.com/header", {
      icon,
    });
    const footerLink = linkNode("footer-icon-link", "Footer GitHub", "https://example.com/footer", {
      icon,
    });
    const frame: SitePageFrame = {
      header: blockNode("header", "header", "Header", {
        placements: [
          placement(
            "header-primary",
            blockNode("header-primary-block", "headerPrimary", "Primary", {
              placements: [placement("header-icon", headerLink)],
            }),
          ),
        ],
      }),
      footer: blockNode("footer", "footer", "Footer", {
        placements: [
          placement(
            "footer-social",
            blockNode("footer-social-block", "footerSocial", "Social", {
              placements: [placement("footer-icon", footerLink)],
            }),
          ),
        ],
      }),
    };
    const html = renderSite(pageNode("home", []), { frame });

    expect(linkHtml(html, "https://example.com/header")).not.toContain('data-web-svg-icon="svg"');
    expect(linkHtml(html, "https://example.com/footer")).toContain('data-web-svg-icon="svg"');
    expect(linkHtml(html, "https://example.com/footer")).toContain('d="M12 2a10 10 0 0 0-3 19');
  });

  it("characterizes content lists, summary cards, published links, dates, and primary images", () => {
    const post = blockNode("post", "post", "Shipping schema-backed authoring", {
      body: "Summary text.",
      date: "2026-05-13",
      href: "/blog/shipping-schema-backed-authoring",
      placements: [
        placement(
          "post-primary",
          imageNode("post-primary-image", "Post primary", {
            assetId: "post.webp",
            href: "/api/formless/media/media/images/post.webp",
            kind: "image",
          }),
          { slot: "primaryImage" },
        ),
      ],
    });
    const project = blockNode("project", "project", "OpenSurf", {
      body: "Project **summary** body.",
      date: "2026-05-08",
      href: "/projects/opensurf",
      placements: [
        placement(
          "project-primary",
          imageNode("project-primary-image", "Project primary", {
            assetId: "project.webp",
            href: "/api/formless/media/media/images/project.webp",
            kind: "image",
          }),
          { slot: "primaryImage" },
        ),
      ],
    });
    const html = renderSite(
      pageNode("home", [
        placement(
          "post-list-placement",
          blockNode("post-list", "postList", "Latest posts", {
            query: { key: "postList", items: [post] },
          }),
        ),
        placement(
          "project-list-placement",
          blockNode("project-list", "projectList", "Project index", {
            query: { key: "projectList", items: [project] },
          }),
        ),
        placement(
          "empty-list-placement",
          blockNode("empty-post-list", "postList", "Empty posts", {
            query: { key: "postList", items: [] },
          }),
        ),
      ]),
      { linkMode: "published" },
    );
    const postCard = articleHtml(html, "Shipping schema-backed authoring");
    const projectCard = articleHtml(html, "OpenSurf");

    expect(html).toContain('data-site-content-list="postList"');
    expect(html).toContain('data-site-content-list="projectList"');
    expect(postCard).toContain('data-site-summary-link="post"');
    expect(postCard).toContain('href="/blog/shipping-schema-backed-authoring"');
    expect(postCard).toContain('data-site-summary-layout="media-start"');
    expect(postCard).toContain('data-site-primary-image="summary"');
    expect(postCard).toContain('src="/api/formless/media/media/images/post.webp"');
    expect(postCard).toContain("2026-05-13");
    expect(projectCard).toContain('data-site-summary-link="project"');
    expect(projectCard).toContain('href="/projects/opensurf"');
    expect(projectCard).toContain('src="/api/formless/media/media/images/project.webp"');
    expect(projectCard).toContain('data-web-markdown-renderer="shared"');
    expect(projectCard).toContain("<strong");
    expect(projectCard).not.toContain("2026-05-08");
    expect(html).toContain("No published posts yet.");
    expect(html).not.toContain('href="/pages/blog/shipping-schema-backed-authoring"');
  });

  it("characterizes post detail routes with header primary media and default placement body flow", () => {
    const post = blockNode("post", "post", "Shipping schema-backed authoring", {
      body: "Summary-only copy for list cards.",
      date: "2026-05-13",
      href: "/blog/shipping-schema-backed-authoring",
      placements: [
        placement(
          "primary-image",
          imageNode("primary-image-block", "Post primary", {
            assetId: "post-primary.png",
            href: "/api/formless/media/media/images/post-primary.png",
            kind: "image",
          }),
          { slot: "primaryImage" },
        ),
        placement(
          "post-body",
          markdownNode("post-body-block", "Body", "Detail **markdown** body."),
        ),
      ],
    });
    const html = renderSite(post, {
      route: { kind: "post", slug: "blog/shipping-schema-backed-authoring" },
    });
    const main = mainHtml(html);

    expect(main).toContain("<h1");
    expect(main).toContain("Shipping schema-backed authoring");
    expect(main).toContain('data-site-primary-image="post-detail"');
    expect(main).toContain('src="/api/formless/media/media/images/post-primary.png"');
    expect(countOccurrences(main, 'src="/api/formless/media/media/images/post-primary.png"')).toBe(
      1,
    );
    expect(main).toContain('data-web-markdown-renderer="shared"');
    expect(main).toContain("<strong");
    expect(main).toContain("Detail ");
    expect(main).not.toContain("Summary-only copy for list cards.");
  });
});

function renderSite(
  page: SiteBlockNode,
  options: {
    frame?: SitePageFrame;
    linkMode?: "preview" | "published";
    route?: SitePageTree["route"];
    site?: SitePageTree["site"];
  } = {},
): string {
  return renderToStaticMarkup(
    <SitePageRenderer linkMode={options.linkMode} tree={siteTree(page, options)} />,
  );
}

function siteTree(
  page: SiteBlockNode,
  options: {
    frame?: SitePageFrame;
    route?: SitePageTree["route"];
    site?: SitePageTree["site"];
  } = {},
): SitePageTree {
  return {
    page,
    frame: options.frame ?? defaultFrame(),
    site:
      options.site ??
      ({
        id: "site",
        label: "Example Site",
        accentColor: "#C98A2E",
        backgroundColor: "#09090B",
      } satisfies SitePageTree["site"]),
    meta: {
      slug: options.route?.slug ?? "home",
      generatedAt: "2026-05-19T00:00:00.000Z",
      warnings: [],
    },
    route: options.route ?? { kind: "page", slug: "home" },
  };
}

function defaultFrame(): SitePageFrame {
  const home = linkNode("home-link", "Home", "/");
  const blog = linkNode("blog-link", "Blog", "/blog");
  const github = linkNode("github-link", "GitHub", "https://github.com/dpeek", {
    icon: requiredIconCatalogSvg("github"),
  });

  return {
    header: blockNode("header", "header", "Header", {
      placements: [
        placement(
          "header-primary",
          blockNode("header-primary-block", "headerPrimary", "Primary", {
            placements: [placement("header-home", home)],
          }),
        ),
        placement(
          "header-secondary",
          blockNode("header-secondary-block", "headerSecondary", "Secondary", {
            placements: [placement("header-blog", blog)],
          }),
        ),
      ],
    }),
    footer: blockNode("footer", "footer", "Footer", {
      placements: [
        placement(
          "footer-section",
          blockNode("footer-section-block", "footerSection", "Explore", {
            placements: [placement("footer-blog", blog)],
          }),
        ),
        placement(
          "footer-social",
          blockNode("footer-social-block", "footerSocial", "Social", {
            placements: [placement("footer-github", github)],
          }),
        ),
      ],
    }),
  };
}

function pageNode(id: string, placements: SitePlacementNode[]): SiteBlockNode {
  return blockNode(id, "page", "Home", { href: "/", placements });
}

function markdownNode(id: string, label: string, body: string): SiteBlockNode {
  return blockNode(id, "markdown", label, { body });
}

function imageNode(
  id: string,
  label: string,
  media?: SiteBlockNode["media"],
  options: { href?: string } = {},
): SiteBlockNode {
  return blockNode(id, "image", label, {
    ...(media ? { media } : {}),
    ...options,
    width: 1200,
    height: 800,
  });
}

function linkNode(
  id: string,
  label: string,
  href: string,
  options: Pick<SiteBlockNode, "icon"> = {},
): SiteBlockNode {
  return blockNode(id, "link", label, { href, ...options });
}

function blockNode(
  id: string,
  type: string,
  label: string,
  options: Partial<Omit<SiteBlockNode, "id" | "type" | "label" | "placements">> & {
    placements?: SitePlacementNode[];
  } = {},
): SiteBlockNode {
  const { placements = [], ...fields } = options;

  return {
    id,
    type,
    label,
    placements,
    ...fields,
  };
}

function placement(
  id: string,
  block: SiteBlockNode,
  options: Partial<Omit<SitePlacementNode, "id" | "order" | "block">> = {},
): SitePlacementNode {
  return {
    id,
    order: 100,
    block,
    ...options,
  };
}

function linkHtml(html: string, href: string): string {
  const hrefIndex = html.indexOf(`href="${href}"`);
  const linkStart = html.lastIndexOf("<a", hrefIndex);
  const linkEnd = html.indexOf("</a>", hrefIndex);

  if (hrefIndex === -1 || linkStart === -1 || linkEnd === -1) {
    throw new Error(`Missing link for "${href}".`);
  }

  return html.slice(linkStart, linkEnd + "</a>".length);
}

function articleHtml(html: string, text: string): string {
  const textIndex = html.indexOf(text);
  const articleStart = html.lastIndexOf("<article", textIndex);
  const articleEnd = html.indexOf("</article>", textIndex);

  if (textIndex === -1 || articleStart === -1 || articleEnd === -1) {
    throw new Error(`Missing article for "${text}".`);
  }

  return html.slice(articleStart, articleEnd + "</article>".length);
}

function mainHtml(html: string): string {
  const start = html.indexOf("<main ");
  const end = html.indexOf("</main>", start);

  if (start === -1 || end === -1) {
    throw new Error("Missing public Site main element.");
  }

  return html.slice(start, end + "</main>".length);
}

function elementHtml(html: string, dataAttribute: string): string {
  const attributeIndex = html.indexOf(dataAttribute);
  const elementStart = html.lastIndexOf("<", attributeIndex);
  const elementEnd = html.indexOf(">", attributeIndex);

  if (attributeIndex === -1 || elementStart === -1 || elementEnd === -1) {
    throw new Error(`Missing element for "${dataAttribute}".`);
  }

  return html.slice(elementStart, elementEnd + 1);
}

function countOccurrences(text: string, search: string): number {
  return text.split(search).length - 1;
}

function requiredIconCatalogSvg(key: string): string {
  if (key !== "github") {
    throw new Error(`Missing icon catalog entry "${key}".`);
  }

  return githubIconSvg;
}
