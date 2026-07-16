import { Children, createElement, isValidElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiButtonContract,
  FormlessUiCreateSurfaceContract,
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntent,
  FormlessUiShellIntent,
  FormlessUiShellManifestContract,
  FormlessUiShellNavigationSectionContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiDocumentThemeReference,
  formlessUiShellManifestReference,
  formlessUiShellNavigationSectionReference,
  type FormlessUiContractHostNodeSet,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  AstryxApplicationShellRenderer,
  AstryxSubscribedApplicationShellRenderer,
} from "./shell.tsx";

vi.mock("@astryxdesign/core", () => ({
  Theme: ({ children, mode }: { children: ReactNode; mode: string }) =>
    createElement("div", { "data-component": "Theme", "data-mode": mode }, children),
}));

vi.mock("@astryxdesign/core/SegmentedControl", () => ({
  SegmentedControl: ({
    children,
    label,
    onChange,
    value,
  }: {
    children: ReactNode;
    label: string;
    onChange: (value: string) => void;
    value: string;
  }) =>
    createElement(
      "div",
      { "aria-label": label, role: "radiogroup" },
      Children.map(children, (child) =>
        isValidElement<{ label: string; value: string }>(child)
          ? createElement(
              "button",
              {
                "aria-checked": child.props.value === value,
                "aria-label": child.props.label,
                onClick: () => onChange(child.props.value),
                role: "radio",
              },
              child.props.label,
            )
          : child,
      ),
    ),
  SegmentedControlItem: () => null,
}));

vi.mock("@astryxdesign/core/AppShell", () => ({
  AppShell: ({
    children,
    mobileNav,
    sideNav,
    "data-testid": testId,
  }: {
    children: ReactNode;
    mobileNav: { isOpen: boolean; onOpenChange: (open: boolean) => void };
    sideNav: ReactNode;
    "data-testid": string;
  }) =>
    createElement(
      "div",
      {
        "data-component": "AppShell",
        "data-mobile-open": String(mobileNav.isOpen),
        "data-testid": testId,
      },
      createElement(
        "button",
        {
          "data-action": "toggle-mobile-navigation",
          onClick: () => mobileNav.onOpenChange(!mobileNav.isOpen),
        },
        "Toggle mobile navigation",
      ),
      sideNav,
      createElement("main", null, children),
    ),
}));

vi.mock("@astryxdesign/core/SideNav", () => ({
  SideNav: ({
    children,
    collapsible,
    footer,
    header,
  }: {
    children: ReactNode;
    collapsible?: { isCollapsed: boolean; onCollapsedChange: (collapsed: boolean) => void };
    footer: ReactNode;
    header: ReactNode;
  }) =>
    createElement(
      "aside",
      { "data-collapsible": String(Boolean(collapsible)), "data-component": "SideNav" },
      collapsible
        ? createElement(
            "button",
            {
              "data-action": "toggle-collapsed-navigation",
              onClick: () => collapsible.onCollapsedChange(!collapsible.isCollapsed),
            },
            "Toggle collapsed navigation",
          )
        : null,
      header,
      createElement("nav", null, children),
      createElement("footer", null, footer),
    ),
  SideNavHeading: ({ heading, menu }: { heading: string; menu?: ReactNode }) =>
    createElement(
      "header",
      { "data-component": "SideNavHeading", "data-heading": heading },
      heading,
      menu,
    ),
  SideNavItem: ({
    endContent,
    href,
    isDisabled,
    isSelected,
    label,
    onClick,
  }: {
    endContent?: ReactNode;
    href?: string;
    isDisabled?: boolean;
    isSelected?: boolean;
    label: string;
    onClick?: () => void;
  }) =>
    createElement(
      href && !isDisabled ? "a" : "button",
      {
        "data-component": "SideNavItem",
        "data-label": label,
        "data-selected": String(Boolean(isSelected)),
        disabled: Boolean(isDisabled),
        href: href && !isDisabled ? href : undefined,
        onClick,
      },
      label,
      endContent,
    ),
  SideNavSection: ({
    children,
    endContent,
    isHeaderHidden,
    title,
  }: {
    children: ReactNode;
    endContent?: ReactNode;
    isHeaderHidden?: boolean;
    title: string;
  }) =>
    createElement(
      "section",
      {
        "data-component": "SideNavSection",
        "data-header-hidden": String(Boolean(isHeaderHidden)),
        "data-title": title,
      },
      endContent,
      children,
    ),
}));

