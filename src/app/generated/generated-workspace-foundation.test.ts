import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiActionTriggerContract,
  FormlessUiButtonContract,
  FormlessUiCreateSurfaceContract,
  FormlessUiOperationControlContract,
  FormlessUiTableContract,
} from "@dpeek/formless-astryx/contract";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { GeneratedOperationControlBinding, HomeScreenModel } from "../../client/views.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import { selectScreenModels } from "../../client/views.ts";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import { rateSeedRecords, rateSourceSchema } from "../../test/schema-apps.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import {
  generatedWorkspaceScopedId,
  projectGeneratedWorkspaceCreateIntent,
  projectGeneratedWorkspaceExternalActionIntent,
  projectGeneratedWorkspaceFieldIntent,
  projectGeneratedWorkspaceListIntent,
  projectGeneratedWorkspaceOperationIntent,
  projectGeneratedWorkspaceRecordResultIntent,
  projectGeneratedWorkspaceTableIntent,
} from "./formless-ui-workspace-projection.ts";
import {
  createGeneratedRecordResultFieldAuthoringState,
  type GeneratedRecordResultRecordState,
} from "./generated-record-result-foundation.ts";
import {
  generatedWorkspaceScreenIsEligible,
  resolveGeneratedWorkspaceIntent,
  selectGeneratedWorkspaceFoundation,
  type GeneratedWorkspaceSectionFoundationInput,
  type GeneratedWorkspaceSectionSelectionFacts,
} from "./generated-workspace-foundation.ts";

