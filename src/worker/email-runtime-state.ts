import {
  emailDeliveryIdempotencyScope,
  emailDeliveryStatuses,
  parseEmailDeliveryAddress,
  type EmailDeliveryAddress,
  type EmailDeliveryRecord,
  type EmailDeliveryScheduleRequest,
  type EmailDeliverySender,
  type EmailDeliveryStatus,
} from "../shared/email-runtime.ts";

type EmailDeliveryRow = {
  accepted_at: string | null;
  attempt_count: number;
  canonical_origin: string;
  created_at: string;
  delivery_id: string;
  failed_at: string | null;
  first_attempted_at: string | null;
  idempotency_key: string;
  latest_attempted_at: string | null;
  latest_error: string | null;
  message_kind: string;
  provider_family: "cloudflare";
  provider_message_id: string | null;
  recipients_json: string;
  reply_to_json: string | null;
  sender_address: string;
  sender_display_name: string | null;
  sender_id: string;
  source_operation_id: string | null;
  source_record_id: string | null;
  source_storage_identity: string;
  status: EmailDeliveryStatus;
  updated_at: string;
};

export type CreateEmailDeliveryInput = {
  now: string;
  request: EmailDeliveryScheduleRequest;
  sender: EmailDeliverySender;
};

export type CreateEmailDeliveryResult = {
  delivery: EmailDeliveryRecord;
  replayed: boolean;
};

export const emailDeliveryTableSql = `
  CREATE TABLE IF NOT EXISTS instance_email_deliveries (
    delivery_id TEXT PRIMARY KEY,
    idempotency_scope TEXT NOT NULL UNIQUE,
    message_kind TEXT NOT NULL,
    source_storage_identity TEXT NOT NULL,
    source_operation_id TEXT,
    source_record_id TEXT,
    idempotency_key TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_address TEXT NOT NULL,
    sender_display_name TEXT,
    recipients_json TEXT NOT NULL,
    reply_to_json TEXT,
    canonical_origin TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'failed', 'pending', 'sending')),
    provider_family TEXT NOT NULL CHECK (provider_family = 'cloudflare'),
    provider_message_id TEXT,
    latest_error TEXT,
    attempt_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    first_attempted_at TEXT,
    latest_attempted_at TEXT,
    accepted_at TEXT,
    failed_at TEXT
  )
`;

export function ensureEmailDeliveryTables(storage: DurableObjectStorage) {
  storage.sql.exec(emailDeliveryTableSql);
}

export function resetEmailDeliveryStorage(storage: DurableObjectStorage) {
  storage.sql.exec("DROP TABLE IF EXISTS instance_email_deliveries");
}

export function createEmailDeliveryIfAbsent(
  storage: DurableObjectStorage,
  input: CreateEmailDeliveryInput,
): CreateEmailDeliveryResult {
  ensureEmailDeliveryTables(storage);

  const idempotencyScope = emailDeliveryIdempotencyScope(input.request);
  const existing = readEmailDeliveryByScope(storage, idempotencyScope);

  if (existing) {
    return {
      delivery: existing,
      replayed: true,
    };
  }

  const deliveryId = `email_delivery_${crypto.randomUUID()}`;

  storage.sql.exec(
    `
      INSERT INTO instance_email_deliveries (
        delivery_id,
        idempotency_scope,
        message_kind,
        source_storage_identity,
        source_operation_id,
        source_record_id,
        idempotency_key,
        sender_id,
        sender_address,
        sender_display_name,
        recipients_json,
        reply_to_json,
        canonical_origin,
        status,
        provider_family,
        attempt_count,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'cloudflare', 0, ?, ?)
    `,
    deliveryId,
    idempotencyScope,
    input.request.messageKind,
    input.request.source.storageIdentity,
    input.request.source.operationId ?? null,
    input.request.source.recordId ?? null,
    input.request.idempotencyKey,
    input.sender.id,
    input.sender.address,
    input.sender.displayName ?? null,
    JSON.stringify(input.request.recipients),
    input.request.replyTo === undefined ? null : JSON.stringify(input.request.replyTo),
    input.request.canonicalOrigin,
    input.now,
    input.now,
  );

  const delivery = readEmailDeliveryById(storage, deliveryId);

  if (!delivery) {
    throw new Error(`Could not read email delivery "${deliveryId}".`);
  }

  return {
    delivery,
    replayed: false,
  };
}

export function markEmailDeliverySending(
  storage: DurableObjectStorage,
  input: { deliveryId: string; now: string },
): EmailDeliveryRecord {
  ensureEmailDeliveryTables(storage);
  storage.sql.exec(
    `
      UPDATE instance_email_deliveries
      SET
        status = 'sending',
        attempt_count = attempt_count + 1,
        latest_error = NULL,
        first_attempted_at = COALESCE(first_attempted_at, ?),
        latest_attempted_at = ?,
        updated_at = ?
      WHERE delivery_id = ?
    `,
    input.now,
    input.now,
    input.now,
    input.deliveryId,
  );

  return readRequiredEmailDeliveryById(storage, input.deliveryId);
}

