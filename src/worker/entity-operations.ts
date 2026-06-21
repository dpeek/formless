import {
  formatEntityOperationKey,
  isEntityOperationWriteKind,
  isSystemFieldName,
  matchesQuery,
  type AppSchema,
  type EntityOperationActorKind,
  type EntityOperationInputFieldSchema,
  type EntityOperationKind,
  type EntityOperationSchema,
  type EntitySchema,
  type OperationHandlerEntityOperationEffectSchema,
  type RecordPlanEntityOperationEffectSchema,
  type RecordPlanRecordIdExpressionSchema,
  type RecordPlanStepSchema,
  type RecordPlanValueExpressionSchema,
  type SchemaOperationActorKind,
} from "@dpeek/formless-schema";
import type {
  AppStorageIdentity,
  InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { AppPackageResolver } from "../shared/app-packages.ts";
import { nowIsoString } from "../shared/clock.ts";
import { createRecordId } from "../shared/ids.ts";
import type { FieldValue, RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { PublicOperationProof } from "../shared/protocol.ts";
import type {
  OperationCommandOutput,
  OperationInvocationEnvelope,
  OperationInvocationIdempotency,
  OperationInvocationInput,
  OperationInvocationOutput,
  OperationInvocationResponse,
  OperationInvocationSource,
  OperationInvocationSourceProtocol,
} from "../shared/operation-invocation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import {
  executeOperationHandlerCreateTriggers,
  executeOperationHandlerOutcome,
} from "./operation-handlers.ts";
import { validateRecordWriteRequest, validateRecordValues } from "./authority-validation.ts";
import {
  committedWrite,
  createStoredRecordOutcome,
  deleteStoredRecordOutcome,
  getActiveRecordsByEntity,
  getOperationInvocationById,
  getStoredRecord,
  mapWriteOutcome,
  patchStoredRecordOutcome,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationOutcome,
  replayedWrite,
  type OperationRecordWritePlan,
  type RecordConstraintValidator,
  type WriteOutcome,
  writeRecordSetForCommandOperationOutcome,
} from "./storage.ts";
import type {
  CreateRecordWriteRequest,
  DeleteRecordWriteRequest,
  PatchRecordWriteRequest,
} from "./record-write-requests.ts";

type OperationStorageIdentity = AppStorageIdentity | InstanceControlPlaneStorageIdentity;

type OperationWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type EntityOperationRoute = {
  entityName: string;
  operationName: string;
  recordId?: string;
};

type OperationInvocationBuildBase = {
  actorKind?: SchemaOperationActorKind;
  identity: OperationStorageIdentity;
  receivedAt?: string;
  schema: AppSchema;
};

type OperationRequestSourceDefaults = {
  protocol: OperationInvocationSourceProtocol;
  route?: string;
};

const operationRoutePrefix = "/operations/";
const operationSourceProtocols = [
  "generated-ui",
  "protocol",
  "cli",
  "runner",
  "public",
  "automation",
] as const satisfies readonly OperationInvocationSourceProtocol[];

export function parseEntityOperationRoute(input: {
  method: string;
  path: string;
  searchParams: URLSearchParams;
}): EntityOperationRoute | undefined {
  if (input.method !== "GET" && input.method !== "POST") {
    return undefined;
  }

  if (!input.path.startsWith(operationRoutePrefix)) {
    return undefined;
  }

  const segments = input.path.slice(operationRoutePrefix.length).split("/");

  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new BadRequestError("Operation route must use /operations/:entity/:operation.");
  }

  let entityName: string;
  let operationName: string;

  try {
    entityName = decodeURIComponent(segments[0]);
    operationName = decodeURIComponent(segments[1]);
  } catch {
    throw new BadRequestError("Operation route segments must be valid URL path text.");
  }

  if (entityName.trim() === "" || operationName.trim() === "") {
    throw new BadRequestError("Operation route entity and operation must be non-empty.");
  }

  const recordId = input.searchParams.get("recordId") ?? undefined;

  return {
    entityName,
    operationName,
    ...(recordId === undefined ? {} : { recordId: parseNonEmptyString("recordId", recordId) }),
  };
}

export function buildProtocolOperationInvocationEnvelope(
  input: OperationInvocationBuildBase & {
    body: unknown;
    method: string;
    path: string;
    route: EntityOperationRoute;
  },
): OperationInvocationEnvelope {
  const { operation } = requireOperation(input.schema, input.route);
  const actorKind = input.actorKind ?? "owner";
  const body = parseOptionalRecord("Operation request", input.body);
  assertOperationMethod(input.method, operation.kind);

  const invocationInput = operationInvocationInput(operation, body, input.route.recordId);
  assertOperationInputIsDeclared(operation, body);
  const source = operationRequestSource(body.source, {
    protocol: sourceProtocolForActor(actorKind),
    route: input.path,
  });
  const canonicalKey = operationCanonicalKey(input.route);
  const idempotency = operationIdempotency(operation, canonicalKey, actorKind, body);
  const invocationId =
    idempotency.writeIdentity ??
    parseOptionalNonEmptyString("Operation request invocationId", body.invocationId) ??
    createOperationInvocationId();

  return operationInvocationEnvelope({
    actorKind,
    identity: input.identity,
    idempotency,
    input: invocationInput,
    invocationId,
    operation,
    receivedAt: input.receivedAt,
    route: input.route,
    schemaOperation: operation,
    source,
  });
}

