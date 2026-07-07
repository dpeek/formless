import { useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { AstryxFieldRenderer, AstryxFieldSubmitFormAdapter } from "./field-renderer.tsx";
import type {
  AstryxFieldData,
  AstryxFieldDisplayData,
  AstryxFieldEditorData,
  AstryxFieldError,
  AstryxFieldIntentHandlers,
  AstryxFieldOption,
  AstryxFieldValue,
} from "../field-contract.ts";

type GeneratedRecordValues = {
  accent: string;
  completed: boolean;
  estimateHours: number | string;
  heroImageId: string;
  heroMediaId: string;
  notes: string;
  ownerId: string;
  pageIcon: string;
  summary: string;
  status: string;
  title: string;
};

type GeneratedCreateValues = {
  accent: string;
  estimateHours: number | string;
  heroImageId: string;
  ownerId: string;
  summary: string;
  title: string;
};

type GeneratedPublicActionValues = {
  audienceId: string;
  contactEmail: string;
  contactName: string;
  message: string;
  subscribe: boolean;
};

type FieldErrorMap<TValues> = Partial<Record<keyof TValues, readonly AstryxFieldError[]>>;

type GeneratedMediaIntentResult = {
  assetId: string;
  previewHref: string;
  source: "picker" | "upload";
  fileName?: string;
  fileType?: string;
};

type GeneratedMediaIntentState = {
  previewHref: string;
  pendingLabel?: string;
  result?: GeneratedMediaIntentResult;
};

type GeneratedRecordMediaFieldName = Extract<
  keyof GeneratedRecordValues,
  "heroImageId" | "heroMediaId"
>;
type GeneratedCreateMediaFieldName = Extract<keyof GeneratedCreateValues, "heroImageId">;
type GeneratedMediaStatesByFieldId = Readonly<
  Record<string, GeneratedMediaIntentState | undefined>
>;

type GeneratedRecordWorkflowFixture = {
  id: string;
  committedValues: GeneratedRecordValues;
  draftValues: GeneratedRecordValues;
  errors: FieldErrorMap<GeneratedRecordValues>;
  media: Partial<Record<GeneratedRecordMediaFieldName, GeneratedMediaIntentState>>;
  pendingFieldIds: readonly (keyof GeneratedRecordValues)[];
};

type GeneratedCreateWorkflowFixture = {
  draftValues: GeneratedCreateValues;
  errors: FieldErrorMap<GeneratedCreateValues>;
  isPending: boolean;
  media: Partial<Record<GeneratedCreateMediaFieldName, GeneratedMediaIntentState>>;
  submitReady: boolean;
};

type GeneratedPublicActionWorkflowFixture = {
  draftValues: GeneratedPublicActionValues;
  errors: FieldErrorMap<GeneratedPublicActionValues>;
  isPending: boolean;
  submitReady: boolean;
};

type GeneratedFieldFoundationFixture = {
  create: GeneratedCreateWorkflowFixture;
  publicAction: GeneratedPublicActionWorkflowFixture;
  record: GeneratedRecordWorkflowFixture;
  referenceOptions: {
    audiences: readonly AstryxFieldOption[];
    owners: readonly AstryxFieldOption[];
    statuses: readonly AstryxFieldOption[];
  };
};

type GeneratedFieldProjection = {
  createFields: readonly AstryxFieldData[];
  detailFields: readonly AstryxFieldData[];
  mediaStatesByFieldId: GeneratedMediaStatesByFieldId;
  publicActionFields: readonly AstryxFieldData[];
  recordEditFields: readonly AstryxFieldData[];
  tableCellFields: readonly AstryxFieldData[];
};

type GeneratedFieldPanelProps = {
  fields: readonly AstryxFieldData[];
  title: string;
  actionLabel?: string;
  handlers: AstryxFieldIntentHandlers;
  isPending?: boolean;
  isSubmitReady?: boolean;
  layout?: "stack" | "table-cells";
  mediaStatesByFieldId: GeneratedMediaStatesByFieldId;
  onAction?: () => void;
};

const publishedPageIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M5 19.25h14" />',
  '<path d="M7.25 19.25V5.75a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v13.5" />',
  '<path d="M9.75 8.75h4.5" />',
  '<path d="M9.75 12h4.5" />',
  '<path d="M9.75 15.25h2.5" />',
  "</svg>",
].join("");

const generatedCreateFieldNames = new Set<keyof GeneratedCreateValues>([
  "accent",
  "estimateHours",
  "heroImageId",
  "ownerId",
  "summary",
  "title",
]);
const generatedPublicActionFieldNames = new Set<keyof GeneratedPublicActionValues>([
  "audienceId",
  "contactEmail",
  "contactName",
  "message",
  "subscribe",
]);
const generatedRecordFieldNames = new Set<keyof GeneratedRecordValues>([
  "accent",
  "completed",
  "estimateHours",
  "heroImageId",
  "heroMediaId",
  "notes",
  "ownerId",
  "pageIcon",
  "summary",
  "status",
  "title",
]);
const generatedCreateMediaFieldNames = new Set<GeneratedCreateMediaFieldName>(["heroImageId"]);
const generatedRecordMediaFieldNames = new Set<GeneratedRecordMediaFieldName>([
  "heroImageId",
  "heroMediaId",
]);

