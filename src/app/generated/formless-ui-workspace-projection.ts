import type {
  FormlessUiActionTriggerContract,
  FormlessUiActionTriggerIntent,
  FormlessUiCreateIntent,
  FormlessUiFieldIntent,
  FormlessUiListIntent,
  FormlessUiOperationPresentationIntent,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultIntent,
  FormlessUiTableIntent,
  FormlessUiWorkspaceAvailability,
  FormlessUiWorkspaceCollectionActionContract,
  FormlessUiWorkspaceCollectionActionGroupContract,
  FormlessUiWorkspaceCollectionContract,
  FormlessUiWorkspaceCollectionPresentationContract,
  FormlessUiWorkspaceContextContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceCreateIntent,
  FormlessUiWorkspaceExternalActionIntent,
  FormlessUiWorkspaceFieldIntent,
  FormlessUiWorkspaceIntentScope,
  FormlessUiWorkspaceItemAvailability,
  FormlessUiWorkspaceListIntent,
  FormlessUiWorkspaceOperationIntent,
  FormlessUiWorkspaceRecordResultIntent,
  FormlessUiWorkspaceResultContract,
  FormlessUiWorkspaceSectionContract,
  FormlessUiWorkspaceSummaryContract,
  FormlessUiWorkspaceTableIntent,
} from "@dpeek/formless-astryx/contract";

export type GeneratedWorkspaceIdentityScope = FormlessUiWorkspaceIntentScope;

export type GeneratedWorkspaceScopedIdentityKind =
  | "collectionActions"
  | "context"
  | "contextOption"
  | "control"
  | "externalAction"
  | "field"
  | "listDetail"
  | "query"
  | "queryNavigation"
  | "result"
  | "summary"
  | "surface";

export type GeneratedWorkspaceAvailabilityProjection =
  | {
      state: "ready";
    }
  | {
      description?: string;
      state: "empty";
      title: string;
    }
  | {
      message: string;
      state: "unavailable";
    };

export type GeneratedWorkspaceItemAvailabilityProjection =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type GeneratedWorkspaceQueryProjectionFacts = {
  availability?: GeneratedWorkspaceItemAvailabilityProjection;
  count?: number;
  id: string;
  label: string;
};

export type GeneratedWorkspaceContextOptionProjectionFacts = {
  availability?: GeneratedWorkspaceItemAvailabilityProjection;
  count?: number;
  id: string;
  label: string;
};

export type GeneratedWorkspaceContextProjectionFacts = {
  accessibilityLabel?: string;
  availability?: GeneratedWorkspaceAvailabilityProjection;
  createAction?: FormlessUiWorkspaceCollectionActionContract & { kind: "createAction" };
  detail?: FormlessUiRecordResultContract;
  id: string;
  label: string;
  options: readonly GeneratedWorkspaceContextOptionProjectionFacts[];
  presentation: FormlessUiWorkspaceContextContract["presentation"];
  selectedOptionId?: string;
};

export type GeneratedWorkspaceSummaryProjectionFacts = {
  availability?: GeneratedWorkspaceItemAvailabilityProjection;
  displayValue: string;
  id: string;
  label: string;
  suffix?: string;
};

export type GeneratedWorkspacePlacedCollectionAction = {
  action: FormlessUiWorkspaceCollectionActionContract;
  placement: "primary" | "secondary";
};

export type GeneratedWorkspaceExternalActionProjectionFacts = {
  action: FormlessUiActionTriggerContract;
  id: string;
};

export type GeneratedWorkspaceCollectionProjectionFacts = {
  accessibilityLabel?: string;
  actions?: readonly GeneratedWorkspacePlacedCollectionAction[];
  availability?: GeneratedWorkspaceAvailabilityProjection;
  context?: GeneratedWorkspaceContextProjectionFacts;
  id: string;
  label: string;
  layout?: "ordinary" | "listDetail";
  queries: readonly GeneratedWorkspaceQueryProjectionFacts[];
  queryNavigationAccessibilityLabel?: string;
  result: FormlessUiWorkspaceResultContract;
  secondaryActionsAccessibilityLabel?: string;
  selectedQueryId?: string;
  summaries?: readonly GeneratedWorkspaceSummaryProjectionFacts[];
};

export type GeneratedWorkspaceSectionProjectionFacts = {
  accessibilityLabel?: string;
  actions?: readonly GeneratedWorkspaceExternalActionProjectionFacts[];
  collection: GeneratedWorkspaceCollectionProjectionFacts;
  id: string;
  label: string;
};

export type ProjectGeneratedWorkspaceFormlessUiContractOptions = {
  accessibilityLabel?: string;
  id: string;
  label: string;
  sections: readonly GeneratedWorkspaceSectionProjectionFacts[];
};

