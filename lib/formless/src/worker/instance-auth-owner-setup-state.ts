import type { AuthenticatorTransportFuture, CredentialDeviceType } from "@simplewebauthn/server";

import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import {
  parseInstanceAuthCanonicalOrigin,
  parseInstanceAuthRelyingPartyId,
  type AuthSuccessContinuationTarget,
} from "../shared/instance-auth.ts";
import { nowIsoString } from "../shared/clock.ts";

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const authenticatorTransports = [
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
] as const satisfies readonly AuthenticatorTransportFuture[];
const credentialDeviceTypes = ["multiDevice", "singleDevice"] as const;

type OwnerSetupEmailProofRow = {
  auth_origin: string;
  challenge_id: string;
  consumed_at: string | null;
  continuation: string;
  created_at: string;
  display_email: string;
  display_name: string;
  expires_at: string;
  idempotency_key: string;
  instance_id: string;
  normalized_email: string;
  revoked_at: string | null;
  setup_token_hash: string;
  token_hash: string;
  verified_at: string | null;
};

type OwnerSetupPasskeyChallengeRow = {
  auth_origin: string;
  challenge: string;
  completion_id: string;
  consumed_at: string | null;
  created_at: string;
  email_challenge_id: string;
  expires_at: string;
  instance_id: string;
  relying_party_id: string;
  setup_token_hash: string;
};

type OwnerSetupPasskeyPreparationRow = {
  auth_origin: string;
  completion_id: string;
  counter: number;
  created_at: string;
  credential_backed_up: number;
  credential_device_type: string;
  credential_id: string;
  email_challenge_id: string;
  instance_id: string;
  public_key_base64url: string;
  relying_party_id: string;
  setup_token_hash: string;
  transports_json: string;
};

type OwnerSetupCompletionRow = {
  auth_origin: string;
  completed_at: string | null;
  completion_id: string;
  continuation: string;
  created_at: string;
  credential_id: string;
  display_email: string;
  display_name: string;
  email_challenge_id: string;
  instance_id: string;
  normalized_email: string;
  principal_id: string;
  relying_party_id: string;
  session_id_hash: string | null;
  setup_token_hash: string;
};

export type StoredOwnerSetupEmailProof = {
  authOrigin: string;
  challengeId: string;
  consumedAt?: string;
  continuation: AuthSuccessContinuationTarget;
  createdAt: string;
  displayEmail: string;
  displayName: string;
  expiresAt: string;
  idempotencyKey: string;
  instanceId: string;
  normalizedEmail: string;
  revokedAt?: string;
  setupTokenHash: string;
  tokenHash: string;
  verifiedAt?: string;
};

export type CreateOwnerSetupEmailChallengeInput = {
  authOrigin: string;
  challengeId?: string;
  continuation: AuthSuccessContinuationTarget;
  createdAt?: string;
  displayName: string;
  email: string;
  expiresAt: string;
  idempotencyKey: string;
  instanceId: string;
  setupTokenHash: string;
  tokenHash: string;
};

export type CreateOwnerSetupEmailChallengeResult =
  | { challenge: StoredOwnerSetupEmailProof; ok: true; replayed: boolean }
  | {
      challenge: StoredOwnerSetupEmailProof;
      ok: false;
      reason: "duplicate-challenge-id" | "duplicate-token-hash";
    };

export type VerifyOwnerSetupEmailChallengeInput = {
  authOrigin: string;
  challengeId: string;
  email: string;
  instanceId: string;
  now?: string;
  setupTokenHash: string;
  tokenHash: string;
};

export type VerifyOwnerSetupEmailChallengeResult =
  | { challenge: StoredOwnerSetupEmailProof; ok: true }
  | {
      challenge?: StoredOwnerSetupEmailProof;
      ok: false;
      reason:
        | "already-verified"
        | "expired-challenge"
        | "missing-challenge"
        | "revoked-challenge"
        | "wrong-auth-origin"
        | "wrong-capability"
        | "wrong-email"
        | "wrong-instance"
        | "wrong-token";
    };

export type StoredOwnerSetupPasskeyChallenge = {
  authOrigin: string;
  challenge: string;
  completionId: string;
  consumedAt?: string;
  createdAt: string;
  emailChallengeId: string;
  expiresAt: string;
  instanceId: string;
  relyingPartyId: string;
  setupTokenHash: string;
};

export type CreateOwnerSetupPasskeyChallengeInput = {
  authOrigin: string;
  challenge: string;
  completionId: string;
  createdAt?: string;
  emailChallengeId: string;
  expiresAt: string;
  instanceId: string;
  relyingPartyId: string;
  setupTokenHash: string;
};

export type CreateOwnerSetupPasskeyChallengeResult =
  | { challenge: StoredOwnerSetupPasskeyChallenge; ok: true }
  | {
      challenge: StoredOwnerSetupPasskeyChallenge;
      ok: false;
      reason: "duplicate-challenge";
    };

export type ConsumeOwnerSetupPasskeyChallengeResult =
  | { challenge: StoredOwnerSetupPasskeyChallenge; ok: true }
  | {
      challenge?: StoredOwnerSetupPasskeyChallenge;
      ok: false;
      reason: "already-consumed" | "expired-challenge" | "missing-challenge";
    };

export type StoredOwnerSetupPasskeyPreparation = {
  authOrigin: string;
  completionId: string;
  counter: number;
  createdAt: string;
  credentialBackedUp: boolean;
  credentialDeviceType: CredentialDeviceType;
  credentialId: string;
  emailChallengeId: string;
  instanceId: string;
  publicKeyBase64Url: string;
  relyingPartyId: string;
  setupTokenHash: string;
  transports: AuthenticatorTransportFuture[];
};

