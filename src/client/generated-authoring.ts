import type { QueryEvaluationContext } from "../shared/query.ts";
import type {
  HomeContextConfig,
  HomeContextNavigationConfig,
  HomeContextNavigationGroupConfig,
  HomeScreenCollectionSectionModel,
  HomeScreenModel,
} from "./views.ts";

export type GeneratedContextOption = {
  id: string;
  label: string;
};

export type GeneratedContextSelectionFacts = {
  activeOption: GeneratedContextOption | undefined;
  activeRecordId: string | null;
  detailLabel: string;
  hasSidebarNavigation: boolean;
  isEmpty: boolean;
  isSingleton: boolean;
  queryContext: QueryEvaluationContext | undefined;
  selectableRecordIds: Set<string>;
  showLocalSelector: boolean;
  showUnselectedState: boolean;
};

export function selectGeneratedContextSelectionFacts({
  context,
  options,
  selectedRecordId,
  today,
}: {
  context: HomeContextConfig;
  options: GeneratedContextOption[];
  selectedRecordId: string | null;
  today: string;
}): GeneratedContextSelectionFacts {
  const activeRecordId = selectGeneratedActiveContextRecordId(options, selectedRecordId);
  const activeOption = options.find((option) => option.id === activeRecordId);
  const hasSidebarNavigation = context.navigation?.placement === "sidebar";
  const isSingleton = options.length === 1;
  const queryContext = activeRecordId
    ? { today, values: { [context.name]: activeRecordId } }
    : undefined;

  return {
    activeOption,
    activeRecordId,
    detailLabel: activeOption?.label ?? context.label,
    hasSidebarNavigation,
    isEmpty: options.length === 0,
    isSingleton,
    queryContext,
    selectableRecordIds: new Set(options.map((option) => option.id)),
    showLocalSelector: !isSingleton && !hasSidebarNavigation,
    showUnselectedState: options.length > 0 && activeRecordId === null,
  };
}

export type GeneratedRootNavigationContext = HomeContextConfig & {
  navigation: HomeContextNavigationConfig;
};

export type GeneratedRootNavigationFacts = {
  context: GeneratedRootNavigationContext;
  groups: HomeContextNavigationGroupConfig[];
  screen: HomeScreenModel;
  section: HomeScreenCollectionSectionModel;
};

export function selectGeneratedRootNavigationFacts(
  screen: HomeScreenModel,
): GeneratedRootNavigationFacts | undefined {
  const section = screen.layout.sections.find(
    (candidate): candidate is HomeScreenCollectionSectionModel =>
      candidate.type === "collection" && candidate.collection.context?.navigation !== undefined,
  );
  const context = section?.collection.context;

  if (!section || !context?.navigation) {
    return undefined;
  }

  return {
    context: context as GeneratedRootNavigationContext,
    groups: context.navigation.groups,
    screen,
    section,
  };
}

export type GeneratedRootNavigationStateFacts = {
  activeRecordId: string | null;
};

export function selectGeneratedRootNavigationStateFacts({
  options,
  selectedRecordId,
}: {
  options: GeneratedContextOption[];
  selectedRecordId: string | null;
}): GeneratedRootNavigationStateFacts {
  return {
    activeRecordId: selectGeneratedActiveContextRecordId(options, selectedRecordId),
  };
}

export type GeneratedRootNavigationGroupFacts = {
  items: GeneratedRootNavigationGroupItemFacts[];
  isEmpty: boolean;
};

export type GeneratedRootNavigationGroupItemFacts = {
  isActive: boolean;
  option: GeneratedContextOption;
};

export function selectGeneratedRootNavigationGroupFacts({
  activeRecordId,
  options,
}: {
  activeRecordId: string | null;
  options: GeneratedContextOption[];
}): GeneratedRootNavigationGroupFacts {
  return {
    isEmpty: options.length === 0,
    items: options.map((option) => ({
      isActive: option.id === activeRecordId,
      option,
    })),
  };
}

function selectGeneratedActiveContextRecordId(
  options: GeneratedContextOption[],
  selectedRecordId: string | null,
): string | null {
  return options.some((option) => option.id === selectedRecordId)
    ? selectedRecordId
    : (options[0]?.id ?? null);
}
