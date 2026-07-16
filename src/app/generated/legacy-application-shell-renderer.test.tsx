import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiButtonContract,
  FormlessUiDocumentThemeContract,
  FormlessUiShellIntent,
  FormlessUiShellManifestContract,
  FormlessUiShellNavigationSectionContract,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiDocumentThemeReference,
  formlessUiShellManifestReference,
  formlessUiShellNavigationSectionReference,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import {
  LegacyApplicationShellRenderer,
  LegacySubscribedApplicationShellRenderer,
  legacyApplicationShellLogoutIntent,
  legacyApplicationShellResetIntent,
} from "./legacy-application-shell-renderer.tsx";

describe("legacy application shell renderer", () => {
  it("renders projected hierarchy, selection, counts, controls, and the route child", () => {
    const { manifest, sections } = shellFixture();
    const html = renderToStaticMarkup(
      <LegacyApplicationShellRenderer
        manifest={manifest}
        onIntent={() => undefined}
        sections={sections}
      >
        <article>Route workspace</article>
      </LegacyApplicationShellRenderer>,
    );

    expect(html).toContain('data-formless-shell-scope="multiApp"');
    expect(html).toContain('aria-label="Applications"');
    expect(html).toContain('aria-label="Tasks"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain('aria-label="Instance"');
    expect(html).toContain('href="/"');
    expect(html).toContain('data-formless-shell-destination="root:project-1"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">4</span>");
    expect(html).toContain('aria-label="Reset source seed data"');
    expect(html).toContain('aria-label="Log out"');
    expect(html).toContain("Owner");
    expect(html).toContain("Route workspace");
  });

  it("builds the canonical root, reset, and logout intents dispatched by controls", () => {
    const { sections } = shellFixture();
    const rootSection = required(sections.find((section) => section.role === "rootRecords"));
    const rootDestination = required(rootSection.destinations[0]);
    const settingsSection = required(sections.find((section) => section.role === "appSettings"));
    const reset = required(settingsSection.settings?.reset);
    const sessionSection = required(sections.find((section) => section.role === "session"));
    const session = sessionSection.session;

    if (rootDestination.kind !== "shellRootRecordDestination") {
      throw new Error("Expected root record destination.");
    }

    if (session?.state !== "authenticated") {
      throw new Error("Expected authenticated session.");
    }

    const intents: FormlessUiShellIntent[] = [
      rootDestination.selectionIntent,
      legacyApplicationShellResetIntent(settingsSection, reset, {
        open: true,
        type: "resetOpenChange",
      }),
      legacyApplicationShellLogoutIntent(sessionSection, session),
    ];

    expect(intents).toEqual([
      {
        destinationId: "root:project-1",
        recordId: "project-1",
        sectionId: "shell:roots",
        shellId: "shell",
        type: "shellRootRecordSelection",
      },
      {
        controlId: "shell:reset",
        intent: { open: true, type: "resetOpenChange" },
        sectionId: "shell:settings",
        shellId: "shell",
        type: "shellReset",
      },
      {
        controlId: "shell:logout",
        sectionId: "shell:session",
        shellId: "shell",
        type: "shellLogout",
      },
    ]);
  });

  it("subscribes through shell references and delegates snapshot presentation", () => {
    const { manifest, sections } = shellFixture();
    const reference = formlessUiShellManifestReference(manifest.id);
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        { reference, snapshot: manifest },
        ...sections.map((section) => ({
          reference: formlessUiShellNavigationSectionReference(manifest.id, section.id),
          snapshot: section,
        })),
      ],
    });
    const html = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <LegacySubscribedApplicationShellRenderer shellReference={reference}>
          <article>Subscribed workspace</article>
        </LegacySubscribedApplicationShellRenderer>
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain('data-formless-application-shell="shell"');
    expect(html).toContain('aria-label="Tasks"');
    expect(html).toContain('data-formless-shell-destination="root:project-1"');
    expect(html).toContain("Subscribed workspace");
    expect(html).not.toContain('aria-label="Theme mode"');
  });

  it("composes a separate subscribed theme node with shell presentation", () => {
    const { manifest, sections } = shellFixture();
    const shellReference = formlessUiShellManifestReference(manifest.id);
    const themeReference = formlessUiDocumentThemeReference("theme:application");
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        { reference: shellReference, snapshot: manifest },
        ...sections.map((section) => ({
          reference: formlessUiShellNavigationSectionReference(manifest.id, section.id),
          snapshot: section,
        })),
        { reference: themeReference, snapshot: userThemeFixture(themeReference.themeId) },
      ],
    });
    const html = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <LegacySubscribedApplicationShellRenderer
          shellReference={shellReference}
          themeReference={themeReference}
        >
          <article>Theme workspace</article>
        </LegacySubscribedApplicationShellRenderer>
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain('data-formless-document-theme-active-mode="dark"');
    expect(html).toContain('aria-label="Theme mode"');
    expect(html).toContain('data-formless-application-shell="shell"');
    expect(html).toContain('aria-label="Tasks"');
    expect(html).toContain("Theme workspace");
    expect(JSON.stringify(sections).toLowerCase()).not.toContain("theme");
  });
});

