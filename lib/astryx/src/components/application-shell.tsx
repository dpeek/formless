import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type {
  FormlessUiCreateField,
  FormlessUiCreateSurfaceContract,
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntent,
  FormlessUiDocumentThemeReference,
  FormlessUiShellIntent,
  FormlessUiShellManifestReference,
  FormlessUiShellNavigationSectionContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiDocumentThemeReference,
  formlessUiShellManifestReference,
  formlessUiShellNavigationSectionReference,
  isFormlessUiDocumentThemeIntent,
  isFormlessUiShellIntent,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  createFormlessApplicationShellFixtures,
  type FormlessApplicationShellFixture,
  type FormlessApplicationShellFixtureId,
  type FormlessApplicationShellFixtureState,
} from "./application-shell.fixtures.ts";
import { AstryxSubscribedApplicationShellRenderer } from "./shell.tsx";

export function FormlessApplicationShellLayout() {
  const [fixtures] = useState(createFormlessApplicationShellFixtureHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessApplicationShellFixtureId>("product-instance");
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId);

  if (!selectedFixture) {
    return null;
  }

  const routeChild = (
    <main>
      <VStack gap={5} paddingBlock={6} paddingInline={4} width="100%">
        <VStack gap={1}>
          <Heading level={1}>Application Shell</Heading>
          <Text color="secondary">{selectedFixture.routeLabel}</Text>
        </VStack>
        <SegmentedControl
          label="Shell state"
          layout="hug"
          onChange={(value) => setSelectedFixtureId(value as FormlessApplicationShellFixtureId)}
          value={selectedFixtureId}
        >
          {fixtures.map((fixture) => (
            <SegmentedControlItem key={fixture.id} label={fixture.label} value={fixture.id} />
          ))}
        </SegmentedControl>
      </VStack>
    </main>
  );

  return (
    <FormlessUiContractHostProvider host={selectedFixture.host}>
      {selectedFixture.shellReference ? (
        <AstryxSubscribedApplicationShellRenderer
          shellReference={selectedFixture.shellReference}
          themeReference={selectedFixture.themeReference ?? undefined}
        >
          {routeChild}
        </AstryxSubscribedApplicationShellRenderer>
      ) : (
        routeChild
      )}
    </FormlessUiContractHostProvider>
  );
}

export type FormlessApplicationShellFixtureHost = FormlessApplicationShellFixture & {
  getDocumentTheme(): FormlessUiDocumentThemeContract | null;
  getShell(): FormlessApplicationShellFixtureState | null;
  host: Omit<FormlessUiMutableContractHost, "dispatch"> & {
    dispatch(intent: FormlessUiDocumentThemeIntent | FormlessUiShellIntent): void;
  };
  shellReference: FormlessUiShellManifestReference | null;
  themeReference: FormlessUiDocumentThemeReference | null;
};

export function createFormlessApplicationShellFixtureHost(
  fixture: FormlessApplicationShellFixture,
): FormlessApplicationShellFixtureHost {
  let documentTheme = fixture.documentTheme;
  let shell = fixture.shell;
  const initialPublication = projectFormlessApplicationShellFixturePublication(
    shell,
    documentTheme,
  );
  let host: FormlessUiMutableContractHost;

  host = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      if (isFormlessUiDocumentThemeIntent(intent)) {
        const nextDocumentTheme = applyFormlessApplicationShellFixtureThemeIntent(
          documentTheme,
          intent,
        );
        if (nextDocumentTheme === documentTheme) {
          return;
        }

        documentTheme = nextDocumentTheme;
      } else if (isFormlessUiShellIntent(intent)) {
        const nextShell = applyFormlessApplicationShellFixtureIntent(shell, intent);
        if (nextShell === shell) {
          return;
        }

        shell = nextShell;
      } else {
        throw new Error("Application shell fixture host received an unsupported intent.");
      }

      host.publish(projectFormlessApplicationShellFixturePublication(shell, documentTheme).nodes);
    },
    nodes: initialPublication.nodes,
  });

  return {
    ...fixture,
    getDocumentTheme: () => documentTheme,
    getShell: () => shell,
    host: host as FormlessApplicationShellFixtureHost["host"],
    shellReference: initialPublication.shellReference,
    themeReference: initialPublication.themeReference,
  };
}

