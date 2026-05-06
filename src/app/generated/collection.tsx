import { useEffect, useState } from "react";
import { Badge } from "@formless/ui/badge";
import { Button } from "@formless/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@formless/ui/tabs";
import {
  useAggregateValueMatchingQuery,
  useEntityRecordCountMatchingQuery,
  useEntityRecordCountReferencingField,
  useEntityRecordIdsMatchingQuery,
  useEntityRecordOptionsMatchingQuery,
  useRecordReadinessWarnings,
} from "../../client/store.ts";
import type {
  HomeCollectionConfig,
  HomeContextConfig,
  HomeQueryTabConfig,
  HomeResultConfig,
  HomeSummarySlotConfig,
  RecordFieldConfig,
  RelatedCollectionConfig,
} from "../../client/views.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { EntitySchema } from "../../shared/schema.ts";
import { HomeActionRow } from "./actions.tsx";
import { GeneratedCreateDialog } from "./create.tsx";
import { formatAggregateDisplayValue } from "./format.ts";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { RecordTable } from "./table.tsx";

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
  const { actions, context, entity, entityName, queries, result, summary } = collection;
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
          onValueChange={(value) => {
            if (typeof value === "string") {
              onSelectQuery(value);
            }
          }}
          value={selectedQuery.queryName}
        >
          <TabsList aria-label={`${entity.label} queries`} variant="line">
            {queryTabs.map((queryTab) => (
              <HomeQueryTabTrigger
                entityName={entityName}
                key={queryTab.queryName}
                queryContext={queryContext}
                queryTab={queryTab}
              />
            ))}
          </TabsList>
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
        queryContext={queryContext}
        result={result}
      />

      {actions.length > 0 ? (
        <HomeActionRow
          actions={actions}
          ariaLabel={`${entity.label} actions`}
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
  const { actions, entity, entityName, queries, result, summary } = collection;
  const queryTabs = queries.tabs;
  const contextOptions = useEntityRecordOptionsMatchingQuery(
    context.entityName,
    context.query,
    context.labelField,
    { today },
  );
  const activeContextRecordId = contextOptions.some(
    (option) => option.id === selectedContextRecordId,
  )
    ? selectedContextRecordId
    : (contextOptions[0]?.id ?? null);
  const queryContext = activeContextRecordId
    ? { today, values: { [context.name]: activeContextRecordId } }
    : undefined;

  useEffect(() => {
    if (selectedContextRecordId !== activeContextRecordId) {
      onSelectContext?.(activeContextRecordId);
    }
  }, [activeContextRecordId, onSelectContext, selectedContextRecordId]);

  return (
    <div className="space-y-6">
      <ContextSelector
        context={context}
        onSelectContext={onSelectContext}
        options={contextOptions}
        selectedContextRecordId={activeContextRecordId}
      />

      {queryTabs.length <= 1 ? null : (
        <Tabs
          onValueChange={(value) => {
            if (typeof value === "string") {
              onSelectQuery(value);
            }
          }}
          value={selectedQuery.queryName}
        >
          <TabsList aria-label={`${entity.label} queries`} variant="line">
            {queryTabs.map((queryTab) => (
              <HomeQueryTabTrigger
                entityName={entityName}
                key={queryTab.queryName}
                queryContext={queryContext}
                queryTab={queryTab}
              />
            ))}
          </TabsList>
        </Tabs>
      )}

      {queryContext ? (
        <>
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
            queryContext={queryContext}
            result={result}
          />
        </>
      ) : null}

      {actions.length > 0 ? (
        <HomeActionRow
          actions={actions}
          ariaLabel={`${entity.label} actions`}
          queryContext={queryContext ?? { today }}
        />
      ) : null}
    </div>
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
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          onValueChange={(value) => {
            if (typeof value === "string") {
              onSelectContext?.(value || null);
            }
          }}
          value={selectedContextRecordId ?? ""}
        >
          <TabsList aria-label={`${context.entity.label} records`} variant="line">
            {options.map((option) => (
              <ContextSelectorTabTrigger context={context} key={option.id} option={option} />
            ))}
          </TabsList>
        </Tabs>

        {context.createAction ? (
          <Button
            aria-label={`Create ${context.entity.label}`}
            disabled={!context.createAction.enabled}
            onClick={() => setCreateDialogOpen(true)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            +
          </Button>
        ) : null}
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-slate-600">
          No {context.entity.label.toLowerCase()} records yet.
        </p>
      ) : null}

      <ContextRecordEditor context={context} recordId={selectedContextRecordId} />

      {context.createAction && createDialogOpen ? (
        <GeneratedCreateDialog
          action={context.createAction}
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
    <TabsTrigger value={option.id}>
      <span>{option.label}</span>
      {context.relatedCollection ? (
        <RelatedCollectionCountBadge
          option={option}
          relatedCollection={context.relatedCollection}
        />
      ) : null}
    </TabsTrigger>
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
      variant="outline"
    >
      {count}
    </Badge>
  );
}

function ContextRecordEditor({
  context,
  recordId,
}: {
  context: HomeContextConfig;
  recordId: string | null;
}) {
  const recordFields = context.recordFields ?? [];

  if (!recordId || recordFields.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-end gap-3 pt-1">
      {recordFields.map((fieldConfig) => (
        <RecordFieldEditor
          canPatch={context.entity.mutations.patch.enabled}
          entityName={context.entityName}
          fieldConfig={fieldConfig}
          key={fieldConfig.fieldName}
          recordId={recordId}
          showLabel={true}
        />
      ))}
    </div>
  );
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
    <TabsTrigger value={queryTab.queryName}>
      <span>{queryTab.label}</span>
      {queryTab.count?.type === "count" && queryContext ? (
        <QueryCountBadge entityName={entityName} queryContext={queryContext} queryTab={queryTab} />
      ) : null}
    </TabsTrigger>
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
    <Badge aria-label={`${queryTab.label} count`} className="h-4 px-1.5" variant="outline">
      {count}
    </Badge>
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
  queryContext,
  result,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  result: HomeResultConfig;
}) {
  if (result.type === "table") {
    return (
      <RecordTable
        columns={result.columns}
        entity={entity}
        entityName={entityName}
        query={query}
        queryContext={queryContext}
      />
    );
  }

  return (
    <RecordList
      entity={entity}
      entityName={entityName}
      query={query}
      queryContext={queryContext}
      recordFields={result.recordFields}
    />
  );
}

export function RecordList({
  entity,
  entityName,
  query,
  queryContext,
  recordFields,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  recordFields: RecordFieldConfig[];
}) {
  const canPatch = entity.mutations.patch.enabled;
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);

  return (
    <section className="space-y-3">
      {!canPatch && recordIds.length > 0 ? (
        <p className="text-sm text-slate-600">Editing is disabled for {entity.label}.</p>
      ) : null}

      {recordIds.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200">
          {recordIds.map((recordId) => (
            <RecordRow
              canPatch={canPatch}
              entityName={entityName}
              key={recordId}
              recordFields={recordFields}
              recordId={recordId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordRow({
  canPatch,
  entityName,
  recordFields,
  recordId,
}: {
  canPatch: boolean;
  entityName: string;
  recordFields: RecordFieldConfig[];
  recordId: string;
}) {
  const warnings = useRecordReadinessWarnings(recordId);

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-start gap-2">
        {recordFields.map((fieldConfig) => (
          <RecordFieldEditor
            canPatch={canPatch}
            entityName={entityName}
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            recordId={recordId}
          />
        ))}
      </div>
      {warnings.length > 0 ? (
        <div className="mt-3">
          <RecordReadinessWarnings warnings={warnings} />
        </div>
      ) : null}
    </li>
  );
}
