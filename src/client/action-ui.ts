import type { QueryExpression } from "@dpeek/formless-schema";
import type {
  AppSchema,
  CountDisplaySchema,
  EntityActionKind,
  EntityActionSchema,
  EntityActionSchemaForKind,
} from "@dpeek/formless-schema";

export type EntityActionTargetCountConfig = {
  display: CountDisplaySchema;
  query: QueryExpression;
  ariaLabel: string;
};

export type EntityActionUiConfig = {
  showAffectedCountOnSuccess: boolean;
  targetCount?: EntityActionTargetCountConfig;
};

type EntityActionUiSelectionContext<TAction extends EntityActionSchema> = {
  schema: AppSchema;
  label: string;
  action: TAction;
  count?: CountDisplaySchema;
};

type EntityActionUiModule<TAction extends EntityActionSchema = EntityActionSchema> = {
  kind: TAction["kind"];
  selectUi: (context: EntityActionUiSelectionContext<TAction>) => EntityActionUiConfig;
};

type EntityActionUiModuleMap = {
  [Kind in EntityActionKind]: EntityActionUiModule<EntityActionSchemaForKind<Kind>>;
};

const entityActionUiModules = {
  "clear-completed": {
    kind: "clear-completed",
    selectUi: selectClearCompletedActionUi,
  },
  "create-missing-join-records": {
    kind: "create-missing-join-records",
    selectUi: selectDefaultEntityActionUi,
  },
  "create-selected-join-record": {
    kind: "create-selected-join-record",
    selectUi: selectDefaultEntityActionUi,
  },
  "remove-selected-join-records": {
    kind: "remove-selected-join-records",
    selectUi: selectDefaultEntityActionUi,
  },
  "create-tree-child": {
    kind: "create-tree-child",
    selectUi: selectDefaultEntityActionUi,
  },
  "remove-tree-placement": {
    kind: "remove-tree-placement",
    selectUi: selectDefaultEntityActionUi,
  },
  subscribe: {
    kind: "subscribe",
    selectUi: selectDefaultEntityActionUi,
  },
} satisfies EntityActionUiModuleMap;

export function selectEntityActionUi<TAction extends EntityActionSchema>(
  schema: AppSchema,
  label: string,
  action: TAction,
  count: CountDisplaySchema | undefined,
): EntityActionUiConfig {
  return getEntityActionUiModule(action).selectUi({
    schema,
    label,
    action,
    ...(count === undefined ? {} : { count }),
  });
}

function selectClearCompletedActionUi(
  context: EntityActionUiSelectionContext<Extract<EntityActionSchema, { kind: "clear-completed" }>>,
): EntityActionUiConfig {
  const ui = selectDefaultEntityActionUi(context);

  if (context.count?.type !== "count") {
    return ui;
  }

  const targetQuery = context.schema.queries[context.action.target.query];

  if (!targetQuery) {
    throw new Error(`Missing action target query "${context.action.target.query}".`);
  }

  return {
    ...ui,
    targetCount: {
      display: context.count,
      query: targetQuery.expression,
      ariaLabel: `${context.label} target count`,
    },
  };
}

function selectDefaultEntityActionUi(
  context: EntityActionUiSelectionContext<EntityActionSchema>,
): EntityActionUiConfig {
  return {
    showAffectedCountOnSuccess: context.count?.type === "count",
  };
}

function getEntityActionUiModule<TAction extends EntityActionSchema>(
  action: TAction,
): EntityActionUiModule<TAction> {
  return entityActionUiModules[action.kind] as EntityActionUiModule<TAction>;
}
