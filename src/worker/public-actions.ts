import { isDateString } from "../shared/date.ts";
import type { AppStorageIdentity } from "../shared/app-storage-identity.ts";
import type {
  ActionResponse,
  PublicActionChallengeVerification,
  PublicActionExecutionEnvelope,
  PublicActionRequestSource,
  PublicActionResponse,
  PublicActionSource,
  PublicActionStorageTarget,
  RecordValues,
} from "../shared/protocol.ts";
import type {
  AppSchema,
  EntityActionSchema,
  PublicActionInputFieldSchema,
} from "../shared/schema.ts";
import { getEntityActionKindCapabilities } from "../shared/schema-actions.ts";
import { nowIsoString } from "../shared/clock.ts";
import { turnstileSecretKeyFromEnv, type TurnstileRuntimeEnv } from "../shared/turnstile-config.ts";
import { executePublicEntityActionOutcome, type PublicEntityActionRequest } from "./actions.ts";
import { BadRequestError } from "./errors.ts";
import { getActionResponseById, type WriteOutcome } from "./storage.ts";

export type PublicActionEnv = TurnstileRuntimeEnv & {
  FORMLESS_TURNSTILE_SITEVERIFY?: Fetcher;
};

export type PublicActionRoute = {
  actionName: string;
  path: string;
};

export type PublicActionResult = {
  body: PublicActionResponse | { error: string };
  headers?: HeadersInit;
  status?: number;
};

export type PublicActionWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type PublicActionExecutionInput = {
  body: unknown;
  env: PublicActionEnv;
  identity: AppStorageIdentity;
  request: Request;
  route: PublicActionRoute;
  schema: AppSchema;
  storage: DurableObjectStorage;
  writes: PublicActionWriteNotifier;
};

type SelectedPublicAction = {
  action: EntityActionSchema;
  entityName: string;
};

type ParsedPublicActionRequest = {
  input: RecordValues;
  proof: { turnstileToken: string };
  source?: PublicActionRequestSource;
  idempotencyKey?: string;
};

type TurnstileSiteverifyResponse = {
  success?: unknown;
  challenge_ts?: unknown;
  hostname?: unknown;
};

const publicActionRoutePrefix = "/public/actions/";
const turnstileSiteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export class PublicActionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PublicActionError";
    this.status = status;
  }
}

export function selectPublicActionRoute(input: {
  method: string;
  path: string;
}): PublicActionRoute | undefined {
  if (input.method !== "POST" || !input.path.startsWith(publicActionRoutePrefix)) {
    return undefined;
  }

  const actionNameInput = input.path.slice(publicActionRoutePrefix.length);

  if (actionNameInput === "" || actionNameInput.includes("/")) {
    throw new BadRequestError("Public action name must be non-empty.");
  }

  let actionName: string;

  try {
    actionName = decodeURIComponent(actionNameInput);
  } catch {
    throw new BadRequestError("Public action name must be valid URL path text.");
  }

  if (actionName.trim() === "") {
    throw new BadRequestError("Public action name must be non-empty.");
  }

  return {
    actionName,
    path: input.path,
  };
}

export async function executePublicActionRequest(
  input: PublicActionExecutionInput,
): Promise<PublicActionResult> {
  const selected = selectPublicAction(input.schema, input.route.actionName);
  assertPublicActionOrigin(input.request, selected.action);

  const parsed = parsePublicActionRequest(input.body, selected.action);
  const receivedAt = nowIsoString();
  const idempotencyKey =
    parsed.idempotencyKey ??
    (await derivePublicActionIdempotencyKey({
      actionName: input.route.actionName,
      input: parsed.input,
      source: parsed.source,
    }));
  const actionId = await publicActionId(input.identity, input.route.actionName, idempotencyKey);
  const replay = getActionResponseById(input.storage, actionId);

  if (replay) {
    return acceptedPublicActionResult(replay);
  }

  const source = publicActionSource({
    actionName: input.route.actionName,
    identity: input.identity,
    request: input.request,
    requestSource: parsed.source,
  });
  const verification = await verifyTurnstileChallenge({
    env: input.env,
    idempotencyKey,
    token: parsed.proof.turnstileToken,
  });
  const envelope: PublicActionExecutionEnvelope = {
    actionId,
    actor: { mode: "anonymous" },
    proof: {
      kind: "turnstile",
      token: parsed.proof.turnstileToken,
      verification,
    },
    source,
    input: parsed.input,
    idempotencyKey,
    receivedAt,
  };
  const request: PublicEntityActionRequest = {
    actionId,
    entity: selected.entityName,
    action: input.route.actionName,
    input: parsed.input,
    envelope,
  };
  const outcome = input.writes.apply(() =>
    executePublicEntityActionOutcome(input.storage, request, input.schema),
  );

  return acceptedPublicActionResult(outcome.response);
}

