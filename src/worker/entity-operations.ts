import {
  formatEntityOperationKey,
  isEntityOperationWriteKind,
  matchesQuery,
  type AppSchema,
  type EntityOperationActorKind,
  type EntityOperationKind,
  type EntityOperationSchema,
  type EntitySchema,
  type OperationHandlerEntityOperationEffectSchema,
  type RecordPlanEntityOperationEffectSchema,
  type SchemaOperationActorKind,
} from "@dpeek/formless-schema";
import type {
  AppStorageIdentity,
  InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { AppPackageResolver } from "../shared/app-packages.ts";
import { nowIsoString } from "../shared/clock.ts";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
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
import { validateRecordWriteRequest } from "./authority-validation.ts";
import {
  validateOperationInvocationCommandHandlerInputValues,
  validateOperationInvocationRecordWriteValues,
} from "./operation-input-validation.ts";
import {
  createStoredRecordOutcome,
  deleteStoredRecordOutcome,
  getActiveRecordsByEntity,
  getStoredRecord,
  mapWriteOutcome,
  patchStoredRecordOutcome,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationOutcome,
  type RecordConstraintValidator,
  type WriteOutcome,
  writeRecordSetForCommandOperationOutcome,
} from "./storage.ts";
import {
  executeWriteOperationInvocationLifecycle,
  type OperationInvocationLifecycleWriteNotifier,
} from "./operation-invocation-lifecycle.ts";
import type {
  CreateRecordWriteRequest,
  DeleteRecordWriteRequest,
  PatchRecordWriteRequest,
} from "./record-write-requests.ts";
import {
  materializeRecordPlan,
  recordPlanCommandInput,
  recordPlanOperationOutput,
} from "./record-plan-materializer.ts";

type OperationStorageIdentity = AppStorageIdentity | InstanceControlPlaneStorageIdentity;

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
  writes: OperationInvocationLifecycleWriteNotifier;
}): OperationInvocationResponse {
  return executeWriteOperationInvocationLifecycle({
    envelope: input.envelope,
    execute: () =>
      executeWriteOperationInvocationOutcome(
        input.storage,
        input.envelope,
        input.schema,
        input.packageResolver,
        input.validateConstraints,
      ),
    storage: input.storage,
    writes: input.writes,
  });
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
  const inputValues = recordPlanCommandInput({ envelope, schema, storage });
  const materialization = materializeRecordPlan({
    storage,
    envelope,
    schema,
    effect,
    inputValues,
    operationId,
    packageResolver,
    plannedRecords: [],
  });

  return mapWriteOutcome(
    writeRecordSetForCommandOperationOutcome(
      storage,
      operationId,
      materialization.plans,
      operationRecordConstraintValidator(storage, schema, validateConstraints),
      { allowStoredReplay: false, now: envelope.receivedAt },
    ),
    (response) =>
      filterCommandOperationOutputForActor(
        recordPlanOperationOutput(response, materialization),
        envelope,
      ),
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

  const commandInput = validateOperationInvocationCommandHandlerInputValues({
    envelope,
    rawInput: envelope.input.input ?? {},
    schema,
    storage,
  });

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

function filterCommandOperationOutputForActor(
  output: OperationCommandOutput,
  envelope: OperationInvocationEnvelope,
): OperationCommandOutput {
  const allowedFields = envelope.operation.policy?.responseFields?.[envelope.actor.kind];

  if (allowedFields === undefined) {
    if (envelope.actor.kind === "anonymous" && envelope.source.protocol === "public") {
      return { ...output, changes: [] };
    }

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
      values: validateOperationInvocationRecordWriteValues({
        envelope,
        rawInput: envelope.input.values,
        schema,
        storage,
      }),
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
      values: validateOperationInvocationRecordWriteValues({
        envelope,
        rawInput: envelope.input.values,
        schema,
        storage,
      }),
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
