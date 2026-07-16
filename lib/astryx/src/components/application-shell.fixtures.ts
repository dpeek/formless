import type {
  FormlessUiButtonContract,
  FormlessUiCreateField,
  FormlessUiCreateSurfaceContract,
  FormlessUiShellManifestContract,
  FormlessUiShellNavigationSectionContract,
  FormlessUiShellScope,
} from "../formless-ui-contract.ts";
import { formlessUiShellNavigationSectionReference } from "../formless-ui-contract-host.ts";

export type FormlessApplicationShellFixtureId =
  | "app-only"
  | "dev-workbench"
  | "mapped-app"
  | "no-shell"
  | "product-instance"
  | "site-authoring";

export type FormlessApplicationShellFixtureState = {
  manifest: FormlessUiShellManifestContract;
  sections: readonly FormlessUiShellNavigationSectionContract[];
};

export type FormlessApplicationShellFixture = {
  id: FormlessApplicationShellFixtureId;
  label: string;
  routeLabel: string;
  shell: FormlessApplicationShellFixtureState | null;
};

const shellId = "shell:application";

export function createFormlessApplicationShellFixtures(): FormlessApplicationShellFixture[] {
  return [
    {
      id: "dev-workbench",
      label: "Dev workbench",
      routeLabel: "Tasks workspace",
      shell: devWorkbenchShell(),
    },
    {
      id: "product-instance",
      label: "Product instance",
      routeLabel: "Instance settings",
      shell: productInstanceShell(),
    },
    {
      id: "app-only",
      label: "App only",
      routeLabel: "Tasks workspace",
      shell: appOnlyShell(),
    },
    {
      id: "mapped-app",
      label: "Mapped app",
      routeLabel: "CRM workspace",
      shell: mappedAppShell(),
    },
    {
      id: "site-authoring",
      label: "Site authoring",
      routeLabel: "Site authoring workspace",
      shell: siteAuthoringShell(),
    },
    {
      id: "no-shell",
      label: "No shell",
      routeLabel: "Public Site",
      shell: null,
    },
  ];
}

function devWorkbenchShell(): FormlessApplicationShellFixtureState {
  const sections = [
    instanceSection("/apps/tasks"),
    appSwitcherSection("/apps/tasks"),
    screenSection("tasks", "Tasks", "/apps/tasks", [
      ["today", "Today"],
      ["planning", "Planning"],
      ["completed", "Completed"],
    ]),
    rootSection("tasks", "Projects", [
      ["launch", "Launch", "12"],
      ["website", "Website", "7"],
      ["operations", "Operations", "3"],
    ]),
    settingsSection("tasks", "Tasks", {
      reset: true,
      sync: {
        details: [
          { label: "World", value: "tasks" },
          { label: "Schema", value: "v8" },
          { label: "Cursor", value: "42" },
          { label: "Last sync", value: "Just now" },
        ],
        label: "Synced",
        message: "All local changes are synced.",
        state: "idle",
      },
      workspaceSave: {
        label: "Saved",
        message: "Workspace source is saved.",
        state: "saved",
      },
    }),
    sessionSection(),
  ];

  return shell("Tasks", "multiApp", sections);
}

function productInstanceShell(): FormlessApplicationShellFixtureState {
  const sections = [instanceSection("/"), appSwitcherSection(null), sessionSection()];

  return shell("Formless", "multiApp", sections);
}

function appOnlyShell(): FormlessApplicationShellFixtureState {
  const sections = [
    screenSection("tasks", "Tasks", "/today", [
      ["today", "Today"],
      ["planning", "Planning"],
      ["completed", "Completed"],
    ]),
    rootSection(
      "tasks",
      "Projects",
      [
        ["launch", "Launch", "12"],
        ["website", "Website", "7"],
      ],
      false,
    ),
    settingsSection("tasks", "Tasks", {
      reset: true,
      sync: {
        label: "Synced",
        message: "All changes are synced.",
        state: "idle",
      },
    }),
    sessionSection(),
  ];

  return shell("Tasks", "appOnly", sections);
}

function mappedAppShell(): FormlessApplicationShellFixtureState {
  const sections = [
    screenSection("crm", "CRM", "/companies", [
      ["companies", "Companies"],
      ["contacts", "Contacts"],
      ["pipeline", "Pipeline"],
    ]),
    settingsSection("crm", "CRM", {
      sync: {
        label: "Syncing",
        message: "Receiving CRM changes.",
        state: "syncing",
      },
    }),
    sessionSection(),
  ];

  return shell("CRM", "appOnly", sections);
}

