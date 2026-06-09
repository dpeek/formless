import { Resource, secret as alchemySecret, type Context, type Secret } from "alchemy";
import {
  createCloudflareApi,
  type CloudflareApi,
  type CloudflareApiOptions,
} from "alchemy/cloudflare";

export const TURNSTILE_WIDGET_DOMAIN_LIMIT = 10;

export type TurnstileWidgetMode = "managed" | "non-interactive" | "invisible";
export type TurnstileWidgetClearanceLevel =
  | "no_clearance"
  | "jschallenge"
  | "managed"
  | "interactive";
export type TurnstileWidgetRegion = "world" | "china";

export type TurnstileWidgetProps = CloudflareApiOptions & {
  adopt?: boolean;
  botFightMode?: boolean;
  clearanceLevel?: TurnstileWidgetClearanceLevel;
  delete?: boolean;
  domains: readonly string[];
  ephemeralId?: boolean;
  mode?: TurnstileWidgetMode;
  name: string;
  offlabel?: boolean;
  region?: TurnstileWidgetRegion;
};

export type TurnstileWidgetOutput<SecretValue = Secret<string>> = {
  botFightMode: boolean;
  clearanceLevel?: TurnstileWidgetClearanceLevel;
  createdOn?: string;
  domains: string[];
  ephemeralId: boolean;
  id: string;
  mode: TurnstileWidgetMode;
  modifiedOn?: string;
  name: string;
  offlabel: boolean;
  region?: TurnstileWidgetRegion;
  siteKey: string;
  verificationSecret: SecretValue;
};

export type TurnstileWidgetSecretAdapter<SecretValue = Secret<string>> = (
  value: string,
) => SecretValue;

export type TurnstileWidgetCloudflareApi = Pick<
  CloudflareApi,
  "accountId" | "delete" | "get" | "post" | "put"
>;

export type TurnstileWidgetFactory = (
  id: string,
  props: TurnstileWidgetProps,
) => Promise<TurnstileWidgetOutput>;

type TurnstileWidgetLifecycleContext<SecretValue> = {
  destroy: () => never;
  output?: TurnstileWidgetOutput<SecretValue>;
  phase: "create" | "delete" | "update";
  scope: {
    adopt?: boolean;
  };
  (output: TurnstileWidgetOutput<SecretValue>): TurnstileWidgetOutput<SecretValue>;
};

type CloudflareTurnstileWidget = {
  bot_fight_mode?: unknown;
  clearance_level?: unknown;
  created_on?: unknown;
  domains?: unknown;
  ephemeral_id?: unknown;
  mode?: unknown;
  modified_on?: unknown;
  name?: unknown;
  offlabel?: unknown;
  region?: unknown;
  secret?: unknown;
  sitekey?: unknown;
};

type CloudflareTurnstileWidgetListResponse = {
  errors?: Array<{ code?: number; message?: string }>;
  result?: unknown;
  success?: boolean;
};

export const CloudflareTurnstileWidget = Resource(
  "formless::CloudflareTurnstileWidget",
  async function (
    this: Context<TurnstileWidgetOutput>,
    logicalId: string,
    props: TurnstileWidgetProps,
  ): Promise<TurnstileWidgetOutput> {
    const api = await createCloudflareApi(props);

    return applyTurnstileWidgetLifecycle({
      api,
      context: this,
      createSecret: alchemySecret,
      logicalId,
      props,
    });
  },
) as TurnstileWidgetFactory;

