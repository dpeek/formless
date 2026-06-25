import {
  type AppSchema,
  type RecordPlanEntityOperationEffectSchema,
  type RecordPlanRecordIdExpressionSchema,
  type RecordPlanStepSchema,
  type RecordPlanValueExpressionSchema,
} from "@dpeek/formless-schema";
import type { FieldValue, RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { AppPackageResolver } from "../shared/app-packages.ts";
import { createRecordId } from "../shared/ids.ts";
import type {
  OperationCommandOutput,
  OperationInvocationEnvelope,
} from "../shared/operation-invocation.ts";
import { validateRecordWriteRequest } from "./authority-validation.ts";
import { BadRequestError } from "./errors.ts";
import { validateOperationRecordPlanInputValues } from "./operation-input-validation.ts";
import type {
  CreateRecordWriteRequest,
  DeleteRecordWriteRequest,
  PatchRecordWriteRequest,
} from "./record-write-requests.ts";
import { getStoredRecord, type OperationRecordWritePlan } from "./storage.ts";

export type RecordPlanInputValues = Partial<Record<string, FieldValue>>;

export type RecordPlanStepMaterialization = Pick<
  RecordPlanStepSchema,
  "name" | "kind" | "entity"
> & {
  recordId: string;
};

export type RecordPlanMaterialization = {
  plans: OperationRecordWritePlan[];
  steps: RecordPlanStepMaterialization[];
};

export type RecordPlanMaterializerInput = {
  effect: RecordPlanEntityOperationEffectSchema;
  envelope: OperationInvocationEnvelope;
  inputValues: RecordPlanInputValues;
  operationId: string;
  packageResolver?: AppPackageResolver;
  plannedRecords?: Iterable<StoredRecord>;
  schema: AppSchema;
  storage: DurableObjectStorage;
};

type RecordPlanPlanningState = {
  operationId: string;
  envelope: OperationInvocationEnvelope;
  inputValues: RecordPlanInputValues;
  packageResolver?: AppPackageResolver;
  plannedRecordsById: Map<string, StoredRecord>;
  schema: AppSchema;
  stepOutputs: Map<string, StoredRecord>;
  storage: DurableObjectStorage;
};

type RecordPlanStepPlan = {
  plan: OperationRecordWritePlan;
  step: RecordPlanStepMaterialization;
};

export function recordPlanCommandInput(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): RecordPlanInputValues {
  if (input.envelope.input.type !== "command") {
    throw new BadRequestError(
      `Operation "${input.envelope.operation.canonicalKey}" requires command input.`,
    );
  }

  return validateOperationRecordPlanInputValues({
    envelope: input.envelope,
    rawInput: input.envelope.input.input ?? {},
    schema: input.schema,
    storage: input.storage,
  });
}

export function materializeRecordPlan(
  input: RecordPlanMaterializerInput,
): RecordPlanMaterialization {
  const state: RecordPlanPlanningState = {
    operationId: input.operationId,
    envelope: input.envelope,
    inputValues: input.inputValues,
    packageResolver: input.packageResolver,
    plannedRecordsById: initialRecordPlanRecords(input.plannedRecords),
    schema: input.schema,
    stepOutputs: new Map(),
    storage: input.storage,
  };
  const steps: RecordPlanStepMaterialization[] = [];
  const plans: OperationRecordWritePlan[] = [];

  for (const step of input.effect.steps) {
    const materialized = recordPlanWritePlanForStep(step, state);
    plans.push(materialized.plan);
    steps.push(materialized.step);
  }

  return { plans, steps };
}

export function recordPlanOperationOutput(
  output: OperationCommandOutput,
  materialization: Pick<RecordPlanMaterialization, "steps">,
): OperationCommandOutput {
  if (output.changes.length !== materialization.steps.length) {
    throw new Error("Record plan output change count does not match step count.");
  }

  return {
    ...output,
    recordPlan: {
      steps: materialization.steps.map((step, index) => {
        const change = output.changes[index];

        if (!change) {
          throw new Error(`Record plan step "${step.name}" has no committed change.`);
        }

        return {
          name: step.name,
          kind: step.kind,
          entity: step.entity,
          recordId: change.recordId,
          changeId: String(change.seq),
        };
      }),
    },
  };
}

function initialRecordPlanRecords(records: Iterable<StoredRecord> | undefined) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records ?? []) {
    recordsById.set(record.id, record);
  }

  return recordsById;
}

