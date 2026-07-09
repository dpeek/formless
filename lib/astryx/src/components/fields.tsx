import { useCallback, useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import {
  fieldKindOptions,
  fieldScenarioGroups,
  fieldSurfaceOptions,
} from "./field-contract-scenarios.ts";
import { AstryxFieldRenderer, AstryxFieldSubmitFormAdapter } from "./field-renderer.tsx";
import type {
  FieldKindKey,
  FieldScenarioFacet,
  FieldScenarioFacetId,
  FieldScenarioFacetValues,
  FieldScenarioGroup,
  FieldScenarioVariant,
} from "./field-scenario-model.ts";
import type {
  AstryxFieldData,
  AstryxFieldIntentHandlers,
  AstryxFieldSurface,
  AstryxFieldTransitionOperation,
  AstryxFieldValue,
} from "../field-contract.ts";

type DraftValues = Record<string, AstryxFieldValue>;
type StateMachineValues = Record<string, string>;
type ActiveStateTransitions = Record<string, string>;

export function FormlessFieldsLayout() {
  const showToast = useToast();
  const [selectedKind, setSelectedKind] = useState<FieldKindKey>("enum");
  const [selectedSurface, setSelectedSurface] = useState<AstryxFieldSurface>("record");
  const [selectedFacetValues, setSelectedFacetValues] = useState<FieldScenarioFacetValues>(() =>
    defaultFacetValues(requiredScenarioGroup("enum", "record")),
  );
  const [draftValues, setDraftValues] = useState(createInitialDraftValues);
  const [stateMachineValues, setStateMachineValues] = useState<StateMachineValues>({});
  const [activeStateTransitions, setActiveStateTransitions] = useState<ActiveStateTransitions>({});

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
        ? applyRuntimeToField(
            selectedVariant.field,
            draftValues,
            stateMachineValues,
            activeStateTransitions,
          )
        : null,
    [activeStateTransitions, draftValues, selectedVariant, stateMachineValues],
  );
  const handlers = useFieldMatrixHandlers(
    setDraftValues,
    setStateMachineValues,
    setActiveStateTransitions,
  );
  const stateMachineError =
    selectedField?.accessMode === "state-machine" && selectedField.kind === "enum"
      ? selectedField.errors?.[0]
      : undefined;
  const selectedFieldId = selectedField?.id;

  useEffect(() => {
    if (!selectedFieldId || !stateMachineError) {
      return;
    }

    showToast({
      uniqueID: `field:${selectedFieldId}:${stateMachineError.id}`,
      collisionBehavior: "overwrite",
      body: stateMachineError.message,
      type: stateMachineError.severity === "warning" ? "info" : "error",
      isAutoHide: true,
      autoHideDuration: 6000,
    });
  }, [
    selectedFieldId,
    showToast,
    stateMachineError?.id,
    stateMachineError?.message,
    stateMachineError?.severity,
  ]);

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
                const nextSurface = value as AstryxFieldSurface;
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
                <FieldPreview field={selectedField} handlers={handlers} />
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
  handlers,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
}) {
  return (
    <div
      {...stylex.props(
        styles.preview,
        field.surface === "table-cell" && styles.previewTableCell,
        field.surface === "detail" && styles.previewDetail,
      )}
    >
      <AstryxFieldRenderer field={field} handlers={handlers} />
      <AstryxFieldSubmitFormAdapter field={field} />
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

function useFieldMatrixHandlers(
  setDraftValues: React.Dispatch<React.SetStateAction<DraftValues>>,
  setStateMachineValues: React.Dispatch<React.SetStateAction<StateMachineValues>>,
  setActiveStateTransitions: React.Dispatch<React.SetStateAction<ActiveStateTransitions>>,
): AstryxFieldIntentHandlers {
  const handleTransition = useCallback(
    (fieldId: string, transition: AstryxFieldTransitionOperation) => {
      setActiveStateTransitions((currentTransitions) => ({
        ...currentTransitions,
        [fieldId]: transition.id,
      }));

      window.setTimeout(() => {
        setStateMachineValues((currentValues) => ({
          ...currentValues,
          [fieldId]: transition.targetValue,
        }));
        setActiveStateTransitions((currentTransitions) => {
          const nextTransitions = { ...currentTransitions };
          delete nextTransitions[fieldId];
          return nextTransitions;
        });
      }, 720);
    },
    [setActiveStateTransitions, setStateMachineValues],
  );

  return useMemo(
    () => ({
      onDraftChange: (fieldId, value) =>
        setDraftValues((currentValues) => ({
          ...currentValues,
          [fieldId]: value,
        })),
      onTransition: handleTransition,
    }),
    [handleTransition, setDraftValues],
  );
}

function createInitialDraftValues() {
  const values: DraftValues = {};

  for (const group of fieldScenarioGroups) {
    for (const variant of group.variants) {
      if (variant.field.mode === "editor") {
        values[variant.field.id] = variant.field.draftValue;
      }
    }
  }

  return values;
}

function applyRuntimeToField(
  field: AstryxFieldData,
  draftValues: DraftValues,
  stateMachineValues: StateMachineValues,
  activeStateTransitions: ActiveStateTransitions,
): AstryxFieldData {
  let nextField = applyDraftValue(field, draftValues);

  if (nextField.accessMode === "state-machine" && nextField.kind === "enum") {
    nextField = applyStateMachineRuntime(nextField, stateMachineValues, activeStateTransitions);
  }

  return nextField;
}

function applyDraftValue(field: AstryxFieldData, draftValues: DraftValues): AstryxFieldData {
  if (field.mode !== "editor" || !Object.hasOwn(draftValues, field.id)) {
    return field;
  }

  return {
    ...field,
    draftValue: draftValues[field.id],
  };
}

function applyStateMachineRuntime(
  field: AstryxFieldData,
  stateMachineValues: StateMachineValues,
  activeStateTransitions: ActiveStateTransitions,
): AstryxFieldData {
  const fieldValue =
    stateMachineValues[field.id] ??
    String(field.mode === "editor" ? field.draftValue ?? "" : field.value ?? "");
  const activeTransitionId = activeStateTransitions[field.id];
  const projectedTransitions = projectStateTransitions(
    fieldValue,
    field.stateMachine?.transitions ?? [],
    activeTransitionId,
  );
  const projectedStateMachine = {
    ...field.stateMachine,
    transitions: projectedTransitions,
  };
  const pending = activeTransitionId ? { isPending: true, label: "Changing state" } : field.pending;

  if (field.mode === "editor") {
    return {
      ...field,
      draftValue: fieldValue,
      pending,
      stateMachine: projectedStateMachine,
    };
  }

  return {
    ...field,
    value: fieldValue,
    displayValue: displayOption(field.options ?? [], fieldValue),
    pending,
    stateMachine: projectedStateMachine,
  };
}

function projectStateTransitions(
  value: string,
  transitions: readonly AstryxFieldTransitionOperation[],
  activeTransitionId: string | undefined,
) {
  return transitions.map((transition) => {
    const isCurrentState = transition.targetValue === value;

    return {
      ...transition,
      isHidden: transition.isHidden || isCurrentState,
      pending:
        transition.id === activeTransitionId
          ? { isPending: true, label: `${transition.label} running` }
          : transition.pending,
    };
  });
}

function findScenarioGroup(kind: FieldKindKey, surface: AstryxFieldSurface) {
  return fieldScenarioGroups.find((group) => group.kind === kind && group.surface === surface);
}

function requiredScenarioGroup(kind: FieldKindKey, surface: AstryxFieldSurface) {
  const group = findScenarioGroup(kind, surface);

  if (!group) {
    throw new Error(`Missing ${kind} ${surface} field scenario group.`);
  }

  return group;
}

function selectScenarioSurface(kind: FieldKindKey, preferredSurface: AstryxFieldSurface) {
  if (findScenarioGroup(kind, preferredSurface)) {
    return preferredSurface;
  }

  return (
    fieldSurfaceOptions.find((surface) => findScenarioGroup(kind, surface.id))?.id ??
    preferredSurface
  );
}

function hasScenarioForSurface(kind: FieldKindKey, surface: AstryxFieldSurface) {
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

function displayOption(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
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
