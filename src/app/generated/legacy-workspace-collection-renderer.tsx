import { Badge } from "@dpeek/formless-ui/badge";
import { Tab, TabList, Tabs } from "@dpeek/formless-ui/tabs";
import type {
  FormlessUiField,
  FormlessUiFieldIntent,
  FormlessUiListOperationActionContract,
  FormlessUiOperationPresentationIntent,
  FormlessUiTableOperationActionContract,
  FormlessUiWorkspaceCollectionActionContract,
  FormlessUiWorkspaceCollectionActionGroupContract,
  FormlessUiWorkspaceCollectionContract,
  FormlessUiWorkspaceContextContract,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceIntentScope,
  FormlessUiWorkspaceQueryNavigationContract,
  FormlessUiWorkspaceResultContract,
  FormlessUiWorkspaceSummaryContract,
} from "@dpeek/formless-astryx/contract";
import {
  projectGeneratedWorkspaceCreateIntent,
  projectGeneratedWorkspaceFieldIntent,
  projectGeneratedWorkspaceListIntent,
  projectGeneratedWorkspaceOperationIntent,
  projectGeneratedWorkspaceRecordResultIntent,
  projectGeneratedWorkspaceTableIntent,
} from "./formless-ui-workspace-projection.ts";
import { LegacyGeneratedCreateSurface } from "./legacy-create-surface.tsx";
import { LegacyListRenderer } from "./legacy-list-renderer.tsx";
import {
  LegacyGeneratedOperationButton,
  LegacyGeneratedOperationDestructiveConfirmation,
} from "./legacy-operation-controls.tsx";
import { LegacyRecordResultRenderer } from "./legacy-record-result-renderer.tsx";
import { LegacyTableRenderer } from "./legacy-table-renderer.tsx";