function siteAuthoringShell(): FormlessApplicationShellFixtureState {
  const sections = [
    screenSection("site", "Site", "/admin/content", [
      ["content", "Content"],
      ["forms", "Forms"],
      ["navigation", "Navigation"],
    ]),
    rootSection("site", "Pages", [
      ["home", "Home", "8"],
      ["about", "About", "4"],
      ["contact", "Contact", "2"],
    ]),
    settingsSection("site", "Site", {
      reset: true,
      sync: {
        label: "Sync issue",
        message: "Sync failed. Check the current app and try again.",
        state: "error",
      },
    }),
    sessionSection(),
  ];

  return shell("Site", "appOnly", sections);
}

function shell(
  title: string,
  scope: FormlessUiShellScope,
  sections: readonly FormlessUiShellNavigationSectionContract[],
): FormlessApplicationShellFixtureState {
  const selectedSection = [...sections]
    .reverse()
    .find((section) => section.destinations.some((destination) => destination.selected));
  const selectedDestination = selectedSection?.destinations.find(
    (destination) => destination.selected,
  );

  return {
    manifest: {
      accessibilityLabel: `${title} application shell`,
      activeDestination:
        selectedSection && selectedDestination
          ? { destinationId: selectedDestination.id, sectionId: selectedSection.id }
          : null,
      id: shellId,
      kind: "shellManifest",
      navigationSections: sections.map((section) =>
        formlessUiShellNavigationSectionReference(shellId, section.id),
      ),
      scope,
      title,
    },
    sections,
  };
}

function instanceSection(selectedHref: string | null): FormlessUiShellNavigationSectionContract {
  return section("instance", "instance", {
    destinations: [
      shellLink("instance:settings", "Instance settings", "/", selectedHref === "/"),
      shellLink("instance:access", "Access", "/access", selectedHref === "/access"),
    ],
    label: "Instance",
  });
}

function appSwitcherSection(selectedHref: string | null): FormlessUiShellNavigationSectionContract {
  return section("apps", "appSwitcher", {
    destinations: applicationDestinations().map((destination) => ({
      ...destination,
      selected: destination.href === selectedHref,
    })),
    label: "Apps",
  });
}

function applicationDestinations() {
  return [
    shellLink("app:tasks", "Tasks", "/apps/tasks"),
    shellLink("app:crm", "CRM", "/apps/crm"),
    shellLink("app-install:personal:admin", "Personal Site", "/apps/personal"),
    shellLink("app-install:personal:public:site", "Personal Site public site", "/sites/personal"),
    shellLink("app-install:marketing:admin", "Marketing Site", "/apps/marketing"),
    shellLink(
      "app-install:marketing:public:site",
      "Marketing Site public site",
      "/sites/marketing",
    ),
  ];
}

function screenSection(
  appKey: string,
  appLabel: string,
  selectedHref: string,
  screens: readonly (readonly [id: string, label: string])[],
): FormlessUiShellNavigationSectionContract {
  return section(`screens:${appKey}`, "screens", {
    accessibilityLabel: `${appLabel} screens`,
    destinations: screens.map(([id, label]) => {
      const href = selectedHref.startsWith("/apps/")
        ? `/apps/${appKey}/${id}`
        : selectedHref.startsWith("/admin/")
          ? `/admin/${id}`
          : `/${id}`;

      return shellLink(`screen:${id}`, label, href, href === selectedHref);
    }),
  });
}

function rootSection(
  appKey: string,
  label: string,
  roots: readonly (readonly [recordId: string, recordLabel: string, countText: string])[],
  withCreate = true,
): FormlessUiShellNavigationSectionContract {
  const sectionId = `${shellId}:roots:${appKey}`;

  return section(`roots:${appKey}`, "rootRecords", {
    ...(withCreate ? { createSurface: createSurface(appKey, label) } : {}),
    destinations: roots.map(([recordId, recordLabel, countText], index) => ({
      accessibilityLabel: recordLabel,
      availability: { available: true },
      countText,
      id: `root:${recordId}`,
      kind: "shellRootRecordDestination",
      label: recordLabel,
      recordId,
      selected: index === 0,
      selectionIntent: {
        destinationId: `root:${recordId}`,
        recordId,
        sectionId,
        shellId,
        type: "shellRootRecordSelection",
      },
    })),
    label,
  });
}

