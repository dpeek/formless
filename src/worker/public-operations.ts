import type { AppStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  PublicOperationRouteError,
  parsePublicOperationRouteSuffix,
} from "@dpeek/formless-public-operations";
import type { PublicOperationResponse } from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
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
import {
  buildVerifiedPublicOperationTurnstileProof,
  type PublicOperationTurnstileChallengeEnv,
  verifyPublicOperationTurnstileChallenge,
} from "./public-operation-turnstile-challenge.ts";
import { type WriteOutcome } from "./storage.ts";

export type PublicOperationEnv = PublicOperationTurnstileChallengeEnv;

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

const publicOperationRoutePrefix = "/public/operations/";

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
        verifyPublicOperationTurnstileChallenge({
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
    proof: buildVerifiedPublicOperationTurnstileProof({
      token: stage.parsed.proof.turnstileToken,
      verification: stage.verification,
    }),
    publicInput: stage.parsed.input,
    receivedAt: stage.receivedAt,
    schema: input.schema,
    ...(stage.parsed.source?.siteBlockId === undefined
      ? {}
      : { siteBlockId: stage.parsed.source.siteBlockId }),
  });
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