export function buildPublicOperationInvocationEnvelope(
  input: OperationInvocationBuildBase & {
    entityName: string;
    host: string;
    idempotencyKey: string;
    operationName: string;
    path: string;
    proof?: PublicOperationProof;
    publicInput: unknown;
    siteBlockId?: string;
  },
): OperationInvocationEnvelope {
  const route = { entityName: input.entityName, operationName: input.operationName };
  const { operation } = requireOperation(input.schema, route);
  const idempotencyKey = parseNonEmptyString(
    "Public operation idempotencyKey",
    input.idempotencyKey,
  );

  return operationInvocationEnvelope({
    actorKind: "anonymous",
    identity: input.identity,
    idempotency: {
      required: operation.idempotency.required,
      key: idempotencyKey,
      source: "caller",
      writeIdentity: operationWriteIdentity(operationCanonicalKey(route), idempotencyKey),
    },
    input: publicOperationInvocationInput(operation, input.publicInput, input.proof),
    invocationId: operationWriteIdentity(operationCanonicalKey(route), idempotencyKey),
    operation,
    receivedAt: input.receivedAt,
    route,
    schemaOperation: operation,
    source: {
      protocol: "public",
      host: input.host,
      path: input.path,
      ...(input.siteBlockId === undefined ? {} : { siteBlockId: input.siteBlockId }),
    },
  });
}

function publicOperationInvocationInput(
  operation: EntityOperationSchema,
  publicInput: unknown,
  proof: PublicOperationProof | undefined,
): OperationInvocationInput {
  if (operation.kind === "create") {
    return {
      type: "create",
      values: publicInput,
    };
  }

  if (operation.kind === "command" && operation.effect?.type === "recordPlan") {
    return {
      type: "command",
      input: publicInput,
    };
  }

  return {
    type: "command",
    input: proof === undefined ? { input: publicInput } : { input: publicInput, proof },
  };
}

export function assertOperationInvocationAuthorized(envelope: OperationInvocationEnvelope) {
  const policy = envelope.operation.policy;
  const actorKind = envelope.actor.kind;
  const allowedActors = policy?.actors;
  const allowed =
    allowedActors === undefined ? actorKind !== "anonymous" : allowedActors.includes(actorKind);

  if (!allowed) {
    throw new BadRequestError(authorizationErrorMessage(envelope));
  }

  if (actorKind === "anonymous" && policy?.access === undefined) {
    throw new BadRequestError(authorizationErrorMessage(envelope));
  }
}

export function executeReadOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  const { envelope } = input;

  recordOperationInvocationAccepted(input.storage, envelope);

  try {
    const response = executeReadOperationInvocationResponse(input);

    recordOperationInvocationOutcome(input.storage, {
      envelope,
      output: response.output,
      status: response.status,
    });

    return response;
  } catch (error) {
    recordOperationInvocationFailed(input.storage, envelope, error);
    throw error;
  }
}

function executeReadOperationInvocationResponse(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  if (input.envelope.operation.kind === "list") {
    return executeListOperationInvocation(input);
  }

  if (input.envelope.operation.kind === "get") {
    return executeGetOperationInvocation(input);
  }

  throw new BadRequestError(
    `Operation "${input.envelope.operation.canonicalKey}" is not a read operation.`,
  );
}

function executeListOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  const { envelope } = input;
  const queryName =
    envelope.operation.output.type === "list" ? envelope.operation.output.query : undefined;
  const query = queryName === undefined ? undefined : input.schema.queries[queryName];

  if (!query) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" references unknown query.`,
    );
  }

  const records = getActiveRecordsByEntity(input.storage, query.entity).filter((record) =>
    matchesQuery(record, query.expression),
  );

  return {
    invocation: envelope,
    output: { type: "list", records },
    status: "accepted",
  };
}

function executeGetOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  const { envelope } = input;

  if (envelope.input.type !== "get") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires a record id.`,
    );
  }

  const record = getStoredRecord(input.storage, envelope.input.recordId);

  if (!record || record.deletedAt || record.entity !== envelope.operation.entityName) {
    throw new BadRequestError(`Unknown active record "${envelope.input.recordId}".`);
  }

  return {
    invocation: envelope,
    output: { type: "get", record },
    status: "accepted",
  };
}

export function executeWriteOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  packageResolver?: AppPackageResolver;
  schema: AppSchema;
  storage: DurableObjectStorage;
  validateConstraints?: RecordConstraintValidator;
  writes: OperationWriteNotifier;
}): OperationInvocationResponse {
  const outcome = input.writes.apply(() => {
    recordOperationInvocationAccepted(input.storage, input.envelope);

    try {
      const replay = operationInvocationReplayResponse(input.storage, input.envelope);

      if (replay) {
        recordOperationInvocationOutcome(input.storage, {
          envelope: input.envelope,
          output: replay.output,
          status: replay.status,
        });

        return replayedWrite(replay);
      }

      const writeOutcome = executeWriteOperationInvocationOutcome(
        input.storage,
        input.envelope,
        input.schema,
        input.packageResolver,
        input.validateConstraints,
      );
      const status = writeOutcome.kind === "replay" ? "replayed" : "committed";
      const response = operationInvocationResponseFromWriteOutput(
        input.envelope,
        writeOutcome.response,
        status,
      );

      recordOperationInvocationOutcome(input.storage, {
        envelope: input.envelope,
        output: response.output,
        status: response.status,
      });

      return writeOutcome.kind === "replay" ? replayedWrite(response) : committedWrite(response);
    } catch (error) {
      recordOperationInvocationFailed(input.storage, input.envelope, error);
      throw error;
    }
  });

  return outcome.response;
}

function executeWriteOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<OperationInvocationOutput> {
  if (!isEntityOperationWriteKind(envelope.operation.kind)) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" is not a write operation.`,
    );
  }

  if (envelope.operation.kind === "command") {
    return executeCommandOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      packageResolver,
      validateConstraints,
    );
  }

  if (envelope.operation.kind === "create") {
    return executeCreateOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      packageResolver,
      validateConstraints,
    );
  }

  if (envelope.operation.kind === "update") {
    return executeUpdateOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      packageResolver,
      validateConstraints,
    );
  }

  return executeDeleteOperationInvocationOutcome(storage, envelope, schema, packageResolver);
}

function executeCreateOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<OperationInvocationOutput> {
  const validateRecordConstraints = operationRecordConstraintValidator(
    storage,
    schema,
    validateConstraints,
  );
  const validatedRecordWrite = validateOperationRecordWriteRequest(
    operationCreateRecordWriteRequest(envelope, schema, storage),
    schema,
    storage,
    { packageResolver },
  );

  if ("outcome" in validatedRecordWrite) {
    return mapWriteOutcome(validatedRecordWrite.outcome, (response) =>
      recordWriteOperationOutput(envelope, response),
    );
  }

  const recordWrite = validatedRecordWrite.recordWrite;

  if (recordWrite.kind !== "create") {
    throw new Error(`Operation "${envelope.operation.canonicalKey}" did not produce a create.`);
  }

  return mapWriteOutcome(
    createStoredRecordOutcome(
      storage,
      recordWrite,
      (context) => {
        executeOperationHandlerCreateTriggers(
          context.storage,
          context.request,
          schema,
          context.createRecords,
        );
      },
      validateRecordConstraints,
      { allowStoredReplay: false, now: envelope.receivedAt },
    ),
    (response) => recordWriteOperationOutput(envelope, response),
  );
}

function executeUpdateOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<OperationInvocationOutput> {
  const validateRecordConstraints = operationRecordConstraintValidator(
    storage,
    schema,
    validateConstraints,
  );
  const validatedRecordWrite = validateOperationRecordWriteRequest(
    operationPatchRecordWriteRequest(envelope, schema, storage),
    schema,
    storage,
    { packageResolver },
  );

  if ("outcome" in validatedRecordWrite) {
    return mapWriteOutcome(validatedRecordWrite.outcome, (response) =>
      recordWriteOperationOutput(envelope, response),
    );
  }

  const recordWrite = validatedRecordWrite.recordWrite;

  if (!("recordValues" in recordWrite)) {
    throw new Error(`Operation "${envelope.operation.canonicalKey}" did not produce an update.`);
  }

  return mapWriteOutcome(
    patchStoredRecordOutcome(
      storage,
      recordWrite,
      recordWrite.recordValues,
      validateRecordConstraints,
      {
        allowStoredReplay: false,
        now: envelope.receivedAt,
      },
    ),
    (response) => recordWriteOperationOutput(envelope, response),
  );
}

function executeDeleteOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  packageResolver?: AppPackageResolver,
): WriteOutcome<OperationInvocationOutput> {
  const validatedRecordWrite = validateOperationRecordWriteRequest(
    operationDeleteRecordWriteRequest(envelope),
    schema,
    storage,
    { packageResolver },
  );

  if ("outcome" in validatedRecordWrite) {
    return mapWriteOutcome(validatedRecordWrite.outcome, (response) =>
      recordWriteOperationOutput(envelope, response),
    );
  }

  const recordWrite = validatedRecordWrite.recordWrite;

  if (recordWrite.kind !== "delete") {
    throw new Error(`Operation "${envelope.operation.canonicalKey}" did not produce a delete.`);
  }

  return mapWriteOutcome(
    deleteStoredRecordOutcome(storage, recordWrite, {
      allowStoredReplay: false,
      now: envelope.receivedAt,
    }),
    (response) => recordWriteOperationOutput(envelope, response),
  );
}

