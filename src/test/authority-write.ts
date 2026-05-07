import { expect } from "vite-plus/test";

import type { ActionResponse, MutationResponse } from "../shared/protocol.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { createWorkerHarness } from "../worker/miniflare-test.ts";

type AuthorityHarness = Pick<Awaited<ReturnType<typeof createWorkerHarness>>, "fetch">;

export type AuthorityWriteHelpers = ReturnType<typeof createAuthorityWriteHelpers>;

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

  async function postMutation(mutationId: string, values: Record<string, unknown>) {
    return postMutationForEntity(mutationId, "task", values);
  }

  async function postMutationForEntity(
    mutationId: string,
    entity: string,
    values: Record<string, unknown>,
  ) {
    const response = await harness.fetch(apiPath("/api/mutations"), {
      body: JSON.stringify({
        mutationId,
        entity,
        op: "create",
        values,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return (await response.json()) as MutationResponse;
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
    return postJson<ActionResponse>("/api/actions", {
      actionId,
      entity,
      action,
      ...extra,
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
