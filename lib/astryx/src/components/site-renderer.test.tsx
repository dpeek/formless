import {
  createElement,
  useState,
  type ComponentPropsWithRef,
  type ElementType,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
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
import { AstryxSitePageRenderer } from "./site.tsx";
import { AstryxSitePublicSystemStateRenderer } from "./site-system-state.tsx";

const viewport = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  props: () => ({}),
}));

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
      createElement("div", {
        "data-component": "SitePublicTurnstileChallenge",
        "data-reset-signal": resetSignal,
        "data-sitekey": siteKey,
        onTokenChange,
      }),
  };
});

vi.mock("@astryxdesign/core", () => ({
  Theme: ({ children, mode }: { children: ReactNode; mode: string }) =>
    createElement("div", { "data-component": "Theme", "data-mode": mode }, children),
}));

vi.mock("@astryxdesign/core/hooks", () => ({
  useMediaQuery: () => viewport.isMobile,
}));

vi.mock("@astryxdesign/core/Layout", () => ({
  Layout: ({
    content,
    footer,
    header,
  }: {
    content?: ReactNode;
    footer?: ReactNode;
    header?: ReactNode;
  }) => createElement("div", { "data-component": "Layout" }, header, content, footer),
  LayoutContent: ({ children, ...props }: ComponentPropsWithRef<"main">) =>
    createElement("main", { ...props, "data-component": "LayoutContent" }, children),
  LayoutFooter: ({ children }: { children: ReactNode }) =>
    createElement("footer", { "data-component": "LayoutFooter" }, children),
  LayoutHeader: ({ children }: { children: ReactNode }) =>
    createElement("header", { "data-component": "LayoutHeader" }, children),
}));

vi.mock("@astryxdesign/core/TopNav", () => ({
  TopNav: ({
    centerContent,
    endContent,
    heading,
    label,
  }: {
    centerContent?: ReactNode;
    endContent?: ReactNode;
    heading?: ReactNode;
    label?: string;
  }) =>
    createElement(
      "nav",
      { "aria-label": label, "data-component": "TopNav" },
      heading,
      centerContent,
      endContent,
    ),
  TopNavHeading: ({ heading, headingHref }: { heading: string; headingHref?: string }) =>
    createElement("a", { "data-component": "TopNavHeading", href: headingHref }, heading),
  TopNavItem: ({
    isSelected,
    label,
    ...props
  }: ComponentPropsWithRef<"a"> & {
    isSelected?: boolean;
    label: string;
    "data-public-href"?: string;
  }) =>
    createElement(
      "a",
      {
        ...props,
        "aria-current": isSelected ? "page" : undefined,
        "data-component": "TopNavItem",
        "data-label": label,
      },
      label,
    ),
}));

vi.mock("@astryxdesign/core/MobileNav", () => ({
  MobileNav: ({
    children,
    isOpen,
    label,
  }: {
    children: ReactNode;
    isOpen: boolean;
    label: string;
  }) =>
    createElement(
      "aside",
      {
        "aria-label": label,
        "data-component": "MobileNav",
        "data-open": String(isOpen),
      },
      children,
    ),
}));

vi.mock("@astryxdesign/core/SideNav", () => ({
  SideNavSection: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("section", { "data-component": "SideNavSection", "data-title": title }, children),
  SideNavItem: ({
    as,
    href,
    isSelected,
    label,
    onClick,
  }: {
    as?: ElementType;
    href?: string;
    isSelected?: boolean;
    label: string;
    onClick?: () => void;
  }) => {
    const Component = as ?? "a";
    return createElement(
      Component,
      {
        "aria-current": isSelected ? "page" : undefined,
        "data-component": "SideNavItem",
        "data-label": label,
        href,
        onClick,
      },
      label,
    );
  },
}));

vi.mock("@astryxdesign/core/IconButton", () => ({
  IconButton: ({
    "aria-pressed": ariaPressed,
    "data-site-theme-control": themeControl,
    icon,
    label,
    onClick,
  }: {
    "aria-pressed"?: boolean;
    "data-site-theme-control"?: string;
    icon: ReactNode;
    label: string;
    onClick?: () => void;
  }) =>
    createElement(
      "button",
      {
        "aria-label": label,
        "aria-pressed": ariaPressed,
        "data-site-theme-control": themeControl,
        onClick,
        type: "button",
      },
      icon,
    ),
}));

vi.mock("@astryxdesign/core/Button", () => ({
  Button: ({
    children,
    href,
    icon,
    isDisabled,
    isLoading,
    label,
    rel,
    target,
    variant: _variant,
    ...props
  }: ComponentPropsWithRef<"a"> & {
    icon?: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    label: string;
    variant?: string;
  }) => {
    const Component = href ? "a" : "button";
    return createElement(
      Component,
      {
        ...props,
        "data-component": "Button",
        "data-label": label,
        "data-loading": isLoading || undefined,
        disabled: isDisabled || undefined,
        href,
        rel,
        target,
      },
      icon,
      children ?? label,
    );
  },
}));

