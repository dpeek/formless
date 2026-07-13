import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
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
import { fieldKindOptions, fieldScenarioGroups } from "./fields/fixtures.ts";
import { FormlessUiFieldRenderer, FormlessUiFieldSubmitFormAdapter } from "./fields/renderer.tsx";
import {
  applyScenarioFieldIntent,
  applyScenarioFieldSubmit,
  scenarioFieldKey,
} from "./fields/fixture-helpers.ts";
import { closestScenarioVariantForFacet } from "./field-scenario-model.ts";
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
  FormlessUiFieldIntent,
  FormlessUiFieldIntentHandler,
} from "../formless-ui-contract.ts";

type FieldOverrides = Record<string, FormlessUiField>;
type StateTransitionInvokeIntent = Extract<
  FormlessUiFieldIntent,
  { type: "stateTransitionInvoke" }
>;

const stateTransitionSimulationDelayMs = 700;

export function FormlessFieldsLayout() {
  const showToast = useToast();
  const [selectedKind, setSelectedKind] = useState<FieldKindKey>("enum");
  const [selectedFacetValues, setSelectedFacetValues] = useState<FieldScenarioFacetValues>(() =>
    defaultFacetValues(requiredScenarioGroup("enum")),
  );
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const [submittedFieldKeys, setSubmittedFieldKeys] = useState<Set<string>>(() => new Set());

  const selectedKindOption =
    fieldKindOptions.find((option) => option.id === selectedKind) ?? fieldKindOptions[0];
  const selectedGroup = findScenarioGroup(selectedKindOption.id);
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
  const handleIntent = useFieldMatrixIntentHandler(
    selectedVariant,
    setFieldOverrides,
    submittedFieldKeys,
  );
  const handleSubmit = useFieldMatrixSubmitHandler(
    selectedVariant,
    setFieldOverrides,
    setSubmittedFieldKeys,
  );
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
                  const nextGroup = findScenarioGroup(option.id);

                  setSelectedKind(option.id);
                  setSelectedFacetValues(nextGroup ? defaultFacetValues(nextGroup) : {});
                }}
              />
            ))}
          </aside>

          <section {...stylex.props(styles.workbench)} aria-label={selectedKindOption.label}>
            {selectedGroup ? (
              <div {...stylex.props(styles.facetGrid)}>
                {visibleScenarioFacets(selectedGroup, normalizedFacetValues).map((facet) => (
                  <FieldFacetControl
                    key={facet.id}
                    facet={facet}
                    group={selectedGroup}
                    selectedValues={normalizedFacetValues}
                    onChange={(value) => {
                      const nextVariant = closestScenarioVariantForFacet(
                        selectedGroup,
                        normalizedFacetValues,
                        facet.id,
                        value,
                      );

                      if (nextVariant) {
                        resetFieldScenarioState(
                          setFieldOverrides,
                          setSubmittedFieldKeys,
                          nextVariant.field,
                        );
                        setSelectedFacetValues(nextVariant.facets);
                      }
                    }}
                  />
                ))}
              </div>
            ) : null}

            <Card padding={4} variant="muted">
              {selectedField ? (
                <FieldPreview
                  field={selectedField}
                  onIntent={handleIntent}
                  onSubmit={handleSubmit}
                />
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
  onSubmit,
}: {
  field: FormlessUiField;
  onIntent: FormlessUiFieldIntentHandler;
  onSubmit: () => void;
}) {
  const renderer = (
    <>
      <FormlessUiFieldRenderer field={field} onIntent={onIntent} />
      <FormlessUiFieldSubmitFormAdapter field={field} />
    </>
  );

  return (
    <div
      {...stylex.props(
        styles.preview,
        field.surface === "table-cell" && styles.previewTableCell,
        field.surface === "detail" && styles.previewDetail,
      )}
    >
      {field.mode === "editor" && field.commit === "submit" ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <VStack gap={3}>
            {renderer}
            <HStack hAlign="end">
              <Button
                label="Submit"
                type="submit"
                variant="primary"
                isDisabled={Boolean(field.errors?.length)}
              />
            </HStack>
          </VStack>
        </form>
      ) : (
        renderer
      )}
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
  const options = facet.options.filter((option) =>
    facetOptionExistsForSelectedSurface(group, facet.id, option.id, selectedValues),
  );

  if (fieldScenarioFacetIsAction(facet.id)) {
    return (
      <div {...stylex.props(styles.facetControl)}>
        <ButtonGroup label={facet.label} size="md">
          {options.map((option) => {
            const isDisabled = !facetOptionHasScenario(group, facet.id, option.id, selectedValues);

            return (
              <Button
                key={option.id}
                label={option.label}
                variant="secondary"
                isDisabled={isDisabled}
                onClick={() => onChange(option.id)}
              />
            );
          })}
        </ButtonGroup>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.facetControl)}>
      <SegmentedControl
        value={value}
        onChange={onChange}
        label={facet.label}
        layout="hug"
      >
        {options.map((option) => (
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

function fieldScenarioFacetIsAction(facetId: FieldScenarioFacetId) {
  return facetId === "value";
}

function resetFieldScenarioState(
  setFieldOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>,
  setSubmittedFieldKeys: React.Dispatch<React.SetStateAction<Set<string>>>,
  field: FormlessUiField,
) {
  const key = scenarioFieldKey(field);

  setFieldOverrides((currentOverrides) => {
    if (!(key in currentOverrides)) {
      return currentOverrides;
    }

    const nextOverrides = { ...currentOverrides };
    delete nextOverrides[key];
    return nextOverrides;
  });

  setSubmittedFieldKeys((currentKeys) => {
    if (!currentKeys.has(key)) {
      return currentKeys;
    }

    const nextKeys = new Set(currentKeys);
    nextKeys.delete(key);
    return nextKeys;
  });
}

function useFieldMatrixIntentHandler(
  selectedVariant: FieldScenarioVariant | null,
  setFieldOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>,
  submittedFieldKeys: ReadonlySet<string>,
): FormlessUiFieldIntentHandler {
  const transitionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(
    () => () => {
      for (const timer of transitionTimersRef.current.values()) {
        clearTimeout(timer);
      }
      transitionTimersRef.current.clear();
    },
    [],
  );

  return useCallback(
    (intent) => {
      if (!selectedVariant) {
        return;
      }

      const key = scenarioFieldKey(selectedVariant.field);

      if (intent.type === "stateTransitionInvoke") {
        const timerKey = `${key}:${intent.fieldName}:${intent.transitionName}`;
        const existingTimer = transitionTimersRef.current.get(timerKey);

        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        setFieldOverrides((currentOverrides) => {
          const currentField = currentOverrides[key] ?? selectedVariant.field;
          const nextField = applyStateTransitionPending(currentField, intent);

          if (nextField === currentField) {
            return currentOverrides;
          }

          return { ...currentOverrides, [key]: nextField };
        });

        const timer = setTimeout(() => {
          transitionTimersRef.current.delete(timerKey);
          setFieldOverrides((currentOverrides) => {
            const currentField = currentOverrides[key] ?? selectedVariant.field;
            const nextField = clearStateTransitionPending(
              applyScenarioFieldIntent(currentField, intent),
              intent,
            );

            if (nextField === currentField) {
              return currentOverrides;
            }

            return { ...currentOverrides, [key]: nextField };
          });
        }, stateTransitionSimulationDelayMs);

        transitionTimersRef.current.set(timerKey, timer);
        return;
      }

      setFieldOverrides((currentOverrides) => {
        const currentField = currentOverrides[key] ?? selectedVariant.field;
        let nextField = applyScenarioFieldIntent(currentField, intent);

        if (
          intent.type === "operationDraftChange" ||
          (intent.type === "createDraftChange" && submittedFieldKeys.has(key))
        ) {
          nextField = applyScenarioFieldSubmit(nextField);
        }

        if (nextField === currentField) {
          return currentOverrides;
        }

        return { ...currentOverrides, [key]: nextField };
      });
    },
    [selectedVariant, setFieldOverrides, submittedFieldKeys],
  );
}

function useFieldMatrixSubmitHandler(
  selectedVariant: FieldScenarioVariant | null,
  setFieldOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>,
  setSubmittedFieldKeys: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  return useCallback(() => {
    if (!selectedVariant || selectedVariant.field.commit !== "submit") {
      return;
    }

    const key = scenarioFieldKey(selectedVariant.field);

    setSubmittedFieldKeys((currentKeys) => {
      if (currentKeys.has(key)) {
        return currentKeys;
      }

      return new Set([...currentKeys, key]);
    });
    setFieldOverrides((currentOverrides) => {
      const currentField = currentOverrides[key] ?? selectedVariant.field;
      const nextField = applyScenarioFieldSubmit(currentField);

      return nextField === currentField
        ? currentOverrides
        : { ...currentOverrides, [key]: nextField };
    });
  }, [selectedVariant, setFieldOverrides, setSubmittedFieldKeys]);
}

function applyStateTransitionPending(
  field: FormlessUiField,
  intent: StateTransitionInvokeIntent,
): FormlessUiField {
  if (
    field.fieldName !== intent.fieldName ||
    field.stateMachineFacts === undefined ||
    field.pending?.isPending
  ) {
    return field;
  }

  if (field.stateMachineFacts.interaction.kind !== "transitions") {
    return field;
  }

  const transition = field.stateMachineFacts.interaction.transitions.find(
    (candidate) => candidate.transitionName === intent.transitionName,
  );

  if (!transition || transition.availability?.valid === false) {
    return field;
  }

  return {
    ...field,
    pending: { isPending: true, label: `${transition.label}...` },
    stateMachineFacts: {
      ...field.stateMachineFacts,
      interaction: {
        ...field.stateMachineFacts.interaction,
        transitions: field.stateMachineFacts.interaction.transitions.map((candidate) =>
          candidate.transitionName === intent.transitionName
            ? {
                ...candidate,
                pending: { isPending: true, label: "Running" },
              }
            : candidate,
        ),
      },
    },
  };
}

function clearStateTransitionPending(
  field: FormlessUiField,
  intent: StateTransitionInvokeIntent,
): FormlessUiField {
  if (field.fieldName !== intent.fieldName || field.stateMachineFacts === undefined) {
    return field;
  }

  if (field.stateMachineFacts.interaction.kind !== "transitions") {
    return { ...field, pending: undefined };
  }

  return {
    ...field,
    pending: undefined,
    stateMachineFacts: {
      ...field.stateMachineFacts,
      interaction: {
        ...field.stateMachineFacts.interaction,
        transitions: field.stateMachineFacts.interaction.transitions.map((candidate) =>
          candidate.transitionName === intent.transitionName
            ? {
                ...candidate,
                pending: undefined,
              }
            : candidate,
        ),
      },
    },
  };
}

function findScenarioGroup(kind: FieldKindKey) {
  return fieldScenarioGroups.find((group) => group.kind === kind);
}

function requiredScenarioGroup(kind: FieldKindKey) {
  const group = findScenarioGroup(kind);

  if (!group) {
    throw new Error(`Missing ${kind} field scenario group.`);
  }

  return group;
}

function defaultFacetValues(group: FieldScenarioGroup): FieldScenarioFacetValues {
  return normalizeFacetValues(group, group.variants[0]?.facets ?? {});
}

function normalizeFacetValues(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): FieldScenarioFacetValues {
  const nextValues: FieldScenarioFacetValues = {};
  const surfaceFacet = group.facets.find((facet) => facet.id === "surface");

  if (surfaceFacet) {
    const selectedSurface = values.surface;
    const surfaceIsAvailable = surfaceFacet.options.some((option) => option.id === selectedSurface);

    nextValues.surface =
      selectedSurface && surfaceIsAvailable
        ? selectedSurface
        : group.variants[0]?.facets.surface ?? surfaceFacet.options[0]?.id;
  }

  for (const facet of activeScenarioFacets(group, nextValues)) {
    const selectedValue = values[facet.id];
    const selectedOption =
      selectedValue && facet.options.some((option) => option.id === selectedValue)
        ? selectedValue
        : undefined;

    nextValues[facet.id] =
      selectedOption ?? group.variants[0]?.facets[facet.id] ?? facet.options[0]?.id;
  }

  if (scenarioVariantExists(group, nextValues)) {
    return nextValues;
  }

  const fallbackVariant =
    group.variants.find((variant) => variant.facets.surface === nextValues.surface) ??
    group.variants[0];

  return fallbackVariant ? normalizeFacetValues(group, fallbackVariant.facets) : nextValues;
}

function findScenarioVariant(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): FieldScenarioVariant | null {
  const activeFacets = activeScenarioFacets(group, values);

  return (
    group.variants.find((variant) =>
      activeFacets.every((facet) => variant.facets[facet.id] === values[facet.id]),
    ) ??
    group.variants.find((variant) => variant.facets.surface === values.surface) ??
    group.variants[0] ??
    null
  );
}

function activeScenarioFacets(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): readonly FieldScenarioFacet[] {
  const selectedSurface = values.surface ?? group.variants[0]?.facets.surface;

  return group.facets.filter(
    (facet) =>
      facet.id === "surface" ||
      group.variants.some(
        (variant) =>
          variant.facets.surface === selectedSurface && variant.facets[facet.id] !== undefined,
      ),
  );
}

function visibleScenarioFacets(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): readonly FieldScenarioFacet[] {
  return activeScenarioFacets(group, values).filter(
    (facet) =>
      group.kind !== "enum" ||
      values.presentation !== "plain" ||
      (facet.id !== "trigger" && facet.id !== "list"),
  );
}

function facetOptionHasScenario(
  group: FieldScenarioGroup,
  facetId: FieldScenarioFacetId,
  optionId: string,
  selectedValues: FieldScenarioFacetValues,
) {
  return closestScenarioVariantForFacet(group, selectedValues, facetId, optionId) !== undefined;
}

function facetOptionExistsForSelectedSurface(
  group: FieldScenarioGroup,
  facetId: FieldScenarioFacetId,
  optionId: string,
  selectedValues: FieldScenarioFacetValues,
) {
  if (facetId === "surface") {
    return group.variants.some(
      (variant) => (variant.facets.surface ?? group.surface) === optionId,
    );
  }

  const selectedSurface = selectedValues.surface ?? group.surface;

  return group.variants.some(
    (variant) =>
      (variant.facets.surface ?? group.surface) === selectedSurface &&
      variant.facets[facetId] === optionId,
  );
}

function scenarioVariantExists(group: FieldScenarioGroup, values: FieldScenarioFacetValues) {
  const activeFacets = activeScenarioFacets(group, values);

  return group.variants.some((variant) =>
    activeFacets.every((facet) => variant.facets[facet.id] === values[facet.id]),
  );
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
