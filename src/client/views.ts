import type {
  AppSchema,
  AggregateSchema,
  CollectionNavigationSchema,
  CollectionSummarySlotSchema,
  CollectionViewSchema,
  ComputedValueSchema,
  CountDisplaySchema,
  CreateDefaultValueSchema,
  CreateViewSchema,
  EntityActionSchema,
  EntitySchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldSchema,
  ItemViewSchema,
  ScreenNavigationSchema,
  ScreenSchema,
  ToManyRelationshipSchema,
  TableColumnAlign,
  TableColumnDisplay,
  TableColumnFormat,
  TableColumnWidth,
  TableViewSchema,
  ViewSchema,
} from "../shared/schema.ts";
import type { QueryExpression } from "../shared/query.ts";
import { getFieldTypeBehavior } from "../shared/field-types.ts";

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

export type TableColumnConfig =
  | FieldTableColumnConfig
  | ReferenceFieldTableColumnConfig
  | ComputedTableColumnConfig;

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

export type HomeResultConfig =
  | {
      type: "list";
      itemViewName: string;
      recordFields: RecordFieldConfig[];
    }
  | {
      type: "table";
      tableViewName: string;
      columns: TableColumnConfig[];
    };

export type HomeContextConfig = {
  name: string;
  entityName: string;
  entity: EntitySchema;
  queryName: string;
  query: QueryExpression;
  labelField: string;
  relatedCollection?: RelatedCollectionConfig;
  createAction?: Extract<HomeActionConfig, { type: "create" }>;
  itemViewName?: string;
  recordFields?: RecordFieldConfig[];
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

export function selectScreenModels(schema: AppSchema): HomeScreenModel[] {
  if (schema.screens === undefined) {
    return selectPrimaryCollectionModels(schema).map(selectLegacyCollectionScreenModel);
  }

  const collectionModelsByViewName = new Map(
    selectCollectionModels(schema).map((model) => [model.viewName, model]),
  );

  return Object.entries(schema.screens).map(([screenName, screen]) =>
    selectScreenModel(screenName, screen, collectionModelsByViewName),
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

  return {
    name: collectionView.context.name,
    entityName: collectionView.context.entity,
    entity: contextEntity,
    queryName: collectionView.context.query,
    query: contextQuery.expression,
    labelField: collectionView.context.labelField,
    ...(relatedCollection === undefined ? {} : { relatedCollection }),
    ...(createAction === undefined ? {} : { createAction }),
    ...(itemViewName === undefined
      ? {}
      : {
          itemViewName,
          recordFields,
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

    return {
      type: "table",
      tableViewName: collectionView.result.tableView,
      columns: selectTableColumns(schema, tableView, entity),
    };
  }

  const itemView = schema.itemViews[collectionView.result.itemView];

  if (!itemView) {
    throw new Error(`Missing item view "${collectionView.result.itemView}".`);
  }

  return {
    type: "list",
    itemViewName: collectionView.result.itemView,
    recordFields: selectRecordFields(itemView, entity),
  };
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
  const aggregate = schema.readModels?.aggregates?.[slot.aggregate];

  if (!aggregate) {
    throw new Error(`Missing aggregate "${slot.aggregate}".`);
  }

  if (!collectionView.queries.some((querySlot) => querySlot.query === aggregate.query)) {
    throw new Error(
      `Aggregate "${slot.aggregate}" query "${aggregate.query}" must belong to collection "${collectionView.label}".`,
    );
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

  return {
    type: "create",
    label: label ?? `Create ${entity.label}`,
    entityName: createView.entity,
    entity,
    fields: selectCreateFields(createView, entity),
    defaults: selectCreateDefaults(createView, entity),
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

function selectTableColumns(
  schema: AppSchema,
  view: TableViewSchema,
  entity: EntitySchema,
): TableColumnConfig[] {
  return view.columns.map((column) => {
    if (column.type === "computed") {
      const computedValue = schema.readModels?.computedValues?.[column.computedValue];

      if (!computedValue) {
        throw new Error(`Missing computed value "${column.computedValue}".`);
      }

      if (computedValue.entity !== view.entity) {
        throw new Error(
          `Computed value "${column.computedValue}" must use table entity "${view.entity}".`,
        );
      }

      return {
        type: "computed",
        key: `computed:${column.computedValue}`,
        computedValueName: column.computedValue,
        computedValue,
        label: column.label ?? humanizeFieldName(column.computedValue),
        ...(column.align === undefined ? {} : { align: column.align }),
        ...(column.width === undefined ? {} : { width: column.width }),
        display: column.display === "hidden" ? "hidden" : "readOnly",
        ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
        format: column.format ?? "plain",
      };
    }

    if (column.type === "referenceField") {
      const sourceReferenceField = entity.fields[column.referenceField] as FieldSchema;

      if (sourceReferenceField.type !== "reference") {
        throw new Error(`Missing reference field "${column.referenceField}".`);
      }

      const referencedEntity = schema.entities[sourceReferenceField.to] as EntitySchema;
      const field = referencedEntity.fields[column.field] as FieldSchema;

      return {
        type: "referenceField",
        key: `referenceField:${column.referenceField}.${column.field}`,
        sourceReferenceFieldName: column.referenceField,
        referencedEntityName: sourceReferenceField.to,
        referencedEntity,
        fieldName: column.field,
        field,
        editor: column.editor ?? getFieldTypeBehavior(field).defaultEditor,
        commit: column.commit ?? getFieldTypeBehavior(field).defaultCommit,
        label: column.label ?? fieldLabel(column.field, field),
        ...(column.align === undefined ? {} : { align: column.align }),
        ...(column.width === undefined ? {} : { width: column.width }),
        display: column.display ?? "editor",
        ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
        format: column.format ?? "plain",
      };
    }

    const field = entity.fields[column.field] as FieldSchema;
    const referenceItem = selectReferenceItem(schema, field, column.referenceItemView);
    const valueUnit = selectValueUnitField(entity, column.valueUnit?.unitField);

    return {
      type: "field",
      key: `field:${column.field}`,
      fieldName: column.field,
      field,
      editor: column.editor ?? getFieldTypeBehavior(field).defaultEditor,
      commit: column.commit ?? getFieldTypeBehavior(field).defaultCommit,
      label: column.label ?? fieldLabel(column.field, field),
      ...(column.align === undefined ? {} : { align: column.align }),
      ...(column.width === undefined ? {} : { width: column.width }),
      display: column.display ?? "editor",
      ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
      format: column.format ?? "plain",
      ...(referenceItem === undefined ? {} : { referenceItem }),
      ...(valueUnit === undefined ? {} : { valueUnit }),
    };
  });
}

function selectValueUnitField(
  entity: EntitySchema,
  unitFieldName: string | undefined,
): ValueUnitFieldConfig | undefined {
  if (unitFieldName === undefined) {
    return undefined;
  }

  const unitField = entity.fields[unitFieldName];

  if (!unitField || unitField.type !== "enum") {
    return undefined;
  }

  return {
    unitFieldName,
    unitField,
  };
}

function selectReferenceItem(
  schema: AppSchema,
  field: FieldSchema,
  itemViewName: string | undefined,
): FieldTableColumnConfig["referenceItem"] | undefined {
  if (itemViewName === undefined || field.type !== "reference") {
    return undefined;
  }

  const entity = schema.entities[field.to];
  const itemView = schema.itemViews[itemViewName];

  if (!entity || !itemView) {
    return undefined;
  }

  return {
    itemViewName,
    entityName: field.to,
    entity,
    recordFields: selectRecordFields(itemView, entity),
  };
}

export function fieldLabel(fieldName: string, field: FieldSchema) {
  return field.label ?? humanizeFieldName(fieldName);
}

function humanizeFieldName(fieldName: string) {
  const withSpaces = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (withSpaces === "") {
    return fieldName;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}