vi.mock("@astryxdesign/core/NavMenu", () => ({
  NavHeadingMenu: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "NavHeadingMenu" }, children),
  NavHeadingMenuItem: ({
    description,
    href,
    isDisabled,
    label,
  }: {
    description?: ReactNode;
    href?: string;
    isDisabled?: boolean;
    label: ReactNode;
  }) =>
    createElement(
      href && !isDisabled ? "a" : "button",
      {
        "data-component": "NavHeadingMenuItem",
        disabled: Boolean(isDisabled),
        href: href && !isDisabled ? href : undefined,
      },
      label,
      description,
    ),
}));

vi.mock("@astryxdesign/core/AlertDialog", () => ({
  AlertDialog: ({
    actionLabel,
    cancelLabel,
    description,
    isActionLoading,
    isOpen,
    onAction,
    onOpenChange,
    title,
  }: {
    actionLabel: string;
    cancelLabel: string;
    description: string;
    isActionLoading: boolean;
    isOpen: boolean;
    onAction: () => void;
    onOpenChange: (open: boolean) => void;
    title: string;
  }) =>
    isOpen
      ? createElement(
          "div",
          {
            "data-action-loading": String(isActionLoading),
            "data-component": "AlertDialog",
            role: "alertdialog",
          },
          title,
          description,
          createElement(
            "button",
            { "data-action": "cancel-reset", onClick: () => onOpenChange(false) },
            cancelLabel,
          ),
          createElement(
            "button",
            { "data-action": "confirm-reset", onClick: onAction },
            actionLabel,
          ),
        )
      : null,
}));

vi.mock("@astryxdesign/core/Badge", () => ({
  Badge: ({
    label,
    variant,
    ...props
  }: {
    label: ReactNode;
    variant?: string;
    "aria-label"?: string;
  }) =>
    createElement(
      "span",
      {
        "aria-label": props["aria-label"],
        "data-component": "Badge",
        "data-variant": variant,
      },
      label,
    ),
}));

vi.mock("@astryxdesign/core/Button", () => ({
  Button: ({
    children,
    isDisabled,
    isLoading,
    label,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    label: string;
    onClick?: () => void;
  }) =>
    createElement(
      "button",
      {
        "aria-label": label,
        "data-component": "Button",
        "data-loading": String(Boolean(isLoading)),
        disabled: Boolean(isDisabled),
        onClick,
      },
      children ?? label,
    ),
}));

vi.mock("@astryxdesign/core/HStack", () => ({
  HStack: ({ children, role }: { children: ReactNode; role?: string }) =>
    createElement("div", { "data-component": "HStack", role }, children),
}));

vi.mock("@astryxdesign/core/HoverCard", () => ({
  HoverCard: ({
    alignment,
    children,
    content,
    focusTrigger,
    placement,
  }: {
    alignment?: string;
    children: ReactNode;
    content: ReactNode;
    focusTrigger?: string;
    placement?: string;
  }) =>
    createElement(
      "div",
      {
        "data-alignment": alignment,
        "data-component": "HoverCard",
        "data-focus-trigger": focusTrigger,
        "data-placement": placement,
      },
      children,
      createElement("div", { "data-slot": "hover-card-content" }, content),
    ),
}));

vi.mock("@astryxdesign/core/MetadataList", () => ({
  MetadataList: ({ children, columns }: { children: ReactNode; columns?: string }) =>
    createElement("dl", { "data-columns": columns, "data-component": "MetadataList" }, children),
  MetadataListItem: ({ children, label }: { children: ReactNode; label: string }) =>
    createElement(
      "div",
      { "data-component": "MetadataListItem", "data-label": label },
      createElement("dt", null, label),
      createElement("dd", null, children),
    ),
}));

