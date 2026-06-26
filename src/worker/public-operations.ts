import type { AppStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  PublicOperationRouteError,
  parsePublicOperationRouteSuffix,
} from "@dpeek/formless-public-operations";
import type {
  PublicOperationChallengeVerification,
  PublicOperationProof,
  PublicOperationResponse,
} from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { nowIsoString } from "../shared/clock.ts";
import { turnstileSecretKeyFromEnv, type TurnstileRuntimeEnv } from "../shared/turnstile-config.ts";
import {
  buildPublicOperationInvocationEnvelope,
  executeWriteOperationInvocation,
} from "./entity-operations.ts";
import { BadRequestError } from "./errors.ts";
import { executePublicOperationInvocationLifecycle } from "./operation-invocation-lifecycle.ts";
import { validatePublicOperationInputValues } from "./operation-input-validation.ts";
import {
  executePublicOperationExecutor,
  PublicOperationError,
  type PublicOperationExecutorAdapters,
  type PublicOperationExecutorResult,
  type PublicOperationExecutorRoute,
  type PublicOperationVerifiedEnvelopeInput,
} from "./public-operation-executor.ts";
import { type WriteOutcome } from "./storage.ts";

export type PublicOperationEnv = TurnstileRuntimeEnv & {
  FORMLESS_TURNSTILE_SITEVERIFY?: Fetcher;
};

export { PublicOperationError };

export type PublicOperationRoute = PublicOperationExecutorRoute;

export type PublicOperationResult =
  | PublicOperationExecutorResult
  | {
      body: PublicOperationResponse | { error: string };
      headers?: HeadersInit;
      status?: number;
    };

export type PublicOperationWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type PublicOperationExecutionInput = {
  afterCommit?: (response: OperationInvocationResponse) => Promise<void> | void;
  body: unknown;
  env: PublicOperationEnv;
  identity: AppStorageIdentity;
  request: Request;
  route: PublicOperationRoute;
  schema: AppSchema;
  storage: DurableObjectStorage;
  writes: PublicOperationWriteNotifier;
};

type TurnstileSiteverifyResponse = {
  success?: unknown;
  challenge_ts?: unknown;
  hostname?: unknown;
};

const publicOperationRoutePrefix = "/public/operations/";
const turnstileSiteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function selectPublicOperationRoute(input: {
  method: string;
  path: string;
}): PublicOperationRoute | undefined {
  if (input.method !== "POST" || !input.path.startsWith(publicOperationRoutePrefix)) {
    return undefined;
  }

  let routeParts: ReturnType<typeof parsePublicOperationRouteSuffix>;
  try {
    routeParts = parsePublicOperationRouteSuffix(input.path);
  } catch (error) {
    throw publicOperationRouteBadRequest(error);
  }

  return {
    entityName: routeParts.entityKey,
    operationName: routeParts.operationKey,
    path: input.path,
  };
}

function publicOperationRouteBadRequest(error: unknown): BadRequestError {
  if (error instanceof PublicOperationRouteError) {
    if (error.code === "invalid-escape") {
      return new BadRequestError("Public operation route segments must be valid URL path text.");
    }

    if (error.code === "empty-segment") {
      return new BadRequestError("Public operation entity and operation must be non-empty.");
    }
  }

  return new BadRequestError(
    "Public operation route must use /public/operations/:entity/:operation.",
  );
}

export async function executePublicOperationRequest(
  input: PublicOperationExecutionInput,
): Promise<PublicOperationResult> {
  return executePublicOperationExecutor({
    adapters: publicOperationExecutorAdapters(input),
    body: input.body,
    identity: input.identity,
    request: input.request,
    route: input.route,
    schema: input.schema,
  });
}

