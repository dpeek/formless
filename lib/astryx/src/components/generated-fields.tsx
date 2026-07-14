import { useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FieldEditor,
  FieldEditorControl,
  FieldInputAttributes,
  FieldSchema,
  FieldValue,
  GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import { FormlessUiFieldRenderer, FormlessUiFieldSubmitFormAdapter } from "./fields/renderer.tsx";
import type {
  FormlessUiCreateField,
  FormlessUiDisplayField,
  FormlessUiEnumOption,
  FormlessUiField,
  FormlessUiFieldAccess,
  FormlessUiFieldControl,
  FormlessUiFieldDensity,
  FormlessUiFieldError,
  FormlessUiFieldFormatting,
  FormlessUiFieldIntent,
  FormlessUiFieldIntentHandler,
  FormlessUiFieldOptions,
  FormlessUiFieldPending,
  FormlessUiFieldSurface,
  FormlessUiOperationInputField,
  FormlessUiRecordField,
  FormlessUiRecordFieldRendererKind,
  FormlessUiReferenceFacts,
  FormlessUiReferenceValueStatus,
} from "../formless-ui-contract.ts";

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

type GeneratedFixtureFieldError = FormlessUiFieldError & {
  severity?: "error" | "warning";
};

type FieldErrorMap<TValues> = Partial<Record<keyof TValues, readonly GeneratedFixtureFieldError[]>>;
type GeneratedEditorField = Extract<FormlessUiField, { mode: "editor" }>;
type GeneratedDraftValue = FieldValue | string;

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
    audiences: readonly GeneratedFieldOption[];
    owners: readonly GeneratedFieldOption[];
    statuses: readonly GeneratedFieldOption[];
  };
};

type GeneratedFieldProjection = {
  createFields: readonly FormlessUiField[];
  detailFields: readonly FormlessUiField[];
  publicActionFields: readonly FormlessUiField[];
  recordEditFields: readonly FormlessUiField[];
  tableCellFields: readonly FormlessUiField[];
};

type GeneratedFieldPanelProps = {
  fields: readonly FormlessUiField[];
  title: string;
  actionLabel?: string;
  onIntent: FormlessUiFieldIntentHandler;
  onRecordRevert: (field: FormlessUiRecordField) => void;
  isPending?: boolean;
  isSubmitReady?: boolean;
  layout?: "stack" | "table-cells";
  onAction?: () => void;
};

type GeneratedFieldOption = {
  color?: string;
  detail?: string;
  isDisabled?: boolean;
  label: string;
  mediaAlt?: string;
  mediaPreviewUrl?: string;
  source?: string;
  value: string;
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

const generatedImagePreviews = {
  homepagePreview: "https://picsum.photos/seed/formless-homepage-preview/960/540",
  homepageHero: "https://picsum.photos/seed/formless-homepage-hero/1280/720",
  pickedContactPreview: "https://picsum.photos/seed/formless-contact-preview/960/540",
  pickedHomepageHero: "https://picsum.photos/seed/formless-picked-homepage-hero/1280/720",
};

const generatedImagePickerOptions = [
  {
    value: "image-picked-contact-preview",
    label: "Contact",
    detail: "Public sample",
    mediaAlt: "Contact page preview",
    mediaPreviewUrl: generatedImagePreviews.pickedContactPreview,
  },
  {
    value: "image-picked-studio-workspace",
    label: "Studio",
    detail: "Public sample",
    mediaAlt: "Studio workspace",
    mediaPreviewUrl: "https://picsum.photos/seed/formless-studio-workspace/960/540",
  },
  {
    value: "image-picked-product-detail",
    label: "Detail",
    detail: "Public sample",
    mediaAlt: "Product detail preview",
    mediaPreviewUrl: "https://picsum.photos/seed/formless-product-detail/960/540",
  },
  {
    value: "image-picked-launch-cover",
    label: "Launch",
    detail: "Public sample",
    mediaAlt: "Launch cover",
    mediaPreviewUrl: "https://picsum.photos/seed/formless-launch-cover/960/540",
  },
] satisfies readonly GeneratedFieldOption[];

const generatedMediaPickerOptions = [
  {
    value: "media-picked-homepage-hero",
    label: "Hero",
    detail: "Public sample",
    mediaAlt: "Homepage hero",
    mediaPreviewUrl: generatedImagePreviews.pickedHomepageHero,
  },
  ...generatedImagePickerOptions,
] satisfies readonly GeneratedFieldOption[];

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
  const handleIntent = useMemo<FormlessUiFieldIntentHandler>(
    () => (intent) => {
      setGeneratedFieldFoundationFixture((currentFixture) =>
        applyGeneratedFieldIntent(currentFixture, generatedFieldProjection, intent),
      );
    },
    [generatedFieldProjection],
  );
  const handleRecordRevert = (field: FormlessUiRecordField) => {
    setGeneratedFieldFoundationFixture((currentFixture) =>
      revertGeneratedField(currentFixture, field),
    );
  };

  return (
    <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
      <VStack gap={6} maxWidth={920} width="100%">
        <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap" width="100%">
          <VStack gap={1}>
            <Heading level={1}>Generated Fields</Heading>
            <Text type="body" as="p" color="secondary">
              A task record and public contact action projected into Formless UI field data.
            </Text>
          </VStack>
        </HStack>
        <VStack gap={4} width="100%">
          <GeneratedFieldPanel
            title="Create Task"
            fields={generatedFieldProjection.createFields}
            actionLabel="Create task"
            onIntent={handleIntent}
            onRecordRevert={handleRecordRevert}
            isPending={generatedFieldFoundationFixture.create.isPending}
            isSubmitReady={generatedFieldFoundationFixture.create.submitReady}
            onAction={() =>
              setGeneratedFieldFoundationFixture((currentFixture) =>
                submitGeneratedCreate(currentFixture),
              )
            }
          />
          <GeneratedFieldPanel
            title="Record Edit"
            fields={generatedFieldProjection.recordEditFields}
            onIntent={handleIntent}
            onRecordRevert={handleRecordRevert}
          />
          <GeneratedFieldPanel
            title="Table Cells"
            fields={generatedFieldProjection.tableCellFields}
            onIntent={handleIntent}
            onRecordRevert={handleRecordRevert}
            layout="table-cells"
          />
          <GeneratedFieldPanel
            title="Detail"
            fields={generatedFieldProjection.detailFields}
            onIntent={handleIntent}
            onRecordRevert={handleRecordRevert}
          />
          <GeneratedFieldPanel
            title="Public Contact Action"
            fields={generatedFieldProjection.publicActionFields}
            actionLabel="Send message"
            onIntent={handleIntent}
            onRecordRevert={handleRecordRevert}
            isPending={generatedFieldFoundationFixture.publicAction.isPending}
            isSubmitReady={generatedFieldFoundationFixture.publicAction.submitReady}
            onAction={() =>
              setGeneratedFieldFoundationFixture((currentFixture) =>
                submitGeneratedPublicAction(currentFixture),
              )
            }
          />
        </VStack>
      </VStack>
    </VStack>
  );
}

