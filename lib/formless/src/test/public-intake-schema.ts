import type { AppSchema } from "@dpeek/formless-schema";

export const emailStylePublicIntakeOperationKey = "intake-request.submit";
export const emailStylePublicIntakeFormBlockId = "rec_site_block_email_style_public_intake";

export const emailStylePublicIntakeInput = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Please send manual intake details.",
  requestType: "general",
  neededBy: "2026-07-15",
  quantity: 2,
} satisfies Record<string, unknown>;

export const emailStylePublicIntakeFormBlockValues = {
  type: "publicOperationForm",
  label: "Request manual intake",
  body: "Send the request details for manual follow-up.",
  operationTargetKind: "schemaKey",
  operationTargetSchemaKey: "site",
  operationKey: emailStylePublicIntakeOperationKey,
  buttonLabel: "Send request",
  successLabel: "Request received.",
  operationNotificationMode: "email",
  operationNotificationReplyToField: "email",
} satisfies Record<string, unknown>;

export function schemaWithEmailStylePublicIntake(sourceSchema: AppSchema): AppSchema {
  const schema = structuredClone(sourceSchema);

  schema.entities["intake-request"] = {
    label: "Intake request",
    fields: {
      name: {
        type: "text",
        required: true,
        label: "Name",
      },
      email: {
        type: "text",
        required: true,
        label: "Email",
      },
      message: {
        type: "text",
        required: true,
        label: "Request details",
        format: "longText",
      },
      requestType: {
        type: "enum",
        required: false,
        label: "Request type",
        values: {
          general: { label: "General" },
          priority: { label: "Priority" },
        },
      },
      neededBy: {
        type: "date",
        required: false,
        label: "Needed by",
      },
      quantity: {
        type: "number",
        required: false,
        label: "Quantity",
        min: 1,
      },
    },
    operations: {
      submit: {
        label: "Submit intake request",
        kind: "create",
        scope: "collection",
        input: {
          fields: {
            name: {
              field: "name",
              required: true,
              label: "Your name",
            },
            email: {
              field: "email",
              required: true,
              label: "Email",
            },
            message: {
              field: "message",
              required: true,
              label: "Request details",
            },
            requestType: {
              field: "requestType",
              label: "Request type",
            },
            neededBy: {
              field: "neededBy",
              label: "Needed by",
            },
            quantity: {
              field: "quantity",
              label: "Quantity",
            },
          },
        },
        effect: {
          type: "createRecord",
        },
        output: {
          type: "create",
        },
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            challenge: {
              kind: "turnstile",
            },
            origin: {
              kind: "same-origin",
            },
          },
        },
        idempotency: {
          required: true,
        },
        audit: {
          input: "summary",
        },
      },
    },
  };

  return schema;
}
