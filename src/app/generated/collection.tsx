import { useEffect, useState } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import {
  ObjectList,
  type ObjectListAction,
  type ObjectListReorderIntent,
} from "@dpeek/formless-ui/object-list";
import { Tab, TabList, Tabs } from "@dpeek/formless-ui/tabs";
import {
  useAggregateValueMatchingQuery,
  useEntityRecordCountMatchingQuery,
  useEntityRecordCountReferencingField,
  useEntityRecordIdsMatchingQuery,
  useEntityRecordOptionsMatchingQuery,
  useRecord,
  useRecordsById,
  useRecordReadinessWarnings,
} from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import {
  selectGeneratedContextSelectionFacts,
  type GeneratedContextSelectionFacts,
} from "../../client/generated-authoring.ts";
import type {
  HomeCollectionConfig,
  HomeContextConfig,
  HomeQueryTabConfig,
  HomeSummarySlotConfig,
  RecordFieldConfig,
  RelatedCollectionConfig,
  RecordUnionPresentationConfig,
} from "../../client/views.ts";
import type { CollectionResultModel } from "../../client/collection-result-model.ts";
import type { ListResultModel, RecordResultModel } from "../../client/list-result-model.ts";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { EntitySchema } from "@dpeek/formless-schema";
import { HomeOperationRow } from "./actions.tsx";
import { GeneratedCreateDialog } from "./create.tsx";
import { formatAggregateDisplayValue } from "./format.ts";
import {
  calculateOrderingDragMovePlanForContext,
  selectOrderingDragFacts,
  selectOrderingMoveMenuItems,
  selectResultOrderingContext,
  submitOrderingPatch,
  type OrderingMoveMenuItem,
} from "./ordering-ui.ts";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";
import { DeleteRecordButton } from "./record-delete.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { useSchemaAppTarget } from "./schema-app-context.tsx";
import { RecordTransitionActionControls } from "./state-machine-ui.tsx";
import { RecordTable } from "./table.tsx";
import { RecordTree } from "./tree.tsx";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";
import { AddIcon } from "@dpeek/formless-ui/icons";

export function HomeCollection({
  collection,
  onSelectContext,
  onSelectQuery,
  selectedContextRecordId,
  selectedQuery,
  today,
}: {
  collection: HomeCollectionConfig;
  onSelectContext?: (recordId: string | null) => void;
  onSelectQuery: (queryName: string) => void;
  selectedContextRecordId?: string | null;
  selectedQuery: HomeQueryTabConfig;
  today: string;
}) {
  const { context, entity, entityName, operations, queries, result, summary } = collection;
  const queryTabs = queries.tabs;

  if (context) {
    return (
      <ScopedHomeCollection
        collection={collection}
        context={context}
        onSelectContext={onSelectContext}
        onSelectQuery={onSelectQuery}
        selectedContextRecordId={selectedContextRecordId ?? null}
        selectedQuery={selectedQuery}
        today={today}
      />
    );
  }

  const queryContext = { today };

  return (
    <div className="space-y-6">
      {queryTabs.length <= 1 ? null : (
        <Tabs
          onSelectionChange={(key) => {
            if (typeof key === "string") {
              onSelectQuery(key);
            }
          }}
          selectedKey={selectedQuery.queryName}
        >
          <TabList aria-label={`${entity.label} queries`}>
            {queryTabs.map((queryTab) => (
              <HomeQueryTabTrigger
                entityName={entityName}
                key={queryTab.queryName}
                queryContext={queryContext}
                queryTab={queryTab}
              />
            ))}
          </TabList>
        </Tabs>
      )}

      <CollectionSummary
        entityName={entityName}
        queryContext={queryContext}
        selectedQuery={selectedQuery}
        summary={summary ?? []}
      />

      <CollectionResult
        context={undefined}
        entity={entity}
        entityName={entityName}
        query={selectedQuery.query}
        queryName={selectedQuery.queryName}
        queryContext={queryContext}
        result={result}
      />

      {operations.length > 0 ? (
        <HomeOperationRow
          operations={operations}
          ariaLabel={`${entity.label} operations`}
          queryContext={queryContext}
        />
      ) : null}
    </div>
  );
}

