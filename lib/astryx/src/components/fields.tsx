import { useCallback, useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { fieldKindOptions, fieldScenarioGroups, fieldSurfaceOptions } from "./fields/fixtures.ts";
import { FormlessUiFieldRenderer, FormlessUiFieldSubmitFormAdapter } from "./fields/renderer.tsx";
import { applyScenarioFieldIntent, scenarioFieldKey } from "./fields/fixture-helpers.ts";
import type {
  FieldKindKey,
  FieldScenarioFacet,
  FieldScenarioFacetId,
  FieldScenarioFacetValues,
  FieldScenarioGroup,
  FieldScenarioVariant,
} from "./field-scenario-model.ts";
import type {
  FormlessUiField,
  FormlessUiFieldIntentHandler,
  FormlessUiFieldSurface,
} from "../formless-ui-contract.ts";

type FieldOverrides = Record<string, FormlessUiField>;

export function FormlessFieldsLayout() {
  const showToast = useToast();
  const [selectedKind, setSelectedKind] = useState<FieldKindKey>("enum");
  const [selectedSurface, setSelectedSurface] = useState<FormlessUiFieldSurface>("record");
  const [selectedFacetValues, setSelectedFacetValues] = useState<FieldScenarioFacetValues>(() =>
    defaultFacetValues(requiredScenarioGroup("enum", "record")),
  );
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});

  const selectedKindOption =
    fieldKindOptions.find((option) => option.id === selectedKind) ?? fieldKindOptions[0];
  const selectedGroup = findScenarioGroup(selectedKindOption.id, selectedSurface);
  const normalizedFacetValues = selectedGroup
    ? normalizeFacetValues(selectedGroup, selectedFacetValues)
    : {};
  const selectedVariant = selectedGroup
    ? findScenarioVariant(selectedGroup, normalizedFacetValues)
    : null;
  const selectedField = useMemo(
    () =>
      selectedVariant
        ? (fieldOverrides[scenarioFieldKey(selectedVariant.field)] ?? selectedVariant.field)
        : null,
    [fieldOverrides, selectedVariant],
  );
  const handleIntent = useFieldMatrixIntentHandler(selectedVariant, setFieldOverrides);
  const stateMachineError =
    selectedField?.access.kind === "stateMachine" && selectedField.control.kind === "enum"
      ? selectedField.errors?.[0]
      : undefined;
  const selectedFieldId = selectedField ? scenarioFieldKey(selectedField) : undefined;

  useEffect(() => {
    if (!selectedFieldId || !stateMachineError) {
      return;
    }

    showToast({
      uniqueID: `field:${selectedFieldId}:${stateMachineError.fieldName}:${stateMachineError.message}`,
      collisionBehavior: "overwrite",
      body: stateMachineError.message,
      type: "error",
      isAutoHide: true,
      autoHideDuration: 6000,
    });
  }, [selectedFieldId, showToast, stateMachineError?.fieldName, stateMachineError?.message]);

  return (
    <main {...stylex.props(styles.screen)}>
      <div {...stylex.props(styles.content)}>
        <header {...stylex.props(styles.header)}>
          <VStack gap={1}>
            <Heading level={1}>Field Explorer</Heading>
          </VStack>
        </header>

        <div {...stylex.props(styles.matrix)}>
          <aside {...stylex.props(styles.kindRail)} aria-label="Field types">
            {fieldKindOptions.map((option) => (
              <Button
                key={option.id}
                label={option.label}
                variant={option.id === selectedKindOption.id ? "primary" : "ghost"}
                xstyle={styles.kindButton}
                onClick={() => {
                  const nextSurface = selectScenarioSurface(option.id, selectedSurface);
                  const nextGroup = findScenarioGroup(option.id, nextSurface);

                  setSelectedKind(option.id);
                  setSelectedSurface(nextSurface);
                  setSelectedFacetValues(nextGroup ? defaultFacetValues(nextGroup) : {});
                }}
              />
            ))}
          </aside>

          <section {...stylex.props(styles.workbench)} aria-labelledby="field-matrix-heading">
            <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
              <Heading level={2} id="field-matrix-heading">
                {selectedKindOption.label}
              </Heading>
              <Text type="supporting" color="secondary">
                {countScenariosForKind(selectedKindOption.id)} scenarios
              </Text>
            </HStack>

            <SegmentedControl
              value={selectedSurface}
              onChange={(value) => {
                const nextSurface = value as FormlessUiFieldSurface;
                const nextGroup = findScenarioGroup(selectedKindOption.id, nextSurface);

                setSelectedSurface(nextSurface);
                setSelectedFacetValues(nextGroup ? defaultFacetValues(nextGroup) : {});
              }}
              label="Surface"
              layout="fill"
              size="sm"
            >
              {fieldSurfaceOptions.map((surface) => (
                <SegmentedControlItem
                  key={surface.id}
                  value={surface.id}
                  label={surface.label}
                  isDisabled={!hasScenarioForSurface(selectedKindOption.id, surface.id)}
                />
              ))}
            </SegmentedControl>

            {selectedGroup ? (
              <div {...stylex.props(styles.facetGrid)}>
                {selectedGroup.facets.map((facet) => (
                  <FieldFacetControl
                    key={facet.id}
                    facet={facet}
                    group={selectedGroup}
                    selectedValues={normalizedFacetValues}
                    onChange={(value) =>
                      setSelectedFacetValues((currentValues) =>
                        normalizeFacetValues(selectedGroup, {
                          ...currentValues,
                          [facet.id]: value,
                        }),
                      )
                    }
                  />
                ))}
              </div>
            ) : null}

            <Card padding={4} variant="muted">
              {selectedField ? (
                <FieldPreview field={selectedField} onIntent={handleIntent} />
              ) : (
                <NoScenario />
              )}
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}