export function FormlessGeneratedFieldsLayout() {
  const [generatedFieldFoundationFixture, setGeneratedFieldFoundationFixture] = useState(
    createGeneratedFieldFoundationFixture,
  );
  const generatedFieldProjection = useMemo(
    () => projectGeneratedFieldFixture(generatedFieldFoundationFixture),
    [generatedFieldFoundationFixture],
  );
  const handlers = useMemo<AstryxFieldIntentHandlers>(
    () => ({
      onCommit: (fieldId, value) => {
        const field = findProjectedField(generatedFieldProjection, fieldId);

        if (!field || field.mode !== "editor") {
          return;
        }

        setGeneratedFieldFoundationFixture((currentFixture) =>
          commitGeneratedField(currentFixture, field, value),
        );
      },
      onDraftChange: (fieldId, value) => {
        const field = findProjectedField(generatedFieldProjection, fieldId);

        if (!field || field.mode !== "editor") {
          return;
        }

        setGeneratedFieldFoundationFixture((currentFixture) =>
          changeGeneratedDraft(currentFixture, field, value),
        );
      },
      onOpenPicker: (fieldId, picker) => {
        const field = findProjectedField(generatedFieldProjection, fieldId);

        if (!field || field.mode !== "editor") {
          return;
        }

        setGeneratedFieldFoundationFixture((currentFixture) =>
          applyGeneratedMediaPickerIntent(currentFixture, field, picker),
        );
      },
      onRevert: (fieldId) => {
        const field = findProjectedField(generatedFieldProjection, fieldId);

        if (!field || field.mode !== "editor") {
          return;
        }

        setGeneratedFieldFoundationFixture((currentFixture) =>
          revertGeneratedField(currentFixture, field),
        );
      },
      onUploadFile: (fieldId, file) => {
        const field = findProjectedField(generatedFieldProjection, fieldId);

        if (!field || field.mode !== "editor") {
          return;
        }

        setGeneratedFieldFoundationFixture((currentFixture) =>
          applyGeneratedMediaUploadIntent(currentFixture, field, file),
        );
      },
    }),
    [generatedFieldProjection],
  );

  return (
    <VStack gap={6} width="100%">
      <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
        <VStack gap={1}>
          <Heading level={1}>Generated Fields</Heading>
          <Text type="body" as="p" color="secondary">
            A task record and public contact action projected into Astryx field data.
          </Text>
        </VStack>
      </HStack>
      <Grid columns={{ minWidth: 340, max: 2 }} gap={4} width="100%">
        <GeneratedFieldPanel
          title="Create Task"
          fields={generatedFieldProjection.createFields}
          actionLabel="Create task"
          handlers={handlers}
          isPending={generatedFieldFoundationFixture.create.isPending}
          isSubmitReady={generatedFieldFoundationFixture.create.submitReady}
          mediaStatesByFieldId={generatedFieldProjection.mediaStatesByFieldId}
          onAction={() =>
            setGeneratedFieldFoundationFixture((currentFixture) =>
              submitGeneratedCreate(currentFixture),
            )
          }
        />
        <GeneratedFieldPanel
          title="Record Edit"
          fields={generatedFieldProjection.recordEditFields}
          handlers={handlers}
          mediaStatesByFieldId={generatedFieldProjection.mediaStatesByFieldId}
        />
        <GeneratedFieldPanel
          title="Table Cells"
          fields={generatedFieldProjection.tableCellFields}
          handlers={handlers}
          layout="table-cells"
          mediaStatesByFieldId={generatedFieldProjection.mediaStatesByFieldId}
        />
        <GeneratedFieldPanel
          title="Detail"
          fields={generatedFieldProjection.detailFields}
          handlers={handlers}
          mediaStatesByFieldId={generatedFieldProjection.mediaStatesByFieldId}
        />
        <GeneratedFieldPanel
          title="Public Contact Action"
          fields={generatedFieldProjection.publicActionFields}
          actionLabel="Send message"
          handlers={handlers}
          isPending={generatedFieldFoundationFixture.publicAction.isPending}
          isSubmitReady={generatedFieldFoundationFixture.publicAction.submitReady}
          mediaStatesByFieldId={generatedFieldProjection.mediaStatesByFieldId}
          onAction={() =>
            setGeneratedFieldFoundationFixture((currentFixture) =>
              submitGeneratedPublicAction(currentFixture),
            )
          }
        />
      </Grid>
    </VStack>
  );
}

function GeneratedFieldPanel({
  actionLabel,
  fields,
  handlers,
  isPending = false,
  isSubmitReady,
  layout = "stack",
  mediaStatesByFieldId,
  onAction,
  title,
}: GeneratedFieldPanelProps) {
  const readinessLabel = isPending ? "Pending" : isSubmitReady ? "Ready" : "Needs input";

  return (
    <Card padding={4}>
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
          <Heading level={2}>{title}</Heading>
          {typeof isSubmitReady === "boolean" ? (
            <Text type="supporting" color="secondary">
              {readinessLabel}
            </Text>
          ) : null}
        </HStack>
        <GeneratedFieldList
          fields={fields}
          handlers={handlers}
          includeSubmitAdapters={Boolean(actionLabel)}
          layout={layout}
          mediaStatesByFieldId={mediaStatesByFieldId}
        />
        {actionLabel ? (
          <Button
            label={actionLabel}
            variant="primary"
            isDisabled={!isSubmitReady || isPending}
            onClick={onAction}
          />
        ) : null}
      </VStack>
    </Card>
  );
}

function GeneratedFieldList({
  fields,
  handlers,
  includeSubmitAdapters,
  layout,
  mediaStatesByFieldId,
}: {
  fields: readonly AstryxFieldData[];
  handlers: AstryxFieldIntentHandlers;
  includeSubmitAdapters: boolean;
  layout: "stack" | "table-cells";
  mediaStatesByFieldId: GeneratedMediaStatesByFieldId;
}) {
  if (layout === "table-cells") {
    return (
      <Grid columns={{ minWidth: 112, max: 3 }} gap={2} width="100%">
        {fields.map((field) => (
          <GeneratedField
            key={field.id}
            field={field}
            handlers={handlers}
            includeSubmitAdapter={includeSubmitAdapters}
            mediaState={mediaStatesByFieldId[field.id]}
          />
        ))}
      </Grid>
    );
  }

  return (
    <VStack gap={3}>
      {fields.map((field) => (
        <GeneratedField
          key={field.id}
          field={field}
          handlers={handlers}
          includeSubmitAdapter={includeSubmitAdapters}
          mediaState={mediaStatesByFieldId[field.id]}
        />
      ))}
    </VStack>
  );
}

function GeneratedField({
  field,
  handlers,
  includeSubmitAdapter,
  mediaState,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
  includeSubmitAdapter: boolean;
  mediaState: GeneratedMediaIntentState | undefined;
}) {
  return (
    <VStack gap={1}>
      <AstryxFieldRenderer field={field} handlers={handlers} />
      {includeSubmitAdapter ? <AstryxFieldSubmitFormAdapter field={field} /> : null}
      <GeneratedFieldMeta field={field} handlers={handlers} mediaState={mediaState} />
    </VStack>
  );
}

