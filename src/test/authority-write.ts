import { expect } from "vite-plus/test";

import type { ChangeRow, StoredRecord } from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { createWorkerHarness } from "../worker/miniflare-test.ts";

type AuthorityHarness = Pick<Awaited<ReturnType<typeof createWorkerHarness>>, "fetch">;

export type AuthorityWriteHelpers = ReturnType<typeof createAuthorityWriteHelpers>;
export type AuthorityTestMutationResult = {
  changes: ChangeRow[];
  cursor: number;
  mutationId: string;
  record: StoredRecord;
};
export type AuthorityTestActionResult = {
  actionId: string;
  changes: ChangeRow[];
  cursor: number;
};

export function createAuthorityWriteHelpers(
  harness: AuthorityHarness,
  initialSchemaKey: SchemaKey = "tasks",
) {
  let currentSchemaKey = initialSchemaKey;

  function useSchemaApp(schemaKey: SchemaKey) {
    currentSchemaKey = schemaKey;
  }

  function apiPath(path: string, schemaKey = currentSchemaKey) {
    if (!path.startsWith("/api/")) {
      throw new Error(`Expected API path, received "${path}".`);
    }

    return `/api/${schemaKey}${path.slice("/api".length)}`;
  }

  async function resetSchemaApp(schemaKey: SchemaKey) {
    const response = await harness.fetch(`/api/${schemaKey}/reset/seed`, {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
  }

  async function getJson<T>(path: string) {
    const response = await harness.fetch(apiPath(path));

    expect(response.status).toBe(200);

    return (await response.json()) as T;
  }

  async function postJson<T>(path: string, body: unknown) {
    const request = operationWriteRequest(path, body);
    const response = await harness.fetch(apiPath(request.path), {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return request.response(await response.json()) as T;
  }

  async function postMutation(mutationId: string, values: Record<string, unknown>) {
    return postMutationForEntity(mutationId, "task", values);
  }

  async function postMutationForEntity(
    mutationId: string,
    entity: string,
    values: Record<string, unknown>,
  ) {
    const response = await harness.fetch(apiPath(`/api/operations/${entity}/create`), {
      body: JSON.stringify({
        idempotencyKey: mutationId,
        input: values,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return mutationResultFromOperation(await response.json(), mutationId);
  }

  async function postAction(actionId: string, action: string) {
    return postActionForEntity(actionId, "task", action);
  }

  async function postActionForEntity(
    actionId: string,
    entity: string,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    const operation = await postJson<OperationInvocationResponse>(
      `/api/operations/${entity}/${action}`,
      {
        idempotencyKey: actionId,
        ...extra,
      },
    );

    if (operation.output.type !== "command") {
      throw new Error(`Expected command output for operation "${entity}.${action}".`);
    }

    return operation.output.response satisfies AuthorityTestActionResult;
  }

  async function expectError(path: string, body: unknown, message: string) {
    const request =
      body === undefined
        ? { body, path, response: (value: unknown) => value }
        : operationWriteRequest(path, body);
    const response = await harness.fetch(apiPath(request.path), {
      body: body === undefined ? undefined : JSON.stringify(request.body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method: body === undefined ? "GET" : "POST",
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: expect.stringContaining(message),
    });
  }

  async function expectNotFound(path: string) {
    const response = await harness.fetch(path);

    expect(response.status).toBe(404);
  }

  return {
    apiPath,
    expectError,
    expectNotFound,
    getJson,
    postAction,
    postActionForEntity,
    postJson,
    postMutation,
    postMutationForEntity,
    resetSchemaApp,
    useSchemaApp,
  };
}

export function operationWriteRequest(
  path: string,
  body: unknown,
): {
  body: unknown;
  path: string;
  response: (value: unknown) => unknown;
} {
  const mutationSuffix = "/mutations";
  const actionSuffix = "/actions";
  const mutationPath = path.endsWith(mutationSuffix);
  const actionPath = path.endsWith(actionSuffix);
  const prefix = mutationPath
    ? path.slice(0, -mutationSuffix.length)
    : actionPath
      ? path.slice(0, -actionSuffix.length)
      : path;

  if (!mutationPath && !actionPath) {
    return { body, path, response: (value) => value };
  }

  const request = parseRecord("Authority write helper request", body);

  if (mutationPath) {
    const mutationId = parseNonEmptyString("mutationId", request.mutationId);
    const entity = parseNonEmptyString("entity", request.entity);
    const op = parseNonEmptyString("op", request.op);

    if (op === "create") {
      return {
        body: {
          idempotencyKey: mutationId,
          input: request.values,
        },
        path: `${prefix}/operations/${entity}/create`,
        response: (value) => mutationResultFromOperation(value, mutationId),
      };
    }

    if (op === "patch") {
      return {
        body: {
          idempotencyKey: mutationId,
          input: request.values,
          recordId: request.recordId,
        },
        path: `${prefix}/operations/${entity}/update`,
        response: (value) => mutationResultFromOperation(value, mutationId),
      };
    }

    if (op === "delete") {
      return {
        body: {
          idempotencyKey: mutationId,
          ...(request.values === undefined ? {} : { input: request.values }),
          recordId: request.recordId,
        },
        path: `${prefix}/operations/${entity}/delete`,
        response: (value) => mutationResultFromOperation(value, mutationId),
      };
    }
  }

  if (actionPath) {
    const actionId = parseNonEmptyString("actionId", request.actionId);
    const entity = parseNonEmptyString("entity", request.entity);
    const action = parseNonEmptyString("action", request.action);

    return {
      body: {
        idempotencyKey: actionId,
        ...(request.input === undefined ? {} : { input: request.input }),
      },
      path: `${prefix}/operations/${entity}/${action}`,
      response: actionResultFromOperation,
    };
  }

  return { body, path, response: (value) => value };
}

function mutationResultFromOperation(
  value: unknown,
  fallbackMutationId: string,
): AuthorityTestMutationResult {
  const operation = value as OperationInvocationResponse;

  if (
    operation.output.type !== "create" &&
    operation.output.type !== "update" &&
    operation.output.type !== "delete"
  ) {
    throw new Error("Expected write operation output.");
  }

  return {
    changes: operation.output.changes,
    cursor: operation.output.cursor,
    mutationId: operation.output.changes[0]?.mutationId ?? fallbackMutationId,
    record:
      operation.output.type === "delete"
        ? operation.output.changes[0]?.payload
        : operation.output.record,
  };
}

function actionResultFromOperation(value: unknown): AuthorityTestActionResult {
  const operation = value as OperationInvocationResponse;

  if (operation.output.type !== "command") {
    throw new Error("Expected command operation output.");
  }

  return operation.output.response;
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}
