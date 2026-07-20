import {
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BrowserReplicaUpgradeFacts,
  type ReloadRequiredErrorResponse,
} from "../shared/protocol.ts";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class ReloadRequiredError extends Error {
  readonly body: ReloadRequiredErrorResponse;
  readonly status = 409;

  constructor(message: string, upgrade: BrowserReplicaUpgradeFacts) {
    super(message);
    this.name = "ReloadRequiredError";
    this.body = {
      error: message,
      code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
      reloadRequired: true,
      upgrade,
    };
  }
}