function validateOperationRecordWriteRequest(
  recordWrite: unknown,
  schema: AppSchema,
  storage: DurableObjectStorage,
  options: {
    packageResolver?: AppPackageResolver;
  } = {},
) {
  return validateRecordWriteRequest(recordWrite, schema, storage, {
    allowStoredReplay: false,
    enforceGenericRecordWritePolicy: false,
    packageResolver: options.packageResolver,
  });
}

function executeCommandOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<OperationInvocationOutput> {
  if (envelope.operation.effect?.type === "recordPlan") {
    return executeRecordPlanOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      envelope.operation.effect,
      packageResolver,
      validateConstraints,
    );
  }

  const commandEffect = operationHandlerEffect(envelope);

  if (commandEffect === undefined) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires an operation handler effect.`,
    );
  }

  const commandInput =
    envelope.actor.kind === "anonymous"
      ? publicCommandOperationPayload(envelope).input
      : privateCommandOperationInput(envelope, schema, storage);

  return mapWriteOutcome(
    executeOperationHandlerOutcome({
      storage,
      envelope,
      schema,
      effect: commandEffect,
      ...(commandInput === undefined ? {} : { input: commandInput }),
      ...(validateConstraints === undefined ? {} : { validateConstraints }),
    }),
    (response) => filterCommandOperationOutputForActor(response, envelope),
  );
}

function operationHandlerEffect(
  envelope: OperationInvocationEnvelope,
): OperationHandlerEntityOperationEffectSchema | undefined {
  const effect = envelope.operation.effect;

  return effect?.type === "operationHandler" ? effect : undefined;
}

function executeRecordPlanOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  effect: RecordPlanEntityOperationEffectSchema,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<OperationInvocationOutput> {
  const operationId = requiredWriteIdentity(envelope);
  const inputValues = recordPlanCommandInput(envelope, schema, storage);
  const plans = recordPlanWritePlans(
    storage,
    envelope,
    schema,
    effect,
    inputValues,
    operationId,
    packageResolver,
  );

  return mapWriteOutcome(
    writeRecordSetForCommandOperationOutcome(
      storage,
      operationId,
      plans,
      operationRecordConstraintValidator(storage, schema, validateConstraints),
      { allowStoredReplay: false, now: envelope.receivedAt },
    ),
    (response) =>
      filterCommandOperationOutputForActor(recordPlanOperationOutput(response, effect), envelope),
  );
}

function operationRecordConstraintValidator(
  storage: DurableObjectStorage,
  schema: AppSchema,
  validateConstraints: RecordConstraintValidator | undefined,
): RecordConstraintValidator {
  return (entity, values, options) => {
    validateConstraints?.(entity, values, options);
    assertUniqueConstraints(storage, schema, entity, values, options);
  };
}

type RecordPlanInputValues = Partial<Record<string, FieldValue>>;

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

function recordPlanCommandInput(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
): RecordPlanInputValues {
  if (envelope.input.type !== "command") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires command input.`,
    );
  }

  return validateOperationInputContractByInputName(
    envelope,
    envelope.input.input ?? {},
    schema,
    storage,
  );
}

function recordPlanWritePlans(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  effect: RecordPlanEntityOperationEffectSchema,
  inputValues: RecordPlanInputValues,
  operationId: string,
  packageResolver?: AppPackageResolver,
): OperationRecordWritePlan[] {
  const state: RecordPlanPlanningState = {
    operationId,
    envelope,
    inputValues,
    packageResolver,
    plannedRecordsById: new Map(),
    schema,
    stepOutputs: new Map(),
    storage,
  };

  return effect.steps.map((step) => recordPlanWritePlanForStep(step, state));
}