function selectPublicAction(schema: AppSchema, actionName: string): SelectedPublicAction {
  const candidates: SelectedPublicAction[] = [];

  for (const [entityName, entity] of Object.entries(schema.entities)) {
    const action = entity.actions?.[actionName];

    if (!action) {
      continue;
    }

    const capabilities = getEntityActionKindCapabilities(action.kind);
    if (action.access?.actor === "anonymous" && capabilities.publicExecution) {
      candidates.push({ entityName, action });
    }
  }

  if (candidates.length === 0) {
    throw new PublicActionError("Public action is not available.", 404);
  }

  if (candidates.length > 1) {
    throw new BadRequestError("Public action name is ambiguous.");
  }

  return candidates[0] as SelectedPublicAction;
}

function assertPublicActionOrigin(request: Request, action: EntityActionSchema) {
  if (action.access?.origin.kind !== "same-origin") {
    return;
  }

  const origin = request.headers.get("Origin");
  if (!origin) {
    return;
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new PublicActionError("Public action origin is not allowed.", 403);
  }

  if (parsedOrigin.origin !== new URL(request.url).origin) {
    throw new PublicActionError("Public action origin is not allowed.", 403);
  }
}

function parsePublicActionRequest(
  value: unknown,
  action: EntityActionSchema,
): ParsedPublicActionRequest {
  if (!isRecord(value)) {
    throw new BadRequestError("Public action request must be an object.");
  }

  assertExactKeys("Public action request", value, ["input", "proof"], ["source", "idempotencyKey"]);

  if (!action.publicInput) {
    throw new PublicActionError("Public action is not available.", 404);
  }

  return {
    input: parsePublicActionInput(value.input, action.publicInput.fields),
    proof: parsePublicActionProof(value.proof),
    ...(value.source === undefined ? {} : { source: parsePublicActionSource(value.source) }),
    ...(value.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: parseIdempotencyKey(value.idempotencyKey) }),
  };
}

function parsePublicActionInput(
  value: unknown,
  fields: Record<string, PublicActionInputFieldSchema>,
): RecordValues {
  if (!isRecord(value)) {
    throw new BadRequestError("Public action input must be an object.");
  }

  for (const fieldName of Object.keys(value)) {
    if (!fields[fieldName]) {
      throw new BadRequestError(`Public action input includes undeclared field "${fieldName}".`);
    }
  }

  const input: RecordValues = {};

  for (const [fieldName, field] of Object.entries(fields)) {
    const fieldWasProvided = fieldName in value;
    const result = parsePublicActionInputField(
      fieldName,
      field,
      value[fieldName],
      fieldWasProvided,
    );

    if (result.kind === "set") {
      input[fieldName] = result.value;
    }
  }

  return input;
}

function parsePublicActionInputField(
  fieldName: string,
  field: PublicActionInputFieldSchema,
  value: unknown,
  provided: boolean,
): { kind: "omit" } | { kind: "set"; value: RecordValues[string] } {
  if (!provided) {
    if (field.required) {
      throw new BadRequestError(`Public action input field "${fieldName}" is required.`);
    }

    return { kind: "omit" };
  }

  if (field.type === "text") {
    if (typeof value !== "string") {
      throw new BadRequestError(`Public action input field "${fieldName}" must be text.`);
    }

    if (value.trim() === "") {
      if (field.required) {
        throw new BadRequestError(`Public action input field "${fieldName}" cannot be empty.`);
      }

      return { kind: "omit" };
    }

    return { kind: "set", value };
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new BadRequestError(`Public action input field "${fieldName}" must be a boolean.`);
    }

    return { kind: "set", value };
  }

  if (field.type === "date") {
    if (typeof value !== "string") {
      throw new BadRequestError(`Public action input field "${fieldName}" must be a date.`);
    }

    if (value.trim() === "") {
      if (field.required) {
        throw new BadRequestError(`Public action input field "${fieldName}" cannot be empty.`);
      }

      return { kind: "omit" };
    }

    if (!isDateString(value)) {
      throw new BadRequestError(
        `Public action input field "${fieldName}" must be a YYYY-MM-DD date.`,
      );
    }

    return { kind: "set", value };
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new BadRequestError(
        `Public action input field "${fieldName}" must be a finite number.`,
      );
    }

    return { kind: "set", value };
  }

  if (field.type === "enum") {
    if (typeof value !== "string" || value === "" || !Object.hasOwn(field.values, value)) {
      throw new BadRequestError(
        `Public action input field "${fieldName}" must be a known enum value.`,
      );
    }

    return { kind: "set", value };
  }

  return assertUnsupportedPublicActionInputField(field);
}

function assertUnsupportedPublicActionInputField(field: never): never {
  throw new Error(`Unsupported public action input field "${String(field)}".`);
}

