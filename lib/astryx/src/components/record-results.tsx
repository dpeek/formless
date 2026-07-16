import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FormlessUiFieldIntent,
  FormlessUiField,
  FormlessUiOperationControlContract,
  FormlessUiRecordResultActionContract,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultIntent,
} from "../formless-ui-contract.ts";
import { applyScenarioFieldIntent, withFixtureFieldOccurrence } from "./fields/fixture-helpers.ts";
import { AstryxRecordResultRenderer } from "./formless-ui-record-result-renderer.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import {
  completedTaskControl,
  createFormlessUiRecordResultFixtures,
  recordResultUnionField,
  taskStatusField,
  type FormlessUiRecordResultFixture,
  type FormlessUiRecordResultFixtureId,
} from "./record-results.fixtures.ts";

export function FormlessRecordResultsLayout() {
  const [fixtures, setFixtures] = useState(createFormlessUiRecordResultFixtures);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessUiRecordResultFixtureId>("editable");
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? fixtures[0];

  const updateSelectedResult = (
    update: (recordResult: FormlessUiRecordResultContract) => FormlessUiRecordResultContract,
  ) => {
    setFixtures((currentFixtures) =>
      currentFixtures.map((fixture) =>
        fixture.id === selectedFixtureId
          ? { ...fixture, recordResult: update(fixture.recordResult) }
          : fixture,
      ),
    );
  };

  return (
    <main>
      <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
        <VStack gap={5} maxWidth={760} width="100%">
          <HStack align="center" justify="between" wrap="wrap">
            <Heading level={1}>Record Results</Heading>
            <SegmentedControl
              label="Record result state"
              layout="hug"
              onChange={(value) => setSelectedFixtureId(value as FormlessUiRecordResultFixtureId)}
              value={selectedFixtureId}
            >
              {fixtures.map((fixture) => (
                <SegmentedControlItem key={fixture.id} label={fixture.label} value={fixture.id} />
              ))}
            </SegmentedControl>
          </HStack>

          {selectedFixture ? (
            <AstryxRecordResultRenderer
              onIntent={(intent) =>
                updateSelectedResult((recordResult) =>
                  applyRecordResultIntent(recordResult, intent),
                )
              }
              recordResult={selectedFixture.recordResult}
            />
          ) : null}
        </VStack>
      </VStack>
    </main>
  );
}

export function applyRecordResultIntent(
  recordResult: FormlessUiRecordResultContract,
  intent: FormlessUiRecordResultIntent,
): FormlessUiRecordResultContract {
  const selectedRecord = recordResult.selectedRecord;

  if (
    intent.resultId !== recordResult.id ||
    !selectedRecord ||
    intent.recordId !== selectedRecord.id
  ) {
    return recordResult;
  }

  if (intent.type === "recordResultFieldIntent") {
    return applyRecordResultFieldIntent(recordResult, intent.fieldId, intent.intent);
  }

  return applyRecordResultOperationIntent(recordResult, intent.controlId, intent.intent);
}

function applyRecordResultFieldIntent(
  recordResult: FormlessUiRecordResultContract,
  fieldId: string,
  intent: FormlessUiFieldIntent,
): FormlessUiRecordResultContract {
  const sourceField = recordResult.fields.find((field) => field.fieldId === fieldId);
  if (!sourceField) {
    return recordResult;
  }

  const fields = recordResult.fields.map((field) =>
    field.fieldId === fieldId ? applyScenarioFieldIntent(field, intent) : field,
  );
  const unionKind = unionKindFromIntent(sourceField, intent);

  return {
    ...recordResult,
    fields: unionKind ? withVisibleUnionField(recordResult, fields, unionKind) : fields,
  };
}

function applyRecordResultOperationIntent(
  recordResult: FormlessUiRecordResultContract,
  controlId: string,
  intent: Extract<FormlessUiRecordResultIntent, { type: "recordResultOperationIntent" }>["intent"],
): FormlessUiRecordResultContract {
  const sourceAction = [...recordResult.actions.primary, ...recordResult.actions.secondary].find(
    (action) => action.control.id === controlId,
  );
  if (!sourceAction || intent.controlId !== sourceAction.control.id) {
    return recordResult;
  }

  if (intent.type === "operationConfirmationOpenChange") {
    return mapRecordResultAction(recordResult, controlId, (action) =>
      action.control.confirmation
        ? {
            ...action,
            control: {
              ...action.control,
              confirmation: { ...action.control.confirmation, open: intent.open },
            },
          }
        : action,
    );
  }

  const updatedResult = mapRecordResultAction(recordResult, controlId, (action) => ({
    ...action,
    control: fixtureOperationResult(action.control),
  }));

  if (controlId !== "task-complete") {
    return updatedResult;
  }

  return {
    ...updatedResult,
    fields: updatedResult.fields.map((field) =>
      field.fieldName === "status" ? { ...taskStatusField("done"), fieldId: field.fieldId } : field,
    ),
  };
}

function fixtureOperationResult(
  control: FormlessUiOperationControlContract,
): FormlessUiOperationControlContract {
  if (control.id === "task-complete") {
    return completedTaskControl();
  }

  if (control.id === operationControlFixtures.deleteTask.initial.id) {
    return operationControlFixtures.deleteTask.settled;
  }

  return control;
}

function unionKindFromIntent(
  sourceField: FormlessUiField,
  intent: FormlessUiFieldIntent,
): "article" | "link" | undefined {
  if (sourceField.fieldName !== "kind") {
    return undefined;
  }

  const value =
    intent.type === "recordEditorDraftChange"
      ? intent.value
      : intent.type === "recordValueCommit"
        ? intent.value
        : undefined;

  return value === "article" || value === "link" ? value : undefined;
}

function withVisibleUnionField(
  recordResult: FormlessUiRecordResultContract,
  fields: readonly FormlessUiField[],
  kind: "article" | "link",
) {
  const visibleFields = fields.filter(
    (field) => field.fieldName !== "summary" && field.fieldName !== "url",
  );
  const kindIndex = visibleFields.findIndex((field) => field.fieldName === "kind");
  const unionField = withRecordResultFieldIdentity(
    recordResult,
    recordResult.selectedRecord?.id ?? "record",
    recordResultUnionField(kind),
  );

  visibleFields.splice(kindIndex < 0 ? visibleFields.length : kindIndex + 1, 0, unionField);
  return visibleFields;
}

function withRecordResultFieldIdentity(
  recordResult: FormlessUiRecordResultContract,
  recordId: string,
  field: FormlessUiField,
): FormlessUiField {
  return withFixtureFieldOccurrence(field, {
    ownerId: `${recordResult.id}:${recordId}`,
    placementId: field.fieldName,
  });
}

function mapRecordResultAction(
  recordResult: FormlessUiRecordResultContract,
  controlId: string,
  update: (action: FormlessUiRecordResultActionContract) => FormlessUiRecordResultActionContract,
): FormlessUiRecordResultContract {
  const mapAction = (action: FormlessUiRecordResultActionContract) =>
    action.control.id === controlId ? update(action) : action;

  return {
    ...recordResult,
    actions: {
      ...recordResult.actions,
      primary: recordResult.actions.primary.map(mapAction),
      secondary: recordResult.actions.secondary.map(mapAction),
    },
  };
}

export function selectedRecordResultFixture(
  fixtures: readonly FormlessUiRecordResultFixture[],
  id: FormlessUiRecordResultFixtureId,
) {
  return fixtures.find((fixture) => fixture.id === id);
}