export function markEmailDeliveryAccepted(
  storage: DurableObjectStorage,
  input: { deliveryId: string; now: string; providerMessageId: string },
): EmailDeliveryRecord {
  ensureEmailDeliveryTables(storage);
  storage.sql.exec(
    `
      UPDATE instance_email_deliveries
      SET
        status = 'accepted',
        provider_message_id = ?,
        latest_error = NULL,
        accepted_at = ?,
        updated_at = ?
      WHERE delivery_id = ?
    `,
    input.providerMessageId,
    input.now,
    input.now,
    input.deliveryId,
  );

  return readRequiredEmailDeliveryById(storage, input.deliveryId);
}

export function markEmailDeliveryFailed(
  storage: DurableObjectStorage,
  input: { deliveryId: string; latestError: string; now: string },
): EmailDeliveryRecord {
  ensureEmailDeliveryTables(storage);
  storage.sql.exec(
    `
      UPDATE instance_email_deliveries
      SET
        status = 'failed',
        latest_error = ?,
        failed_at = ?,
        updated_at = ?
      WHERE delivery_id = ?
    `,
    input.latestError,
    input.now,
    input.now,
    input.deliveryId,
  );

  return readRequiredEmailDeliveryById(storage, input.deliveryId);
}

export function readEmailDeliveryById(
  storage: DurableObjectStorage,
  deliveryId: string,
): EmailDeliveryRecord | undefined {
  ensureEmailDeliveryTables(storage);

  const row = storage.sql
    .exec<EmailDeliveryRow>(
      `
        SELECT *
        FROM instance_email_deliveries
        WHERE delivery_id = ?
      `,
      deliveryId,
    )
    .toArray()[0];

  return row === undefined ? undefined : emailDeliveryFromRow(row);
}

export function listEmailDeliveries(storage: DurableObjectStorage): EmailDeliveryRecord[] {
  ensureEmailDeliveryTables(storage);

  return storage.sql
    .exec<EmailDeliveryRow>(
      `
        SELECT *
        FROM instance_email_deliveries
        ORDER BY created_at ASC, delivery_id ASC
      `,
    )
    .toArray()
    .map(emailDeliveryFromRow);
}

function readEmailDeliveryByScope(
  storage: DurableObjectStorage,
  idempotencyScope: string,
): EmailDeliveryRecord | undefined {
  const row = storage.sql
    .exec<EmailDeliveryRow>(
      `
        SELECT *
        FROM instance_email_deliveries
        WHERE idempotency_scope = ?
      `,
      idempotencyScope,
    )
    .toArray()[0];

  return row === undefined ? undefined : emailDeliveryFromRow(row);
}

function readRequiredEmailDeliveryById(
  storage: DurableObjectStorage,
  deliveryId: string,
): EmailDeliveryRecord {
  const delivery = readEmailDeliveryById(storage, deliveryId);

  if (!delivery) {
    throw new Error(`Could not read email delivery "${deliveryId}".`);
  }

  return delivery;
}

function emailDeliveryFromRow(row: EmailDeliveryRow): EmailDeliveryRecord {
  if (!emailDeliveryStatuses.includes(row.status)) {
    throw new Error(`Stored email delivery "${row.delivery_id}" has invalid status.`);
  }

  return {
    id: row.delivery_id,
    messageKind: row.message_kind,
    sourceStorageIdentity: row.source_storage_identity,
    ...(row.source_operation_id === null ? {} : { sourceOperationId: row.source_operation_id }),
    ...(row.source_record_id === null ? {} : { sourceRecordId: row.source_record_id }),
    idempotencyKey: row.idempotency_key,
    sender: {
      id: row.sender_id,
      address: row.sender_address,
      ...(row.sender_display_name === null ? {} : { displayName: row.sender_display_name }),
    },
    recipients: parseStoredRecipients(row.delivery_id, row.recipients_json),
    ...(row.reply_to_json === null
      ? {}
      : {
          replyTo: parseEmailDeliveryAddress(
            "Stored email delivery reply-to",
            JSON.parse(row.reply_to_json),
          ),
        }),
    canonicalOrigin: row.canonical_origin,
    status: row.status,
    providerFamily: row.provider_family,
    ...(row.provider_message_id === null ? {} : { providerMessageId: row.provider_message_id }),
    ...(row.latest_error === null ? {} : { latestError: row.latest_error }),
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.first_attempted_at === null ? {} : { firstAttemptedAt: row.first_attempted_at }),
    ...(row.latest_attempted_at === null ? {} : { latestAttemptedAt: row.latest_attempted_at }),
    ...(row.accepted_at === null ? {} : { acceptedAt: row.accepted_at }),
    ...(row.failed_at === null ? {} : { failedAt: row.failed_at }),
  };
}

function parseStoredRecipients(deliveryId: string, value: string): EmailDeliveryAddress[] {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Stored email delivery "${deliveryId}" recipients are invalid.`);
  }

  return parsed.map((recipient, index) =>
    parseEmailDeliveryAddress(`Stored email delivery recipients[${index}]`, recipient),
  );
}
