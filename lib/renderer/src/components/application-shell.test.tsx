import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiContractReference,
  FormlessUiDocumentThemeIntent,
  FormlessUiShellNavigationSectionContract,
} from "@dpeek/formless-presentation/contract";
import { formlessUiContractReferenceKey } from "@dpeek/formless-presentation/contract-host";
import {
  createFormlessApplicationShellFixtures,
  type FormlessApplicationShellFixture,
  type FormlessApplicationShellFixtureId,
  type FormlessApplicationShellFixtureState,
} from "./application-shell.fixtures.ts";
import {
  FormlessApplicationShellLayout,
  createFormlessApplicationShellFixtureHost,
  projectFormlessApplicationShellFixturePublication,
} from "./application-shell.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

describe("canonical application-shell fixtures", () => {
  it("cover shell profiles, destinations, navigation, controls, session, and no-shell state", () => {
    const fixtures = createFormlessApplicationShellFixtures();
    const devWorkbench = requiredShell(fixtures, "dev-workbench");
    const productInstance = requiredShell(fixtures, "product-instance");
    const appOnly = requiredShell(fixtures, "app-only");
    const siteAuthoring = requiredShell(fixtures, "site-authoring");
    const appDestinations = requiredSection(devWorkbench, "appSwitcher").destinations;
    const devScreens = requiredSection(devWorkbench, "screens");
    const devRoots = requiredSection(devWorkbench, "rootRecords");
    const devSettings = requiredSection(devWorkbench, "appSettings");
    const devSession = requiredSection(devWorkbench, "session");
    const siteRoots = requiredSection(siteAuthoring, "rootRecords");
    const serializedShells = JSON.stringify(fixtures.map((fixture) => fixture.shell));

    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(fixtures.slice(0, 2).map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "product-instance", label: "Instance" },
      { id: "dev-workbench", label: "App" },
    ]);
    expect(devWorkbench.manifest.scope).toBe("multiApp");
    expect(productInstance.manifest).toMatchObject({ scope: "multiApp", title: "Instance" });
    expect(appOnly.manifest.scope).toBe("appOnly");
    expect(siteAuthoring.manifest).toMatchObject({ scope: "appOnly", title: "Site" });
    expect(appOnly.sections.some((section) => section.role === "appSwitcher")).toBe(false);
    expect(devWorkbench.sections.some((section) => section.role === "instance")).toBe(false);
    expect(
      requiredSection(productInstance, "instance").destinations.map(({ label }) => label),
    ).toEqual(["Settings", "Access"]);
    expect(requiredSection(productInstance, "instance").label).toBeUndefined();
    expect(appDestinations.map(({ label }) => label)).toEqual(["Tasks", "CRM", "Site", "Instance"]);
    expect(appDestinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/", label: "Instance", selected: false }),
      ]),
    );
    expect(requiredSection(productInstance, "appSwitcher").destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/", label: "Instance", selected: true }),
      ]),
    );
    expect(
      appDestinations.filter((destination) => destination.id.includes(":public:")),
    ).toHaveLength(0);
    expect(devScreens.destinations).toHaveLength(3);
    expect(requiredSection(siteAuthoring, "screens").destinations).toHaveLength(3);
    expect(devRoots.destinations.map((destination) => destination.countText)).toEqual([
      "12",
      "7",
      "3",
    ]);
    expect(devRoots.createSurface?.dialog.form.fieldSet.fields[0]).toMatchObject({
      draftInput: { kind: "input", value: "" },
      fieldName: "title",
      mode: "editor",
    });
    expect(devRoots.createSurface?.trigger).toMatchObject({
      accessibilityLabel: "Create projects",
      content: { icon: "add", kind: "iconOnly" },
      density: "compact",
      prominence: "quiet",
    });
    expect(siteRoots.createSurface?.kind).toBe("createSurface");
    expect(devSettings.settings).toMatchObject({
      reset: { kind: "shellReset" },
      sync: { state: "idle" },
      workspaceSave: { state: "saved" },
    });
    expect(devSession.session).toMatchObject({
      identity: { displayName: "Ada Lovelace", secondaryLabel: "ada@example.com" },
      state: "authenticated",
    });
    expect(requiredFixture(fixtures, "no-shell").shell).toBeNull();
    expect(serializedShells).not.toContain("className");
    expect(serializedShells.toLowerCase()).not.toContain("theme");
  });

  it("covers fixed and user document-theme snapshots outside shell state", () => {
    const fixtures = createFormlessApplicationShellFixtures();

    expect(requiredFixture(fixtures, "product-instance").documentTheme).toMatchObject({
      activeMode: "light",
      policy: { kind: "fixed", mode: "light" },
    });
    expect(requiredFixture(fixtures, "app-only").documentTheme).toMatchObject({
      activeMode: "dark",
      policy: { kind: "fixed", mode: "dark" },
    });
    expect(requiredFixture(fixtures, "dev-workbench").documentTheme).toMatchObject({
      activeMode: "dark",
      policy: { kind: "userControlled" },
      selectionControl: { selectedMode: "system" },
    });
    expect(requiredFixture(fixtures, "site-authoring").documentTheme).toMatchObject({
      activeMode: "dark",
      selectionControl: { selectedMode: "dark" },
    });
    expect(requiredFixture(fixtures, "no-shell").documentTheme).toBeNull();
  });

  it("reduces root selection, controlled create, reset, and logout through the memory host", () => {
    const fixture = requiredFixture(createFormlessApplicationShellFixtures(), "dev-workbench");
    const fixtureHost = createFormlessApplicationShellFixtureHost(fixture);
    const initial = requiredCurrentShell(fixtureHost.getShell());
    const roots = requiredSection(initial, "rootRecords");
    const website = roots.destinations[1];

    if (website?.kind !== "shellRootRecordDestination" || !roots.createSurface) {
      throw new Error("Missing interactive root fixtures.");
    }

    fixtureHost.host.dispatch(website.selectionIntent);
    const selected = requiredCurrentShell(fixtureHost.getShell());
    expect(selected.manifest.activeDestination).toEqual({
      destinationId: website.id,
      sectionId: roots.id,
    });
    expect(
      requiredSection(selected, "rootRecords").destinations.find(
        (destination) => destination.selected,
      )?.label,
    ).toBe("Website");

    fixtureHost.host.dispatch({
      intent: { open: true, surfaceId: roots.createSurface.id, type: "createOpenChange" },
      sectionId: roots.id,
      shellId: initial.manifest.id,
      surfaceId: roots.createSurface.id,
      type: "shellCreate",
    });
    fixtureHost.host.dispatch({
      fieldId: roots.createSurface.dialog.form.fieldSet.fields[0]!.fieldId,
      intent: {
        fieldName: "title",
        fieldValue: { kind: "input", value: "Research" },
        type: "createDraftChange",
      },
      sectionId: roots.id,
      shellId: initial.manifest.id,
      surfaceId: roots.createSurface.id,
      type: "shellCreate",
    });
    fixtureHost.host.dispatch({
      intent: { surfaceId: roots.createSurface.id, type: "createSubmit" },
      sectionId: roots.id,
      shellId: initial.manifest.id,
      surfaceId: roots.createSurface.id,
      type: "shellCreate",
    });
    const created = requiredCurrentShell(fixtureHost.getShell());
    const createdRoots = requiredSection(created, "rootRecords");
    expect(createdRoots.destinations.at(-1)).toMatchObject({
      countText: "0",
      label: "Research",
      selected: true,
    });
    expect(createdRoots.createSurface?.dialog.open).toBe(false);

    const settings = requiredSection(created, "appSettings");
    const reset = settings.settings?.reset;
    if (!reset) {
      throw new Error("Missing reset fixture.");
    }

    fixtureHost.host.dispatch({
      controlId: reset.id,
      intent: { open: true, type: "resetOpenChange" },
      sectionId: settings.id,
      shellId: created.manifest.id,
      type: "shellReset",
    });
    fixtureHost.host.dispatch({
      controlId: reset.id,
      intent: { type: "resetConfirm" },
      sectionId: settings.id,
      shellId: created.manifest.id,
      type: "shellReset",
    });
    expect(
      requiredSection(requiredCurrentShell(fixtureHost.getShell()), "appSettings").settings?.reset,
    ).toMatchObject({
      confirmation: { open: false },
      status: { message: "Source seed data reset.", state: "success" },
    });

    const session = requiredSection(requiredCurrentShell(fixtureHost.getShell()), "session");
    if (session.session?.state !== "authenticated") {
      throw new Error("Missing authenticated session fixture.");
    }

    fixtureHost.host.dispatch({
      controlId: session.session.logout.id,
      sectionId: session.id,
      shellId: created.manifest.id,
      type: "shellLogout",
    });
    expect(
      requiredSection(requiredCurrentShell(fixtureHost.getShell()), "session").session?.state,
    ).toBe("anonymous");
  });

  it("publishes only fixture references changed by each reducer", () => {
    const fixture = requiredFixture(createFormlessApplicationShellFixtures(), "dev-workbench");
    const fixtureHost = createFormlessApplicationShellFixtureHost(fixture);
    const shell = requiredCurrentShell(fixtureHost.getShell());
    const publication = projectFormlessApplicationShellFixturePublication(shell);
    const roots = requiredSection(shell, "rootRecords");
    const settings = requiredSection(shell, "appSettings");
    const session = requiredSection(shell, "session");
    const notifications = new Set<string>();
    const unsubscribe = publication.nodes.map(({ reference }) =>
      fixtureHost.host.subscribe(reference, () => {
        notifications.add(formlessUiContractReferenceKey(reference));
      }),
    );
    const website = roots.destinations[1];

    if (
      website?.kind !== "shellRootRecordDestination" ||
      !roots.createSurface ||
      !settings.settings?.reset ||
      session.session?.state !== "authenticated" ||
      !publication.shellReference
    ) {
      throw new Error("Missing scoped host fixtures.");
    }

    fixtureHost.host.dispatch(website.selectionIntent);
    expect(notifications).toEqual(
      new Set([
        formlessUiContractReferenceKey(publication.shellReference),
        referenceKey(publication.nodes, roots.id),
      ]),
    );

    notifications.clear();
    fixtureHost.host.dispatch({
      fieldId: roots.createSurface.dialog.form.fieldSet.fields[0]!.fieldId,
      intent: {
        fieldName: "title",
        fieldValue: { kind: "input", value: "Research" },
        type: "createDraftChange",
      },
      sectionId: roots.id,
      shellId: shell.manifest.id,
      surfaceId: roots.createSurface.id,
      type: "shellCreate",
    });
    expect(notifications).toEqual(new Set([referenceKey(publication.nodes, roots.id)]));

    notifications.clear();
    fixtureHost.host.dispatch({
      controlId: settings.settings.reset.id,
      intent: { open: true, type: "resetOpenChange" },
      sectionId: settings.id,
      shellId: shell.manifest.id,
      type: "shellReset",
    });
    expect(notifications).toEqual(new Set([referenceKey(publication.nodes, settings.id)]));

    notifications.clear();
    fixtureHost.host.dispatch({
      controlId: session.session.logout.id,
      sectionId: session.id,
      shellId: shell.manifest.id,
      type: "shellLogout",
    });
    expect(notifications).toEqual(new Set([referenceKey(publication.nodes, session.id)]));

    for (const stopListening of unsubscribe) {
      stopListening();
    }
  });

  it("reduces theme selection through its separate memory-host node", () => {
    const fixture = requiredFixture(createFormlessApplicationShellFixtures(), "dev-workbench");
    const fixtureHost = createFormlessApplicationShellFixtureHost(fixture);
    const shellBefore = fixtureHost.getShell();
    const themeBefore = fixtureHost.getDocumentTheme();
    const control = themeBefore?.selectionControl;
    const light = control?.options.find((option) => option.mode === "light");
    const themeReference = fixtureHost.themeReference;

    if (!light || !themeReference) {
      throw new Error("Missing controlled document-theme fixture.");
    }

    const notifications: string[] = [];
    const stopListening = fixtureHost.host.subscribe(themeReference, () => {
      notifications.push(formlessUiContractReferenceKey(themeReference));
    });

    fixtureHost.host.dispatch(light.selectionIntent);

    expect(fixtureHost.getDocumentTheme()).toMatchObject({
      activeMode: "light",
      selectionControl: { selectedMode: "light" },
    });
    expect(fixtureHost.getShell()).toBe(shellBefore);
    expect(notifications).toEqual([formlessUiContractReferenceKey(themeReference)]);

    const fixedFixture = requiredFixture(
      createFormlessApplicationShellFixtures(),
      "product-instance",
    );
    if (!fixedFixture.documentTheme) {
      throw new Error("Missing fixed document-theme fixture.");
    }
    const unsupportedFixedIntent: FormlessUiDocumentThemeIntent = {
      ...light.selectionIntent,
      themeId: fixedFixture.documentTheme.id,
    };
    const fixedHost = createFormlessApplicationShellFixtureHost(fixedFixture);
    const fixedBefore = fixedHost.getDocumentTheme();
    fixedHost.host.dispatch(unsupportedFixedIntent);
    expect(fixedHost.getDocumentTheme()).toBe(fixedBefore);

    stopListening();
  });

  it("projects an empty host graph for no-shell selection", () => {
    const fixture = requiredFixture(createFormlessApplicationShellFixtures(), "no-shell");
    const fixtureHost = createFormlessApplicationShellFixtureHost(fixture);
    const publication = projectFormlessApplicationShellFixturePublication(fixture.shell);

    expect(fixtureHost.shellReference).toBeNull();
    expect(fixtureHost.getShell()).toBeNull();
    expect(publication).toEqual({ nodes: [], shellReference: null, themeReference: null });
  });
});

