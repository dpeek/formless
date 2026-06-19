import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type {
  ActionRequest,
  ActionRequestInput,
  ActionResponse,
  CreateTreeChildActionInput,
  CreateSelectedJoinRecordActionInput,
  RemoveSelectedJoinRecordsActionInput,
  RemoveTreePlacementActionInput,
  CreateMutation,
  PublicActionExecutionEnvelope,
  TransitionStateActionInput,
} from "../shared/protocol.ts";
import type {
  AfterCreateHookSchema,
  AppSchema,
  EntityActionCapabilities,
  EntityActionKind,
  EntityActionSchemaForKind,
  EntityActionSchema,
  EntitySchema,
  ManyToManyRelationshipSchema,
  SchemaActionActorKind,
  StateMachineTransitionEventFieldMappingsSchema,
  ToManyRelationshipSchema,
} from "@dpeek/formless-schema";
import {
  fieldCreateDefaultValue,
  getEntityActionKindCapabilities,
  isEntityActionExposedToActor,
  matchesQuery,
} from "@dpeek/formless-schema";
import { validateRecordValues } from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import {
  createRecordSetForActionOutcome,
  createRecordsForActionOutcome,
  type ActionRecordCreatePlan,
  type ActionRecordWritePlan,
  type CreateMutationCausedRecordWriter,
  getActionResponseById,
  getActiveRecordsByEntity,
  getStoredRecord,
  type RecordConstraintValidator,
  replayedWrite,
  tombstoneRecordsForActionOutcome,
  type WriteOutcome,
  writeRecordSetForActionOutcome,
} from "./storage.ts";
import { nowIsoString } from "../shared/clock.ts";

type EntityActionRequestInputValidationContext<TAction extends EntityActionSchema> = {
  actionName: string;
  entityName: string;
  entity: EntitySchema;
  action: TAction;
  value: unknown;
};

type EntityActionExecutionContext<TAction extends EntityActionSchema> = {
  storage: DurableObjectStorage;
  request: ActionRequest;
  schema: AppSchema;
  action: TAction;
  receivedAt?: string;
  validateConstraints?: RecordConstraintValidator;
};

export type PublicEntityActionRequest = {
  actionId: string;
  entity: string;
  action: string;
  input: RecordValues;
  envelope: PublicActionExecutionEnvelope;
};

type PublicEntityActionExecutionContext<TAction extends EntityActionSchema> = {
  storage: DurableObjectStorage;
  request: PublicEntityActionRequest;
  schema: AppSchema;
  action: TAction;
};

export type EntityCommandEffectInvocation = {
  actionId: string;
  actorKind: SchemaActionActorKind;
  entity: string;
  action: string;
  kind: EntityActionKind;
  input?: unknown;
  receivedAt?: string;
  validateConstraints?: RecordConstraintValidator;
};

type EntityActionCreateAfterCreateHookContext<TAction extends EntityActionSchema> = {
  storage: DurableObjectStorage;
  mutation: CreateMutation;
  schema: AppSchema;
  hook: AfterCreateHookSchema;
  action: TAction;
  createRecords: CreateMutationCausedRecordWriter;
};

type EntityActionKindRuntimeModule<TAction extends EntityActionSchema = EntityActionSchema> = {
  kind: TAction["kind"];
  capabilities: EntityActionCapabilities;
  validateInput: (
    context: EntityActionRequestInputValidationContext<TAction>,
  ) => ActionRequestInput | undefined;
  execute: (context: EntityActionExecutionContext<TAction>) => WriteOutcome<ActionResponse>;
  executePublic?: (
    context: PublicEntityActionExecutionContext<TAction>,
  ) => WriteOutcome<ActionResponse>;
  executeCreateAfterCreateHook: (
    context: EntityActionCreateAfterCreateHookContext<TAction>,
  ) => void;
};

type EntityActionKindRuntimeModuleMap = {
  [Kind in EntityActionKind]: EntityActionKindRuntimeModule<EntityActionSchemaForKind<Kind>>;
};

const entityActionKindRuntimeModules = {
  "clear-completed": {
    kind: "clear-completed",
    capabilities: getEntityActionKindCapabilities("clear-completed"),
    validateInput: validateClearCompletedActionInput,
    execute: executeClearCompletedAction,
    executeCreateAfterCreateHook: rejectCreateAfterCreateHook,
  },
  "create-missing-join-records": {
    kind: "create-missing-join-records",
    capabilities: getEntityActionKindCapabilities("create-missing-join-records"),
    validateInput: validateNoActionInput,
    execute: executeCreateMissingJoinRecordsAction,
    executeCreateAfterCreateHook: executeCreateMissingJoinRecordsAfterCreateHook,
  },
  "create-selected-join-record": {
    kind: "create-selected-join-record",
    capabilities: getEntityActionKindCapabilities("create-selected-join-record"),
    validateInput: validateCreateSelectedJoinRecordActionInput,
    execute: executeCreateSelectedJoinRecordAction,
    executeCreateAfterCreateHook: rejectCreateAfterCreateHook,
  },
  "remove-selected-join-records": {
    kind: "remove-selected-join-records",
    capabilities: getEntityActionKindCapabilities("remove-selected-join-records"),
    validateInput: validateRemoveSelectedJoinRecordsActionInput,
    execute: executeRemoveSelectedJoinRecordsAction,
    executeCreateAfterCreateHook: rejectCreateAfterCreateHook,
  },
  "create-tree-child": {
    kind: "create-tree-child",
    capabilities: getEntityActionKindCapabilities("create-tree-child"),
    validateInput: validateCreateTreeChildActionInput,
    execute: executeCreateTreeChildAction,
    executeCreateAfterCreateHook: rejectCreateAfterCreateHook,
  },
  "remove-tree-placement": {
    kind: "remove-tree-placement",
    capabilities: getEntityActionKindCapabilities("remove-tree-placement"),
    validateInput: validateRemoveTreePlacementActionInput,
    execute: executeRemoveTreePlacementAction,
    executeCreateAfterCreateHook: rejectCreateAfterCreateHook,
  },
  subscribe: {
    kind: "subscribe",
    capabilities: getEntityActionKindCapabilities("subscribe"),
    validateInput: validateNoActionInput,
    execute: executeSubscribeAction,
    executePublic: executeSubscribePublicAction,
    executeCreateAfterCreateHook: rejectCreateAfterCreateHook,
  },
  "transition-state": {
    kind: "transition-state",
    capabilities: getEntityActionKindCapabilities("transition-state"),
    validateInput: validateTransitionStateActionInput,
    execute: executeTransitionStateAction,
    executeCreateAfterCreateHook: rejectCreateAfterCreateHook,
  },
} satisfies EntityActionKindRuntimeModuleMap;

