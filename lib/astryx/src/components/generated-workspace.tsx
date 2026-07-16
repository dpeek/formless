import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FormlessUiContextResultReference,
  FormlessUiCreateSurfaceContract,
  FormlessUiCreateField,
  FormlessUiField,
  FormlessUiListContract,
  FormlessUiMainResultReference,
  FormlessUiOperationControlContract,
  FormlessUiOperationPresentationIntent,
  FormlessUiRecordResultContract,
  FormlessUiTableActionGroupContract,
  FormlessUiTableContract,
  FormlessUiWorkspaceCollectionActionGroupContract,
  FormlessUiWorkspaceCollectionContract,
  FormlessUiWorkspaceCollectionPresentationContract,
  FormlessUiWorkspaceContextContract,
  FormlessUiWorkspaceIntent,
  FormlessUiWorkspaceManifestReference,
  FormlessUiWorkspaceResultContract,
  FormlessUiWorkspaceSectionContract,
  FormlessUiWorkspaceSectionShellReference,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiListResultReference,
  formlessUiRecordResultReference,
  formlessUiTableResultReference,
  formlessUiWorkspaceManifestReference,
  formlessUiWorkspaceSectionShellReference,
  isFormlessUiWorkspaceIntent,
  type FormlessUiContractHostNode,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { AstryxSubscribedWorkspaceScreenRenderer } from "./formless-ui-workspace-screen-renderer.tsx";
import {
  createFormlessGeneratedWorkspaceFixtures,
  type FormlessGeneratedWorkspaceFixture,
  type FormlessGeneratedWorkspaceFixtureId,
} from "./generated-workspace.fixtures.ts";
import { applyListFieldIntent, applyListIntent } from "./lists.tsx";
import { applyTableFieldIntent, applyTableIntent } from "./tables.tsx";

export function FormlessGeneratedWorkspaceLayout() {
  const [fixtures] = useState(createFormlessGeneratedWorkspaceHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessGeneratedWorkspaceFixtureId>("tasks");
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId);

  return (
    <main>
      <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
        <VStack gap={5} maxWidth={1200} width="100%">
          <HStack align="center" justify="between" wrap="wrap">
            <Heading level={1}>Generated Workspace</Heading>
            <SegmentedControl
              label="Workspace state"
              layout="hug"
              onChange={(value) =>
                setSelectedFixtureId(value as FormlessGeneratedWorkspaceFixtureId)
              }
              value={selectedFixtureId}
            >
              {fixtures.map((fixture) => (
                <SegmentedControlItem key={fixture.id} label={fixture.label} value={fixture.id} />
              ))}
            </SegmentedControl>
          </HStack>

          {selectedFixture ? (
            <FormlessUiContractHostProvider host={selectedFixture.host}>
              <AstryxSubscribedWorkspaceScreenRenderer
                reference={selectedFixture.workspaceReference}
              />
            </FormlessUiContractHostProvider>
          ) : null}
        </VStack>
      </VStack>
    </main>
  );
}

export type FormlessGeneratedWorkspaceFixtureHost = {
  getWorkspace(): FormlessGeneratedWorkspaceFixture["workspace"];
  host: Omit<FormlessUiMutableContractHost, "dispatch"> & {
    dispatch(intent: FormlessUiWorkspaceIntent): void;
  };
  workspaceReference: FormlessUiWorkspaceManifestReference;
};

export function createFormlessGeneratedWorkspaceFixtureHost(
  initialWorkspace: FormlessGeneratedWorkspaceFixture["workspace"],
): FormlessGeneratedWorkspaceFixtureHost {
  let workspace = initialWorkspace;
  const initialPublication = projectGeneratedWorkspaceFixturePublication(workspace);
  let host: FormlessUiMutableContractHost;

  host = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      if (!isFormlessUiWorkspaceIntent(intent)) {
        throw new Error("Generated workspace fixture host received a shell intent.");
      }
      const nextWorkspace = applyGeneratedWorkspaceIntent(workspace, intent);
      if (nextWorkspace === workspace) {
        return;
      }

      workspace = nextWorkspace;
      host.publish(projectGeneratedWorkspaceFixturePublication(workspace).nodes);
    },
    nodes: initialPublication.nodes,
  });

  return {
    getWorkspace: () => workspace,
    host: host as FormlessGeneratedWorkspaceFixtureHost["host"],
    workspaceReference: initialPublication.workspaceReference,
  };
}