function ScopedHomeCollection({
  collection,
  context,
  onSelectContext,
  onSelectQuery,
  selectedContextRecordId,
  selectedQuery,
  today,
}: {
  collection: HomeCollectionConfig;
  context: HomeContextConfig;
  onSelectContext?: (recordId: string | null) => void;
  onSelectQuery: (queryName: string) => void;
  selectedContextRecordId: string | null;
  selectedQuery: HomeQueryTabConfig;
  today: string;
}) {
  const { entity, entityName, operations, queries, result, summary } = collection;
  const queryTabs = queries.tabs;
  const contextOptions = useEntityRecordOptionsMatchingQuery(
    context.entityName,
    context.query,
    context.labelField,
    { today },
  );
  const contextSelection = selectGeneratedContextSelectionFacts({
    context,
    options: contextOptions,
    selectedRecordId: selectedContextRecordId,
    today,
  });

  useEffect(() => {
    if (selectedContextRecordId !== contextSelection.activeRecordId) {
      onSelectContext?.(contextSelection.activeRecordId);
    }
  }, [contextSelection.activeRecordId, onSelectContext, selectedContextRecordId]);

  if (context.presentation === "listDetail") {
    return (
      <ListDetailScopedHomeCollection
        operations={operations}
        context={context}
        contextOptions={contextOptions}
        contextSelection={contextSelection}
        entity={entity}
        entityName={entityName}
        onSelectContext={onSelectContext}
        onSelectQuery={onSelectQuery}
        queryTabs={queryTabs}
        result={result}
        selectedQuery={selectedQuery}
        summary={summary ?? []}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ContextSelector
        context={context}
        onSelectContext={onSelectContext}
        options={contextOptions}
        selectedContextRecordId={contextSelection.activeRecordId}
      />

      {queryTabs.length <= 1 ? null : (
        <Tabs
          onSelectionChange={(key) => {
            if (typeof key === "string") {
              onSelectQuery(key);
            }
          }}
          selectedKey={selectedQuery.queryName}
        >
          <TabList aria-label={`${entity.label} queries`}>
            {queryTabs.map((queryTab) => (
              <HomeQueryTabTrigger
                entityName={entityName}
                key={queryTab.queryName}
                queryContext={contextSelection.queryContext}
                queryTab={queryTab}
              />
            ))}
          </TabList>
        </Tabs>
      )}

      {contextSelection.queryContext ? (
        <>
          <CollectionSummary
            entityName={entityName}
            queryContext={contextSelection.queryContext}
            selectedQuery={selectedQuery}
            summary={summary ?? []}
          />

          <CollectionResult
            context={context}
            entity={entity}
            entityName={entityName}
            onSelectContext={onSelectContext}
            query={selectedQuery.query}
            queryName={selectedQuery.queryName}
            queryContext={contextSelection.queryContext}
            result={result}
            selectableContextRecordIds={contextSelection.selectableRecordIds}
          />
        </>
      ) : null}

      {operations.length > 0 ? (
        <HomeOperationRow
          operations={operations}
          ariaLabel={`${entity.label} operations`}
          queryContext={contextSelection.actionQueryContext}
        />
      ) : null}
    </div>
  );
}

function ListDetailScopedHomeCollection({
  context,
  contextOptions,
  contextSelection,
  entity,
  entityName,
  onSelectContext,
  onSelectQuery,
  operations,
  queryTabs,
  result,
  selectedQuery,
  summary,
}: {
  context: HomeContextConfig;
  contextOptions: Array<{ id: string; label: string }>;
  contextSelection: GeneratedContextSelectionFacts;
  entity: EntitySchema;
  entityName: string;
  onSelectContext?: (recordId: string | null) => void;
  onSelectQuery: (queryName: string) => void;
  operations: HomeCollectionConfig["operations"];
  queryTabs: HomeQueryTabConfig[];
  result: CollectionResultModel;
  selectedQuery: HomeQueryTabConfig;
  summary: HomeSummarySlotConfig[];
}) {
  const contextFieldsRenderHeading = (context.recordFields ?? []).some(isHeadingRecordField);
  const {
    activeRecordId,
    actionQueryContext,
    detailLabel,
    isEmpty,
    queryContext,
    selectableRecordIds,
    showLocalSelector,
    showUnselectedState,
  } = contextSelection;

  return (
    <section
      aria-label={`${context.label} list detail`}
      className={
        !showLocalSelector
          ? "min-w-0 space-y-6"
          : "grid min-w-0 gap-6 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]"
      }
    >
      {showLocalSelector ? (
        <ContextListDetailSelector
          context={context}
          onSelectContext={onSelectContext}
          options={contextOptions}
          selectedContextRecordId={activeRecordId}
        />
      ) : null}

      <div className="min-w-0 space-y-6">
        {activeRecordId && queryContext ? (
          <>
            <section
              aria-label={`${detailLabel} detail`}
              className="space-y-3 border-b border-slate-200 pb-4"
            >
              {!showLocalSelector || contextFieldsRenderHeading ? null : (
                <h2 className="text-base font-semibold">{detailLabel}</h2>
              )}
              <ContextRecordEditor
                context={context}
                density="compact"
                onDeleted={() => onSelectContext?.(null)}
                recordId={activeRecordId}
              />
            </section>

            {queryTabs.length <= 1 ? null : (
              <Tabs
                onSelectionChange={(key) => {
                  if (typeof key === "string") {
                    onSelectQuery(key);
                  }
                }}
                selectedKey={selectedQuery.queryName}
              >
                <TabList aria-label={`${entity.label} queries`}>
                  {queryTabs.map((queryTab) => (
                    <HomeQueryTabTrigger
                      entityName={entityName}
                      key={queryTab.queryName}
                      queryContext={queryContext}
                      queryTab={queryTab}
                    />
                  ))}
                </TabList>
              </Tabs>
            )}

            <CollectionSummary
              entityName={entityName}
              queryContext={queryContext}
              selectedQuery={selectedQuery}
              summary={summary}
            />

            <CollectionResult
              context={context}
              entity={entity}
              entityName={entityName}
              onSelectContext={onSelectContext}
              query={selectedQuery.query}
              queryName={selectedQuery.queryName}
              queryContext={queryContext}
              result={result}
              selectableContextRecordIds={selectableRecordIds}
            />
          </>
        ) : isEmpty ? null : showUnselectedState ? (
          <p className="text-sm text-slate-600">No {context.label.toLowerCase()} selected.</p>
        ) : null}

        {operations.length > 0 ? (
          <HomeOperationRow
            operations={operations}
            ariaLabel={`${entity.label} operations`}
            queryContext={actionQueryContext}
          />
        ) : null}
      </div>
    </section>
  );
}

function ContextListDetailSelector({
  context,
  onSelectContext,
  options,
  selectedContextRecordId,
}: {
  context: HomeContextConfig;
  onSelectContext?: (recordId: string | null) => void;
  options: Array<{ id: string; label: string }>;
  selectedContextRecordId: string | null;
}) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <aside className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-900">{context.label}</h2>
        {context.createOperation ? (
          <Button
            aria-label={context.createOperation.label}
            isDisabled={!context.createOperation.enabled}
            onPress={() => setCreateDialogOpen(true)}
            size="sq-xs"
            type="button"
            intent="outline"
          >
            +
          </Button>
        ) : null}
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-slate-600">No {context.label.toLowerCase()} records yet.</p>
      ) : (
        <ul aria-label={`${context.label} records`} className="space-y-1">
          {options.map((option) => (
            <li key={option.id}>
              <ContextListDetailOptionButton
                context={context}
                onSelectContext={onSelectContext}
                option={option}
                selected={option.id === selectedContextRecordId}
              />
            </li>
          ))}
        </ul>
      )}

      {context.createOperation && createDialogOpen ? (
        <GeneratedCreateDialog
          action={context.createOperation}
          onOpenChange={(open) => setCreateDialogOpen(open)}
          onSuccess={(recordId) => {
            onSelectContext?.(recordId);
            setCreateDialogOpen(false);
          }}
          open={true}
        />
      ) : null}
    </aside>
  );
}