function GeneratedFieldMeta({
  field,
  handlers,
  mediaState,
}: {
  field: AstryxFieldData;
  handlers: AstryxFieldIntentHandlers;
  mediaState: GeneratedMediaIntentState | undefined;
}) {
  const isPending = Boolean(field.pending?.isPending);
  const isFieldCommit = field.mode === "editor" && field.commitPolicy === "field";
  const hasMediaIntents =
    field.mode === "editor" && (field.kind === "image" || field.kind === "media");
  const hasMeta = isPending || isFieldCommit || hasMediaIntents || Boolean(mediaState);

  if (!hasMeta) {
    return null;
  }

  return (
    <VStack gap={1}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        {isPending ? (
          <HStack gap={1} vAlign="center">
            <Spinner size="sm" shade="inherit" />
            <Text type="supporting" color="secondary">
              {field.pending?.label ?? "Pending"}
            </Text>
          </HStack>
        ) : null}
        {field.mode === "editor" && isFieldCommit ? (
          <>
            <Button
              label="Commit"
              variant="primary"
              isDisabled={isPending || !fieldIsDirty(field) || fieldHasBlockingError(field)}
              onClick={() => handlers.onCommit?.(field.id, field.draftValue)}
            />
            <Button
              label="Revert"
              variant="secondary"
              isDisabled={isPending || !fieldIsDirty(field)}
              onClick={() => handlers.onRevert?.(field.id)}
            />
          </>
        ) : null}
        {hasMediaIntents ? (
          <>
            <Button
              label="Pick"
              variant="secondary"
              onClick={() =>
                handlers.onOpenPicker?.(field.id, field.kind === "image" ? "image" : "media")
              }
            />
            <Button
              label="Upload"
              variant="secondary"
              onClick={() => handlers.onUploadFile?.(field.id, createStubUploadFile(field))}
            />
          </>
        ) : null}
      </HStack>
      <GeneratedMediaState field={field} mediaState={mediaState} />
    </VStack>
  );
}

function GeneratedMediaState({
  field,
  mediaState,
}: {
  field: AstryxFieldData;
  mediaState: GeneratedMediaIntentState | undefined;
}) {
  const previewHref = mediaState?.previewHref ?? field.presentation?.mediaPreviewUrl;

  if (field.kind !== "image" && field.kind !== "media") {
    return null;
  }

  return (
    <VStack gap={1}>
      <Text type="supporting" color="secondary" maxLines={1}>
        Asset {field.mode === "editor" ? formatFieldValue(field.draftValue) : field.displayValue}
      </Text>
      {previewHref ? (
        <Text type="supporting" color="secondary" maxLines={1}>
          Preview {previewHref}
        </Text>
      ) : null}
      {mediaState?.result ? (
        <Text type="supporting" color="secondary" maxLines={2}>
          Result {JSON.stringify(mediaState.result)}
        </Text>
      ) : null}
    </VStack>
  );
}

function createGeneratedFieldFoundationFixture(): GeneratedFieldFoundationFixture {
  const committedValues = {
    accent: "#2563eb80",
    completed: false,
    estimateHours: 4,
    heroImageId: "image-homepage-hero",
    heroMediaId: "media-homepage-hero",
    notes:
      "### Launch note\n\nConfirm generated fields, public contact copy, and publish readiness.",
    ownerId: "principal-archived",
    pageIcon: "published-page",
    status: "waiting",
    summary: "Review route and publishing changes before the Site launch.",
    title: "Review route changes",
  } satisfies GeneratedRecordValues;

  const fixture = {
    create: {
      draftValues: {
        accent: "#0f766e88",
        estimateHours: 3,
        heroImageId: "image-contact-preview",
        ownerId: "principal-jordan",
        summary: "Prepare launch checklist and route review.",
        title: "Prepare launch checklist",
      },
      errors: {},
      isPending: false,
      media: {
        heroImageId: {
          previewHref: "/astryx/generated/homepage-preview.png",
        },
      },
      submitReady: true,
    },
    publicAction: {
      draftValues: {
        audienceId: "audience-launch",
        contactEmail: "",
        contactName: "Avery Morgan",
        message: "I want launch updates and the public preview link.",
        subscribe: true,
      },
      errors: {
        contactEmail: [{ id: "contact-email-required", message: "Email is required." }],
      },
      isPending: false,
      submitReady: false,
    },
    record: {
      id: "task-route-review",
      committedValues,
      draftValues: {
        ...committedValues,
        estimateHours: "four-ish",
        notes:
          "### Draft launch note\n\nKeep markdown source visible while editing generated fields.",
        title: "Review generated route changes",
      },
      errors: {},
      media: {
        heroImageId: {
          previewHref: "/astryx/generated/homepage-preview.png",
        },
        heroMediaId: {
          previewHref: "/astryx/generated/homepage-hero.png",
        },
      },
      pendingFieldIds: [],
    },
    referenceOptions: {
      audiences: [
        { value: "audience-launch", label: "Launch updates", detail: "Public Site audience" },
        { value: "audience-customers", label: "Customers", detail: "CRM contacts" },
      ],
      owners: [
        { value: "principal-dana", label: "Dana Peek", detail: "Product" },
        { value: "principal-jordan", label: "Jordan Lee", detail: "Design" },
      ],
      statuses: [
        { value: "open", label: "Open", color: "#2563eb" },
        { value: "waiting", label: "Waiting", color: "#d97706" },
        { value: "done", label: "Done", color: "#16a34a" },
      ],
    },
  } satisfies GeneratedFieldFoundationFixture;

  return validateGeneratedFieldFixture(fixture);
}

function projectGeneratedFieldFixture(
  fixture: GeneratedFieldFoundationFixture,
): GeneratedFieldProjection {
  const createFields = projectCreateFields(fixture);
  const detailFields = projectDetailFields(fixture);
  const publicActionFields = projectPublicActionFields(fixture);
  const recordEditFields = projectRecordEditFields(fixture);
  const tableCellFields = projectTableCellFields(fixture);

  return {
    createFields,
    detailFields,
    mediaStatesByFieldId: projectMediaStatesByFieldId(fixture),
    publicActionFields,
    recordEditFields,
    tableCellFields,
  };
}