export function generatedWorkspaceScreenId(screenId: string): string {
  return `workspace:${screenId}`;
}

export function generatedWorkspaceSectionId(screenId: string, sectionId: string): string {
  return `${screenId}:section:${sectionId}`;
}

export function generatedWorkspaceCollectionId(sectionId: string, collectionId: string): string {
  return `${sectionId}:collection:${collectionId}`;
}

export function generatedWorkspaceScopedId(
  scope: GeneratedWorkspaceIdentityScope,
  kind: GeneratedWorkspaceScopedIdentityKind,
  localId: string,
): string {
  return `${scope.collectionId}:${kind}:${localId}`;
}

export function projectGeneratedWorkspaceFormlessUiContract({
  accessibilityLabel,
  id,
  label,
  sections,
}: ProjectGeneratedWorkspaceFormlessUiContractOptions): FormlessUiWorkspaceContract {
  const screenId = generatedWorkspaceScreenId(id);
  const headingVisibility = sections.length === 1 ? "hidden" : "visible";

  return {
    accessibilityLabel: accessibilityLabel ?? label,
    id: screenId,
    kind: "workspace",
    label,
    sections: sections.map((section) =>
      projectGeneratedWorkspaceSection({
        headingVisibility,
        screenId,
        section,
      }),
    ),
  };
}

export function projectGeneratedWorkspaceSection({
  headingVisibility,
  screenId,
  section,
}: {
  headingVisibility: FormlessUiWorkspaceSectionContract["headingVisibility"];
  screenId: string;
  section: GeneratedWorkspaceSectionProjectionFacts;
}): FormlessUiWorkspaceSectionContract {
  const sectionId = generatedWorkspaceSectionId(screenId, section.id);
  const collectionId = generatedWorkspaceCollectionId(sectionId, section.collection.id);
  const scope = { collectionId, screenId, sectionId };

  return {
    accessibilityLabel: section.accessibilityLabel ?? section.label,
    actions: (section.actions ?? []).map(({ action, id }) => ({
      action,
      id: generatedWorkspaceScopedId(scope, "externalAction", id),
      kind: "workspaceExternalAction",
    })),
    collection: projectGeneratedWorkspaceCollection({
      collection: section.collection,
      scope,
    }),
    headingVisibility,
    id: sectionId,
    kind: "workspaceSection",
    label: section.label,
  };
}

export function projectGeneratedWorkspaceCollection({
  collection,
  scope,
}: {
  collection: GeneratedWorkspaceCollectionProjectionFacts;
  scope: GeneratedWorkspaceIdentityScope;
}): FormlessUiWorkspaceCollectionContract {
  const selectedQueryId = projectSelectedQueryId(scope, collection);
  const queryNavigation = projectGeneratedWorkspaceQueryNavigation({
    accessibilityLabel:
      collection.queryNavigationAccessibilityLabel ?? `${collection.label} queries`,
    queries: collection.queries,
    scope,
    selectedQueryId,
  });
  const context =
    collection.context === undefined
      ? undefined
      : projectGeneratedWorkspaceContext({ context: collection.context, scope });
  const actions = projectGeneratedWorkspaceCollectionActions({
    actions: collection.actions ?? [],
    scope,
    secondaryAccessibilityLabel:
      collection.secondaryActionsAccessibilityLabel ?? `More ${collection.label} actions`,
  });
  const summaries = (collection.summaries ?? []).map((summary) =>
    projectGeneratedWorkspaceSummary({ scope, summary }),
  );
  const commonPresentation = {
    actions,
    ...(queryNavigation === undefined ? {} : { queryNavigation }),
    result: collection.result,
    summaries,
  };
  const layout = collection.layout ?? "ordinary";
  let presentation: FormlessUiWorkspaceCollectionPresentationContract;

  if (layout === "listDetail") {
    if (context?.presentation !== "localListDetail" || collection.context === undefined) {
      throw new Error("List-detail workspace collections require a local list-detail context.");
    }

    presentation = {
      accessibilityLabel: `${collection.context.label} list detail`,
      ...commonPresentation,
      ...(collection.context.detail === undefined
        ? {}
        : { contextDetail: collection.context.detail }),
      id: generatedWorkspaceScopedId(scope, "listDetail", collection.context.id),
      kind: "listDetail",
      selector: { ...context, presentation: "localListDetail" },
    };
  } else {
    presentation = {
      ...commonPresentation,
      ...(context === undefined ? {} : { context }),
      ...(collection.context?.detail === undefined
        ? {}
        : { contextDetail: collection.context.detail }),
      kind: "ordinary",
    };
  }

  return {
    accessibilityLabel: collection.accessibilityLabel ?? collection.label,
    availability: projectGeneratedWorkspaceAvailability({
      availability: collection.availability ?? { state: "ready" },
      id: `${collection.id}:availability`,
      scope,
    }),
    id: scope.collectionId,
    kind: "workspaceCollection",
    label: collection.label,
    presentation,
    selectedQueryId,
  };
}

