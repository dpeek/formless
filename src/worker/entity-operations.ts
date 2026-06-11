import {
  formatEntityOperationKey,
  isEntityOperationWriteKind,
  matchesQuery,
  type AppSchema,
  type EntityOperationActorKind,
  type EntityOperationInputFieldSchema,
  type EntityOperationKind,
  type EntityOperationSchema,
  type EntitySchema,
  type SchemaActionActorKind,
} from "@dpeek/formless-schema";
import type {
  AppStorageIdentity,
  InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { nowIsoString } from "../shared/clock.ts";
import type {
  ActionResponse,
  CreateMutation,
  DeleteMutation,
  MutationResponse,
  PatchMutation,
  PublicActionExecutionEnvelope,
  PublicActionProof,
  RecordValues,
} from "../shared/protocol.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationIdempotency,
  OperationInvocationInput,
  OperationInvocationResponse,
  OperationInvocationSource,
  OperationInvocationSourceProtocol,
} from "../shared/operation-invocation.ts";
import {
  executeCreateAfterCreateHooks,
  executeEntityActionOutcome,
  executePublicEntityActionOutcome,
  filterEntityActionResponseForActor,
  validateEntityActionRequest,
} from "./actions.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import { validateMutationRequest, validateRecordValues } from "./authority-validation.ts";
import {
  committedWrite,
  createStoredRecordOutcome,
  deleteStoredRecordOutcome,
  getActiveRecordsByEntity,
  getStoredRecord,
  mapWriteOutcome,
  patchStoredRecordOutcome,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationOutcome,
  replayedWrite,
  type WriteOutcome,
} from "./storage.ts";

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
  actorKind?: SchemaActionActorKind;
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

  const invocationInput = operationInvocationInput(operation.kind, body, input.route.recordId);
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
    proof?: PublicActionProof;
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
  proof: PublicActionProof | undefined,
): OperationInvocationInput {
  if (operation.kind === "create") {
    return {
      type: "create",
      values: publicInput,
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
    if (envelope.operation.kind === "list") {
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
      const response = {
        invocation: envelope,
        output: { type: "list", records },
        status: "accepted",
      } satisfies OperationInvocationResponse;

      recordOperationInvocationOutcome(input.storage, {
        envelope,
        output: response.output,
        status: response.status,
      });

      return response;
    }

    if (envelope.operation.kind === "get") {
      if (envelope.input.type !== "get") {
        throw new BadRequestError(
          `Operation "${envelope.operation.canonicalKey}" requires a record id.`,
        );
      }

      const record = getStoredRecord(input.storage, envelope.input.recordId);

      if (!record || record.deletedAt || record.entity !== envelope.operation.entityName) {
        throw new BadRequestError(`Unknown active record "${envelope.input.recordId}".`);
      }

      const response = {
        invocation: envelope,
        output: { type: "get", record },
        status: "accepted",
      } satisfies OperationInvocationResponse;

      recordOperationInvocationOutcome(input.storage, {
        envelope,
        output: response.output,
        status: response.status,
      });

      return response;
    }

    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" is not a read operation.`,
    );
  } catch (error) {
    recordOperationInvocationFailed(input.storage, envelope, error);
    throw error;
  }
}