vi.mock("@astryxdesign/core/VStack", () => ({
  VStack: ({
    children,
    role,
    ...props
  }: {
    children: ReactNode;
    role?: string;
    "aria-label"?: string;
  }) =>
    createElement(
      "div",
      {
        "aria-label": props["aria-label"],
        "data-component": "VStack",
        role,
      },
      children,
    ),
}));

vi.mock("@astryxdesign/core/Text", () => ({
  Text: ({
    as = "span",
    children,
    color,
    role,
    weight,
  }: {
    as?: string;
    children: ReactNode;
    color?: string;
    role?: string;
    weight?: string;
  }) =>
    createElement(
      as,
      { "data-color": color, "data-component": "Text", "data-weight": weight, role },
      children,
    ),
}));

vi.mock("./create-surfaces.tsx", () => ({
  AstryxCreateSurfaceRenderer: ({
    onFieldIntent,
    onIntent,
    surface,
  }: {
    onFieldIntent: (
      fieldId: string,
      intent: {
        fieldName: string;
        fieldValue: { kind: "input"; value: string };
        type: "createDraftChange";
      },
    ) => void;
    onIntent: (intent: { open: boolean; surfaceId: string; type: "createOpenChange" }) => void;
    surface: FormlessUiCreateSurfaceContract;
  }) =>
    createElement(
      "div",
      {
        "data-component": "AstryxCreateSurfaceRenderer",
        "data-errors": surface.dialog.form.errors.join(" "),
        "data-open": String(surface.dialog.open),
        "data-pending": String(Boolean(surface.dialog.form.submit.pending?.isPending)),
        "data-surface": surface.id,
        "data-trigger-kind": surface.trigger.content.kind,
        "data-trigger-prominence": surface.trigger.prominence,
      },
      createElement(
        "button",
        {
          "data-action": "open-create",
          onClick: () => onIntent({ open: true, surfaceId: surface.id, type: "createOpenChange" }),
        },
        "Open create",
      ),
      createElement(
        "button",
        {
          "data-action": "change-create-field",
          onClick: () =>
            onFieldIntent("field:create:page:label", {
              fieldName: "label",
              fieldValue: { kind: "input", value: "New page" },
              type: "createDraftChange",
            }),
        },
        "Change create field",
      ),
    ),
}));