function publicOperationExecutorAdapters(
  input: PublicOperationExecutionInput,
): PublicOperationExecutorAdapters {
  return {
    afterCommit: {
      run: ({ response }) => input.afterCommit?.(response),
    },
    authority: {
      execute: ({ envelope }) =>
        executeWriteOperationInvocation({
          envelope,
          schema: input.schema,
          storage: input.storage,
          writes: input.writes,
        }),
    },
    challenge: {
      verify: (stage) =>
        verifyTurnstileChallenge({
          env: input.env,
          idempotencyKey: stage.idempotencyKey,
          token: stage.parsed.proof.turnstileToken,
        }),
    },
    envelope: {
      buildVerified: (stage) => buildVerifiedPublicOperationEnvelope(input, stage),
    },
    lifecycle: {
      execute: (stage) =>
        executePublicOperationInvocationLifecycle({
          ...stage,
          storage: input.storage,
        }),
    },
    response: {
      shape: ({ response }) => shapePublicOperationResponse(response),
    },
    validation: {
      validate: ({ rawInput, selected }) =>
        validatePublicOperationInputValues({
          context: "Public operation input",
          entityName: selected.entityName,
          operation: selected.operation,
          operationName: selected.operationName,
          rawInput,
          schema: input.schema,
          storage: input.storage,
        }),
    },
  };
}

function buildVerifiedPublicOperationEnvelope(
  input: PublicOperationExecutionInput,
  stage: PublicOperationVerifiedEnvelopeInput,
) {
  return buildPublicOperationInvocationEnvelope({
    entityName: input.route.entityName,
    host: stage.requestUrlFacts.host,
    identity: input.identity,
    idempotencyKey: stage.idempotencyKey,
    operationName: input.route.operationName,
    path: stage.requestUrlFacts.path,
    proof: publicOperationProof(stage.parsed.proof.turnstileToken, stage.verification),
    publicInput: stage.parsed.input,
    receivedAt: stage.receivedAt,
    schema: input.schema,
    ...(stage.parsed.source?.siteBlockId === undefined
      ? {}
      : { siteBlockId: stage.parsed.source.siteBlockId }),
  });
}

async function verifyTurnstileChallenge(input: {
  env: PublicOperationEnv;
  idempotencyKey: string;
  token: string;
}): Promise<PublicOperationChallengeVerification> {
  const secret = turnstileSecretKeyFromEnv(input.env);

  if (!secret) {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  let response: Response;

  try {
    response = await turnstileFetch(
      input.env,
      new Request(turnstileSiteverifyUrl, {
        body: JSON.stringify({
          secret,
          response: input.token,
          idempotency_key: await turnstileSiteverifyIdempotencyKey(input.idempotencyKey),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
  } catch {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  let body: TurnstileSiteverifyResponse;

  try {
    body = (await response.json()) as TurnstileSiteverifyResponse;
  } catch {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  if (body.success !== true) {
    throw new PublicOperationError("Public operation challenge failed.", 403);
  }

  if (!response.ok) {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  return {
    kind: "turnstile",
    success: true,
    verifiedAt: nowIsoString(),
    ...(typeof body.challenge_ts === "string" ? { challengeTs: body.challenge_ts } : {}),
    ...(typeof body.hostname === "string" ? { hostname: body.hostname } : {}),
  };
}

async function turnstileSiteverifyIdempotencyKey(publicOperationIdempotencyKey: string) {
  if (isUuid(publicOperationIdempotencyKey)) {
    return publicOperationIdempotencyKey;
  }

  // Cloudflare requires a UUID; public operation idempotency keys are domain-scoped text.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`turnstile-siteverify:${publicOperationIdempotencyKey}`),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return uuidFromBytes(bytes);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function uuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function turnstileFetch(env: PublicOperationEnv, request: Request): Promise<Response> {
  return env.FORMLESS_TURNSTILE_SITEVERIFY
    ? env.FORMLESS_TURNSTILE_SITEVERIFY.fetch(request)
    : fetch(request);
}

function shapePublicOperationResponse(
  response: OperationInvocationResponse,
): PublicOperationExecutorResult {
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
        ...(response.output.recordPlan === undefined
          ? {}
          : { recordPlan: response.output.recordPlan }),
      },
      status: response.status === "replayed" ? "replayed" : "committed",
    },
  };
}

function publicOperationProof(
  turnstileToken: string,
  verification?: PublicOperationChallengeVerification,
): PublicOperationProof {
  return {
    kind: "turnstile",
    token: turnstileToken,
    ...(verification === undefined ? {} : { verification }),
  };
}
