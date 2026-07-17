import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  OwnerPasskeyLoginOptionsResponse,
  OwnerPasskeyLoginVerifyRequest,
  OwnerPasskeyRegistrationOptionsResponse,
  OwnerPasskeyRegistrationVerifyRequest,
} from "../../shared/instance-auth.ts";

export const passkeyUnavailableMessage = "This browser does not support passkeys.";

export type CreatePasskeyRegistrationResponse = (
  options: OwnerPasskeyRegistrationOptionsResponse["options"],
) => Promise<OwnerPasskeyRegistrationVerifyRequest["response"]>;

export type CreatePasskeyAuthenticationResponse = (
  options: OwnerPasskeyLoginOptionsResponse["options"],
) => Promise<OwnerPasskeyLoginVerifyRequest["response"]>;

export function browserSupportsPasskeys() {
  return (
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials.get === "function"
  );
}

export async function createBrowserPasskeyRegistrationResponse(
  options: OwnerPasskeyRegistrationOptionsResponse["options"],
): Promise<OwnerPasskeyRegistrationVerifyRequest["response"]> {
  if (!browserSupportsPasskeys()) {
    throw new Error(passkeyUnavailableMessage);
  }

  return await startRegistration({ optionsJSON: options });
}

export async function createBrowserPasskeyAuthenticationResponse(
  options: OwnerPasskeyLoginOptionsResponse["options"],
): Promise<OwnerPasskeyLoginVerifyRequest["response"]> {
  if (!browserSupportsPasskeys()) {
    throw new Error(passkeyUnavailableMessage);
  }

  return await startAuthentication({ optionsJSON: options });
}