function recordPlanWritePlanForStep(
  step: RecordPlanStepSchema,
  state: RecordPlanPlanningState,
): RecordPlanStepPlan {
  if (step.kind === "create") {
    const recordId =
      step.recordId === undefined
        ? createRecordId()
        : evaluateRecordPlanRecordIdExpression(step.recordId, state);

    assertRecordPlanCreateIdAvailable(step, recordId, state);

    const recordWrite = validateRecordPlanStepWrite(step, state, {
      writeId: recordPlanStepWriteId(state.operationId, step.name),
      entity: step.entity,
      kind: "create",
      values: evaluateRecordPlanValues(step.values, state),
    });

    if (recordWrite.kind !== "create") {
      throw new Error(`Record plan create step "${step.name}" did not produce create values.`);
    }

    const values = recordWrite.values;
    const record = {
      id: recordId,
      entity: step.entity,
      values,
      createdAt: state.envelope.receivedAt,
      updatedAt: state.envelope.receivedAt,
    } satisfies StoredRecord;

    recordPlanRecordWritten(step, record, state);

    return {
      plan: {
        kind: "create",
        entity: step.entity,
        id: recordId,
        values,
      },
      step: recordPlanStepMaterialization(step, recordId),
    };
  }

  if (step.kind === "patch") {
    const recordId = evaluateRecordPlanRecordIdExpression(step.recordId, state);
    const existingRecord = requireRecordPlanTargetRecord(step, recordId, state);
    const recordWrite = validateRecordPlanStepWrite(step, state, {
      writeId: recordPlanStepWriteId(state.operationId, step.name),
      entity: step.entity,
      kind: "patch",
      recordId,
      values: evaluateRecordPlanValues(step.values, state),
    });

    if (!("recordValues" in recordWrite)) {
      throw new Error(`Record plan patch step "${step.name}" did not produce record values.`);
    }

    const record = {
      ...existingRecord,
      values: recordWrite.recordValues,
      updatedAt: state.envelope.receivedAt,
    } satisfies StoredRecord;

    recordPlanRecordWritten(step, record, state);

    return {
      plan: {
        kind: "patch",
        record: (writtenRecords) =>
          requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
        values: recordWrite.recordValues,
      },
      step: recordPlanStepMaterialization(step, recordId),
    };
  }

  const recordId = evaluateRecordPlanRecordIdExpression(step.recordId, state);
  const existingRecord = requireRecordPlanTargetRecord(step, recordId, state);
  validateRecordPlanStepWrite(step, state, {
    writeId: recordPlanStepWriteId(state.operationId, step.name),
    entity: step.entity,
    kind: "delete",
    recordId,
  });

  const record = {
    ...existingRecord,
    updatedAt: state.envelope.receivedAt,
    deletedAt: state.envelope.receivedAt,
  } satisfies StoredRecord;

  recordPlanRecordWritten(step, record, state);

  return {
    plan: {
      kind: step.kind,
      record: (writtenRecords) =>
        requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
    },
    step: recordPlanStepMaterialization(step, recordId),
  };
}

function validateRecordPlanStepWrite(
  step: RecordPlanStepSchema,
  state: RecordPlanPlanningState,
  recordWrite: CreateRecordWriteRequest | PatchRecordWriteRequest | DeleteRecordWriteRequest,
) {
  const result = validateRecordWriteRequest(recordWrite, state.schema, state.storage, {
    additionalRecords: [...state.plannedRecordsById.values()],
    enforceGenericRecordWritePolicy: false,
    packageResolver: state.packageResolver,
  });

  if ("outcome" in result) {
    throw new BadRequestError(
      `Record plan step "${step.name}" conflicts with an existing write identity.`,
    );
  }

  return result.recordWrite;
}

function evaluateRecordPlanValues(
  values: Record<string, RecordPlanValueExpressionSchema>,
  state: RecordPlanPlanningState,
): RecordValues {
  const evaluated: RecordValues = {};

  for (const [fieldName, expression] of Object.entries(values)) {
    const result = evaluateRecordPlanValueExpression(expression, state);

    if (result.kind === "set") {
      evaluated[fieldName] = result.value;
    }
  }

  return evaluated;
}

function evaluateRecordPlanValueExpression(
  expression: RecordPlanValueExpressionSchema,
  state: RecordPlanPlanningState,
): { kind: "omit" } | { kind: "set"; value: FieldValue } {
  if (expression.kind === "reference") {
    const id = evaluateRecordPlanOptionalRecordIdExpression(expression.id, state);

    return id === undefined ? { kind: "omit" } : { kind: "set", value: id };
  }

  if (expression.kind === "input") {
    return Object.hasOwn(state.inputValues, expression.field)
      ? { kind: "set", value: state.inputValues[expression.field] as FieldValue }
      : { kind: "omit" };
  }

  if (expression.kind === "literal") {
    return { kind: "set", value: expression.value };
  }

  if (expression.kind === "generatedId") {
    return { kind: "set", value: createRecordPlanGeneratedId(expression.prefix) };
  }

  if (expression.kind === "generatedTimestamp") {
    return { kind: "set", value: state.envelope.receivedAt };
  }

  if (expression.kind === "actor") {
    return { kind: "set", value: state.envelope.actor.kind };
  }

  if (expression.kind === "source") {
    return evaluateRecordPlanSourceExpression(expression.field, state.envelope);
  }

  const stepRecord = requireRecordPlanStepOutput(expression.step, state);

  if (expression.output === "id") {
    return { kind: "set", value: stepRecord.id };
  }

  return Object.hasOwn(stepRecord.values, expression.field)
    ? { kind: "set", value: stepRecord.values[expression.field] }
    : { kind: "omit" };
}

