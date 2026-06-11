import { assertSchemaLocalEntityKey } from "./entity-names.ts";
import {
  assertExactKeys,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  ActionAccessPolicySchema,
  ActionChallengePolicySchema,
  ActionOriginPolicySchema,
  CollectionQuerySchema,
  CreateRecordEntityOperationEffectSchema,
  DeleteRecordEntityOperationEffectSchema,
  EntityActionKind,
  EntityOperationActorKind,
  EntityOperationAuditInputPolicy,
  EntityOperationAuditSchema,
  EntityOperationEffectSchema,
  EntityOperationIdempotencySchema,
  EntityOperationInlineInputFieldSchema,
  EntityOperationInputContractSchema,
  EntityOperationInputFieldSchema,
  EntityOperationKind,
  EntityOperationOutputContractSchema,
  EntityOperationPolicySchema,
  EntityOperationSchema,
  EntityOperationScope,
  EntityOperationTargetSchema,
  EntitySchema,
  EnumValueSchema,
  PatchRecordEntityOperationEffectSchema,
  RunActionKindEntityOperationEffectSchema,
} from "./types.ts";

export const entityOperationKinds = [
  "list",
  "get",
  "create",
  "update",
  "delete",
  "command",
] as const satisfies readonly EntityOperationKind[];

export const entityOperationScopes = [
  "collection",
  "record",
] as const satisfies readonly EntityOperationScope[];

const entityOperationActorKinds = [
  "admin",
  "cliDeployer",
  "owner",
  "runner",
  "anonymous",
] as const satisfies readonly EntityOperationActorKind[];

const entityActionKinds = [
  "clear-completed",
  "create-missing-join-records",
  "create-selected-join-record",
  "remove-selected-join-records",
  "create-tree-child",
  "remove-tree-placement",
  "subscribe",
  "transition-state",
] as const satisfies readonly EntityActionKind[];

const entityOperationAuditInputPolicies = [
  "none",
  "hash",
  "summary",
  "snapshot",
] as const satisfies readonly EntityOperationAuditInputPolicy[];

type ParsedEntityOperationKey = {
  entityKey: string;
  operationKey: string;
};

export function formatEntityOperationKey(input: ParsedEntityOperationKey): string {
  assertSchemaLocalEntityKey(`Entity operation key entity "${input.entityKey}"`, input.entityKey);
  assertEntityOperationKey(
    `Entity operation key operation "${input.operationKey}"`,
    input.operationKey,
  );

  return `${input.entityKey}.${input.operationKey}`;
}

export function parseEntityOperationKey(context: string, value: unknown): ParsedEntityOperationKey {
  const key = parseRequiredNonEmptyString(context, value);
  const parts = key.split(".");

  if (parts.length !== 2) {
    throw new Error(`${context} must use "<entity-key>.<operation-key>" format.`);
  }

  const [entityKey, operationKey] = parts;

  assertSchemaLocalEntityKey(`${context} entity "${entityKey}"`, entityKey);
  assertEntityOperationKey(`${context} operation "${operationKey}"`, operationKey);

  return { entityKey, operationKey };
}

export function isEntityOperationWriteKind(kind: EntityOperationKind): boolean {
  return kind === "create" || kind === "update" || kind === "delete" || kind === "command";
}

export function isEntityOperationVisibleToBrowser(operation: EntityOperationSchema) {
  if (operation.policy?.visible === false) {
    return false;
  }

  return (
    operation.policy === undefined ||
    operation.policy.actors.includes("admin") ||
    operation.policy.actors.includes("owner") ||
    operation.policy.actors.includes("anonymous")
  );
}

export function parseEntityOperationsForEntities(
  entities: Record<string, EntitySchema>,
  operationInputsByEntity: Record<string, unknown>,
  queries: Record<string, CollectionQuerySchema>,
): Record<string, EntitySchema> {
  return Object.fromEntries(
    Object.entries(entities).map(([entityName, entity]) => {
      const operations =
        parseEntityOperations(entityName, operationInputsByEntity[entityName], entity, queries) ??
        {};

      return [entityName, Object.keys(operations).length > 0 ? { ...entity, operations } : entity];
    }),
  );
}

function parseEntityOperations(
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): Record<string, EntityOperationSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" operations must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`Entity "${entityName}" operations must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([operationName, operation]) => {
      assertEntityOperationKey(
        `Entity "${entityName}" operation key "${operationName}"`,
        operationName,
      );

      return [
        operationName,
        parseEntityOperation(entityName, operationName, operation, entity, queries),
      ];
    }),
  );
}

