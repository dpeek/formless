"use client";

import { useMemo, useState } from "react";
import { Button as AriaButton } from "react-aria-components/Button";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import type {
  GridListItemProps as GridListItemPrimitiveProps,
  GridListItemRenderProps,
  GridListProps as GridListPrimitiveProps,
} from "react-aria-components/GridList";
import {
  GridList as GridListPrimitive,
  GridListItem as GridListItemPrimitive,
} from "react-aria-components/GridList";
import type { Key, Selection } from "react-aria-components/GridList";
import { useDragAndDrop } from "react-aria-components/useDragAndDrop";
import { twJoin, twMerge } from "tailwind-merge";
import { Button } from "./button";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "./modal";
import {
  Menu,
  MenuContent,
  MenuDescription,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "./menu";
import { ControlAddIcon, ControlMenuIcon, TableDragHandleIcon } from "./icons";

export type ObjectListSelection = Selection;
export type ObjectListActionIntent = "danger" | "warning";
export type ObjectListActionPlacement = "item" | "list";
export type ObjectListReorderPosition = "before" | "after";

export interface ObjectListRenderProps<T extends object> {
  item: T;
  id: Key;
  textValue: string;
  isSelected: boolean;
  isDisabled: boolean;
}

export interface ObjectListActionRenderProps<T extends object> {
  item?: T;
  close: () => void;
}

export interface ObjectListAction<T extends object = object> {
  id: Key;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  intent?: ObjectListActionIntent;
  modalTitle?: string;
  modalSize?: React.ComponentProps<typeof ModalContent>["size"];
  renderModal?: (props: ObjectListActionRenderProps<T>) => React.ReactNode;
  onAction?: (item: T | undefined) => void;
}

export interface ObjectListReorderIntent {
  keys: Set<Key>;
  targetKey: Key;
  position: ObjectListReorderPosition;
}

export interface ObjectListReorderOptions {
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  onReorder: (intent: ObjectListReorderIntent) => void;
}

export interface ObjectListProps<T extends object> extends Omit<
  GridListPrimitiveProps<T>,
  | "children"
  | "items"
  | "selectedKeys"
  | "onSelectionChange"
  | "renderEmptyState"
  | "selectionMode"
  | "dragAndDropHooks"
  | "className"
> {
  items: Iterable<T>;
  label: string;
  description?: string;
  selectedKey?: Key | null;
  onSelectionChange?: (key: Key | null) => void;
  getKey: (item: T) => Key;
  getTextValue: (item: T) => string;
  renderItem: (props: ObjectListRenderProps<T>) => React.ReactNode;
  getItemActions?: (item: T) => ObjectListAction<T>[];
  listActions?: ObjectListAction<T>[];
  emptyState?: React.ReactNode;
  reorder?: ObjectListReorderOptions;
  className?: string;
  gridClassName?: GridListPrimitiveProps<T>["className"];
  itemClassName?: string;
}

interface PendingObjectListAction<T extends object> {
  action: ObjectListAction<T>;
  item?: T;
  placement: ObjectListActionPlacement;
}

export function ObjectList<T extends object>({
  items,
  label,
  description,
  selectedKey,
  onSelectionChange,
  getKey,
  getTextValue,
  renderItem,
  getItemActions,
  listActions = [],
  emptyState,
  reorder,
  className,
  gridClassName,
  itemClassName,
  ...props
}: ObjectListProps<T>) {
  const itemArray = useMemo(() => Array.from(items), [items]);
  const selectedKeys = selectedKey == null ? new Set<Key>() : new Set<Key>([selectedKey]);
  const [pendingAction, setPendingAction] = useState<PendingObjectListAction<T> | null>(null);
  const closePendingAction = () => setPendingAction(null);
  const dragAndDrop = useDragAndDrop<T>({
    isDisabled: reorder == null || reorder.disabled === true,
    getItems(keys) {
      return Array.from(keys, (key) => ({
        "text/plain": String(key),
      }));
    },
    onReorder(event) {
      if (event.target.dropPosition === "on") {
        return;
      }

      reorder?.onReorder({
        keys: event.keys,
        targetKey: event.target.key,
        position: event.target.dropPosition,
      });
    },
  });
  const describedById = description ? `${stringFromKey(label)}-description` : undefined;

  return (
    <div data-slot="object-list" className={twMerge("space-y-2", className)}>
      <div className="flex min-h-8 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-fg text-sm/5">{label}</div>
          {description && (
            <div id={describedById} className="text-muted-fg text-xs/5">
              {description}
            </div>
          )}
        </div>
        {listActions.length > 0 && (
          <ObjectListActionControls
            actions={listActions}
            item={undefined}
            placement="list"
            setPendingAction={setPendingAction}
          />
        )}
      </div>
      <GridListPrimitive
        {...props}
        aria-label={label}
        aria-describedby={describedById}
        data-slot="object-list-grid"
        items={itemArray}
        layout="stack"
        selectionMode="single"
        selectedKeys={selectedKeys}
        onSelectionChange={(selection) => {
          onSelectionChange?.(firstSelectedKey(selection));
        }}
        dragAndDropHooks={dragAndDrop.dragAndDropHooks}
        renderEmptyState={() => (
          <ObjectListEmptyState actions={listActions} setPendingAction={setPendingAction}>
            {emptyState}
          </ObjectListEmptyState>
        )}
        className={composeRenderProps(gridClassName, (gridClassName) =>
          twMerge(
            "grid gap-1 rounded-lg border border-border bg-bg p-1 outline-hidden",
            "focus-visible:ring-2 focus-visible:ring-ring",
            "empty:min-h-24",
            gridClassName,
          ),
        )}
      >
        {(item) => {
          const id = getKey(item);
          const textValue = getTextValue(item);
          const actions = getItemActions?.(item) ?? [];
          return (
            <GridListItemPrimitive
              id={id}
              textValue={textValue}
              data-slot="object-list-item"
              className={composeObjectListItemClassName(itemClassName)}
              onAction={() => onSelectionChange?.(id)}
            >
              {(values) => (
                <ObjectListItemContent
                  actions={actions}
                  id={id}
                  isReorderEnabled={reorder != null}
                  isReorderDisabled={reorder?.disabled === true}
                  item={item}
                  reorderLabel={reorder?.label}
                  reorderReason={reorder?.disabledReason}
                  renderItem={renderItem}
                  setPendingAction={setPendingAction}
                  textValue={textValue}
                  values={values}
                />
              )}
            </GridListItemPrimitive>
          );
        }}
      </GridListPrimitive>
      {pendingAction && (
        <Modal isOpen onOpenChange={(isOpen) => !isOpen && closePendingAction()}>
          <ModalContent
            aria-label={pendingAction.action.modalTitle ?? pendingAction.action.label}
            size={pendingAction.action.modalSize}
          >
            <ModalHeader>
              <ModalTitle>
                {pendingAction.action.modalTitle ?? pendingAction.action.label}
              </ModalTitle>
            </ModalHeader>
            <ModalBody>
              {pendingAction.action.renderModal?.({
                item: pendingAction.item,
                close: closePendingAction,
              })}
            </ModalBody>
            <ModalFooter>
              <Button intent="secondary" slot="close">
                Close
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </div>
  );
}

interface ObjectListItemContentProps<T extends object> {
  actions: ObjectListAction<T>[];
  id: Key;
  isReorderEnabled: boolean;
  isReorderDisabled: boolean;
  item: T;
  reorderLabel?: string;
  reorderReason?: string;
  renderItem: (props: ObjectListRenderProps<T>) => React.ReactNode;
  setPendingAction: (action: PendingObjectListAction<T>) => void;
  textValue: string;
  values: GridListItemRenderProps;
}

function ObjectListItemContent<T extends object>({
  actions,
  id,
  isReorderEnabled,
  isReorderDisabled,
  item,
  reorderLabel = "Reorder",
  reorderReason,
  renderItem,
  setPendingAction,
  textValue,
  values,
}: ObjectListItemContentProps<T>) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {isReorderEnabled && (
        <ObjectListDragHandle
          disabled={isReorderDisabled}
          label={reorderLabel}
          reason={reorderReason}
        />
      )}
      <div className="min-w-0 flex-1">
        {renderItem({
          item,
          id,
          textValue,
          isSelected: values.isSelected,
          isDisabled: values.isDisabled,
        })}
      </div>
      {actions.length > 0 && (
        <ObjectListActionControls
          actions={actions}
          item={item}
          placement="item"
          setPendingAction={setPendingAction}
        />
      )}
    </div>
  );
}

interface ObjectListActionControlsProps<T extends object> {
  actions: ObjectListAction<T>[];
  item: T | undefined;
  placement: ObjectListActionPlacement;
  setPendingAction: (action: PendingObjectListAction<T>) => void;
}

function ObjectListActionControls<T extends object>({
  actions,
  item,
  placement,
  setPendingAction,
}: ObjectListActionControlsProps<T>) {
  const visibleActions = actions.filter((action) => action.label.trim().length > 0);
  const actionMetadata = objectListActionMetadata(visibleActions);

  if (visibleActions.length === 0) {
    return null;
  }

  if (placement === "list" && visibleActions.length <= 2) {
    return (
      <div
        data-slot="object-list-actions"
        className="flex shrink-0 items-center gap-1"
        {...actionMetadata}
      >
        {visibleActions.map((action) => (
          <ObjectListActionButton
            action={action}
            item={item}
            key={String(action.id)}
            placement={placement}
            setPendingAction={setPendingAction}
          />
        ))}
      </div>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label={placement === "item" ? "Item actions" : "List actions"}
        data-slot="object-list-action-trigger"
        {...actionMetadata}
      >
        <ControlMenuIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuContent placement="bottom end">
        {visibleActions.map((action, index) => (
          <ObjectListActionMenuItem
            action={action}
            item={item}
            key={String(action.id)}
            placement={placement}
            setPendingAction={setPendingAction}
            showSeparator={index > 0 && action.intent === "danger"}
          />
        ))}
      </MenuContent>
    </Menu>
  );
}

interface ObjectListActionButtonProps<T extends object> {
  action: ObjectListAction<T>;
  item: T | undefined;
  placement: ObjectListActionPlacement;
  setPendingAction: (action: PendingObjectListAction<T>) => void;
}

function ObjectListActionButton<T extends object>({
  action,
  item,
  placement,
  setPendingAction,
}: ObjectListActionButtonProps<T>) {
  return (
    <Button
      aria-disabled={action.disabled || undefined}
      aria-describedby={action.disabledReason ? actionDescriptionId(action) : undefined}
      aria-haspopup={action.renderModal ? "dialog" : undefined}
      data-slot="object-list-action-button"
      intent={buttonIntentForAction(action.intent)}
      size="xs"
      onPress={() => runObjectListAction({ action, item, placement, setPendingAction })}
    >
      {action.label}
      {action.disabledReason && (
        <span id={actionDescriptionId(action)} className="sr-only">
          {action.disabledReason}
        </span>
      )}
    </Button>
  );
}

interface ObjectListActionMenuItemProps<T extends object> extends ObjectListActionButtonProps<T> {
  showSeparator: boolean;
}

function ObjectListActionMenuItem<T extends object>({
  action,
  item,
  placement,
  setPendingAction,
  showSeparator,
}: ObjectListActionMenuItemProps<T>) {
  return (
    <>
      {showSeparator && <MenuSeparator />}
      <MenuItem
        id={action.id}
        aria-haspopup={action.renderModal ? "dialog" : undefined}
        intent={action.intent}
        isDisabled={action.disabled}
        onAction={() => runObjectListAction({ action, item, placement, setPendingAction })}
        textValue={action.label}
      >
        <MenuLabel>{action.label}</MenuLabel>
        {(action.description || action.disabledReason) && (
          <MenuDescription>{action.disabledReason ?? action.description}</MenuDescription>
        )}
      </MenuItem>
    </>
  );
}

interface RunObjectListActionOptions<T extends object> {
  action: ObjectListAction<T>;
  item: T | undefined;
  placement: ObjectListActionPlacement;
  setPendingAction: (action: PendingObjectListAction<T>) => void;
}

function runObjectListAction<T extends object>({
  action,
  item,
  placement,
  setPendingAction,
}: RunObjectListActionOptions<T>) {
  if (action.disabled) {
    return;
  }

  if (action.renderModal) {
    setPendingAction({ action, item, placement });
    return;
  }

  action.onAction?.(item);
}

interface ObjectListDragHandleProps {
  disabled: boolean;
  label: string;
  reason?: string;
}

function ObjectListDragHandle({ disabled, label, reason }: ObjectListDragHandleProps) {
  if (!label) {
    return null;
  }

  const reasonId = reason ? `${stringFromKey(label)}-reorder-reason` : undefined;

  return (
    <AriaButton
      aria-disabled={disabled || undefined}
      aria-describedby={reasonId}
      aria-label={label}
      className={twJoin(
        "grid size-7 shrink-0 place-content-center rounded-md text-muted-fg outline-hidden",
        "hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "opacity-50",
      )}
      data-slot="object-list-drag-handle"
      slot="drag"
    >
      <TableDragHandleIcon aria-hidden="true" className="size-4" />
      {reason && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </AriaButton>
  );
}

interface ObjectListEmptyStateProps<T extends object> {
  actions: ObjectListAction<T>[];
  children?: React.ReactNode;
  setPendingAction: (action: PendingObjectListAction<T>) => void;
}

function ObjectListEmptyState<T extends object>({
  actions,
  children,
  setPendingAction,
}: ObjectListEmptyStateProps<T>) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-24 flex-col items-center justify-center gap-2 px-4 py-5 text-center"
      data-slot="object-list-empty"
    >
      <div className="max-w-sm text-muted-fg text-sm/6">
        {children ?? "No items are currently available."}
      </div>
      {actions.length === 1 && !actions[0]?.disabled && (
        <div className="pt-1">
          <Button
            aria-haspopup={actions[0].renderModal ? "dialog" : undefined}
            data-slot="object-list-empty-action"
            intent="secondary"
            size="xs"
            onPress={() =>
              runObjectListAction({
                action: actions[0],
                item: undefined,
                placement: "list",
                setPendingAction,
              })
            }
          >
            <ControlAddIcon aria-hidden="true" />
            {actions[0].label}
          </Button>
        </div>
      )}
    </div>
  );
}

function composeObjectListItemClassName<T extends object>(
  className: string | undefined,
): GridListItemPrimitiveProps<T>["className"] {
  return ({ isSelected, isFocusVisible, isPressed, isDisabled }) =>
    twMerge(
      "group relative cursor-default rounded-md outline outline-transparent",
      "px-2 py-1.5 text-sm/6",
      "hover:bg-secondary hover:text-fg",
      isSelected && "bg-primary/10 text-fg outline-primary/40",
      isFocusVisible && "outline-primary ring-3 ring-ring/20",
      isPressed && "bg-primary/15",
      isDisabled && "opacity-50",
      className,
    );
}

function firstSelectedKey(selection: Selection): Key | null {
  if (selection === "all") {
    return null;
  }

  return selection.values().next().value ?? null;
}

function buttonIntentForAction(
  intent: ObjectListActionIntent | undefined,
): React.ComponentProps<typeof Button>["intent"] {
  if (intent === "danger") {
    return "danger";
  }

  if (intent === "warning") {
    return "warning";
  }

  return "secondary";
}

function actionDescriptionId(action: Pick<ObjectListAction, "id">): string {
  return `${stringFromKey(action.id)}-action-description`;
}

function objectListActionMetadata<T extends object>(actions: ObjectListAction<T>[]) {
  const actionLabels = actions.map((action) => action.label).join("|");
  const disabledActionLabels = actions
    .filter((action) => action.disabled)
    .map((action) =>
      action.disabledReason ? `${action.label}: ${action.disabledReason}` : action.label,
    )
    .join("|");
  const dangerActionLabels = actions
    .filter((action) => action.intent === "danger")
    .map((action) => action.label)
    .join("|");
  const modalActionLabels = actions
    .filter((action) => action.renderModal)
    .map((action) => action.label)
    .join("|");

  return {
    "data-object-list-action-labels": actionLabels || undefined,
    "data-object-list-danger-action-labels": dangerActionLabels || undefined,
    "data-object-list-disabled-action-labels": disabledActionLabels || undefined,
    "data-object-list-modal-action-labels": modalActionLabels || undefined,
  };
}

function stringFromKey(key: Key | string): string {
  return String(key).replaceAll(/[^A-Za-z0-9_-]/g, "-");
}
