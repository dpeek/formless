import { Button, buttonStyles } from "@dpeek/formless-ui/button";
import { Fieldset } from "@dpeek/formless-ui/field";
import { MenuIcon, TreeDisclosureIcon } from "@dpeek/formless-ui/icons";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@dpeek/formless-ui/menu";
import { memo } from "react";
import type {
  FormlessUiButtonContract,
  FormlessUiField,
  FormlessUiFieldSetContract,
  FormlessUiOperationPresentationIntent,
  FormlessUiTreeChildCreationContract,
  FormlessUiTreeIntentHandler,
  FormlessUiTreeItemContract,
  FormlessUiTreeParentIdentity,
  FormlessUiTreeResultContract,
  FormlessUiTreeResultReference,
  FormlessUiTreeSelectedEditorContract,
  FormlessUiTreeWarningContract,
  FormlessUiWorkspaceIntentScope,
} from "@dpeek/formless-astryx/contract";
import { formlessUiContractReferenceKey } from "@dpeek/formless-astryx/contract-host";
import {
  useFormlessUiTreeResult,
  useFormlessUiWorkspaceIntentHandler,
} from "@dpeek/formless-astryx/contract-host/react";
import { projectGeneratedWorkspaceTreeIntent } from "./formless-ui-workspace-projection.ts";
import { LegacyGeneratedCreateSurface } from "./legacy-create-surface.tsx";
import {
  LegacyGeneratedOperationButton,
  LegacyGeneratedOperationCompactStatus,
  LegacyGeneratedOperationDestructiveConfirmation,
  LegacyGeneratedOperationFeedback,
  LegacyGeneratedOperationProgress,
} from "./legacy-operation-controls.tsx";
import {
  LegacyDisplayFieldAdapter,
  LegacyRecordFieldAdapter,
} from "./legacy-record-field-adapter.tsx";