export function projectFormlessApplicationShellFixturePublication(
  shell: FormlessApplicationShellFixtureState | null,
  documentTheme: FormlessUiDocumentThemeContract | null = null,
): {
  nodes: FormlessUiContractHostNodeSet;
  shellReference: FormlessUiShellManifestReference | null;
  themeReference: FormlessUiDocumentThemeReference | null;
} {
  const shellReference = shell ? formlessUiShellManifestReference(shell.manifest.id) : null;
  const themeReference = documentTheme ? formlessUiDocumentThemeReference(documentTheme.id) : null;

  return {
    nodes: [
      ...(shellReference && shell
        ? [
            { reference: shellReference, snapshot: shell.manifest },
            ...shell.sections.map((section) => ({
              reference: formlessUiShellNavigationSectionReference(shell.manifest.id, section.id),
              snapshot: section,
            })),
          ]
        : []),
      ...(themeReference && documentTheme
        ? [{ reference: themeReference, snapshot: documentTheme }]
        : []),
    ],
    shellReference,
    themeReference,
  };
}

export function applyFormlessApplicationShellFixtureThemeIntent(
  documentTheme: FormlessUiDocumentThemeContract | null,
  intent: FormlessUiDocumentThemeIntent,
): FormlessUiDocumentThemeContract | null {
  const control = documentTheme?.selectionControl;
  const option = control?.options.find(
    (candidate) =>
      candidate.mode === intent.mode &&
      candidate.selectionIntent.controlId === intent.controlId &&
      candidate.selectionIntent.themeId === intent.themeId,
  );

  if (!documentTheme || documentTheme.id !== intent.themeId || !control || !option) {
    return documentTheme;
  }

  return {
    ...documentTheme,
    activeMode: option.mode === "system" ? "dark" : option.mode,
    selectionControl: { ...control, selectedMode: option.mode },
  };
}

export function applyFormlessApplicationShellFixtureIntent(
  shell: FormlessApplicationShellFixtureState | null,
  intent: FormlessUiShellIntent,
): FormlessApplicationShellFixtureState | null {
  if (!shell || shell.manifest.id !== intent.shellId) {
    return shell;
  }

  switch (intent.type) {
    case "shellRootRecordSelection":
      return applyRootSelection(shell, intent);
    case "shellCreate":
      return applyCreate(shell, intent);
    case "shellReset":
      return applyReset(shell, intent);
    case "shellLogout":
      return applyLogout(shell, intent);
  }
}

function createFormlessApplicationShellFixtureHosts() {
  return createFormlessApplicationShellFixtures().map(createFormlessApplicationShellFixtureHost);
}

function applyRootSelection(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<FormlessUiShellIntent, { type: "shellRootRecordSelection" }>,
) {
  const section = shell.sections.find(
    (candidate) => candidate.id === intent.sectionId && candidate.role === "rootRecords",
  );
  const destination = section?.destinations.find(
    (candidate) =>
      candidate.kind === "shellRootRecordDestination" &&
      candidate.id === intent.destinationId &&
      candidate.recordId === intent.recordId,
  );

  if (!section || !destination || !destination.availability.available) {
    return shell;
  }

  const nextSection = {
    ...section,
    destinations: section.destinations.map((candidate) => ({
      ...candidate,
      selected: candidate.id === destination.id,
    })),
  };

  return replaceShellSection(shell, nextSection, {
    destinationId: destination.id,
    sectionId: section.id,
  });
}

function applyCreate(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<FormlessUiShellIntent, { type: "shellCreate" }>,
) {
  const section = shell.sections.find(
    (candidate) =>
      candidate.id === intent.sectionId &&
      candidate.createSurface?.id === intent.surfaceId &&
      candidate.role === "rootRecords",
  );

  const createSurface = section?.createSurface;
  if (!section || !createSurface) {
    return shell;
  }

  if (intent.intent.type === "createOpenChange") {
    const nextSection = withCreateSurface(section, {
      ...createSurface,
      dialog: { ...createSurface.dialog, open: intent.intent.open },
    });
    return replaceShellSection(shell, nextSection);
  }

  if (intent.intent.type === "createDraftChange") {
    const nextSurface = applyCreateDraft(
      createSurface,
      intent.intent.fieldName,
      intent.intent.fieldValue,
    );
    return replaceShellSection(shell, withCreateSurface(section, nextSurface));
  }

  if (intent.intent.type !== "createSubmit") {
    return shell;
  }

  return submitCreate(shell, section, createSurface);
}

function applyCreateDraft(
  surface: FormlessUiCreateSurfaceContract,
  fieldName: string,
  draftInput: NonNullable<FormlessUiCreateField["draftInput"]>,
): FormlessUiCreateSurfaceContract {
  const fields = surface.dialog.form.fieldSet.fields.map((field) =>
    field.fieldName === fieldName
      ? {
          ...field,
          draftInput,
          value: typeof draftInput.value === "string" ? draftInput.value : field.value,
        }
      : field,
  );
  const title = createTitle(fields);
  const errors = title ? [] : [`${surface.dialog.title.replace(/^Create /, "")} name is required.`];

  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        errors,
        fieldSet: { ...surface.dialog.form.fieldSet, fields },
        submit: { ...surface.dialog.form.submit, disabled: !title },
      },
    },
  };
}

