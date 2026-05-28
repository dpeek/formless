export const FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME = "FORMLESS_TURNSTILE_SITE_KEY";
export const FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME = "FORMLESS_TURNSTILE_SECRET_KEY";

export type TurnstileRuntimeEnv = {
  FORMLESS_TURNSTILE_SITE_KEY?: string;
  FORMLESS_TURNSTILE_SECRET_KEY?: string;
};

export function turnstileSiteKeyFromEnv(env: TurnstileRuntimeEnv): string | undefined {
  return optionalEnvString(env.FORMLESS_TURNSTILE_SITE_KEY);
}

export function turnstileSecretKeyFromEnv(env: TurnstileRuntimeEnv): string | undefined {
  return optionalEnvString(env.FORMLESS_TURNSTILE_SECRET_KEY);
}

function optionalEnvString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