vi.mock("@astryxdesign/core/TextInput", () => ({
  TextInput: ({
    "data-public-fixed-field": fixedField,
    htmlName,
    inputMode,
    isDisabled,
    isLoading,
    isRequired,
    label,
    onChange,
    pattern,
    status,
    type = "text",
    value,
  }: {
    "data-public-fixed-field"?: string;
    htmlName?: string;
    inputMode?: string;
    isDisabled?: boolean;
    isLoading?: boolean;
    isRequired?: boolean;
    label: string;
    onChange?: (value: string) => void;
    pattern?: string;
    status?: { message?: string; type: string };
    type?: string;
    value?: string;
  }) =>
    createElement(
      "label",
      { "data-component": "TextInputField" },
      label,
      createElement("input", {
        "aria-invalid": status?.type === "error" || undefined,
        "data-component": "TextInput",
        "data-loading": isLoading || undefined,
        "data-public-fixed-field": fixedField,
        disabled: isDisabled || undefined,
        inputMode,
        name: htmlName,
        onChange: (event: { currentTarget: { value: string } }) =>
          onChange?.(event.currentTarget.value),
        required: isRequired || undefined,
        pattern,
        type,
        value,
      }),
      status?.message ? createElement("span", { role: "alert" }, status.message) : null,
    ),
}));

vi.mock("@astryxdesign/core/TextArea", () => ({
  TextArea: ({
    "data-public-fixed-field": fixedField,
    htmlName,
    isDisabled,
    isLoading,
    isRequired,
    label,
    onChange,
    status,
    value,
  }: {
    "data-public-fixed-field"?: string;
    htmlName?: string;
    isDisabled?: boolean;
    isLoading?: boolean;
    isRequired?: boolean;
    label: string;
    onChange?: (value: string) => void;
    status?: { message?: string; type: string };
    value?: string;
  }) =>
    createElement(
      "label",
      { "data-component": "TextAreaField" },
      label,
      createElement("textarea", {
        "aria-invalid": status?.type === "error" || undefined,
        "data-component": "TextArea",
        "data-loading": isLoading || undefined,
        "data-public-fixed-field": fixedField,
        disabled: isDisabled || undefined,
        name: htmlName,
        onChange: (event: { currentTarget: { value: string } }) =>
          onChange?.(event.currentTarget.value),
        required: isRequired || undefined,
        value,
      }),
      status?.message ? createElement("span", { role: "alert" }, status.message) : null,
    ),
}));

vi.mock("@astryxdesign/core/CheckboxInput", () => ({
  CheckboxInput: ({
    isDisabled,
    isLoading,
    isRequired,
    label,
    onChange,
    status,
    value,
  }: {
    isDisabled?: boolean;
    isLoading?: boolean;
    isRequired?: boolean;
    label: string;
    onChange?: (value: boolean) => void;
    status?: { message?: string; type: string };
    value?: boolean;
  }) =>
    createElement(
      "label",
      { "data-component": "CheckboxInputField" },
      label,
      createElement("input", {
        "aria-invalid": status?.type === "error" || undefined,
        checked: value,
        "data-component": "CheckboxInput",
        "data-loading": isLoading || undefined,
        disabled: isDisabled || undefined,
        onChange: (event: { currentTarget: { checked: boolean } }) =>
          onChange?.(event.currentTarget.checked),
        required: isRequired || undefined,
        type: "checkbox",
      }),
      status?.message ? createElement("span", { role: "alert" }, status.message) : null,
    ),
}));

vi.mock("@astryxdesign/core/DateInput", () => ({
  DateInput: ({
    isDisabled,
    isLoading,
    isRequired,
    label,
    onChange,
    status,
    value,
  }: {
    isDisabled?: boolean;
    isLoading?: boolean;
    isRequired?: boolean;
    label: string;
    onChange?: (value: string | undefined) => void;
    status?: { message?: string; type: string };
    value?: string;
  }) =>
    createElement(
      "label",
      { "data-component": "DateInputField" },
      label,
      createElement("input", {
        "aria-invalid": status?.type === "error" || undefined,
        "data-component": "DateInput",
        "data-loading": isLoading || undefined,
        disabled: isDisabled || undefined,
        onChange: (event: { currentTarget: { value: string } }) =>
          onChange?.(event.currentTarget.value || undefined),
        required: isRequired || undefined,
        type: "date",
        value: value ?? "",
      }),
      status?.message ? createElement("span", { role: "alert" }, status.message) : null,
    ),
}));

vi.mock("@astryxdesign/core/Selector", () => ({
  Selector: ({
    isDisabled,
    isLoading,
    isRequired,
    label,
    onChange,
    options,
    status,
    value,
  }: {
    isDisabled?: boolean;
    isLoading?: boolean;
    isRequired?: boolean;
    label: string;
    onChange?: (value: string | null) => void;
    options: readonly { label: string; value: string }[];
    status?: { message?: string; type: string };
    value?: string | null;
  }) =>
    createElement(
      "label",
      { "data-component": "SelectorField" },
      label,
      createElement(
        "select",
        {
          "aria-invalid": status?.type === "error" || undefined,
          "data-component": "Selector",
          "data-loading": isLoading || undefined,
          disabled: isDisabled || undefined,
          onChange: (event: { currentTarget: { value: string } }) =>
            onChange?.(event.currentTarget.value || null),
          required: isRequired || undefined,
          value: value ?? "",
        },
        options.map((option) =>
          createElement("option", { key: option.value, value: option.value }, option.label),
        ),
      ),
      status?.message ? createElement("span", { role: "alert" }, status.message) : null,
    ),
}));