function projectCreateFields(fixture: GeneratedFieldFoundationFixture): readonly AstryxFieldData[] {
  const { create, referenceOptions } = fixture;

  return [
    createEditorField({
      id: "generated-create-title",
      name: "title",
      label: "Task",
      isRequired: true,
      surface: "create",
      density: "balanced",
      accessMode: "editable",
      kind: "text",
      draftValue: create.draftValues.title,
      committedDisplayValue: "",
      commitPolicy: "submit",
      presentation: { placeholder: "Task name" },
      pending: pendingForCreateField(create, "title", "Creating task"),
      errors: errorsFor(create.errors, "title"),
    }),
    createEditorField({
      id: "generated-create-summary",
      name: "summary",
      label: "Summary",
      surface: "create",
      density: "balanced",
      accessMode: "editable",
      kind: "long-text",
      draftValue: create.draftValues.summary,
      committedDisplayValue: "",
      commitPolicy: "submit",
      presentation: { placeholder: "What needs to happen?" },
      pending: pendingForCreateField(create, "summary", "Creating task"),
      errors: errorsFor(create.errors, "summary"),
    }),
    createEditorField({
      id: "generated-create-owner",
      name: "ownerId",
      label: "Owner",
      isRequired: true,
      surface: "create",
      density: "balanced",
      accessMode: "editable",
      kind: "reference",
      draftValue: create.draftValues.ownerId,
      committedDisplayValue: "",
      commitPolicy: "submit",
      options: referenceOptions.owners,
      pending: pendingForCreateField(create, "ownerId", "Creating task"),
      errors: errorsFor(create.errors, "ownerId"),
    }),
    createEditorField({
      id: "generated-create-estimate",
      name: "estimateHours",
      label: "Estimate",
      surface: "create",
      density: "balanced",
      accessMode: "editable",
      kind: "number",
      draftValue: create.draftValues.estimateHours,
      committedDisplayValue: "",
      commitPolicy: "submit",
      presentation: { placeholder: "Hours" },
      pending: pendingForCreateField(create, "estimateHours", "Creating task"),
      errors: errorsFor(create.errors, "estimateHours"),
    }),
    createEditorField({
      id: "generated-create-accent",
      name: "accent",
      label: "Accent",
      surface: "create",
      density: "balanced",
      accessMode: "editable",
      kind: "color",
      draftValue: create.draftValues.accent,
      committedDisplayValue: "",
      commitPolicy: "submit",
      pending: pendingForCreateField(create, "accent", "Creating task"),
      errors: errorsFor(create.errors, "accent"),
    }),
    createEditorField({
      id: "generated-create-image",
      name: "heroImageId",
      label: "Hero Image",
      surface: "create",
      density: "balanced",
      accessMode: "editable",
      kind: "image",
      draftValue: create.draftValues.heroImageId,
      committedDisplayValue: "",
      commitPolicy: "submit",
      presentation: {
        mediaAlt: "Homepage preview",
        mediaPreviewUrl: mediaPreviewHref(
          create.media.heroImageId,
          "/astryx/generated/homepage-preview.png",
        ),
      },
      pending: pendingForCreateField(create, "heroImageId", "Creating task"),
      errors: errorsFor(create.errors, "heroImageId"),
    }),
  ];
}

function projectRecordEditFields(
  fixture: GeneratedFieldFoundationFixture,
): readonly AstryxFieldData[] {
  const { record, referenceOptions } = fixture;

  return [
    createEditorField({
      id: "generated-record-title",
      name: "title",
      label: "Task",
      isRequired: true,
      surface: "record",
      density: "balanced",
      accessMode: "editable",
      kind: "text",
      draftValue: record.draftValues.title,
      committedValue: record.committedValues.title,
      committedDisplayValue: record.committedValues.title,
      commitPolicy: "field",
      pending: pendingForRecordField(record, "title", "Saving title"),
      errors: errorsFor(record.errors, "title"),
    }),
    createEditorField({
      id: "generated-record-completed",
      name: "completed",
      label: "Completed",
      surface: "record",
      density: "balanced",
      accessMode: "editable",
      kind: "boolean",
      draftValue: record.draftValues.completed,
      committedValue: record.committedValues.completed,
      committedDisplayValue: formatBoolean(record.committedValues.completed),
      commitPolicy: "immediate",
      errors: errorsFor(record.errors, "completed"),
    }),
    createEditorField({
      id: "generated-record-status",
      name: "status",
      label: "Status",
      surface: "record",
      density: "balanced",
      accessMode: "editable",
      kind: "enum",
      draftValue: record.draftValues.status,
      committedValue: record.committedValues.status,
      committedDisplayValue: displayOption(
        referenceOptions.statuses,
        record.committedValues.status,
      ),
      commitPolicy: "immediate",
      options: referenceOptions.statuses,
      errors: errorsFor(record.errors, "status"),
    }),
    createEditorField({
      id: "generated-record-estimate",
      name: "estimateHours",
      label: "Estimate",
      surface: "record",
      density: "balanced",
      accessMode: "editable",
      kind: "number",
      draftValue: record.draftValues.estimateHours,
      committedValue: record.committedValues.estimateHours,
      committedDisplayValue: String(record.committedValues.estimateHours),
      commitPolicy: "field",
      pending: pendingForRecordField(record, "estimateHours", "Saving estimate"),
      errors: errorsFor(record.errors, "estimateHours"),
    }),
    createEditorField({
      id: "generated-record-notes",
      name: "notes",
      label: "Notes",
      surface: "record",
      density: "comfortable",
      accessMode: "editable",
      kind: "markdown",
      draftValue: record.draftValues.notes,
      committedValue: record.committedValues.notes,
      committedDisplayValue: record.committedValues.notes,
      commitPolicy: "field",
      pending: pendingForRecordField(record, "notes", "Saving notes"),
      errors: errorsFor(record.errors, "notes"),
    }),
    createEditorField({
      id: "generated-record-media",
      name: "heroMediaId",
      label: "Hero Media",
      surface: "record",
      density: "balanced",
      accessMode: "editable",
      kind: "media",
      draftValue: record.draftValues.heroMediaId,
      committedValue: record.committedValues.heroMediaId,
      committedDisplayValue: record.committedValues.heroMediaId,
      commitPolicy: "field",
      presentation: {
        accept: "image/*",
        mediaAlt: "Published homepage hero",
        mediaPreviewUrl: mediaPreviewHref(
          record.media.heroMediaId,
          "/astryx/generated/homepage-hero.png",
        ),
      },
      pending: pendingForRecordField(record, "heroMediaId", "Preparing upload"),
      errors: errorsFor(record.errors, "heroMediaId"),
    }),
  ];
}

