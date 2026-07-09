import type {
  AstryxFieldBaseData,
  AstryxFieldCommitPolicy,
  AstryxFieldData,
  AstryxFieldDisplayData,
  AstryxFieldEditorData,
  AstryxFieldKind,
  AstryxFieldSurface,
  AstryxFieldValue,
} from "../field-contract.ts";

export type FieldKindKey = AstryxFieldKind | "state-machine-enum";

export type FieldKindOption = {
  id: FieldKindKey;
  label: string;
};

export type FieldScenarioGroup = {
  id: string;
  kind: FieldKindKey;
  surface: AstryxFieldSurface;
  facets: readonly FieldScenarioFacet[];
  variants: readonly FieldScenarioVariant[];
};

export type FieldScenarioFacetId =
  | "machine"
  | "mode"
  | "presentation"
  | "requiredness"
  | "runtime"
  | "state"
  | "value";

export type FieldScenarioAxis = {
  id: FieldScenarioFacetId;
  label: string;
  variants: readonly FieldScenarioVariant[];
};

export type FieldScenarioFacet = {
  id: FieldScenarioFacetId;
  label: string;
  options: readonly FieldScenarioFacetOption[];
};

export type FieldScenarioFacetOption = {
  id: string;
  label: string;
};

export type FieldScenarioVariant = {
  id: string;
  label: string;
  facets: FieldScenarioFacetValues;
  field: AstryxFieldData;
};

export type FieldScenarioFacetValues = Partial<Record<FieldScenarioFacetId, string>>;

export type FieldScenarioFieldPatch = Partial<AstryxFieldBaseData> & {
  committedDisplayValue?: string;
  committedValue?: AstryxFieldValue;
  commitPolicy?: AstryxFieldCommitPolicy;
  displayValue?: AstryxFieldDisplayData["displayValue"];
  draftValue?: AstryxFieldEditorData["draftValue"];
  mode?: AstryxFieldData["mode"];
  value?: AstryxFieldDisplayData["value"];
};

export type FieldScenarioFieldModifier =
  | FieldScenarioFieldPatch
  | ((field: AstryxFieldData) => AstryxFieldData);

export type FieldScenarioComposeOption = FieldScenarioFacetOption & {
  modify?: FieldScenarioFieldModifier | readonly FieldScenarioFieldModifier[];
};

export type FieldScenarioComposeAxis = {
  id: FieldScenarioFacetId;
  label: string;
  options: readonly FieldScenarioComposeOption[];
};

export type FieldScenarioComposeContext = {
  facets: FieldScenarioFacetValues;
  field: AstryxFieldData;
  optionIds: readonly string[];
  optionLabels: readonly string[];
  options: readonly FieldScenarioComposeOption[];
};

export type ComposeScenarioGroupInput = {
  id: string;
  kind: FieldKindKey;
  surface: AstryxFieldSurface;
  base: AstryxFieldData;
  axes: readonly FieldScenarioComposeAxis[];
  include?: (context: FieldScenarioComposeContext) => boolean;
  finalizeField?: (context: FieldScenarioComposeContext) => AstryxFieldData;
  variantId?: (context: FieldScenarioComposeContext) => string;
  variantLabel?: (context: FieldScenarioComposeContext) => string;
};

export function composeScenarioGroup({
  axes,
  base,
  finalizeField,
  id,
  include,
  kind,
  surface,
  variantId,
  variantLabel,
}: ComposeScenarioGroupInput): FieldScenarioGroup {
  const combinations = scenarioOptionCombinations(axes);

  return {
    facets: axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      options: axis.options.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    })),
    id,
    kind,
    surface,
    variants: combinations.flatMap((options) => {
      const facets: FieldScenarioFacetValues = {};

      for (const [index, option] of options.entries()) {
        facets[axes[index].id] = option.id;
      }

      const optionIds = options.map((option) => option.id);
      const optionLabels = options.map((option) => option.label);
      let field = options.reduce<AstryxFieldData>(
        (currentField, option) => applyFieldScenarioModifiers(currentField, option.modify),
        { ...base } as AstryxFieldData,
      );
      let context: FieldScenarioComposeContext = {
        facets,
        field,
        optionIds,
        optionLabels,
        options,
      };

      if (include && !include(context)) {
        return [];
      }

      if (finalizeField) {
        field = finalizeField(context);
        context = { ...context, field };
      }

      return scenarioVariant(
        variantId?.(context) ?? optionIds.join("-"),
        variantLabel?.(context) ?? optionLabels.join(" / "),
        field,
        facets,
      );
    }),
  };
}