vi.mock("@astryxdesign/core/Typeahead", () => ({
  createStaticSource: (items: readonly unknown[]) => items,
  Typeahead: ({
    isDisabled,
    isRequired,
    label,
    onChangeQuery,
    status,
    value,
  }: {
    isDisabled?: boolean;
    isRequired?: boolean;
    label: string;
    onChangeQuery?: (value: string) => void;
    status?: { message?: string; type: string };
    value?: { label: string } | null;
  }) => {
    const [query, setQuery] = useState("");

    return createElement(
      "label",
      { "data-component": "TypeaheadField" },
      label,
      createElement("input", {
        "aria-invalid": status?.type === "error" || undefined,
        "data-component": "Typeahead",
        disabled: isDisabled || undefined,
        onChange: (event: { currentTarget: { value: string } }) => {
          setQuery(event.currentTarget.value);
          onChangeQuery?.(event.currentTarget.value);
        },
        required: isRequired || undefined,
        type: "text",
        value: value?.label ?? query,
      }),
      status?.message ? createElement("span", { role: "alert" }, status.message) : null,
    );
  },
}));

vi.mock("@astryxdesign/core/Icon", () => ({
  Icon: ({ icon }: { icon: ReactNode }) => createElement("span", null, icon),
}));

vi.mock("@astryxdesign/core/Link", () => ({
  Link: ({
    children,
    "data-public-href": publicHref,
    href,
    isExternalLink: _isExternalLink,
    isStandalone: _isStandalone,
    label,
    rel,
    target,
    tooltip,
    ...props
  }: ComponentPropsWithRef<"a"> & {
    "data-public-href"?: string;
    isExternalLink?: boolean;
    isStandalone?: boolean;
    label?: string;
    tooltip?: string;
  }) =>
    createElement(
      "a",
      {
        ...props,
        "aria-label": label,
        "data-public-href": publicHref,
        href,
        rel,
        target,
        title: tooltip,
      },
      children,
    ),
}));

vi.mock("@astryxdesign/core/HStack", () => ({
  HStack: ({
    children,
    "data-site-navigation-group": navigationGroup,
    ...props
  }: {
    children: ReactNode;
    "data-site-navigation-group"?: string;
  } & Record<string, unknown>) =>
    createElement("div", { ...props, "data-site-navigation-group": navigationGroup }, children),
}));

vi.mock("@astryxdesign/core/VStack", () => ({
  VStack: ({
    children,
    ...props
  }: {
    children: ReactNode;
  } & Record<string, unknown>) => createElement("div", props, children),
}));

vi.mock("@astryxdesign/core/Card", () => ({
  Card: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
    createElement("article", { ...props, "data-component": "Card" }, children),
}));

vi.mock("@astryxdesign/core/Grid", () => ({
  Grid: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
    createElement("div", { ...props, "data-component": "Grid" }, children),
}));

vi.mock("@astryxdesign/core/Markdown", () => ({
  Markdown: ({
    children,
    components,
    headingLevelStart,
  }: {
    children: string;
    components?: { link?: ElementType };
    headingLevelStart?: number;
  }) => {
    const linkMatch = children.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const LinkComponent = components?.link ?? "a";
    const renderedChildren = linkMatch
      ? [
          children.slice(0, linkMatch.index),
          createElement(LinkComponent, { href: linkMatch[2], key: linkMatch[2] }, linkMatch[1]),
          children.slice((linkMatch.index ?? 0) + linkMatch[0].length),
        ]
      : children;

    return createElement(
      "div",
      {
        "data-component": "Markdown",
        "data-heading-level-start": headingLevelStart,
      },
      renderedChildren,
    );
  },
}));