export type CreateOwnerSetupPasskeyPreparationInput = {
  authOrigin: string;
  completionId: string;
  counter: number;
  createdAt?: string;
  credentialBackedUp: boolean;
  credentialDeviceType: CredentialDeviceType;
  credentialId: string;
  emailChallengeId: string;
  instanceId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  relyingPartyId: string;
  setupTokenHash: string;
  transports?: AuthenticatorTransportFuture[];
};

export type CreateOwnerSetupPasskeyPreparationResult =
  | { ok: true; preparation: StoredOwnerSetupPasskeyPreparation; replayed: boolean }
  | {
      ok: false;
      preparation: StoredOwnerSetupPasskeyPreparation;
      reason: "completion-conflict" | "duplicate-credential-id";
    };

export type StoredOwnerSetupCompletion = {
  authOrigin: string;
  completedAt?: string;
  completionId: string;
  continuation: AuthSuccessContinuationTarget;
  createdAt: string;
  credentialId: string;
  displayEmail: string;
  displayName: string;
  emailChallengeId: string;
  instanceId: string;
  normalizedEmail: string;
  principalId: string;
  relyingPartyId: string;
  sessionIdHash?: string;
  setupTokenHash: string;
};

export type CreateOwnerSetupCompletionInput = Omit<
  StoredOwnerSetupCompletion,
  "completedAt" | "sessionIdHash"
>;

export type CreateOwnerSetupCompletionResult =
  | { completion: StoredOwnerSetupCompletion; ok: true; replayed: boolean }
  | { completion: StoredOwnerSetupCompletion; ok: false; reason: "completion-conflict" };

export function ensureOwnerSetupEmailProofTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS instance_auth_owner_setup_email_proofs (
      challenge_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL UNIQUE,
      setup_token_hash TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      auth_origin TEXT NOT NULL,
      display_name TEXT NOT NULL,
      normalized_email TEXT NOT NULL,
      display_email TEXT NOT NULL,
      continuation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      consumed_at TEXT,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_owner_setup_email_proofs_expires_at
      ON instance_auth_owner_setup_email_proofs (expires_at);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_owner_setup_email_proofs_capability
      ON instance_auth_owner_setup_email_proofs (
        setup_token_hash,
        instance_id,
        auth_origin
      );

    CREATE TABLE IF NOT EXISTS instance_auth_owner_setup_passkey_challenges (
      challenge TEXT PRIMARY KEY,
      completion_id TEXT NOT NULL,
      email_challenge_id TEXT NOT NULL,
      setup_token_hash TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      auth_origin TEXT NOT NULL,
      relying_party_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_owner_setup_passkey_challenges_expires_at
      ON instance_auth_owner_setup_passkey_challenges (expires_at);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_owner_setup_passkey_challenges_completion
      ON instance_auth_owner_setup_passkey_challenges (
        completion_id,
        email_challenge_id,
        setup_token_hash
      );

    CREATE TABLE IF NOT EXISTS instance_auth_owner_setup_passkey_preparations (
      completion_id TEXT PRIMARY KEY,
      email_challenge_id TEXT NOT NULL UNIQUE,
      setup_token_hash TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      auth_origin TEXT NOT NULL,
      relying_party_id TEXT NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key_base64url TEXT NOT NULL,
      counter INTEGER NOT NULL CHECK (counter >= 0),
      transports_json TEXT NOT NULL,
      credential_device_type TEXT NOT NULL CHECK (
        credential_device_type IN ('multiDevice', 'singleDevice')
      ),
      credential_backed_up INTEGER NOT NULL CHECK (credential_backed_up IN (0, 1)),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_owner_setup_passkey_preparations_capability
      ON instance_auth_owner_setup_passkey_preparations (
        setup_token_hash,
        instance_id,
        auth_origin
      );

    CREATE TABLE IF NOT EXISTS instance_auth_owner_setup_completions (
      completion_id TEXT PRIMARY KEY,
      email_challenge_id TEXT NOT NULL UNIQUE,
      setup_token_hash TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      auth_origin TEXT NOT NULL,
      relying_party_id TEXT NOT NULL,
      principal_id TEXT NOT NULL UNIQUE,
      credential_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      normalized_email TEXT NOT NULL,
      display_email TEXT NOT NULL,
      continuation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      session_id_hash TEXT UNIQUE,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_owner_setup_completions_capability
      ON instance_auth_owner_setup_completions (
        setup_token_hash,
        instance_id,
        auth_origin
      );
  `);
}

export function resetOwnerSetupEmailProofTables(storage: DurableObjectStorage) {
  ensureOwnerSetupEmailProofTables(storage);
  storage.transactionSync(() => {
    storage.sql.exec(`
      DELETE FROM instance_auth_owner_setup_completions;
      DELETE FROM instance_auth_owner_setup_passkey_preparations;
      DELETE FROM instance_auth_owner_setup_passkey_challenges;
      DELETE FROM instance_auth_owner_setup_email_proofs;
    `);
  });
}

export function createOwnerSetupEmailChallenge(
  storage: DurableObjectStorage,
  input: CreateOwnerSetupEmailChallengeInput,
): CreateOwnerSetupEmailChallengeResult {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.transactionSync(() => {
    const challenge = normalizeCreateOwnerSetupEmailChallengeInput(input);
    const existingByIdempotency = readOwnerSetupEmailProofByIdempotencyKey(
      storage,
      challenge.idempotencyKey,
    );

    if (existingByIdempotency) {
      return { challenge: existingByIdempotency, ok: true, replayed: true };
    }

    const existingById = readOwnerSetupEmailProofById(storage, challenge.challengeId);

    if (existingById) {
      return { challenge: existingById, ok: false, reason: "duplicate-challenge-id" };
    }

    const existingByHash = readOwnerSetupEmailProofByTokenHash(storage, challenge.tokenHash);

    if (existingByHash) {
      return { challenge: existingByHash, ok: false, reason: "duplicate-token-hash" };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_owner_setup_email_proofs (
          challenge_id,
          idempotency_key,
          token_hash,
          setup_token_hash,
          instance_id,
          auth_origin,
          display_name,
          normalized_email,
          display_email,
          continuation,
          created_at,
          expires_at,
          verified_at,
          consumed_at,
          revoked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      `,
      challenge.challengeId,
      challenge.idempotencyKey,
      challenge.tokenHash,
      challenge.setupTokenHash,
      challenge.instanceId,
      challenge.authOrigin,
      challenge.displayName,
      challenge.normalizedEmail,
      challenge.displayEmail,
      challenge.continuation,
      challenge.createdAt,
      challenge.expiresAt,
    );

    return { challenge, ok: true, replayed: false };
  });
}