export function executeWriteOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
  writes: OperationWriteNotifier;
}): OperationInvocationResponse {
  const outcome = input.writes.apply(() => {
    recordOperationInvocationAccepted(input.storage, input.envelope);

    try {
      const writeOutcome = executeWriteOperationInvocationOutcome(
        input.storage,
        input.envelope,
        input.schema,
      );
      const response = operationInvocationResponseFromWriteOutcome(input.envelope, writeOutcome);

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
): WriteOutcome<MutationResponse | ActionResponse> {
  if (!isEntityOperationWriteKind(envelope.operation.kind)) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" is not a write operation.`,
    );
  }

  if (envelope.operation.kind === "command") {
    return executeCommandOperationInvocationOutcome(storage, envelope, schema);
  }

  return executeMutationOperationInvocationOutcome(storage, envelope, schema);
}

function executeMutationOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
): WriteOutcome<MutationResponse> {
  const validatedMutation = validateMutationRequest(
    operationMutationRequest(envelope, schema, storage),
    schema,
    storage,
  );

  if ("outcome" in validatedMutation) {
    return validatedMutation.outcome;
  }

  const mutation = validatedMutation.mutation;

  if (mutation.op === "create") {
    return createStoredRecordOutcome(
      storage,
      mutation,
      (context) => {
        executeCreateAfterCreateHooks(
          context.storage,
          context.mutation,
          schema,
          context.createRecords,
        );
      },
      (entity, values, options) => {
        assertUniqueConstraints(storage, schema, entity, values, options);
      },
    );
  }

  if (mutation.op === "delete") {
    return deleteStoredRecordOutcome(storage, mutation);
  }

  return patchStoredRecordOutcome(
    storage,
    mutation,
    "recordValues" in mutation ? mutation.recordValues : undefined,
    (entity, values, options) => {
      assertUniqueConstraints(storage, schema, entity, values, options);
    },
  );
}

function executeCommandOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
): WriteOutcome<ActionResponse> {
  if (envelope.operation.effect?.type !== "runActionKind" || !envelope.operation.effect.action) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires a schema action effect.`,
    );
  }

  if (envelope.actor.kind === "anonymous") {
    return executePublicCommandOperationInvocationOutcome(storage, envelope, schema);
  }

  const actorKind = envelope.actor.kind as SchemaActionActorKind;
  const commandInput = privateCommandOperationInput(envelope, schema, storage);
  const request = validateEntityActionRequest(
    {
      actionId: requiredWriteIdentity(envelope),
      entity: envelope.operation.entityName,
      action: envelope.operation.effect.action,
      ...(commandInput === undefined ? {} : { input: commandInput }),
    },
    schema,
    { actorKind },
  );

  return mapWriteOutcome(executeEntityActionOutcome(storage, request, schema), (response) =>
    filterEntityActionResponseForActor(response, schema, request, actorKind),
  );
}

function executePublicCommandOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
): WriteOutcome<ActionResponse> {
  if (envelope.operation.effect?.type !== "runActionKind" || !envelope.operation.effect.action) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires a schema action effect.`,
    );
  }

  const payload = publicCommandOperationPayload(envelope);
  const actionId = requiredWriteIdentity(envelope);
  const idempotencyKey = parseNonEmptyString(
    "Public operation idempotency key",
    envelope.idempotency.key,
  );
  const publicEnvelope: PublicActionExecutionEnvelope = {
    actionId,
    actor: { mode: "anonymous" },
    proof: payload.proof,
    source: publicOperationActionSource(envelope, envelope.operation.effect.action),
    input: payload.input,
    idempotencyKey,
    receivedAt: envelope.receivedAt,
  };

  return executePublicEntityActionOutcome(
    storage,
    {
      actionId,
      entity: envelope.operation.entityName,
      action: envelope.operation.effect.action,
      input: payload.input,
      envelope: publicEnvelope,
    },
    schema,
  );
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

  if (!envelope.schemaOperation.input) {
    return envelope.input.input;
  }

  return validateOperationInputContract(envelope, envelope.input.input ?? {}, schema, storage);
}