export function executeEntityAction(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
): ActionResponse {
  return executeEntityActionOutcome(storage, request, schema).response;
}

export function validateEntityActionRequest(
  value: unknown,
  schema: AppSchema,
  options: { actorKind?: SchemaActionActorKind } = {},
): ActionRequest {
  if (!isRecord(value)) {
    throw new BadRequestError("Action request must be an object.");
  }

  if (typeof value.actionId !== "string" || value.actionId.trim() === "") {
    throw new BadRequestError("Action request must include a non-empty actionId.");
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new BadRequestError("Action request must include an entity.");
  }

  const entity = schema.entities[value.entity];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${value.entity}".`);
  }

  if (typeof value.action !== "string" || value.action.trim() === "") {
    throw new BadRequestError("Action request must include an action.");
  }

  const action = entity.actions?.[value.action];
  if (!action) {
    throw new BadRequestError(`Unknown action "${value.action}" for entity "${value.entity}".`);
  }

  const actorKind = options.actorKind ?? "owner";

  if (!isEntityActionExposedToActor(action, actorKind)) {
    throw new BadRequestError(`Action "${value.action}" is not exposed to actor "${actorKind}".`);
  }

  const input = getEntityActionKindRuntimeModule(action).validateInput({
    actionName: value.action,
    entityName: value.entity,
    entity,
    action,
    value: value.input,
  });

  return {
    actionId: value.actionId,
    entity: value.entity,
    action: value.action,
    actorKind,
    ...(input === undefined ? {} : { input }),
  };
}