vi.mock("./operation-controls.tsx", () => ({
  operationIcon: (icon: string) => createElement("span", { "data-icon": icon }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shellReference = formlessUiShellManifestReference("shell:application");
const themeReference = formlessUiDocumentThemeReference("theme:application");
const sectionReferences = {
  instance: formlessUiShellNavigationSectionReference(shellReference.shellId, "section:instance"),
  apps: formlessUiShellNavigationSectionReference(shellReference.shellId, "section:apps"),
  screens: formlessUiShellNavigationSectionReference(shellReference.shellId, "section:screens"),
  roots: formlessUiShellNavigationSectionReference(shellReference.shellId, "section:roots"),
  settings: formlessUiShellNavigationSectionReference(shellReference.shellId, "section:settings"),
  session: formlessUiShellNavigationSectionReference(shellReference.shellId, "section:session"),
} as const;

describe("Astryx application shell renderer", () => {
  it("renders contract hierarchy and keeps responsive presentation state local", async () => {
    const intents: FormlessUiShellIntent[] = [];
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <AstryxApplicationShellRenderer
          manifest={shellManifest()}
          onIntent={(intent) => {
            intents.push(intent);
          }}
          onThemeIntent={() => undefined}
          sections={[...shellSections()].reverse()}
          theme={fixedTheme("dark")}
        >
          <article data-route-child="settings">Route workspace</article>
        </AstryxApplicationShellRenderer>,
      );
    });

    if (!renderer) {
      throw new Error("Expected Astryx shell renderer to mount.");
    }

    const mountedRenderer = renderer;
    const sideNavSections = mountedRenderer.root.findAllByProps({
      "data-component": "SideNavSection",
    });
    expect(sideNavSections.map((section) => section.props["data-title"])).toEqual([
      "Tasks screens",
      "Pages",
    ]);
    expect(
      mountedRenderer.root.findAllByProps({ "data-component": "NavHeadingMenuItem" }),
    ).toHaveLength(3);
    expect(requiredByProps(mountedRenderer.root, { "data-label": "Pages" }).props).toMatchObject({
      "data-selected": "true",
      disabled: false,
    });
    expect(
      requiredByProps(mountedRenderer.root, {
        "data-component": "NavHeadingMenuItem",
        href: "/",
      }).props.href,
    ).toBe("/");
    expect(requiredByProps(mountedRenderer.root, { "data-label": "Settings" }).props).toEqual(
      expect.objectContaining({ "data-component": "SideNavItem" }),
    );
    expect(requiredByProps(mountedRenderer.root, { "data-component": "HoverCard" }).props).toEqual(
      expect.objectContaining({
        "data-alignment": "start",
        "data-focus-trigger": "always",
        "data-placement": "end",
      }),
    );
    expect(
      mountedRenderer.root
        .findAllByProps({ "data-component": "MetadataListItem" })
        .map((item) => item.props["data-label"]),
    ).toEqual(["World", "Cursor"]);
    expect(rendererText(mountedRenderer)).toContain("3");
    expect(rendererText(mountedRenderer)).toContain("Sync failed. Try again.");
    expect(rendererText(mountedRenderer)).toContain("Workspace changes are queued.");
    expect(rendererText(mountedRenderer)).toContain("Ada Lovelace");
    expect(rendererText(mountedRenderer)).toContain("ada@example.com");
    expect(rendererText(mountedRenderer)).toContain("Route workspace");
    expect(
      requiredByProps(mountedRenderer.root, { "data-component": "Theme" }).props["data-mode"],
    ).toBe("dark");
    expect(mountedRenderer.root.findAllByProps({ role: "radiogroup" })).toHaveLength(0);

    const createSurface = requiredByProps(mountedRenderer.root, {
      "data-component": "AstryxCreateSurfaceRenderer",
    });
    expect(createSurface.props).toMatchObject({
      "data-errors": "Page name is required.",
      "data-open": "true",
      "data-pending": "true",
      "data-surface": "create:page",
      "data-trigger-kind": "iconOnly",
      "data-trigger-prominence": "quiet",
    });

    expect(
      requiredByProps(mountedRenderer.root, { "data-component": "AppShell" }).props[
        "data-mobile-open"
      ],
    ).toBe("false");
    expect(
      requiredByProps(mountedRenderer.root, { "data-component": "SideNav" }).props[
        "data-collapsible"
      ],
    ).toBe("false");
    expect(
      mountedRenderer.root.findAllByProps({
        "data-action": "toggle-collapsed-navigation",
      }),
    ).toHaveLength(0);

    await act(async () => {
      requiredByProps(mountedRenderer.root, {
        "data-action": "toggle-mobile-navigation",
      }).props.onClick();
    });

    expect(
      requiredByProps(mountedRenderer.root, { "data-component": "AppShell" }).props[
        "data-mobile-open"
      ],
    ).toBe("true");
    await act(async () => {
      requiredByProps(mountedRenderer.root, { "data-label": "Pages" }).props.onClick();
      requiredByProps(mountedRenderer.root, { "data-action": "open-create" }).props.onClick();
      requiredByProps(mountedRenderer.root, {
        "data-action": "change-create-field",
      }).props.onClick();
      requiredByProps(mountedRenderer.root, {
        "aria-label": "Reset source seed data",
      }).props.onClick();
      requiredByProps(mountedRenderer.root, { "data-action": "cancel-reset" }).props.onClick();
      requiredByProps(mountedRenderer.root, { "data-action": "confirm-reset" }).props.onClick();
      requiredByProps(mountedRenderer.root, { "aria-label": "Log out" }).props.onClick();
    });

    expect(intents).toEqual([
      {
        destinationId: "root:pages",
        recordId: "pages",
        sectionId: sectionReferences.roots.sectionId,
        shellId: shellReference.shellId,
        type: "shellRootRecordSelection",
      },
      {
        intent: { open: true, surfaceId: "create:page", type: "createOpenChange" },
        sectionId: sectionReferences.roots.sectionId,
        shellId: shellReference.shellId,
        surfaceId: "create:page",
        type: "shellCreate",
      },
      {
        fieldId: "field:create:page:label",
        intent: {
          fieldName: "label",
          fieldValue: { kind: "input", value: "New page" },
          type: "createDraftChange",
        },
        sectionId: sectionReferences.roots.sectionId,
        shellId: shellReference.shellId,
        surfaceId: "create:page",
        type: "shellCreate",
      },
      {
        controlId: "reset:tasks",
        intent: { open: true, type: "resetOpenChange" },
        sectionId: sectionReferences.settings.sectionId,
        shellId: shellReference.shellId,
        type: "shellReset",
      },
      {
        controlId: "reset:tasks",
        intent: { open: false, type: "resetOpenChange" },
        sectionId: sectionReferences.settings.sectionId,
        shellId: shellReference.shellId,
        type: "shellReset",
      },
      {
        controlId: "reset:tasks",
        intent: { type: "resetConfirm" },
        sectionId: sectionReferences.settings.sectionId,
        shellId: shellReference.shellId,
        type: "shellReset",
      },
      {
        controlId: "logout:owner",
        sectionId: sectionReferences.session.sectionId,
        shellId: shellReference.shellId,
        type: "shellLogout",
      },
    ]);

    await act(async () => {
      mountedRenderer.unmount();
    });
  });

  it("subscribes through shell references and dispatches through the host", async () => {
    const intents: FormlessUiShellIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        if (intent.type.startsWith("shell")) {
          intents.push(intent as FormlessUiShellIntent);
        }
      },
      nodes: shellNodes(),
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <FormlessUiContractHostProvider host={host}>
          <AstryxSubscribedApplicationShellRenderer shellReference={shellReference}>
            <article data-route-child="subscribed">Subscribed workspace</article>
          </AstryxSubscribedApplicationShellRenderer>
        </FormlessUiContractHostProvider>,
      );
    });

    if (!renderer) {
      throw new Error("Expected subscribed Astryx shell renderer to mount.");
    }

    const mountedRenderer = renderer;
    expect(rendererText(mountedRenderer)).toContain("Subscribed workspace");
    expect(rendererText(mountedRenderer)).toContain("Tasks");

    await act(async () => {
      requiredByProps(mountedRenderer.root, { "data-label": "Pages" }).props.onClick();
    });

    expect(intents).toEqual([
      {
        destinationId: "root:pages",
        recordId: "pages",
        sectionId: sectionReferences.roots.sectionId,
        shellId: shellReference.shellId,
        type: "shellRootRecordSelection",
      },
    ]);

    const updatedSections = shellSections().map((section) =>
      section.id === sectionReferences.screens.sectionId
        ? { ...section, label: "Updated screens" }
        : section,
    );
    await act(async () => {
      host.publish(shellNodes(updatedSections));
    });

    expect(rendererText(mountedRenderer)).toContain("Updated screens");

    await act(async () => {
      mountedRenderer.unmount();
    });
  });

  it("composes the separate subscribed theme node without changing shell sections", async () => {
    const intents: FormlessUiDocumentThemeIntent[] = [];
    const sections = shellSections();
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        if (intent.type === "documentThemeModeSelection") {
          intents.push(intent);
        }
      },
      nodes: [...shellNodes(sections), { reference: themeReference, snapshot: userTheme() }],
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <FormlessUiContractHostProvider host={host}>
          <AstryxSubscribedApplicationShellRenderer
            shellReference={shellReference}
            themeReference={themeReference}
          >
            <article>Theme workspace</article>
          </AstryxSubscribedApplicationShellRenderer>
        </FormlessUiContractHostProvider>,
      );
    });

    if (!renderer) {
      throw new Error("Expected themed Astryx shell renderer to mount.");
    }

    const mountedRenderer = renderer;
    expect(
      requiredByProps(mountedRenderer.root, { "data-component": "Theme" }).props["data-mode"],
    ).toBe("dark");
    expect(
      requiredByProps(mountedRenderer.root, { "aria-label": "Theme mode", role: "radiogroup" }),
    ).toBeDefined();
    expect(rendererText(mountedRenderer)).toContain("Theme workspace");
    expect(rendererText(mountedRenderer)).toContain("Tasks");
    expect(JSON.stringify(sections).toLowerCase()).not.toContain("theme");

    await act(async () => {
      requiredByProps(mountedRenderer.root, {
        "aria-label": "Light",
        role: "radio",
      }).props.onClick();
    });

    expect(intents).toEqual([
      {
        controlId: "control:theme-mode",
        mode: "light",
        themeId: themeReference.themeId,
        type: "documentThemeModeSelection",
      },
    ]);

    await act(async () => {
      mountedRenderer.unmount();
    });
  });
});

