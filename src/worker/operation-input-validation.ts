import {
  formatEntityOperationKey,
  projectOperationInputValues,
  type AppSchema,
  type EntityOperationSchema,
  type EntitySchema,
  type OperationInputValueProjection,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import type { OperationInvocationEnvelope } from "../shared/operation-invocation.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { BadRequestError } from "./errors.ts";

export type OperationInputValidationRequest = {
  context?: string;
  entityName: string;
  operation: EntityOperationSchema;
  operationName: string;
  rawInput: unknown;
  schema: AppSchema;
  storage: DurableObjectStorage;
};

export type OperationEnvelopeInputValidationRequest = {
  context?: string;
  envelope: OperationInvocationEnvelope;
  rawInput: unknown;
  schema: AppSchema;
  storage: DurableObjectStorage;
};

type NormalizedOperationInputValidationRequest = OperationInputValidationRequest & {
  canonicalKey: string;
  context: string;
};

export function validateOperationRecordWriteValues(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): Record<string, unknown> {
  const request = normalizeOperationInputValidationRequest(input);
  const projection = projectWorkerOperationInputValues(request);
  assertStorageBackedOperationInputValues(request, projection.recordWriteValues);

  if (request.operation.kind !== "update") {
    return projection.recordWriteValues;
  }

  return projection.recordWritePatchValues;
}

export function validateOperationRecordPlanInputValues(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): RecordValues {
  const request = normalizeOperationInputValidationRequest(input);
  const projection = projectWorkerOperationInputValues(request);
  assertStorageBackedOperationInputValues(request, projection.recordWriteValues);

  return projection.operationInputValues;
}

export function validateOperationCommandHandlerInputValues(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): unknown {
  if (!operationInputValidationOperation(input).input) {
    return operationInputValidationRawInput(input);
  }

  const request = normalizeOperationInputValidationRequest(input);
  const projection = projectWorkerOperationInputValues(request);
  assertStorageBackedOperationInputValues(request, projection.recordWriteValues);

  return projection.operationInputValues;
}

function operationInputValidationOperation(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): EntityOperationSchema {
  return "envelope" in input ? input.envelope.schemaOperation : input.operation;
}

function operationInputValidationRawInput(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): unknown {
  return input.rawInput;
}

function normalizeOperationInputValidationRequest(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): NormalizedOperationInputValidationRequest {
  if ("envelope" in input) {
    return {
      context: input.context ?? "Operation input",
      entityName: input.envelope.operation.entityName,
      operation: input.envelope.schemaOperation,
      operationName: input.envelope.operation.operationName,
      rawInput: input.rawInput,
      schema: input.schema,
      storage: input.storage,
      canonicalKey: input.envelope.operation.canonicalKey,
    };
  }

  return {
    ...input,
    context: input.context ?? "Operation input",
    canonicalKey: operationCanonicalKey({
      entityName: input.entityName,
      operationName: input.operationName,
    }),
  };
}

function operationCanonicalKey(route: { entityName: string; operationName: string }) {
  return formatEntityOperationKey({
    entityKey: route.entityName,
    operationKey: route.operationName,
  });
}

function projectWorkerOperationInputValues(
  request: NormalizedOperationInputValidationRequest,
): OperationInputValueProjection {
  try {
    return projectOperationInputValues({
      canonicalOperationKey: request.canonicalKey,
      context: request.context,
      entity: operationInputValidationEntity(request),
      operation: request.operation,
      rawInput: request.rawInput,
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError(
      error instanceof Error ? error.message : "Operation input is invalid.",
    );
  }
}

function operationInputValidationEntity(
  request: NormalizedOperationInputValidationRequest,
): EntitySchema {
  const entity = request.schema.entities[request.entityName];

  if (entity) {
    return entity;
  }

  if (!request.operation.input) {
    return { label: request.entityName, fields: {} };
  }

  throw new BadRequestError(`Unknown entity "${request.entityName}".`);
}

function assertStorageBackedOperationInputValues(
  request: NormalizedOperationInputValidationRequest,
  recordWriteValues: RecordValues,
) {
  const inputContract = request.operation.input;

  if (!inputContract) {
    return;
  }

  const entity = request.schema.entities[request.entityName];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${request.entityName}".`);
  }

  for (const field of Object.values(inputContract.fields)) {
    if (!("field" in field) || !Object.hasOwn(recordWriteValues, field.field)) {
      continue;
    }

    const entityField = entity.fields[field.field];
    if (!entityField) {
      continue;
    }

    validateRecordValues(
      { [field.field]: recordWriteValues[field.field] },
      {
        ...entity,
        fields: {
          [field.field]: {
            ...entityField,
            required: field.required ?? false,
          },
        },
      },
      request.storage,
    );
  }
}