function projectTableCellFields(
  fixture: GeneratedFieldFoundationFixture,
): readonly AstryxFieldData[] {
  const { record, referenceOptions } = fixture;

  return [
    createEditorField({
      id: "generated-cell-status",
      name: "status",
      label: "Status",
      surface: "table-cell",
      density: "compact",
      accessMode: "editable",
      kind: "enum",
      draftValue: record.draftValues.status,
      committedValue: record.committedValues.status,
      committedDisplayValue: displayOption(
        referenceOptions.statuses,
        record.committedValues.status,
      ),
      commitPolicy: "immediate",
      options: referenceOptions.statuses,
      errors: errorsFor(record.errors, "status"),
    }),
    createEditorField({
      id: "generated-cell-owner",
      name: "ownerId",
      label: "Owner",
      surface: "table-cell",
      density: "compact",
      accessMode: "editable",
      kind: "reference",
      draftValue: record.draftValues.ownerId,
      committedValue: record.committedValues.ownerId,
      committedDisplayValue: displayOption(referenceOptions.owners, record.committedValues.ownerId),
      commitPolicy: "immediate",
      options: referenceOptionsWithMissingValue(
        referenceOptions.owners,
        record.draftValues.ownerId,
      ),
      errors: errorsFor(record.errors, "ownerId"),
    }),
    createEditorField({
      id: "generated-cell-completed",
      name: "completed",
      label: "Completed",
      surface: "table-cell",
      density: "compact",
      accessMode: "editable",
      kind: "boolean",
      draftValue: record.draftValues.completed,
      committedValue: record.committedValues.completed,
      committedDisplayValue: formatBoolean(record.committedValues.completed),
      commitPolicy: "immediate",
      errors: errorsFor(record.errors, "completed"),
    }),
  ];
}

function projectDetailFields(fixture: GeneratedFieldFoundationFixture): readonly AstryxFieldData[] {
  const { record, referenceOptions } = fixture;

  return [
    createDisplayField({
      id: "generated-detail-summary",
      name: "summary",
      label: "Summary",
      surface: "detail",
      density: "comfortable",
      accessMode: "read-only",
      kind: "long-text",
      value: record.committedValues.summary,
      displayValue: record.committedValues.summary,
      presentation: { maxLines: 3 },
    }),
    createDisplayField({
      id: "generated-detail-owner",
      name: "ownerId",
      label: "Owner",
      surface: "detail",
      density: "balanced",
      accessMode: "read-only",
      kind: "reference",
      value: record.committedValues.ownerId,
      displayValue: displayOption(referenceOptions.owners, record.committedValues.ownerId),
      options: referenceOptionsWithMissingValue(
        referenceOptions.owners,
        record.committedValues.ownerId,
      ),
    }),
    createDisplayField({
      id: "generated-detail-markdown",
      name: "notes",
      label: "Notes",
      surface: "detail",
      density: "comfortable",
      accessMode: "read-only",
      kind: "markdown",
      value: record.committedValues.notes,
      displayValue: record.committedValues.notes,
    }),
    createDisplayField({
      id: "generated-detail-icon",
      name: "pageIcon",
      label: "Page Icon",
      surface: "detail",
      density: "balanced",
      accessMode: "read-only",
      kind: "source-icon",
      value: record.committedValues.pageIcon,
      displayValue: "Published page",
      presentation: { sourceIcon: publishedPageIconSource },
    }),
    createDisplayField({
      id: "generated-detail-accent",
      name: "accent",
      label: "Accent",
      surface: "detail",
      density: "balanced",
      accessMode: "read-only",
      kind: "color",
      value: record.committedValues.accent,
      displayValue: record.committedValues.accent,
    }),
    createDisplayField({
      id: "generated-detail-image",
      name: "heroImageId",
      label: "Hero Image",
      surface: "detail",
      density: "balanced",
      accessMode: "read-only",
      kind: "image",
      value: record.committedValues.heroImageId,
      displayValue: record.committedValues.heroImageId,
      presentation: {
        mediaAlt: "Homepage preview",
        mediaPreviewUrl: mediaPreviewHref(
          record.media.heroImageId,
          "/astryx/generated/homepage-preview.png",
        ),
      },
    }),
    createDisplayField({
      id: "generated-detail-media",
      name: "heroMediaId",
      label: "Hero Media",
      surface: "detail",
      density: "balanced",
      accessMode: "read-only",
      kind: "media",
      value: record.committedValues.heroMediaId,
      displayValue: record.committedValues.heroMediaId,
      presentation: {
        mediaAlt: "Published homepage hero",
        mediaPreviewUrl: mediaPreviewHref(
          record.media.heroMediaId,
          "/astryx/generated/homepage-hero.png",
        ),
      },
      pending: pendingForRecordField(record, "heroMediaId", "Preparing upload"),
    }),
  ];
}

function projectPublicActionFields(
  fixture: GeneratedFieldFoundationFixture,
): readonly AstryxFieldData[] {
  const { publicAction, referenceOptions } = fixture;

  return [
    createEditorField({
      id: "generated-public-contact-name",
      name: "contactName",
      label: "Name",
      isRequired: true,
      surface: "public-action",
      density: "balanced",
      accessMode: "editable",
      kind: "text",
      draftValue: publicAction.draftValues.contactName,
      committedDisplayValue: "",
      commitPolicy: "submit",
      pending: pendingForPublicAction(publicAction, "Sending message"),
      errors: errorsFor(publicAction.errors, "contactName"),
    }),
    createEditorField({
      id: "generated-public-contact-email",
      name: "contactEmail",
      label: "Email",
      isRequired: true,
      surface: "public-action",
      density: "balanced",
      accessMode: "editable",
      kind: "text",
      draftValue: publicAction.draftValues.contactEmail,
      committedDisplayValue: "",
      commitPolicy: "submit",
      presentation: { format: "email", placeholder: "name@example.com" },
      pending: pendingForPublicAction(publicAction, "Sending message"),
      errors: errorsFor(publicAction.errors, "contactEmail"),
    }),
    createEditorField({
      id: "generated-public-message",
      name: "message",
      label: "Message",
      surface: "public-action",
      density: "balanced",
      accessMode: "editable",
      kind: "long-text",
      draftValue: publicAction.draftValues.message,
      committedDisplayValue: "",
      commitPolicy: "submit",
      pending: pendingForPublicAction(publicAction, "Sending message"),
      errors: errorsFor(publicAction.errors, "message"),
    }),
    createEditorField({
      id: "generated-public-audience",
      name: "audienceId",
      label: "Audience",
      surface: "public-action",
      density: "balanced",
      accessMode: "editable",
      kind: "reference",
      draftValue: publicAction.draftValues.audienceId,
      committedDisplayValue: "",
      commitPolicy: "submit",
      options: referenceOptions.audiences,
      pending: pendingForPublicAction(publicAction, "Sending message"),
      errors: errorsFor(publicAction.errors, "audienceId"),
    }),
    createEditorField({
      id: "generated-public-subscribe",
      name: "subscribe",
      label: "Subscribe",
      surface: "public-action",
      density: "balanced",
      accessMode: "editable",
      kind: "boolean",
      draftValue: publicAction.draftValues.subscribe,
      committedDisplayValue: "",
      commitPolicy: "submit",
      pending: pendingForPublicAction(publicAction, "Sending message"),
      errors: errorsFor(publicAction.errors, "subscribe"),
    }),
  ];
}

