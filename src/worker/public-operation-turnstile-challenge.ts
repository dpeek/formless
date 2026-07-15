import type {
  PublicOperationChallengeVerification,
  PublicOperationProof,
} from "../shared/protocol.ts";
import { nowIsoString } from "../shared/clock.ts";
import { turnstileSecretKeyFromEnv, type TurnstileRuntimeEnv } from "../shared/turnstile-config.ts";
import { PublicOperationError } from "./public-operation-executor.ts";

export type PublicOperationTurnstileChallengeEnv = TurnstileRuntimeEnv & {
  FORMLESS_TURNSTILE_SITEVERIFY?: Fetcher;
};

export type PublicOperationTurnstileSiteverifyProvider = {
  send(request: Request): Promise<Response> | Response;
};

type TurnstileSiteverifyResponse = {
  success?: unknown;
  challenge_ts?: unknown;
  hostname?: unknown;
};

const turnstileSiteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyPublicOperationTurnstileChallenge(input: {
  env: PublicOperationTurnstileChallengeEnv;
  idempotencyKey: string;
  provider: PublicOperationTurnstileSiteverifyProvider;
  token: string;
}): Promise<PublicOperationChallengeVerification> {
  const secret = turnstileSecretKeyFromEnv(input.env);

  if (!secret) {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  let response: Response;

  try {
    response = await input.provider.send(
      new Request(turnstileSiteverifyUrl, {
        body: JSON.stringify({
          secret,
          response: input.token,
          idempotency_key: await turnstileSiteverifyIdempotencyKey(input.idempotencyKey),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
  } catch {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  let body: TurnstileSiteverifyResponse;

  try {
    body = (await response.json()) as TurnstileSiteverifyResponse;
  } catch {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  if (body.success !== true) {
    throw new PublicOperationError("Public operation challenge failed.", 403);
  }

  if (!response.ok) {
    throw new PublicOperationError("Public operation challenge is unavailable.", 503);
  }

  return {
    kind: "turnstile",
    success: true,
    verifiedAt: nowIsoString(),
    ...(typeof body.challenge_ts === "string" ? { challengeTs: body.challenge_ts } : {}),
    ...(typeof body.hostname === "string" ? { hostname: body.hostname } : {}),
  };
}

export function createPublicOperationTurnstileSiteverifyProvider(
  env: PublicOperationTurnstileChallengeEnv,
): PublicOperationTurnstileSiteverifyProvider {
  return {
    send: (request) =>
      env.FORMLESS_TURNSTILE_SITEVERIFY
        ? env.FORMLESS_TURNSTILE_SITEVERIFY.fetch(request)
        : fetch(request),
  };
}

export function buildVerifiedPublicOperationTurnstileProof(input: {
  token: string;
  verification: PublicOperationChallengeVerification;
}): PublicOperationProof {
  return {
    kind: "turnstile",
    token: input.token,
    verification: input.verification,
  };
}

async function turnstileSiteverifyIdempotencyKey(publicOperationIdempotencyKey: string) {
  if (isUuid(publicOperationIdempotencyKey)) {
    return publicOperationIdempotencyKey;
  }

  // Cloudflare requires a UUID; public operation idempotency keys are domain-scoped text.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`turnstile-siteverify:${publicOperationIdempotencyKey}`),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return uuidFromBytes(bytes);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function uuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
