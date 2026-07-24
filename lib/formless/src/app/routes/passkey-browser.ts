import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type {
  AccountPasskeyLoginOptionsResponse,
  AccountPasskeyLoginVerifyRequest,
} from "../../shared/instance-auth.ts";

export const passkeyUnavailableMessage = "This browser does not support passkeys.";

export type CreatePasskeyRegistrationResponse = (
  options: PublicKeyCredentialCreationOptionsJSON,
) => Promise<RegistrationResponseJSON>;

export type CreatePasskeyAuthenticationResponse = (
  options: AccountPasskeyLoginOptionsResponse["options"],
) => Promise<AccountPasskeyLoginVerifyRequest["response"]>;

export function browserSupportsPasskeys() {
  return (
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials.get === "function"
  );
}

export async function createBrowserPasskeyRegistrationResponse(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  if (!browserSupportsPasskeys()) {
    throw new Error(passkeyUnavailableMessage);
  }

  return await startRegistration({ optionsJSON: options });
}

export async function createBrowserPasskeyAuthenticationResponse(
  options: AccountPasskeyLoginOptionsResponse["options"],
): Promise<AccountPasskeyLoginVerifyRequest["response"]> {
  if (!browserSupportsPasskeys()) {
    throw new Error(passkeyUnavailableMessage);
  }

  return await startAuthentication({ optionsJSON: options });
}