vi.mock("@astryxdesign/core/Text", () => ({
  Heading: ({ children, level }: { children: ReactNode; level: number }) =>
    createElement(`h${level}`, null, children),
  Text: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));

vi.mock("@astryxdesign/core/NavIcon", () => ({
  NavIcon: ({ icon }: { icon: ReactNode }) => createElement("span", null, icon),
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
    expect(componentByLabel(renderer, "TopNavItem", "Home").props.href).toBe("/sites/astryx");
    expect(componentByLabel(renderer, "TopNavItem", "Home").props["aria-current"]).toBe("page");
    expect(componentByLabel(renderer, "TopNavItem", "Work").props.href).toBe("/sites/astryx/work");
    expect(componentByLabel(renderer, "TopNavItem", "Contact").props.href).toBe("#contact");
    expect(renderer.root.findByProps({ "data-component": "TopNavHeading" }).props.href).toBe(
      "/sites/astryx",
    );
    expect(
      renderer.root
        .findAll(
          (node) =>
            typeof node.type === "string" && node.props["data-site-navigation-group"] !== undefined,
        )
        .map((node) => node.props["data-site-navigation-group"]),
    ).toEqual(["primary", "secondary"]);

    await unmount(renderer);
  });

  it("renders footer sections and social links with resolved external behavior", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(
      renderer.root
        .findAll(
          (node) =>
            typeof node.type === "string" && node.props["data-site-footer-group"] !== undefined,
        )
        .map((node) => node.props["data-site-footer-group"]),
    ).toEqual(["section", "social"]);
    const github = renderer.root.findByProps({ "data-public-href": "https://github.com/dpeek" });
    expect(github.props.href).toBe("https://github.com/dpeek");
    expect(github.props.target).toBe("_blank");
    expect(github.props.rel).toBe("noreferrer");
    expect(rendererText(renderer)).toContain(
      "Product design and engineering for teams building ambitious software.",
    );

    await unmount(renderer);
  });

  it("renders mobile primary and secondary groups and closes over external target rules", async () => {
    viewport.isMobile = true;
    const renderer = await renderPage(withExternalHeaderLink(shellRendererProps()));

    expect(renderer.root.findAllByProps({ "data-component": "TopNavItem" })).toHaveLength(0);
    expect(
      renderer.root
        .findAllByProps({ "data-component": "SideNavSection" })
        .map((node) => node.props["data-title"]),
    ).toEqual(["Primary navigation", "Secondary navigation"]);
    expect(componentLabels(renderer, "SideNavItem")).toEqual([
      "Home",
      "Work",
      "Journal",
      "Contact",
      "Documentation",
    ]);
    const documentation = componentByLabel(renderer, "SideNavItem", "Documentation");
    expect(documentation.props.href).toBe("https://example.com/docs");
    expect(documentation.props.target).toBe("_blank");
    expect(documentation.props.rel).toBe("noreferrer");
    expect(componentByLabel(renderer, "SideNavItem", "Home").props["aria-current"]).toBe("page");

    const mobileNav = renderer.root.findByProps({ "data-component": "MobileNav" });
    expect(mobileNav.props["data-open"]).toBe("false");
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Open navigation" }).props.onClick();
    });
    expect(renderer.root.findByProps({ "data-component": "MobileNav" }).props["data-open"]).toBe(
      "true",
    );

    await unmount(renderer);
  });

  it("applies its local theme control without adding theme facts to renderer props", async () => {
    viewport.isMobile = false;
    const renderer = await renderPage(shellRendererProps());

    expect(renderer.root.findByProps({ "data-component": "Theme" }).props["data-mode"]).toBe(
      "light",
    );
    const toggle = renderer.root.findByProps({ "aria-label": "Switch to dark mode" });
    expect(toggle.props["aria-pressed"]).toBe(false);

    await act(async () => {
      toggle.props.onClick();
    });

    expect(renderer.root.findByProps({ "data-component": "Theme" }).props["data-mode"]).toBe(
      "dark",
    );
    expect(
      renderer.root.findByProps({ "aria-label": "Switch to light mode" }).props["aria-pressed"],
    ).toBe(true);

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
      expect(renderer.root.findAllByProps({ "data-component": "TopNav" }).length > 0).toBe(
        hasHeader,
      );
      expect(renderer.root.findAllByProps({ "data-component": "LayoutFooter" }).length > 0).toBe(
        hasFooter,
      );

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
      [4, "Capabilities"],
      [5, "Direction"],
      [5, "Delivery"],
      [4, "Outcomes"],
      [2, "Closing notes"],
    ]);
    expect(markdownHeadingStarts(renderer)).toEqual([2, 4, 5, 6, 5, 5, 3]);
    expect(rendererText(renderer)).toContain("First paragraph.");
    expect(rendererText(renderer)).toContain("Second paragraph.");

    await unmount(renderer);
  });

  it("uses feature slots, optional facts, source icons, colors, and ignores unknown blocks", async () => {
    viewport.isMobile = false;
    const icon = `<svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg>`;
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
        placement(
          "card-grid",
          2000,
          block("card-grid", "cardGrid", "Cards", {
            placements: [
              placement(
                "colored-card",
                1000,
                block("colored-card", "card", "Colored card", {
                  color: "#7c3aed",
                  icon,
                }),
              ),
            ],
          }),
        ),
        placement(
          "metric-grid",
          3000,
          block("metric-grid", "metricGrid", "Metrics", {
            placements: [
              placement(
                "colored-metric",
                1000,
                block("colored-metric", "metric", "42", {
                  color: "#0891b2",
                }),
              ),
            ],
          }),
        ),
      ]),
    );

    expect(renderer.root.findByProps({ "data-site-feature-alignment": "right" })).toBeDefined();
    expect(renderer.root.findByProps({ "data-site-feature-media": true })).toBeDefined();
    expect(renderer.root.findByProps({ "data-site-feature-actions": true })).toBeDefined();
    expect(renderer.root.findByProps({ "data-media-asset-id": "feature-asset" })).toBeDefined();
    expect(renderer.root.findByProps({ "data-public-href": "/sites/astryx/work" })).toBeDefined();
    expect(renderer.root.findByProps({ "data-source": icon }).props["data-color"]).toBe("inherit");
    expect(renderer.root.findByProps({ "data-site-block-color": "#7c3aed" })).toBeDefined();
    expect(renderer.root.findByProps({ "data-site-block-color": "#0891b2" })).toBeDefined();
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

    expect(componentByLabel(renderer, "TopNavItem", "Work").props.href).toBe("/sites/astryx/work");
    const inlineInternal = renderer.root.findByProps({
      "data-public-href": "/sites/astryx/work#details",
    });
    expect(rendererText(renderer)).toContain("Placed link label");
    expect(inlineInternal.props.target).toBeUndefined();
    expect(inlineInternal.props.rel).toBeUndefined();
    const inlineExternal = renderer.root.findByProps({
      "data-public-href": "https://example.com/reference",
    });
    expect(inlineExternal.props.target).toBe("_blank");
    expect(inlineExternal.props.rel).toBe("noreferrer");

    const action = componentByLabel(renderer, "Button", "Start now");
    expect(action.props.href).toBe("/sites/astryx/contact");
    expect(action.props["data-site-action-link"]).toBe(true);
    expect(action.findByProps({ "data-source": safeIcon })).toBeDefined();

    const social = renderer.root.find(
      (node) => node.type === "a" && node.props["data-public-href"] === "https://github.com/dpeek",
    );
    expect(social.props["data-site-social-link"]).toBe(true);
    expect(social.props["aria-label"]).toBe("GitHub");
    expect(social.props.target).toBe("_blank");
    expect(social.props.rel).toBe("noreferrer");
    expect(social.findByProps({ "data-source": "github" })).toBeDefined();

    await unmount(renderer);
  });

  it("renders only projected core delivery facts with dimensions, ratios, semantic slots, and missing states", async () => {
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

    const delivered = renderer.root.findByProps({ src: "/media/delivered.webp" });
    expect(delivered.props.width).toBe(1600);
    expect(delivered.props.height).toBe(900);
    expect(
      renderer.root.findByProps({ "data-media-asset-id": "asset-delivered" }).props[
        "data-site-image"
      ],
    ).toBe("block");
    expect(
      renderer.root.findByProps({ "data-site-image-aspect-ratio": "1600 / 900" }),
    ).toBeDefined();
    expect(renderer.root.findAllByProps({ src: "https://example.com/manual-image.jpg" })).toEqual(
      [],
    );
    expect(renderer.root.findAllByProps({ src: "https://example.com/manual-missing.jpg" })).toEqual(
      [],
    );
    expect(
      renderer.root.findByProps({ "aria-label": "Missing image" }).props["data-site-image-missing"],
    ).toBe(true);
    expect(
      renderer.root.findAllByProps({ "data-site-image-aspect-ratio": "4 / 3" }).length,
    ).toBeGreaterThan(0);
    expect(renderer.root.findByProps({ "data-site-feature-media": true })).toBeDefined();
    expect(renderer.root.findByProps({ src: "/media/feature.webp" })).toBeDefined();
    const summaryPrimary = renderer.root.findByProps({ "data-site-primary-image": "summary" });
    expect(
      summaryPrimary.findByProps({ "data-site-image-missing": true }).props["aria-label"],
    ).toBe("Missing summary image");
    expect(renderer.root.findByProps({ "data-site-summary-layout": "media-start" })).toBeDefined();

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

    expect(renderer.root.findAllByProps({ "data-site-primary-image": "post-detail" })).toHaveLength(
      1,
    );
    expect(renderer.root.findAllByProps({ src: "/media/post.webp" })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ "data-media-asset-id": "asset-post" })).toHaveLength(1);
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
      renderer.root
        .findAll(
          (node) =>
            typeof node.type === "string" && typeof node.props["data-site-summary-id"] === "string",
        )
        .map((node) => node.props["data-site-summary-id"]),
    ).toEqual([firstPost.id, secondPost.id, project.id]);
    expect(
      renderer.root.find(
        (node) =>
          node.type === "a" &&
          node.props["data-site-summary-link"] === "post" &&
          node.props.href === "/sites/astryx/blog/first-post",
      ),
    ).toBeDefined();
    expect(
      renderer.root.find(
        (node) =>
          node.type === "a" &&
          node.props["data-site-summary-link"] === "project" &&
          node.props.href === "/sites/astryx/projects/projected-project",
      ),
    ).toBeDefined();
    expect(
      renderer.root.findAll((node) => node.type === "time").map((node) => node.props.dateTime),
    ).toEqual(["2026-07-12", "2026-07-05"]);
    expect(renderer.root.findAllByProps({ dateTime: "2026-07-01" })).toEqual([]);
    expect(renderer.root.findByProps({ "data-site-primary-image": "summary" })).toBeDefined();
    expect(renderer.root.findByProps({ src: "/media/first-post.webp" })).toBeDefined();
    const projectCard = renderer.root.findByProps({ "data-site-summary-id": project.id });
    expect(projectCard.findAll((node) => node.type === "a").map((node) => node.props.href)).toEqual(
      ["/sites/astryx/projects/projected-project", "https://example.com/reference"],
    );
    const nestedReference = projectCard.find(
      (node) => node.type === "a" && node.props.href === "https://example.com/reference",
    );
    expect(nestedReference.props.target).toBe("_blank");
    expect(nestedReference.props.rel).toBe("noreferrer");
    expect(
      renderer.root
        .findAll((node) => node.type === "p")
        .map((node) => node.children.filter((child) => typeof child === "string").join("")),
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
    expect(renderer.root.findByProps({ href: "https://example.com/detail" })).toBeDefined();
    expect(renderer.root.findAllByProps({ "data-site-primary-image": "post-detail" })).toHaveLength(
      1,
    );
    expect(renderer.root.findAllByProps({ src: "/media/detail-post.webp" })).toHaveLength(1);

    await unmount(renderer);
  });
});