describe("generated workspace foundation", () => {
  it("selects complete eligible models, selection fallback, evaluated facts, controls, and scoped results", () => {
    const fixture = rateWorkspaceFixture();
    const foundation = fixture.foundation;
    const section = required(foundation.workspace.sections[0]);
    const plan = required(foundation.runtimePlan.sections[0]);
    const presentation = section.collection.presentation;
    const context = presentation.kind === "listDetail" ? presentation.selector : undefined;

    expect(plan.selectedQuery.queryName).toBe("ratesForSelectedCard");
    expect(plan.selectedContextRecordId).toBe("rec_card_default");
    expect(plan.recordIds).toHaveLength(5);
    expect(plan.contextRecordState).toMatchObject({
      baselineRecordId: "rec_card_default",
      confirmationOpenByControlId: {},
    });
    expect(section.collection).toMatchObject({
      selectedQueryId: generatedWorkspaceScopedId(plan.scope, "query", "ratesForSelectedCard"),
    });
    expect(presentation).toMatchObject({
      actions: {
        primary: [{ kind: "createAction" }],
        secondary: [{ kind: "operationAction" }],
      },
      contextDetail: {
        accessibilityLabel: "Default detail",
        density: "compact",
        selectedRecord: { id: "rec_card_default" },
      },
      kind: "listDetail",
      result: { id: fixture.table.id, kind: "table" },
      summaries: [
        { displayValue: "$565.00", label: "Average cost", suffix: "/ day" },
        { displayValue: "$848.00", label: "Average price", suffix: "/ day" },
        { label: "Average margin" },
      ],
    });
    expect(context).toMatchObject({
      availability: { state: "ready" },
      createAction: { kind: "createAction" },
      options: [
        { countText: "5", label: "Default", selected: true },
        { countText: "5", label: "Premium", selected: false },
      ],
      presentation: "localListDetail",
    });
    expect(presentation.queryNavigation?.items).toMatchObject([
      { countText: "5", label: "Selected card", selected: true },
      { countText: "10", label: "All rates", selected: false },
    ]);
    expect(section.actions).toHaveLength(1);
    expect(JSON.stringify(foundation.workspace)).not.toContain("queryContext");
    expect(JSON.stringify(foundation.workspace)).not.toContain("recordIds");
    expect(JSON.stringify(foundation.workspace)).not.toContain("runtime");

    const detail = presentation.contextDetail;
    const name = detail?.fields.find(({ field }) => field.fieldName === "name")?.field;
    const margin = detail?.fields.find(({ field }) => field.fieldName === "marginMin")?.field;
    expect(name).toMatchObject({ density: "default", labelVisibility: "hidden" });
    expect(margin).toMatchObject({ density: "compact", labelVisibility: "visible" });
  });

  it("resolves every controlled route and rejects stale or mismatched identities", () => {
    const fixture = rateWorkspaceFixture();
    const { foundation } = fixture;
    const section = required(foundation.workspace.sections[0]);
    const plan = required(foundation.runtimePlan.sections[0]);
    const presentation = section.collection.presentation;
    const listDetail = presentation.kind === "listDetail" ? presentation : undefined;
    const query = required(listDetail?.queryNavigation?.items[1]);
    const context = required(listDetail?.selector);
    const contextOption = required(context.options[1]);
    const external = required(section.actions[0]);
    const create = required(listDetail?.actions.primary[0]);
    const command = required(listDetail?.actions.secondary[0]);
    const contextCreate = required(context.createAction);

    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, query.selectionIntent),
    ).toMatchObject({ kind: "querySelection", query: { queryName: "rateAll" } });
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, contextOption.selectionIntent),
    ).toMatchObject({ kind: "contextSelection", option: { id: "rec_card_premium" } });
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceExternalActionIntent(
          plan.scope,
          external.id,
          external.action.invoke,
        ),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "external" } });

    if (create.kind !== "createAction" || command.kind !== "operationAction") {
      throw new Error("Missing collection controls.");
    }

    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceCreateIntent(plan.scope, create.surface.id, {
          open: true,
          surfaceId: create.surface.id,
          type: "createOpenChange",
        }),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "collection-create" } });
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceCreateIntent(
          plan.scope,
          contextCreate.surface.id,
          {
            open: true,
            surfaceId: contextCreate.surface.id,
            type: "createOpenChange",
          },
          context.id,
        ),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "context-create" } });
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceOperationIntent(
          plan.scope,
          command.control.id,
          command.control.trigger.intent,
        ),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "collection-command" } });

    const tableOrdering = required(fixture.table.rows[0]?.cells[0]?.contents[0]);
    if (tableOrdering.kind !== "ordering") {
      throw new Error("Missing table ordering.");
    }
    const tableIntent = required(tableOrdering.actions[0]).intent;
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceTableIntent(plan.scope, fixture.table.id, tableIntent),
      ),
    ).toMatchObject({ kind: "result", result: { kind: "table" } });

    const detail = required(listDetail?.contextDetail);
    const field = required(detail.fields.find(({ field }) => field.fieldName === "marginMin"));
    const fieldIntent = projectGeneratedWorkspaceFieldIntent(
      plan.scope,
      field.id,
      { fieldName: "marginMin", type: "recordEditorDraftChange", value: "0.45" },
      {
        contextId: context.id,
        recordId: "rec_card_default",
        resultId: detail.id,
      },
    );
    expect(resolveGeneratedWorkspaceIntent(foundation.runtimePlan, fieldIntent)).toMatchObject({
      kind: "field",
      result: { kind: "recordResult" },
    });

    const deletion = required(detail.actions.secondary[0]);
    const deleteIntent = deletion.control.confirmation?.closeIntent;
    expect(deleteIntent).toBeDefined();
    if (deleteIntent === undefined) {
      throw new Error("Missing delete confirmation intent.");
    }
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceRecordResultIntent(
          plan.scope,
          detail.id,
          {
            controlId: deletion.control.id,
            intent: deleteIntent,
            recordId: "rec_card_default",
            resultId: detail.id,
            type: "recordResultOperationIntent",
          },
          context.id,
        ),
      ),
    ).toMatchObject({ kind: "result", result: { kind: "recordResult" } });

    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...fieldIntent,
        fieldId: `${field.id}:stale`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...query.selectionIntent,
        sectionId: `${plan.scope.sectionId}:other`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...projectGeneratedWorkspaceOperationIntent(
          plan.scope,
          command.control.id,
          command.control.trigger.intent,
        ),
        controlId: `${command.control.id}:stale`,
      }),
    ).toBeUndefined();
  });

  it("scopes repeated list sections, resolves list intents, and rejects whole tree screens", () => {
    const setup = requiredScreen("rateSetup");
    const cards = required(setup.layout.sections[0]);
    const cardRecords = rateSeedRecords
      .filter((record) => record.entity === "card")
      .map((record, index) => ({ ...record, values: { ...record.values, order: index + 1 } }));
    const ordering = {
      field: { min: 0, required: true, type: "number" as const },
      fieldName: "order",
      presentations: ["moveMenu" as const],
      scope: [],
    };
    const repeatedCollection = {
      ...cards.collection,
      result: { ...cards.collection.result, ordering },
    };
    const screen: HomeScreenModel = {
      ...setup,
      layout: {
        ...setup.layout,
        sections: [
          { ...cards, collection: repeatedCollection },
          { ...cards, collection: repeatedCollection, id: "cards-repeat" },
        ],
      },
    };
    const foundation = selectGeneratedWorkspaceFoundation({
      screen,
      snapshot: projectionSnapshot([
        ...rateSeedRecords.filter((record) => record.entity !== "card"),
        ...cardRecords,
      ]),
      today: "2026-07-16",
    });
    const selected = required(foundation);
    const [first, second] = selected.runtimePlan.sections;
    const firstResult = required(first).result;
    const secondResult = required(second).result;

    expect(firstResult.contract.id).not.toBe(secondResult.contract.id);
    expect(JSON.stringify(firstResult.contract)).not.toBe(JSON.stringify(secondResult.contract));
    if (firstResult.kind !== "list") {
      throw new Error("Missing list result.");
    }
    const item = required(firstResult.contract.items[0]);
    const action = required(item.ordering?.actions.find((candidate) => !candidate.disabled));
    const intent = projectGeneratedWorkspaceListIntent(
      required(first).scope,
      firstResult.contract.id,
      action.intent,
    );
    expect(resolveGeneratedWorkspaceIntent(selected.runtimePlan, intent)).toMatchObject({
      kind: "result",
      result: { kind: "list" },
    });
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...intent,
        collectionId: required(second).scope.collectionId,
        sectionId: required(second).scope.sectionId,
      }),
    ).toBeUndefined();

    const treeScreen = {
      ...screen,
      layout: {
        ...screen.layout,
        sections: [
          {
            ...cards,
            collection: {
              ...cards.collection,
              result: { type: "tree" },
            },
          },
        ],
      },
    } as unknown as HomeScreenModel;
    expect(generatedWorkspaceScreenIsEligible(treeScreen)).toBe(false);
    expect(
      selectGeneratedWorkspaceFoundation({
        screen: treeScreen,
        snapshot: projectionSnapshot(rateSeedRecords),
        today: "2026-07-16",
      }),
    ).toBeUndefined();
  });
});

