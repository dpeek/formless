import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";

import { schemaKeyStorageIdentity } from "../shared/app-storage-identity.ts";
import type {
  OperationInvocationOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import type { ChangeRow, PublicOperationResponse } from "../shared/protocol.ts";
import {
  executePublicOperationExecutor,
  type PublicOperationExecutorAdapters,
} from "./public-operation-executor.ts";
import { workerSchemaAppDefinitions } from "./schema-apps.ts";

describe("public operation executor adapters", () => {
  it("shapes committed public responses before after-commit adapters run", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      events,
      output: createPublicCreateOutput(),
    });

    const result = await executePublicOperationExecutor({
      adapters: harness.adapters,
      body: publicContactMessageBody("adapter-create"),
      identity: schemaKeyStorageIdentity("site"),
      request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
      route: {
        entityName: "contact-message",
        operationName: "submit",
        path: "/api/site/public/operations/contact-message/submit",
      },
      schema: workerSchemaAppDefinitions.site.sourceSchema,
    });

    expect(result.body).toMatchObject({
      operation: {
        canonicalKey: "contact-message.submit",
        kind: "create",
      },
      output: {
        type: "create",
      },
      status: "committed",
    });
    expect(events).toEqual(["shape", "afterCommit"]);
    expect(harness.state.afterCommitResponses).toHaveLength(1);
    expect(harness.state.authorityCalls).toBe(1);
    expect(harness.state.challengeCalls).toBe(1);
    expect(harness.state.shapedResponses).toHaveLength(1);
  });

  it("shapes replayed public responses without challenge or after-commit adapters", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      events,
      output: createPublicCreateOutput(),
      replayBeforeChallenge: true,
    });

    const result = await executePublicOperationExecutor({
      adapters: harness.adapters,
      body: publicContactMessageBody("adapter-replay"),
      identity: schemaKeyStorageIdentity("site"),
      request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
      route: {
        entityName: "contact-message",
        operationName: "submit",
        path: "/api/site/public/operations/contact-message/submit",
      },
      schema: workerSchemaAppDefinitions.site.sourceSchema,
    });

    expect(result.body.status).toBe("replayed");
    expect(events).toEqual(["shape"]);
    expect(harness.state.afterCommitResponses).toEqual([]);
    expect(harness.state.authorityCalls).toBe(0);
    expect(harness.state.challengeCalls).toBe(0);
    expect(harness.state.shapedResponses).toHaveLength(1);
  });
});

function publicOperationExecutorHarness(input: {
  events: string[];
  output: Extract<OperationInvocationOutput, { type: "create" | "command" }>;
  replayBeforeChallenge?: boolean;
}) {
  const state = {
    afterCommitResponses: [] as OperationInvocationResponse[],
    authorityCalls: 0,
    challengeCalls: 0,
    shapedResponses: [] as OperationInvocationResponse[],
  };
  const adapters = {
    afterCommit: {
      run: ({ response }) => {
        input.events.push("afterCommit");
        state.afterCommitResponses.push(response);
      },
    },
    authority: {
      execute: ({ envelope }) => {
        state.authorityCalls += 1;

        return operationInvocationResponse(envelope, input.output, "committed");
      },
    },
    challenge: {
      verify: () => {
        state.challengeCalls += 1;

        return {
          kind: "turnstile",
          success: true,
          verifiedAt: "2026-06-26T00:00:00.000Z",
        } as const;
      },
    },
    envelope: {
      buildVerified: ({ unverifiedEnvelope }) => unverifiedEnvelope,
    },
    lifecycle: {
      execute: async (stage) => {
        stage.assertAllowed();
        await stage.beforeReplay();

        if (input.replayBeforeChallenge) {
          return operationInvocationResponse(stage.envelope, input.output, "replayed");
        }

        const envelope = await stage.prepareExecutionEnvelope();

        return stage.execute(envelope);
      },
    },
    response: {
      shape: ({ response }) => {
        input.events.push("shape");
        state.shapedResponses.push(response);

        return {
          body: publicOperationResponse(response),
        };
      },
    },
    validation: {
      validate: ({ rawInput }) => rawInput as RecordValues,
    },
  } satisfies PublicOperationExecutorAdapters;

  return { adapters, state };
}

function operationInvocationResponse(
  invocation: OperationInvocationResponse["invocation"],
  output: Extract<OperationInvocationOutput, { type: "create" | "command" }>,
  status: "committed" | "replayed",
): OperationInvocationResponse {
  return {
    invocation,
    output,
    status,
  };
}

function publicOperationResponse(response: OperationInvocationResponse): PublicOperationResponse {
  if (response.output.type === "create" && response.invocation.operation.kind === "create") {
    return {
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
    };
  }

  if (response.output.type === "command" && response.invocation.operation.kind === "command") {
    return {
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
    };
  }

  throw new Error("Unexpected public operation response.");
}

function publicOperationRequest(path: string): Request {
  return new Request(`https://example.com${path}`, {
    headers: {
      Origin: "https://example.com",
    },
    method: "POST",
  });
}

function publicContactMessageBody(idempotencyKey: string) {
  return {
    input: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    proof: { turnstileToken: "token-ok" },
    source: { siteBlockId: "rec_site_contact_form" },
    idempotencyKey,
  };
}

function createPublicCreateOutput(): Extract<OperationInvocationOutput, { type: "create" }> {
  const record: StoredRecord = {
    id: "contact-message-1",
    entity: "contact-message",
    values: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  };
  const change: ChangeRow = {
    seq: 1,
    writeId: "write-1",
    operationKind: "create",
    entity: "contact-message",
    recordId: record.id,
    payload: record,
    createdAt: "2026-06-26T00:00:00.000Z",
  };

  return {
    type: "create",
    affectedChangeIds: [change.writeId],
    changes: [change],
    cursor: change.seq,
    record,
  };
}
