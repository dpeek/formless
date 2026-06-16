import type { AppStorageIdentity } from "../shared/app-storage-identity.ts";
import type { RecordValues } from "@dpeek/formless-storage";
import type {
  PublicActionChallengeVerification,
  PublicActionProof,
  PublicActionRequestSource,
  PublicOperationResponse,
} from "../shared/protocol.ts";
import type { AppSchema, EntityOperationSchema, EntitySchema } from "@dpeek/formless-schema";
import { formatEntityOperationKey } from "@dpeek/formless-schema";
import { nowIsoString } from "../shared/clock.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import { turnstileSecretKeyFromEnv, type TurnstileRuntimeEnv } from "../shared/turnstile-config.ts";
import {
  buildPublicOperationInvocationEnvelope,
  executeWriteOperationInvocation,
  validateEntityOperationInputContract,
} from "./entity-operations.ts";
import { BadRequestError } from "./errors.ts";
import {
  getOperationInvocationById,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationOutcome,
  recordOperationInvocationRejected,
  type WriteOutcome,
} from "./storage.ts";

export type PublicActionEnv = TurnstileRuntimeEnv & {
  FORMLESS_TURNSTILE_SITEVERIFY?: Fetcher;
};

export type PublicOperationRoute = {
  entityName: string;
  operationName: string;
  path: string;
};

export type PublicActionResult = {
  body: PublicOperationResponse | { error: string };
  headers?: HeadersInit;
  status?: number;
};

export type PublicActionWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type PublicOperationExecutionInput = {
  body: unknown;
  env: PublicActionEnv;
  identity: AppStorageIdentity;
  request: Request;
  route: PublicOperationRoute;
  schema: AppSchema;
  storage: DurableObjectStorage;
  writes: PublicActionWriteNotifier;
};

type SelectedPublicOperation = {
  entity: EntitySchema;
  entityName: string;
  operation: EntityOperationSchema;
  operationName: string;
};

type ParsedPublicOperationRequest = {
  input: RecordValues;
  proof: { turnstileToken: string };
  source?: PublicActionRequestSource;
  idempotencyKey?: string;
};

type PublicOperationRequestEnvelopeFields = {
  input: unknown;
  proof: unknown;
  source?: PublicActionRequestSource;
  idempotencyKey?: string;
};

type TurnstileSiteverifyResponse = {
  success?: unknown;
  challenge_ts?: unknown;
  hostname?: unknown;
};

const publicOperationRoutePrefix = "/public/operations/";
const originalRequestHostHeader = "x-formless-original-request-host";
const originalRequestOriginHeader = "x-formless-original-request-origin";
const turnstileSiteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export class PublicActionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PublicActionError";
    this.status = status;
  }
}

export function selectPublicOperationRoute(input: {
  method: string;
  path: string;
}): PublicOperationRoute | undefined {
  if (input.method !== "POST" || !input.path.startsWith(publicOperationRoutePrefix)) {
    return undefined;
  }

  const segments = input.path.slice(publicOperationRoutePrefix.length).split("/");

  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new BadRequestError(
      "Public operation route must use /public/operations/:entity/:operation.",
    );
  }

  let entityName: string;
  let operationName: string;

  try {
    entityName = decodeURIComponent(segments[0]);
    operationName = decodeURIComponent(segments[1]);
  } catch {
    throw new BadRequestError("Public operation route segments must be valid URL path text.");
  }

  if (entityName.trim() === "" || operationName.trim() === "") {
    throw new BadRequestError("Public operation entity and operation must be non-empty.");
  }

  return {
    entityName,
    operationName,
    path: input.path,
  };
}