export function LegacyWorkspaceCollectionRenderer({
  collection,
  onIntent,
  scope,
}: {
  collection: FormlessUiWorkspaceCollectionContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (collection.availability.state === "empty") {
    return (
      <div
        aria-live="polite"
        className="flex min-h-24 flex-col items-center justify-center gap-1 rounded border border-slate-200 px-4 py-5 text-center text-sm text-slate-600"
        data-formless-workspace-empty-state={collection.availability.emptyState.id}
      >
        <p>{collection.availability.emptyState.title}</p>
        {collection.availability.emptyState.description ? (
          <p>{collection.availability.emptyState.description}</p>
        ) : null}
      </div>
    );
  }

  if (collection.availability.state === "unavailable") {
    return (
      <p aria-live="polite" className="text-sm text-slate-600">
        {collection.availability.message}
      </p>
    );
  }

  const presentation = collection.presentation;

  if (presentation.kind === "listDetail") {
    return (
      <section
        aria-label={presentation.accessibilityLabel}
        className="grid min-w-0 gap-6 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]"
        data-formless-legacy-workspace-collection={collection.id}
      >
        <LegacyWorkspaceListDetailSelector
          context={presentation.selector}
          onIntent={onIntent}
          scope={scope}
        />
        <div className="min-w-0 space-y-6">
          {presentation.contextDetail ? (
            <div className="border-b border-slate-200 pb-4">
              <LegacyWorkspaceRecordResult
                contextId={presentation.selector.id}
                onIntent={onIntent}
                recordResult={presentation.contextDetail}
                scope={scope}
              />
            </div>
          ) : null}
          <LegacyWorkspaceQueryNavigation
            navigation={presentation.queryNavigation}
            onIntent={onIntent}
          />
          <LegacyWorkspaceSummaries summaries={presentation.summaries} />
          <LegacyWorkspaceResult onIntent={onIntent} result={presentation.result} scope={scope} />
          <LegacyWorkspaceCollectionActions
            actions={presentation.actions}
            onIntent={onIntent}
            scope={scope}
          />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6" data-formless-legacy-workspace-collection={collection.id}>
      {presentation.context ? (
        <LegacyWorkspaceOrdinaryContext
          context={presentation.context}
          detail={presentation.contextDetail}
          onIntent={onIntent}
          scope={scope}
        />
      ) : null}
      <LegacyWorkspaceQueryNavigation
        navigation={presentation.queryNavigation}
        onIntent={onIntent}
      />
      <LegacyWorkspaceSummaries summaries={presentation.summaries} />
      <LegacyWorkspaceResult onIntent={onIntent} result={presentation.result} scope={scope} />
      <LegacyWorkspaceCollectionActions
        actions={presentation.actions}
        onIntent={onIntent}
        scope={scope}
      />
    </div>
  );
}

function LegacyWorkspaceQueryNavigation({
  navigation,
  onIntent,
}: {
  navigation?: FormlessUiWorkspaceQueryNavigationContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
}) {
  if (!navigation) {
    return null;
  }

  const selected = navigation.items.find((item) => item.selected)?.id;

  return (
    <Tabs
      onSelectionChange={(key) => {
        if (typeof key !== "string") {
          return;
        }
        const item = navigation.items.find((candidate) => candidate.id === key);
        if (item?.availability.available) {
          void onIntent(item.selectionIntent);
        }
      }}
      selectedKey={selected}
    >
      <TabList aria-label={navigation.accessibilityLabel}>
        {navigation.items.map((item) => (
          <Tab id={item.id} isDisabled={!item.availability.available} key={item.id}>
            <span>{item.label}</span>
            {item.countText === undefined ? null : (
              <span aria-label={`${item.label} count`} className="ml-2">
                {item.countText}
              </span>
            )}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}

function LegacyWorkspaceOrdinaryContext({
  context,
  detail,
  onIntent,
  scope,
}: {
  context: FormlessUiWorkspaceContextContract;
  detail?: Extract<FormlessUiWorkspaceResultContract, { kind: "recordResult" }>;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (context.presentation === "externalNavigation") {
    return detail ? (
      <div className="border-b border-slate-200 pb-4">
        <LegacyWorkspaceRecordResult
          contextId={context.id}
          onIntent={onIntent}
          recordResult={detail}
          scope={scope}
        />
      </div>
    ) : null;
  }

  return (
    <section className="space-y-3 border-b border-slate-200 pb-4">
      {context.presentation === "localTabs" ? (
        <div className="flex flex-wrap items-center gap-4">
          <LegacyWorkspaceContextTabs context={context} onIntent={onIntent} />
          <LegacyWorkspaceContextCreate context={context} onIntent={onIntent} scope={scope} />
        </div>
      ) : null}
      <LegacyWorkspaceContextAvailability context={context} />
      {detail ? (
        <LegacyWorkspaceRecordResult
          contextId={context.id}
          onIntent={onIntent}
          recordResult={detail}
          scope={scope}
        />
      ) : null}
    </section>
  );
}

function LegacyWorkspaceContextTabs({
  context,
  onIntent,
}: {
  context: FormlessUiWorkspaceContextContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
}) {
  return (
    <Tabs
      onSelectionChange={(key) => {
        if (typeof key !== "string") {
          return;
        }
        const option = context.options.find((candidate) => candidate.id === key);
        if (option?.availability.available) {
          void onIntent(option.selectionIntent);
        }
      }}
      selectedKey={context.selectedOptionId}
    >
      <TabList aria-label={context.accessibilityLabel}>
        {context.options.map((option) => (
          <Tab id={option.id} isDisabled={!option.availability.available} key={option.id}>
            <span>{option.label}</span>
            {option.countText === undefined ? null : (
              <Badge
                aria-label={`${option.label} count`}
                className="ml-2 h-4 px-1.5"
                intent="outline"
              >
                {option.countText}
              </Badge>
            )}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}

function LegacyWorkspaceListDetailSelector({
  context,
  onIntent,
  scope,
}: {
  context: FormlessUiWorkspaceContextContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  return (
    <aside className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-900">{context.label}</h2>
        <LegacyWorkspaceContextCreate context={context} onIntent={onIntent} scope={scope} />
      </div>
      <LegacyWorkspaceContextAvailability context={context} />
      {context.availability.state === "ready" ? (
        <ul aria-label={context.accessibilityLabel} className="space-y-1">
          {context.options.map((option) => (
            <li key={option.id}>
              <button
                aria-current={option.selected ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded border px-2 py-2 text-left text-sm transition-colors ${
                  option.selected
                    ? "border-slate-900 bg-slate-50 text-slate-950"
                    : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                }`}
                disabled={!option.availability.available}
                onClick={() => void onIntent(option.selectionIntent)}
                type="button"
              >
                <span className="truncate">{option.label}</span>
                {option.countText === undefined ? null : (
                  <Badge
                    aria-label={`${option.label} count`}
                    className="h-4 px-1.5"
                    intent="outline"
                  >
                    {option.countText}
                  </Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

function LegacyWorkspaceContextAvailability({
  context,
}: {
  context: FormlessUiWorkspaceContextContract;
}) {
  if (context.availability.state === "ready") {
    return null;
  }

  return (
    <p aria-live="polite" className="text-sm text-slate-600">
      {context.availability.state === "empty"
        ? context.availability.emptyState.title
        : context.availability.message}
    </p>
  );
}

function LegacyWorkspaceContextCreate({
  context,
  onIntent,
  scope,
}: {
  context: FormlessUiWorkspaceContextContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const action = context.createAction;
  if (!action) {
    return null;
  }

  return (
    <LegacyGeneratedCreateSurface
      onCreateIntent={(intent) =>
        onIntent(
          projectGeneratedWorkspaceCreateIntent(scope, action.surface.id, intent, context.id),
        )
      }
      onFieldIntent={(intent) =>
        onIntent(
          projectGeneratedWorkspaceFieldIntent(scope, workspaceCreateFieldId(intent), intent, {
            contextId: context.id,
            surfaceId: action.surface.id,
          }),
        )
      }
      surface={action.surface}
    />
  );
}

function LegacyWorkspaceSummaries({
  summaries,
}: {
  summaries: readonly FormlessUiWorkspaceSummaryContract[];
}) {
  const visible = summaries.filter((summary) => summary.availability.available);
  if (visible.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Collection summary"
      className="flex flex-wrap items-stretch gap-3 border-b border-slate-200 pb-4"
    >
      {visible.map((summary) => (
        <div
          aria-label={`${summary.label} summary`}
          className="min-w-32 rounded border border-slate-200 bg-white px-3 py-2"
          key={summary.id}
        >
          <div className="text-xs font-medium text-slate-500">{summary.label}</div>
          <div className="mt-1 flex min-h-6 items-baseline gap-1 text-sm font-semibold text-slate-900">
            <span>{summary.displayValue}</span>
            {summary.suffix ? (
              <span className="text-xs font-normal text-slate-500">{summary.suffix}</span>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function LegacyWorkspaceCollectionActions({
  actions,
  onIntent,
  scope,
}: {
  actions: FormlessUiWorkspaceCollectionActionGroupContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (actions.primary.length === 0 && actions.secondary.length === 0) {
    return null;
  }

  return (
    <section aria-label={actions.secondaryAccessibilityLabel} className="flex flex-wrap gap-2">
      {[...actions.primary, ...actions.secondary].map((action) => (
        <LegacyWorkspaceCollectionAction
          action={action}
          key={workspaceCollectionActionId(action)}
          onIntent={onIntent}
          scope={scope}
        />
      ))}
    </section>
  );
}

function LegacyWorkspaceCollectionAction({
  action,
  onIntent,
  scope,
}: {
  action: FormlessUiWorkspaceCollectionActionContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (action.kind === "createAction") {
    return (
      <LegacyGeneratedCreateSurface
        onCreateIntent={(intent) =>
          onIntent(projectGeneratedWorkspaceCreateIntent(scope, action.surface.id, intent))
        }
        onFieldIntent={(intent) =>
          onIntent(
            projectGeneratedWorkspaceFieldIntent(scope, workspaceCreateFieldId(intent), intent, {
              surfaceId: action.surface.id,
            }),
          )
        }
        surface={action.surface}
      />
    );
  }

  const dispatch = (intent: FormlessUiOperationPresentationIntent) =>
    onIntent(projectGeneratedWorkspaceOperationIntent(scope, action.control.id, intent));

  return (
    <>
      <LegacyGeneratedOperationButton button={action.control.trigger} onIntent={dispatch} />
      {action.control.confirmation ? (
        <LegacyGeneratedOperationDestructiveConfirmation
          confirmation={action.control.confirmation}
          feedback={action.control.feedback}
          onIntent={dispatch}
          progress={action.control.progress}
        />
      ) : null}
    </>
  );
}

function LegacyWorkspaceResult({
  onIntent,
  result,
  scope,
}: {
  onIntent: FormlessUiWorkspaceIntentHandler;
  result: FormlessUiWorkspaceResultContract;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (result.kind === "list") {
    return (
      <LegacyListRenderer
        list={result}
        onFieldIntent={(itemId, field, intent) =>
          onIntent(
            projectGeneratedWorkspaceFieldIntent(
              scope,
              workspaceListFieldId(result, itemId, field),
              intent,
              { recordId: field.recordId ?? itemId, resultId: result.id },
            ),
          )
        }
        onListIntent={(intent) =>
          onIntent(projectGeneratedWorkspaceListIntent(scope, result.id, intent))
        }
        onOperationIntent={(action, intent) =>
          onIntent(
            projectGeneratedWorkspaceOperationIntent(scope, action.control.id, intent, {
              recordId: workspaceListActionRecordId(result, action),
              resultId: result.id,
            }),
          )
        }
      />
    );
  }

  if (result.kind === "table") {
    return (
      <LegacyTableRenderer
        onFieldIntent={(contextId, field, intent) =>
          onIntent(
            projectGeneratedWorkspaceFieldIntent(scope, contextId, intent, {
              ...(field.recordId === undefined ? {} : { recordId: field.recordId }),
              resultId: result.id,
            }),
          )
        }
        onOperationIntent={(action, intent) =>
          onIntent(
            projectGeneratedWorkspaceOperationIntent(scope, action.control.id, intent, {
              recordId: workspaceTableActionRecordId(result, action),
              resultId: result.id,
            }),
          )
        }
        onTableIntent={(intent) =>
          onIntent(projectGeneratedWorkspaceTableIntent(scope, result.id, intent))
        }
        table={result}
      />
    );
  }

  return <LegacyWorkspaceRecordResult onIntent={onIntent} recordResult={result} scope={scope} />;
}

function LegacyWorkspaceRecordResult({
  contextId,
  onIntent,
  recordResult,
  scope,
}: {
  contextId?: string;
  onIntent: FormlessUiWorkspaceIntentHandler;
  recordResult: Extract<FormlessUiWorkspaceResultContract, { kind: "recordResult" }>;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  return (
    <LegacyRecordResultRenderer
      onIntent={(intent) =>
        onIntent(
          projectGeneratedWorkspaceRecordResultIntent(scope, recordResult.id, intent, contextId),
        )
      }
      recordResult={recordResult}
    />
  );
}

function workspaceCreateFieldId(intent: FormlessUiFieldIntent): string {
  return "fieldName" in intent
    ? intent.fieldName
    : intent.type === "operationDraftChange"
      ? intent.inputName
      : "field";
}

function workspaceCollectionActionId(action: FormlessUiWorkspaceCollectionActionContract) {
  return action.kind === "createAction" ? action.surface.id : action.control.id;
}

function workspaceListFieldId(
  list: Extract<FormlessUiWorkspaceResultContract, { kind: "list" }>,
  itemId: string,
  field: FormlessUiField,
) {
  void list;
  void itemId;
  return field.fieldName;
}

function workspaceListActionRecordId(
  list: Extract<FormlessUiWorkspaceResultContract, { kind: "list" }>,
  action: FormlessUiListOperationActionContract,
) {
  return list.items.find((item) =>
    [...item.actions.primary, ...item.actions.secondary].includes(action),
  )?.id;
}

function workspaceTableActionRecordId(
  table: Extract<FormlessUiWorkspaceResultContract, { kind: "table" }>,
  action: FormlessUiTableOperationActionContract,
) {
  return table.rows.find((row) =>
    row.cells.some((cell) =>
      cell.contents.some(
        (content) =>
          content.kind === "actionGroup" &&
          [...content.primary, ...content.secondary].includes(action),
      ),
    ),
  )?.id;
}