describe("Application Shell prototype layout", () => {
  it("renders the real subscribed Astryx shell around the selected route child", () => {
    const html = renderToStaticMarkup(<FormlessApplicationShellLayout />);

    expect(html).toContain('data-testid="formless-astryx-application-shell:shell:application"');
    expect(html).toContain("Application Shell");
    expect(html).toContain("Settings");
    expect(html).not.toContain("Personal Site public site");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).not.toContain("Dev workbench");
    expect(html).not.toContain("Product instance");
    expect(html).toContain("No shell");
  });

  it("keeps fixtures and reducers free of runtime dependencies", async () => {
    const fixtureSource = await readFile(
      new URL("./application-shell.fixtures.ts", import.meta.url),
      "utf8",
    );
    const hostSource = await readFile(new URL("./application-shell.tsx", import.meta.url), "utf8");
    const shellSource = await readFile(new URL("./shell.tsx", import.meta.url), "utf8");
    const sideNavSource = await readFile(new URL("./side-nav.tsx", import.meta.url), "utf8");
    const imports = [fixtureSource, hostSource].flatMap(importSpecifiers);
    const forbiddenImports = imports.filter((specifier) =>
      /(?:^|\/)(?:src\/app|src\/client|routing|storage|replica|operation-controller|session-client)(?:\/|$)|formless-schema|\bwouter\b/.test(
        specifier,
      ),
    );
    expect(hostSource).toContain("createFormlessUiMemoryContractHost");
    expect(hostSource).toContain("AstryxSubscribedApplicationShellRenderer");
    expect(shellSource).toContain("useFormlessUiDocumentTheme(themeReference)");
    expect(forbiddenImports).toEqual([]);
    expect(fixtureSource).toContain("documentTheme");
    expect(sideNavSource).not.toContain("FormlessUiDocumentTheme");
  });
});

