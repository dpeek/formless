import type { QueryExpression } from "./query.ts";
import type { NumericExpression } from "./read-model.ts";

export type TextFieldSchema = {
  type: "text";
  required: boolean;
  label?: string;
  format?: TextFieldFormat;
};

export type TextFieldFormat =
  | "plain"
  | "longText"
  | "markdown"
  | "href"
  | "slug"
  | "color"
  | "icon";

export type BooleanFieldSchema = {
  type: "boolean";
  required: boolean;
  label?: string;
  default?: boolean;
};

export type DateFieldSchema = {
  type: "date";
  required: boolean;
  label?: string;
};

export type NumberFieldSchema = {
  type: "number";
  required: boolean;
  label?: string;
  default?: number;
  min?: number;
  max?: number;
  integer?: boolean;
};

export type EnumValueSchema = {
  label: string;
};

export type EnumFieldSchema = {
  type: "enum";
  required: boolean;
  label?: string;
  values: Record<string, EnumValueSchema>;
  default?: string;
};

export type ReferenceFieldSchema = {
  type: "reference";
  required: boolean;
  label?: string;
  to: string;
  displayField?: string;
};

export type FieldSchema =
  | TextFieldSchema
  | BooleanFieldSchema
  | DateFieldSchema
  | NumberFieldSchema
  | EnumFieldSchema
  | ReferenceFieldSchema;

export type FieldCommitPolicy = "immediate" | "field-commit";

export type FieldEditor =
  | "text"
  | "textarea"
  | "markdown"
  | "href"
  | "slug"
  | "color"
  | "icon"
  | "image"
  | "boolean"
  | "date"
  | "number"
  | "enum"
  | "reference";

export type FieldVisibilityValue = string | boolean | number;

export type FieldVisibilityConditionSchema = {
  field: string;
  values: FieldVisibilityValue[];
};

export type ViewFieldSchema = {
  editor: FieldEditor;
  commit: FieldCommitPolicy;
  visibleWhen?: FieldVisibilityConditionSchema;
};

export type CreateViewFieldSchema = {
  editor: FieldEditor;
  visibleWhen?: FieldVisibilityConditionSchema;
};

export type TableColumnAlign = "start" | "center" | "end";
export type TableColumnWidth = "xs" | "sm" | "md" | "lg";
export type TableColumnDisplay = "editor" | "readOnly" | "hidden";
export type TableColumnFormat = "plain" | "number" | "currency" | "percent";
export type TableActionVariant = "default" | "destructive";
export type TableActionAvailabilityState = "visible" | "hidden" | "disabled";
export type TableActionPresentation = "button" | "dropdown";
export type ResultOrderingPresentation = "moveMenu" | "dragHandle";
// Table ordering aliases stay for table view compatibility; new schemas should use result ordering.
export type TableOrderingPresentation = ResultOrderingPresentation;

export type TableActionAvailabilitySchema = {
  state: TableActionAvailabilityState;
  reason?: string;
};

export type TableEditRecordTargetSchema =
  | {
      kind: "row";
    }
  | {
      kind: "reference";
      field: string;
    };

export type TableActionBaseSchema = {
  label: string;
  variant?: TableActionVariant;
  availability?: TableActionAvailabilitySchema;
};

export type StaticTableActionSchema = TableActionBaseSchema & {
  type?: undefined;
};

export type EditRecordTableActionSchema = TableActionBaseSchema & {
  type: "editRecord";
  target: TableEditRecordTargetSchema;
  editView: string;
};

export type TableActionSchema = StaticTableActionSchema | EditRecordTableActionSchema;

export type ResultOrderingScopeSchema = {
  kind: "field";
  field: string;
};

export type TableOrderingScopeSchema = ResultOrderingScopeSchema;

export type ResultOrderingSchema = {
  field: string;
  scope?: ResultOrderingScopeSchema[];
  presentations?: ResultOrderingPresentation[];
};

export type TableOrderingSchema = ResultOrderingSchema;

export type ValueUnitEditorSchema = {
  unitField: string;
};

export type FieldTableColumnSchema = {
  type: "field";
  field: string;
  label?: string;
  editor?: FieldEditor;
  commit?: FieldCommitPolicy;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  suffix?: string;
  format?: TableColumnFormat;
  referenceItemView?: string;
  valueUnit?: ValueUnitEditorSchema;
};