export function LegacyTreeRenderer({
  onIntent,
  tree,
}: {
  onIntent: FormlessUiTreeIntentHandler;
  tree: FormlessUiTreeResultContract;
}) {
  return (
    <section
      aria-label={tree.accessibilityLabel}
      className="space-y-4"
      data-formless-legacy-tree-result={tree.id}
    >
      {!tree.editing.enabled ? (
        <p className="text-sm text-slate-600">{tree.editing.disabledReason}</p>
      ) : null}
      <LegacyTreeWarnings warnings={tree.warnings} />
      {tree.status ? <LegacyGeneratedOperationCompactStatus status={tree.status} /> : null}
      {tree.feedback.map((feedback) => (
        <LegacyGeneratedOperationFeedback feedback={feedback} key={feedback.id} />
      ))}
      {tree.availability.state === "unavailable" ? (
        <p aria-live="polite" className="text-sm text-slate-600">
          {tree.availability.message}
        </p>
      ) : tree.availability.state === "empty" ? (
        <div className="space-y-3">
          <div
            aria-live="polite"
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded border border-slate-200 px-4 py-5 text-center text-sm text-slate-600"
            data-formless-tree-empty-state={tree.availability.emptyState.id}
          >
            <p>{tree.availability.emptyState.title}</p>
            {tree.availability.emptyState.description ? (
              <p>{tree.availability.emptyState.description}</p>
            ) : null}
          </div>
          {tree.rootChildCreation ? (
            <LegacyTreeChildCreation
              creation={tree.rootChildCreation}
              onIntent={onIntent}
              parent={{ kind: "root" }}
              resultId={tree.id}
            />
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <section aria-label={tree.root.accessibilityLabel} className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{tree.root.label}</h3>
              {tree.rootChildCreation ? (
                <LegacyTreeChildCreation
                  creation={tree.rootChildCreation}
                  onIntent={onIntent}
                  parent={{ kind: "root" }}
                  resultId={tree.id}
                />
              ) : null}
            </div>
            <LegacyTreeItems items={tree.items} onIntent={onIntent} />
          </section>
          <LegacyTreeSelectedEditor editor={tree.selectedEditor} onIntent={onIntent} tree={tree} />
        </div>
      )}
    </section>
  );
}

export const LegacySubscribedTreeRenderer = memo(
  function LegacySubscribedTreeRenderer({
    reference,
    scope,
  }: {
    reference: FormlessUiTreeResultReference;
    scope: FormlessUiWorkspaceIntentScope;
  }) {
    const onWorkspaceIntent = useFormlessUiWorkspaceIntentHandler();
    const tree = useFormlessUiTreeResult(reference);

    return tree ? (
      <LegacyTreeRenderer
        onIntent={(intent) =>
          onWorkspaceIntent(projectGeneratedWorkspaceTreeIntent(scope, tree.id, intent))
        }
        tree={tree}
      />
    ) : null;
  },
  (previous, next) =>
    formlessUiContractReferenceKey(previous.reference) ===
      formlessUiContractReferenceKey(next.reference) &&
    treeWorkspaceScopesEqual(previous.scope, next.scope),
);

function LegacyTreeItems({
  items,
  onIntent,
}: {
  items: readonly FormlessUiTreeItemContract[];
  onIntent: FormlessUiTreeIntentHandler;
}) {
  return (
    <ol aria-label="Tree items" className="space-y-2">
      {items.map((item) => (
        <LegacyTreeItem item={item} key={item.id} onIntent={onIntent} />
      ))}
    </ol>
  );
}

function LegacyTreeItem({
  item,
  onIntent,
}: {
  item: FormlessUiTreeItemContract;
  onIntent: FormlessUiTreeIntentHandler;
}) {
  const childrenVisible = item.disclosure?.open !== false;

  return (
    <li className="space-y-2" data-formless-legacy-tree-item={item.id}>
      <div
        className={`rounded border px-2 py-2 ${
          item.selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex min-w-0 items-start gap-2">
          {item.disclosure ? (
            <Button
              aria-expanded={item.disclosure.open}
              aria-label={item.disclosure.accessibilityLabel}
              intent="plain"
              onPress={() => void onIntent(item.disclosure!.intent)}
              size="sq-xs"
              type="button"
            >
              <TreeDisclosureIcon aria-hidden="true" />
            </Button>
          ) : (
            <span className="w-7 shrink-0" />
          )}
          <button
            aria-current={item.selected ? "true" : undefined}
            aria-label={item.accessibilityLabel}
            className="min-w-0 flex-1 text-left"
            disabled={!item.availability.available}
            onClick={() => void onIntent(item.selectionIntent)}
            type="button"
          >
            <span className="block truncate text-sm font-medium text-slate-900">{item.label}</span>
            <span className="mt-0.5 flex flex-wrap gap-1 text-xs text-slate-500">
              {item.variant ? <span>{item.variant.label}</span> : null}
              {item.slot ? <span>{item.slot.label}</span> : null}
              <span>{legacyTreeStructureLabel(item)}</span>
            </span>
          </button>
          {item.ordering ? <LegacyTreeOrdering item={item} onIntent={onIntent} /> : null}
        </div>
        {!item.availability.available ? (
          <p className="mt-2 text-xs text-amber-700">{item.availability.message}</p>
        ) : null}
        {"message" in item.structure ? (
          <p className="mt-2 text-xs text-amber-700">{item.structure.message}</p>
        ) : null}
        {item.contextActions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {item.contextActions.map((action) => (
              <Button
                aria-label={action.control.accessibilityLabel}
                intent={legacyTreeButtonIntent(action.control)}
                isDisabled={action.control.disabled || !action.availability.available}
                key={action.id}
                onPress={() => void onIntent(action.intent)}
                size={legacyTreeButtonSize(action.control)}
                type="button"
              >
                {legacyTreeButtonLabel(action.control)}
              </Button>
            ))}
          </div>
        ) : null}
        <LegacyTreeWarnings warnings={item.warnings} />
      </div>
      {childrenVisible && item.children.length > 0 ? (
        <div className="ml-4 border-l border-slate-200 pl-3">
          <LegacyTreeItems items={item.children} onIntent={onIntent} />
        </div>
      ) : null}
    </li>
  );
}

function LegacyTreeOrdering({
  item,
  onIntent,
}: {
  item: FormlessUiTreeItemContract;
  onIntent: FormlessUiTreeIntentHandler;
}) {
  const ordering = item.ordering;
  if (!ordering) {
    return null;
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label={ordering.accessibilityLabel}
        className={buttonStyles({ intent: "plain", size: "sq-xs" })}
        data-formless-legacy-tree-ordering={ordering.id}
        data-formless-legacy-tree-ordering-actions={ordering.actions
          .map((action) => action.label)
          .join("|")}
        isDisabled={ordering.pending}
        type="button"
      >
        <MenuIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuContent popover={{ placement: "bottom start" }}>
        {ordering.actions.map((action) => (
          <MenuItem
            aria-label={action.label}
            isDisabled={action.disabled || !action.structurallyAvailable || ordering.pending}
            key={action.id}
            onAction={() => void onIntent(action.intent)}
          >
            <MenuLabel>{action.label}</MenuLabel>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function LegacyTreeSelectedEditor({
  editor,
  onIntent,
  tree,
}: {
  editor: FormlessUiTreeSelectedEditorContract | undefined;
  onIntent: FormlessUiTreeIntentHandler;
  tree: FormlessUiTreeResultContract;
}) {
  if (!editor) {
    return (
      <p aria-live="polite" className="text-sm text-slate-600">
        Select an item to edit.
      </p>
    );
  }

  if (!editor.availability.available) {
    return (
      <p aria-live="polite" className="text-sm text-slate-600">
        {editor.availability.message}
      </p>
    );
  }

  return (
    <section
      aria-label={editor.accessibilityLabel}
      className="min-w-0 space-y-5 rounded border border-slate-200 bg-white p-4"
      data-formless-legacy-tree-editor={editor.id}
    >
      {!editor.editing.enabled ? (
        <p className="text-sm text-slate-600">{editor.editing.disabledReason}</p>
      ) : null}
      <LegacyTreeFieldSet
        fieldSet={editor.placementFields}
        itemId={editor.itemId}
        kind="placement"
        onIntent={onIntent}
        resultId={tree.id}
      />
      {editor.childFields ? (
        <LegacyTreeFieldSet
          fieldSet={editor.childFields}
          itemId={editor.itemId}
          kind="child"
          onIntent={onIntent}
          resultId={tree.id}
        />
      ) : null}
      {editor.childCreation ? (
        <LegacyTreeChildCreation
          creation={editor.childCreation}
          onIntent={onIntent}
          parent={{ itemId: editor.itemId, kind: "item" }}
          resultId={tree.id}
        />
      ) : null}
      {editor.removePlacement ? (
        <LegacyTreeRemovePlacement editor={editor} onIntent={onIntent} resultId={tree.id} />
      ) : null}
      <LegacyTreeWarnings warnings={editor.warnings} />
    </section>
  );
}

function LegacyTreeFieldSet({
  fieldSet,
  itemId,
  kind,
  onIntent,
  resultId,
}: {
  fieldSet: FormlessUiFieldSetContract;
  itemId: string;
  kind: "child" | "placement";
  onIntent: FormlessUiTreeIntentHandler;
  resultId: string;
}) {
  return (
    <section aria-label={fieldSet.label} className="space-y-3">
      {fieldSet.label ? <h3 className="text-sm font-semibold">{fieldSet.label}</h3> : null}
      {fieldSet.disabledReason ? (
        <p className="text-sm text-slate-600">{fieldSet.disabledReason}</p>
      ) : null}
      <Fieldset className="space-y-3" disabled={fieldSet.disabled}>
        {fieldSet.fields.map((field) => (
          <LegacyTreeField
            field={field}
            fieldSetId={fieldSet.id}
            itemId={itemId}
            key={field.fieldId}
            kind={kind}
            onIntent={onIntent}
            resultId={resultId}
          />
        ))}
      </Fieldset>
      {fieldSet.errors?.map((error) => (
        <p className="text-sm text-red-700" key={error} role="alert">
          {error}
        </p>
      ))}
    </section>
  );
}

function LegacyTreeField({
  field,
  fieldSetId,
  itemId,
  kind,
  onIntent,
  resultId,
}: {
  field: FormlessUiField;
  fieldSetId: string;
  itemId: string;
  kind: "child" | "placement";
  onIntent: FormlessUiTreeIntentHandler;
  resultId: string;
}) {
  if (field.mode === "display") {
    return (
      <div className="grid min-w-0 gap-1" data-formless-legacy-tree-field={field.fieldId}>
        {field.labelVisibility === "visible" ? (
          <span className="text-sm font-medium text-slate-700">{field.label}</span>
        ) : null}
        <div className="flex min-w-0 items-center gap-1 text-sm text-slate-900">
          <LegacyDisplayFieldAdapter field={field} />
        </div>
      </div>
    );
  }

  if (field.surface !== "record") {
    return null;
  }

  return (
    <div data-formless-legacy-tree-field={field.fieldId}>
      <LegacyRecordFieldAdapter
        field={field}
        onIntent={(intent) =>
          onIntent({
            fieldId: field.fieldId,
            intent,
            resultId,
            target: { fieldSetId, itemId, kind },
            type: "treeField",
          })
        }
      />
    </div>
  );
}

function LegacyTreeChildCreation({
  creation,
  onIntent,
  parent,
  resultId,
}: {
  creation: FormlessUiTreeChildCreationContract;
  onIntent: FormlessUiTreeIntentHandler;
  parent: FormlessUiTreeParentIdentity;
  resultId: string;
}) {
  return (
    <div
      className="space-y-2"
      data-formless-legacy-tree-child-creation={creation.id}
      data-formless-legacy-tree-child-variants={creation.variants
        .map((variant) => variant.label)
        .join("|")}
    >
      <Menu>
        <MenuTrigger
          aria-label={creation.accessibilityLabel}
          className={buttonStyles({ intent: "outline" })}
          isDisabled={creation.variants.every((variant) => !variant.availability.available)}
          type="button"
        >
          Add child
        </MenuTrigger>
        <MenuContent popover={{ placement: "bottom start" }}>
          {creation.variants.map((variant) => (
            <MenuItem
              aria-label={variant.label}
              isDisabled={!variant.availability.available}
              key={variant.id}
              onAction={() => void onIntent(variant.selectionIntent)}
            >
              <MenuLabel>
                {variant.label}
                {variant.slot ? ` · ${variant.slot.label}` : ""}
              </MenuLabel>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      {creation.activeCreateSurface ? (
        <LegacyGeneratedCreateSurface
          onCreateIntent={(intent) =>
            onIntent({
              intent,
              parent,
              resultId,
              surfaceId: creation.activeCreateSurface!.id,
              type: "treeCreate",
            })
          }
          onFieldIntent={(fieldId, intent) =>
            onIntent({
              fieldId,
              intent,
              resultId,
              target: {
                kind: "create",
                parent,
                surfaceId: creation.activeCreateSurface!.id,
              },
              type: "treeField",
            })
          }
          renderTrigger={false}
          surface={creation.activeCreateSurface}
        />
      ) : null}
    </div>
  );
}

function LegacyTreeRemovePlacement({
  editor,
  onIntent,
  resultId,
}: {
  editor: FormlessUiTreeSelectedEditorContract;
  onIntent: FormlessUiTreeIntentHandler;
  resultId: string;
}) {
  const control = editor.removePlacement;
  if (!control) {
    return null;
  }
  const dispatch = (intent: FormlessUiOperationPresentationIntent) =>
    onIntent({
      controlId: control.id,
      intent,
      itemId: editor.itemId,
      resultId,
      type: "treeOperation",
    });

  return (
    <section aria-label="Placement actions" className="space-y-2">
      <LegacyGeneratedOperationButton button={control.trigger} onIntent={dispatch} />
      {control.confirmation ? (
        <LegacyGeneratedOperationDestructiveConfirmation
          confirmation={control.confirmation}
          feedback={control.feedback}
          onIntent={dispatch}
          progress={control.progress}
        />
      ) : (
        <>
          {control.feedback ? (
            <LegacyGeneratedOperationFeedback feedback={control.feedback} />
          ) : null}
          {control.progress ? (
            <LegacyGeneratedOperationProgress progress={control.progress} />
          ) : null}
        </>
      )}
      {control.status.status === "idle" ? null : (
        <LegacyGeneratedOperationCompactStatus status={control.status} />
      )}
    </section>
  );
}

function LegacyTreeWarnings({ warnings }: { warnings: readonly FormlessUiTreeWarningContract[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {warnings.map((warning) => (
        <section
          aria-label={warning.title}
          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
          data-formless-tree-warning-source={warning.source}
          key={warning.id}
        >
          <p className="font-medium">{warning.title}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warning.items.map((item) => (
              <li key={`${item.code}:${item.message}`}>{item.message}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function legacyTreeStructureLabel(item: FormlessUiTreeItemContract) {
  switch (item.structure.state) {
    case "branch":
      return "Branch";
    case "cycleStopped":
      return "Cycle stopped";
    case "depthStopped":
      return "Depth stopped";
    case "leaf":
      return "Leaf";
    case "missingChild":
      return "Missing child";
  }
}

function legacyTreeButtonLabel(button: FormlessUiButtonContract) {
  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

function legacyTreeButtonIntent(button: FormlessUiButtonContract) {
  return button.prominence === "primary"
    ? undefined
    : button.prominence === "secondary"
      ? "outline"
      : "plain";
}

function legacyTreeButtonSize(button: FormlessUiButtonContract) {
  return button.density === "compact" && button.content.kind === "iconOnly" ? "sq-xs" : undefined;
}

function treeWorkspaceScopesEqual(
  previous: FormlessUiWorkspaceIntentScope,
  next: FormlessUiWorkspaceIntentScope,
) {
  return (
    previous.collectionId === next.collectionId &&
    previous.screenId === next.screenId &&
    previous.sectionId === next.sectionId
  );
}
