import type {
  AppSchema,
  AggregateSchema,
  CollectionContextPresentation,
  CollectionNavigationSchema,
  CollectionTableFooterSlotSchema,
  CollectionSummarySlotSchema,
  CollectionViewSchema,
  ComputedValueSchema,
  CountDisplaySchema,
  CreateDefaultValueSchema,
  CreateViewSchema,
  EntityActionSchema,
  EntitySchema,
  EntityUnionSchema,
  EntityUnionVariantSchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldSchema,
  ItemViewSchema,
  ScreenNavigationSchema,
  ScreenSchema,
  ToManyRelationshipSchema,
  TableActionPresentation,
  TableActionVariant,
  TableColumnAlign,
  TableColumnDisplay,
  TableColumnFormat,
  TableColumnWidth,
  ViewSchema,
} from "../shared/schema.ts";
import type { QueryExpression } from "../shared/query.ts";
import {
  selectResultOrderingConfig,
  type ResultOrderingConfig,
  type ResultOrderingScopeConfig,
} from "./result-ordering-model.ts";
import { selectTableResultModel } from "./table-model.ts";
import {
  selectCreateUnionPresentation,
  selectRecordUnionPresentation,
} from "./union-presentation-model.ts";
import { humanizeFieldName } from "./view-labels.ts";

export { fieldLabel } from "./view-labels.ts";

export type RecordFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
  commit: FieldCommitPolicy;
  label?: string;
  format?: TableColumnFormat;
  valueUnit?: ValueUnitFieldConfig;
};

export type ValueUnitFieldConfig = {
  unitFieldName: string;
  unitField: Extract<FieldSchema, { type: "enum" }>;
};

export type TableColumnBaseConfig = {
  key: string;
  label: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display: TableColumnDisplay;
  suffix?: string;
  format: TableColumnFormat;
};

export type FieldTableColumnConfig = RecordFieldConfig &
  TableColumnBaseConfig & {
    type: "field";
    referenceItem?: {
      itemViewName: string;
      entityName: string;
      entity: EntitySchema;
      recordFields: RecordFieldConfig[];
      recordUnion?: RecordUnionPresentationConfig;
    };
  };

export type ReferenceFieldTableColumnConfig = RecordFieldConfig &
  TableColumnBaseConfig & {
    type: "referenceField";
    sourceReferenceFieldName: string;
    referencedEntityName: string;
    referencedEntity: EntitySchema;
  };

export type ComputedTableColumnConfig = TableColumnBaseConfig & {
  type: "computed";
  computedValueName: string;
  computedValue: ComputedValueSchema;
};

export type TableActionBaseConfig = {
  actionName: string;
  label: string;
  variant: TableActionVariant;
  disabled: boolean;
  disabledReason?: string;
};

export type StaticTableActionConfig = TableActionBaseConfig & {
  type: "static";
};

export type EditRecordTableActionConfig = TableActionBaseConfig & {
  type: "editRecord";
  target: TableEditRecordTargetConfig;
  editView: EditViewConfig;
};

export type TableActionConfig = StaticTableActionConfig | EditRecordTableActionConfig;

export type TableEditRecordTargetConfig =
  | {
      kind: "row";
      entityName: string;
      entity: EntitySchema;
    }
  | {
      kind: "reference";
      fieldName: string;
      field: Extract<FieldSchema, { type: "reference" }>;
      entityName: string;
      entity: EntitySchema;
    };

export type EditViewConfig = {
  viewName: string;
  entityName: string;
  entity: EntitySchema;
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
};

export type { ResultOrderingConfig, ResultOrderingScopeConfig };
// Table ordering aliases stay for table result compatibility; generic result models use ResultOrdering.
export type TableOrderingScopeConfig = ResultOrderingScopeConfig;
export type TableOrderingConfig = ResultOrderingConfig;

export type InvokeActionTableColumnConfig = TableColumnBaseConfig & {
  type: "invokeAction";
  headerLabel: string;
  actions: TableActionConfig[];
  presentation: TableActionPresentation;
  includeOrdering: boolean;
  ordering?: TableOrderingConfig;
};

export type OrderingHandleTableColumnConfig = TableColumnBaseConfig & {
  type: "orderingHandle";
  headerLabel: string;
};

export type TableColumnConfig =
  | FieldTableColumnConfig
  | ReferenceFieldTableColumnConfig
  | ComputedTableColumnConfig
  | InvokeActionTableColumnConfig
  | OrderingHandleTableColumnConfig;

export type CreateFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
};