export function projectGeneratedWorkspaceFixturePublication(
  workspace: FormlessGeneratedWorkspaceFixture["workspace"],
): {
  nodes: FormlessUiContractHostNodeSet;
  workspaceReference: FormlessUiWorkspaceManifestReference;
} {
  const workspaceReference = formlessUiWorkspaceManifestReference(workspace.id);
  const sections = workspace.sections.map((section) =>
    projectGeneratedWorkspaceFixtureSection(workspaceReference.workspaceId, section),
  );

  return {
    nodes: [
      {
        reference: workspaceReference,
        snapshot: {
          accessibilityLabel: workspace.accessibilityLabel,
          id: workspace.id,
          kind: "workspaceManifest",
          label: workspace.label,
          sections: sections.map(({ reference }) => reference),
        },
      },
      ...sections.flatMap(({ nodes }) => nodes),
    ],
    workspaceReference,
  };
}

function createFormlessGeneratedWorkspaceHosts() {
  return createFormlessGeneratedWorkspaceFixtures().map(({ id, label, workspace }) => ({
    id,
    label,
    ...createFormlessGeneratedWorkspaceFixtureHost(workspace),
  }));
}

function projectGeneratedWorkspaceFixtureSection(
  workspaceId: string,
  section: FormlessUiWorkspaceSectionContract,
): {
  nodes: FormlessUiContractHostNodeSet;
  reference: FormlessUiWorkspaceSectionShellReference;
} {
  const reference = formlessUiWorkspaceSectionShellReference(workspaceId, section.id);
  const { contextDetail, result, ...presentation } = section.collection.presentation;
  const mainResult = projectGeneratedWorkspaceFixtureMainResult(workspaceId, section.id, result);
  const contextResult = contextDetail
    ? projectGeneratedWorkspaceFixtureContextResult(workspaceId, section.id, contextDetail)
    : undefined;

  return {
    nodes: [
      {
        reference,
        snapshot: {
          accessibilityLabel: section.accessibilityLabel,
          actions: section.actions,
          collection: {
            ...section.collection,
            presentation: {
              ...presentation,
              ...(contextResult === undefined ? {} : { contextDetail: contextResult.reference }),
              result: mainResult.reference,
            },
          },
          headingVisibility: section.headingVisibility,
          id: section.id,
          kind: "workspaceSectionShell",
          label: section.label,
        },
      },
      mainResult.node,
      ...(contextResult === undefined ? [] : [contextResult.node]),
    ],
    reference,
  };
}