export type ReferenceFieldTableColumnSchema = {
  type: "referenceField";
  referenceField: string;
  field: string;
  label?: string;
  editor?: FieldEditor;
  commit?: FieldCommitPolicy;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  suffix?: string;
  format?: TableColumnFormat;
};

export type ComputedTableColumnSchema = {
  type: "computed";
  computedValue: string;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  suffix?: string;
  format?: TableColumnFormat;
};

export type InvokeActionTableColumnSchema = {
  type: "invokeAction";
  action?: string;
  actions?: string[];
  includeOrdering?: boolean;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  presentation?: TableActionPresentation;
};

export type OrderingHandleTableColumnSchema = {
  type: "orderingHandle";
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
};

export type TableColumnSchema =
  | FieldTableColumnSchema
  | ReferenceFieldTableColumnSchema
  | ComputedTableColumnSchema
  | InvokeActionTableColumnSchema
  | OrderingHandleTableColumnSchema;

export type TableViewSchema = {
  entity: string;
  actions?: Record<string, TableActionSchema>;
  ordering?: TableOrderingSchema;
  columns: TableColumnSchema[];
};

export type CreateDefaultValueSchema =
  | {
      kind: "context";
      name: string;
    }
  | {
      kind: "literal";
      value: string | boolean | number;
    };

export type CollectionQuerySchema = {
  label: string;
  entity: string;
  expression: QueryExpression;
};

export type ComputedValueSchema = {
  entity: string;
  type: "number";
  expression: NumericExpression;
};

export type AggregateFunction = "count" | "sum" | "average" | "min" | "max";

export type AggregateValueSchema =
  | {
      kind: "field";
      field: string;
    }
  | {
      kind: "computed";
      computedValue: string;
    };

export type AggregateSchema = {
  query: string;
  function: AggregateFunction;
  value?: AggregateValueSchema;
};

export type ReadModelSchema = {
  computedValues?: Record<string, ComputedValueSchema>;
  aggregates?: Record<string, AggregateSchema>;
};

export type EntityUnionVariantSchema = {
  label: string;
  fields: string[];
  requiredFields?: string[];
};

export type EntityUnionSchema = {
  entity: string;
  discriminator: string;
  variants: Record<string, EntityUnionVariantSchema>;
  fallback?: EntityUnionVariantSchema;
};

export type ContextSelectionTargetSchema = {
  kind: "selectContext";
  context: string;
  record: "self";
};

export type ViewVariantFieldsPresentationSchema = {
  presentation: "fields";
  fields: Record<string, ViewFieldSchema>;
};

export type ViewVariantContextLinkPresentationSchema = {
  presentation: "contextLink";
  labelField: string;
  target: ContextSelectionTargetSchema;
};

export type ItemViewVariantPresentationSchema =
  | ViewVariantFieldsPresentationSchema
  | ViewVariantContextLinkPresentationSchema;

export type EditViewVariantPresentationSchema = ViewVariantFieldsPresentationSchema;

export type CreateViewVariantFieldsPresentationSchema = {
  presentation: "fields";
  fields: Record<string, CreateViewFieldSchema>;
};

export type CreateViewVariantPresentationSchema = CreateViewVariantFieldsPresentationSchema;

export type BaseItemViewSchema = {
  entity: string;
  fields: Record<string, ViewFieldSchema>;
};

export type StaticItemViewSchema = BaseItemViewSchema & {
  union?: undefined;
  variants?: undefined;
  fallback?: undefined;
};

export type UnionItemViewSchema = BaseItemViewSchema & {
  union: string;
  variants: Record<string, ItemViewVariantPresentationSchema>;
  fallback?: ItemViewVariantPresentationSchema;
};

export type ItemViewSchema = StaticItemViewSchema | UnionItemViewSchema;

export type CountDisplaySchema = {
  type: "count";
  label?: string;
};

export type CollectionViewQuerySlotSchema = {
  query: string;
  label?: string;
  count?: CountDisplaySchema;
};

export type TreeBranchActionSchema = "leaf";

export type TreeBranchChildVariantSchema =
  | string
  | {
      variant: string;
      label?: string;
      placementValues?: Record<string, FieldVisibilityValue>;
    };