export function filterEntityActionResponseForActor(
  response: ActionResponse,
  schema: AppSchema,
  request: ActionRequest,
  actorKind: SchemaActionActorKind,
): ActionResponse {
  const action = schema.entities[request.entity]?.actions?.[request.action];

  if (!action) {
    throw new Error(`Unsupported action "${request.action}".`);
  }

  if (!isEntityActionExposedToActor(action, actorKind)) {
    throw new BadRequestError(`Action "${request.action}" is not exposed to actor "${actorKind}".`);
  }

  const allowedFields = action.exposure?.responseFields?.[actorKind];
  if (allowedFields === undefined) {
    return response;
  }

  const allowedFieldSet = new Set(allowedFields);

  return {
    ...response,
    changes: response.changes.map((change) => ({
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

export function executeEntityActionOutcome(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
): WriteOutcome<ActionResponse> {
  const replay = getActionResponseById(storage, request.actionId);
  if (replay) {
    return replayedWrite(replay);
  }

  const action = schema.entities[request.entity]?.actions?.[request.action];

  if (!action) {
    throw new Error(`Unsupported action "${request.action}".`);
  }

  return executeEntityActionRuntimeOutcome(storage, request, schema, action);
}

export function executeEntityCommandEffectOutcome(
  storage: DurableObjectStorage,
  invocation: EntityCommandEffectInvocation,
  schema: AppSchema,
): WriteOutcome<ActionResponse> {
  const replay = getActionResponseById(storage, invocation.actionId);
  if (replay) {
    return replayedWrite(replay);
  }

  const { action, request } = validateEntityCommandEffectInvocation(invocation, schema);

  return executeEntityActionRuntimeOutcome(storage, request, schema, action, {
    ...(invocation.receivedAt === undefined ? {} : { receivedAt: invocation.receivedAt }),
    ...(invocation.validateConstraints === undefined
      ? {}
      : { validateConstraints: invocation.validateConstraints }),
  });
}

export function executePublicEntityActionOutcome(
  storage: DurableObjectStorage,
  request: PublicEntityActionRequest,
  schema: AppSchema,
): WriteOutcome<ActionResponse> {
  const action = schema.entities[request.entity]?.actions?.[request.action];

  if (!action) {
    throw new Error(`Unsupported action "${request.action}".`);
  }

  const actionModule = getEntityActionKindRuntimeModule(action);

  if (!actionModule.capabilities.publicExecution || !actionModule.executePublic) {
    throw new BadRequestError(`Action "${request.action}" is not available for public execution.`);
  }

  return actionModule.executePublic({ storage, request, schema, action });
}

function executeEntityActionRuntimeOutcome<TAction extends EntityActionSchema>(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: TAction,
  options: {
    receivedAt?: string;
    validateConstraints?: RecordConstraintValidator;
  } = {},
): WriteOutcome<ActionResponse> {
  return getEntityActionKindRuntimeModule(action).execute({
    storage,
    request,
    schema,
    action,
    ...(options.receivedAt === undefined ? {} : { receivedAt: options.receivedAt }),
    ...(options.validateConstraints === undefined
      ? {}
      : { validateConstraints: options.validateConstraints }),
  });
}

function validateEntityCommandEffectInvocation(
  invocation: EntityCommandEffectInvocation,
  schema: AppSchema,
): { action: EntityActionSchema; request: ActionRequest } {
  const entity = schema.entities[invocation.entity];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${invocation.entity}".`);
  }

  const action = entity.actions?.[invocation.action];
  if (!action) {
    throw new BadRequestError(
      `Unknown action "${invocation.action}" for entity "${invocation.entity}".`,
    );
  }

  if (action.kind !== invocation.kind) {
    throw new BadRequestError(
      `Action "${invocation.action}" does not implement command effect "${invocation.kind}".`,
    );
  }

  const input = getEntityActionKindRuntimeModule(action).validateInput({
    actionName: invocation.action,
    entityName: invocation.entity,
    entity,
    action,
    value: invocation.input,
  });

  return {
    action,
    request: {
      actionId: invocation.actionId,
      entity: invocation.entity,
      action: invocation.action,
      actorKind: invocation.actorKind,
      ...(input === undefined ? {} : { input }),
    },
  };
}

export function executeCreateAfterCreateHooks(
  storage: DurableObjectStorage,
  mutation: CreateMutation,
  schema: AppSchema,
  createRecords: CreateMutationCausedRecordWriter,
) {
  const hooks = schema.entities[mutation.entity]?.mutations.create.afterCreate ?? [];

  for (const hook of hooks) {
    executeCreateAfterCreateHook(storage, mutation, schema, hook, createRecords);
  }
}

function executeCreateAfterCreateHook(
  storage: DurableObjectStorage,
  mutation: CreateMutation,
  schema: AppSchema,
  hook: AfterCreateHookSchema,
  createRecords: CreateMutationCausedRecordWriter,
) {
  const action = schema.entities[hook.entity]?.actions?.[hook.action];

  if (!action) {
    throw new Error(
      `Create hook "${mutation.entity}.${mutation.mutationId}" references unsupported action "${hook.entity}.${hook.action}".`,
    );
  }

  const actionModule = getEntityActionKindRuntimeModule(action);

  actionModule.executeCreateAfterCreateHook({
    storage,
    mutation,
    schema,
    hook,
    action,
    createRecords,
  });
}

function rejectCreateAfterCreateHook<TAction extends EntityActionSchema>(
  context: EntityActionCreateAfterCreateHookContext<TAction>,
): never {
  throw new Error(
    `Create hook "${context.mutation.entity}.${context.mutation.mutationId}" references unsupported action "${context.hook.entity}.${context.hook.action}".`,
  );
}

function executeClearCompletedAction(
  context: EntityActionExecutionContext<Extract<EntityActionSchema, { kind: "clear-completed" }>>,
) {
  const records = selectActionTargetRecords(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return executeActionEffect(
    context.storage,
    context.request,
    records,
    actionMaterializationOptions(context.receivedAt),
  );
}

function executeCreateMissingJoinRecordsAction(
  context: EntityActionExecutionContext<
    Extract<EntityActionSchema, { kind: "create-missing-join-records" }>
  >,
) {
  const values = selectMissingJoinRecordValues(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return createRecordsForActionOutcome(
    context.storage,
    context.request.actionId,
    context.request.entity,
    context.request.action,
    values,
    entityActionRecordConstraintValidator(context),
    actionMaterializationOptions(context.receivedAt),
  );
}

function executeTransitionStateAction(
  context: EntityActionExecutionContext<Extract<EntityActionSchema, { kind: "transition-state" }>>,
) {
  const plans = selectTransitionStateWritePlans(
    context.storage,
    context.request,
    context.schema,
    context.action,
    actionTransitionOptions(context.receivedAt),
  );

  return writeRecordSetForActionOutcome(
    context.storage,
    context.request.actionId,
    context.request.entity,
    context.request.action,
    plans,
    entityActionRecordConstraintValidator(context),
    actionMaterializationOptions(context.receivedAt),
  );
}

function executeCreateSelectedJoinRecordAction(
  context: EntityActionExecutionContext<
    Extract<EntityActionSchema, { kind: "create-selected-join-record" }>
  >,
) {
  const values = selectSelectedJoinRecordValues(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return createRecordsForActionOutcome(
    context.storage,
    context.request.actionId,
    context.request.entity,
    context.request.action,
    [values],
    entityActionRecordConstraintValidator(context),
    actionMaterializationOptions(context.receivedAt),
  );
}

function executeRemoveSelectedJoinRecordsAction(
  context: EntityActionExecutionContext<
    Extract<EntityActionSchema, { kind: "remove-selected-join-records" }>
  >,
) {
  const records = selectSelectedJoinRecords(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return executeActionEffect(
    context.storage,
    context.request,
    records,
    actionMaterializationOptions(context.receivedAt),
  );
}

function executeCreateTreeChildAction(
  context: EntityActionExecutionContext<Extract<EntityActionSchema, { kind: "create-tree-child" }>>,
) {
  const plans = selectTreeChildCreatePlans(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return createRecordSetForActionOutcome(
    context.storage,
    context.request.actionId,
    context.request.entity,
    context.request.action,
    plans,
    entityActionRecordConstraintValidator(context),
    actionMaterializationOptions(context.receivedAt),
  );
}

function executeRemoveTreePlacementAction(
  context: EntityActionExecutionContext<
    Extract<EntityActionSchema, { kind: "remove-tree-placement" }>
  >,
) {
  const record = selectTreePlacementRecord(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return executeActionEffect(
    context.storage,
    context.request,
    [record],
    actionMaterializationOptions(context.receivedAt),
  );
}

function executeSubscribeAction(
  _context: EntityActionExecutionContext<Extract<EntityActionSchema, { kind: "subscribe" }>>,
): never {
  throw new BadRequestError('Action kind "subscribe" must use public operation execution.');
}

function executeSubscribePublicAction(
  context: PublicEntityActionExecutionContext<Extract<EntityActionSchema, { kind: "subscribe" }>>,
) {
  const contactEntity = requireSubscribeEntity(context.schema, "contact");
  const emailAddressEntity = requireSubscribeEntity(context.schema, "email-address");
  const audienceEntity = requireSubscribeEntity(context.schema, "audience");
  const subscriptionEntity = requireSubscribeEntity(context.schema, "subscription");
  const email = parseSubscribeEmail(context.request.input.email);
  const existingEmailAddress = findActiveRecordByField(
    context.storage,
    "email-address",
    "normalizedAddress",
    email.normalizedAddress,
  );
  const existingContact = findExistingEmailContact(context.storage, existingEmailAddress);
  const existingAudience = findActiveRecordByField(
    context.storage,
    "audience",
    "key",
    defaultAudienceKey,
  );
  const existingSubscription =
    existingEmailAddress && existingAudience
      ? findActiveSubscription(context.storage, existingEmailAddress.id, existingAudience.id)
      : undefined;
  const sourceValues = subscribeSourceValues(context.request.envelope);
  const plans: ActionRecordWritePlan[] = [];
  const contactRecordIndex = existingContact
    ? undefined
    : pushPlan(plans, {
        kind: "create",
        entity: "contact",
        values: () =>
          validateRecordValues({ label: email.normalizedAddress }, contactEntity, context.storage),
      });
  const emailAddressRecordIndex = existingEmailAddress
    ? undefined
    : pushPlan(plans, {
        kind: "create",
        entity: "email-address",
        values: (writtenRecords) =>
          validateRecordValues(
            {
              contact:
                existingContact?.id ?? requireWrittenRecord(writtenRecords, contactRecordIndex).id,
              address: email.address,
              normalizedAddress: email.normalizedAddress,
            },
            emailAddressEntity,
            context.storage,
          ),
      });

  if (existingEmailAddress && !existingContact) {
    plans.push({
      kind: "patch",
      record: existingEmailAddress,
      values: (writtenRecords) =>
        validateRecordValues(
          {
            ...existingEmailAddress.values,
            contact: requireWrittenRecord(writtenRecords, contactRecordIndex).id,
          },
          emailAddressEntity,
          context.storage,
        ),
    });
  }

  const audienceRecordIndex = existingAudience
    ? undefined
    : pushPlan(plans, {
        kind: "create",
        entity: "audience",
        values: () =>
          validateRecordValues(
            { key: defaultAudienceKey, label: "Default audience" },
            audienceEntity,
            context.storage,
          ),
      });
  const subscriptionValues = (writtenRecords: StoredRecord[]) =>
    validateRecordValues(
      {
        ...existingSubscription?.values,
        emailAddress:
          existingEmailAddress?.id ??
          requireWrittenRecord(writtenRecords, emailAddressRecordIndex).id,
        audience:
          existingAudience?.id ?? requireWrittenRecord(writtenRecords, audienceRecordIndex).id,
        status: "subscribed",
        consentedAt: context.request.envelope.receivedAt,
        ...sourceValues,
      },
      subscriptionEntity,
      context.storage,
    );

  if (existingSubscription) {
    plans.push({
      kind: "patch",
      record: existingSubscription,
      values: subscriptionValues,
    });
  } else {
    plans.push({
      kind: "create",
      entity: "subscription",
      values: subscriptionValues,
    });
  }

  return writeRecordSetForActionOutcome(
    context.storage,
    context.request.actionId,
    context.request.entity,
    context.request.action,
    plans,
    (entity, recordValues, options) => {
      assertUniqueConstraints(context.storage, context.schema, entity, recordValues, options);
    },
    { now: context.request.envelope.receivedAt },
  );
}

function entityActionRecordConstraintValidator(
  context: EntityActionExecutionContext<EntityActionSchema>,
): RecordConstraintValidator {
  return (entity, recordValues, options) => {
    context.validateConstraints?.(entity, recordValues, options);
    assertUniqueConstraints(context.storage, context.schema, entity, recordValues, options);
  };
}

function actionMaterializationOptions(receivedAt: string | undefined): { now?: string } {
  return receivedAt === undefined ? {} : { now: receivedAt };
}

function actionTransitionOptions(receivedAt: string | undefined): { receivedAt?: string } {
  return receivedAt === undefined ? {} : { receivedAt };
}

const defaultAudienceKey = "default";

function requireSubscribeEntity(schema: AppSchema, entityName: string): EntitySchema {
  const entity = schema.entities[entityName];

  if (!entity) {
    throw new Error(`Subscribe action requires entity "${entityName}".`);
  }

  return entity;
}

function parseSubscribeEmail(value: RecordValues[string] | undefined) {
  if (typeof value !== "string") {
    throw new BadRequestError('Subscribe action public input "email" must be text.');
  }

  const address = value.trim();
  const normalizedAddress = address.toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedAddress)) {
    throw new BadRequestError('Subscribe action public input "email" must be an email address.');
  }

  return { address, normalizedAddress };
}

function findExistingEmailContact(
  storage: DurableObjectStorage,
  emailAddress: StoredRecord | undefined,
) {
  const contactId = emailAddress?.values.contact;

  if (typeof contactId !== "string") {
    return undefined;
  }

  const contact = getStoredRecord(storage, contactId);

  return contact?.entity === "contact" && !contact.deletedAt ? contact : undefined;
}

function findActiveSubscription(
  storage: DurableObjectStorage,
  emailAddressId: string,
  audienceId: string,
) {
  return getActiveRecordsByEntity(storage, "subscription").find(
    (record) =>
      record.values.emailAddress === emailAddressId && record.values.audience === audienceId,
  );
}

function findActiveRecordByField(
  storage: DurableObjectStorage,
  entity: string,
  field: string,
  value: RecordValues[string],
) {
  return getActiveRecordsByEntity(storage, entity).find((record) => record.values[field] === value);
}

function subscribeSourceValues(envelope: PublicActionExecutionEnvelope): RecordValues {
  const values: RecordValues = {
    sourceKind: "publicOperation",
    sourceTargetKind: envelope.source.target.kind,
    sourcePackageAppKey: envelope.source.target.packageAppKey,
    sourceSchemaKey: envelope.source.target.sourceSchemaKey,
    sourceApiRoutePrefix: envelope.source.target.apiRoutePrefix,
    sourceOperationKey: envelope.source.operationKey,
    sourceHost: envelope.source.host,
    sourcePath: envelope.source.path,
  };

  if (envelope.source.target.kind === "appInstall") {
    values.sourceInstallId = envelope.source.target.installId;
  }

  if (envelope.source.siteBlockId !== undefined) {
    values.sourceSiteBlockId = envelope.source.siteBlockId;
  }

  return values;
}

function pushPlan(plans: ActionRecordWritePlan[], plan: ActionRecordWritePlan) {
  plans.push(plan);

  return plans.length - 1;
}

function requireWrittenRecord(records: StoredRecord[], index: number | undefined) {
  const record = index === undefined ? undefined : records[index];

  if (!record) {
    throw new Error("Subscribe action could not resolve a planned record.");
  }

  return record;
}

function executeCreateMissingJoinRecordsAfterCreateHook(
  context: EntityActionCreateAfterCreateHookContext<
    Extract<EntityActionSchema, { kind: "create-missing-join-records" }>
  >,
) {
  const request: ActionRequest = {
    actionId: context.mutation.mutationId,
    entity: context.hook.entity,
    action: context.hook.action,
  };
  const values = selectMissingJoinRecordValues(
    context.storage,
    request,
    context.schema,
    context.action,
  );

  context.createRecords(context.hook.entity, values);
}

function validateClearCompletedActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "clear-completed" }>
  >,
) {
  if (context.entity.fields.done?.type !== "boolean") {
    throw new BadRequestError(
      `Action "${context.actionName}" requires entity "${context.entityName}" to have a boolean done field.`,
    );
  }

  return undefined;
}

function validateNoActionInput() {
  return undefined;
}

function validateTransitionStateActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "transition-state" }>
  >,
): TransitionStateActionInput {
  const value = context.value;

  if (!isRecord(value)) {
    throw new BadRequestError(`Action "${context.actionName}" requires input with recordId.`);
  }

  if (typeof value.recordId !== "string" || value.recordId.trim() === "") {
    throw new BadRequestError(`Action "${context.actionName}" input recordId must be non-empty.`);
  }

  return { recordId: value.recordId };
}

function validateCreateSelectedJoinRecordActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "create-selected-join-record" }>
  >,
): CreateSelectedJoinRecordActionInput {
  const value = context.value;

  if (!isRecord(value)) {
    throw new BadRequestError(
      `Action "${context.actionName}" requires input with fromRecordId and toRecordId.`,
    );
  }

  if (typeof value.fromRecordId !== "string" || value.fromRecordId.trim() === "") {
    throw new BadRequestError(
      `Action "${context.actionName}" input fromRecordId must be non-empty.`,
    );
  }

  if (typeof value.toRecordId !== "string" || value.toRecordId.trim() === "") {
    throw new BadRequestError(`Action "${context.actionName}" input toRecordId must be non-empty.`);
  }

  return {
    fromRecordId: value.fromRecordId,
    toRecordId: value.toRecordId,
  };
}

function validateRemoveSelectedJoinRecordsActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "remove-selected-join-records" }>
  >,
): RemoveSelectedJoinRecordsActionInput {
  const value = context.value;

  if (!isRecord(value) || !Array.isArray(value.recordIds)) {
    throw new BadRequestError(`Action "${context.actionName}" requires input with recordIds.`);
  }

  if (value.recordIds.length === 0) {
    throw new BadRequestError(`Action "${context.actionName}" input recordIds must not be empty.`);
  }

  const seen = new Set<string>();
  const recordIds = value.recordIds.map((recordId, index) => {
    if (typeof recordId !== "string" || recordId.trim() === "") {
      throw new BadRequestError(
        `Action "${context.actionName}" input recordIds[${index}] must be non-empty.`,
      );
    }

    if (seen.has(recordId)) {
      throw new BadRequestError(
        `Action "${context.actionName}" input recordIds must not contain duplicates.`,
      );
    }

    seen.add(recordId);

    return recordId;
  });

  return { recordIds };
}

function validateCreateTreeChildActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "create-tree-child" }>
  >,
): CreateTreeChildActionInput {
  const value = context.value;

  if (!isRecord(value) || !isRecord(value.childValues)) {
    throw new BadRequestError(
      `Action "${context.actionName}" requires input with parentRecordId and childValues.`,
    );
  }

  if (typeof value.parentRecordId !== "string" || value.parentRecordId.trim() === "") {
    throw new BadRequestError(
      `Action "${context.actionName}" input parentRecordId must be non-empty.`,
    );
  }

  if (!Object.values(value.childValues).every(isFieldValue)) {
    throw new BadRequestError(
      `Action "${context.actionName}" input childValues must contain scalar field values.`,
    );
  }

  if (
    value.placementValues !== undefined &&
    (!isRecord(value.placementValues) || !Object.values(value.placementValues).every(isFieldValue))
  ) {
    throw new BadRequestError(
      `Action "${context.actionName}" input placementValues must contain scalar field values.`,
    );
  }

  return {
    parentRecordId: value.parentRecordId,
    childValues: value.childValues as RecordValues,
    ...(value.placementValues === undefined
      ? {}
      : { placementValues: value.placementValues as RecordValues }),
  };
}

function validateRemoveTreePlacementActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "remove-tree-placement" }>
  >,
): RemoveTreePlacementActionInput {
  const value = context.value;

  if (!isRecord(value)) {
    throw new BadRequestError(`Action "${context.actionName}" requires input with placementId.`);
  }

  if (typeof value.placementId !== "string" || value.placementId.trim() === "") {
    throw new BadRequestError(
      `Action "${context.actionName}" input placementId must be non-empty.`,
    );
  }

  return { placementId: value.placementId };
}