export function readOwnerSetupEmailProof(
  storage: DurableObjectStorage,
  challengeId: unknown,
): StoredOwnerSetupEmailProof | undefined {
  ensureOwnerSetupEmailProofTables(storage);

  return readOwnerSetupEmailProofById(
    storage,
    parseNonEmptyString("Owner setup email challenge id", challengeId),
  );
}

export function listOwnerSetupEmailProofs(
  storage: DurableObjectStorage,
): StoredOwnerSetupEmailProof[] {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.sql
    .exec<OwnerSetupEmailProofRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          setup_token_hash,
          instance_id,
          auth_origin,
          display_name,
          normalized_email,
          display_email,
          continuation,
          created_at,
          expires_at,
          verified_at,
          consumed_at,
          revoked_at
        FROM instance_auth_owner_setup_email_proofs
        ORDER BY created_at ASC, challenge_id ASC
      `,
    )
    .toArray()
    .map(ownerSetupEmailProofFromRow);
}

export function verifyOwnerSetupEmailChallenge(
  storage: DurableObjectStorage,
  input: VerifyOwnerSetupEmailChallengeInput,
): VerifyOwnerSetupEmailChallengeResult {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.transactionSync(() => {
    const verifiedAt = parseTimestamp(
      "Owner setup email challenge verifiedAt",
      input.now ?? nowIsoString(),
    );
    const challengeId = parseNonEmptyString("Owner setup email challenge id", input.challengeId);
    const challenge = readOwnerSetupEmailProofById(storage, challengeId);

    if (!challenge) {
      return { ok: false, reason: "missing-challenge" };
    }

    if (challenge.revokedAt !== undefined) {
      return { challenge, ok: false, reason: "revoked-challenge" };
    }

    if (challenge.consumedAt !== undefined) {
      return { challenge, ok: false, reason: "revoked-challenge" };
    }

    if (challenge.verifiedAt !== undefined) {
      return { challenge, ok: false, reason: "already-verified" };
    }

    if (challenge.expiresAt <= verifiedAt) {
      return { challenge, ok: false, reason: "expired-challenge" };
    }

    const expected = normalizeOwnerSetupEmailChallengeExpectation(input);
    const mismatch = ownerSetupEmailChallengeMismatchReason(challenge, expected);

    if (mismatch) {
      return { challenge, ok: false, reason: mismatch };
    }

    storage.sql.exec(
      `
        UPDATE instance_auth_owner_setup_email_proofs
        SET verified_at = ?
        WHERE challenge_id = ?
      `,
      verifiedAt,
      challenge.challengeId,
    );

    return {
      challenge: {
        ...challenge,
        verifiedAt,
      },
      ok: true,
    };
  });
}

export function createOwnerSetupPasskeyChallenge(
  storage: DurableObjectStorage,
  input: CreateOwnerSetupPasskeyChallengeInput,
): CreateOwnerSetupPasskeyChallengeResult {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.transactionSync(() => {
    const challenge = normalizeCreateOwnerSetupPasskeyChallengeInput(input);
    const existing = readOwnerSetupPasskeyChallengeByValue(storage, challenge.challenge);

    if (existing) {
      return { challenge: existing, ok: false, reason: "duplicate-challenge" };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_owner_setup_passkey_challenges (
          challenge,
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      challenge.challenge,
      challenge.completionId,
      challenge.emailChallengeId,
      challenge.setupTokenHash,
      challenge.instanceId,
      challenge.authOrigin,
      challenge.relyingPartyId,
      challenge.createdAt,
      challenge.expiresAt,
    );

    return { challenge, ok: true };
  });
}

export function consumeOwnerSetupPasskeyChallenge(
  storage: DurableObjectStorage,
  input: { challenge: string; now?: string },
): ConsumeOwnerSetupPasskeyChallengeResult {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.transactionSync(() => {
    const challengeValue = parseBase64UrlString("Owner setup passkey challenge", input.challenge);
    const consumedAt = parseTimestamp(
      "Owner setup passkey challenge consumedAt",
      input.now ?? nowIsoString(),
    );
    const challenge = readOwnerSetupPasskeyChallengeByValue(storage, challengeValue);

    if (!challenge) {
      return { ok: false, reason: "missing-challenge" };
    }

    if (challenge.consumedAt !== undefined) {
      return { challenge, ok: false, reason: "already-consumed" };
    }

    if (challenge.expiresAt <= consumedAt) {
      return { challenge, ok: false, reason: "expired-challenge" };
    }

    storage.sql.exec(
      `
        UPDATE instance_auth_owner_setup_passkey_challenges
        SET consumed_at = ?
        WHERE challenge = ?
      `,
      consumedAt,
      challenge.challenge,
    );

    return {
      challenge: {
        ...challenge,
        consumedAt,
      },
      ok: true,
    };
  });
}

export function listOwnerSetupPasskeyChallenges(
  storage: DurableObjectStorage,
): StoredOwnerSetupPasskeyChallenge[] {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.sql
    .exec<OwnerSetupPasskeyChallengeRow>(
      `
        SELECT
          challenge,
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          created_at,
          expires_at,
          consumed_at
        FROM instance_auth_owner_setup_passkey_challenges
        ORDER BY created_at ASC, challenge ASC
      `,
    )
    .toArray()
    .map(ownerSetupPasskeyChallengeFromRow);
}

export function createOwnerSetupPasskeyPreparation(
  storage: DurableObjectStorage,
  input: CreateOwnerSetupPasskeyPreparationInput,
): CreateOwnerSetupPasskeyPreparationResult {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.transactionSync(() => {
    const preparation = normalizeCreateOwnerSetupPasskeyPreparationInput(input);
    const existingByCompletion = readOwnerSetupPasskeyPreparationByCompletionId(
      storage,
      preparation.completionId,
    );

    if (existingByCompletion) {
      if (ownerSetupPasskeyPreparationsEqual(existingByCompletion, preparation)) {
        return { ok: true, preparation: existingByCompletion, replayed: true };
      }

      return {
        ok: false,
        preparation: existingByCompletion,
        reason: "completion-conflict",
      };
    }

    const existingByEmailProof = readOwnerSetupPasskeyPreparationByEmailChallengeId(
      storage,
      preparation.emailChallengeId,
    );

    if (existingByEmailProof) {
      return {
        ok: false,
        preparation: existingByEmailProof,
        reason: "completion-conflict",
      };
    }

    const existingByCredential = readOwnerSetupPasskeyPreparationByCredentialId(
      storage,
      preparation.credentialId,
    );

    if (existingByCredential) {
      return {
        ok: false,
        preparation: existingByCredential,
        reason: "duplicate-credential-id",
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_owner_setup_passkey_preparations (
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          credential_id,
          public_key_base64url,
          counter,
          transports_json,
          credential_device_type,
          credential_backed_up,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      preparation.completionId,
      preparation.emailChallengeId,
      preparation.setupTokenHash,
      preparation.instanceId,
      preparation.authOrigin,
      preparation.relyingPartyId,
      preparation.credentialId,
      preparation.publicKeyBase64Url,
      preparation.counter,
      JSON.stringify(preparation.transports),
      preparation.credentialDeviceType,
      preparation.credentialBackedUp ? 1 : 0,
      preparation.createdAt,
    );

    return { ok: true, preparation, replayed: false };
  });
}

export function readOwnerSetupPasskeyPreparation(
  storage: DurableObjectStorage,
  completionId: unknown,
): StoredOwnerSetupPasskeyPreparation | undefined {
  ensureOwnerSetupEmailProofTables(storage);

  return readOwnerSetupPasskeyPreparationByCompletionId(
    storage,
    parseBase64UrlString("Owner setup completion id", completionId),
  );
}

export function listOwnerSetupPasskeyPreparations(
  storage: DurableObjectStorage,
): StoredOwnerSetupPasskeyPreparation[] {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.sql
    .exec<OwnerSetupPasskeyPreparationRow>(
      `
        SELECT
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          credential_id,
          public_key_base64url,
          counter,
          transports_json,
          credential_device_type,
          credential_backed_up,
          created_at
        FROM instance_auth_owner_setup_passkey_preparations
        ORDER BY created_at ASC, completion_id ASC
      `,
    )
    .toArray()
    .map(ownerSetupPasskeyPreparationFromRow);
}

export function ownerSetupPreparedPasskeyPublicKey(
  preparation: StoredOwnerSetupPasskeyPreparation,
): Uint8Array<ArrayBuffer> {
  return base64UrlDecode(preparation.publicKeyBase64Url);
}

export function createOwnerSetupCompletionInCurrentTransaction(
  storage: DurableObjectStorage,
  input: CreateOwnerSetupCompletionInput,
): CreateOwnerSetupCompletionResult {
  ensureOwnerSetupEmailProofTables(storage);

  const completion = normalizeCreateOwnerSetupCompletionInput(input);
  const existing = readOwnerSetupCompletionById(storage, completion.completionId);

  if (existing) {
    return ownerSetupCompletionsEqual(existing, completion)
      ? { completion: existing, ok: true, replayed: true }
      : { completion: existing, ok: false, reason: "completion-conflict" };
  }

  storage.sql.exec(
    `
      INSERT INTO instance_auth_owner_setup_completions (
        completion_id,
        email_challenge_id,
        setup_token_hash,
        instance_id,
        auth_origin,
        relying_party_id,
        principal_id,
        credential_id,
        display_name,
        normalized_email,
        display_email,
        continuation,
        created_at,
        session_id_hash,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `,
    completion.completionId,
    completion.emailChallengeId,
    completion.setupTokenHash,
    completion.instanceId,
    completion.authOrigin,
    completion.relyingPartyId,
    completion.principalId,
    completion.credentialId,
    completion.displayName,
    completion.normalizedEmail,
    completion.displayEmail,
    completion.continuation,
    completion.createdAt,
  );

  return { completion, ok: true, replayed: false };
}

export function readOwnerSetupCompletion(
  storage: DurableObjectStorage,
  completionId: unknown,
): StoredOwnerSetupCompletion | undefined {
  ensureOwnerSetupEmailProofTables(storage);

  return readOwnerSetupCompletionById(
    storage,
    parseBase64UrlString("Owner setup completion id", completionId),
  );
}

export function listOwnerSetupCompletions(
  storage: DurableObjectStorage,
): StoredOwnerSetupCompletion[] {
  ensureOwnerSetupEmailProofTables(storage);

  return storage.sql
    .exec<OwnerSetupCompletionRow>(
      `
        SELECT
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          principal_id,
          credential_id,
          display_name,
          normalized_email,
          display_email,
          continuation,
          created_at,
          session_id_hash,
          completed_at
        FROM instance_auth_owner_setup_completions
        ORDER BY created_at ASC, completion_id ASC
      `,
    )
    .toArray()
    .map(ownerSetupCompletionFromRow);
}

export function recordOwnerSetupCompletionSessionInCurrentTransaction(
  storage: DurableObjectStorage,
  input: { completionId: unknown; sessionIdHash: unknown },
): StoredOwnerSetupCompletion {
  ensureOwnerSetupEmailProofTables(storage);

  const completionId = parseBase64UrlString("Owner setup completion id", input.completionId);
  const sessionIdHash = parseBase64UrlString(
    "Owner setup completion session id hash",
    input.sessionIdHash,
  );
  const completion = readOwnerSetupCompletionById(storage, completionId);

  if (!completion) {
    throw new Error("Owner setup completion is missing.");
  }

  if (completion.sessionIdHash !== undefined && completion.sessionIdHash !== sessionIdHash) {
    throw new Error("Owner setup completion session conflicts with existing state.");
  }

  storage.sql.exec(
    `
      UPDATE instance_auth_owner_setup_completions
      SET session_id_hash = ?
      WHERE completion_id = ?
    `,
    sessionIdHash,
    completionId,
  );

  return { ...completion, sessionIdHash };
}

export function completeOwnerSetupCompletionInCurrentTransaction(
  storage: DurableObjectStorage,
  input: { completedAt: unknown; completionId: unknown },
): StoredOwnerSetupCompletion {
  ensureOwnerSetupEmailProofTables(storage);

  const completionId = parseBase64UrlString("Owner setup completion id", input.completionId);
  const completedAt = parseTimestamp("Owner setup completion completedAt", input.completedAt);
  const completion = readOwnerSetupCompletionById(storage, completionId);

  if (!completion) {
    throw new Error("Owner setup completion is missing.");
  }

  if (!completion.sessionIdHash) {
    throw new Error("Owner setup completion session is missing.");
  }

  if (completion.completedAt !== undefined) {
    return completion;
  }

  storage.sql.exec(
    `
      UPDATE instance_auth_owner_setup_email_proofs
      SET consumed_at = ?
      WHERE challenge_id = ? AND consumed_at IS NULL
    `,
    completedAt,
    completion.emailChallengeId,
  );
  storage.sql.exec(
    "DELETE FROM instance_auth_owner_setup_passkey_preparations WHERE completion_id = ?",
    completionId,
  );
  storage.sql.exec(
    `
      UPDATE instance_auth_owner_setup_completions
      SET completed_at = ?
      WHERE completion_id = ?
    `,
    completedAt,
    completionId,
  );

  return { ...completion, completedAt };
}

export function deleteOwnerSetupCompletionInCurrentTransaction(
  storage: DurableObjectStorage,
  completionId: unknown,
): boolean {
  ensureOwnerSetupEmailProofTables(storage);

  const normalizedCompletionId = parseBase64UrlString("Owner setup completion id", completionId);
  const existing = readOwnerSetupCompletionById(storage, normalizedCompletionId);

  if (!existing || existing.completedAt !== undefined) {
    return false;
  }

  storage.sql.exec(
    "DELETE FROM instance_auth_owner_setup_completions WHERE completion_id = ?",
    normalizedCompletionId,
  );

  return true;
}

function normalizeCreateOwnerSetupPasskeyChallengeInput(
  input: CreateOwnerSetupPasskeyChallengeInput,
): StoredOwnerSetupPasskeyChallenge {
  const createdAt = parseTimestamp(
    "Owner setup passkey challenge createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const expiresAt = parseTimestamp("Owner setup passkey challenge expiresAt", input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Owner setup passkey challenge expiresAt must be after createdAt.");
  }

  const authOrigin = parseInstanceAuthCanonicalOrigin(input.authOrigin);

  return {
    authOrigin,
    challenge: parseBase64UrlString("Owner setup passkey challenge", input.challenge),
    completionId: parseBase64UrlString("Owner setup completion id", input.completionId),
    createdAt,
    emailChallengeId: parseNonEmptyString(
      "Owner setup passkey email challenge id",
      input.emailChallengeId,
    ),
    expiresAt,
    instanceId: parseNonEmptyString(
      "Owner setup passkey instance id",
      input.instanceId,
    ).toLowerCase(),
    relyingPartyId: parseInstanceAuthRelyingPartyId(input.relyingPartyId, {
      canonicalOrigin: authOrigin,
    }),
    setupTokenHash: parseBase64UrlString(
      "Owner setup passkey capability hash",
      input.setupTokenHash,
    ),
  };
}

function normalizeCreateOwnerSetupPasskeyPreparationInput(
  input: CreateOwnerSetupPasskeyPreparationInput,
): StoredOwnerSetupPasskeyPreparation {
  const authOrigin = parseInstanceAuthCanonicalOrigin(input.authOrigin);

  return {
    authOrigin,
    completionId: parseBase64UrlString("Owner setup completion id", input.completionId),
    counter: parseNonNegativeInteger("Owner setup prepared passkey counter", input.counter),
    createdAt: parseTimestamp(
      "Owner setup prepared passkey createdAt",
      input.createdAt ?? nowIsoString(),
    ),
    credentialBackedUp: parseBoolean(
      "Owner setup prepared passkey backedUp",
      input.credentialBackedUp,
    ),
    credentialDeviceType: parseCredentialDeviceType(input.credentialDeviceType),
    credentialId: parseBase64UrlString(
      "Owner setup prepared passkey credential id",
      input.credentialId,
    ),
    emailChallengeId: parseNonEmptyString(
      "Owner setup prepared passkey email challenge id",
      input.emailChallengeId,
    ),
    instanceId: parseNonEmptyString(
      "Owner setup prepared passkey instance id",
      input.instanceId,
    ).toLowerCase(),
    publicKeyBase64Url: base64UrlEncode(input.publicKey),
    relyingPartyId: parseInstanceAuthRelyingPartyId(input.relyingPartyId, {
      canonicalOrigin: authOrigin,
    }),
    setupTokenHash: parseBase64UrlString(
      "Owner setup prepared passkey capability hash",
      input.setupTokenHash,
    ),
    transports: parseAuthenticatorTransports(input.transports),
  };
}

function normalizeCreateOwnerSetupCompletionInput(
  input: CreateOwnerSetupCompletionInput,
): StoredOwnerSetupCompletion {
  const authOrigin = parseInstanceAuthCanonicalOrigin(input.authOrigin);
  const displayEmail = normalizeEmailDeliveryAddress(
    "Owner setup completion display email",
    input.displayEmail,
  );
  const normalizedEmail = normalizeEmailDeliveryAddress(
    "Owner setup completion normalized email",
    input.normalizedEmail,
  ).toLowerCase();

  if (displayEmail.toLowerCase() !== normalizedEmail) {
    throw new Error("Owner setup completion display email must match normalized email.");
  }

  return {
    authOrigin,
    completionId: parseBase64UrlString("Owner setup completion id", input.completionId),
    continuation: parseOwnerSetupContinuation(input.continuation),
    createdAt: parseTimestamp("Owner setup completion createdAt", input.createdAt),
    credentialId: parseBase64UrlString("Owner setup completion credential id", input.credentialId),
    displayEmail,
    displayName: parseNonEmptyString("Owner setup completion display name", input.displayName),
    emailChallengeId: parseNonEmptyString(
      "Owner setup completion email challenge id",
      input.emailChallengeId,
    ),
    instanceId: parseNonEmptyString(
      "Owner setup completion instance id",
      input.instanceId,
    ).toLowerCase(),
    normalizedEmail,
    principalId: parseNonEmptyString("Owner setup completion principal id", input.principalId),
    relyingPartyId: parseInstanceAuthRelyingPartyId(input.relyingPartyId, {
      canonicalOrigin: authOrigin,
    }),
    setupTokenHash: parseBase64UrlString(
      "Owner setup completion capability hash",
      input.setupTokenHash,
    ),
  };
}

function readOwnerSetupCompletionById(
  storage: DurableObjectStorage,
  completionId: string,
): StoredOwnerSetupCompletion | undefined {
  const row = storage.sql
    .exec<OwnerSetupCompletionRow>(
      `
        SELECT
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          principal_id,
          credential_id,
          display_name,
          normalized_email,
          display_email,
          continuation,
          created_at,
          session_id_hash,
          completed_at
        FROM instance_auth_owner_setup_completions
        WHERE completion_id = ?
      `,
      completionId,
    )
    .next();

  return row.done ? undefined : ownerSetupCompletionFromRow(row.value);
}

function ownerSetupCompletionFromRow(row: OwnerSetupCompletionRow): StoredOwnerSetupCompletion {
  return {
    authOrigin: row.auth_origin,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    completionId: row.completion_id,
    continuation: parseOwnerSetupContinuation(row.continuation),
    createdAt: row.created_at,
    credentialId: row.credential_id,
    displayEmail: row.display_email,
    displayName: row.display_name,
    emailChallengeId: row.email_challenge_id,
    instanceId: row.instance_id,
    normalizedEmail: row.normalized_email,
    principalId: row.principal_id,
    relyingPartyId: row.relying_party_id,
    ...(row.session_id_hash === null ? {} : { sessionIdHash: row.session_id_hash }),
    setupTokenHash: row.setup_token_hash,
  };
}

function ownerSetupCompletionsEqual(
  left: StoredOwnerSetupCompletion,
  right: StoredOwnerSetupCompletion,
): boolean {
  return (
    left.authOrigin === right.authOrigin &&
    left.completionId === right.completionId &&
    left.continuation === right.continuation &&
    left.createdAt === right.createdAt &&
    left.credentialId === right.credentialId &&
    left.displayEmail === right.displayEmail &&
    left.displayName === right.displayName &&
    left.emailChallengeId === right.emailChallengeId &&
    left.instanceId === right.instanceId &&
    left.normalizedEmail === right.normalizedEmail &&
    left.principalId === right.principalId &&
    left.relyingPartyId === right.relyingPartyId &&
    left.setupTokenHash === right.setupTokenHash
  );
}

function readOwnerSetupPasskeyChallengeByValue(
  storage: DurableObjectStorage,
  challenge: string,
): StoredOwnerSetupPasskeyChallenge | undefined {
  const row = storage.sql
    .exec<OwnerSetupPasskeyChallengeRow>(
      `
        SELECT
          challenge,
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          created_at,
          expires_at,
          consumed_at
        FROM instance_auth_owner_setup_passkey_challenges
        WHERE challenge = ?
      `,
      challenge,
    )
    .next();

  return row.done ? undefined : ownerSetupPasskeyChallengeFromRow(row.value);
}

function ownerSetupPasskeyChallengeFromRow(
  row: OwnerSetupPasskeyChallengeRow,
): StoredOwnerSetupPasskeyChallenge {
  return {
    authOrigin: row.auth_origin,
    challenge: row.challenge,
    completionId: row.completion_id,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
    createdAt: row.created_at,
    emailChallengeId: row.email_challenge_id,
    expiresAt: row.expires_at,
    instanceId: row.instance_id,
    relyingPartyId: row.relying_party_id,
    setupTokenHash: row.setup_token_hash,
  };
}

function readOwnerSetupPasskeyPreparationByCompletionId(
  storage: DurableObjectStorage,
  completionId: string,
): StoredOwnerSetupPasskeyPreparation | undefined {
  return readOwnerSetupPasskeyPreparationBy(storage, "completion_id", completionId);
}

function readOwnerSetupPasskeyPreparationByEmailChallengeId(
  storage: DurableObjectStorage,
  emailChallengeId: string,
): StoredOwnerSetupPasskeyPreparation | undefined {
  return readOwnerSetupPasskeyPreparationBy(storage, "email_challenge_id", emailChallengeId);
}

function readOwnerSetupPasskeyPreparationByCredentialId(
  storage: DurableObjectStorage,
  credentialId: string,
): StoredOwnerSetupPasskeyPreparation | undefined {
  return readOwnerSetupPasskeyPreparationBy(storage, "credential_id", credentialId);
}

function readOwnerSetupPasskeyPreparationBy(
  storage: DurableObjectStorage,
  column: "completion_id" | "credential_id" | "email_challenge_id",
  value: string,
): StoredOwnerSetupPasskeyPreparation | undefined {
  const row = storage.sql
    .exec<OwnerSetupPasskeyPreparationRow>(
      `
        SELECT
          completion_id,
          email_challenge_id,
          setup_token_hash,
          instance_id,
          auth_origin,
          relying_party_id,
          credential_id,
          public_key_base64url,
          counter,
          transports_json,
          credential_device_type,
          credential_backed_up,
          created_at
        FROM instance_auth_owner_setup_passkey_preparations
        WHERE ${column} = ?
      `,
      value,
    )
    .next();

  return row.done ? undefined : ownerSetupPasskeyPreparationFromRow(row.value);
}

function ownerSetupPasskeyPreparationFromRow(
  row: OwnerSetupPasskeyPreparationRow,
): StoredOwnerSetupPasskeyPreparation {
  return {
    authOrigin: row.auth_origin,
    completionId: row.completion_id,
    counter: row.counter,
    createdAt: row.created_at,
    credentialBackedUp: row.credential_backed_up === 1,
    credentialDeviceType: parseCredentialDeviceType(row.credential_device_type),
    credentialId: row.credential_id,
    emailChallengeId: row.email_challenge_id,
    instanceId: row.instance_id,
    publicKeyBase64Url: row.public_key_base64url,
    relyingPartyId: row.relying_party_id,
    setupTokenHash: row.setup_token_hash,
    transports: parseAuthenticatorTransports(JSON.parse(row.transports_json)),
  };
}

function ownerSetupPasskeyPreparationsEqual(
  left: StoredOwnerSetupPasskeyPreparation,
  right: StoredOwnerSetupPasskeyPreparation,
): boolean {
  return (
    left.authOrigin === right.authOrigin &&
    left.completionId === right.completionId &&
    left.counter === right.counter &&
    left.credentialBackedUp === right.credentialBackedUp &&
    left.credentialDeviceType === right.credentialDeviceType &&
    left.credentialId === right.credentialId &&
    left.emailChallengeId === right.emailChallengeId &&
    left.instanceId === right.instanceId &&
    left.publicKeyBase64Url === right.publicKeyBase64Url &&
    left.relyingPartyId === right.relyingPartyId &&
    left.setupTokenHash === right.setupTokenHash &&
    JSON.stringify(left.transports) === JSON.stringify(right.transports)
  );
}

function normalizeCreateOwnerSetupEmailChallengeInput(
  input: CreateOwnerSetupEmailChallengeInput,
): StoredOwnerSetupEmailProof {
  const createdAt = parseTimestamp(
    "Owner setup email challenge createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const expiresAt = parseTimestamp("Owner setup email challenge expiresAt", input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Owner setup email challenge expiresAt must be after createdAt.");
  }

  const displayEmail = normalizeEmailDeliveryAddress("Owner setup primary email", input.email);

  return {
    authOrigin: parseInstanceAuthCanonicalOrigin(input.authOrigin),
    challengeId:
      input.challengeId === undefined
        ? crypto.randomUUID()
        : parseNonEmptyString("Owner setup email challenge id", input.challengeId),
    continuation: parseOwnerSetupContinuation(input.continuation),
    createdAt,
    displayEmail,
    displayName: parseNonEmptyString("Owner setup display name", input.displayName),
    expiresAt,
    idempotencyKey: parseNonEmptyString(
      "Owner setup email challenge idempotency key",
      input.idempotencyKey,
    ),
    instanceId: parseNonEmptyString("Owner setup instance id", input.instanceId).toLowerCase(),
    normalizedEmail: displayEmail.toLowerCase(),
    setupTokenHash: parseBase64UrlString("Owner setup capability hash", input.setupTokenHash),
    tokenHash: parseBase64UrlString("Owner setup email token hash", input.tokenHash),
  };
}

function normalizeOwnerSetupEmailChallengeExpectation(input: VerifyOwnerSetupEmailChallengeInput) {
  return {
    authOrigin: parseInstanceAuthCanonicalOrigin(input.authOrigin),
    instanceId: parseNonEmptyString("Owner setup instance id", input.instanceId).toLowerCase(),
    normalizedEmail: normalizeEmailDeliveryAddress(
      "Owner setup expected primary email",
      input.email,
    ).toLowerCase(),
    setupTokenHash: parseBase64UrlString("Owner setup capability hash", input.setupTokenHash),
    tokenHash: parseBase64UrlString("Owner setup email token hash", input.tokenHash),
  };
}

function ownerSetupEmailChallengeMismatchReason(
  challenge: StoredOwnerSetupEmailProof,
  expected: ReturnType<typeof normalizeOwnerSetupEmailChallengeExpectation>,
):
  | "wrong-auth-origin"
  | "wrong-capability"
  | "wrong-email"
  | "wrong-instance"
  | "wrong-token"
  | undefined {
  if (expected.tokenHash !== challenge.tokenHash) {
    return "wrong-token";
  }

  if (expected.setupTokenHash !== challenge.setupTokenHash) {
    return "wrong-capability";
  }

  if (expected.instanceId !== challenge.instanceId) {
    return "wrong-instance";
  }

  if (expected.authOrigin !== challenge.authOrigin) {
    return "wrong-auth-origin";
  }

  if (expected.normalizedEmail !== challenge.normalizedEmail) {
    return "wrong-email";
  }

  return undefined;
}

function readOwnerSetupEmailProofById(
  storage: DurableObjectStorage,
  challengeId: string,
): StoredOwnerSetupEmailProof | undefined {
  const row = storage.sql
    .exec<OwnerSetupEmailProofRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          setup_token_hash,
          instance_id,
          auth_origin,
          display_name,
          normalized_email,
          display_email,
          continuation,
          created_at,
          expires_at,
          verified_at,
          consumed_at,
          revoked_at
        FROM instance_auth_owner_setup_email_proofs
        WHERE challenge_id = ?
      `,
      challengeId,
    )
    .next();

  return row.done ? undefined : ownerSetupEmailProofFromRow(row.value);
}

