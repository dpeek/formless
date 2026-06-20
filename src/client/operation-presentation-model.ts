import {
  formatEntityOperationKey,
  isEntityOperationVisibleToBrowser,
  type EntityActionKind,
  type EntityOperationKind,
  type EntityOperationSchema,
  type EntityOperationScope,
  type EntitySchema,
} from "@dpeek/formless-schema";

export type EntityOperationPresentationConfig = {
  entityName: string;
  operationName: string;
  canonicalKey: string;
  label: string;
  operation: EntityOperationSchema;
};

export function selectAvailableEntityOperations(
  entityName: string,
  entity: EntitySchema,
  scope: EntityOperationScope,
): EntityOperationPresentationConfig[] {
  return Object.entries(entity.operations ?? {}).flatMap(([operationName, operation]) => {
    if (operation.scope !== scope || !isEntityOperationVisibleToBrowser(operation)) {
      return [];
    }

    return [selectEntityOperationPresentation(entityName, operationName, operation)];
  });
}

export function selectEntityOperationByKind(
  entityName: string,
  entity: EntitySchema,
  kind: EntityOperationKind,
  scope: EntityOperationScope,
): EntityOperationPresentationConfig | undefined {
  return selectAvailableEntityOperations(entityName, entity, scope).find(
    (operation) => operation.operation.kind === kind,
  );
}

export function selectCommandOperationByActionKind(
  entityName: string,
  entity: EntitySchema,
  actionKind: EntityActionKind,
  scope: EntityOperationScope,
): EntityOperationPresentationConfig | undefined {
  return selectAvailableEntityOperations(entityName, entity, scope).find(
    (operation) =>
      operation.operation.kind === "command" &&
      operation.operation.effect?.type === "registeredCommand" &&
      operation.operation.effect.kind === actionKind,
  );
}

export function selectEntityOperationPresentation(
  entityName: string,
  operationName: string,
  operation: EntityOperationSchema,
): EntityOperationPresentationConfig {
  return {
    entityName,
    operationName,
    canonicalKey: formatEntityOperationKey({ entityKey: entityName, operationKey: operationName }),
    label: operation.label ?? defaultOperationLabel(operation, operationName),
    operation,
  };
}

function defaultOperationLabel(operation: EntityOperationSchema, operationName: string) {
  if (operation.kind === "create") {
    return "Create";
  }

  if (operation.kind === "update") {
    return "Update";
  }

  if (operation.kind === "delete") {
    return "Delete";
  }

  return humanizeOperationName(operationName);
}

function humanizeOperationName(operationName: string) {
  return operationName
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (first) => first.toUpperCase());
}