function projectGeneratedWorkspaceFixtureMainResult(
  workspaceId: string,
  sectionId: string,
  result: FormlessUiWorkspaceResultContract,
): {
  node: FormlessUiContractHostNode;
  reference: FormlessUiMainResultReference;
} {
  switch (result.kind) {
    case "list": {
      const reference = formlessUiListResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "recordResult": {
      const reference = formlessUiRecordResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "table": {
      const reference = formlessUiTableResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
  }
}

function projectGeneratedWorkspaceFixtureContextResult(
  workspaceId: string,
  sectionId: string,
  result: FormlessUiRecordResultContract,
): {
  node: FormlessUiContractHostNode;
  reference: FormlessUiContextResultReference;
} {
  const reference = formlessUiRecordResultReference({
    resultId: result.id,
    role: "contextResult",
    sectionId,
    workspaceId,
  });
  return { node: { reference, snapshot: result }, reference };
}

export function applyGeneratedWorkspaceIntent(
  workspace: FormlessGeneratedWorkspaceFixture["workspace"],
  intent: FormlessUiWorkspaceIntent,
): FormlessGeneratedWorkspaceFixture["workspace"] {
  if (intent.screenId !== workspace.id) {
    return workspace;
  }

  let matched = false;
  const sections = workspace.sections.map((section) => {
    if (section.id !== intent.sectionId || section.collection.id !== intent.collectionId) {
      return section;
    }

    matched = true;
    if (intent.type === "workspaceExternalAction") {
      return {
        ...section,
        actions: section.actions.map((externalAction) =>
          externalAction.id === intent.actionId &&
          externalAction.action.id === intent.controlId &&
          intent.intent.controlId === intent.controlId
            ? {
                ...externalAction,
                action: { ...externalAction.action, selected: true },
              }
            : externalAction,
        ),
      };
    }

    return {
      ...section,
      collection: applyCollectionIntent(section.collection, intent),
    };
  });

  return matched ? { ...workspace, sections } : workspace;
}

export function selectedGeneratedWorkspaceFixture(
  fixtures: readonly FormlessGeneratedWorkspaceFixture[],
  id: FormlessGeneratedWorkspaceFixtureId,
) {
  return fixtures.find((fixture) => fixture.id === id);
}

function applyCollectionIntent(
  collection: FormlessUiWorkspaceCollectionContract,
  intent: Exclude<FormlessUiWorkspaceIntent, { type: "workspaceExternalAction" }>,
): FormlessUiWorkspaceCollectionContract {
  if (intent.type === "workspaceQuerySelection") {
    const navigation = collection.presentation.queryNavigation;
    if (!navigation?.items.some((item) => item.id === intent.queryId)) {
      return collection;
    }

    return {
      ...collection,
      presentation: withQueryNavigation(collection.presentation, {
        ...navigation,
        items: navigation.items.map((item) => ({
          ...item,
          selected: item.id === intent.queryId,
        })),
      }),
      selectedQueryId: intent.queryId,
    };
  }

  if (intent.type === "workspaceContextSelection") {
    return {
      ...collection,
      presentation: withSelectedContext(
        collection.presentation,
        intent.contextId,
        intent.contextOptionId,
      ),
    };
  }

  if (intent.type === "workspaceCreate") {
    return {
      ...collection,
      presentation: mapCreateSurfaces(collection.presentation, intent.surfaceId, (surface) => {
        if (intent.intent.surfaceId !== surface.id) {
          return surface;
        }

        return {
          ...surface,
          dialog: {
            ...surface.dialog,
            open: intent.intent.type === "createOpenChange" ? intent.intent.open : false,
          },
        };
      }),
    };
  }

  if (intent.type === "workspaceField") {
    if (intent.surfaceId !== undefined) {
      return {
        ...collection,
        presentation: mapCreateSurfaces(collection.presentation, intent.surfaceId, (surface) => ({
          ...surface,
          dialog: {
            ...surface.dialog,
            form: {
              ...surface.dialog.form,
              fieldSet: {
                ...surface.dialog.form.fieldSet,
                fields: surface.dialog.form.fieldSet.fields.map((field) =>
                  field.fieldName === intent.fieldId
                    ? (applyScenarioFieldIntent(field, intent.intent) as FormlessUiCreateField)
                    : field,
                ),
              },
            },
          },
        })),
      };
    }

    return {
      ...collection,
      presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
        applyWorkspaceResultFieldIntent(result, intent.recordId, intent.intent),
      ),
    };
  }

  if (intent.type === "workspaceOperation") {
    const presentation = {
      ...collection.presentation,
      actions: mapCollectionOperation(
        collection.presentation.actions,
        intent.controlId,
        intent.intent,
      ),
    } as FormlessUiWorkspaceCollectionPresentationContract;

    return {
      ...collection,
      presentation: mapWorkspaceResults(presentation, intent.resultId, (result) =>
        mapResultOperation(result, intent.controlId, intent.intent),
      ),
    };
  }

  if (intent.type === "workspaceList") {
    return {
      ...collection,
      presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
        result.kind === "list" ? applyListIntent(result, intent.intent) : result,
      ),
    };
  }

  if (intent.type === "workspaceTable") {
    return {
      ...collection,
      presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
        result.kind === "table" ? applyTableIntent(result, intent.intent) : result,
      ),
    };
  }

  return {
    ...collection,
    presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
      result.kind === "recordResult" ? applyRecordResultIntent(result, intent.intent) : result,
    ),
  };
}

function withQueryNavigation(
  presentation: FormlessUiWorkspaceCollectionPresentationContract,
  queryNavigation: NonNullable<
    FormlessUiWorkspaceCollectionPresentationContract["queryNavigation"]
  >,
): FormlessUiWorkspaceCollectionPresentationContract {
  return { ...presentation, queryNavigation };
}

function withSelectedContext(
  presentation: FormlessUiWorkspaceCollectionPresentationContract,
  contextId: string,
  optionId: string,
): FormlessUiWorkspaceCollectionPresentationContract {
  if (presentation.kind === "listDetail") {
    return {
      ...presentation,
      selector: selectContextOption(presentation.selector, contextId, optionId),
    };
  }

  return presentation.context
    ? {
        ...presentation,
        context: selectContextOption(presentation.context, contextId, optionId),
      }
    : presentation;
}