function readOwnerSetupEmailProofByIdempotencyKey(
  storage: DurableObjectStorage,
  idempotencyKey: string,
): StoredOwnerSetupEmailProof | undefined {
  const row = storage.sql
    .exec<OwnerSetupEmailProofRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          setup_token_hash,
          instance_id,
          auth_origin,
          display_name,
          normalized_email,
          display_email,
          continuation,
          created_at,
          expires_at,
          verified_at,
          consumed_at,
          revoked_at
        FROM instance_auth_owner_setup_email_proofs
        WHERE idempotency_key = ?
      `,
      idempotencyKey,
    )
    .next();

  return row.done ? undefined : ownerSetupEmailProofFromRow(row.value);
}

function readOwnerSetupEmailProofByTokenHash(
  storage: DurableObjectStorage,
  tokenHash: string,
): StoredOwnerSetupEmailProof | undefined {
  const row = storage.sql
    .exec<OwnerSetupEmailProofRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          setup_token_hash,
          instance_id,
          auth_origin,
          display_name,
          normalized_email,
          display_email,
          continuation,
          created_at,
          expires_at,
          verified_at,
          consumed_at,
          revoked_at
        FROM instance_auth_owner_setup_email_proofs
        WHERE token_hash = ?
      `,
      tokenHash,
    )
    .next();

  return row.done ? undefined : ownerSetupEmailProofFromRow(row.value);
}