export function projectGeneratedWorkspaceQueryNavigation({
  accessibilityLabel,
  queries,
  scope,
  selectedQueryId,
}: {
  accessibilityLabel: string;
  queries: readonly GeneratedWorkspaceQueryProjectionFacts[];
  scope: GeneratedWorkspaceIdentityScope;
  selectedQueryId: string | null;
}) {
  if (queries.length <= 1) {
    return undefined;
  }

  return {
    accessibilityLabel,
    id: generatedWorkspaceScopedId(scope, "queryNavigation", "navigation"),
    items: queries.map((query) => {
      const id = generatedWorkspaceScopedId(scope, "query", query.id);

      return {
        availability: projectGeneratedWorkspaceItemAvailability(query.availability),
        ...(query.count === undefined
          ? {}
          : { countText: formatGeneratedWorkspaceCount(query.count) }),
        id,
        kind: "workspaceQuery" as const,
        label: query.label,
        selected: id === selectedQueryId,
        selectionIntent: {
          ...scope,
          queryId: id,
          type: "workspaceQuerySelection" as const,
        },
      };
    }),
    kind: "workspaceQueryNavigation" as const,
  };
}

export function projectGeneratedWorkspaceContext({
  context,
  scope,
}: {
  context: GeneratedWorkspaceContextProjectionFacts;
  scope: GeneratedWorkspaceIdentityScope;
}): FormlessUiWorkspaceContextContract {
  const contextId = generatedWorkspaceScopedId(scope, "context", context.id);
  const selectedOptionId =
    context.selectedOptionId === undefined
      ? undefined
      : generatedWorkspaceContextOptionId(scope, context.id, context.selectedOptionId);
  const availability =
    context.availability ??
    (context.options.length === 0
      ? {
          state: "empty" as const,
          title: `No ${context.label.toLowerCase()} records yet.`,
        }
      : { state: "ready" as const });

  if (
    availability.state === "ready" &&
    (selectedOptionId === undefined ||
      !context.options.some(
        (option) =>
          generatedWorkspaceContextOptionId(scope, context.id, option.id) === selectedOptionId,
      ))
  ) {
    throw new Error("Ready workspace contexts require a selected available option.");
  }

  return {
    accessibilityLabel: context.accessibilityLabel ?? `${context.label} records`,
    availability: projectGeneratedWorkspaceAvailability({
      availability,
      id: `${context.id}:availability`,
      scope,
    }),
    ...(context.createAction === undefined ? {} : { createAction: context.createAction }),
    id: contextId,
    kind: "workspaceContext",
    label: context.label,
    options: context.options.map((option) => {
      const id = generatedWorkspaceContextOptionId(scope, context.id, option.id);

      return {
        availability: projectGeneratedWorkspaceItemAvailability(option.availability),
        ...(option.count === undefined
          ? {}
          : { countText: formatGeneratedWorkspaceCount(option.count) }),
        id,
        kind: "workspaceContextOption",
        label: option.label,
        selected: id === selectedOptionId,
        selectionIntent: {
          ...scope,
          contextId,
          contextOptionId: id,
          type: "workspaceContextSelection",
        },
      };
    }),
    presentation: context.presentation,
    ...(selectedOptionId === undefined ? {} : { selectedOptionId }),
  };
}

export function projectGeneratedWorkspaceSummary({
  scope,
  summary,
}: {
  scope: GeneratedWorkspaceIdentityScope;
  summary: GeneratedWorkspaceSummaryProjectionFacts;
}): FormlessUiWorkspaceSummaryContract {
  return {
    availability: projectGeneratedWorkspaceItemAvailability(summary.availability),
    displayValue: summary.displayValue,
    id: generatedWorkspaceScopedId(scope, "summary", summary.id),
    kind: "workspaceSummary",
    label: summary.label,
    ...(summary.suffix === undefined ? {} : { suffix: summary.suffix }),
  };
}

export function projectGeneratedWorkspaceCollectionActions({
  actions,
  scope,
  secondaryAccessibilityLabel,
}: {
  actions: readonly GeneratedWorkspacePlacedCollectionAction[];
  scope: GeneratedWorkspaceIdentityScope;
  secondaryAccessibilityLabel: string;
}): FormlessUiWorkspaceCollectionActionGroupContract {
  return {
    id: generatedWorkspaceScopedId(scope, "collectionActions", "actions"),
    kind: "workspaceCollectionActions",
    primary: actions.filter(({ placement }) => placement === "primary").map(({ action }) => action),
    secondary: actions
      .filter(({ placement }) => placement === "secondary")
      .map(({ action }) => action),
    secondaryAccessibilityLabel,
  };
}

