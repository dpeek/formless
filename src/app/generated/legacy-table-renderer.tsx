import { Button } from "@dpeek/formless-ui/button";
import { Fieldset, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@dpeek/formless-ui/menu";
import {
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@dpeek/formless-ui/table";
import type {
  FormlessUiButtonContract,
  FormlessUiField,
  FormlessUiFieldIntent,
  FormlessUiOperationPresentationIntent,
  FormlessUiTableActionContract,
  FormlessUiTableActionGroupContract,
  FormlessUiTableCellContentContract,
  FormlessUiTableColumnContract,
  FormlessUiTableContract,
  FormlessUiTableDisplayValueContract,
  FormlessUiTableEditActionContract,
  FormlessUiTableIntentHandler,
  FormlessUiTableOperationActionContract,
  FormlessUiTableOrderingContract,
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
import { StateMachineStateBadge } from "./state-machine-ui.tsx";

export type LegacyTableFieldIntentHandler = (
  contextId: string,
  fieldId: string,
  recordId: string | undefined,
  intent: FormlessUiFieldIntent,
) => Promise<void> | void;

export type LegacyTableOperationIntentHandler = (
  action: FormlessUiTableOperationActionContract,
  intent: FormlessUiOperationPresentationIntent,
) => Promise<void> | void;

export function LegacyTableRenderer({
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
  table,
}: {
  onFieldIntent: LegacyTableFieldIntentHandler;
  onOperationIntent: LegacyTableOperationIntentHandler;
  onTableIntent: FormlessUiTableIntentHandler;
  table: FormlessUiTableContract;
}) {
  return (
    <section className="space-y-3" data-formless-legacy-table={table.id}>
      {!table.editing.enabled ? (
        <p className="text-sm text-slate-600">{table.editing.disabledReason}</p>
      ) : null}
      <Table
        aria-label={table.accessibilityLabel}
        bleed={true}
        className="min-w-full"
        data-slot="table"
      >
        <TableHeader>
          {table.columns.map((column) => (
            <TableColumn
              className={legacyTableHeaderClass(column)}
              id={column.id}
              isRowHeader={column.isRowHeader}
              key={column.id}
              textValue={column.accessibilityLabel}
            >
              {column.labelVisibility === "hidden" ? (
                <span className="sr-only">{column.accessibilityLabel}</span>
              ) : (
                column.label
              )}
            </TableColumn>
          ))}
        </TableHeader>
        <TableBody
          renderEmptyState={() =>
            table.emptyState ? (
              <div className="space-y-1 px-1.5 py-3 text-sm text-slate-600">
                <p>{table.emptyState.title}</p>
                {table.emptyState.description ? <p>{table.emptyState.description}</p> : null}
                {table.emptyState.action ? (
                  <LegacyTablePrimaryAction
                    action={table.emptyState.action}
                    onOperationIntent={onOperationIntent}
                    onTableIntent={onTableIntent}
                  />
                ) : null}
              </div>
            ) : null
          }
        >
          {table.rows.map((row) => (
            <LegacyTableRows
              columns={table.columns}
              key={row.id}
              onFieldIntent={onFieldIntent}
              onOperationIntent={onOperationIntent}
              onTableIntent={onTableIntent}
              row={row}
            />
          ))}
          {table.rows.length > 0 && table.footer ? (
            <TableRow
              className="border-t bg-muted/50 font-medium"
              data-formless-table-footer="true"
              data-slot="table-footer"
              id={table.footer.id}
              textValue={table.footer.accessibilityLabel}
            >
              {table.footer.cells.map((cell) => {
                const column = requiredTableColumn(table.columns, cell.columnId);

                return (
                  <TableCell className={legacyTableCellClass(column)} key={cell.id}>
                    {cell.kind === "emptyFooterCell" ? (
                      <span aria-hidden="true">&nbsp;</span>
                    ) : (
                      <span aria-label={cell.accessibilityLabel} className="inline-flex gap-1">
                        <span>{cell.displayValue}</span>
                        {cell.suffix ? <span className="text-slate-500">{cell.suffix}</span> : null}
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </section>
  );
}

function LegacyTableRows({
  columns,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
  row,
}: {
  columns: FormlessUiTableContract["columns"];
  onFieldIntent: LegacyTableFieldIntentHandler;
  onOperationIntent: LegacyTableOperationIntentHandler;
  onTableIntent: FormlessUiTableIntentHandler;
  row: FormlessUiTableContract["rows"][number];
}) {
  return (
    <>
      <TableRow
        className="group/record-row"
        data-formless-record-row={row.id}
        id={row.id}
        textValue={row.accessibilityLabel}
      >
        {row.cells.map((cell) => {
          const column = requiredTableColumn(columns, cell.columnId);

          return (
            <TableCell className={legacyTableCellClass(column)} key={cell.id}>
              <div className={`flex min-h-6 items-center gap-1 ${legacyTableJustifyClass(column)}`}>
                {cell.contents.map((content, index) => (
                  <LegacyTableCellContent
                    content={content}
                    contextId={cell.id}
                    key={legacyTableContentKey(content, index)}
                    onFieldIntent={onFieldIntent}
                    onOperationIntent={onOperationIntent}
                    onTableIntent={onTableIntent}
                  />
                ))}
              </div>
            </TableCell>
          );
        })}
      </TableRow>
      {row.warnings.map((warning) => (
        <TableRow id={warning.id} key={warning.id} textValue={warning.title}>
          <TableCell className="px-1.5 py-1 text-xs" colSpan={columns.length}>
            <RecordReadinessWarnings warnings={[...warning.items]} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function LegacyTableCellContent({
  content,
  contextId,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
}: {
  content: FormlessUiTableCellContentContract;
  contextId: string;
  onFieldIntent: LegacyTableFieldIntentHandler;
  onOperationIntent: LegacyTableOperationIntentHandler;
  onTableIntent: FormlessUiTableIntentHandler;
}) {
  if (content.kind === "field") {
    return (
      <LegacyTableField contextId={contextId} field={content.field} onFieldIntent={onFieldIntent} />
    );
  }

  if (content.kind === "displayValue") {
    return <LegacyTableDisplayValue value={content} />;
  }

  if (content.kind === "unavailable") {
    return (
      <span aria-label={content.accessibilityLabel} className="text-slate-400">
        {content.message}
      </span>
    );
  }

  if (content.kind === "ordering") {
    return <LegacyTableOrdering onTableIntent={onTableIntent} ordering={content} />;
  }

  return (
    <LegacyTableActionGroup
      actionGroup={content}
      onFieldIntent={onFieldIntent}
      onOperationIntent={onOperationIntent}
      onTableIntent={onTableIntent}
    />
  );
}

function LegacyTableField({
  contextId,
  field,
  onFieldIntent,
}: {
  contextId: string;
  field: FormlessUiField;
  onFieldIntent: LegacyTableFieldIntentHandler;
}) {
  if (field.stateMachineFacts && field.field.type === "enum") {
    return (
      <LegacyTableStateMachineField
        contextId={contextId}
        field={field}
        onFieldIntent={onFieldIntent}
      />
    );
  }

  if (field.mode === "display") {
    return <LegacyDisplayFieldAdapter field={field} />;
  }

  if (field.surface !== "table-cell" && field.surface !== "record" && field.surface !== "detail") {
    return null;
  }

  return (
    <LegacyRecordFieldAdapter
      field={field}
      onIntent={(intent) => onFieldIntent(contextId, field.fieldId, field.recordId, intent)}
    />
  );
}

function LegacyTableStateMachineField({
  contextId,
  field,
  onFieldIntent,
}: {
  contextId: string;
  field: FormlessUiField;
  onFieldIntent: LegacyTableFieldIntentHandler;
}) {
  if (field.field.type !== "enum") {
    return null;
  }

  const facts = field.stateMachineFacts!;
  const transitions =
    facts.interaction.kind === "transitions"
      ? facts.interaction.transitions.filter(
          (transition) => transition.availability?.valid !== false,
        )
      : [];
  const pending = Boolean(
    field.pending?.isPending || transitions.some((transition) => transition.pending?.isPending),
  );
  const stateValue = typeof facts.currentValue === "string" ? facts.currentValue : "";
  const stateLabel =
    stateValue === "" ? "Unset" : (field.field.values[stateValue]?.label ?? stateValue);
  const stateBadge = (
    <StateMachineStateBadge
      field={field.field}
      label={field.label}
      stateMachine={facts.stateMachine}
      value={facts.currentValue}
    />
  );

  if (transitions.length === 0) {
    return stateBadge;
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label={`${field.label}: ${stateLabel}. Change state.`}
        className="group inline-flex min-h-6 items-center"
        data-formless-state-transition-menu={field.recordId}
        data-formless-state-transition-operation-labels={transitions
          .map((transition) => transition.label)
          .join("|")}
        data-formless-state-transition-operations={transitions
          .map((transition) => transition.operationName)
          .join("|")}
        data-formless-state-transition-target-states={transitions
          .map((transition) => transition.transition.to)
          .join("|")}
        type="button"
      >
        {stateBadge}
      </MenuTrigger>
      <MenuContent popover={{ placement: "bottom start" }}>
        {transitions.map((transition) => {
          const transitionPending = Boolean(transition.pending?.isPending);
          const label = transitionPending
            ? (transition.pending?.label ?? `${transition.label}...`)
            : transition.label;

          return (
            <MenuItem
              aria-label={label}
              data-formless-state-transition-operation={transition.operationName}
              data-formless-state-transition-machine={transition.machineName}
              data-formless-state-transition-state-valid="true"
              data-formless-state-transition-target-state={transition.transition.to}
              isDisabled={pending}
              key={transition.operationName}
              onAction={() => {
                if (pending || !field.recordId || facts.interaction.kind !== "transitions") {
                  return;
                }

                void onFieldIntent(contextId, field.fieldId, field.recordId, {
                  fieldName: field.fieldName,
                  operationName: transition.operationName,
                  recordId: field.recordId,
                  source: facts.interaction.invocationSource,
                  transitionName: transition.transitionName,
                  type: "stateTransitionInvoke",
                });
              }}
            >
              <MenuLabel>{label}</MenuLabel>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

function LegacyTableDisplayValue({ value }: { value: FormlessUiTableDisplayValueContract }) {
  if (value.status.kind === "invalid" || value.status.kind === "unavailable") {
    return (
      <span
        aria-label={value.accessibilityLabel}
        className="text-slate-400"
        title={value.status.message}
      >
        {value.displayValue}
      </span>
    );
  }

  return (
    <span aria-label={value.accessibilityLabel} className="inline-flex gap-1">
      <span>{value.displayValue}</span>
      {value.suffix ? <span className="text-slate-500">{value.suffix}</span> : null}
    </span>
  );
}

function LegacyTableActionGroup({
  actionGroup,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
}: {
  actionGroup: FormlessUiTableActionGroupContract;
  onFieldIntent: LegacyTableFieldIntentHandler;
  onOperationIntent: LegacyTableOperationIntentHandler;
  onTableIntent: FormlessUiTableIntentHandler;
}) {
  const actions = [...actionGroup.primary, ...actionGroup.secondary];

  return (
    <>
      {actionGroup.primary.map((action) => (
        <LegacyTablePrimaryAction
          action={action}
          key={legacyTableActionId(action)}
          onOperationIntent={onOperationIntent}
          onTableIntent={onTableIntent}
        />
      ))}
      {actionGroup.secondary.length > 0 ? (
        <Menu>
          <MenuTrigger
            aria-label={actionGroup.secondaryAccessibilityLabel}
            className="inline-flex size-6 items-center justify-center rounded border"
            type="button"
          >
            <span aria-hidden="true">...</span>
          </MenuTrigger>
          <MenuContent popover={{ placement: "bottom end" }}>
            {actionGroup.secondary.map((action) => (
              <MenuItem
                aria-label={legacyTableActionAccessibilityLabel(action)}
                isDisabled={legacyTableActionDisabled(action)}
                intent={legacyTableActionDestructive(action) ? "danger" : undefined}
                key={legacyTableActionId(action)}
                onAction={() => dispatchLegacyTableAction(action, onOperationIntent, onTableIntent)}
              >
                <MenuLabel>{legacyTableActionLabel(action)}</MenuLabel>
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
      {actions.map((action) => (
        <LegacyTableActionDialog
          action={action}
          key={`${legacyTableActionId(action)}:dialog`}
          onFieldIntent={onFieldIntent}
          onOperationIntent={onOperationIntent}
          onTableIntent={onTableIntent}
        />
      ))}
    </>
  );
}

function LegacyTablePrimaryAction({
  action,
  onOperationIntent,
  onTableIntent,
}: {
  action: FormlessUiTableActionContract;
  onOperationIntent: LegacyTableOperationIntentHandler;
  onTableIntent: FormlessUiTableIntentHandler;
}) {
  if (action.kind === "operationAction") {
    return (
      <LegacyGeneratedOperationButton
        button={action.control.trigger}
        onIntent={(intent) => onOperationIntent(action, intent)}
      />
    );
  }

  const button = action.trigger;

  return (
    <span title={button.disabledReason}>
      <Button
        aria-label={button.accessibilityLabel}
        data-formless-table-action={legacyTableActionId(action)}
        intent={legacyTableButtonIntent(button)}
        isDisabled={button.disabled}
        onPress={() => dispatchLegacyTableAction(action, onOperationIntent, onTableIntent)}
        size={button.density === "compact" ? "xs" : undefined}
        type={button.type}
      >
        {legacyTableButtonLabel(button)}
      </Button>
    </span>
  );
}

function LegacyTableActionDialog({
  action,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
}: {
  action: FormlessUiTableActionContract;
  onFieldIntent: LegacyTableFieldIntentHandler;
  onOperationIntent: LegacyTableOperationIntentHandler;
  onTableIntent: FormlessUiTableIntentHandler;
}) {
  if (action.kind === "operationAction") {
    const confirmation = action.control.confirmation;

    return confirmation ? (
      <LegacyGeneratedOperationDestructiveConfirmation
        confirmation={confirmation}
        feedback={action.control.feedback}
        onIntent={(intent) => onOperationIntent(action, intent)}
        progress={action.control.progress}
      />
    ) : null;
  }

  if (action.kind !== "editAction" || !action.dialog.open) {
    return null;
  }

  return (
    <LegacyTableEditDialog
      action={action}
      onFieldIntent={onFieldIntent}
      onOperationIntent={onOperationIntent}
      onTableIntent={onTableIntent}
    />
  );
}

function LegacyTableEditDialog({
  action,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
}: {
  action: FormlessUiTableEditActionContract;
  onFieldIntent: LegacyTableFieldIntentHandler;
  onOperationIntent: LegacyTableOperationIntentHandler;
  onTableIntent: FormlessUiTableIntentHandler;
}) {
  const { dialog } = action;
  const availableTarget = dialog.target.kind === "available" ? dialog.target : undefined;
  const unavailableMessage =
    dialog.target.kind === "unavailable" ? dialog.target.message : undefined;

  return (
    <ModalContent
      isOpen={dialog.open}
      onOpenChange={(open) => onTableIntent({ ...dialog.openChangeIntent, open })}
      size="3xl"
    >
      <ModalHeader>
        <ModalTitle>{dialog.title}</ModalTitle>
        {dialog.description ? <ModalDescription>{dialog.description}</ModalDescription> : null}
      </ModalHeader>
      <ModalBody>
        {availableTarget === undefined ? (
          <p className="text-sm text-slate-600">{unavailableMessage}</p>
        ) : (
          <>
            {availableTarget.fieldSet.disabledReason ? (
              <p className="text-sm text-slate-600">{availableTarget.fieldSet.disabledReason}</p>
            ) : null}
            <Fieldset
              className="grid gap-3 md:grid-cols-2"
              disabled={availableTarget.fieldSet.disabled}
            >
              {availableTarget.fieldSet.fields.map((field) => (
                <LegacyTableField
                  contextId={availableTarget.fieldSet.id}
                  field={field}
                  key={field.fieldId}
                  onFieldIntent={onFieldIntent}
                />
              ))}
            </Fieldset>
            {availableTarget.fieldSet.errors?.length ? (
              <div role="alert">
                {availableTarget.fieldSet.errors.map((error) => (
                  <p className={fieldErrorStyles()} key={error}>
                    {error}
                  </p>
                ))}
              </div>
            ) : null}
            {availableTarget.actionGroup ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <LegacyTableActionGroup
                  actionGroup={availableTarget.actionGroup}
                  onFieldIntent={onFieldIntent}
                  onOperationIntent={onOperationIntent}
                  onTableIntent={onTableIntent}
                />
              </div>
            ) : null}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          aria-label={dialog.close.accessibilityLabel}
          intent="outline"
          onPress={() => onTableIntent(dialog.openChangeIntent)}
          type="button"
        >
          {legacyTableButtonLabel(dialog.close)}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

function LegacyTableOrdering({
  onTableIntent,
  ordering,
}: {
  onTableIntent: FormlessUiTableIntentHandler;
  ordering: FormlessUiTableOrderingContract;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={ordering.accessibilityLabel}
        className="inline-flex size-6 items-center justify-center rounded border"
        isDisabled={ordering.actions.every((action) => action.disabled)}
        type="button"
      >
        <span aria-hidden="true">::</span>
      </MenuTrigger>
      <MenuContent popover={{ placement: "bottom start" }}>
        {ordering.actions.map((action) => (
          <MenuItem
            aria-label={
              action.disabledReason ? `${action.label}: ${action.disabledReason}` : action.label
            }
            isDisabled={action.disabled}
            key={action.id}
            onAction={() => void onTableIntent(action.intent)}
          >
            <MenuLabel>{action.pending?.isPending ? `${action.label}...` : action.label}</MenuLabel>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function dispatchLegacyTableAction(
  action: FormlessUiTableActionContract,
  onOperationIntent: LegacyTableOperationIntentHandler,
  onTableIntent: FormlessUiTableIntentHandler,
) {
  if (action.kind === "operationAction") {
    void onOperationIntent(action, action.control.trigger.intent);
    return;
  }

  void onTableIntent(action.kind === "editAction" ? action.openIntent : action.intent);
}

function legacyTableActionId(action: FormlessUiTableActionContract) {
  return action.kind === "operationAction" ? action.control.id : action.trigger.id;
}

function legacyTableActionLabel(action: FormlessUiTableActionContract) {
  return legacyTableButtonLabel(
    action.kind === "operationAction" ? action.control.trigger : action.trigger,
  );
}

function legacyTableActionAccessibilityLabel(action: FormlessUiTableActionContract) {
  return action.kind === "operationAction"
    ? action.control.trigger.accessibilityLabel
    : action.trigger.accessibilityLabel;
}

function legacyTableActionDisabled(action: FormlessUiTableActionContract) {
  return action.kind === "operationAction"
    ? action.control.trigger.disabled
    : action.trigger.disabled;
}

function legacyTableActionDestructive(action: FormlessUiTableActionContract) {
  return action.kind === "operationAction" && action.control.trigger.prominence === "destructive";
}

function legacyTableButtonLabel(
  button: Pick<FormlessUiButtonContract, "accessibilityLabel" | "content" | "pending">,
) {
  if (button.pending?.isPending && button.pending.label) {
    return button.pending.label;
  }

  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

function legacyTableButtonIntent(button: FormlessUiButtonContract) {
  if (button.prominence === "primary") {
    return "primary" as const;
  }

  if (button.prominence === "quiet") {
    return "plain" as const;
  }

  return "outline" as const;
}

function legacyTableContentKey(content: FormlessUiTableCellContentContract, index: number) {
  if (content.kind === "field") {
    return content.field.fieldId;
  }

  if (content.kind === "actionGroup" || content.kind === "ordering") {
    return content.kind === "actionGroup" ? content.id : `ordering:${index}`;
  }

  return `${content.kind}:${index}`;
}

function requiredTableColumn(columns: FormlessUiTableContract["columns"], columnId: string) {
  const column = columns.find((candidate) => candidate.id === columnId);

  if (!column) {
    throw new Error(`Missing table column "${columnId}".`);
  }

  return column;
}

function legacyTableHeaderClass(column: FormlessUiTableColumnContract) {
  return `${legacyTableAlignmentClass(column)} ${legacyTableWidthClass(column)} h-8 px-1.5 text-xs`;
}

function legacyTableCellClass(column: FormlessUiTableColumnContract) {
  return `${legacyTableAlignmentClass(column)} ${legacyTableWidthClass(column)} px-1.5 py-1 text-xs`;
}

function legacyTableAlignmentClass(column: FormlessUiTableColumnContract) {
  return column.alignment === "center"
    ? "text-center [&_input]:text-center"
    : column.alignment === "end"
      ? "text-end [&_input]:text-end"
      : "text-start";
}

function legacyTableJustifyClass(column: FormlessUiTableColumnContract) {
  return column.alignment === "center"
    ? "justify-center"
    : column.alignment === "end"
      ? "justify-end"
      : "justify-start";
}

function legacyTableWidthClass(column: FormlessUiTableColumnContract) {
  if (column.contentRole === "ordering") {
    return "w-6 min-w-6 max-w-6";
  }

  switch (column.width) {
    case "xs":
      return "w-20 min-w-20 max-w-24";
    case "sm":
      return "w-28 min-w-28 max-w-32";
    case "md":
      return "w-40 min-w-40 max-w-48";
    case "lg":
      return "w-64 min-w-56";
    case "auto":
      return "";
  }
}
