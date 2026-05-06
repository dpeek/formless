import type {
  HomeScreenCollectionSectionModel,
  HomeScreenModel,
} from "../../client/views.ts";
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
  today,
}: {
  getSectionSelection: (section: HomeScreenCollectionSectionModel) => HomeScreenSectionSelection;
  onSelectContext: (section: HomeScreenCollectionSectionModel, recordId: string | null) => void;
  onSelectQuery: (section: HomeScreenCollectionSectionModel, queryName: string) => void;
  screen: HomeScreenModel;
  today: string;
}) {
  const sections = screen.layout.sections;
  const firstSection = sections[0];

  if (!firstSection) {
    return null;
  }

  if (sections.length === 1) {
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
      {sections.map((section) => (
        <HomeScreenCollectionSection
          getSectionSelection={getSectionSelection}
          key={section.id}
          onSelectContext={onSelectContext}
          onSelectQuery={onSelectQuery}
          section={section}
          today={today}
        />
      ))}
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