function selectActionTargetRecords(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "clear-completed" }>,
): StoredRecord[] {
  const targetQuery = schema.queries[action.target.query];

  if (!targetQuery) {
    throw new Error(
      `Action "${request.action}" references unknown query "${action.target.query}".`,
    );
  }

  return getActiveRecordsByEntity(storage, request.entity).filter((record) =>
    matchesQuery(record, targetQuery.expression),
  );
}

function selectTransitionStateWritePlans(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "transition-state" }>,
  options: { receivedAt?: string } = {},
): ActionRecordWritePlan[] {
  const input = requireTransitionStateInput(request);
  const entity = schema.entities[request.entity];
  const machine = entity?.stateMachines?.[action.machine];
  const transition = machine?.transitions[action.transition];

  if (!entity || !machine || !transition) {
    throw new Error(`Action "${request.action}" references an invalid state transition.`);
  }

  const record = requireActiveTransitionTargetRecord(storage, request, input.recordId);
  const previousState = record.values[machine.field];

  if (typeof previousState !== "string") {
    throw new BadRequestError(
      `Action "${request.action}" target record "${record.id}" field "${machine.field}" does not contain a state.`,
    );
  }

  if (!transition.from.includes(previousState)) {
    throw new BadRequestError(
      `Action "${request.action}" cannot transition record "${record.id}" from state "${previousState}".`,
    );
  }

  const nextValues = validateRecordValues(
    {
      ...record.values,
      [machine.field]: transition.to,
    },
    entity,
    storage,
    {
      entityName: request.entity,
      existingRecordId: record.id,
      schema,
    },
  );

  const plans: ActionRecordWritePlan[] = [{ kind: "patch", record, values: nextValues }];

  const event = machine.event;
  if (event) {
    const eventEntity = schema.entities[event.entity];

    if (!eventEntity) {
      throw new Error(
        `Action "${request.action}" references unknown transition event entity "${event.entity}".`,
      );
    }

    const eventValues = transitionEventRecordValues(
      request,
      event.fields,
      record.id,
      action.transition,
      previousState,
      transition.to,
      options.receivedAt,
    );

    plans.push({
      kind: "create",
      entity: event.entity,
      values: () =>
        validateRecordValues(eventValues, eventEntity, storage, {
          entityName: event.entity,
          schema,
        }),
    });
  }

  return plans;
}

