import type { ReactNode } from "react";
import type { HomeScreenCollectionSectionModel, HomeScreenModel } from "../../client/views.ts";
import { HomeCollection } from "./collection.tsx";

export type HomeScreenSectionSelection = {
  selectedContextRecordId?: string | null;
  selectedQueryName?: string | null;
};

export function HomeScreen({
  getSectionSelection,
  onSelectContext,
  onSelectQuery,
  screen,
  sectionActions = {},
  today,
}: {
  getSectionSelection: (section: HomeScreenCollectionSectionModel) => HomeScreenSectionSelection;
  onSelectContext: (section: HomeScreenCollectionSectionModel, recordId: string | null) => void;
  onSelectQuery: (section: HomeScreenCollectionSectionModel, queryName: string) => void;
  screen: HomeScreenModel;
  sectionActions?: Record<string, ReactNode>;
  today: string;
}) {
  const sections = screen.layout.sections;
  const firstSection = sections[0];

  if (!firstSection) {
    return null;
  }

  if (sections.length === 1) {
    const sectionAction = sectionActions[firstSection.id];

    if (sectionAction) {
      return (
        <section aria-label={firstSection.label} className="space-y-4">
          <HomeScreenSectionHeader action={sectionAction} label={firstSection.label} />
          <HomeScreenCollectionSection
            getSectionSelection={getSectionSelection}
            onSelectContext={onSelectContext}
            onSelectQuery={onSelectQuery}
            section={firstSection}
            today={today}
          />
        </section>
      );
    }

    return (
      <HomeScreenCollectionSection
        getSectionSelection={getSectionSelection}
        onSelectContext={onSelectContext}
        onSelectQuery={onSelectQuery}
        section={firstSection}
        today={today}
      />
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const sectionAction = sectionActions[section.id];

        return (
          <section aria-label={section.label} className="space-y-4" key={section.id}>
            <HomeScreenSectionHeader action={sectionAction} label={section.label} />
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

function HomeScreenSectionHeader({ action, label }: { action?: ReactNode; label: string }) {
  if (!action) {
    return <h2 className="text-lg font-semibold">{label}</h2>;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{label}</h2>
      {action}
    </div>
  );
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
