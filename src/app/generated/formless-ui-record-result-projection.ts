import type {
  FormlessUiField,
  FormlessUiOperationControlContract,
  FormlessUiRecordResultActionContract,
  FormlessUiRecordResultActionGroupContract,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultOperationActionContract,
} from "@dpeek/formless-presentation/contract";
import type { RecordReadinessWarning } from "../../client/readiness.ts";

export type GeneratedRecordResultPlacedAction = {
  action: FormlessUiRecordResultActionContract;
  placement: "primary" | "secondary";
};

export type GeneratedRecordResultProjectionState =
  | {
      description?: string;
      state: "empty";
      title?: string;
    }
  | {
      message: string;
      recordId: string;
      recordLabel?: string;
      state: "unavailable";
    }
  | {
      actions?: readonly GeneratedRecordResultPlacedAction[];
      fields: readonly FormlessUiField[];
      readinessWarnings?: readonly RecordReadinessWarning[];
      recordId: string;
      recordLabel: string;
      state: "ready";
    };

export type ProjectGeneratedRecordResultFormlessUiContractOptions = {
  accessibilityLabel: string;
  density?: FormlessUiRecordResultContract["density"];
  editingDisabledReason?: string;
  editingEnabled: boolean;
  id: string;
  result: GeneratedRecordResultProjectionState;
};

export function projectGeneratedRecordResultFormlessUiContract({
  accessibilityLabel,
  density = "default",
  editingDisabledReason = "Editing is disabled.",
  editingEnabled,
  id,
  result,
}: ProjectGeneratedRecordResultFormlessUiContractOptions): FormlessUiRecordResultContract {
  const ready = result.state === "ready" ? result : undefined;
  const selected = result.state === "empty" ? undefined : result;
  const recordLabel = selected?.recordLabel ?? selected?.recordId;

  return {
    accessibilityLabel,
    actions: projectGeneratedRecordResultActionGroup({
      actions: ready?.actions ?? [],
      id: `${id}:actions`,
      secondaryAccessibilityLabel: `More actions for ${recordLabel ?? accessibilityLabel}`,
    }),
    availability:
      result.state === "unavailable"
        ? { message: result.message, state: "unavailable" }
        : { state: result.state },
    density,
    editing: editingEnabled
      ? { enabled: true }
      : { disabledReason: editingDisabledReason, enabled: false },
    ...(result.state === "empty"
      ? {
          emptyState: {
            ...(result.description === undefined ? {} : { description: result.description }),
            id: `${id}:empty`,
            kind: "recordResultEmptyState" as const,
            title: result.title ?? "No record found.",
          },
        }
      : {}),
    fields: ready?.fields ?? [],
    id,
    kind: "recordResult",
    ...(selected === undefined
      ? {}
      : {
          selectedRecord: {
            accessibilityLabel: recordLabel ?? selected.recordId,
            id: selected.recordId,
            kind: "recordResultRecord" as const,
          },
        }),
    warnings:
      ready === undefined || (ready.readinessWarnings?.length ?? 0) === 0
        ? []
        : [
            {
              id: `${id}:${ready.recordId}:readiness-warning`,
              items: (ready.readinessWarnings ?? []).map(({ code, message }) => ({
                code,
                message,
              })),
              kind: "recordResultWarning" as const,
              title: "Readiness warnings",
            },
          ],
  };
}

export function projectGeneratedRecordResultActionGroup({
  actions,
  id,
  secondaryAccessibilityLabel,
}: {
  actions: readonly GeneratedRecordResultPlacedAction[];
  id: string;
  secondaryAccessibilityLabel: string;
}): FormlessUiRecordResultActionGroupContract {
  return {
    id,
    kind: "actionGroup",
    primary: actions.filter(({ placement }) => placement === "primary").map(({ action }) => action),
    secondary: actions
      .filter(({ placement }) => placement === "secondary")
      .map(({ action }) => action),
    secondaryAccessibilityLabel,
  };
}

export function projectGeneratedRecordResultOperationAction(
  control: FormlessUiOperationControlContract,
  role: FormlessUiRecordResultOperationActionContract["role"],
): FormlessUiRecordResultOperationActionContract {
  return {
    control,
    kind: "operationAction",
    role,
  };
}