describe("Astryx public Site subscribe and contact forms", () => {
  it("renders the multi-form fixture through canonical sessions without the live challenge adapter", async () => {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <AstryxSitePageFixtureRenderer fixture={publicSiteMultipleFormFixtureLayout} />,
      );
    });
    const mounted = required(renderer);

    expect(publicFormKinds(mounted)).toEqual([
      "subscribe",
      "contact",
      "publicOperation",
      "contact",
    ]);
    expect(
      mounted.root.findAllByProps({ "data-component": "SitePublicTurnstileChallenge" }),
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
    expect(fields.map((field) => field.props.name)).toEqual(["name", "email", "message"]);
    expect(fields.every((field) => field.props.required === true)).toBe(true);
    expect(fields.map((field) => field.props.value)).toEqual(["", "", ""]);
    expect(componentByLabel(renderer, "Button", "Send enquiry").props.disabled).toBe(true);
    expect(
      renderer.root.findByProps({ "data-public-form-challenge": "turnstile" }).props[
        "data-public-form-challenge-ready"
      ],
    ).toBe(false);

    await changeFixedField(renderer, "name", "Ada Lovelace");
    await changeFixedField(renderer, "email", "not-an-email");
    await changeFixedField(renderer, "message", "Please send the details.");

    expect(fixedField(renderer, "name").props.value).toBe("Ada Lovelace");
    expect(fixedField(renderer, "email").props.value).toBe("not-an-email");
    expect(fixedField(renderer, "email").props["aria-invalid"]).toBe(true);
    expect(componentByLabel(renderer, "Button", "Send enquiry").props.disabled).toBe(true);

    await changeFixedField(renderer, "email", "ada@example.com");
    await solveFixedFormChallenge(renderer, "public-challenge-token");

    expect(fixedField(renderer, "email").props.value).toBe("ada@example.com");
    expect(fixedField(renderer, "email").props["aria-invalid"]).toBeUndefined();
    expect(
      renderer.root.findByProps({ "data-public-form-challenge": "turnstile" }).props[
        "data-public-form-challenge-ready"
      ],
    ).toBe(true);
    expect(componentByLabel(renderer, "Button", "Send enquiry").props.disabled).toBeUndefined();

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
    expect(renderer.root.findAllByType("form")).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ "data-component": "SitePublicTurnstileChallenge" }),
    ).toHaveLength(0);
    expect(renderer.root.findAllByProps({ "data-component": "Button" })).toHaveLength(0);

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
    const form = renderer.root.findByType("form");
    let submission: Promise<void> | undefined;

    await act(async () => {
      submission = form.props.onSubmit({ preventDefault: vi.fn() });
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/site/public/operations/subscription/subscribe");
    expect(fixedFormSurface(renderer, "submitting")).toBeDefined();
    expect(fixedField(renderer, "email").props.disabled).toBe(true);
    expect(
      renderer.root.findByProps({ "data-public-form-challenge": "turnstile" }).props[
        "aria-disabled"
      ],
    ).toBe(true);
    expect(componentByLabel(renderer, "Button", "Subscribing...").props["data-loading"]).toBe(true);

    await act(async () => {
      response.resolve(Response.json(publicSubscribeCommandResponse()));
      await required(submission);
    });

    expect(fixedFormSurface(renderer, "success")).toBeDefined();
    expect(rendererText(renderer)).toContain("You're on the list.");
    expect(fixedField(renderer, "email").props.disabled).toBe(true);
    expect(renderer.root.findAllByProps({ "data-component": "Button" })).toHaveLength(0);

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
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() });
    });

    expect(fixedFormSurface(renderer, "failed")).toBeDefined();
    expect(rendererText(renderer)).toContain("Please try again later.");
    expect(rendererText(renderer)).not.toContain("private-provider-failure");
    expect(renderer.root.findByProps({ role: "alert" })).toBeDefined();
    expect(
      renderer.root.findByProps({ "data-public-form-challenge": "turnstile" }).props[
        "data-public-form-challenge-reset"
      ],
    ).toBe(1);

    await act(async () => {
      componentByLabel(renderer, "Button", "Try again").props.onClick();
    });

    expect(fixedFormSurface(renderer, "ready")).toBeDefined();
    expect(rendererText(renderer)).not.toContain("Please try again later.");
    expect(componentByLabel(renderer, "Button", "Subscribe").props.disabled).toBe(true);

    await unmount(renderer);
  });
});