export function scenarioOption(
  id: string,
  label: string,
  modify?: FieldScenarioComposeOption["modify"],
): FieldScenarioComposeOption {
  return modify === undefined ? { id, label } : { id, label, modify };
}

export function composeScenarioAxis(
  id: FieldScenarioFacetId,
  label: string,
  options: readonly FieldScenarioComposeOption[],
): FieldScenarioComposeAxis {
  return { id, label, options };
}

export function scenarioGroup(
  id: string,
  kind: FieldKindKey,
  surface: AstryxFieldSurface,
  facetsOrAxes: readonly FieldScenarioFacet[] | readonly FieldScenarioAxis[],
  variants?: readonly FieldScenarioVariant[],
): FieldScenarioGroup {
  if (variants !== undefined) {
    return { facets: facetsOrAxes as readonly FieldScenarioFacet[], id, kind, surface, variants };
  }

  const axes = facetsOrAxes as readonly FieldScenarioAxis[];

  return {
    facets: axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      options: axis.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
      })),
    })),
    id,
    kind,
    surface,
    variants: axes.flatMap((axis) =>
      axis.variants.map((variant) => ({
        ...variant,
        facets: {
          ...variant.facets,
          [axis.id]: variant.facets[axis.id] ?? variant.id,
        },
      })),
    ),
  };
}

export function scenarioAxis(
  id: FieldScenarioFacetId,
  label: string,
  variants: readonly FieldScenarioVariant[],
): FieldScenarioAxis {
  return { id, label, variants };
}

export function scenarioFacet(
  id: FieldScenarioFacetId,
  label: string,
  options: readonly FieldScenarioFacetOption[],
): FieldScenarioFacet {
  return { id, label, options };
}

export function facetOption(id: string, label: string): FieldScenarioFacetOption {
  return { id, label };
}

export function scenarioVariant(
  id: string,
  label: string,
  field: AstryxFieldData,
  facets: FieldScenarioFacetValues = {},
): FieldScenarioVariant {
  return { facets, field, id, label };
}

function scenarioOptionCombinations(
  axes: readonly FieldScenarioComposeAxis[],
): FieldScenarioComposeOption[][] {
  return axes.reduce<FieldScenarioComposeOption[][]>(
    (combinations, axis) =>
      combinations.flatMap((combination) =>
        axis.options.map((option) => [...combination, option]),
      ),
    [[]],
  );
}

function applyFieldScenarioModifiers(
  field: AstryxFieldData,
  modifiers: FieldScenarioComposeOption["modify"],
): AstryxFieldData {
  if (modifiers === undefined) {
    return field;
  }

  if (fieldScenarioModifiersAreArray(modifiers)) {
    return modifiers.reduce<AstryxFieldData>(
      (currentField, modifier) => applyFieldScenarioModifier(currentField, modifier),
      field,
    );
  }

  return applyFieldScenarioModifier(field, modifiers);
}

function fieldScenarioModifiersAreArray(
  modifiers: FieldScenarioComposeOption["modify"],
): modifiers is readonly FieldScenarioFieldModifier[] {
  return Array.isArray(modifiers);
}

function applyFieldScenarioModifier(
  field: AstryxFieldData,
  modifier: FieldScenarioFieldModifier,
): AstryxFieldData {
  if (typeof modifier === "function") {
    return modifier(field);
  }

  return { ...field, ...modifier } as AstryxFieldData;
}
