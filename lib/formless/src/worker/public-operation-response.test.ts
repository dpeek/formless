import type { EntityOperationSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";

import { schemaKeyStorageIdentity } from "../shared/app-storage-identity.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import type { ChangeRow } from "../shared/protocol.ts";
import { shapePublicOperationResponse } from "./public-operation-response.ts";

describe("public operation response shaping", () => {
  it("allowlists committed create output without exposing private execution facts", () => {
    const output = createOutput();
    const response = {
      invocation: publicInvocation("create"),
      output,
      status: "committed",
      proof: { turnstileToken: "private-proof" },
      provider: { secret: "private-provider-secret" },
      notification: { recipient: "owner@example.com", status: "scheduled" },
    } as OperationInvocationResponse;

    const result = shapePublicOperationResponse(response);

    expect(result).toEqual({
      body: {
        invocationId: "operation:contact-message.submit:create-key",
        operation: {
          entityName: "contact-message",
          operationName: "submit",
          canonicalKey: "contact-message.submit",
          kind: "create",
        },
        output,
        status: "committed",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-proof");
    expect(JSON.stringify(result)).not.toContain("private-provider-secret");
    expect(JSON.stringify(result)).not.toContain("owner@example.com");
  });

  it("allowlists replayed command metadata without exposing protected storage fields", () => {
    const output = commandOutput();
    const response = {
      invocation: publicInvocation("command"),
      output: {
        ...output,
        response: { providerMessageId: "private-provider-message" },
        notification: { recipient: "owner@example.com" },
      },
      status: "replayed",
      proof: { turnstileToken: "private-replay-proof" },
    } as OperationInvocationResponse;

    const result = shapePublicOperationResponse(response);

    expect(result).toEqual({
      body: {
        invocationId: "operation:task.submitPublicPlan:command-key",
        operation: {
          entityName: "task",
          operationName: "submitPublicPlan",
          canonicalKey: "task.submitPublicPlan",
          kind: "command",
        },
        output: {
          type: "command",
          affectedChangeIds: ["write-private"],
          cursor: 12,
          recordPlan: {
            steps: [
              {
                name: "createTask",
                kind: "create",
                entity: "task",
                recordId: "task-private",
                changeId: "write-private",
              },
            ],
          },
        },
        status: "replayed",
      },
    });
    expect(result.body.output).not.toHaveProperty("changes");
    expect(JSON.stringify(result)).not.toContain("private-storage-value");
    expect(JSON.stringify(result)).not.toContain("private-provider-message");
    expect(JSON.stringify(result)).not.toContain("owner@example.com");
    expect(JSON.stringify(result)).not.toContain("private-replay-proof");
  });

  it("rejects unsupported and operation-mismatched output shapes", () => {
    const createInvocation = publicInvocation("create");
    const commandInvocation = publicInvocation("command");
    const unsupported: OperationInvocationResponse[] = [
      {
        invocation: createInvocation,
        output: { type: "list", records: [] },
        status: "committed",
      },
      {
        invocation: commandInvocation,
        output: createOutput(),
        status: "committed",
      },
      {
        invocation: createInvocation,
        output: commandOutput(),
        status: "committed",
      },
    ];

    for (const response of unsupported) {
      expect(() => shapePublicOperationResponse(response)).toThrow(
        "Public operation response is not available.",
      );
    }
  });
});

function publicInvocation(kind: "create" | "command"): OperationInvocationEnvelope {
  const create = kind === "create";
  const operationName = create ? "submit" : "submitPublicPlan";
  const entityName = create ? "contact-message" : "task";
  const key = create ? "create-key" : "command-key";
  const operation = operationSchema(kind);

  return {
    invocationId: `operation:${entityName}.${operationName}:${key}`,
    appStorageIdentity: schemaKeyStorageIdentity(create ? "site" : "tasks"),
    actor: { kind: "anonymous" },
    source: {
      protocol: "public",
      host: "example.com",
      path: `/api/${create ? "site" : "tasks"}/public/operations/${entityName}/${operationName}`,
    },
    input: create
      ? {
          type: "create",
          values: { name: "Ada Lovelace" },
        }
      : {
          type: "command",
          input: {
            input: { title: "Public task" },
            proof: {
              kind: "turnstile",
              token: "private-envelope-proof",
              verification: {
                kind: "turnstile",
                success: true,
                verifiedAt: "2026-07-15T00:00:00.000Z",
                hostname: "example.com",
              },
            },
          },
        },
    idempotency: {
      required: true,
      key,
      source: "caller",
      writeIdentity: `operation:${entityName}.${operationName}:${key}`,
    },
    operation: {
      entityName,
      operationName,
      canonicalKey: `${entityName}.${operationName}`,
      kind,
      scope: "collection",
      effect: operation.effect,
      output: operation.output,
      policy: operation.policy,
    },
    receivedAt: "2026-07-15T00:00:00.000Z",
    schemaOperation: operation,
  };
}

function operationSchema(kind: "create" | "command"): EntityOperationSchema {
  return {
    kind,
    scope: "collection",
    input: {
      fields: {
        value: { type: "text", required: true, label: "Value" },
      },
    },
    effect:
      kind === "create"
        ? { type: "createRecord" }
        : {
            type: "recordPlan",
            steps: [],
          },
    output: { type: kind },
    idempotency: { required: true },
    audit: { input: "summary" },
    policy: {
      actors: ["anonymous"],
      access: {
        actor: "anonymous",
        challenge: { kind: "turnstile" },
        origin: { kind: "same-origin" },
      },
    },
  };
}

function createOutput(): Extract<OperationInvocationOutput, { type: "create" }> {
  const record: StoredRecord = {
    id: "contact-message-1",
    entity: "contact-message",
    values: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
  const change: ChangeRow = {
    seq: 11,
    writeId: "write-create",
    operationKind: "create",
    entity: "contact-message",
    recordId: record.id,
    payload: record,
    createdAt: "2026-07-15T00:00:00.000Z",
  };

  return {
    type: "create",
    affectedChangeIds: [change.writeId],
    changes: [change],
    cursor: change.seq,
    record,
  };
}

function commandOutput(): Extract<OperationInvocationOutput, { type: "command" }> {
  const protectedRecord: StoredRecord = {
    id: "task-private",
    entity: "task",
    values: {
      title: "private-storage-value",
      providerSecret: "private-provider-secret",
    },
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };

  return {
    type: "command",
    affectedChangeIds: ["write-private"],
    changes: [
      {
        seq: 12,
        writeId: "write-private",
        operationKind: "create",
        entity: "task",
        recordId: protectedRecord.id,
        payload: protectedRecord,
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    ],
    cursor: 12,
    recordPlan: {
      steps: [
        {
          name: "createTask",
          kind: "create",
          entity: "task",
          recordId: protectedRecord.id,
          changeId: "write-private",
        },
      ],
    },
  };
}
