import type {
  AppSchema,
  CountDisplaySchema,
  EntityOperationSchema,
  QueryExpression,
} from "@dpeek/formless-schema";

export type CommandOperationTargetCountConfig = {
  display: CountDisplaySchema;
  query: QueryExpression;
  ariaLabel: string;
};

export type CommandOperationUiConfig = {
  showAffectedCountOnSuccess: boolean;
  targetCount?: CommandOperationTargetCountConfig;
};

export function selectCommandOperationUi(
  schema: AppSchema,
  label: string,
  operation: EntityOperationSchema,
  count: CountDisplaySchema | undefined,
): CommandOperationUiConfig {
  const ui = selectDefaultCommandOperationUi(count);

  if (
    operation.kind !== "command" ||
    operation.effect?.type !== "runActionKind" ||
    operation.effect.kind !== "clear-completed" ||
    count?.type !== "count"
  ) {
    return ui;
  }

  const targetQueryName = operation.target?.query ?? operation.effect.query;

  if (targetQueryName === undefined) {
    return ui;
  }

  const targetQuery = schema.queries[targetQueryName];

  if (!targetQuery) {
    throw new Error(`Missing command operation target query "${targetQueryName}".`);
  }

  return {
    ...ui,
    targetCount: {
      display: count,
      query: targetQuery.expression,
      ariaLabel: `${label} target count`,
    },
  };
}

function selectDefaultCommandOperationUi(
  count: CountDisplaySchema | undefined,
): CommandOperationUiConfig {
  return {
    showAffectedCountOnSuccess: count?.type === "count",
  };
}