function userThemeFixture(themeId: string): FormlessUiDocumentThemeContract {
  const controlId = "control:theme-mode";
  const option = (mode: "system" | "light" | "dark", label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    activeMode: "dark",
    id: themeId,
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

function shellFixture(): {
  manifest: FormlessUiShellManifestContract;
  sections: readonly FormlessUiShellNavigationSectionContract[];
} {
  const sections: FormlessUiShellNavigationSectionContract[] = [
    {
      accessibilityLabel: "Applications",
      destinations: [
        {
          accessibilityLabel: "Tasks",
          availability: { available: true },
          href: "/tasks",
          id: "app:tasks",
          kind: "shellLinkDestination",
          label: "Tasks",
          selected: false,
        },
        {
          accessibilityLabel: "Instance",
          availability: { available: true },
          href: "/",
          id: "instance:home",
          kind: "shellLinkDestination",
          label: "Instance",
          selected: false,
        },
      ],
      id: "shell:apps",
      kind: "shellNavigationSection",
      label: "Apps",
      role: "appSwitcher",
      shellId: "shell",
    },
    {
      accessibilityLabel: "Projects roots",
      destinations: [
        {
          accessibilityLabel: "Project one",
          availability: { available: true },
          countText: "4",
          id: "root:project-1",
          kind: "shellRootRecordDestination",
          label: "Project one",
          recordId: "project-1",
          selected: true,
          selectionIntent: {
            destinationId: "root:project-1",
            recordId: "project-1",
            sectionId: "shell:roots",
            shellId: "shell",
            type: "shellRootRecordSelection",
          },
        },
      ],
      id: "shell:roots",
      kind: "shellNavigationSection",
      label: "Projects",
      role: "rootRecords",
      shellId: "shell",
    },
    {
      accessibilityLabel: "Tasks app settings",
      destinations: [],
      id: "shell:settings",
      kind: "shellNavigationSection",
      label: "Settings",
      role: "appSettings",
      settings: {
        id: "shell:settings:controls",
        kind: "shellSettings",
        reset: {
          confirmation: {
            cancel: button("shell:reset:cancel", "Cancel", "secondary"),
            confirm: button("shell:reset:confirm", "Reset", "primary"),
            description: "Restore source data.",
            id: "shell:reset:confirmation",
            kind: "shellResetConfirmation",
            open: false,
            title: "Reset source data?",
          },
          id: "shell:reset",
          kind: "shellReset",
          status: { state: "idle" },
          trigger: button("shell:reset:trigger", "Reset source seed data", "secondary"),
        },
      },
      shellId: "shell",
    },
    {
      accessibilityLabel: "Owner session",
      destinations: [],
      id: "shell:session",
      kind: "shellNavigationSection",
      role: "session",
      session: {
        id: "shell:owner-session",
        identity: { displayName: "Owner", secondaryLabel: "owner@example.com" },
        kind: "shellSession",
        logout: button("shell:logout", "Log out", "quiet"),
        state: "authenticated",
      },
      shellId: "shell",
    },
  ];

  return {
    manifest: {
      accessibilityLabel: "Tasks application shell",
      activeDestination: { destinationId: "root:project-1", sectionId: "shell:roots" },
      id: "shell",
      kind: "shellManifest",
      navigationSections: sections.map((section) =>
        formlessUiShellNavigationSectionReference("shell", section.id),
      ),
      scope: "multiApp",
      title: "Tasks",
    },
    sections,
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value;
}

function button(
  id: string,
  label: string,
  prominence: FormlessUiButtonContract["prominence"],
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type: "button",
  };
}