function rateWorkspaceFixture() {
  const base = requiredScreen("rateHome");
  const section = required(base.layout.sections[0]);
  const context = required(section.collection.context);
  const tableResult = section.collection.result;
  if (tableResult.type !== "table") {
    throw new Error("Missing rate table result.");
  }
  const query = section.collection.queries.defaultTab;
  const rateAll = {
    count: { type: "count" as const },
    label: "All rates",
    query: { kind: "all" as const },
    queryName: "rateAll",
  };
  const cardRates = rateSourceSchema.relationships?.cardRates;
  if (cardRates?.kind !== "toMany") {
    throw new Error("Missing card rates relationship.");
  }
  const relatedCollection = {
    entity: rateSourceSchema.entities.rate!,
    entityName: "rate",
    label: "Rates",
    referenceFieldName: "card",
    relationship: cardRates,
    relationshipName: "cardRates",
  };
  const projectedContext = {
    ...context,
    deleteOperation: testOperation("card", "delete"),
    presentation: "listDetail",
    recordFields: [
      {
        commit: "field-commit",
        editor: "text",
        field: rateSourceSchema.entities.card!.fields.name!,
        fieldName: "name",
      },
      ...(context.recordFields ?? []),
    ],
  } satisfies typeof context;
  const contextResult = contextRecordResult(projectedContext);
  const premium = required(rateSeedRecords.find((record) => record.id === "rec_card_premium"));
  const staleState: GeneratedRecordResultRecordState = {
    ...createGeneratedRecordResultFieldAuthoringState(premium, contextResult),
    baselineRecordId: premium.id,
    baselineUpdatedAt: premium.updatedAt,
    confirmationOpenByControlId: { stale: true },
    errorsByFieldName: { marginMin: "Stale error" },
    iconDialogOpenByFieldName: { name: true },
    pendingByFieldName: { marginMin: true },
  };
  const screen: HomeScreenModel = {
    ...base,
    layout: {
      ...base.layout,
      sections: [
        {
          ...section,
          collection: {
            ...section.collection,
            context: {
              ...projectedContext,
              relatedCollection,
            },
            queries: {
              defaultQueryName: query.queryName,
              defaultTab: query,
              tabs: [query, rateAll],
            },
            summary: tableResult.footer,
          },
        },
      ],
    },
  };
  let table: FormlessUiTableContract | undefined;
  const foundation = required(
    selectGeneratedWorkspaceFoundation({
      screen,
      sectionSelection: {
        rates: {
          selectedContextRecordId: "missing-card",
          selectedQueryName: "missing-query",
        },
      },
      selectSectionFoundation: (facts) => {
        const selected = selectRateSectionFoundation(facts, staleState);
        table = selected.table?.table;
        return selected;
      },
      snapshot: projectionSnapshot(rateSeedRecords),
      today: "2026-07-16",
    }),
  );

  return { foundation, table: required(table) };
}