function recordPlanWritePlanForStep(
  step: RecordPlanStepSchema,
  state: RecordPlanPlanningState,
): OperationRecordWritePlan {
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
      kind: "create",
      entity: step.entity,
      id: recordId,
      values,
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
      kind: "patch",
      record: (writtenRecords) =>
        requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
      values: recordWrite.recordValues,
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
    kind: step.kind,
    record: (writtenRecords) =>
      requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
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

function validateOperationInputContractByInputName(
  envelope: OperationInvocationEnvelope,
  rawInput: unknown,
  schema: AppSchema,
  storage: DurableObjectStorage,
): RecordPlanInputValues {
  const context = "Operation input";
  const inputContract = envelope.schemaOperation.input;

  if (!inputContract) {
    if (rawInput === undefined) {
      return {};
    }

    const values = parseRecord(context, rawInput);
    if (Object.keys(values).length > 0) {
      throw new BadRequestError(
        `Operation "${envelope.operation.canonicalKey}" does not declare input fields.`,
      );
    }

    return {};
  }

  const entity = schema.entities[envelope.operation.entityName];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${envelope.operation.entityName}".`);
  }

  const values = parseRecord(context, rawInput);

  for (const fieldName of Object.keys(values)) {
    if (!inputContract.fields[fieldName]) {
      assertOperationInputDoesNotOwnSystemField(context, fieldName);
      throw new BadRequestError(`${context} includes undeclared field "${fieldName}".`);
    }
  }

  const validated: RecordPlanInputValues = {};

  for (const [inputName, field] of Object.entries(inputContract.fields)) {
    const fieldWasProvided = Object.hasOwn(values, inputName);
    const result =
      "field" in field
        ? validateOperationEntityInputField(
            context,
            inputName,
            field,
            values[inputName],
            fieldWasProvided,
            entity,
            storage,
          )
        : validateOperationInlineInputField(
            context,
            inputName,
            field,
            values[inputName],
            fieldWasProvided,
          );

    if (result.kind === "set") {
      validated[inputName] = result.value;
    }
  }

  return validated;
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

function recordPlanStepWriteId(operationId: string, stepName: string) {
  return `${operationId}:${stepName}`;
}

function recordPlanOperationOutput(
  output: OperationCommandOutput,
  effect: RecordPlanEntityOperationEffectSchema,
): OperationCommandOutput {
  if (output.changes.length !== effect.steps.length) {
    throw new Error("Record plan output change count does not match step count.");
  }

  return {
    ...output,
    recordPlan: {
      steps: effect.steps.map((step, index) => {
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

function privateCommandOperationInput(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
): unknown {
  if (envelope.input.type !== "command") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires command input.`,
    );
  }

  const commandInput = envelope.schemaOperation.input
    ? validateOperationInputContract(envelope, envelope.input.input ?? {}, schema, storage)
    : envelope.input.input;

  return commandInputWithRecordId(envelope, commandInput);
}

function commandInputWithRecordId(envelope: OperationInvocationEnvelope, input: unknown): unknown {
  if (envelope.input.type !== "command" || envelope.input.recordId === undefined) {
    return input;
  }

  if (input === undefined) {
    return { recordId: envelope.input.recordId };
  }

  const values = parseRecord("Operation command input", input);

  if (Object.hasOwn(values, "recordId")) {
    return values;
  }

  return { ...values, recordId: envelope.input.recordId };
}

function publicCommandOperationPayload(envelope: OperationInvocationEnvelope): {
  input: RecordValues;
  proof: PublicOperationProof;
} {
  if (envelope.input.type !== "command") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires command input.`,
    );
  }

  const value = parseRecord("Public operation command input", envelope.input.input);
  const input = parseRecord("Public operation input", value.input) as RecordValues;
  const proof = parsePublicOperationProof(value.proof);

  return { input, proof };
}

function parsePublicOperationProof(value: unknown): PublicOperationProof {
  const proof = parseRecord("Public operation proof", value);

  if (proof.kind !== "turnstile" || typeof proof.token !== "string") {
    throw new BadRequestError("Public operation proof must include a Turnstile token.");
  }

  return {
    kind: "turnstile",
    token: proof.token,
    ...(isRecord(proof.verification)
      ? { verification: proof.verification as PublicOperationProof["verification"] }
      : {}),
  };
}

type RecordWriteMaterializerOutput = {
  record: StoredRecord;
  changes: OperationCommandOutput["changes"];
  cursor: number;
};

function operationInvocationReplayResponse(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
): OperationInvocationResponse | undefined {
  const replay = getOperationInvocationById(storage, envelope.invocationId);

  if (
    replay?.output === undefined ||
    (replay.status !== "committed" && replay.status !== "replayed")
  ) {
    return undefined;
  }

  assertStoredOperationOutputMatchesEnvelope(envelope, replay.output);

  return {
    invocation: envelope,
    output: replay.output,
    status: "replayed",
  };
}

function assertStoredOperationOutputMatchesEnvelope(
  envelope: OperationInvocationEnvelope,
  output: OperationInvocationOutput,
) {
  if (output.type !== envelope.operation.kind) {
    throw new Error(
      `Stored operation "${envelope.operation.canonicalKey}" output type "${output.type}" does not match operation kind "${envelope.operation.kind}".`,
    );
  }
}

function operationInvocationResponseFromWriteOutput(
  envelope: OperationInvocationEnvelope,
  output: OperationInvocationOutput,
  status: OperationInvocationResponse["status"],
): OperationInvocationResponse {
  return {
    invocation: envelope,
    output,
    status,
  };
}

function filterCommandOperationOutputForActor(
  output: OperationCommandOutput,
  envelope: OperationInvocationEnvelope,
): OperationCommandOutput {
  const allowedFields = envelope.operation.policy?.responseFields?.[envelope.actor.kind];

  if (allowedFields === undefined) {
    return output;
  }

  const allowedFieldSet = new Set(allowedFields);

  return {
    ...output,
    changes: output.changes.map((change) => ({
      ...change,
      payload: {
        ...change.payload,
        values: Object.fromEntries(
          Object.entries(change.payload.values).filter(([fieldName]) =>
            allowedFieldSet.has(fieldName),
          ),
        ),
      },
    })),
  };
}

function recordWriteOperationOutput(
  envelope: OperationInvocationEnvelope,
  output: RecordWriteMaterializerOutput,
): OperationInvocationOutput {
  if (envelope.operation.kind === "create") {
    return {
      affectedChangeIds: affectedChangeIds(output.changes),
      changes: output.changes,
      cursor: output.cursor,
      record: output.record,
      type: "create",
    };
  }

  if (envelope.operation.kind === "update") {
    return {
      affectedChangeIds: affectedChangeIds(output.changes),
      changes: output.changes,
      cursor: output.cursor,
      record: output.record,
      type: "update",
    };
  }

  if (envelope.operation.kind === "delete") {
    return {
      affectedChangeIds: affectedChangeIds(output.changes),
      changes: output.changes,
      cursor: output.cursor,
      recordId: output.record.id,
      type: "delete",
    };
  }

  throw new Error(
    `Operation "${envelope.operation.canonicalKey}" is not a record write operation.`,
  );
}

function affectedChangeIds(changes: OperationCommandOutput["changes"]) {
  return changes.map((change) => String(change.seq));
}

function operationCreateRecordWriteRequest(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
) {
  const writeId = requiredWriteIdentity(envelope);

  if (envelope.operation.kind === "create" && envelope.input.type === "create") {
    return {
      writeId,
      entity: envelope.operation.entityName,
      kind: "create",
      values: validateOperationInputContract(envelope, envelope.input.values, schema, storage),
    } satisfies Omit<CreateRecordWriteRequest, "values"> & { values: unknown };
  }

  throw new BadRequestError(
    `Operation "${envelope.operation.canonicalKey}" cannot materialize a create.`,
  );
}

function operationPatchRecordWriteRequest(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
) {
  const writeId = requiredWriteIdentity(envelope);

  if (envelope.operation.kind === "update" && envelope.input.type === "update") {
    return {
      writeId,
      entity: envelope.operation.entityName,
      kind: "patch",
      recordId: envelope.input.recordId,
      values: operationPatchValues(envelope, schema, storage),
    } satisfies Omit<PatchRecordWriteRequest, "values"> & { values: unknown };
  }

  throw new BadRequestError(
    `Operation "${envelope.operation.canonicalKey}" cannot materialize an update.`,
  );
}

function operationDeleteRecordWriteRequest(envelope: OperationInvocationEnvelope) {
  const writeId = requiredWriteIdentity(envelope);

  if (envelope.operation.kind === "delete" && envelope.input.type === "delete") {
    return {
      writeId,
      entity: envelope.operation.entityName,
      kind: "delete",
      recordId: envelope.input.recordId,
    } satisfies DeleteRecordWriteRequest;
  }

  throw new BadRequestError(
    `Operation "${envelope.operation.canonicalKey}" cannot materialize a delete.`,
  );
}

function operationPatchValues(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
): Record<string, unknown> {
  validateOperationInputContract(
    envelope,
    envelope.input.type === "update" ? envelope.input.values : {},
    schema,
    storage,
  );

  if (envelope.input.type !== "update") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires update input.`,
    );
  }

  const rawValues = parseRecord("Operation input", envelope.input.values);
  const fields = envelope.schemaOperation.input?.fields ?? {};

  return Object.fromEntries(
    Object.entries(fields).flatMap(([inputName, field]) => {
      if (!("field" in field) || !Object.hasOwn(rawValues, inputName)) {
        return [];
      }

      return [[field.field, rawValues[inputName]]];
    }),
  );
}

export function validateEntityOperationInputContract(input: {
  context?: string;
  entityName: string;
  mapToInputNames?: boolean;
  operation: EntityOperationSchema;
  operationName: string;
  rawInput: unknown;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): RecordValues {
  const context = input.context ?? "Operation input";
  const inputContract = input.operation.input;
  const canonicalKey = operationCanonicalKey({
    entityName: input.entityName,
    operationName: input.operationName,
  });

  if (!inputContract) {
    if (input.rawInput === undefined) {
      return {};
    }

    const values = parseRecord(context, input.rawInput);
    if (Object.keys(values).length > 0) {
      throw new BadRequestError(`Operation "${canonicalKey}" does not declare input fields.`);
    }

    return {};
  }

  const entity = input.schema.entities[input.entityName];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${input.entityName}".`);
  }

  const values = parseRecord(context, input.rawInput);

  for (const fieldName of Object.keys(values)) {
    if (!inputContract.fields[fieldName]) {
      assertOperationInputDoesNotOwnSystemField(context, fieldName);
      throw new BadRequestError(`${context} includes undeclared field "${fieldName}".`);
    }
  }

  const mappedValues: RecordValues = {};

  for (const [inputName, field] of Object.entries(inputContract.fields)) {
    const fieldWasProvided = Object.hasOwn(values, inputName);
    const result =
      "field" in field
        ? validateOperationEntityInputField(
            context,
            inputName,
            field,
            values[inputName],
            fieldWasProvided,
            entity,
            input.storage,
          )
        : validateOperationInlineInputField(
            context,
            inputName,
            field,
            values[inputName],
            fieldWasProvided,
          );

    if (result.kind === "set") {
      mappedValues[input.mapToInputNames ? inputName : result.fieldName] = result.value;
    }
  }

  return mappedValues;
}

function assertOperationInputDoesNotOwnSystemField(context: string, fieldName: string) {
  if (isSystemFieldName(fieldName)) {
    throw new BadRequestError(`${context} must not include system field "${fieldName}".`);
  }
}

function validateOperationInputContract(
  envelope: OperationInvocationEnvelope,
  rawInput: unknown,
  schema: AppSchema,
  storage: DurableObjectStorage,
): RecordValues {
  return validateEntityOperationInputContract({
    entityName: envelope.operation.entityName,
    operation: envelope.schemaOperation,
    operationName: envelope.operation.operationName,
    rawInput,
    schema,
    storage,
  });
}

function validateOperationEntityInputField(
  context: string,
  inputName: string,
  field: Extract<EntityOperationInputFieldSchema, { field: string }>,
  value: unknown,
  provided: boolean,
  entity: EntitySchema,
  storage: DurableObjectStorage,
): { kind: "omit" } | { kind: "set"; fieldName: string; value: RecordValues[string] } {
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
    value: validated[field.field],
  };
}

function validateOperationInlineInputField(
  context: string,
  fieldName: string,
  field: Exclude<EntityOperationInputFieldSchema, { field: string }>,
  value: unknown,
  provided: boolean,
): { kind: "omit" } | { kind: "set"; fieldName: string; value: RecordValues[string] } {
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

    return { kind: "set", fieldName, value };
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new BadRequestError(`${context} field "${fieldName}" must be a boolean.`);
    }

    return { kind: "set", fieldName, value };
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

    return { kind: "set", fieldName, value };
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new BadRequestError(`${context} field "${fieldName}" must be a finite number.`);
    }

    return { kind: "set", fieldName, value };
  }

  if (field.type === "enum") {
    if (typeof value !== "string" || value === "" || !Object.hasOwn(field.values, value)) {
      throw new BadRequestError(`${context} field "${fieldName}" must be a known enum value.`);
    }

    return { kind: "set", fieldName, value };
  }

  return assertUnsupportedOperationInputField(field);
}