export type TreeBranchVariantPolicySchema =
  | TreeBranchActionSchema
  | {
      action?: TreeBranchActionSchema;
      children?: TreeBranchChildVariantSchema[];
    };

export type TreeBranchPolicySchema = {
  variants: Record<string, TreeBranchVariantPolicySchema>;
};

export type TreeCompositionActionSchema = {
  createAction?: string;
  removeAction?: string;
};

export type CollectionResultSchema =
  | {
      type: "list";
      itemView: string;
      ordering?: ResultOrderingSchema;
    }
  | {
      type: "table";
      tableView: string;
      ordering?: ResultOrderingSchema;
      footer?: CollectionTableFooterSlotSchema[];
    }
  | {
      type: "tree";
      relationship: string;
      childField: string;
      childItemView: string;
      placementItemView?: string;
      ordering?: ResultOrderingSchema;
      branches?: TreeBranchPolicySchema;
      composition?: TreeCompositionActionSchema;
      maxDepth?: number;
    };

export type CollectionTableFooterSlotSchema = {
  type: "aggregate";
  column: string;
  aggregate: string;
  label?: string;
  suffix?: string;
  format?: TableColumnFormat;
};

export type CollectionNavigationSchema = {
  primary: boolean;
};

export type CollectionContextPresentation = "tabs" | "listDetail";

export type CollectionContextNavigationGroupSchema = {
  label: string;
  query: string;
  createView?: string;
};

export type CollectionContextNavigationSchema = {
  placement: "sidebar";
  groups: CollectionContextNavigationGroupSchema[];
};

export type CollectionContextSchema = {
  name: string;
  entity: string;
  query: string;
  labelField: string;
  presentation: CollectionContextPresentation;
  navigation?: CollectionContextNavigationSchema;
  relationship?: string;
  createView?: string;
  itemView?: string;
};

export type CollectionActionSlotSchema =
  | {
      type: "create";
      createView: string;
      label?: string;
    }
  | {
      type: "entityAction";
      action: string;
      label?: string;
      count?: CountDisplaySchema;
    };

export type CollectionSummarySlotSchema = {
  type: "aggregate";
  aggregate: string;
  label?: string;
  suffix?: string;
  format?: TableColumnFormat;
};

export type CollectionViewSchema = {
  type: "collection";
  label: string;
  entity: string;
  navigation?: CollectionNavigationSchema;
  context?: CollectionContextSchema;
  queries: CollectionViewQuerySlotSchema[];
  defaultQuery: string;
  result: CollectionResultSchema;
  actions?: CollectionActionSlotSchema[];
  summary?: CollectionSummarySlotSchema[];
};

export type CreateViewSchema = {
  type: "create";
  entity: string;
  fields: Record<string, CreateViewFieldSchema>;
  defaults?: Record<string, CreateDefaultValueSchema>;
} & (
  | {
      union?: undefined;
      variants?: undefined;
      fallback?: undefined;
    }
  | {
      union: string;
      variants: Record<string, CreateViewVariantPresentationSchema>;
      fallback?: CreateViewVariantPresentationSchema;
    }
);

export type EditViewSchema = {
  type: "edit";
  entity: string;
  fields: Record<string, ViewFieldSchema>;
} & (
  | {
      union?: undefined;
      variants?: undefined;
      fallback?: undefined;
    }
  | {
      union: string;
      variants: Record<string, EditViewVariantPresentationSchema>;
      fallback?: EditViewVariantPresentationSchema;
    }
);

export type ViewSchema = CollectionViewSchema | CreateViewSchema | EditViewSchema;

export type ScreenNavigationSchema = {
  primary: boolean;
};

export type CollectionScreenSectionSchema = {
  id: string;
  type: "collection";
  view: string;
  label?: string;
};

export type ScreenSectionSchema = CollectionScreenSectionSchema;

export type StackScreenLayoutSchema = {
  type: "stack";
  sections: ScreenSectionSchema[];
};

export type ScreenLayoutSchema = StackScreenLayoutSchema;

export type WorkspaceScreenSchema = {
  type: "workspace";
  label: string;
  path?: string;
  navigation?: ScreenNavigationSchema;
  layout: ScreenLayoutSchema;
};