function GeneratedFieldPanel({
  actionLabel,
  fields,
  isPending = false,
  isSubmitReady,
  layout = "stack",
  onIntent,
  onRecordRevert,
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
          includeSubmitAdapters={Boolean(actionLabel)}
          isSubmitLocked={isPending}
          layout={layout}
          onIntent={onIntent}
          onRecordRevert={onRecordRevert}
        />
        {actionLabel ? (
          <Button
            label={actionLabel}
            variant="primary"
            isDisabled={!isSubmitReady || isPending}
            isLoading={isPending}
            onClick={onAction}
          />
        ) : null}
      </VStack>
    </Card>
  );
}

function GeneratedFieldList({
  fields,
  includeSubmitAdapters,
  isSubmitLocked,
  layout,
  onIntent,
  onRecordRevert,
}: {
  fields: readonly FormlessUiField[];
  includeSubmitAdapters: boolean;
  isSubmitLocked: boolean;
  layout: "stack" | "table-cells";
  onIntent: FormlessUiFieldIntentHandler;
  onRecordRevert: (field: FormlessUiRecordField) => void;
}) {
  if (layout === "table-cells") {
    return (
      <Grid columns={{ minWidth: 112, max: 3 }} gap={2} width="100%">
        {fields.map((field) => (
          <GeneratedField
            key={generatedFieldKey(field)}
            field={field}
            includeSubmitAdapter={includeSubmitAdapters}
            isSubmitLocked={isSubmitLocked}
            onIntent={onIntent}
            onRecordRevert={onRecordRevert}
          />
        ))}
      </Grid>
    );
  }

  return (
    <VStack gap={3}>
      {fields.map((field) => (
        <GeneratedField
          key={generatedFieldKey(field)}
          field={field}
          includeSubmitAdapter={includeSubmitAdapters}
          isSubmitLocked={isSubmitLocked}
          onIntent={onIntent}
          onRecordRevert={onRecordRevert}
        />
      ))}
    </VStack>
  );
}

function GeneratedField({
  field,
  includeSubmitAdapter,
  isSubmitLocked,
  onIntent,
  onRecordRevert,
}: {
  field: FormlessUiField;
  includeSubmitAdapter: boolean;
  isSubmitLocked: boolean;
  onIntent: FormlessUiFieldIntentHandler;
  onRecordRevert: (field: FormlessUiRecordField) => void;
}) {
  const renderedField = isSubmitLocked ? lockSubmitField(field) : field;

  return (
    <VStack gap={1}>
      <FormlessUiFieldRenderer field={renderedField} onIntent={onIntent} />
      {includeSubmitAdapter ? <FormlessUiFieldSubmitFormAdapter field={renderedField} /> : null}
      <GeneratedFieldMeta
        field={renderedField}
        onIntent={onIntent}
        onRecordRevert={onRecordRevert}
      />
    </VStack>
  );
}

function lockSubmitField(field: FormlessUiField): FormlessUiField {
  if (field.mode !== "editor") {
    return field;
  }

  return {
    ...field,
    access:
      field.access.kind === "editable"
        ? { kind: "disabled", canPatch: false, writable: true }
        : field.access,
    pending: undefined,
  };
}

function GeneratedFieldMeta({
  field,
  onIntent,
  onRecordRevert,
}: {
  field: FormlessUiField;
  onIntent: FormlessUiFieldIntentHandler;
  onRecordRevert: (field: FormlessUiRecordField) => void;
}) {
  const isPending = Boolean(field.pending?.isPending);
  const isFieldCommit = isRecordField(field) && field.commit === "field-commit";
  const hasMeta = isPending || isFieldCommit;

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
              onClick={() =>
                onIntent({
                  type: "recordValueCommit",
                  fieldName: field.fieldName,
                  value: generatedRecordFieldDraftValue(field),
                })
              }
            />
            <Button
              label="Revert"
              variant="secondary"
              isDisabled={isPending || !fieldIsDirty(field)}
              onClick={() => onRecordRevert(field)}
            />
          </>
        ) : null}
      </HStack>
    </VStack>
  );
}

function createGeneratedFieldFoundationFixture(): GeneratedFieldFoundationFixture {
  const committedValues = {
    accent: "#2563eb",
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
        accent: "#0f766e",
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
          previewHref: generatedImagePreviews.homepagePreview,
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
        contactEmail: [fieldError("contactEmail", "Email is required.")],
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
          previewHref: generatedImagePreviews.homepagePreview,
        },
        heroMediaId: {
          previewHref: generatedImagePreviews.homepageHero,
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
    publicActionFields,
    recordEditFields,
    tableCellFields,
  };
}