export async function executePublicOperationRequest(
  input: PublicOperationExecutionInput,
): Promise<PublicActionResult> {
  const selected = selectPublicOperation(input.schema, input.route);
  const envelopeFields = parsePublicOperationRequestEnvelopeFields(input.body);
  const receivedAt = nowIsoString();
  const idempotencyKey =
    envelopeFields.idempotencyKey ??
    (await derivePublicOperationIdempotencyKey({
      entityName: input.route.entityName,
      input: envelopeFields.input,
      operationName: input.route.operationName,
      source: envelopeFields.source,
    }));
  const requestUrlFacts = publicRequestUrlFacts(input.request);
  const unverifiedEnvelope = buildPublicOperationInvocationEnvelope({
    entityName: input.route.entityName,
    host: requestUrlFacts.host,
    identity: input.identity,
    idempotencyKey,
    operationName: input.route.operationName,
    path: requestUrlFacts.path,
    publicInput: envelopeFields.input,
    receivedAt,
    schema: input.schema,
    ...(envelopeFields.source?.siteBlockId === undefined
      ? {}
      : { siteBlockId: envelopeFields.source.siteBlockId }),
  });

  assertPublicOperationInvocationAllowed(input.storage, unverifiedEnvelope);
  recordOperationInvocationAccepted(input.storage, unverifiedEnvelope);

  let parsed: ParsedPublicOperationRequest;
  try {
    assertPublicOperationOrigin(input.request, selected.operation);
    parsed = parsePublicOperationRequest(envelopeFields, selected, input.schema, input.storage);
  } catch (error) {
    recordOperationInvocationFailed(input.storage, unverifiedEnvelope, error);
    throw error;
  }

  const replay = getOperationInvocationById(input.storage, unverifiedEnvelope.invocationId);
  if (replay?.output && (replay.status === "committed" || replay.status === "replayed")) {
    recordOperationInvocationOutcome(input.storage, {
      envelope: unverifiedEnvelope,
      output: replay.output,
      status: "replayed",
    });

    return publicOperationResult({
      invocation: unverifiedEnvelope,
      output: replay.output,
      status: "replayed",
    });
  }

  let verification: PublicActionChallengeVerification;

  try {
    verification = await verifyTurnstileChallenge({
      env: input.env,
      idempotencyKey,
      token: parsed.proof.turnstileToken,
    });
  } catch (error) {
    recordOperationInvocationFailed(input.storage, unverifiedEnvelope, error);
    throw error;
  }

  const envelope = buildPublicOperationInvocationEnvelope({
    entityName: input.route.entityName,
    host: requestUrlFacts.host,
    identity: input.identity,
    idempotencyKey,
    operationName: input.route.operationName,
    path: requestUrlFacts.path,
    proof: publicOperationProof(parsed.proof.turnstileToken, verification),
    publicInput: parsed.input,
    receivedAt,
    schema: input.schema,
    ...(parsed.source?.siteBlockId === undefined ? {} : { siteBlockId: parsed.source.siteBlockId }),
  });
  const response = executeWriteOperationInvocation({
    envelope,
    schema: input.schema,
    storage: input.storage,
    writes: input.writes,
  });

  return publicOperationResult(response);
}

function selectPublicOperation(
  schema: AppSchema,
  route: Pick<PublicOperationRoute, "entityName" | "operationName">,
): SelectedPublicOperation {
  const entity = schema.entities[route.entityName];
  const operation = entity?.operations?.[route.operationName];

  if (!entity || !operation) {
    throw new PublicActionError("Public operation is not available.", 404);
  }

  const publicCommand =
    operation.kind === "command" &&
    ((operation.effect?.type === "runActionKind" && Boolean(operation.effect.action)) ||
      operation.effect?.type === "recordPlan");
  const publicCreate =
    operation.kind === "create" &&
    operation.scope === "collection" &&
    operation.effect?.type === "createRecord" &&
    operation.output.type === "create";

  if (!publicCommand && !publicCreate) {
    throw new PublicActionError("Public operation is not available.", 404);
  }

  return {
    entity,
    entityName: route.entityName,
    operation,
    operationName: route.operationName,
  };
}

function assertPublicOperationOrigin(request: Request, operation: EntityOperationSchema) {
  if (operation.policy?.access?.origin.kind !== "same-origin") {
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
    throw new PublicActionError("Public operation origin is not allowed.", 403);
  }

  if (parsedOrigin.origin !== publicRequestUrlFacts(request).origin) {
    throw new PublicActionError("Public operation origin is not allowed.", 403);
  }
}

function assertPublicOperationInvocationAllowed(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
) {
  const access = envelope.schemaOperation.policy?.access;
  const allowed =
    envelope.schemaOperation.policy?.actors.includes("anonymous") &&
    access?.actor === "anonymous" &&
    access.challenge.kind === "turnstile";

  if (!allowed) {
    const error = new PublicActionError("Public operation is not available.", 404);

    recordOperationInvocationRejected(storage, envelope, error);
    throw error;
  }
}

function parsePublicOperationRequest(
  envelopeFields: PublicOperationRequestEnvelopeFields,
  selected: SelectedPublicOperation,
  schema: AppSchema,
  storage: DurableObjectStorage,
): ParsedPublicOperationRequest {
  if (!selected.operation.input) {
    throw new PublicActionError("Public operation is not available.", 404);
  }

  return {
    input: validateEntityOperationInputContract({
      context: "Public operation input",
      entityName: selected.entityName,
      mapToInputNames: selected.operation.effect?.type === "recordPlan",
      operation: selected.operation,
      operationName: selected.operationName,
      rawInput: envelopeFields.input,
      schema,
      storage,
    }),
    proof: parsePublicOperationProof(envelopeFields.proof),
    ...(envelopeFields.source === undefined ? {} : { source: envelopeFields.source }),
    ...(envelopeFields.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: envelopeFields.idempotencyKey }),
  };
}

function parsePublicOperationRequestEnvelopeFields(
  value: unknown,
): PublicOperationRequestEnvelopeFields {
  if (!isRecord(value)) {
    throw new BadRequestError("Public operation request must be an object.");
  }

  assertExactKeys(
    "Public operation request",
    value,
    ["input"],
    ["proof", "source", "idempotencyKey"],
  );

  return {
    input: value.input,
    proof: value.proof,
    ...(value.source === undefined ? {} : { source: parsePublicOperationSource(value.source) }),
    ...(value.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: parseIdempotencyKey(value.idempotencyKey, "Public operation") }),
  };
}

