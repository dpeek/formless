import { expect } from "vite-plus/test";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { ChangeRow } from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { createWorkerHarness } from "../worker/miniflare-test.ts";

type AuthorityHarness = Pick<Awaited<ReturnType<typeof createWorkerHarness>>, "fetch">;

export type AuthorityWriteHelpers = ReturnType<typeof createAuthorityWriteHelpers>;
export type AuthorityTestRecordOperationResult = {
  changes: ChangeRow[];
  cursor: number;
  record: StoredRecord;
  writeIdentity: string;
};
export type AuthorityTestCommandOperationResult = {
  changes: ChangeRow[];
  cursor: number;
  writeIdentity: string;
};
export type AuthorityTestRecordOperationRequest = {
  entity: string;
  idempotencyKey: string;
  input?: unknown;
  operationName: string;
  recordId?: string;
};
export type AuthorityTestCommandOperationRequest = {
  entity: string;
  idempotencyKey: string;
  input?: unknown;
  operationName: string;
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
    const response = await harness.fetch(apiPath(path), {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return (await response.json()) as T;
  }

  async function postCreateOperation(idempotencyKey: string, values: Record<string, unknown>) {
    return postCreateOperationForEntity(idempotencyKey, "task", values);
  }

  async function postCreateOperationForEntity(
    idempotencyKey: string,
    entity: string,
    values: Record<string, unknown>,
  ) {
    const response = await harness.fetch(apiPath(`/api/operations/${entity}/create`), {
      body: JSON.stringify({
        idempotencyKey,
        input: values,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return recordOperationResultFromOperation(await response.json(), idempotencyKey);
  }

  async function postCommandOperation(idempotencyKey: string, operationName: string) {
    return postCommandOperationForEntity(idempotencyKey, "task", operationName);
  }

  async function postCommandOperationForEntity(
    idempotencyKey: string,
    entity: string,
    operationName: string,
    extra: Record<string, unknown> = {},
  ) {
    const operation = await postJson<OperationInvocationResponse>(
      `/api/operations/${entity}/${operationName}`,
      {
        idempotencyKey,
        ...extra,
      },
    );

    if (operation.output.type !== "command") {
      throw new Error(`Expected command output for operation "${entity}.${operationName}".`);
    }

    return commandOperationResultFromResponse(operation);
  }

  async function postRecordOperationRequest(requestBody: AuthorityTestRecordOperationRequest) {
    const request = recordOperationRequest(requestBody);
    const response = await harness.fetch(apiPath(request.path), {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return request.response(await response.json());
  }

  async function expectRecordOperationError(
    requestBody: AuthorityTestRecordOperationRequest,
    message: string,
  ) {
    const request = recordOperationRequest(requestBody);
    const response = await harness.fetch(apiPath(request.path), {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: expect.stringContaining(message),
    });
  }

  async function expectCommandOperationError(
    requestBody: AuthorityTestCommandOperationRequest,
    message: string,
  ) {
    const request = commandOperationRequest(requestBody);
    const response = await harness.fetch(apiPath(request.path), {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: expect.stringContaining(message),
    });
  }

  async function expectError(path: string, body: unknown, message: string) {
    const response = await harness.fetch(apiPath(path), {
      body: body === undefined ? undefined : JSON.stringify(body),
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
    expectCommandOperationError,
    expectError,
    expectRecordOperationError,
    expectNotFound,
    getJson,
    postCommandOperation,
    postCommandOperationForEntity,
    postCreateOperation,
    postCreateOperationForEntity,
    postJson,
    postRecordOperationRequest,
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

  if (isControlPlaneLegacyWritePath(path)) {
    throw new Error(`Control-plane tests must call operation routes instead of "${path}".`);
  }

  if ((mutationPath || actionPath) && isAppStorageLegacyWritePath(path)) {
    throw new Error(`App storage tests must call operation routes instead of "${path}".`);
  }

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
        response: (value) => recordOperationResultFromOperation(value, mutationId),
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
        response: (value) => recordOperationResultFromOperation(value, mutationId),
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
        response: (value) => recordOperationResultFromOperation(value, mutationId),
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
      response: commandOperationResultFromOperation,
    };
  }

  return { body, path, response: (value) => value };
}

export function recordOperationRequest(requestBody: AuthorityTestRecordOperationRequest): {
  body: unknown;
  path: string;
  response: (value: unknown) => AuthorityTestRecordOperationResult;
} {
  const idempotencyKey = parseNonEmptyString("idempotencyKey", requestBody.idempotencyKey);
  const entity = parseNonEmptyString("entity", requestBody.entity);
  const operationName = parseNonEmptyString("operationName", requestBody.operationName);

  if (operationName === "create") {
    return {
      body: {
        idempotencyKey,
        input: requestBody.input,
      },
      path: `/api/operations/${entity}/create`,
      response: (value) => recordOperationResultFromOperation(value, idempotencyKey),
    };
  }

  if (operationName === "update") {
    return {
      body: {
        idempotencyKey,
        input: requestBody.input,
        recordId: requestBody.recordId,
      },
      path: `/api/operations/${entity}/update`,
      response: (value) => recordOperationResultFromOperation(value, idempotencyKey),
    };
  }

  if (operationName === "delete") {
    return {
      body: {
        idempotencyKey,
        ...(requestBody.input === undefined ? {} : { input: requestBody.input }),
        recordId: requestBody.recordId,
      },
      path: `/api/operations/${entity}/delete`,
      response: (value) => recordOperationResultFromOperation(value, idempotencyKey),
    };
  }

  throw new Error(`Unsupported record operation "${operationName}".`);
}

export function commandOperationRequest(requestBody: AuthorityTestCommandOperationRequest): {
  body: unknown;
  path: string;
  response: (value: unknown) => AuthorityTestCommandOperationResult;
} {
  const idempotencyKey = parseNonEmptyString("idempotencyKey", requestBody.idempotencyKey);
  const entity = parseNonEmptyString("entity", requestBody.entity);
  const operationName = parseNonEmptyString("operationName", requestBody.operationName);

  return {
    body: {
      idempotencyKey,
      ...(requestBody.input === undefined ? {} : { input: requestBody.input }),
    },
    path: `/api/operations/${entity}/${operationName}`,
    response: commandOperationResultFromOperation,
  };
}

function isAppStorageLegacyWritePath(path: string) {
  if (path === "/mutations" || path === "/actions") {
    return true;
  }

  if (path === "/api/mutations" || path === "/api/actions") {
    return true;
  }

  if (/^\/api\/(?:tasks|site|crm)\/(?:mutations|actions)$/.test(path)) {
    return true;
  }

  return /^\/api\/app-installs\/[^/]+\/[^/]+\/(?:mutations|actions)$/.test(path);
}

function isControlPlaneLegacyWritePath(path: string) {
  return /^\/api\/formless\/control-plane\/(?:mutations|actions)(?:\/.*)?$/.test(path);
}

function recordOperationResultFromOperation(
  value: unknown,
  fallbackWriteIdentity: string,
): AuthorityTestRecordOperationResult {
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
    record:
      operation.output.type === "delete"
        ? operation.output.changes[0]?.payload
        : operation.output.record,
    writeIdentity:
      operation.invocation.idempotency.writeIdentity ??
      operation.output.changes[0]?.mutationId ??
      fallbackWriteIdentity,
  };
}

function commandOperationResultFromOperation(value: unknown): AuthorityTestCommandOperationResult {
  const operation = value as OperationInvocationResponse;

  if (operation.output.type !== "command") {
    throw new Error("Expected command operation output.");
  }

  return commandOperationResultFromResponse(operation);
}

function commandOperationResultFromResponse(
  operation: OperationInvocationResponse,
): AuthorityTestCommandOperationResult {
  if (operation.output.type !== "command") {
    throw new Error("Expected command operation output.");
  }

  return {
    changes: operation.output.changes,
    cursor: operation.output.cursor,
    writeIdentity:
      operation.invocation.idempotency.writeIdentity ?? operation.invocation.invocationId,
  };
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