function ContextListDetailOptionButton({
  context,
  onSelectContext,
  option,
  selected,
}: {
  context: HomeContextConfig;
  onSelectContext?: (recordId: string | null) => void;
  option: { id: string; label: string };
  selected: boolean;
}) {
  const selectedClassName = selected
    ? "border-slate-900 bg-slate-50 text-slate-950"
    : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50";

  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center justify-between gap-2 rounded border px-2 py-2 text-left text-sm transition-colors ${selectedClassName}`}
      onClick={() => onSelectContext?.(option.id)}
      type="button"
    >
      <span className="truncate">{option.label}</span>
      {context.relatedCollection ? (
        <RelatedCollectionCountBadge
          option={option}
          relatedCollection={context.relatedCollection}
        />
      ) : null}
    </button>
  );
}

function ContextSelector({
  context,
  onSelectContext,
  options,
  selectedContextRecordId,
}: {
  context: HomeContextConfig;
  onSelectContext?: (recordId: string | null) => void;
  options: Array<{ id: string; label: string }>;
  selectedContextRecordId: string | null;
}) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <section className="space-y-3 border-b border-slate-200 pb-4">
      <div className="flex flex-wrap items-center gap-4">
        <Tabs
          onSelectionChange={(key) => {
            if (typeof key === "string") {
              onSelectContext?.(key || null);
            }
          }}
          selectedKey={selectedContextRecordId ?? ""}
        >
          <TabList aria-label={`${context.label} records`}>
            {options.map((option) => (
              <ContextSelectorTabTrigger context={context} key={option.id} option={option} />
            ))}
          </TabList>
        </Tabs>

        {context.createOperation ? (
          <Button
            aria-label={context.createOperation.label}
            isDisabled={!context.createOperation.enabled}
            onPress={() => setCreateDialogOpen(true)}
            size="sq-xs"
            type="button"
            intent="plain"
          >
            <AddIcon />
          </Button>
        ) : null}
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">No {context.label.toLowerCase()} records yet.</p>
      ) : null}
      <ContextRecordEditor
        context={context}
        onDeleted={() => onSelectContext?.(null)}
        recordId={selectedContextRecordId}
      />
      {context.createOperation && createDialogOpen ? (
        <GeneratedCreateDialog
          action={context.createOperation}
          onOpenChange={(open) => setCreateDialogOpen(open)}
          onSuccess={(recordId) => {
            onSelectContext?.(recordId);
            setCreateDialogOpen(false);
          }}
          open={true}
        />
      ) : null}
    </section>
  );
}

function ContextSelectorTabTrigger({
  context,
  option,
}: {
  context: HomeContextConfig;
  option: { id: string; label: string };
}) {
  return (
    <Tab id={option.id}>
      <span>{option.label}</span>
      {context.relatedCollection ? (
        <RelatedCollectionCountBadge
          option={option}
          relatedCollection={context.relatedCollection}
        />
      ) : null}
    </Tab>
  );
}

function RelatedCollectionCountBadge({
  option,
  relatedCollection,
}: {
  option: { id: string; label: string };
  relatedCollection: RelatedCollectionConfig;
}) {
  const count = useEntityRecordCountReferencingField(
    relatedCollection.entityName,
    relatedCollection.referenceFieldName,
    option.id,
  );

  return (
    <Badge
      aria-label={`${option.label} ${relatedCollection.label} count`}
      className="h-4 px-1.5"
      intent="outline"
    >
      {count}
    </Badge>
  );
}

function ContextRecordEditor({
  context,
  density = "default",
  onDeleted,
  recordId,
}: {
  context: HomeContextConfig;
  density?: "default" | "compact";
  onDeleted?: () => void;
  recordId: string | null;
}) {
  const recordFields = context.recordFields ?? [];
  const record = useRecord(recordId ?? "");

  if (!recordId) {
    return null;
  }

  const visibleFields = selectRecordFieldsForActiveUnion(recordFields, context.recordUnion, record);

  return (
    <div
      className={
        density === "compact"
          ? "group/record-row grid min-w-0 gap-3 pt-1"
          : "group/record-row flex flex-wrap items-end gap-3 pt-1"
      }
    >
      {visibleFields.map((fieldConfig) => {
        const isHeading = isHeadingRecordField(fieldConfig);

        return (
          <RecordFieldEditor
            density={isHeading || isRichMarkdownRecordField(fieldConfig) ? "default" : density}
            entityName={context.entityName}
            fieldConfig={fieldConfig}
            key={recordFieldEditorKey(context.entityName, recordId, fieldConfig.fieldName)}
            presentation={isHeading ? "heading" : "default"}
            recordId={recordId}
            showLabel={!isHeading}
            updateOperation={context.updateOperation}
          />
        );
      })}
      {context.transitionActions.length > 0 ? (
        <div className={density === "compact" ? "pt-1" : "self-end"}>
          <RecordTransitionActionControls
            actions={context.transitionActions}
            entityName={context.entityName}
            recordId={recordId}
            values={record?.values}
          />
        </div>
      ) : null}
      {context.deleteOperation ? (
        <div className={density === "compact" ? "pt-1" : "self-end"}>
          <DeleteRecordButton
            deleteOperation={context.deleteOperation}
            entityLabel={context.entity.label}
            entityName={context.entityName}
            labelFields={visibleFields}
            onDeleted={onDeleted}
            recordId={recordId}
            triggerData={{ "data-formless-delete-record": recordId }}
          />
        </div>
      ) : null}
    </div>
  );
}

function isHeadingRecordField(fieldConfig: RecordFieldConfig) {
  return (
    fieldConfig.field.type === "text" &&
    fieldConfig.editor === "text" &&
    (fieldConfig.fieldName === "label" ||
      fieldConfig.fieldName === "title" ||
      fieldConfig.fieldName === "name")
  );
}

function isRichMarkdownRecordField(fieldConfig: RecordFieldConfig) {
  return fieldConfig.field.type === "text" && fieldConfig.editor === "markdown";
}

function recordFieldEditorKey(entityName: string, recordId: string, fieldName: string) {
  return `${entityName}:${recordId}:${fieldName}`;
}

function HomeQueryTabTrigger({
  entityName,
  queryContext,
  queryTab,
}: {
  entityName: string;
  queryContext?: QueryEvaluationContext;
  queryTab: HomeQueryTabConfig;
}) {
  return (
    <Tab id={queryTab.queryName}>
      <span>{queryTab.label}</span>
      {queryTab.count?.type === "count" && queryContext ? (
        <QueryCountBadge entityName={entityName} queryContext={queryContext} queryTab={queryTab} />
      ) : null}
    </Tab>
  );
}

function QueryCountBadge({
  entityName,
  queryContext,
  queryTab,
}: {
  entityName: string;
  queryContext: QueryEvaluationContext;
  queryTab: HomeQueryTabConfig;
}) {
  const count = useEntityRecordCountMatchingQuery(entityName, queryTab.query, queryContext);

  return (
    <div aria-label={`${queryTab.label} count`} className="ml-2">
      {count}
    </div>
  );
}

function CollectionSummary({
  entityName,
  queryContext,
  selectedQuery,
  summary,
}: {
  entityName: string;
  queryContext?: QueryEvaluationContext;
  selectedQuery: HomeQueryTabConfig;
  summary: HomeSummarySlotConfig[];
}) {
  const visibleSummary = summary.filter((slot) => slot.aggregate.query === selectedQuery.queryName);

  if (!queryContext || visibleSummary.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Collection summary"
      className="flex flex-wrap items-stretch gap-3 border-b border-slate-200 pb-4"
    >
      {visibleSummary.map((slot) => (
        <AggregateSummarySlot
          entityName={entityName}
          key={slot.key}
          query={selectedQuery.query}
          queryContext={queryContext}
          slot={slot}
        />
      ))}
    </section>
  );
}

function AggregateSummarySlot({
  entityName,
  query,
  queryContext,
  slot,
}: {
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext: QueryEvaluationContext;
  slot: HomeSummarySlotConfig;
}) {
  const value = useAggregateValueMatchingQuery(
    entityName,
    query,
    slot.aggregate,
    slot.computedValues,
    queryContext,
  );
  const displayValue = formatAggregateDisplayValue(slot, value);

  return (
    <div
      aria-label={`${slot.label} summary`}
      className="min-w-32 rounded border border-slate-200 bg-white px-3 py-2"
    >
      <div className="text-xs font-medium text-slate-500">{slot.label}</div>
      <div className="mt-1 flex min-h-6 items-baseline gap-1 text-sm font-semibold text-slate-900">
        <span>{displayValue}</span>
        {slot.suffix ? (
          <span className="text-xs font-normal text-slate-500">{slot.suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

function CollectionResult({
  context,
  entity,
  entityName,
  onSelectContext,
  query,
  queryName,
  queryContext,
  result,
  selectableContextRecordIds,
}: {
  context: HomeContextConfig | undefined;
  entity: EntitySchema;
  entityName: string;
  onSelectContext?: (recordId: string | null) => void;
  query: HomeQueryTabConfig["query"];
  queryName: string;
  queryContext?: QueryEvaluationContext;
  result: CollectionResultModel;
  selectableContextRecordIds?: Set<string>;
}) {
  if (result.type === "table") {
    return (
      <RecordTable
        entity={entity}
        entityName={entityName}
        query={query}
        queryName={queryName}
        queryContext={queryContext}
        result={result}
      />
    );
  }

  if (result.type === "record") {
    return (
      <RecordDetail
        entity={entity}
        entityName={entityName}
        query={query}
        queryContext={queryContext}
        result={result}
      />
    );
  }

  if (result.type === "tree") {
    return (
      <RecordTree
        context={context}
        entity={entity}
        entityName={entityName}
        onSelectContext={onSelectContext}
        queryContext={queryContext}
        result={result}
        selectableContextRecordIds={selectableContextRecordIds}
      />
    );
  }

  return (
    <RecordList
      entity={entity}
      entityName={entityName}
      query={query}
      queryContext={queryContext}
      result={result}
    />
  );
}

function RecordDetail({
  entity,
  entityName,
  query,
  queryContext,
  result,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  result: RecordResultModel;
}) {
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const recordId = recordIds[0] ?? null;
  const record = useRecord(recordId ?? "");
  const warnings = useRecordReadinessWarnings(recordId ?? "");

  if (!recordId) {
    return <p className="text-sm text-slate-600">No {entity.label.toLowerCase()} record found.</p>;
  }

  const visibleFields = selectRecordFieldsForActiveUnion(
    result.recordFields,
    result.recordUnion,
    record,
  );

  return (
    <section
      aria-label={`${entity.label} record`}
      className="max-w-3xl space-y-4"
      data-formless-record-result="true"
    >
      <div className="grid min-w-0 gap-4">
        {visibleFields.map((fieldConfig) => (
          <RecordFieldEditor
            entityName={entityName}
            fieldConfig={fieldConfig}
            key={recordFieldEditorKey(entityName, recordId, fieldConfig.fieldName)}
            recordId={recordId}
            showLabel={true}
            updateOperation={result.updateOperation}
          />
        ))}
        {result.transitionActions.length > 0 ? (
          <RecordTransitionActionControls
            actions={result.transitionActions}
            entityName={entityName}
            recordId={recordId}
            values={record?.values}
          />
        ) : null}
        {result.deleteOperation ? (
          <div>
            <DeleteRecordButton
              deleteOperation={result.deleteOperation}
              entityLabel={entity.label}
              entityName={entityName}
              labelFields={visibleFields}
              recordId={recordId}
              triggerData={{ "data-formless-delete-record": recordId }}
            />
          </div>
        ) : null}
      </div>
      {warnings.length > 0 ? <RecordReadinessWarnings warnings={warnings} /> : null}
    </section>
  );
}

type RecordListItem = {
  recordId: string;
};

export function RecordList({
  entity,
  entityName,
  query,
  queryContext,
  result,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  result: ListResultModel;
}) {
  const appTarget = useSchemaAppTarget();
  const { ordering, recordFields, recordUnion } = result;
  const [pendingOrderingRecordId, setPendingOrderingRecordId] = useState<string | null>(null);
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const recordsById = useRecordsById();
  const orderingContext = selectResultOrderingContext({
    entityName,
    ordering,
    recordIds,
    recordsById,
    updateOperation: result.updateOperation,
  });
  const orderedRecordIds = orderingContext?.orderedRecordIds ?? recordIds;
  const orderingDragFacts = selectOrderingDragFacts(orderingContext);
  const listItems = orderedRecordIds.map((recordId) => ({ recordId }));
  const hasDragOrdering = orderingContext !== undefined && orderingDragFacts !== undefined;
  const hasMoveMenuOrdering = orderingContext?.ordering.presentations.includes("moveMenu") === true;

  async function submitOrderingPlan({
    failureMessage,
    plan,
    recordId,
    successMessage,
    syncingMessage,
  }: {
    failureMessage: string;
    plan: OrderingMoveMenuItem["plan"];
    recordId: string;
    successMessage: string;
    syncingMessage: string;
  }) {
    if (!orderingContext || plan.kind !== "patch") {
      if (plan.kind === "rebalance") {
        setSyncStatus({ state: "error", message: "Rebalance required before reorder." });
      }
      return;
    }

    setPendingOrderingRecordId(recordId);
    setSyncStatus({ state: "syncing", message: syncingMessage });

    try {
      await submitOrderingPatch(appTarget, orderingContext, plan);
      setSyncStatus({ state: "idle", message: successMessage });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : failureMessage,
      });
    } finally {
      setPendingOrderingRecordId(null);
    }
  }

  async function handleOrderingReorder(intent: ObjectListReorderIntent) {
    if (!orderingContext || !orderingDragFacts) {
      return;
    }

    const recordId = firstRecordIdFromKeys(intent.keys);
    const targetRecordId = String(intent.targetKey);

    if (!recordId || recordId === targetRecordId) {
      return;
    }

    const sourceFact = orderingDragFacts.get(recordId);
    const targetFact = orderingDragFacts.get(targetRecordId);

    if (!sourceFact || !targetFact || !orderingContext.updateOperation) {
      return;
    }

    if (sourceFact.scopeKey !== targetFact.scopeKey) {
      setSyncStatus({ state: "idle", message: "Cross-scope list item move ignored." });
      return;
    }

    const plan = calculateOrderingDragMovePlanForContext({
      orderingContext,
      recordId,
      targetIndex: objectListReorderTargetIndex({
        currentIndex: sourceFact.index,
        position: intent.position,
        targetIndex: targetFact.index,
      }),
    });

    await submitOrderingPlan({
      failureMessage: "Drag reorder failed.",
      plan,
      recordId,
      successMessage: "List item moved and synced.",
      syncingMessage: "Moving list item...",
    });
  }

  async function invokeOrderingMove(recordId: string, item: OrderingMoveMenuItem) {
    if (item.disabled || pendingOrderingRecordId !== null) {
      return;
    }

    await submitOrderingPlan({
      failureMessage: "Move failed.",
      plan: item.plan,
      recordId,
      successMessage: "List item moved and synced.",
      syncingMessage: `${item.label}...`,
    });
  }

  function recordActions(item: RecordListItem): ObjectListAction<RecordListItem>[] {
    const orderingItems = selectOrderingMoveMenuItems({
      includeOrdering: hasMoveMenuOrdering,
      orderingContext,
      sourceRecordId: item.recordId,
    });

    return orderingItems.map((orderingItem) => ({
      id: `ordering:${orderingItem.direction}`,
      label: orderingItem.label,
      disabled: orderingItem.disabled || pendingOrderingRecordId !== null,
      disabledReason:
        pendingOrderingRecordId !== null ? "Move already pending" : orderingItem.disabledReason,
      onAction: () => {
        void invokeOrderingMove(item.recordId, orderingItem);
      },
    }));
  }

  return (
    <section className="space-y-3">
      {!result.updateOperation && recordIds.length > 0 ? (
        <p className="text-sm text-slate-600">Editing is disabled for {entity.label}.</p>
      ) : null}

      <ObjectList
        emptyState="No records yet."
        getItemActions={recordActions}
        getKey={(item) => item.recordId}
        getTextValue={(item) =>
          recordListTextValue({
            entity,
            record: recordsById[item.recordId],
            recordFields,
            recordId: item.recordId,
            recordUnion,
          })
        }
        gridClassName="gap-0 divide-y divide-slate-200 rounded border-slate-200 bg-bg p-0"
        hideLabel={true}
        itemClassName="rounded-none px-0 py-0 hover:bg-secondary/50"
        items={listItems}
        label={`${entity.label} records`}
        renderItem={({ item }) => (
          <RecordRow
            deleteOperation={result.deleteOperation}
            entity={entity}
            entityName={entityName}
            recordFields={recordFields}
            recordUnion={recordUnion}
            recordId={item.recordId}
            showOrderingHandle={hasDragOrdering}
            transitionActions={result.transitionActions}
            updateOperation={result.updateOperation}
          />
        )}
        reorder={
          orderingContext && orderingDragFacts
            ? {
                label: "Drag record",
                disabled: !orderingContext.updateOperation || pendingOrderingRecordId !== null,
                disabledReason:
                  pendingOrderingRecordId !== null
                    ? "Move already pending"
                    : !orderingContext.updateOperation
                      ? "Editing is disabled"
                      : undefined,
                dragHandleDataAttributes: { "data-formless-ordering-handle": "true" },
                onReorder: (intent) => {
                  void handleOrderingReorder(intent);
                },
              }
            : undefined
        }
      />
    </section>
  );
}

function firstRecordIdFromKeys(keys: ObjectListReorderIntent["keys"]) {
  const key = keys.values().next().value;

  if (key === undefined) {
    return undefined;
  }

  return String(key);
}

function objectListReorderTargetIndex({
  currentIndex,
  position,
  targetIndex,
}: {
  currentIndex: number;
  position: ObjectListReorderIntent["position"];
  targetIndex: number;
}) {
  const rawTargetIndex = targetIndex + (position === "after" ? 1 : 0);

  return Math.max(0, currentIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex);
}

function recordListTextValue({
  entity,
  record,
  recordFields,
  recordId,
  recordUnion,
}: {
  entity: EntitySchema;
  record: StoredRecord | undefined;
  recordFields: RecordFieldConfig[];
  recordId: string;
  recordUnion?: RecordUnionPresentationConfig;
}) {
  const visibleFields = selectRecordFieldsForActiveUnion(recordFields, recordUnion, record);

  for (const field of visibleFields) {
    const value = record?.values[field.fieldName];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return `${entity.label} ${record?.id ?? recordId}`;
}

function RecordRow({
  deleteOperation,
  entity,
  entityName,
  recordFields,
  recordUnion,
  recordId,
  showOrderingHandle = false,
  transitionActions,
  updateOperation,
}: {
  deleteOperation?: ListResultModel["deleteOperation"];
  entity: EntitySchema;
  entityName: string;
  recordFields: RecordFieldConfig[];
  recordUnion?: RecordUnionPresentationConfig;
  recordId: string;
  showOrderingHandle?: boolean;
  transitionActions: ListResultModel["transitionActions"];
  updateOperation?: ListResultModel["updateOperation"];
}) {
  const record = useRecord(recordId);
  const warnings = useRecordReadinessWarnings(recordId);
  const visibleFields = selectRecordFieldsForActiveUnion(recordFields, recordUnion, record);

  return (
    <div
      className="group/record-row p-3"
      data-formless-sortable-list-item={showOrderingHandle ? recordId : undefined}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {visibleFields.map((fieldConfig) => (
            <RecordFieldEditor
              entityName={entityName}
              fieldConfig={fieldConfig}
              key={recordFieldEditorKey(entityName, recordId, fieldConfig.fieldName)}
              recordId={recordId}
              updateOperation={updateOperation}
            />
          ))}
        </div>
        {transitionActions.length > 0 ? (
          <RecordTransitionActionControls
            actions={transitionActions}
            className="shrink-0"
            entityName={entityName}
            recordId={recordId}
            values={record?.values}
          />
        ) : null}
        {deleteOperation ? (
          <DeleteRecordButton
            className="shrink-0"
            deleteOperation={deleteOperation}
            entityLabel={entity.label}
            entityName={entityName}
            labelFields={visibleFields}
            recordId={recordId}
            triggerData={{ "data-formless-delete-record": recordId }}
          />
        ) : null}
      </div>
      {warnings.length > 0 ? (
        <div className="mt-3">
          <RecordReadinessWarnings warnings={warnings} />
        </div>
      ) : null}
    </div>
  );
}