function selectRateSectionFoundation(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  staleState: GeneratedRecordResultRecordState,
): GeneratedWorkspaceSectionFoundationInput {
  const externalControlId = generatedWorkspaceScopedId(facts.scope, "control", "external");
  const collectionSurfaceId = generatedWorkspaceScopedId(
    facts.scope,
    "surface",
    "collection-create",
  );
  const contextSurfaceId = generatedWorkspaceScopedId(facts.scope, "surface", "context-create");
  const commandId = generatedWorkspaceScopedId(facts.scope, "control", "collection-command");
  const table = tableContract(facts.resultId, facts.recordIds);

  return {
    collectionActions: [
      {
        action: {
          kind: "createAction",
          surface: createSurface(collectionSurfaceId, "Create rate"),
        },
        placement: "primary",
        runtime: "collection-create",
      },
      {
        action: { control: operationControl(commandId, "Refresh rates"), kind: "operationAction" },
        placement: "secondary",
        runtime: "collection-command",
      },
    ],
    contextCreate: {
      action: { kind: "createAction", surface: createSurface(contextSurfaceId, "Create card") },
      runtime: "context-create",
    },
    contextDetail: { recordState: staleState },
    externalActions: [
      {
        action: actionTrigger(externalControlId, "Install"),
        id: "install",
        runtime: "external",
      },
    ],
    table: { runtime: "table", table },
  };
}

