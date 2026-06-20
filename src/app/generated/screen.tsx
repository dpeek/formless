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
  sectionOperationControls = {},
  today,
}: {
  getSectionSelection: (section: HomeScreenCollectionSectionModel) => HomeScreenSectionSelection;
  onSelectContext: (section: HomeScreenCollectionSectionModel, recordId: string | null) => void;
  onSelectQuery: (section: HomeScreenCollectionSectionModel, queryName: string) => void;
  screen: HomeScreenModel;
  sectionOperationControls?: Record<string, ReactNode>;
  today: string;
}) {
  const sections = screen.layout.sections;
  const firstSection = sections[0];

  if (!firstSection) {
    return null;
  }

  if (sections.length === 1) {
    const sectionOperationControl = sectionOperationControls[firstSection.id];

    if (sectionOperationControl) {
      return (
        <section aria-label={firstSection.label} className="space-y-4">
          <HomeScreenSectionHeader
            operationControls={sectionOperationControl}
            label={firstSection.label}
          />
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
        const sectionOperationControl = sectionOperationControls[section.id];

        return (
          <section aria-label={section.label} className="space-y-4" key={section.id}>
            <HomeScreenSectionHeader
              operationControls={sectionOperationControl}
              label={section.label}
            />
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

function HomeScreenSectionHeader({
  operationControls,
  label,
}: {
  operationControls?: ReactNode;
  label: string;
}) {
  if (!operationControls) {
    return <h2 className="text-lg font-semibold">{label}</h2>;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{label}</h2>
      {operationControls}
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
