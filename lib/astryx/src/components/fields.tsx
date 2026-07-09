import { useCallback, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { AstryxFieldRenderer, AstryxFieldSubmitFormAdapter } from "./field-renderer.tsx";
import type {
  AstryxFieldData,
  AstryxFieldIntentHandlers,
  AstryxFieldKind,
  AstryxFieldOption,
  AstryxFieldSurface,
  AstryxFieldTransitionOperation,
  AstryxFieldValue,
} from "../field-contract.ts";

type FieldKindKey = AstryxFieldKind | "state-machine-enum";

type FieldKindOption = {
  id: FieldKindKey;
  label: string;
};

type FieldScenarioGroup = {
  id: string;
  kind: FieldKindKey;
  surface: AstryxFieldSurface;
  variants: readonly FieldScenarioVariant[];
};

type FieldScenarioVariant = {
  id: string;
  label: string;
  field: AstryxFieldData;
};

type DraftValues = Record<string, AstryxFieldValue>;
type StateMachineValues = Record<string, string>;
type ActiveStateTransitions = Record<string, string>;

export function FormlessFieldsLayout() {
  const [selectedKind, setSelectedKind] = useState<FieldKindKey>("state-machine-enum");
  const [selectedSurface, setSelectedSurface] = useState<AstryxFieldSurface>("record");
  const [selectedVariantId, setSelectedVariantId] = useState("default");
  const [draftValues, setDraftValues] = useState(createInitialDraftValues);
  const [stateMachineValues, setStateMachineValues] = useState<StateMachineValues>({});
  const [activeStateTransitions, setActiveStateTransitions] = useState<ActiveStateTransitions>({});

  const selectedKindOption =
    fieldKindOptions.find((option) => option.id === selectedKind) ?? fieldKindOptions[0];
  const selectedGroup = findScenarioGroup(selectedKindOption.id, selectedSurface);
  const selectedVariant =
    selectedGroup?.variants.find((variant) => variant.id === selectedVariantId) ??
    selectedGroup?.variants[0] ??
    null;
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

  return (
    <main {...stylex.props(styles.screen)}>
      <div {...stylex.props(styles.content)}>
        <header {...stylex.props(styles.header)}>
          <VStack gap={1}>
            <Heading level={1}>Field Matrix</Heading>
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
                  setSelectedKind(option.id);
                  setSelectedVariantId("default");
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

            <TabList
              value={selectedSurface}
              onChange={(value) => setSelectedSurface(value as AstryxFieldSurface)}
              hasDivider
            >
              {fieldSurfaceOptions.map((surface) => (
                <Tab
                  key={surface.id}
                  value={surface.id}
                  label={surface.label}
                  endContent={
                    hasScenarioForSurface(selectedKindOption.id, surface.id) ? (
                      <span aria-hidden {...stylex.props(styles.surfaceMarker)} />
                    ) : null
                  }
                />
              ))}
            </TabList>

            {selectedGroup ? (
              <HStack gap={2} wrap="wrap">
                {selectedGroup.variants.map((variant) => (
                  <Button
                    key={variant.id}
                    label={variant.label}
                    size="sm"
                    variant={variant.id === selectedVariant?.id ? "primary" : "secondary"}
                    onClick={() => setSelectedVariantId(variant.id)}
                  />
                ))}
              </HStack>
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
  const primaryTransitionId = primaryStateTransitionId(value);

  return transitions.map((transition) => {
    const isCurrentState = transition.targetValue === value;

    return {
      ...transition,
      isPrimary: transition.id === primaryTransitionId,
      isDisabled: transition.isDisabled || isCurrentState,
      disabledReason: isCurrentState ? "Already in this state." : transition.disabledReason,
      pending:
        transition.id === activeTransitionId
          ? { isPending: true, label: `${transition.label} running` }
          : transition.pending,
    };
  });
}

function primaryStateTransitionId(value: string) {
  if (value === "done") {
    return "reopen";
  }

  if (value === "open" || value === "blocked") {
    return "send-waiting";
  }

  return "complete";
}

function findScenarioGroup(kind: FieldKindKey, surface: AstryxFieldSurface) {
  return fieldScenarioGroups.find((group) => group.kind === kind && group.surface === surface);
}

function hasScenarioForSurface(kind: FieldKindKey, surface: AstryxFieldSurface) {
  return Boolean(findScenarioGroup(kind, surface));
}

function countScenariosForKind(kind: FieldKindKey) {
  return fieldScenarioGroups
    .filter((group) => group.kind === kind)
    .reduce((count, group) => count + group.variants.length, 0);
}

function displayOption(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

const ownerOptions = [
  { value: "principal-dana", label: "Dana Peek", detail: "Product" },
  { value: "principal-jordan", label: "Jordan Lee", detail: "Design" },
  {
    value: "principal-missing",
    label: "principal-missing",
    detail: "Stored reference",
    isMissing: true,
  },
] satisfies readonly AstryxFieldOption[];

const statusOptions = [
  { value: "open", label: "Open", color: "#2563eb" },
  { value: "waiting", label: "Waiting", color: "#d97706" },
  { value: "blocked", label: "Blocked", color: "#dc2626" },
  { value: "done", label: "Done", color: "#16a34a" },
] satisfies readonly AstryxFieldOption[];

const mediaPreviewUrls = {
  homepagePreview: "https://picsum.photos/seed/formless-homepage-preview/960/540",
  homepageHero: "https://picsum.photos/seed/formless-homepage-hero/1280/720",
  productDetail: "https://picsum.photos/seed/formless-product-detail/960/540",
};

const imageOptions = [
  {
    value: "image-homepage-preview",
    label: "Homepage",
    detail: "Public sample",
    mediaAlt: "Homepage preview",
    mediaPreviewUrl: mediaPreviewUrls.homepagePreview,
  },
  {
    value: "image-product-detail",
    label: "Detail",
    detail: "Public sample",
    mediaAlt: "Product detail preview",
    mediaPreviewUrl: mediaPreviewUrls.productDetail,
  },
] satisfies readonly AstryxFieldOption[];

const mediaOptions = [
  {
    value: "media-homepage-hero",
    label: "Hero",
    detail: "Public sample",
    mediaAlt: "Homepage hero",
    mediaPreviewUrl: mediaPreviewUrls.homepageHero,
  },
  ...imageOptions,
] satisfies readonly AstryxFieldOption[];

const stateTransitions: readonly AstryxFieldTransitionOperation[] = [
  {
    id: "complete",
    label: "Complete",
    operationKey: "tasks.complete",
    targetValue: "done",
    visualIntent: "primary",
  },
  {
    id: "send-waiting",
    label: "Send to waiting",
    operationKey: "tasks.sendToWaiting",
    targetValue: "waiting",
    visualIntent: "secondary",
  },
  {
    id: "reopen",
    label: "Reopen",
    operationKey: "tasks.reopen",
    targetValue: "open",
    visualIntent: "secondary",
  },
  {
    id: "block",
    label: "Block",
    operationKey: "tasks.block",
    targetValue: "blocked",
    visualIntent: "secondary",
  },
];

const publishedPageIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M4.75 19.25h14.5" />',
  '<path d="M6.75 19.25V5.75a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v13.5" />',
  '<path d="M9.25 8.75h5.5" />',
  '<path d="M9.25 12h5.5" />',
  '<path d="M9.25 15.25h2.5" />',
  "</svg>",
].join("");

const fieldSurfaceOptions = [
  { id: "create", label: "Create" },
  { id: "record", label: "Record" },
  { id: "table-cell", label: "Table Cell" },
  { id: "detail", label: "Detail" },
  { id: "public-action", label: "Public Action" },
  { id: "site-authoring", label: "Site Authoring" },
] satisfies readonly { id: AstryxFieldSurface; label: string }[];

const fieldKindOptions = [
  { id: "state-machine-enum", label: "State Machine Enum" },
  { id: "enum", label: "Enum" },
  { id: "reference", label: "Reference" },
  { id: "text", label: "Text" },
  { id: "long-text", label: "Long Text" },
  { id: "markdown", label: "Markdown" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "color", label: "Color" },
  { id: "source-icon", label: "Source Icon" },
  { id: "image", label: "Image" },
  { id: "media", label: "Media" },
] satisfies readonly FieldKindOption[];

const fieldScenarioGroups = [
  {
    id: "state-machine-record",
    kind: "state-machine-enum",
    surface: "record",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "state-status-record",
          name: "status",
          label: "Status",
          surface: "record",
          density: "balanced",
          accessMode: "state-machine",
          kind: "enum",
          mode: "display",
          value: "waiting",
          displayValue: "Waiting",
          options: statusOptions,
          stateMachine: {
            transitions: stateTransitions,
            facts: [
              {
                id: "owned-status",
                kind: "owned",
                label: "status",
                value: "task workflow",
              },
              {
                id: "hidden-completed-at",
                kind: "hidden",
                label: "completedAt",
                value: "set by Complete",
              },
              {
                id: "derived-can-transition",
                kind: "derived",
                label: "can transition",
                value: "true",
              },
            ],
          },
        },
      },
      {
        id: "pending",
        label: "Pending",
        field: {
          id: "state-status-pending",
          name: "status",
          label: "Status",
          surface: "record",
          density: "balanced",
          accessMode: "state-machine",
          kind: "enum",
          mode: "display",
          value: "waiting",
          displayValue: "Waiting",
          options: statusOptions,
          pending: { isPending: true, label: "Completing task" },
          stateMachine: {
            transitions: stateTransitions.map((transition) =>
              transition.id === "complete"
                ? { ...transition, isPrimary: true, pending: { isPending: true, label: "Running" } }
                : transition,
            ),
          },
        },
      },
      {
        id: "error",
        label: "Error",
        field: {
          id: "state-status-error",
          name: "status",
          label: "Status",
          surface: "record",
          density: "balanced",
          accessMode: "state-machine",
          kind: "enum",
          mode: "display",
          value: "blocked",
          displayValue: "Blocked",
          options: statusOptions,
          errors: [{ id: "transition-rejected", message: "Transition rejected by workflow." }],
          stateMachine: {
            transitions: stateTransitions,
            facts: [
              {
                id: "owned-blocked-reason",
                kind: "owned",
                label: "blockedReason",
                value: "required",
              },
            ],
          },
        },
      },
      {
        id: "unknown",
        label: "Unknown",
        field: {
          id: "state-status-unknown",
          name: "status",
          label: "Status",
          surface: "record",
          density: "balanced",
          accessMode: "state-machine",
          kind: "enum",
          mode: "display",
          value: "paused",
          displayValue: "paused",
          options: statusOptions,
          stateMachine: {
            stateLabel: "paused",
            transitions: stateTransitions,
          },
        },
      },
    ],
  },
  {
    id: "state-machine-table-cell",
    kind: "state-machine-enum",
    surface: "table-cell",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "state-status-cell",
          name: "status",
          label: "Status",
          surface: "table-cell",
          density: "compact",
          accessMode: "state-machine",
          kind: "enum",
          mode: "display",
          value: "open",
          displayValue: "Open",
          options: statusOptions,
          stateMachine: {
            transitions: stateTransitions,
          },
        },
      },
      {
        id: "error",
        label: "Error",
        field: {
          id: "state-status-cell-error",
          name: "status",
          label: "Status",
          surface: "table-cell",
          density: "compact",
          accessMode: "state-machine",
          kind: "enum",
          mode: "display",
          value: "blocked",
          displayValue: "Blocked",
          options: statusOptions,
          errors: [{ id: "transition-rejected", message: "Transition rejected by workflow." }],
          stateMachine: {
            transitions: stateTransitions,
          },
        },
      },
    ],
  },
  {
    id: "enum-record",
    kind: "enum",
    surface: "record",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "record-status",
          name: "status",
          label: "Status",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "enum",
          mode: "editor",
          draftValue: "waiting",
          committedValue: "waiting",
          committedDisplayValue: "Waiting",
          commitPolicy: "immediate",
          options: statusOptions,
        },
      },
      {
        id: "unknown",
        label: "Unknown",
        field: {
          id: "record-status-unknown",
          name: "status",
          label: "Status",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "enum",
          mode: "editor",
          draftValue: "paused",
          committedValue: "paused",
          committedDisplayValue: "paused",
          commitPolicy: "immediate",
          options: [...statusOptions, { value: "paused", label: "paused", isMissing: true }],
        },
      },
    ],
  },
  {
    id: "enum-table-cell",
    kind: "enum",
    surface: "table-cell",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "cell-status",
          name: "status",
          label: "Status",
          surface: "table-cell",
          density: "compact",
          accessMode: "editable",
          kind: "enum",
          mode: "editor",
          draftValue: "waiting",
          committedValue: "waiting",
          committedDisplayValue: "Waiting",
          commitPolicy: "immediate",
          options: statusOptions,
        },
      },
    ],
  },
  {
    id: "reference-create",
    kind: "reference",
    surface: "create",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "create-owner",
          name: "ownerId",
          label: "Owner",
          isRequired: true,
          surface: "create",
          density: "balanced",
          accessMode: "editable",
          kind: "reference",
          mode: "editor",
          draftValue: "principal-dana",
          committedDisplayValue: "",
          commitPolicy: "submit",
          options: ownerOptions,
        },
      },
    ],
  },
  {
    id: "reference-record",
    kind: "reference",
    surface: "record",
    variants: [
      {
        id: "missing",
        label: "Missing",
        field: {
          id: "readonly-owner",
          name: "ownerId",
          label: "Owner",
          surface: "record",
          density: "balanced",
          accessMode: "read-only",
          kind: "reference",
          mode: "display",
          value: "principal-missing",
          displayValue: "principal-missing",
          options: ownerOptions,
        },
      },
    ],
  },
  {
    id: "text-create",
    kind: "text",
    surface: "create",
    variants: [
      {
        id: "required",
        label: "Required",
        field: {
          id: "create-title",
          name: "title",
          label: "Task",
          isRequired: true,
          surface: "create",
          density: "balanced",
          accessMode: "editable",
          kind: "text",
          mode: "editor",
          draftValue: "Prepare launch checklist",
          committedDisplayValue: "",
          commitPolicy: "submit",
          presentation: { placeholder: "Task name" },
        },
      },
    ],
  },
  {
    id: "text-record",
    kind: "text",
    surface: "record",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "record-title",
          name: "title",
          label: "Task",
          isRequired: true,
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "text",
          mode: "editor",
          draftValue: "Review route changes",
          committedValue: "Review route changes",
          committedDisplayValue: "Review route changes",
          commitPolicy: "field",
        },
      },
      {
        id: "pending",
        label: "Pending",
        field: {
          id: "pending-title",
          name: "title",
          label: "Task",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "text",
          mode: "editor",
          draftValue: "Publish homepage edits",
          committedValue: "Publish homepage edits",
          committedDisplayValue: "Publish homepage edits",
          commitPolicy: "field",
          pending: { isPending: true, label: "Saving" },
        },
      },
    ],
  },
  {
    id: "text-detail",
    kind: "text",
    surface: "detail",
    variants: [
      {
        id: "system",
        label: "System",
        field: {
          id: "system-id",
          name: "id",
          label: "Record ID",
          surface: "detail",
          density: "compact",
          accessMode: "system",
          kind: "text",
          mode: "display",
          value: "task-launch",
          displayValue: "task-launch",
        },
      },
    ],
  },
  {
    id: "long-text-detail",
    kind: "long-text",
    surface: "detail",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "detail-summary",
          name: "summary",
          label: "Summary",
          surface: "detail",
          density: "comfortable",
          accessMode: "read-only",
          kind: "long-text",
          mode: "display",
          value: "Block placement review before publish.",
          displayValue: "Block placement review before publish.",
          presentation: { maxLines: 3 },
        },
      },
    ],
  },
  {
    id: "markdown-create",
    kind: "markdown",
    surface: "create",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "create-brief",
          name: "brief",
          label: "Brief",
          surface: "create",
          density: "balanced",
          accessMode: "editable",
          kind: "markdown",
          mode: "editor",
          draftValue: "## Launch scope\n\n- Confirm owner\n- Publish public page",
          committedDisplayValue: "",
          commitPolicy: "submit",
          presentation: { placeholder: "Write markdown" },
        },
      },
    ],
  },
  {
    id: "markdown-detail",
    kind: "markdown",
    surface: "detail",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "detail-markdown",
          name: "notes",
          label: "Notes",
          surface: "detail",
          density: "comfortable",
          accessMode: "read-only",
          kind: "markdown",
          mode: "display",
          value:
            "### Publish note\n\nReview **routes** and [preview](https://example.com) before release.",
          displayValue:
            "### Publish note\n\nReview **routes** and [preview](https://example.com) before release.",
        },
      },
    ],
  },
  {
    id: "number-record",
    kind: "number",
    surface: "record",
    variants: [
      {
        id: "plain",
        label: "Plain",
        field: {
          id: "record-estimate",
          name: "estimateHours",
          label: "Estimate",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "number",
          mode: "editor",
          draftValue: 6,
          committedValue: 6,
          committedDisplayValue: "6",
          commitPolicy: "field",
          presentation: { placeholder: "Hours" },
        },
      },
      {
        id: "invalid-draft",
        label: "Invalid Draft",
        field: {
          id: "record-estimate-invalid",
          name: "estimateHours",
          label: "Estimate",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "number",
          mode: "editor",
          draftValue: "6..",
          committedValue: 6,
          committedDisplayValue: "6",
          commitPolicy: "field",
          errors: [{ id: "estimate-invalid", message: "Enter a number." }],
        },
      },
    ],
  },
  {
    id: "date-record",
    kind: "date",
    surface: "record",
    variants: [
      {
        id: "error",
        label: "Error",
        field: {
          id: "error-date",
          name: "dueDate",
          label: "Due",
          isRequired: true,
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "date",
          mode: "editor",
          draftValue: "",
          committedValue: null,
          committedDisplayValue: "",
          commitPolicy: "field",
          errors: [{ id: "due-required", message: "Choose a due date." }],
        },
      },
    ],
  },
  {
    id: "date-table-cell",
    kind: "date",
    surface: "table-cell",
    variants: [
      {
        id: "readonly",
        label: "Read Only",
        field: {
          id: "cell-due",
          name: "dueDate",
          label: "Due",
          surface: "table-cell",
          density: "compact",
          accessMode: "read-only",
          kind: "date",
          mode: "display",
          value: "2026-07-08",
          displayValue: "Jul 8",
        },
      },
    ],
  },
  {
    id: "date-detail",
    kind: "date",
    surface: "detail",
    variants: [
      {
        id: "system",
        label: "System",
        field: {
          id: "system-updated",
          name: "updatedAt",
          label: "Updated",
          surface: "detail",
          density: "compact",
          accessMode: "system",
          kind: "date",
          mode: "display",
          value: "2026-07-06T09:30:00.000Z",
          displayValue: "Jul 6, 2026 9:30 AM",
        },
      },
    ],
  },
  {
    id: "boolean-record",
    kind: "boolean",
    surface: "record",
    variants: [
      {
        id: "default",
        label: "Default",
        field: {
          id: "record-completed",
          name: "completed",
          label: "Completed",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "boolean",
          mode: "editor",
          draftValue: false,
          committedValue: false,
          committedDisplayValue: "No",
          commitPolicy: "immediate",
        },
      },
    ],
  },
  {
    id: "boolean-public-action",
    kind: "boolean",
    surface: "public-action",
    variants: [
      {
        id: "subscribe",
        label: "Subscribe",
        field: {
          id: "public-action-subscribe",
          name: "subscribe",
          label: "Subscribe",
          surface: "public-action",
          density: "balanced",
          accessMode: "editable",
          kind: "boolean",
          mode: "editor",
          draftValue: true,
          committedDisplayValue: "",
          commitPolicy: "submit",
        },
      },
    ],
  },
  {
    id: "color-record",
    kind: "color",
    surface: "record",
    variants: [
      {
        id: "hex",
        label: "Hex",
        field: {
          id: "record-accent",
          name: "accent",
          label: "Accent",
          labelTooltip: "Stored values use opaque hex colors.",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "color",
          mode: "editor",
          draftValue: "#2563eb",
          committedValue: "#2563eb",
          committedDisplayValue: "#2563eb",
          commitPolicy: "field",
        },
      },
    ],
  },
  {
    id: "color-table-cell",
    kind: "color",
    surface: "table-cell",
    variants: [
      {
        id: "compact",
        label: "Compact",
        field: {
          id: "cell-accent",
          name: "accent",
          label: "Accent",
          surface: "table-cell",
          density: "compact",
          accessMode: "editable",
          kind: "color",
          mode: "editor",
          draftValue: "#38bdf8",
          committedValue: "#38bdf8",
          committedDisplayValue: "#38bdf8",
          commitPolicy: "immediate",
        },
      },
    ],
  },
  {
    id: "color-detail",
    kind: "color",
    surface: "detail",
    variants: [
      {
        id: "hex",
        label: "Hex",
        field: {
          id: "detail-color",
          name: "accent",
          label: "Accent",
          surface: "detail",
          density: "balanced",
          accessMode: "read-only",
          kind: "color",
          mode: "display",
          value: "#2563eb",
          displayValue: "#2563eb",
        },
      },
      {
        id: "token",
        label: "Token",
        field: {
          id: "detail-color-token",
          name: "themeAccent",
          label: "Theme Accent",
          surface: "detail",
          density: "compact",
          accessMode: "read-only",
          kind: "color",
          mode: "display",
          value: "var(--site-accent)",
          displayValue: "var(--site-accent)",
        },
      },
    ],
  },
  {
    id: "source-icon-detail",
    kind: "source-icon",
    surface: "detail",
    variants: [
      {
        id: "source",
        label: "Source",
        field: {
          id: "detail-page-icon",
          name: "pageIcon",
          label: "Page Icon",
          surface: "detail",
          density: "balanced",
          accessMode: "read-only",
          kind: "source-icon",
          mode: "display",
          value: "published-page",
          displayValue: "Published page",
          presentation: { sourceIcon: publishedPageIconSource },
        },
      },
      {
        id: "empty",
        label: "Empty",
        field: {
          id: "detail-empty-icon",
          name: "emptyIcon",
          label: "Empty Icon",
          surface: "detail",
          density: "compact",
          accessMode: "read-only",
          kind: "source-icon",
          mode: "display",
          value: "",
          displayValue: "Empty source",
          presentation: { sourceIcon: "" },
        },
      },
    ],
  },
  {
    id: "image-create",
    kind: "image",
    surface: "create",
    variants: [
      {
        id: "asset",
        label: "Asset",
        field: {
          id: "create-image",
          name: "heroImageId",
          label: "Hero Image",
          surface: "create",
          density: "balanced",
          accessMode: "editable",
          kind: "image",
          mode: "editor",
          draftValue: "image-homepage-preview",
          committedDisplayValue: "",
          commitPolicy: "submit",
          presentation: {
            accept: "image/*",
            mediaAlt: "Homepage preview",
            mediaPreviewUrl: mediaPreviewUrls.homepagePreview,
          },
          options: imageOptions,
        },
      },
      {
        id: "pending",
        label: "Pending",
        field: {
          id: "create-image-pending",
          name: "heroImageId",
          label: "Hero Image",
          surface: "create",
          density: "balanced",
          accessMode: "editable",
          kind: "image",
          mode: "editor",
          draftValue: "image-homepage-preview",
          committedDisplayValue: "",
          commitPolicy: "submit",
          presentation: {
            accept: "image/*",
            mediaAlt: "Homepage preview",
            mediaPreviewUrl: mediaPreviewUrls.homepagePreview,
          },
          pending: { isPending: true, label: "Uploading" },
          options: imageOptions,
        },
      },
    ],
  },
  {
    id: "media-record",
    kind: "media",
    surface: "record",
    variants: [
      {
        id: "asset",
        label: "Asset",
        field: {
          id: "record-media",
          name: "heroMediaId",
          label: "Hero Media",
          surface: "record",
          density: "balanced",
          accessMode: "editable",
          kind: "media",
          mode: "editor",
          draftValue: "media-homepage-hero",
          committedValue: "media-homepage-hero",
          committedDisplayValue: "media-homepage-hero",
          commitPolicy: "field",
          presentation: {
            accept: "image/*",
            mediaAlt: "Homepage hero",
            mediaPreviewUrl: mediaPreviewUrls.homepageHero,
          },
          options: mediaOptions,
        },
      },
    ],
  },
] satisfies readonly FieldScenarioGroup[];

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
  surfaceMarker: {
    display: "inline-block",
    width: spacingVars["--spacing-1"],
    height: spacingVars["--spacing-1"],
    borderRadius: radiusVars["--radius-full"],
    backgroundColor: colorVars["--color-accent"],
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
