import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FormlessUiField,
  FormlessUiFieldIntent,
  FormlessUiOperationPresentationIntent,
  FormlessUiTableActionContract,
  FormlessUiTableActionGroupContract,
  FormlessUiTableContract,
  FormlessUiTableIntent,
  FormlessUiTableOperationActionContract,
  FormlessUiTableRowContract,
} from "../formless-ui-contract.ts";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { AstryxTableRenderer } from "./formless-ui-table-renderer.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import {
  createFormlessUiTableFixtures,
  type FormlessUiTableFixture,
  type FormlessUiTableFixtureId,
} from "./tables.fixtures.ts";

export function FormlessTablesLayout() {
  const [fixtures, setFixtures] = useState(createFormlessUiTableFixtures);
  const [selectedFixtureId, setSelectedFixtureId] = useState<FormlessUiTableFixtureId>("active");
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? fixtures[0];

  const updateSelectedTable = (
    update: (table: FormlessUiTableContract) => FormlessUiTableContract,
  ) => {
    setFixtures((currentFixtures) =>
      currentFixtures.map((fixture) =>
        fixture.id === selectedFixtureId ? { ...fixture, table: update(fixture.table) } : fixture,
      ),
    );
  };

  return (
    <main>
      <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
        <VStack gap={5} maxWidth={1200} width="100%">
          <HStack align="center" justify="between" wrap="wrap">
            <Heading level={1}>Tables</Heading>
            <SegmentedControl
              label="Table state"
              layout="hug"
              onChange={(value) => setSelectedFixtureId(value as FormlessUiTableFixtureId)}
              value={selectedFixtureId}
            >
              {fixtures.map((fixture) => (
                <SegmentedControlItem key={fixture.id} label={fixture.label} value={fixture.id} />
              ))}
            </SegmentedControl>
          </HStack>

          {selectedFixture ? (
            <AstryxTableRenderer
              onFieldIntent={(_contextId, fieldId, _recordId, intent) =>
                updateSelectedTable((table) => applyTableFieldIntent(table, fieldId, intent))
              }
              onOperationIntent={(action, intent) =>
                updateSelectedTable((table) => applyTableOperationIntent(table, action, intent))
              }
              onTableIntent={(intent) =>
                updateSelectedTable((table) => applyTableIntent(table, intent))
              }
              table={selectedFixture.table}
            />
          ) : null}
        </VStack>
      </VStack>
    </main>
  );
}

export function applyTableFieldIntent(
  table: FormlessUiTableContract,
  fieldId: string,
  intent: FormlessUiFieldIntent,
): FormlessUiTableContract {
  return {
    ...table,
    rows: table.rows.map((row) =>
      mapRowFields(row, (field) =>
        field.fieldId === fieldId ? applyScenarioFieldIntent(field, intent) : field,
      ),
    ),
  };
}

export function applyTableIntent(
  table: FormlessUiTableContract,
  intent: FormlessUiTableIntent,
): FormlessUiTableContract {
  if (intent.tableId !== table.id) {
    return table;
  }

  if (intent.type === "tableEditDialogOpenChange") {
    return mapTableActions(table, (action) =>
      action.kind === "editAction" && action.dialog.id === intent.dialogId
        ? { ...action, dialog: { ...action.dialog, open: intent.open } }
        : action,
    );
  }

  if (intent.type === "tableReorder") {
    return reorderFixtureRows(table, intent.rowId, intent.direction);
  }

  return table;
}