export async function applyTurnstileWidgetLifecycle<SecretValue>(input: {
  api: TurnstileWidgetCloudflareApi;
  context: TurnstileWidgetLifecycleContext<SecretValue>;
  createSecret: TurnstileWidgetSecretAdapter<SecretValue>;
  logicalId: string;
  props: TurnstileWidgetProps;
}): Promise<TurnstileWidgetOutput<SecretValue>> {
  const desired = normalizeTurnstileWidgetProps(input.logicalId, input.props);

  if (input.context.phase === "delete") {
    const siteKey = input.context.output?.siteKey;

    if (input.props.delete !== false && siteKey !== undefined) {
      const response = await input.api.delete(turnstileWidgetPath(input.api, siteKey));

      if (!response.ok && response.status !== 404) {
        throw turnstileApiError(response, "delete", desired.name);
      }
    }

    return input.context.destroy();
  }

  if (input.context.phase === "update" && input.context.output?.siteKey !== undefined) {
    const existing = await readTurnstileWidget(input.api, input.context.output.siteKey);

    if (existing !== undefined) {
      const updated = await reconcileExistingTurnstileWidget({
        api: input.api,
        context: input.context,
        createSecret: input.createSecret,
        desired,
        existing,
        previousSecret: input.context.output.verificationSecret,
      });

      return input.context(updated);
    }
  }

  const existingByName = await findTurnstileWidgetByName(input.api, desired.name);

  if (existingByName !== undefined) {
    const adopt = input.props.adopt ?? input.context.scope.adopt ?? false;

    if (!adopt) {
      throw new Error(
        `Cloudflare Turnstile widget "${desired.name}" already exists. Set adopt: true to take control of it.`,
      );
    }

    const updated = await reconcileExistingTurnstileWidget({
      api: input.api,
      context: input.context,
      createSecret: input.createSecret,
      desired,
      existing: existingByName,
      previousSecret: input.context.output?.verificationSecret,
    });

    return input.context(updated);
  }

  const response = await input.api.post(turnstileWidgetsPath(input.api), desired.payload);
  const widget = await readRequiredWidgetResponse(response, "create", desired.name);

  return input.context(
    outputFromTurnstileWidget({
      createSecret: input.createSecret,
      desired,
      widget,
    }),
  );
}

async function reconcileExistingTurnstileWidget<SecretValue>(input: {
  api: TurnstileWidgetCloudflareApi;
  context: TurnstileWidgetLifecycleContext<SecretValue>;
  createSecret: TurnstileWidgetSecretAdapter<SecretValue>;
  desired: NormalizedTurnstileWidgetProps;
  existing: CloudflareTurnstileWidget;
  previousSecret?: SecretValue;
}): Promise<TurnstileWidgetOutput<SecretValue>> {
  const existingSiteKey = requiredWidgetString(input.existing, "sitekey", input.desired.name);
  const widget = turnstileWidgetNeedsUpdate(input.existing, input.desired)
    ? await updateTurnstileWidget(input.api, existingSiteKey, input.desired)
    : input.existing;

  return outputFromTurnstileWidget({
    createSecret: input.createSecret,
    desired: input.desired,
    previousSecret: input.previousSecret,
    widget,
  });
}

async function updateTurnstileWidget(
  api: TurnstileWidgetCloudflareApi,
  siteKey: string,
  desired: NormalizedTurnstileWidgetProps,
): Promise<CloudflareTurnstileWidget> {
  const response = await api.put(turnstileWidgetPath(api, siteKey), desired.payload);

  return readRequiredWidgetResponse(response, "update", desired.name);
}

async function readTurnstileWidget(
  api: TurnstileWidgetCloudflareApi,
  siteKey: string,
): Promise<CloudflareTurnstileWidget | undefined> {
  const response = await api.get(turnstileWidgetPath(api, siteKey));

  if (response.status === 404) {
    return undefined;
  }

  return readRequiredWidgetResponse(response, "read", siteKey);
}

async function findTurnstileWidgetByName(
  api: TurnstileWidgetCloudflareApi,
  name: string,
): Promise<CloudflareTurnstileWidget | undefined> {
  const response = await api.get(
    `${turnstileWidgetsPath(api)}?filter=${encodeURIComponent(`name:${name}`)}&per_page=1000`,
  );
  const widgets = await readWidgetListResponse(response, "list", name);
  const matches = widgets.filter((widget) => optionalWidgetString(widget.name) === name);

  if (matches.length > 1) {
    throw new Error(
      `Cloudflare Turnstile widget "${name}" matched multiple existing widgets and cannot be adopted safely.`,
    );
  }

  if (matches[0] === undefined) {
    return undefined;
  }

  return readTurnstileWidget(api, requiredWidgetString(matches[0], "sitekey", name));
}

