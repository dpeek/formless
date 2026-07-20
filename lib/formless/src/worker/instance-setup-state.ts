import { parseOwnerSetupToken, type OwnerIdentity } from "../shared/protocol.ts";
import { nowIsoString } from "../shared/clock.ts";

type OwnerSetupCapabilityRow = {
  token_hash: string;
  instance_id: string;
  created_at: string;
  expires_at: string | null;
};

export type StoredOwnerSetupCapability = {
  tokenHash: string;
  instanceId: string;
  createdAt: string;
  expiresAt?: string;
};

export type InstanceSetupState = {
  setupComplete: boolean;
  owner: OwnerIdentity | null;
  capability: StoredOwnerSetupCapability | null;
};

export type WriteOwnerSetupCapabilityResult =
  | {
      ok: true;
      capability: StoredOwnerSetupCapability;
    }
  | {
      ok: false;
      owner: OwnerIdentity;
      reason: "already-complete";
    };

export type CompleteFirstOwnerSetupInput = {
  tokenHash: string;
  instanceId: string;
  owner: OwnerIdentity;
  now?: string;
};

export type ValidateFirstOwnerSetupCapabilityInput = {
  tokenHash: string;
  instanceId: string;
  now?: string;
  owner?: OwnerIdentity | null;
};

export type CompleteFirstOwnerSetupResult =
  | {
      ok: true;
      owner: OwnerIdentity;
      setupComplete: true;
    }
  | {
      ok: false;
      owner?: OwnerIdentity;
      reason:
        | "already-complete"
        | "expired-token"
        | "invalid-token"
        | "missing-capability"
        | "wrong-instance";
    };

export function ensureInstanceSetupTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS owner_setup_capability (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token_hash TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );
  `);
}

export function resetInstanceSetupTables(storage: DurableObjectStorage) {
  ensureInstanceSetupTables(storage);

  storage.transactionSync(() => {
    storage.sql.exec(`
      DELETE FROM owner_setup_capability;
    `);
  });
}

export async function hashOwnerSetupToken(value: unknown): Promise<string> {
  const token = parseOwnerSetupToken(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return base64UrlEncode(new Uint8Array(digest));
}

export function readInstanceSetupState(
  storage: DurableObjectStorage,
  owner: OwnerIdentity | null = null,
): InstanceSetupState {
  ensureInstanceSetupTables(storage);

  return {
    setupComplete: owner !== null,
    owner,
    capability: readOwnerSetupCapability(storage) ?? null,
  };
}

export function writeOwnerSetupCapability(
  storage: DurableObjectStorage,
  capability: StoredOwnerSetupCapability,
  input: { owner?: OwnerIdentity | null } = {},
): WriteOwnerSetupCapabilityResult {
  ensureInstanceSetupTables(storage);

  return storage.transactionSync(() => {
    const owner = input.owner ?? null;

    if (owner) {
      return {
        ok: false,
        owner,
        reason: "already-complete",
      };
    }

    const normalizedCapability = normalizeOwnerSetupCapability(capability);

    storage.sql.exec(
      `
        INSERT INTO owner_setup_capability (id, token_hash, instance_id, created_at, expires_at)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          token_hash = excluded.token_hash,
          instance_id = excluded.instance_id,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at
      `,
      normalizedCapability.tokenHash,
      normalizedCapability.instanceId,
      normalizedCapability.createdAt,
      normalizedCapability.expiresAt ?? null,
    );

    return {
      ok: true,
      capability: normalizedCapability,
    };
  });
}

export function validateFirstOwnerSetupCapability(
  storage: DurableObjectStorage,
  input: ValidateFirstOwnerSetupCapabilityInput,
): ValidateFirstOwnerSetupCapabilityResult {
  ensureInstanceSetupTables(storage);

  const owner = input.owner ?? null;

  if (owner) {
    return {
      ok: false,
      owner,
      reason: "already-complete",
    };
  }

  return validateStoredOwnerSetupCapability(storage, input);
}

export function completeFirstOwnerSetupInCurrentTransaction(
  storage: DurableObjectStorage,
  input: CompleteFirstOwnerSetupInput,
): CompleteFirstOwnerSetupResult {
  ensureInstanceSetupTables(storage);

  const validation = validateStoredOwnerSetupCapability(storage, input);

  if (!validation.ok) {
    return validation;
  }

  storage.sql.exec("DELETE FROM owner_setup_capability WHERE id = 1");

  return {
    ok: true,
    owner: input.owner,
    setupComplete: true,
  };
}

export type ValidateFirstOwnerSetupCapabilityResult =
  | { ok: true }
  | {
      ok: false;
      owner?: OwnerIdentity;
      reason:
        | "already-complete"
        | "expired-token"
        | "invalid-token"
        | "missing-capability"
        | "wrong-instance";
    };

function validateStoredOwnerSetupCapability(
  storage: DurableObjectStorage,
  input: Pick<CompleteFirstOwnerSetupInput, "instanceId" | "now" | "tokenHash">,
): ValidateFirstOwnerSetupCapabilityResult {
  const capability = readOwnerSetupCapability(storage);

  if (!capability) {
    return { ok: false, reason: "missing-capability" };
  }

  const instanceId = parseNonEmptyString("Owner setup instance id", input.instanceId);
  if (capability.instanceId !== instanceId) {
    return { ok: false, reason: "wrong-instance" };
  }

  const now = input.now ?? nowIsoString();
  if (capability.expiresAt !== undefined && capability.expiresAt <= now) {
    return { ok: false, reason: "expired-token" };
  }

  const tokenHash = parseNonEmptyString("Owner setup token hash", input.tokenHash);
  if (capability.tokenHash !== tokenHash) {
    return { ok: false, reason: "invalid-token" };
  }

  return { ok: true };
}

function readOwnerSetupCapability(
  storage: DurableObjectStorage,
): StoredOwnerSetupCapability | undefined {
  const row = storage.sql
    .exec<OwnerSetupCapabilityRow>(
      "SELECT token_hash, instance_id, created_at, expires_at FROM owner_setup_capability WHERE id = 1",
    )
    .next();

  return row.done ? undefined : ownerSetupCapabilityFromRow(row.value);
}

function normalizeOwnerSetupCapability(
  capability: StoredOwnerSetupCapability,
): StoredOwnerSetupCapability {
  const tokenHash = parseNonEmptyString("Owner setup token hash", capability.tokenHash);
  const instanceId = parseNonEmptyString("Owner setup instance id", capability.instanceId);
  const createdAt = parseNonEmptyString("Owner setup createdAt", capability.createdAt);
  const expiresAt =
    capability.expiresAt === undefined
      ? undefined
      : parseNonEmptyString("Owner setup expiresAt", capability.expiresAt);

  return {
    tokenHash,
    instanceId,
    createdAt,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

function ownerSetupCapabilityFromRow(row: OwnerSetupCapabilityRow): StoredOwnerSetupCapability {
  return {
    tokenHash: row.token_hash,
    instanceId: row.instance_id,
    createdAt: row.created_at,
    ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
  };
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