export function applyTableOperationIntent(
  table: FormlessUiTableContract,
  sourceAction: FormlessUiTableOperationActionContract,
  intent: FormlessUiOperationPresentationIntent,
): FormlessUiTableContract {
  return mapTableActions(table, (action) => {
    if (action.kind !== "operationAction" || action.control.id !== sourceAction.control.id) {
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

    return action.control.id === operationControlFixtures.deleteTask.initial.id
      ? { ...action, control: operationControlFixtures.deleteTask.settled }
      : action;
  });
}

function reorderFixtureRows(
  table: FormlessUiTableContract,
  rowId: string,
  direction: "bottom" | "down" | "top" | "up",
): FormlessUiTableContract {
  const currentIndex = table.rows.findIndex((row) => row.id === rowId);
  if (currentIndex < 0) {
    return table;
  }

  const targetIndex =
    direction === "top"
      ? 0
      : direction === "bottom"
        ? table.rows.length - 1
        : direction === "up"
          ? Math.max(0, currentIndex - 1)
          : Math.min(table.rows.length - 1, currentIndex + 1);

  if (targetIndex === currentIndex) {
    return table;
  }

  const rows = [...table.rows];
  const [movedRow] = rows.splice(currentIndex, 1);
  if (!movedRow) {
    return table;
  }

  rows.splice(targetIndex, 0, movedRow);

  return {
    ...table,
    rows: rows.map((row, index) => withOrderingAvailability(row, index, rows.length)),
  };
}

function withOrderingAvailability(
  row: FormlessUiTableRowContract,
  index: number,
  rowCount: number,
): FormlessUiTableRowContract {
  return {
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      contents: cell.contents.map((content) => {
        if (content.kind !== "ordering") {
          return content;
        }

        return {
          ...content,
          actions: content.actions.map((action) => {
            const disabled =
              (index === 0 && (action.direction === "top" || action.direction === "up")) ||
              (index === rowCount - 1 &&
                (action.direction === "bottom" || action.direction === "down"));
            const { disabled: _disabled, disabledReason: _disabledReason, ...baseAction } = action;

            return disabled
              ? {
                  ...baseAction,
                  disabled: true,
                  disabledReason: index === 0 ? "Already first" : "Already last",
                }
              : baseAction;
          }),
        };
      }),
    })),
  };
}

function mapRowFields(
  row: FormlessUiTableRowContract,
  update: (field: FormlessUiField) => FormlessUiField,
): FormlessUiTableRowContract {
  return {
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      contents: cell.contents.map((content) => {
        if (content.kind === "field") {
          return { ...content, field: update(content.field) };
        }

        return content.kind === "actionGroup" ? mapActionGroupFields(content, update) : content;
      }),
    })),
  };
}

function mapActionGroupFields(
  group: FormlessUiTableActionGroupContract,
  update: (field: FormlessUiField) => FormlessUiField,
): FormlessUiTableActionGroupContract {
  return {
    ...group,
    primary: group.primary.map((action) => mapActionFields(action, update)),
    secondary: group.secondary.map((action) => mapActionFields(action, update)),
  };
}

function mapActionFields(
  action: FormlessUiTableActionContract,
  update: (field: FormlessUiField) => FormlessUiField,
): FormlessUiTableActionContract {
  if (action.kind !== "editAction" || action.dialog.target.kind !== "available") {
    return action;
  }

  const { target } = action.dialog;

  return {
    ...action,
    dialog: {
      ...action.dialog,
      target: {
        ...target,
        ...(target.actionGroup
          ? { actionGroup: mapActionGroupFields(target.actionGroup, update) }
          : {}),
        fieldSet: {
          ...target.fieldSet,
          fields: target.fieldSet.fields.map(update),
        },
      },
    },
  };
}

function mapTableActions(
  table: FormlessUiTableContract,
  update: (action: FormlessUiTableActionContract) => FormlessUiTableActionContract,
): FormlessUiTableContract {
  return {
    ...table,
    rows: table.rows.map((row) => mapRowActions(row, update)),
  };
}

function mapRowActions(
  row: FormlessUiTableRowContract,
  update: (action: FormlessUiTableActionContract) => FormlessUiTableActionContract,
): FormlessUiTableRowContract {
  return {
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      contents: cell.contents.map((content) =>
        content.kind === "actionGroup" ? mapActionGroupActions(content, update) : content,
      ),
    })),
  };
}

function mapActionGroupActions(
  group: FormlessUiTableActionGroupContract,
  update: (action: FormlessUiTableActionContract) => FormlessUiTableActionContract,
): FormlessUiTableActionGroupContract {
  return {
    ...group,
    primary: group.primary.map((action) => mapActionTree(action, update)),
    secondary: group.secondary.map((action) => mapActionTree(action, update)),
  };
}

function mapActionTree(
  action: FormlessUiTableActionContract,
  update: (action: FormlessUiTableActionContract) => FormlessUiTableActionContract,
): FormlessUiTableActionContract {
  if (action.kind !== "editAction" || action.dialog.target.kind !== "available") {
    return update(action);
  }

  const { target } = action.dialog;
  const actionWithChildren = target.actionGroup
    ? {
        ...action,
        dialog: {
          ...action.dialog,
          target: {
            ...target,
            actionGroup: mapActionGroupActions(target.actionGroup, update),
          },
        },
      }
    : action;

  return update(actionWithChildren);
}

export function selectedTableFixture(
  fixtures: readonly FormlessUiTableFixture[],
  id: FormlessUiTableFixtureId,
) {
  return fixtures.find((fixture) => fixture.id === id);
}