function transitionEventRecordValues(
  request: ActionRequest,
  fields: StateMachineTransitionEventFieldMappingsSchema,
  recordId: string,
  transitionKey: string,
  previousState: string,
  nextState: string,
  receivedAt: string | undefined,
): RecordValues {
  return {
    [fields.sourceEntity]: request.entity,
    [fields.sourceRecordId]: recordId,
    [fields.transitionKey]: transitionKey,
    [fields.previousState]: previousState,
    [fields.nextState]: nextState,
    [fields.actorMode]: request.actorKind ?? "owner",
    [fields.occurredAt]: (receivedAt ?? nowIsoString()).slice(0, 10),
  };
}

function requireActiveTransitionTargetRecord(
  storage: DurableObjectStorage,
  request: ActionRequest,
  recordId: string,
): StoredRecord {
  const record = getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(
      `Action "${request.action}" references unknown ${request.entity} record "${recordId}".`,
    );
  }

  if (record.entity !== request.entity) {
    throw new BadRequestError(
      `Action "${request.action}" target record "${recordId}" must reference a ${request.entity} record.`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Action "${request.action}" cannot transition tombstoned ${request.entity} record "${recordId}".`,
    );
  }

  return record;
}

export function selectMissingJoinRecordValues(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "create-missing-join-records" }>,
): RecordValues[] {
  const entity = schema.entities[request.entity];

  if (!entity) {
    throw new Error(`Missing entity "${request.entity}".`);
  }

  const leftQuery = schema.queries[action.join.left.query];
  const rightQuery = schema.queries[action.join.right.query];

  if (!leftQuery || !rightQuery) {
    throw new Error(`Action "${request.action}" references unknown join query.`);
  }

  const leftRecords = getActiveRecordsByEntity(storage, leftQuery.entity).filter((record) =>
    matchesQuery(record, leftQuery.expression),
  );
  const rightRecords = getActiveRecordsByEntity(storage, rightQuery.entity).filter((record) =>
    matchesQuery(record, rightQuery.expression),
  );
  const existingPairs = new Set(
    getActiveRecordsByEntity(storage, request.entity)
      .map((record) => joinPairKey(record, action))
      .filter((key): key is string => key !== undefined),
  );
  const values: RecordValues[] = [];

  for (const leftRecord of leftRecords) {
    for (const rightRecord of rightRecords) {
      const pairKey = createJoinPairKey(leftRecord.id, rightRecord.id);

      if (existingPairs.has(pairKey)) {
        continue;
      }

      existingPairs.add(pairKey);
      values.push(
        createJoinRecordValues(
          entity,
          action.join.left.field,
          action.join.right.field,
          leftRecord.id,
          rightRecord.id,
        ),
      );
    }
  }

  return values;
}

function joinPairKey(
  record: StoredRecord,
  action: Extract<EntityActionSchema, { kind: "create-missing-join-records" }>,
) {
  const leftValue = record.values[action.join.left.field];
  const rightValue = record.values[action.join.right.field];

  return typeof leftValue === "string" && typeof rightValue === "string"
    ? createJoinPairKey(leftValue, rightValue)
    : undefined;
}

function createJoinPairKey(leftRecordId: string, rightRecordId: string) {
  return `${leftRecordId}\u0000${rightRecordId}`;
}

function createJoinRecordValues(
  entity: EntitySchema,
  leftField: string,
  rightField: string,
  leftRecordId: string,
  rightRecordId: string,
): RecordValues {
  const values: RecordValues = {};

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (fieldName === leftField) {
      values[fieldName] = leftRecordId;
      continue;
    }

    if (fieldName === rightField) {
      values[fieldName] = rightRecordId;
      continue;
    }

    const defaultValue = fieldCreateDefaultValue(field);
    if (defaultValue !== undefined) {
      values[fieldName] = defaultValue;
    }
  }

  return values;
}

function selectSelectedJoinRecordValues(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "create-selected-join-record" }>,
): RecordValues {
  const entity = schema.entities[request.entity];

  if (!entity) {
    throw new Error(`Missing entity "${request.entity}".`);
  }

  const relationship = getManyToManyActionRelationship(schema, request, action.relationship);
  const input = requireCreateSelectedJoinRecordInput(request);
  const fromRecord = requireActiveEndpointRecord(
    storage,
    request,
    relationship.from.entity,
    input.fromRecordId,
  );
  const toRecord = requireActiveEndpointRecord(
    storage,
    request,
    relationship.to.entity,
    input.toRecordId,
  );

  return createJoinRecordValues(
    entity,
    relationship.through.fromField,
    relationship.through.toField,
    fromRecord.id,
    toRecord.id,
  );
}

function selectSelectedJoinRecords(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "remove-selected-join-records" }>,
): StoredRecord[] {
  const relationship = getManyToManyActionRelationship(schema, request, action.relationship);
  const input = requireRemoveSelectedJoinRecordsInput(request);
  const records: StoredRecord[] = [];

  for (const recordId of input.recordIds) {
    const record = getStoredRecord(storage, recordId);

    if (!record) {
      throw new BadRequestError(
        `Action "${request.action}" references unknown join record "${recordId}".`,
      );
    }

    if (record.entity !== relationship.through.entity) {
      throw new BadRequestError(
        `Action "${request.action}" join record "${recordId}" must belong to entity "${relationship.through.entity}".`,
      );
    }

    if (record.deletedAt) {
      throw new BadRequestError(
        `Action "${request.action}" cannot remove tombstoned join record "${recordId}".`,
      );
    }

    records.push(record);
  }

  return records;
}

function selectTreeChildCreatePlans(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "create-tree-child" }>,
): ActionRecordCreatePlan[] {
  const placementEntity = schema.entities[request.entity];

  if (!placementEntity) {
    throw new Error(`Missing entity "${request.entity}".`);
  }

  if (!placementEntity.mutations.create.enabled) {
    throw new BadRequestError(`Create mutations are disabled for entity "${request.entity}".`);
  }

  const relationship = getToManyActionRelationship(schema, request, action.relationship);
  const childField = placementEntity.fields[action.childField];

  if (childField?.type !== "reference") {
    throw new Error(`Action "${request.action}" references invalid child field.`);
  }

  const childEntityName = childField.to;
  const childEntity = schema.entities[childEntityName];

  if (!childEntity) {
    throw new Error(`Action "${request.action}" references unknown child entity.`);
  }

  if (!childEntity.mutations.create.enabled) {
    throw new BadRequestError(`Create mutations are disabled for entity "${childEntityName}".`);
  }

  const input = requireCreateTreeChildInput(request);
  const parentRecord = requireActiveEndpointRecord(
    storage,
    request,
    relationship.from.entity,
    input.parentRecordId,
  );
  const childValues = validateRecordValues(input.childValues, childEntity, storage);

  return [
    {
      entity: childEntityName,
      values: childValues,
    },
    {
      entity: request.entity,
      values: (createdRecords) => {
        const childRecord = createdRecords[0];

        if (!childRecord) {
          throw new Error(`Action "${request.action}" did not create a child record.`);
        }

        return validateRecordValues(
          createTreePlacementValues(
            storage,
            request,
            request.entity,
            placementEntity,
            relationship,
            action,
            parentRecord.id,
            childRecord.id,
            input.placementValues ?? {},
          ),
          placementEntity,
          storage,
        );
      },
    },
  ];
}

function createTreePlacementValues(
  storage: DurableObjectStorage,
  request: ActionRequest,
  placementEntityName: string,
  placementEntity: EntitySchema,
  relationship: ToManyRelationshipSchema,
  action: Extract<EntityActionSchema, { kind: "create-tree-child" }>,
  parentRecordId: string,
  childRecordId: string,
  placementValues: RecordValues,
): RecordValues {
  const relationshipField = relationship.to.field;
  validateTreePlacementInputValues(
    request,
    placementEntity,
    relationshipField,
    action,
    placementValues,
  );
  const values: RecordValues = { ...placementValues };

  for (const [fieldName, field] of Object.entries(placementEntity.fields)) {
    if (fieldName === relationshipField) {
      values[fieldName] = parentRecordId;
      continue;
    }

    if (fieldName === action.childField) {
      values[fieldName] = childRecordId;
      continue;
    }

    if (action.orderField !== undefined && fieldName === action.orderField) {
      values[fieldName] = nextTreePlacementOrder(
        storage,
        placementEntityName,
        relationshipField,
        parentRecordId,
        action.orderField,
        field,
      );
      continue;
    }

    const defaultValue = fieldCreateDefaultValue(field);
    if (defaultValue !== undefined) {
      values[fieldName] = defaultValue;
    }
  }

  return values;
}

function validateTreePlacementInputValues(
  request: ActionRequest,
  placementEntity: EntitySchema,
  relationshipField: string,
  action: Extract<EntityActionSchema, { kind: "create-tree-child" }>,
  placementValues: RecordValues,
) {
  const controlledFields = new Set([
    relationshipField,
    action.childField,
    ...(action.orderField === undefined ? [] : [action.orderField]),
  ]);

  for (const fieldName of Object.keys(placementValues)) {
    if (!placementEntity.fields[fieldName]) {
      throw new BadRequestError(
        `Action "${request.action}" placementValues field "${fieldName}" is unknown.`,
      );
    }

    if (controlledFields.has(fieldName)) {
      throw new BadRequestError(
        `Action "${request.action}" placementValues field "${fieldName}" is controlled by tree creation.`,
      );
    }
  }
}

function nextTreePlacementOrder(
  storage: DurableObjectStorage,
  placementEntityName: string,
  parentFieldName: string,
  parentRecordId: string,
  orderFieldName: string,
  orderField: EntitySchema["fields"][string],
): number {
  const defaultOrder = fieldCreateDefaultValue(orderField);
  const step = typeof defaultOrder === "number" && defaultOrder > 0 ? defaultOrder : 1000;
  const siblingOrders = getActiveRecordsByEntity(storage, placementEntityName)
    .filter((record) => record.values[parentFieldName] === parentRecordId)
    .map((record) => record.values[orderFieldName])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maxOrder = siblingOrders.length === 0 ? undefined : Math.max(...siblingOrders);

  return maxOrder === undefined ? step : maxOrder + step;
}

function selectTreePlacementRecord(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "remove-tree-placement" }>,
): StoredRecord {
  getToManyActionRelationship(schema, request, action.relationship);

  const input = requireRemoveTreePlacementInput(request);
  const record = getStoredRecord(storage, input.placementId);

  if (!record) {
    throw new BadRequestError(
      `Action "${request.action}" references unknown placement record "${input.placementId}".`,
    );
  }

  if (record.entity !== request.entity) {
    throw new BadRequestError(
      `Action "${request.action}" placement record "${input.placementId}" must belong to entity "${request.entity}".`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Action "${request.action}" cannot remove tombstoned placement record "${input.placementId}".`,
    );
  }

  return record;
}