export function projectGeneratedWorkspaceAvailability({
  availability,
  id,
  scope,
}: {
  availability: GeneratedWorkspaceAvailabilityProjection;
  id: string;
  scope: GeneratedWorkspaceIdentityScope;
}): FormlessUiWorkspaceAvailability {
  if (availability.state === "empty") {
    return {
      emptyState: {
        ...(availability.description === undefined
          ? {}
          : { description: availability.description }),
        id: generatedWorkspaceScopedId(scope, "result", `${id}:empty`),
        kind: "workspaceEmptyState",
        title: availability.title,
      },
      state: "empty",
    };
  }

  return availability;
}

export function formatGeneratedWorkspaceCount(count: number): string {
  return String(count);
}

export function projectGeneratedWorkspaceExternalActionIntent(
  scope: FormlessUiWorkspaceIntentScope,
  actionId: string,
  intent: FormlessUiActionTriggerIntent,
): FormlessUiWorkspaceExternalActionIntent {
  return {
    ...scope,
    actionId,
    controlId: intent.controlId,
    intent,
    type: "workspaceExternalAction",
  };
}

export function projectGeneratedWorkspaceCreateIntent(
  scope: FormlessUiWorkspaceIntentScope,
  surfaceId: string,
  intent: FormlessUiCreateIntent,
  contextId?: string,
): FormlessUiWorkspaceCreateIntent {
  return {
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    surfaceId,
    type: "workspaceCreate",
  };
}

export function projectGeneratedWorkspaceOperationIntent(
  scope: FormlessUiWorkspaceIntentScope,
  controlId: string,
  intent: FormlessUiOperationPresentationIntent,
  options: Pick<FormlessUiWorkspaceOperationIntent, "contextId" | "recordId" | "resultId"> = {},
): FormlessUiWorkspaceOperationIntent {
  return {
    ...scope,
    ...definedWorkspaceIntentOptions(options),
    controlId,
    intent,
    type: "workspaceOperation",
  };
}

export function projectGeneratedWorkspaceFieldIntent(
  scope: FormlessUiWorkspaceIntentScope,
  fieldId: string,
  intent: FormlessUiFieldIntent,
  options: Pick<
    FormlessUiWorkspaceFieldIntent,
    "contextId" | "recordId" | "resultId" | "surfaceId"
  > = {},
): FormlessUiWorkspaceFieldIntent {
  return {
    ...scope,
    ...definedWorkspaceIntentOptions(options),
    fieldId,
    intent,
    type: "workspaceField",
  };
}

export function projectGeneratedWorkspaceListIntent(
  scope: FormlessUiWorkspaceIntentScope,
  resultId: string,
  intent: FormlessUiListIntent,
): FormlessUiWorkspaceListIntent {
  return { ...scope, intent, resultId, type: "workspaceList" };
}

export function projectGeneratedWorkspaceTableIntent(
  scope: FormlessUiWorkspaceIntentScope,
  resultId: string,
  intent: FormlessUiTableIntent,
): FormlessUiWorkspaceTableIntent {
  return { ...scope, intent, resultId, type: "workspaceTable" };
}

export function projectGeneratedWorkspaceRecordResultIntent(
  scope: FormlessUiWorkspaceIntentScope,
  resultId: string,
  intent: FormlessUiRecordResultIntent,
  contextId?: string,
): FormlessUiWorkspaceRecordResultIntent {
  return {
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    resultId,
    type: "workspaceRecordResult",
  };
}

function projectSelectedQueryId(
  scope: GeneratedWorkspaceIdentityScope,
  collection: GeneratedWorkspaceCollectionProjectionFacts,
): string | null {
  if (collection.selectedQueryId === undefined) {
    if (collection.availability?.state === "unavailable" && collection.queries.length === 0) {
      return null;
    }
    throw new Error("Ready workspace collections require a selected query.");
  }

  if (!collection.queries.some((query) => query.id === collection.selectedQueryId)) {
    throw new Error("The selected workspace query must be present in the ordered query facts.");
  }

  return generatedWorkspaceScopedId(scope, "query", collection.selectedQueryId);
}

function generatedWorkspaceContextOptionId(
  scope: GeneratedWorkspaceIdentityScope,
  contextId: string,
  optionId: string,
): string {
  return generatedWorkspaceScopedId(scope, "contextOption", `${contextId}:${optionId}`);
}

function projectGeneratedWorkspaceItemAvailability(
  availability: GeneratedWorkspaceItemAvailabilityProjection | undefined,
): FormlessUiWorkspaceItemAvailability {
  return availability ?? { available: true };
}

function definedWorkspaceIntentOptions<T extends Record<string, string | undefined>>(
  options: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(options).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ) as Partial<T>;
}
