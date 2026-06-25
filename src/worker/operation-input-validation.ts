import {
  formatEntityOperationKey,
  isSystemFieldName,
  type AppSchema,
  type EntityOperationInputFieldSchema,
  type EntityOperationSchema,
  type EntitySchema,
} from "@dpeek/formless-schema";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
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

type ValidatedOperationInputField =
  | { kind: "omit" }
  | { kind: "set"; fieldName: string; inputName: string; value: FieldValue };

export function validateOperationRecordWriteValues(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): Record<string, unknown> {
  const validated = validateOperationInputContract(input, (result) => result.fieldName);
  const request = normalizeOperationInputValidationRequest(input);

  if (request.operation.kind !== "update") {
    return validated;
  }

  return operationPatchRecordWriteValues(request);
}

export function validateOperationRecordPlanInputValues(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): RecordValues {
  return validateOperationInputContract(input, (result) => result.inputName);
}

export function validateOperationCommandHandlerInputValues(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
): unknown {
  if (!operationInputValidationOperation(input).input) {
    return operationInputValidationRawInput(input);
  }

  return validateOperationInputContract(input, (result) => result.inputName);
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

function operationPatchRecordWriteValues(
  request: NormalizedOperationInputValidationRequest,
): Record<string, unknown> {
  const rawValues = parseRecord(request.context, request.rawInput);
  const fields = request.operation.input?.fields ?? {};

  return Object.fromEntries(
    Object.entries(fields).flatMap(([inputName, field]) => {
      if (!("field" in field) || !Object.hasOwn(rawValues, inputName)) {
        return [];
      }

      return [[field.field, rawValues[inputName]]];
    }),
  );
}

function validateOperationInputContract(
  input: OperationInputValidationRequest | OperationEnvelopeInputValidationRequest,
  resultFieldName: (result: Extract<ValidatedOperationInputField, { kind: "set" }>) => string,
): RecordValues {
  const request = normalizeOperationInputValidationRequest(input);
  const inputContract = request.operation.input;

  if (!inputContract) {
    if (request.rawInput === undefined) {
      return {};
    }

    const values = parseRecord(request.context, request.rawInput);
    if (Object.keys(values).length > 0) {
      throw new BadRequestError(
        `Operation "${request.canonicalKey}" does not declare input fields.`,
      );
    }

    return {};
  }

  const entity = request.schema.entities[request.entityName];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${request.entityName}".`);
  }

  const values = parseRecord(request.context, request.rawInput);

  for (const fieldName of Object.keys(values)) {
    if (!inputContract.fields[fieldName]) {
      assertOperationInputDoesNotOwnSystemField(request.context, fieldName);
      throw new BadRequestError(`${request.context} includes undeclared field "${fieldName}".`);
    }
  }

  const validated: RecordValues = {};

  for (const [inputName, field] of Object.entries(inputContract.fields)) {
    const fieldWasProvided = Object.hasOwn(values, inputName);
    const result =
      "field" in field
        ? validateOperationEntityInputField(
            request.context,
            inputName,
            field,
            values[inputName],
            fieldWasProvided,
            entity,
            request.storage,
          )
        : validateOperationInlineInputField(
            request.context,
            inputName,
            field,
            values[inputName],
            fieldWasProvided,
          );

    if (result.kind === "set") {
      validated[resultFieldName(result)] = result.value;
    }
  }

  return validated;
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

function assertOperationInputDoesNotOwnSystemField(context: string, fieldName: string) {
  if (isSystemFieldName(fieldName)) {
    throw new BadRequestError(`${context} must not include system field "${fieldName}".`);
  }
}

function validateOperationEntityInputField(
  context: string,
  inputName: string,
  field: Extract<EntityOperationInputFieldSchema, { field: string }>,
  value: unknown,
  provided: boolean,
  entity: EntitySchema,
  storage: DurableObjectStorage,
): ValidatedOperationInputField {
  const entityField = entity.fields[field.field];

  if (!entityField) {
    throw new BadRequestError(`${context} field "${inputName}" is invalid.`);
  }

  const required = field.required ?? false;

  if (!provided) {
    if (required) {
      throw new BadRequestError(`${context} field "${inputName}" is required.`);
    }

    return { kind: "omit" };
  }

  const validated = validateRecordValues(
    { [field.field]: value },
    {
      ...entity,
      fields: {
        [field.field]: {
          ...entityField,
          required,
        },
      },
    },
    storage,
  );

  if (!Object.hasOwn(validated, field.field)) {
    return { kind: "omit" };
  }

  return {
    kind: "set",
    fieldName: field.field,
    inputName,
    value: validated[field.field],
  };
}

function validateOperationInlineInputField(
  context: string,
  fieldName: string,
  field: Exclude<EntityOperationInputFieldSchema, { field: string }>,
  value: unknown,
  provided: boolean,
): ValidatedOperationInputField {
  if (!provided) {
    if (field.required) {
      throw new BadRequestError(`${context} field "${fieldName}" is required.`);
    }

    return { kind: "omit" };
  }

  if (field.type === "text") {
    if (typeof value !== "string") {
      throw new BadRequestError(`${context} field "${fieldName}" must be text.`);
    }

    if (value.trim() === "") {
      if (field.required) {
        throw new BadRequestError(`${context} field "${fieldName}" cannot be empty.`);
      }

      return { kind: "omit" };
    }

    return { kind: "set", fieldName, inputName: fieldName, value };
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new BadRequestError(`${context} field "${fieldName}" must be a boolean.`);
    }

    return { kind: "set", fieldName, inputName: fieldName, value };
  }

  if (field.type === "date") {
    if (typeof value !== "string") {
      throw new BadRequestError(`${context} field "${fieldName}" must be a date.`);
    }

    if (value.trim() === "") {
      if (field.required) {
        throw new BadRequestError(`${context} field "${fieldName}" cannot be empty.`);
      }

      return { kind: "omit" };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestError(`${context} field "${fieldName}" must be a YYYY-MM-DD date.`);
    }

    return { kind: "set", fieldName, inputName: fieldName, value };
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new BadRequestError(`${context} field "${fieldName}" must be a finite number.`);
    }

    return { kind: "set", fieldName, inputName: fieldName, value };
  }

  if (field.type === "enum") {
    if (typeof value !== "string" || value === "" || !Object.hasOwn(field.values, value)) {
      throw new BadRequestError(`${context} field "${fieldName}" must be a known enum value.`);
    }

    return { kind: "set", fieldName, inputName: fieldName, value };
  }

  return assertUnsupportedOperationInputField(field);
}

function operationCanonicalKey(route: { entityName: string; operationName: string }) {
  return formatEntityOperationKey({
    entityKey: route.entityName,
    operationKey: route.operationName,
  });
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertUnsupportedOperationInputField(field: never): never {
  throw new Error(`Unsupported operation input field "${String(field)}".`);
}
