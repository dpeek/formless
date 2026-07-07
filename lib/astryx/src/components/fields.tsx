import { useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { colorVars, fontWeightVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { AstryxFieldRenderer, AstryxFieldSubmitFormAdapter } from "./field-renderer.tsx";
import type {
  AstryxFieldData,
  AstryxFieldEditorData,
  AstryxFieldIntentHandlers,
  AstryxFieldValue,
} from "../field-contract.ts";

type FieldGroup = {
  id: string;
  title: string;
  fields: readonly AstryxFieldData[];
};

type DraftValues = Record<string, AstryxFieldValue>;

export function FormlessFieldsLayout() {
  const [draftValues, setDraftValues] = useState(createInitialDraftValues);
  const groups = useMemo(() => applyDraftValues(fieldGroups, draftValues), [draftValues]);
  const handlers = useMemo<AstryxFieldIntentHandlers>(
    () => ({
      onDraftChange: (fieldId, value) =>
        setDraftValues((currentValues) => ({
          ...currentValues,
          [fieldId]: value,
        })),
      onRevert: (fieldId) =>
        setDraftValues((currentValues) => {
          const sourceField = findFieldById(fieldGroups, fieldId);

          if (!sourceField || sourceField.mode !== "editor") {
            return currentValues;
          }

          return {
            ...currentValues,
            [fieldId]: sourceField.committedValue ?? sourceField.draftValue,
          };
        }),
    }),
    [],
  );

  return (
    <VStack gap={6} width="100%">
      <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
        <VStack gap={1}>
          <Heading level={1}>Fields</Heading>
        </VStack>
      </HStack>
      <Grid columns={{ minWidth: 300, max: 2 }} gap={4} width="100%">
        {groups.map((group) => (
          <FieldGroupCard key={group.id} group={group} handlers={handlers} />
        ))}
      </Grid>
    </VStack>
  );
}

function FieldGroupCard({
  group,
  handlers,
}: {
  group: FieldGroup;
  handlers: AstryxFieldIntentHandlers;
}) {
  return (
    <Card padding={4}>
      <VStack gap={4}>
        <Heading level={2}>{group.title}</Heading>
        <VStack gap={3}>
          {group.fields.map((field) => (
            <FieldExample key={field.id} field={field} handlers={handlers} />
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

function FieldExample({
  field,
  handlers,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
}) {
  return (
    <VStack gap={2}>
      <AstryxFieldRenderer field={field} handlers={handlers} />
      <AstryxFieldSubmitFormAdapter field={field} />
      <FieldMeta field={field} handlers={handlers} />
    </VStack>
  );
}

function FieldMeta({
  field,
  handlers,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
}) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Text type="supporting" color="secondary">
        {formatSurface(field.surface)}
      </Text>
      <Text type="supporting" color="secondary">
        {formatAccessMode(field.accessMode)}
      </Text>
      {field.mode === "editor" ? (
        <Text type="supporting" color="secondary">
          {formatCommitPolicy(field.commitPolicy)}
        </Text>
      ) : null}
      {field.pending?.isPending ? (
        <span role="status" {...stylex.props(styles.pendingState)}>
          <Spinner size="sm" shade="inherit" />
          <Text type="supporting" color="secondary">
            {field.pending.label ?? "Pending"}
          </Text>
        </span>
      ) : null}
      {field.mode === "editor" && field.commitPolicy === "field" ? (
        <Button
          label="Revert"
          variant="secondary"
          isDisabled={field.pending?.isPending}
          onClick={() => handlers.onRevert?.(field.id)}
        />
      ) : null}
    </HStack>
  );
}

function createInitialDraftValues() {
  const values: DraftValues = {};

  for (const group of fieldGroups) {
    for (const field of group.fields) {
      if (field.mode === "editor") {
        values[field.id] = field.draftValue;
      }
    }
  }

  return values;
}

function applyDraftValues(groups: readonly FieldGroup[], draftValues: DraftValues) {
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) =>
      field.mode === "editor" && Object.hasOwn(draftValues, field.id)
        ? { ...field, draftValue: draftValues[field.id] }
        : field,
    ),
  }));
}

function findFieldById(groups: readonly FieldGroup[], fieldId: string) {
  for (const group of groups) {
    const field = group.fields.find((candidate) => candidate.id === fieldId);

    if (field) {
      return field;
    }
  }

  return null;
}

function formatSurface(surface: AstryxFieldData["surface"]) {
  return surface
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAccessMode(accessMode: AstryxFieldData["accessMode"]) {
  if (accessMode === "read-only") {
    return "Read only";
  }

  if (accessMode === "state-machine") {
    return "State machine";
  }

  return accessMode.charAt(0).toUpperCase() + accessMode.slice(1);
}

function formatCommitPolicy(commitPolicy: AstryxFieldEditorData["commitPolicy"]) {
  if (commitPolicy === "field") {
    return "Field commit";
  }

  return commitPolicy.charAt(0).toUpperCase() + commitPolicy.slice(1);
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
];

const statusOptions = [
  { value: "open", label: "Open", color: "#2563eb" },
  { value: "waiting", label: "Waiting", color: "#d97706" },
  { value: "done", label: "Done", color: "#16a34a" },
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

const fieldGroups: readonly FieldGroup[] = [
  {
    id: "create",
    title: "Create",
    fields: [
      {
        id: "create-title",
        name: "title",
        label: "Task",
        description: "Form fields can use the full Astryx field chrome.",
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
      {
        id: "create-owner",
        name: "ownerId",
        label: "Owner",
        description: "References use Selector with generated options.",
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
      {
        id: "create-brief",
        name: "brief",
        label: "Brief",
        description: "Markdown is a thin wrapper around Astryx TextArea.",
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
    ],
  },
  {
    id: "record",
    title: "Record",
    fields: [
      {
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
      {
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
      {
        id: "record-accent",
        name: "accent",
        label: "Accent",
        labelTooltip: "Stored values can include alpha hex or runtime color tokens.",
        surface: "record",
        density: "balanced",
        accessMode: "editable",
        kind: "color",
        mode: "editor",
        draftValue: "#2563EB80",
        committedValue: "#2563EB80",
        committedDisplayValue: "#2563EB80",
        commitPolicy: "field",
        presentation: { placeholder: "#RRGGBB or stored text" },
      },
    ],
  },
  {
    id: "table-cell",
    title: "Table Cell",
    fields: [
      {
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
      {
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
      {
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
    ],
  },
  {
    id: "detail",
    title: "Detail",
    fields: [
      {
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
      {
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
      {
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
      {
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
      {
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
      {
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
    ],
  },
  {
    id: "read-only",
    title: "Read Only",
    fields: [
      {
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
    ],
  },
  {
    id: "system",
    title: "System",
    fields: [
      {
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
      {
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
    ],
  },
  {
    id: "state-machine",
    title: "State Machine",
    fields: [
      {
        id: "state-status",
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
      },
    ],
  },
  {
    id: "pending",
    title: "Pending",
    fields: [
      {
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
    ],
  },
  {
    id: "error",
    title: "Error",
    fields: [
      {
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
    ],
  },
];

const styles = stylex.create({
  pendingState: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1"],
    color: colorVars["--color-text-secondary"],
    fontWeight: fontWeightVars["--font-weight-medium"],
  },
});
