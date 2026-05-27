import type {
  AppSchema,
  CollectionNavigationSchema,
  CollectionTableFooterSlotSchema,
  CollectionViewSchema,
  ComputedValueSchema,
  CreateDefaultValueSchema,
  EntityActionSchema,
  EntitySchema,
  EntityUnionSchema,
  EntityUnionVariantSchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldPresentationSchema,
  FieldVisibilityConditionSchema,
  FieldVisibilityValue,
  FieldSchema,
  ScreenNavigationSchema,
  ScreenSchema,
  ToManyRelationshipSchema,
  TableActionPresentation,
  TableActionVariant,
  TableColumnAlign,
  TableColumnDisplay,
  TableColumnFormat,
  TableColumnWidth,
  TreeBranchChildVariantSchema,
  TreeBranchVariantPolicySchema,
  ViewSchema,
} from "../shared/schema.ts";
import {
  selectAggregateSlot,
  selectHomeCollectionShell,
  selectRecordFields,
  selectToManyRelationship,
} from "./collection-shell-model.ts";
import type {
  HomeActionConfig,
  HomeCollectionShellConfig,
  HomeContextConfig,
  HomeQueryTabConfig,
  HomeSummarySlotConfig,
} from "./collection-shell-model.ts";
import {
  selectResultOrderingConfig,
  type ResultOrderingConfig,
  type ResultOrderingScopeConfig,
} from "./result-ordering-model.ts";
import { selectTableResultModel } from "./table-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";

export { selectRelatedCollectionModels } from "./collection-shell-model.ts";
export type {
  EntityActionTargetCountConfig,
  EntityActionUiConfig,
  HomeActionConfig,
  HomeCollectionShellConfig,
  HomeContextConfig,
  HomeContextNavigationConfig,
  HomeContextNavigationGroupConfig,
  HomeQueriesConfig,
  HomeQueryTabConfig,
  HomeSummarySlotConfig,
  RelatedCollectionConfig,
} from "./collection-shell-model.ts";
export { fieldLabel } from "./view-labels.ts";

export type RecordFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  editor: FieldEditor;
  commit: FieldCommitPolicy;
  label?: string;
  format?: TableColumnFormat;
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
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
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
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

export type TableFooterSlotConfig = HomeSummarySlotConfig & {
  columnKey: string;
};

export type TreeAllowedChildVariantConfig = {
  variantValue: string;
  label: string;
  unionVariant: EntityUnionVariantSchema;
  placementValues?: Record<string, FieldVisibilityValue>;
};

export type TreeVariantBranchPolicyConfig = {
  discriminatorFieldName: string;
  discriminatorField: Extract<FieldSchema, { type: "enum" }>;
  leafVariantValues: string[];
  allowedChildVariantsByParentVariant: Record<string, TreeAllowedChildVariantConfig[]>;
};

export type TreeBranchPolicyConfig = {
  variants: TreeVariantBranchPolicyConfig;
};

export type TreeCompositionActionConfig = {
  create?: {
    actionName: string;
    action: Extract<EntityActionSchema, { kind: "create-tree-child" }>;
  };
  remove?: {
    actionName: string;
    action: Extract<EntityActionSchema, { kind: "remove-tree-placement" }>;
  };
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
      type: "record";
      itemViewName: string;
      recordFields: RecordFieldConfig[];
      recordUnion?: RecordUnionPresentationConfig;
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
      composition?: TreeCompositionActionConfig;
      maxDepth: number;
    };

export type HomeCollectionConfig = HomeCollectionShellConfig & {
  result: HomeResultConfig;
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
    throw new Error('Schema must include "screens".');
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

function selectHomeCollection(
  schema: AppSchema,
  viewEntries: Array<[string, ViewSchema]>,
  collectionView: CollectionViewSchema,
  entity: EntitySchema,
): HomeCollectionConfig {
  const shell = selectHomeCollectionShell(schema, viewEntries, collectionView, entity);

  return {
    ...shell,
    result: selectResult(schema, collectionView, entity),
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
    const composition = selectTreeCompositionActionConfig(
      collectionView.result.composition,
      entity,
    );

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
      ...(composition === undefined ? {} : { composition }),
      maxDepth: collectionView.result.maxDepth ?? 8,
    };
  }

  if (collectionView.result.type === "record") {
    const itemView = schema.itemViews[collectionView.result.itemView];

    if (!itemView) {
      throw new Error(`Missing item view "${collectionView.result.itemView}".`);
    }
    const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);

    return {
      type: "record",
      itemViewName: collectionView.result.itemView,
      recordFields: selectRecordFields(itemView, entity),
      ...(recordUnion === undefined ? {} : { recordUnion }),
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
        .filter(([, policy]) => treeBranchVariantPolicyIsLeaf(policy))
        .map(([variantValue]) => variantValue),
      allowedChildVariantsByParentVariant: selectAllowedChildVariantsByParentVariant(
        branches.variants,
        childRecordUnion,
      ),
    },
  };
}

function selectAllowedChildVariantsByParentVariant(
  variants: Record<string, TreeBranchVariantPolicySchema>,
  childRecordUnion: RecordUnionPresentationConfig,
): Record<string, TreeAllowedChildVariantConfig[]> {
  return Object.fromEntries(
    Object.entries(variants)
      .map(([parentVariantValue, policy]) => {
        const childVariantPolicies =
          typeof policy === "object"
            ? (policy.children ?? [])
            : ([] as TreeBranchChildVariantSchema[]);

        return [
          parentVariantValue,
          childVariantPolicies.map((childVariantPolicy) => {
            const childVariantValue = treeChildVariantPolicyValue(childVariantPolicy);
            const unionVariant = childRecordUnion.union.variants[childVariantValue];

            if (!unionVariant) {
              throw new Error(`Missing tree child variant "${childVariantValue}".`);
            }

            return {
              variantValue: childVariantValue,
              label:
                typeof childVariantPolicy === "string"
                  ? unionVariant.label
                  : (childVariantPolicy.label ?? unionVariant.label),
              unionVariant,
              ...(typeof childVariantPolicy === "string" ||
              childVariantPolicy.placementValues === undefined
                ? {}
                : { placementValues: childVariantPolicy.placementValues }),
            };
          }),
        ] as const;
      })
      .filter(([, childVariants]) => childVariants.length > 0),
  );
}

function treeChildVariantPolicyValue(policy: TreeBranchChildVariantSchema) {
  return typeof policy === "string" ? policy : policy.variant;
}

function treeBranchVariantPolicyIsLeaf(policy: TreeBranchVariantPolicySchema): boolean {
  return policy === "leaf" || (typeof policy === "object" && policy.action === "leaf");
}

function selectTreeCompositionActionConfig(
  composition: Extract<CollectionViewSchema["result"], { type: "tree" }>["composition"],
  entity: EntitySchema,
): TreeCompositionActionConfig | undefined {
  if (composition === undefined) {
    return undefined;
  }

  const createAction =
    composition.createAction === undefined ? undefined : entity.actions?.[composition.createAction];
  const removeAction =
    composition.removeAction === undefined ? undefined : entity.actions?.[composition.removeAction];

  return {
    ...(composition.createAction !== undefined && createAction?.kind === "create-tree-child"
      ? {
          create: {
            actionName: composition.createAction,
            action: createAction,
          },
        }
      : {}),
    ...(composition.removeAction !== undefined && removeAction?.kind === "remove-tree-placement"
      ? {
          remove: {
            actionName: composition.removeAction,
            action: removeAction,
          },
        }
      : {}),
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