async function readRequiredWidgetResponse(
  response: Response,
  action: string,
  label: string,
): Promise<CloudflareTurnstileWidget> {
  const body = await readTurnstileApiResponse(response, action, label);

  if (!isRecord(body.result)) {
    throw new Error(`Cloudflare Turnstile widget ${action} for "${label}" returned no widget.`);
  }

  return body.result;
}

async function readWidgetListResponse(
  response: Response,
  action: string,
  label: string,
): Promise<CloudflareTurnstileWidget[]> {
  const body = await readTurnstileApiResponse(response, action, label);

  if (!Array.isArray(body.result)) {
    throw new Error(`Cloudflare Turnstile widget ${action} for "${label}" returned no widgets.`);
  }

  return body.result.filter(isRecord);
}

async function readTurnstileApiResponse(
  response: Response,
  action: string,
  label: string,
): Promise<CloudflareTurnstileWidgetListResponse> {
  if (!response.ok) {
    throw turnstileApiError(response, action, label);
  }

  const body = (await response.json()) as unknown;

  if (!isRecord(body) || body.success !== true) {
    throw new Error(
      `Cloudflare Turnstile widget ${action} for "${label}" failed${cloudflareErrorSuffix(body)}.`,
    );
  }

  return body;
}

function turnstileApiError(response: Response, action: string, label: string): Error {
  return new Error(
    `Cloudflare Turnstile widget ${action} for "${label}" failed: HTTP ${response.status}.`,
  );
}

type NormalizedTurnstileWidgetProps = {
  domains: string[];
  mode: TurnstileWidgetMode;
  name: string;
  payload: Record<string, unknown>;
  props: TurnstileWidgetProps;
};

function normalizeTurnstileWidgetProps(
  logicalId: string,
  props: TurnstileWidgetProps,
): NormalizedTurnstileWidgetProps {
  const name = props.name.trim();

  if (!name) {
    throw new Error(`Turnstile widget "${logicalId}" name must be a non-empty string.`);
  }

  const domains = normalizeTurnstileDomains(logicalId, props.domains);
  const mode = props.mode ?? "managed";
  const payload: Record<string, unknown> = {
    domains,
    mode,
    name,
  };

  if (props.botFightMode !== undefined) {
    payload.bot_fight_mode = props.botFightMode;
  }
  if (props.clearanceLevel !== undefined) {
    payload.clearance_level = props.clearanceLevel;
  }
  if (props.ephemeralId !== undefined) {
    payload.ephemeral_id = props.ephemeralId;
  }
  if (props.offlabel !== undefined) {
    payload.offlabel = props.offlabel;
  }
  if (props.region !== undefined) {
    payload.region = props.region;
  }

  return { domains, mode, name, payload, props };
}

function normalizeTurnstileDomains(logicalId: string, values: readonly string[]): string[] {
  const domains = [
    ...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right));

  if (domains.length === 0) {
    throw new Error(`Turnstile widget "${logicalId}" domains must include at least one host.`);
  }

  if (domains.length > TURNSTILE_WIDGET_DOMAIN_LIMIT) {
    throw new Error(
      `Turnstile widget "${logicalId}" has ${domains.length} domains; Cloudflare allows at most ${TURNSTILE_WIDGET_DOMAIN_LIMIT}.`,
    );
  }

  return domains;
}

function turnstileWidgetNeedsUpdate(
  widget: CloudflareTurnstileWidget,
  desired: NormalizedTurnstileWidgetProps,
): boolean {
  return (
    optionalWidgetString(widget.name) !== desired.name ||
    optionalWidgetString(widget.mode) !== desired.mode ||
    !sameStrings(normalizeWidgetDomains(widget.domains), desired.domains) ||
    optionalDesiredChanged(widget.bot_fight_mode, desired.props.botFightMode) ||
    optionalDesiredChanged(widget.clearance_level, desired.props.clearanceLevel) ||
    optionalDesiredChanged(widget.ephemeral_id, desired.props.ephemeralId) ||
    optionalDesiredChanged(widget.offlabel, desired.props.offlabel) ||
    optionalDesiredChanged(widget.region, desired.props.region)
  );
}