function selectContextOption<P extends FormlessUiWorkspaceContextContract["presentation"]>(
  context: FormlessUiWorkspaceContextContract & { presentation: P },
  contextId: string,
  optionId: string,
): FormlessUiWorkspaceContextContract & { presentation: P } {
  if (
    context.id !== contextId ||
    !context.options.some((option) => option.id === optionId && option.availability.available)
  ) {
    return context;
  }

  return {
    ...context,
    options: context.options.map((option) => ({ ...option, selected: option.id === optionId })),
    selectedOptionId: optionId,
  };
}

function mapCreateSurfaces(
  presentation: FormlessUiWorkspaceCollectionPresentationContract,
  surfaceId: string,
  update: (surface: FormlessUiCreateSurfaceContract) => FormlessUiCreateSurfaceContract,
): FormlessUiWorkspaceCollectionPresentationContract {
  const actions = mapCollectionCreateSurface(presentation.actions, surfaceId, update);

  if (presentation.kind === "listDetail") {
    return {
      ...presentation,
      actions,
      selector: mapContextCreateSurface(presentation.selector, surfaceId, update),
    };
  }

  return {
    ...presentation,
    actions,
    ...(presentation.context === undefined
      ? {}
      : { context: mapContextCreateSurface(presentation.context, surfaceId, update) }),
  };
}

function mapCollectionCreateSurface(
  actions: FormlessUiWorkspaceCollectionActionGroupContract,
  surfaceId: string,
  update: (surface: FormlessUiCreateSurfaceContract) => FormlessUiCreateSurfaceContract,
): FormlessUiWorkspaceCollectionActionGroupContract {
  const mapAction = (action: FormlessUiWorkspaceCollectionActionGroupContract["primary"][number]) =>
    action.kind === "createAction" && action.surface.id === surfaceId
      ? { ...action, surface: update(action.surface) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}

function mapContextCreateSurface<P extends FormlessUiWorkspaceContextContract["presentation"]>(
  context: FormlessUiWorkspaceContextContract & { presentation: P },
  surfaceId: string,
  update: (surface: FormlessUiCreateSurfaceContract) => FormlessUiCreateSurfaceContract,
): FormlessUiWorkspaceContextContract & { presentation: P } {
  return context.createAction?.surface.id === surfaceId
    ? {
        ...context,
        createAction: { ...context.createAction, surface: update(context.createAction.surface) },
      }
    : context;
}

function mapWorkspaceResults(
  presentation: FormlessUiWorkspaceCollectionPresentationContract,
  resultId: string | undefined,
  update: (result: FormlessUiWorkspaceResultContract) => FormlessUiWorkspaceResultContract,
): FormlessUiWorkspaceCollectionPresentationContract {
  if (resultId === undefined) {
    return presentation;
  }

  const result =
    presentation.result.id === resultId ? update(presentation.result) : presentation.result;
  const contextDetail =
    presentation.contextDetail?.id === resultId
      ? (update(presentation.contextDetail) as FormlessUiRecordResultContract)
      : presentation.contextDetail;

  return {
    ...presentation,
    ...(contextDetail === undefined ? {} : { contextDetail }),
    result,
  };
}

function applyWorkspaceResultFieldIntent(
  result: FormlessUiWorkspaceResultContract,
  recordId: string | undefined,
  intent: Extract<FormlessUiWorkspaceIntent, { type: "workspaceField" }>["intent"],
): FormlessUiWorkspaceResultContract {
  if (result.kind === "list") {
    const sourceField = result.items
      .find((item) => item.id === recordId)
      ?.fields.find((field) => field.fieldName === workspaceFieldName(intent));

    return sourceField ? applyListFieldIntent(result, recordId ?? "", sourceField, intent) : result;
  }

  if (result.kind === "table") {
    const sourceField = findTableField(result, recordId, workspaceFieldName(intent));
    return sourceField ? applyTableFieldIntent(result, sourceField, intent) : result;
  }

  return result;
}

function workspaceFieldName(
  intent: Extract<FormlessUiWorkspaceIntent, { type: "workspaceField" }>["intent"],
) {
  return "fieldName" in intent ? intent.fieldName : "inputName" in intent ? intent.inputName : "";
}

function findTableField(
  table: FormlessUiTableContract,
  recordId: string | undefined,
  fieldName: string,
): FormlessUiField | undefined {
  const row = table.rows.find((candidate) => candidate.id === recordId);
  const content = row?.cells
    .flatMap((cell) => cell.contents)
    .find((candidate) => candidate.kind === "field" && candidate.field.fieldName === fieldName);

  return content?.kind === "field" ? content.field : undefined;
}

function mapCollectionOperation(
  actions: FormlessUiWorkspaceCollectionActionGroupContract,
  controlId: string,
  intent: FormlessUiOperationPresentationIntent,
): FormlessUiWorkspaceCollectionActionGroupContract {
  const mapAction = (action: FormlessUiWorkspaceCollectionActionGroupContract["primary"][number]) =>
    action.kind === "operationAction" && action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}

function mapResultOperation(
  result: FormlessUiWorkspaceResultContract,
  controlId: string,
  intent: FormlessUiOperationPresentationIntent,
): FormlessUiWorkspaceResultContract {
  if (result.kind === "list") {
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        actions: mapListActionGroup(item.actions, controlId, intent),
      })),
    };
  }

  if (result.kind === "table") {
    return {
      ...result,
      rows: result.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => ({
          ...cell,
          contents: cell.contents.map((content) =>
            content.kind === "actionGroup"
              ? mapTableActionGroup(content, controlId, intent)
              : content,
          ),
        })),
      })),
    };
  }

  return mapRecordResultOperation(result, controlId, intent);
}