function ownerSetupEmailProofFromRow(row: OwnerSetupEmailProofRow): StoredOwnerSetupEmailProof {
  return {
    authOrigin: row.auth_origin,
    challengeId: row.challenge_id,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
    continuation: parseOwnerSetupContinuation(row.continuation),
    createdAt: row.created_at,
    displayEmail: row.display_email,
    displayName: row.display_name,
    expiresAt: row.expires_at,
    idempotencyKey: row.idempotency_key,
    instanceId: row.instance_id,
    normalizedEmail: row.normalized_email,
    setupTokenHash: row.setup_token_hash,
    tokenHash: row.token_hash,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
    ...(row.verified_at === null ? {} : { verifiedAt: row.verified_at }),
  };
}

function parseOwnerSetupContinuation(value: unknown): AuthSuccessContinuationTarget {
  const target = parseNonEmptyString("Owner setup continuation", value);

  if (target.startsWith("/")) {
    if (target.startsWith("//")) {
      throw new Error("Owner setup continuation must not be protocol-relative.");
    }

    const url = new URL(target, "https://formless.local");

    if (url.hash !== "") {
      throw new Error("Owner setup continuation must not include a fragment.");
    }

    return `${url.pathname}${url.search}` as AuthSuccessContinuationTarget;
  }

  const url = new URL(target);

  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error("Owner setup continuation must be a safe HTTPS target.");
  }

  return `${url.origin}${url.pathname}${url.search}` as AuthSuccessContinuationTarget;
}

function parseTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);

  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseBase64UrlString(context: string, value: unknown): string {
  const parsed = parseNonEmptyString(context, value);

  if (!base64UrlPattern.test(parsed)) {
    throw new Error(`${context} must be base64url.`);
  }

  return parsed;
}

function parseNonNegativeInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
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

function parseCredentialDeviceType(value: unknown): CredentialDeviceType {
  if (typeof value !== "string" || !(credentialDeviceTypes as readonly string[]).includes(value)) {
    throw new Error("Owner setup prepared passkey credential device type is invalid.");
  }

  return value as CredentialDeviceType;
}

function parseAuthenticatorTransports(value: unknown): AuthenticatorTransportFuture[] {
  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.some(
      (transport) =>
        typeof transport !== "string" ||
        !(authenticatorTransports as readonly string[]).includes(transport),
    )
  ) {
    throw new Error("Owner setup prepared passkey transports are invalid.");
  }

  return [...new Set(value)] as AuthenticatorTransportFuture[];
}

function base64UrlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