export type ScreenSchema = WorkspaceScreenSchema;

export type ToOneRelationshipSchema = {
  kind: "toOne";
  label?: string;
  from: {
    entity: string;
    field: string;
  };
  to: {
    entity: string;
  };
  inverse?: string;
};

export type ToManyRelationshipSchema = {
  kind: "toMany";
  label?: string;
  from: {
    entity: string;
  };
  to: {
    entity: string;
    field: string;
  };
  inverse?: string;
};

export type ManyToManyRelationshipSchema = {
  kind: "manyToMany";
  label?: string;
  from: {
    entity: string;
  };
  to: {
    entity: string;
  };
  through: {
    entity: string;
    fromField: string;
    toField: string;
    uniqueConstraint?: string;
  };
  inverse?: string;
};

export type RelationshipSchema =
  | ToOneRelationshipSchema
  | ToManyRelationshipSchema
  | ManyToManyRelationshipSchema;

export type AfterCreateHookSchema = {
  entity: string;
  action: string;
};

export type GenericMutationPolicy = {
  enabled: boolean;
};

export type CreateMutationPolicy = GenericMutationPolicy & {
  afterCreate?: AfterCreateHookSchema[];
};

export type DeleteMutationPolicy = GenericMutationPolicy;

export type EntityMutationPolicy = {
  create: CreateMutationPolicy;
  patch: GenericMutationPolicy;
  delete: DeleteMutationPolicy;
};

export type EntityActionTargetSchema = {
  query: string;
};

export type EntityActionJoinSourceSchema = {
  field: string;
  query: string;
};

export type EntityActionJoinSchema = {
  left: EntityActionJoinSourceSchema;
  right: EntityActionJoinSourceSchema;
};

export type EntityActionKind =
  | "clear-completed"
  | "create-missing-join-records"
  | "create-selected-join-record"
  | "remove-selected-join-records"
  | "create-tree-child"
  | "remove-tree-placement";

export type EntityActionCapabilities = {
  createAfterCreateHook: boolean;
};

export type ClearCompletedEntityActionSchema = {
  label: string;
  kind: "clear-completed";
  target: EntityActionTargetSchema;
};

export type CreateMissingJoinRecordsEntityActionSchema = {
  label: string;
  kind: "create-missing-join-records";
  join: EntityActionJoinSchema;
};

export type CreateSelectedJoinRecordEntityActionSchema = {
  label: string;
  kind: "create-selected-join-record";
  relationship: string;
};

export type RemoveSelectedJoinRecordsEntityActionSchema = {
  label: string;
  kind: "remove-selected-join-records";
  relationship: string;
};

export type CreateTreeChildEntityActionSchema = {
  label: string;
  kind: "create-tree-child";
  relationship: string;
  childField: string;
  orderField?: string;
};

export type RemoveTreePlacementEntityActionSchema = {
  label: string;
  kind: "remove-tree-placement";
  relationship: string;
};

export type EntityActionSchema =
  | ClearCompletedEntityActionSchema
  | CreateMissingJoinRecordsEntityActionSchema
  | CreateSelectedJoinRecordEntityActionSchema
  | RemoveSelectedJoinRecordsEntityActionSchema
  | CreateTreeChildEntityActionSchema
  | RemoveTreePlacementEntityActionSchema;

export type UniqueConstraintSchema = {
  kind: "unique";
  fields: string[];
};

export type EntityConstraintSchema = UniqueConstraintSchema;

export type EntitySchema = {
  label: string;
  fields: Record<string, FieldSchema>;
  mutations: EntityMutationPolicy;
  constraints?: Record<string, EntityConstraintSchema>;
  actions?: Record<string, EntityActionSchema>;
};

export type AppSchema = {
  version: number;
  entities: Record<string, EntitySchema>;
  relationships?: Record<string, RelationshipSchema>;
  queries: Record<string, CollectionQuerySchema>;
  readModels?: ReadModelSchema;
  unions?: Record<string, EntityUnionSchema>;
  itemViews: Record<string, ItemViewSchema>;
  tableViews: Record<string, TableViewSchema>;
  views: Record<string, ViewSchema>;
  screens?: Record<string, ScreenSchema>;
};