function shellManifest(): FormlessUiShellManifestContract {
  return {
    accessibilityLabel: "Tasks application shell",
    activeDestination: {
      destinationId: "root:pages",
      sectionId: sectionReferences.roots.sectionId,
    },
    id: shellReference.shellId,
    kind: "shellManifest",
    navigationSections: [
      sectionReferences.apps,
      sectionReferences.screens,
      sectionReferences.roots,
      sectionReferences.settings,
      sectionReferences.session,
    ],
    scope: "multiApp",
    title: "Tasks",
  };
}

function shellSections(): FormlessUiShellNavigationSectionContract[] {
  const rootSelectionIntent = {
    destinationId: "root:pages",
    recordId: "pages",
    sectionId: sectionReferences.roots.sectionId,
    shellId: shellReference.shellId,
    type: "shellRootRecordSelection" as const,
  };

  return [
    shellSection(sectionReferences.apps.sectionId, "appSwitcher", {
      destinations: [
        { ...shellLink("app:tasks", "Tasks", "/tasks"), selected: true },
        shellLink("app:site", "Site", "/site"),
        shellLink("instance:home", "Instance", "/"),
      ],
      label: "Apps",
    }),
    shellSection(sectionReferences.screens.sectionId, "screens", {
      accessibilityLabel: "Tasks screens",
      destinations: [shellLink("screen:today", "Today", "/tasks/today")],
    }),
    shellSection(sectionReferences.roots.sectionId, "rootRecords", {
      createSurface: createSurface(),
      destinations: [
        {
          accessibilityLabel: "Pages",
          availability: { available: true },
          countText: "3",
          id: "root:pages",
          kind: "shellRootRecordDestination",
          label: "Pages",
          recordId: "pages",
          selected: true,
          selectionIntent: rootSelectionIntent,
        },
      ],
      label: "Pages",
    }),
    shellSection(sectionReferences.settings.sectionId, "appSettings", {
      label: "Settings",
      settings: {
        id: "settings:tasks",
        kind: "shellSettings",
        reset: {
          confirmation: {
            cancel: shellButton("reset:cancel", "Cancel"),
            confirm: shellButton("reset:confirm", "Reset", "primary"),
            description: "Replace current records with source seed records.",
            id: "reset:confirmation",
            kind: "shellResetConfirmation",
            open: true,
            title: "Reset Tasks source seed data?",
          },
          id: "reset:tasks",
          kind: "shellReset",
          status: { message: "The last reset failed.", state: "error" },
          trigger: shellButton("reset:trigger", "Reset source seed data"),
        },
        sync: {
          details: [
            { label: "World", value: "tasks" },
            { label: "Cursor", value: "27" },
          ],
          id: "sync:tasks",
          kind: "shellSyncStatus",
          label: "Sync issue",
          message: "Sync failed. Try again.",
          state: "error",
        },
        workspaceSave: {
          id: "workspace:save",
          kind: "shellWorkspaceSaveStatus",
          label: "Queued",
          message: "Workspace changes are queued.",
          state: "queued",
        },
      },
    }),
    shellSection(sectionReferences.session.sectionId, "session", {
      session: {
        id: "session:owner",
        identity: { displayName: "Ada Lovelace", secondaryLabel: "ada@example.com" },
        kind: "shellSession",
        logout: shellButton("logout:owner", "Log out", "quiet"),
        state: "authenticated",
      },
    }),
  ];
}