export type CreateDefaultConfig = {
  fieldName: string;
  field: FieldSchema;
  value: CreateDefaultValueSchema;
};

export type ContextSelectionTargetConfig = {
  kind: "selectContext";
  contextName: string;
  record: "self";
};

export type RecordVariantFieldsPresentationConfig = {
  type: "fields";
  fields: RecordFieldConfig[];
};

export type RecordVariantContextLinkPresentationConfig = {
  type: "contextLink";
  labelFieldName: string;
  labelField: FieldSchema;
  target: ContextSelectionTargetConfig;
};

export type RecordVariantPresentationConfig = {
  variantValue: string;
  label: string;
  unionVariant: EntityUnionVariantSchema;
  presentation: RecordVariantFieldsPresentationConfig | RecordVariantContextLinkPresentationConfig;
};

export type RecordFallbackPresentationConfig = {
  label: string;
  unionVariant?: EntityUnionVariantSchema;
  presentation: RecordVariantFieldsPresentationConfig | RecordVariantContextLinkPresentationConfig;
};

export type RecordUnionPresentationConfig = {
  unionName: string;
  union: EntityUnionSchema;
  discriminatorFieldName: string;
  discriminatorField: Extract<FieldSchema, { type: "enum" }>;
  variants: RecordVariantPresentationConfig[];
  fallback?: RecordFallbackPresentationConfig;
};

export type CreateVariantPresentationConfig = {
  variantValue: string;
  label: string;
  unionVariant: EntityUnionVariantSchema;
  presentation: {
    type: "fields";
    fields: CreateFieldConfig[];
  };
};

export type CreateFallbackPresentationConfig = {
  label: string;
  unionVariant?: EntityUnionVariantSchema;
  presentation: {
    type: "fields";
    fields: CreateFieldConfig[];
  };
};

export type CreateUnionPresentationConfig = {
  unionName: string;
  union: EntityUnionSchema;
  discriminatorFieldName: string;
  discriminatorField: Extract<FieldSchema, { type: "enum" }>;
  variants: CreateVariantPresentationConfig[];
  fallback?: CreateFallbackPresentationConfig;
};

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

export type TableFooterSlotConfig = HomeSummarySlotConfig & {
  columnKey: string;
};

export type TreeVariantBranchPolicyConfig = {
  discriminatorFieldName: string;
  discriminatorField: Extract<FieldSchema, { type: "enum" }>;
  leafVariantValues: string[];
};

export type TreeBranchPolicyConfig = {
  variants: TreeVariantBranchPolicyConfig;
};

export type HomeResultConfig =
  | {
      type: "list";
      itemViewName: string;
      recordFields: RecordFieldConfig[];
      recordUnion?: RecordUnionPresentationConfig;
      ordering?: ResultOrderingConfig;
    }
  | {
      type: "table";
      tableViewName: string;
      columns: TableColumnConfig[];
      ordering?: ResultOrderingConfig;
      footer?: TableFooterSlotConfig[];
    }
  | {
      type: "tree";
      relationshipName: string;
      relationship: ToManyRelationshipSchema;
      childFieldName: string;
      childField: Extract<FieldSchema, { type: "reference" }>;
      childEntityName: string;
      childEntity: EntitySchema;
      childItemViewName: string;
      childRecordFields: RecordFieldConfig[];
      childRecordUnion?: RecordUnionPresentationConfig;
      placementItemViewName?: string;
      placementRecordFields?: RecordFieldConfig[];
      placementRecordUnion?: RecordUnionPresentationConfig;
      ordering?: ResultOrderingConfig;
      branches?: TreeBranchPolicyConfig;
      maxDepth: number;
    };

export type HomeContextNavigationGroupConfig = {
  label: string;
  queryName: string;
  query: QueryExpression;
};