describe("Astryx public Site generic operation form", () => {
  it("adapts every canonical scalar field to controlled Formless UI field presentation", async () => {
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
    expect(
      publicOperationFields(renderer).map((field) => field.props["data-public-field-control"]),
    ).toEqual(["text", "longText", "boolean", "date", "number", "enum", "text", "text", "text"]);
    expect(publicOperationField(renderer, "name").props["data-public-field-id"]).toBe(
      "site-public-form:block-generic-controls:field:name",
    );
    expect(publicOperationControl(renderer, "name", "TextInput").props.required).toBe(true);
    expect(publicOperationControl(renderer, "details", "TextArea")).toBeDefined();
    expect(publicOperationControl(renderer, "approved", "CheckboxInput").props.checked).toBe(false);
    expect(publicOperationControl(renderer, "requestedOn", "DateInput")).toBeDefined();
    expect(publicOperationControl(renderer, "quantity", "TextInput")).toBeDefined();
    expect(publicOperationControl(renderer, "tier", "Selector")).toBeDefined();
    expect(publicOperationControl(renderer, "email", "TextInput").props.type).toBe("email");
    expect(publicOperationControl(renderer, "phone", "TextInput").props.inputMode).toBe("tel");
    expect(publicOperationControl(renderer, "topic", "Typeahead")).toBeDefined();
    expect(componentByLabel(renderer, "Button", "Send request").props.disabled).toBe(true);

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

    expect(publicOperationControl(renderer, "quantity", "TextInput").props.value).toBe("many");
    expect(publicOperationControl(renderer, "quantity", "TextInput").props["aria-invalid"]).toBe(
      true,
    );
    expect(publicOperationControl(renderer, "email", "TextInput").props["aria-invalid"]).toBe(true);
    expect(rendererText(renderer)).toContain("Enter a finite number.");
    expect(rendererText(renderer)).toContain("Enter an email address like name@example.com.");
    expect(
      publicOperationField(renderer, "topic").findByProps({
        name: "topic",
        type: "hidden",
      }).props.value,
    ).toBe("Custom research");
    expect(componentByLabel(renderer, "Button", "Send request").props.disabled).toBe(true);

    await changePublicOperationField(renderer, "quantity", "12.5");
    await changePublicOperationField(renderer, "email", "ada@example.com");

    expect(publicOperationControl(renderer, "quantity", "TextInput").props.value).toBe("12.5");
    expect(
      publicOperationControl(renderer, "quantity", "TextInput").props["aria-invalid"],
    ).toBeUndefined();
    expect(componentByLabel(renderer, "Button", "Send request").props.disabled).toBeUndefined();

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
    const form = renderer.root.findByType("form");
    let submission: Promise<void> | undefined;

    await act(async () => {
      submission = form.props.onSubmit({ preventDefault: vi.fn() });
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/site/public/operations/request/submit");
    expect(publicOperationFormSurface(renderer, "submitting")).toBeDefined();
    expect(publicOperationControl(renderer, "title", "TextInput").props.disabled).toBe(true);
    expect(publicOperationControl(renderer, "title", "TextInput").props["data-loading"]).toBe(true);
    expect(
      renderer.root.findByProps({ "data-public-form-challenge": "turnstile" }).props[
        "aria-disabled"
      ],
    ).toBe(true);
    expect(componentByLabel(renderer, "Button", "Sending...").props["data-loading"]).toBe(true);

    await act(async () => {
      response.resolve(Response.json(publicGenericCommandResponse()));
      await required(submission);
    });

    expect(publicOperationFormSurface(renderer, "success")).toBeDefined();
    expect(rendererText(renderer)).toContain("Request received.");
    expect(renderer.root.findAllByProps({ "data-component": "Button" })).toHaveLength(0);

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
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() });
    });

    expect(publicOperationFormSurface(renderer, "failed")).toBeDefined();
    expect(rendererText(renderer)).toContain("Please try the request again.");
    expect(rendererText(renderer)).not.toContain("private-operation-failure");
    expect(renderer.root.findByProps({ role: "alert" })).toBeDefined();
    expect(
      renderer.root.findByProps({ "data-public-form-challenge": "turnstile" }).props[
        "data-public-form-challenge-reset"
      ],
    ).toBe(1);

    await act(async () => {
      componentByLabel(renderer, "Button", "Try again").props.onClick();
    });

    expect(publicOperationFormSurface(renderer, "ready")).toBeDefined();
    expect(rendererText(renderer)).not.toContain("Please try the request again.");
    expect(componentByLabel(renderer, "Button", "Submit").props.disabled).toBe(true);

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
    expect(renderer.root.findAllByType("form")).toHaveLength(0);
    expect(renderer.root.findAllByProps({ "data-public-field-name": "title" })).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ "data-component": "SitePublicTurnstileChallenge" }),
    ).toHaveLength(0);
    expect(renderer.root.findAllByProps({ "data-component": "Button" })).toHaveLength(0);

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
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(<AstryxSitePublicSystemStateRenderer {...props} />);
    });
    const mounted = required(renderer);

    expect(mounted.root.findByProps({ "data-site-system-state": kind })).toBeDefined();
    expect(rendererText(mounted)).toContain(title);
    expect(rendererText(mounted)).toContain(detail);
    if (kind === "not-found") {
      expect(mounted.root.findByProps({ href: "/sites/astryx" })).toBeDefined();
    }
    if (kind === "failure") {
      expect(mounted.root.findByProps({ role: "alert" })).toBeDefined();
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
    const html = renderToStaticMarkup(<AstryxSitePublicSystemStateRenderer {...props} />);

    expect(html).toContain(title);
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

function fixedFormSurface(renderer: ReactTestRenderer, status: string) {
  return renderer.root.find(
    (node) =>
      typeof node.type === "string" &&
      node.props["data-public-form-state"] === status &&
      typeof node.props["data-public-form-kind"] === "string",
  );
}

function fixedFields(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      (node.type === "input" || node.type === "textarea") &&
      typeof node.props["data-public-fixed-field"] === "string",
  );
}