function tableContract(id: string, recordIds: readonly string[]): FormlessUiTableContract {
  const rowId = recordIds[0] ?? "empty";
  const actionId = `${id}:${rowId}:move-down`;
  const columnId = `${id}:ordering-column`;
  return {
    accessibilityLabel: "Rate records",
    columns: [
      {
        accessibilityLabel: "Ordering",
        alignment: "start",
        contentRole: "ordering",
        id: columnId,
        isRowHeader: false,
        kind: "tableColumn",
        label: "Order",
        labelVisibility: "hidden",
        width: "xs",
      },
    ],
    density: "default",
    editing: { enabled: true },
    id,
    kind: "table",
    rows: [
      {
        accessibilityLabel: `Rate ${rowId}`,
        cells: [
          {
            columnId,
            contents: [
              {
                accessibilityLabel: `Reorder rate ${rowId}`,
                actions: [
                  {
                    direction: "down",
                    id: actionId,
                    intent: {
                      actionId,
                      direction: "down",
                      rowId,
                      tableId: id,
                      type: "tableReorder",
                    },
                    label: "Move down",
                  },
                ],
                affordance: "reorder",
                kind: "ordering",
                pending: false,
              },
            ],
            id: `${id}:${rowId}:ordering-cell`,
            kind: "tableCell",
          },
        ],
        id: rowId,
        kind: "tableRow",
        warnings: [],
      },
    ],
  };
}

function contextRecordResult(
  context: NonNullable<HomeScreenModel["layout"]["sections"][number]["collection"]["context"]>,
): RecordResultModel {
  return {
    ...(context.deleteOperation === undefined ? {} : { deleteOperation: context.deleteOperation }),
    itemViewName: context.itemViewName ?? `${context.name}:detail`,
    recordFields: context.recordFields ?? [],
    ...(context.recordUnion === undefined ? {} : { recordUnion: context.recordUnion }),
    transitionOperations: context.transitionOperations,
    type: "record",
    ...(context.updateOperation === undefined ? {} : { updateOperation: context.updateOperation }),
  };
}

function projectionSnapshot(records: readonly StoredRecord[]) {
  return {
    recordsById: Object.fromEntries(records.map((record) => [record.id, record])),
    recordIdsByEntity: records.reduce<Record<string, string[]>>((byEntity, record) => {
      (byEntity[record.entity] ??= []).push(record.id);
      return byEntity;
    }, {}),
  };
}

function requiredScreen(screenName: string): HomeScreenModel {
  return required(
    selectScreenModels(rateSourceSchema).find((screen) => screen.screenName === screenName),
  );
}

function actionTrigger(id: string, label: string): FormlessUiActionTriggerContract {
  return {
    id,
    invocationSource: "button",
    invoke: { controlId: id, invocationSource: "button" },
    kind: "actionTrigger",
    label,
  };
}

function createSurface(id: string, label: string): FormlessUiCreateSurfaceContract {
  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: { disabled: false, fields: [], id: `${id}:fields`, kind: "fieldSet" },
        id: `${id}:form`,
        kind: "createForm",
        submit: { ...button(`${id}:submit`, label), type: "submit" },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title: label,
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, label),
  };
}

function button(id: string, label: string): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
    type: "button",
  };
}

function operationControl(id: string, label: string): FormlessUiOperationControlContract {
  const binding: GeneratedOperationControlBinding = {
    availability: { state: "enabled" },
    canonicalOperationKey: `rate.${id}`,
    entityName: "rate",
    executionKey: `${id}:execution`,
    id,
    input: { kind: "collectionCommand", ui: { showAffectedCountOnSuccess: false } },
    kind: "command",
    label,
    operationKind: "command",
    operationName: id,
    scope: "collection",
    visualIntent: "default",
  };
  return projectGeneratedOperationFormlessUiControl({
    binding,
    presentation: {
      accessibilityLabel: label,
      content: { kind: "label", label },
      density: "default",
      prominence: "secondary",
    },
    state: { executionKey: binding.executionKey, status: "idle" },
  });
}

function testOperation(
  entityName: string,
  kind: "delete" | "update",
): EntityOperationPresentationConfig {
  return {
    canonicalKey: `${entityName}.${kind}`,
    entityName,
    label: kind === "delete" ? "Delete" : "Update",
    operation: {
      audit: { input: "summary" },
      effect: kind === "delete" ? { type: "deleteRecord" } : { type: "patchRecord" },
      idempotency: { required: true },
      input: { fields: {} },
      kind,
      output: { type: kind },
      scope: "record",
    },
    operationName: kind,
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) {
    throw new Error("Missing required fixture value.");
  }
  return value;
}