function parseEntityOperation(
  entityName: string,
  operationName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityOperationSchema {
  const context = `Entity operation "${formatEntityOperationKey({
    entityKey: entityName,
    operationKey: operationName,
  })}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["kind", "scope"],
    ["label", "input", "target", "effect", "output", "policy", "audit", "idempotency"],
  );

  const kind = parseOperationKind(`${context} kind`, value.kind);
  const scope = parseOperationScope(`${context} scope`, value.scope);
  validateOperationKindScope(context, kind, scope);

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const input = parseOperationInput(`${context} input`, value.input, kind, entity);
  const target = parseOperationTarget(`${context} target`, value.target, entityName, queries);
  const output = parseOperationOutput(
    `${context} output`,
    value.output,
    kind,
    target,
    entityName,
    queries,
  );
  const effect = parseOperationEffect(
    `${context} effect`,
    value.effect,
    kind,
    target,
    entityName,
    entity,
    queries,
  );
  const idempotency = parseOperationIdempotency(`${context} idempotency`, value.idempotency, kind);
  const audit = parseOperationAudit(`${context} audit`, value.audit);
  const policy = parseOperationPolicy(`${context} policy`, value.policy, entity);

  return {
    ...(label === undefined ? {} : { label }),
    kind,
    scope,
    ...(input === undefined ? {} : { input }),
    ...(target === undefined ? {} : { target }),
    ...(effect === undefined ? {} : { effect }),
    output,
    idempotency,
    audit,
    ...(policy === undefined ? {} : { policy }),
  };
}

function assertEntityOperationKey(context: string, value: string) {
  if (
    value.trim() === "" ||
    value.trim() !== value ||
    value.includes(".") ||
    value.includes("/") ||
    value.includes(":") ||
    /\s/.test(value)
  ) {
    throw new Error(
      `${context} must be non-empty and must not contain whitespace, dots, slashes, or colons.`,
    );
  }
}

function parseOperationKind(context: string, value: unknown): EntityOperationKind {
  if (!entityOperationKinds.includes(value as EntityOperationKind)) {
    throw new Error(`${context} must be list, get, create, update, delete, or command.`);
  }

  return value as EntityOperationKind;
}

function parseOperationScope(context: string, value: unknown): EntityOperationScope {
  if (!entityOperationScopes.includes(value as EntityOperationScope)) {
    throw new Error(`${context} must be collection or record.`);
  }

  return value as EntityOperationScope;
}

function validateOperationKindScope(
  context: string,
  kind: EntityOperationKind,
  scope: EntityOperationScope,
) {
  if ((kind === "list" || kind === "create") && scope !== "collection") {
    throw new Error(`${context} kind "${kind}" must use collection scope.`);
  }

  if ((kind === "get" || kind === "update" || kind === "delete") && scope !== "record") {
    throw new Error(`${context} kind "${kind}" must use record scope.`);
  }
}

function parseOperationInput(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  entity: EntitySchema,
): EntityOperationInputContractSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["fields"]);

  if (!isRecord(value.fields)) {
    throw new Error(`${context} fields must be an object.`);
  }

  const entries = Object.entries(value.fields);
  if (entries.length === 0) {
    throw new Error(`${context} fields must not be empty.`);
  }

  return {
    fields: Object.fromEntries(
      entries.map(([fieldName, field]) => {
        assertOperationInputFieldName(`${context} field "${fieldName}"`, fieldName);

        return [
          fieldName,
          parseOperationInputField(`${context} fields.${fieldName}`, field, kind, entity),
        ];
      }),
    ),
  };
}

function assertOperationInputFieldName(context: string, value: string) {
  if (value.trim() === "") {
    throw new Error(`${context} must be non-empty.`);
  }
}

function parseOperationInputField(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  entity: EntitySchema,
): EntityOperationInputFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if ("field" in value) {
    assertExactKeys(context, value, ["field"], ["required", "label"]);

    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    if (!entity.fields[fieldName]) {
      throw new Error(`${context} references unknown field "${fieldName}".`);
    }

    const required = parseOptionalBoolean(`${context} required`, value.required);
    const label = parseOptionalNonEmptyString(`${context} label`, value.label);

    return {
      field: fieldName,
      ...(required === undefined ? {} : { required }),
      ...(label === undefined ? {} : { label }),
    };
  }

  if (kind !== "command") {
    throw new Error(`${context} inline scalar fields are only supported for command operations.`);
  }

  return parseInlineInputField(context, value);
}

function parseInlineInputField(
  context: string,
  value: Record<string, unknown>,
): EntityOperationInlineInputFieldSchema {
  if (typeof value.required !== "boolean") {
    throw new Error(`${context} must declare whether it is required.`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);

  if (value.type === "text") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return { type: "text", required: value.required, ...(label === undefined ? {} : { label }) };
  }

  if (value.type === "boolean") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return {
      type: "boolean",
      required: value.required,
      ...(label === undefined ? {} : { label }),
    };
  }

  if (value.type === "date") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return { type: "date", required: value.required, ...(label === undefined ? {} : { label }) };
  }

  if (value.type === "number") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return {
      type: "number",
      required: value.required,
      ...(label === undefined ? {} : { label }),
    };
  }

  if (value.type === "enum") {
    assertExactKeys(context, value, ["type", "required", "values"], ["label"]);
    return {
      type: "enum",
      required: value.required,
      values: parseInlineInputEnumValues(`${context} values`, value.values),
      ...(label === undefined ? {} : { label }),
    };
  }

  throw new Error(`${context} has unsupported type "${String(value.type)}".`);
}

function parseInlineInputEnumValues(
  context: string,
  value: unknown,
): Record<string, EnumValueSchema> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([enumValue, enumValueSchema]) => {
      if (enumValue.trim() === "") {
        throw new Error(`${context} keys must be non-empty.`);
      }

      if (!isRecord(enumValueSchema)) {
        throw new Error(`${context}.${enumValue} must be an object.`);
      }

      assertExactKeys(`${context}.${enumValue}`, enumValueSchema, ["label"]);

      const label = parseRequiredNonEmptyString(
        `${context}.${enumValue} label`,
        enumValueSchema.label,
      );
      return [enumValue, { label }];
    }),
  );
}

function parseOperationTarget(
  context: string,
  value: unknown,
  entityName: string,
  queries: Record<string, CollectionQuerySchema>,
): EntityOperationTargetSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["query"]);

  const query = parseOperationQueryReference(`${context} query`, value.query, entityName, queries);
  return { query };
}

function parseOperationOutput(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  queries: Record<string, CollectionQuerySchema>,
): EntityOperationOutputContractSchema {
  if (value === undefined) {
    return defaultOperationOutput(context, kind, target);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "list") {
    assertExactKeys(context, value, ["type", "query"]);
    validateOperationOutputKind(context, kind, "list");
    const query = parseOperationQueryReference(
      `${context} query`,
      value.query,
      entityName,
      queries,
    );
    return { type: "list", query };
  }

  if (value.type === "get") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "get");
    return { type: "get" };
  }

  if (value.type === "create") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "create");
    return { type: "create" };
  }

  if (value.type === "update") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "update");
    return { type: "update" };
  }

  if (value.type === "delete") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "delete");
    return { type: "delete" };
  }

  if (value.type === "command") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "command");
    return { type: "command" };
  }

  throw new Error(`${context} has unsupported type "${String(value.type)}".`);
}

function defaultOperationOutput(
  context: string,
  kind: EntityOperationKind,
  target: EntityOperationTargetSchema | undefined,
): EntityOperationOutputContractSchema {
  if (kind === "list") {
    if (target === undefined) {
      throw new Error(
        `${context} for list operations requires a target query or explicit output query.`,
      );
    }

    return { type: "list", query: target.query };
  }

  if (kind === "get") {
    return { type: "get" };
  }

  if (kind === "create") {
    return { type: "create" };
  }

  if (kind === "update") {
    return { type: "update" };
  }

  if (kind === "delete") {
    return { type: "delete" };
  }

  return { type: "command" };
}

function validateOperationOutputKind(
  context: string,
  operationKind: EntityOperationKind,
  outputKind: EntityOperationKind,
) {
  if (operationKind !== outputKind) {
    throw new Error(
      `${context} type "${outputKind}" must match operation kind "${operationKind}".`,
    );
  }
}

function parseOperationEffect(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityOperationEffectSchema | undefined {
  if (value === undefined) {
    return defaultOperationEffect(context, kind);
  }

  if (kind === "list" || kind === "get") {
    throw new Error(`${context} is not supported for read operations.`);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "createRecord") {
    assertExactKeys(context, value, ["type"], ["entity"]);
    validateOperationEffectKind(context, kind, "create");
    return {
      type: "createRecord",
      ...parseOperationEffectEntity(context, value.entity, entityName),
    };
  }

  if (value.type === "patchRecord") {
    assertExactKeys(context, value, ["type"], ["entity"]);
    validateOperationEffectKind(context, kind, "update");
    return {
      type: "patchRecord",
      ...parseOperationEffectEntity(context, value.entity, entityName),
    };
  }

  if (value.type === "deleteRecord" || value.type === "tombstoneRecord") {
    assertExactKeys(context, value, ["type"], ["entity"]);
    validateOperationEffectKind(context, kind, "delete");
    return {
      type: value.type,
      ...parseOperationEffectEntity(context, value.entity, entityName),
    };
  }

  if (value.type === "runActionKind") {
    assertExactKeys(context, value, ["type", "kind"], ["action", "query"]);
    validateOperationEffectKind(context, kind, "command");
    return parseRunActionKindEffect(context, value, target, entityName, entity, queries);
  }

  throw new Error(`${context} has unsupported type "${String(value.type)}".`);
}

function defaultOperationEffect(
  context: string,
  kind: EntityOperationKind,
): EntityOperationEffectSchema | undefined {
  if (kind === "create") {
    return { type: "createRecord" };
  }

  if (kind === "update") {
    return { type: "patchRecord" };
  }

  if (kind === "delete") {
    return { type: "deleteRecord" };
  }

  if (kind === "command") {
    throw new Error(`${context} is required for command operations.`);
  }

  return undefined;
}

function parseOperationEffectEntity(
  context: string,
  value: unknown,
  entityName: string,
):
  | Pick<CreateRecordEntityOperationEffectSchema, "entity">
  | Pick<PatchRecordEntityOperationEffectSchema, "entity">
  | Pick<DeleteRecordEntityOperationEffectSchema, "entity"> {
  const effectEntity = parseOptionalNonEmptyString(`${context} entity`, value);

  if (effectEntity === undefined) {
    return {};
  }

  if (effectEntity !== entityName) {
    throw new Error(`${context} entity must target containing entity "${entityName}".`);
  }

  return { entity: effectEntity };
}

function validateOperationEffectKind(
  context: string,
  operationKind: EntityOperationKind,
  expectedKind: EntityOperationKind,
) {
  if (operationKind !== expectedKind) {
    throw new Error(`${context} type is only valid for ${expectedKind} operations.`);
  }
}

function parseRunActionKindEffect(
  context: string,
  value: Record<string, unknown>,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): RunActionKindEntityOperationEffectSchema {
  if (!isEntityActionKind(value.kind)) {
    throw new Error(`${context} kind must be a supported schema action kind.`);
  }

  const actionName = parseOptionalNonEmptyString(`${context} action`, value.action);
  const queryName = parseOptionalNonEmptyString(`${context} query`, value.query);

  if (actionName !== undefined) {
    const action = entity.actions?.[actionName];

    if (!action) {
      throw new Error(`${context} action references unknown action "${actionName}".`);
    }

    if (action.kind !== value.kind) {
      throw new Error(`${context} action "${actionName}" must use kind "${value.kind}".`);
    }
  }

  if (queryName !== undefined) {
    parseOperationQueryReference(`${context} query`, queryName, entityName, queries);
  }

  if (target !== undefined && queryName !== undefined && target.query !== queryName) {
    throw new Error(`${context} query must match target query "${target.query}".`);
  }

  return {
    type: "runActionKind",
    kind: value.kind,
    ...(actionName === undefined ? {} : { action: actionName }),
    ...(queryName === undefined ? {} : { query: queryName }),
  };
}

function parseOperationIdempotency(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
): EntityOperationIdempotencySchema {
  if (value === undefined) {
    return { required: isEntityOperationWriteKind(kind) };
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["required"], ["source"]);

  if (typeof value.required !== "boolean") {
    throw new Error(`${context} required must be a boolean.`);
  }

  const source = parseOperationIdempotencySource(`${context} source`, value.source);

  if (isEntityOperationWriteKind(kind)) {
    if (!value.required) {
      throw new Error(`${context} is required for write and command operations.`);
    }
  } else if (value.required) {
    throw new Error(`${context} must not be required for read operations.`);
  }

  if (!value.required && source !== undefined) {
    throw new Error(`${context} source requires idempotency to be required.`);
  }

  return {
    required: value.required,
    ...(source === undefined ? {} : { source }),
  };
}

function parseOperationIdempotencySource(
  context: string,
  value: unknown,
): EntityOperationIdempotencySchema["source"] {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "caller" && value !== "runtime") {
    throw new Error(`${context} must be caller or runtime.`);
  }

  return value;
}

function parseOperationAudit(context: string, value: unknown): EntityOperationAuditSchema {
  if (value === undefined) {
    return { input: "summary" };
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["input"]);

  if (!entityOperationAuditInputPolicies.includes(value.input as EntityOperationAuditInputPolicy)) {
    throw new Error(`${context} input must be none, hash, summary, or snapshot.`);
  }

  return { input: value.input as EntityOperationAuditInputPolicy };
}

function parseOperationPolicy(
  context: string,
  value: unknown,
  entity: EntitySchema,
): EntityOperationPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["actors"], ["access", "responseFields", "visible"]);

  const actors = parseOperationActorKinds(`${context} actors`, value.actors);
  const access = parseOptionalActionAccessPolicy(`${context} access`, value.access);
  const responseFields = parseOperationResponseFields(
    `${context} responseFields`,
    value.responseFields,
    entity,
    actors,
  );
  const visible = parseOptionalBoolean(`${context} visible`, value.visible);

  if (access !== undefined && !actors.includes("anonymous")) {
    throw new Error(`${context} access requires anonymous actor policy.`);
  }

  return {
    actors,
    ...(access === undefined ? {} : { access }),
    ...(responseFields === undefined ? {} : { responseFields }),
    ...(visible === undefined ? {} : { visible }),
  };
}

function parseOperationActorKinds(context: string, value: unknown): EntityOperationActorKind[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const actors = value.map((actor, index) => {
    if (!isEntityOperationActorKind(actor)) {
      throw new Error(
        `${context}[${index}] must be owner, admin, cliDeployer, runner, or anonymous.`,
      );
    }

    return actor;
  });

  if (new Set(actors).size !== actors.length) {
    throw new Error(`${context} must be unique.`);
  }

  return actors;
}

function parseOptionalActionAccessPolicy(
  context: string,
  value: unknown,
): ActionAccessPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["actor", "challenge", "origin"]);

  if (value.actor !== "anonymous") {
    throw new Error(`${context} actor must be "anonymous".`);
  }

  return {
    actor: "anonymous",
    challenge: parseActionChallengePolicy(`${context} challenge`, value.challenge),
    origin: parseActionOriginPolicy(`${context} origin`, value.origin),
  };
}

function parseActionChallengePolicy(context: string, value: unknown): ActionChallengePolicySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind"]);

  if (value.kind !== "turnstile") {
    throw new Error(`${context} kind must be "turnstile".`);
  }

  return { kind: "turnstile" };
}

function parseActionOriginPolicy(context: string, value: unknown): ActionOriginPolicySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind"]);

  if (value.kind !== "same-origin") {
    throw new Error(`${context} kind must be "same-origin".`);
  }

  return { kind: "same-origin" };
}

function parseOperationResponseFields(
  context: string,
  value: unknown,
  entity: EntitySchema,
  actors: EntityOperationActorKind[],
): EntityOperationPolicySchema["responseFields"] {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const responseFields: Partial<Record<EntityOperationActorKind, string[]>> = {};

  for (const [actor, fields] of Object.entries(value)) {
    if (!isEntityOperationActorKind(actor)) {
      throw new Error(`${context} has unsupported actor "${actor}".`);
    }

    if (!actors.includes(actor)) {
      throw new Error(`${context}.${actor} must reference an operation actor.`);
    }

    responseFields[actor] = parseResponseFieldList(`${context}.${actor}`, fields, entity);
  }

  if (Object.keys(responseFields).length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return responseFields;
}

function parseResponseFieldList(context: string, value: unknown, entity: EntitySchema): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const fields = value.map((fieldName, index) => {
    const field = parseRequiredNonEmptyString(`${context}[${index}]`, fieldName);

    if (!entity.fields[field]) {
      throw new Error(`${context}[${index}] references unknown field "${field}".`);
    }

    return field;
  });

  if (new Set(fields).size !== fields.length) {
    throw new Error(`${context} must be unique.`);
  }

  return fields;
}

function parseOperationQueryReference(
  context: string,
  value: unknown,
  entityName: string,
  queries: Record<string, CollectionQuerySchema>,
): string {
  const queryName = parseRequiredNonEmptyString(context, value);
  const query = queries[queryName];

  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  if (query.entity !== entityName) {
    throw new Error(`${context} query "${queryName}" must use entity "${entityName}".`);
  }

  return queryName;
}

function parseOptionalBoolean(context: string, value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function isEntityActionKind(value: unknown): value is EntityActionKind {
  return entityActionKinds.includes(value as EntityActionKind);
}

function isEntityOperationActorKind(value: unknown): value is EntityOperationActorKind {
  return entityOperationActorKinds.includes(value as EntityOperationActorKind);
}
