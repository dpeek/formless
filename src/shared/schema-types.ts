import type { QueryExpression } from "./query.ts";

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
  | "boolean"
  | "date"
  | "number"
  | "enum"
  | "reference";

export type ViewFieldSchema = {
  editor: FieldEditor;
  commit: FieldCommitPolicy;
};

export type CreateViewFieldSchema = {
  editor: FieldEditor;
};

export type TableColumnAlign = "start" | "center" | "end";
export type TableColumnWidth = "xs" | "sm" | "md" | "lg";
export type TableColumnDisplay = "editor" | "readOnly" | "hidden";
export type TableColumnFormat = "plain" | "number" | "currency" | "percent";

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

export type TableColumnSchema = FieldTableColumnSchema | ReferenceFieldTableColumnSchema;

export type TableViewSchema = {
  entity: string;
  columns: TableColumnSchema[];
};

export type CreateDefaultValueSchema = {
  kind: "context";
  name: string;
};

export type CollectionQuerySchema = {
  label: string;
  entity: string;
  expression: QueryExpression;
};

export type ItemViewSchema = {
  entity: string;
  fields: Record<string, ViewFieldSchema>;
};

export type CountDisplaySchema = {
  type: "count";
  label?: string;
};

export type CollectionViewQuerySlotSchema = {
  query: string;
  label?: string;
  count?: CountDisplaySchema;
};

export type CollectionResultSchema =
  | {
      type: "list";
      itemView: string;
    }
  | {
      type: "table";
      tableView: string;
    };

export type CollectionNavigationSchema = {
  primary: boolean;
};

export type CollectionContextSchema = {
  name: string;
  entity: string;
  query: string;
  labelField: string;
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
};

export type CreateViewSchema = {
  type: "create";
  entity: string;
  fields: Record<string, CreateViewFieldSchema>;
  defaults?: Record<string, CreateDefaultValueSchema>;
};

export type ViewSchema = CollectionViewSchema | CreateViewSchema;

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

export type DeleteMutationPolicy = {
  enabled: false;
};

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

export type EntityActionSchema =
  | ClearCompletedEntityActionSchema
  | CreateMissingJoinRecordsEntityActionSchema;

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
  itemViews: Record<string, ItemViewSchema>;
  tableViews: Record<string, TableViewSchema>;
  views: Record<string, ViewSchema>;
};