function outputFromTurnstileWidget<SecretValue>(input: {
  createSecret: TurnstileWidgetSecretAdapter<SecretValue>;
  desired: NormalizedTurnstileWidgetProps;
  previousSecret?: SecretValue;
  widget: CloudflareTurnstileWidget;
}): TurnstileWidgetOutput<SecretValue> {
  const siteKey = requiredWidgetString(input.widget, "sitekey", input.desired.name);
  const rawSecret = optionalWidgetString(input.widget.secret);
  const verificationSecret =
    rawSecret === undefined
      ? (input.previousSecret ?? missingTurnstileSecret(input.desired.name))
      : input.createSecret(rawSecret);
  const clearanceLevel = optionalWidgetString(input.widget.clearance_level);
  const region = optionalWidgetString(input.widget.region);

  return {
    botFightMode: input.widget.bot_fight_mode === true,
    ...(isTurnstileWidgetClearanceLevel(clearanceLevel) ? { clearanceLevel } : {}),
    ...(optionalWidgetString(input.widget.created_on) === undefined
      ? {}
      : { createdOn: optionalWidgetString(input.widget.created_on) }),
    domains: normalizeWidgetDomains(input.widget.domains),
    ephemeralId: input.widget.ephemeral_id === true,
    id: siteKey,
    mode: isTurnstileWidgetMode(input.widget.mode) ? input.widget.mode : input.desired.mode,
    ...(optionalWidgetString(input.widget.modified_on) === undefined
      ? {}
      : { modifiedOn: optionalWidgetString(input.widget.modified_on) }),
    name: optionalWidgetString(input.widget.name) ?? input.desired.name,
    offlabel: input.widget.offlabel === true,
    ...(isTurnstileWidgetRegion(region) ? { region } : {}),
    siteKey,
    verificationSecret,
  };
}

function missingTurnstileSecret(name: string): never {
  throw new Error(`Cloudflare Turnstile widget "${name}" did not include a verification secret.`);
}

function normalizeWidgetDomains(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map(optionalWidgetString)
            .filter(isString)
            .map((domain) => domain.toLowerCase()),
        ),
      ].sort((left, right) => left.localeCompare(right))
    : [];
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function optionalDesiredChanged(current: unknown, desired: unknown): boolean {
  return desired !== undefined && current !== desired;
}

function requiredWidgetString(
  widget: CloudflareTurnstileWidget,
  key: keyof CloudflareTurnstileWidget,
  label: string,
): string {
  const value = optionalWidgetString(widget[key]);

  if (value === undefined) {
    throw new Error(`Cloudflare Turnstile widget "${label}" missing ${String(key)}.`);
  }

  return value;
}

function optionalWidgetString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTurnstileWidgetMode(value: unknown): value is TurnstileWidgetMode {
  return value === "managed" || value === "non-interactive" || value === "invisible";
}

function isTurnstileWidgetClearanceLevel(value: unknown): value is TurnstileWidgetClearanceLevel {
  return (
    value === "no_clearance" ||
    value === "jschallenge" ||
    value === "managed" ||
    value === "interactive"
  );
}

function isTurnstileWidgetRegion(value: unknown): value is TurnstileWidgetRegion {
  return value === "world" || value === "china";
}

function turnstileWidgetsPath(api: Pick<TurnstileWidgetCloudflareApi, "accountId">): string {
  return `/accounts/${api.accountId}/challenges/widgets`;
}

function turnstileWidgetPath(
  api: Pick<TurnstileWidgetCloudflareApi, "accountId">,
  siteKey: string,
): string {
  return `${turnstileWidgetsPath(api)}/${encodeURIComponent(siteKey)}`;
}

function cloudflareErrorSuffix(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.errors) || value.errors.length === 0) {
    return "";
  }

  const messages = value.errors
    .filter(isRecord)
    .map((error) => optionalWidgetString(error.message))
    .filter(isString);

  return messages.length === 0 ? "" : `: ${messages.join("; ")}`;
}