function fixedField(renderer: ReactTestRenderer, name: string) {
  return renderer.root.find(
    (node) =>
      typeof node.type === "string" &&
      (node.type === "input" || node.type === "textarea") &&
      node.props["data-public-fixed-field"] === name,
  );
}

async function changeFixedField(renderer: ReactTestRenderer, name: string, value: string) {
  await act(async () => {
    fixedField(renderer, name).props.onChange({ currentTarget: { value } });
  });
}

async function solveFixedFormChallenge(renderer: ReactTestRenderer, token: string) {
  await act(async () => {
    renderer.root
      .findByProps({ "data-component": "SitePublicTurnstileChallenge" })
      .props.onTokenChange(token);
  });
}

function publicOperationFormSurface(renderer: ReactTestRenderer, status: string) {
  return renderer.root.find(
    (node) =>
      typeof node.type === "string" &&
      node.props["data-public-form-kind"] === "publicOperation" &&
      node.props["data-public-form-state"] === status,
  );
}

function publicOperationFields(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      typeof node.type === "string" && typeof node.props["data-public-field-name"] === "string",
  );
}

function publicOperationField(renderer: ReactTestRenderer, name: string) {
  return renderer.root.find(
    (node) => typeof node.type === "string" && node.props["data-public-field-name"] === name,
  );
}