function getManyToManyActionRelationship(
  schema: AppSchema,
  request: ActionRequest,
  relationshipName: string,
): ManyToManyRelationshipSchema {
  const relationship = schema.relationships?.[relationshipName];

  if (!relationship) {
    throw new Error(
      `Action "${request.action}" references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "manyToMany") {
    throw new Error(
      `Action "${request.action}" relationship "${relationshipName}" must be manyToMany.`,
    );
  }

  if (relationship.through.entity !== request.entity) {
    throw new Error(
      `Action "${request.action}" relationship "${relationshipName}" uses through entity "${relationship.through.entity}", not "${request.entity}".`,
    );
  }

  return relationship;
}

function getToManyActionRelationship(
  schema: AppSchema,
  request: ActionRequest,
  relationshipName: string,
): ToManyRelationshipSchema {
  const relationship = schema.relationships?.[relationshipName];

  if (!relationship) {
    throw new Error(
      `Action "${request.action}" references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "toMany") {
    throw new Error(
      `Action "${request.action}" relationship "${relationshipName}" must be toMany.`,
    );
  }

  if (relationship.to.entity !== request.entity) {
    throw new Error(
      `Action "${request.action}" relationship "${relationshipName}" targets entity "${relationship.to.entity}", not "${request.entity}".`,
    );
  }

  return relationship;
}

function requireCreateSelectedJoinRecordInput(
  request: ActionRequest,
): CreateSelectedJoinRecordActionInput {
  const input = request.input;

  if (
    !input ||
    !("fromRecordId" in input) ||
    !("toRecordId" in input) ||
    typeof input.fromRecordId !== "string" ||
    typeof input.toRecordId !== "string"
  ) {
    throw new BadRequestError(
      `Action "${request.action}" requires input with fromRecordId and toRecordId.`,
    );
  }

  return {
    fromRecordId: input.fromRecordId,
    toRecordId: input.toRecordId,
  };
}

function requireRemoveSelectedJoinRecordsInput(
  request: ActionRequest,
): RemoveSelectedJoinRecordsActionInput {
  const input = request.input;

  if (!input || !("recordIds" in input) || !Array.isArray(input.recordIds)) {
    throw new BadRequestError(`Action "${request.action}" requires input with recordIds.`);
  }

  return { recordIds: input.recordIds };
}

function requireCreateTreeChildInput(request: ActionRequest): CreateTreeChildActionInput {
  const input = request.input;

  if (
    !input ||
    !("parentRecordId" in input) ||
    !("childValues" in input) ||
    typeof input.parentRecordId !== "string" ||
    !isRecord(input.childValues)
  ) {
    throw new BadRequestError(
      `Action "${request.action}" requires input with parentRecordId and childValues.`,
    );
  }

  return {
    parentRecordId: input.parentRecordId,
    childValues: input.childValues as RecordValues,
    ...("placementValues" in input && isRecord(input.placementValues)
      ? { placementValues: input.placementValues as RecordValues }
      : {}),
  };
}

function requireRemoveTreePlacementInput(request: ActionRequest): RemoveTreePlacementActionInput {
  const input = request.input;

  if (!input || !("placementId" in input) || typeof input.placementId !== "string") {
    throw new BadRequestError(`Action "${request.action}" requires input with placementId.`);
  }

  return { placementId: input.placementId };
}

function requireTransitionStateInput(request: ActionRequest): TransitionStateActionInput {
  const input = request.input;

  if (!input || !("recordId" in input) || typeof input.recordId !== "string") {
    throw new BadRequestError(`Action "${request.action}" requires input with recordId.`);
  }

  return { recordId: input.recordId };
}

function requireActiveEndpointRecord(
  storage: DurableObjectStorage,
  request: ActionRequest,
  entityName: string,
  recordId: string,
): StoredRecord {
  const record = getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(
      `Action "${request.action}" references unknown ${entityName} record "${recordId}".`,
    );
  }

  if (record.entity !== entityName) {
    throw new BadRequestError(
      `Action "${request.action}" endpoint "${recordId}" must reference a ${entityName} record.`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Action "${request.action}" cannot reference tombstoned ${entityName} record "${recordId}".`,
    );
  }

  return record;
}

function executeActionEffect(
  storage: DurableObjectStorage,
  request: ActionRequest,
  records: StoredRecord[],
  options: { now?: string } = {},
): WriteOutcome<ActionResponse> {
  return tombstoneRecordsForActionOutcome(
    storage,
    request.actionId,
    request.entity,
    request.action,
    records,
    options,
  );
}

function getEntityActionKindRuntimeModule<TAction extends EntityActionSchema>(
  action: TAction,
): EntityActionKindRuntimeModule<TAction> {
  return entityActionKindRuntimeModules[action.kind] as EntityActionKindRuntimeModule<TAction>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldValue(value: unknown): value is RecordValues[string] {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