function FieldPreview({
  field,
  onIntent,
}: {
  field: FormlessUiField;
  onIntent: FormlessUiFieldIntentHandler;
}) {
  return (
    <div
      {...stylex.props(
        styles.preview,
        field.surface === "table-cell" && styles.previewTableCell,
        field.surface === "detail" && styles.previewDetail,
      )}
    >
      <FormlessUiFieldRenderer field={field} onIntent={onIntent} />
      <FormlessUiFieldSubmitFormAdapter field={field} />
    </div>
  );
}

function NoScenario() {
  return (
    <div {...stylex.props(styles.emptyScenario)}>
      <Text type="label">No scenario</Text>
    </div>
  );
}

function FieldFacetControl({
  facet,
  group,
  onChange,
  selectedValues,
}: {
  facet: FieldScenarioFacet;
  group: FieldScenarioGroup;
  onChange: (value: string) => void;
  selectedValues: FieldScenarioFacetValues;
}) {
  const value = selectedValues[facet.id] ?? facet.options[0]?.id ?? "";

  return (
    <div {...stylex.props(styles.facetControl)}>
      <SegmentedControl
        value={value}
        onChange={onChange}
        label={facet.label}
        size="sm"
        layout="hug"
      >
        {facet.options.map((option) => (
          <SegmentedControlItem
            key={option.id}
            value={option.id}
            label={option.label}
            isDisabled={!facetOptionHasScenario(group, facet.id, option.id, selectedValues)}
          />
        ))}
      </SegmentedControl>
    </div>
  );
}

function useFieldMatrixIntentHandler(
  selectedVariant: FieldScenarioVariant | null,
  setFieldOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>,
): FormlessUiFieldIntentHandler {
  return useCallback(
    (intent) => {
      if (!selectedVariant) {
        return;
      }

      const key = scenarioFieldKey(selectedVariant.field);

      setFieldOverrides((currentOverrides) => {
        const currentField = currentOverrides[key] ?? selectedVariant.field;
        const nextField = applyScenarioFieldIntent(currentField, intent);

        if (nextField === currentField) {
          return currentOverrides;
        }

        return { ...currentOverrides, [key]: nextField };
      });
    },
    [selectedVariant, setFieldOverrides],
  );
}

function findScenarioGroup(kind: FieldKindKey, surface: FormlessUiFieldSurface) {
  return fieldScenarioGroups.find((group) => group.kind === kind && group.surface === surface);
}