function assertUnsupportedOperationInputField(field: never): never {
  throw new Error(`Unsupported operation input field "${String(field)}".`);
}

function operationInvocationEnvelope(input: {
  actorKind: EntityOperationActorKind;
  identity: OperationStorageIdentity;
  idempotency: OperationInvocationIdempotency;
  input: OperationInvocationInput;
  invocationId: string;
  operation: EntityOperationSchema;
  receivedAt?: string;
  route: {
    entityName: string;
    operationName: string;
  };
  schemaOperation: EntityOperationSchema;
  source: OperationInvocationSource;
}): OperationInvocationEnvelope {
  return {
    invocationId: input.invocationId,
    appStorageIdentity: input.identity,
    actor: { kind: input.actorKind },
    source: input.source,
    input: input.input,
    idempotency: input.idempotency,
    operation: {
      entityName: input.route.entityName,
      operationName: input.route.operationName,
      canonicalKey: operationCanonicalKey(input.route),
      kind: input.operation.kind,
      scope: input.operation.scope,
      ...(input.operation.effect === undefined ? {} : { effect: input.operation.effect }),
      output: input.operation.output,
      ...(input.operation.policy === undefined ? {} : { policy: input.operation.policy }),
    },
    receivedAt: input.receivedAt ?? nowIsoString(),
    schemaOperation: input.schemaOperation,
  };
}