function mapListActionGroup(
  actions: FormlessUiListContract["items"][number]["actions"],
  controlId: string,
  intent: FormlessUiOperationPresentationIntent,
) {
  const mapAction = (action: (typeof actions.primary)[number]) =>
    action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}

function mapTableActionGroup(
  actions: FormlessUiTableActionGroupContract,
  controlId: string,
  intent: FormlessUiOperationPresentationIntent,
) {
  const mapAction = (action: (typeof actions.primary)[number]) =>
    action.kind === "operationAction" && action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}

function mapRecordResultOperation(
  result: FormlessUiRecordResultContract,
  controlId: string,
  intent: FormlessUiOperationPresentationIntent,
): FormlessUiRecordResultContract {
  const mapAction = (action: FormlessUiRecordResultContract["actions"]["primary"][number]) =>
    action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...result,
    actions: {
      ...result.actions,
      primary: result.actions.primary.map(mapAction),
      secondary: result.actions.secondary.map(mapAction),
    },
  };
}

function applyRecordResultIntent(
  result: FormlessUiRecordResultContract,
  intent: Extract<FormlessUiWorkspaceIntent, { type: "workspaceRecordResult" }>["intent"],
): FormlessUiRecordResultContract {
  if (intent.resultId !== result.id || intent.recordId !== result.selectedRecord?.id) {
    return result;
  }

  if (intent.type === "recordResultFieldIntent") {
    return {
      ...result,
      fields: result.fields.map((field) =>
        field.id === intent.fieldId
          ? { ...field, field: applyScenarioFieldIntent(field.field, intent.intent) }
          : field,
      ),
    };
  }

  return mapRecordResultOperation(result, intent.controlId, intent.intent);
}

function applyFixtureOperationIntent(
  control: FormlessUiOperationControlContract,
  intent: FormlessUiOperationPresentationIntent,
): FormlessUiOperationControlContract {
  if (intent.controlId !== control.id) {
    return control;
  }

  if (intent.type === "operationConfirmationOpenChange") {
    return control.confirmation
      ? {
          ...control,
          confirmation: { ...control.confirmation, open: intent.open },
        }
      : control;
  }

  const label =
    control.trigger.content.kind === "iconOnly"
      ? control.trigger.accessibilityLabel
      : control.trigger.content.label;
  const completion = `${label} complete`;

  return {
    ...control,
    ...(control.confirmation === undefined
      ? {}
      : { confirmation: { ...control.confirmation, open: false } }),
    feedback: {
      detail: "Prototype intent handled.",
      id: `${control.id}:fixture:committed`,
      intent: "success",
      kind: "operationFeedbackEvent",
      status: "committed",
      title: completion,
    },
    status: {
      ...control.status,
      accessibilityLabel: completion,
      detail: "Prototype intent handled.",
      intent: "success",
      label: completion,
      status: "committed",
    },
  };
}