function shellSection(
  id: string,
  role: FormlessUiShellNavigationSectionContract["role"],
  options: Partial<
    Pick<
      FormlessUiShellNavigationSectionContract,
      "accessibilityLabel" | "createSurface" | "destinations" | "label" | "session" | "settings"
    >
  > = {},
): FormlessUiShellNavigationSectionContract {
  return {
    accessibilityLabel: options.accessibilityLabel ?? `${id} navigation`,
    destinations: options.destinations ?? [],
    id,
    kind: "shellNavigationSection",
    role,
    shellId: shellReference.shellId,
    ...(options.createSurface ? { createSurface: options.createSurface } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.session ? { session: options.session } : {}),
    ...(options.settings ? { settings: options.settings } : {}),
  };
}

function shellLink(id: string, label: string, href: string) {
  return {
    accessibilityLabel: label,
    availability: { available: true as const },
    href,
    id,
    kind: "shellLinkDestination" as const,
    label,
    selected: false,
  };
}

function createSurface(): FormlessUiCreateSurfaceContract {
  return {
    dialog: {
      form: {
        cancel: shellButton("create:cancel", "Cancel"),
        errors: ["Page name is required."],
        fieldSet: {
          disabled: false,
          fields: [],
          id: "create:fields",
          kind: "fieldSet",
        },
        id: "create:form",
        kind: "createForm",
        submit: {
          ...shellButton("create:submit", "Creating...", "primary", "submit"),
          disabled: true,
          pending: { isPending: true, label: "Creating" },
        },
      },
      id: "create:dialog",
      kind: "createDialog",
      open: true,
      title: "Create page",
    },
    id: "create:page",
    kind: "createSurface",
    trigger: {
      ...shellButton("create:trigger", "Create page", "quiet"),
      content: { icon: "add", kind: "iconOnly" },
      density: "compact",
    },
  };
}