function requiredFixture(
  fixtures: readonly FormlessApplicationShellFixture[],
  id: FormlessApplicationShellFixtureId,
) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} application shell fixture.`);
  }
  return fixture;
}

function requiredShell(
  fixtures: readonly FormlessApplicationShellFixture[],
  id: FormlessApplicationShellFixtureId,
) {
  return requiredCurrentShell(requiredFixture(fixtures, id).shell);
}

function requiredCurrentShell(shell: FormlessApplicationShellFixtureState | null) {
  if (!shell) {
    throw new Error("Expected application shell fixture state.");
  }
  return shell;
}

function requiredSection(
  shell: FormlessApplicationShellFixtureState,
  role: FormlessUiShellNavigationSectionContract["role"],
) {
  const section = shell.sections.find((candidate) => candidate.role === role);
  if (!section) {
    throw new Error(`Missing ${role} application shell fixture section.`);
  }
  return section;
}

function referenceKey(
  nodes: readonly { reference: FormlessUiContractReference }[],
  sectionId: string,
) {
  const reference = nodes.find(
    (node) =>
      node.reference.kind === "shellNavigationSectionReference" &&
      node.reference.sectionId === sectionId,
  )?.reference;

  if (!reference) {
    throw new Error(`Missing ${sectionId} fixture reference.`);
  }

  return formlessUiContractReferenceKey(reference);
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}