function requireOperation(
  schema: AppSchema,
  route: {
    entityName: string;
    operationName: string;
  },
): { entity: EntitySchema; operation: EntityOperationSchema } {
  const entity = schema.entities[route.entityName];

  if (!entity) {
    throw new BadRequestError(`Unknown entity "${route.entityName}".`);
  }

  const operation = entity.operations?.[route.operationName];

  if (!operation) {
    throw new BadRequestError(
      `Unknown operation "${route.operationName}" for entity "${route.entityName}".`,
    );
  }

  return { entity, operation };
}

function operationInvocationInput(
  operation: EntityOperationSchema,
  body: Record<string, unknown>,
  routeRecordId: string | undefined,
): OperationInvocationInput {
  const kind = operation.kind;

  if (kind === "list") {
    return { type: "list" };
  }

  if (kind === "get") {
    return {
      type: "get",
      recordId: parseNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId),
    };
  }

  if (kind === "create") {
    return { type: "create", values: body.input };
  }

  if (kind === "update") {
    return {
      type: "update",
      recordId: parseNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId),
      values: body.input,
    };
  }

  if (kind === "delete") {
    return {
      type: "delete",
      recordId: parseNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId),
    };
  }

  const recordId =
    operation.scope === "record"
      ? parseOptionalNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId)
      : undefined;

  return {
    type: "command",
    ...(recordId === undefined ? {} : { recordId }),
    ...(body.input === undefined ? {} : { input: body.input }),
  };
}

