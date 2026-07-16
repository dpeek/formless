import type { HomeScreenCollectionSectionModel, HomeScreenModel } from "../../client/views.ts";
import { HomeCollection } from "./collection.tsx";
import {
  GeneratedWorkspaceRuntime,
  useGeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeProps,
  type GeneratedWorkspaceSectionExternalAction,
} from "./generated-workspace-runtime.tsx";
import { generatedWorkspaceScreenIsEligible } from "./generated-workspace-foundation.ts";
import type { FormlessUiWorkspaceLinkActionContract } from "@dpeek/formless-astryx/contract";
import { LegacyWorkspaceLinkActions } from "./legacy-workspace-screen-renderer.tsx";
import { useLayoutEffect } from "react";

export type HomeScreenSectionSelection = {
  selectedContextRecordId?: string | null;
  selectedQueryName?: string | null;
};

export function HomeScreen({
  getSectionSelection,
  onSelectContext,
  onSelectQuery,
  onGeneratedWorkspaceController,
  screen,
  sectionExternalActions = {},
  today,
  workspaceActions = [],
}: {
  getSectionSelection: (section: HomeScreenCollectionSectionModel) => HomeScreenSectionSelection;
  onSelectContext: (section: HomeScreenCollectionSectionModel, recordId: string | null) => void;
  onSelectQuery: (section: HomeScreenCollectionSectionModel, queryName: string) => void;
  onGeneratedWorkspaceController?: (
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ) => void;
  screen: HomeScreenModel;
  sectionExternalActions?: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  today: string;
  workspaceActions?: readonly FormlessUiWorkspaceLinkActionContract[];
}) {
  if (generatedWorkspaceScreenIsEligible(screen)) {
    const props = {
      getSectionSelection,
      onSelectContext,
      onSelectQuery,
      screen,
      sectionExternalActions,
      today,
      workspaceActions,
    } satisfies GeneratedWorkspaceRuntimeProps;

    return onGeneratedWorkspaceController ? (
      <GeneratedWorkspaceRuntimeRegistration
        {...props}
        onController={onGeneratedWorkspaceController}
      />
    ) : (
      <GeneratedWorkspaceRuntime {...props} />
    );
  }

  const sections = screen.layout.sections;
  const firstSection = sections[0];

  if (!firstSection) {
    return <LegacyWorkspaceLinkActions actions={workspaceActions} />;
  }

  if (sections.length === 1) {
    return (
      <>
        <LegacyWorkspaceLinkActions actions={workspaceActions} />
        <HomeScreenCollectionSection
          getSectionSelection={getSectionSelection}
          onSelectContext={onSelectContext}
          onSelectQuery={onSelectQuery}
          section={firstSection}
          today={today}
        />
      </>
    );
  }

  return (
    <div className="space-y-8">
      <LegacyWorkspaceLinkActions actions={workspaceActions} />
      {sections.map((section) => {
        return (
          <section aria-label={section.label} className="space-y-4" key={section.id}>
            <HomeScreenSectionHeader label={section.label} />
            <HomeScreenCollectionSection
              getSectionSelection={getSectionSelection}
              onSelectContext={onSelectContext}
              onSelectQuery={onSelectQuery}
              section={section}
              today={today}
            />
          </section>
        );
      })}
    </div>
  );
}

function GeneratedWorkspaceRuntimeRegistration({
  onController,
  ...props
}: GeneratedWorkspaceRuntimeProps & {
  onController: (controller: GeneratedWorkspaceRuntimeController | undefined) => void;
}) {
  const controller = useGeneratedWorkspaceRuntimeController(props);

  useLayoutEffect(() => {
    onController(controller);
  }, [controller, onController]);

  useLayoutEffect(() => () => onController(undefined), [onController]);

  return null;
}

function HomeScreenSectionHeader({ label }: { label: string }) {
  return <h2 className="text-lg font-semibold">{label}</h2>;
}

function HomeScreenCollectionSection({
  getSectionSelection,
  onSelectContext,
  onSelectQuery,
  section,
  today,
}: {
  getSectionSelection: (section: HomeScreenCollectionSectionModel) => HomeScreenSectionSelection;
  onSelectContext: (section: HomeScreenCollectionSectionModel, recordId: string | null) => void;
  onSelectQuery: (section: HomeScreenCollectionSectionModel, queryName: string) => void;
  section: HomeScreenCollectionSectionModel;
  today: string;
}) {
  const selection = getSectionSelection(section);
  const queryTabs = section.collection.queries.tabs;
  const selectedQuery =
    queryTabs.find((tab) => tab.queryName === selection.selectedQueryName) ??
    section.collection.queries.defaultTab;

  if (queryTabs.length === 0) {
    return <p>No queries are defined for {section.collection.entity.label}.</p>;
  }

  return (
    <HomeCollection
      collection={section.collection}
      onSelectContext={(recordId) => onSelectContext(section, recordId)}
      onSelectQuery={(queryName) => onSelectQuery(section, queryName)}
      selectedContextRecordId={selection.selectedContextRecordId ?? null}
      selectedQuery={selectedQuery}
      today={today}
    />
  );
}
