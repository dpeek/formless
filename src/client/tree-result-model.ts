import type {
  AppSchema,
  CollectionViewSchema,
  EntityActionSchema,
  EntitySchema,
  EntityUnionVariantSchema,
  FieldSchema,
  FieldVisibilityValue,
  ToManyRelationshipSchema,
  TreeBranchChildVariantSchema,
  TreeBranchVariantPolicySchema,
} from "../shared/schema.ts";
import { selectRecordFields, selectToManyRelationship } from "./collection-shell-model.ts";
import type { ResultOrderingConfig } from "./result-ordering-model.ts";
import { selectResultOrderingConfig } from "./result-ordering-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";
import type { HomeResultConfig, RecordUnionPresentationConfig } from "./views.ts";

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

export type TreeResultModel = Extract<HomeResultConfig, { type: "tree" }>;

export function selectTreeResultModel(
  schema: AppSchema,
  result: Extract<CollectionViewSchema["result"], { type: "tree" }>,
  entity: EntitySchema,
): TreeResultModel {
  const relationship = selectToManyRelationship(schema, result.relationship);
  const childField = entity.fields[result.childField];

  if (!childField || childField.type !== "reference") {
    throw new Error(`Missing tree child field "${result.childField}".`);
  }

  const childEntity = schema.entities[childField.to];
  const childItemView = schema.itemViews[result.childItemView];

  if (!childEntity) {
    throw new Error(`Missing child entity "${childField.to}".`);
  }

  if (!childItemView) {
    throw new Error(`Missing child item view "${result.childItemView}".`);
  }

  const placementItemViewName = result.placementItemView;
  const placementItemView =
    placementItemViewName === undefined ? undefined : schema.itemViews[placementItemViewName];

  if (placementItemViewName !== undefined && placementItemView === undefined) {
    throw new Error(`Missing placement item view "${placementItemViewName}".`);
  }

  const ordering =
    selectResultOrderingConfig(result.ordering, entity) ??
    selectImplicitTreeOrderingFallback(entity, relationship);
  const childRecordUnion = selectRecordUnionPresentation(schema, childItemView, childEntity);
  const placementRecordUnion =
    placementItemView === undefined
      ? undefined
      : selectRecordUnionPresentation(schema, placementItemView, entity);
  const branches = selectTreeBranchPolicyConfig(result.branches, childRecordUnion);
  const composition = selectTreeCompositionActionConfig(result.composition, entity);

  return {
    type: "tree",
    relationshipName: result.relationship,
    relationship,
    childFieldName: result.childField,
    childField,
    childEntityName: childField.to,
    childEntity,
    childItemViewName: result.childItemView,
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
    maxDepth: result.maxDepth ?? 8,
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
