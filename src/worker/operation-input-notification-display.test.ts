import type { AppSchema, EntityOperationSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import { schemaKeyStorageIdentity } from "../shared/app-storage-identity.ts";
import type {
  OperationInvocationInput,
  OperationInvocationOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import { operationInputNotificationDisplayRows } from "./operation-input-notification-display.ts";

describe("operation input notification display rows", () => {
  it("projects create input from public-safe fields and stored entity field names", () => {
    const operation = createRequestOperation();
    const rows = operationInputNotificationDisplayRows({
      response: operationResponse({
        input: {
          type: "create",
          values: {
            fullName: "Ada Lovelace",
            tier: "priority",
            acceptedTerms: true,
            quantity: 3,
            ownerId: "owner-1",
          },
        },
        operation,
        output: createOperationOutput({
          acceptedTerms: true,
          fullName: "Ada Lovelace",
          ownerId: "owner-1",
          quantity: 3,
          tier: "priority",
        }),
      }),
      schema: requestSchema(operation),
    });

    expect(rows).toEqual([
      { label: "Applicant", value: "Ada Lovelace" },
      { label: "Tier", value: "Priority" },
      { label: "Accepted terms", value: "Yes" },
      { label: "Quantity", value: "3" },
    ]);
  });

  it("projects record-plan command input keyed by operation input names", () => {
    const operation = recordPlanRequestOperation();

    expect(
      operationInputNotificationDisplayRows({
        response: operationResponse({
          input: {
            type: "command",
            input: {
              applicantName: "Grace Hopper",
              tier: "standard",
              acceptedTerms: false,
              quantity: 2.5,
            },
          },
          operation,
          output: commandOperationOutput(),
        }),
        schema: requestSchema(operation),
      }),
    ).toEqual([
      { label: "Applicant", value: "Grace Hopper" },
      { label: "Tier", value: "Standard" },
      { label: "Accepted terms", value: "No" },
      { label: "Quantity", value: "2.5" },
    ]);
  });

  it("projects handler command input from the public command wrapper", () => {
    const operation = handlerRequestOperation();

    expect(
      operationInputNotificationDisplayRows({
        response: operationResponse({
          input: {
            type: "command",
            input: {
              input: {
                email: "ada@example.com",
                wantsNewsletter: true,
              },
              proof: { kind: "turnstile", token: "token-ok" },
            },
          },
          operation,
          output: commandOperationOutput(),
        }),
        schema: requestSchema(operation),
      }),
    ).toEqual([
      { label: "Email", value: "ada@example.com" },
      { label: "Wants newsletter", value: "Yes" },
    ]);
  });

  it("returns no rows when the target entity is missing", () => {
    expect(
      operationInputNotificationDisplayRows({
        response: operationResponse({
          input: {
            type: "create",
            values: {
              applicantName: "Ada Lovelace",
            },
          },
          operation: createRequestOperation(),
          output: createOperationOutput({ applicantName: "Ada Lovelace" }),
        }),
        schema: {
          version: 1,
          entities: {},
          queries: {},
          itemViews: {},
          tableViews: {},
          views: {},
        },
      }),
    ).toEqual([]);
  });
});

function requestSchema(operation: EntityOperationSchema): AppSchema {
  return {
    version: 1,
    entities: {
      request: {
        label: "Request",
        fields: {
          fullName: { type: "text", required: true, label: "Full name" },
          tier: {
            type: "enum",
            required: true,
            label: "Tier",
            values: {
              priority: { label: "Priority" },
              standard: { label: "Standard" },
            },
          },
          acceptedTerms: { type: "boolean", required: false, label: "Accepted terms" },
          quantity: { type: "number", required: false, label: "Quantity" },
          ownerId: { type: "reference", required: false, label: "Owner", to: "user" },
        },
        operations: {
          submit: operation,
        },
      },
    },
    queries: {},
    itemViews: {},
    tableViews: {},
    views: {},
  };
}

function createRequestOperation(): EntityOperationSchema {
  return {
    label: "Submit request",
    kind: "create",
    scope: "collection",
    input: {
      fields: {
        applicantName: { field: "fullName", required: true, label: "Applicant" },
        tier: { field: "tier", required: true },
        acceptedTerms: { field: "acceptedTerms", required: false },
        quantity: { field: "quantity", required: false },
        owner: { field: "ownerId", required: false },
      },
    },
    effect: { type: "createRecord" },
    output: { type: "create" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function recordPlanRequestOperation(): EntityOperationSchema {
  return {
    ...createRequestOperation(),
    kind: "command",
    effect: { type: "recordPlan", steps: [] },
    output: { type: "command" },
  };
}

function handlerRequestOperation(): EntityOperationSchema {
  return {
    label: "Subscribe",
    kind: "command",
    scope: "collection",
    input: {
      fields: {
        email: { type: "text", required: true, label: "Email" },
        wantsNewsletter: { type: "boolean", required: false, label: "Wants newsletter" },
      },
    },
    effect: { type: "operationHandler", handler: "subscribe", config: {} },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function operationResponse(input: {
  input: OperationInvocationInput;
  operation: EntityOperationSchema;
  output: OperationInvocationOutput;
}): OperationInvocationResponse {
  return {
    invocation: {
      invocationId: "operation:request.submit:notification-display",
      actor: { kind: "anonymous" },
      appStorageIdentity: schemaKeyStorageIdentity("site"),
      idempotency: {
        required: true,
        key: "notification-display",
        source: "caller",
        writeIdentity: "operation:request.submit:notification-display",
      },
      input: input.input,
      operation: {
        entityName: "request",
        operationName: "submit",
        canonicalKey: "request.submit",
        kind: input.operation.kind,
        scope: input.operation.scope,
        output: input.operation.output,
        ...(input.operation.effect === undefined ? {} : { effect: input.operation.effect }),
      },
      receivedAt: "2026-06-24T00:00:00.000Z",
      schemaOperation: input.operation,
      source: {
        protocol: "public",
        host: "www.example.com",
        path: "/api/site/public/operations/request/submit",
        siteBlockId: "form-block",
      },
    },
    output: input.output,
    status: "committed",
  };
}

function createOperationOutput(
  values: Record<string, string | boolean | number>,
): OperationInvocationOutput {
  return {
    type: "create",
    affectedChangeIds: ["change-1"],
    changes: [],
    cursor: 1,
    record: {
      id: "request-1",
      entity: "request",
      values,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
  };
}

function commandOperationOutput(): OperationInvocationOutput {
  return {
    type: "command",
    affectedChangeIds: ["change-1"],
    changes: [],
    cursor: 1,
  };
}
