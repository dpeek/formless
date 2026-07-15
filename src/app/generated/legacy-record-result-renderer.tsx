import type {
  FormlessUiFieldIntent,
  FormlessUiOperationPresentationIntent,
  FormlessUiRecordResultActionContract,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultFieldContract,
  FormlessUiRecordResultIntentHandler,
} from "@dpeek/formless-astryx/contract";
import {
  LegacyDisplayFieldAdapter,
  LegacyRecordFieldAdapter,
} from "./legacy-record-field-adapter.tsx";
import {
  LegacyGeneratedOperationButton,
  LegacyGeneratedOperationDestructiveConfirmation,
  LegacyGeneratedOperationFeedback,
  LegacyGeneratedOperationProgress,
} from "./legacy-operation-controls.tsx";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";

export function LegacyRecordResultRenderer({
  onIntent,
  recordResult,
}: {
  onIntent: FormlessUiRecordResultIntentHandler;
  recordResult: FormlessUiRecordResultContract;
}) {
  const recordId = recordResult.selectedRecord?.id;

  return (
    <section
      aria-label={recordResult.accessibilityLabel}
      className="max-w-3xl space-y-4"
      data-formless-legacy-record-result={recordResult.id}
    >
      {!recordResult.editing.enabled ? (
        <p className="text-sm text-slate-600">{recordResult.editing.disabledReason}</p>
      ) : null}
      {recordResult.availability.state === "empty" ? (
        recordResult.emptyState ? (
          <div
            aria-live="polite"
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded border border-slate-200 px-4 py-5 text-center text-sm text-slate-600"
            data-formless-record-result-empty-state={recordResult.emptyState.id}
          >
            <p>{recordResult.emptyState.title}</p>
            {recordResult.emptyState.description ? (
              <p>{recordResult.emptyState.description}</p>
            ) : null}
          </div>
        ) : null
      ) : recordResult.availability.state === "unavailable" ? (
        <p aria-live="polite" className="text-sm text-slate-600">
          {recordResult.availability.message}
        </p>
      ) : recordId ? (
        <>
          <div className="grid min-w-0 gap-4">
            {recordResult.fields.map((field) => (
              <LegacyRecordResultField
                field={field}
                key={field.id}
                onIntent={onIntent}
                recordId={recordId}
                recordResult={recordResult}
              />
            ))}
            {recordResult.actions.primary.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {recordResult.actions.primary.map((action) => (
                  <LegacyRecordResultAction
                    action={action}
                    key={action.control.id}
                    onIntent={onIntent}
                    recordId={recordId}
                    recordResult={recordResult}
                  />
                ))}
              </div>
            ) : null}
            {recordResult.actions.secondary.length > 0 ? (
              <div
                aria-label={recordResult.actions.secondaryAccessibilityLabel}
                className="flex flex-wrap gap-2"
              >
                {recordResult.actions.secondary.map((action) => (
                  <LegacyRecordResultAction
                    action={action}
                    key={action.control.id}
                    onIntent={onIntent}
                    recordId={recordId}
                    recordResult={recordResult}
                  />
                ))}
              </div>
            ) : null}
          </div>
          {recordResult.warnings.map((warning) => (
            <RecordReadinessWarnings key={warning.id} warnings={[...warning.items]} />
          ))}
          {[...recordResult.actions.primary, ...recordResult.actions.secondary].map((action) =>
            action.control.confirmation ? (
              <LegacyGeneratedOperationDestructiveConfirmation
                confirmation={action.control.confirmation}
                feedback={action.control.feedback}
                key={`${action.control.id}:confirmation`}
                onIntent={(intent) =>
                  dispatchLegacyRecordResultOperationIntent(
                    onIntent,
                    recordResult,
                    recordId,
                    action,
                    intent,
                  )
                }
                progress={action.control.progress}
              />
            ) : null,
          )}
        </>
      ) : (
        <p aria-live="polite" className="text-sm text-slate-600">
          Record unavailable.
        </p>
      )}
    </section>
  );
}

function LegacyRecordResultField({
  field,
  onIntent,
  recordId,
  recordResult,
}: {
  field: FormlessUiRecordResultFieldContract;
  onIntent: FormlessUiRecordResultIntentHandler;
  recordId: string;
  recordResult: FormlessUiRecordResultContract;
}) {
  if (field.field.mode === "display") {
    return (
      <div className="grid min-w-0 gap-1" data-formless-record-result-field={field.id}>
        {field.field.labelVisibility === "visible" ? (
          <span className="text-sm font-medium text-slate-700">{field.field.label}</span>
        ) : null}
        <div className="flex min-w-0 items-center gap-1 text-sm text-slate-900">
          <LegacyDisplayFieldAdapter field={field.field} />
        </div>
      </div>
    );
  }

  if (field.field.surface !== "record") {
    return null;
  }

  return (
    <div data-formless-record-result-field={field.id}>
      <LegacyRecordFieldAdapter
        field={field.field}
        onIntent={(intent) =>
          dispatchLegacyRecordResultFieldIntent(onIntent, recordResult, recordId, field, intent)
        }
      />
    </div>
  );
}

function LegacyRecordResultAction({
  action,
  onIntent,
  recordId,
  recordResult,
}: {
  action: FormlessUiRecordResultActionContract;
  onIntent: FormlessUiRecordResultIntentHandler;
  recordId: string;
  recordResult: FormlessUiRecordResultContract;
}) {
  return (
    <div className="grid gap-2">
      <LegacyGeneratedOperationButton
        button={action.control.trigger}
        onIntent={(intent) =>
          dispatchLegacyRecordResultOperationIntent(
            onIntent,
            recordResult,
            recordId,
            action,
            intent,
          )
        }
      />
      {!action.control.confirmation && action.control.feedback ? (
        <LegacyGeneratedOperationFeedback feedback={action.control.feedback} />
      ) : null}
      {!action.control.confirmation && action.control.progress ? (
        <LegacyGeneratedOperationProgress progress={action.control.progress} />
      ) : null}
    </div>
  );
}

export function dispatchLegacyRecordResultFieldIntent(
  handler: FormlessUiRecordResultIntentHandler,
  recordResult: FormlessUiRecordResultContract,
  recordId: string,
  field: FormlessUiRecordResultFieldContract,
  intent: FormlessUiFieldIntent,
) {
  return handler({
    fieldId: field.id,
    intent,
    recordId,
    resultId: recordResult.id,
    type: "recordResultFieldIntent",
  });
}

export function dispatchLegacyRecordResultOperationIntent(
  handler: FormlessUiRecordResultIntentHandler,
  recordResult: FormlessUiRecordResultContract,
  recordId: string,
  action: FormlessUiRecordResultActionContract,
  intent: FormlessUiOperationPresentationIntent,
) {
  return handler({
    controlId: action.control.id,
    intent,
    recordId,
    resultId: recordResult.id,
    type: "recordResultOperationIntent",
  });
}