function publicOperationControl(renderer: ReactTestRenderer, name: string, component: string) {
  return publicOperationField(renderer, name).findByProps({ "data-component": component });
}

async function changePublicOperationField(
  renderer: ReactTestRenderer,
  name: string,
  value: string | boolean,
) {
  const field = publicOperationField(renderer, name);
  const control = field.find(
    (node) =>
      typeof node.type === "string" &&
      ["TextInput", "TextArea", "CheckboxInput", "DateInput", "Selector", "Typeahead"].includes(
        node.props["data-component"],
      ),
  );

  await act(async () => {
    if (typeof value === "boolean") {
      control.props.onChange({ currentTarget: { checked: value } });
    } else {
      control.props.onChange({ currentTarget: { value } });
    }
  });
}

async function solvePublicOperationChallenge(renderer: ReactTestRenderer, token: string) {
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
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<AstryxSitePageRenderer {...props} />);
  });
  return required(renderer);
}

function componentLabels(renderer: ReactTestRenderer, component: string): string[] {
  return renderer.root
    .findAll((node) => typeof node.type === "string" && node.props["data-component"] === component)
    .map((node) => node.props["data-label"])
    .filter((label): label is string => typeof label === "string");
}

function publicFormKinds(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type === "string" && typeof node.props["data-public-form-kind"] === "string",
    )
    .map((node) => node.props["data-public-form-kind"]);
}

function componentByLabel(renderer: ReactTestRenderer, component: string, label: string) {
  return renderer.root.find(
    (node) =>
      typeof node.type === "string" &&
      node.props["data-component"] === component &&
      node.props["data-label"] === label,
  );
}

function rendererText(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}

function siteBlockTypes(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type === "string" && typeof node.props["data-site-block-type"] === "string",
    )
    .map((node) => node.props["data-site-block-type"]);
}

function headingOutline(renderer: ReactTestRenderer): Array<[number, string]> {
  return renderer.root
    .findAll((node) => typeof node.type === "string" && /^h[1-6]$/.test(node.type))
    .map((node) => {
      const type = typeof node.type === "string" ? node.type : "h6";
      const text = node.children.map((child) => (typeof child === "string" ? child : "")).join("");

      return [Number(type.slice(1)), text] as [number, string];
    });
}

function markdownHeadingStarts(renderer: ReactTestRenderer): number[] {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props["data-component"] === "Markdown" &&
        typeof node.props["data-heading-level-start"] === "number",
    )
    .map((node) => node.props["data-heading-level-start"]);
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected rendered value");
  }
  return value;
}