type GeneratedEditorFieldTarget =
  | { scope: "create"; fieldName: keyof GeneratedCreateValues }
  | { scope: "publicAction"; fieldName: keyof GeneratedPublicActionValues }
  | { scope: "record"; fieldName: keyof GeneratedRecordValues };

type GeneratedMediaFieldTarget =
  | { scope: "create"; fieldName: GeneratedCreateMediaFieldName }
  | { scope: "record"; fieldName: GeneratedRecordMediaFieldName };

function findProjectedField(
  projection: GeneratedFieldProjection,
  fieldId: string,
): AstryxFieldData | undefined {
  return [
    projection.createFields,
    projection.recordEditFields,
    projection.tableCellFields,
    projection.detailFields,
    projection.publicActionFields,
  ]
    .flat()
    .find((field) => field.id === fieldId);
}

function changeGeneratedDraft(
  fixture: GeneratedFieldFoundationFixture,
  field: AstryxFieldEditorData,
  value: AstryxFieldValue,
): GeneratedFieldFoundationFixture {
  const target = resolveEditorFieldTarget(field);

  if (!target) {
    return fixture;
  }

  if (target.scope === "create") {
    return validateGeneratedFieldFixture({
      ...fixture,
      create: {
        ...fixture.create,
        isPending: false,
        draftValues: {
          ...fixture.create.draftValues,
          [target.fieldName]: value,
        } as GeneratedCreateValues,
      },
    });
  }

  if (target.scope === "publicAction") {
    return validateGeneratedFieldFixture({
      ...fixture,
      publicAction: {
        ...fixture.publicAction,
        isPending: false,
        draftValues: {
          ...fixture.publicAction.draftValues,
          [target.fieldName]: value,
        } as GeneratedPublicActionValues,
      },
    });
  }

  const nextValue =
    field.commitPolicy === "immediate" ? normalizeCommittedValue(field, value) : value;
  const nextRecord = {
    ...fixture.record,
    committedValues:
      field.commitPolicy === "immediate"
        ? ({
            ...fixture.record.committedValues,
            [target.fieldName]: nextValue,
          } as GeneratedRecordValues)
        : fixture.record.committedValues,
    draftValues: {
      ...fixture.record.draftValues,
      [target.fieldName]: nextValue,
    } as GeneratedRecordValues,
  };

  return validateGeneratedFieldFixture({
    ...fixture,
    record: nextRecord,
  });
}

function commitGeneratedField(
  fixture: GeneratedFieldFoundationFixture,
  field: AstryxFieldEditorData,
  value: AstryxFieldValue,
): GeneratedFieldFoundationFixture {
  const target = resolveEditorFieldTarget(field);

  if (!target || target.scope !== "record" || field.commitPolicy !== "field") {
    return fixture;
  }

  const validatedFixture = validateGeneratedFieldFixture(fixture);
  const fieldErrors = validatedFixture.record.errors[target.fieldName] ?? [];

  if (fieldErrors.some((error) => (error.severity ?? "error") === "error")) {
    return validatedFixture;
  }

  const committedValue = normalizeCommittedValue(field, value);

  return validateGeneratedFieldFixture({
    ...validatedFixture,
    record: {
      ...validatedFixture.record,
      committedValues: {
        ...validatedFixture.record.committedValues,
        [target.fieldName]: committedValue,
      } as GeneratedRecordValues,
      draftValues: {
        ...validatedFixture.record.draftValues,
        [target.fieldName]: committedValue,
      } as GeneratedRecordValues,
      media: clearRecordMediaPending(validatedFixture.record.media, target.fieldName),
    },
  });
}

function revertGeneratedField(
  fixture: GeneratedFieldFoundationFixture,
  field: AstryxFieldEditorData,
): GeneratedFieldFoundationFixture {
  const target = resolveEditorFieldTarget(field);

  if (!target || target.scope !== "record") {
    return fixture;
  }

  return validateGeneratedFieldFixture({
    ...fixture,
    record: {
      ...fixture.record,
      draftValues: {
        ...fixture.record.draftValues,
        [target.fieldName]: fixture.record.committedValues[target.fieldName],
      } as GeneratedRecordValues,
      media: resetRecordMediaState(fixture.record.media, target.fieldName),
    },
  });
}

function submitGeneratedCreate(
  fixture: GeneratedFieldFoundationFixture,
): GeneratedFieldFoundationFixture {
  const validatedFixture = validateGeneratedFieldFixture(fixture);

  if (!validatedFixture.create.submitReady) {
    return validatedFixture;
  }

  return {
    ...validatedFixture,
    create: {
      ...validatedFixture.create,
      isPending: true,
    },
  };
}

function submitGeneratedPublicAction(
  fixture: GeneratedFieldFoundationFixture,
): GeneratedFieldFoundationFixture {
  const validatedFixture = validateGeneratedFieldFixture(fixture);

  if (!validatedFixture.publicAction.submitReady) {
    return validatedFixture;
  }

  return {
    ...validatedFixture,
    publicAction: {
      ...validatedFixture.publicAction,
      isPending: true,
    },
  };
}

function applyGeneratedMediaPickerIntent(
  fixture: GeneratedFieldFoundationFixture,
  field: AstryxFieldEditorData,
  picker: "reference" | "icon" | "image" | "media",
): GeneratedFieldFoundationFixture {
  const target = resolveMediaFieldTarget(field);

  if (!target || (picker !== "image" && picker !== "media")) {
    return fixture;
  }

  const assetId =
    picker === "image" ? "image-picked-contact-preview" : "media-picked-homepage-hero";
  const previewHref =
    picker === "image"
      ? "/astryx/generated/picker-contact-preview.png"
      : "/astryx/generated/picker-homepage-hero.png";

  return applyGeneratedMediaIntentResult(fixture, target, {
    assetId,
    previewHref,
    source: "picker",
  });
}

function applyGeneratedMediaUploadIntent(
  fixture: GeneratedFieldFoundationFixture,
  field: AstryxFieldEditorData,
  file: File,
): GeneratedFieldFoundationFixture {
  const target = resolveMediaFieldTarget(field);

  if (!target) {
    return fixture;
  }

  const fileName = file.name || `${field.name}.png`;
  const assetId = `${field.kind}-upload-${slugifyFileName(fileName)}`;
  const previewHref = `/astryx/generated/uploads/${assetId}.png`;

  return applyGeneratedMediaIntentResult(
    fixture,
    target,
    {
      assetId,
      fileName,
      fileType: file.type || "application/octet-stream",
      previewHref,
      source: "upload",
    },
    "Upload queued",
  );
}

