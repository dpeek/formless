import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@dpeek/formless-ui/menu";
import type {
  FormlessUiField,
  FormlessUiFieldIntent,
  FormlessUiListContract,
  FormlessUiListIntentHandler,
  FormlessUiListOperationActionContract,
  FormlessUiListOrderingActionContract,
  FormlessUiOperationPresentationIntent,
} from "@dpeek/formless-astryx/contract";
import {
  LegacyDisplayFieldAdapter,
  LegacyRecordFieldAdapter,
} from "./legacy-record-field-adapter.tsx";
import {
  LegacyGeneratedOperationButton,
  LegacyGeneratedOperationDestructiveConfirmation,
} from "./legacy-operation-controls.tsx";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";

export type LegacyListFieldIntentHandler = (
  itemId: string,
  field: FormlessUiField,
  intent: FormlessUiFieldIntent,
) => Promise<void> | void;

export type LegacyListOperationIntentHandler = (
  action: FormlessUiListOperationActionContract,
  intent: FormlessUiOperationPresentationIntent,
) => Promise<void> | void;

export function LegacyListRenderer({
  list,
  onFieldIntent,
  onListIntent,
  onOperationIntent,
}: {
  list: FormlessUiListContract;
  onFieldIntent: LegacyListFieldIntentHandler;
  onListIntent: FormlessUiListIntentHandler;
  onOperationIntent: LegacyListOperationIntentHandler;
}) {
  return (
    <section className="space-y-3" data-formless-legacy-list={list.id}>
      {!list.editing.enabled ? (
        <p className="text-sm text-slate-600">{list.editing.disabledReason}</p>
      ) : null}
      {list.items.length === 0 ? (
        list.emptyState ? (
          <div
            aria-live="polite"
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded border border-slate-200 px-4 py-5 text-center text-sm text-slate-600"
            data-formless-list-empty-state={list.emptyState.id}
          >
            <p>{list.emptyState.title}</p>
            {list.emptyState.description ? <p>{list.emptyState.description}</p> : null}
            {list.emptyState.action ? (
              <LegacyListPrimaryAction
                action={list.emptyState.action}
                onOperationIntent={onOperationIntent}
              />
            ) : null}
          </div>
        ) : null
      ) : (
        <div
          aria-label={list.accessibilityLabel}
          className="divide-y divide-slate-200 rounded border border-slate-200 bg-bg"
          role="list"
        >
          {list.items.map((item) => (
            <div
              aria-label={item.accessibilityLabel}
              className="p-3"
              data-formless-list-item={item.id}
              key={item.id}
              role="listitem"
            >
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {item.availability.available ? (
                    item.fields.map((field) => (
                      <LegacyListField
                        field={field}
                        itemId={item.id}
                        key={`${field.recordId ?? item.id}:${field.fieldName}`}
                        onFieldIntent={onFieldIntent}
                      />
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">{item.availability.message}</span>
                  )}
                </div>
                {item.actions.primary.map((action) => (
                  <LegacyListPrimaryAction
                    action={action}
                    key={action.control.id}
                    onOperationIntent={onOperationIntent}
                  />
                ))}
                <LegacyListOverflow
                  item={item}
                  onListIntent={onListIntent}
                  onOperationIntent={onOperationIntent}
                />
              </div>
              {item.warnings.map((warning) => (
                <div className="mt-3" key={warning.id}>
                  <RecordReadinessWarnings warnings={[...warning.items]} />
                </div>
              ))}
              {[...item.actions.primary, ...item.actions.secondary].map((action) =>
                action.control.confirmation ? (
                  <LegacyGeneratedOperationDestructiveConfirmation
                    confirmation={action.control.confirmation}
                    feedback={action.control.feedback}
                    key={`${action.control.id}:confirmation`}
                    onIntent={(intent) =>
                      dispatchLegacyListOperationIntent(onOperationIntent, action, intent)
                    }
                    progress={action.control.progress}
                  />
                ) : null,
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LegacyListField({
  field,
  itemId,
  onFieldIntent,
}: {
  field: FormlessUiField;
  itemId: string;
  onFieldIntent: LegacyListFieldIntentHandler;
}) {
  if (field.mode === "display") {
    return <LegacyDisplayFieldAdapter field={field} />;
  }

  if (field.surface !== "record" && field.surface !== "detail" && field.surface !== "table-cell") {
    return null;
  }

  return (
    <LegacyRecordFieldAdapter
      field={field}
      onIntent={(intent) => dispatchLegacyListFieldIntent(onFieldIntent, itemId, field, intent)}
    />
  );
}

function LegacyListPrimaryAction({
  action,
  onOperationIntent,
}: {
  action: FormlessUiListOperationActionContract;
  onOperationIntent: LegacyListOperationIntentHandler;
}) {
  return (
    <LegacyGeneratedOperationButton
      button={action.control.trigger}
      onIntent={(intent) => dispatchLegacyListOperationIntent(onOperationIntent, action, intent)}
    />
  );
}

function LegacyListOverflow({
  item,
  onListIntent,
  onOperationIntent,
}: {
  item: FormlessUiListContract["items"][number];
  onListIntent: FormlessUiListIntentHandler;
  onOperationIntent: LegacyListOperationIntentHandler;
}) {
  const orderingActions =
    item.ordering?.actions.filter((action) => action.structurallyAvailable) ?? [];
  const accessibilityLabel =
    item.actions.secondary.length > 0
      ? item.actions.secondaryAccessibilityLabel
      : (item.ordering?.accessibilityLabel ?? item.actions.secondaryAccessibilityLabel);

  if (item.actions.secondary.length === 0 && orderingActions.length === 0) {
    return null;
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label={accessibilityLabel}
        className="inline-flex size-6 items-center justify-center rounded border"
        type="button"
      >
        <span aria-hidden="true">...</span>
      </MenuTrigger>
      <MenuContent popover={{ placement: "bottom end" }}>
        {item.actions.secondary.map((action) => (
          <MenuItem
            aria-label={legacyListOperationLabel(action)}
            intent={action.control.trigger.prominence === "destructive" ? "danger" : undefined}
            isDisabled={action.control.trigger.disabled}
            key={action.control.id}
            onAction={() =>
              void dispatchLegacyListOperationIntent(
                onOperationIntent,
                action,
                action.control.trigger.intent,
              )
            }
          >
            <MenuLabel>{legacyListOperationLabel(action)}</MenuLabel>
          </MenuItem>
        ))}
        {orderingActions.map((action) => (
          <MenuItem
            aria-label={
              action.disabledReason ? `${action.label}: ${action.disabledReason}` : action.label
            }
            isDisabled={action.disabled}
            key={action.id}
            onAction={() => void dispatchLegacyListOrderingIntent(onListIntent, action)}
          >
            <MenuLabel>{action.pending?.isPending ? `${action.label}...` : action.label}</MenuLabel>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function legacyListOperationLabel(action: FormlessUiListOperationActionContract) {
  const trigger = action.control.trigger;

  if (trigger.pending?.isPending && trigger.pending.label) {
    return trigger.pending.label;
  }

  return trigger.content.kind === "iconOnly" ? trigger.accessibilityLabel : trigger.content.label;
}

export function dispatchLegacyListFieldIntent(
  handler: LegacyListFieldIntentHandler,
  itemId: string,
  field: FormlessUiField,
  intent: FormlessUiFieldIntent,
) {
  return handler(itemId, field, intent);
}

export function dispatchLegacyListOperationIntent(
  handler: LegacyListOperationIntentHandler,
  action: FormlessUiListOperationActionContract,
  intent: FormlessUiOperationPresentationIntent,
) {
  return handler(action, intent);
}

export function dispatchLegacyListOrderingIntent(
  handler: FormlessUiListIntentHandler,
  action: FormlessUiListOrderingActionContract,
) {
  return handler(action.intent);
}
