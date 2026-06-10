import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
  WebAuthnCredential,
} from "@simplewebauthn/server";

import {
  parseInstanceAuthCanonicalOrigin,
  parseInstanceAuthConfigInput,
  parseInstanceAuthRelyingPartyId,
  type InstanceAuthConfigInput,
} from "../shared/instance-auth.ts";
import { nowIsoString } from "../shared/clock.ts";

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const credentialDeviceTypes = ["multiDevice", "singleDevice"] as const;
const passkeyChallengeKinds = ["login", "registration"] as const;
const authenticatorTransports = [
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
] as const satisfies readonly AuthenticatorTransportFuture[];

type InstanceAuthConfigRow = {
  canonical_origin: string;
  relying_party_id: string;
  relying_party_name: string;
  created_at: string;
  updated_at: string;
};

type PasskeyChallengeRow = {
  id: string;
  kind: string;
  challenge: string;
  setup_token_hash: string | null;
  owner_id: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type PasskeyCredentialRow = {
  credential_id: string;
  owner_id: string;
  public_key_base64url: string;
  counter: number;
  transports_json: string;
  credential_device_type: string;
  credential_backed_up: number;
  user_verified: number | null;
  last_verified_at: string | null;
  last_verification_origin: string | null;
  last_verification_relying_party_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StoredInstanceAuthConfig = InstanceAuthConfigInput & {
  createdAt: string;
  updatedAt: string;
};

export type WriteInstanceAuthConfigInput = InstanceAuthConfigInput & {
  now?: string;
};

export type PasskeyChallengeKind = (typeof passkeyChallengeKinds)[number];

export type StoredPasskeyRegistrationChallenge = {
  id: string;
  kind: "registration";
  challenge: string;
  setupTokenHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
};

export type StoredPasskeyLoginChallenge = {
  id: string;
  kind: "login";
  challenge: string;
  ownerId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
};

export type StoredPasskeyChallenge =
  | StoredPasskeyRegistrationChallenge
  | StoredPasskeyLoginChallenge;

export type CreatePasskeyChallengeInput =
  | {
      id?: string;
      kind: "registration";
      challenge: string;
      setupTokenHash: string;
      createdAt?: string;
      expiresAt: string;
    }
  | {
      id?: string;
      kind: "login";
      challenge: string;
      ownerId: string;
      createdAt?: string;
      expiresAt: string;
    };

export type CreatePasskeyChallengeResult =
  | { ok: true; challenge: StoredPasskeyChallenge }
  | {
      ok: false;
      challenge: StoredPasskeyChallenge;
      reason: "duplicate-challenge";
    };

export type ConsumePasskeyChallengeInput = {
  challenge: string;
  kind: PasskeyChallengeKind;
  now?: string;
};

export type ConsumePasskeyChallengeResult =
  | { ok: true; challenge: StoredPasskeyChallenge }
  | {
      ok: false;
      challenge?: StoredPasskeyChallenge;
      reason: "already-consumed" | "expired-challenge" | "missing-challenge" | "wrong-kind";
    };

export type StoredPasskeyCredential = {
  credentialId: string;
  ownerId: string;
  publicKeyBase64Url: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  userVerified?: boolean;
  lastVerifiedAt?: string;
  lastVerificationOrigin?: string;
  lastVerificationRelyingPartyId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePasskeyCredentialInput = {
  credentialId: string;
  ownerId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreatePasskeyCredentialResult =
  | { ok: true; credential: StoredPasskeyCredential }
  | {
      ok: false;
      credential: StoredPasskeyCredential;
      reason: "duplicate-credential-id";
    };

export type UpdatePasskeyCredentialVerificationInput = {
  credentialId: string;
  counter: number;
  verifiedAt?: string;
  userVerified: boolean;
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  origin: string;
  relyingPartyId: string;
};

export type UpdatePasskeyCredentialVerificationResult =
  | { ok: true; credential: StoredPasskeyCredential }
  | {
      ok: false;
      credential?: StoredPasskeyCredential;
      reason: "counter-regression" | "missing-credential";
    };

export function ensureInstanceAuthTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS instance_auth_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      canonical_origin TEXT NOT NULL,
      relying_party_id TEXT NOT NULL,
      relying_party_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instance_auth_challenges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('login', 'registration')),
      challenge TEXT NOT NULL UNIQUE,
      setup_token_hash TEXT,
      owner_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      CHECK (
        (kind = 'registration' AND setup_token_hash IS NOT NULL AND owner_id IS NULL)
        OR
        (kind = 'login' AND setup_token_hash IS NULL AND owner_id IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_challenges_expires_at
      ON instance_auth_challenges (expires_at);

    CREATE TABLE IF NOT EXISTS instance_auth_passkey_credentials (
      credential_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      public_key_base64url TEXT NOT NULL,
      counter INTEGER NOT NULL,
      transports_json TEXT NOT NULL,
      credential_device_type TEXT NOT NULL CHECK (
        credential_device_type IN ('multiDevice', 'singleDevice')
      ),
      credential_backed_up INTEGER NOT NULL CHECK (credential_backed_up IN (0, 1)),
      user_verified INTEGER CHECK (user_verified IS NULL OR user_verified IN (0, 1)),
      last_verified_at TEXT,
      last_verification_origin TEXT,
      last_verification_relying_party_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_passkey_credentials_owner_id
      ON instance_auth_passkey_credentials (owner_id);
  `);
}

export function resetInstanceAuthTables(storage: DurableObjectStorage) {
  ensureInstanceAuthTables(storage);

  storage.transactionSync(() => {
    storage.sql.exec(`
      DELETE FROM instance_auth_passkey_credentials;
      DELETE FROM instance_auth_challenges;
      DELETE FROM instance_auth_config;
    `);
  });
}

export function readInstanceAuthConfig(
  storage: DurableObjectStorage,
): StoredInstanceAuthConfig | undefined {
  ensureInstanceAuthTables(storage);

  return readInstanceAuthConfigRow(storage);
}

export function writeInstanceAuthConfig(
  storage: DurableObjectStorage,
  input: WriteInstanceAuthConfigInput,
): StoredInstanceAuthConfig {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const existing = readInstanceAuthConfigRow(storage);
    const normalizedConfig = parseInstanceAuthConfigInput({
      canonicalOrigin: input.canonicalOrigin,
      relyingPartyId: input.relyingPartyId,
      relyingPartyName: input.relyingPartyName,
    });
    const updatedAt = parseTimestamp("Instance auth config updatedAt", input.now ?? nowIsoString());
    const createdAt = existing?.createdAt ?? updatedAt;

    storage.sql.exec(
      `
        INSERT INTO instance_auth_config (
          id,
          canonical_origin,
          relying_party_id,
          relying_party_name,
          created_at,
          updated_at
        )
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          canonical_origin = excluded.canonical_origin,
          relying_party_id = excluded.relying_party_id,
          relying_party_name = excluded.relying_party_name,
          updated_at = excluded.updated_at
      `,
      normalizedConfig.canonicalOrigin,
      normalizedConfig.relyingPartyId,
      normalizedConfig.relyingPartyName,
      createdAt,
      updatedAt,
    );

    return {
      ...normalizedConfig,
      createdAt,
      updatedAt,
    };
  });
}

export function createPasskeyChallenge(
  storage: DurableObjectStorage,
  input: CreatePasskeyChallengeInput,
): CreatePasskeyChallengeResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const normalizedChallenge = normalizePasskeyChallengeInput(input);
    const existing = readPasskeyChallengeByChallenge(storage, normalizedChallenge.challenge);

    if (existing) {
      return {
        ok: false,
        challenge: existing,
        reason: "duplicate-challenge",
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_challenges (
          id,
          kind,
          challenge,
          setup_token_hash,
          owner_id,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      normalizedChallenge.id,
      normalizedChallenge.kind,
      normalizedChallenge.challenge,
      normalizedChallenge.kind === "registration" ? normalizedChallenge.setupTokenHash : null,
      normalizedChallenge.kind === "login" ? normalizedChallenge.ownerId : null,
      normalizedChallenge.createdAt,
      normalizedChallenge.expiresAt,
      normalizedChallenge.consumedAt ?? null,
    );

    return { ok: true, challenge: normalizedChallenge };
  });
}

export function readPasskeyChallenge(
  storage: DurableObjectStorage,
  challenge: unknown,
): StoredPasskeyChallenge | undefined {
  ensureInstanceAuthTables(storage);

  return readPasskeyChallengeByChallenge(
    storage,
    parseBase64UrlString("Passkey challenge", challenge),
  );
}

export function consumePasskeyChallenge(
  storage: DurableObjectStorage,
  input: ConsumePasskeyChallengeInput,
): ConsumePasskeyChallengeResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const kind = parsePasskeyChallengeKind(input.kind);
    const challengeValue = parseBase64UrlString("Passkey challenge", input.challenge);
    const now = parseTimestamp("Passkey challenge consumedAt", input.now ?? nowIsoString());
    const challenge = readPasskeyChallengeByChallenge(storage, challengeValue);

    if (!challenge) {
      return { ok: false, reason: "missing-challenge" };
    }

    if (challenge.kind !== kind) {
      return { ok: false, challenge, reason: "wrong-kind" };
    }

    if (challenge.consumedAt !== undefined) {
      return { ok: false, challenge, reason: "already-consumed" };
    }

    if (challenge.expiresAt <= now) {
      return { ok: false, challenge, reason: "expired-challenge" };
    }

    storage.sql.exec(
      "UPDATE instance_auth_challenges SET consumed_at = ? WHERE challenge = ?",
      now,
      challenge.challenge,
    );

    return {
      ok: true,
      challenge: {
        ...challenge,
        consumedAt: now,
      },
    };
  });
}

export function expirePasskeyChallenges(storage: DurableObjectStorage, now: unknown): number {
  ensureInstanceAuthTables(storage);

  const expiresAt = parseTimestamp("Passkey challenge expiry timestamp", now);
  const row = storage.sql
    .exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM instance_auth_challenges WHERE expires_at <= ?",
      expiresAt,
    )
    .one();

  storage.sql.exec("DELETE FROM instance_auth_challenges WHERE expires_at <= ?", expiresAt);

  return row.count;
}

export function deletePasskeyChallenge(storage: DurableObjectStorage, challenge: unknown): boolean {
  ensureInstanceAuthTables(storage);

  const challengeValue = parseBase64UrlString("Passkey challenge", challenge);
  const existing = readPasskeyChallengeByChallenge(storage, challengeValue);

  if (!existing) {
    return false;
  }

  storage.sql.exec("DELETE FROM instance_auth_challenges WHERE challenge = ?", challengeValue);

  return true;
}

export function createPasskeyCredential(
  storage: DurableObjectStorage,
  input: CreatePasskeyCredentialInput,
): CreatePasskeyCredentialResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => createPasskeyCredentialInCurrentTransaction(storage, input));
}

export function createPasskeyCredentialInCurrentTransaction(
  storage: DurableObjectStorage,
  input: CreatePasskeyCredentialInput,
): CreatePasskeyCredentialResult {
  ensureInstanceAuthTables(storage);

  const normalizedCredential = normalizeCreatePasskeyCredentialInput(input);
  const existing = readPasskeyCredentialById(storage, normalizedCredential.credentialId);

  if (existing) {
    return {
      ok: false,
      credential: existing,
      reason: "duplicate-credential-id",
    };
  }

  storage.sql.exec(
    `
        INSERT INTO instance_auth_passkey_credentials (
          credential_id,
          owner_id,
          public_key_base64url,
          counter,
          transports_json,
          credential_device_type,
          credential_backed_up,
          user_verified,
          last_verified_at,
          last_verification_origin,
          last_verification_relying_party_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
      `,
    normalizedCredential.credentialId,
    normalizedCredential.ownerId,
    normalizedCredential.publicKeyBase64Url,
    normalizedCredential.counter,
    JSON.stringify(normalizedCredential.transports),
    normalizedCredential.credentialDeviceType,
    storageBoolean(normalizedCredential.credentialBackedUp),
    normalizedCredential.createdAt,
    normalizedCredential.updatedAt,
  );

  return { ok: true, credential: normalizedCredential };
}

export function readPasskeyCredential(
  storage: DurableObjectStorage,
  credentialId: unknown,
): StoredPasskeyCredential | undefined {
  ensureInstanceAuthTables(storage);

  return readPasskeyCredentialById(
    storage,
    parseBase64UrlString("Passkey credential id", credentialId),
  );
}

export function readPasskeyCredentialsForOwner(
  storage: DurableObjectStorage,
  ownerId: unknown,
): StoredPasskeyCredential[] {
  ensureInstanceAuthTables(storage);

  const ownerIdValue = parseNonEmptyString("Passkey credential owner id", ownerId);
  const credentials: StoredPasskeyCredential[] = [];

  for (const row of storage.sql.exec<PasskeyCredentialRow>(
    `
      SELECT
        credential_id,
        owner_id,
        public_key_base64url,
        counter,
        transports_json,
        credential_device_type,
        credential_backed_up,
        user_verified,
        last_verified_at,
        last_verification_origin,
        last_verification_relying_party_id,
        created_at,
        updated_at
      FROM instance_auth_passkey_credentials
      WHERE owner_id = ?
      ORDER BY created_at ASC, credential_id ASC
    `,
    ownerIdValue,
  )) {
    credentials.push(passkeyCredentialFromRow(row));
  }

  return credentials;
}

export function passkeyCredentialToWebAuthnCredential(
  credential: StoredPasskeyCredential,
): WebAuthnCredential {
  return {
    id: credential.credentialId,
    publicKey: base64UrlDecode(credential.publicKeyBase64Url),
    counter: credential.counter,
    ...(credential.transports.length === 0 ? {} : { transports: credential.transports }),
  };
}

export function updatePasskeyCredentialVerification(
  storage: DurableObjectStorage,
  input: UpdatePasskeyCredentialVerificationInput,
): UpdatePasskeyCredentialVerificationResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const credentialId = parseBase64UrlString("Passkey credential id", input.credentialId);
    const existing = readPasskeyCredentialById(storage, credentialId);

    if (!existing) {
      return { ok: false, reason: "missing-credential" };
    }

    const counter = parseNonNegativeInteger("Passkey credential counter", input.counter);

    if (counter < existing.counter) {
      return {
        ok: false,
        credential: existing,
        reason: "counter-regression",
      };
    }

    const verifiedAt = parseTimestamp(
      "Passkey credential verifiedAt",
      input.verifiedAt ?? nowIsoString(),
    );
    const userVerified = parseBoolean("Passkey credential userVerified", input.userVerified);
    const credentialDeviceType = parseCredentialDeviceType(input.credentialDeviceType);
    const credentialBackedUp = parseBoolean(
      "Passkey credential backedUp",
      input.credentialBackedUp,
    );
    const origin = parseInstanceAuthCanonicalOrigin(input.origin);
    const relyingPartyId = parseInstanceAuthRelyingPartyId(input.relyingPartyId, {
      canonicalOrigin: origin,
    });

    storage.sql.exec(
      `
        UPDATE instance_auth_passkey_credentials
        SET
          counter = ?,
          credential_device_type = ?,
          credential_backed_up = ?,
          user_verified = ?,
          last_verified_at = ?,
          last_verification_origin = ?,
          last_verification_relying_party_id = ?,
          updated_at = ?
        WHERE credential_id = ?
      `,
      counter,
      credentialDeviceType,
      storageBoolean(credentialBackedUp),
      storageBoolean(userVerified),
      verifiedAt,
      origin,
      relyingPartyId,
      verifiedAt,
      credentialId,
    );

    return {
      ok: true,
      credential: {
        ...existing,
        counter,
        credentialDeviceType,
        credentialBackedUp,
        userVerified,
        lastVerifiedAt: verifiedAt,
        lastVerificationOrigin: origin,
        lastVerificationRelyingPartyId: relyingPartyId,
        updatedAt: verifiedAt,
      },
    };
  });
}

function readInstanceAuthConfigRow(
  storage: DurableObjectStorage,
): StoredInstanceAuthConfig | undefined {
  const row = storage.sql
    .exec<InstanceAuthConfigRow>(
      `
        SELECT
          canonical_origin,
          relying_party_id,
          relying_party_name,
          created_at,
          updated_at
        FROM instance_auth_config
        WHERE id = 1
      `,
    )
    .next();

  if (row.done) {
    return undefined;
  }

  return {
    canonicalOrigin: row.value.canonical_origin,
    relyingPartyId: row.value.relying_party_id,
    relyingPartyName: row.value.relying_party_name,
    createdAt: row.value.created_at,
    updatedAt: row.value.updated_at,
  };
}

function normalizePasskeyChallengeInput(
  input: CreatePasskeyChallengeInput,
): StoredPasskeyChallenge {
  const id =
    input.id === undefined
      ? crypto.randomUUID()
      : parseNonEmptyString("Passkey challenge id", input.id);
  const kind = parsePasskeyChallengeKind(input.kind);
  const challenge = parseBase64UrlString("Passkey challenge", input.challenge);
  const createdAt = parseTimestamp(
    "Passkey challenge createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const expiresAt = parseTimestamp("Passkey challenge expiresAt", input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Passkey challenge expiresAt must be after createdAt.");
  }

  if (kind === "registration") {
    if (input.kind !== "registration") {
      throw new Error("Passkey registration challenge kind must be registration.");
    }

    return {
      id,
      kind,
      challenge,
      setupTokenHash: parseBase64UrlString(
        "Passkey challenge setup token hash",
        input.setupTokenHash,
      ),
      createdAt,
      expiresAt,
    };
  }

  if (input.kind !== "login") {
    throw new Error("Passkey login challenge kind must be login.");
  }

  return {
    id,
    kind,
    challenge,
    ownerId: parseNonEmptyString("Passkey challenge owner id", input.ownerId),
    createdAt,
    expiresAt,
  };
}

function readPasskeyChallengeByChallenge(
  storage: DurableObjectStorage,
  challenge: string,
): StoredPasskeyChallenge | undefined {
  const row = storage.sql
    .exec<PasskeyChallengeRow>(
      `
        SELECT
          id,
          kind,
          challenge,
          setup_token_hash,
          owner_id,
          created_at,
          expires_at,
          consumed_at
        FROM instance_auth_challenges
        WHERE challenge = ?
      `,
      challenge,
    )
    .next();

  return row.done ? undefined : passkeyChallengeFromRow(row.value);
}

function passkeyChallengeFromRow(row: PasskeyChallengeRow): StoredPasskeyChallenge {
  const base = {
    id: row.id,
    challenge: row.challenge,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
  };

  if (row.kind === "registration") {
    if (row.setup_token_hash === null) {
      throw new Error("Stored passkey registration challenge is missing setup token hash.");
    }

    return {
      ...base,
      kind: "registration",
      setupTokenHash: row.setup_token_hash,
    };
  }

  if (row.kind === "login") {
    if (row.owner_id === null) {
      throw new Error("Stored passkey login challenge is missing owner id.");
    }

    return {
      ...base,
      kind: "login",
      ownerId: row.owner_id,
    };
  }

  throw new Error(`Stored passkey challenge has unsupported kind "${row.kind}".`);
}

function normalizeCreatePasskeyCredentialInput(
  input: CreatePasskeyCredentialInput,
): StoredPasskeyCredential {
  const createdAt = parseTimestamp(
    "Passkey credential createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const updatedAt = parseTimestamp("Passkey credential updatedAt", input.updatedAt ?? createdAt);

  return {
    credentialId: parseBase64UrlString("Passkey credential id", input.credentialId),
    ownerId: parseNonEmptyString("Passkey credential owner id", input.ownerId),
    publicKeyBase64Url: publicKeyBase64Url(input.publicKey),
    counter: parseNonNegativeInteger("Passkey credential counter", input.counter),
    transports: parseAuthenticatorTransports(input.transports),
    credentialDeviceType: parseCredentialDeviceType(input.credentialDeviceType),
    credentialBackedUp: parseBoolean("Passkey credential backedUp", input.credentialBackedUp),
    createdAt,
    updatedAt,
  };
}

function readPasskeyCredentialById(
  storage: DurableObjectStorage,
  credentialId: string,
): StoredPasskeyCredential | undefined {
  const row = storage.sql
    .exec<PasskeyCredentialRow>(
      `
        SELECT
          credential_id,
          owner_id,
          public_key_base64url,
          counter,
          transports_json,
          credential_device_type,
          credential_backed_up,
          user_verified,
          last_verified_at,
          last_verification_origin,
          last_verification_relying_party_id,
          created_at,
          updated_at
        FROM instance_auth_passkey_credentials
        WHERE credential_id = ?
      `,
      credentialId,
    )
    .next();

  return row.done ? undefined : passkeyCredentialFromRow(row.value);
}

function passkeyCredentialFromRow(row: PasskeyCredentialRow): StoredPasskeyCredential {
  return {
    credentialId: row.credential_id,
    ownerId: row.owner_id,
    publicKeyBase64Url: row.public_key_base64url,
    counter: row.counter,
    transports: parseAuthenticatorTransports(JSON.parse(row.transports_json)),
    credentialDeviceType: parseCredentialDeviceType(row.credential_device_type),
    credentialBackedUp: storedBoolean(row.credential_backed_up),
    ...(row.user_verified === null ? {} : { userVerified: storedBoolean(row.user_verified) }),
    ...(row.last_verified_at === null ? {} : { lastVerifiedAt: row.last_verified_at }),
    ...(row.last_verification_origin === null
      ? {}
      : { lastVerificationOrigin: row.last_verification_origin }),
    ...(row.last_verification_relying_party_id === null
      ? {}
      : { lastVerificationRelyingPartyId: row.last_verification_relying_party_id }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePasskeyChallengeKind(value: unknown): PasskeyChallengeKind {
  return parseStringLiteral("Passkey challenge kind", value, passkeyChallengeKinds);
}

function parseCredentialDeviceType(value: unknown): CredentialDeviceType {
  return parseStringLiteral("Passkey credential device type", value, credentialDeviceTypes);
}

function parseAuthenticatorTransports(value: unknown): AuthenticatorTransportFuture[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Passkey credential transports must be an array.");
  }

  const transports = value.map((transport) =>
    parseStringLiteral("Passkey credential transport", transport, authenticatorTransports),
  );

  return Array.from(new Set(transports));
}

function parseStringLiteral<T extends string>(
  context: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${context} must be one of: ${allowed.join(", ")}.`);
  }

  return value as T;
}

function parseBase64UrlString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  const normalized = value.trim();

  if (!base64UrlPattern.test(normalized)) {
    throw new Error(`${context} must be base64url.`);
  }

  return normalized;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseTimestamp(context: string, value: unknown): string {
  return parseNonEmptyString(context, value);
}

function parseNonNegativeInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function parseBoolean(context: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function storageBoolean(value: boolean): number {
  return value ? 1 : 0;
}

function storedBoolean(value: number): boolean {
  if (value === 0) {
    return false;
  }

  if (value === 1) {
    return true;
  }

  throw new Error("Stored passkey boolean must be 0 or 1.");
}

function publicKeyBase64Url(value: Uint8Array<ArrayBuffer>): string {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    throw new Error("Passkey credential public key must be a non-empty byte array.");
  }

  return base64UrlEncode(value);
}

function base64UrlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = parseBase64UrlString("Passkey credential public key", value);
  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  let binary: string;

  try {
    binary = atob(padded);
  } catch {
    throw new Error("Passkey credential public key must be valid base64url.");
  }

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