function applyGeneratedMediaIntentResult(
  fixture: GeneratedFieldFoundationFixture,
  target: GeneratedMediaFieldTarget,
  result: GeneratedMediaIntentResult,
  pendingLabel?: string,
): GeneratedFieldFoundationFixture {
  const mediaState = {
    previewHref: result.previewHref,
    result,
    ...(pendingLabel ? { pendingLabel } : {}),
  } satisfies GeneratedMediaIntentState;

  if (target.scope === "create") {
    return validateGeneratedFieldFixture({
      ...fixture,
      create: {
        ...fixture.create,
        isPending: false,
        draftValues: {
          ...fixture.create.draftValues,
          [target.fieldName]: result.assetId,
        } as GeneratedCreateValues,
        media: {
          ...fixture.create.media,
          [target.fieldName]: mediaState,
        },
      },
    });
  }

  return validateGeneratedFieldFixture({
    ...fixture,
    record: {
      ...fixture.record,
      draftValues: {
        ...fixture.record.draftValues,
        [target.fieldName]: result.assetId,
      } as GeneratedRecordValues,
      media: {
        ...fixture.record.media,
        [target.fieldName]: mediaState,
      },
    },
  });
}

function validateGeneratedFieldFixture(
  fixture: GeneratedFieldFoundationFixture,
): GeneratedFieldFoundationFixture {
  const createErrors = validateCreateValues(fixture.create.draftValues);
  const publicActionErrors = validatePublicActionValues(fixture.publicAction.draftValues);
  const recordErrors = validateRecordValues(fixture.record.draftValues, fixture.referenceOptions);

  return {
    ...fixture,
    create: {
      ...fixture.create,
      errors: createErrors,
      submitReady: errorsAllowSubmit(createErrors),
    },
    publicAction: {
      ...fixture.publicAction,
      errors: publicActionErrors,
      submitReady: errorsAllowSubmit(publicActionErrors),
    },
    record: {
      ...fixture.record,
      errors: recordErrors,
    },
  };
}

function validateCreateValues(values: GeneratedCreateValues): FieldErrorMap<GeneratedCreateValues> {
  const errors: FieldErrorMap<GeneratedCreateValues> = {};

  if (isBlankText(values.title)) {
    errors.title = [fieldError("create-title-required", "Task is required.")];
  }

  if (isBlankText(values.ownerId)) {
    errors.ownerId = [fieldError("create-owner-required", "Owner is required.")];
  }

  if (!numberDraftIsValid(values.estimateHours)) {
    errors.estimateHours = [
      fieldError("create-estimate-number", "Estimate keeps invalid text until it is numeric."),
    ];
  }

  if (typeof values.accent === "string" && !opaqueHexColorIsValid(values.accent)) {
    errors.accent = [
      fieldError("create-accent-alpha", "Alpha color text is preserved.", "warning"),
    ];
  }

  return errors;
}

function validatePublicActionValues(
  values: GeneratedPublicActionValues,
): FieldErrorMap<GeneratedPublicActionValues> {
  const errors: FieldErrorMap<GeneratedPublicActionValues> = {};

  if (isBlankText(values.contactName)) {
    errors.contactName = [fieldError("contact-name-required", "Name is required.")];
  }

  if (isBlankText(values.contactEmail)) {
    errors.contactEmail = [fieldError("contact-email-required", "Email is required.")];
  } else if (!emailTextIsValid(values.contactEmail)) {
    errors.contactEmail = [fieldError("contact-email-format", "Enter a valid email address.")];
  }

  if (isBlankText(values.audienceId)) {
    errors.audienceId = [fieldError("public-audience-required", "Audience is required.")];
  }

  return errors;
}

function validateRecordValues(
  values: GeneratedRecordValues,
  referenceOptions: GeneratedFieldFoundationFixture["referenceOptions"],
): FieldErrorMap<GeneratedRecordValues> {
  const errors: FieldErrorMap<GeneratedRecordValues> = {};

  if (isBlankText(values.title)) {
    errors.title = [fieldError("record-title-required", "Task is required.")];
  }

  if (!numberDraftIsValid(values.estimateHours)) {
    errors.estimateHours = [
      fieldError("record-estimate-number", "Estimate keeps invalid text until it is numeric."),
    ];
  }

  if (
    typeof values.ownerId === "string" &&
    values.ownerId !== "" &&
    !referenceOptions.owners.some((option) => option.value === values.ownerId)
  ) {
    errors.ownerId = [
      fieldError("record-owner-missing", "Missing reference id is preserved.", "warning"),
    ];
  }

  return errors;
}

function resolveEditorFieldTarget(field: AstryxFieldEditorData): GeneratedEditorFieldTarget | null {
  if (field.surface === "create" && isGeneratedCreateFieldName(field.name)) {
    return { scope: "create", fieldName: field.name };
  }

  if (field.surface === "public-action" && isGeneratedPublicActionFieldName(field.name)) {
    return { scope: "publicAction", fieldName: field.name };
  }

  if (
    (field.surface === "record" || field.surface === "table-cell") &&
    isGeneratedRecordFieldName(field.name)
  ) {
    return { scope: "record", fieldName: field.name };
  }

  return null;
}

function resolveMediaFieldTarget(field: AstryxFieldEditorData): GeneratedMediaFieldTarget | null {
  const target = resolveEditorFieldTarget(field);

  if (!target) {
    return null;
  }

  if (target.scope === "create" && isGeneratedCreateMediaFieldName(target.fieldName)) {
    return { scope: "create", fieldName: target.fieldName };
  }

  if (target.scope === "record" && isGeneratedRecordMediaFieldName(target.fieldName)) {
    return { scope: "record", fieldName: target.fieldName };
  }

  return null;
}

function isGeneratedCreateFieldName(value: string): value is keyof GeneratedCreateValues {
  return generatedCreateFieldNames.has(value as keyof GeneratedCreateValues);
}

function isGeneratedPublicActionFieldName(
  value: string,
): value is keyof GeneratedPublicActionValues {
  return generatedPublicActionFieldNames.has(value as keyof GeneratedPublicActionValues);
}

function isGeneratedRecordFieldName(value: string): value is keyof GeneratedRecordValues {
  return generatedRecordFieldNames.has(value as keyof GeneratedRecordValues);
}