export type HomeContextNavigationConfig = {
  placement: "sidebar";
  groups: HomeContextNavigationGroupConfig[];
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

export type RelatedCollectionConfig = {
  relationshipName: string;
  relationship: ToManyRelationshipSchema;
  label: string;
  entityName: string;
  entity: EntitySchema;
  referenceFieldName: string;
};

export type HomeCollectionConfig = {
  entityName: string;
  entity: EntitySchema;
  context?: HomeContextConfig;
  queries: HomeQueriesConfig;
  result: HomeResultConfig;
  actions: HomeActionConfig[];
  summary?: HomeSummarySlotConfig[];
};

export type HomeViewModel = {
  viewName: string;
  label: string;
  navigation: CollectionNavigationSchema;
  collection: HomeCollectionConfig;
  entityName: string;
  entity: EntitySchema;
  context?: HomeContextConfig;
  queryTabs: HomeQueryTabConfig[];
  defaultQueryName: string;
  result: HomeResultConfig;
  actions: HomeActionConfig[];
};

export type HomeScreenCollectionSectionModel = {
  id: string;
  type: "collection";
  label: string;
  viewName: string;
  collection: HomeCollectionConfig;
};

export type HomeScreenSectionModel = HomeScreenCollectionSectionModel;

export type HomeScreenLayoutModel = {
  type: "stack";
  sections: HomeScreenSectionModel[];
};

export type HomeScreenModel = {
  screenName: string;
  type: "workspace";
  label: string;
  path?: string;
  navigation: ScreenNavigationSchema;
  layout: HomeScreenLayoutModel;
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

type EntityActionUiModuleUnion = {
  [Kind in EntityActionSchema["kind"]]: EntityActionUiModule<
    Extract<EntityActionSchema, { kind: Kind }>
  >;
}[EntityActionSchema["kind"]];

const entityActionUiModules = [
  {
    kind: "clear-completed",
    selectUi: selectClearCompletedActionUi,
  },
  {
    kind: "create-missing-join-records",
    selectUi: selectDefaultEntityActionUi,
  },
  {
    kind: "create-selected-join-record",
    selectUi: selectDefaultEntityActionUi,
  },
  {
    kind: "remove-selected-join-records",
    selectUi: selectDefaultEntityActionUi,
  },
] satisfies EntityActionUiModuleUnion[];

export function selectPrimaryCollectionModels(schema: AppSchema): HomeViewModel[] {
  return selectCollectionModels(schema).filter((model) => model.navigation.primary);
}

export function selectPrimaryScreenModels(schema: AppSchema): HomeScreenModel[] {
  return selectScreenModels(schema).filter((model) => model.navigation.primary);
}

export function selectScreenModelByPath(
  schema: AppSchema,
  path: string,
): HomeScreenModel | undefined {
  return selectScreenModels(schema).find((model) => model.path === path);
}

export function selectScreenModels(schema: AppSchema): HomeScreenModel[] {
  if (schema.screens === undefined) {
    return assignScreenModelPaths(
      selectPrimaryCollectionModels(schema).map(selectLegacyCollectionScreenModel),
    );
  }

  const collectionModelsByViewName = new Map(
    selectCollectionModels(schema).map((model) => [model.viewName, model]),
  );

  return assignScreenModelPaths(
    Object.entries(schema.screens).map(([screenName, screen]) =>
      selectScreenModel(screenName, screen, collectionModelsByViewName),
    ),
  );
}

export function selectCollectionModels(schema: AppSchema): HomeViewModel[] {
  const viewEntries = Object.entries(schema.views);
  const collectionViewEntries = viewEntries.filter(
    (entry): entry is [string, CollectionViewSchema] => entry[1].type === "collection",
  );

  return collectionViewEntries.map(([viewName, collectionView]) => {
    const entity = schema.entities[collectionView.entity];

    if (!entity) {
      throw new Error(`Missing entity "${collectionView.entity}".`);
    }

    const collection = selectHomeCollection(schema, viewEntries, collectionView, entity);

    return {
      viewName,
      label: collectionView.label,
      navigation: {
        primary: collectionView.navigation?.primary ?? true,
      },
      collection,
      entityName: collection.entityName,
      entity: collection.entity,
      ...(collection.context === undefined ? {} : { context: collection.context }),
      queryTabs: collection.queries.tabs,
      defaultQueryName: collection.queries.defaultQueryName,
      result: collection.result,
      actions: collection.actions,
    };
  });
}

function selectScreenModel(
  screenName: string,
  screen: ScreenSchema,
  collectionModelsByViewName: Map<string, HomeViewModel>,
): HomeScreenModel {
  return {
    screenName,
    type: screen.type,
    label: screen.label,
    ...(screen.path === undefined ? {} : { path: screen.path }),
    navigation: {
      primary: screen.navigation?.primary ?? true,
    },
    layout: {
      type: screen.layout.type,
      sections: screen.layout.sections.map((section) => {
        const collectionModel = collectionModelsByViewName.get(section.view);

        if (!collectionModel) {
          throw new Error(`Missing collection view model "${section.view}".`);
        }

        return {
          id: section.id,
          type: section.type,
          label: section.label ?? collectionModel.label,
          viewName: section.view,
          collection: collectionModel.collection,
        };
      }),
    },
  };
}

function assignScreenModelPaths(models: HomeScreenModel[]): HomeScreenModel[] {
  let hasRootPath = models.some((model) => model.path === "/");

  return models.map((model) => {
    if (model.path !== undefined || !model.navigation.primary || hasRootPath) {
      return model;
    }

    hasRootPath = true;
    return { ...model, path: "/" };
  });
}

function selectLegacyCollectionScreenModel(collectionModel: HomeViewModel): HomeScreenModel {
  return {
    screenName: collectionModel.viewName,
    type: "workspace",
    label: collectionModel.label,
    navigation: {
      primary: collectionModel.navigation.primary,
    },
    layout: {
      type: "stack",
      sections: [
        {
          id: collectionModel.viewName,
          type: "collection",
          label: collectionModel.label,
          viewName: collectionModel.viewName,
          collection: collectionModel.collection,
        },
      ],
    },
  };
}

function selectHomeCollection(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeCollectionConfig {
  const queries = selectQueries(schema, collectionView);
  const summary = selectSummarySlots(schema, collectionView);

  return {
    entityName: collectionView.entity,
    entity,
    ...(collectionView.context === undefined
      ? {}
      : { context: selectContext(schema, viewEntries, collectionView) }),
    queries,
    result: selectResult(schema, collectionView, entity),
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

              return {
                label: group.label,
                queryName: group.query,
                query: query.expression,
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

function selectToManyRelationship(schema: AppSchema, relationshipName: string) {
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

function selectResult(
  schema: AppSchema,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeResultConfig {
  if (collectionView.result.type === "table") {
    const tableView = schema.tableViews[collectionView.result.tableView];

    if (!tableView) {
      throw new Error(`Missing table view "${collectionView.result.tableView}".`);
    }
    const resultOrdering = selectResultOrderingConfig(collectionView.result.ordering, entity);
    const tableResult = selectTableResultModel(schema, tableView, entity, resultOrdering);
    const { columns, ordering } = tableResult;
    const footer = selectTableFooterSlots(schema, collectionView.result.footer ?? [], columns);

    return {
      type: "table",
      tableViewName: collectionView.result.tableView,
      columns,
      ...(ordering === undefined ? {} : { ordering }),
      ...(footer.length === 0 ? {} : { footer }),
    };
  }

  if (collectionView.result.type === "tree") {
    const relationship = selectToManyRelationship(schema, collectionView.result.relationship);
    const childField = entity.fields[collectionView.result.childField];

    if (!childField || childField.type !== "reference") {
      throw new Error(`Missing tree child field "${collectionView.result.childField}".`);
    }

    const childEntity = schema.entities[childField.to];
    const childItemView = schema.itemViews[collectionView.result.childItemView];

    if (!childEntity) {
      throw new Error(`Missing child entity "${childField.to}".`);
    }

    if (!childItemView) {
      throw new Error(`Missing child item view "${collectionView.result.childItemView}".`);
    }

    const placementItemViewName = collectionView.result.placementItemView;
    const placementItemView =
      placementItemViewName === undefined ? undefined : schema.itemViews[placementItemViewName];

    if (placementItemViewName !== undefined && placementItemView === undefined) {
      throw new Error(`Missing placement item view "${placementItemViewName}".`);
    }

    const ordering =
      selectResultOrderingConfig(collectionView.result.ordering, entity) ??
      selectImplicitTreeOrderingFallback(entity, relationship);
    const childRecordUnion = selectRecordUnionPresentation(schema, childItemView, childEntity);
    const placementRecordUnion =
      placementItemView === undefined
        ? undefined
        : selectRecordUnionPresentation(schema, placementItemView, entity);
    const branches = selectTreeBranchPolicyConfig(collectionView.result.branches, childRecordUnion);

    return {
      type: "tree",
      relationshipName: collectionView.result.relationship,
      relationship,
      childFieldName: collectionView.result.childField,
      childField,
      childEntityName: childField.to,
      childEntity,
      childItemViewName: collectionView.result.childItemView,
      childRecordFields: selectRecordFields(childItemView, childEntity),
      ...(childRecordUnion === undefined ? {} : { childRecordUnion }),
      ...(placementItemViewName === undefined || placementItemView === undefined
        ? {}
        : {
            placementItemViewName,
            placementRecordFields: selectRecordFields(placementItemView, entity),
            ...(placementRecordUnion === undefined ? {} : { placementRecordUnion }),
          }),
      ...(ordering === undefined ? {} : { ordering }),
      ...(branches === undefined ? {} : { branches }),
      maxDepth: collectionView.result.maxDepth ?? 8,
    };
  }

  const itemView = schema.itemViews[collectionView.result.itemView];

  if (!itemView) {
    throw new Error(`Missing item view "${collectionView.result.itemView}".`);
  }
  const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);

  const ordering = selectResultOrderingConfig(collectionView.result.ordering, entity);

  return {
    type: "list",
    itemViewName: collectionView.result.itemView,
    recordFields: selectRecordFields(itemView, entity),
    ...(recordUnion === undefined ? {} : { recordUnion }),
    ...(ordering === undefined ? {} : { ordering }),
  };
}

function selectTreeBranchPolicyConfig(
  branches: Extract<CollectionViewSchema["result"], { type: "tree" }>["branches"],
  childRecordUnion: RecordUnionPresentationConfig | undefined,
): TreeBranchPolicyConfig | undefined {
  if (branches === undefined) {
    return undefined;
  }

  if (childRecordUnion === undefined) {
    throw new Error("Tree branch policy requires a child record union.");
  }

  return {
    variants: {
      discriminatorFieldName: childRecordUnion.discriminatorFieldName,
      discriminatorField: childRecordUnion.discriminatorField,
      leafVariantValues: Object.entries(branches.variants)
        .filter(([, action]) => action === "leaf")
        .map(([variantValue]) => variantValue),
    },
  };
}

// Compatibility fallback for tree results that predate result-level ordering.
function selectImplicitTreeOrderingFallback(
  entity: EntitySchema,
  relationship: ToManyRelationshipSchema,
): ResultOrderingConfig | undefined {
  const orderField = entity.fields.order;
  const scopeField = entity.fields[relationship.to.field];

  if (!orderField || orderField.type !== "number" || !scopeField) {
    return undefined;
  }

  return {
    fieldName: "order",
    field: orderField,
    scope: [
      {
        kind: "field",
        fieldName: relationship.to.field,
        field: scopeField,
      },
    ],
    presentations: ["moveMenu"],
  };
}

function selectTableFooterSlots(
  schema: AppSchema,
  slots: CollectionTableFooterSlotSchema[],
  columns: TableColumnConfig[],
): TableFooterSlotConfig[] {
  return slots.map((slot) => {
    const column = columns.find((candidate) => tableFooterColumnName(candidate) === slot.column);

    if (!column) {
      throw new Error(`Missing table footer column "${slot.column}".`);
    }

    return {
      ...selectAggregateSlot(schema, slot),
      columnKey: column.key,
    };
  });
}

function selectHomeActions(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeActionConfig[] {
  return (collectionView.actions ?? []).map((slot) => {
    if (slot.type === "create") {
      return selectCreateAction(schema, viewEntries, slot.createView, slot.label);
    }

    const action = entity.actions?.[slot.action];

    if (!action) {
      throw new Error(`Missing entity action "${slot.action}".`);
    }

    const label = slot.label ?? action.label;

    return {
      type: "entity-action",
      label,
      entityName: collectionView.entity,
      actionName: slot.action,
      action,
      ui: selectEntityActionUi(schema, label, action, slot.count),
    };
  });
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

function selectAggregateSlot(
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

function selectEntityActionUi<TAction extends EntityActionSchema>(
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
  const actionModule = entityActionUiModules.find((candidate) => candidate.kind === action.kind);

  if (!actionModule) {
    throw new Error(`Unsupported action kind "${action.kind}".`);
  }

  return actionModule as EntityActionUiModule<TAction>;
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
  }));
}

function selectCreateDefaults(view: CreateViewSchema, entity: EntitySchema): CreateDefaultConfig[] {
  return Object.entries(view.defaults ?? {}).map(([fieldName, defaultValue]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    value: defaultValue,
  }));
}

function selectRecordFields(view: ItemViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return Object.entries(view.fields).map(([fieldName, viewField]) => ({
    fieldName,
    field: entity.fields[fieldName] as FieldSchema,
    editor: viewField.editor,
    commit: viewField.commit,
  }));
}

function tableFooterColumnName(column: TableColumnConfig) {
  if (column.type === "field") {
    return column.fieldName;
  }

  if (column.type === "computed") {
    return column.computedValueName;
  }

  if (column.type === "invokeAction" || column.type === "orderingHandle") {
    return "";
  }

  return `${column.sourceReferenceFieldName}.${column.fieldName}`;
}