function requiredScenarioGroup(kind: FieldKindKey, surface: FormlessUiFieldSurface) {
  const group = findScenarioGroup(kind, surface);

  if (!group) {
    throw new Error(`Missing ${kind} ${surface} field scenario group.`);
  }

  return group;
}

function selectScenarioSurface(kind: FieldKindKey, preferredSurface: FormlessUiFieldSurface) {
  if (findScenarioGroup(kind, preferredSurface)) {
    return preferredSurface;
  }

  return (
    fieldSurfaceOptions.find((surface) => findScenarioGroup(kind, surface.id))?.id ??
    preferredSurface
  );
}

function hasScenarioForSurface(kind: FieldKindKey, surface: FormlessUiFieldSurface) {
  return Boolean(findScenarioGroup(kind, surface));
}

function defaultFacetValues(group: FieldScenarioGroup): FieldScenarioFacetValues {
  return normalizeFacetValues(group, group.variants[0]?.facets ?? {});
}

function normalizeFacetValues(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): FieldScenarioFacetValues {
  const nextValues: FieldScenarioFacetValues = {};

  for (const facet of group.facets) {
    const selectedValue = values[facet.id];
    const selectedOption =
      selectedValue && facet.options.some((option) => option.id === selectedValue)
        ? selectedValue
        : undefined;

    nextValues[facet.id] =
      selectedOption ?? group.variants[0]?.facets[facet.id] ?? facet.options[0]?.id;
  }

  if (findScenarioVariant(group, nextValues)) {
    return nextValues;
  }

  return group.variants[0]?.facets ?? nextValues;
}

function findScenarioVariant(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): FieldScenarioVariant | null {
  return (
    group.variants.find((variant) =>
      group.facets.every((facet) => variant.facets[facet.id] === values[facet.id]),
    ) ??
    group.variants[0] ??
    null
  );
}

function facetOptionHasScenario(
  group: FieldScenarioGroup,
  facetId: FieldScenarioFacetId,
  optionId: string,
  selectedValues: FieldScenarioFacetValues,
) {
  const nextValues = { ...selectedValues, [facetId]: optionId };

  return group.variants.some((variant) =>
    group.facets.every((facet) => variant.facets[facet.id] === nextValues[facet.id]),
  );
}

function countScenariosForKind(kind: FieldKindKey) {
  return fieldScenarioGroups
    .filter((group) => group.kind === kind)
    .reduce((count, group) => count + group.variants.length, 0);
}

const styles = stylex.create({
  screen: {
    minHeight: "100vh",
    paddingBlock: spacingVars["--spacing-6"],
    paddingInline: spacingVars["--spacing-6"],
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
    "@media (max-width: 720px)": {
      paddingBlock: spacingVars["--spacing-4"],
      paddingInline: spacingVars["--spacing-4"],
    },
  },
  content: {
    width: "min(100%, 1120px)",
    marginInline: "auto",
    display: "grid",
    gap: spacingVars["--spacing-4"],
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-3"],
    flexWrap: "wrap",
  },
  matrix: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: spacingVars["--spacing-4"],
    alignItems: "start",
    "@media (max-width: 760px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  kindRail: {
    display: "grid",
    gap: spacingVars["--spacing-1"],
    padding: spacingVars["--spacing-2"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-container"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  kindButton: {
    width: "100%",
    justifyContent: "flex-start",
  },
  workbench: {
    display: "grid",
    gap: spacingVars["--spacing-4"],
    minWidth: 0,
  },
  facetGrid: {
    display: "flex",
    alignItems: "flex-end",
    gap: spacingVars["--spacing-3"],
    flexWrap: "wrap",
    minWidth: 0,
  },
  facetControl: {
    display: "grid",
    gap: spacingVars["--spacing-1"],
    minWidth: 0,
  },
  preview: {
    width: "100%",
    maxWidth: 760,
  },
  previewTableCell: {
    maxWidth: 320,
  },
  previewDetail: {
    maxWidth: 560,
  },
  emptyScenario: {
    minHeight: 132,
    display: "grid",
    placeItems: "center",
    borderWidth: borderVars["--border-width"],
    borderStyle: "dashed",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    color: colorVars["--color-text-secondary"],
  },
});