function parsePublicActionProof(value: unknown): ParsedPublicActionRequest["proof"] {
  if (!isRecord(value)) {
    throw new BadRequestError("Public action proof must be an object.");
  }

  assertExactKeys("Public action proof", value, ["turnstileToken"]);

  if (typeof value.turnstileToken !== "string" || value.turnstileToken.trim() === "") {
    throw new BadRequestError("Public action Turnstile token is required.");
  }

  if (value.turnstileToken.length > 2048) {
    throw new BadRequestError("Public action Turnstile token is too long.");
  }

  return {
    turnstileToken: value.turnstileToken,
  };
}

function parsePublicActionSource(value: unknown): PublicActionRequestSource {
  if (!isRecord(value)) {
    throw new BadRequestError("Public action source must be an object.");
  }

  assertExactKeys("Public action source", value, [], ["siteBlockId"]);

  if (value.siteBlockId === undefined) {
    return {};
  }

  if (typeof value.siteBlockId !== "string" || value.siteBlockId.trim() === "") {
    throw new BadRequestError("Public action source siteBlockId must be a non-empty string.");
  }

  return { siteBlockId: value.siteBlockId };
}

function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("Public action idempotencyKey must be a non-empty string.");
  }

  if (value.length > 512) {
    throw new BadRequestError("Public action idempotencyKey must be at most 512 characters.");
  }

  return value;
}

async function verifyTurnstileChallenge(input: {
  env: PublicActionEnv;
  idempotencyKey: string;
  token: string;
}): Promise<PublicActionChallengeVerification> {
  const secret = turnstileSecretKeyFromEnv(input.env);

  if (!secret) {
    throw new PublicActionError("Public action challenge is unavailable.", 503);
  }

  let response: Response;

  try {
    response = await turnstileFetch(
      input.env,
      new Request(turnstileSiteverifyUrl, {
        body: JSON.stringify({
          secret,
          response: input.token,
          idempotency_key: input.idempotencyKey,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
  } catch {
    throw new PublicActionError("Public action challenge is unavailable.", 503);
  }

  if (!response.ok) {
    throw new PublicActionError("Public action challenge is unavailable.", 503);
  }

  let body: TurnstileSiteverifyResponse;

  try {
    body = (await response.json()) as TurnstileSiteverifyResponse;
  } catch {
    throw new PublicActionError("Public action challenge is unavailable.", 503);
  }

  if (body.success !== true) {
    throw new PublicActionError("Public action challenge failed.", 403);
  }

  return {
    kind: "turnstile",
    success: true,
    verifiedAt: nowIsoString(),
    ...(typeof body.challenge_ts === "string" ? { challengeTs: body.challenge_ts } : {}),
    ...(typeof body.hostname === "string" ? { hostname: body.hostname } : {}),
  };
}

function turnstileFetch(env: PublicActionEnv, request: Request): Promise<Response> {
  return env.FORMLESS_TURNSTILE_SITEVERIFY
    ? env.FORMLESS_TURNSTILE_SITEVERIFY.fetch(request)
    : fetch(request);
}

function acceptedPublicActionResult(response: ActionResponse): PublicActionResult {
  return {
    body: {
      actionId: response.actionId,
      cursor: response.cursor,
      status: "accepted",
    },
  };
}

function publicActionSource(input: {
  actionName: string;
  identity: AppStorageIdentity;
  request: Request;
  requestSource: PublicActionRequestSource | undefined;
}): PublicActionSource {
  const url = new URL(input.request.url);

  return {
    actionName: input.actionName,
    host: url.host,
    path: url.pathname,
    target: publicActionTarget(input.identity),
    ...(input.requestSource?.siteBlockId === undefined
      ? {}
      : { siteBlockId: input.requestSource.siteBlockId }),
  };
}

function publicActionTarget(identity: AppStorageIdentity): PublicActionStorageTarget {
  if (identity.kind === "schemaKey") {
    return {
      kind: "schemaKey",
      packageAppKey: identity.packageAppKey,
      sourceSchemaKey: identity.sourceSchemaKey,
      apiRoutePrefix: identity.apiRoutePrefix,
    };
  }

  return {
    kind: "appInstall",
    installId: identity.installId,
    packageAppKey: identity.packageAppKey,
    sourceSchemaKey: identity.sourceSchemaKey,
    apiRoutePrefix: identity.apiRoutePrefix,
  };
}

async function publicActionId(
  identity: AppStorageIdentity,
  actionName: string,
  idempotencyKey: string,
) {
  const digest = await sha256Hex(
    stableJson({
      actionName,
      apiRoutePrefix: identity.apiRoutePrefix,
      idempotencyKey,
    }),
  );

  return `public:${actionName}:${digest}`;
}

async function derivePublicActionIdempotencyKey(input: {
  actionName: string;
  input: RecordValues;
  source: PublicActionRequestSource | undefined;
}) {
  const digest = await sha256Hex(stableJson(input));

  return `derived:${digest}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  const allowed = new Set([...required, ...optional]);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new BadRequestError(`${context} must include "${key}".`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