function projectCreateFields(fixture: GeneratedFieldFoundationFixture): readonly FormlessUiField[] {
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
      pending: pendingForCreateField(create, "title"),
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
      pending: pendingForCreateField(create, "summary"),
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
      pending: pendingForCreateField(create, "ownerId"),
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
      pending: pendingForCreateField(create, "estimateHours"),
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
      pending: pendingForCreateField(create, "accent"),
      errors: errorsFor(create.errors, "accent"),
    }),
    createEditorField({
      id: "generated-create-media-image",
      name: "heroImageId",
      label: "Hero Image",
      surface: "create",
      density: "balanced",
      accessMode: "editable",
      kind: "media",
      draftValue: create.draftValues.heroImageId,
      committedDisplayValue: "",
      commitPolicy: "submit",
      presentation: {
        mediaAlt: "Homepage preview",
        mediaPreviewUrl: mediaPreviewHref(
          create.media.heroImageId,
          generatedImagePreviews.homepagePreview,
        ),
      },
      options: generatedImagePickerOptions,
      pending: pendingForCreateField(create, "heroImageId"),
      errors: errorsFor(create.errors, "heroImageId"),
    }),
  ];
}

function projectRecordEditFields(
  fixture: GeneratedFieldFoundationFixture,
): readonly FormlessUiField[] {
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
          generatedImagePreviews.homepageHero,
        ),
      },
      options: generatedMediaPickerOptions,
      pending: pendingForRecordField(record, "heroMediaId", "Preparing upload"),
      errors: errorsFor(record.errors, "heroMediaId"),
    }),
  ];
}

function projectTableCellFields(
  fixture: GeneratedFieldFoundationFixture,
): readonly FormlessUiField[] {
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
      options: referenceOptions.owners,
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

function projectDetailFields(fixture: GeneratedFieldFoundationFixture): readonly FormlessUiField[] {
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
      options: referenceOptions.owners,
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
      id: "generated-detail-media-image",
      name: "heroImageId",
      label: "Hero Image",
      surface: "detail",
      density: "balanced",
      accessMode: "read-only",
      kind: "media",
      value: record.committedValues.heroImageId,
      displayValue: record.committedValues.heroImageId,
      presentation: {
        mediaAlt: "Homepage preview",
        mediaPreviewUrl: mediaPreviewHref(
          record.media.heroImageId,
          generatedImagePreviews.homepagePreview,
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
          generatedImagePreviews.homepageHero,
        ),
      },
      pending: pendingForRecordField(record, "heroMediaId", "Preparing upload"),
    }),
  ];
}

