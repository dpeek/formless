import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FormlessUiField,
  FormlessUiFieldIntent,
  FormlessUiListContract,
  FormlessUiListIntent,
  FormlessUiListItemContract,
  FormlessUiListOperationActionContract,
  FormlessUiOperationControlContract,
  FormlessUiOperationPresentationIntent,
} from "../formless-ui-contract.ts";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { AstryxListRenderer } from "./formless-ui-list-renderer.tsx";
import {
  createFormlessUiListFixtures,
  type FormlessUiListFixture,
  type FormlessUiListFixtureId,
} from "./lists.fixtures.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

export function FormlessListsLayout() {
  const [fixtures, setFixtures] = useState(createFormlessUiListFixtures);
  const [selectedFixtureId, setSelectedFixtureId] = useState<FormlessUiListFixtureId>("active");
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? fixtures[0];

  const updateSelectedList = (update: (list: FormlessUiListContract) => FormlessUiListContract) => {
    setFixtures((currentFixtures) =>
      currentFixtures.map((fixture) =>
        fixture.id === selectedFixtureId ? { ...fixture, list: update(fixture.list) } : fixture,
      ),
    );
  };

  return (
    <main>
      <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
        <VStack gap={5} maxWidth={900} width="100%">
          <HStack align="center" justify="between" wrap="wrap">
            <Heading level={1}>Lists</Heading>
            <SegmentedControl
              label="List state"
              layout="hug"
              onChange={(value) => setSelectedFixtureId(value as FormlessUiListFixtureId)}
              value={selectedFixtureId}
            >
              {fixtures.map((fixture) => (
                <SegmentedControlItem key={fixture.id} label={fixture.label} value={fixture.id} />
              ))}
            </SegmentedControl>
          </HStack>

          {selectedFixture ? (
            <AstryxListRenderer
              list={selectedFixture.list}
              onFieldIntent={(itemId, field, intent) =>
                updateSelectedList((list) => applyListFieldIntent(list, itemId, field, intent))
              }
              onListIntent={(intent) => updateSelectedList((list) => applyListIntent(list, intent))}
              onOperationIntent={(action, intent) =>
                updateSelectedList((list) => applyListOperationIntent(list, action, intent))
              }
            />
          ) : null}
        </VStack>
      </VStack>
    </main>
  );
}

export function applyListFieldIntent(
  list: FormlessUiListContract,
  itemId: string,
  sourceField: FormlessUiField,
  intent: FormlessUiFieldIntent,
): FormlessUiListContract {
  return {
    ...list,
    items: list.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            fields: item.fields.map((field) =>
              sameFixtureField(field, sourceField)
                ? applyScenarioFieldIntent(field, intent)
                : field,
            ),
          }
        : item,
    ),
  };
}

export function applyListIntent(
  list: FormlessUiListContract,
  intent: FormlessUiListIntent,
): FormlessUiListContract {
  if (intent.listId !== list.id) {
    return list;
  }

  return reorderFixtureItems(list, intent.itemId, intent.direction);
}

export function applyListOperationIntent(
  list: FormlessUiListContract,
  sourceAction: FormlessUiListOperationActionContract,
  intent: FormlessUiOperationPresentationIntent,
): FormlessUiListContract {
  return mapListActions(list, (action) => {
    if (action.control.id !== sourceAction.control.id) {
      return action;
    }

    if (intent.type === "operationConfirmationOpenChange") {
      return action.control.confirmation
        ? {
            ...action,
            control: {
              ...action.control,
              confirmation: { ...action.control.confirmation, open: intent.open },
            },
          }
        : action;
    }

    return {
      ...action,
      control: fixtureOperationResult(action.control),
    };
  });
}

function fixtureOperationResult(
  control: FormlessUiOperationControlContract,
): FormlessUiOperationControlContract {
  if (control.id === operationControlFixtures.deleteTask.initial.id) {
    return operationControlFixtures.deleteTask.settled;
  }

  if (control.id === operationControlFixtures.refreshTasks.initial.id) {
    return operationControlFixtures.refreshTasks.pending;
  }

  return control;
}

function reorderFixtureItems(
  list: FormlessUiListContract,
  itemId: string,
  direction: "bottom" | "down" | "top" | "up",
): FormlessUiListContract {
  const currentIndex = list.items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) {
    return list;
  }

  const targetIndex =
    direction === "top"
      ? 0
      : direction === "bottom"
        ? list.items.length - 1
        : direction === "up"
          ? Math.max(0, currentIndex - 1)
          : Math.min(list.items.length - 1, currentIndex + 1);

  if (targetIndex === currentIndex) {
    return list;
  }

  const items = [...list.items];
  const [movedItem] = items.splice(currentIndex, 1);
  if (!movedItem) {
    return list;
  }

  items.splice(targetIndex, 0, movedItem);

  return {
    ...list,
    items: items.map((item, index) => withOrderingAvailability(item, index, items.length)),
  };
}

function withOrderingAvailability(
  item: FormlessUiListItemContract,
  index: number,
  itemCount: number,
): FormlessUiListItemContract {
  if (!item.ordering) {
    return item;
  }

  return {
    ...item,
    ordering: {
      ...item.ordering,
      actions: item.ordering.actions.map((action) => {
        const atStart = index === 0 && (action.direction === "top" || action.direction === "up");
        const atEnd =
          index === itemCount - 1 && (action.direction === "bottom" || action.direction === "down");
        const atBoundary = atStart || atEnd;
        const { disabled: _disabled, disabledReason: _disabledReason, ...baseAction } = action;

        if (item.ordering?.pending) {
          return {
            ...baseAction,
            disabled: true,
            disabledReason: "Ordering in progress",
            structurallyAvailable: !atBoundary,
          };
        }

        return atBoundary
          ? {
              ...baseAction,
              disabled: true,
              disabledReason: atStart ? "Already first" : "Already last",
              structurallyAvailable: false,
            }
          : { ...baseAction, structurallyAvailable: true };
      }),
    },
  };
}

function mapListActions(
  list: FormlessUiListContract,
  update: (action: FormlessUiListOperationActionContract) => FormlessUiListOperationActionContract,
): FormlessUiListContract {
  return {
    ...list,
    ...(list.emptyState?.action
      ? { emptyState: { ...list.emptyState, action: update(list.emptyState.action) } }
      : {}),
    items: list.items.map((item) => ({
      ...item,
      actions: {
        ...item.actions,
        primary: item.actions.primary.map(update),
        secondary: item.actions.secondary.map(update),
      },
    })),
  };
}

function sameFixtureField(left: FormlessUiField, right: FormlessUiField) {
  return left.fieldId === right.fieldId;
}

export function selectedListFixture(
  fixtures: readonly FormlessUiListFixture[],
  id: FormlessUiListFixtureId,
) {
  return fixtures.find((fixture) => fixture.id === id);
}
