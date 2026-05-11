import { Button } from "@formless/ui/button";
import { useRecordReadinessWarnings, useRecordsById } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitPatchMutation } from "../../client/sync.ts";
import type { HomeContextConfig, HomeResultConfig, RecordFieldConfig } from "../../client/views.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { FieldValue, StoredRecord } from "../../shared/protocol.ts";
import { calculateOrderingDragMovePlan } from "../../shared/table-ordering.ts";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { useSchemaKey } from "./schema-app-context.tsx";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";

type TreeResultConfig = Extract<HomeResultConfig, { type: "tree" }>;

export function RecordTree({
  context,
  queryContext,
  result,
}: {
  context: HomeContextConfig | undefined;
  queryContext?: QueryEvaluationContext;
  result: TreeResultConfig;
}) {
  const recordsById = useRecordsById();
  const parentRecordId = context ? stringValue(queryContext?.values?.[context.name]) : undefined;

  if (!parentRecordId) {
    return null;
  }

  const placements = childPlacementsForParent(parentRecordId, recordsById, result);

  return (
    <section aria-label="Placement tree" className="space-y-3">
      {placements.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <ol className="space-y-3">
          {placements.map((placement, index) => (
            <PlacementTreeItem
              ancestors={new Set([parentRecordId])}
              depth={0}
              index={index}
              key={placement.id}
              placement={placement}
              result={result}
              siblingPlacements={placements}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function PlacementTreeItem({
  ancestors,
  depth,
  index,
  placement,
  result,
  siblingPlacements,
}: {
  ancestors: Set<string>;
  depth: number;
  index: number;
  placement: StoredRecord;
  result: TreeResultConfig;
  siblingPlacements: StoredRecord[];
}) {
  const recordsById = useRecordsById();
  const childRecordId = stringValue(placement.values[result.childFieldName]);
  const childRecord = childRecordId ? recordsById[childRecordId] : undefined;
  const isCycle = childRecordId ? ancestors.has(childRecordId) : false;
  const descendantPlacements =
    childRecord && !isCycle ? childPlacementsForParent(childRecord.id, recordsById, result) : [];
  const childPlacements = depth < result.maxDepth ? descendantPlacements : [];
  const nextAncestors = childRecord ? new Set([...ancestors, childRecord.id]) : ancestors;

  return (
    <li className="space-y-3">
      <div className="rounded border border-slate-200 bg-white">
        <div className="grid min-w-0 gap-3 p-3">
          <div className="flex min-w-0 items-start gap-2">
            <PlacementMoveControls
              index={index}
              placement={placement}
              result={result}
              siblingPlacements={siblingPlacements}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <PlacementRecordFields placement={placement} result={result} />
              {childRecord ? (
                <ChildRecordEditor childRecord={childRecord} result={result} />
              ) : (
                <p className="text-sm text-amber-700">Missing child block.</p>
              )}
              {isCycle ? <p className="text-sm text-amber-700">Cycle skipped.</p> : null}
              {depth >= result.maxDepth && descendantPlacements.length > 0 ? (
                <p className="text-sm text-amber-700">Maximum tree depth reached.</p>
              ) : null}
              <TreeReadinessWarnings recordId={placement.id} />
              {childRecord ? <TreeReadinessWarnings recordId={childRecord.id} /> : null}
            </div>
          </div>
        </div>
      </div>
      {childPlacements.length > 0 ? (
        <ol className="ml-5 space-y-3 border-l border-slate-200 pl-4">
          {childPlacements.map((childPlacement, childIndex) => (
            <PlacementTreeItem
              ancestors={nextAncestors}
              depth={depth + 1}
              index={childIndex}
              key={childPlacement.id}
              placement={childPlacement}
              result={result}
              siblingPlacements={childPlacements}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function PlacementMoveControls({
  index,
  placement,
  result,
  siblingPlacements,
}: {
  index: number;
  placement: StoredRecord;
  result: TreeResultConfig;
  siblingPlacements: StoredRecord[];
}) {
  const schemaKey = useSchemaKey();
  const recordsById = useRecordsById();
  const ordering = result.ordering;

  if (!ordering || siblingPlacements.length <= 1) {
    return <div className="w-7 shrink-0" />;
  }

  async function moveTo(targetIndex: number) {
    if (!ordering) {
      return;
    }

    const plan = calculateOrderingDragMovePlan({
      fieldName: ordering.fieldName,
      orderedRecordIds: siblingPlacements.map((candidate) => candidate.id),
      recordId: placement.id,
      recordsById,
      scopeFields: ordering.scope.map((field) => field.fieldName),
      targetIndex,
      rankOptions: {
        ...(ordering.field.min === undefined ? {} : { min: ordering.field.min }),
        ...(ordering.field.max === undefined ? {} : { max: ordering.field.max }),
      },
    });

    if (plan.kind !== "patch") {
      setSyncStatus({
        state: plan.kind === "rebalance" ? "error" : "idle",
        message:
          plan.kind === "rebalance"
            ? "Rebalance required before moving placement."
            : "Placement already in position.",
      });
      return;
    }

    setSyncStatus({ state: "syncing", message: "Moving placement..." });

    try {
      await submitPatchMutation(schemaKey, result.relationship.to.entity, plan.recordId, {
        [ordering.fieldName]: plan.rank,
      });
      setSyncStatus({ state: "idle", message: "Placement moved and synced." });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Move failed.",
      });
    }
  }

  return (
    <div className="flex w-7 shrink-0 flex-col gap-1 pt-0.5">
      <Button
        aria-label="Move placement up"
        disabled={index === 0}
        onClick={() => void moveTo(index - 1)}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <span aria-hidden="true">↑</span>
      </Button>
      <Button
        aria-label="Move placement down"
        disabled={index >= siblingPlacements.length - 1}
        onClick={() => void moveTo(index + 1)}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <span aria-hidden="true">↓</span>
      </Button>
    </div>
  );
}

function PlacementRecordFields({
  placement,
  result,
}: {
  placement: StoredRecord;
  result: TreeResultConfig;
}) {
  const recordFields = selectRecordFieldsForActiveUnion(
    result.placementRecordFields ?? [],
    result.placementRecordUnion,
    placement,
  );

  if (recordFields.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-2">
      {recordFields.map((fieldConfig) => (
        <RecordFieldEditor
          canPatch={true}
          density="compact"
          entityName={result.relationship.to.entity}
          fieldConfig={fieldConfig}
          key={fieldConfig.fieldName}
          recordId={placement.id}
        />
      ))}
    </div>
  );
}

function ChildRecordEditor({
  childRecord,
  result,
}: {
  childRecord: StoredRecord;
  result: TreeResultConfig;
}) {
  const recordFields = selectRecordFieldsForActiveUnion(
    result.childRecordFields,
    result.childRecordUnion,
    childRecord,
  );

  return (
    <div className="grid min-w-0 gap-3">
      {recordFields.map((fieldConfig) => {
        const isHeading = isHeadingRecordField(fieldConfig);

        return (
          <RecordFieldEditor
            canPatch={result.childEntity.mutations.patch.enabled}
            density={isHeading || isRichMarkdownRecordField(fieldConfig) ? "default" : "compact"}
            entityName={result.childEntityName}
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            presentation={isHeading ? "heading" : "default"}
            recordId={childRecord.id}
            showLabel={!isHeading}
          />
        );
      })}
    </div>
  );
}

function TreeReadinessWarnings({ recordId }: { recordId: string }) {
  const warnings = useRecordReadinessWarnings(recordId);

  return warnings.length === 0 ? null : <RecordReadinessWarnings warnings={warnings} />;
}

function childPlacementsForParent(
  parentRecordId: string,
  recordsById: Record<string, StoredRecord>,
  result: TreeResultConfig,
): StoredRecord[] {
  return Object.values(recordsById)
    .filter(
      (record) =>
        record.entity === result.relationship.to.entity &&
        !record.deletedAt &&
        record.values[result.relationship.to.field] === parentRecordId,
    )
    .sort(comparePlacementRecords);
}

function comparePlacementRecords(a: StoredRecord, b: StoredRecord): number {
  return (
    compareNumbers(numberValue(a.values.order), numberValue(b.values.order)) ||
    compareStrings(a.createdAt, b.createdAt) ||
    compareStrings(a.id, b.id)
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

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function numberValue(value: FieldValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compareNumbers(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) {
    return 0;
  }

  if (a === undefined) {
    return 1;
  }

  if (b === undefined) {
    return -1;
  }

  return a - b;
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}