function submitCreate(
  shell: FormlessApplicationShellFixtureState,
  section: FormlessUiShellNavigationSectionContract,
  createSurface: FormlessUiCreateSurfaceContract,
): FormlessApplicationShellFixtureState {
  const title = createTitle(createSurface.dialog.form.fieldSet.fields);

  if (!title) {
    const nextSurface = applyCreateDraft(createSurface, "title", {
      kind: "input",
      value: "",
    });
    return replaceShellSection(shell, withCreateSurface(section, nextSurface));
  }

  const createdIndex =
    section.destinations.filter((destination) => destination.id.startsWith("root:fixture-created-"))
      .length + 1;
  const recordId = `fixture-created-${createdIndex}`;
  const destinationId = `root:${recordId}`;
  const nextSurface = resetCreateSurface(createSurface);
  const nextSection = withCreateSurface(
    {
      ...section,
      destinations: [
        ...section.destinations.map((destination) => ({ ...destination, selected: false })),
        {
          accessibilityLabel: title,
          availability: { available: true },
          countText: "0",
          id: destinationId,
          kind: "shellRootRecordDestination",
          label: title,
          recordId,
          selected: true,
          selectionIntent: {
            destinationId,
            recordId,
            sectionId: section.id,
            shellId: shell.manifest.id,
            type: "shellRootRecordSelection",
          },
        },
      ],
    },
    { ...nextSurface, dialog: { ...nextSurface.dialog, open: false } },
  );

  return replaceShellSection(shell, nextSection, {
    destinationId,
    sectionId: section.id,
  });
}

function resetCreateSurface(
  surface: FormlessUiCreateSurfaceContract,
): FormlessUiCreateSurfaceContract {
  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        errors: [],
        fieldSet: {
          ...surface.dialog.form.fieldSet,
          fields: surface.dialog.form.fieldSet.fields.map((field) => ({
            ...field,
            draftInput: { kind: "input", value: "" },
            value: "",
          })),
        },
        submit: { ...surface.dialog.form.submit, disabled: true },
      },
    },
  };
}

function applyReset(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<FormlessUiShellIntent, { type: "shellReset" }>,
) {
  const section = shell.sections.find(
    (candidate) =>
      candidate.id === intent.sectionId && candidate.settings?.reset?.id === intent.controlId,
  );
  const reset = section?.settings?.reset;

  if (!section?.settings || !reset) {
    return shell;
  }

  const nextReset =
    intent.intent.type === "resetOpenChange"
      ? {
          ...reset,
          confirmation: { ...reset.confirmation, open: intent.intent.open },
        }
      : {
          ...reset,
          confirmation: { ...reset.confirmation, open: false },
          status: { message: "Source seed data reset.", state: "success" as const },
        };

  return replaceShellSection(shell, {
    ...section,
    settings: { ...section.settings, reset: nextReset },
  });
}

function applyLogout(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<FormlessUiShellIntent, { type: "shellLogout" }>,
) {
  const section = shell.sections.find(
    (candidate) =>
      candidate.id === intent.sectionId &&
      candidate.session?.state === "authenticated" &&
      candidate.session.logout.id === intent.controlId,
  );

  if (!section?.session) {
    return shell;
  }

  return replaceShellSection(shell, {
    ...section,
    session: { id: section.session.id, kind: "shellSession", state: "anonymous" },
  });
}

function withCreateSurface(
  section: FormlessUiShellNavigationSectionContract,
  createSurface: FormlessUiCreateSurfaceContract,
) {
  return { ...section, createSurface };
}

function createTitle(fields: readonly FormlessUiCreateField[]) {
  const draftInput = fields.find((field) => field.fieldName === "title")?.draftInput;
  const value = draftInput?.value;
  return typeof value === "string" ? value.trim() : "";
}

function replaceShellSection(
  shell: FormlessApplicationShellFixtureState,
  nextSection: FormlessUiShellNavigationSectionContract,
  activeDestination = shell.manifest.activeDestination,
): FormlessApplicationShellFixtureState {
  return {
    manifest:
      activeDestination === shell.manifest.activeDestination
        ? shell.manifest
        : { ...shell.manifest, activeDestination },
    sections: shell.sections.map((section) =>
      section.id === nextSection.id ? nextSection : section,
    ),
  };
}