function settingsSection(
  appKey: string,
  appLabel: string,
  options: {
    reset?: boolean;
    sync?: {
      details?: readonly { label: string; value: string }[];
      label: string;
      message: string;
      state: "error" | "idle" | "syncing";
    };
    workspaceSave?: {
      label: string;
      message: string;
      state: "clean" | "dirty" | "failed" | "queued" | "saved" | "saving";
    };
  },
): FormlessUiShellNavigationSectionContract {
  const resetId = `${shellId}:reset:${appKey}`;

  return section(`settings:${appKey}`, "appSettings", {
    label: "App settings",
    settings: {
      id: `${shellId}:settings:${appKey}:controls`,
      kind: "shellSettings",
      ...(options.reset
        ? {
            reset: {
              confirmation: {
                cancel: button(`${resetId}:cancel`, "Cancel"),
                confirm: button(`${resetId}:confirm`, "Reset", "primary"),
                description: `This restores the source schema and source seed data for ${appLabel}. Existing records are replaced by the source seed records.`,
                id: `${resetId}:confirmation`,
                kind: "shellResetConfirmation",
                open: false,
                title: `Reset ${appLabel} source seed data?`,
              },
              id: resetId,
              kind: "shellReset",
              status: { state: "idle" },
              trigger: button(`${resetId}:trigger`, "Reset source seed data"),
            },
          }
        : {}),
      ...(options.sync
        ? {
            sync: {
              ...options.sync,
              id: `${shellId}:sync:${appKey}`,
              kind: "shellSyncStatus",
            },
          }
        : {}),
      ...(options.workspaceSave
        ? {
            workspaceSave: {
              ...options.workspaceSave,
              id: `${shellId}:workspace-save:${appKey}`,
              kind: "shellWorkspaceSaveStatus",
            },
          }
        : {}),
    },
  });
}

function sessionSection(): FormlessUiShellNavigationSectionContract {
  return section("owner-session", "session", {
    session: {
      id: `${shellId}:session`,
      identity: {
        displayName: "Ada Lovelace",
        secondaryLabel: "ada@example.com",
      },
      kind: "shellSession",
      logout: button(`${shellId}:session:logout`, "Log out", "quiet"),
      state: "authenticated",
    },
  });
}

function section(
  idSuffix: string,
  role: FormlessUiShellNavigationSectionContract["role"],
  options: Partial<
    Pick<
      FormlessUiShellNavigationSectionContract,
      "accessibilityLabel" | "createSurface" | "destinations" | "label" | "session" | "settings"
    >
  > = {},
): FormlessUiShellNavigationSectionContract {
  const id = `${shellId}:${idSuffix}`;

  return {
    accessibilityLabel: options.accessibilityLabel ?? `${options.label ?? role} navigation`,
    destinations: options.destinations ?? [],
    id,
    kind: "shellNavigationSection",
    role,
    shellId,
    ...(options.createSurface ? { createSurface: options.createSurface } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.session ? { session: options.session } : {}),
    ...(options.settings ? { settings: options.settings } : {}),
  };
}

function shellLink(id: string, label: string, href: string, selected = false) {
  return {
    accessibilityLabel: label,
    availability: { available: true as const },
    href,
    id,
    kind: "shellLinkDestination" as const,
    label,
    selected,
  };
}

function createSurface(appKey: string, label: string): FormlessUiCreateSurfaceContract {
  const id = `${shellId}:create:${appKey}`;

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [createTitleField(label)],
          id: `${id}:fields`,
          kind: "fieldSet",
          label: `${label} details`,
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          ...button(`${id}:submit`, `Create ${label.toLowerCase()}`, "primary", "submit"),
          disabled: true,
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title: `Create ${label.toLowerCase()}`,
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, `Create ${label.toLowerCase()}`, "quiet"),
  };
}

function createTitleField(label: string): FormlessUiCreateField {
  const field = {
    label: `${label} name`,
    required: true,
    type: "text" as const,
  } satisfies FormlessUiCreateField["field"];
  const control = {
    control: { inputType: "text" as const, kind: "input" as const },
    controlKind: "text" as const,
    createDefaultChecked: false,
    createDefaultValue: undefined,
    editor: "text" as const,
    field,
    inputAttributes: {},
    kind: "text" as const,
    label: field.label,
    required: true,
  } satisfies Extract<FormlessUiCreateField["control"], { kind: "text" }>;

  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control,
    density: "default",
    draftInput: { kind: "input", value: "" },
    editor: "text",
    field,
    fieldName: "title",
    label: field.label,
    labelVisibility: "visible",
    mode: "editor",
    required: true,
    surface: "create",
    value: "",
  };
}

function button(
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