function parsePublicOperationProof(value: unknown): ParsedPublicOperationRequest["proof"] {
  if (!isRecord(value)) {
    throw new BadRequestError("Public operation proof must be an object.");
  }

  assertExactKeys("Public operation proof", value, ["turnstileToken"]);

  if (typeof value.turnstileToken !== "string" || value.turnstileToken.trim() === "") {
    throw new BadRequestError("Public operation Turnstile token is required.");
  }

  if (value.turnstileToken.length > 2048) {
    throw new BadRequestError("Public operation Turnstile token is too long.");
  }

  return {
    turnstileToken: value.turnstileToken,
  };
}

function parsePublicOperationSource(value: unknown): PublicActionRequestSource {
  if (!isRecord(value)) {
    throw new BadRequestError("Public operation source must be an object.");
  }

  assertExactKeys("Public operation source", value, [], ["siteBlockId"]);

  if (value.siteBlockId === undefined) {
    return {};
  }

  if (typeof value.siteBlockId !== "string" || value.siteBlockId.trim() === "") {
    throw new BadRequestError("Public operation source siteBlockId must be a non-empty string.");
  }

  return { siteBlockId: value.siteBlockId };
}

function parseIdempotencyKey(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} idempotencyKey must be a non-empty string.`);
  }

  if (value.length > 512) {
    throw new BadRequestError(`${context} idempotencyKey must be at most 512 characters.`);
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
    throw new PublicActionError("Public operation challenge is unavailable.", 503);
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
    throw new PublicActionError("Public operation challenge is unavailable.", 503);
  }

  if (!response.ok) {
    throw new PublicActionError("Public operation challenge is unavailable.", 503);
  }

  let body: TurnstileSiteverifyResponse;

  try {
    body = (await response.json()) as TurnstileSiteverifyResponse;
  } catch {
    throw new PublicActionError("Public operation challenge is unavailable.", 503);
  }

  if (body.success !== true) {
    throw new PublicActionError("Public operation challenge failed.", 403);
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

function publicOperationResult(response: OperationInvocationResponse): PublicActionResult {
  if (response.output.type === "create" && response.invocation.operation.kind === "create") {
    return {
      body: {
        invocationId: response.invocation.invocationId,
        operation: {
          entityName: response.invocation.operation.entityName,
          operationName: response.invocation.operation.operationName,
          canonicalKey: response.invocation.operation.canonicalKey,
          kind: "create",
        },
        output: {
          type: "create",
          affectedChangeIds: response.output.affectedChangeIds,
          changes: response.output.changes,
          cursor: response.output.cursor,
          record: response.output.record,
        },
        status: response.status === "replayed" ? "replayed" : "committed",
      },
    };
  }

  if (response.output.type !== "command" || response.invocation.operation.kind !== "command") {
    throw new BadRequestError("Public operation response is not available.");
  }

  return {
    body: {
      invocationId: response.invocation.invocationId,
      operation: {
        entityName: response.invocation.operation.entityName,
        operationName: response.invocation.operation.operationName,
        canonicalKey: response.invocation.operation.canonicalKey,
        kind: "command",
      },
      output: {
        type: "command",
        affectedChangeIds: response.output.affectedChangeIds,
        cursor: response.output.cursor,
        response: {
          actionId: response.output.response.actionId,
          cursor: response.output.response.cursor,
          ...(response.output.response.recordPlan === undefined
            ? {}
            : { recordPlan: response.output.response.recordPlan }),
        },
      },
      status: response.status === "replayed" ? "replayed" : "committed",
    },
  };
}

function publicOperationProof(
  turnstileToken: string,
  verification?: PublicActionChallengeVerification,
): PublicActionProof {
  return {
    kind: "turnstile",
    token: turnstileToken,
    ...(verification === undefined ? {} : { verification }),
  };
}

function publicRequestUrlFacts(request: Request): {
  host: string;
  origin: string;
  path: string;
} {
  const url = new URL(request.url);
  const originalOrigin = request.headers.get(originalRequestOriginHeader);
  const originalHost = request.headers.get(originalRequestHostHeader);
  const origin = originalOrigin ?? `${url.protocol}//${originalHost ?? url.host}`;
  const originUrl = parseUrl(origin);
  const originHeader = parseRequestOriginHeader(request);

  if (isLocalRequestHostname(originUrl?.hostname ?? url.hostname) && originHeader) {
    return {
      host: originHeader.host,
      origin: originHeader.origin,
      path: url.pathname,
    };
  }

  return {
    host: originalHost ?? url.host,
    origin,
    path: url.pathname,
  };
}

function parseRequestOriginHeader(request: Request): URL | undefined {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return undefined;
  }

  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isLocalRequestHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

async function derivePublicOperationIdempotencyKey(input: {
  entityName: string;
  operationName: string;
  input: unknown;
  source: PublicActionRequestSource | undefined;
}) {
  const digest = await sha256Hex(
    stableJson({
      input: input.input,
      operationKey: formatEntityOperationKey({
        entityKey: input.entityName,
        operationKey: input.operationName,
      }),
      source: input.source,
    }),
  );

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
