import type {
  AggregateSchema,
  AppSchema,
  CollectionContextPresentation,
  CollectionSummarySlotSchema,
  CollectionTableFooterSlotSchema,
  CollectionViewSchema,
  ComputedValueSchema,
  CountDisplaySchema,
  CreateViewSchema,
  EntityActionSchema,
  EntitySchema,
  FieldSchema,
  ItemViewSchema,
  TableColumnFormat,
  ToManyRelationshipSchema,
  ViewSchema,
} from "@dpeek/formless-schema";
import { isEntityActionVisibleToBrowser, type QueryExpression } from "@dpeek/formless-schema";
import {
  selectEntityActionUi,
  type EntityActionTargetCountConfig,
  type EntityActionUiConfig,
} from "./action-ui.ts";
import {
  selectCreateUnionPresentation,
  selectRecordUnionPresentation,
} from "./union-presentation-model.ts";
import { humanizeFieldName } from "./view-labels.ts";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "./views.ts";

export type HomeQueryTabConfig = {
  queryName: string;
  label: string;
  query: QueryExpression;
  count?: CountDisplaySchema;
};

export type HomeQueriesConfig = {
  tabs: HomeQueryTabConfig[];
  defaultQueryName: string;
  defaultTab: HomeQueryTabConfig;
};

export type HomeSummarySlotConfig = {
  type: "aggregate";
  key: string;
  aggregateName: string;
  aggregate: AggregateSchema;
  computedValues: Record<string, ComputedValueSchema>;
  label: string;
  suffix?: string;
  format: TableColumnFormat;
};

export type HomeContextNavigationGroupConfig = {
  label: string;
  queryName: string;
  query: QueryExpression;
  createAction?: Extract<HomeActionConfig, { type: "create" }>;
};

export type HomeContextNavigationConfig = {
  placement: "sidebar";
  groups: HomeContextNavigationGroupConfig[];
};

export type RelatedCollectionConfig = {
  relationshipName: string;
  relationship: ToManyRelationshipSchema;
  label: string;
  entityName: string;
  entity: EntitySchema;
  referenceFieldName: string;
};

export type HomeContextConfig = {
  name: string;
  label: string;
  entityName: string;
  entity: EntitySchema;
  queryName: string;
  query: QueryExpression;
  labelField: string;
  presentation: CollectionContextPresentation;
  navigation?: HomeContextNavigationConfig;
  relatedCollection?: RelatedCollectionConfig;
  createAction?: Extract<HomeActionConfig, { type: "create" }>;
  itemViewName?: string;
  recordFields?: RecordFieldConfig[];
  recordUnion?: RecordUnionPresentationConfig;
};

export type HomeActionConfig =
  | {
      type: "create";
      label: string;
      entityName: string;
      entity: EntitySchema;
      fields: CreateFieldConfig[];
      defaults: CreateDefaultConfig[];
      union?: CreateUnionPresentationConfig;
      enabled: boolean;
    }
  | {
      type: "entity-action";
      label: string;
      entityName: string;
      actionName: string;
      action: EntityActionSchema;
      ui: EntityActionUiConfig;
    };

export type HomeCollectionShellConfig = {
  entityName: string;
  entity: EntitySchema;
  context?: HomeContextConfig;
  queries: HomeQueriesConfig;
  actions: HomeActionConfig[];
  summary?: HomeSummarySlotConfig[];
};

export type { EntityActionTargetCountConfig, EntityActionUiConfig };

