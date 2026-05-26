import { useEffect, useMemo, useState } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import {
  ControlAddIcon,
  ControlCheckIcon,
  ControlCloseIcon,
  ControlDisclosureIcon,
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
import type { GeneratedFieldControlKind } from "../generated/field-controls.ts";
import { selectGeneratedFieldEditorAdapter } from "../generated/field-ui-adapters.ts";
import {
  selectGeneratedRecordFieldRendererKind,
  type GeneratedRecordFieldRendererKind,
} from "../generated/record-field-renderer-model.ts";
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
import type {
  EnumValueSchema,
  FieldCommitPolicy,
  FieldEditor,
  FieldSchema,
  TextFieldFormat,
} from "../../shared/schema.ts";
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
  const [selectedEntityKeyState, setSelectedEntityKey] = useState<string | null>(null);
  const [selectedFieldKeyState, setSelectedFieldKey] = useState<string | null>(null);
  const [newEntityKey, setNewEntityKey] = useState("");
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [entityFormError, setEntityFormError] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldSchema["type"]>("text");
  const [newReferenceTarget, setNewReferenceTarget] = useState("");
  const [fieldFormError, setFieldFormError] = useState<string | null>(null);
  const [collapsedEntityKeys, setCollapsedEntityKeys] = useState<Set<string>>(() => new Set());
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
  const selectedEntityKey =
    selectedEntityKeyState && entities.some((entity) => entity.key === selectedEntityKeyState)
      ? selectedEntityKeyState
      : (entities[0]?.key ?? null);
  const selectedEntity =
    selectedEntityKey === null
      ? undefined
      : entities.find((entity) => entity.key === selectedEntityKey);
  const selectedFieldKey =
    selectedFieldKeyState &&
    selectedEntity?.fields.some((field) => field.key === selectedFieldKeyState)
      ? selectedFieldKeyState
      : (selectedEntity?.fields[0]?.key ?? null);
  const selectedFieldProjection =
    selectedEntity && selectedFieldKey
      ? selectedEntity.fields.find((field) => field.key === selectedFieldKey)
      : undefined;
  const selectedField =
    selectedEntity && selectedFieldProjection
      ? schema.entities[selectedEntity.key]?.fields[selectedFieldProjection.key]
      : undefined;
  const createFieldEntity =
    createFieldEntityKey === null
      ? undefined
      : entities.find((entity) => entity.key === createFieldEntityKey);
  const referenceTargetForNewField =
    newReferenceTarget && schema.entities[newReferenceTarget] !== undefined
      ? newReferenceTarget
      : (createFieldEntity?.key ?? selectedEntity?.key ?? entities[0]?.key ?? "");

  function toggleEntityExpanded(entityKey: string) {
    setCollapsedEntityKeys((current) => {
      const next = new Set(current);

      if (next.has(entityKey)) {
        next.delete(entityKey);
      } else {
        next.add(entityKey);
      }

      return next;
    });
  }

  function openCreateEntityDialog() {
    setEntityFormError(null);
    setIsCreateEntityDialogOpen(true);
  }

  function openCreateFieldDialog(entityKey: string) {
    setSelectedEntityKey(entityKey);
    setFieldFormError(null);
    setCreateFieldEntityKey(entityKey);
    setCollapsedEntityKeys((current) => {
      const next = new Set(current);
      next.delete(entityKey);
      return next;
    });
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
      setSelectedEntityKey(key);
      setSelectedFieldKey(null);
      setCollapsedEntityKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
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
      setSelectedEntityKey(createFieldEntity.key);
      setSelectedFieldKey(fieldKey);
      setCollapsedEntityKeys((current) => {
        const next = new Set(current);
        next.delete(createFieldEntity.key);
        return next;
      });
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

  function updateFieldLabel(entityKey: string, fieldKey: string, label: string) {
    const entity = entities.find((candidate) => candidate.key === entityKey);
    const field = entity?.fields.find((candidate) => candidate.key === fieldKey);

    if (!field || label === field.label) {
      return;
    }

    onApplyIntent({
      type: "updateFieldMetadata",
      entityKey,
      fieldKey,
      metadata: { label },
    });
  }

  function updateSelectedEntityLabel(label: string) {
    if (!selectedEntity || label === selectedEntity.label) {
      return;
    }

    onApplyIntent({
      type: "updateEntityLabel",
      entityKey: selectedEntity.key,
      label,
    });
  }

  function createSelectedEntitySurface() {
    if (!selectedEntity) {
      return;
    }

    onApplyIntent({
      type: "createGeneratedSurface",
      entityKey: selectedEntity.key,
    });
  }

  function updateSelectedFieldMetadata(metadata: SchemaBuilderFieldMetadataUpdate) {
    if (!selectedEntity || !selectedFieldProjection) {
      return false;
    }

    return onApplyIntent({
      type: "updateFieldMetadata",
      entityKey: selectedEntity.key,
      fieldKey: selectedFieldProjection.key,
      metadata,
    });
  }

  function updateSelectedFieldPresentation(presentation: {
    createEditor?: FieldEditor;
    inlineEditor?: FieldEditor;
  }) {
    if (!selectedEntity || !selectedFieldProjection) {
      return false;
    }

    return onApplyIntent({
      type: "updateFieldPresentation",
      entityKey: selectedEntity.key,
      fieldKey: selectedFieldProjection.key,
      ...presentation,
    });
  }

  return (
    <>
      <div className="grid min-h-[32rem] grid-cols-1 overflow-hidden rounded border border-slate-200 bg-white lg:grid-cols-[30rem_minmax(0,1fr)]">
        <aside
          aria-label="Builder schema tree"
          className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50 lg:border-r lg:border-b-0"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Schema tree</h2>
              <p className="text-xs text-slate-500">{entities.length} entities</p>
            </div>
            <Button
              aria-label="Create entity"
              intent="outline"
              onClick={openCreateEntityDialog}
              size="sm"
              type="button"
            >
              <ControlAddIcon aria-hidden />
              <span>Create entity</span>
            </Button>
          </div>

          <SchemaBuilderTree
            collapsedEntityKeys={collapsedEntityKeys}
            entities={entities}
            onAddField={openCreateFieldDialog}
            onSelectEntity={(entityKey) => {
              setSelectedEntityKey(entityKey);
              setSelectedFieldKey(null);
            }}
            onSelectField={(entityKey, fieldKey) => {
              setSelectedEntityKey(entityKey);
              setSelectedFieldKey(fieldKey);
            }}
            onToggleEntity={toggleEntityExpanded}
            onUpdateEntityLabel={updateEntityLabel}
            onUpdateFieldLabel={updateFieldLabel}
            selectedEntityKey={selectedEntityKey}
            selectedFieldKey={selectedFieldKey}
          />
        </aside>

        <section aria-label="Field details" className="min-w-0 p-4">
          {selectedEntity ? (
            <div className="space-y-5">
              <EntityDetails
                entity={selectedEntity}
                onCreateSurface={createSelectedEntitySurface}
                onUpdateLabel={updateSelectedEntityLabel}
              />

              {selectedField && selectedFieldProjection ? (
                <FieldDetails
                  entities={entities}
                  entity={selectedEntity}
                  field={selectedField}
                  fieldProjection={selectedFieldProjection}
                  onUpdateMetadata={updateSelectedFieldMetadata}
                  onUpdatePresentation={updateSelectedFieldPresentation}
                  schema={schema}
                />
              ) : (
                <div className="rounded border border-slate-200 px-3 py-4 text-sm text-slate-600">
                  Add a field to configure this entity.
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-600">No entity selected.</div>
          )}
        </section>
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

function SchemaBuilderTree({
  collapsedEntityKeys,
  entities,
  onAddField,
  onSelectEntity,
  onSelectField,
  onToggleEntity,
  onUpdateEntityLabel,
  onUpdateFieldLabel,
  selectedEntityKey,
  selectedFieldKey,
}: {
  collapsedEntityKeys: Set<string>;
  entities: SchemaBuilderEntityProjection[];
  onAddField: (entityKey: string) => void;
  onSelectEntity: (entityKey: string) => void;
  onSelectField: (entityKey: string, fieldKey: string) => void;
  onToggleEntity: (entityKey: string) => void;
  onUpdateEntityLabel: (entityKey: string, label: string) => void;
  onUpdateFieldLabel: (entityKey: string, fieldKey: string, label: string) => void;
  selectedEntityKey: string | null;
  selectedFieldKey: string | null;
}) {
  return (
    <div
      className="min-h-0 flex-1 overflow-auto p-3"
      role="tree"
      aria-label="Schema entities and fields"
    >
      {entities.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-white px-3 py-6 text-sm text-slate-600">
          No entities are currently defined.
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((entity) => {
            const isExpanded = !collapsedEntityKeys.has(entity.key);
            const entityIsSelected = selectedEntityKey === entity.key && selectedFieldKey === null;

            return (
              <section
                aria-label={`${entity.label} entity`}
                className="rounded border border-slate-200 bg-white"
                data-entity-key={entity.key}
                key={entity.key}
                role="none"
              >
                <div
                  className={`flex min-w-0 items-center gap-2 rounded-t px-2 py-2 ${
                    entityIsSelected ? "bg-slate-100" : ""
                  }`}
                  onClick={() => onSelectEntity(entity.key)}
                  role="treeitem"
                  aria-expanded={isExpanded}
                  aria-selected={entityIsSelected}
                >
                  <Button
                    aria-controls={`schema-builder-fields-${entity.key}`}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${entity.label}`}
                    className="shrink-0"
                    intent="plain"
                    isCircle
                    onPress={() => onToggleEntity(entity.key)}
                    size="sq-xs"
                    type="button"
                  >
                    <ControlDisclosureIcon
                      aria-hidden
                      className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </Button>
                  <input
                    aria-label={`Entity label for ${entity.key}`}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none"
                    defaultValue={entity.label}
                    key={`${entity.key}:${entity.label}`}
                    onBlur={(event) => onUpdateEntityLabel(entity.key, event.currentTarget.value)}
                    onFocus={() => onSelectEntity(entity.key)}
                    onKeyDown={blurInputOnEnter}
                  />
                  <Badge data-slot="entity-key-badge" intent="outline" isCircle={false}>
                    {entity.key}
                  </Badge>
                  <BuilderSavedStatus
                    isSaved={entity.saved}
                    label={`${entity.label} entity ${entity.saved ? "saved" : "draft"}`}
                  />
                </div>

                <div
                  className={isExpanded ? "border-t border-slate-100 px-2 py-2" : "hidden"}
                  id={`schema-builder-fields-${entity.key}`}
                  role="group"
                >
                  {entity.fields.length === 0 ? (
                    <p className="px-8 py-2 text-sm text-slate-600">
                      No fields are currently defined.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {entity.fields.map((field) => (
                        <SchemaBuilderFieldTreeRow
                          entity={entity}
                          field={field}
                          isSelected={
                            selectedEntityKey === entity.key && selectedFieldKey === field.key
                          }
                          key={field.key}
                          onSelectField={onSelectField}
                          onUpdateFieldLabel={onUpdateFieldLabel}
                        />
                      ))}
                    </div>
                  )}
                  <div className="mt-2 pl-8">
                    <Button
                      aria-label={`Create field for ${entity.label}`}
                      intent="outline"
                      onClick={() => onAddField(entity.key)}
                      size="sm"
                      type="button"
                    >
                      <ControlAddIcon aria-hidden />
                      <span>Add field</span>
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SchemaBuilderFieldTreeRow({
  entity,
  field,
  isSelected,
  onSelectField,
  onUpdateFieldLabel,
}: {
  entity: SchemaBuilderEntityProjection;
  field: SchemaBuilderFieldProjection;
  isSelected: boolean;
  onSelectField: (entityKey: string, fieldKey: string) => void;
  onUpdateFieldLabel: (entityKey: string, fieldKey: string, label: string) => void;
}) {
  return (
    <div
      aria-selected={isSelected}
      className={`flex min-w-0 items-center gap-2 rounded px-2 py-1.5 pl-8 ${
        isSelected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
      data-field-key={field.key}
      onClick={() => onSelectField(entity.key, field.key)}
      role="treeitem"
    >
      <input
        aria-label={`Field label for ${entity.key}.${field.key}`}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-900 hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none"
        defaultValue={field.label}
        key={`${entity.key}.${field.key}:${field.label}`}
        onBlur={(event) => onUpdateFieldLabel(entity.key, field.key, event.currentTarget.value)}
        onFocus={() => onSelectField(entity.key, field.key)}
        onKeyDown={blurInputOnEnter}
      />
      <Badge data-slot="field-key-badge" intent="outline" isCircle={false}>
        {field.key}
      </Badge>
      <Badge data-slot="field-type-badge" intent="secondary" isCircle={false}>
        {field.type}
      </Badge>
      <BuilderSavedStatus
        isSaved={field.saved}
        label={`${field.label} field ${field.saved ? "saved" : "draft"}`}
      />
    </div>
  );
}

function BuilderSavedStatus({ isSaved, label }: { isSaved: boolean; label: string }) {
  const Icon = isSaved ? ControlCheckIcon : ControlIndeterminateIcon;

  return (
    <span
      aria-label={label}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded border ${
        isSaved
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
      role="status"
      title={label}
    >
      <Icon aria-hidden className="size-3" />
    </span>
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

function EntityDetails({
  entity,
  onCreateSurface,
  onUpdateLabel,
}: {
  entity: SchemaBuilderEntityProjection;
  onCreateSurface: () => void;
  onUpdateLabel: (label: string) => void;
}) {
  return (
    <section className="space-y-3" aria-label={`${entity.label} details`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Entity</h2>
        <Badge data-slot="entity-key-badge" intent="outline" isCircle={false}>
          {entity.key}
        </Badge>
        <BuilderSavedStatus
          isSaved={entity.saved}
          label={`${entity.label} entity ${entity.saved ? "saved" : "draft"}`}
        />
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Label</span>
        <input
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          defaultValue={entity.label}
          key={`${entity.key}-label`}
          onBlur={(event) => onUpdateLabel(event.currentTarget.value)}
        />
      </label>
      {entity.generatedSurface ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Generated surface is builder-owned.
        </div>
      ) : (
        <div className="space-y-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <p>This entity is using source-owned app surfaces.</p>
          <Button intent="outline" onPress={onCreateSurface} type="button">
            Create generated surface
          </Button>
        </div>
      )}
    </section>
  );
}

function FieldDetails({
  entities,
  entity,
  field,
  fieldProjection,
  onUpdateMetadata,
  onUpdatePresentation,
  schema,
}: {
  entities: SchemaBuilderEntityProjection[];
  entity: SchemaBuilderEntityProjection;
  field: FieldSchema;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdateMetadata: (metadata: SchemaBuilderFieldMetadataUpdate) => boolean;
  onUpdatePresentation: (presentation: {
    createEditor?: FieldEditor;
    inlineEditor?: FieldEditor;
  }) => boolean;
  schema: SchemaRouteDraftState["draft"]["schema"];
}) {
  function updateFieldType(fieldType: FieldSchema["type"]) {
    const metadata: SchemaBuilderFieldMetadataUpdate = { type: fieldType };

    if (fieldType === "reference") {
      metadata.to = field.type === "reference" ? field.to : (entities[0]?.key ?? entity.key);
      metadata.displayField = null;
    }

    onUpdateMetadata(metadata);
  }

  return (
    <section className="space-y-4" aria-label={`${fieldProjection.label} field details`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Field</h2>
        <Badge data-slot="field-key-badge" intent="outline" isCircle={false}>
          {fieldProjection.key}
        </Badge>
        <Badge data-slot="field-type-badge" intent="secondary" isCircle={false}>
          {fieldProjection.type}
        </Badge>
        <BuilderSavedStatus
          isSaved={fieldProjection.saved}
          label={`${fieldProjection.label} field ${fieldProjection.saved ? "saved" : "draft"}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Type</span>
          <FieldTypeSelect
            disabled={fieldProjection.typeLocked}
            onChange={updateFieldType}
            value={field.type}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Label</span>
        <input
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
          defaultValue={fieldProjection.label}
          key={`${entity.key}.${fieldProjection.key}.label`}
          onBlur={(event) => onUpdateMetadata({ label: event.currentTarget.value })}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          checked={field.required}
          className="h-4 w-4 rounded border-slate-300"
          onChange={(event) => onUpdateMetadata({ required: event.currentTarget.checked })}
          type="checkbox"
        />
        Required
      </label>

      <TypedFieldMetadataControls
        entities={entities}
        field={field}
        fieldProjection={fieldProjection}
        onUpdateMetadata={onUpdateMetadata}
        schema={schema}
      />

      <FieldPresentationControls
        entity={entity}
        field={field}
        fieldProjection={fieldProjection}
        onUpdatePresentation={onUpdatePresentation}
      />
    </section>
  );
}

function FieldPresentationControls({
  entity,
  field,
  fieldProjection,
  onUpdatePresentation,
}: {
  entity: SchemaBuilderEntityProjection;
  field: FieldSchema;
  fieldProjection: SchemaBuilderFieldProjection;
  onUpdatePresentation: (presentation: {
    createEditor?: FieldEditor;
    inlineEditor?: FieldEditor;
  }) => boolean;
}) {
  const presentation = fieldProjection.presentation;

  if (entity.generatedSurface === undefined) {
    return (
      <section
        aria-label={`${fieldProjection.label} presentation`}
        className="space-y-2 border-t border-slate-200 pt-4"
      >
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Presentation
        </h3>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Presentation is source-owned.
        </div>
      </section>
    );
  }

  const createControl = selectGeneratedFieldEditorAdapter(field, presentation.createEditor);
  const inlineControl = selectGeneratedFieldEditorAdapter(field, presentation.inlineEditor);
  const rendererKind = selectGeneratedRecordFieldRendererKind({
    fieldConfig: {
      fieldName: fieldProjection.key,
      field,
      editor: presentation.inlineEditor,
      commit: presentation.defaultCommit,
      label: fieldProjection.label,
    },
    fieldControl: inlineControl,
    showLabel: false,
  });

  return (
    <section
      aria-label={`${fieldProjection.label} presentation`}
      className="space-y-3 border-t border-slate-200 pt-4"
    >
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Presentation</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldEditorSelect
          label="Create editor"
          onChange={(createEditor) => onUpdatePresentation({ createEditor })}
          value={presentation.createEditor}
          validEditors={presentation.validEditors}
        />
        <FieldEditorSelect
          label="Inline editor"
          onChange={(inlineEditor) => onUpdatePresentation({ inlineEditor })}
          value={presentation.inlineEditor}
          validEditors={presentation.validEditors}
        />
      </div>

      <FieldPresentationPreview
        createControlKind={createControl.controlKind}
        createEditor={presentation.createEditor}
        inlineControlKind={inlineControl.controlKind}
        inlineEditor={presentation.inlineEditor}
        rendererKind={rendererKind}
        commit={presentation.defaultCommit}
      />
    </section>
  );
}

function FieldEditorSelect({
  label,
  onChange,
  validEditors,
  value,
}: {
  label: string;
  onChange: (editor: FieldEditor) => void;
  validEditors: FieldEditor[];
  value: FieldEditor;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select
        className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
        onChange={(event) => onChange(event.currentTarget.value as FieldEditor)}
        value={value}
      >
        {validEditors.map((editor) => (
          <option key={editor} value={editor}>
            {fieldEditorLabel(editor)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldPresentationPreview({
  commit,
  createControlKind,
  createEditor,
  inlineControlKind,
  inlineEditor,
  rendererKind,
}: {
  commit: FieldCommitPolicy;
  createControlKind: GeneratedFieldControlKind;
  createEditor: FieldEditor;
  inlineControlKind: GeneratedFieldControlKind;
  inlineEditor: FieldEditor;
  rendererKind: GeneratedRecordFieldRendererKind;
}) {
  return (
    <dl
      aria-label="Field presentation preview"
      className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-2 sm:grid-cols-3"
    >
      <FieldPresentationPreviewItem
        label="Create"
        meta={fieldEditorLabel(createEditor)}
        previewKind={createControlKind}
      />
      <FieldPresentationPreviewItem
        label="Inline"
        meta={`${fieldEditorLabel(inlineEditor)} · ${commitPolicyLabel(commit)}`}
        previewKind={inlineControlKind}
      />
      <div className="rounded border border-slate-200 bg-white p-2">
        <dt className="text-xs font-medium text-slate-500">Renderer</dt>
        <dd className="mt-2 text-sm font-medium text-slate-900">
          {rendererKindLabel(rendererKind)}
        </dd>
        <dd className="mt-2">
          <RendererPreview rendererKind={rendererKind} />
        </dd>
      </div>
    </dl>
  );
}

function FieldPresentationPreviewItem({
  label,
  meta,
  previewKind,
}: {
  label: string;
  meta: string;
  previewKind: GeneratedFieldControlKind;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-900">{meta}</dd>
      <dd className="mt-2">
        <EditorControlPreview controlKind={previewKind} />
      </dd>
    </div>
  );
}

function EditorControlPreview({ controlKind }: { controlKind: GeneratedFieldControlKind }) {
  if (controlKind === "checkbox") {
    return <input checked className="h-4 w-4 rounded border-slate-300" readOnly type="checkbox" />;
  }

  if (controlKind === "select" || controlKind === "reference") {
    return (
      <select
        aria-label={`${controlKindLabel(controlKind)} preview`}
        className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
        disabled
      >
        <option>{controlKind === "reference" ? "Record" : "Option"}</option>
      </select>
    );
  }

  if (controlKind === "textarea" || controlKind === "markdown") {
    return (
      <textarea
        aria-label={`${controlKindLabel(controlKind)} preview`}
        className="min-h-14 w-full resize-none rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
        defaultValue={controlKind === "markdown" ? "# Heading" : "Long text"}
        disabled
      />
    );
  }

  if (controlKind === "color") {
    return (
      <div className="flex h-8 items-center gap-2 rounded border border-slate-300 bg-white px-2">
        <span className="h-4 w-4 rounded-sm bg-sky-600" />
        <span className="text-xs text-slate-700">#2563eb</span>
      </div>
    );
  }

  if (controlKind === "icon" || controlKind === "image" || controlKind === "media") {
    return (
      <div className="flex h-14 items-center justify-center rounded border border-dashed border-slate-300 bg-white text-xs text-slate-500">
        {controlKindLabel(controlKind)}
      </div>
    );
  }

  return (
    <input
      aria-label={`${controlKindLabel(controlKind)} preview`}
      className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
      disabled
      readOnly
      type={controlKind === "date" ? "date" : controlKind === "number" ? "number" : "text"}
      value={controlKind === "date" ? "2026-05-22" : controlKind === "number" ? "42" : "Sample"}
    />
  );
}

function RendererPreview({ rendererKind }: { rendererKind: GeneratedRecordFieldRendererKind }) {
  if (rendererKind === "checkbox") {
    return <input checked className="h-4 w-4 rounded border-slate-300" readOnly type="checkbox" />;
  }

  if (rendererKind === "color") {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-800">
        <span className="h-4 w-4 rounded-sm bg-sky-600" />
        #2563eb
      </div>
    );
  }

  if (rendererKind === "icon" || rendererKind === "image" || rendererKind === "media") {
    return (
      <div className="flex h-14 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs text-slate-500">
        {rendererKindLabel(rendererKind)}
      </div>
    );
  }

  if (rendererKind === "markdown") {
    return <p className="text-sm font-semibold text-slate-900">Heading</p>;
  }

  if (rendererKind === "textarea") {
    return <p className="text-sm text-slate-700">Long text</p>;
  }

  if (rendererKind === "date") {
    return <p className="text-sm text-slate-900">2026-05-22</p>;
  }

  if (rendererKind === "number" || rendererKind === "value-unit") {
    return <p className="text-sm text-slate-900">42</p>;
  }

  if (rendererKind === "enum") {
    return <p className="text-sm text-slate-900">Option</p>;
  }

  if (rendererKind === "reference") {
    return <p className="text-sm text-slate-900">Record</p>;
  }

  return <p className="text-sm text-slate-900">Sample</p>;
}

function fieldEditorLabel(editor: FieldEditor) {
  switch (editor) {
    case "boolean":
      return "Checkbox";
    case "color":
      return "Color";
    case "date":
      return "Date";
    case "enum":
      return "Select";
    case "href":
      return "Link";
    case "icon":
      return "Icon";
    case "image":
      return "Image";
    case "markdown":
      return "Markdown";
    case "media":
      return "Media";
    case "number":
      return "Number";
    case "reference":
      return "Reference";
    case "slug":
      return "Slug";
    case "textarea":
      return "Long text";
    case "text":
      return "Text";
  }
}

function controlKindLabel(controlKind: GeneratedFieldControlKind) {
  switch (controlKind) {
    case "checkbox":
      return "Checkbox";
    case "color":
      return "Color";
    case "date":
      return "Date";
    case "icon":
      return "Icon";
    case "image":
      return "Image";
    case "markdown":
      return "Markdown";
    case "media":
      return "Media";
    case "number":
      return "Number";
    case "reference":
      return "Reference";
    case "select":
      return "Select";
    case "textarea":
      return "Long text";
    case "text":
      return "Text";
  }
}

function commitPolicyLabel(commit: FieldCommitPolicy) {
  return commit === "immediate" ? "Immediate" : "Field commit";
}

function rendererKindLabel(rendererKind: GeneratedRecordFieldRendererKind) {
  switch (rendererKind) {
    case "autosize-text":
      return "Autosize text";
    case "checkbox":
      return "Checkbox";
    case "color":
      return "Color";
    case "date":
      return "Date";
    case "enum":
      return "Enum";
    case "icon":
      return "Icon";
    case "image":
      return "Image";
    case "markdown":
      return "Markdown";
    case "media":
      return "Media";
    case "number":
      return "Number";
    case "reference":
      return "Reference";
    case "textarea":
      return "Long text";
    case "value-unit":
      return "Value/unit";
    case "text":
      return "Text";
  }
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
