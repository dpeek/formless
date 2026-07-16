import { useEffect, useState } from "react";
import type { FieldTableColumnConfig } from "../../client/views.ts";
import { useRecord } from "../../client/store.ts";
import { GeneratedRecordTableFoundation } from "./generated-table-foundation.tsx";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
  type GeneratedUpdateDraftFieldInput,
} from "./record-field-authoring.ts";
import { RecordFieldEditor } from "./record-field-editor.tsx";

export { GeneratedRecordTableFoundation as RecordTable };

export function ReferencedRecordEditorFields({
  referenceItem,
  referenceRecordId,
}: {
  referenceItem: NonNullable<FieldTableColumnConfig["referenceItem"]>;
  referenceRecordId: string;
}) {
  const referenceRecord = useRecord(referenceRecordId);
  const [session, setSession] = useState(() =>
    initialGeneratedUpdateDraftSessionState({
      baselineValues: referenceRecord?.values ?? {},
      fields: referenceItem.recordFields,
      union: referenceItem.recordUnion,
    }),
  );

  useEffect(() => {
    setSession(
      initialGeneratedUpdateDraftSessionState({
        baselineValues: referenceRecord?.values ?? {},
        fields: referenceItem.recordFields,
        union: referenceItem.recordUnion,
      }),
    );
  }, [referenceItem, referenceRecord]);

  const sessionFacts = selectGeneratedUpdateDraftSession({
    fields: referenceItem.recordFields,
    state: session,
    union: referenceItem.recordUnion,
  });

  function updateSessionDraft(
    fieldName: string,
    fieldValue: GeneratedUpdateDraftFieldInput | undefined,
  ) {
    setSession((current) =>
      nextGeneratedUpdateDraftSessionState({ fieldName, fieldValue, state: current }),
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {sessionFacts.visibleFields.map((fieldConfig) => (
        <RecordFieldEditor
          draftInput={session.draft.values[fieldConfig.fieldName]}
          entityName={referenceItem.entityName}
          fieldConfig={fieldConfig}
          fieldOwner={{
            kind: "standalone",
            ownerId: `referenced-record-editor:${referenceItem.entityName}:${referenceRecordId}`,
          }}
          key={`${referenceItem.entityName}:${referenceRecordId}:${fieldConfig.fieldName}`}
          onDraftInputChange={updateSessionDraft}
          recordId={referenceRecordId}
          showLabel={true}
          updateDraftContext={{
            baselineValues: session.baselineValues,
            draft: session.draft,
            fields: referenceItem.recordFields,
            union: referenceItem.recordUnion,
          }}
          updateOperation={referenceItem.updateOperation}
        />
      ))}
    </div>
  );
}