function shellButton(
  id: string,
  label: string,
  prominence: FormlessUiButtonContract["prominence"] = "secondary",
  type: FormlessUiButtonContract["type"] = "button",
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}

function shellNodes(
  sections: readonly FormlessUiShellNavigationSectionContract[] = shellSections(),
): FormlessUiContractHostNodeSet {
  return [
    { reference: shellReference, snapshot: shellManifest() },
    ...sections.map((section) => ({
      reference: formlessUiShellNavigationSectionReference(shellReference.shellId, section.id),
      snapshot: section,
    })),
  ];
}

function userTheme(): FormlessUiDocumentThemeContract {
  const controlId = "control:theme-mode";
  const option = (mode: "system" | "light" | "dark", label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId: themeReference.themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    activeMode: "dark",
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "userControlled" },
    selectionControl: {
      accessibilityLabel: "Theme mode",
      id: controlId,
      kind: "documentThemeSelectionControl",
      options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
      selectedMode: "system",
    },
  };
}

function fixedTheme(mode: "light" | "dark"): FormlessUiDocumentThemeContract {
  return {
    activeMode: mode,
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "fixed", mode },
  };
}

function requiredByProps(root: ReactTestInstance, props: Record<string, unknown>) {
  const match = root.findAllByProps(props)[0];
  if (!match) {
    throw new Error(`Expected renderer node matching ${JSON.stringify(props)}.`);
  }
  return match;
}

function rendererText(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}
