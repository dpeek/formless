import {
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  instanceControlPlaneProductionIdentityFromRecords,
} from "@dpeek/formless-instance-control-plane";
import type {
  AppSchema,
  EntityOperationInputFieldSchema,
  FieldSchema,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { AppStorageIdentity } from "../shared/app-storage-identity.ts";
import { parseEmailDeliveryAddress, type EmailDeliveryAddress } from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { DeploymentControlPlaneClientEnv } from "./deployment-control-plane-client.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import { schedulePlatformEmailDelivery } from "./email-runtime.ts";
import { getBootstrapRecords } from "./storage.ts";

const operationInputNotificationMessageKind = "site-operation-input-notification";
const operationInputNotificationPurpose = "operation-input-notification";

export type SiteOperationInputNotificationEnv = DeploymentControlPlaneClientEnv & {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export async function scheduleSiteOperationInputNotificationAfterPublicOperation(input: {
  env: SiteOperationInputNotificationEnv;
  identity: AppStorageIdentity;
  records?: readonly StoredRecord[];
  requestUrl: string;
  response: OperationInvocationResponse;
  schema: AppSchema;
  storage?: DurableObjectStorage;
}): Promise<void> {
  if (!isCommittedPublicOperation(input.response)) {
    return;
  }

  try {
    const sourceRecords = input.records ?? sourceRecordsFromStorage(input.storage);
    const sourceBlock = operationInputNotificationSourceBlock(sourceRecords, input.response);

    if (!sourceBlock) {
      return;
    }

    const controlPlaneRecords =
      (await readControlPlaneRecords({ env: input.env, requestUrl: input.requestUrl })) ?? [];
    const settings = operationInputNotificationSettings(controlPlaneRecords);
    const canonicalOrigin =
      instanceControlPlaneProductionIdentityFromRecords(controlPlaneRecords)?.canonicalOrigin;
    const authority = input.env.FORMLESS_AUTHORITY;

    if (!settings || !canonicalOrigin || !authority) {
      return;
    }

    const submittedInput = publicOperationSubmittedInput(input.response);
    const fields = operationInputNotificationFields({
      input: submittedInput,
      response: input.response,
      schema: input.schema,
    });

    if (fields.length === 0) {
      return;
    }

    await schedulePlatformEmailDelivery({
      env: { FORMLESS_AUTHORITY: authority },
      requestUrl: input.requestUrl,
      request: {
        canonicalOrigin,
        idempotencyKey: await operationInputNotificationIdempotencyKey(input.response),
        message: renderOperationInputNotificationMessage({
          fields,
          host: input.response.invocation.source.host,
          operationKey: input.response.invocation.operation.canonicalKey,
          path: input.response.invocation.source.path,
          siteBlockId: input.response.invocation.source.siteBlockId,
          storageIdentity: input.identity.authorityName,
        }),
        messageKind: operationInputNotificationMessageKind,
        recipients: [
          {
            address: settings.recipient,
            displayName: "Public operation",
          },
        ],
        ...operationInputNotificationReplyTo({
          input: submittedInput,
          replyToField: stringRecordValue(sourceBlock.values.operationNotificationReplyToField),
        }),
        sender: {
          id: settings.senderId,
        },
        source: {
          operationId: input.response.invocation.invocationId,
          ...createdRecordId(input.response),
          storageIdentity: input.identity.authorityName,
        },
      },
    });
  } catch {
    return;
  }
}

function sourceRecordsFromStorage(
  storage: DurableObjectStorage | undefined,
): readonly StoredRecord[] {
  return storage === undefined ? [] : getBootstrapRecords(storage);
}

function isCommittedPublicOperation(response: OperationInvocationResponse): boolean {
  return response.status === "committed" && response.invocation.source.protocol === "public";
}

function operationInputNotificationSourceBlock(
  records: readonly StoredRecord[],
  response: OperationInvocationResponse,
): StoredRecord | undefined {
  const siteBlockId = response.invocation.source.siteBlockId;

  if (!siteBlockId) {
    return undefined;
  }

  const block = records.find(
    (record) => record.id === siteBlockId && record.entity === "block" && !record.deletedAt,
  );

  if (
    block?.values.type !== "publicOperationForm" ||
    block.values.operationNotificationMode !== "email" ||
    block.values.operationKey !== response.invocation.operation.canonicalKey
  ) {
    return undefined;
  }

  return block;
}

function operationInputNotificationSettings(
  records: readonly StoredRecord[],
): { senderId: string; recipient: string } | undefined {
  const settings = records.find(
    (record) =>
      record.entity === "instance-settings" &&
      !record.deletedAt &&
      record.values.settingsId === INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  );
  const senderId = stringRecordValue(settings?.values.defaultContactSender);
  const recipient = stringRecordValue(settings?.values.contactNotificationRecipient);

  return senderId && recipient ? { senderId, recipient } : undefined;
}

function publicOperationSubmittedInput(
  response: OperationInvocationResponse,
): Record<string, unknown> {
  const invocationInput = response.invocation.input;

  if (invocationInput.type === "create") {
    return recordValue(invocationInput.values);
  }

  if (invocationInput.type !== "command") {
    return {};
  }

  if (response.invocation.operation.effect?.type === "recordPlan") {
    return recordValue(invocationInput.input);
  }

  return recordValue(recordValue(invocationInput.input).input);
}

function operationInputNotificationFields(input: {
  input: Record<string, unknown>;
  response: OperationInvocationResponse;
  schema: AppSchema;
}): Array<{ label: string; value: string }> {
  const entity = input.schema.entities[input.response.invocation.operation.entityName];
  const fields = input.response.invocation.schemaOperation.input?.fields;

  if (!entity || !fields) {
    return [];
  }

  return Object.entries(fields).flatMap(([inputName, field]) => {
    const schemaField = notificationFieldSchema(field, entity.fields);

    if (!schemaField || !supportedNotificationField(schemaField)) {
      return [];
    }

    const value = submittedInputFieldValue(input.input, inputName, field);

    if (value === undefined) {
      return [];
    }

    return [
      {
        label: field.label ?? schemaField.label ?? inputName,
        value: displayOperationInputValue(schemaField, value),
      },
    ];
  });
}

function notificationFieldSchema(
  field: EntityOperationInputFieldSchema,
  entityFields: Record<string, FieldSchema>,
): FieldSchema | undefined {
  if ("field" in field) {
    return entityFields[field.field];
  }

  if (field.type === "text") {
    return {
      type: "text",
      required: field.required,
      label: field.label,
    };
  }

  if (field.type === "boolean") {
    return {
      type: "boolean",
      required: field.required,
      label: field.label,
    };
  }

  if (field.type === "date") {
    return {
      type: "date",
      required: field.required,
      label: field.label,
    };
  }

  if (field.type === "number") {
    return {
      type: "number",
      required: field.required,
      label: field.label,
    };
  }

  if (field.type === "enum") {
    return {
      type: "enum",
      required: field.required,
      label: field.label,
      values: field.values,
    };
  }

  return undefined;
}

function supportedNotificationField(
  field: FieldSchema,
): field is Exclude<FieldSchema, { type: "reference" }> {
  return field.type !== "reference";
}

function submittedInputFieldValue(
  input: Record<string, unknown>,
  inputName: string,
  field: EntityOperationInputFieldSchema,
): unknown {
  if (Object.hasOwn(input, inputName)) {
    return input[inputName];
  }

  if ("field" in field && Object.hasOwn(input, field.field)) {
    return input[field.field];
  }

  return undefined;
}

function displayOperationInputValue(
  field: Exclude<FieldSchema, { type: "reference" }>,
  value: unknown,
) {
  if (field.type === "boolean") {
    return value === true ? "Yes" : value === false ? "No" : String(value);
  }

  if (field.type === "enum" && typeof value === "string") {
    return field.values[value]?.label ?? value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return String(value);
}

function operationInputNotificationReplyTo(input: {
  input: Record<string, unknown>;
  replyToField?: string;
}): { replyTo: EmailDeliveryAddress } | object {
  if (!input.replyToField) {
    return {};
  }

  const value = input.input[input.replyToField];

  if (typeof value !== "string" || value.trim() === "") {
    return {};
  }

  try {
    return {
      replyTo: parseEmailDeliveryAddress("Operation input notification reply-to", {
        address: value,
      }),
    };
  } catch {
    return {};
  }
}

function renderOperationInputNotificationMessage(input: {
  fields: Array<{ label: string; value: string }>;
  host?: string;
  operationKey: string;
  path?: string;
  siteBlockId?: string;
  storageIdentity: string;
}) {
  const facts = [
    { label: "Operation", value: input.operationKey },
    { label: "Target storage", value: input.storageIdentity },
    ...(input.host === undefined ? [] : [{ label: "Host", value: input.host }]),
    ...(input.path === undefined ? [] : [{ label: "Path", value: input.path }]),
    ...(input.siteBlockId === undefined ? [] : [{ label: "Site block", value: input.siteBlockId }]),
  ];
  const textFacts = facts.map((fact) => `${fact.label}: ${fact.value}`);
  const textFields = input.fields.map((field) => `${field.label}: ${field.value}`);
  const htmlFacts = facts
    .map((fact) => `<dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd>`)
    .join("");
  const htmlFields = input.fields
    .map(
      (field) =>
        `<dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value).replaceAll(
          "\n",
          "<br>",
        )}</dd>`,
    )
    .join("");

  return {
    subject: `New public operation input for ${input.operationKey}`.slice(0, 998),
    text: [
      "New public operation form submission",
      "",
      ...textFacts,
      "",
      "Submitted input",
      "",
      ...textFields,
    ].join("\n"),
    html: [
      "<p>New public operation form submission</p>",
      "<dl>",
      htmlFacts,
      "</dl>",
      "<p>Submitted input</p>",
      "<dl>",
      htmlFields,
      "</dl>",
    ].join(""),
  };
}

function createdRecordId(response: OperationInvocationResponse): { recordId: string } | object {
  return response.output.type === "create" ? { recordId: response.output.record.id } : {};
}

async function operationInputNotificationIdempotencyKey(
  response: OperationInvocationResponse,
): Promise<string> {
  const key = response.invocation.idempotency.key ?? response.invocation.invocationId;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${operationInputNotificationPurpose}\n${response.invocation.operation.canonicalKey}\n${key}`,
    ),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${operationInputNotificationPurpose}:${hex}`;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