function publicCommandOperationPayload(envelope: OperationInvocationEnvelope): {
  input: RecordValues;
  proof: PublicActionProof;
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

function parsePublicOperationProof(value: unknown): PublicActionProof {
  const proof = parseRecord("Public operation proof", value);

  if (proof.kind !== "turnstile" || typeof proof.token !== "string") {
    throw new BadRequestError("Public operation proof must include a Turnstile token.");
  }

  return {
    kind: "turnstile",
    token: proof.token,
    ...(isRecord(proof.verification)
      ? { verification: proof.verification as PublicActionProof["verification"] }
      : {}),
  };
}

function publicOperationActionSource(
  envelope: OperationInvocationEnvelope,
  actionName: string,
): PublicActionExecutionEnvelope["source"] {
  if (envelope.appStorageIdentity.kind === "instanceControlPlane") {
    throw new BadRequestError("Public operations are only available for app storage.");
  }

  const host = parseNonEmptyString("Public operation source host", envelope.source.host);
  const path = parseNonEmptyString("Public operation source path", envelope.source.path);

  if (envelope.appStorageIdentity.kind === "schemaKey") {
    return {
      actionName,
      host,
      path,
      target: {
        kind: "schemaKey",
        packageAppKey: envelope.appStorageIdentity.packageAppKey,
        sourceSchemaKey: envelope.appStorageIdentity.sourceSchemaKey,
        apiRoutePrefix: envelope.appStorageIdentity.apiRoutePrefix,
      },
      ...(envelope.source.siteBlockId === undefined
        ? {}
        : { siteBlockId: envelope.source.siteBlockId }),
    };
  }

  return {
    actionName,
    host,
    path,
    target: {
      kind: "appInstall",
      installId: envelope.appStorageIdentity.installId,
      packageAppKey: envelope.appStorageIdentity.packageAppKey,
      sourceSchemaKey: envelope.appStorageIdentity.sourceSchemaKey,
      apiRoutePrefix: envelope.appStorageIdentity.apiRoutePrefix,
    },
    ...(envelope.source.siteBlockId === undefined
      ? {}
      : { siteBlockId: envelope.source.siteBlockId }),
  };
}

function operationInvocationResponseFromWriteOutcome(
  envelope: OperationInvocationEnvelope,
  outcome: WriteOutcome<MutationResponse | ActionResponse>,
): OperationInvocationResponse {
  return {
    invocation: envelope,
    output: operationOutput(envelope, outcome.response),
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

function operationOutput(
  envelope: OperationInvocationEnvelope,
  response: MutationResponse | ActionResponse,
): OperationInvocationResponse["output"] {
  if ("record" in response) {
    if (envelope.operation.kind === "delete") {
      return {
        affectedChangeIds: affectedChangeIds(response.changes),
        changes: response.changes,
        cursor: response.cursor,
        recordId: response.record.id,
        type: "delete",
      };
    }

    return {
      affectedChangeIds: affectedChangeIds(response.changes),
      changes: response.changes,
      cursor: response.cursor,
      record: response.record,
      type: envelope.operation.kind === "update" ? "update" : "create",
    };
  }

  return {
    affectedChangeIds: affectedChangeIds(response.changes),
    changes: response.changes,
    cursor: response.cursor,
    response,
    type: "command",
  };
}

function affectedChangeIds(changes: MutationResponse["changes"]) {
  return changes.map((change) => String(change.seq));
}

function operationMutationRequest(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
) {
  const mutationId = requiredWriteIdentity(envelope);

  if (envelope.operation.kind === "create" && envelope.input.type === "create") {
    return {
      mutationId,
      entity: envelope.operation.entityName,
      op: "create",
      values: validateOperationInputContract(envelope, envelope.input.values, schema, storage),
    } satisfies Omit<CreateMutation, "values"> & { values: unknown };
  }

  if (envelope.operation.kind === "update" && envelope.input.type === "update") {
    return {
      mutationId,
      entity: envelope.operation.entityName,
      op: "patch",
      recordId: envelope.input.recordId,
      values: operationPatchValues(envelope, schema, storage),
    } satisfies Omit<PatchMutation, "values"> & { values: unknown };
  }

  if (envelope.operation.kind === "delete" && envelope.input.type === "delete") {
    return {
      mutationId,
      entity: envelope.operation.entityName,
      op: "delete",
      recordId: envelope.input.recordId,
    } satisfies DeleteMutation;
  }

  throw new BadRequestError(
    `Operation "${envelope.operation.canonicalKey}" cannot materialize records.`,
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
      mappedValues[result.fieldName] = result.value;
    }
  }

  return mappedValues;
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
  kind: EntityOperationKind,
  body: Record<string, unknown>,
  routeRecordId: string | undefined,
): OperationInvocationInput {
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

  return body.input === undefined ? { type: "command" } : { type: "command", input: body.input };
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