export function selectHomeCollectionShell(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeCollectionShellConfig {
  const queries = selectQueries(schema, collectionView);
  const summary = selectSummarySlots(schema, collectionView);

  return {
    entityName: collectionView.entity,
    entity,
    ...(collectionView.context === undefined
      ? {}
      : { context: selectContext(schema, viewEntries, collectionView) }),
    queries,
    actions: selectHomeActions(schema, viewEntries, collectionView, entity),
    ...(summary.length === 0 ? {} : { summary }),
  };
}

export function selectRelatedCollectionModels(
  schema: AppSchema,
  entityName: string,
): RelatedCollectionConfig[] {
  return Object.entries(schema.relationships ?? {}).flatMap(([relationshipName, relationship]) => {
    if (relationship.kind !== "toMany" || relationship.from.entity !== entityName) {
      return [];
    }

    return [selectRelatedCollection(schema, relationshipName, relationship)];
  });
}

function selectRelatedCollection(
  schema: AppSchema,
  relationshipName: string,
  relationship: ToManyRelationshipSchema,
): RelatedCollectionConfig {
  const entity = schema.entities[relationship.to.entity];

  if (!entity) {
    throw new Error(`Missing related entity "${relationship.to.entity}".`);
  }

  return {
    relationshipName,
    relationship,
    label: relationship.label ?? entity.label,
    entityName: relationship.to.entity,
    entity,
    referenceFieldName: relationship.to.field,
  };
}

function selectContext(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
): HomeContextConfig | undefined {
  if (!collectionView.context) {
    return undefined;
  }

  const contextEntity = schema.entities[collectionView.context.entity];
  const contextQuery = schema.queries[collectionView.context.query];
  const relationshipName = collectionView.context.relationship;
  const relationship =
    relationshipName === undefined ? undefined : selectToManyRelationship(schema, relationshipName);
  const relatedCollection =
    relationshipName === undefined || relationship === undefined
      ? undefined
      : selectRelatedCollection(schema, relationshipName, relationship);

  if (!contextEntity) {
    throw new Error(`Missing context entity "${collectionView.context.entity}".`);
  }

  if (!contextQuery) {
    throw new Error(`Missing context query "${collectionView.context.query}".`);
  }

  const createAction =
    collectionView.context.createView === undefined
      ? undefined
      : selectCreateAction(
          schema,
          viewEntries,
          collectionView.context.createView,
          `Create ${contextEntity.label}`,
        );
  const itemViewName = collectionView.context.itemView;
  const itemView = itemViewName === undefined ? undefined : schema.itemViews[itemViewName];

  if (itemViewName !== undefined && itemView === undefined) {
    throw new Error(`Missing context item view "${itemViewName}".`);
  }

  const recordFields =
    itemView === undefined ? undefined : selectRecordFields(itemView, contextEntity);
  const recordUnion =
    itemView === undefined
      ? undefined
      : selectRecordUnionPresentation(schema, itemView, contextEntity);

  return {
    name: collectionView.context.name,
    label: contextQuery.label === "All" ? contextEntity.label : contextQuery.label,
    entityName: collectionView.context.entity,
    entity: contextEntity,
    queryName: collectionView.context.query,
    query: contextQuery.expression,
    labelField: collectionView.context.labelField,
    presentation: collectionView.context.presentation,
    ...(collectionView.context.navigation === undefined
      ? {}
      : {
          navigation: {
            placement: collectionView.context.navigation.placement,
            groups: collectionView.context.navigation.groups.map((group) => {
              const query = schema.queries[group.query];

              if (!query) {
                throw new Error(`Missing context navigation query "${group.query}".`);
              }
              const createAction =
                group.createView === undefined
                  ? undefined
                  : selectCreateAction(
                      schema,
                      viewEntries,
                      group.createView,
                      createRootNavigationLabel(group.label),
                    );

              return {
                label: group.label,
                queryName: group.query,
                query: query.expression,
                ...(createAction === undefined ? {} : { createAction }),
              };
            }),
          },
        }),
    ...(relatedCollection === undefined ? {} : { relatedCollection }),
    ...(createAction === undefined ? {} : { createAction }),
    ...(itemViewName === undefined
      ? {}
      : {
          itemViewName,
          recordFields,
          ...(recordUnion === undefined ? {} : { recordUnion }),
        }),
  };
}

function createRootNavigationLabel(groupLabel: string) {
  return `Create ${groupLabel.endsWith("s") ? groupLabel.slice(0, -1) : groupLabel}`;
}

export function selectToManyRelationship(schema: AppSchema, relationshipName: string) {
  const relationship = schema.relationships?.[relationshipName];

  if (!relationship) {
    throw new Error(`Missing relationship "${relationshipName}".`);
  }

  if (relationship.kind !== "toMany") {
    throw new Error(`Relationship "${relationshipName}" must be a toMany relationship.`);
  }

  return relationship;
}

function selectQueryTabs(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
): HomeQueryTabConfig[] {
  return collectionView.queries.map((slot) => {
    const query = schema.queries[slot.query];

    if (!query) {
      throw new Error(`Missing query "${slot.query}".`);
    }

    return {
      queryName: slot.query,
      label: slot.label ?? query.label,
      query: query.expression,
      ...(slot.count === undefined ? {} : { count: slot.count }),
    };
  });
}

function selectQueries(schema: AppSchema, collectionView: CollectionViewSchema): HomeQueriesConfig {
  const tabs = selectQueryTabs(schema, collectionView);
  const defaultTab = tabs.find((tab) => tab.queryName === collectionView.defaultQuery);

  if (!defaultTab) {
    throw new Error(`Missing default query "${collectionView.defaultQuery}".`);
  }

  return {
    tabs,
    defaultQueryName: collectionView.defaultQuery,
    defaultTab,
  };
}

function selectHomeActions(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeActionConfig[] {
  const actions: HomeActionConfig[] = [];

  for (const slot of collectionView.actions ?? []) {
    if (slot.type === "create") {
      actions.push(selectCreateAction(schema, viewEntries, slot.createView, slot.label));
      continue;
    }

    const action = entity.actions?.[slot.action];

    if (!action) {
      throw new Error(`Missing entity action "${slot.action}".`);
    }

    if (!isEntityActionVisibleToBrowser(action)) {
      continue;
    }

    const label = slot.label ?? action.label;

    actions.push({
      type: "entity-action",
      label,
      entityName: collectionView.entity,
      actionName: slot.action,
      action,
      ui: selectEntityActionUi(schema, label, action, slot.count),
    });
  }

  return actions;
}

function selectSummarySlots(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
): HomeSummarySlotConfig[] {
  return (collectionView.summary ?? []).map((slot) =>
    selectSummarySlot(schema, collectionView, slot),
  );
}

function selectSummarySlot(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
  slot: CollectionSummarySlotSchema,
): HomeSummarySlotConfig {
  const summarySlot = selectAggregateSlot(schema, slot);

  if (
    !collectionView.queries.some((querySlot) => querySlot.query === summarySlot.aggregate.query)
  ) {
    throw new Error(
      `Aggregate "${summarySlot.aggregateName}" query "${summarySlot.aggregate.query}" must belong to collection "${collectionView.label}".`,
    );
  }

  return summarySlot;
}

export function selectAggregateSlot(
  schema: AppSchema,
  slot: CollectionSummarySlotSchema | CollectionTableFooterSlotSchema,
): HomeSummarySlotConfig {
  const aggregate = schema.readModels?.aggregates?.[slot.aggregate];

  if (!aggregate) {
    throw new Error(`Missing aggregate "${slot.aggregate}".`);
  }

  return {
    type: "aggregate",
    key: `aggregate:${slot.aggregate}`,
    aggregateName: slot.aggregate,
    aggregate,
    computedValues: schema.readModels?.computedValues ?? {},
    label: slot.label ?? humanizeFieldName(slot.aggregate),
    ...(slot.suffix === undefined ? {} : { suffix: slot.suffix }),
    format: slot.format ?? "plain",
  };
}

function selectCreateAction(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  createViewName: string,
  label?: string,
): Extract<HomeActionConfig, { type: "create" }> {
  const createView = viewEntries.find(([viewName]) => viewName === createViewName)?.[1];

  if (!createView || createView.type !== "create") {
    throw new Error(`Missing create view "${createViewName}".`);
  }

  const entity = schema.entities[createView.entity];

  if (!entity) {
    throw new Error(`Missing create view entity "${createView.entity}".`);
  }
  const union = selectCreateUnionPresentation(schema, createView, entity);

  return {
    type: "create",
    label: label ?? `Create ${entity.label}`,
    entityName: createView.entity,
    entity,
    fields: selectCreateFields(createView, entity),
    defaults: selectCreateDefaults(createView, entity),
    ...(union === undefined ? {} : { union }),
    enabled: entity.mutations.create.enabled,
  };
}

function selectCreateFields(view: CreateViewSchema, entity: EntitySchema): CreateFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
  }));
}

function selectCreateDefaults(view: CreateViewSchema, entity: EntitySchema): CreateDefaultConfig[] {
  return Object.entries(view.defaults ?? {}).map(([fieldName, defaultValue]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    value: defaultValue,
  }));
}

export function selectRecordFields(
  view: ItemViewSchema,
  entity: EntitySchema,
): RecordFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    commit: viewField.commit,
    ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
  }));
}