function projectPublicActionFields(
  fixture: GeneratedFieldFoundationFixture,
): readonly FormlessUiField[] {
  const { publicAction, referenceOptions } = fixture;

  return [
    createEditorField({
      id: "generated-public-contact-name",
      name: "contactName",
      label: "Name",
      isRequired: true,
      surface: "operation",
      density: "balanced",
      accessMode: "editable",
      kind: "text",
      draftValue: publicAction.draftValues.contactName,
      committedDisplayValue: "",
      commitPolicy: "submit",
      errors: errorsFor(publicAction.errors, "contactName"),
    }),
    createEditorField({
      id: "generated-public-contact-email",
      name: "contactEmail",
      label: "Email",
      isRequired: true,
      surface: "operation",
      density: "balanced",
      accessMode: "editable",
      kind: "text",
      draftValue: publicAction.draftValues.contactEmail,
      committedDisplayValue: "",
      commitPolicy: "submit",
      presentation: { format: "email", placeholder: "name@example.com" },
      errors: errorsFor(publicAction.errors, "contactEmail"),
    }),
    createEditorField({
      id: "generated-public-message",
      name: "message",
      label: "Message",
      surface: "operation",
      density: "balanced",
      accessMode: "editable",
      kind: "long-text",
      draftValue: publicAction.draftValues.message,
      committedDisplayValue: "",
      commitPolicy: "submit",
      errors: errorsFor(publicAction.errors, "message"),
    }),
    createEditorField({
      id: "generated-public-audience",
      name: "audienceId",
      label: "Audience",
      surface: "operation",
      density: "balanced",
      accessMode: "editable",
      kind: "reference",
      draftValue: publicAction.draftValues.audienceId,
      committedDisplayValue: "",
      commitPolicy: "submit",
      options: referenceOptions.audiences,
      errors: errorsFor(publicAction.errors, "audienceId"),
    }),
    createEditorField({
      id: "generated-public-subscribe",
      name: "subscribe",
      label: "Subscribe",
      surface: "operation",
      density: "balanced",
      accessMode: "editable",
      kind: "boolean",
      draftValue: publicAction.draftValues.subscribe,
      committedDisplayValue: "",
      commitPolicy: "submit",
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

function applyGeneratedFieldIntent(
  fixture: GeneratedFieldFoundationFixture,
  projection: GeneratedFieldProjection,
  intent: FormlessUiFieldIntent,
): GeneratedFieldFoundationFixture {
  if (intent.type === "createDraftChange") {
    return isGeneratedCreateFieldName(intent.fieldName)
      ? changeGeneratedDraft(
          fixture,
          projection,
          { scope: "create", fieldName: intent.fieldName },
          draftValueFromInput(intent.fieldValue),
        )
      : fixture;
  }

  if (intent.type === "operationDraftChange") {
    return isGeneratedPublicActionFieldName(intent.inputName)
      ? changeGeneratedDraft(
          fixture,
          projection,
          { scope: "publicAction", fieldName: intent.inputName },
          draftValueFromInput(intent.inputValue),
        )
      : fixture;
  }

  if (intent.type === "recordEditorDraftChange") {
    return isGeneratedRecordFieldName(intent.fieldName)
      ? changeGeneratedDraft(
          fixture,
          projection,
          { scope: "record", fieldName: intent.fieldName },
          intent.value,
        )
      : fixture;
  }

  if (intent.type === "recordDraftChange") {
    return isGeneratedRecordFieldName(intent.fieldName)
      ? changeGeneratedDraft(
          fixture,
          projection,
          { scope: "record", fieldName: intent.fieldName },
          draftValueFromInput(intent.fieldValue),
        )
      : fixture;
  }

  if (intent.type === "recordDraftCommit") {
    return isGeneratedRecordFieldName(intent.fieldName)
      ? commitGeneratedRecordField(
          fixture,
          projection,
          intent.fieldName,
          draftValueFromInput(intent.fieldValue),
        )
      : fixture;
  }

  if (intent.type === "recordDraftRevert") {
    if (!isGeneratedRecordFieldName(intent.fieldName)) {
      return fixture;
    }

    const field = findGeneratedRecordField(projection, intent.fieldName);
    return field ? revertGeneratedField(fixture, field) : fixture;
  }

  if (intent.type === "recordValueCommit") {
    return isGeneratedRecordFieldName(intent.fieldName)
      ? commitGeneratedRecordField(fixture, projection, intent.fieldName, intent.value)
      : fixture;
  }

  if (intent.type === "recordValueUnitCommit") {
    return isGeneratedRecordFieldName(intent.fieldName)
      ? commitGeneratedRecordField(
          fixture,
          projection,
          intent.fieldName,
          draftValueFromInput(intent.commit.fieldDraftInput),
        )
      : fixture;
  }

  if (intent.type === "fieldErrorChange") {
    return isGeneratedRecordFieldName(intent.fieldName)
      ? applyGeneratedFieldErrorChange(fixture, intent.fieldName, intent.message)
      : fixture;
  }

  if (intent.type === "mediaAssetSelect") {
    return applyGeneratedMediaPickerIntent(fixture, projection, intent.fieldName, intent.assetId);
  }

  if (intent.type === "mediaFileSelect") {
    return intent.file
      ? applyGeneratedMediaUploadIntent(fixture, projection, intent.fieldName, intent.file)
      : fixture;
  }

  return fixture;
}

function changeGeneratedDraft(
  fixture: GeneratedFieldFoundationFixture,
  projection: GeneratedFieldProjection,
  target: GeneratedEditorFieldTarget,
  value: GeneratedDraftValue,
): GeneratedFieldFoundationFixture {
  if (target.scope === "create") {
    const mediaState = generatedMediaStateForDraft(
      projection.createFields,
      target.fieldName,
      value,
    );

    return validateGeneratedFieldFixture({
      ...fixture,
      create: {
        ...fixture.create,
        isPending: false,
        draftValues: {
          ...fixture.create.draftValues,
          [target.fieldName]: value,
        } as GeneratedCreateValues,
        media: mediaState
          ? {
              ...fixture.create.media,
              [target.fieldName]: mediaState,
            }
          : fixture.create.media,
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

  return validateGeneratedFieldFixture({
    ...fixture,
    record: {
      ...fixture.record,
      draftValues: {
        ...fixture.record.draftValues,
        [target.fieldName]: value,
      } as GeneratedRecordValues,
    },
  });
}

function commitGeneratedRecordField(
  fixture: GeneratedFieldFoundationFixture,
  projection: GeneratedFieldProjection,
  fieldName: keyof GeneratedRecordValues,
  value: FieldValue,
): GeneratedFieldFoundationFixture {
  const validatedFixture = validateGeneratedFieldFixture(fixture);
  const fieldErrors = validatedFixture.record.errors[fieldName] ?? [];

  if (fieldErrors.some((error) => (error.severity ?? "error") === "error")) {
    return validatedFixture;
  }

  const field = findGeneratedRecordField(projection, fieldName);
  const committedValue = normalizeCommittedValue(field, value);

  return validateGeneratedFieldFixture({
    ...validatedFixture,
    record: {
      ...validatedFixture.record,
      committedValues: {
        ...validatedFixture.record.committedValues,
        [fieldName]: committedValue,
      } as GeneratedRecordValues,
      draftValues: {
        ...validatedFixture.record.draftValues,
        [fieldName]: committedValue,
      } as GeneratedRecordValues,
      media: clearRecordMediaPending(validatedFixture.record.media, fieldName),
    },
  });
}

function revertGeneratedField(
  fixture: GeneratedFieldFoundationFixture,
  field: FormlessUiRecordField,
): GeneratedFieldFoundationFixture {
  const fieldName = field.fieldName;

  if (!isGeneratedRecordFieldName(fieldName)) {
    return fixture;
  }

  return validateGeneratedFieldFixture({
    ...fixture,
    record: {
      ...fixture.record,
      draftValues: {
        ...fixture.record.draftValues,
        [fieldName]: fixture.record.committedValues[fieldName],
      } as GeneratedRecordValues,
      media: resetRecordMediaState(fixture.record.media, fieldName),
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
  projection: GeneratedFieldProjection,
  fieldName: string,
  assetId: string,
): GeneratedFieldFoundationFixture {
  const target = resolveMediaFieldTarget(fieldName);

  if (!target) {
    return fixture;
  }

  const selectedOption = findGeneratedMediaAssetOption(projection, fieldName, assetId);
  const previewHref =
    selectedOption?.href ??
    (target.scope === "create"
      ? generatedImagePreviews.pickedContactPreview
      : generatedImagePreviews.pickedHomepageHero);

  return applyGeneratedMediaIntentResult(fixture, target, {
    assetId,
    previewHref,
    source: "picker",
  });
}

function applyGeneratedMediaUploadIntent(
  fixture: GeneratedFieldFoundationFixture,
  projection: GeneratedFieldProjection,
  fieldName: string,
  file: File,
): GeneratedFieldFoundationFixture {
  const target = resolveMediaFieldTarget(fieldName);

  if (!target) {
    return fixture;
  }

  const field = findGeneratedEditorField(projection, fieldName);
  const fileName = file.name || `${fieldName}.png`;
  const assetId = `${field?.control.controlKind ?? "media"}-upload-${slugifyFileName(fileName)}`;
  const previewHref = URL.createObjectURL(file);

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
  const recordErrors = validateRecordValues(fixture.record.draftValues);

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
    errors.title = [fieldError("title", "Task is required.")];
  }

  if (isBlankText(values.ownerId)) {
    errors.ownerId = [fieldError("ownerId", "Owner is required.")];
  }

  if (!numberDraftIsValid(values.estimateHours)) {
    errors.estimateHours = [
      fieldError("estimateHours", "Estimate keeps invalid text until it is numeric."),
    ];
  }

  if (
    typeof values.accent === "string" &&
    values.accent !== "" &&
    !opaqueHexColorIsValid(values.accent)
  ) {
    errors.accent = [fieldError("accent", "Use an opaque hex color.")];
  }

  return errors;
}

function validatePublicActionValues(
  values: GeneratedPublicActionValues,
): FieldErrorMap<GeneratedPublicActionValues> {
  const errors: FieldErrorMap<GeneratedPublicActionValues> = {};

  if (isBlankText(values.contactName)) {
    errors.contactName = [fieldError("contactName", "Name is required.")];
  }

  if (isBlankText(values.contactEmail)) {
    errors.contactEmail = [fieldError("contactEmail", "Email is required.")];
  } else if (!emailTextIsValid(values.contactEmail)) {
    errors.contactEmail = [fieldError("contactEmail", "Enter a valid email address.")];
  }

  if (isBlankText(values.audienceId)) {
    errors.audienceId = [fieldError("audienceId", "Audience is required.")];
  }

  return errors;
}

function validateRecordValues(values: GeneratedRecordValues): FieldErrorMap<GeneratedRecordValues> {
  const errors: FieldErrorMap<GeneratedRecordValues> = {};

  if (isBlankText(values.title)) {
    errors.title = [fieldError("title", "Task is required.")];
  }

  if (!numberDraftIsValid(values.estimateHours)) {
    errors.estimateHours = [
      fieldError("estimateHours", "Estimate keeps invalid text until it is numeric."),
    ];
  }

  return errors;
}

function resolveMediaFieldTarget(fieldName: string): GeneratedMediaFieldTarget | null {
  if (isGeneratedCreateFieldName(fieldName) && isGeneratedCreateMediaFieldName(fieldName)) {
    return { scope: "create", fieldName };
  }

  if (isGeneratedRecordFieldName(fieldName) && isGeneratedRecordMediaFieldName(fieldName)) {
    return { scope: "record", fieldName };
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
  field: FormlessUiRecordField | undefined,
  value: FieldValue,
): FieldValue {
  if (field?.field.type !== "number" || typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return "";
  }

  const numericValue = Number(trimmedValue);

  return Number.isFinite(numericValue) ? numericValue : value;
}

function pendingForCreateField(
  create: GeneratedCreateWorkflowFixture,
  fieldName: keyof GeneratedCreateValues,
): FormlessUiFieldPending | undefined {
  const mediaState = isGeneratedCreateMediaFieldName(fieldName)
    ? create.media[fieldName]
    : undefined;

  if (mediaState?.pendingLabel) {
    return { isPending: true, label: mediaState.pendingLabel };
  }

  return undefined;
}

function pendingForRecordField(
  record: GeneratedRecordWorkflowFixture,
  fieldName: keyof GeneratedRecordValues,
  label: string,
): FormlessUiFieldPending | undefined {
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

function fieldIsDirty(field: FormlessUiRecordField) {
  return generatedRecordFieldDraftValue(field) !== (field.drafts.recordValue ?? null);
}

function fieldHasBlockingError(field: FormlessUiField) {
  const errors = field.errors as readonly GeneratedFixtureFieldError[] | undefined;

  return errors?.some((error) => (error.severity ?? "error") === "error") ?? false;
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
    return generatedImagePreviews.homepagePreview;
  }

  return generatedImagePreviews.homepageHero;
}

function fieldError(
  fieldName: string,
  message: string,
  severity: GeneratedFixtureFieldError["severity"] = "error",
): GeneratedFixtureFieldError {
  return { fieldName, message, severity };
}

function errorsAllowSubmit<TValues>(errors: FieldErrorMap<TValues>) {
  const fieldErrorsByName = Object.values(errors) as readonly (
    | readonly GeneratedFixtureFieldError[]
    | undefined
  )[];

  return fieldErrorsByName.every((fieldErrors) =>
    (fieldErrors ?? []).every((error) => error.severity === "warning"),
  );
}

function isBlankText(value: GeneratedDraftValue) {
  return typeof value !== "string" || value.trim() === "";
}

function numberDraftIsValid(value: GeneratedDraftValue) {
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

function emailTextIsValid(value: GeneratedDraftValue) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugifyFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

type GeneratedFieldKind =
  | "boolean"
  | "color"
  | "enum"
  | "long-text"
  | "markdown"
  | "media"
  | "number"
  | "reference"
  | "source-icon"
  | "text";

type GeneratedFieldAccessMode = "disabled" | "editable" | "read-only";
type GeneratedFieldDensity = "balanced" | "comfortable" | "compact";
type GeneratedFieldCommitPolicy = "field" | "immediate" | "submit";

type GeneratedFieldPresentation = {
  accept?: string;
  format?: "email";
  maxLines?: number;
  mediaAlt?: string;
  mediaPreviewUrl?: string;
  placeholder?: string;
  sourceIcon?: string;
};

type GeneratedFieldInput = {
  accessMode: GeneratedFieldAccessMode;
  density: GeneratedFieldDensity;
  errors?: readonly GeneratedFixtureFieldError[];
  id: string;
  isRequired?: boolean;
  kind: GeneratedFieldKind;
  label: string;
  name: string;
  options?: readonly GeneratedFieldOption[];
  pending?: FormlessUiFieldPending;
  presentation?: GeneratedFieldPresentation;
  surface: FormlessUiFieldSurface;
};

type GeneratedEditorFieldInput = GeneratedFieldInput & {
  commitPolicy: GeneratedFieldCommitPolicy;
  committedDisplayValue: string;
  committedValue?: GeneratedDraftValue;
  draftValue: GeneratedDraftValue;
};

type GeneratedDisplayFieldInput = GeneratedFieldInput & {
  displayValue: string;
  value: GeneratedDraftValue;
};

function createEditorField(input: GeneratedEditorFieldInput): FormlessUiField {
  const field = generatedFieldSchema(input);
  const control = generatedFieldControl(input, field);
  const options = generatedFieldOptions(input, field, input.draftValue);
  const base = generatedBaseField(
    input,
    field,
    control,
    options,
    generatedReferenceEditorFacts(input, field, input.draftValue),
  );
  const draftInput = draftInputFromValue(input.draftValue);

  if (input.surface === "create") {
    return {
      ...base,
      access: generatedFieldAccess(input.accessMode),
      commit: "submit",
      density: generatedFieldDensity(input.density),
      draftInput,
      mode: "editor",
      surface: "create",
      value: input.draftValue,
    } satisfies FormlessUiCreateField;
  }

  if (input.surface === "operation") {
    return {
      ...base,
      access: generatedFieldAccess(input.accessMode),
      commit: "submit",
      density: generatedFieldDensity(input.density),
      draftInput,
      input: generatedOperationInput(input, field),
      inputName: input.name,
      mode: "editor",
      surface: "operation",
      value: input.draftValue,
    } satisfies FormlessUiOperationInputField;
  }

  return {
    ...base,
    access: generatedFieldAccess(input.accessMode),
    commit: generatedCommitPolicy(input.commitPolicy),
    density: generatedFieldDensity(input.density),
    drafts: {
      draft: String(input.draftValue ?? ""),
      draftInput,
      recordValue: input.committedValue,
    },
    formatting: {
      displayValue: input.committedDisplayValue,
    },
    media: generatedMediaAuthoring(input),
    mode: "editor",
    presentationMode: "default",
    rendererKind: generatedRendererKind(input.kind),
    surface: input.surface,
  } satisfies FormlessUiRecordField;
}

function createDisplayField(input: GeneratedDisplayFieldInput): FormlessUiDisplayField {
  const field = generatedFieldSchema(input);
  const control = generatedFieldControl(input, field);
  const displayValue =
    input.kind === "source-icon" && input.presentation?.sourceIcon
      ? input.presentation.sourceIcon
      : input.value;
  const options = generatedFieldOptions(input, field, displayValue);

  return {
    ...generatedBaseField(
      input,
      field,
      control,
      options,
      generatedReferenceDisplayFacts(input, field, displayValue),
    ),
    access: generatedFieldAccess(input.accessMode),
    commit: "submit",
    density: generatedFieldDensity(input.density),
    formatting: generatedDisplayFormatting(input, field),
    mode: "display",
    surface: input.surface,
    value: displayValue,
  };
}

function generatedBaseField(
  input: GeneratedFieldInput,
  field: FieldSchema,
  control: FormlessUiFieldControl,
  options: FormlessUiFieldOptions | undefined,
  reference: FormlessUiReferenceFacts | undefined,
) {
  return {
    control,
    editor: control.editor,
    errors: input.errors,
    field,
    fieldName: input.name,
    label: input.label,
    labelVisibility:
      input.surface === "record" || input.surface === "table-cell"
        ? ("hidden" as const)
        : ("visible" as const),
    options,
    pending: input.pending,
    reference,
    required: Boolean(input.isRequired),
    surface: input.surface,
  };
}

function generatedFieldSchema(input: GeneratedFieldInput): FieldSchema {
  if (input.kind === "boolean") {
    return { type: "boolean", required: Boolean(input.isRequired), label: input.label };
  }

  if (input.kind === "number") {
    return { type: "number", required: Boolean(input.isRequired), label: input.label };
  }

  if (input.kind === "enum") {
    return {
      type: "enum",
      required: Boolean(input.isRequired),
      label: input.label,
      values: Object.fromEntries(
        (input.options ?? []).map((option) => [
          option.value,
          {
            label: option.label,
            presentation: option.color ? { color: option.color } : undefined,
          },
        ]),
      ),
    };
  }

  if (input.kind === "reference") {
    return {
      type: "reference",
      required: Boolean(input.isRequired),
      label: input.label,
      to: "principal",
    };
  }

  return {
    type: "text",
    required: Boolean(input.isRequired),
    label: input.label,
    format:
      input.kind === "long-text"
        ? "longText"
        : input.kind === "markdown"
          ? "markdown"
          : input.kind === "color"
            ? "color"
            : input.kind === "source-icon"
              ? "icon"
              : input.presentation?.format,
  };
}

function generatedFieldControl(
  input: GeneratedFieldInput,
  field: FieldSchema,
): FormlessUiFieldControl {
  const common = {
    createDefaultValue: undefined,
    createDefaultChecked: false,
    inputAttributes: generatedInputAttributes(field),
    label: input.label,
    required: Boolean(input.isRequired),
  };

  if (field.type === "boolean") {
    return {
      ...common,
      control: { kind: "checkbox" },
      controlKind: "checkbox",
      editor: "boolean",
      field,
      kind: "boolean",
    };
  }

  if (field.type === "number") {
    return {
      ...common,
      control: { kind: "formattedNumber" },
      controlKind: "number",
      editor: "number",
      field,
      kind: "number",
    };
  }

  if (field.type === "enum") {
    return {
      ...common,
      control: { kind: "select" },
      controlKind: "select",
      createDefaultValue: field.default,
      editor: "enum",
      field,
      kind: "enum",
    };
  }

  if (field.type === "reference") {
    return {
      ...common,
      control: { kind: "reference" },
      controlKind: "reference",
      editor: "reference",
      field,
      kind: "reference",
    };
  }

  const textField = field as Extract<FieldSchema, { type: "text" }>;
  const editor = generatedTextEditor(input.kind, input.presentation);

  return {
    ...common,
    control: generatedTextEditorControl(editor),
    controlKind: generatedTextControlKind(editor),
    editor,
    field: textField,
    kind: "text",
  };
}

function generatedInputAttributes(field: FieldSchema): FieldInputAttributes {
  if (field.type !== "number") {
    return {};
  }

  return {
    max: field.max,
    min: field.min,
    step: field.integer ? "1" : "any",
  };
}

function generatedTextEditor(
  kind: GeneratedFieldKind,
  presentation: GeneratedFieldPresentation | undefined,
): Extract<
  FieldEditor,
  "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
> {
  if (kind === "color") {
    return "color";
  }

  if (kind === "long-text") {
    return "textarea";
  }

  if (kind === "markdown") {
    return "markdown";
  }

  if (kind === "media") {
    return "media";
  }

  if (kind === "source-icon") {
    return "icon";
  }

  if (presentation?.format === "email") {
    return "text";
  }

  return "text";
}

function generatedTextEditorControl(editor: FieldEditor): FieldEditorControl {
  if (editor === "media") {
    return { kind: "mediaUpload" };
  }

  if (editor === "icon") {
    return { kind: "icon" };
  }

  if (editor === "markdown" || editor === "textarea") {
    return { kind: "textarea" };
  }

  return { kind: "input", inputType: "text" };
}

function generatedTextControlKind(
  editor: Extract<
    FieldEditor,
    "color" | "href" | "icon" | "markdown" | "media" | "slug" | "text" | "textarea"
  >,
): Extract<
  FormlessUiFieldControl["controlKind"],
  "color" | "icon" | "markdown" | "media" | "text" | "textarea"
> {
  if (editor === "href" || editor === "slug") {
    return "text";
  }

  return editor;
}

function generatedFieldAccess(accessMode: GeneratedFieldAccessMode): FormlessUiFieldAccess {
  if (accessMode === "disabled") {
    return { kind: "disabled", canPatch: false, writable: true };
  }

  if (accessMode === "read-only") {
    return { kind: "readOnly", writable: false };
  }

  return { kind: "editable", canPatch: true, writable: true };
}

function generatedCommitPolicy(
  commitPolicy: GeneratedFieldCommitPolicy,
): FormlessUiRecordField["commit"] {
  return commitPolicy === "immediate" ? "immediate" : "field-commit";
}

function generatedFieldDensity(density: GeneratedFieldDensity): FormlessUiFieldDensity {
  return density === "compact" ? "compact" : "default";
}

function generatedRendererKind(kind: GeneratedFieldKind): FormlessUiRecordFieldRendererKind {
  if (kind === "boolean") {
    return "checkbox";
  }

  if (kind === "long-text") {
    return "textarea";
  }

  if (kind === "source-icon") {
    return "icon";
  }

  return kind;
}

function generatedDisplayFormatting(
  input: GeneratedDisplayFieldInput,
  field: FieldSchema,
): FormlessUiFieldFormatting & { displayValue: string } {
  const enumOption = input.options?.find((option) => option.value === input.value);

  return {
    displayValue: input.displayValue,
    enumValuePresentation:
      field.type === "enum" && typeof input.value === "string"
        ? {
            ...enumPresentationForOption(enumOption),
            label: enumOption?.label ?? input.displayValue,
          }
        : undefined,
  };
}

function generatedFieldOptions(
  input: GeneratedFieldInput,
  field: FieldSchema,
  selectedValue: GeneratedDraftValue,
): FormlessUiFieldOptions | undefined {
  if (field.type === "enum") {
    const enumOptions = (input.options ?? []).map(generatedEnumOption);

    return {
      enumOptions,
    };
  }

  if (field.type === "reference") {
    return {
      referenceOptions: generatedReferenceOptions(input),
    };
  }

  if (input.kind === "media") {
    return {
      mediaAssetOptions: generatedMediaAssetOptions(input, selectedValue),
    };
  }

  return undefined;
}

function generatedReferenceOptions(input: GeneratedFieldInput) {
  return (input.options ?? []).map((option) => ({
    id: option.value,
    label: option.label,
  }));
}

function generatedReferenceEditorFacts(
  input: GeneratedFieldInput,
  field: FieldSchema,
  value: GeneratedDraftValue,
): FormlessUiReferenceFacts | undefined {
  if (field.type !== "reference") {
    return undefined;
  }

  return {
    clearable: !field.required,
    kind: "editor",
    valueStatus: generatedReferenceValueStatus(input, value),
  };
}

function generatedReferenceDisplayFacts(
  input: GeneratedFieldInput,
  field: FieldSchema,
  value: GeneratedDraftValue,
): FormlessUiReferenceFacts | undefined {
  if (field.type !== "reference") {
    return undefined;
  }

  return {
    kind: "display",
    valueStatus: generatedReferenceValueStatus(input, value),
  };
}

function generatedReferenceValueStatus(
  input: GeneratedFieldInput,
  value: GeneratedDraftValue,
): FormlessUiReferenceValueStatus {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }

  return generatedReferenceOptions(input).some((option) => option.id === value)
    ? { kind: "resolved", value }
    : { kind: "missing", value };
}

function generatedEnumOption(option: GeneratedFieldOption): FormlessUiEnumOption {
  return {
    label: option.label,
    presentation: enumPresentationForOption(option),
    status: "declared",
    value: option.value,
  };
}

function enumPresentationForOption(
  option: GeneratedFieldOption | undefined,
): FormlessUiEnumOption["presentation"] {
  return {
    color: {
      intent: "neutral",
      known: Boolean(option?.color),
      token: option?.color,
    },
    ...(option?.source ? { icon: { kind: "svg" as const, source: option.source } } : {}),
    iconKnown: true,
    label: option?.label ?? "",
  };
}

function generatedMediaAssetOptions(
  input: GeneratedFieldInput,
  selectedValue: GeneratedDraftValue,
): NonNullable<FormlessUiFieldOptions["mediaAssetOptions"]> {
  const options = (input.options ?? []).map((option) => ({
    height: undefined,
    href: option.mediaPreviewUrl ?? "",
    id: option.value,
    label: option.label,
    width: undefined,
  }));

  if (
    typeof selectedValue === "string" &&
    selectedValue !== "" &&
    input.presentation?.mediaPreviewUrl &&
    !options.some((option) => option.id === selectedValue)
  ) {
    return [
      ...options,
      {
        href: input.presentation.mediaPreviewUrl,
        id: selectedValue,
        label: input.label,
      },
    ];
  }

  return options;
}

function generatedMediaAuthoring(input: GeneratedEditorFieldInput): FormlessUiRecordField["media"] {
  if (input.kind !== "media") {
    return undefined;
  }

  return {
    fileSelectEnabled: true,
    mediaPreviewHref: input.presentation?.mediaPreviewUrl,
    ...(input.presentation?.mediaPreviewUrl === undefined
      ? {}
      : { previewHref: input.presentation.mediaPreviewUrl }),
    ...(typeof input.draftValue === "string" && input.draftValue !== ""
      ? { selectedAssetId: input.draftValue }
      : {}),
    uploadEnabled: true,
    uploadPatchFields: {
      mediaAssetFieldName: input.name,
    },
  };
}

function generatedOperationInput(input: GeneratedFieldInput, field: FieldSchema) {
  return {
    name: input.name,
    label: input.label,
    required: Boolean(input.isRequired),
    control:
      input.kind === "long-text"
        ? "longText"
        : field.type === "boolean"
          ? "boolean"
          : field.type === "number"
            ? "number"
            : field.type === "enum"
              ? "enum"
              : "text",
    options:
      field.type === "enum"
        ? (input.options ?? []).map((option) => ({ value: option.value, label: option.label }))
        : undefined,
  } satisfies FormlessUiOperationInputField["input"];
}

function draftInputFromValue(value: GeneratedDraftValue): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value };
}

function draftValueFromInput(input: GeneratedFieldDraftInput | undefined): GeneratedDraftValue {
  return input?.value ?? "";
}

function generatedRecordFieldDraftValue(field: FormlessUiRecordField): FieldValue {
  const draftValue = field.drafts.draftInput?.value ?? field.drafts.draft;

  return normalizeCommittedValue(field, draftValue);
}

function generatedFieldKey(field: FormlessUiField) {
  return `${field.surface}:${field.recordId ?? "fixture"}:${field.inputName ?? field.fieldName}`;
}

function isRecordField(field: FormlessUiField): field is FormlessUiRecordField {
  return field.mode === "editor" && field.surface !== "create" && field.surface !== "operation";
}

function findGeneratedEditorField(
  projection: GeneratedFieldProjection,
  fieldName: string,
): GeneratedEditorField | undefined {
  return [
    projection.createFields,
    projection.recordEditFields,
    projection.tableCellFields,
    projection.publicActionFields,
  ]
    .flat()
    .find(
      (field): field is GeneratedEditorField =>
        field.mode === "editor" && (field.inputName === fieldName || field.fieldName === fieldName),
    );
}

function findGeneratedRecordField(
  projection: GeneratedFieldProjection,
  fieldName: keyof GeneratedRecordValues,
): FormlessUiRecordField | undefined {
  return [...projection.recordEditFields, ...projection.tableCellFields].find(
    (field): field is FormlessUiRecordField =>
      isRecordField(field) && field.fieldName === fieldName,
  );
}

function findGeneratedMediaAssetOption(
  projection: GeneratedFieldProjection,
  fieldName: string,
  assetId: string,
) {
  return findGeneratedEditorField(projection, fieldName)?.options?.mediaAssetOptions?.find(
    (option) => option.id === assetId,
  );
}

function generatedMediaStateForDraft(
  fields: readonly FormlessUiField[],
  fieldName: string,
  value: GeneratedDraftValue,
): GeneratedMediaIntentState | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }

  const asset = fields
    .find((field) => field.fieldName === fieldName)
    ?.options?.mediaAssetOptions?.find((option) => option.id === value);

  if (!asset) {
    return undefined;
  }

  return {
    previewHref: asset.href,
    result: {
      assetId: asset.id,
      previewHref: asset.href,
      source: "picker",
    },
  };
}

function applyGeneratedFieldErrorChange(
  fixture: GeneratedFieldFoundationFixture,
  fieldName: keyof GeneratedRecordValues,
  message: string | null,
): GeneratedFieldFoundationFixture {
  if (message === null) {
    const { [fieldName]: _fieldErrors, ...errors } = fixture.record.errors;

    return {
      ...fixture,
      record: {
        ...fixture.record,
        errors,
      },
    };
  }

  return {
    ...fixture,
    record: {
      ...fixture.record,
      errors: {
        ...fixture.record.errors,
        [fieldName]: [fieldError(fieldName, message)],
      },
    },
  };
}

function errorsFor<TValues>(
  errors: FieldErrorMap<TValues>,
  fieldName: keyof TValues,
): readonly GeneratedFixtureFieldError[] | undefined {
  const fieldErrors = errors[fieldName];

  return fieldErrors?.length ? fieldErrors : undefined;
}

function displayOption(options: readonly GeneratedFieldOption[], value: GeneratedDraftValue) {
  if (typeof value !== "string") {
    return String(value ?? "");
  }

  return options.find((option) => option.value === value)?.label ?? value;
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}