function isGeneratedCreateMediaFieldName(
  value: keyof GeneratedCreateValues,
): value is GeneratedCreateMediaFieldName {
  return generatedCreateMediaFieldNames.has(value as GeneratedCreateMediaFieldName);
}

function isGeneratedRecordMediaFieldName(
  value: keyof GeneratedRecordValues,
): value is GeneratedRecordMediaFieldName {
  return generatedRecordMediaFieldNames.has(value as GeneratedRecordMediaFieldName);
}

function normalizeCommittedValue(
  field: AstryxFieldEditorData,
  value: AstryxFieldValue,
): AstryxFieldValue {
  if (field.kind !== "number" || typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  const numericValue = Number(trimmedValue);

  return Number.isFinite(numericValue) ? numericValue : value;
}

function projectMediaStatesByFieldId(
  fixture: GeneratedFieldFoundationFixture,
): GeneratedMediaStatesByFieldId {
  return {
    "generated-create-image": fixture.create.media.heroImageId,
    "generated-detail-image": fixture.record.media.heroImageId,
    "generated-detail-media": fixture.record.media.heroMediaId,
    "generated-record-media": fixture.record.media.heroMediaId,
  };
}

function referenceOptionsWithMissingValue(
  options: readonly AstryxFieldOption[],
  value: AstryxFieldValue,
): readonly AstryxFieldOption[] {
  if (
    typeof value !== "string" ||
    value === "" ||
    options.some((option) => option.value === value)
  ) {
    return options;
  }

  return [
    ...options,
    {
      value,
      label: value,
      detail: "Missing reference id",
      isMissing: true,
    },
  ];
}

function pendingForCreateField(
  create: GeneratedCreateWorkflowFixture,
  fieldName: keyof GeneratedCreateValues,
  label: string,
) {
  const mediaState = isGeneratedCreateMediaFieldName(fieldName)
    ? create.media[fieldName]
    : undefined;

  if (mediaState?.pendingLabel) {
    return { isPending: true, label: mediaState.pendingLabel };
  }

  return create.isPending ? { isPending: true, label } : undefined;
}

function pendingForPublicAction(publicAction: GeneratedPublicActionWorkflowFixture, label: string) {
  return publicAction.isPending ? { isPending: true, label } : undefined;
}

function pendingForRecordField(
  record: GeneratedRecordWorkflowFixture,
  fieldName: keyof GeneratedRecordValues,
  label: string,
) {
  const mediaState = isGeneratedRecordMediaFieldName(fieldName)
    ? record.media[fieldName]
    : undefined;

  if (mediaState?.pendingLabel) {
    return { isPending: true, label: mediaState.pendingLabel };
  }

  return record.pendingFieldIds.includes(fieldName) ? { isPending: true, label } : undefined;
}

function mediaPreviewHref(mediaState: GeneratedMediaIntentState | undefined, fallback: string) {
  return mediaState?.previewHref ?? fallback;
}

function fieldIsDirty(field: AstryxFieldEditorData) {
  return field.draftValue !== (field.committedValue ?? null);
}

function fieldHasBlockingError(field: AstryxFieldEditorData) {
  return field.errors?.some((error) => (error.severity ?? "error") === "error") ?? false;
}

function createStubUploadFile(field: AstryxFieldEditorData) {
  return new File([`stub upload for ${field.id}`], `${field.name}-stub.png`, {
    type: "image/png",
  });
}

function formatFieldValue(value: AstryxFieldValue) {
  if (value === null) {
    return "Empty";
  }

  return String(value);
}

function clearRecordMediaPending(
  media: GeneratedRecordWorkflowFixture["media"],
  fieldName: keyof GeneratedRecordValues,
) {
  if (!isGeneratedRecordMediaFieldName(fieldName)) {
    return media;
  }

  const currentMediaState = media[fieldName];

  if (!currentMediaState) {
    return media;
  }

  const { pendingLabel: _pendingLabel, ...mediaState } = currentMediaState;

  return {
    ...media,
    [fieldName]: mediaState,
  };
}

function resetRecordMediaState(
  media: GeneratedRecordWorkflowFixture["media"],
  fieldName: keyof GeneratedRecordValues,
) {
  if (!isGeneratedRecordMediaFieldName(fieldName) || !media[fieldName]) {
    return media;
  }

  return {
    ...media,
    [fieldName]: {
      previewHref: defaultRecordMediaPreviewHref(fieldName),
    },
  };
}

function defaultRecordMediaPreviewHref(fieldName: GeneratedRecordMediaFieldName) {
  if (fieldName === "heroImageId") {
    return "/astryx/generated/homepage-preview.png";
  }

  return "/astryx/generated/homepage-hero.png";
}

function fieldError(
  id: string,
  message: string,
  severity: AstryxFieldError["severity"] = "error",
): AstryxFieldError {
  return { id, message, severity };
}

function errorsAllowSubmit<TValues>(errors: FieldErrorMap<TValues>) {
  const fieldErrorsByName = Object.values(errors) as readonly (
    | readonly AstryxFieldError[]
    | undefined
  )[];

  return fieldErrorsByName.every((fieldErrors) =>
    (fieldErrors ?? []).every((error) => error.severity === "warning"),
  );
}

function isBlankText(value: AstryxFieldValue) {
  return typeof value !== "string" || value.trim() === "";
}

function numberDraftIsValid(value: AstryxFieldValue) {
  if (value === null) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" || Number.isFinite(Number(trimmedValue));
}

function opaqueHexColorIsValid(value: string) {
  const trimmedValue = value.trim();

  return /^#[0-9A-Fa-f]{6}$/.test(trimmedValue) || /^#[0-9A-Fa-f]{3}$/.test(trimmedValue);
}

function emailTextIsValid(value: AstryxFieldValue) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugifyFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function createEditorField(field: Omit<AstryxFieldEditorData, "mode">): AstryxFieldEditorData {
  return { ...field, mode: "editor" };
}

function createDisplayField(field: Omit<AstryxFieldDisplayData, "mode">): AstryxFieldDisplayData {
  return { ...field, mode: "display" };
}

function errorsFor<TValues>(
  errors: FieldErrorMap<TValues>,
  fieldName: keyof TValues,
): readonly AstryxFieldError[] | undefined {
  const fieldErrors = errors[fieldName];

  return fieldErrors?.length ? fieldErrors : undefined;
}

function displayOption(options: readonly AstryxFieldOption[], value: AstryxFieldValue) {
  if (typeof value !== "string") {
    return String(value ?? "");
  }

  return options.find((option) => option.value === value)?.label ?? value;
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}