function evaluateRecordPlanSourceExpression(
  field: "protocol" | "route" | "host" | "path",
  envelope: OperationInvocationEnvelope,
): { kind: "omit" } | { kind: "set"; value: FieldValue } {
  const value = envelope.source[field];

  return value === undefined ? { kind: "omit" } : { kind: "set", value };
}

function evaluateRecordPlanRecordIdExpression(
  expression: RecordPlanRecordIdExpressionSchema,
  state: RecordPlanPlanningState,
): string {
  const value = evaluateRecordPlanOptionalRecordIdExpression(expression, state);

  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("Record plan record id expression must resolve to a string.");
  }

  return value;
}

function evaluateRecordPlanOptionalRecordIdExpression(
  expression: RecordPlanRecordIdExpressionSchema,
  state: RecordPlanPlanningState,
): string | undefined {
  if (expression.kind === "input") {
    if (!Object.hasOwn(state.inputValues, expression.field)) {
      return undefined;
    }

    const value = state.inputValues[expression.field];

    if (typeof value !== "string") {
      throw new BadRequestError(
        `Record plan input field "${expression.field}" must resolve to a record id string.`,
      );
    }

    return value;
  }

  if (expression.kind === "literal") {
    if (typeof expression.value !== "string") {
      throw new BadRequestError("Record plan literal record id must be a string.");
    }

    return expression.value;
  }

  if (expression.kind === "generatedId") {
    return createRecordPlanGeneratedId(expression.prefix);
  }

  return requireRecordPlanStepOutput(expression.step, state).id;
}

function createRecordPlanGeneratedId(prefix: string | undefined) {
  if (prefix === undefined) {
    return createRecordId();
  }

  return `${prefix}_${crypto.randomUUID()}`;
}

function assertRecordPlanCreateIdAvailable(
  step: RecordPlanStepSchema,
  recordId: string,
  state: RecordPlanPlanningState,
) {
  if (state.plannedRecordsById.has(recordId) || getStoredRecord(state.storage, recordId)) {
    throw new BadRequestError(
      `Record plan step "${step.name}" creates duplicate record "${recordId}".`,
    );
  }
}

function requireRecordPlanTargetRecord(
  step: RecordPlanStepSchema,
  recordId: string,
  state: RecordPlanPlanningState,
): StoredRecord {
  const record = state.plannedRecordsById.get(recordId) ?? getStoredRecord(state.storage, recordId);

  if (!record) {
    throw new BadRequestError(`Unknown record "${recordId}".`);
  }

  if (record.entity !== step.entity) {
    throw new BadRequestError("Record plan step entity must match the stored record entity.");
  }

  if (record.deletedAt) {
    throw new BadRequestError(`Cannot write tombstoned record "${recordId}".`);
  }

  return record;
}

function requireRecordPlanMaterializedTargetRecord(
  recordId: string,
  writtenRecords: StoredRecord[],
  storage: DurableObjectStorage,
): StoredRecord {
  const record =
    [...writtenRecords].reverse().find((candidate) => candidate.id === recordId) ??
    getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(`Unknown record "${recordId}".`);
  }

  return record;
}

function requireRecordPlanStepOutput(
  stepName: string,
  state: RecordPlanPlanningState,
): StoredRecord {
  const record = state.stepOutputs.get(stepName);

  if (!record) {
    throw new BadRequestError(`Record plan references unknown step "${stepName}".`);
  }

  return record;
}

function recordPlanRecordWritten(
  step: RecordPlanStepSchema,
  record: StoredRecord,
  state: RecordPlanPlanningState,
) {
  state.plannedRecordsById.set(record.id, record);
  state.stepOutputs.set(step.name, record);
}

function recordPlanStepMaterialization(
  step: RecordPlanStepSchema,
  recordId: string,
): RecordPlanStepMaterialization {
  return {
    name: step.name,
    kind: step.kind,
    entity: step.entity,
    recordId,
  };
}

function recordPlanStepWriteId(operationId: string, stepName: string) {
  return `${operationId}:${stepName}`;
}
