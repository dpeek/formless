import { useEffect } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Tab, TabList, Tabs } from "@dpeek/formless-ui/tabs";
import {
  useAggregateValueMatchingQuery,
  useEntityRecordCountMatchingQuery,
  useEntityRecordCountReferencingField,
  useEntityRecordOptionsMatchingQuery,
  useRecord,
} from "../../client/store.ts";
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
} from "../../client/views.ts";
import type { CollectionResultModel } from "../../client/collection-result-model.ts";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";
import type { EntitySchema } from "@dpeek/formless-schema";
import { HomeOperationRow } from "./operations.tsx";
import { GeneratedCreateSurface } from "./create.tsx";
import { formatAggregateDisplayValue } from "./format.ts";
import { DeleteRecordButton } from "./record-delete.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { RecordTransitionOperationControls } from "./state-machine-ui.tsx";
import { RecordTable } from "./table.tsx";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";
import { GeneratedRecordListFoundation } from "./generated-list-runtime.tsx";
import { GeneratedRecordResultRuntime } from "./generated-record-result-runtime.tsx";

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
            entity={entity}
            entityName={entityName}
            query={selectedQuery.query}
            queryName={selectedQuery.queryName}
            queryContext={contextSelection.queryContext}
            result={result}
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
              entity={entity}
              entityName={entityName}
              query={selectedQuery.query}
              queryName={selectedQuery.queryName}
              queryContext={queryContext}
              result={result}
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
  return (
    <aside className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-900">{context.label}</h2>
        {context.createOperation ? (
          <GeneratedCreateSurface
            onSuccess={(recordId) => onSelectContext?.(recordId)}
            operation={context.createOperation}
            surfaceId={`context-list-detail:${context.createOperation.operation.canonicalKey}`}
            trigger={{
              content: { icon: "add", kind: "iconOnly" },
              density: "compact",
              prominence: "secondary",
            }}
          />
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
          <GeneratedCreateSurface
            onSuccess={(recordId) => onSelectContext?.(recordId)}
            operation={context.createOperation}
            surfaceId={`context-selector:${context.createOperation.operation.canonicalKey}`}
            trigger={{
              content: { icon: "add", kind: "iconOnly" },
              density: "compact",
              prominence: "quiet",
            }}
          />
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
            fieldOwner={{
              kind: "standalone",
              ownerId: `context-record:${context.name}:${recordId}`,
            }}
            key={recordFieldEditorKey(context.entityName, recordId, fieldConfig.fieldName)}
            presentation={isHeading ? "heading" : "default"}
            recordId={recordId}
            showLabel={!isHeading}
            updateOperation={context.updateOperation}
          />
        );
      })}
      {context.transitionOperations.length > 0 ? (
        <div className={density === "compact" ? "pt-1" : "self-end"}>
          <RecordTransitionOperationControls
            operations={context.transitionOperations}
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
  entity,
  entityName,
  query,
  queryName,
  queryContext,
  result,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryName: string;
  queryContext?: QueryEvaluationContext;
  result: CollectionResultModel;
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
      <GeneratedRecordResultRuntime
        entity={entity}
        entityName={entityName}
        query={query}
        queryContext={queryContext}
        result={result}
      />
    );
  }

  return result.type === "list" ? (
    <GeneratedRecordListFoundation
      entity={entity}
      entityName={entityName}
      query={query}
      queryContext={queryContext}
      result={result}
    />
  ) : null;
}

export { GeneratedRecordListFoundation as RecordList };
