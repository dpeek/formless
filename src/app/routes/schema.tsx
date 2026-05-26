import { useEffect, useMemo, useState } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import {
  ControlAddIcon,
  ControlCheckIcon,
  ControlCloseIcon,
  ControlIndeterminateIcon,
  ControlLoadingIcon,
} from "@dpeek/formless-ui/icons";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import {
  connectBroadcastToClientStore,
  hydrateClientStore,
  selectClientStoreTarget,
  useActiveClientStorageName,
  useActiveSchemaKey,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { fetchActiveSchema, saveActiveSchema } from "../../client/sync.ts";
import {
  appStorageIdentityForClientTarget,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import {
  projectSchemaBuilderDraft,
  validateSchemaBuilderKey,
  type SchemaBuilderEntityProjection,
  type SchemaBuilderFieldMetadataUpdate,
  type SchemaBuilderFieldProjection,
  type SchemaBuilderIntent,
} from "../../client/schema-builder.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../../shared/schema-apps.ts";
import type { EnumValueSchema, FieldSchema, TextFieldFormat } from "../../shared/schema.ts";
import {
  applySchemaRouteBuilderIntent,
  commitSchemaRouteDraftState,
  createSchemaRouteDraftState,
  isSchemaRouteDraftDirty,
  revertSchemaRouteDraftState,
  serializeSchemaRouteDraftForSave,
  updateSchemaRouteSourceText,
  type SchemaRouteDraftState,
} from "./schema-draft.ts";

type SchemaRouteMode = "builder" | "source";

export function SchemaRoute({
  target,
  schemaKey,
}: {
  target?: ClientAppTarget;
  schemaKey: SchemaKey;
}) {
  const appTarget = target ?? schemaKey;
  const appTargetIdentity = appStorageIdentityForClientTarget(appTarget);
  const app = getSchemaAppDefinition(schemaKey);
  const activeClientStorageName = useActiveClientStorageName();
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeStoreMatchesTarget =
    activeClientStorageName === null ||
    activeClientStorageName === appTargetIdentity.browserDatabaseName;
  const routeIsActive =
    routeStoreMatchesTarget &&
    (activeSchemaKey === null || activeSchemaKey === appTargetIdentity.sourceSchemaKey);
  const schema = routeIsActive ? activeSchema : null;
  const [mode, setMode] = useState<SchemaRouteMode>("builder");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<SchemaRouteDraftState | null>(() =>
    schema ? createSchemaRouteDraftState(schema) : null,
  );
  const routeDraftState = routeIsActive ? draftState : null;
  const routeSourceText = routeDraftState?.sourceText ?? "";
  const isDirty = routeDraftState ? isSchemaRouteDraftDirty(routeDraftState) : false;
  const sourceError = routeDraftState?.sourceError ?? null;
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    selectClientStoreTarget(appTarget);
    setMode("builder");
    setRouteError(null);
    setDraftState(null);
    setSyncStatus({ state: "syncing", message: "Loading active schema." });
    const stopBroadcast = connectBroadcastToClientStore(appTarget);
    let cancelled = false;

    async function loadSchema() {
      try {
        await hydrateClientStore(appTarget);
        await fetchActiveSchema(appTarget);

        if (!cancelled) {
          setSyncStatus({ state: "idle", message: "Loaded active schema." });
        }
      } catch (error) {
        if (!cancelled) {
          setSyncStatus({
            state: "error",
            message: error instanceof Error ? error.message : "Could not load schema.",
          });
        }
      }
    }

    void loadSchema();

    return () => {
      cancelled = true;
      stopBroadcast();
    };
  }, [appTarget]);

  useEffect(() => {
    if (schema) {
      setDraftState(createSchemaRouteDraftState(schema));
      setRouteError(null);
    }
  }, [schema]);

  async function submitSchema(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!routeDraftState) {
      return;
    }

    const saveResult = serializeSchemaRouteDraftForSave(routeDraftState);

    if (!saveResult.ok) {
      setRouteError(saveResult.message);
      setMode("source");
      setSyncStatus({ state: "error", message: saveResult.message });
      return;
    }

    setIsSaving(true);
    setRouteError(null);
    setSyncStatus({ state: "syncing", message: "Saving schema..." });

    try {
      const response = await saveActiveSchema(appTarget, saveResult.schema);

      setDraftState(commitSchemaRouteDraftState(response.schema));
      setSyncStatus({ state: "idle", message: `Saved schema at ${response.updatedAt}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Schema save failed.";
      setRouteError(message);
      setSyncStatus({
        state: "error",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  function updateSourceText(sourceText: string) {
    setRouteError(null);
    setDraftState((current) =>
      current ? updateSchemaRouteSourceText(current, sourceText) : current,
    );
  }

  function revertDraft() {
    if (!routeDraftState) {
      return;
    }

    setDraftState(revertSchemaRouteDraftState(routeDraftState));
    setRouteError(null);
    setMode("builder");
    setSyncStatus({ state: "idle", message: "Reverted schema draft." });
  }

  function applyBuilderIntent(intent: SchemaBuilderIntent): boolean {
    if (!routeDraftState) {
      return false;
    }

    const result = applySchemaRouteBuilderIntent(routeDraftState, intent);

    if (!result.ok) {
      setRouteError(result.message);
      setSyncStatus({ state: "error", message: result.message });
      return false;
    }

    setDraftState(result.state);
    setRouteError(null);
    setSyncStatus({ state: "idle", message: "Updated schema draft." });
    return true;
  }

  return (
    <section className="mx-auto w-full max-w-[112rem] space-y-4">
      <form className="space-y-4" onSubmit={submitSchema}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Schema</span>
            <Badge data-slot="schema-key-badge" intent="outline" isCircle={false}>
              {app.key}
            </Badge>
            <SchemaDraftStatus
              isDirty={isDirty}
              isLoaded={routeDraftState !== null}
              isSaving={isSaving}
              sourceError={sourceError}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              intent="outline"
              isDisabled={!isDirty || isSaving || routeDraftState === null}
              onPress={revertDraft}
              type="button"
            >
              Revert draft
            </Button>
            <Button
              isDisabled={!isDirty || isSaving || routeDraftState === null || sourceError !== null}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save schema"}
            </Button>
          </div>
        </header>

        {(routeError || sourceError) && (
          <p
            className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-800"
            role="alert"
          >
            {routeError ?? `Source schema is invalid. ${sourceError}`}
          </p>
        )}

        <SchemaModeTabs mode={mode} onModeChange={setMode} sourceError={sourceError} />

        <div hidden={mode !== "builder"} id="schema-builder-panel" role="tabpanel">
          <SchemaBuilderWorkspace
            draftState={routeDraftState}
            onApplyIntent={applyBuilderIntent}
            sourceError={sourceError}
          />
        </div>

        <div hidden={mode !== "source"} id="schema-source-panel" role="tabpanel">
          <textarea
            aria-label="Schema source"
            className="min-h-[32rem] w-full resize-y rounded border border-slate-300 px-3 py-2 font-mono text-sm"
            onChange={(event) => updateSourceText(event.currentTarget.value)}
            placeholder="Loading active schema..."
            spellCheck={false}
            value={routeSourceText}
          />
        </div>
      </form>
    </section>
  );
}

function SchemaDraftStatus({
  isDirty,
  isLoaded,
  isSaving,
  sourceError,
}: {
  isDirty: boolean;
  isLoaded: boolean;
  isSaving: boolean;
  sourceError: string | null;
}) {
  if (!isLoaded) {
    return null;
  }

  const label = isSaving
    ? "Schema saving"
    : sourceError
      ? "Schema source invalid"
      : isDirty
        ? "Schema has unsaved changes"
        : "Schema saved";
  const tone = isSaving
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : sourceError
      ? "border-red-200 bg-red-50 text-red-700"
      : isDirty
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const Icon = isSaving
    ? ControlLoadingIcon
    : sourceError
      ? ControlCloseIcon
      : isDirty
        ? ControlIndeterminateIcon
        : ControlCheckIcon;

  return (
    <span
      aria-label={label}
      className={`inline-flex size-7 items-center justify-center rounded border ${tone}`}
      role="status"
      title={label}
    >
      <Icon aria-hidden className={`size-3.5 ${isSaving ? "animate-spin" : ""}`} />
    </span>
  );
}

function SchemaModeTabs({
  mode,
  onModeChange,
  sourceError,
}: {
  mode: SchemaRouteMode;
  onModeChange: (mode: SchemaRouteMode) => void;
  sourceError: string | null;
}) {
  return (
    <div
      aria-label="Schema editor mode"
      className="inline-flex rounded border border-slate-300 p-0.5"
      role="tablist"
    >
      <button
        aria-controls="schema-builder-panel"
        aria-selected={mode === "builder"}
        className={modeTabClassName(mode === "builder")}
        disabled={sourceError !== null}
        onClick={() => onModeChange("builder")}
        role="tab"
        type="button"
      >
        Builder
      </button>
      <button
        aria-controls="schema-source-panel"
        aria-selected={mode === "source"}
        className={modeTabClassName(mode === "source")}
        onClick={() => onModeChange("source")}
        role="tab"
        type="button"
      >
        Source
      </button>
    </div>
  );
}

function modeTabClassName(isSelected: boolean) {
  const base = "rounded px-3 py-1.5 text-sm font-medium";
  return isSelected
    ? `${base} bg-slate-900 text-white`
    : `${base} text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50`;
}

function SchemaBuilderWorkspace({
  draftState,
  onApplyIntent,
  sourceError,
}: {
  draftState: SchemaRouteDraftState | null;
  onApplyIntent: (intent: SchemaBuilderIntent) => boolean;
  sourceError: string | null;
}) {
  const [newEntityKey, setNewEntityKey] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [entityFormError, setEntityFormError] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldSchema["type"]>("text");
  const [newReferenceTarget, setNewReferenceTarget] = useState("");
  const [fieldFormError, setFieldFormError] = useState<string | null>(null);
  const [isCreateEntityDialogOpen, setIsCreateEntityDialogOpen] = useState(false);
  const [createFieldEntityKey, setCreateFieldEntityKey] = useState<string | null>(null);
  const projection = useMemo(
    () => (draftState ? projectSchemaBuilderDraft(draftState.draft) : null),
    [draftState],
  );

  if (!draftState) {
    return (
      <div className="rounded border border-slate-200 px-4 py-6 text-sm text-slate-600">
        Loading active schema.
      </div>
    );
  }

  if (sourceError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800">
        Builder is paused until Source is valid.
      </div>
    );
  }

  const entities = projection?.entities ?? [];
  const schema = draftState.draft.schema;
  const createFieldEntity =
    createFieldEntityKey === null
      ? undefined
      : entities.find((entity) => entity.key === createFieldEntityKey);
  const referenceTargetForNewField =
    newReferenceTarget && schema.entities[newReferenceTarget] !== undefined
      ? newReferenceTarget
      : (createFieldEntity?.key ?? entities[0]?.key ?? "");

  function openCreateEntityDialog() {
    setEntityFormError(null);
    setIsCreateEntityDialogOpen(true);
  }

  function openCreateFieldDialog(entityKey: string) {
    setFieldFormError(null);
    setCreateFieldEntityKey(entityKey);
  }

  function createEntity() {
    const key = newEntityKey.trim();
    const keyResult = validateSchemaBuilderKey("entity", key);

    if (!keyResult.ok) {
      setEntityFormError(keyResult.message);
      return;
    }

    if (schema.entities[key] !== undefined) {
      setEntityFormError(`Entity key "${key}" already exists.`);
      return;
    }

    const created = onApplyIntent({
      type: "createEntity",
      key,
      label: newEntityLabel.trim() === "" ? undefined : newEntityLabel,
    });

    if (created) {
      setNewEntityKey("");
      setNewEntityLabel("");
      setEntityFormError(null);
      setIsCreateEntityDialogOpen(false);
    }
  }

  function addField() {
    if (!createFieldEntity) {
      return;
    }

    const fieldKey = newFieldKey.trim();
    const keyResult = validateSchemaBuilderKey("field", fieldKey);

    if (!keyResult.ok) {
      setFieldFormError(keyResult.message);
      return;
    }

    if (schema.entities[createFieldEntity.key]?.fields[fieldKey] !== undefined) {
      setFieldFormError(`Field key "${createFieldEntity.key}.${fieldKey}" already exists.`);
      return;
    }

    const metadata: SchemaBuilderFieldMetadataUpdate =
      newFieldType === "reference" ? { to: referenceTargetForNewField } : {};
    const added = onApplyIntent({
      type: "addField",
      entityKey: createFieldEntity.key,
      fieldKey,
      fieldType: newFieldType,
      metadata,
    });

    if (added) {
      setNewFieldKey("");
      setFieldFormError(null);
      setCreateFieldEntityKey(null);
    }
  }

  function updateEntityLabel(entityKey: string, label: string) {
    const entity = entities.find((candidate) => candidate.key === entityKey);

    if (!entity || label === entity.label) {
      return;
    }

    onApplyIntent({
      type: "updateEntityLabel",
      entityKey,
      label,
    });
  }

  function updateFieldMetadata(
    entityKey: string,
    fieldKey: string,
    metadata: SchemaBuilderFieldMetadataUpdate,
  ) {
    const entity = entities.find((candidate) => candidate.key === entityKey);
    const field = entity?.fields.find((candidate) => candidate.key === fieldKey);

    if (!field) {
      return false;
    }

    return onApplyIntent({
      type: "updateFieldMetadata",
      entityKey,
      fieldKey,
      metadata,
    });
  }

  return (
    <>
      <div aria-label="Schema builder" className="max-w-5xl">
        <SchemaBuilderEntityList
          entities={entities}
          onAddEntity={openCreateEntityDialog}
          onAddField={openCreateFieldDialog}
          onUpdateEntityLabel={updateEntityLabel}
          onUpdateFieldMetadata={updateFieldMetadata}
          schema={schema}
        />
      </div>

      <CreateEntityDialog
        error={entityFormError}
        labelValue={newEntityLabel}
        keyValue={newEntityKey}
        onCreate={createEntity}
        onKeyChange={setNewEntityKey}
        onLabelChange={setNewEntityLabel}
        onOpenChange={(open) => {
          setIsCreateEntityDialogOpen(open);
          if (!open) {
            setEntityFormError(null);
          }
        }}
        open={isCreateEntityDialogOpen}
      />

      {createFieldEntity ? (
        <CreateFieldDialog
          entities={entities}
          error={fieldFormError}
          fieldType={newFieldType}
          keyValue={newFieldKey}
          onCreate={addField}
          onFieldTypeChange={setNewFieldType}
          onKeyChange={setNewFieldKey}
          onOpenChange={(open) => {
            if (!open) {
              setCreateFieldEntityKey(null);
              setFieldFormError(null);
            }
          }}
          onReferenceTargetChange={setNewReferenceTarget}
          open={true}
          referenceTarget={referenceTargetForNewField}
          targetEntity={createFieldEntity}
        />
      ) : null}
    </>
  );
}

function SchemaBuilderEntityList({
  entities,
  onAddEntity,
  onAddField,
  onUpdateEntityLabel,
  onUpdateFieldMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  onAddEntity: () => void;
  onAddField: (entityKey: string) => void;
  onUpdateEntityLabel: (entityKey: string, label: string) => void;
  onUpdateFieldMetadata: (
    entityKey: string,
    fieldKey: string,
    metadata: SchemaBuilderFieldMetadataUpdate,
  ) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  return (
    <div aria-label="Schema entities" className="space-y-5">
      {entities.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-white px-3 py-6 text-sm text-slate-600">
          No entities are currently defined.
        </div>
      ) : (
        entities.map((entity) => (
          <SchemaBuilderEntityEditor
            entities={entities}
            entity={entity}
            key={entity.key}
            onAddField={onAddField}
            onUpdateEntityLabel={onUpdateEntityLabel}
            onUpdateFieldMetadata={onUpdateFieldMetadata}
            schema={schema}
          />
        ))
      )}

      <Button
        aria-label="Create entity"
        intent="outline"
        onClick={onAddEntity}
        size="sm"
        type="button"
      >
        <ControlAddIcon aria-hidden />
        <span>Entity</span>
      </Button>
    </div>
  );
}

function SchemaBuilderEntityEditor({
  entities,
  entity,
  onAddField,
  onUpdateEntityLabel,
  onUpdateFieldMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  entity: SchemaBuilderEntityProjection;
  onAddField: (entityKey: string) => void;
  onUpdateEntityLabel: (entityKey: string, label: string) => void;
  onUpdateFieldMetadata: (
    entityKey: string,
    fieldKey: string,
    metadata: SchemaBuilderFieldMetadataUpdate,
  ) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  const entitySchema = schema.entities[entity.key];

  return (
    <section
      aria-label={`${entity.label} entity`}
      className="space-y-4 rounded border border-slate-200 bg-slate-50 p-4"
      data-entity-key={entity.key}
    >
      <div className="flex flex-wrap items-start gap-3">
        <label className="min-w-[14rem] flex-1">
          <input
            aria-label={`Entity label for ${entity.key}`}
            className="h-9 w-full rounded border border-slate-300 px-2 text-sm font-medium text-slate-900"
            defaultValue={entity.label}
            key={`${entity.key}:${entity.label}`}
            onBlur={(event) => onUpdateEntityLabel(entity.key, event.currentTarget.value)}
            onKeyDown={blurInputOnEnter}
          />
        </label>
        <div className="flex h-9 items-center gap-2">
          <Badge data-slot="entity-key-badge" intent="outline" isCircle={false}>
            {entity.key}
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        {entity.fields.length === 0 ? (
          <p className="text-sm text-slate-600">No fields are currently defined.</p>
        ) : (
          entity.fields.map((fieldProjection) => {
            const field = entitySchema?.fields[fieldProjection.key];

            if (!field) {
              return null;
            }

            return (
              <SchemaBuilderFieldEditor
                entities={entities}
                entity={entity}
                field={field}
                fieldProjection={fieldProjection}
                key={fieldProjection.key}
                onUpdateMetadata={onUpdateFieldMetadata}
                schema={schema}
              />
            );
          })
        )}

        <Button
          aria-label={`Create field for ${entity.label}`}
          intent="outline"
          onClick={() => onAddField(entity.key)}
          size="sm"
          type="button"
        >
          <ControlAddIcon aria-hidden />
          <span>Field</span>
        </Button>
      </div>
    </section>
  );
}

function blurInputOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  event.currentTarget.blur();
}

function submitDialogOnEnter(
  event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  onSubmit: () => void,
) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  onSubmit();
}

function CreateEntityDialog({
  error,
  keyValue,
  labelValue,
  onCreate,
  onKeyChange,
  onLabelChange,
  onOpenChange,
  open,
}: {
  error: string | null;
  keyValue: string;
  labelValue: string;
  onCreate: () => void;
  onKeyChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <ModalContent isOpen={open} onOpenChange={onOpenChange} size="sm">
      <ModalHeader>
        <ModalTitle>Create entity</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div aria-label="Create entity dialog" className="space-y-3" role="form">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Key</span>
            <input
              className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
              onChange={(event) => onKeyChange(event.currentTarget.value)}
              onKeyDown={(event) => submitDialogOnEnter(event, onCreate)}
              placeholder="project"
              value={keyValue}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Label</span>
            <input
              className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
              onChange={(event) => onLabelChange(event.currentTarget.value)}
              onKeyDown={(event) => submitDialogOnEnter(event, onCreate)}
              placeholder="Project"
              value={labelValue}
            />
          </label>
          {error && <BuilderInlineError>{error}</BuilderInlineError>}
        </div>
      </ModalBody>
      <ModalFooter>
        <ModalClose intent="outline" type="button">
          Cancel
        </ModalClose>
        <Button onPress={onCreate} type="button">
          Create entity
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

function CreateFieldDialog({
  entities,
  error,
  fieldType,
  keyValue,
  onCreate,
  onFieldTypeChange,
  onKeyChange,
  onOpenChange,
  onReferenceTargetChange,
  open,
  referenceTarget,
  targetEntity,
}: {
  entities: SchemaBuilderEntityProjection[];
  error: string | null;
  fieldType: FieldSchema["type"];
  keyValue: string;
  onCreate: () => void;
  onFieldTypeChange: (fieldType: FieldSchema["type"]) => void;
  onKeyChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onReferenceTargetChange: (entityKey: string) => void;
  open: boolean;
  referenceTarget: string;
  targetEntity: SchemaBuilderEntityProjection;
}) {
  return (
    <ModalContent isOpen={open} onOpenChange={onOpenChange} size="sm">
      <ModalHeader>
        <ModalTitle>Create field</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div
          aria-label={`Create field dialog for ${targetEntity.label}`}
          className="space-y-3"
          role="form"
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Key</span>
            <input
              className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
              onChange={(event) => onKeyChange(event.currentTarget.value)}
              onKeyDown={(event) => submitDialogOnEnter(event, onCreate)}
              placeholder="title"
              value={keyValue}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Type</span>
            <FieldTypeSelect onChange={onFieldTypeChange} value={fieldType} />
          </label>
          {fieldType === "reference" && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Reference target</span>
              <EntitySelect
                entities={entities}
                onChange={onReferenceTargetChange}
                value={referenceTarget}
              />
            </label>
          )}
          {error && <BuilderInlineError>{error}</BuilderInlineError>}
        </div>
      </ModalBody>
      <ModalFooter>
        <ModalClose intent="outline" type="button">
          Cancel
        </ModalClose>
        <Button onPress={onCreate} type="button">
          Add field
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

function SchemaBuilderFieldEditor({
  entities,
  entity,
  field,
  fieldProjection,
  onUpdateMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  entity: SchemaBuilderEntityProjection;
  field: FieldSchema;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdateMetadata: (
    entityKey: string,
    fieldKey: string,
    metadata: SchemaBuilderFieldMetadataUpdate,
  ) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  function updateMetadata(metadata: SchemaBuilderFieldMetadataUpdate) {
    return onUpdateMetadata(entity.key, fieldProjection.key, metadata);
  }

  function updateFieldType(fieldType: FieldSchema["type"]) {
    const metadata: SchemaBuilderFieldMetadataUpdate = { type: fieldType };

    if (fieldType === "reference") {
      metadata.to = field.type === "reference" ? field.to : (entities[0]?.key ?? entity.key);
      metadata.displayField = null;
    }

    updateMetadata(metadata);
  }

  return (
    <section
      aria-label={`${fieldProjection.label} field`}
      className="space-y-3 rounded border border-slate-200 bg-white p-3"
      data-field-key={fieldProjection.key}
    >
      <div className="flex flex-wrap items-start gap-3">
        <label className="min-w-[14rem] flex-1">
          <input
            aria-label={`Field label for ${entity.key}.${fieldProjection.key}`}
            className="h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-900"
            defaultValue={fieldProjection.label}
            key={`${entity.key}.${fieldProjection.key}.label`}
            onBlur={(event) => updateMetadata({ label: event.currentTarget.value })}
            onKeyDown={blurInputOnEnter}
          />
        </label>
        <div className="flex h-9 items-center gap-2">
          <Badge data-slot="field-key-badge" intent="outline" isCircle={false}>
            {fieldProjection.key}
          </Badge>
          <Badge data-slot="field-type-badge" intent="secondary" isCircle={false}>
            {fieldProjection.type}
          </Badge>
        </div>
      </div>

      <div className={`grid gap-3 ${fieldProjection.typeLocked ? "" : "sm:grid-cols-2"}`}>
        {fieldProjection.typeLocked ? null : (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Type</span>
            <FieldTypeSelect onChange={updateFieldType} value={field.type} />
          </label>
        )}

        <label
          className={`flex items-center gap-2 text-sm text-slate-800 ${
            fieldProjection.typeLocked ? "" : "pt-6"
          }`}
        >
          <input
            checked={field.required}
            className="h-4 w-4 rounded border-slate-300"
            onChange={(event) => updateMetadata({ required: event.currentTarget.checked })}
            type="checkbox"
          />
          Required
        </label>
      </div>

      <TypedFieldMetadataControls
        entities={entities}
        field={field}
        fieldProjection={fieldProjection}
        onUpdateMetadata={updateMetadata}
        schema={schema}
      />
    </section>
  );
}

function TypedFieldMetadataControls({
  entities,
  field,
  fieldProjection,
  onUpdateMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  field: FieldSchema;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  if (field.type === "text") {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Text format</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({ format: event.currentTarget.value as TextFieldFormat })
          }
          value={field.format ?? "plain"}
        >
          {textFormatOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Default</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({ default: booleanDefaultFromInput(event.currentTarget.value) })
          }
          value={booleanDefaultInputValue(field.default)}
        >
          <option value="">No default</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    );
  }

  if (field.type === "number") {
    return <NumberFieldControls field={field} onUpdateMetadata={onUpdateMetadata} />;
  }

  if (field.type === "enum") {
    return <EnumFieldControls field={field} onUpdateMetadata={onUpdateMetadata} />;
  }

  if (field.type === "reference") {
    return (
      <ReferenceFieldControls
        entities={entities}
        field={field}
        fieldProjection={fieldProjection}
        onUpdateMetadata={onUpdateMetadata}
        schema={schema}
      />
    );
  }

  return null;
}

function NumberFieldControls({
  field,
  onUpdateMetadata,
}: {
  field: Extract<FieldSchema, { type: "number" }>;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <NumberMetadataInput
        label="Default"
        onChange={(value) => onUpdateMetadata({ default: value })}
        value={field.default}
      />
      <NumberMetadataInput
        label="Min"
        onChange={(value) => onUpdateMetadata({ min: value })}
        value={field.min}
      />
      <NumberMetadataInput
        label="Max"
        onChange={(value) => onUpdateMetadata({ max: value })}
        value={field.max}
      />
      <label className="flex items-center gap-2 pt-6 text-sm text-slate-800">
        <input
          checked={field.integer ?? false}
          className="h-4 w-4 rounded border-slate-300"
          onChange={(event) => onUpdateMetadata({ integer: event.currentTarget.checked })}
          type="checkbox"
        />
        Integer
      </label>
    </div>
  );
}

function NumberMetadataInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number | null) => void;
  value: number | undefined;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
        defaultValue={value ?? ""}
        key={`${label}-${value ?? "empty"}`}
        onBlur={(event) => {
          const input = event.currentTarget.value.trim();
          if (input === "") {
            onChange(null);
            return;
          }

          const parsed = Number(input);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        type="number"
      />
    </label>
  );
}

function EnumFieldControls({
  field,
  onUpdateMetadata,
}: {
  field: Extract<FieldSchema, { type: "enum" }>;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
}) {
  const [enumError, setEnumError] = useState<string | null>(null);

  function updateValues(value: string) {
    const result = enumValuesFromText(value);

    if (!result.ok) {
      setEnumError(result.message);
      return;
    }

    setEnumError(null);
    onUpdateMetadata({
      values: result.values,
      ...(field.default && result.values[field.default] === undefined ? { default: null } : {}),
    });
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Values</span>
        <textarea
          className="min-h-24 w-full rounded border border-slate-300 px-2 py-2 font-mono text-sm"
          defaultValue={enumValuesToText(field.values)}
          key={enumValuesToText(field.values)}
          onBlur={(event) => updateValues(event.currentTarget.value)}
          spellCheck={false}
        />
      </label>
      {enumError && <BuilderInlineError>{enumError}</BuilderInlineError>}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Default</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({
              default: event.currentTarget.value === "" ? null : event.currentTarget.value,
            })
          }
          value={field.default ?? ""}
        >
          <option value="">No default</option>
          {Object.entries(field.values).map(([valueKey, value]) => (
            <option key={valueKey} value={valueKey}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ReferenceFieldControls({
  entities,
  field,
  fieldProjection,
  onUpdateMetadata,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  field: Extract<FieldSchema, { type: "reference" }>;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  const targetEntity = schema.entities[field.to];
  const textFields = Object.entries(targetEntity?.fields ?? {}).filter(
    ([, targetField]) => targetField.type === "text",
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Reference target</span>
        <EntitySelect
          disabled={fieldProjection.referenceTargetLocked}
          entities={entities}
          onChange={(target) => onUpdateMetadata({ to: target, displayField: null })}
          value={field.to}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Display field</span>
        <select
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          onChange={(event) =>
            onUpdateMetadata({
              displayField: event.currentTarget.value === "" ? null : event.currentTarget.value,
            })
          }
          value={field.displayField ?? ""}
        >
          <option value="">Record id</option>
          {textFields.map(([fieldKey, targetField]) => (
            <option key={fieldKey} value={fieldKey}>
              {targetField.label ?? fieldKey}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function FieldTypeSelect({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (fieldType: FieldSchema["type"]) => void;
  value: FieldSchema["type"];
}) {
  return (
    <select
      className="h-9 w-full rounded border border-slate-300 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value as FieldSchema["type"])}
      value={value}
    >
      {fieldTypeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EntitySelect({
  disabled,
  entities,
  onChange,
  value,
}: {
  disabled?: boolean;
  entities: SchemaBuilderEntityProjection[];
  onChange: (entityKey: string) => void;
  value: string;
}) {
  return (
    <select
      className="h-9 w-full rounded border border-slate-300 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    >
      {entities.map((entity) => (
        <option key={entity.key} value={entity.key}>
          {entity.label}
        </option>
      ))}
    </select>
  );
}

function BuilderInlineError({ children }: { children: string }) {
  return (
    <p
      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800"
      role="alert"
    >
      {children}
    </p>
  );
}

const fieldTypeOptions = [
  { value: "text", label: "Text" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "enum", label: "Enum" },
  { value: "reference", label: "Reference" },
] satisfies { label: string; value: FieldSchema["type"] }[];

const textFormatOptions = [
  { value: "plain", label: "Plain text" },
  { value: "longText", label: "Long text" },
  { value: "markdown", label: "Markdown" },
  { value: "href", label: "Link" },
  { value: "slug", label: "Slug" },
  { value: "color", label: "Color" },
  { value: "icon", label: "Icon" },
] satisfies { label: string; value: TextFieldFormat }[];

function booleanDefaultInputValue(value: boolean | undefined) {
  if (value === true) {
    return "true";
  }

  if (value === false) {
    return "false";
  }

  return "";
}

function booleanDefaultFromInput(value: string) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function enumValuesToText(values: Record<string, EnumValueSchema>) {
  return Object.entries(values)
    .map(([valueKey, value]) => `${valueKey}: ${value.label}`)
    .join("\n");
}

function enumValuesFromText(
  value: string,
): { ok: true; values: Record<string, EnumValueSchema> } | { message: string; ok: false } {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { ok: false, message: "Enum values must not be empty." };
  }

  const values: Record<string, EnumValueSchema> = {};

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    const valueKey = (separatorIndex === -1 ? line : line.slice(0, separatorIndex)).trim();
    const label = (separatorIndex === -1 ? line : line.slice(separatorIndex + 1)).trim();
    const keyResult = validateSchemaBuilderKey("enum value", valueKey);

    if (!keyResult.ok) {
      return { ok: false, message: keyResult.message };
    }

    if (label === "") {
      return { ok: false, message: `Enum value "${valueKey}" label is required.` };
    }

    values[valueKey] = { label };
  }

  return { ok: true, values };
}