function assertOperationInputIsDeclared(
  operation: EntityOperationSchema,
  body: Record<string, unknown>,
) {
  if (body.input === undefined || operation.kind === "create" || operation.kind === "update") {
    return;
  }

  if (operation.kind === "command") {
    return;
  }

  if (!operation.input) {
    throw new BadRequestError(
      `Operation "${operation.kind}" request must not include input fields.`,
    );
  }
}

function operationIdempotency(
  operation: EntityOperationSchema,
  canonicalKey: string,
  actorKind: EntityOperationActorKind,
  body: Record<string, unknown>,
): OperationInvocationIdempotency {
  if (!operation.idempotency.required) {
    return { required: false };
  }

  const idempotencyKey = parseOptionalNonEmptyString(
    "Operation request idempotencyKey",
    body.idempotencyKey,
  );

  if (idempotencyKey !== undefined) {
    return operationIdempotencyFromKey(canonicalKey, idempotencyKey, "caller");
  }

  const runtimeWriteId = parseOptionalNonEmptyString(
    "Operation request runtimeWriteId",
    body.runtimeWriteId,
  );

  if (
    runtimeWriteId !== undefined &&
    operation.idempotency.source === "runtime" &&
    isTrustedRuntimeOperationActor(actorKind)
  ) {
    return operationIdempotencyFromKey(canonicalKey, runtimeWriteId, "runtime");
  }

  throw new BadRequestError(
    `Operation "${operation.kind}" requires an idempotency key for write execution.`,
  );
}

function operationIdempotencyFromKey(
  canonicalKey: string,
  key: string,
  source: "caller" | "runtime",
): OperationInvocationIdempotency {
  return {
    required: true,
    key,
    source,
    writeIdentity: operationWriteIdentity(canonicalKey, key),
  };
}

function operationRequestSource(
  value: unknown,
  defaults: OperationRequestSourceDefaults,
): OperationInvocationSource {
  const fallback = {
    protocol: defaults.protocol,
    ...(defaults.route === undefined ? {} : { route: defaults.route }),
  } satisfies OperationInvocationSource;

  if (value === undefined) {
    return fallback;
  }

  const source = parseRecord("Operation request source", value);
  const protocol =
    source.protocol === undefined
      ? defaults.protocol
      : parseOperationSourceProtocol("Operation request source protocol", source.protocol);
  const route = parseOptionalNonEmptyString("Operation request source route", source.route);
  const surface = parseOptionalNonEmptyString("Operation request source surface", source.surface);
  const host = parseOptionalNonEmptyString("Operation request source host", source.host);
  const path = parseOptionalNonEmptyString("Operation request source path", source.path);
  const siteBlockId = parseOptionalNonEmptyString(
    "Operation request source siteBlockId",
    source.siteBlockId,
  );

  return {
    protocol,
    ...(route === undefined
      ? fallback.route === undefined
        ? {}
        : { route: fallback.route }
      : { route }),
    ...(surface === undefined ? {} : { surface }),
    ...(host === undefined ? {} : { host }),
    ...(path === undefined ? {} : { path }),
    ...(siteBlockId === undefined ? {} : { siteBlockId }),
  };
}

function parseOperationSourceProtocol(
  context: string,
  value: unknown,
): OperationInvocationSourceProtocol {
  if (!operationSourceProtocols.includes(value as OperationInvocationSourceProtocol)) {
    throw new BadRequestError(`${context} must be a supported operation source protocol.`);
  }

  return value as OperationInvocationSourceProtocol;
}

function sourceProtocolForActor(
  actorKind: EntityOperationActorKind,
): OperationInvocationSourceProtocol {
  if (actorKind === "cliDeployer") {
    return "cli";
  }

  if (actorKind === "runner") {
    return "runner";
  }

  return "protocol";
}

function assertOperationMethod(method: string, kind: EntityOperationKind) {
  if (method === "GET" && isEntityOperationWriteKind(kind)) {
    throw new BadRequestError("Write and command operations require POST.");
  }
}

function requiredWriteIdentity(envelope: OperationInvocationEnvelope) {
  if (!envelope.idempotency.writeIdentity) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires an idempotency key.`,
    );
  }

  return envelope.idempotency.writeIdentity;
}

function authorizationErrorMessage(envelope: OperationInvocationEnvelope) {
  return `Operation "${envelope.operation.canonicalKey}" is not exposed to actor "${envelope.actor.kind}".`;
}

function operationCanonicalKey(route: { entityName: string; operationName: string }) {
  return formatEntityOperationKey({
    entityKey: route.entityName,
    operationKey: route.operationName,
  });
}

function operationWriteIdentity(canonicalKey: string, idempotencyKey: string) {
  return `operation:${canonicalKey}:${idempotencyKey}`;
}

function createOperationInvocationId() {
  return `operation:${crypto.randomUUID()}`;
}

function isTrustedRuntimeOperationActor(actorKind: EntityOperationActorKind) {
  return actorKind === "cliDeployer" || actorKind === "runner";
}

function parseOptionalRecord(context: string, value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  return parseRecord(context, value);
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseNonEmptyString(context, value);
}
